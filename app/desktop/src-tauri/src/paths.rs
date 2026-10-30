// Where the app finds its files: this repository when it is there (cargo run, or the app built here), else the app's
// local data folder for accounts and the copy of data/maps.json built into the binary.
use cllt_core::accounts::{self, Account};
use cllt_core::atlas::Atlas;
use std::path::{Path, PathBuf};
use tauri::{path::PathResolver, Runtime};

const REPO: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../..");

fn repo() -> Option<PathBuf> {
    let p = PathBuf::from(REPO);
    p.join("app").is_dir().then_some(p)
}

/// CLLT_ACCOUNTS, else app/accounts.json of the repository, else accounts.json in the app's local data folder, named
/// after the identifier: ~/Library/Application Support/vn.colauloanthe.desktop on macOS,
/// %LOCALAPPDATA%\vn.colauloanthe.desktop on Windows, ~/.local/share/vn.colauloanthe.desktop on Linux.
pub fn accounts<R: Runtime>(paths: &PathResolver<R>) -> tauri::Result<PathBuf> {
    if let Some(p) = std::env::var_os("CLLT_ACCOUNTS") {
        return Ok(p.into());
    }
    match repo() {
        Some(r) => Ok(r.join("app/accounts.json")),
        None => Ok(paths.app_local_data_dir()?.join("accounts.json")),
    }
}

/// `path` relative to the repository when it is inside it, else as given (canonical paths on Windows start with \\?\).
pub fn shown(path: &Path) -> String {
    let repo = repo().and_then(|r| r.canonicalize().ok());
    let full = path
        .parent()
        .and_then(|d| d.canonicalize().ok())
        .map(|d| d.join(path.file_name().unwrap_or_default()));
    match (repo, full) {
        (Some(r), Some(f)) => f
            .strip_prefix(&r)
            .map_or_else(|_| path.display().to_string(), |p| p.display().to_string()),
        _ => path.display().to_string(),
    }
}

/// The account of the repository .env, offered when there is no accounts.json.
pub fn env_account() -> Option<Account> {
    repo().and_then(|r| accounts::from_env(&r.join(".env")))
}

/// data/maps.json of the repository, else the copy built in.
pub fn atlas() -> Atlas {
    match repo()
        .map(|r| r.join("data/maps.json"))
        .filter(|p| p.exists())
    {
        Some(p) => Atlas::load(&p),
        None => {
            serde_json::from_str(include_str!("../../../../data/maps.json")).unwrap_or_default()
        }
    }
}
