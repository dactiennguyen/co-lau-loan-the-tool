//! Keeps the sessions of the Android app running with the screen off: a foreground service (type specialUse) with a
//! partial wake lock and a Wi-Fi lock, and a lasting notification "Co Lau Tool: N nick đang chạy" with Dừng tất cả
//! (android/, KeepalivePlugin.kt and KeepaliveService.kt). The app says how many accounts run ([`set_running`]); the
//! service runs while that is above 0. On the desktop every call does nothing: the app there runs in the tray.
//! [`share_image`] opens the share sheet on a picture (QR nick); [`install_apk`] the installer on a newer APK (Tự cập nhật).
use tauri::plugin::{Builder, TauriPlugin};
use tauri::{AppHandle, Runtime};

#[cfg(target_os = "android")]
mod android;

/// The plugin: on Android it registers the Kotlin plugin of android/ (KeepalivePlugin).
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("keepalive")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            android::register(_app, _api)?;
            Ok(())
        })
        .build()
}

/// `count` accounts run (logged in or logging in): the service starts at the first, its notification says how many,
/// and it stops at 0. The first start asks for the notification permission and to leave the app out of battery
/// optimisation. Blocks until the Kotlin side answered: call it off the main thread.
pub fn set_running<R: Runtime>(app: &AppHandle<R>, count: usize) -> Result<(), String> {
    #[cfg(target_os = "android")]
    return android::set_running(app, count);
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, count);
        Ok(())
    }
}

/// The share sheet of Android on the picture at `path` (in the app's cache), titled `title`. Blocks until the Kotlin side
/// answered. Not on the desktop, where the picture is saved to Downloads instead.
pub fn share_image<R: Runtime>(app: &AppHandle<R>, path: &str, title: &str) -> Result<(), String> {
    #[cfg(target_os = "android")]
    return android::share_image(app, path, title);
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, path, title);
        Err("Chỉ bản Android chia sẻ ảnh được".into())
    }
}

/// The installer of Android on the APK at `path` (in the app's cache). Err "allow" when the user has not let the app
/// install apps yet: the screen of that setting opened instead. Not on the desktop, which has its updater.
pub fn install_apk<R: Runtime>(app: &AppHandle<R>, path: &str) -> Result<(), String> {
    #[cfg(target_os = "android")]
    return android::install_apk(app, path);
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, path);
        Err("Chỉ bản Android cài APK".into())
    }
}

/// What Dừng tất cả of the notification does; the service stops itself after it.
pub fn on_stop_all<R: Runtime, F: Fn() + Send + Sync + 'static>(
    app: &AppHandle<R>,
    handler: F,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    return android::on_stop_all(app, handler);
    #[cfg(not(target_os = "android"))]
    {
        let _ = (app, handler);
        Ok(())
    }
}
