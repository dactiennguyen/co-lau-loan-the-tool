// Where the app finds its files: this repository when it is there (cargo run, or the .app built here), else the user's
// Application Support folder for accounts and the copy of data/maps.json built into the binary.
use cllt_core::accounts::{self, Account};
use cllt_core::atlas::Atlas;
use std::path::{Path, PathBuf};

const REPO: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../..");

fn repo() -> Option<PathBuf> {
    let p = PathBuf::from(REPO);
    p.join("app").is_dir().then_some(p)
}

/// CLLT_ACCOUNTS, else app/accounts.json of the repository, else ~/Library/Application Support/CoLauLoanThe/accounts.json.
pub fn accounts() -> PathBuf {
    if let Some(p) = std::env::var_os("CLLT_ACCOUNTS") {
        return p.into();
    }
    match repo() {
        Some(r) => r.join("app/accounts.json"),
        None => PathBuf::from(std::env::var_os("HOME").unwrap_or_default())
            .join("Library/Application Support/CoLauLoanThe/accounts.json"),
    }
}

/// `path` relative to the repository when it is inside it.
pub fn shown(path: &Path) -> String {
    let repo = repo().and_then(|r| r.canonicalize().ok());
    let full = path
        .parent()
        .and_then(|d| d.canonicalize().ok())
        .map(|d| d.join(path.file_name().unwrap_or_default()));
    match (repo, full) {
        (Some(r), Some(f)) => f
            .strip_prefix(&r)
            .map_or_else(|_| f.display().to_string(), |p| p.display().to_string()),
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
