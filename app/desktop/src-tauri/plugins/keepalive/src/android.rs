// The Kotlin plugin of android/ (vn.colauloanthe.keepalive.KeepalivePlugin), reached through its PluginHandle.
use serde::Serialize;
use tauri::ipc::{Channel, InvokeResponseBody};
use tauri::plugin::{PluginApi, PluginHandle};
use tauri::{AppHandle, Manager, Runtime};

struct Keepalive<R: Runtime>(PluginHandle<R>);

pub fn register<R: Runtime>(
    app: &AppHandle<R>,
    api: PluginApi<R, ()>,
) -> Result<(), Box<dyn std::error::Error>> {
    let handle = api.register_android_plugin("vn.colauloanthe.keepalive", "KeepalivePlugin")?;
    app.manage(Keepalive(handle));
    Ok(())
}

fn handle<R: Runtime>(app: &AppHandle<R>) -> Result<PluginHandle<R>, String> {
    app.try_state::<Keepalive<R>>()
        .map(|k| k.0.clone())
        .ok_or_else(|| "plugin keepalive chưa sẵn sàng".to_string())
}

pub fn set_running<R: Runtime>(app: &AppHandle<R>, count: usize) -> Result<(), String> {
    #[derive(Serialize)]
    struct Args {
        count: usize,
    }
    handle(app)?
        .run_mobile_plugin::<serde_json::Value>("setRunning", Args { count })
        .map(|_| ())
        .map_err(|e| e.to_string())
}

pub fn share_image<R: Runtime>(app: &AppHandle<R>, path: &str, title: &str) -> Result<(), String> {
    #[derive(Serialize)]
    struct Args<'a> {
        path: &'a str,
        title: &'a str,
    }
    handle(app)?
        .run_mobile_plugin::<serde_json::Value>("shareImage", Args { path, title })
        .map(|_| ())
        .map_err(|e| e.to_string())
}

pub fn on_stop_all<R: Runtime, F: Fn() + Send + Sync + 'static>(
    app: &AppHandle<R>,
    handler: F,
) -> Result<(), String> {
    #[derive(Serialize)]
    struct Listen {
        event: &'static str,
        handler: Channel,
    }
    let channel = Channel::new(move |_body: InvokeResponseBody| {
        handler();
        Ok(())
    });
    handle(app)?
        .run_mobile_plugin::<()>(
            "registerListener",
            Listen {
                event: "stopAll",
                handler: channel,
            },
        )
        .map_err(|e| e.to_string())
}
