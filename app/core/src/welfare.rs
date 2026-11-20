//! Phúc lợi: Điểm danh tháng, Quà thăng cấp, Quà online (PL1, 20/11/2026, game 1.1.0;
//! docs/app/events/18-players-checkin.md) ← src/protocol/welfare.ts.
//! Every event has a key (CHECKIN_MONTHLY, LEVEL_UP, ONLINE_DAILY, …), a number (64, 65, 21) and milestones. c2s/1236
//! asks an event's definition, c2s/1239 its progress (both: string key). Điểm danh is c2s/1232 (i64 event; i64
//! milestone, 0 for the gift of the day); the other two take every milestone reached at once with c2s/1233 (i64 event).
//! Gifts go straight into the bag and the purse, never by mail. All of it works from anywhere once in the world.
use crate::items::{item_layouts, item_record, ItemRecord};
use crate::protocol::{Reader, Result};
use serde::Serialize;

pub const CHECKIN: &str = "CHECKIN_MONTHLY";
pub const LEVEL_UP: &str = "LEVEL_UP";
pub const ONLINE_DAILY: &str = "ONLINE_DAILY";
/// The events the bot takes the gifts of, in the order it reads them.
pub const WELFARE_KEYS: [&str; 3] = [CHECKIN, ONLINE_DAILY, LEVEL_UP];

/// A milestone's state in s2c/1239: not reached, reached and not taken, taken.
pub const LOCKED: u8 = 0;
pub const READY: u8 = 1;
pub const TAKEN: u8 = 2;

/// s2c/1279: one bit per tab of Phúc lợi with a gift to take (the red dot), in the order of the tabs: Online 0, Tri ân 1,
/// Mua chung 2, Điểm danh 3, Giftcode 4, Nạp đầu 5. akaito logged in with 9 (Online and Điểm danh), had 1 after Điểm
/// danh and 0 after the gifts of Online.
pub const TAB_ONLINE: u32 = 0;
pub const TAB_CHECKIN: u32 = 3;
pub fn welfare_dots(p: &[u8]) -> Result<i32> {
    let mut r = Reader::new(p);
    let mask = r.i32()?;
    r.finish(mask, "s2c/1279")
}
pub fn has_dot(mask: i32, tab: u32) -> bool {
    (mask >> tab) & 1 == 1
}

/// One milestone of an event's definition: its id, what it needs (days, level, minutes) and its gifts.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Milestone {
    pub id: i64,
    pub need: i32,
    pub gifts: Vec<ItemRecord>,
}
/// A gift of the day of CHECKIN_MONTHLY: an item record, then two more bytes (0 in PL1, maybe a weight for the draw).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DailyGift {
    #[serde(flatten)]
    pub item: ItemRecord,
    pub weight: i16,
}
/// s2c/1236: an event's definition. `u8 ok; i64 ?; i64 event; string key; string title; i32 n; n × {i64 id; i32 need;
/// i32 k; k × item}`; CHECKIN_MONTHLY then has `i32 n; n × {item; i16 ?}` (`daily`, one of them at random, its index in
/// s2c/1232). Other events carry more after the milestones: kept unread in `rest`.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct EventDefinition {
    pub ok: bool,
    pub stamp: i64,
    pub event: i64,
    pub key: String,
    pub title: String,
    pub milestones: Vec<Milestone>,
    pub daily: Vec<DailyGift>,
    #[serde(skip)]
    pub rest: Option<Vec<u8>>,
}
fn known(key: &str) -> bool {
    WELFARE_KEYS.contains(&key)
}
fn gifts(r: &mut Reader) -> Result<Vec<ItemRecord>> {
    let n = r.i32()?.max(0);
    (0..n).map(|_| item_record(r)).collect()
}
pub fn event_definition(p: &[u8]) -> Result<EventDefinition> {
    item_layouts(|| {
        let mut r = Reader::new(p);
        let (ok, stamp, event) = (r.u8()? == 1, r.i64()?, r.i64()?);
        let (key, title) = (r.string()?, r.string()?);
        let n = r.i32()?.max(0);
        let mut milestones = vec![];
        for _ in 0..n {
            let (id, need) = (r.i64()?, r.i32()?);
            milestones.push(Milestone {
                id,
                need,
                gifts: gifts(&mut r)?,
            });
        }
        let mut daily = vec![];
        if key == CHECKIN {
            for _ in 0..r.i32()?.max(0) {
                let item = item_record(&mut r)?;
                let b = r.take(2)?;
                let weight = i16::from_be_bytes([b[0], b[1]]);
                daily.push(DailyGift { item, weight });
            }
        }
        let mut d = EventDefinition {
            ok,
            stamp,
            event,
            key,
            title,
            milestones,
            daily,
            rest: None,
        };
        if known(&d.key) {
            return r.finish(d, "s2c/1236");
        }
        d.rest = Some(r.take(r.remaining())?.to_vec());
        Ok(d)
    })
}

/// A milestone's state in s2c/1239 (LOCKED, READY, TAKEN).
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
pub struct MilestoneState {
    pub id: i64,
    pub state: u8,
}
/// The tail of CHECKIN_MONTHLY's progress: today checked, the day and the days of the month, the days checked (bit
/// day−1), the next reset (ms since 1970).
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckinDay {
    pub checked_today: bool,
    pub day: u8,
    pub days_in_month: u8,
    pub days_mask: u32,
    pub reset_ms: i64,
}
impl CheckinDay {
    /// The days of the month checked.
    pub fn days(&self) -> Vec<u32> {
        (1..=31)
            .filter(|d| self.days_mask >> (d - 1) & 1 == 1)
            .collect()
    }
}
/// s2c/1239: an event's progress. `u8 ok; i64 ?; i64 event; string key; string period ("2026-11", "2026-11-20", "-" for
/// LEVEL_UP); i32 progress (days checked, minutes online, level); i64 0; i32 n; n × {i64 id; u8 state}`;
/// CHECKIN_MONTHLY then has `u8 checked today; u8 day; u8 days of the month; i32 days checked; i64 next reset (ms)`
/// (`checkin`). Other events: the rest unread.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct EventProgress {
    pub ok: bool,
    pub stamp: i64,
    pub event: i64,
    pub key: String,
    pub period: String,
    pub progress: i32,
    pub field: i64,
    pub milestones: Vec<MilestoneState>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checkin: Option<CheckinDay>,
    #[serde(skip)]
    pub rest: Option<Vec<u8>>,
}
impl EventProgress {
    /// Milestones reached and not taken.
    pub fn ready(&self) -> Vec<i64> {
        self.milestones
            .iter()
            .filter(|m| m.state == READY)
            .map(|m| m.id)
            .collect()
    }
}
pub fn event_progress(p: &[u8]) -> Result<EventProgress> {
    let mut r = Reader::new(p);
    let (ok, stamp, event) = (r.u8()? == 1, r.i64()?, r.i64()?);
    let (key, period) = (r.string()?, r.string()?);
    let (progress, field) = (r.i32()?, r.i64()?);
    let n = r.i32()?.max(0);
    let mut milestones = vec![];
    for _ in 0..n {
        milestones.push(MilestoneState {
            id: r.i64()?,
            state: r.u8()?,
        });
    }
    let checkin = match key == CHECKIN {
        true => Some(CheckinDay {
            checked_today: r.u8()? == 1,
            day: r.u8()?,
            days_in_month: r.u8()?,
            days_mask: r.i32()? as u32,
            reset_ms: r.i64()?,
        }),
        false => None,
    };
    let mut p = EventProgress {
        ok,
        stamp,
        event,
        key,
        period,
        progress,
        field,
        milestones,
        checkin,
        rest: None,
    };
    if known(&p.key) {
        return r.finish(p, "s2c/1239");
    }
    p.rest = Some(r.take(r.remaining())?.to_vec());
    Ok(p)
}

/// s2c/1232, the answer to c2s/1232: `i64 event; i64 milestone; u8 ok; string text; u8 ?; u8 index of the gift of the
/// day; i32 ?` ("Điểm danh ngày 20: nhận 1 Đá cấp 6", index 6; refused: "Hôm nay bạn đã điểm danh", 0xff 0xff).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CheckinResult {
    pub event: i64,
    pub milestone: i64,
    pub ok: bool,
    pub text: String,
    pub field: u8,
    pub index: u8,
    pub tail: i32,
}
pub fn checkin_result(p: &[u8]) -> Result<CheckinResult> {
    let mut r = Reader::new(p);
    let (event, milestone, ok, text) = (r.i64()?, r.i64()?, r.u8()? == 1, r.string()?);
    let (field, index, tail) = (r.u8()?, r.u8()?, r.i32()?);
    r.finish(
        CheckinResult {
            event,
            milestone,
            ok,
            text,
            field,
            index,
            tail,
        },
        "s2c/1232",
    )
}

/// The notice after c2s/1233: "Đã nhận 5 phần thưởng" → 5.
pub fn claimed_gifts(text: &str) -> Option<u32> {
    let rest = text.strip_prefix("Đã nhận ")?;
    let n = rest.strip_suffix(" phần thưởng")?;
    n.parse().ok()
}
/// The notice of c2s/1233 when nothing is due (PL1).
pub fn is_nothing_due(text: &str) -> bool {
    text.starts_with("Không có phần thưởng nào để nhận")
}
/// The notice after a c2s/1232 refused because today is checked already (PL1).
pub fn is_checked_already(text: &str) -> bool {
    text.starts_with("Hôm nay bạn đã điểm danh")
}
