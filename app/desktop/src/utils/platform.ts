// Which device the app runs on, for what only one of them has: the Android app (Tauri mobile) has no Cửa sổ trận, tray
// or updater; a phone or a tablet upright (up to 899 px, the `phone:` variant of tailwind.css) gets the two-screen shell
// of App.tsx.

/** The Android app (main.tsx marks it with data-platform="android" too). */
export const isAndroid = () => typeof navigator !== "undefined" && navigator.userAgent.includes("Android");

/** The media query of a phone (or a tablet upright): the same width as the `phone:` variant of tailwind.css. */
export const PHONE_QUERY = "(max-width: 899px)";
