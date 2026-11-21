// Nick: a strip of stats, then every account the app of a key synced, with its password behind Hiện and Chép, its game
// server, what the app last saw of its character (name, level, map, money), its proxy whole (its password behind Hiện,
// Chép as one line the app reads back) and key, and Xoá; "Đã xoá ở máy" on those the app removed, and a filter for them; the accounts of one
// key alone with ?key=<id>; Tải JSON of them all.
import type { AccountInfo } from '../models/index.ts';
import type { Listed } from '../services/account.service.ts';
import { ago, keyName, time } from '../utils/format.ts';
import { actOf, Empty, Field, Icon, Layout, None, Pill, Select, Stat, Table } from './layout.tsx';

/** A key in the filter of the page: its id, and its note or its start. */
export type KeyName = { id: number; key: string; note: string };

const HIDDEN = '••••••••';

type ProxyData = { host?: string; port?: number; enabled?: boolean; kind?: string; username?: string; password?: string };

/** The account's proxy as the app keeps it, or null for none. */
function proxyOf(data: string): ProxyData | null {
  try {
    const p = (JSON.parse(data) as { proxy?: ProxyData }).proxy;
    return p?.host ? p : null;
  } catch {
    return null;
  }
}

/** The proxy as one line to copy, in a shape the app's form reads back (app/desktop/src/utils/proxyText.ts): HTTP as
 * host:port:user:pass, as proxies are sold; SOCKS5 and an IPv6 host as a URL, which says the kind and holds the brackets. */
export function proxyLine(p: ProxyData): string {
  const auth = p.username ? `${p.username}${p.password ? `:${p.password}` : ''}` : '';
  const ipv6 = (p.host ?? '').includes(':');
  if (p.kind === 'socks5' || ipv6) {
    const scheme = p.kind === 'socks5' ? 'socks5' : 'http';
    const host = ipv6 ? `[${p.host}]` : p.host;
    return `${scheme}://${auth ? `${auth}@` : ''}${host}:${p.port ?? ''}`;
  }
  return `${p.host}:${p.port ?? ''}${auth ? `:${auth}` : ''}`;
}

/** The same line with the password hidden, as the cell shows it until Hiện. */
const proxyMasked = (p: ProxyData) => (p.password ? proxyLine({ ...p, password: '••••' }) : proxyLine(p));

const numbers = new Intl.NumberFormat('vi-VN');
const pct = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 });

/** What the app last saw of the character (models/index.ts#AccountInfo), or null before any. */
function infoOf(r: Listed): (Omit<AccountInfo, 'username' | 'serverId'> & { at: number }) | null {
  if (!r.info) return null;
  try {
    return JSON.parse(r.info) as Omit<AccountInfo, 'username' | 'serverId'>;
  } catch {
    return null;
  }
}

function InfoCell({ r, now }: { r: Listed; now: number }) {
  const i = infoOf(r);
  if (!i) return <None />;
  const money = [
    i.xu !== undefined && `${numbers.format(i.xu)} Xu`,
    i.xuKhoa !== undefined && `${numbers.format(i.xuKhoa)} Xu khoá`,
    i.luong !== undefined && `${numbers.format(i.luong)} Lượng`,
    i.coin !== undefined && `${numbers.format(i.coin)} Vàng`,
  ].filter(Boolean);
  return (
    <div title={`App thấy lúc ${time(i.at)}`}>
      <div class="cell">
        <span class="strong">{i.name}</span>
        <span class="tag">LV {i.level}</span>
        {i.levelPart !== undefined && <span class="small muted">{pct.format(i.levelPart * 100)}%</span>}
      </div>
      {i.map && (
        <div class="small faint">
          {i.map}
          {i.zone !== undefined && ` · Khu ${i.zone}`}
        </div>
      )}
      {money.length > 0 && <div class="small mono muted">{money.join(' · ')}</div>}
      <div class="small faint">
        {i.online ? 'đang trong game · ' : ''}
        {ago(i.at, now)}
      </div>
    </div>
  );
}

function ProxyCell({ r }: { r: Listed }) {
  const p = proxyOf(r.data);
  if (!p) return <None />;
  const id = `px${r.id}`;
  const line = proxyLine(p);
  return (
    <span class="cell">
      <span class="mono small secret" id={id} data-secret={line} data-hidden={proxyMasked(p)}>
        {proxyMasked(p)}
      </span>
      {p.enabled === false && <span class="small faint">(tắt)</span>}
      {p.password && (
        <button type="button" class="icon-btn" aria-pressed="false" data-reveal={id} aria-label={`Hiện mật khẩu proxy của ${r.username}`} title="Hiện / Ẩn">
          <Icon name="eye" cls="off" />
          <Icon name="eye-off" cls="on" />
        </button>
      )}
      <button type="button" class="icon-btn" data-copy={line} aria-label={`Chép proxy của ${r.username}`} title={`Chép ${p.kind === 'socks5' ? 'SOCKS5' : 'HTTP'}: một dòng, dán vào app được`}>
        <Icon name="copy" />
      </button>
    </span>
  );
}

function AccountRowView({ r, now }: { r: Listed; now: number }) {
  const secretId = `pw${r.id}`;
  return (
    <tr data-find={`${r.label} ${r.username}`.toLowerCase()} data-state={r.removedAt !== null ? 'removed' : 'kept'}>
      <td>
        <div class="strong">{r.label || r.username}</div>
        <div class="mono faint small">{r.username}</div>
        {r.removedAt !== null && (
          <div class="removed">
            <Pill kind="warn" title={`App xoá nick này lúc ${time(r.removedAt)}; server vẫn giữ`}>
              Đã xoá ở máy
            </Pill>
          </div>
        )}
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
      <td>
        <InfoCell r={r} now={now} />
      </td>
      <td>
        <ProxyCell r={r} />
      </td>
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
  const withProxy = rows.filter((r) => proxyOf(r.data)).length;
  const keyed = new Set(rows.flatMap((r) => (r.license ? [r.license.id] : []))).size;
  const loose = rows.filter((r) => !r.license).length;
  const removed = rows.filter((r) => r.removedAt !== null).length;
  return (
    <Layout title="Nick" nonce={nonce} nav="accounts" toasts={[flash ? { kind: 'ok', text: flash } : null]}>
      <div class="stats">
        <Stat icon="users" tone="violet" label={shown ? `Nick của key ${keyName(shown)}` : 'Tổng nick'} value={rows.length} cap="mật khẩu lưu nguyên văn" />
        <Stat icon="globe" tone="blue" label="Có proxy" value={withProxy} cap={`${rows.length - withProxy} đi thẳng`} />
        <Stat icon="key-round" tone="green" label="Theo key" value={keyed} cap="key đã đồng bộ nick" />
        <Stat icon="triangle-alert" tone="amber" label="Không key" value={loose} cap="không key nào giữ" />
      </div>
      <div class="toolbar">
        <h1>Nick</h1>
        {removed > 0 && (
          <div class="seg" role="group" aria-label="Lọc nick đã xoá ở máy" data-filter>
            <button type="button" aria-pressed="true" data-state="">
              Tất cả <span class="n">{rows.length}</span>
            </button>
            <button type="button" aria-pressed="false" data-state="removed">
              Đã xoá ở máy <span class="n">{removed}</span>
            </button>
          </div>
        )}
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
        <Table head={['Nick', 'Mật khẩu', 'Server', 'Nhân vật', 'Proxy', 'Key', 'Cập nhật', <span class="sr">Xoá</span>]}>
          <>
            {rows.map((r) => (
              <AccountRowView r={r} now={now} />
            ))}
            <tr class="none" data-none hidden>
              <td colspan={8}>Không có nick nào khớp.</td>
            </tr>
          </>
        </Table>
      ) : (
        <Empty icon="users">{shown ? 'Key này chưa đồng bộ nick nào.' : 'Chưa có nick nào: app có key tự đồng bộ nick lên.'}</Empty>
      )}
    </Layout>
  );
}
