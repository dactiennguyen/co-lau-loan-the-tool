//! Bạch Hổ (17-bach-ho.md) for the Bạch Hổ window of the app: from the time the user chose until the end time, the
//! character goes to Hang Bạch Hổ and keeps trying to get into a battle with the boss; once in, it fights, then tries
//! again, as the game does (BH2, 21/11, measured with the game on the phone):
//! - At 21:00 the boss comes in s2c/43 of the cave (mob800 "Bạch Hổ Thống Lĩnh", level 155), with the s2c/45 "… đã phá
//!   vỡ Phong Ấn …"; no s2c/1177.
//! - A battle is a plain c2s/15 with its mob id and flag 1, then the board of any mob (s2c/22, c2s/18). A lost battle
//!   heals to full, takes no fee and ~1 durability of each worn item; the next challenge may go at once.
//! - Its kill is the s2c/45 "Bạch Hổ Thống Lĩnh vừa bị tiêu diệt bởi @…"; the battle on ends, and the cave's s2c/43 is
//!   empty from then on. The reward is a mail (Quà tham gia Bạch Hổ), left in the mailbox.
//!
//! Between battles a broken worn item is repaired with a Búa Sửa Chữa of the bag (auto_repair), whatever Tự sửa đồ
//! says: a run of battles one after the other wears the gear down.
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
/// The longest the next try waits after a battle for the answer of Kết quả Bạch Hổ asked at its end (whether the boss
/// is still there), when Chờ vào trận lại is shorter: the answer comes in a round trip, this is in case none does.
const ANSWER_WAIT: Duration = Duration::from_millis(1_500);
/// A peek (Kết quả Bạch Hổ asked during a battle) not answered after this long is taken as lost when the battle ends,
/// so the answers after it are not matched to the wrong ask (an answer comes in a round trip, 1.25 s at the slowest
/// seen live).
const PEEK_LOST: Duration = Duration::from_secs(3);
/// The least time between two Kết quả Bạch Hổ asked during a battle (on the boss's clock hits).
const PEEK_EVERY: Duration = Duration::from_secs(15);
/// The longest the run sleeps before the start time: it wakes now and then to say how long is left.
const WAIT_STEP: Duration = Duration::from_secs(30);

/// The run under way (its figures are snap.bach_ho): whether the boss was seen in the cave in this run, so a cave with
/// no mob afterwards means it is gone.
pub(super) struct State {
    seen: bool,
    /// When Kết quả Bạch Hổ was last asked during a battle (peek).
    peeked: Option<Instant>,
    /// The waits of the run (its window): between swaps, and between a battle and the next try (the server takes the
    /// next challenge at once, BH2). A battle with the boss is timed (it hits every 30 s whatever is done), so the
    /// damage is the swaps made between its hits.
    pub(super) pace: BachHoPace,
    /// After a battle: when the next try may go (its end plus Chờ vào trận lại), once the answer of Kết quả Bạch Hổ is
    /// in and the boss still there.
    rejoin_at: Option<Instant>,
}

/// The flag of c2s/15 the game sends for Bạch Hổ (BH2).
const CHALLENGE_FLAG: u8 = 1;

/// The cave's boss among the mobs of s2c/43: the one whose name has "Bạch Hổ", else the first (the cave has no other).
fn cave_boss(mobs: &[Mob]) -> Option<&Mob> {
    mobs.iter()
        .find(|m| m.name.contains("Bạch Hổ"))
        .or_else(|| mobs.first())
}

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

/// s2c/1275 ← sqtm.a of game 1.1.0 (17-bach-ho.md#đọc-tĩnh-110), all 551 bytes of BH2's read so: u8 state; i64 start of
/// the run (ms since 1970); i32 HP, most HP (per mille: 0 and 1000 at the kill); i32 killer id;
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
            rows: vec![],
        };
        let mut tier = tier;
        for _ in 0..r.u8()? {
            tier.rows.push(BachHoRow {
                rank: r.u8()?,
                id: r.i32()?,
                name: r.string()?,
                level: i16(&mut r)?,
                damage: r.i32()?,
            });
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
            read_at_ms: 0,
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
    pub fn bach_ho(
        &mut self,
        from_ms: u64,
        until_ms: u64,
        pace: BachHoPace,
        now: Instant,
        out: &mut Vec<Out>,
    ) {
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
        self.bach_ho = Some(State {
            seen: false,
            peeked: None,
            pace,
            rejoin_at: None,
        });
        // Tự sửa đồ of this run starts afresh, as that of a fight job.
        (self.repair_failed, self.repair_warned) = (HashSet::new(), false);
        self.snap.bach_ho = Some(BachHoRun {
            from_ms,
            until_ms,
            doing: format!("Đợi tới {}", clock(from_ms)),
            tries: 0,
            battles: 0,
            wins: 0,
            damage: 0,
            done: None,
        });
        self.bach_ho_asks.clear();
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
        self.bach_ho_asks.push_back(true);
        Self::send(out, 1275, Ctx::default());
    }

    /// s2c/1275: where the character stands goes on the run; asked by the run (after a battle, at its end), the log says
    /// how the boss is, and a run still on ends once the boss is killed or got away: there is nothing left to fight in
    /// a day's run the character fought in; else the next try waits no longer for it (bach_ho_battle_end). Read quietly
    /// when the run did not ask (a peek, or nobody asked).
    pub(super) fn bach_ho_result_read(&mut self, payload: &[u8], now: Instant, out: &mut Vec<Out>) {
        // Popped before the read can fail, so a bad answer does not shift the ones after it.
        let asked = self.bach_ho_asks.pop_front() == Some(true);
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
        self.snap.bach_ho_result = Some(BachHoResult {
            read_at_ms: epoch_ms(),
            ..b.clone()
        });
        if !asked {
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
            return;
        }
        let at = self.bach_ho.as_mut().and_then(|st| st.rejoin_at.take());
        if let (Some(at), Some((_, Wake::Next))) = (at, &self.timer) {
            self.timer = Some((at.max(now), Wake::Next));
        }
    }

    pub(super) fn bach_ho_on(&self) -> bool {
        self.bach_ho.is_some()
    }

    /// A clock hit of the boss (s2c/21) in a battle of the run: Kết quả Bạch Hổ asked quietly, at most every PEEK_EVERY,
    /// so the window follows the boss's HP and the character's damage during the battle too.
    pub(super) fn bach_ho_peek(&mut self, now: Instant, out: &mut Vec<Out>) {
        let Some(st) = self.bach_ho.as_mut() else {
            return;
        };
        if st.peeked.is_some_and(|t| now < t + PEEK_EVERY) {
            return;
        }
        st.peeked = Some(now);
        self.bach_ho_asks.push_back(false);
        Self::send(out, 1275, Ctx::default());
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
        // A broken worn item first: the repair wakes the run again once answered.
        if self.auto_repair(now, out) {
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

    /// In the cave: the boss challenged as the game does (c2s/15, flag 1), or another try in RETRY. Before 21:00 the
    /// cave has no mob.
    fn bach_ho_try(&mut self, now: Instant, out: &mut Vec<Out>) {
        // A late answer of the battle before no longer moves the timer of this try.
        if let Some(st) = self.bach_ho.as_mut() {
            st.rejoin_at = None;
        }
        let boss = cave_boss(&self.mobs).cloned();
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
        if let Some(st) = self.bach_ho.as_mut() {
            st.seen = true;
        }
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
            15,
            Ctx {
                mob_id: Some(&mob.id),
                challenge_flag: Some(CHALLENGE_FLAG),
                ..Ctx::default()
            },
        );
        self.challenged(mob, now);
    }

    /// s2c/43 of the cave while the run goes on: the boss there for the first time is said, and a run waiting for its
    /// next try tries at once; a cave with no mob after the boss was seen means it is gone (killed or away), which ends
    /// the run, the s2c/45 of its kill having not come.
    pub(super) fn bach_ho_mobs(&mut self, map_id: &str, now: Instant, out: &mut Vec<Out>) {
        let Some(st) = self.bach_ho.as_mut().filter(|_| map_id == CAVE) else {
            return;
        };
        match cave_boss(&self.mobs) {
            Some(b) => {
                if !st.seen {
                    st.seen = true;
                    out.push(Out::Log(
                        LogKind::Battle,
                        format!("Bạch Hổ: {} cấp {} đã vào hang", b.name, b.level),
                    ));
                }
                self.bach_ho_wake(now);
            }
            None if st.seen && self.battle.is_none() => {
                self.bach_ho_end("Boss không còn trong hang", true, out);
            }
            None => {}
        }
    }

    /// A run waiting for its next try (its timer, not a challenge, a battle, a repair's answer or a move) tries now.
    fn bach_ho_wake(&mut self, now: Instant) {
        // After a battle the next try waits for the answer of Kết quả Bạch Hổ and Chờ vào trận lại (bach_ho_battle_end).
        let rejoining = self
            .bach_ho
            .as_ref()
            .is_some_and(|st| st.rejoin_at.is_some());
        let waiting = !rejoining
            && matches!(self.timer, Some((_, Wake::Next)))
            && self.battle.is_none()
            && self.repairing.is_none()
            && self.warp.is_none()
            && self.travelling.is_none()
            && self.snap.map_id == CAVE
            && self
                .snap
                .bach_ho
                .as_ref()
                .is_some_and(|r| epoch_ms() >= r.from_ms);
        if waiting {
            self.timer = Some((now, Wake::Next));
        }
    }

    /// s2c/45, the line the server sends every player, on Bạch Hổ while the run goes on (BH2): "Bạch Hổ Thống Lĩnh đã
    /// phá vỡ Phong Ấn, đang ẩn náu tại Hang Bạch Hổ …" at its start, "Bạch Hổ Thống Lĩnh vừa bị tiêu diệt bởi @…,
    /// công lớn thuộc về @… (51-100) …" at its kill, which ends the run (a battle on is ended by the server). Its line
    /// when it gets away is not measured: taken to say "tẩu thoát".
    pub(super) fn bach_ho_notice(&mut self, text: &str, now: Instant, out: &mut Vec<Out>) {
        if self.bach_ho.is_none() || !text.contains("Bạch Hổ") {
            return;
        }
        out.push(Out::Log(LogKind::Battle, format!("Thông báo: {text}")));
        if text.contains("bị tiêu diệt") {
            self.bach_ho_end("Boss đã bị tiêu diệt", true, out);
        } else if text.contains("tẩu thoát") {
            self.bach_ho_end("Boss đã tẩu thoát", true, out);
        } else if text.contains("Phong Ấn") {
            self.bach_ho_wake(now);
        }
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
        let peeked = self.bach_ho.as_ref().and_then(|st| st.peeked);
        if peeked.is_none_or(|t| now >= t + PEEK_LOST) {
            self.bach_ho_asks.retain(|&asked| asked);
        }
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
        // The next try once the answer says the boss is still there (bach_ho_result_read), not before Chờ vào trận lại;
        // ANSWER_WAIT at the latest with no answer.
        let Some(st) = self.bach_ho.as_mut() else {
            return;
        };
        let rejoin = st.pace.rejoin();
        st.rejoin_at = Some(now + rejoin);
        self.timer = Some((now + rejoin.max(ANSWER_WAIT), Wake::Next));
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

    /// Jumps to `map_id` through Bản đồ thế giới; then to zone `zone_after` if given. Returns whether it set off. Also the
    /// way out of a map no known portal way leaves (travel.rs world_way).
    pub(super) fn warp_to(
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
        // (0xff, the map's index once loaded in this session, else -1): 06-map-mobs.md#c2s-11.
        Self::send(
            out,
            11,
            Ctx {
                map_id: Some(map_id),
                map_index: Some(self.maps.map_index(map_id)),
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
            // Bạch Hổ and a quest run try again; a trip of Đổi map ends.
            if self.bach_ho.is_some() || self.quest_running() {
                self.timer = Some((now + RETRY, Wake::Next));
            }
            if self.trip.take().is_some() {
                self.snap.moving = None;
            }
        }
    }
}
