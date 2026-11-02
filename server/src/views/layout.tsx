// The frame of every admin page and the parts the pages share. Views are hono/jsx components, written as React
// components are and rendered to HTML on the Worker: every value put in them is escaped, so text from the database
// cannot become markup. The page is drawn with Material Design 3: the Material Web components (md-*, defined by
// /assets/admin.js, client/admin.ts) and Material Symbols drawn inline (icons.ts). The stylesheet and the script go in
// with the nonce of the page's Content-Security-Policy.
import { raw } from 'hono/html';
import type { Child, PropsWithChildren } from 'hono/jsx';
import { ICONS, type IconName } from './icons.ts';
import { STYLE } from './styles.ts';

/** Where the script of the page is served from (public/, wrangler.toml [assets]). */
export const SCRIPT_SRC = '/assets/admin.js';

export type Section = 'accounts' | 'devices' | 'tokens' | 'password';

const SECTIONS: [Section, string, string, IconName][] = [
  ['accounts', '/admin', 'Nick', 'group'],
  ['devices', '/admin/devices', 'Thiết bị', 'devices'],
  ['tokens', '/admin/tokens', 'API token', 'key'],
  ['password', '/admin/password', 'Đổi mật khẩu', 'password'],
];

/** A Material Symbol drawn inline. `md` wraps it in md-icon, as an md-icon-button holds it; `slot` puts it where a
 * Material button or field shows its icon; `selected` is the icon of a toggle md-icon-button when on. */
export function Icon({ name, md, slot, selected }: { name: IconName; md?: boolean; slot?: string; selected?: boolean }) {
  // The paths come from icons.ts, generated from Material Symbols: markup of the repository, never of a request.
  const svg = raw(`<svg class="icon" viewBox="0 -960 960 960" aria-hidden="true">${ICONS[name]}</svg>`);
  return md || slot || selected ? <md-icon slot={selected ? 'selected' : slot}>{svg}</md-icon> : <>{svg}</>;
}

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
        <script type="module" nonce={nonce} src={SCRIPT_SRC} />
      </head>
      <body>
        {nav && (
          <header class="top">
            <span class="brand">
              <Icon name="admin_panel_settings" />
              CLLT Server
            </span>
            <nav aria-label="Trang quản trị">
              {SECTIONS.map(([s, href, label, icon]) =>
                nav === s ? (
                  <md-filled-tonal-button href={href} aria-current="page">
                    <Icon name={icon} slot="icon" />
                    {label}
                  </md-filled-tonal-button>
                ) : (
                  <md-text-button href={href}>
                    <Icon name={icon} slot="icon" />
                    {label}
                  </md-text-button>
                ),
              )}
            </nav>
            <form method="post" action="/admin/logout">
              <md-outlined-button type="submit">
                <Icon name="logout" slot="icon" />
                Đăng xuất
              </md-outlined-button>
            </form>
          </header>
        )}
        <main>{children}</main>
        {nav && <ConfirmDialog />}
      </body>
    </html>
  );
}

/** The Material dialog a form with data-confirm opens before it is sent (client/admin.ts). */
function ConfirmDialog() {
  return (
    <md-dialog id="confirm">
      <div slot="headline">Xác nhận</div>
      <form slot="content" id="confirm-form" method="dialog">
        <p data-question></p>
      </form>
      <div slot="actions">
        <md-text-button form="confirm-form" value="cancel">
          Huỷ
        </md-text-button>
        <md-filled-button form="confirm-form" value="ok">
          Đồng ý
        </md-filled-button>
      </div>
    </md-dialog>
  );
}

const NOTICE: Record<'error' | 'ok' | 'warn', IconName> = { error: 'error', ok: 'check_circle', warn: 'warning' };

/** A notice: an error (read out at once), a success or a warning; nothing without text. */
export function Message({ kind, text, children }: PropsWithChildren<{ kind: 'error' | 'ok' | 'warn'; text?: string | null }>) {
  if (!text && !children) return null;
  return (
    <div class={`msg ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon name={NOTICE[kind]} />
      <div class="body">
        {text}
        {children}
      </div>
    </div>
  );
}

/** A dash in grey, for an empty cell. */
export const None = () => <span class="muted">—</span>;

/** A status chip: on (green), off (red) or idle (grey), with its icon. */
export function Chip({ kind, icon, children }: PropsWithChildren<{ kind: 'on' | 'off' | 'idle'; icon: IconName }>) {
  return (
    <span class={`chip ${kind}`}>
      <Icon name={icon} />
      {children}
    </span>
  );
}

type FieldProps = {
  name: string;
  id?: string;
  label: string;
  type?: string;
  value?: string;
  required?: boolean;
  autocomplete?: string;
  autofocus?: boolean;
  minlength?: number;
  maxlength?: number;
  /** Shown under the field. */
  hint?: string;
  /** What the server found wrong with it, shown under it in red. */
  error?: string;
  icon?: IconName;
  'aria-label'?: string;
};

/** A Material outlined text field: it is a field of its form, as an <input> is. */
export function Field({ hint, error, icon, ...p }: FieldProps) {
  return (
    <md-outlined-text-field
      {...p}
      supporting-text={hint}
      // A Material boolean attribute is on by being there, so off is left out ("false" would turn it on).
      error={error ? true : undefined}
      error-text={error}
    >
      {icon && <Icon name={icon} slot="leading-icon" />}
    </md-outlined-text-field>
  );
}

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
