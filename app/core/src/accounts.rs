//! accounts.json: the accounts the app logs in with. Local only (app/.gitignore); passwords are never logged, and the UI
//! gets them only when the edit form asks (account_secrets of the desktop app).
use crate::bot::FightSettings;
use crate::potentials::StatPlan;
use crate::proxy::Proxy;
use crate::runner::Skill;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::path::Path;

#[derive(Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Account {
    #[serde(default)]
    pub label: String,
    pub username: String,
    pub password: String,
    #[serde(default = "default_server")]
    pub server_id: i32,
    /// Skill cast in battle once nội lực reaches its cost.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub skill: Option<Skill>,
    /// How potential points are spent on their own (Bot::set_stats); set from the Chỉ số card.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub stats: Option<StatPlan>,
    /// Cài đặt đánh: Tự sửa đồ, Tự nhặt đồ and what it picks up (Bot::set_fight), set from the Cài đặt tab; and the
    /// numbers last chosen in the Đánh quái and Nhiệm vụ tabs. Always written whole, so that Xuất JSON shows every one of
    /// them to change before Nhập; one left out of a file reads as its default.
    #[serde(default)]
    pub fight: FightSettings,
    /// The target last chosen in the Đánh quái tab on each map (mapId → mob or boss), which the tab chooses again back on
    /// that map. The session never reads it.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub fight_targets: BTreeMap<String, String>,
    /// The proxy the session connects through while `enabled`; set in the add and edit form, which tests it first.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proxy: Option<Proxy>,
    /// The battle algorithm of the session: v3, the app's. Never read from or written to accounts.json; only
    /// `cllt fight --algo=v1` sets v1, to compare (BotOptions::algorithm).
    #[serde(skip)]
    pub algorithm: crate::bot::Algorithm,
}
fn default_server() -> i32 {
    crate::opcodes::SERVER_ID
}
impl std::fmt::Debug for Account {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Account")
            .field("label", &self.label)
            .field("username", &self.username)
            .field("server_id", &self.server_id)
            .field("proxy", &self.proxy)
            .finish_non_exhaustive()
    }
}

#[derive(Default, Serialize, Deserialize)]
struct File {
    accounts: Vec<Account>,
}

pub fn load(path: &Path) -> Result<Vec<Account>, String> {
    let text = std::fs::read_to_string(path).map_err(|e| format!("{}: {e}", path.display()))?;
    serde_json::from_str::<File>(&text)
        .map(|f| f.accounts)
        .map_err(|e| format!("{}: {e}", path.display()))
}
/// Writes the file readable by its owner only (it holds passwords), through a temporary file so a failed write leaves
/// the old one whole.
pub fn save(path: &Path, accounts: &[Account]) -> Result<(), String> {
    let text = serde_json::to_string_pretty(&File {
        accounts: accounts.to_vec(),
    })
    .unwrap()
        + "\n";
    write_private(path, text.as_bytes())
}
/// Writes `bytes` to `path` readable by its owner only on unix (accounts.json, and beside it the device key and
/// sync.json of the desktop app), through a temporary file so a failed write leaves the old one whole.
pub fn write_private(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let mut tmp = path.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = std::path::PathBuf::from(tmp);
    let write = || -> std::io::Result<()> {
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
        std::io::Write::write_all(&mut options.open(&tmp)?, bytes)?;
        std::fs::rename(&tmp, path)
    };
    write().map_err(|e| {
        let _ = std::fs::remove_file(&tmp);
        format!("{}: {e}", path.display())
    })
}
/// The account of CLLT_USERNAME / CLLT_PASSWORD / CLLT_SERVER_ID in a .env file, as the TS CLI reads it.
pub fn from_env(path: &Path) -> Option<Account> {
    let text = std::fs::read_to_string(path).ok()?;
    from_vars(".env", |k: &str| {
        text.lines()
            .find_map(|l| l.trim().strip_prefix(&format!("{k}=")))
            .map(|v| v.trim().trim_matches('"').to_string())
    })
}

/// The account of CLLT_USERNAME and CLLT_PASSWORD in the environment of the process, for a run that must not write a
/// password anywhere (`CLLT_USERNAME=… CLLT_PASSWORD=… cllt …`).
pub fn from_process() -> Option<Account> {
    from_vars("env", |k: &str| std::env::var(k).ok())
}

fn from_vars(label: &str, get: impl Fn(&str) -> Option<String>) -> Option<Account> {
    Some(Account {
        label: label.into(),
        username: get("CLLT_USERNAME").filter(|v| !v.is_empty())?,
        password: get("CLLT_PASSWORD")?,
        server_id: get("CLLT_SERVER_ID")
            .and_then(|v| v.parse().ok())
            .unwrap_or_else(default_server),
        skill: None,
        stats: None,
        fight: FightSettings::default(),
        fight_targets: BTreeMap::new(),
        proxy: None,
        algorithm: Default::default(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn save_writes_an_owner_only_file_that_load_reads_back() {
        let dir = std::env::temp_dir().join(format!("cllt-accounts-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("accounts.json");
        let account = Account {
            label: "Nick".into(),
            username: "user".into(),
            password: "secret".into(),
            server_id: 24,
            skill: None,
            stats: None,
            fight: FightSettings {
                repair: true,
                pickup: false,
                pickup_other_gender: false,
                pickup_others: false,
                pickup_own_element: true,
                pickup_common: false,
                pickup_rare: true,
                pickup_precious: false,
                pickup_epic: true,
                hp_potion: true,
                hp_potion_max: 2,
                hp_potion_keep: 10,
                mp_potion: true,
                mp_potion_max: 3,
                mp_potion_keep: 0,
                auto_merge: true,
                merge_up_to: 6,
                merge_every: 10,
                mob_delay: true,
                mob_delay_secs: 2,
                turn_delay: true,
                turn_delay_secs: crate::bot::Tenths::secs(4),
                step_delay: true,
                step_delay_secs: 5,
                rest_break: true,
                break_every: 40,
                break_minutes: 3,
                delay_random: true,
                waits_set: true,
                fight_count: 30,
                fight_losses: 4,
                quest_losses: 2,
                auto_skills: true,
                auto_welfare: true,
            },
            fight_targets: BTreeMap::from([("M2".into(), "Kẻ Quấy Phá".into())]),
            proxy: Some(crate::proxy::Proxy {
                enabled: false,
                kind: crate::proxy::ProxyKind::Http,
                host: "10.0.0.1".into(),
                port: 8080,
                username: "bot".into(),
                password: "pw".into(),
            }),
            algorithm: Default::default(),
        };
        save(&path, std::slice::from_ref(&account)).unwrap();
        assert_eq!(load(&path).unwrap(), vec![account]);
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(&path).unwrap().permissions().mode();
            assert_eq!(mode & 0o777, 0o600);
        }
        assert!(!dir.join("accounts.json.tmp").exists());
        // Tự nhặt đồ, Nhặt cả đồ khác giới tính and Nhặt cả đồ người khác are on, Chỉ nhặt trang bị đúng hệ off, every
        // box of Phẩm chất trang bị nhặt ticked, Dùng bình máu and Dùng bình mana off at 1 and 2 a battle keeping 30, Tự
        // gộp đá off, and the tabs offer 5 battles and 1 loss, for an account saved before they existed, or with only Tự
        // sửa đồ set.
        std::fs::write(&path, r#"{"accounts":[{"username":"a","password":"x"},{"username":"b","password":"y","fight":{"repair":true}}]}"#).unwrap();
        let old = load(&path).unwrap();
        assert_eq!(old[0].fight, FightSettings::default());
        assert!(old[0].fight.pickup && old[1].fight.pickup && old[1].fight.repair);
        assert!(old[0].fight.pickup_other_gender && old[1].fight.pickup_other_gender);
        assert!(old[1].fight.pickup_others && !old[1].fight.pickup_own_element);
        assert_eq!(old[1].fight.qualities(), [true; 4], "every quality ticked");
        let b = old[1].fight;
        assert_eq!(
            (b.potion_rule(0), b.potion_rule(1)),
            (None, None),
            "no potion"
        );
        assert_eq!(
            (
                b.hp_potion_max,
                b.hp_potion_keep,
                b.mp_potion_max,
                b.mp_potion_keep
            ),
            (1, 30, 2, 30)
        );
        assert_eq!(
            (b.auto_merge, b.merge_level(), b.merge_every),
            (false, 12, 5),
            "Tự gộp đá off, up to Max, 5 minutes apart"
        );
        // Thời gian chờ: every wait off, at 1 s, a break of 2 minutes after 30 battles, nothing random.
        assert_eq!(
            (
                b.mob_delay,
                b.turn_delay,
                b.step_delay,
                b.rest_break,
                b.delay_random
            ),
            (false, false, false, false, false)
        );
        assert_eq!(
            (b.mob_delay_secs, b.turn_delay_secs, b.step_delay_secs),
            (1, crate::bot::Tenths::secs(1), 1)
        );
        assert_eq!((b.break_every, b.break_minutes), (30, 2));
        assert_eq!(b.turn_pause(), std::time::Duration::ZERO);
        assert_eq!((b.fight_count, b.fight_losses, b.quest_losses), (5, 1, 1));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
