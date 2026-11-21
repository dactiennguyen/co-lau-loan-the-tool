//! Bạch Hổ (17-bach-ho.md) for the Bạch Hổ window of the app: from the time the user chose until the end time, the
//! character goes to Hang Bạch Hổ and keeps trying to get into a battle with the boss; once in, it fights, then tries
//! again. Not measured live yet: the challenge is taken to be that of the other bosses (c2s/1178 with the mob id of
//! s2c/43 or s2c/1177, fight.rs), and the boss the one whose name has "Bạch Hổ", else the first boss or mob of the cave.
//!
//! The way there needs no atlas: Bản đồ thế giới (c2s/11 "M99", s2c/11 of flag 0) then c2s/13 ("M99", 14) lands on
//! Cổng Luyện Ngục (M15), whose portal 1006 leads to Hang Bạch Hổ (M24) (19-luyen-nguc.md; LN1). The same jump through
//! Bản đồ thế giới (map Mn is its line n − 1) takes the character back where it was (go_back).
use super::*;

/// Hang Bạch Hổ, Cổng Luyện Ngục, and the portal between them.
const CAVE: &str = "M24";
const GATE: &str = "M15";
const GATE_PORTAL: i32 = 1006;
/// Between two tries when the boss is not there or did not open a battle.
const RETRY: Duration = Duration::from_secs(5);
/// Between a battle and the next try.
const AFTER_BATTLE: Duration = Duration::from_millis(1500);
/// The longest the run sleeps before the start time: it wakes now and then to say how long is left.
const WAIT_STEP: Duration = Duration::from_secs(30);

/// The run under way (its figures are snap.bach_ho).
pub(super) struct State;

/// A jump through Bản đồ thế giới under way: the line of the map, its name, how far it got.
pub(super) struct Warp {
    line: i32,
    to: String,
    stage: WarpStage,
    /// Quay về chỗ cũ: the zone to change to once on the map.
    zone_after: Option<i32>,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WarpStage {
    /// c2s/11 "M99" sent, its s2c/11 awaited.
    Opening,
    /// c2s/13 ("M99", line) sent, its s2c/13 awaited.
    Jumping,
    /// The new map asked (c2s/11, then c2s/43), its mobs awaited.
    Loading,
}

/// The line of map `map_id` on Bản đồ thế giới: M1 is 0, M15 is 14 (LN1), M25 is 24.
fn world_line(map_id: &str) -> Option<i32> {
    map_id
        .strip_prefix('M')?
        .parse::<i32>()
        .ok()
        .filter(|&n| (1..99).contains(&n))
        .map(|n| n - 1)
}

/// "21:00" of a time in ms since 1970, Vietnam time.
fn clock(ms: u64) -> String {
    let m = (ms / 60_000 + 7 * 60) % (24 * 60);
    format!("{:02}:{:02}", m / 60, m % 60)
}

/// s2c/1275 ← sqtm.a of game 1.1.0 (17-bach-ho.md#đọc-tĩnh-110): u8 state; i64 run; i32 HP, most HP; i32 killer id;
/// string killer; u8 its tier; i32 its damage; u8 n tiers × {u8 tier; i16 levels from, to; i32 threshold; i32
/// players; u8 m rows × {u8 rank; i32 id; string name; i16 level; i32 damage}}; u8 own tier; i32 rank; i32 damage; u8
/// threshold reached.
pub fn bach_ho_result(p: &[u8]) -> crate::protocol::Result<BachHoResult> {
    let mut r = crate::protocol::Reader::new(p);
    let i16 = |r: &mut crate::protocol::Reader| r.u16().map(|v| v as i16);
    let (state, session_at, hp, max_hp) = (r.u8()?, r.i64()?, r.i32()?, r.i32()?);
    let (killer_id, killer, killer_tier, killer_damage) =
        (r.i32()?, r.string()?, r.u8()?, r.i32()?);
    let mut tiers = vec![];
    for _ in 0..r.u8()? {
        let tier = BachHoTier {
            tier: r.u8()?,
            min_level: i16(&mut r)?,
            max_level: i16(&mut r)?,
            threshold: r.i32()?,
            players: r.i32()?,
        };
        // The ranking rows (rank, id, name, level, damage): read, not kept.
        for _ in 0..r.u8()? {
            r.u8()?;
            r.i32()?;
            r.string()?;
            i16(&mut r)?;
            r.i32()?;
        }
        tiers.push(tier);
    }
    let (own_tier, own_rank, own_damage, reached) = (r.u8()?, r.i32()?, r.i32()?, r.u8()? != 0);
    r.finish(
        BachHoResult {
            state,
            session_at,
            hp,
            max_hp,
            killer_id,
            killer,
            killer_tier,
            killer_damage,
            tiers,
            own_tier,
            own_rank,
            own_damage,
            reached,
        },
        "s2c/1275",
    )
}

/// "Bậc 2 (cấp 60+), hạng 4, 31.000 sát thương" as the game words it (sqtq): the levels of the tier as "cấp a–b", or
/// "cấp a+" for the last; " (chưa đạt ngưỡng 20.000)" when under the threshold. None before the character fought.
fn standing(b: &BachHoResult) -> Option<String> {
    if b.own_tier == 0 || b.own_rank <= 0 {
        return None;
    }
    let tier = b.tiers.iter().find(|t| t.tier == b.own_tier);
    let levels = tier.map_or(String::new(), |t| {
        if t.max_level >= 999 || t.max_level < t.min_level {
            format!(" (cấp {}+)", t.min_level)
        } else {
            format!(" (cấp {}–{})", t.min_level, t.max_level)
        }
    });
    let under = match tier {
        Some(t) if !b.reached => {
            format!(" (chưa đạt ngưỡng {})", smith::grouped(t.threshold as i64))
        }
        None if !b.reached => " (chưa đạt ngưỡng)".into(),
        _ => String::new(),
    };
    Some(format!(
        "Bậc {}{levels}, hạng {}, {} sát thương{under}",
        b.own_tier,
        b.own_rank,
        smith::grouped(b.own_damage as i64)
    ))
}

/// The boss's HP left in percent, as sqto.c() of the game.
fn hp_percent(b: &BachHoResult) -> i64 {
    if b.max_hp <= 0 {
        0
    } else {
        (b.hp.max(0) as i64 * 100) / b.max_hp as i64
    }
}

impl Bot {
    /// Bạch Hổ from `from_ms` until `until_ms` (ms since 1970): a fight job or quest run on is stopped, where the
    /// character stands is kept for Quay về chỗ cũ, and until the start time it waits. Refused while it is busy with
    /// something else than a job, a quest run or a battle (which it plays out first), and for an end already past.
    pub fn bach_ho(&mut self, from_ms: u64, until_ms: u64, now: Instant, out: &mut Vec<Out>) {
        let busy = self
            .busy_but(true)
            .filter(|_| self.battle.is_none())
            .map(String::from);
        let why = busy
            .or_else(|| (until_ms <= epoch_ms()).then(|| "giờ kết thúc đã qua".into()))
            .or_else(|| {
                (self.snap.level > 0 && self.snap.level < 30)
                    .then(|| format!("cấp {}, cần cấp 30", self.snap.level))
            });
        if let Some(why) = why {
            out.push(Out::Log(LogKind::Battle, format!("Chưa đi Bạch Hổ: {why}")));
            return;
        }
        let reason = "Dừng để đi Bạch Hổ";
        if self.job_running() {
            self.finish(reason, out);
        }
        if self.quest_running() {
            self.finish_quest(reason, out);
        }
        if self.snap.map_id != CAVE && self.snap.map_id != GATE && !self.snap.map_id.is_empty() {
            self.snap.back_point = Some(BackPoint {
                map_id: self.snap.map_id.clone(),
                map_name: self.snap.map_name.clone(),
                zone: self.snap.zone,
            });
        }
        self.bach_ho = Some(State);
        self.snap.bach_ho = Some(BachHoRun {
            from_ms,
            until_ms,
            doing: format!("Đợi tới {}", clock(from_ms)),
            tries: 0,
            battles: 0,
            wins: 0,
            damage: 0,
            standing: None,
            done: None,
        });
        self.bach_ho_asked = false;
        out.push(Out::Log(
            LogKind::Battle,
            format!(
                "Bạch Hổ: thử vào trận từ {} tới {}",
                clock(from_ms),
                clock(until_ms)
            ),
        ));
        self.timer = Some((now, Wake::Next));
    }

    /// Dừng of the Bạch Hổ window (also Dừng of the account): the run ends; a battle on is played out.
    pub fn bach_ho_stop(&mut self, out: &mut Vec<Out>) {
        if self.bach_ho.is_some() {
            self.bach_ho_end("Đã dừng", true, out);
        }
    }

    /// The run ends with `why`; with `ask`, Kết quả Bạch Hổ is asked once more when it fought, for where it stands.
    fn bach_ho_end(&mut self, why: &str, ask: bool, out: &mut Vec<Out>) {
        self.bach_ho = None;
        if matches!(self.timer, Some((_, Wake::Next | Wake::ChallengeTimeout))) {
            self.timer = None;
        }
        if let Some(r) = self.snap.bach_ho.as_mut() {
            let line = format!(
                "{why}: {} lần thử, {} trận ({} thắng), {} sát thương",
                r.tries,
                r.battles,
                r.wins,
                smith::grouped(r.damage)
            );
            r.doing = line.clone();
            r.done = Some(line.clone());
            out.push(Out::Log(LogKind::Battle, format!("Xong Bạch Hổ: {line}")));
            if ask && r.battles > 0 {
                self.bach_ho_ask(out);
            }
        }
    }

    /// c2s/1275 (empty): Kết quả Bạch Hổ, as "Xem tất cả bậc" of the game asks it.
    fn bach_ho_ask(&mut self, out: &mut Vec<Out>) {
        self.bach_ho_asked = true;
        Self::send(out, 1275, Ctx::default());
    }

    /// s2c/1275: where the character stands goes on the run; asked by the run (after a battle, at its end), the log says
    /// how the boss is, and a run still on ends once the boss is killed or got away: there is nothing left to fight in
    /// a day's run the character fought in. Read quietly when the run did not ask.
    pub(super) fn bach_ho_result_read(&mut self, payload: &[u8], out: &mut Vec<Out>) {
        let b = match bach_ho_result(payload) {
            Ok(b) => b,
            Err(e) => {
                out.push(Out::Log(
                    LogKind::Battle,
                    format!("Không đọc được kết quả Bạch Hổ (s2c/1275): {e}"),
                ));
                return;
            }
        };
        let place = standing(&b);
        if let (Some(r), Some(s)) = (self.snap.bach_ho.as_mut(), &place) {
            r.standing = Some(s.clone());
        }
        if !std::mem::take(&mut self.bach_ho_asked) {
            return;
        }
        let boss = match b.state {
            0 => format!("Bạch Hổ còn {}% máu", hp_percent(&b)),
            1 if b.killer_id > 0 => format!(
                "Bạch Hổ đã bị tiêu diệt, kết liễu: {} (bậc {}, {} sát thương)",
                b.killer,
                b.killer_tier,
                smith::grouped(b.killer_damage as i64)
            ),
            1 => "Bạch Hổ đã bị tiêu diệt".into(),
            2 => format!("Bạch Hổ đã tẩu thoát, còn {}% máu", hp_percent(&b)),
            _ => "Chưa có phiên Bạch Hổ nào".into(),
        };
        let you = place.unwrap_or_else(|| "nick chưa có hạng ở phiên này".into());
        out.push(Out::Log(LogKind::Battle, format!("{boss}. {you}")));
        if self.bach_ho.is_some() && matches!(b.state, 1 | 2) {
            let why = if b.state == 1 {
                "Boss đã bị tiêu diệt"
            } else {
                "Boss đã tẩu thoát"
            };
            self.bach_ho_end(why, false, out);
        }
    }

    pub(super) fn bach_ho_on(&self) -> bool {
        self.bach_ho.is_some()
    }

    fn bach_ho_doing(&mut self, doing: String) {
        if let Some(r) = self.snap.bach_ho.as_mut() {
            r.doing = doing;
        }
    }

    /// The next step of the run: wait for the start, go there, try to get into a battle, or end at the end time. Called
    /// from next() (after a portal, a battle, a challenge not answered, or its own timer).
    pub(super) fn bach_ho_step(&mut self, now: Instant, out: &mut Vec<Out>) {
        let Some(r) = self.snap.bach_ho.clone() else {
            return;
        };
        let at = epoch_ms();
        if at >= r.until_ms {
            return self.bach_ho_end("Hết giờ", true, out);
        }
        if self.battle.is_some()
            || self.warp.is_some()
            || self.travelling.is_some()
            || self.zoning.is_some()
        {
            return;
        }
        if at < r.from_ms {
            let left = Duration::from_millis(r.from_ms - at);
            self.bach_ho_doing(format!(
                "Đợi tới {}, còn {}",
                clock(r.from_ms),
                duration_text(left)
            ));
            self.timer = Some((now + left.min(WAIT_STEP), Wake::Next));
            return;
        }
        match self.snap.map_id.as_str() {
            CAVE => self.bach_ho_try(now, out),
            GATE => {
                self.bach_ho_doing("Vào Hang Bạch Hổ".into());
                out.push(Out::Log(
                    LogKind::Travel,
                    "Bạch Hổ: qua cổng Hang Bạch Hổ".into(),
                ));
                self.travelling = Some((GATE_PORTAL, "Hang Bạch Hổ".into()));
                self.snap.moving = Some("Vào Hang Bạch Hổ".into());
                Self::send(
                    out,
                    13,
                    Ctx {
                        map_id: Some(GATE),
                        npc_id: Some(GATE_PORTAL),
                        ..Ctx::default()
                    },
                );
                self.move_until = Some(now + Duration::from_secs(8));
            }
            _ => {
                self.bach_ho_doing("Đi tới Cổng Luyện Ngục qua Bản đồ thế giới".into());
                self.warp_to(GATE, "Cổng Luyện Ngục", None, now, out);
            }
        }
    }

    /// In the cave: the boss challenged as the other bosses are (c2s/1178), or another try in RETRY.
    fn bach_ho_try(&mut self, now: Instant, out: &mut Vec<Out>) {
        let boss = self
            .mobs
            .iter()
            .find(|m| m.name.contains("Bạch Hổ"))
            .or_else(|| self.mobs.iter().find(|m| self.bosses.contains(&m.id)))
            .or_else(|| self.mobs.first())
            .cloned();
        let Some(r) = self.snap.bach_ho.as_mut() else {
            return;
        };
        r.tries += 1;
        let tries = r.tries;
        let Some(mob) = boss else {
            self.bach_ho_doing(format!(
                "Chưa thấy Bạch Hổ trong hang, thử lại sau {} s (lần {tries})",
                RETRY.as_secs()
            ));
            if tries == 1 || tries % 12 == 0 {
                out.push(Out::Log(
                    LogKind::Battle,
                    format!(
                        "Bạch Hổ: chưa thấy boss trong hang (lần {tries}), cứ {} s thử lại",
                        RETRY.as_secs()
                    ),
                ));
            }
            // The mobs of the cave again, in case the boss came without a push.
            Self::send(
                out,
                43,
                Ctx {
                    map_id: Some(CAVE),
                    ..Ctx::default()
                },
            );
            self.timer = Some((now + RETRY, Wake::Next));
            return;
        };
        let opcode = if self.bosses.contains(&mob.id) {
            1178
        } else {
            15
        };
        self.bach_ho_doing(format!("Thách đấu {} (lần {tries})", mob.name));
        out.push(Out::Log(
            LogKind::Battle,
            format!(
                "Bạch Hổ: thách đấu {} cấp {} ({}), lần {tries}",
                mob.name, mob.level, mob.id
            ),
        ));
        Self::send(
            out,
            opcode,
            Ctx {
                mob_id: Some(&mob.id),
                ..Ctx::default()
            },
        );
        self.challenged(mob, now);
    }

    /// A battle of the run is over: its figures, Kết quả Bạch Hổ asked (where it stands, and whether the boss is still
    /// there), then the next try.
    pub(super) fn bach_ho_battle_end(
        &mut self,
        won: bool,
        damage: i64,
        now: Instant,
        out: &mut Vec<Out>,
    ) {
        self.bach_ho_ask(out);
        if let Some(r) = self.snap.bach_ho.as_mut() {
            r.battles += 1;
            r.wins += u32::from(won);
            r.damage += damage;
            r.doing = format!(
                "Hết trận {}: {}, gây {} sát thương",
                r.battles,
                if won { "thắng" } else { "thua" },
                smith::grouped(damage)
            );
        }
        self.timer = Some((now + AFTER_BATTLE, Wake::Next));
    }

    /// Quay về chỗ cũ: back to the map and zone Bạch Hổ took the character from, through Bản đồ thế giới, then the
    /// zone. Refused while Bạch Hổ goes on or the character is busy, and with no place kept.
    pub fn go_back(&mut self, now: Instant, out: &mut Vec<Out>) {
        let Some(back) = self.snap.back_point.clone() else {
            out.push(Out::Log(
                LogKind::Travel,
                "Chưa quay về: không có chỗ cũ nào được nhớ".into(),
            ));
            return;
        };
        let why = if self.bach_ho.is_some() {
            Some("đang đi Bạch Hổ, bấm Dừng trước")
        } else {
            self.busy()
        };
        if let Some(why) = why {
            out.push(Out::Log(
                LogKind::Travel,
                format!("Chưa quay về {}: {why}", back.map_name),
            ));
            return;
        }
        if self.snap.map_id == back.map_id {
            self.snap.back_point = None;
            if self.snap.zone != back.zone {
                self.zone_to(back.zone, false, now, out);
            } else {
                out.push(Out::Log(
                    LogKind::Travel,
                    format!("Đang ở chỗ cũ: {} khu {}", back.map_name, back.zone),
                ));
            }
            return;
        }
        out.push(Out::Log(
            LogKind::Travel,
            format!(
                "Quay về chỗ cũ: {} khu {} qua Bản đồ thế giới",
                back.map_name, back.zone
            ),
        ));
        // The place is kept until there (warp_arrived), so a jump without an answer can be tried again.
        self.warp_to(&back.map_id, &back.map_name, Some(back.zone), now, out);
    }

    /// Jumps to `map_id` through Bản đồ thế giới; then to zone `zone_after` if given. Returns whether it set off.
    fn warp_to(
        &mut self,
        map_id: &str,
        name: &str,
        zone_after: Option<i32>,
        now: Instant,
        out: &mut Vec<Out>,
    ) -> bool {
        let Some(line) = world_line(map_id) else {
            out.push(Out::Log(
                LogKind::Travel,
                format!("Không đi được tới {name}: {map_id} không có trên Bản đồ thế giới"),
            ));
            return false;
        };
        self.warp = Some(Warp {
            line,
            to: name.to_string(),
            stage: WarpStage::Opening,
            zone_after,
        });
        self.snap.moving = Some(format!("Đi tới {name}"));
        Self::send(
            out,
            11,
            Ctx {
                map_id: Some("M99"),
                ..Ctx::default()
            },
        );
        self.move_until = Some(now + Duration::from_secs(8));
        true
    }

    /// s2c/11 of Bản đồ thế giới (flag 0): the jump of the warp under way.
    pub(super) fn warp_opened(&mut self, now: Instant, out: &mut Vec<Out>) {
        let Some(w) = self.warp.as_mut().filter(|w| w.stage == WarpStage::Opening) else {
            return;
        };
        w.stage = WarpStage::Jumping;
        let line = w.line;
        Self::send(
            out,
            13,
            Ctx {
                map_id: Some("M99"),
                npc_id: Some(line),
                ..Ctx::default()
            },
        );
        self.move_until = Some(now + Duration::from_secs(8));
    }

    /// s2c/13 while the warp jumps: the new map is asked, its mobs next (reload_map). Returns whether it was the warp's.
    pub(super) fn warp_landed(&mut self, map_id: &str, now: Instant, out: &mut Vec<Out>) -> bool {
        let Some(w) = self.warp.as_mut().filter(|w| w.stage == WarpStage::Jumping) else {
            return false;
        };
        w.stage = WarpStage::Loading;
        out.push(Out::Log(
            LogKind::Travel,
            format!("Bản đồ thế giới: sang {map_id}"),
        ));
        self.reload_map = true;
        Self::send(
            out,
            11,
            Ctx {
                map_id: Some(map_id),
                ..Ctx::default()
            },
        );
        self.move_until = Some(now + Duration::from_secs(8));
        true
    }

    /// s2c/43 once the warp's map is loaded: the warp ends, then the zone of Quay về chỗ cũ, or the next step.
    pub(super) fn warp_arrived(&mut self, now: Instant, out: &mut Vec<Out>) {
        let Some(w) = self.warp.take_if(|w| w.stage == WarpStage::Loading) else {
            return;
        };
        (self.move_until, self.snap.moving) = (None, None);
        out.push(Out::Log(LogKind::Travel, format!("Đã tới {}", w.to)));
        // Quay về chỗ cũ is there (only it has a zone after).
        if w.zone_after.is_some() {
            self.snap.back_point = None;
        }
        match w.zone_after.filter(|&z| z != self.snap.zone) {
            Some(z) => {
                self.zone_to(z, false, now, out);
            }
            None => self.timer = Some((now + Duration::from_secs(1), Wake::Next)),
        }
    }

    /// The warp got no answer within 8 s: dropped; Bạch Hổ tries again in RETRY.
    pub(super) fn warp_timeout(&mut self, now: Instant, out: &mut Vec<Out>) {
        if let Some(w) = self.warp.take() {
            out.push(Out::Log(
                LogKind::Travel,
                format!(
                    "Bản đồ thế giới không trả lời sau 8 s, thôi đi tới {}",
                    w.to
                ),
            ));
            if self.bach_ho.is_some() {
                self.timer = Some((now + RETRY, Wake::Next));
            }
        }
    }
}
