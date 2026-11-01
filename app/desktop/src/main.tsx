// The theme and the utilities; the order of the layers is set in index.html.
import "./styles/tailwind.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/tokens.css";

// macOS draws its window buttons over the page (titleBarStyle Overlay); Windows and Linux keep a native title bar.
document.documentElement.dataset.os = navigator.userAgent.includes("Mac") ? "mac" : "other";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
