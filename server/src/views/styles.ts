// The stylesheet of the admin page, inline with the nonce of the page's Content-Security-Policy (views/layout.ts).
export const STYLE = `
:root{--bg:#12141a;--card:#1b1f29;--line:#2c3242;--fg:#e8eaf0;--fg2:#a9b0c0;--fg3:#7a8296;--accent:#e0a63a;--danger:#e5534b;--good:#3fb950;color-scheme:dark}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent)}header{display:flex;flex-wrap:wrap;align-items:center;gap:8px 18px;padding:12px 20px;border-bottom:1px solid var(--line);background:var(--card)}
header b{font-size:16px;margin-right:auto}header nav{display:flex;gap:4px;flex-wrap:wrap}
header nav a{padding:6px 12px;border-radius:6px;color:var(--fg2);text-decoration:none}header nav a[aria-current]{background:var(--line);color:var(--fg)}
main{max-width:1180px;margin:0 auto;padding:20px 16px 48px}h1{font-size:20px;margin:0 0 4px}p.sub{margin:0 0 18px;color:var(--fg2)}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:18px}.narrow{max-width:420px;margin:48px auto}
label{display:block;margin:12px 0 4px;color:var(--fg2);font-size:14px}
input[type=text],input[type=password],input[type=search]{width:100%;padding:9px 11px;border-radius:7px;border:1px solid var(--line);background:var(--bg);color:var(--fg);font:inherit}
input:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
button,.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 14px;border-radius:7px;border:1px solid var(--line);background:var(--line);color:var(--fg);font:inherit;cursor:pointer;text-decoration:none;min-height:36px}
button.primary{background:var(--accent);border-color:var(--accent);color:#1a1300;font-weight:600}button.danger{background:transparent;border-color:var(--danger);color:var(--danger)}
button.small,.btn.small{padding:3px 9px;min-height:28px;font-size:13px}
.msg{padding:10px 12px;border-radius:7px;margin:0 0 14px;border:1px solid}.msg.error{border-color:var(--danger);color:#ffb4ae;background:#3a1715}
.msg.ok{border-color:var(--good);color:#a7f0b4;background:#10301a}.msg.warn{border-color:var(--accent);color:#f6d99c;background:#33270e}
.bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 12px}.bar input{max-width:280px}.bar .count{color:var(--fg3);margin-right:auto}
.scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:14px}th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle;white-space:nowrap}
th{color:var(--fg3);font-weight:600;font-size:13px}td.wrap{white-space:normal}code,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}
.secret{display:inline-block;min-width:88px}.muted{color:var(--fg3)}.token{display:block;padding:10px;border-radius:7px;background:var(--bg);border:1px dashed var(--accent);word-break:break-all;margin:8px 0}
.row{display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap}.row>div{flex:1 1 220px}.row>.fixed{flex:0 0 auto}form.inline{display:inline}
.narrow.top{margin-top:24px}.card.gap{margin-bottom:16px}
.tag{display:inline-block;padding:1px 8px;border-radius:99px;font-size:12px;border:1px solid}.tag.on{border-color:var(--good);color:#a7f0b4}.tag.off{border-color:var(--danger);color:#ffb4ae}
form.act{display:flex;gap:6px;align-items:center;margin:2px 0}form.act input{width:150px;padding:4px 8px;font-size:13px}tr.blocked td{background:#24141a}
@media (prefers-reduced-motion:no-preference){button,.btn{transition:background .15s}}
`;
