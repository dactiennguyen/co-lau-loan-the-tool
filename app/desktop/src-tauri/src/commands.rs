// What the web UI can ask for (window.__TAURI__.core.invoke). Accounts are named by their stable id. The commands only
// change the App; the flusher of app.rs tells the UI. Adding and removing an account write accounts.json, so they are
// async: Tauri runs them off the main thread, and the file is written outside the App lock.
use crate::app::Shared;
use crate::view::LogLine;
use cllt_core::accounts::Account;
use cllt_core::net::Command;
use serde_json::{json, Value};
use tauri::State;

#[tauri::command]
pub fn state(shared: State<Shared>) -> Value {
    shared.with(|app| {
        json!({
            "rev": app.rev(),
            "accounts": app.views(),
            "accountsError": app.load_error,
        })
    })
}

#[tauri::command]
pub fn logs(shared: State<Shared>, id: u64) -> Vec<LogLine> {
    shared.with(|app| app.logs(id))
}

#[tauri::command]
pub fn login(shared: State<Shared>, id: u64) {
    shared.with(|app| app.login(id));
}

#[tauri::command]
pub fn logout(shared: State<Shared>, id: u64) {
    shared.with(|app| app.send(id, Command::Logout));
}

#[tauri::command]
pub fn login_all(shared: State<Shared>) {
    shared.with(|app| app.login_all());
}

#[tauri::command]
pub fn logout_all(shared: State<Shared>) {
    shared.with(|app| app.send_all(Command::Logout));
}

#[tauri::command]
pub fn fight(shared: State<Shared>, id: u64, target: String, count: u32, max_losses: u32) {
    shared.with(|app| {
        if target.is_empty() {
            return app.log(id, "Chọn một quái hoặc boss trước");
        }
        let command = Command::Fight {
            target,
            count: count.clamp(1, 999),
            max_losses: max_losses.clamp(1, 99),
        };
        app.send(id, command);
    });
}

/// "Tự làm nhiệm vụ": plays the steps of the current main quest it knows until Stop, a step it does not know, or
/// `max_losses` lost battles. With `step` = [quest id, step index] (▶ on a step), only that step, which must be the
/// current one of that quest.
#[tauri::command]
pub fn quest(shared: State<Shared>, id: u64, max_losses: u32, step: Option<(i32, i32)>) {
    shared.with(|app| {
        let command = Command::Quest {
            max_losses: max_losses.clamp(1, 99),
            step,
        };
        app.send(id, command);
    });
}

/// Dừng: ends the job or quest run; with `surrender` ("Đầu hàng") a battle in progress is left too, else played out.
#[tauri::command]
pub fn stop(shared: State<Shared>, id: u64, surrender: bool) {
    shared.with(|app| app.send(id, Command::Stop { surrender }));
}

/// The account of the add and edit form; `password` may be empty only when editing (it then stays as it was).
fn form(
    username: String,
    password: String,
    server_id: i32,
    label: String,
    editing: bool,
) -> Result<Account, String> {
    let username = username.trim().to_string();
    if username.is_empty() || (password.is_empty() && !editing) {
        return Err("Cần tên đăng nhập và mật khẩu".into());
    }
    if server_id <= 0 {
        return Err("Máy chủ phải là số dương".into());
    }
    Ok(Account {
        label: label.trim().to_string(),
        username,
        password,
        server_id,
        skill: None,
    })
}

/// Saves the account to accounts.json and returns its id; the error is shown in the dialog.
#[tauri::command]
pub async fn add_account(
    shared: State<'_, Shared>,
    username: String,
    password: String,
    server_id: i32,
    label: String,
) -> Result<u64, String> {
    shared
        .add(form(username, password, server_id, label, false)?)
        .await
}

/// Saves the changed account; an empty password keeps the saved one. The error is shown in the dialog.
#[tauri::command]
pub async fn update_account(
    shared: State<'_, Shared>,
    id: u64,
    username: String,
    password: String,
    server_id: i32,
    label: String,
) -> Result<(), String> {
    shared
        .update(id, form(username, password, server_id, label, true)?)
        .await
}

/// The error is shown in the dialog that asked; the account then stays.
#[tauri::command]
pub async fn remove_account(shared: State<'_, Shared>, id: u64) -> Result<(), String> {
    shared.remove(id).await
}
