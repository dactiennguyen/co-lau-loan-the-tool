//! Tự gộp đá khi túi đầy (FightSettings::auto_merge): before the next battle of a fight job, a full bag sends the bot to
//! Pháp sư in Làng Thanh Khê (M1) to merge its locked stones (Gộp đá, SmithTask::Merge), then back to the map and zone
//! it left, where the job goes on (features.md#tự-gộp-đá-khi-túi-đầy). Each stone takes a slot, so each set of four
//! made into one frees three (16-upgrade.md#luyện-đá).
use super::smith::grouped;
use super::*;
use crate::npc::{merge_forecast_paid, merge_plan, MergeForecast, MergeOptions};

/// A trip of Tự gộp đá khi túi đầy: the map and zone the job was in, and how far the trip got.
#[derive(Debug, Clone)]
pub(super) struct MergeTrip {
    map_id: String,
    name: String,
    zone: i32,
    stage: MergeStage,
    /// The locked stones in the bag when it set off: each set merged leaves three fewer.
    stones: usize,
    /// Tries of the zone back after the first (ZONE_AGAIN).
    zone_tries: u8,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum MergeStage {
    /// On the way to M1.
    Going,
    /// Gộp đá under way at Pháp sư.
    Merging,
    /// On the way back to the job's map and zone.
    Returning,
}

/// The zone of the job full or silent when the trip came back: tried once more this much later, then the job fights on
/// in the zone it is in.
const ZONE_AGAIN: Duration = Duration::from_secs(10);

impl Bot {
    /// Gộp đá as Tự gộp đá khi túi đầy runs it: locked stones only (unlocked ones, bought with Lượng, stay tradeable), up
    /// to Gộp tới, paid with Xu khóa alone.
    fn merge_options(&self) -> MergeOptions {
        MergeOptions {
            up_to: self.fight.merge_level(),
            unlocked: false,
            xu_khoa_only: true,
            ..MergeOptions::default()
        }
    }

    fn locked_stones(&self) -> usize {
        (self.bag_items().iter())
            .filter(|i| i.locked() && npc::stone_level(i.item_id) > 0)
            .count()
    }

    /// Before the next battle of a fight job (Bot::next): with Tự gộp đá khi túi đầy on and no slot left in the bag, sets
    /// off to Pháp sư when merge_ready says it may; otherwise the job fights on, the reason said once until it changes.
    /// True while a trip is under way: the battle waits.
    pub(super) fn auto_merge(&mut self, now: Instant, out: &mut Vec<Out>) -> bool {
        if self.merge_trip.is_some() {
            return true;
        }
        if !self.fight.auto_merge {
            return false;
        }
        let Some((held, room)) =
            (self.snap.bag.as_ref()).map(|b| (b.items.len() as i32, b.capacity))
        else {
            return false;
        };
        if held < room {
            self.merge_said = None;
            return false;
        }
        let plan = match self.merge_ready(now) {
            Ok(plan) => plan,
            Err((key, why)) => {
                if self.merge_said != Some(key) {
                    out.push(Out::Log(
                        LogKind::Item,
                        format!("Túi đầy ({held}/{room}) nhưng chưa sang gộp đá: {why}; đánh tiếp"),
                    ));
                    self.merge_said = Some(key);
                }
                return false;
            }
        };
        self.merge_said = None;
        out.push(Out::Log(
            LogKind::Item,
            format!(
                "Túi đầy ({held}/{room}): sang Làng Thanh Khê gộp đá tới {}, dự kiến {} lần, tốn {} Xu khóa, túi trống thêm {} ô",
                self.fight.merge_level_text(),
                plan.merges,
                grouped(plan.xu_khoa),
                plan.freed
            ),
        ));
        self.merge_trip = Some(MergeTrip {
            map_id: self.snap.map_id.clone(),
            name: self.snap.map_name.clone(),
            zone: self.snap.zone,
            stage: MergeStage::Going,
            stones: self.locked_stones(),
            zone_tries: 0,
        });
        if self.snap.map_id != npc::NPC_MAP && !self.travel_to(npc::NPC_MAP, true, now, out) {
            // travel_to said why (no known way, a level too low): not tried again before merge_every.
            (self.merge_trip, self.merge_back_at) = (None, Some(now));
            out.push(Out::Log(
                LogKind::Item,
                "Thôi gộp đá: không đi được tới Làng Thanh Khê; đánh tiếp".into(),
            ));
            return false;
        }
        self.merge_step(now, out);
        true
    }

    /// What a trip would merge (merge_forecast_paid), or why there is none now, keyed to be said once: merge_every
    /// minutes not yet gone by since the last trip came back (merged or not, so a trip that fails does not set off again
    /// before every battle), no known way back from M1, no set of four locked stones, none the Xu khóa pays for, or
    /// something Pháp sư would refuse Gộp đá for still waiting for its answer (a purchase, an item action, a repair).
    fn merge_ready(&self, now: Instant) -> Result<MergeForecast, (&'static str, String)> {
        let minutes = self.fight.merge_minutes();
        let every = Duration::from_secs(minutes as u64 * 60);
        if let Some(back) = self.merge_back_at.filter(|&t| now < t + every) {
            let left = (back + every - now).as_millis().div_ceil(60_000);
            return Err((
                "wait",
                format!("vừa sang gộp đá lần trước, còn {left} phút nữa mới sang lại (cách nhau ít nhất {minutes} phút)"),
            ));
        }
        let ways = (self.atlas).hops(npc::NPC_MAP, self.snap.level, &HashSet::new());
        if self.snap.map_id != npc::NPC_MAP && !ways.contains_key(&self.snap.map_id) {
            return Err((
                "way",
                format!(
                    "chưa biết đường từ Làng Thanh Khê quay về {}",
                    self.snap.map_name
                ),
            ));
        }
        let (o, bag, xu_khoa) = (self.merge_options(), self.bag_items(), self.money().1);
        let plan = merge_forecast_paid(&bag, o, xu_khoa);
        if plan.merges > 0 {
            // smith_begin would refuse Gộp đá at Pháp sư for these, after the whole way there and back; a pickup's
            // answer is waited for at M1 instead (merge_step).
            if self.notice_awaited_but_pickup(now) {
                return Err((
                    "answer",
                    "đang đợi server trả lời việc khác (mua, dùng hay sửa đồ)".into(),
                ));
            }
            return Ok(plan);
        }
        Err(match merge_plan(&bag, o).first() {
            None => (
                "none",
                format!(
                    "không có 4 viên đá khoá cùng cấp nào dưới Đá cấp {} để gộp",
                    o.up_to
                ),
            ),
            Some(set) => (
                "money",
                format!(
                    "không đủ Xu khóa để gộp (bộ rẻ nhất cần {}, có {})",
                    grouped(set.fee),
                    grouped(xu_khoa)
                ),
            ),
        })
    }

    /// The trip of Tự gộp đá khi túi đầy, after every packet and timer, once nothing waits (a portal, a zone change, a
    /// battle, Gộp đá): at M1, Gộp đá; then back to the job's map and zone; there, the job's next battle after its rest.
    /// Not at M1 when the way there ended (a portal refused or silent), or Tự gộp đá turned off on the way: back without
    /// merging. Not back on the job's map: the job ends. Let go when the job ends (Dừng, Bot::finish).
    pub(super) fn merge_step(&mut self, now: Instant, out: &mut Vec<Out>) {
        if self.merge_trip.is_none() {
            return;
        }
        if !self.job_running() {
            self.merge_trip = None;
            return;
        }
        if self.trip.is_some()
            || self.travelling.is_some()
            || self.zoning.is_some()
            || self.battle.is_some()
            || self.smith.is_some()
        {
            return;
        }
        let Some(trip) = self.merge_trip.clone() else {
            return;
        };
        match trip.stage {
            MergeStage::Going if self.snap.map_id == npc::NPC_MAP => {
                if !self.fight.auto_merge {
                    out.push(Out::Log(
                        LogKind::Item,
                        format!(
                            "Đã tắt tự gộp đá khi túi đầy: không gộp, quay về {} khu {}",
                            trip.name, trip.zone
                        ),
                    ));
                    return self.merge_return(now, out);
                }
                // A pickup still waiting for its answer, as after a win on M1: smith_begin would refuse (the answers
                // are both s2c/1256), so Gộp đá once it is in.
                if let Some(t) = (self.picked_at.map(|t| t + PICK_ANSWER)).filter(|&t| now < t) {
                    self.timer = Some((t, Wake::Next));
                    return;
                }
                self.set_merge_stage(MergeStage::Merging);
                // Refused (said by smith_begin): back without merging.
                if !self.smith_begin(SmithTask::Merge(self.merge_options()), true, now, out) {
                    return self.merge_return(now, out);
                }
                // Over at once (nothing left to merge by then): back now, no packet to wait for.
                if self.smith.is_none() {
                    self.merge_step(now, out);
                }
            }
            MergeStage::Going => {
                out.push(Out::Log(
                    LogKind::Item,
                    format!(
                        "Không tới được Làng Thanh Khê: thôi gộp đá, quay về {} khu {}",
                        trip.name, trip.zone
                    ),
                ));
                self.merge_return(now, out);
            }
            MergeStage::Merging => self.merge_return(now, out),
            MergeStage::Returning => self.merge_back(trip, now, out),
        }
    }

    /// The trip back on the job's map: the zone once more ZONE_AGAIN later if the zone change failed (full, silent),
    /// then the job's next battle, in the zone it is in; the job ends when the way back did not get to the map.
    fn merge_back(&mut self, trip: MergeTrip, now: Instant, out: &mut Vec<Out>) {
        if self.snap.map_id != trip.map_id {
            (self.merge_trip, self.merge_back_at) = (None, Some(now));
            let why = format!("Không quay về được {} sau khi gộp đá", trip.name);
            return self.finish(&why, out);
        }
        if self.snap.zone != trip.zone {
            let tries = |bot: &mut Bot, n| {
                if let Some(t) = bot.merge_trip.as_mut() {
                    t.zone_tries = n;
                }
            };
            match trip.zone_tries {
                0 => {
                    tries(self, 1);
                    out.push(Out::Log(
                        LogKind::Travel,
                        format!(
                            "Chưa về lại được khu {}: thử lại sau {} s",
                            trip.zone,
                            ZONE_AGAIN.as_secs()
                        ),
                    ));
                    self.timer = Some((now + ZONE_AGAIN, Wake::Next));
                    return;
                }
                // Packets come meanwhile: the try waits for its timer.
                1 if self.timer.is_some() => return,
                1 => {
                    tries(self, 2);
                    if self.zone_to(trip.zone, true, now, out) {
                        return;
                    }
                }
                _ => {}
            }
        }
        (self.merge_trip, self.merge_back_at) = (None, Some(now));
        let sets = trip.stones.saturating_sub(self.locked_stones()) / 3;
        let free =
            (self.snap.bag.as_ref()).map_or(0, |b| (b.capacity - b.items.len() as i32).max(0));
        let place = match self.snap.zone {
            z if z == trip.zone => format!("{} khu {z}", trip.name),
            z => format!(
                "{} khu {z} (không vào lại được khu {})",
                trip.name, trip.zone
            ),
        };
        let line = match sets {
            0 => {
                format!("Đã về {place}, chưa gộp được bộ đá nào: túi còn {free} ô trống, đánh tiếp")
            }
            n => {
                format!("Đã về {place} sau khi gộp đá ({n} lần): túi còn {free} ô trống, đánh tiếp")
            }
        };
        out.push(Out::Log(LogKind::Item, line));
        self.timer = Some((now + self.options.rest, Wake::Next));
    }

    fn set_merge_stage(&mut self, stage: MergeStage) {
        if let Some(t) = self.merge_trip.as_mut() {
            t.stage = stage;
        }
    }

    /// Back to the map and zone of the job: through the portals, then the zone (zone_after); only the zone when on the
    /// map already; nothing when there. A zone change refused or silent is for merge_back to try again.
    fn merge_return(&mut self, now: Instant, out: &mut Vec<Out>) {
        let Some((map_id, zone)) = (self.merge_trip.as_ref()).map(|t| (t.map_id.clone(), t.zone))
        else {
            return;
        };
        self.set_merge_stage(MergeStage::Returning);
        if self.snap.map_id != map_id {
            if self.travel_to(&map_id, true, now, out) && self.trip.is_some() {
                self.zone_after = Some(zone);
            }
        } else if self.snap.zone != zone {
            self.zone_to(zone, true, now, out);
        }
        self.merge_step(now, out);
    }
}
