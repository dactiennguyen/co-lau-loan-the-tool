// What the web UI can ask for (window.__TAURI__.core.invoke). Accounts are named by their stable id; every command that
// changes something broadcasts the new state.
use crate::app::{broadcast, Shared};
use crate::view::LogLine;
use cllt_core::accounts::Account;
use cllt_core::net::Command;
use serde_json::{json, Value};
use tauri::{AppHandle, State};

#[tauri::command]
pub fn state(shared: State<Shared>) -> Value {
    shared.with(|app| {
        json!({
            "accounts": app.views(),
            "accountsPath": app.path_shown(),
            "accountsError": app.load_error,
        })
    })
}

#[tauri::command]
pub fn logs(shared: State<Shared>, id: u64) -> Vec<LogLine> {
    shared.with(|app| app.logs(id))
}

#[tauri::command]
pub fn login(handle: AppHandle, shared: State<Shared>, id: u64) {
    shared.with(|app| app.login(id));
    broadcast(&handle);
}

#[tauri::command]
pub fn logout(handle: AppHandle, shared: State<Shared>, id: u64) {
    shared.with(|app| app.send(id, Command::Logout));
    broadcast(&handle);
}

#[tauri::command]
pub fn login_all(handle: AppHandle, shared: State<Shared>) {
    shared.with(|app| app.login_all());
    broadcast(&handle);
}

#[tauri::command]
pub fn logout_all(handle: AppHandle, shared: State<Shared>) {
    shared.with(|app| app.send_all(Command::Logout));
    broadcast(&handle);
}

#[tauri::command]
pub fn fight(
    handle: AppHandle,
    shared: State<Shared>,
    id: u64,
    target: String,
    count: u32,
    max_losses: u32,
) {
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
    broadcast(&handle);
}

#[tauri::command]
pub fn stop(handle: AppHandle, shared: State<Shared>, id: u64) {
    shared.with(|app| app.send(id, Command::Stop));
    broadcast(&handle);
}

/// Saves the account to accounts.json and returns its id; the error is shown in the dialog.
#[tauri::command]
pub fn add_account(
    handle: AppHandle,
    shared: State<Shared>,
    username: String,
    password: String,
    server_id: i32,
    label: String,
) -> Result<u64, String> {
    let username = username.trim().to_string();
    if username.is_empty() || password.is_empty() {
        return Err("Cần tên đăng nhập và mật khẩu".into());
    }
    if server_id <= 0 {
        return Err("Máy chủ phải là số dương".into());
    }
    let id = shared.with(|app| {
        app.add_saved(Account {
            label: label.trim().to_string(),
            username,
            password,
            server_id,
            skill: None,
        })
    })?;
    broadcast(&handle);
    Ok(id)
}

#[tauri::command]
pub fn remove_account(handle: AppHandle, shared: State<Shared>, id: u64) {
    shared.with(|app| app.remove(id));
    broadcast(&handle);
}
