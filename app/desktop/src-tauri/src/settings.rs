// Cài đặt of the app, behind the button beside the name Co Lau Tool: the game server, Lưu dữ liệu trận, the notifications
// and what closing the window does, the same for every account. settings.json beside accounts.json; local only (app/.gitignore).
use cllt_core::net::Server;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// Where the sessions connect from their next login (Manager::set_server); the proxy checks go there too.
    pub server: Server,
    /// Lưu dữ liệu trận: every battle of every account into battle_data of cllt.db (Manager::set_record).
    pub record: bool,
    /// The close button of the window (tray.rs): ask, hide it in the tray with the accounts still playing, or quit.
    pub on_close: OnClose,
    /// Thông báo (notify.rs): a notification when a fight job or quest run ends by itself (notify_done), and when it ends
    /// because Thua tối đa was reached (notify_lost).
    pub notify_done: bool,
    pub notify_lost: bool,
    /// Báo khi có captcha: a notification the moment the server asks an account to confirm the player, and the window
    /// asks for attention on the desktop (the taskbar button flashes, the Dock icon bounces).
    pub notify_captcha: bool,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            server: Server::default(),
            record: true,
            on_close: OnClose::Ask,
            notify_done: true,
            notify_lost: true,
            notify_captcha: true,
        }
    }
}

/// "onClose" of settings.json: "ask" (the Đóng cửa sổ dialog), "tray" (Thu nhỏ vào khay) or "quit" (Thoát ứng dụng).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OnClose {
    #[default]
    Ask,
    Tray,
    Quit,
}
impl Settings {
    /// The host trimmed, an IPv6 address without its brackets; the error to show for an empty host, one that is not a
    /// bare name or IP, or port 0.
    pub fn checked(mut self) -> Result<Self, String> {
        let host = self.server.host.trim();
        let bare = host
            .strip_prefix('[')
            .and_then(|h| h.strip_suffix(']'))
            .unwrap_or(host);
        let ipv6 = bare.parse::<std::net::Ipv6Addr>().is_ok();
        self.server.host = if ipv6 { bare } else { host }.to_string();
        let host = &self.server.host;
        if host.is_empty() {
            return Err("Nhập địa chỉ server game".into());
        }
        if !ipv6 && host.contains(|c: char| c.is_whitespace() || c == '/' || c == ':') {
            return Err(
                "Địa chỉ server game chỉ gồm tên miền hoặc IP, không có http://, dấu cách hay cổng"
                    .into(),
            );
        }
        if self.server.port == 0 {
            return Err("Cổng phải từ 1 đến 65535".into());
        }
        Ok(self)
    }
}

/// settings.json beside accounts.json.
pub fn path(accounts: &Path) -> PathBuf {
    accounts.with_file_name("settings.json")
}

/// The game server before APK 1.1.0 (20/11), which now resolves to 127.0.0.1. Saving Cài đặt wrote the default into
/// settings.json, so a file naming it reads as today's default host, its port kept.
const OLD_HOST: &str = "play.colauloanthe.vn";

/// settings.json; the defaults when there is none, or when it does not read, and the default server when the one it
/// names cannot be dialled (said on stderr; the next save replaces it) or is OLD_HOST. A key left out is its default.
pub fn load(path: &Path) -> Settings {
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Settings::default(),
        Err(e) => {
            eprintln!("{}: {e}", path.display());
            return Settings::default();
        }
    };
    let settings: Settings = serde_json::from_str(&text).unwrap_or_else(|e| {
        eprintln!("{}: {e}", path.display());
        Settings::default()
    });
    let mut loaded = settings.clone().checked().unwrap_or_else(|e| {
        eprintln!("{}: {e}", path.display());
        Settings {
            server: Server::default(),
            ..settings
        }
    });
    if loaded.server.host.eq_ignore_ascii_case(OLD_HOST) {
        loaded.server.host = Server::default().host;
    }
    loaded
}

/// `load` at the start of the app. Before settings.json, Lưu dữ liệu trận was a setting of each account ("record" of
/// "fight" in accounts.json, which the app no longer reads and drops at its next write): one account with it off turns
/// it off for all, and settings.json is written at once so that it stays off.
pub fn first_load(path: &Path, accounts: &Path) -> Settings {
    if path.exists() || !record_was_off(accounts) {
        return load(path);
    }
    let settings = Settings {
        record: false,
        ..Settings::default()
    };
    if let Err(e) = save(path, &settings) {
        eprintln!("{e}");
    }
    settings
}

/// An account of accounts.json with `"fight": {"record": false}`.
fn record_was_off(accounts: &Path) -> bool {
    std::fs::read_to_string(accounts)
        .ok()
        .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok())
        .and_then(|file| {
            file["accounts"]
                .as_array()
                .map(|list| list.iter().any(|a| a["fight"]["record"] == false))
        })
        .unwrap_or(false)
}

pub fn save(path: &Path, settings: &Settings) -> Result<(), String> {
    let fail = |e: &dyn std::fmt::Display| format!("Chưa lưu được {}: {e}", path.display());
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).map_err(|e| fail(&e))?;
    }
    let text = serde_json::to_string_pretty(settings).map_err(|e| fail(&e))?;
    std::fs::write(path, text + "\n").map_err(|e| fail(&e))
}

/// What Cài đặt opens with: the settings, the defaults Mặc định puts back, and what Lưu dữ liệu trận has kept so far
/// (None without cllt.db).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView {
    pub settings: Settings,
    pub defaults: Settings,
    pub battle_data: Option<BattleDataSize>,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BattleDataSize {
    pub battles: u64,
    /// Of the rows (header and packets, gzipped), not of the file.
    pub bytes: u64,
}

/// Xuất dữ liệu trận: the file written and what it holds.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Exported {
    pub path: String,
    pub battles: u64,
    pub bytes: u64,
}

/// Xuất log lỗi: the file written, how many Log lỗi it holds, and its bytes.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportedFaults {
    pub path: String,
    pub faults: u64,
    pub bytes: u64,
}

/// What an export writes: the battles of Lưu dữ liệu trận (a SQLite file), Log lỗi (a JSON file), the accounts of
/// Xuất JSON (a JSON file only its owner reads, write_private), or the picture of QR nick (a PNG, owner only too).
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Export {
    Battles,
    Faults,
    Accounts,
    Qr,
}
impl Export {
    const ALL: [Export; 4] = [
        Export::Battles,
        Export::Faults,
        Export::Accounts,
        Export::Qr,
    ];
    /// The start and the end of its file names.
    fn name(self) -> (&'static str, &'static str) {
        match self {
            Export::Battles => ("cllt-battles-", ".db"),
            Export::Faults => ("cllt-errors-", ".json"),
            Export::Accounts => ("cllt-accounts-", ".json"),
            Export::Qr => ("cllt-qr-", ".png"),
        }
    }
}

/// cllt-battles-<local time>.db, cllt-errors-<local time>.json or cllt-accounts-<local time>.json in `dir`, with -2,
/// -3… when a file of that name is there already.
pub fn export_path(dir: &Path, export: Export, time: &str) -> PathBuf {
    let (start, end) = export.name();
    let name = |n: u32| match n {
        1 => format!("{start}{time}{end}"),
        n => format!("{start}{time}-{n}{end}"),
    };
    (1..)
        .map(|n| dir.join(name(n)))
        .find(|p| !p.exists())
        .unwrap()
}

/// A file an export wrote: only those are shown in Finder or Explorer.
pub fn is_export(path: &Path) -> bool {
    let name = path.file_name().and_then(|n| n.to_str());
    path.is_file()
        && name.is_some_and(|n| {
            Export::ALL.iter().any(|e| {
                let (start, end) = e.name();
                n.starts_with(start) && n.ends_with(end)
            })
        })
}

/// Writes a new file only its owner can read (Xuất JSON holds passwords); an existing file is never overwritten.
pub fn write_private(path: &Path, text: &str) -> std::io::Result<()> {
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    std::os::unix::fs::OpenOptionsExt::mode(&mut options, 0o600);
    std::io::Write::write_all(&mut options.open(path)?, text.as_bytes())
}

/// Shows `path` selected in Finder or Explorer; on Linux, opens its folder.
pub fn reveal(path: &Path) -> std::io::Result<()> {
    use std::process::Command;
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut c = Command::new("open");
        c.arg("-R").arg(path);
        c
    };
    #[cfg(target_os = "windows")]
    let mut command = {
        use std::os::windows::process::CommandExt;
        let mut c = Command::new("explorer");
        // Explorer reads /select,"path" itself; the quotes Rust puts around a whole argument with a space break it.
        c.raw_arg(format!("/select,\"{}\"", path.display()));
        c
    };
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let mut command = {
        let mut c = Command::new("xdg-open");
        c.arg(path.parent().unwrap_or(path));
        c
    };
    // Explorer answers 1 even when it opened; only a command that does not start is an error.
    command.status().map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_missing_or_partial_file_reads_as_the_defaults_and_a_save_reads_back() {
        let dir = std::env::temp_dir().join(format!("cllt-settings-{}", std::process::id()));
        let file = path(&dir.join("accounts.json"));
        assert_eq!(load(&file), Settings::default());
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(&file, r#"{"record": false}"#).unwrap();
        assert_eq!(
            load(&file),
            Settings {
                record: false,
                ..Settings::default()
            }
        );
        let changed = Settings {
            server: Server {
                host: "10.0.0.2".into(),
                port: 1700,
            },
            record: false,
            on_close: OnClose::Tray,
            notify_done: true,
            notify_lost: false,
            notify_captcha: false,
        };
        save(&file, &changed).unwrap();
        assert_eq!(load(&file), changed);
        // A server without its port keeps the rest; one that cannot be dialled goes back to the default, the rest kept.
        std::fs::write(
            &file,
            r#"{"server": {"host": "10.0.0.2"}, "record": false}"#,
        )
        .unwrap();
        assert_eq!(
            load(&file),
            Settings {
                server: Server {
                    host: "10.0.0.2".into(),
                    port: Server::default().port,
                },
                record: false,
                ..Settings::default()
            }
        );
        std::fs::write(
            &file,
            r#"{"server": {"host": "plays1.colauloanthe.vn:1688", "port": 1688}, "record": false}"#,
        )
        .unwrap();
        assert_eq!(
            load(&file),
            Settings {
                record: false,
                ..Settings::default()
            }
        );
        // The server before APK 1.1.0 is today's default, the port kept.
        std::fs::write(
            &file,
            r#"{"server": {"host": "Play.colauloanthe.vn", "port": 1700}, "record": false}"#,
        )
        .unwrap();
        assert_eq!(
            load(&file),
            Settings {
                server: Server {
                    host: "plays1.colauloanthe.vn".into(),
                    port: 1700,
                },
                record: false,
                ..Settings::default()
            }
        );
        // What closing the window does: a value not known is the file not read.
        std::fs::write(&file, r#"{"onClose": "quit"}"#).unwrap();
        assert_eq!(load(&file).on_close, OnClose::Quit);
        std::fs::write(&file, r#"{"onClose": "close", "record": false}"#).unwrap();
        assert_eq!(load(&file), Settings::default());
        std::fs::write(&file, "{").unwrap();
        assert_eq!(load(&file), Settings::default());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn an_account_that_had_lưu_dữ_liệu_trận_off_turns_it_off_for_all_once() {
        let dir = std::env::temp_dir().join(format!("cllt-settings-old-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let accounts = dir.join("accounts.json");
        let file = path(&accounts);
        assert_eq!(first_load(&file, &accounts), Settings::default());
        std::fs::write(
            &accounts,
            r#"{"accounts": [{"username": "a", "password": "x"}, {"username": "b", "password": "y", "fight": {"record": false}}]}"#,
        )
        .unwrap();
        let off = Settings {
            record: false,
            ..Settings::default()
        };
        assert_eq!(first_load(&file, &accounts), off);
        assert_eq!(
            load(&file),
            off,
            "written, so it stays off once accounts.json drops the key"
        );
        // From then on settings.json decides.
        save(&file, &Settings::default()).unwrap();
        assert_eq!(first_load(&file, &accounts), Settings::default());
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn checked_trims_the_host_and_refuses_what_cannot_be_dialled() {
        let with = |host: &str, port: u16| Settings {
            server: Server {
                host: host.into(),
                port,
            },
            ..Settings::default()
        };
        let host = |s: Settings| s.checked().unwrap().server.host;
        assert_eq!(
            host(with(" plays1.colauloanthe.vn ", 1688)),
            "plays1.colauloanthe.vn"
        );
        assert_eq!(host(with("[2001:db8::5]", 1688)), "2001:db8::5");
        assert_eq!(host(with("2001:db8::5", 1688)), "2001:db8::5");
        for bad in [
            with("  ", 1688),
            with("http://plays1.colauloanthe.vn", 1688),
            with("plays1.colauloanthe.vn:1688", 1688),
            with("play colau", 1688),
            with("plays1.colauloanthe.vn", 0),
        ] {
            assert!(bad.clone().checked().is_err(), "{bad:?}");
        }
    }

    #[test]
    fn export_names_do_not_overwrite_and_only_they_are_revealed() {
        let dir = std::env::temp_dir().join(format!("cllt-export-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let first = export_path(&dir, Export::Battles, "20261031-203000");
        assert!(first.ends_with("cllt-battles-20261031-203000.db"));
        assert!(!is_export(&first));
        std::fs::write(&first, "").unwrap();
        assert!(is_export(&first));
        assert!(export_path(&dir, Export::Battles, "20261031-203000")
            .ends_with("cllt-battles-20261031-203000-2.db"));
        let errors = export_path(&dir, Export::Faults, "20261101-220000");
        assert!(errors.ends_with("cllt-errors-20261101-220000.json"));
        std::fs::write(&errors, "{}").unwrap();
        assert!(is_export(&errors));
        let other = dir.join("accounts.json");
        std::fs::write(&other, "").unwrap();
        assert!(!is_export(&other));
        let json = export_path(&dir, Export::Accounts, "20261101-220000");
        assert!(json.ends_with("cllt-accounts-20261101-220000.json"));
        write_private(&json, "{}").unwrap();
        assert!(is_export(&json));
        assert!(write_private(&json, "{}").is_err(), "never overwrites");
        #[cfg(unix)]
        assert_eq!(
            std::os::unix::fs::PermissionsExt::mode(
                &std::fs::metadata(&json).unwrap().permissions()
            ) & 0o777,
            0o600
        );
        assert!(export_path(&dir, Export::Accounts, "20261101-220000")
            .ends_with("cllt-accounts-20261101-220000-2.json"));
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
