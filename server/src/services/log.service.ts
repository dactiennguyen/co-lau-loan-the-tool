// The Log page (README.md#log): a row for each thing that happened, written in the same D1 batch as the change it is
// about wherever there is one, so logging costs no query of its own (D1 takes 50 queries a request on the Workers Free
// plan, a batch counting as one). Refusals are counted: those of one IP, kind and key within a window are one row.
// Rows older than LOG_KEEP_MS go as the Log page opens, and now and then as one is written.
import { and, desc, eq, exists, getTableColumns, gt, gte, inArray, isNull, like, lt, notExists, or, sql, type SQL } from 'drizzle-orm';
import type { BatchItem } from 'drizzle-orm/batch';
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core';
import { D1_MAX_PARAMS, LOG_DANGER_COUNT, LOG_KEEP_MS, LOG_PAGE, LOG_PRUNE_CHANCE } from '../config/constants.ts';
import type { Db } from '../db/client.ts';
import { licenses, logs as table } from '../db/schema.ts';
import type { License, Log, LogGroup, LogKind, LogLevel } from '../models/index.ts';
import { startOfDay } from '../utils/format.ts';

/** One thing that happened: what, who and where, and the line the page shows. `at` is now unless given. */
export type Entry = {
  kind: LogKind;
  level?: LogLevel;
  licenseId?: number | null;
  actor: Log['actor'];
  ip?: string;
  deviceId?: string;
  hostname?: string;
  username?: string;
  serverId?: number | null;
  message: string;
  /** More of it, kept as JSON. */
  detail?: Record<string, unknown> | null;
  /** The app's id of an event of a sync: the same event sent again is not logged again. */
  eventId?: string | null;
  at?: number;
};

type Item = BatchItem<'sqlite'>;

/** Who did what the admin page did: the admin, from that IP. */
export const byAdmin = (ip: string) => ({ actor: 'admin' as const, ip });

/** Who did what the app of the key `l` did: that app, from that IP, on the device that holds the key. */
export const byApp = (l: License, ip: string) => ({ actor: 'app' as const, licenseId: l.id, ip, deviceId: l.deviceId ?? '', hostname: l.hostname });

/** The row of an entry, every column given (an insert-select takes them in the order of the table). */
function rowOf(e: Entry, now: number): Omit<Log, 'id'> {
  const at = e.at ?? now;
  return {
    at,
    kind: e.kind,
    level: e.level ?? 'info',
    licenseId: e.licenseId ?? null,
    actor: e.actor,
    ip: e.ip ?? '',
    deviceId: e.deviceId ?? '',
    hostname: e.hostname ?? '',
    username: e.username ?? '',
    serverId: e.serverId ?? null,
    message: e.message,
    detail: e.detail ? JSON.stringify(e.detail) : null,
    count: 1,
    lastAt: at,
    eventId: e.eventId ?? null,
  };
}

const COLUMNS = Object.keys(getTableColumns(table)) as (keyof Log)[];
/** The most rows one insert takes: each column but the id is a bound parameter. */
const ROWS_PER_INSERT = Math.floor(D1_MAX_PARAMS / (COLUMNS.length - 1));

/** The writes of the entries, to go in a batch: a few rows an insert, under the parameters D1 takes. A row of an event
 * logged already (the same key and event id) is left out; each result says how many rows went in. */
export function inserts(db: Db, entries: Entry[], now = Date.now()): Item[] {
  const out: Item[] = [];
  for (let i = 0; i < entries.length; i += ROWS_PER_INSERT) {
    out.push(
      db
        .insert(table)
        .values(entries.slice(i, i + ROWS_PER_INSERT).map((e) => rowOf(e, now)))
        .onConflictDoNothing(),
    );
  }
  return out;
}

/** The write of an entry that goes only when `when` holds as the batch gets to it: one query whatever it finds. */
export function insertIf(db: Db, e: Entry, when: SQL, now = Date.now()): Item {
  const row = rowOf(e, now);
  const values = COLUMNS.map((k) => (k === 'id' ? sql`null` : sql`${row[k]}`));
  return db.insert(table).select(sql`select ${sql.join(values, sql`, `)} where ${when}`);
}

/** The text that stands for the count in a line of LOG.burst, which the database fills in. */
const MARK = '\u0000';

/** The writes of a refusal of `e.ip`, counted with those of the same kind, IP and key (none for a key not known) within
 * `window`: one more on the last such row, else a new row ('warn'). With `burst`, a row counted LOG_DANGER_COUNT times
 * or more is 'danger' and says `burst` (with the count for MARK); without, it stays 'warn' and keeps its line. The two
 * writes go in one batch, so they are one query and never both write. */
export function counted(
  db: Db,
  e: Entry & { ip: string },
  window: number,
  burst?: (ip: string, n: string) => string,
  now = Date.now(),
): Item[] {
  const same = and(
    eq(table.kind, e.kind),
    eq(table.ip, e.ip),
    e.licenseId == null ? isNull(table.licenseId) : eq(table.licenseId, e.licenseId),
    gt(table.at, now - window),
  );
  const n = sql`${table.count} + 1`;
  const many = sql`${n} >= ${LOG_DANGER_COUNT}`;
  const [head = '', tail = ''] = burst ? burst(e.ip, MARK).split(MARK) : [];
  const more = burst
    ? {
        count: n,
        lastAt: now,
        level: sql`CASE WHEN ${many} THEN 'danger' ELSE ${table.level} END`,
        message: sql`CASE WHEN ${many} THEN ${head} || (${n}) || ${tail} ELSE ${table.message} END`,
      }
    : { count: n, lastAt: now };
  return [
    db
      .update(table)
      .set(more)
      .where(inArray(table.id, db.select({ id: table.id }).from(table).where(same).orderBy(desc(table.id)).limit(1))),
    insertIf(db, { ...e, level: 'warn' }, notExists(db.select({ id: table.id }).from(table).where(same)), now),
  ];
}

/** Whether the device `deviceId` activated the key at `now`: true after the write of an activation that went, earlier
 * in the same batch (insertIf). */
export const activated = (db: Db, licenseId: number, deviceId: string, now: number) =>
  exists(
    db
      .select({ id: licenses.id })
      .from(licenses)
      .where(and(eq(licenses.id, licenseId), eq(licenses.deviceId, deviceId), eq(licenses.activatedAt, now))),
  );

/** Deletes the rows older than LOG_KEEP_MS. */
export const prune = (db: Db, now = Date.now()) => db.delete(table).where(lt(table.at, now - LOG_KEEP_MS));

/** Runs `items` (writes of entries, and whatever goes with them) in one batch, with a prune now and then after them:
 * the results of `items`, in their order. */
export async function run(db: Db, items: Item[], now = Date.now()): Promise<unknown[]> {
  const all = Math.random() < LOG_PRUNE_CHANCE ? [...items, prune(db, now)] : items;
  const [first, ...rest] = all;
  return first ? db.batch([first, ...rest]) : [];
}

/** Writes the entries, one query. */
export const add = (db: Db, ...entries: Entry[]) => run(db, inserts(db, entries));

// ---- The Log page ---------------------------------------------------------------------------------------------------

/** Where a page of the Log page starts: after the row last at `lastAt` with the id `id` (Xem thêm). */
export type Cursor = { lastAt: number; id: number };

/** What the Log page shows (validators/log.validator.ts): a level ('warn' with 'danger'), a group of kinds, a key, a
 * search in the line, IP, account and device name, and the rows after a cursor. */
export type Filter = { level?: 'warn' | 'danger'; kind?: LogGroup; key?: number; q?: string; before?: Cursor };

/** A row of the Log page, with the key it is about when that key is still there. */
export type Listed = Log & { license: { id: number; key: string; note: string } | null };

/** The numbers of the stat cards: rows today (Vietnam), and over 24 hours the warnings (of them 'danger'), the wrong
 * keys typed and the IPs that typed them, and what the apps did (of it, accounts removed); all by the last time of a
 * row. */
export type Stats = { today: number; warn: number; danger: number; wrongKeys: number; wrongIps: number; app: number; removed: number };

const DAY = 86_400_000;
/** "%" and "_" of a search are themselves. */
const pattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
const contains = (column: SQLiteColumn, q: string) => sql`${column} LIKE ${pattern(q)} ESCAPE '\\'`;

function where(f: Filter): SQL | undefined {
  const b = f.before;
  return and(
    f.level === 'danger' ? eq(table.level, 'danger') : f.level === 'warn' ? inArray(table.level, ['warn', 'danger']) : undefined,
    f.kind ? like(table.kind, `${f.kind}.%`) : undefined,
    f.key ? eq(table.licenseId, f.key) : undefined,
    f.q ? or(...[table.message, table.ip, table.username, table.hostname].map((c) => contains(c, f.q!))) : undefined,
    b ? or(lt(table.lastAt, b.lastAt), and(eq(table.lastAt, b.lastAt), lt(table.id, b.id))) : undefined,
  );
}

/** The Log page in one query: the old rows pruned, the stats, and the rows of the filter, the last to happen first (a
 * counted row by its last time), LOG_PAGE of them; `more` when there are others after them. */
export async function page(db: Db, f: Filter, now = Date.now()): Promise<{ rows: Listed[]; stats: Stats; more: boolean }> {
  const day = now - DAY;
  const since = Math.min(startOfDay(now), day);
  const recent = sql`${table.lastAt} >= ${day}`;
  const n = (when: SQL) => sql<number>`count(CASE WHEN ${when} THEN 1 END)`;
  const [, [stats], rows] = await db.batch([
    prune(db, now),
    db
      .select({
        today: n(sql`${table.lastAt} >= ${startOfDay(now)}`),
        warn: n(sql`${recent} AND ${table.level} != 'info'`),
        danger: n(sql`${recent} AND ${table.level} = 'danger'`),
        wrongKeys: sql<number>`coalesce(sum(CASE WHEN ${recent} AND ${table.kind} = 'key.unknown' THEN ${table.count} END), 0)`,
        wrongIps: sql<number>`count(DISTINCT CASE WHEN ${recent} AND ${table.kind} = 'key.unknown' THEN ${table.ip} END)`,
        app: n(sql`${recent} AND ${table.kind} LIKE 'app.%'`),
        removed: n(sql`${recent} AND ${table.kind} = 'app.remove'`),
      })
      .from(table)
      .where(gte(table.lastAt, since)),
    db
      .select({ ...getTableColumns(table), licenseKey: licenses.key, licenseNote: licenses.note })
      .from(table)
      .leftJoin(licenses, eq(licenses.id, table.licenseId))
      .where(where(f))
      .orderBy(desc(table.lastAt), desc(table.id))
      .limit(LOG_PAGE + 1),
  ]);
  const listed = rows.slice(0, LOG_PAGE).map(({ licenseKey, licenseNote, ...r }) => ({
    ...r,
    license: r.licenseId !== null && licenseKey !== null ? { id: r.licenseId, key: licenseKey, note: licenseNote ?? '' } : null,
  }));
  return { rows: listed, stats: stats ?? { today: 0, warn: 0, danger: 0, wrongKeys: 0, wrongIps: 0, app: 0, removed: 0 }, more: rows.length > LOG_PAGE };
}
