// API token: make one (shown once), and revoke them.
import { MAX_TOKEN_NAME } from '../config/constants.ts';
import type { Token } from '../models/index.ts';
import { time } from '../utils/format.ts';
import { Layout, Message, Table } from './layout.tsx';

type TokensProps = { nonce: string; list: Token[]; made?: { name: string; token: string } | null; error?: string | null };

export function TokensView({ nonce, list, made, error }: TokensProps) {
  return (
    <Layout title="API token" nonce={nonce} nav="tokens">
      <h1>API token</h1>
      <p class="sub">
        App (hay curl) gửi kèm <code>Authorization: Bearer &lt;token&gt;</code> để đọc và gửi nick. Mỗi máy một token, để thu hồi riêng.
      </p>
      {made && (
        <div class="msg ok" role="status">
          Đã tạo token "{made.name}". Chép ngay: server chỉ giữ dấu băm nên không hiện lại được.
          <code class="token">{made.token}</code>
          <button type="button" data-copy={made.token}>
            Chép token
          </button>
        </div>
      )}
      <Message kind="error" text={error} />
      <div class="card gap">
        <form method="post" action="/admin/tokens" class="row">
          <div>
            <label for="name">Tên token (ví dụ: Máy nhà, Máy công ty)</label>
            <input id="name" name="name" type="text" maxlength={MAX_TOKEN_NAME} required />
          </div>
          <div class="fixed">
            <button class="primary" type="submit">
              Tạo token
            </button>
          </div>
        </form>
      </div>
      <Table head={['Tên', 'Bắt đầu bằng', 'Tạo lúc', 'Dùng lần cuối', <span class="muted">Thu hồi</span>]}>
        {list.length ? (
          list.map((t) => (
            <tr>
              <td>{t.name}</td>
              <td class="mono">{t.prefix}…</td>
              <td>{time(t.createdAt)}</td>
              <td>{time(t.lastUsedAt)}</td>
              <td>
                <form class="inline" method="post" action={`/admin/tokens/${t.id}/delete`} data-confirm={`Thu hồi token ${t.name}? App dùng token này sẽ không gửi được nữa.`}>
                  <button class="small danger" type="submit">
                    Thu hồi
                  </button>
                </form>
              </td>
            </tr>
          ))
        ) : (
          <tr>
            <td colspan={5} class="muted">
              Chưa có token nào.
            </td>
          </tr>
        )}
      </Table>
    </Layout>
  );
}
