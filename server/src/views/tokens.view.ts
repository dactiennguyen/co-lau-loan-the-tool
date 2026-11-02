// API token: make one (shown once), and revoke them.
import { html } from 'hono/html';
import { MAX_TOKEN_NAME } from '../config/constants.ts';
import type { Token } from '../models/index.ts';
import { time } from '../utils/format.ts';
import { layout, message } from './layout.ts';

export function tokensView(nonce: string, list: Token[], made?: { name: string; token: string } | null, error?: string | null) {
  const shown = made
    ? html`<div class="msg ok" role="status">Đã tạo token "${made.name}". Chép ngay: server chỉ giữ dấu băm nên không hiện lại được.
<code class="token">${made.token}</code><button type="button" data-copy="${made.token}">Chép token</button></div>`
    : '';
  const rows = list.length
    ? list.map(
        (t) => html`<tr><td>${t.name}</td><td class="mono">${t.prefix}…</td><td>${time(t.createdAt)}</td><td>${time(t.lastUsedAt)}</td>
<td><form class="inline" method="post" action="/admin/tokens/${t.id}/delete" data-confirm="Thu hồi token ${t.name}? App dùng token này sẽ không gửi được nữa."><button class="small danger" type="submit">Thu hồi</button></form></td></tr>`,
      )
    : html`<tr><td colspan="5" class="muted">Chưa có token nào.</td></tr>`;
  return layout(
    'API token',
    html`<h1>API token</h1><p class="sub">App (hay curl) gửi kèm <code>Authorization: Bearer &lt;token&gt;</code> để đọc và gửi nick. Mỗi máy một token, để thu hồi riêng.</p>
${shown}${message('error', error)}<div class="card gap"><form method="post" action="/admin/tokens" class="row">
<div><label for="name">Tên token (ví dụ: Máy nhà, Máy công ty)</label><input id="name" name="name" type="text" maxlength="${MAX_TOKEN_NAME}" required></div>
<div class="fixed"><button class="primary" type="submit">Tạo token</button></div></form></div>
<div class="card scroll"><table><thead><tr><th scope="col">Tên</th><th scope="col">Bắt đầu bằng</th><th scope="col">Tạo lúc</th><th scope="col">Dùng lần cuối</th><th scope="col"><span class="muted">Thu hồi</span></th></tr></thead>
<tbody>${rows}</tbody></table></div>`,
    nonce,
    'tokens',
  );
}
