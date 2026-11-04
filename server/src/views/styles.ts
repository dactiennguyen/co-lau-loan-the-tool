// The stylesheet of the admin page, inline with the nonce of the page's Content-Security-Policy (views/layout.tsx): a
// dark dashboard only. Tokens first (colors, radii, fonts), then the parts: top bar, stat cards, toolbar, segmented
// pills, buttons, fields, tables, status pills, the menu of a row, dialogs, toasts, the login card. The fonts are served
// from /assets/fonts (scripts/build-client.mjs), as the policy takes fonts of this site only.
export const STYLE = `
@font-face{font-family:Inter;font-style:normal;font-display:swap;font-weight:100 900;src:url(/assets/fonts/inter-vietnamese-wght-normal.woff2) format("woff2-variations");unicode-range:U+0102-0103,U+0110-0111,U+0128-0129,U+0168-0169,U+01A0-01A1,U+01AF-01B0,U+0300-0301,U+0303-0304,U+0308-0309,U+0323,U+0329,U+1EA0-1EF9,U+20AB}
@font-face{font-family:Inter;font-style:normal;font-display:swap;font-weight:100 900;src:url(/assets/fonts/inter-latin-wght-normal.woff2) format("woff2-variations");unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
@font-face{font-family:"JetBrains Mono";font-style:normal;font-display:swap;font-weight:100 800;src:url(/assets/fonts/jetbrains-mono-latin-wght-normal.woff2) format("woff2-variations");unicode-range:U+0000-00FF,U+2000-206F}
:root{color-scheme:dark;
--bg:#0A0A0B;--surface:#141416;--raised:#1B1B1F;--input:#0F0F11;--border:#26262B;--border-hover:#34343B;
--text:#EDEDEF;--muted:#8B8B93;--faint:#5C5C66;
--accent:#8B5CF6;--accent-hover:#7C3AED;--accent-soft:rgba(139,92,246,.14);--accent-text:#B9A2FB;
--ok:#22C55E;--ok-soft:rgba(34,197,94,.13);--warn:#F59E0B;--warn-soft:rgba(245,158,11,.13);--danger:#EF4444;--danger-soft:rgba(239,68,68,.13);
--r-card:10px;--r-control:8px;--r-chip:6px;
--sans:Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;--mono:"JetBrains Mono",ui-monospace,SFMono-Regular,Consolas,monospace;
--t:140ms ease}
@media (prefers-reduced-motion:reduce){:root{--t:0ms linear}*{animation:none!important}}
*{box-sizing:border-box}
html,body{background:var(--bg)}
body{margin:0;color:var(--text);font:14px/20px var(--sans);font-feature-settings:"cv11","ss01";-webkit-font-smoothing:antialiased}
a{color:inherit}
button,input,select{font:inherit;color:inherit}
.mono,code{font-family:var(--mono);font-size:12.5px;letter-spacing:0}
svg.icon{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
.muted{color:var(--muted)}
.faint{color:var(--faint)}
.small{font-size:12px;line-height:16px}
.strong{font-weight:550}
.nowrap{white-space:nowrap}
.warn-text{color:var(--warn)}
.stack{display:flex;flex-direction:column;gap:14px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
[hidden]{display:none!important}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px}

/* Top bar */
.top{position:sticky;top:0;z-index:20;height:56px;display:flex;align-items:center;gap:24px;padding:0 24px;background:rgba(10,10,11,.86);backdrop-filter:blur(8px);border-bottom:1px solid var(--border)}
.brand{display:flex;align-items:center;gap:10px;font-weight:600}
.brand-link{text-decoration:none}
.mark{display:grid;place-items:center;height:24px;padding:0 6px;border-radius:6px;background:linear-gradient(135deg,var(--accent),#6D28D9);color:#fff;font-size:11px;font-weight:700;letter-spacing:.06em}
.brand-name{color:var(--muted);font-weight:500}
.top nav{display:flex;gap:4px;flex:1}
.top nav a{display:flex;align-items:center;gap:8px;height:32px;padding:0 12px;border-radius:var(--r-control);color:var(--muted);text-decoration:none;transition:background var(--t),color var(--t)}
.top nav a:hover{color:var(--text);background:var(--surface)}
.top nav a[aria-current]{color:var(--text);background:var(--raised)}
.me{display:flex;align-items:center;gap:12px}
.avatar{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--raised);border:1px solid var(--border);font-size:12px;font-weight:600;color:var(--muted)}
.me form{margin:0}

main{max-width:1320px;margin:0 auto;padding:24px 24px 64px}
h1{font-size:20px;line-height:28px;font-weight:600;margin:0;letter-spacing:-.01em}
.sub{color:var(--muted);margin:2px 0 0}

/* Stat cards */
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:0 0 24px}
.stat{position:relative;padding:16px;border-radius:var(--r-card);background:var(--surface);border:1px solid var(--border);transition:border-color var(--t),box-shadow var(--t)}
.stat:hover{border-color:var(--border-hover);box-shadow:0 0 0 1px rgba(139,92,246,.18),0 8px 24px -12px rgba(139,92,246,.35)}
.stat .label{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px}
.stat .num{margin-top:8px;font-size:28px;line-height:32px;font-weight:600;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.stat .cap{margin-top:2px;color:var(--faint);font-size:12px}
.stat.warn .num{color:var(--warn)}

/* Toolbar */
.toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin:0 0 12px}
.toolbar .grow{flex:1}
.toolbar h1{margin-right:8px}

/* Segmented pills: the state filter, and the two ways to end a key */
.seg{display:inline-flex;padding:3px;gap:2px;border-radius:var(--r-control);background:var(--surface);border:1px solid var(--border)}
.seg button,.seg label{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border:0;border-radius:6px;background:none;color:var(--muted);cursor:pointer;white-space:nowrap;transition:background var(--t),color var(--t)}
.seg button:hover,.seg label:hover{color:var(--text)}
.seg button[aria-pressed=true],.seg label:has(input:checked){background:var(--raised);color:var(--text);box-shadow:0 1px 0 rgba(255,255,255,.04) inset}
.seg .n{color:var(--faint);font-variant-numeric:tabular-nums}
.seg button[aria-pressed=true] .n{color:var(--muted)}
.seg input{position:absolute;opacity:0;pointer-events:none}
.seg.full{display:flex}
.seg.full label{flex:1;justify-content:center}
.seg label:has(input:focus-visible){outline:2px solid var(--accent);outline-offset:1px}

/* Buttons */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:34px;padding:0 14px;border-radius:var(--r-control);border:1px solid var(--border);background:var(--raised);color:var(--text);font-weight:500;text-decoration:none;cursor:pointer;white-space:nowrap;transition:background var(--t),border-color var(--t),color var(--t)}
.btn:hover{border-color:var(--border-hover);background:#212126}
.btn.primary{background:var(--accent);border-color:transparent;color:#fff}
.btn.primary:hover{background:var(--accent-hover)}
.btn.ghost{background:none;border-color:transparent;color:var(--muted)}
.btn.ghost:hover{color:var(--text);background:var(--surface)}
.btn.ghost[aria-pressed=true]{color:var(--text);background:var(--raised);border-color:var(--border)}
.btn.danger{background:var(--danger);border-color:transparent;color:#fff}
.btn.danger:hover{background:#DC2626}
.btn.done{color:var(--ok);border-color:rgba(34,197,94,.35)}
.icon-btn{display:inline-grid;place-items:center;width:30px;height:30px;padding:0;border-radius:var(--r-control);border:1px solid transparent;background:none;color:var(--muted);cursor:pointer;transition:background var(--t),color var(--t)}
.icon-btn:hover{background:var(--raised);color:var(--text)}
.icon-btn.danger:hover{background:var(--danger-soft);color:var(--danger)}
.icon-btn.done{color:var(--ok)}
.icon-btn .on,.icon-btn[aria-pressed=true] .off{display:none}
.icon-btn[aria-pressed=true] .on{display:block}

/* Fields */
.field{display:flex;flex-direction:column;gap:6px;min-width:0}
.field>.label{font-size:12px;font-weight:500;color:var(--muted)}
.control{position:relative;display:flex;align-items:center}
.control>svg.icon{position:absolute;left:10px;color:var(--faint);pointer-events:none}
.control>.suffix{position:absolute;right:10px;color:var(--faint);font-size:12px;pointer-events:none}
.input,.select{width:100%;height:36px;padding:0 10px;border-radius:var(--r-control);border:1px solid var(--border);background:var(--input);color:var(--text);transition:border-color var(--t),box-shadow var(--t)}
.input::placeholder{color:var(--faint)}
.control>svg.icon+.input,.control>svg.icon+.select{padding-left:32px}
.input.has-suffix{padding-right:48px}
.input:hover,.select:hover{border-color:var(--border-hover)}
.input:focus,.select:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft),0 0 0 1px var(--accent)}
.input[aria-invalid=true]{border-color:var(--danger)}
.input[type=date]{color-scheme:dark}
.input:disabled,.select:disabled{opacity:.5}
.select{appearance:none;padding-right:32px;cursor:pointer}
.control>svg.chev{right:10px;left:auto}
.hint{font-size:12px;color:var(--faint)}
.error{font-size:12px;color:var(--danger)}
.search{width:280px}
.filter{width:220px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start}
.pair.wide-first{grid-template-columns:2fr 1fr}

/* Tables */
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-card)}
.card.table{overflow:clip}
table{width:100%;border-collapse:separate;border-spacing:0}
th,td{text-align:left;padding:10px 14px;border-bottom:1px solid var(--border);vertical-align:middle}
th{position:sticky;top:56px;z-index:5;background:var(--surface);font-size:11px;line-height:16px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:var(--faint);white-space:nowrap}
th.end,td.end{text-align:right;width:1%;white-space:nowrap;padding-right:10px}
tbody tr{transition:background var(--t)}
tbody tr:hover{background:var(--raised)}
tbody tr:last-child td{border-bottom:0}
tr.none td{padding:40px 14px;text-align:center;color:var(--muted)}
.cell{display:flex;align-items:center;gap:6px}
.key{font-family:var(--mono);font-size:12.5px;color:var(--text)}
.device-inline{display:none}

/* Status pills and tags */
.pill{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 8px;border-radius:var(--r-chip);font-size:12px;font-weight:500;white-space:nowrap}
.pill::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.pill.on{background:var(--ok-soft);color:var(--ok)}
.pill.idle{background:rgba(139,139,147,.12);color:var(--muted)}
.pill.warn{background:var(--warn-soft);color:var(--warn)}
.pill.off{background:var(--danger-soft);color:var(--danger)}
.tag{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 7px;border-radius:var(--r-chip);border:1px solid var(--border);background:var(--raised);color:var(--muted);font-size:12px;text-decoration:none;white-space:nowrap;transition:border-color var(--t),color var(--t)}
.tag svg.icon{width:13px;height:13px}
a.tag:hover{border-color:var(--accent);color:var(--accent-text)}

/* Nick of a key: "5/20" and a bar */
.meter{display:block;width:104px;text-decoration:none}
.meter .n{font-variant-numeric:tabular-nums}
.meter:hover .n{color:var(--accent-text)}
.bar{display:block;height:4px;margin-top:6px;border-radius:2px;background:var(--raised);overflow:hidden}
.bar progress{display:block;appearance:none;width:100%;height:4px;border:0;background:none;color:var(--accent)}
.bar progress::-webkit-progress-bar{background:none}
.bar progress::-webkit-progress-value{background:var(--accent);border-radius:2px}
.bar progress::-moz-progress-bar{background:var(--accent)}
.bar progress.full::-webkit-progress-value{background:var(--danger)}
.bar progress.full::-moz-progress-bar{background:var(--danger)}

/* The menu of a row (popover) */
.menu{position:fixed;inset:auto;margin:0;min-width:180px;padding:4px;border-radius:var(--r-card);border:1px solid var(--border);background:var(--raised);color:var(--text);box-shadow:0 12px 32px -8px rgba(0,0,0,.6)}
.menu:popover-open{display:flex;flex-direction:column}
.menu button{display:flex;align-items:center;gap:10px;height:32px;padding:0 10px;border:0;border-radius:6px;background:none;color:var(--text);text-align:left;cursor:pointer}
.menu button:hover,.menu button:focus-visible{background:#24242A;outline:none}
.menu button.danger{color:var(--danger)}
.menu button.danger:hover,.menu button.danger:focus-visible{background:var(--danger-soft)}
.menu hr{width:100%;height:1px;margin:4px 0;border:0;background:var(--border)}

/* Dialogs */
dialog{width:min(480px,calc(100vw - 32px));padding:0;border-radius:12px;border:1px solid var(--border);background:var(--surface);color:var(--text);box-shadow:0 24px 64px -16px rgba(0,0,0,.7)}
dialog.wide{width:min(540px,calc(100vw - 32px))}
dialog::backdrop{background:rgba(5,5,6,.6);backdrop-filter:blur(6px)}
dialog[open]{animation:pop var(--t)}
@keyframes pop{from{opacity:0;transform:translateY(4px) scale(.98)}}
.dlg-head{padding:20px 20px 0}
.dlg-head h2{margin:0;font-size:16px;line-height:24px;font-weight:600}
.dlg-head p{margin:4px 0 0;color:var(--muted)}
.dlg-body{display:flex;flex-direction:column;gap:14px;padding:16px 20px 20px}
.dlg-foot{display:flex;justify-content:flex-end;gap:8px;padding:12px 20px;border-top:1px solid var(--border);background:rgba(255,255,255,.015);border-radius:0 0 12px 12px}
.made-key{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 14px 14px 16px;border-radius:var(--r-card);border:1px solid var(--border);background:var(--input)}
.made-key code{font-size:19px;line-height:28px;font-weight:500;letter-spacing:.03em}
.facts{display:grid;grid-template-columns:auto 1fr;gap:8px 16px;margin:0}
.facts dt{color:var(--muted)}
.facts dd{margin:0}

/* Toasts */
.toasts{position:fixed;top:68px;right:16px;z-index:50;display:flex;flex-direction:column;gap:8px;pointer-events:none}
.toast{display:flex;align-items:flex-start;gap:10px;max-width:380px;padding:10px 14px;border-radius:var(--r-card);border:1px solid var(--border);background:var(--raised);box-shadow:0 12px 32px -8px rgba(0,0,0,.6);pointer-events:auto;animation:slide 160ms ease;transition:opacity var(--t),transform var(--t)}
.toast.ok svg.icon{color:var(--ok)}
.toast.error svg.icon{color:var(--danger)}
.toast.warn svg.icon{color:var(--warn)}
.toast.hide{opacity:0;transform:translateY(-4px)}
.toast svg.icon{margin-top:2px}
@keyframes slide{from{opacity:0;transform:translateY(-6px)}}

/* Inline notices (login, password) */
.alert{display:flex;gap:10px;padding:10px 12px;border-radius:var(--r-control);font-size:13px}
.alert svg.icon{margin-top:2px}
.alert.error{background:var(--danger-soft);color:#FCA5A5}
.alert.warn{background:var(--warn-soft);color:#FCD34D}
.alert.ok{background:var(--ok-soft);color:#86EFAC}

/* Empty state */
.empty{display:flex;flex-direction:column;align-items:center;gap:10px;padding:56px 24px;text-align:center;color:var(--muted)}
.empty .ring{display:grid;place-items:center;width:44px;height:44px;border-radius:50%;background:var(--raised);border:1px solid var(--border)}
.empty .ring svg.icon{width:20px;height:20px;color:var(--faint)}
.empty p{margin:0}

/* Login and password: a card in the middle */
.auth{display:grid;place-items:center;min-height:calc(100vh - 56px);padding:24px}
.auth.alone{min-height:100vh}
.auth .card{width:min(400px,100%);padding:28px}
.auth .brand{margin-bottom:20px}
.auth form{display:flex;flex-direction:column;gap:14px;margin-top:20px}
.auth .btn.primary{height:38px;margin-top:4px}

@media (max-width:1100px){.col-device{display:none}.device-inline{display:block;margin-top:4px}.stats{grid-template-columns:repeat(2,1fr)}}
@media (max-width:720px){main{padding:16px 12px 48px}.top{gap:12px;padding:0 12px}.brand-name,.me .avatar{display:none}.search,.filter{width:100%}th{top:56px}}
`;
