// Where the app finds its files: this repository when it is there (cargo run, or the app built here), else the app's
// local data folder for accounts and the copy of data/maps.json built into the binary.
use cllt_core::atlas::Atlas;
use std::path::{Path, PathBuf};
use tauri::{path::PathResolver, Runtime};

const REPO: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/../../..");

/// The repository, for a build made in it. Never for a build of GitHub Actions (GITHUB_ACTIONS is set there): REPO is
/// then the runner's folder (D:\a\… on Windows), which anyone on a shared PC could make, and the app would keep its
/// accounts.json there.
fn repo() -> Option<PathBuf> {
    if option_env!("GITHUB_ACTIONS").is_some() {
        return None;
    }
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

/// accounts.json of --sample, in a folder of its own under the system's temp folder: what the sample accounts save (a mob
/// picked, a number changed, Sửa nick, Nhập, Lưu in Cài đặt, which writes settings.json beside it) never reaches the
/// real accounts.json or settings.json, which the sample never read.
pub fn sample_accounts() -> PathBuf {
    std::env::temp_dir()
        .join(format!("cllt-sample-{}", std::process::id()))
        .join("accounts.json")
}

/// cllt.db, the log lines and battles of every account (store.rs), beside accounts.json.
pub fn db(accounts: &Path) -> PathBuf {
    accounts.with_file_name("cllt.db")
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

#[cfg(test)]
mod tests {
    /// --sample saves into a temp folder of its own, never where the real accounts.json is.
    #[test]
    fn the_sample_saves_to_a_temp_folder_of_its_own() {
        let p = super::sample_accounts();
        assert!(p.starts_with(std::env::temp_dir()), "{}", p.display());
        assert_eq!(
            p.file_name().and_then(|n| n.to_str()),
            Some("accounts.json")
        );
        let real = super::repo().map(|r| r.join("app/accounts.json"));
        assert_ne!(Some(p), real);
    }
}
