// Nick: every account the app of a key synced or a token sent, with its password behind Hiện, Chép, and Xoá; the
// accounts of one key alone with ?key=<id>.
import type { Listed } from '../services/account.service.ts';
import { keyName, time } from '../utils/format.ts';
import { Field, Icon, Layout, Message, None, Table } from './layout.tsx';

/** A key in the filter of the page: its id, and its note or its start. */
export type KeyName = { id: number; key: string; note: string };

/** "host:port" of the account's proxy, "(tắt)" when it is off. */
function proxyText(data: string): string {
  try {
    const p = (JSON.parse(data) as { proxy?: { host?: string; port?: number; enabled?: boolean } }).proxy;
    if (!p?.host) return '—';
    return `${p.host}:${p.port ?? ''}${p.enabled === false ? ' (tắt)' : ''}`;
  } catch {
    return '—';
  }
}

function AccountRowView({ r }: { r: Listed }) {
  const secretId = `pw${r.id}`;
  return (
    <tr data-find={`${r.label} ${r.username}`.toLowerCase()}>
      <td>{r.label || <None />}</td>
      <td class="mono">{r.username}</td>
      <td>
        <span class="cell">
          <span class="secret mono" id={secretId} data-secret={r.password}>
            {r.password ? '••••••••' : <span class="muted">(trống)</span>}
          </span>
          {r.password && (
            <>
              <md-icon-button
                toggle
                data-reveal={secretId}
                aria-label={`Hiện mật khẩu của ${r.username}`}
                aria-label-selected={`Ẩn mật khẩu của ${r.username}`}
                title="Hiện / Ẩn"
              >
                <Icon name="visibility" md />
                <Icon name="visibility_off" selected />
              </md-icon-button>
              <md-icon-button data-copy={r.password} aria-label={`Chép mật khẩu của ${r.username}`} title="Chép">
                <Icon name="content_copy" md />
              </md-icon-button>
            </>
          )}
        </span>
      </td>
      <td>{r.serverId}</td>
      <td class="mono">{proxyText(r.data)}</td>
      <td>
        {r.license ? (
          <a href={`/admin?key=${r.license.id}`} class="cell" title={`Chỉ nick của key ${r.license.key}`}>
            <Icon name="key" />
            {keyName(r.license)}
          </a>
        ) : (
          <None />
        )}
      </td>
      <td>{r.source || <None />}</td>
      <td>{time(r.updatedAt)}</td>
      <td>
        <form method="post" action={`/admin/accounts/${r.id}/delete`} data-confirm={`Xoá nick ${r.username} khỏi server? App không bị ảnh hưởng.`}>
          <md-icon-button class="danger" type="submit" aria-label={`Xoá nick ${r.username}`} title="Xoá">
            <Icon name="delete" md />
          </md-icon-button>
        </form>
      </td>
    </tr>
  );
}

type AccountsProps = {
  nonce: string;
  rows: Listed[];
  flash?: string | null;
  /** Every key, for the filter; `shown` the one filtered on. */
  keys: KeyName[];
  shown?: KeyName | null;
};

export function AccountsView({ nonce, rows, flash, keys, shown }: AccountsProps) {
  return (
    <Layout title="Nick" nonce={nonce} nav="accounts">
      <h1>Nick đã đồng bộ</h1>
      <p class="sub">
        Nick app của mỗi key tự đồng bộ lên (khi key còn dùng được, tối đa số nick của key) hoặc gửi bằng API token, mỗi server game và tài khoản
        một dòng. Hai máy cùng một nick thì gộp từng mục, mục nào sửa sau thì giữ. Mật khẩu lưu nguyên văn, không mã hoá.
      </p>
      <Message kind="ok" text={flash} />
      <div class="bar">
        <span class="count">
          {rows.length} nick{shown ? ` của key ${keyName(shown)}` : ''} <span id="shown"></span>
        </span>
        <form method="get" action="/admin" data-autosubmit>
          <md-outlined-select name="key" label="Key" aria-label="Chỉ nick của một key">
            <md-select-option value="" selected={shown ? undefined : true}>
              <div slot="headline">Mọi key</div>
            </md-select-option>
            {keys.map((k) => (
              <md-select-option value={String(k.id)} selected={shown?.id === k.id ? true : undefined}>
                <div slot="headline">{keyName(k)}</div>
                <div slot="supporting-text">{k.key}</div>
              </md-select-option>
            ))}
          </md-outlined-select>
        </form>
        <md-outlined-button data-reveal-all aria-pressed="false">
          <Icon name="visibility" slot="icon" />
          <span data-text>Hiện mọi mật khẩu</span>
        </md-outlined-button>
        <md-filled-tonal-button href="/admin/accounts.json" download="">
          <Icon name="download" slot="icon" />
          Tải JSON (Nhập được vào app)
        </md-filled-tonal-button>
        <Field id="find" name="find" label="Tìm theo tên hay tài khoản" type="search" icon="search" aria-label="Tìm nick" />
      </div>
      <Table head={['Tên hiển thị', 'Tài khoản', 'Mật khẩu', 'Server', 'Proxy', 'Key', 'Gửi từ', 'Cập nhật', <span class="muted">Xoá</span>]}>
        {rows.length ? (
          rows.map((r) => <AccountRowView r={r} />)
        ) : (
          <tr>
            <td colspan={9} class="muted wrap">
              {shown ? 'Key này chưa đồng bộ nick nào.' : 'Chưa có nick nào.'} App có key tự đồng bộ nick lên; hoặc tạo một API token rồi gửi bằng{' '}
              <code>POST /api/accounts</code> (README.md của thư mục server).
            </td>
          </tr>
        )}
      </Table>
    </Layout>
  );
}
