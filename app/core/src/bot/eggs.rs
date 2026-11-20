//! Đập hết of the Túi đồ tab: every Trứng Gà of one bag slot broken one after the other. Each is a Dùng (c2s/84, as
//! the button), answered by s2c/46 (the fee off Xu khóa), s2c/1256 "Bạn vừa nhận được 1 Kim Đan Dược", s2c/51 (the item
//! into a free slot), s2c/1187 kind 2 (the eggs left) and s2c/1256 "Đập Trứng Gà thành công, trừ 500 Xu khóa"
//! (16-upgrade.md, measured 02/11 and 20/11). The next egg goes EGG_GAP after that last notice.
use super::smith::grouped;
use super::*;

/// Trứng Gà of the item table ("Đập ra vật phẩm ngẫu nhiên. Phí đập 500 Xu khóa, cần 3 ô trống.").
pub(super) const EGG: i32 = 3;
/// Its fee in Xu khóa and the free bag slots it needs, as its description says.
const EGG_FEE: i64 = 500;
const EGG_ROOM: i32 = 3;
/// Between the answer of one egg and the next c2s/84; the user clicked 2–7 s apart (tiheo1, 20/11).
const EGG_GAP: Duration = Duration::from_secs(1);
/// The notice of success must come within this after c2s/84.
const EGG_WAIT: Duration = Duration::from_secs(5);

/// The egg under way: the uuid of the stack when Đập hết was pressed, and when the next step is due (the next c2s/84,
/// or the end of the wait for the answer of the last one).
pub(super) struct EggStep {
    uuid: String,
    until: Instant,
    waiting: bool,
}

impl Bot {
    /// Đập hết on the stack of bag slot `slot` (uuid `uuid`, as the window showed it). Refused, with the reason in the
    /// log, when anything else keeps the character busy (a battle, a fight job or a quest run, a task at an NPC) or when
    /// the slot holds no Trứng Gà by now.
    pub fn break_all(&mut self, slot: u8, uuid: &str, now: Instant, out: &mut Vec<Out>) {
        let refuse = |out: &mut Vec<Out>, why: &str| {
            out.push(Out::Log(LogKind::Item, format!("Chưa đập trứng: {why}")))
        };
        if self.eggs.is_some() {
            return refuse(out, "đang đập rồi");
        }
        if let Some(why) = self.busy() {
            return refuse(out, why);
        }
        if self.notice_awaited(now) {
            return refuse(out, "đang đợi server trả lời việc trước");
        }
        let item = self
            .snap
            .bag
            .as_ref()
            .and_then(|b| b.items.iter().find(|i| i.slot == slot));
        let item = match item {
            None => return refuse(out, &format!("ô túi {} trống", slot as u32 + 1)),
            Some(i) if i.uuid != uuid => {
                return refuse(
                    out,
                    &format!(
                        "ô túi {} giờ là món khác, không phải món đã chọn",
                        slot as u32 + 1
                    ),
                )
            }
            Some(i) if i.item_id != EGG => {
                return refuse(
                    out,
                    &format!("ô túi {} không phải Trứng Gà", slot as u32 + 1),
                )
            }
            Some(i) => i,
        };
        let name = book()
            .get(EGG)
            .map_or("Trứng Gà".into(), |d| d.name.clone());
        let total = item.quantity.max(1) as usize;
        out.push(Out::Log(
            LogKind::Item,
            format!(
                "Đập hết {total} {name} (ô túi {}): mỗi quả {} Xu khóa, cần {EGG_ROOM} ô trống",
                slot as u32 + 1,
                grouped(EGG_FEE)
            ),
        ));
        self.snap.eggs = Some(EggRun {
            slot,
            name,
            total,
            done: 0,
            spent: 0,
            got: vec![],
        });
        self.eggs = Some(EggStep {
            uuid: uuid.to_string(),
            until: now,
            waiting: false,
        });
        self.egg_next(now, out);
    }

    /// The next egg: its c2s/84, or the end line when none is left or one cannot be broken (Xu khóa, free slots).
    fn egg_next(&mut self, now: Instant, out: &mut Vec<Out>) {
        let (Some(run), Some(step)) = (self.snap.eggs.as_ref(), self.eggs.as_ref()) else {
            return;
        };
        let bag = self.snap.bag.as_ref();
        let left = bag
            .and_then(|b| {
                b.items
                    .iter()
                    .find(|i| i.slot == run.slot && i.uuid == step.uuid)
            })
            .map_or(0, |i| i.quantity);
        if run.done >= run.total || left <= 0 {
            return self.egg_end(None, out);
        }
        if let Some(xu) = self.snap.currencies.as_ref().map(|c| c.xu_khoa) {
            if xu < EGG_FEE {
                let why = format!(
                    "thiếu Xu khóa (còn {}, mỗi quả {})",
                    grouped(xu),
                    grouped(EGG_FEE)
                );
                return self.egg_end(Some(&why), out);
            }
        }
        if let Some(b) = bag {
            let free = b.capacity - b.items.len() as i32;
            if free < EGG_ROOM {
                let why = format!("túi chỉ còn {} ô trống, cần {EGG_ROOM}", free.max(0));
                return self.egg_end(Some(&why), out);
            }
        }
        if self.battle.is_some() {
            return self.egg_end(Some("đang đánh"), out);
        }
        let slot = run.slot;
        let name = run.name.clone();
        Self::send(
            out,
            84,
            Ctx {
                slot: Some(slot as i32),
                place: Some(0),
                ..Ctx::default()
            },
        );
        // The wait of an item button: the other buttons and tasks hold until the answer.
        self.item_wait = Some(ItemWait {
            act: ItemAct::Use(slot),
            name,
            at: now,
        });
        if let Some(step) = self.eggs.as_mut() {
            (step.until, step.waiting) = (now + EGG_WAIT, true);
        }
    }

    /// A s2c/1256 while an egg waits for its answer: what came out of it ("Bạn vừa nhận được 252 Xu khóa"), its success
    /// ("Đập Trứng Gà thành công, trừ 500 Xu khóa"), or a refusal, which ends Đập hết. False when no egg waits.
    pub(super) fn egg_notice(&mut self, text: &str, now: Instant, out: &mut Vec<Out>) -> bool {
        if !self.eggs.as_ref().is_some_and(|s| s.waiting) {
            return false;
        }
        let Some(run) = self.snap.eggs.as_mut() else {
            return false;
        };
        if let Some(gain) = text.strip_prefix("Bạn vừa nhận được ") {
            let (count, name) = match gain.split_once(' ') {
                Some((n, rest)) if n.replace('.', "").parse::<i64>().is_ok() => {
                    (n.replace('.', "").parse::<i64>().unwrap(), rest.trim())
                }
                _ => (1, gain.trim()),
            };
            match run.got.iter_mut().find(|g| g.name == name) {
                Some(g) => g.count += count,
                None => run.got.push(EggGain {
                    name: name.to_string(),
                    count,
                }),
            }
            return true;
        }
        self.item_wait = None;
        if text.contains("thành công") {
            run.done += 1;
            run.spent += fee_of(text).unwrap_or(EGG_FEE);
            if let Some(step) = self.eggs.as_mut() {
                (step.until, step.waiting) = (now + EGG_GAP, false);
            }
            return true;
        }
        self.egg_end(Some(&format!("server từ chối ({text})")), out);
        true
    }

    /// The egg's deadline: the next c2s/84, or no answer in time.
    pub(super) fn egg_timer(&mut self, now: Instant, out: &mut Vec<Out>) {
        match self.eggs.as_ref() {
            Some(s) if s.until <= now && s.waiting => {
                let why = format!("server không trả lời sau {} s", EGG_WAIT.as_secs());
                self.item_wait = None;
                self.egg_end(Some(&why), out);
            }
            Some(s) if s.until <= now => self.egg_next(now, out),
            _ => {}
        }
    }

    pub(super) fn egg_deadline(&self) -> Option<Instant> {
        self.eggs.as_ref().map(|s| s.until)
    }

    /// Dừng: ends Đập hết after the egg under way (its answer is still logged).
    pub(super) fn egg_stop(&mut self, out: &mut Vec<Out>) {
        if self.eggs.is_some() {
            self.egg_end(Some("đã dừng"), out);
        }
    }

    /// The end line: eggs broken, Xu khóa spent and what came out; `why` when it stopped before the last egg.
    fn egg_end(&mut self, why: Option<&str>, out: &mut Vec<Out>) {
        self.eggs = None;
        let Some(run) = self.snap.eggs.take() else {
            return;
        };
        let got = match run.got.is_empty() {
            true => String::new(),
            false => {
                let items: Vec<String> = run
                    .got
                    .iter()
                    .map(|g| format!("{} ×{}", g.name, grouped(g.count)))
                    .collect();
                format!("; được {}", items.join(", "))
            }
        };
        let tally = format!(
            "đã đập {}/{} {}, tốn {} Xu khóa{got}",
            run.done,
            run.total,
            run.name,
            grouped(run.spent)
        );
        let line = match why {
            None => format!("Xong đập trứng: {tally}"),
            Some(why) => format!("Dừng đập trứng: {why}; {tally}"),
        };
        out.push(Out::Log(LogKind::Item, line));
    }
}

/// "trừ 500 Xu khóa" of the success notice.
fn fee_of(text: &str) -> Option<i64> {
    let (_, after) = text.split_once("trừ ")?;
    let n: String = after
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == '.')
        .filter(char::is_ascii_digit)
        .collect();
    n.parse().ok()
}
