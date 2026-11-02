// Nick: every account the app sent, with its password behind Hiện, Chép, and Xoá.
import { html } from 'hono/html';
import type { AccountRow } from '../models/index.ts';
import { time } from '../utils/format.ts';
import { layout, message, none } from './layout.ts';

/** "host:port" of the account's proxy, "(tắt)" when it is off. */
function proxyText(data: string): string {
  try {
    const p = (JSON.parse(data) as { proxy?: { host?: string; port?: number; enabled?: boolean } }).proxy;
    if (!p?.host) return '—';
    return `${p.host}:${p.port ?? ''}${p.enabled === false ? ' (tắt)' : ''}`;
  } catch {
    return '—';
  }
}

function row(r: AccountRow) {
  const find = `${r.label} ${r.username}`.toLowerCase();
  const secret = r.password
    ? html`<button class="small" type="button" data-reveal="pw${r.id}" aria-pressed="false" aria-label="Hiện mật khẩu của ${r.username}">Hiện</button> <button class="small" type="button" data-copy="${r.password}">Chép</button>`
    : '';
  return html`<tr data-find="${find}"><td>${r.label || none}</td><td class="mono">${r.username}</td>
<td><span class="secret mono" id="pw${r.id}" data-secret="${r.password}">${r.password ? '••••••••' : html`<span class="muted">(trống)</span>`}</span>
${secret}</td>
<td>${r.serverId}</td><td class="mono">${proxyText(r.data)}</td><td>${r.source || none}</td><td>${time(r.updatedAt)}</td>
<td><form class="inline" method="post" action="/admin/accounts/${r.id}/delete" data-confirm="Xoá nick ${r.username} khỏi server? App không bị ảnh hưởng."><button class="small danger" type="submit">Xoá</button></form></td></tr>`;
}

export function accountsView(nonce: string, rows: AccountRow[], flash?: string | null) {
  const body = rows.length
    ? rows.map(row)
    : html`<tr><td colspan="8" class="muted wrap">Chưa có nick nào. Tạo một API token rồi gửi nick lên bằng <code>POST /api/accounts</code> (README.md của thư mục server).</td></tr>`;
  return layout(
    'Nick',
    html`<h1>Nick đã đồng bộ</h1><p class="sub">Nick app gửi lên qua API, mỗi server game và tài khoản một dòng. Mật khẩu lưu nguyên văn, không mã hoá.</p>
${message('ok', flash)}<div class="bar"><span class="count">${rows.length} nick <span id="shown"></span></span>
<input id="find" type="search" placeholder="Tìm theo tên hay tài khoản" aria-label="Tìm nick">
<button type="button" data-reveal-all aria-pressed="false">Hiện mọi mật khẩu</button><a class="btn" href="/admin/accounts.json" download>Tải JSON (Nhập được vào app)</a></div>
<div class="card scroll"><table><thead><tr><th scope="col">Tên hiển thị</th><th scope="col">Tài khoản</th><th scope="col">Mật khẩu</th><th scope="col">Server</th>
<th scope="col">Proxy</th><th scope="col">Gửi bằng token</th><th scope="col">Cập nhật</th><th scope="col"><span class="muted">Xoá</span></th></tr></thead><tbody>${body}</tbody></table></div>`,
    nonce,
    'accounts',
  );
}
