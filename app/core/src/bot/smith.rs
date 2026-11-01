//! Pháp sư and Hương Lão for the Cửa hàng tab: Gộp đá, Nâng cấp, Tách đá, Chuyển hoá and Đổi lượng
//! (docs/app/events/16-upgrade.md#tính-năng, 15-shops.md#đổi-lượng). One task at a time, step by step as the game does:
//! c2s/13 to the NPC, c2s/57 down its menus, the window (s2c/96, s2c/99), c2s/97 for each item put in and the price and
//! odds the window says (s2c/90, s2c/92, s2c/1260), c2s/91 for Bắt đầu and its result (s2c/91, s2c/93). The server sends no
//! bag after a press, so the bot asks for it (c2s/42 → s2c/42) before the next one.
use super::*;

/// How long a step waits for the server (its answers came within 40 ms in J3).
pub(super) const SMITH_WAIT: Duration = Duration::from_secs(8);
/// Stones a Nâng cấp window holds (s2c/96).
const STONE_SLOTS: usize = 18;
/// The lowest cap of Nâng cấp [Thường] measured (80% at +0→+1, 75% at +1→+2): odds this high with the last stone of the
/// bag may be the cap, so they are pressed although under the rate asked.
const THUONG_CAP_LOW: i32 = 75;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Stage {
    /// c2s/13 sent: the NPC's menu (s2c/57) next.
    Talk,
    /// c2s/57 sent for a line that opens another menu.
    Menu,
    /// c2s/57 sent for the line that opens the window: s2c/96 or s2c/99 next.
    Window,
    /// c2s/97 sent: s2c/90, s2c/92 or s2c/1260 next.
    Put,
    /// c2s/91 sent: s2c/91 or s2c/93 next.
    Start,
    /// c2s/42 sent after a press: the whole bag next.
    Refresh,
    /// Đổi lượng: c2s/57 of the exchange sent: "Bạn vừa nhận được …" (s2c/1256) next.
    Exchange,
    /// Nâng cấp of a worn item: Cởi ra (c2s/1186 action 1) sent; s2c/37, then s2c/42 with the item in the bag next.
    Unequip,
    /// The task ended with a worn item still in the bag: Mặc (c2s/1186 action 0) sent; s2c/37, then s2c/42 next.
    Rewear,
}

/// A worn item taken off for Nâng cấp: its gear slot, its uuid (to find it in the bag), its name, and why the task ended
/// while it is worn again.
#[derive(Debug, Clone)]
pub(super) struct Wear {
    gear: u8,
    uuid: String,
    name: String,
    ended: Option<String>,
    /// A notice (s2c/1256) that came while Cởi ra or Mặc waited: the reason, if the item does not move.
    notice: Option<String>,
}

/// The level Nâng cấp goes up to for an item worn from level `wear`: its cap, or with no `quote` npc::SAFE_LEVEL and
/// `to_level` too.
fn upgrade_top(wear: i32, quote: bool, to_level: i32) -> i32 {
    match quote {
        true => npc::upgrade_cap(wear),
        false => npc::upgrade_cap(wear).min(npc::SAFE_LEVEL).min(to_level),
    }
}

/// The NPC of a task, for its log lines.
fn npc_who(npc: i32) -> &'static str {
    match npc {
        npc::ELDER => "Hương Lão",
        _ => "Pháp sư",
    }
}

/// Why Cởi ra or Mặc did not end as it should, for the end of the task: the server's notice, else its silence.
fn wear_failed(w: &Wear, stage: Stage) -> String {
    let why = w
        .notice
        .clone()
        .unwrap_or_else(|| format!("server không trả lời sau {} s", SMITH_WAIT.as_secs()));
    match stage {
        Stage::Unequip => format!("không cởi được {}: {why}", w.name),
        _ => format!(
            "{}; chưa mặc lại được {}: {why}",
            w.ended.clone().unwrap_or_default(),
            w.name
        ),
    }
}

pub(super) struct Smith {
    pub(super) task: SmithTask,
    pub(super) stage: Stage,
    pub(super) until: Instant,
    npc: i32,
    /// Lines of the menus still to pick.
    left: Vec<u8>,
    window: WindowKind,
    /// Bag slots still to put in the window, in order.
    puts: VecDeque<i32>,
    /// Nâng cấp: the stones to try, cheapest first (upgrade_stones), those put in this window and the odds after each,
    /// and how many to put when the window was opened again for exactly that many.
    stones: Vec<i32>,
    tried: Vec<i32>,
    rates: Vec<i32>,
    exact: Option<usize>,
    /// What the window said last, and whether Bắt đầu may be pressed.
    text: String,
    ready: bool,
    quote: Quote,
    /// Gộp đá: the level the set must make, checked before Bắt đầu.
    makes: Option<i32>,
    /// Đổi lượng: exchanges still to do.
    times: u32,
    /// Stop was pressed during a press: the task ends once its result is in.
    stopping: bool,
    /// Nâng cấp of a worn item: worn again once the task ends.
    wear: Option<Wear>,
}

/// "1.639".
fn grouped(n: i64) -> String {
    let s = n.abs().to_string();
    let mut out = String::new();
    for (i, c) in s.chars().enumerate() {
        if i > 0 && (s.len() - i).is_multiple_of(3) {
            out.push('.');
        }
        out.push(c);
    }
    if n < 0 {
        format!("-{out}")
    } else {
        out
    }
}
fn item_name(id: i32) -> String {
    book()
        .get(id)
        .map_or_else(|| format!("#{id}"), |d| d.name.clone())
}
fn fee_text(q: &Quote) -> String {
    let mut parts = vec![];
    if let Some(f) = q.fee {
        let money = match f.money {
            npc::Money::Xu => "Xu",
            npc::Money::XuKhoa => "Xu khóa",
        };
        parts.push(format!("{} {money}", grouped(f.amount)));
    }
    if q.luong > 0 {
        parts.push(format!("{} Lượng", q.luong));
    }
    match parts.is_empty() {
        true => "miễn phí".into(),
        false => parts.join(" + "),
    }
}

impl Bot {
    fn bag_items(&self) -> Vec<BagItem> {
        self.snap
            .bag
            .iter()
            .flat_map(|b| b.items.iter().map(BagItem::from))
            .collect()
    }
    fn gear_record(&self, slot: u8) -> Option<ItemRecord> {
        self.snap
            .gear
            .get(slot as usize)
            .and_then(Option::as_ref)
            .cloned()
    }
    fn bag_uuid(&self, uuid: &str) -> Option<ItemRecord> {
        self.snap
            .bag
            .as_ref()
            .and_then(|b| b.items.iter().find(|i| i.uuid == uuid))
            .cloned()
    }
    fn bag_record(&self, slot: i32) -> Option<ItemRecord> {
        self.snap
            .bag
            .as_ref()
            .and_then(|b| b.items.iter().find(|i| i.slot as i32 == slot))
            .cloned()
    }
    /// (Xu, Xu khóa, Lượng), 0 while unknown.
    fn money(&self) -> (i64, i64, i64) {
        self.snap
            .currencies
            .as_ref()
            .map_or((0, 0, 0), |c| (c.xu, c.xu_khoa, c.luong))
    }

    /// The name of a task for the log and the tab: (kind, title).
    fn smith_title(&self, task: &SmithTask) -> (&'static str, String) {
        let name = |slot: u8| {
            self.bag_record(slot as i32).map_or_else(
                || format!("ô túi {}", slot as u32 + 1),
                |i| item_name(i.item_id),
            )
        };
        let worn_name = |slot: u8| {
            self.gear_record(slot).map_or_else(
                || format!("ô trang bị {slot}"),
                |i| format!("{} (đang mặc)", item_name(i.item_id)),
            )
        };
        match task {
            SmithTask::Merge(o) => ("merge", format!("Gộp đá tới Đá cấp {}", o.up_to.min(12))),
            SmithTask::Upgrade {
                slot,
                quote: true,
                careful,
                worn,
                ..
            } => {
                let how = if *careful { " [Cẩn thận]" } else { "" };
                let item = if *worn { worn_name(*slot) } else { name(*slot) };
                ("quote", format!("Hỏi giá nâng cấp{how} {item}"))
            }
            SmithTask::Upgrade {
                slot,
                careful,
                to_level,
                worn,
                ..
            } => {
                let how = if *careful { " [Cẩn thận]" } else { "" };
                let item = if *worn { worn_name(*slot) } else { name(*slot) };
                ("upgrade", format!("Nâng cấp{how} {item} tới +{to_level}"))
            }
            SmithTask::Separate { slot } => ("separate", format!("Tách đá {}", name(*slot))),
            SmithTask::Transmute { source, target } => (
                "transmute",
                format!("Chuyển hoá {} sang {}", name(*source), name(*target)),
            ),
            SmithTask::Exchange { option, times } => {
                let (xu, xu_khoa) = npc::EXCHANGE_GIVES[(*option as usize).min(1)];
                let gives = match xu {
                    0 => format!("{} Xu khóa", grouped(xu_khoa * *times as i64)),
                    _ => format!("{} Xu", grouped(xu * *times as i64)),
                };
                let luong = npc::EXCHANGE_LUONG * *times as i64;
                ("exchange", format!("Đổi {luong} Lượng lấy {gives}"))
            }
        }
    }

    /// Starts a task of the Cửa hàng tab (SmithTask). Refused, with the reason in the log and nothing sent: busy (a
    /// battle, a job or quest run, a move, a step of a shop or of another task), away from M1, before the bag and the
    /// money are known, while an item action, a repair or a pickup waits for its answer, or for an item the task cannot
    /// take.
    pub fn smith(&mut self, task: SmithTask, now: Instant, out: &mut Vec<Out>) {
        let (kind, title) = self.smith_title(&task);
        let item = |slot: u8| self.bag_record(slot as i32);
        let why = self
            .busy()
            .map(String::from)
            .or_else(|| {
                self.shopping
                    .is_some()
                    .then(|| "đang đợi cửa hàng trả lời".into())
            })
            // Their answers come as s2c/1256 too, and would be taken for the task's ("Bạn vừa nhận được …" of a pickup
            // for an exchange, "Vật phẩm không thể sử dụng!" for a refusal of Pháp sư).
            .or_else(|| {
                (self.item_wait.is_some()
                    || self.repairing.is_some()
                    || self.picked_at.is_some_and(|t| now < t + PICK_ANSWER))
                .then(|| "đang đợi server trả lời việc khác (dùng, sửa hay nhặt đồ), thử lại sau vài giây".into())
            })
            .or_else(|| {
                (self.snap.map_id != npc::NPC_MAP).then(|| {
                    "Pháp sư và Hương Lão ở Làng Thanh Khê (M1), hãy sang M1 trước".into()
                })
            })
            .or_else(|| {
                (self.snap.bag.is_none() || self.snap.currencies.is_none())
                    .then(|| "chưa có túi đồ và tiền của nick".into())
            })
            .or_else(|| match &task {
                // Checked before it is taken off, so a task that cannot run leaves the gear as it is.
                SmithTask::Upgrade {
                    slot,
                    worn: true,
                    quote,
                    to_level,
                    unlocked,
                    ..
                } => match self.gear_record(*slot) {
                    None => Some(format!("không mặc món nào ở ô trang bị {slot}")),
                    Some(i) if book().get(i.item_id).is_none_or(|d| d.kind > 4) => {
                        Some("chỉ Nón, Áo, Vũ khí, Nhẫn và Cánh nâng cấp được".into())
                    }
                    Some(_)
                        if self
                            .snap
                            .bag
                            .as_ref()
                            .is_some_and(|b| b.items.len() as i32 >= b.capacity) =>
                    {
                        Some("túi đồ đầy: cần 1 ô trống để cởi món ra nâng cấp".into())
                    }
                    Some(i) => {
                        let wear = book().get(i.item_id).map_or(1, |d| d.level as i32);
                        if i.field0 >= upgrade_top(wear, *quote, *to_level) {
                            Some(format!("{} đã +{}", item_name(i.item_id), i.field0))
                        } else if upgrade_stones(&self.bag_items(), *unlocked).is_empty() {
                            Some("hết đá nâng cấp trong túi".into())
                        } else {
                            None
                        }
                    }
                },
                SmithTask::Upgrade { slot, .. } | SmithTask::Separate { slot } => match item(*slot) {
                    None => Some(format!("không có món nào ở ô túi {}", *slot as u32 + 1)),
                    Some(i) if book().get(i.item_id).is_none_or(|d| d.kind > 4) => {
                        Some("chỉ Nón, Áo, Vũ khí, Nhẫn và Cánh nâng cấp được".into())
                    }
                    Some(i) if matches!(task, SmithTask::Separate { .. }) && i.field0 < 1 => {
                        Some("chỉ tách đá được món đã nâng cấp".into())
                    }
                    _ => None,
                },
                SmithTask::Transmute { source, target } => match (item(*source), item(*target)) {
                    (Some(s), Some(t)) => {
                        let bag = self.bag_items();
                        let def = |id: i32| book().get(id).map(|d| (d.kind, d.level as i32));
                        if !npc::transmute_targets(&bag, &BagItem::from(&s), def)
                            .iter()
                            .any(|i| i.slot == t.slot as i32)
                        {
                            Some("món đích phải cùng loại, đang +0, bậc bằng hoặc cao hơn món nguồn".into())
                        } else if transmute_item(&bag, s.field0).is_none() {
                            Some(format!("thiếu vật phẩm Chuyển hoá cho món +{}", s.field0))
                        } else {
                            None
                        }
                    }
                    _ => Some("không thấy món nguồn hay món đích trong túi".into()),
                },
                SmithTask::Exchange { option, times } => {
                    let need = npc::EXCHANGE_LUONG * *times as i64;
                    if *option > 1 || *times < 1 {
                        Some("chọn Xu hoặc Xu khóa, ít nhất 1 lần".into())
                    } else if self.money().2 < need {
                        Some(format!("không đủ Lượng (cần {need}, có {})", self.money().2))
                    } else {
                        None
                    }
                }
                SmithTask::Merge(_) => None,
            });
        if let Some(why) = why {
            return out.push(Out::Log(LogKind::Item, format!("Chưa {title}: {why}")));
        }
        let shown = match &task {
            SmithTask::Upgrade {
                slot, worn: true, ..
            } => self.gear_record(*slot),
            SmithTask::Upgrade { slot, .. } | SmithTask::Separate { slot } => item(*slot),
            SmithTask::Transmute { source, .. } => item(*source),
            _ => None,
        };
        self.smith_runs += 1;
        self.snap.smith = Some(SmithRun {
            id: self.smith_runs,
            kind,
            title: title.clone(),
            doing: "Bắt đầu".into(),
            steps: 0,
            ok: 0,
            failed: 0,
            quote: None,
            preview: None,
            item: shown,
            worn: matches!(task, SmithTask::Upgrade { worn: true, .. }),
            spent_xu: 0,
            spent_xu_khoa: 0,
            spent_luong: 0,
            done: None,
            started_at: epoch_ms(),
            ended_at: None,
        });
        out.push(Out::Log(LogKind::Item, title));
        let times = match task {
            SmithTask::Exchange { times, .. } => times,
            _ => 0,
        };
        self.smith = Some(Smith {
            task,
            stage: Stage::Talk,
            until: now + SMITH_WAIT,
            npc: npc::SMITH,
            left: vec![],
            window: WindowKind::Upgrade,
            puts: VecDeque::new(),
            stones: vec![],
            tried: vec![],
            rates: vec![],
            exact: None,
            text: String::new(),
            ready: false,
            quote: Quote::default(),
            makes: None,
            times,
            stopping: false,
            wear: None,
        });
        match self.smith.as_ref().map(|s| &s.task) {
            Some(SmithTask::Upgrade {
                slot, worn: true, ..
            }) => {
                let gear = *slot;
                self.smith_unequip(gear, now, out)
            }
            _ => self.smith_next(now, out),
        }
    }

    /// Nâng cấp of a worn item: Cởi ra (c2s/1186 action 1, as the button of Túi đồ), since the window of Pháp sư takes
    /// items of the bag only (J1). The upgrade starts once the item is in the bag and off its gear slot (smith_worn).
    fn smith_unequip(&mut self, gear: u8, now: Instant, out: &mut Vec<Out>) {
        let Some(item) = self.gear_record(gear) else {
            return self.smith_finish(format!("không mặc món nào ở ô trang bị {gear}"), now, out);
        };
        let name = item_name(item.item_id);
        out.push(Out::Log(
            LogKind::Item,
            format!("Cởi {name} (ô trang bị {gear}) ra túi để nâng cấp"),
        ));
        if let Some(r) = self.snap.smith.as_mut() {
            r.doing = format!("Cởi {name} ra túi");
        }
        let sm = self.smith.as_mut().unwrap();
        sm.wear = Some(Wear {
            gear,
            uuid: item.uuid,
            name,
            ended: None,
            notice: None,
        });
        (sm.stage, sm.until) = (Stage::Unequip, now + SMITH_WAIT);
        Self::gear_action(out, 1, gear as i32);
    }

    /// Cởi ra or Mặc of a worn item, judged on the gear and the bag as the server sent them last (s2c/37, s2c/42,
    /// s2c/1186), never on which packet came: the upgrade goes on once the item is in the bag and off its gear slot; the
    /// task ends once it is back in its gear slot. A bag of before (the answer to c2s/42 of a press) or a notice leaves
    /// it waiting, up to SMITH_WAIT (smith_timer).
    pub(super) fn smith_worn(&mut self, now: Instant, out: &mut Vec<Out>) {
        let Some((stage, wear)) = self
            .smith
            .as_ref()
            .filter(|s| matches!(s.stage, Stage::Unequip | Stage::Rewear))
            .and_then(|s| s.wear.clone().map(|w| (s.stage, w)))
        else {
            return;
        };
        let worn = self
            .gear_record(wear.gear)
            .is_some_and(|g| g.uuid == wear.uuid);
        if stage == Stage::Rewear {
            if worn {
                let ended = wear.ended.unwrap_or_default();
                self.smith_end(format!("{ended}; đã mặc lại {}", wear.name), out);
            }
            return;
        }
        let Some(i) = self.bag_uuid(&wear.uuid).filter(|_| !worn) else {
            return;
        };
        out.push(Out::Log(
            LogKind::Item,
            format!("Đã cởi {} (ô túi {})", wear.name, i.slot as u32 + 1),
        ));
        if let Some(SmithTask::Upgrade { slot, worn, .. }) =
            self.smith.as_mut().map(|s| &mut s.task)
        {
            (*slot, *worn) = (i.slot, false);
        }
        self.smith_next(now, out);
    }

    /// Ends the task, with the reason in the log and on the tab. A worn item taken off for it is worn again first
    /// (Mặc, c2s/1186 action 0 on its bag slot); the task ends once it is back in its gear slot, with both said
    /// (smith_worn).
    pub(super) fn smith_finish(
        &mut self,
        reason: impl Into<String>,
        now: Instant,
        out: &mut Vec<Out>,
    ) {
        let reason = reason.into();
        let back = self
            .smith
            .as_ref()
            .and_then(|s| s.wear.as_ref().filter(|w| w.ended.is_none()))
            .and_then(|w| self.bag_uuid(&w.uuid).map(|i| (i.slot, w.name.clone())));
        if let Some((slot, name)) = back {
            out.push(Out::Log(
                LogKind::Item,
                format!("Mặc lại {name} (ô túi {})", slot as u32 + 1),
            ));
            if let Some(r) = self.snap.smith.as_mut() {
                r.doing = format!("Mặc lại {name}");
            }
            let sm = self.smith.as_mut().unwrap();
            if let Some(w) = sm.wear.as_mut() {
                (w.ended, w.notice) = (Some(reason), None);
            }
            (sm.stage, sm.until) = (Stage::Rewear, now + SMITH_WAIT);
            return Self::gear_action(out, 0, slot as i32);
        }
        self.smith_end(reason, out);
    }

    /// Ends the task now, with the reason in the log and on the tab.
    fn smith_end(&mut self, reason: impl Into<String>, out: &mut Vec<Out>) {
        let reason = reason.into();
        self.smith = None;
        if let Some(r) = self.snap.smith.as_mut().filter(|r| r.done.is_none()) {
            let mut spent = vec![];
            for (n, money) in [
                (r.spent_xu, "Xu"),
                (r.spent_xu_khoa, "Xu khóa"),
                (r.spent_luong, "Lượng"),
            ] {
                if n > 0 {
                    spent.push(format!("{} {money}", grouped(n)));
                }
            }
            let tally = match (r.steps, spent.is_empty()) {
                (0, _) => String::new(),
                (n, true) => format!(" ({n} lần)"),
                (n, false) => format!(" ({n} lần, tốn {})", spent.join(", ")),
            };
            out.push(Out::Log(
                LogKind::Item,
                format!("{}: {reason}{tally}", r.title),
            ));
            (r.done, r.ended_at, r.doing) = (Some(reason), Some(epoch_ms()), String::new());
        }
    }

    /// The task's next window: at the start, and after the bag that follows every press. Gộp đá plans again on the new
    /// bag, Nâng cấp goes on to the next level, the others end after one press; Đổi lượng talks to Hương Lão again.
    fn smith_next(&mut self, now: Instant, out: &mut Vec<Out>) {
        let Some((task, stopping)) = self.smith.as_ref().map(|s| (s.task.clone(), s.stopping))
        else {
            return;
        };
        if stopping {
            return self.smith_finish("Đã dừng", now, out);
        }
        let steps = self.snap.smith.as_ref().map_or(0, |r| r.steps);
        let bag = self.bag_items();
        let (xu, xu_khoa, _) = self.money();
        let open = |bot: &mut Bot,
                    window: WindowKind,
                    puts: Vec<i32>,
                    doing: String,
                    now,
                    out: &mut Vec<Out>| {
            if let Some(r) = bot.snap.smith.as_mut() {
                r.doing = doing;
            }
            let sm = bot.smith.as_mut().unwrap();
            (sm.window, sm.puts) = (window, puts.into());
            bot.smith_open(now, out);
        };
        match task {
            SmithTask::Merge(o) => {
                let Some(set) = merge_plan(&bag, o).into_iter().next() else {
                    let why = match steps {
                        0 => "không có 4 viên đá cùng cấp nào để gộp",
                        _ => "đã gộp hết",
                    };
                    return self.smith_finish(why, now, out);
                };
                let (pay, money) = match set.locked {
                    true => (xu_khoa + xu, "Xu khóa"),
                    false => (xu, "Xu"),
                };
                if set.fee > pay {
                    let why = format!(
                        "không đủ {money} để luyện Đá cấp {} (cần {})",
                        set.level + 1,
                        grouped(set.fee)
                    );
                    return self.smith_finish(why, now, out);
                }
                self.smith.as_mut().unwrap().makes = Some(set.level + 1);
                let doing = format!(
                    "Luyện 4 Đá cấp {} thành Đá cấp {}",
                    set.level,
                    set.level + 1
                );
                open(self, set.window, set.slots, doing, now, out);
            }
            SmithTask::Upgrade {
                slot,
                careful,
                to_level,
                unlocked,
                quote,
                ..
            } => {
                let Some(item) = self.bag_record(slot as i32) else {
                    return self.smith_finish(
                        format!("không còn món ở ô túi {}", slot as u32 + 1),
                        now,
                        out,
                    );
                };
                let wear = book().get(item.item_id).map_or(1, |d| d.level as i32);
                let top = upgrade_top(wear, quote, to_level);
                if let Some(r) = self.snap.smith.as_mut() {
                    r.item = Some(item.clone());
                }
                if item.field0 >= top || (quote && steps > 0) {
                    let why = match (quote, item.field0 >= npc::upgrade_cap(wear)) {
                        (_, true) => format!(
                            "{} đã tới trần +{}",
                            item_name(item.item_id),
                            npc::upgrade_cap(wear)
                        ),
                        (true, _) => "đã có giá".into(),
                        _ => format!("{} đã +{}", item_name(item.item_id), item.field0),
                    };
                    return self.smith_finish(why, now, out);
                }
                let stones: Vec<i32> = upgrade_stones(&bag, unlocked)
                    .iter()
                    .map(|i| i.slot)
                    .collect();
                if stones.is_empty() {
                    return self.smith_finish("hết đá nâng cấp trong túi", now, out);
                }
                let sm = self.smith.as_mut().unwrap();
                (sm.stones, sm.tried, sm.rates, sm.exact) = (stones, vec![], vec![], None);
                let window = if careful {
                    WindowKind::Careful
                } else {
                    WindowKind::Upgrade
                };
                let doing = format!(
                    "Nâng {} +{} lên +{}",
                    item_name(item.item_id),
                    item.field0,
                    item.field0 + 1
                );
                open(self, window, vec![slot as i32], doing, now, out);
            }
            SmithTask::Separate { slot } => {
                if steps > 0 {
                    return self.smith_finish("đã tách xong", now, out);
                }
                let doing = "Đặt món vào Tách đá".to_string();
                open(
                    self,
                    WindowKind::Separate,
                    vec![slot as i32],
                    doing,
                    now,
                    out,
                );
            }
            SmithTask::Transmute { source, target } => {
                if steps > 0 {
                    return self.smith_finish("đã chuyển hoá xong", now, out);
                }
                let level = self.bag_record(source as i32).map_or(0, |i| i.field0);
                let Some(stuff) = transmute_item(&bag, level) else {
                    return self.smith_finish(
                        format!("thiếu vật phẩm Chuyển hoá cho món +{level}"),
                        now,
                        out,
                    );
                };
                let doing = format!("Đặt món nguồn, món đích và {}", item_name(stuff.item_id));
                open(
                    self,
                    WindowKind::Transmute,
                    vec![source as i32, target as i32, stuff.slot],
                    doing,
                    now,
                    out,
                );
            }
            SmithTask::Exchange { option, .. } => {
                let sm = self.smith.as_mut().unwrap();
                if sm.times == 0 {
                    return self.smith_finish("đã đổi xong", now, out);
                }
                (sm.npc, sm.left) = (npc::ELDER, vec![npc::EXCHANGE_PATH, option]);
                (sm.stage, sm.until) = (Stage::Talk, now + SMITH_WAIT);
                let left = sm.times;
                if let Some(r) = self.snap.smith.as_mut() {
                    r.doing = format!("Đổi lượng ở Hương Lão, còn {left} lần");
                }
                Self::send(
                    out,
                    13,
                    Ctx {
                        map_id: Some(npc::NPC_MAP),
                        npc_id: Some(npc::ELDER),
                        ..Ctx::default()
                    },
                );
            }
        }
    }

    /// c2s/13 to Pháp sư, then down the lines of the window's menu.
    fn smith_open(&mut self, now: Instant, out: &mut Vec<Out>) {
        let sm = self.smith.as_mut().unwrap();
        (sm.npc, sm.left) = (npc::SMITH, sm.window.path().to_vec());
        (sm.ready, sm.text, sm.quote) = (false, String::new(), Quote::default());
        (sm.stage, sm.until) = (Stage::Talk, now + SMITH_WAIT);
        Self::send(
            out,
            13,
            Ctx {
                map_id: Some(npc::NPC_MAP),
                npc_id: Some(npc::SMITH),
                ..Ctx::default()
            },
        );
    }

    /// The NPC's menu (s2c/57) while a task talks to it: the next line of the path. False when no task waits for one.
    pub(super) fn smith_menu(&mut self, menu: &NpcMenu, now: Instant, out: &mut Vec<Out>) -> bool {
        let Some(sm) = self
            .smith
            .as_mut()
            .filter(|s| matches!(s.stage, Stage::Talk | Stage::Menu))
        else {
            return false;
        };
        let Some(&option) = sm.left.first() else {
            return false;
        };
        if !menu.options.iter().any(|o| o.0 == option) {
            let why = format!("{} không có dòng {option} trong menu", menu.npc);
            self.smith_finish(why, now, out);
            return true;
        }
        sm.left.remove(0);
        let exchange = matches!(sm.task, SmithTask::Exchange { .. });
        sm.stage = match (sm.left.is_empty(), exchange) {
            (false, _) => Stage::Menu,
            (true, true) => Stage::Exchange,
            (true, false) => Stage::Window,
        };
        sm.until = now + SMITH_WAIT;
        let npc_id = sm.npc;
        Self::send(
            out,
            57,
            Ctx {
                option: Some(option as i32),
                map_id: Some(npc::NPC_MAP),
                npc_id: Some(npc_id),
                ..Ctx::default()
            },
        );
        true
    }

    /// A window of Pháp sư opened (s2c/96, s2c/99): the items go in.
    pub(super) fn smith_window(&mut self, now: Instant, out: &mut Vec<Out>) {
        if self
            .smith
            .as_ref()
            .is_some_and(|s| s.stage == Stage::Window)
        {
            self.smith_put(now, out);
        }
    }

    /// The next item to put in (c2s/97), or Bắt đầu once all are in. Nâng cấp puts its stones one by one, cheapest first,
    /// until the odds reach the task's rate; a stone that raised nothing shows the odds were at their cap without it, and
    /// since the server takes every stone put in, the window opens again for the stones before it (putting is free). Out
    /// of stones under the rate, the task ends without pressing, unless Thường reached THUONG_CAP_LOW.
    fn smith_put(&mut self, now: Instant, out: &mut Vec<Out>) {
        let sm = self.smith.as_mut().unwrap();
        let mut next = sm.puts.pop_front();
        if next.is_none() {
            if let SmithTask::Upgrade {
                slot,
                rate,
                careful,
                quote,
                ..
            } = sm.task
            {
                let last = sm.rates.last().copied();
                let stalled =
                    sm.rates.len() >= 2 && last <= sm.rates.get(sm.rates.len() - 2).copied();
                let enough = last.is_some_and(|r| r >= rate);
                let more = sm.tried.len() < sm.stones.len() && sm.tried.len() < STONE_SLOTS;
                let capped = !careful && last.is_some_and(|r| r >= THUONG_CAP_LOW);
                match sm.exact {
                    Some(k) if sm.tried.len() < k && more => next = Some(sm.stones[sm.tried.len()]),
                    Some(_) => {}
                    None if stalled => {
                        sm.exact = Some(sm.tried.len() - 1);
                        (sm.tried, sm.rates) = (vec![], vec![]);
                        sm.puts = VecDeque::from([slot as i32]);
                        return self.smith_open(now, out);
                    }
                    None if !enough && more => next = Some(sm.stones[sm.tried.len()]),
                    None if !enough && !quote && !capped => {
                        let why = format!(
                            "đặt hết {} viên đá chỉ được {}%, chưa tới {rate}% muốn đạt; thêm đá hoặc hạ tỉ lệ",
                            sm.tried.len(),
                            last.unwrap_or(0)
                        );
                        return self.smith_finish(why, now, out);
                    }
                    None => {}
                }
                if let Some(s) = next {
                    sm.tried.push(s);
                }
            }
        }
        match next {
            Some(slot) => {
                (sm.stage, sm.until) = (Stage::Put, now + SMITH_WAIT);
                Self::send(
                    out,
                    97,
                    Ctx {
                        slot: Some(slot),
                        ..Ctx::default()
                    },
                );
            }
            None => self.smith_start(now, out),
        }
    }

    /// What the window answers for an item put in (s2c/90, s2c/92, s2c/1260): the price and odds, then the next item.
    /// `stone` for a stone of Nâng cấp, whose odds count for the next one.
    pub(super) fn smith_slot(
        &mut self,
        text: &str,
        ready: bool,
        stone: bool,
        now: Instant,
        out: &mut Vec<Out>,
    ) {
        let Some(sm) = self.smith.as_mut().filter(|s| s.stage == Stage::Put) else {
            return;
        };
        let q = quote(text);
        (sm.text, sm.ready) = (text.to_string(), ready);
        if q.rate.is_some() || q.fee.is_some() || !q.gain.is_empty() {
            sm.quote = q.clone();
            if let Some(r) = self.snap.smith.as_mut() {
                r.quote = Some(q.clone());
            }
        }
        if stone && matches!(sm.task, SmithTask::Upgrade { .. }) {
            sm.rates.push(q.rate.unwrap_or(0));
        }
        self.smith_put(now, out);
    }

    /// The item one level up (s2c/1258), for the tab.
    pub(super) fn smith_preview(&mut self, item: ItemRecord) {
        if self.smith.is_some() {
            if let Some(r) = self.snap.smith.as_mut() {
                r.preview = Some(item);
            }
        }
    }

    /// Bắt đầu (c2s/91), once the window said it may be pressed, what it said is what the task planned, and the money
    /// pays for it. Hỏi giá stops here.
    fn smith_start(&mut self, now: Instant, out: &mut Vec<Out>) {
        let (xu, xu_khoa, luong) = self.money();
        let sm = self.smith.as_ref().unwrap();
        let (q, quote_only) = (
            sm.quote.clone(),
            matches!(sm.task, SmithTask::Upgrade { quote: true, .. }),
        );
        let why = if !sm.ready {
            Some(format!(
                "Pháp sư chưa cho bấm Bắt đầu: {}",
                sm.text.replace('\n', "; ")
            ))
        } else if sm
            .makes
            .is_some_and(|l| q.stone.map(|s| s.level) != Some(l) || q.rate != Some(100))
        {
            Some(format!(
                "Pháp sư báo khác kế hoạch: {}",
                sm.text.replace('\n', "; ")
            ))
        } else {
            let fee_short = q.fee.and_then(|f| {
                let (have, money) = match f.money {
                    npc::Money::Xu => (xu, "Xu"),
                    npc::Money::XuKhoa => (xu_khoa + xu, "Xu khóa"),
                };
                (f.amount > have).then(|| {
                    format!(
                        "không đủ {money} (cần {}, có {})",
                        grouped(f.amount),
                        grouped(have)
                    )
                })
            });
            fee_short.or_else(|| {
                (q.luong > luong).then(|| format!("không đủ Lượng (cần {}, có {luong})", q.luong))
            })
        };
        if let Some(why) = why {
            return self.smith_finish(why, now, out);
        }
        let rate = q.rate.map_or(String::new(), |r| format!(", tỉ lệ {r}%"));
        let doing = self
            .snap
            .smith
            .as_ref()
            .map_or(String::new(), |r| r.doing.clone());
        if quote_only {
            let line = format!("{doing}: {}{rate}", fee_text(&q));
            return self.smith_finish(line, now, out);
        }
        let sm = self.smith.as_mut().unwrap();
        (sm.stage, sm.until) = (Stage::Start, now + SMITH_WAIT);
        out.push(Out::Log(
            LogKind::Item,
            format!("Bắt đầu: {doing} ({}{rate})", fee_text(&q)),
        ));
        Self::send(out, 91, Ctx::default());
    }

    /// What Bắt đầu did (s2c/91 or s2c/93): the log line, what it cost, then the whole bag again.
    pub(super) fn smith_result(
        &mut self,
        ok: bool,
        item: Option<ItemRecord>,
        received: Vec<ItemRecord>,
        target: Option<ItemRecord>,
        now: Instant,
        out: &mut Vec<Out>,
    ) {
        let Some(sm) = self.smith.as_mut().filter(|s| s.stage == Stage::Start) else {
            return;
        };
        let q = sm.quote.clone();
        let stones = sm.tried.len();
        let line = match (&sm.task, ok) {
            (SmithTask::Merge(_), true) => {
                let made = received
                    .first()
                    .map_or_else(|| "đá".into(), |i| item_name(i.item_id));
                format!("Luyện thành công: {made}")
            }
            (SmithTask::Merge(_), false) => "Luyện đá thất bại".into(),
            (SmithTask::Upgrade { .. }, true) => {
                let i = item.as_ref();
                format!(
                    "Nâng cấp thành công: {} +{}",
                    i.map_or("món".into(), |i| item_name(i.item_id)),
                    i.map_or(0, |i| i.field0)
                )
            }
            (SmithTask::Upgrade { .. }, false) => {
                let i = item.as_ref();
                format!(
                    "Nâng cấp thất bại: {} còn +{}, mất {stones} viên đá",
                    i.map_or("món".into(), |i| item_name(i.item_id)),
                    i.map_or(0, |i| i.field0)
                )
            }
            (SmithTask::Separate { .. }, true) => {
                let got: Vec<String> = received.iter().map(|i| item_name(i.item_id)).collect();
                format!("Tách đá xong, nhận {}", got.join(", "))
            }
            (SmithTask::Transmute { .. }, true) => format!(
                "Chuyển hoá xong: {} +{}",
                target
                    .as_ref()
                    .map_or("món đích".into(), |i| item_name(i.item_id)),
                target.as_ref().map_or(0, |i| i.field0)
            ),
            (_, false) => format!("Pháp sư báo không thành: {}", sm.text.replace('\n', "; ")),
            (SmithTask::Exchange { .. }, true) => String::new(),
        };
        if let Some(r) = self.snap.smith.as_mut() {
            r.steps += 1;
            match ok {
                true => r.ok += 1,
                false => r.failed += 1,
            }
            if let Some(f) = q.fee {
                match f.money {
                    npc::Money::Xu => r.spent_xu += f.amount,
                    npc::Money::XuKhoa => r.spent_xu_khoa += f.amount,
                }
            }
            r.spent_luong += q.luong;
            if item.is_some() {
                r.item = item;
            }
            r.doing = line.clone();
        }
        out.push(Out::Log(LogKind::Item, line));
        let sm = self.smith.as_mut().unwrap();
        (sm.stage, sm.until) = (Stage::Refresh, now + SMITH_WAIT);
        let name = self.snap.name.clone();
        Self::send(
            out,
            42,
            Ctx {
                character_name: Some(&name),
                ..Ctx::default()
            },
        );
    }

    /// The whole bag (s2c/42) after a press: the task goes on.
    pub(super) fn smith_bag(&mut self, now: Instant, out: &mut Vec<Out>) {
        match self.smith.as_ref().map(|s| s.stage) {
            Some(Stage::Refresh) => self.smith_next(now, out),
            Some(Stage::Unequip | Stage::Rewear) => self.smith_worn(now, out),
            _ => {}
        }
    }

    /// A notice (s2c/1256) or a message box (s2c/0) while a task waits: the exchange of Đổi lượng ("Bạn vừa nhận được
    /// 55.000 Xu khóa"), else a refusal that ends the task ("Vật phẩm không phù hợp", "Rương đồ không đủ ô trống", "Tỉ lệ
    /// trên 40% mới có thể thực hiện"). False when no task waits.
    pub(super) fn smith_notice(&mut self, text: &str, now: Instant, out: &mut Vec<Out>) -> bool {
        let Some(sm) = self.smith.as_mut().filter(|s| s.stage != Stage::Refresh) else {
            return false;
        };
        if sm.stage == Stage::Exchange && text.contains("nhận được") {
            sm.times = sm.times.saturating_sub(1);
            let stopping = sm.stopping;
            if let Some(r) = self.snap.smith.as_mut() {
                (r.steps, r.ok) = (r.steps + 1, r.ok + 1);
                r.spent_luong += npc::EXCHANGE_LUONG;
                r.doing = text.to_string();
            }
            match stopping {
                true => self.smith_finish("Đã dừng", now, out),
                false => self.smith_next(now, out),
            }
            return true;
        }
        // While Cởi ra or Mặc waits, a notice is kept as the reason in case the item does not move; it ends nothing, as
        // it may be another's (a broadcast, a late answer).
        if matches!(sm.stage, Stage::Unequip | Stage::Rewear) {
            if let Some(w) = sm.wear.as_mut() {
                w.notice = Some(text.to_string());
            }
            return true;
        }
        let who = npc_who(sm.npc);
        self.smith_finish(format!("{who} từ chối: {text}"), now, out);
        true
    }

    /// The step waited past SMITH_WAIT.
    pub(super) fn smith_timer(&mut self, now: Instant, out: &mut Vec<Out>) {
        let Some(sm) = self.smith.as_ref().filter(|s| s.until <= now) else {
            return;
        };
        // Cởi ra that did not show: if the item is in the bag after all, smith_finish wears it again.
        if let (stage @ (Stage::Unequip | Stage::Rewear), Some(w)) = (sm.stage, sm.wear.clone()) {
            let line = wear_failed(&w, stage);
            return match stage {
                Stage::Unequip => self.smith_finish(line, now, out),
                _ => self.smith_end(line, out),
            };
        }
        let who = npc_who(sm.npc);
        self.smith_finish(
            format!("{who} không trả lời sau {} s", SMITH_WAIT.as_secs()),
            now,
            out,
        );
    }

    /// Dừng: the task ends now, or once the press waiting for its result is in.
    pub(super) fn smith_stop(&mut self, now: Instant, out: &mut Vec<Out>) {
        match self.smith.as_mut() {
            Some(sm) if matches!(sm.stage, Stage::Start | Stage::Exchange | Stage::Unequip) => {
                sm.stopping = true
            }
            // Worn again already: the task ends on the answer.
            Some(sm) if sm.stage == Stage::Rewear => {}
            Some(_) => self.smith_finish("Đã dừng", now, out),
            None => {}
        }
    }
}
