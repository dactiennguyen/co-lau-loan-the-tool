// Thiết bị: every device that said hello, with its accounts; Chặn with a reason, Bỏ chặn, Đặt tên, Xoá khỏi danh sách.
import { html } from 'hono/html';
import { DEFAULT_SERVER_ID, MAX_BLOCK_REASON, MAX_DEVICE_LABEL } from '../config/constants.ts';
import type { Device } from '../models/index.ts';
import { ago, time } from '../utils/format.ts';
import { layout, message, none } from './layout.ts';

/** The accounts of the device's last hello, the game server after any but the usual one. */
function nicks(accounts: string) {
  try {
    const list = JSON.parse(accounts) as { username: string; serverId: number }[];
    if (!list.length) return none;
    return list.map(
      (a, i) =>
        html`${i ? ', ' : ''}<span class="mono">${a.username}</span>${a.serverId === DEFAULT_SERVER_ID ? '' : html` <span class="muted">(${a.serverId})</span>`}`,
    );
  } catch {
    return none;
  }
}

function row(d: Device, now: number) {
  const name = d.label || d.hostname || 'Không tên';
  const find = `${d.label} ${d.hostname} ${d.accounts} ${d.ip} ${d.id}`.toLowerCase();
  const at = `/admin/devices/${d.id}`;
  const state = d.blocked
    ? html`<span class="tag off">Bị chặn</span>${d.reason ? html`<div class="muted wrap">${d.reason}</div>` : ''}`
    : html`<span class="tag on">Được dùng</span>`;
  const toggle = d.blocked
    ? html`<form class="act" method="post" action="${at}/unblock"><button class="small" type="submit">Bỏ chặn</button></form>`
    : html`<form class="act" method="post" action="${at}/block" data-confirm="Chặn ${name}? App trên máy đó bị khoá trong tối đa 15 phút."><input name="reason" type="text" maxlength="${MAX_BLOCK_REASON}" placeholder="Lý do (app hiện cho người dùng)" aria-label="Lý do chặn ${name}"><button class="small danger" type="submit">Chặn</button></form>`;
  return html`<tr data-find="${find}"${d.blocked ? html` class="blocked"` : ''}><td class="wrap"><b>${name}</b>${d.label && d.hostname ? html`<div class="muted">${d.hostname}</div>` : ''}<div class="muted mono" title="${d.id}">${d.id.slice(0, 12)}…</div></td>
<td>${d.os || '—'}<div class="muted">bản ${d.version || '—'}</div></td><td class="wrap">${nicks(d.accounts)}</td><td class="mono">${d.ip || '—'}</td>
<td title="Lần đầu: ${time(d.firstSeen)}">${ago(d.lastSeen, now)}<div class="muted">${time(d.lastSeen)}</div></td><td class="wrap">${state}</td>
<td>${toggle}<form class="act" method="post" action="${at}/rename"><input name="label" type="text" maxlength="${MAX_DEVICE_LABEL}" value="${d.label}" placeholder="Tên (ví dụ: Máy anh A)" aria-label="Tên của ${name}"><button class="small" type="submit">Đặt tên</button></form>
<form class="act" method="post" action="${at}/delete" data-confirm="Xoá ${name} khỏi danh sách? Mở app lần tới nó sẽ hiện lại và vẫn được dùng."><button class="small" type="submit">Xoá khỏi danh sách</button></form></td></tr>`;
}

export function devicesView(nonce: string, list: Device[], flash: string | null, now: number) {
  const body = list.length
    ? list.map((d) => row(d, now))
    : html`<tr><td colspan="7" class="muted wrap">Chưa có thiết bị nào. Mỗi máy mở app (bản có quản lý thiết bị) sẽ tự hiện ở đây.</td></tr>`;
  const blocked = list.filter((d) => d.blocked).length;
  return layout(
    'Thiết bị',
    html`<h1>Thiết bị</h1><p class="sub">Máy nào mở app cũng tự báo về khi mở và 15 phút một lần, kèm danh sách nick (không có mật khẩu). Máy mới được dùng ngay; chặn một máy thì app trên máy đó bị khoá, kể cả khi mất mạng.</p>
${message('ok', flash)}<div class="bar"><span class="count">${list.length} thiết bị${blocked ? `, ${blocked} bị chặn` : ''} <span id="shown"></span></span>
<input id="find" type="search" placeholder="Tìm theo tên máy, nick, IP" aria-label="Tìm thiết bị"></div>
<div class="card scroll"><table><thead><tr><th scope="col">Thiết bị</th><th scope="col">Hệ điều hành</th><th scope="col">Nick</th><th scope="col">IP</th>
<th scope="col">Hoạt động</th><th scope="col">Trạng thái</th><th scope="col"><span class="muted">Thao tác</span></th></tr></thead><tbody>${body}</tbody></table></div>`,
    nonce,
    'devices',
  );
}
