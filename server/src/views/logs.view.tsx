// Log: four stat cards (today, then warnings, wrong keys and what the apps did over 24 hours); the level as segmented
// links, the kind, the key and a search, all filtered on the server; the last to happen first (a counted row by its last
// time); each row with when, its level, its kind, its line (how many times, from when to when), who did it and from
// where; Xem thêm for the rows after them.
import type { LogGroup, LogLevel } from '../models/index.ts';
import type { Filter, Listed, Stats } from '../services/log.service.ts';
import { ago, clock, keyName, sameDay, time } from '../utils/format.ts';
import type { KeyName } from './accounts.view.tsx';
import type { IconName } from './icons.ts';
import { Empty, Field, Icon, Layout, Select, Stat, Table } from './layout.tsx';

type LogsProps = {
  nonce: string;
  rows: Listed[];
  stats: Stats;
  /** There are rows before the last one shown. */
  more: boolean;
  filter: Filter;
  /** Every key, for the filter. */
  keys: KeyName[];
  now: number;
};

const LEVELS: [Filter['level'], string][] = [
  [undefined, 'Tất cả'],
  ['warn', 'Cảnh báo'],
  ['danger', 'Nguy hiểm'],
];

const LEVEL_TEXT: Record<LogLevel, string> = { info: 'Thông tin', warn: 'Cảnh báo', danger: 'Nguy hiểm' };

/** The groups of kinds, as the filter and the kind of a row name them. */
const GROUPS: Record<LogGroup, [string, IconName]> = {
  key: ['Key', 'key-round'],
  sync: ['Đồng bộ', 'refresh'],
  app: ['Nick ở app', 'monitor'],
  admin: ['Admin', 'shield-check'],
};

/** The page with the filter changed by `change`, from its first rows unless `change` gives a cursor. */
function href(f: Filter, change: Partial<Filter>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...f, before: undefined, ...change })) {
    if (v === undefined || v === '') continue;
    q.set(k, typeof v === 'object' ? `${v.lastAt}-${v.id}` : String(v));
  }
  const s = q.toString();
  return s ? `/admin/logs?${s}` : '/admin/logs';
}

/** The detail of a row as lines "name: value", shown on hover. */
function detailText(detail: string | null): string | undefined {
  if (!detail) return undefined;
  try {
    const d = JSON.parse(detail) as Record<string, unknown>;
    return Object.entries(d)
      .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
      .join('\n');
  } catch {
    return detail;
  }
}

/** "từ 10:01 tới 10:09" of a row counted more than once (with the days when they differ). */
const spanText = (r: Listed) =>
  sameDay(r.at, r.lastAt) ? `từ ${clock(r.at)} tới ${clock(r.lastAt)}` : `từ ${time(r.at)} tới ${time(r.lastAt)}`;

/** Who did it: the admin, the app of a key (its Log), or an IP no key is known for. */
function Who({ r }: { r: Listed }) {
  if (r.actor === 'admin') {
    return (
      <span class="tag">
        <Icon name="shield-check" />
        admin
      </span>
    );
  }
  if (r.license) {
    return (
      <a class="tag" href={`/admin/logs?key=${r.license.id}`} title={`Chỉ log của key ${r.license.key}`}>
        <Icon name="key-round" />
        {keyName(r.license)}
      </a>
    );
  }
  return <span class="mono small">{r.ip || '—'}</span>;
}

function Row({ r, now }: { r: Listed; now: number }) {
  const group = r.kind.split('.')[0] as LogGroup;
  const [kind, icon] = GROUPS[group] ?? [group, 'scroll'];
  return (
    <tr class={r.level === 'danger' ? 'danger' : undefined} data-level={r.level}>
      <td class="nowrap muted" title={time(r.lastAt)}>
        {ago(r.lastAt, now)}
      </td>
      <td class="col-lvl">
        <span class={`lvl ${r.level}`} title={LEVEL_TEXT[r.level]}>
          <span class="sr">{LEVEL_TEXT[r.level]}</span>
        </span>
      </td>
      <td>
        <span class="tag" title={r.kind}>
          <Icon name={icon} />
          {kind}
        </span>
      </td>
      <td class="msg" title={detailText(r.detail)}>
        {r.message}
        {r.count > 1 && <span class="times">×{r.count.toLocaleString('vi-VN')}</span>}
        {r.count > 1 && <div class="faint small">{spanText(r)}</div>}
      </td>
      <td>
        <Who r={r} />
      </td>
      <td class="end">
        <div class="mono small">{r.ip || '—'}</div>
        {r.hostname && <div class="faint small">{r.hostname}</div>}
      </td>
    </tr>
  );
}

export function LogsView({ nonce, rows, stats, more, filter, keys, now }: LogsProps) {
  const filtered = Object.keys(filter).length > 0;
  const last = rows[rows.length - 1];
  return (
    <Layout title="Log" nonce={nonce} nav="logs">
      <div class="stats">
        <Stat icon="scroll" tone="violet" label="Hôm nay" value={stats.today} cap="dòng log từ 0 giờ" />
        <Stat icon="triangle-alert" tone="amber" label="Cảnh báo 24h" value={stats.warn} cap={`${stats.danger} nguy hiểm`} kind={stats.warn ? 'warn' : undefined} />
        <Stat icon="shield-warning" tone="red" label="Nhập key sai 24h" value={stats.wrongKeys} cap={`từ ${stats.wrongIps} IP`} />
        <Stat icon="monitor" tone="blue" label="Việc của app 24h" value={stats.app} cap={`${stats.removed} lần xoá nick`} />
      </div>
      <div class="toolbar">
        <h1>Log</h1>
        <nav class="seg" aria-label="Lọc theo mức">
          {LEVELS.map(([level, label]) => (
            <a href={href(filter, { level })} aria-current={filter.level === level ? 'page' : undefined}>
              {label}
            </a>
          ))}
        </nav>
        <span class="grow" />
        <form method="get" action="/admin/logs" class="filters" data-autosubmit>
          {filter.level && <input type="hidden" name="level" value={filter.level} />}
          <Select
            name="kind"
            icon="scroll"
            class="kind-filter"
            aria-label="Chỉ log của một loại"
            value={filter.kind ?? ''}
            options={[['', 'Mọi loại'], ...Object.entries(GROUPS).map(([g, [label]]): [string, string] => [g, label])]}
          />
          <Select
            name="key"
            icon="key-round"
            class="filter"
            aria-label="Chỉ log của một key"
            value={filter.key ? String(filter.key) : ''}
            options={[['', 'Mọi key'], ...keys.map((k): [string, string] => [String(k.id), `${keyName(k)}${k.note ? ` · ${k.key.slice(0, 9)}` : ''}`])]}
          />
          <Field id="q" name="q" type="search" value={filter.q} placeholder="Tìm việc, IP, nick, máy" icon="search" class="search" aria-label="Tìm trong log" />
        </form>
      </div>
      {rows.length ? (
        <Table head={['Lúc', <span class="sr">Mức</span>, 'Loại', 'Việc', 'Ai', 'IP · máy']} classes={{ 1: 'col-lvl' }}>
          <>
            {rows.map((r) => (
              <Row r={r} now={now} />
            ))}
          </>
        </Table>
      ) : (
        <Empty icon="scroll">{filtered ? 'Không có log nào khớp.' : 'Chưa có log nào: key được kích hoạt hay bị từ chối, app đồng bộ, admin thao tác đều ghi ở đây.'}</Empty>
      )}
      {(more || filter.before) && (
        <div class="more">
          {filter.before && (
            <a class="btn ghost" href={href(filter, {})}>
              Về mới nhất
            </a>
          )}
          {more && last && (
            <a class="btn" href={href(filter, { before: { lastAt: last.lastAt, id: last.id } })}>
              Xem thêm
            </a>
          )}
        </div>
      )}
    </Layout>
  );
}
