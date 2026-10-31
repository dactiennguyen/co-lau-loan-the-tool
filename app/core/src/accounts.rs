//! accounts.json: the accounts the app logs in with. Local only (app/.gitignore); passwords are never logged, and the UI
//! gets them only when the edit form asks (account_secrets of the desktop app).
use crate::bot::FightSettings;
use crate::potentials::StatPlan;
use crate::proxy::Proxy;
use crate::runner::Skill;
use serde::{Deserialize, Serialize};
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
    /// Cài đặt đánh: Tự sửa đồ (Bot::set_fight); set from the Cài đặt tab.
    #[serde(default, skip_serializing_if = "FightSettings::is_default")]
    pub fight: FightSettings,
    /// The proxy the session connects through while `enabled`; set in the add and edit form, which tests it first.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub proxy: Option<Proxy>,
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
    let tmp = path.with_extension("json.tmp");
    let write = || -> std::io::Result<()> {
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
        std::io::Write::write_all(&mut options.open(&tmp)?, text.as_bytes())?;
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
    let get = |k: &str| {
        text.lines()
            .find_map(|l| l.trim().strip_prefix(&format!("{k}=")))
            .map(|v| v.trim().trim_matches('"').to_string())
    };
    Some(Account {
        label: ".env".into(),
        username: get("CLLT_USERNAME").filter(|v| !v.is_empty())?,
        password: get("CLLT_PASSWORD")?,
        server_id: get("CLLT_SERVER_ID")
            .and_then(|v| v.parse().ok())
            .unwrap_or_else(default_server),
        skill: None,
        stats: None,
        fight: FightSettings::default(),
        proxy: None,
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
            fight: FightSettings { repair: true },
            proxy: Some(crate::proxy::Proxy {
                enabled: false,
                kind: crate::proxy::ProxyKind::Http,
                host: "10.0.0.1".into(),
                port: 8080,
                username: "bot".into(),
                password: "pw".into(),
            }),
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
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
