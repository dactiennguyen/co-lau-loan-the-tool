// Nick: a strip of stats, then every account the app of a key synced, with its password behind Hiện and Chép, its game
// server, proxy and key, and Xoá; the accounts of one key alone with ?key=<id>; Tải JSON of them all.
import type { Listed } from '../services/account.service.ts';
import { ago, keyName, time } from '../utils/format.ts';
import { actOf, Empty, Field, Icon, Layout, None, Select, Stat, Table } from './layout.tsx';

/** A key in the filter of the page: its id, and its note or its start. */
export type KeyName = { id: number; key: string; note: string };

const HIDDEN = '••••••••';

/** "host:port" of the account's proxy, "(tắt)" when it is off. */
function proxyText(data: string): string {
  try {
    const p = (JSON.parse(data) as { proxy?: { host?: string; port?: number; enabled?: boolean } }).proxy;
    if (!p?.host) return '';
    return `${p.host}:${p.port ?? ''}${p.enabled === false ? ' (tắt)' : ''}`;
  } catch {
    return '';
  }
}

function AccountRowView({ r, now }: { r: Listed; now: number }) {
  const secretId = `pw${r.id}`;
  const proxy = proxyText(r.data);
  return (
    <tr data-find={`${r.label} ${r.username}`.toLowerCase()}>
      <td>
        <div class="strong">{r.label || r.username}</div>
        <div class="mono faint small">{r.username}</div>
      </td>
      <td>
        <span class="cell">
          <span class="mono secret" id={secretId} data-secret={r.password}>
            {r.password ? HIDDEN : <span class="faint">(trống)</span>}
          </span>
          {r.password && (
            <>
              <button type="button" class="icon-btn" aria-pressed="false" data-reveal={secretId} aria-label={`Hiện mật khẩu của ${r.username}`} title="Hiện / Ẩn">
                <Icon name="eye" cls="off" />
                <Icon name="eye-off" cls="on" />
              </button>
              <button type="button" class="icon-btn" data-copy={r.password} aria-label={`Chép mật khẩu của ${r.username}`} title="Chép">
                <Icon name="copy" />
              </button>
            </>
          )}
        </span>
      </td>
      <td>
        <span class="tag" title="Server game">
          S{r.serverId}
        </span>
      </td>
      <td class="mono small">{proxy || <None />}</td>
      <td>
        {r.license ? (
          <a class="tag" href={`/admin?key=${r.license.id}`} title={`Chỉ nick của key ${r.license.key}`}>
            <Icon name="key-round" />
            {keyName(r.license)}
          </a>
        ) : (
          <span class="faint" title="Không key nào giữ nick này">
            —
          </span>
        )}
      </td>
      <td class="nowrap muted" title={time(r.updatedAt)}>
        {ago(r.updatedAt, now)}
      </td>
      <td class="end">
        <button
          type="button"
          class="icon-btn danger"
          aria-label={`Xoá nick ${r.username}`}
          title="Xoá"
          {...actOf({
            action: `/admin/accounts/${r.id}/delete`,
            title: `Xoá nick ${r.username}?`,
            text: 'Nick bị xoá khỏi server; app không bị ảnh hưởng, lần đồng bộ sau có thể gửi lại nick này.',
            ok: 'Xoá',
            danger: true,
          })}
        >
          <Icon name="trash-2" />
        </button>
      </td>
    </tr>
  );
}

type AccountsProps = {
  nonce: string;
  rows: Listed[];
  now: number;
  flash?: string | null;
  /** Every key, for the filter; `shown` the one filtered on. */
  keys: KeyName[];
  shown?: KeyName | null;
};

export function AccountsView({ nonce, rows, now, flash, keys, shown }: AccountsProps) {
  const withProxy = rows.filter((r) => proxyText(r.data)).length;
  const keyed = new Set(rows.flatMap((r) => (r.license ? [r.license.id] : []))).size;
  const loose = rows.filter((r) => !r.license).length;
  return (
    <Layout title="Nick" nonce={nonce} nav="accounts" toasts={[flash ? { kind: 'ok', text: flash } : null]}>
      <div class="stats">
        <Stat icon="users" label={shown ? `Nick của key ${keyName(shown)}` : 'Tổng nick'} value={rows.length} cap="mật khẩu lưu nguyên văn" />
        <Stat icon="globe" label="Có proxy" value={withProxy} cap={`${rows.length - withProxy} đi thẳng`} />
        <Stat icon="key-round" label="Theo key" value={keyed} cap="key đã đồng bộ nick" />
        <Stat icon="triangle-alert" label="Không key" value={loose} cap="không key nào giữ" />
      </div>
      <div class="toolbar">
        <h1>Nick</h1>
        <span class="grow" />
        <Field id="find" name="find" type="search" placeholder="Tìm tên hay tài khoản" icon="search" class="search" aria-label="Tìm nick" />
        <form method="get" action="/admin" data-autosubmit>
          <Select
            name="key"
            icon="key-round"
            class="filter"
            aria-label="Chỉ nick của một key"
            value={shown ? String(shown.id) : ''}
            options={[['', 'Mọi key'], ...keys.map((k): [string, string] => [String(k.id), `${keyName(k)}${k.note ? ` · ${k.key.slice(0, 9)}` : ''}`])]}
          />
        </form>
        <button type="button" class="btn ghost" data-reveal-all aria-pressed="false">
          <Icon name="eye" />
          <span data-text>Hiện mật khẩu</span>
        </button>
        <a class="btn" href="/admin/accounts.json" download="">
          <Icon name="download" />
          Tải JSON
        </a>
      </div>
      {rows.length ? (
        <Table head={['Nick', 'Mật khẩu', 'Server', 'Proxy', 'Key', 'Cập nhật', <span class="sr">Xoá</span>]}>
          <>
            {rows.map((r) => (
              <AccountRowView r={r} now={now} />
            ))}
            <tr class="none" data-none hidden>
              <td colspan={7}>Không có nick nào khớp.</td>
            </tr>
          </>
        </Table>
      ) : (
        <Empty icon="users">{shown ? 'Key này chưa đồng bộ nick nào.' : 'Chưa có nick nào: app có key tự đồng bộ nick lên.'}</Empty>
      )}
    </Layout>
  );
}
