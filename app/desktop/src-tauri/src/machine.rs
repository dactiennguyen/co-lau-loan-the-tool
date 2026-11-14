// This machine as CLLT Server knows it (license.rs, sync.rs): its id, its name, and the address of the server.
//
// The id is the SHA-256 of the operating system's machine id (MachineGuid on Windows, IOPlatformUUID on macOS,
// /etc/machine-id on Linux, read by machine-uid) with the app's name: the same after the app is removed and installed
// again, and the raw id never leaves the machine. A key is bound to it (one key, one machine).
use sha2::{Digest, Sha256};
use std::sync::OnceLock;
use std::time::Duration;

/// CLLT Server; in a debug build CLLT_SERVER changes it, and `off` there turns the key and the sync off (development).
/// A release build always uses it: a variable anyone can set must not turn the key off.
pub const SERVER: &str = "https://colau.olachat.net";

/// This machine's id: SHA-256 (hex) of the system's machine id with the app's name, read once a run (on macOS it
/// runs ioreg). A machine whose id cannot be read gets one from its name and home folder, as they were at the start.
pub fn id() -> String {
    static ID: OnceLock<String> = OnceLock::new();
    ID.get_or_init(read_id).clone()
}

fn read_id() -> String {
    let raw = machine_uid::get().unwrap_or_else(|e| {
        eprintln!("Key: không đọc được machine id ({e}), dùng tên máy");
        format!(
            "fallback:{}:{}",
            hostname(),
            std::env::var("USERPROFILE")
                .or_else(|_| std::env::var("HOME"))
                .unwrap_or_default()
        )
    });
    hash(&raw)
}

fn hash(raw: &str) -> String {
    let digest = Sha256::digest(format!("colautool-device:{}", raw.trim()).as_bytes());
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn hostname() -> String {
    gethostname::gethostname().to_string_lossy().into_owned()
}

/// The HTTP client of the key and the sync. As tauri-plugin-updater does: reqwest is built without a TLS crypto provider
/// of its own.
pub fn client(timeout: Duration) -> reqwest::Result<reqwest::Client> {
    let _ = rustls::crypto::ring::default_provider().install_default();
    reqwest::Client::builder().timeout(timeout).build()
}

/// The server of CLLT_SERVER (`var`): in a debug build, when it is "off", https, or http on this machine; else (and
/// always in a release build) CLLT Server, as the key and the passwords of the sync go there.
pub fn server_of(var: Option<String>) -> String {
    server_from(var, cfg!(debug_assertions))
}

/// server_of, with `custom` whether CLLT_SERVER is taken at all. The host is read as a URL, so
/// "http://localhost:80@x.example" is x.example.
fn server_from(var: Option<String>, custom: bool) -> String {
    let Some(s) = var else {
        return SERVER.into();
    };
    if !custom {
        eprintln!("Key: bỏ qua CLLT_SERVER {s}: bản phát hành luôn dùng CLLT Server");
        return SERVER.into();
    }
    let ok = s == "off"
        || reqwest::Url::parse(&s).is_ok_and(|u| match u.scheme() {
            "https" => u.host_str().is_some(),
            "http" => matches!(u.host_str(), Some("localhost" | "127.0.0.1")),
            _ => false,
        });
    if ok {
        s.trim_end_matches('/').to_string()
    } else {
        eprintln!("Key: bỏ qua CLLT_SERVER {s}: phải là https, hoặc http trên máy này");
        SERVER.into()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn another_server_must_be_https_or_on_this_machine() {
        for kept in [
            "off",
            "https://x.example",
            "http://localhost:8787",
            "http://127.0.0.1",
            "http://127.0.0.1/a",
        ] {
            assert_eq!(server_from(Some(kept.into()), true), kept);
        }
        assert_eq!(
            server_from(Some("https://x.example/".into()), true),
            "https://x.example"
        );
        for refused in [
            "http://x.example",
            "http://localhost.evil.example",
            "http://localhost:80@evil.example",
            "ftp://x",
            "nonsense",
        ] {
            assert_eq!(server_from(Some(refused.into()), true), SERVER, "{refused}");
        }
        assert_eq!(server_from(None, true), SERVER);
    }

    #[test]
    fn a_release_build_always_uses_cllt_server() {
        for var in ["off", "https://x.example", "http://localhost:8787"] {
            assert_eq!(server_from(Some(var.into()), false), SERVER, "{var}");
        }
        assert_eq!(server_from(None, false), SERVER);
    }

    #[test]
    fn the_id_is_a_sha256_of_the_machine_id_and_stays_the_same() {
        let id = id();
        assert_eq!(id.len(), 64);
        assert!(id
            .chars()
            .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
        assert_eq!(id, super::id());
        assert_ne!(hash("a"), hash("b"));
    }
}
