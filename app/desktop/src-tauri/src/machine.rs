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

/// Android gives apps no machine id: the app keeps a random one of its own in `device-id` beside accounts.json (lib.rs
/// says where, before anything asks for the id). Removing the app removes it, and the key then needs Gỡ thiết bị.
#[cfg(mobile)]
static DIR: OnceLock<std::path::PathBuf> = OnceLock::new();

#[cfg(mobile)]
pub fn set_dir(dir: &std::path::Path) {
    let _ = DIR.set(dir.to_path_buf());
}

#[cfg(mobile)]
fn read_id() -> String {
    let file = DIR
        .get()
        .map(|d| d.join("device-id"))
        .unwrap_or_else(|| std::env::temp_dir().join("device-id"));
    let kept = std::fs::read_to_string(&file)
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| s.len() == 64 && s.bytes().all(|b| b.is_ascii_hexdigit()));
    let raw = kept.unwrap_or_else(|| {
        let made = random_hex();
        if let Err(e) = cllt_core::accounts::write_private(&file, made.as_bytes()) {
            eprintln!("Key: không lưu được mã máy ({e})");
        }
        made
    });
    hash(&format!("android:{raw}"))
}

/// 32 random bytes in hex, from the system's random source (/dev/urandom).
#[cfg(mobile)]
fn random_hex() -> String {
    use std::io::Read;
    let mut bytes = [0u8; 32];
    let read = std::fs::File::open("/dev/urandom").and_then(|mut f| f.read_exact(&mut bytes));
    if read.is_err() {
        // Never seen on Android; a clock and an address are unique enough for one device.
        let seed = format!("{:?}{:p}", std::time::SystemTime::now(), &bytes);
        bytes.copy_from_slice(&Sha256::digest(seed.as_bytes()));
    }
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(desktop)]
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

/// The name of this machine as the Key page shows it; on Android the maker and model ("Xiaomi M2101K7BG"), as its host
/// name is "localhost".
pub fn hostname() -> String {
    #[cfg(target_os = "android")]
    {
        static NAME: OnceLock<String> = OnceLock::new();
        let name = NAME.get_or_init(|| {
            let prop = |key: &str| {
                std::process::Command::new("getprop")
                    .arg(key)
                    .output()
                    .ok()
                    .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
                    .unwrap_or_default()
            };
            format!(
                "{} {}",
                prop("ro.product.manufacturer"),
                prop("ro.product.model")
            )
            .trim()
            .to_string()
        });
        if !name.is_empty() {
            return name.clone();
        }
    }
    gethostname::gethostname().to_string_lossy().into_owned()
}

/// The HTTP client of the key and the sync. As tauri-plugin-updater does: reqwest is built without a TLS crypto provider
/// of its own. On Android the roots are Mozilla's, built into the app (webpki-roots): reqwest's verifier of the system
/// (rustls-platform-verifier) panics there until set up from Java, which the app does not do.
pub fn client(timeout: Duration) -> reqwest::Result<reqwest::Client> {
    let _ = rustls::crypto::ring::default_provider().install_default();
    let builder = reqwest::Client::builder().timeout(timeout);
    #[cfg(target_os = "android")]
    let builder = {
        let roots = rustls::RootCertStore {
            roots: webpki_roots::TLS_SERVER_ROOTS.to_vec(),
        };
        let mut tls = rustls::ClientConfig::builder()
            .with_root_certificates(roots)
            .with_no_client_auth();
        tls.alpn_protocols = vec![b"http/1.1".to_vec()];
        builder.tls_backend_preconfigured(tls)
    };
    builder.build()
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
