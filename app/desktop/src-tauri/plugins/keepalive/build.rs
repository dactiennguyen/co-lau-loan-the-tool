// No command the UI can call: the app drives the service from Rust (src/lib.rs). tauri-build adds the Android library
// of android/ to the app's Gradle build.
const COMMANDS: &[&str] = &[];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
