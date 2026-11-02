// API token: make one (shown once), and revoke them.
import { MAX_TOKEN_NAME } from '../config/constants.ts';
import type { Token } from '../models/index.ts';
import { time } from '../utils/format.ts';
import { Field, Icon, Layout, Message, Table } from './layout.tsx';

type TokensProps = { nonce: string; list: Token[]; made?: { name: string; token: string } | null; errors?: Record<string, string> };

export function TokensView({ nonce, list, made, errors = {} }: TokensProps) {
  return (
    <Layout title="API token" nonce={nonce} nav="tokens">
      <h1>API token</h1>
      <p class="sub">
        App (hay curl) gửi kèm <code>Authorization: Bearer &lt;token&gt;</code> để đọc và gửi nick. Mỗi máy một token, để thu hồi riêng.
      </p>
      {made && (
        <Message kind="ok">
          Đã tạo token "{made.name}". Chép ngay: server chỉ giữ dấu băm nên không hiện lại được.
          <code class="token">{made.token}</code>
          <md-filled-button data-copy={made.token}>
            <Icon name="content_copy" slot="icon" />
            Chép token
          </md-filled-button>
        </Message>
      )}
      <div class="card gap">
        <form method="post" action="/admin/tokens" class="row">
          <Field name="name" label="Tên token" hint="Ví dụ: Máy nhà, Máy công ty" maxlength={MAX_TOKEN_NAME} required error={errors.name} icon="key" />
          <md-filled-button type="submit">
            <Icon name="add" slot="icon" />
            Tạo token
          </md-filled-button>
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
                <form method="post" action={`/admin/tokens/${t.id}/delete`} data-confirm={`Thu hồi token ${t.name}? App dùng token này sẽ không gửi được nữa.`}>
                  <md-icon-button class="danger" type="submit" aria-label={`Thu hồi token ${t.name}`} title="Thu hồi">
                    <Icon name="key_off" md />
                  </md-icon-button>
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
