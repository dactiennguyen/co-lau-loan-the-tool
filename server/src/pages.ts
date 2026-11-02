// The HTML of the admin page: Đăng nhập, Đổi mật khẩu, Nick, Thiết bị, API token. Everything that comes from the database goes
// through esc(); the only script is inline with the nonce of the response's Content-Security-Policy.
import type { Row } from './accounts.ts';
import { MIN_PASSWORD, type Token } from './auth.ts';
import { MAX_LABEL, MAX_REASON, type Device } from './devices.ts';

export const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const time = (ms: number | null) =>
  ms == null
    ? '—'
    : new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, dateStyle: 'short', timeStyle: 'short' });

const STYLE = `
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

const SCRIPT = `
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-reveal]');
  if (b) { const s = document.getElementById(b.dataset.reveal); const on = s.dataset.on !== '1';
    s.textContent = on ? s.dataset.secret : '••••••••'; s.dataset.on = on ? '1' : '0'; b.textContent = on ? 'Ẩn' : 'Hiện'; b.setAttribute('aria-pressed', String(on)); }
  const all = e.target.closest('[data-reveal-all]');
  if (all) { const on = all.getAttribute('aria-pressed') !== 'true'; all.setAttribute('aria-pressed', String(on)); all.textContent = on ? 'Ẩn mọi mật khẩu' : 'Hiện mọi mật khẩu';
    document.querySelectorAll('[data-reveal]').forEach((x) => { const s = document.getElementById(x.dataset.reveal);
      s.textContent = on ? s.dataset.secret : '••••••••'; s.dataset.on = on ? '1' : '0'; x.textContent = on ? 'Ẩn' : 'Hiện'; x.setAttribute('aria-pressed', String(on)); }); }
  const copy = e.target.closest('[data-copy]');
  if (copy) navigator.clipboard.writeText(copy.dataset.copy).then(() => { copy.textContent = 'Đã chép'; });
});
document.addEventListener('submit', (e) => { const m = e.target.dataset.confirm; if (m && !confirm(m)) e.preventDefault(); });
const find = document.getElementById('find');
if (find) find.addEventListener('input', () => { const q = find.value.trim().toLowerCase(); let n = 0;
  document.querySelectorAll('tbody tr[data-find]').forEach((tr) => { const show = !q || tr.dataset.find.includes(q); tr.hidden = !show; if (show) n++; });
  document.getElementById('shown').textContent = q ? n + ' dòng khớp' : ''; });
`;

export type Section = 'accounts' | 'devices' | 'tokens' | 'password';

/** A whole page. `nav` is the section shown, for a logged-in admin. */
export function page(title: string, body: string, nonce: string, nav?: Section): string {
  const link = (s: Section, href: string, label: string) =>
    `<a href="${href}"${nav === s ? ' aria-current="page"' : ''}>${label}</a>`;
  const head = nav
    ? `<header><b>CLLT Server</b><nav aria-label="Trang quản trị">${link('accounts', '/admin', 'Nick')}${link('devices', '/admin/devices', 'Thiết bị')}${link('tokens', '/admin/tokens', 'API token')}${link('password', '/admin/password', 'Đổi mật khẩu')}</nav>
       <form class="inline" method="post" action="/admin/logout"><button class="small" type="submit">Đăng xuất</button></form></header>`
    : '';
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)} · CLLT Server</title><style nonce="${nonce}">${STYLE}</style></head>
<body>${head}<main>${body}</main><script nonce="${nonce}">${SCRIPT}</script></body></html>`;
}

const message = (kind: 'error' | 'ok' | 'warn', text?: string | null) =>
  text ? `<p class="msg ${kind}" role="${kind === 'error' ? 'alert' : 'status'}">${esc(text)}</p>` : '';

export function loginPage(nonce: string, error?: string): string {
  return page(
    'Đăng nhập',
    `<div class="card narrow"><h1>Đăng nhập</h1><p class="sub">Trang quản trị nick của CLLT Tool.</p>${message('error', error)}
<form method="post" action="/admin/login"><label for="u">Tên đăng nhập</label><input id="u" name="username" type="text" autocomplete="username" required autofocus>
<label for="p">Mật khẩu</label><input id="p" name="password" type="password" autocomplete="current-password" required>
<p><button class="primary" type="submit">Đăng nhập</button></p></form></div>`,
    nonce,
  );
}

export function passwordPage(nonce: string, mustChange: boolean, error?: string | null, ok?: string | null): string {
  const warn = mustChange
    ? 'Đang dùng mật khẩu mặc định "admin". Đổi mật khẩu trước, sau đó mới dùng được các trang khác: trang này hiện mật khẩu game của mọi nick.'
    : null;
  return page(
    'Đổi mật khẩu',
    `<div class="card narrow top"><h1>Đổi mật khẩu</h1><p class="sub">Tài khoản quản trị: admin.</p>
${message('warn', warn)}${message('error', error)}${message('ok', ok)}
<form method="post" action="/admin/password"><label for="c">Mật khẩu hiện tại</label><input id="c" name="current" type="password" autocomplete="current-password" required>
<label for="n">Mật khẩu mới (ít nhất ${MIN_PASSWORD} ký tự)</label><input id="n" name="next" type="password" autocomplete="new-password" minlength="${MIN_PASSWORD}" required>
<label for="r">Nhập lại mật khẩu mới</label><input id="r" name="confirm" type="password" autocomplete="new-password" minlength="${MIN_PASSWORD}" required>
<p><button class="primary" type="submit">Đổi mật khẩu</button></p></form></div>`,
    nonce,
    'password',
  );
}

function proxyText(data: string): string {
  try {
    const p = (JSON.parse(data) as { proxy?: { host?: string; port?: number; enabled?: boolean } }).proxy;
    if (!p?.host) return '—';
    return `${p.host}:${p.port ?? ''}${p.enabled === false ? ' (tắt)' : ''}`;
  } catch {
    return '—';
  }
}

export function accountsPage(nonce: string, rows: Row[], flash?: string | null): string {
  const body = rows.length
    ? rows
        .map((r) => {
          const find = `${r.label} ${r.username}`.toLowerCase();
          return `<tr data-find="${esc(find)}"><td>${esc(r.label) || '<span class="muted">—</span>'}</td><td class="mono">${esc(r.username)}</td>
<td><span class="secret mono" id="pw${r.id}" data-secret="${esc(r.password)}">${r.password ? '••••••••' : '<span class="muted">(trống)</span>'}</span>
${r.password ? `<button class="small" type="button" data-reveal="pw${r.id}" aria-pressed="false" aria-label="Hiện mật khẩu của ${esc(r.username)}">Hiện</button> <button class="small" type="button" data-copy="${esc(r.password)}">Chép</button>` : ''}</td>
<td>${r.server_id}</td><td class="mono">${esc(proxyText(r.data))}</td><td>${esc(r.source) || '<span class="muted">—</span>'}</td><td>${time(r.updated_at)}</td>
<td><form class="inline" method="post" action="/admin/accounts/${r.id}/delete" data-confirm="Xoá nick ${esc(r.username)} khỏi server? App không bị ảnh hưởng."><button class="small danger" type="submit">Xoá</button></form></td></tr>`;
        })
        .join('')
    : `<tr><td colspan="8" class="muted wrap">Chưa có nick nào. Tạo một API token rồi gửi nick lên bằng <code>POST /api/accounts</code> (README.md của thư mục server).</td></tr>`;
  return page(
    'Nick',
    `<h1>Nick đã đồng bộ</h1><p class="sub">Nick app gửi lên qua API, mỗi server game và tài khoản một dòng. Mật khẩu lưu nguyên văn, không mã hoá.</p>
${message('ok', flash)}<div class="bar"><span class="count">${rows.length} nick <span id="shown"></span></span>
<input id="find" type="search" placeholder="Tìm theo tên hay tài khoản" aria-label="Tìm nick">
<button type="button" data-reveal-all aria-pressed="false">Hiện mọi mật khẩu</button><a class="btn" href="/admin/accounts.json" download>Tải JSON (Nhập được vào app)</a></div>
<div class="card scroll"><table><thead><tr><th scope="col">Tên hiển thị</th><th scope="col">Tài khoản</th><th scope="col">Mật khẩu</th><th scope="col">Server</th>
<th scope="col">Proxy</th><th scope="col">Gửi bằng token</th><th scope="col">Cập nhật</th><th scope="col"><span class="muted">Xoá</span></th></tr></thead><tbody>${body}</tbody></table></div>`,
    nonce,
    'accounts',
  );
}

export function tokensPage(nonce: string, list: Token[], made?: { name: string; token: string } | null, error?: string | null): string {
  const shown = made
    ? `<div class="msg ok" role="status">Đã tạo token "${esc(made.name)}". Chép ngay: server chỉ giữ dấu băm nên không hiện lại được.
<code class="token">${esc(made.token)}</code><button type="button" data-copy="${esc(made.token)}">Chép token</button></div>`
    : '';
  const rows = list.length
    ? list
        .map(
          (t) => `<tr><td>${esc(t.name)}</td><td class="mono">${esc(t.prefix)}…</td><td>${time(t.created_at)}</td><td>${time(t.last_used_at)}</td>
<td><form class="inline" method="post" action="/admin/tokens/${t.id}/delete" data-confirm="Thu hồi token ${esc(t.name)}? App dùng token này sẽ không gửi được nữa."><button class="small danger" type="submit">Thu hồi</button></form></td></tr>`,
        )
        .join('')
    : '<tr><td colspan="5" class="muted">Chưa có token nào.</td></tr>';
  return page(
    'API token',
    `<h1>API token</h1><p class="sub">App (hay curl) gửi kèm <code>Authorization: Bearer &lt;token&gt;</code> để đọc và gửi nick. Mỗi máy một token, để thu hồi riêng.</p>
${shown}${message('error', error)}<div class="card gap"><form method="post" action="/admin/tokens" class="row">
<div><label for="name">Tên token (ví dụ: Máy nhà, Máy công ty)</label><input id="name" name="name" type="text" maxlength="60" required></div>
<div class="fixed"><button class="primary" type="submit">Tạo token</button></div></form></div>
<div class="card scroll"><table><thead><tr><th scope="col">Tên</th><th scope="col">Bắt đầu bằng</th><th scope="col">Tạo lúc</th><th scope="col">Dùng lần cuối</th><th scope="col"><span class="muted">Thu hồi</span></th></tr></thead>
<tbody>${rows}</tbody></table></div>`,
    nonce,
    'tokens',
  );
}

/** "5 phút trước", from the time of the page. */
function ago(ms: number, now: number): string {
  const m = Math.max(0, Math.round((now - ms) / 60_000));
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} giờ trước` : `${Math.round(h / 24)} ngày trước`;
}

function nicks(accounts: string): string {
  try {
    const list = JSON.parse(accounts) as { username: string; serverId: number }[];
    if (!list.length) return '<span class="muted">—</span>';
    return list.map((a) => `<span class="mono">${esc(a.username)}</span>${a.serverId === 24 ? '' : ` <span class="muted">(${esc(a.serverId)})</span>`}`).join(', ');
  } catch {
    return '<span class="muted">—</span>';
  }
}

export function devicesPage(nonce: string, list: Device[], flash: string | null, now: number): string {
  const body = list.length
    ? list
        .map((d) => {
          const name = d.label || d.hostname || 'Không tên';
          const find = `${d.label} ${d.hostname} ${d.accounts} ${d.ip} ${d.id}`.toLowerCase();
          const at = `/admin/devices/${d.id}`;
          const state = d.blocked
            ? `<span class="tag off">Bị chặn</span>${d.reason ? `<div class="muted wrap">${esc(d.reason)}</div>` : ''}`
            : '<span class="tag on">Được dùng</span>';
          const toggle = d.blocked
            ? `<form class="act" method="post" action="${at}/unblock"><button class="small" type="submit">Bỏ chặn</button></form>`
            : `<form class="act" method="post" action="${at}/block" data-confirm="Chặn ${esc(name)}? App trên máy đó bị khoá trong tối đa 15 phút."><input name="reason" type="text" maxlength="${MAX_REASON}" placeholder="Lý do (app hiện cho người dùng)" aria-label="Lý do chặn ${esc(name)}"><button class="small danger" type="submit">Chặn</button></form>`;
          return `<tr data-find="${esc(find)}"${d.blocked ? ' class="blocked"' : ''}><td class="wrap"><b>${esc(name)}</b>${d.label && d.hostname ? `<div class="muted">${esc(d.hostname)}</div>` : ''}<div class="muted mono" title="${esc(d.id)}">${esc(d.id.slice(0, 12))}…</div></td>
<td>${esc(d.os) || '—'}<div class="muted">bản ${esc(d.version) || '—'}</div></td><td class="wrap">${nicks(d.accounts)}</td><td class="mono">${esc(d.ip) || '—'}</td>
<td title="Lần đầu: ${time(d.first_seen)}">${ago(d.last_seen, now)}<div class="muted">${time(d.last_seen)}</div></td><td class="wrap">${state}</td>
<td>${toggle}<form class="act" method="post" action="${at}/rename"><input name="label" type="text" maxlength="${MAX_LABEL}" value="${esc(d.label)}" placeholder="Tên (ví dụ: Máy anh A)" aria-label="Tên của ${esc(name)}"><button class="small" type="submit">Đặt tên</button></form>
<form class="act" method="post" action="${at}/delete" data-confirm="Xoá ${esc(name)} khỏi danh sách? Mở app lần tới nó sẽ hiện lại và vẫn được dùng."><button class="small" type="submit">Xoá khỏi danh sách</button></form></td></tr>`;
        })
        .join('')
    : '<tr><td colspan="7" class="muted wrap">Chưa có thiết bị nào. Mỗi máy mở app (bản có quản lý thiết bị) sẽ tự hiện ở đây.</td></tr>';
  const blocked = list.filter((d) => d.blocked).length;
  return page(
    'Thiết bị',
    `<h1>Thiết bị</h1><p class="sub">Máy nào mở app cũng tự báo về khi mở và 15 phút một lần, kèm danh sách nick (không có mật khẩu). Máy mới được dùng ngay; chặn một máy thì app trên máy đó bị khoá, kể cả khi mất mạng.</p>
${message('ok', flash)}<div class="bar"><span class="count">${list.length} thiết bị${blocked ? `, ${blocked} bị chặn` : ''} <span id="shown"></span></span>
<input id="find" type="search" placeholder="Tìm theo tên máy, nick, IP" aria-label="Tìm thiết bị"></div>
<div class="card scroll"><table><thead><tr><th scope="col">Thiết bị</th><th scope="col">Hệ điều hành</th><th scope="col">Nick</th><th scope="col">IP</th>
<th scope="col">Hoạt động</th><th scope="col">Trạng thái</th><th scope="col"><span class="muted">Thao tác</span></th></tr></thead><tbody>${body}</tbody></table></div>`,
    nonce,
    'devices',
  );
}
