// Thiết bị: every device that said hello, with its accounts; Chặn with a reason, Bỏ chặn, Cho đồng bộ, Tắt đồng bộ,
// Đặt tên, Xoá khỏi danh sách.
import { DEFAULT_SERVER_ID } from '../config/constants.ts';
import type { Device } from '../models/index.ts';
import { ago, time } from '../utils/format.ts';
import { Chip, Field, Icon, Layout, Message, None, Table } from './layout.tsx';

/** The accounts of the device's last hello, the game server after any but the usual one. */
function Nicks({ accounts }: { accounts: string }) {
  let list: { username: string; serverId: number }[];
  try {
    list = JSON.parse(accounts);
  } catch {
    return <None />;
  }
  if (!list.length) return <None />;
  return (
    <>
      {list.map((a, i) => (
        <>
          {i ? ', ' : ''}
          <span class="mono">{a.username}</span>
          {a.serverId !== DEFAULT_SERVER_ID && (
            <>
              {' '}
              <span class="muted">({a.serverId})</span>
            </>
          )}
        </>
      ))}
    </>
  );
}

/** One action of a row: a small form posting to /admin/devices/<id>/<action>. */
function Act({ at, action, confirm, children }: { at: string; action: string; confirm?: string; children: unknown }) {
  return (
    <form method="post" action={`${at}/${action}`} data-confirm={confirm}>
      {children}
    </form>
  );
}

function DeviceRow({ d, now }: { d: Device; now: number }) {
  const name = d.label || d.hostname || 'Không tên';
  const at = `/admin/devices/${d.id}`;
  return (
    <tr data-find={`${d.label} ${d.hostname} ${d.accounts} ${d.ip} ${d.id}`.toLowerCase()} class={d.blocked ? 'blocked' : undefined}>
      <td class="wrap">
        <span class="cell">
          <Icon name="computer" />
          <b>{name}</b>
        </span>
        {d.label && d.hostname && <div class="muted">{d.hostname}</div>}
        <div class="muted mono" title={d.id}>
          {d.id.slice(0, 12)}…
        </div>
      </td>
      <td>
        {d.os || '—'}
        <div class="muted">bản {d.version || '—'}</div>
      </td>
      <td class="wrap">
        <Nicks accounts={d.accounts} />
      </td>
      <td class="mono">{d.ip || '—'}</td>
      <td title={`Lần đầu: ${time(d.firstSeen)}`}>
        {ago(d.lastSeen, now)}
        <div class="muted">{time(d.lastSeen)}</div>
      </td>
      <td class="wrap">
        {d.blocked ? (
          <>
            <Chip kind="off" icon="block">
              Bị chặn
            </Chip>
            {d.reason && <div class="muted wrap">{d.reason}</div>}
          </>
        ) : (
          <Chip kind="on" icon="check_circle">
            Được dùng
          </Chip>
        )}
        <div class="muted" title={d.settings ? `Cài đặt: ${d.settings}` : undefined}>
          {d.syncAllowed ? (d.syncedAt ? `Đồng bộ nick ${ago(d.syncedAt, now)}` : 'Cho đồng bộ, chưa gửi') : 'Chưa cho đồng bộ nick'}
        </div>
      </td>
      <td>
        <div class="acts">
          {d.blocked ? (
            <Act at={at} action="unblock">
              <md-outlined-button type="submit">
                <Icon name="lock_open" slot="icon" />
                Bỏ chặn
              </md-outlined-button>
            </Act>
          ) : (
            <Act at={at} action="block" confirm={`Chặn ${name}? App trên máy đó bị khoá trong tối đa 15 phút.`}>
              {/* No maxlength: Material would show a counter in every row; the server cuts it (blockForm). */}
              <Field name="reason" label="Lý do (app hiện)" aria-label={`Lý do chặn ${name}`} />
              <md-icon-button class="danger" type="submit" aria-label={`Chặn ${name}`} title="Chặn">
                <Icon name="block" md />
              </md-icon-button>
            </Act>
          )}
          {d.syncAllowed ? (
            <Act at={at} action="sync-off" confirm={`Tắt đồng bộ nick của ${name}? Nick đã gửi vẫn giữ.`}>
              <md-icon-button type="submit" aria-label={`Tắt đồng bộ nick của ${name}`} title="Tắt đồng bộ">
                <Icon name="sync_disabled" md />
              </md-icon-button>
            </Act>
          ) : (
            <Act at={at} action="sync-on" confirm={`Cho ${name} đồng bộ nick lên server? Nick máy đó gửi sẽ gộp vào trang Nick.`}>
              <md-filled-tonal-button type="submit">
                <Icon name="sync" slot="icon" />
                Cho đồng bộ
              </md-filled-tonal-button>
            </Act>
          )}
          <Act at={at} action="rename">
            <Field name="label" label="Tên máy" value={d.label} aria-label={`Tên của ${name}`} />
            <md-icon-button type="submit" aria-label={`Đặt tên cho ${name}`} title="Đặt tên">
              <Icon name="edit" md />
            </md-icon-button>
          </Act>
          <Act at={at} action="delete" confirm={`Xoá ${name} khỏi danh sách? Mở app lần tới nó sẽ hiện lại và vẫn được dùng.`}>
            <md-icon-button type="submit" aria-label={`Xoá ${name} khỏi danh sách`} title="Xoá khỏi danh sách">
              <Icon name="delete" md />
            </md-icon-button>
          </Act>
        </div>
      </td>
    </tr>
  );
}

export function DevicesView({ nonce, list, flash, now }: { nonce: string; list: Device[]; flash: string | null; now: number }) {
  const blocked = list.filter((d) => d.blocked).length;
  return (
    <Layout title="Thiết bị" nonce={nonce} nav="devices">
      <h1>Thiết bị</h1>
      <p class="sub">
        Máy nào mở app cũng tự báo về khi mở và 15 phút một lần, kèm danh sách nick; máy được admin <b>Cho đồng bộ</b> thì gửi luôn nick và cài đặt lên
        trang Nick (máy không gửi bí mật nào, nên chỉ máy đã duyệt mới được ghi nick). Chặn một máy thì app trên máy đó bị khoá, kể cả khi mất mạng.
      </p>
      <Message kind="ok" text={flash} />
      <div class="bar">
        <span class="count">
          {list.length} thiết bị{blocked ? `, ${blocked} bị chặn` : ''} <span id="shown"></span>
        </span>
        <Field id="find" name="find" label="Tìm theo tên máy, nick, IP" type="search" icon="search" aria-label="Tìm thiết bị" />
      </div>
      <Table head={['Thiết bị', 'Hệ điều hành', 'Nick', 'IP', 'Hoạt động', 'Trạng thái', <span class="muted">Thao tác</span>]}>
        {list.length ? (
          list.map((d) => <DeviceRow d={d} now={now} />)
        ) : (
          <tr>
            <td colspan={7} class="muted wrap">
              Chưa có thiết bị nào. Mỗi máy mở app (bản có quản lý thiết bị) sẽ tự hiện ở đây.
            </td>
          </tr>
        )}
      </Table>
    </Layout>
  );
}
