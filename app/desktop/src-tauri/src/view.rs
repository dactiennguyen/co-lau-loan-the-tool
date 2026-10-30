// What the web UI (ui/) is told about each account: built from its session snapshot, sent as JSON with the "accounts"
// event and the `state` command. Field names are camelCase on the JavaScript side.
use crate::app::Entry;
use cllt_core::bot::{BattleView, BossTile, Job, Target};
use cllt_core::net::ConnState;
use cllt_core::world::Nearby;
use serde::Serialize;

/// Colour of a log line in the UI (LogLine.tone).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum LogTone {
    Normal = 0,
    Good = 1,
    Bad = 2,
    Accent = 3,
}
impl LogTone {
    pub fn of(text: &str) -> Self {
        if text.starts_with("Lỗi")
            || text.starts_with("Thua")
            || text.contains(": thua")
            || text.contains("từ chối")
        {
            Self::Bad
        } else if text.contains(": thắng") {
            Self::Good
        } else if ["Bắt đầu", "Kết thúc", "Đã vào game"]
            .iter()
            .any(|p| text.starts_with(p))
        {
            Self::Accent
        } else {
            Self::Normal
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct LogLine {
    pub time: String,
    pub text: String,
    pub tone: u8,
}
impl LogLine {
    pub fn new(time: String, text: &str) -> Self {
        Self {
            time,
            text: text.into(),
            tone: LogTone::of(text) as u8,
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountView<'a> {
    pub id: u64,
    /// The label, else the username; "(.env)" for the account of the .env file.
    pub label: String,
    pub username: &'a str,
    /// 0 offline, 1 connecting, 2 online, 3 fighting, 4 error
    pub status: u8,
    pub status_text: &'static str,
    pub error: &'a str,
    /// Time of day the session entered the game.
    pub since: &'a str,
    /// What the session knows about the character; None until it is in the game.
    pub character: Option<CharacterView<'a>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterView<'a> {
    pub name: &'a str,
    pub level: i32,
    pub hp: i32,
    pub max_hp: i32,
    pub exp: Option<i32>,
    pub level_exp: Option<[i32; 2]>,
    pub coin: Option<i32>,
    /// Potential stats; [0] is Cường lực (docs/app/user-data.md).
    pub stats: &'a [i32],
    /// Attack, defence, then probably accuracy, dodge, critical.
    pub combat: Option<[i32; 5]>,
    pub stat_points: Option<i32>,
    pub skill_points: Option<i32>,
    pub map_id: &'a str,
    pub map_name: &'a str,
    pub zone: i32,
    pub x: i32,
    pub y: i32,
    /// The other players of the zone, highest level first.
    pub players: &'a [Nearby],
    pub bosses: &'a [BossTile],
    pub targets: &'a [Target],
    pub job: Option<&'a Job>,
    pub battle: Option<&'a BattleView>,
}

fn status(e: &Entry) -> (u8, &'static str) {
    let running = e.snap.job.as_ref().is_some_and(|j| j.done.is_none());
    match &e.state {
        ConnState::Offline => (0, "Ngoại tuyến"),
        ConnState::Connecting => (1, "Đang kết nối"),
        ConnState::Online if e.snap.battle.is_some() || running => (3, "Đang đánh"),
        ConnState::Online => (2, "Trực tuyến"),
        ConnState::Error(_) => (4, "Lỗi"),
    }
}

pub fn account(e: &Entry) -> AccountView<'_> {
    let s = &e.snap;
    let (status, status_text) = status(e);
    AccountView {
        id: e.id,
        label: match (e.from_env, e.account.label.is_empty()) {
            (true, _) => format!("{} (.env)", e.account.username),
            (false, true) => e.account.username.clone(),
            (false, false) => e.account.label.clone(),
        },
        username: &e.account.username,
        status,
        status_text,
        error: match &e.state {
            ConnState::Error(m) => m,
            _ => "",
        },
        since: &e.since,
        character: (e.state == ConnState::Online && !s.name.is_empty()).then(|| CharacterView {
            name: &s.name,
            level: s.level,
            hp: s.hp,
            max_hp: s.max_hp,
            exp: s.exp,
            level_exp: s.level_exp,
            coin: s.coin,
            stats: &s.stats,
            combat: s.combat,
            stat_points: s.stat_points,
            skill_points: s.skill_points,
            map_id: &s.map_id,
            map_name: &s.map_name,
            zone: s.zone,
            x: s.x,
            y: s.y,
            players: &s.players,
            bosses: &s.bosses,
            targets: &s.targets,
            job: s.job.as_ref(),
            battle: s.battle.as_ref(),
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::LogTone;

    #[test]
    fn log_tone_follows_the_bot_lines() {
        assert_eq!(
            LogTone::of("Trận 3: thắng, 21 lượt, gây 234 sát thương, +92 EXP, +12 xu"),
            LogTone::Good
        );
        assert_eq!(
            LogTone::of("Trận 2: thua, 18 lượt, gây 210 sát thương, +0 EXP, +0 xu"),
            LogTone::Bad
        );
        assert_eq!(
            LogTone::of("Lỗi: Server từ chối: tài khoản đang đăng nhập"),
            LogTone::Bad
        );
        assert_eq!(LogTone::of("Bắt đầu: đánh Heo Mọi 1 lần"), LogTone::Accent);
        assert_eq!(
            LogTone::of("Trận 1/1: thách đấu Heo Mọi cấp 7 (mob22600)"),
            LogTone::Normal
        );
    }
}
