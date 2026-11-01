// Desktop app (docs/integration/rust/README.md): Tauri 2 with the React + TypeScript UI of ../src. Add accounts, log them
// in, and see for each one its character (level, HP, EXP, stats), where it stands (map, zone), who else is in the zone,
// and a fight job ("đánh X N lần").
//
//   npm run tauri dev                    window with the Vite dev server (hot reload of ../src)
//   npm run app                          the app in app/target/release/bundle: macos/colautool.app (only that,
//                                        tauri.macos.conf.json), nsis/ and msi/ on Windows, deb/, rpm/, appimage/ on Linux
//   flags after `--`: --login-all logs every account in at start; --sample shows sample accounts, no network;
//   --dump-sample=FILE writes the sample accounts as the UI receives them (the UI reads it in a plain browser).
//
// app.rs keeps the accounts and sessions and sends the UI what changed; commands.rs is what the UI can call; view.rs is what the
// UI is sent (../src/api/types.ts mirrors it); paths.rs finds accounts.json and data/maps.json; sample.rs serves --sample;
// update.rs updates the installed app from the GitHub releases; settings.rs is the Cài đặt of the app (settings.json);
// tray.rs is the tray icon and what the close button of the window does (Thu nhỏ vào khay).
mod app;
mod commands;
mod paths;
mod sample;
mod settings;
mod store;
mod tray;
mod update;
mod view;

use app::{App, Shared};
use cllt_core::net::Manager;
use tauri::Manager as _;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().collect();
    let flag = |name: &str| args.iter().any(|a| a == name);
    if let Some(out) = args.iter().find_map(|a| a.strip_prefix("--dump-sample=")) {
        if let Err(e) = sample::dump(out.as_ref()) {
            eprintln!("{e}");
            std::process::exit(1);
        }
        return;
    }
    let (sample, login_all) = (flag("--sample"), flag("--login-all"));

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(update::Updates::default())
        .setup(move |tauri_app| {
            // Session events come from tokio threads and update the accounts; the flusher thread tells the UI.
            let events = tauri_app.handle().clone();
            let manager = if sample {
                None
            } else {
                Some(Manager::new(paths::atlas(), move |id, event| {
                    if let Some(shared) = events.try_state::<Shared>() {
                        shared.with(|app| app.on_event(id, event));
                    }
                })?)
            };
            let (wake, woken) = std::sync::mpsc::channel();
            let accounts = paths::accounts(tauri_app.path())?;
            let mut app = App::new(manager, accounts.clone(), wake);
            app.apply_settings(settings::first_load(&app.settings_path(), &accounts));
            if sample {
                sample::fill(&mut app);
            } else {
                app.load();
                match store::Store::open(&paths::db(&accounts)) {
                    Ok(store) => {
                        if let Err(e) = store.prune(app::epoch_ms()) {
                            eprintln!("cllt.db: không xoá được nhật ký và trận cũ: {e}");
                        }
                        app.set_store(std::sync::Arc::new(store));
                        app.load_history();
                    }
                    Err(e) => eprintln!("Không mở được cllt.db: {e}"),
                }
            }
            tauri_app.manage(Shared::new(app));
            app::spawn_flusher(tauri_app.handle().clone(), woken);
            if login_all {
                tauri_app.state::<Shared>().with(|app| app.login_all());
            }
            update::start(tauri_app.handle(), sample);
            tray::create(tauri_app.handle())?;
            tray::keep_awake();
            Ok(())
        })
        .on_window_event(tray::on_window_event)
        .invoke_handler(tauri::generate_handler![
            commands::state,
            commands::logs,
            commands::login,
            commands::logout,
            commands::login_all,
            commands::logout_all,
            commands::fight,
            commands::quest,
            commands::stop,
            commands::set_stats,
            commands::set_fight,
            commands::set_fight_target,
            commands::set_losses_left,
            commands::add_stat,
            commands::upgrade_skill,
            commands::item_action,
            commands::list_zones,
            commands::change_zone,
            commands::go_to_map,
            commands::shop_trip,
            commands::shop_closed,
            commands::open_shop,
            commands::buy,
            commands::open_shop_kind,
            commands::smith_merge,
            commands::merge_forecast,
            commands::smith_upgrade,
            commands::smith_craft,
            commands::smith_ice,
            commands::elder_points,
            commands::smith_separate,
            commands::smith_transmute,
            commands::transmute_targets,
            commands::exchange_luong,
            commands::redeem_codes,
            commands::reset_gift_count,
            commands::mail_list,
            commands::mail_open,
            commands::mail_claim,
            commands::mail_claim_all,
            commands::mail_delete,
            commands::market_open,
            commands::market_page,
            commands::market_buy,
            commands::market_sell,
            commands::market_withdraw,
            commands::market_extend,
            commands::log_history,
            commands::battle_stats,
            commands::battle_history,
            commands::add_account,
            commands::update_account,
            commands::test_proxy,
            commands::account_secrets,
            commands::remove_account,
            commands::settings,
            commands::set_settings,
            commands::export_battles,
            commands::reveal_export,
            commands::update_status,
            commands::check_update,
            commands::install_update,
            commands::close_window,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            tauri::RunEvent::Exit => update::install_on_quit(app),
            // The Dock icon clicked while the window is in the tray.
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen {
                has_visible_windows: false,
                ..
            } => tray::show(app),
            _ => {}
        });
}
