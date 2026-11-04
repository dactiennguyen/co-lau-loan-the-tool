// Key: Tạo key (how many accounts, and an end from its activation or on a date), and every key with its state, its end,
// the device that holds it; Khoá with a reason, Mở khoá, Gỡ thiết bị, Sửa, Xoá.
import {
  DEFAULT_DURATION,
  DEFAULT_DURATION_UNIT,
  DEFAULT_MAX_ACCOUNTS,
  MAX_LICENSE_ACCOUNTS,
  MAX_LICENSE_NOTE,
} from '../config/constants.ts';
import type { DurationUnit, License, LicenseRow } from '../models/index.ts';
import { DURATION_UNITS, ago, durationText, keyName, lastDay, lastDayInput, time, today } from '../utils/format.ts';
import { Chip, Field, Icon, Layout, Message, None, Table } from './layout.tsx';

export type LicensesProps = {
  nonce: string;
  list: LicenseRow[];
  now: number;
  flash?: string | null;
  /** The key Tạo key just made (?created=<id>), to copy. */
  made?: { key: string; note: string } | null;
  /** What Tạo key found wrong, by field, with what was typed. */
  errors?: Record<string, string>;
  values?: Record<string, string>;
  /** What Sửa found wrong. */
  error?: string | null;
};

/** Ngày, tháng, năm, with `value` chosen. */
function UnitSelect({ value, label }: { value: string; label: string }) {
  return (
    <md-outlined-select name="unit" label="Đơn vị" aria-label={label}>
      {(Object.entries(DURATION_UNITS) as [DurationUnit, string][]).map(([v, text]) => (
        <md-select-option value={v} selected={v === value ? true : undefined}>
          <div slot="headline">{text}</div>
        </md-select-option>
      ))}
    </md-outlined-select>
  );
}

/** One action of a row: a small form posting to /admin/licenses/<id>/<action>. */
function Act({ at, action, confirm, children }: { at: string; action: string; confirm?: string; children: unknown }) {
  return (
    <form method="post" action={`${at}/${action}`} data-confirm={confirm}>
      {children}
    </form>
  );
}

function State({ l, now }: { l: License; now: number }) {
  if (l.revoked) {
    return (
      <>
        <Chip kind="off" icon="lock">
          Bị khoá
        </Chip>
        {l.reason && <div class="muted wrap">{l.reason}</div>}
      </>
    );
  }
  if (l.expiresAt !== null && now >= l.expiresAt) {
    return (
      <Chip kind="off" icon="event">
        Hết hạn
      </Chip>
    );
  }
  return l.deviceId ? (
    <Chip kind="on" icon="check_circle">
      Đang dùng
    </Chip>
  ) : (
    <Chip kind="idle" icon="key">
      Chưa kích hoạt
    </Chip>
  );
}

/** The last day it works and what is left; before its activation, how long it will last. */
function Ends({ l, now }: { l: License; now: number }) {
  const span = l.duration && l.durationUnit ? durationText(l.duration, l.durationUnit) : '';
  if (l.expiresAt === null) return <>{span} sau khi kích hoạt</>;
  const days = Math.ceil((l.expiresAt - now) / 86_400_000);
  return (
    <>
      {lastDay(l.expiresAt)}
      <div class="muted">
        {days > 0 ? `còn ${days.toLocaleString('vi-VN')} ngày` : 'đã hết'}
        {l.mode === 'activation' && span ? ` · ${span} từ lúc kích hoạt` : ''}
      </div>
    </>
  );
}

function Row({ l, now }: { l: LicenseRow; now: number }) {
  const at = `/admin/licenses/${l.id}`;
  const who = keyName(l);
  return (
    <tr data-find={`${l.key} ${l.note} ${l.hostname} ${l.ip} ${l.deviceId ?? ''}`.toLowerCase()} class={l.revoked ? 'blocked' : undefined}>
      <td>
        <span class="cell">
          <span class="mono">{l.key}</span>
          <md-icon-button data-copy={l.key} aria-label={`Chép key ${l.key}`} title="Chép">
            <Icon name="content_copy" md />
          </md-icon-button>
        </span>
      </td>
      <td class="wrap">{l.note || <None />}</td>
      <td class="wrap">
        <State l={l} now={now} />
      </td>
      <td>
        <Ends l={l} now={now} />
      </td>
      <td>
        {l.deviceId ? `${l.accounts}/${l.maxAccounts} trong app` : `tối đa ${l.maxAccounts}`}
        <div class="muted" title={l.settings ? `Cài đặt: ${l.settings}` : undefined}>
          {l.synced ? (
            <a href={`/admin?key=${l.id}`}>{l.synced} nick đã đồng bộ</a>
          ) : (
            'chưa đồng bộ nick'
          )}
          {l.syncedAt ? ` · ${ago(l.syncedAt, now)}` : ''}
        </div>
      </td>
      <td class="wrap">
        {l.deviceId ? (
          <>
            <span class="cell">
              <Icon name="computer" />
              <b>{l.hostname || 'Không tên'}</b>
            </span>
            <div class="muted">
              {l.os || '—'} · bản {l.version || '—'}
            </div>
            <div class="muted mono" title={l.deviceId}>
              {l.ip || '—'} · {l.deviceId.slice(0, 12)}…
            </div>
            <div class="muted" title={l.lastCheckAt ? `Kiểm tra lần cuối: ${time(l.lastCheckAt)}` : undefined}>
              Kích hoạt {time(l.activatedAt)}
              {l.lastCheckAt ? ` · kiểm tra ${ago(l.lastCheckAt, now)}` : ''}
            </div>
          </>
        ) : (
          <None />
        )}
      </td>
      <td>
        <div class="acts">
          {l.revoked ? (
            <Act at={at} action="restore">
              <md-outlined-button type="submit">
                <Icon name="lock_open" slot="icon" />
                Mở khoá
              </md-outlined-button>
            </Act>
          ) : (
            <Act at={at} action="revoke" confirm={`Khoá key của ${who}? App dùng key này bị khoá ở lần kiểm tra tới (tối đa 1 giờ).`}>
              <Field name="reason" label="Lý do (app hiện)" aria-label={`Lý do khoá key của ${who}`} />
              <md-icon-button class="danger" type="submit" aria-label={`Khoá key của ${who}`} title="Khoá">
                <Icon name="lock" md />
              </md-icon-button>
            </Act>
          )}
          {l.deviceId && (
            <Act
              at={at}
              action="release"
              confirm={`Gỡ máy ${l.hostname || l.deviceId.slice(0, 12)} khỏi key của ${who}? App trên máy đó bị khoá ở lần kiểm tra tới và không kích hoạt lại được; máy khác nhập key này là kích hoạt được, hạn giữ nguyên.`}
            >
              <md-icon-button type="submit" aria-label={`Gỡ thiết bị khỏi key của ${who}`} title="Gỡ thiết bị">
                <Icon name="link_off" md />
              </md-icon-button>
            </Act>
          )}
          <details class="edit">
            <summary>
              <Icon name="edit" />
              Sửa
            </summary>
            <form method="post" action={`${at}/edit`} class="row">
              <Field name="note" label="Ghi chú" value={l.note} maxlength={MAX_LICENSE_NOTE} aria-label={`Ghi chú của key ${l.key}`} />
              <Field name="maxAccounts" type="number" label="Số nick tối đa" value={String(l.maxAccounts)} required aria-label={`Số nick tối đa của key ${l.key}`} />
              {l.expiresAt === null ? (
                <>
                  <Field name="duration" type="number" label="Hạn sau khi kích hoạt" value={String(l.duration ?? DEFAULT_DURATION)} aria-label={`Hạn của key ${l.key}`} />
                  <UnitSelect value={l.durationUnit ?? DEFAULT_DURATION_UNIT} label={`Đơn vị hạn của key ${l.key}`} />
                </>
              ) : (
                <Field name="date" type="date" label="Dùng tới hết ngày" value={lastDayInput(l.expiresAt)} aria-label={`Ngày hết hạn của key ${l.key}`} />
              )}
              <md-filled-tonal-button type="submit">
                <Icon name="save" slot="icon" />
                Lưu
              </md-filled-tonal-button>
            </form>
          </details>
          <Act at={at} action="delete" confirm={`Xoá key của ${who}? App dùng key này bị khoá ở lần kiểm tra tới, và key không dùng lại được.`}>
            <md-icon-button class="danger" type="submit" aria-label={`Xoá key của ${who}`} title="Xoá">
              <Icon name="delete" md />
            </md-icon-button>
          </Act>
        </div>
      </td>
    </tr>
  );
}

/** Tạo key: 100 accounts and 10 years from the activation unless changed. */
function CreateForm({ errors, values, now }: { errors: Record<string, string>; values: Record<string, string>; now: number }) {
  const mode = values.mode === 'fixed' ? 'fixed' : 'activation';
  return (
    <form method="post" action="/admin/licenses" class="card gap stack" data-modes>
      <div class="row">
        <Field name="note" label="Ghi chú" hint="Key của ai, ví dụ tên khách" value={values.note} maxlength={MAX_LICENSE_NOTE} error={errors.note} icon="person" />
        <Field
          name="maxAccounts"
          type="number"
          label="Số nick tối đa"
          value={values.maxAccounts ?? String(DEFAULT_MAX_ACCOUNTS)}
          hint={`App không thêm được nick quá số này (tối đa ${MAX_LICENSE_ACCOUNTS.toLocaleString('vi-VN')})`}
          required
          error={errors.maxAccounts}
          icon="group"
        />
      </div>
      <div role="radiogroup" aria-label="Cách tính hạn" class="stack">
        <div class="row choice">
          <label class="radio">
            <md-radio name="mode" value="activation" checked={mode === 'activation' ? true : undefined} />
            Tính từ lúc kích hoạt
          </label>
          <span class="row" data-mode="activation">
            <Field name="duration" type="number" label="Thời hạn" value={values.duration ?? String(DEFAULT_DURATION)} error={errors.duration} icon="event" />
            <UnitSelect value={values.unit ?? DEFAULT_DURATION_UNIT} label="Đơn vị thời hạn" />
          </span>
        </div>
        <div class="row choice">
          <label class="radio">
            <md-radio name="mode" value="fixed" checked={mode === 'fixed' ? true : undefined} />
            Ngày cố định
          </label>
          <span class="row" data-mode="fixed">
            <Field name="date" type="date" label="Dùng tới hết ngày" value={values.date ?? ''} min={today(now)} error={errors.date ?? errors.mode} icon="event" />
          </span>
        </div>
      </div>
      <div>
        <md-filled-button type="submit">
          <Icon name="add" slot="icon" />
          Tạo key
        </md-filled-button>
      </div>
    </form>
  );
}

export function LicensesView({ nonce, list, now, flash, made, errors = {}, values = {}, error }: LicensesProps) {
  const used = list.filter((l) => l.deviceId).length;
  return (
    <Layout title="Key" nonce={nonce} nav="licenses">
      <h1>Key</h1>
      <p class="sub">
        App hỏi key ở lần mở đầu tiên, rồi kiểm tra khi mở và mỗi giờ một lần. Mỗi key chỉ dùng trên một máy: máy đầu tiên nhập key giữ nó, máy khác
        bị từ chối. <b>Gỡ thiết bị</b> chuyển key sang máy khác: máy cũ bị từ chối, máy kế tiếp nhập key là kích hoạt được. Hạn tính từ lúc kích hoạt hoặc tới một ngày cố định (giờ Việt Nam); hết hạn, bị khoá hay bị xoá
        thì app khoá ở lần kiểm tra tiếp theo.
      </p>
      {made && (
        <Message kind="ok">
          Đã tạo key{made.note ? ` cho ${made.note}` : ''}. Gửi key này cho khách:
          <code class="token">{made.key}</code>
          <md-filled-button data-copy={made.key}>
            <Icon name="content_copy" slot="icon" />
            Chép key
          </md-filled-button>
        </Message>
      )}
      <Message kind="error" text={error} />
      <Message kind="ok" text={flash} />
      <CreateForm errors={errors} values={values} now={now} />
      <div class="bar">
        <span class="count">
          {list.length} key{list.length ? `, ${used} đang có máy giữ` : ''} <span id="shown"></span>
        </span>
        <Field id="find" name="find" label="Tìm theo key, ghi chú, tên máy, IP" type="search" icon="search" aria-label="Tìm key" />
      </div>
      <Table
        head={['Key', 'Ghi chú', 'Trạng thái', 'Hạn', 'Nick', 'Thiết bị', <span class="muted">Thao tác</span>]}
      >
        {list.length ? (
          list.map((l) => <Row l={l} now={now} />)
        ) : (
          <tr>
            <td colspan={7} class="muted wrap">
              Chưa có key nào. Tạo một key ở trên rồi gửi cho người dùng: app hỏi key khi mở.
            </td>
          </tr>
        )}
      </Table>
    </Layout>
  );
}
