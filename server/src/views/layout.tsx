// The frame of every admin page and the parts the pages share. Views are hono/jsx components, written as React
// components are and rendered to HTML on the Worker: every value put in them is escaped, so text from the database
// cannot become markup. Plain HTML and CSS (styles.ts, a dark dashboard) with Phosphor icons drawn inline (icons.ts): no
// component library. The stylesheet and /assets/admin.js go in with the nonce of the page's Content-Security-Policy;
// the script does all the page does on its own (dialogs, menus, filters, toasts), as the policy runs no inline script.
import { raw } from 'hono/html';
import type { Child, PropsWithChildren } from 'hono/jsx';
import { DUOTONE, ICONS, type IconName } from './icons.ts';
import { STYLE } from './styles.ts';

/** Where the script of the page is served from (public/, wrangler.toml [assets]). */
export const SCRIPT_SRC = '/assets/admin.js';

export type Section = 'accounts' | 'licenses' | 'logs' | 'password';

const SECTIONS: [Section, string, string][] = [
  ['accounts', '/admin', 'Nick'],
  ['licenses', '/admin/licenses', 'Key'],
  ['logs', '/admin/logs', 'Log'],
  ['password', '/admin/password', 'Mật khẩu'],
];

/** A Phosphor icon drawn inline, 16 px (styles.ts); `duo` in two tones; `cls` adds a class. */
export function Icon({ name, cls, duo }: { name: IconName; cls?: string; duo?: boolean }) {
  // The paths come from icons.ts, generated from @phosphor-icons/core: markup of the repository, never of a request.
  const body = duo ? DUOTONE[name] : ICONS[name];
  return raw(`<svg class="icon${cls ? ` ${cls}` : ''}" viewBox="0 0 256 256" aria-hidden="true">${body}</svg>`);
}

/** The mark and name of the site. */
export const Brand = () => (
  <span class="brand">
    <span class="mark">CLLT</span>
    <span class="brand-name">Server</span>
  </span>
);

/** A notice that shows for a while at the top right (client/admin.ts hides it). */
export type Toast = { kind: 'ok' | 'error' | 'warn'; text: string };

type LayoutProps = PropsWithChildren<{
  title: string;
  nonce: string;
  /** The section shown, for a logged-in admin: the top bar, and the action dialog. */
  nav?: Section;
  toasts?: (Toast | null | undefined | false)[];
}>;

const TOAST_ICON: Record<Toast['kind'], IconName> = { ok: 'circle-check', error: 'circle-alert', warn: 'triangle-alert' };

export function Layout({ title, nonce, nav, toasts = [], children }: LayoutProps) {
  const shown = toasts.filter((t): t is Toast => !!t && !!t.text);
  return (
    <html lang="vi">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <meta name="robots" content="noindex" />
        <meta name="color-scheme" content="dark" />
        <title>{title} · CLLT Server</title>
        <style nonce={nonce} dangerouslySetInnerHTML={{ __html: STYLE }} />
        <script type="module" nonce={nonce} src={SCRIPT_SRC} />
      </head>
      <body>
        {nav && (
          <header class="top">
            <a href="/admin" class="brand-link" aria-label="CLLT Server">
              <Brand />
            </a>
            <nav aria-label="Trang quản trị">
              {SECTIONS.map(([s, href, label]) => (
                <a href={href} aria-current={nav === s ? 'page' : undefined}>
                  {label}
                </a>
              ))}
            </nav>
            <div class="me">
              <span class="avatar" title="admin">
                A
              </span>
              <form method="post" action="/admin/logout">
                <button class="btn ghost" type="submit">
                  <Icon name="log-out" />
                  Đăng xuất
                </button>
              </form>
            </div>
          </header>
        )}
        <main>{children}</main>
        <div class="toasts" id="toasts" aria-live="polite">
          {shown.map((t) => (
            <div class={`toast ${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'}>
              <Icon name={TOAST_ICON[t.kind]} />
              <span>{t.text}</span>
            </div>
          ))}
        </div>
        {nav && <ActDialog />}
      </body>
    </html>
  );
}

/** A native dialog: title (and a line under it), body, and buttons at the foot. `open` shows it as the page loads
 * (client/admin.ts, data-autoopen). */
export function Dialog({ id, title, sub, wide, open, foot, children }: PropsWithChildren<{ id: string; title: Child; sub?: Child; wide?: boolean; open?: boolean; foot: Child }>) {
  return (
    <dialog id={id} class={wide ? 'wide' : undefined} data-autoopen={open ? '1' : undefined} aria-labelledby={`${id}-title`}>
      <div class="dlg-head">
        <h2 id={`${id}-title`} data-title>
          {title}
        </h2>
        {sub && <p data-text>{sub}</p>}
      </div>
      {children && <div class="dlg-body">{children}</div>}
      <div class="dlg-foot">{foot}</div>
    </dialog>
  );
}

/** Huỷ: closes the dialog it is in. */
export const Cancel = ({ text = 'Huỷ' }: { text?: string }) => (
  <button type="button" class="btn ghost" data-close>
    {text}
  </button>
);

/** What a button that opens the action dialog (data-open="act") asks: the form posts to `action` once confirmed. */
export type Act = { action: string; title: string; text: string; ok: string; danger?: boolean };

/** The data of a button that opens the action dialog with `act` (client/admin.ts fills and opens it). */
export const actOf = (act: Act) => ({ 'data-open': 'act', 'data-act': JSON.stringify(act) });

/** The one dialog every page asks with before an action that cannot be undone or changes what an app may do: its title,
 * text, form action and button are those of the button that opened it (actOf). */
function ActDialog() {
  return (
    <Dialog
      id="act"
      title="Xác nhận"
      sub=" "
      foot={
        <>
          <form id="act-form" method="post" hidden></form>
          <Cancel />
          <button class="btn primary" form="act-form" type="submit" data-ok>
            Đồng ý
          </button>
        </>
      }
    />
  );
}

const ALERT_ICON: Record<'error' | 'ok' | 'warn', IconName> = { error: 'circle-alert', ok: 'circle-check', warn: 'triangle-alert' };

/** A notice inside a card (login, password): an error (read out at once), a success or a warning; nothing without text. */
export function Alert({ kind, text }: { kind: 'error' | 'ok' | 'warn'; text?: string | null }) {
  if (!text) return null;
  return (
    <div class={`alert ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon name={ALERT_ICON[kind]} />
      <div>{text}</div>
    </div>
  );
}

/** A dash, for an empty cell. */
export const None = () => <span class="faint">—</span>;

export type PillKind = 'on' | 'off' | 'warn' | 'idle';

/** A status: a dot and its text, green (on), red (off), orange (warn) or grey (idle); `title` shows on hover. */
export const Pill = ({ kind, title, children }: PropsWithChildren<{ kind: PillKind; title?: string }>) => (
  <span class={`pill ${kind}`} title={title}>
    {children}
  </span>
);

type FieldProps = {
  name: string;
  id?: string;
  /** Shown above the field; none for a search box (then aria-label). */
  label?: string;
  type?: string;
  value?: string;
  placeholder?: string;
  required?: boolean;
  autocomplete?: string;
  autofocus?: boolean;
  minlength?: number;
  maxlength?: number;
  /** The bounds a number or date field takes. */
  min?: string;
  max?: string;
  /** Shown under the field (data-hint: client/admin.ts may change it). */
  hint?: string;
  /** What the server found wrong with it, shown under it in red. */
  error?: string;
  icon?: IconName;
  /** Text inside the field after the value, as "nick" after a number. */
  suffix?: string;
  class?: string;
  'aria-label'?: string;
};

/** A field of a form: its label, the input (an icon before it, a suffix after), and a hint or an error under it. */
export function Field({ label, hint, error, icon, suffix, class: cls, ...p }: FieldProps) {
  const describedBy = error || hint ? `${p.id ?? p.name}-note` : undefined;
  return (
    <label class={`field${cls ? ` ${cls}` : ''}`}>
      {label && <span class="label">{label}</span>}
      <span class="control">
        {icon && <Icon name={icon} />}
        <input
          class={`input${suffix ? ' has-suffix' : ''}`}
          {...p}
          type={p.type ?? 'text'}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={describedBy}
        />
        {suffix && <span class="suffix">{suffix}</span>}
      </span>
      {error ? (
        <span class="error" id={describedBy}>
          {error}
        </span>
      ) : (
        hint && (
          <span class="hint" id={describedBy} data-hint>
            {hint}
          </span>
        )
      )}
    </label>
  );
}

/** A native select, drawn as the fields are: its label, an icon before it, a chevron after. */
export function Select({
  name,
  label,
  icon,
  options,
  value,
  class: cls,
  'aria-label': ariaLabel,
}: {
  name: string;
  label?: string;
  icon?: IconName;
  options: [string, string][];
  value: string;
  class?: string;
  'aria-label'?: string;
}) {
  return (
    <label class={`field${cls ? ` ${cls}` : ''}`}>
      {label && <span class="label">{label}</span>}
      <span class="control">
        {icon && <Icon name={icon} />}
        <select class="select" name={name} aria-label={ariaLabel}>
          {options.map(([v, text]) => (
            <option value={v} selected={v === value ? true : undefined}>
              {text}
            </option>
          ))}
        </select>
        <Icon name="chevron-down" cls="chev" />
      </span>
    </label>
  );
}

/** A table in a card: tiny uppercase headers that stay under the top bar as the page scrolls; the last column (actions)
 * aligns right. `classes` gives a class to the column of that index. */
export function Table({ head, children, id, classes = {} }: { head: Child[]; children: Child; id?: string; classes?: Record<number, string> }) {
  return (
    <div class="card table">
      <table id={id}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th scope="col" class={[i === head.length - 1 ? 'end' : '', classes[i] ?? ''].filter(Boolean).join(' ') || undefined}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** What a list shows when it has nothing: an icon in a ring and one line, in the middle. */
export function Empty({ icon, children }: PropsWithChildren<{ icon: IconName }>) {
  return (
    <div class="card empty">
      <span class="ring">
        <Icon name={icon} duo />
      </span>
      <p>{children}</p>
    </div>
  );
}

/** The colour of a stat card's icon badge. */
export type Tone = 'violet' | 'green' | 'amber' | 'blue' | 'red';

/** A stat card: a caption, its icon in a tinted badge at the right, a big number, and a line under it. */
export function Stat({
  icon,
  label,
  value,
  cap,
  kind,
  tone = 'violet',
}: {
  icon: IconName;
  label: string;
  value: string | number;
  cap?: string;
  kind?: 'warn';
  tone?: Tone;
}) {
  return (
    <div class={`stat${kind ? ` ${kind}` : ''}`}>
      <span class={`badge ${tone}`}>
        <Icon name={icon} duo />
      </span>
      <div class="label">{label}</div>
      <div class="num">{typeof value === 'number' ? value.toLocaleString('vi-VN') : value}</div>
      {cap && <div class="cap">{cap}</div>}
    </div>
  );
}
