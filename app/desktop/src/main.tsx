// The theme and the utilities; the order of the layers is set in index.html.
import "@/styles/tailwind.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { BattleWindow } from "./battle/BattleWindow";
import { catchUiErrors } from "@/utils/uiErrors";
import "@/styles/tokens.css";

catchUiErrors();

// macOS draws its window buttons over the page (titleBarStyle Overlay); Windows and Linux keep a native title bar.
document.documentElement.dataset.os = navigator.userAgent.includes("Mac") ? "mac" : "other";
// The Android app (Tauri mobile): what the desktop alone has (Cửa sổ trận, the tray, the updater) hides with
// [data-platform=android], and isAndroid() of utils/platform.ts.
if (navigator.userAgent.includes("Android")) document.documentElement.dataset.platform = "android";

// index.html?battle=<id> is the battle window of that account (open_battle_window): not the app, nor its listeners.
const battle = new URLSearchParams(location.search).get("battle");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{battle != null ? <BattleWindow id={Number(battle)} /> : <App />}</React.StrictMode>,
);
