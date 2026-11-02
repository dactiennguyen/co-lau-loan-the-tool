// Nick: every account the app sent, with its password behind Hiện, Chép, and Xoá.
import type { AccountRow } from '../models/index.ts';
import { time } from '../utils/format.ts';
import { Layout, Message, None, Table } from './layout.tsx';

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

function AccountRowView({ r }: { r: AccountRow }) {
  const secretId = `pw${r.id}`;
  return (
    <tr data-find={`${r.label} ${r.username}`.toLowerCase()}>
      <td>{r.label || <None />}</td>
      <td class="mono">{r.username}</td>
      <td>
        <span class="secret mono" id={secretId} data-secret={r.password}>
          {r.password ? '••••••••' : <span class="muted">(trống)</span>}
        </span>
        {r.password && (
          <>
            {' '}
            <button class="small" type="button" data-reveal={secretId} aria-pressed="false" aria-label={`Hiện mật khẩu của ${r.username}`}>
              Hiện
            </button>{' '}
            <button class="small" type="button" data-copy={r.password}>
              Chép
            </button>
          </>
        )}
      </td>
      <td>{r.serverId}</td>
      <td class="mono">{proxyText(r.data)}</td>
      <td>{r.source || <None />}</td>
      <td>{time(r.updatedAt)}</td>
      <td>
        <form class="inline" method="post" action={`/admin/accounts/${r.id}/delete`} data-confirm={`Xoá nick ${r.username} khỏi server? App không bị ảnh hưởng.`}>
          <button class="small danger" type="submit">
            Xoá
          </button>
        </form>
      </td>
    </tr>
  );
}

export function AccountsView({ nonce, rows, flash }: { nonce: string; rows: AccountRow[]; flash?: string | null }) {
  return (
    <Layout title="Nick" nonce={nonce} nav="accounts">
      <h1>Nick đã đồng bộ</h1>
      <p class="sub">
        Nick các máy tự đồng bộ lên (15 phút một lần) hoặc gửi bằng API token, mỗi server game và tài khoản một dòng. Hai máy cùng một nick thì gộp
        từng mục, mục nào sửa sau thì giữ. Mật khẩu lưu nguyên văn, không mã hoá.
      </p>
      <Message kind="ok" text={flash} />
      <div class="bar">
        <span class="count">
          {rows.length} nick <span id="shown"></span>
        </span>
        <input id="find" type="search" placeholder="Tìm theo tên hay tài khoản" aria-label="Tìm nick" />
        <button type="button" data-reveal-all aria-pressed="false">
          Hiện mọi mật khẩu
        </button>
        <a class="btn" href="/admin/accounts.json" download>
          Tải JSON (Nhập được vào app)
        </a>
      </div>
      <Table head={['Tên hiển thị', 'Tài khoản', 'Mật khẩu', 'Server', 'Proxy', 'Gửi từ', 'Cập nhật', <span class="muted">Xoá</span>]}>
        {rows.length ? (
          rows.map((r) => <AccountRowView r={r} />)
        ) : (
          <tr>
            <td colspan={8} class="muted wrap">
              Chưa có nick nào. App từ bản 1.1.4 tự đồng bộ nick lên; hoặc tạo một API token rồi gửi bằng <code>POST /api/accounts</code> (README.md của thư mục server).
            </td>
          </tr>
        )}
      </Table>
    </Layout>
  );
}
