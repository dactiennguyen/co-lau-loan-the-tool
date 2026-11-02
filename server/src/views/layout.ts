// The frame of every admin page, and its notices. Views are hono/html templates: every value put in them is escaped
// (& < > " '), except other templates and raw(), so text from the database cannot become markup.
import { html, raw } from 'hono/html';
import { SCRIPT } from './script.ts';
import { STYLE } from './styles.ts';

export type Section = 'accounts' | 'devices' | 'tokens' | 'password';

/** A whole page. `nav` is the section shown, for a logged-in admin. */
export function layout(title: string, body: unknown, nonce: string, nav?: Section) {
  const link = (s: Section, href: string, label: string) =>
    html`<a href="${href}"${nav === s ? raw(' aria-current="page"') : ''}>${label}</a>`;
  const head = nav
    ? html`<header><b>CLLT Server</b><nav aria-label="Trang quản trị">${link('accounts', '/admin', 'Nick')}${link('devices', '/admin/devices', 'Thiết bị')}${link('tokens', '/admin/tokens', 'API token')}${link('password', '/admin/password', 'Đổi mật khẩu')}</nav>
       <form class="inline" method="post" action="/admin/logout"><button class="small" type="submit">Đăng xuất</button></form></header>`
    : '';
  return html`<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${title} · CLLT Server</title><style nonce="${nonce}">${raw(STYLE)}</style></head>
<body>${head}<main>${body}</main><script nonce="${nonce}">${raw(SCRIPT)}</script></body></html>`;
}

/** A notice: an error (read out at once), a success or a warning; nothing without text. */
export const message = (kind: 'error' | 'ok' | 'warn', text?: string | null) =>
  text ? html`<p class="msg ${kind}" role="${kind === 'error' ? 'alert' : 'status'}">${text}</p>` : '';

/** A dash in grey, for an empty cell. */
export const none = html`<span class="muted">—</span>`;
