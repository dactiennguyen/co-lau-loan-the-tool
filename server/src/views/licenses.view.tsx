// Key: four stat cards; the keys filtered by state (segmented pills) and searched on the page; each with its state, end,
// accounts and the device that holds it, and its menu (Sửa, Khoá / Mở khoá, Gỡ thiết bị, Xem log, Xoá). Tạo key, Sửa, Khoá and
// the key just made are native dialogs, filled and opened by client/admin.ts.
import {
  DEFAULT_DURATION,
  DEFAULT_DURATION_UNIT,
  DEFAULT_MAX_ACCOUNTS,
  MAX_LICENSE_ACCOUNTS,
  MAX_LICENSE_BATCH,
  MAX_LICENSE_NOTE,
  MAX_REVOKE_REASON,
} from '../config/constants.ts';
import type { LicenseRow } from '../models/index.ts';
import { DURATION_UNITS, addDays, ago, dayText, durationText, keyName, lastDay, lastDayInput, time, today } from '../utils/format.ts';
import type { IconName } from './icons.ts';
import { actOf, Cancel, Dialog, Empty, Field, Icon, Layout, None, Pill, type PillKind, Select, Stat, Table } from './layout.tsx';

export type LicensesProps = {
  nonce: string;
  list: LicenseRow[];
  now: number;
  flash?: string | null;
  /** What a redirect or Sửa found wrong. */
  error?: string | null;
  /** The keys Tạo key just made (?created=<id>,<id>…), shown in a dialog to copy. */
  made?: LicenseRow[];
  /** What Tạo key found wrong, by field, with what was typed: the dialog opens again with them. */
  errors?: Record<string, string>;
  values?: Record<string, string>;
};

/** The state of a key, as the filter and the status pill name it. */
type State = 'using' | 'idle' | 'expired' | 'revoked';

const STATES: [State, string, PillKind][] = [
  ['using', 'Đang dùng', 'on'],
  ['idle', 'Chưa kích hoạt', 'idle'],
  ['expired', 'Hết hạn', 'warn'],
  ['revoked', 'Bị khoá', 'off'],
];

function stateOf(l: LicenseRow, now: number): State {
  if (l.revoked) return 'revoked';
  if (l.expiresAt !== null && now >= l.expiresAt) return 'expired';
  return l.deviceId ? 'using' : 'idle';
}

const DAY = 86_400_000;
/** A key ending within this is counted as Sắp hết hạn. */
const SOON = 7 * DAY;

const UNIT_OPTIONS = Object.entries(DURATION_UNITS) as [string, string][];

/** "Số ngày" and "Ngày hết hạn", linked both ways by client/admin.ts from today in Vietnam (data-today); the date is
 * what the server takes. */
function DaysAndDate({ today: day, date, error }: { today: string; date: string; error?: string }) {
  const days = date ? Math.round((Date.parse(date) - Date.parse(day)) / DAY) : NaN;
  return (
    <div class="pair" data-days-date data-today={day}>
      <Field name="days" type="number" label="Số ngày" value={Number.isFinite(days) ? String(days) : ''} suffix="ngày" />
      <Field
        name="date"
        type="date"
        label="Ngày hết hạn"
        value={date}
        hint={date ? `Dùng tới hết ngày ${dayText(date)} (giờ Việt Nam)` : 'Dùng tới hết ngày đó (giờ Việt Nam)'}
        error={error}
      />
    </div>
  );
}

/** Bạch Hổ of Tạo key and Sửa: whether the app of the key may run it, as the two choices of Hạn dùng are drawn. Sửa's
 * is set by client/admin.ts from the key. */
function BachHoField({ on }: { on: boolean }) {
  return (
    <div class="field">
      <span class="label">Bạch Hổ</span>
      <div class="seg full" role="radiogroup" aria-label="Bạch Hổ">
        <label>
          <input type="radio" name="bachHo" value="1" checked={on ? true : undefined} />
          <Icon name="crown" />
          Cho chạy
        </label>
        <label>
          <input type="radio" name="bachHo" value="0" checked={on ? undefined : true} />
          Tắt
        </label>
      </div>
    </div>
  );
}

/** Tạo key: a note, how many accounts, and how it ends, from its activation or on a date (10 days from today unless
 * changed). Opens again with what was wrong under its field. */
function CreateDialog({ now, errors, values }: { now: number; errors: Record<string, string>; values: Record<string, string> }) {
  const mode = values.mode === 'fixed' ? 'fixed' : 'activation';
  const day = today(now);
  return (
    <Dialog
      id="create"
      wide
      title="Tạo key"
      sub="Mỗi key dùng trên một máy. Gửi key cho người dùng sau khi tạo."
      open={Object.keys(errors).length > 0}
      foot={
        <>
          <Cancel />
          <button class="btn primary" form="create-form" type="submit">
            <Icon name="sparkles" />
            Tạo key
          </button>
        </>
      }
    >
      <form id="create-form" method="post" action="/admin/licenses" class="stack" data-modes>
        <Field name="note" label="Ghi chú" placeholder="Key của ai, ví dụ tên khách" value={values.note} maxlength={MAX_LICENSE_NOTE} error={errors.note} />
        <div class="pair">
          <Field
            name="maxAccounts"
            type="number"
            label="Số nick tối đa"
            value={values.maxAccounts ?? String(DEFAULT_MAX_ACCOUNTS)}
            min="1"
            max={String(MAX_LICENSE_ACCOUNTS)}
            suffix="nick"
            required
            error={errors.maxAccounts}
          />
          <Field
            name="count"
            type="number"
            label="Số lượng"
            value={values.count ?? '1'}
            min="1"
            max={String(MAX_LICENSE_BATCH)}
            suffix="key"
            required
            hint={`Tạo nhiều key giống nhau một lúc, tối đa ${MAX_LICENSE_BATCH}`}
            error={errors.count}
          />
        </div>
        <div class="field">
          <span class="label">Hạn dùng</span>
          <div class="seg full" role="radiogroup" aria-label="Cách tính hạn">
            <label>
              <input type="radio" name="mode" value="activation" checked={mode === 'activation' ? true : undefined} />
              Tính từ lúc kích hoạt
            </label>
            <label>
              <input type="radio" name="mode" value="fixed" checked={mode === 'fixed' ? true : undefined} />
              Ngày cố định
            </label>
          </div>
        </div>
        <div class="pair wide-first" data-mode="activation" hidden={mode !== 'activation' ? true : undefined}>
          <Field name="duration" type="number" label="Thời hạn" value={values.duration ?? String(DEFAULT_DURATION)} min="1" error={errors.duration} />
          <Select name="unit" label="Đơn vị" options={UNIT_OPTIONS} value={values.unit ?? DEFAULT_DURATION_UNIT} />
        </div>
        <div data-mode="fixed" hidden={mode !== 'fixed' ? true : undefined}>
          <DaysAndDate today={day} date={values.date ?? addDays(day, 10)} error={errors.date} />
        </div>
        <BachHoField on={values.bachHo !== '0'} />
      </form>
    </Dialog>
  );
}

/** Sửa: the note, how many accounts, and the end: the date (and days from today) of a key that has one, the duration of
 * a key never activated. client/admin.ts fills it from the key's menu item (data-license). */
function EditDialog({ now }: { now: number }) {
  return (
    <Dialog
      id="edit"
      wide
      title="Sửa key"
      foot={
        <>
          <Cancel />
          <button class="btn primary" form="edit-form" type="submit">
            <Icon name="save" />
            Lưu
          </button>
        </>
      }
    >
      <form id="edit-form" method="post" class="stack">
        <div class="pair wide-first">
          <Field name="note" label="Ghi chú" maxlength={MAX_LICENSE_NOTE} />
          <Field name="maxAccounts" type="number" label="Số nick tối đa" min="1" max={String(MAX_LICENSE_ACCOUNTS)} suffix="nick" required />
        </div>
        <div data-end="date">
          <DaysAndDate today={today(now)} date="" />
        </div>
        <div class="pair wide-first" data-end="duration">
          <Field name="duration" type="number" label="Hạn sau khi kích hoạt" min="1" />
          <Select name="unit" label="Đơn vị" options={UNIT_OPTIONS} value={DEFAULT_DURATION_UNIT} />
        </div>
        <BachHoField on />
      </form>
    </Dialog>
  );
}

/** Khoá: the reason the app shows. client/admin.ts sets the key's name and the form action (data-act). */
function RevokeDialog() {
  return (
    <Dialog
      id="revoke"
      title="Khoá key"
      sub=" "
      foot={
        <>
          <Cancel />
          <button class="btn danger" form="revoke-form" type="submit">
            <Icon name="lock" />
            Khoá
          </button>
        </>
      }
    >
      <form id="revoke-form" method="post" class="stack">
        <Field name="reason" label="Lý do" placeholder="App hiện lý do này cho người dùng" maxlength={MAX_REVOKE_REASON} />
      </form>
    </Dialog>
  );
}

/** How long a key lasts: the last day it works, or its duration before its activation. */
const endText = (l: LicenseRow) =>
  l.expiresAt !== null ? `Dùng tới hết ngày ${lastDay(l.expiresAt)}` : `${durationText(l.duration ?? 0, l.durationUnit ?? 'day')} sau khi kích hoạt`;

/** The keys Tạo key just made, open as the page loads: one key large with Chép, or the list of them with Chép tất cả
 * and Tải .txt (one key a line); their note, accounts and end, which they share. */
function MadeDialog({ made }: { made: LicenseRow[] }) {
  const first = made[0]!;
  const all = made.map((l) => l.key).join('\n');
  const many = made.length > 1;
  return (
    <Dialog
      id="created"
      open
      title={many ? `Đã tạo ${made.length} key` : 'Đã tạo key'}
      sub={many ? 'Gửi mỗi người một key: mỗi key dùng cho một máy.' : 'Gửi key này cho người dùng: app hỏi key khi mở.'}
      foot={
        <button type="button" class="btn primary" data-close>
          Xong
        </button>
      }
    >
      {many ? (
        <>
          <ol class="made-list" data-made="true">
            {made.map((l) => (
              <li>
                <code>{l.key}</code>
                <button type="button" class="icon-btn" data-copy={l.key} aria-label={`Chép ${l.key}`} title="Chép">
                  <Icon name="copy" />
                </button>
              </li>
            ))}
          </ol>
          <div class="row-actions">
            <button type="button" class="btn" data-copy={all} data-copied="Đã chép ✓">
              <Icon name="copy" />
              <span data-label>Chép tất cả</span>
            </button>
            <button type="button" class="btn" data-download={all} data-filename={`cllt-key-${made.length}.txt`}>
              <Icon name="download" />
              Tải .txt
            </button>
          </div>
        </>
      ) : (
        <div class="made-key">
          <code data-made="true">{first.key}</code>
          <button type="button" class="btn" data-copy={first.key} data-copied="Đã chép ✓">
            <Icon name="copy" />
            <span data-label>Chép</span>
          </button>
        </div>
      )}
      <dl class="facts">
        <dt>Ghi chú</dt>
        <dd>{first.note || <None />}</dd>
        <dt>Số nick tối đa</dt>
        <dd>{first.maxAccounts}</dd>
        <dt>Hạn</dt>
        <dd>{endText(first)}</dd>
      </dl>
    </Dialog>
  );
}

/** The last day and what is left, or how long it will last from its activation. */
function Ends({ l, now }: { l: LicenseRow; now: number }) {
  if (l.expiresAt === null) {
    return <span class="muted">{durationText(l.duration ?? 0, l.durationUnit ?? 'day')} sau kích hoạt</span>;
  }
  const left = Math.ceil((l.expiresAt - now) / DAY);
  const gone = Math.floor((now - l.expiresAt) / DAY);
  return (
    <>
      <div class="nowrap">{lastDay(l.expiresAt)}</div>
      <div class={`small nowrap ${left > 0 && left <= 7 ? 'warn-text' : 'faint'}`}>
        {left > 0 ? `còn ${left.toLocaleString('vi-VN')} ngày` : gone > 0 ? `hết ${gone} ngày trước` : 'vừa hết hạn'}
      </div>
    </>
  );
}

/** The device that holds it: its name, then system, version and IP, and when it last checked. */
function Device({ l, now }: { l: LicenseRow; now: number }) {
  if (!l.deviceId) return <span class="faint">{l.releasedDevice ? 'Đã gỡ máy cũ' : 'Chưa có máy'}</span>;
  return (
    <div title={`Mã máy ${l.deviceId}\nKích hoạt ${time(l.activatedAt)}`}>
      <div class="cell strong">
        <Icon name="monitor" />
        {l.hostname || 'Không tên'}
      </div>
      <div class="faint small">
        {[l.os, l.version && `bản ${l.version}`, l.ip].filter(Boolean).join(' · ') || '—'}
        {l.lastCheckAt ? ` · ${ago(l.lastCheckAt, now)}` : ''}
      </div>
    </div>
  );
}

/** The menu of a key (a popover): Sửa, Khoá or Mở khoá, Gỡ thiết bị (when a device holds it), Xoá, each opening its
 * dialog; Xem log, the Log page of the key. */
function Menu({ l }: { l: LicenseRow }) {
  const at = `/admin/licenses/${l.id}`;
  const who = keyName(l);
  const edit = {
    action: `${at}/edit`,
    title: `Sửa key ${who}`,
    note: l.note,
    maxAccounts: l.maxAccounts,
    date: l.expiresAt === null ? null : lastDayInput(l.expiresAt),
    duration: l.duration,
    unit: l.durationUnit,
    bachHo: l.bachHo !== 0,
  };
  const item = (icon: IconName, text: string, data: Record<string, string>, danger?: boolean) => (
    <button type="button" role="menuitem" class={danger ? 'danger' : undefined} {...data}>
      <Icon name={icon} />
      {text}
    </button>
  );
  return (
    <>
      <button type="button" class="icon-btn" popovertarget={`m-${l.id}`} aria-haspopup="menu" aria-label={`Thao tác với key ${who}`} title="Thao tác">
        <Icon name="ellipsis-vertical" />
      </button>
      <div popover id={`m-${l.id}`} class="menu" role="menu" aria-label={`Key ${who}`}>
        {item('pencil', 'Sửa', { 'data-open': 'edit', 'data-license': JSON.stringify(edit) })}
        {l.revoked
          ? item('lock-open', 'Mở khoá', actOf({ action: `${at}/restore`, title: 'Mở khoá key?', text: `App dùng key ${who} chạy lại ở lần kiểm tra tới.`, ok: 'Mở khoá' }))
          : item('lock', 'Khoá', {
              'data-open': 'revoke',
              'data-act': JSON.stringify({ action: `${at}/revoke`, title: `Khoá key ${who}?`, text: 'App dùng key này bị khoá ở lần kiểm tra tới (tối đa 1 giờ).' }),
            })}
        {l.bachHo
          ? item('crown', 'Tắt Bạch Hổ', actOf({ action: `${at}/bachho-off`, title: `Tắt Bạch Hổ của key ${who}?`, text: 'App dùng key này dừng Bạch Hổ và không bắt đầu được nữa từ lần kiểm tra tới (tối đa 1 giờ, hoặc khi mở app hay mở cửa sổ Bạch Hổ).', ok: 'Tắt Bạch Hổ', danger: true }))
          : item('crown', 'Bật Bạch Hổ', actOf({ action: `${at}/bachho-on`, title: `Bật Bạch Hổ cho key ${who}?`, text: 'App dùng key này chạy được Bạch Hổ từ lần kiểm tra tới (tối đa 1 giờ, hoặc khi mở app hay mở cửa sổ Bạch Hổ).', ok: 'Bật Bạch Hổ' }))}
        {l.deviceId &&
          item(
            'unlink',
            'Gỡ thiết bị',
            actOf({
              action: `${at}/release`,
              title: `Gỡ máy ${l.hostname || l.deviceId.slice(0, 12)}?`,
              text: `App trên máy đó bị khoá ở lần kiểm tra tới và không kích hoạt lại key ${who} được. Máy khác nhập key là kích hoạt được, hạn giữ nguyên.`,
              ok: 'Gỡ thiết bị',
              danger: true,
            }),
          )}
        <a role="menuitem" href={`/admin/logs?key=${l.id}`}>
          <Icon name="scroll" />
          Xem log
        </a>
        <hr />
        {item(
          'trash-2',
          'Xoá',
          actOf({
            action: `${at}/delete`,
            title: `Xoá key ${who}?`,
            text: 'App dùng key này bị khoá ở lần kiểm tra tới; key không dùng lại được. Nick key này đã đồng bộ vẫn giữ.',
            ok: 'Xoá',
            danger: true,
          }),
          true,
        )}
      </div>
    </>
  );
}

function Row({ l, now }: { l: LicenseRow; now: number }) {
  const state = stateOf(l, now);
  const [, label, kind] = STATES.find(([s]) => s === state)!;
  return (
    <tr data-state={state} data-find={`${l.key} ${l.note} ${l.hostname} ${l.ip}`.toLowerCase()}>
      <td>
        <span class="cell nowrap">
          <span class="key">{l.key}</span>
          <button type="button" class="icon-btn" data-copy={l.key} aria-label={`Chép key ${l.key}`} title="Chép key">
            <Icon name="copy" />
          </button>
        </span>
        <div class="device-inline">
          <Device l={l} now={now} />
        </div>
      </td>
      <td>{l.note || <None />}</td>
      <td>
        <Pill kind={kind}>{label}</Pill>
        {l.revoked && l.reason ? <div class="faint small">{l.reason}</div> : null}
        {!l.bachHo ? <div class="faint small nowrap">Tắt Bạch Hổ</div> : null}
      </td>
      <td>
        <Ends l={l} now={now} />
      </td>
      <td>
        <a class="meter" href={`/admin?key=${l.id}`} title={l.deviceId ? `App báo ${l.accounts} nick · bấm để xem nick đã đồng bộ` : 'Xem nick đã đồng bộ'}>
          <span class="n">
            {l.synced}
            <span class="faint">/{l.maxAccounts}</span>
          </span>
          <span class="bar">
            <progress class={l.synced >= l.maxAccounts ? 'full' : undefined} value={String(Math.min(l.synced, l.maxAccounts))} max={String(l.maxAccounts)} aria-label={`${l.synced} trên ${l.maxAccounts} nick`} />
          </span>
        </a>
        {l.syncedAt && (
          <div class="faint small nowrap" title={l.settings ? `Cài đặt: ${l.settings}` : undefined}>
            đồng bộ {ago(l.syncedAt, now)}
          </div>
        )}
      </td>
      <td class="col-device">
        <Device l={l} now={now} />
      </td>
      <td class="end">
        <Menu l={l} />
      </td>
    </tr>
  );
}

export function LicensesView({ nonce, list, now, flash, error, made, errors = {}, values = {} }: LicensesProps) {
  const counts = new Map<State, number>();
  for (const l of list) counts.set(stateOf(l, now), (counts.get(stateOf(l, now)) ?? 0) + 1);
  const soon = list.filter((l) => !l.revoked && l.expiresAt !== null && l.expiresAt > now && l.expiresAt - now <= SOON).length;
  const synced = list.reduce((n, l) => n + l.synced, 0);
  const allowed = list.reduce((n, l) => n + l.maxAccounts, 0);
  return (
    <Layout title="Key" nonce={nonce} nav="licenses" toasts={[error ? { kind: 'error', text: error } : null, flash ? { kind: 'ok', text: flash } : null]}>
      <div class="stats">
        <Stat icon="key-round" tone="violet" label="Tổng key" value={list.length} cap={`${counts.get('idle') ?? 0} chưa kích hoạt`} />
        <Stat icon="circle-check" tone="green" label="Đang dùng" value={counts.get('using') ?? 0} cap={`${counts.get('revoked') ?? 0} bị khoá · ${counts.get('expired') ?? 0} hết hạn`} />
        <Stat icon="clock" tone="amber" label="Sắp hết hạn" value={soon} cap="trong 7 ngày tới" kind={soon ? 'warn' : undefined} />
        <Stat icon="users" tone="blue" label="Nick đã đồng bộ" value={synced} cap={`trên ${allowed.toLocaleString('vi-VN')} nick được phép`} />
      </div>
      <div class="toolbar">
        <h1>Key</h1>
        {list.length > 0 && (
          <div class="seg" role="group" aria-label="Lọc theo trạng thái" data-filter>
            <button type="button" aria-pressed="true" data-state="">
              Tất cả <span class="n">{list.length}</span>
            </button>
            {STATES.map(([s, label]) => (
              <button type="button" aria-pressed="false" data-state={s}>
                {label} <span class="n">{counts.get(s) ?? 0}</span>
              </button>
            ))}
          </div>
        )}
        <span class="grow" />
        {list.length > 0 && <Field id="find" name="find" type="search" placeholder="Tìm key, ghi chú, máy, IP" icon="search" class="search" aria-label="Tìm key" />}
        <button type="button" class="btn primary" data-open="create">
          <Icon name="sparkles" />
          Tạo key
        </button>
      </div>
      {list.length ? (
        <Table id="list" head={['Key', 'Ghi chú', 'Trạng thái', 'Hạn', 'Nick', 'Thiết bị', <span class="sr">Thao tác</span>]} classes={{ 5: 'col-device' }}>
          <>
            {list.map((l) => (
              <Row l={l} now={now} />
            ))}
            <tr class="none" data-none hidden>
              <td colspan={7}>Không có key nào khớp.</td>
            </tr>
          </>
        </Table>
      ) : (
        <Empty icon="key-round">Chưa có key nào. Bấm Tạo key rồi gửi key cho người dùng.</Empty>
      )}
      <CreateDialog now={now} errors={errors} values={values} />
      <EditDialog now={now} />
      <RevokeDialog />
      {made && made.length > 0 && <MadeDialog made={made} />}
    </Layout>
  );
}
