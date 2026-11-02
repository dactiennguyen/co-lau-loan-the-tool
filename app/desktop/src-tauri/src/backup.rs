// Nhập / Xuất JSON of the Tài khoản list (the buttons beside "Tài khoản" in the sidebar). Xuất writes the accounts as
// accounts.json holds them, passwords included (the user's choice: the JSON is to move the accounts to another machine)
// and each with its whole Cài đặt đánh ("fight": Tự nhặt đồ, Nhặt cả đồ người khác, Chỉ nhặt trang bị đúng hệ, …), and
// the Cài đặt of the app (settings.json) when asked. Nhập reads that, a plain accounts.json ({"accounts": […]}), an
// array of accounts or one account; an account without "password" comes in with an empty one, to fill in with Sửa nick.
// Battles and logs (cllt.db) are not in it: Xuất dữ liệu trận of Cài đặt has them.
use crate::settings::Settings;
use cllt_core::accounts::Account;
use serde::Serialize;
use serde_json::Value;

pub const APP: &str = "CLLT Tool";
/// Raised when a field changes meaning; a file of a later format is refused rather than half read.
pub const FORMAT: u32 = 1;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Backup<'a> {
    app: &'static str,
    format: u32,
    exported_at: &'a str,
    accounts: &'a [Account],
    #[serde(skip_serializing_if = "Option::is_none")]
    settings: Option<&'a Settings>,
}

/// The JSON of Xuất: `accounts` in the order of the list, with their passwords; `settings` when asked.
pub fn export(accounts: &[Account], settings: Option<&Settings>, exported_at: &str) -> String {
    serde_json::to_string_pretty(&Backup {
        app: APP,
        format: FORMAT,
        exported_at,
        accounts,
        settings,
    })
    .unwrap()
        + "\n"
}

/// What a JSON of Nhập holds. Not Serialize: its passwords never go back to the UI.
#[derive(Debug)]
pub struct Parsed {
    pub accounts: Vec<Account>,
    pub settings: Option<Settings>,
}

/// Reads the JSON pasted or picked in Nhập. The error says what is wrong, in the words of the dialog.
pub fn parse(text: &str) -> Result<Parsed, String> {
    let text = text.trim().trim_start_matches('\u{feff}');
    if text.is_empty() {
        return Err("Chưa có JSON: dán vào ô hoặc chọn file".into());
    }
    let value: Value = serde_json::from_str(text).map_err(|e| format!("JSON không hợp lệ: {e}"))?;
    let (list, settings) = match value {
        Value::Array(items) => (items, None),
        Value::Object(mut o) if o.contains_key("accounts") => {
            if let Some(f) = o.get("format").and_then(Value::as_u64) {
                if f > u64::from(FORMAT) {
                    return Err(format!(
                        "JSON của bản app mới hơn (format {f}): cập nhật app rồi nhập lại"
                    ));
                }
            }
            let Some(Value::Array(list)) = o.remove("accounts") else {
                return Err("\"accounts\" phải là một danh sách".into());
            };
            let settings = match o.remove("settings") {
                None | Some(Value::Null) => None,
                Some(s) => Some(
                    serde_json::from_value::<Settings>(s)
                        .map_err(|e| format!("\"settings\" không đọc được: {e}"))?,
                ),
            };
            (list, settings)
        }
        Value::Object(o) if o.contains_key("username") => (vec![Value::Object(o)], None),
        _ => {
            return Err(
                "Không thấy nick nào: cần {\"accounts\": […]}, một danh sách nick, hoặc một nick có \"username\""
                    .into(),
            )
        }
    };
    if list.is_empty() {
        return Err("JSON không có nick nào".into());
    }
    let accounts = list
        .into_iter()
        .enumerate()
        .map(|(i, mut v)| {
            let n = i + 1;
            let o = v
                .as_object_mut()
                .ok_or_else(|| format!("Nick thứ {n} không phải một object"))?;
            o.entry("password")
                .or_insert_with(|| Value::String(String::new()));
            let a: Account = serde_json::from_value(v).map_err(|e| format!("Nick thứ {n}: {e}"))?;
            let username = a.username.trim().to_string();
            if username.is_empty() {
                return Err(format!("Nick thứ {n}: thiếu tài khoản (username)"));
            }
            Ok(Account { username, ..a })
        })
        .collect::<Result<Vec<_>, String>>()?;
    Ok(Parsed { accounts, settings })
}

/// One account of the JSON as Nhập shows it before anything is saved. No password goes back to the UI.
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewAccount {
    pub label: String,
    pub username: String,
    pub server_id: i32,
    /// It has a password; without one it is added all the same, to fill in with Sửa nick.
    pub password: bool,
    pub proxy: bool,
    /// The account of the list with this username on this server: replaced with Ghi đè, else skipped.
    pub existing: Option<u64>,
    /// An account earlier in the JSON has this username on this server: this one is skipped.
    pub repeated: bool,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportPreview {
    pub accounts: Vec<PreviewAccount>,
    /// The JSON has the Cài đặt of the app, which Nhập applies when asked.
    pub settings: bool,
}

/// Lưu file of Xuất JSON: the file written and how many accounts it holds.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Saved {
    pub path: String,
    pub accounts: usize,
}

/// What Nhập did.
#[derive(Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Imported {
    pub added: usize,
    pub replaced: usize,
    pub skipped: usize,
    pub settings: bool,
    /// The accounts added or replaced, as the list now has them: Đồng bộ nick counts them as from before (sync.rs).
    #[serde(skip)]
    pub accounts: Vec<Account>,
}

/// What becomes of each account of the JSON, in its order: `find` gives the account of the list it would log in as.
#[derive(Debug, PartialEq)]
pub enum Step {
    Add,
    Replace(u64),
    Skip,
}
pub fn plan(
    accounts: &[Account],
    replace: bool,
    find: impl Fn(&Account) -> Option<u64>,
) -> Vec<Step> {
    accounts
        .iter()
        .enumerate()
        .map(|(i, a)| match (repeated(accounts, i), find(a)) {
            (true, _) => Step::Skip,
            (false, Some(id)) if replace => Step::Replace(id),
            (false, Some(_)) => Step::Skip,
            (false, None) => Step::Add,
        })
        .collect()
}

pub fn preview(parsed: &Parsed, find: impl Fn(&Account) -> Option<u64>) -> ImportPreview {
    let accounts = parsed
        .accounts
        .iter()
        .enumerate()
        .map(|(i, a)| PreviewAccount {
            label: a.label.clone(),
            username: a.username.clone(),
            server_id: a.server_id,
            password: !a.password.is_empty(),
            proxy: a.proxy.as_ref().is_some_and(|p| p.enabled),
            existing: find(a),
            repeated: repeated(&parsed.accounts, i),
        })
        .collect();
    ImportPreview {
        accounts,
        settings: parsed.settings.is_some(),
    }
}

/// Two entries of one JSON for the same login: the first one counts.
fn repeated(accounts: &[Account], i: usize) -> bool {
    accounts[..i].iter().any(|b| same(b, &accounts[i]))
}
/// The same login: one username (case aside) on one server, as App::unique sees it.
pub fn same(a: &Account, b: &Account) -> bool {
    a.server_id == b.server_id && a.username.eq_ignore_ascii_case(&b.username)
}

/// The account replacing `old` with Ghi đè: everything from the JSON, but an empty password, label or proxy password
/// keeps the one of `old`.
pub fn replacement(old: &Account, new: Account) -> Account {
    Account {
        label: if new.label.trim().is_empty() {
            old.label.clone()
        } else {
            new.label
        },
        password: if new.password.is_empty() {
            old.password.clone()
        } else {
            new.password
        },
        proxy: crate::app::keep_password(old.proxy.as_ref(), new.proxy),
        algorithm: old.algorithm,
        ..new
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn account(username: &str, password: &str, server_id: i32) -> Account {
        parse(&format!(
            r#"{{"username": "{username}", "password": "{password}", "serverId": {server_id}}}"#
        ))
        .unwrap()
        .accounts
        .remove(0)
    }

    #[test]
    fn export_reads_back_with_passwords_and_settings() {
        let accounts = vec![account("a", "pa", 24), account("b", "pb", 24)];
        let settings = Settings {
            record: false,
            ..Settings::default()
        };
        let text = export(&accounts, Some(&settings), "2026-11-01T22:00:00+07:00");
        assert!(text.contains("\"app\": \"CLLT Tool\"") && text.contains("\"format\": 1"));
        let back = parse(&text).unwrap();
        assert_eq!(back.accounts, accounts);
        // Cài đặt đánh in full, also at its defaults, so that each setting can be changed in the file before Nhập.
        for key in [
            "\"pickupOthers\": true",
            "\"pickupOwnElement\": false",
            "\"pickupOtherGender\": true",
        ] {
            assert_eq!(text.matches(key).count(), 2, "{key}");
        }
        let edited = text.replacen("\"pickupOthers\": true", "\"pickupOthers\": false", 1);
        let back = parse(&edited).unwrap();
        assert!(!back.accounts[0].fight.pickup_others && back.accounts[1].fight.pickup_others);
        assert_eq!(back.settings.map(|s| s.record), Some(false));
        assert!(parse(&export(&accounts, None, "t"))
            .unwrap()
            .settings
            .is_none());
    }

    #[test]
    fn a_plain_accounts_json_a_list_or_one_account_read_too() {
        let file = r#"{"accounts": [{"label": "Nick", "username": " u1 ", "password": "x"}]}"#;
        let a = &parse(file).unwrap().accounts[0];
        assert_eq!(
            (a.label.as_str(), a.username.as_str(), a.server_id),
            ("Nick", "u1", 24)
        );
        assert_eq!(
            parse(r#"[{"username": "u1", "password": "x"}, {"username": "u2"}]"#)
                .unwrap()
                .accounts
                .len(),
            2
        );
        let one = parse("\u{feff} {\"username\": \"u3\"} ").unwrap();
        assert_eq!(
            one.accounts[0].password, "",
            "no password: to fill in with Sửa nick"
        );
    }

    #[test]
    fn what_is_wrong_is_said() {
        let err = |t: &str| parse(t).unwrap_err();
        assert!(err("  ").starts_with("Chưa có JSON"));
        assert!(err("{").starts_with("JSON không hợp lệ"));
        assert!(err(r#"{"accounts": []}"#).contains("không có nick"));
        assert!(err(r#"{"accounts": {}}"#).contains("phải là một danh sách"));
        assert!(err(r#"{"x": 1}"#).starts_with("Không thấy nick nào"));
        assert!(err(r#"[{"username": "a"}, 5]"#).contains("Nick thứ 2"));
        assert!(err(r#"[{"username": "  "}]"#).contains("thiếu tài khoản"));
        assert!(err(r#"[{"password": "p"}]"#).contains("Nick thứ 1"));
        assert!(
            err(r#"{"format": 2, "accounts": [{"username": "a"}]}"#).contains("bản app mới hơn")
        );
        assert!(
            err(r#"{"accounts": [{"username": "a"}], "settings": {"record": "x"}}"#)
                .contains("\"settings\"")
        );
    }

    #[test]
    fn plan_adds_new_skips_repeats_and_replaces_only_when_asked() {
        let list = vec![account("old", "p", 24)];
        let find = |a: &Account| list.iter().any(|b| same(a, b)).then_some(7);
        let json = vec![
            account("OLD", "", 24),
            account("new", "p", 24),
            account("New", "q", 24),
            account("old", "p", 25),
        ];
        assert_eq!(
            plan(&json, false, find),
            vec![Step::Skip, Step::Add, Step::Skip, Step::Add]
        );
        assert_eq!(
            plan(&json, true, find),
            vec![Step::Replace(7), Step::Add, Step::Skip, Step::Add]
        );
        let p = preview(
            &Parsed {
                accounts: json,
                settings: None,
            },
            find,
        );
        assert_eq!(
            p.accounts
                .iter()
                .map(|a| (a.existing, a.repeated, a.password))
                .collect::<Vec<_>>(),
            vec![
                (Some(7), false, false),
                (None, false, true),
                (None, true, true),
                (None, false, true)
            ]
        );
        assert!(!p.settings);
    }

    #[test]
    fn a_replacement_keeps_what_the_json_leaves_empty() {
        let old = Account {
            label: "Cũ".into(),
            ..account("u", "secret", 24)
        };
        let new = replacement(&old, account("u", "", 24));
        assert_eq!(
            (new.label.as_str(), new.password.as_str()),
            ("Cũ", "secret")
        );
        let new = replacement(
            &old,
            Account {
                label: "Mới".into(),
                ..account("u", "p2", 24)
            },
        );
        assert_eq!((new.label.as_str(), new.password.as_str()), ("Mới", "p2"));
    }
}
