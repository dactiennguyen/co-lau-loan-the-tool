//! Pháp sư and Hương Lão for Tiện ích: Gộp đá, Nâng cấp (with Bùa bảo vệ), Tách đá, Chuyển hoá, Chế tạo trang bị, Đổi
//! Băng Tâm, Đổi lượng, Điểm năng động and Nhiệm vụ hàng ngày (docs/app/events/16-upgrade.md#tính-năng,
//! 15-shops.md#đổi-lượng, 14-npc.md#điểm-năng-động, #nhiệm-vụ-hàng-ngày). One task at a time, step by step as the game
//! does:
//! c2s/13 to the NPC, c2s/57 down its menus, the window (s2c/96, s2c/99), c2s/97 for each item put in and the price and
//! odds the window says (s2c/90, s2c/92, s2c/1260), c2s/91 for Bắt đầu and its result (s2c/91, s2c/93). The server sends no
//! bag after a press, so the bot asks for it (c2s/42 → s2c/42) before the next one.
use super::*;
use crate::mail::{self, DailyQuest};

/// How long a step waits for the server (its answers came within 40 ms in J3).
pub(super) const SMITH_WAIT: Duration = Duration::from_secs(8);
/// Stones a Nâng cấp window holds (s2c/96).
const STONE_SLOTS: usize = 18;
/// The lowest cap of Nâng cấp [Thường] measured (80% at +0→+1, 75% at +1→+2): odds this high with the last stone of the
/// bag may be the cap, so they are pressed although under the rate asked.
const THUONG_CAP_LOW: i32 = 75;

/// Why Nâng cấp may not press at `odds`: under the rate asked, unless Thường reached THUONG_CAP_LOW (odds that may be the
/// cap of the level). The last check before Bắt đầu, whatever put the stones in; Hỏi giá presses nothing anyway.
fn under_rate(task: &SmithTask, odds: Option<i32>) -> Option<String> {
    let SmithTask::Upgrade {
        rate,
        careful,
        quote: false,
        ..
    } = *task
    else {
        return None;
    };
    let odds = odds.unwrap_or(0);
    (odds < rate && (careful || odds < THUONG_CAP_LOW))
        .then(|| format!("tỉ lệ chỉ {odds}%, chưa tới {rate}% muốn đạt; không bấm"))
}

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
    /// The last line of the path went out for a menu the task reads (s2c/57): the recipes of Chế tạo trang bị, the Băng
    /// Tâm held, the Điểm năng động.
    Read,
    /// Đổi Băng Tâm: its line sent; "Đã đổi …" (s2c/1256) or a refusal next.
    IceDone,
    /// Điểm năng động: Cách tính điểm sent; s2c/0 with the rules next.
    Rules,
    /// Nhiệm vụ hàng ngày: Nhận, Hủy or Hoàn thành sent; s2c/1195 next (Nhận: its notice first), or a refusal.
    Daily,
    /// c2s/13 sent again so that the menu the server remembers is the NPC's first one, not one whose line 0 spends (Đổi
    /// lượng, Đổi Băng Tâm, Đổi Xu of Điểm năng động, Nhận or Hủy of Nhiệm vụ hàng ngày; NP1, G1): its s2c/57 next, then
    /// the task ends.
    Reset,
}

/// An item to put in a window: bag slot, quantity, npc::PUT_ITEM or PUT_STACK.
type Put = (i32, i32, i32);
fn put_one(slot: i32) -> Put {
    (slot, 1, npc::PUT_ITEM)
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

/// The level Nâng cấp goes up to for an item of it1 type `kind` worn from level `wear`: its cap, and `to_level` too
/// with no `quote`.
fn upgrade_top(kind: u8, wear: i32, quote: bool, to_level: i32) -> i32 {
    match quote {
        true => npc::item_cap(kind, wear),
        false => npc::item_cap(kind, wear).min(to_level),
    }
}
/// The it1 type and wear level of an item, (0, 1) when the book lacks it.
fn kind_level(item_id: i32) -> (u8, i32) {
    book()
        .get(item_id)
        .map_or((0, 1), |d| (d.kind, d.level as i32))
}
/// "Nhẫn", "item kind 7".
fn craft_name(kind: u8) -> &'static str {
    npc::CRAFT_LABELS.get(kind as usize).copied().unwrap_or("?")
}
/// The kind of a task's log lines: Nhiệm vụ for the daily quests, Vật phẩm for the others.
fn task_log(task: &SmithTask) -> LogKind {
    match task {
        SmithTask::Daily { .. } => LogKind::Quest,
        _ => LogKind::Item,
    }
}
/// "Nhặt xu (Thu thập 218/2100 xu khóa từ đánh quái)".
fn daily_what(q: &DailyQuest) -> String {
    format!("{} ({})", q.name, q.text())
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
    /// Items still to put in the window, in order, and the bag slot put last.
    puts: VecDeque<Put>,
    putting: i32,
    /// Nâng cấp: the bag slot of the Bùa bảo vệ put in this window, and the level of the item when Bắt đầu was pressed.
    charm: Option<i32>,
    pressed_at: Option<i32>,
    /// Chế tạo trang bị: the uuids of the bag when Bắt đầu was first pressed, to find the items made.
    before: Vec<String>,
    /// The menu the server remembers may spend on a line 0 (Đổi lượng, Đổi Băng Tâm, Điểm năng động): the task talks to
    /// the NPC again before it ends, and `ending` is why it ends once the NPC answered.
    reset: bool,
    ending: Option<String>,
    /// Nhiệm vụ hàng ngày: the quest held when its line was picked, for the line of Hủy.
    daily: Option<DailyQuest>,
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
    /// Đổi lượng: exchanges still to do. Chế tạo trang bị: the items asked for.
    times: u32,
    /// Stop was pressed during a press: the task ends once its result is in.
    stopping: bool,
    /// Nâng cấp of a worn item: worn again once the task ends.
    wear: Option<Wear>,
}

/// "1.639".
pub(super) fn grouped(n: i64) -> String {
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
    pub(super) fn bag_items(&self) -> Vec<BagItem> {
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
    pub(super) fn money(&self) -> (i64, i64, i64) {
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
            SmithTask::Merge(o) => ("merge", merge_title(o)),
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
            SmithTask::Recipes { kind } => (
                "recipes",
                format!("Xem công thức chế tạo {}", craft_name(*kind)),
            ),
            SmithTask::Craft { kind, tier, times } => {
                let many = match times {
                    0 | 1 => String::new(),
                    n => format!("{n} "),
                };
                (
                    "craft",
                    format!("Chế tạo {many}{} Bậc {}", craft_name(*kind), roman(*tier)),
                )
            }
            SmithTask::Ice { option } => {
                let what = match option {
                    0 => "1 bình",
                    1 => "5 bình",
                    _ => "hết",
                };
                ("ice", format!("Đổi Băng Tâm lấy bình rỗng ({what})"))
            }
            SmithTask::Points { .. } => ("points", "Xem Điểm năng động".into()),
            SmithTask::Daily { action } => (
                "daily",
                match action {
                    DailyAction::Show => "Xem nhiệm vụ ngày",
                    DailyAction::Accept => "Nhận nhiệm vụ ngày",
                    DailyAction::Cancel => "Hủy nhiệm vụ ngày",
                    DailyAction::Complete => "Hoàn thành nhiệm vụ ngày",
                }
                .into(),
            ),
        }
    }

    /// Why SmithTask::Daily cannot do `action` with the quest held (s2c/1195); the menu is checked again (smith_read).
    fn daily_why(&self, action: DailyAction) -> Option<String> {
        let d = &self.snap.daily;
        match (action, d.quest.as_ref()) {
            (DailyAction::Accept, Some(q)) => Some(format!(
                "đang giữ nhiệm vụ {}: hoàn thành hoặc hủy trước",
                daily_what(q)
            )),
            (DailyAction::Cancel | DailyAction::Complete, None) if d.known => {
                Some("không giữ nhiệm vụ ngày nào".into())
            }
            (DailyAction::Cancel, Some(q)) if q.finished() => Some(format!(
                "{} đã đủ {}/{}: Hoàn thành để nhận thưởng thay vì hủy",
                q.name, q.progress, q.target
            )),
            (DailyAction::Complete, Some(q)) if !q.finished() => Some(format!(
                "{} mới {}/{}: chưa xong",
                q.name, q.progress, q.target
            )),
            _ => None,
        }
    }

    /// Starts a task of Tiện ích (SmithTask). Refused, with the reason in the log and nothing sent: busy (a
    /// battle, a job or quest run, a move, a step of a shop or of another task), away from M1, before the bag and the
    /// money are known, while an item action (5 s at most), a repair or a pickup waits for its answer, or for an item the
    /// task cannot take.
    pub fn smith(&mut self, task: SmithTask, now: Instant, out: &mut Vec<Out>) {
        self.smith_begin(task, false, now, out);
    }
    /// smith, a fight job left aside with `job` (busy_but): Gộp đá of Tự gộp đá khi túi đầy. Returns whether it started.
    pub(super) fn smith_begin(
        &mut self,
        task: SmithTask,
        job: bool,
        now: Instant,
        out: &mut Vec<Out>,
    ) -> bool {
        let (kind, title) = self.smith_title(&task);
        let item = |slot: u8| self.bag_record(slot as i32);
        let why = self
            .busy_but(job)
            .map(String::from)
            .or_else(|| {
                self.shopping
                    .is_some()
                    .then(|| "đang đợi cửa hàng trả lời".into())
            })
            // Their answers come as s2c/1256 too, and would be taken for the task's ("Bạn vừa nhận được …" of a pickup
            // for an exchange, "Vật phẩm không thể sử dụng!" for a refusal of Pháp sư). An item action 5 s old is not
            // waited for any more (item_pending), as for the next button of the Túi đồ tab.
            .or_else(|| {
                (self.item_pending(now)
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
                        let (kind, wear) = kind_level(i.item_id);
                        if i.field0 >= upgrade_top(kind, wear, *quote, *to_level) {
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
                SmithTask::Merge(_) | SmithTask::Points { .. } => None,
                SmithTask::Recipes { kind } | SmithTask::Craft { kind, .. } if *kind > 3 => {
                    Some("chọn Nón, Áo, Vũ khí hay Nhẫn".into())
                }
                SmithTask::Craft { tier, .. } if !(1..=6).contains(tier) => {
                    Some("chọn một bậc từ I tới VI".into())
                }
                SmithTask::Craft { times: 0, .. } => Some("chế tạo ít nhất 1 món".into()),
                SmithTask::Recipes { .. } | SmithTask::Craft { .. } => None,
                SmithTask::Ice { option } if *option > 2 => {
                    Some("chọn đổi 1 bình, 5 bình hay hết".into())
                }
                SmithTask::Ice { .. } => {
                    let held: i64 = (self.snap.bag.iter())
                        .flat_map(|b| &b.items)
                        .filter(|i| i.item_id == npc::ICE_ID)
                        .map(|i| i.quantity as i64)
                        .sum();
                    (held < npc::ICE_PER_BOTTLE).then(|| {
                        format!("cần {} Băng Tâm, túi có {held}", npc::ICE_PER_BOTTLE)
                    })
                }
                SmithTask::Daily { action } => self.daily_why(*action),
            });
        if let Some(why) = why {
            out.push(Out::Log(task_log(&task), format!("Chưa {title}: {why}")));
            return false;
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
        out.push(Out::Log(task_log(&task), title));
        let times = match task {
            SmithTask::Exchange { times, .. } | SmithTask::Craft { times, .. } => times,
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
            putting: -1,
            charm: None,
            pressed_at: None,
            before: vec![],
            reset: false,
            ending: None,
            daily: None,
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
        true
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
        // The menu the server remembers may spend on its line 0: the NPC is talked to again first, and the task ends on
        // its answer (smith_menu) or its silence (smith_timer).
        if let Some(sm) = self
            .smith
            .as_mut()
            .filter(|s| s.reset && s.stage != Stage::Reset)
        {
            sm.ending = Some(reason);
            return self.smith_reset(now, out);
        }
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

    /// c2s/13 to the task's NPC again, so that the menu the server remembers is the first one (Stage::Reset).
    fn smith_reset(&mut self, now: Instant, out: &mut Vec<Out>) {
        let sm = self.smith.as_mut().unwrap();
        (sm.stage, sm.until) = (Stage::Reset, now + SMITH_WAIT);
        let npc_id = sm.npc;
        Self::send(
            out,
            13,
            Ctx {
                map_id: Some(npc::NPC_MAP),
                npc_id: Some(npc_id),
                ..Ctx::default()
            },
        );
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
            let kind = match r.kind {
                "daily" => LogKind::Quest,
                _ => LogKind::Item,
            };
            out.push(Out::Log(kind, format!("{}: {reason}{tally}", r.title)));
            (r.done, r.ended_at, r.doing) = (Some(reason), Some(epoch_ms()), String::new());
        }
    }

    /// The task's next window: at the start, and after the bag that follows every press. Gộp đá plans again on the new
    /// bag, Nâng cấp goes on to the next level, Chế tạo trang bị to its next item (the menu read again), the others end
    /// after one press; Đổi lượng talks to Hương Lão again.
    fn smith_next(&mut self, now: Instant, out: &mut Vec<Out>) {
        let Some((task, stopping)) = self.smith.as_ref().map(|s| (s.task.clone(), s.stopping))
        else {
            return;
        };
        if stopping {
            return self.smith_finish(self.stopped(), now, out);
        }
        let steps = self.snap.smith.as_ref().map_or(0, |r| r.steps);
        let bag = self.bag_items();
        let (xu, xu_khoa, _) = self.money();
        let open = |bot: &mut Bot,
                    window: WindowKind,
                    puts: Vec<Put>,
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
                let enough = o.sets.is_some_and(|n| steps as i64 >= n);
                let next = (!enough).then(|| merge_plan(&bag, o).into_iter().next());
                let Some(set) = next.flatten() else {
                    let why = match (steps, o.level) {
                        _ if enough => "đã gộp xong".into(),
                        (0, Some(level)) => format!(
                            "không có 4 viên Đá cấp {level}{} để gộp",
                            lock_words(o.locked)
                        ),
                        (0, None) => "không có 4 viên đá cùng cấp nào để gộp".into(),
                        _ => "đã gộp hết".to_string(),
                    };
                    return self.smith_finish(why, now, out);
                };
                let (pay, money) = match set.locked {
                    true if o.xu_khoa_only => (xu_khoa, "Xu khóa"),
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
                let puts = set.slots.into_iter().map(put_one).collect();
                open(self, set.window, puts, doing, now, out);
            }
            SmithTask::Upgrade {
                slot,
                careful,
                to_level,
                unlocked,
                quote,
                charm,
                ..
            } => {
                let Some(item) = self.bag_record(slot as i32) else {
                    return self.smith_finish(
                        format!("không còn món ở ô túi {}", slot as u32 + 1),
                        now,
                        out,
                    );
                };
                let name = item_name(item.item_id);
                let (kind, wear) = kind_level(item.item_id);
                let (top, cap) = (
                    upgrade_top(kind, wear, quote, to_level),
                    npc::item_cap(kind, wear),
                );
                if let Some(r) = self.snap.smith.as_mut() {
                    r.item = Some(item.clone());
                }
                // A failure without a charm dropped the item (+7 → +4): the task ends there. With one, or below +4, the
                // level stayed and the same level is tried again.
                let pressed = self.smith.as_mut().unwrap().pressed_at.take();
                if let Some(from) = pressed.filter(|&from| item.field0 < from) {
                    let why = format!(
                        "{name} tụt từ +{from} về +{}: thất bại không có bùa thì dừng",
                        item.field0
                    );
                    return self.smith_finish(why, now, out);
                }
                if item.field0 >= top || (quote && steps > 0) {
                    let why = match (quote, item.field0 >= cap) {
                        (_, true) => format!("{name} đã tới trần +{cap}"),
                        (true, _) => "đã có giá".into(),
                        _ => format!("{name} đã +{}", item.field0),
                    };
                    return self.smith_finish(why, now, out);
                }
                let level = item.field0;
                let protect = npc::charm_useful(level);
                let held = (charm && protect)
                    .then(|| npc::charm_for(&bag, level))
                    .flatten();
                if charm && protect && held.is_none() && !quote {
                    let why = format!(
                        "thất bại ở +{level} sẽ tụt về +{}: cần Bùa bảo vệ trong túi (sơ cấp tới +8, trung cấp tới +12, cao cấp tới +14, siêu cấp tới +16), hoặc bỏ chọn Dùng bùa",
                        npc::fail_level(level)
                    );
                    return self.smith_finish(why, now, out);
                }
                if protect && held.is_none() {
                    let line = match quote {
                        true => format!("Không có Bùa bảo vệ cho +{level}: giá này chưa tính bùa"),
                        false => format!(
                            "Không dùng bùa: thất bại sẽ tụt {name} từ +{level} về +{}",
                            npc::fail_level(level)
                        ),
                    };
                    out.push(Out::Log(LogKind::Item, line));
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
                sm.charm = held.map(|c| c.slot);
                let window = if careful {
                    WindowKind::Careful
                } else {
                    WindowKind::Upgrade
                };
                let with = held.map_or(String::new(), |c| format!(", có {}", item_name(c.item_id)));
                let doing = format!("Nâng {name} +{level} lên +{}{with}", level + 1);
                let mut puts = vec![put_one(slot as i32)];
                puts.extend(held.map(|c| (c.slot, 1, npc::PUT_STACK)));
                open(self, window, puts, doing, now, out);
            }
            SmithTask::Separate { slot } => {
                if steps > 0 {
                    return self.smith_finish("đã tách xong", now, out);
                }
                let doing = "Đặt món vào Tách đá".to_string();
                open(
                    self,
                    WindowKind::Separate,
                    vec![put_one(slot as i32)],
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
                    vec![
                        put_one(source as i32),
                        put_one(target as i32),
                        put_one(stuff.slot),
                    ],
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
                sm.reset = true;
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
            SmithTask::Recipes { .. } if steps > 0 => self.smith_finish("đã đọc", now, out),
            SmithTask::Craft { times, .. }
                if steps >= times || self.snap.smith.as_ref().is_some_and(|r| r.failed > 0) =>
            {
                let why = match self.craft_made() {
                    Some(made) => made,
                    None => "xong, chưa thấy món mới trong túi".to_string(),
                };
                self.smith_finish(why, now, out)
            }
            SmithTask::Ice { .. } if steps > 0 => {
                let count = |id: i32| -> i64 {
                    (self.snap.bag.iter())
                        .flat_map(|b| &b.items)
                        .filter(|i| i.item_id == id)
                        .map(|i| i.quantity as i64)
                        .sum()
                };
                let why = format!(
                    "đã đổi; còn {} Băng Tâm, có {} Bình Huyết Linh (Rỗng)",
                    count(npc::ICE_ID),
                    count(npc::BOTTLE_ID)
                );
                self.smith_finish(why, now, out)
            }
            SmithTask::Recipes { kind } | SmithTask::Craft { kind, .. } => {
                let path = [npc::CRAFT_PATH[0], npc::CRAFT_PATH[1], kind];
                let doing = match task {
                    SmithTask::Craft { times, .. } if times > 1 => {
                        format!("Món {}/{times}: đọc công thức ở Pháp sư", steps + 1)
                    }
                    _ => "Đọc công thức ở Pháp sư".into(),
                };
                self.smith_talk(npc::SMITH, &path, false, &doing, now, out)
            }
            SmithTask::Ice { .. } => self.smith_talk(
                npc::SMITH,
                &npc::ICE_PATH,
                true,
                "Mở Đổi Băng Tâm ở Pháp sư",
                now,
                out,
            ),
            SmithTask::Points { .. } if steps > 0 => self.smith_finish("đã đọc", now, out),
            // It ends on the answer to its line (smith_daily) or on the menu (daily_read), never after a bag.
            SmithTask::Daily { .. } => self.smith_talk(
                npc::ELDER,
                &[mail::DAILY_PATH],
                true,
                "Hỏi Hương Lão nhiệm vụ ngày",
                now,
                out,
            ),
            SmithTask::Points { .. } => {
                let path = [npc::POINTS_PATH];
                self.smith_talk(
                    npc::ELDER,
                    &path,
                    true,
                    "Hỏi Hương Lão Điểm năng động",
                    now,
                    out,
                )
            }
        }
    }

    /// c2s/13 to `npc`, then down `path` to a menu the task reads (Stage::Read). With `reset`, the NPC is talked to again
    /// before the task ends.
    fn smith_talk(
        &mut self,
        npc_id: i32,
        path: &[u8],
        reset: bool,
        doing: &str,
        now: Instant,
        out: &mut Vec<Out>,
    ) {
        if let Some(r) = self.snap.smith.as_mut() {
            r.doing = doing.into();
        }
        let sm = self.smith.as_mut().unwrap();
        (sm.npc, sm.left, sm.reset) = (npc_id, path.to_vec(), reset);
        (sm.stage, sm.until) = (Stage::Talk, now + SMITH_WAIT);
        Self::send(
            out,
            13,
            Ctx {
                map_id: Some(npc::NPC_MAP),
                npc_id: Some(npc_id),
                ..Ctx::default()
            },
        );
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
        let Some(sm) = self.smith.as_mut().filter(|s| {
            matches!(
                s.stage,
                Stage::Talk | Stage::Menu | Stage::Read | Stage::Reset
            )
        }) else {
            return false;
        };
        match sm.stage {
            Stage::Reset => {
                // Talked to again: the menu remembered is the first one, nothing to do again before the end.
                sm.reset = false;
                let ending = sm.ending.take();
                match ending {
                    Some(why) => self.smith_end(why, out),
                    // Đổi Băng Tâm went through: the bag next (smith_bag, smith_next).
                    None => self.smith_refresh(now, out),
                }
                return true;
            }
            Stage::Read => {
                self.smith_read(menu, now, out);
                return true;
            }
            _ => {}
        }
        let Some(&option) = sm.left.first() else {
            return false;
        };
        if !menu.options.iter().any(|o| o.0 == option) {
            let why = format!("{} không có dòng {option} trong menu", menu.npc);
            self.smith_finish(why, now, out);
            return true;
        }
        sm.left.remove(0);
        sm.stage = match (sm.left.is_empty(), &sm.task) {
            (false, _) => Stage::Menu,
            (true, SmithTask::Exchange { .. }) => Stage::Exchange,
            (
                true,
                SmithTask::Recipes { .. }
                | SmithTask::Craft { .. }
                | SmithTask::Ice { .. }
                | SmithTask::Points { .. }
                | SmithTask::Daily { .. },
            ) => Stage::Read,
            (true, _) => Stage::Window,
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
    /// until the odds reach the task's rate. A stone that raised nothing at odds a cap can be (Thường from
    /// THUONG_CAP_LOW) shows the odds were at their cap without it, and since the server takes every stone put in, the
    /// window opens again for the stones before it (putting is free). Under that, the stone added less than the 1% the
    /// server rounds the odds down to (two Đá cấp 1 at +5 both say 0%), so the next stone goes in. Out of stones under the
    /// rate, the task ends without pressing, unless Thường reached THUONG_CAP_LOW.
    fn smith_put(&mut self, now: Instant, out: &mut Vec<Out>) {
        let sm = self.smith.as_mut().unwrap();
        let mut next = sm.puts.pop_front();
        // A Bùa bảo vệ in the window takes one of its 18 slots.
        let room = STONE_SLOTS - sm.charm.is_some() as usize;
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
                let more = sm.tried.len() < sm.stones.len() && sm.tried.len() < room;
                let capped = !careful && last.is_some_and(|r| r >= THUONG_CAP_LOW);
                match sm.exact {
                    Some(k) if sm.tried.len() < k && more => {
                        next = Some(put_one(sm.stones[sm.tried.len()]))
                    }
                    Some(_) => {}
                    None if stalled && capped => {
                        sm.exact = Some(sm.tried.len() - 1);
                        (sm.tried, sm.rates) = (vec![], vec![]);
                        sm.puts = VecDeque::from([put_one(slot as i32)]);
                        sm.puts.extend(sm.charm.map(|c| (c, 1, npc::PUT_STACK)));
                        return self.smith_open(now, out);
                    }
                    None if !enough && more => next = Some(put_one(sm.stones[sm.tried.len()])),
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
                    sm.tried.push(s.0);
                }
            }
        }
        match next {
            Some((slot, quantity, kind)) => {
                (sm.stage, sm.until, sm.putting) = (Stage::Put, now + SMITH_WAIT, slot);
                Self::send(
                    out,
                    97,
                    Ctx {
                        slot: Some(slot),
                        quantity: Some(quantity),
                        put_kind: Some(kind),
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
        fee: Option<i64>,
        now: Instant,
        out: &mut Vec<Out>,
    ) {
        let Some(sm) = self.smith.as_mut().filter(|s| s.stage == Stage::Put) else {
            return;
        };
        let mut q = quote(text);
        // Chế tạo trang bị says its fee in a field of s2c/92 (Xu), not in the text.
        if let Some(amount) = fee.filter(|f| *f > 0) {
            q.fee = Some(npc::Fee {
                money: npc::Money::Xu,
                amount,
            });
        }
        // The charm's answer says 0%: it is no stone.
        let stone = stone && sm.charm != Some(sm.putting);
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
        // Xu khóa alone (Tự gộp đá khi túi đầy): what the server quotes is checked too, not only merge_fee.
        let xu_khoa_only = matches!(sm.task, SmithTask::Merge(o) if o.xu_khoa_only);
        let why = if !sm.ready {
            Some(format!(
                "Pháp sư chưa cho bấm Bắt đầu: {}",
                sm.text.replace('\n', "; ")
            ))
        } else if let Some(low) = under_rate(&sm.task, q.rate) {
            Some(low)
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
                    npc::Money::XuKhoa if xu_khoa_only => (xu_khoa, "Xu khóa"),
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
        let uuids: Vec<String> = (self.snap.bag.iter())
            .flat_map(|b| &b.items)
            .map(|i| i.uuid.clone())
            .collect();
        let level = match self.smith.as_ref().map(|s| &s.task) {
            Some(SmithTask::Upgrade { slot, .. }) => {
                self.bag_record(*slot as i32).map(|i| i.field0)
            }
            _ => None,
        };
        let first = self.snap.smith.as_ref().is_none_or(|r| r.steps == 0);
        let sm = self.smith.as_mut().unwrap();
        (sm.stage, sm.until, sm.pressed_at) = (Stage::Start, now + SMITH_WAIT, level);
        if first {
            sm.before = uuids;
        }
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
        let charm = sm.charm.and_then(|slot| {
            (self.snap.bag.iter())
                .flat_map(|b| &b.items)
                .find(|i| i.slot as i32 == slot)
                .map(|i| item_name(i.item_id))
        });
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
                    "Nâng cấp thành công: {} +{}{}",
                    i.map_or("món".into(), |i| item_name(i.item_id)),
                    i.map_or(0, |i| i.field0),
                    charm
                        .as_ref()
                        .map_or(String::new(), |c| format!(" (mất 1 {c})"))
                )
            }
            (SmithTask::Upgrade { .. }, false) => {
                let i = item.as_ref();
                let kept = charm
                    .as_ref()
                    .map_or(String::new(), |c| format!(" nhờ bùa, mất cả 1 {c}"));
                format!(
                    "Nâng cấp thất bại: {} còn +{}, mất {stones} viên đá{kept}",
                    i.map_or("món".into(), |i| item_name(i.item_id)),
                    i.map_or(0, |i| i.field0)
                )
            }
            (SmithTask::Craft { kind, tier, .. }, true) => {
                format!(
                    "Chế tạo thành công: {} Bậc {}",
                    craft_name(*kind),
                    roman(*tier)
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
            (
                SmithTask::Exchange { .. }
                | SmithTask::Recipes { .. }
                | SmithTask::Ice { .. }
                | SmithTask::Points { .. }
                | SmithTask::Daily { .. },
                true,
            ) => String::new(),
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
        self.smith_refresh(now, out);
    }

    /// c2s/42: the whole bag again, since the server sends none after a press; the task goes on with it (smith_bag).
    fn smith_refresh(&mut self, now: Instant, out: &mut Vec<Out>) {
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

    /// The menu a task reads (Stage::Read). Chế tạo trang bị: the recipes of the kind, kept for the tab; Craft then picks
    /// the tier's line once the level, the materials, the Xu and a free slot are there, and puts each material with its
    /// whole stack (PUT_STACK, as the phone, O1). Đổi Băng Tâm: the Băng Tâm held, then the line asked when there are
    /// enough and room for the bottles. Điểm năng động: the points, then Cách tính điểm if asked.
    fn smith_read(&mut self, menu: &NpcMenu, now: Instant, out: &mut Vec<Out>) {
        let Some(task) = self.smith.as_ref().map(|s| s.task.clone()) else {
            return;
        };
        let send57 = |out: &mut Vec<Out>, option: u8, npc_id: i32| {
            Self::send(
                out,
                57,
                Ctx {
                    option: Some(option as i32),
                    map_id: Some(npc::NPC_MAP),
                    npc_id: Some(npc_id),
                    ..Ctx::default()
                },
            )
        };
        let bag = self.bag_items();
        let free = self
            .snap
            .bag
            .as_ref()
            .map_or(0, |b| b.capacity - b.items.len() as i32);
        match task {
            SmithTask::Recipes { kind } | SmithTask::Craft { kind, .. } => {
                let recipes = npc::recipes(&menu.text, &menu.options);
                let read = CraftRecipes {
                    kind,
                    name: craft_name(kind),
                    recipes: recipes.clone(),
                    read_at: epoch_ms(),
                };
                self.snap.recipes.retain(|r| r.kind != kind);
                self.snap.recipes.push(read);
                let SmithTask::Craft { tier, .. } = task else {
                    let line = format!("{} bậc", recipes.len());
                    out.push(Out::Log(
                        LogKind::Item,
                        format!("Công thức chế tạo {}: {line}", craft_name(kind)),
                    ));
                    return self.smith_finish(format!("đọc xong, {line}"), now, out);
                };
                let Some(recipe) = recipes.iter().find(|r| r.tier == tier) else {
                    let why = format!("menu không có công thức Bậc {}", roman(tier));
                    return self.smith_finish(why, now, out);
                };
                let book = book();
                let (puts, missing) = npc::craft_materials(&bag, recipe, |n| book.material(n));
                let mut problems: Vec<String> = vec![];
                if self.snap.level < recipe.level {
                    problems.push(format!(
                        "cần cấp {}, nhân vật cấp {}",
                        recipe.level, self.snap.level
                    ));
                }
                problems.extend(missing.iter().map(|m| format!("thiếu {m}")));
                if self.money().0 < recipe.xu {
                    problems.push(format!(
                        "thiếu Xu: cần {}, có {}",
                        grouped(recipe.xu),
                        grouped(self.money().0)
                    ));
                }
                if free < 1 {
                    problems.push("túi không còn ô trống cho món mới".into());
                }
                // A later item that lacks something ends the run with those made before it.
                let (times, steps) = (
                    self.smith.as_ref().map_or(1, |s| s.times),
                    self.snap.smith.as_ref().map_or(0, |r| r.steps),
                );
                if !problems.is_empty() {
                    let why = match self.craft_made() {
                        Some(made) => format!(
                            "{made}; món thứ {} không chế được: {}",
                            steps + 1,
                            problems.join("; ")
                        ),
                        None => problems.join("; "),
                    };
                    return self.smith_finish(why, now, out);
                }
                let materials: Vec<String> = (puts.iter())
                    .map(|p| format!("{} {}", p.name, p.count))
                    .collect();
                let which = match times {
                    0 | 1 => String::new(),
                    n => format!(", món {}/{n}", steps + 1),
                };
                if let Some(r) = self.snap.smith.as_mut() {
                    r.doing = format!(
                        "Chế tạo {} Bậc {}{which} ({}, {} Xu)",
                        craft_name(kind),
                        roman(tier),
                        materials.join(", "),
                        grouped(recipe.xu)
                    );
                }
                let sm = self.smith.as_mut().unwrap();
                sm.puts = (puts.iter())
                    .map(|p| (p.item.slot, p.item.quantity, npc::PUT_STACK))
                    .collect();
                (sm.window, sm.ready, sm.text) = (WindowKind::Upgrade, false, String::new());
                (sm.stage, sm.until) = (Stage::Window, now + SMITH_WAIT);
                send57(out, recipe.option, npc::SMITH);
            }
            SmithTask::Ice { option } => {
                let in_bag: i64 = (bag.iter())
                    .filter(|i| i.item_id == npc::ICE_ID)
                    .map(|i| i.quantity as i64)
                    .sum();
                let held = npc::ice_held(&menu.text).unwrap_or(in_bag);
                let want = match option {
                    0 => 1,
                    1 => 5,
                    _ => held / npc::ICE_PER_BOTTLE,
                };
                let need = want.max(1) * npc::ICE_PER_BOTTLE;
                let bottles = bag.iter().any(|i| i.item_id == npc::BOTTLE_ID);
                let why = if held < need {
                    Some(format!("cần {need} Băng Tâm, có {held}"))
                } else if !bottles && free < 1 {
                    Some("túi không còn ô trống cho bình".to_string())
                } else {
                    None
                };
                if let Some(why) = why {
                    return self.smith_finish(why, now, out);
                }
                if let Some(r) = self.snap.smith.as_mut() {
                    r.doing = format!(
                        "Đổi {} Băng Tâm lấy {want} bình",
                        want * npc::ICE_PER_BOTTLE
                    );
                }
                let sm = self.smith.as_mut().unwrap();
                (sm.stage, sm.until) = (Stage::IceDone, now + SMITH_WAIT);
                send57(out, option, npc::SMITH);
            }
            SmithTask::Points { rules } => {
                let points = npc::points_text(&menu.text);
                let line = match (points.points, points.need) {
                    (Some(p), Some(n)) => format!("{p}/{n} điểm"),
                    _ => menu.text.replace('\n', "; "),
                };
                let limit = match (points.xu, points.xu_khoa) {
                    (Some(xu), Some(k)) => {
                        format!("; đổi được {} Xu (cần {} Xu khóa)", grouped(xu), grouped(k))
                    }
                    _ => String::new(),
                };
                self.snap.points = Some(PointsRead {
                    points,
                    text: menu.text.clone(),
                    rules: None,
                    read_at: epoch_ms(),
                });
                if let Some(r) = self.snap.smith.as_mut() {
                    r.doing = format!("Điểm năng động: {line}{limit}");
                }
                if rules {
                    let sm = self.smith.as_mut().unwrap();
                    (sm.stage, sm.until) = (Stage::Rules, now + SMITH_WAIT);
                    return send57(out, npc::POINTS_RULES, npc::ELDER);
                }
                self.smith_finish(format!("{line}{limit}"), now, out);
            }
            SmithTask::Daily { action } => self.daily_read(action, menu, now, out),
            _ => self.smith_finish("menu không như kế hoạch", now, out),
        }
    }

    /// Hương Lão's menu of daily quests (smith_read): how many were taken today, then the line of the action once the menu
    /// and the quest held allow it, as npm run daily checks them (src/bot/daily.ts): Nhận only on line 0 "Nhận nhiệm vụ"
    /// with fewer than 3 taken; Hủy only on line 0 "Hủy nhiệm vụ hiện tại", never for a quest done; Hoàn thành on its
    /// line, the quest held done.
    fn daily_read(
        &mut self,
        action: DailyAction,
        menu: &NpcMenu,
        now: Instant,
        out: &mut Vec<Out>,
    ) {
        let taken = mail::daily_taken(&menu.text);
        let d = &mut self.snap.daily;
        if let Some((t, m)) = taken {
            (d.taken, d.max, d.read_at) = (Some(t), Some(m), Some(epoch_ms()));
        }
        let held = d.quest.clone();
        let label = |o: u8| {
            (menu.options.iter())
                .find(|(n, _)| *n == o)
                .map(|(_, l)| l.as_str())
        };
        let line0 = label(0).unwrap_or("không có");
        let complete = (menu.options.iter())
            .find(|(_, l)| mail::is_daily_complete(l))
            .map(|(o, _)| *o);
        let pick = match action {
            DailyAction::Show => {
                let what = held
                    .as_ref()
                    .map_or("không giữ nhiệm vụ nào".into(), daily_what);
                let today =
                    taken.map_or(String::new(), |(t, m)| format!("; hôm nay đã nhận {t}/{m}"));
                return self.smith_finish(format!("{what}{today}"), now, out);
            }
            DailyAction::Accept => match taken {
                _ if complete.is_some() => Err(
                    "menu có dòng Hoàn thành nhiệm vụ: hoàn thành nhiệm vụ đang giữ trước".into(),
                ),
                _ if !mail::is_daily_accept(line0) => Err(format!(
                    "dòng 0 là \"{line0}\"{}",
                    held.as_ref()
                        .map_or(String::new(), |q| format!(" (đang giữ {})", q.name))
                )),
                Some((t, m)) if t >= m => Err(format!("hôm nay đã nhận {t}/{m} nhiệm vụ")),
                _ => Ok(0),
            },
            DailyAction::Cancel => match complete {
                Some(_) => Err("nhiệm vụ đã xong: Hoàn thành để nhận thưởng thay vì hủy".into()),
                None if !mail::is_daily_cancel(line0) => {
                    Err(format!("dòng 0 là \"{line0}\" (không giữ nhiệm vụ nào)"))
                }
                None => Ok(0),
            },
            DailyAction::Complete => match (complete, held.as_ref()) {
                (None, _) => {
                    let lines: Vec<String> = (menu.options.iter())
                        .map(|(o, l)| format!("{o} {l}"))
                        .collect();
                    Err(format!(
                        "menu không có dòng Hoàn thành nhiệm vụ ({})",
                        match lines.is_empty() {
                            true => "không có dòng nào".into(),
                            false => lines.join(", "),
                        }
                    ))
                }
                (_, None) => Err("không giữ nhiệm vụ ngày nào".into()),
                (_, Some(q)) if !q.finished() => Err(format!(
                    "{} mới {}/{}: chưa xong",
                    q.name, q.progress, q.target
                )),
                (Some(o), Some(_)) => Ok(o),
            },
        };
        let option = match pick {
            Ok(o) => o,
            Err(why) => return self.smith_finish(why, now, out),
        };
        if let Some(r) = self.snap.smith.as_mut() {
            r.doing = format!("Chọn \"{}\" ở Hương Lão", label(option).unwrap_or("?"));
        }
        let sm = self.smith.as_mut().unwrap();
        sm.daily = held;
        (sm.stage, sm.until) = (Stage::Daily, now + SMITH_WAIT);
        Self::send(
            out,
            57,
            Ctx {
                option: Some(option as i32),
                map_id: Some(npc::NPC_MAP),
                npc_id: Some(npc::ELDER),
                ..Ctx::default()
            },
        );
    }

    /// s2c/1195 while SmithTask::Daily waits for its line (Stage::Daily): Nhận brings the new quest, Hủy none, Hoàn thành
    /// kind 2 with the rewards. Another kind (a progress) is not the answer.
    pub(super) fn smith_daily(&mut self, d: &mail::Daily, now: Instant, out: &mut Vec<Out>) {
        let Some(sm) = self.smith.as_ref().filter(|s| s.stage == Stage::Daily) else {
            return;
        };
        let SmithTask::Daily { action } = sm.task else {
            return;
        };
        let was = sm.daily.clone();
        let line = match (action, d) {
            (DailyAction::Accept, mail::Daily::Quest(q)) => {
                let s = &mut self.snap.daily;
                s.taken = s.taken.map(|t| t + 1);
                let today = (s.taken.zip(s.max))
                    .map_or(String::new(), |(t, m)| format!("; hôm nay đã nhận {t}/{m}"));
                format!("đã nhận {}{today}", daily_what(q))
            }
            (DailyAction::Cancel, mail::Daily::None) => format!(
                "đã hủy {} (vẫn tính một lượt trong ngày)",
                was.map_or("nhiệm vụ".into(), |q| q.name)
            ),
            (DailyAction::Complete, mail::Daily::Done { name, rewards }) => {
                match rewards.is_empty() {
                    true => format!("xong {name}"),
                    false => format!("xong {name}, nhận {}", rewards.join(", ")),
                }
            }
            _ => return,
        };
        self.smith_finish(line, now, out);
    }

    /// Cách tính điểm (s2c/0) of Điểm năng động: kept with the points; the task ends.
    pub(super) fn smith_rules(&mut self, text: &str, now: Instant, out: &mut Vec<Out>) {
        if let Some(p) = self.snap.points.as_mut() {
            p.rules = Some(text.to_string());
        }
        let line = self
            .snap
            .smith
            .as_ref()
            .map_or(String::new(), |r| r.doing.clone());
        let line = line
            .strip_prefix("Điểm năng động: ")
            .unwrap_or(&line)
            .to_string();
        self.smith_finish(format!("{line}; đã đọc Cách tính điểm"), now, out);
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
        // Đổi Băng Tâm: "Đã đổi 8 Băng Tâm lấy 1 Bình Huyết Linh (Rỗng)", then the NPC again and the bag (smith_menu).
        if sm.stage == Stage::IceDone && text.starts_with("Đã đổi") {
            if let Some(r) = self.snap.smith.as_mut() {
                (r.steps, r.ok, r.doing) = (r.steps + 1, r.ok + 1, text.to_string());
            }
            out.push(Out::Log(LogKind::Item, text.to_string()));
            let sm = self.smith.as_mut().unwrap();
            sm.ending = None;
            self.smith_reset(now, out);
            return true;
        }
        // Nhiệm vụ hàng ngày: the notice of Nhận comes before its s2c/1195 (G1), which ends the task (smith_daily); that of
        // Hủy after it, while Hương Lão is talked to again.
        if sm.stage == Stage::Daily
            && matches!(
                sm.task,
                SmithTask::Daily {
                    action: DailyAction::Accept
                }
            )
            && mail::is_daily_accepted(text)
        {
            return true;
        }
        // Talking to the NPC again: the task ends on the menu, whatever is said meanwhile.
        if sm.stage == Stage::Reset {
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
        let silent = format!("{who} không trả lời sau {} s", SMITH_WAIT.as_secs());
        if sm.stage == Stage::Reset {
            let why = match sm.ending.clone() {
                Some(why) => format!("{why} ({silent} khi nói lại)"),
                None => silent,
            };
            return self.smith_end(why, out);
        }
        self.smith_finish(silent, now, out);
    }

    /// Dừng: the task ends now, or once the press waiting for its result is in.
    pub(super) fn smith_stop(&mut self, now: Instant, out: &mut Vec<Out>) {
        match self.smith.as_mut() {
            Some(sm)
                if matches!(
                    sm.stage,
                    Stage::Start | Stage::Exchange | Stage::Unequip | Stage::IceDone | Stage::Daily
                ) =>
            {
                sm.stopping = true
            }
            // Worn again already, or talking to the NPC again: the task ends on the answer.
            Some(sm) if matches!(sm.stage, Stage::Rewear | Stage::Reset) => {}
            Some(_) => self.smith_finish(self.stopped(), now, out),
            None => {}
        }
    }

    /// Why a task stopped by Dừng ends: "Đã dừng", with the items Chế tạo made before it.
    fn stopped(&self) -> String {
        match self.craft_made() {
            Some(made) => format!("Đã dừng; {made}"),
            None => "Đã dừng".into(),
        }
    }

    /// Chế tạo trang bị: "đã chế tạo Nhẫn Thái Cực (ô túi 13), …", the items of the bag that were not in it when Bắt đầu
    /// was first pressed. None for another task, before a press, or with no new item.
    fn craft_made(&self) -> Option<String> {
        let sm = (self.smith.as_ref())
            .filter(|s| matches!(s.task, SmithTask::Craft { .. }) && !s.before.is_empty())?;
        let made: Vec<String> = (self.snap.bag.iter())
            .flat_map(|b| &b.items)
            .filter(|i| !sm.before.contains(&i.uuid))
            .map(|i| format!("{} (ô túi {})", item_name(i.item_id), i.slot as u32 + 1))
            .collect();
        (!made.is_empty()).then(|| format!("đã chế tạo {}", made.join(", ")))
    }
}

/// " (khoá)", " (chưa khoá)" or nothing, after "Đá cấp 3".
fn lock_words(locked: Option<bool>) -> &'static str {
    match locked {
        Some(true) => " (khoá)",
        Some(false) => " (chưa khoá)",
        None => "",
    }
}

/// The title of Gộp đá: "Gộp đá tới Đá cấp 6", or for a row of the stones' table "Gộp 4 Đá cấp 3 (khoá) thành 1 Đá cấp 4".
fn merge_title(o: &MergeOptions) -> String {
    let lock = lock_words(o.locked);
    match (o.level, o.sets) {
        (Some(l), Some(n)) => format!("Gộp {} Đá cấp {l}{lock} thành {n} Đá cấp {}", 4 * n, l + 1),
        (Some(l), None) => format!("Gộp hết Đá cấp {l}{lock} lên Đá cấp {}", l + 1),
        (None, Some(n)) => format!("Gộp đá tới Đá cấp {}, tối đa {n} lần", o.up_to.min(12)),
        (None, None) => format!("Gộp đá tới Đá cấp {}", o.up_to.min(12)),
    }
}

/// "I", "II", … "VI" for the tiers of Chế tạo trang bị.
fn roman(tier: i32) -> &'static str {
    ["?", "I", "II", "III", "IV", "V", "VI"]
        .get(tier.clamp(0, 6) as usize)
        .copied()
        .unwrap_or("?")
}
