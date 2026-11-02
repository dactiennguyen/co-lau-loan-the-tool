// The stylesheet of the admin page, inline with the nonce of the page's Content-Security-Policy (views/layout.tsx): the
// color and shape tokens of Material Design 3 (baseline scheme, light and dark as the system is set) that the Material
// Web components read, and the parts Material Web has no component for: top bar, cards, tables, chips, notices.
export const STYLE = `
:root{color-scheme:light dark;
--md-ref-typeface-brand:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--md-ref-typeface-plain:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
--md-sys-color-primary:#6750a4;--md-sys-color-on-primary:#fff;--md-sys-color-primary-container:#eaddff;--md-sys-color-on-primary-container:#4f378b;
--md-sys-color-secondary:#625b71;--md-sys-color-on-secondary:#fff;--md-sys-color-secondary-container:#e8def8;--md-sys-color-on-secondary-container:#4a4458;
--md-sys-color-tertiary:#7d5260;--md-sys-color-on-tertiary:#fff;--md-sys-color-tertiary-container:#ffd8e4;--md-sys-color-on-tertiary-container:#633b48;
--md-sys-color-error:#b3261e;--md-sys-color-on-error:#fff;--md-sys-color-error-container:#f9dedc;--md-sys-color-on-error-container:#8c1d18;
--md-sys-color-surface:#fef7ff;--md-sys-color-on-surface:#1d1b20;--md-sys-color-surface-variant:#e7e0ec;--md-sys-color-on-surface-variant:#49454f;
--md-sys-color-surface-container-lowest:#fff;--md-sys-color-surface-container-low:#f7f2fa;--md-sys-color-surface-container:#f3edf7;
--md-sys-color-surface-container-high:#ece6f0;--md-sys-color-surface-container-highest:#e6e0e9;
--md-sys-color-outline:#79747e;--md-sys-color-outline-variant:#cac4d0;--md-sys-color-inverse-surface:#322f35;--md-sys-color-inverse-on-surface:#f5eff7;
--md-sys-color-scrim:#000;--md-sys-color-shadow:#000;
--ok:#146c2e;--ok-container:#c4eed0;--on-ok-container:#0a3818;--warn:#7a5900;--warn-container:#ffdf9e;--on-warn-container:#3d2c00}
@media (prefers-color-scheme:dark){:root{
--md-sys-color-primary:#d0bcff;--md-sys-color-on-primary:#381e72;--md-sys-color-primary-container:#4f378b;--md-sys-color-on-primary-container:#eaddff;
--md-sys-color-secondary:#ccc2dc;--md-sys-color-on-secondary:#332d41;--md-sys-color-secondary-container:#4a4458;--md-sys-color-on-secondary-container:#e8def8;
--md-sys-color-tertiary:#efb8c8;--md-sys-color-on-tertiary:#492532;--md-sys-color-tertiary-container:#633b48;--md-sys-color-on-tertiary-container:#ffd8e4;
--md-sys-color-error:#f2b8b5;--md-sys-color-on-error:#601410;--md-sys-color-error-container:#8c1d18;--md-sys-color-on-error-container:#f9dedc;
--md-sys-color-surface:#141218;--md-sys-color-on-surface:#e6e0e9;--md-sys-color-surface-variant:#49454f;--md-sys-color-on-surface-variant:#cac4d0;
--md-sys-color-surface-container-lowest:#0f0d13;--md-sys-color-surface-container-low:#1d1b20;--md-sys-color-surface-container:#211f26;
--md-sys-color-surface-container-high:#2b2930;--md-sys-color-surface-container-highest:#36343b;
--md-sys-color-outline:#938f99;--md-sys-color-outline-variant:#49454f;--md-sys-color-inverse-surface:#e6e0e9;--md-sys-color-inverse-on-surface:#322f35;
--ok:#a3d9b1;--ok-container:#1e5130;--on-ok-container:#c4eed0;--warn:#f0c048;--warn-container:#5c4300;--on-warn-container:#ffdf9e}}
*{box-sizing:border-box}
body{margin:0;background:var(--md-sys-color-surface);color:var(--md-sys-color-on-surface);font:14px/1.5 var(--md-ref-typeface-plain);letter-spacing:.01em}
:not(:defined){visibility:hidden}
a{color:var(--md-sys-color-primary)}
code,.mono{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:.92em}
code{background:var(--md-sys-color-surface-container-highest);padding:1px 6px;border-radius:6px}
svg.icon{width:20px;height:20px;fill:currentColor;flex:none}
md-icon svg{width:100%;height:100%;fill:currentColor}
.top{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;align-items:center;gap:8px 16px;padding:8px 16px;background:var(--md-sys-color-surface-container);border-bottom:1px solid var(--md-sys-color-outline-variant)}
.brand{display:flex;align-items:center;gap:8px;font-size:18px;font-weight:500;margin-right:8px;color:var(--md-sys-color-on-surface)}
.brand svg{width:26px;height:26px;fill:var(--md-sys-color-primary)}
.top nav{display:flex;flex-wrap:wrap;gap:4px;flex:1}
.top form{margin:0}
main{max-width:1240px;margin:0 auto;padding:24px 16px 56px}
h1{font-size:28px;line-height:36px;font-weight:400;margin:0 0 4px}
.sub{color:var(--md-sys-color-on-surface-variant);margin:0 0 20px;max-width:900px}
.card{background:var(--md-sys-color-surface-container-low);border:1px solid var(--md-sys-color-outline-variant);border-radius:12px;padding:20px}
.card.narrow{max-width:440px;margin:10vh auto 0;padding:28px}
.card.narrow.top-space{margin-top:24px}
.card.gap{margin-bottom:16px}
.card.scroll{padding:0;overflow-x:auto}
.stack{display:flex;flex-direction:column;gap:16px}
.row{display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start}
.row>md-outlined-text-field{flex:1;min-width:220px}
.actions{display:flex;justify-content:flex-end;gap:8px;margin-top:8px}
.bar{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin:0 0 16px}
.bar .count{color:var(--md-sys-color-on-surface-variant)}
.bar #find{flex:1;min-width:240px;max-width:420px;margin-left:auto;--md-outlined-text-field-top-space:10px;--md-outlined-text-field-bottom-space:10px}
table{border-collapse:collapse;width:100%}
th,td{text-align:left;padding:10px 14px;border-bottom:1px solid var(--md-sys-color-outline-variant);vertical-align:middle;white-space:nowrap}
th{font-size:12px;font-weight:500;letter-spacing:.04em;color:var(--md-sys-color-on-surface-variant);background:var(--md-sys-color-surface-container)}
tbody tr:last-child td{border-bottom:0}
tbody tr:hover td{background:var(--md-sys-color-surface-container)}
tr.blocked td{background:color-mix(in srgb,var(--md-sys-color-error-container) 35%,transparent)}
td.wrap{white-space:normal;min-width:180px}
.muted{color:var(--md-sys-color-on-surface-variant)}
.secret{display:inline-block;min-width:88px}
.cell{display:flex;align-items:center;gap:4px}
.chip{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 12px 0 8px;border-radius:8px;font-size:13px;font-weight:500}
.chip svg{width:18px;height:18px;fill:currentColor}
.chip.on{background:var(--ok-container);color:var(--on-ok-container)}
.chip.off{background:var(--md-sys-color-error-container);color:var(--md-sys-color-on-error-container)}
.chip.idle{background:var(--md-sys-color-surface-container-highest);color:var(--md-sys-color-on-surface-variant)}
.msg{display:flex;align-items:flex-start;gap:12px;padding:12px 16px;border-radius:12px;margin:0 0 16px}
.msg svg{width:22px;height:22px;fill:currentColor;margin-top:1px}
.msg.ok{background:var(--ok-container);color:var(--on-ok-container)}
.msg.error{background:var(--md-sys-color-error-container);color:var(--md-sys-color-on-error-container)}
.msg.warn{background:var(--warn-container);color:var(--on-warn-container)}
.msg .body{flex:1;min-width:0}
.token{display:block;margin:10px 0;padding:10px 12px;word-break:break-all;font-size:14px;background:var(--md-sys-color-surface-container-lowest)}
.acts{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.acts form{display:flex;align-items:center;gap:4px;margin:0}
.acts md-outlined-text-field{width:190px;--md-outlined-text-field-top-space:6px;--md-outlined-text-field-bottom-space:6px;--md-outlined-text-field-input-text-size:13px}
.danger{--md-filled-button-container-color:var(--md-sys-color-error);--md-filled-button-label-text-color:var(--md-sys-color-on-error);
--md-filled-button-icon-color:var(--md-sys-color-on-error);--md-filled-button-hover-label-text-color:var(--md-sys-color-on-error);
--md-filled-button-focus-label-text-color:var(--md-sys-color-on-error);--md-filled-button-pressed-label-text-color:var(--md-sys-color-on-error);
--md-filled-button-hover-icon-color:var(--md-sys-color-on-error);--md-filled-button-focus-icon-color:var(--md-sys-color-on-error);--md-filled-button-pressed-icon-color:var(--md-sys-color-on-error);
--md-icon-button-icon-color:var(--md-sys-color-error);--md-icon-button-hover-icon-color:var(--md-sys-color-error);
--md-icon-button-focus-icon-color:var(--md-sys-color-error);--md-icon-button-pressed-icon-color:var(--md-sys-color-error);
--md-text-button-label-text-color:var(--md-sys-color-error);--md-text-button-icon-color:var(--md-sys-color-error)}
md-icon-button.copied{--md-icon-button-icon-color:var(--ok)}
md-dialog{max-width:480px}
@media (max-width:640px){main{padding:16px 10px 40px}.card{padding:16px}.top nav{order:3;flex-basis:100%}}
`;
