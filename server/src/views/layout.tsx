// The frame of every admin page, and its notices. Views are hono/jsx components, written as React components are and
// rendered to HTML on the Worker: every value put in them is escaped, so text from the database cannot become markup.
// The one stylesheet and script go in as they are, with the nonce of the page's Content-Security-Policy.
import type { Child, PropsWithChildren } from 'hono/jsx';
import { SCRIPT } from './script.ts';
import { STYLE } from './styles.ts';

export type Section = 'accounts' | 'devices' | 'tokens' | 'password';

const SECTIONS: [Section, string, string][] = [
  ['accounts', '/admin', 'Nick'],
  ['devices', '/admin/devices', 'Thiết bị'],
  ['tokens', '/admin/tokens', 'API token'],
  ['password', '/admin/password', 'Đổi mật khẩu'],
];

type LayoutProps = PropsWithChildren<{ title: string; nonce: string; /** The section shown, for a logged-in admin. */ nav?: Section }>;

export function Layout({ title, nonce, nav, children }: LayoutProps) {
  return (
    <html lang="vi">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="robots" content="noindex" />
        <title>{title} · CLLT Server</title>
        <style nonce={nonce} dangerouslySetInnerHTML={{ __html: STYLE }} />
      </head>
      <body>
        {nav && (
          <header>
            <b>CLLT Server</b>
            <nav aria-label="Trang quản trị">
              {SECTIONS.map(([s, href, label]) => (
                <a href={href} aria-current={nav === s ? 'page' : undefined}>
                  {label}
                </a>
              ))}
            </nav>
            <form class="inline" method="post" action="/admin/logout">
              <button class="small" type="submit">
                Đăng xuất
              </button>
            </form>
          </header>
        )}
        <main>{children}</main>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: SCRIPT }} />
      </body>
    </html>
  );
}

/** A notice: an error (read out at once), a success or a warning; nothing without text. */
export function Message({ kind, text }: { kind: 'error' | 'ok' | 'warn'; text?: string | null }) {
  if (!text) return null;
  return (
    <p class={`msg ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      {text}
    </p>
  );
}

/** A dash in grey, for an empty cell. */
export const None = () => <span class="muted">—</span>;

/** A table in a card, with its header cells. */
export function Table({ head, children }: { head: Child[]; children: Child }) {
  return (
    <div class="card scroll">
      <table>
        <thead>
          <tr>
            {head.map((h) => (
              <th scope="col">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
