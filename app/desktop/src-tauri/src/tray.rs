// Thu nhỏ vào khay (docs/integration/rust/features.md#thu-nhỏ-vào-khay), as cockpit-tools does: the icon of the app in the
// tray (the menu bar on macOS) with Mở cửa sổ and Thoát, and what the close button of the window does
// (Settings::on_close). The accounts play in the sessions of cllt-core, not in the window, so a window hidden in the
// tray leaves every login, fight and quest run going; Thoát ends them as closing the app always did.
use crate::app::Shared;
use crate::settings::OnClose;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Window, WindowEvent};

/// The label of the window of tauri.conf.json.
const MAIN: &str = "main";
/// What the UI is told when the close button is pressed and Settings::on_close is Ask: it shows Đóng cửa sổ.
pub const CLOSE_ASKED: &str = "close-asked";

/// The tray icon: a left click shows the window, the menu has Mở cửa sổ and Thoát.
pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Mở cửa sổ", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Thoát", true, None::<&str>)?;
    let mut tray = TrayIconBuilder::with_id(MAIN)
        .tooltip("Cờ Lau Loạn Thế")
        .menu(&Menu::with_items(app, &[&open, &quit])?)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// The window back from the tray, the Dock or the taskbar, in front.
pub fn show(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// Thu nhỏ vào khay or Thoát ứng dụng, from the close button or from the Đóng cửa sổ dialog. Ask leaves the window as
/// it is.
pub fn close(app: &AppHandle, action: OnClose) {
    match action {
        OnClose::Ask => {}
        OnClose::Tray => {
            if let Some(window) = app.get_webview_window(MAIN) {
                let _ = window.hide();
            }
        }
        OnClose::Quit => app.exit(0),
    }
}

/// The close button of the window: kept open and hidden, or the dialog asked for, unless the setting is to quit.
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    let WindowEvent::CloseRequested { api, .. } = event else {
        return;
    };
    if window.label() != MAIN {
        return;
    }
    let on_close = window
        .try_state::<Shared>()
        .map(|shared| shared.with(|app| app.settings().on_close))
        .unwrap_or_default();
    api.prevent_close();
    match on_close {
        OnClose::Ask => {
            let _ = window.emit(CLOSE_ASKED, ());
        }
        action => close(window.app_handle(), action),
    }
}

/// macOS puts an app with no window on screen in App Nap: its timers are let run late, and a bot waits 8 s for an
/// answer and has 34 s for a turn. An activity begun for the whole run keeps it out of App Nap; the Mac may still sleep
/// when idle, which stops the accounts as before.
#[cfg(target_os = "macos")]
pub fn keep_awake() {
    use objc2_foundation::{NSActivityOptions, NSProcessInfo, NSString};
    let activity = NSProcessInfo::processInfo().beginActivityWithOptions_reason(
        NSActivityOptions::UserInitiatedAllowingIdleSystemSleep,
        &NSString::from_str("Các nick vẫn chơi khi cửa sổ ở khay"),
    );
    // Never ended: the activity lasts as long as the app.
    std::mem::forget(activity);
}
#[cfg(not(target_os = "macos"))]
pub fn keep_awake() {}
