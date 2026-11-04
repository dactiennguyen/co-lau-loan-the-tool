// The accounts of the desktop app, in the JSON of its Xuất JSON (app/desktop/src-tauri/src/backup.rs): kept by POST
// /api/license/sync and given back by Tải JSON, so that Nhập JSON of the app reads them as they are.
import { and, asc, count as rowCount, eq, getTableColumns, isNotNull, isNull } from 'drizzle-orm';
import { APP_NAME, EXPORT_FORMAT } from '../config/constants.ts';
import type { Db } from '../db/client.ts';
import { licenses, accounts as table } from '../db/schema.ts';
import type { Account, AccountRow, Changed, Merged, Stamped } from '../models/index.ts';
import { isObject } from '../validators/account.validator.ts';

/** JSON with the keys of every object in order, so that the same account is the same text however it was sent. */
export function canonical(value: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : isObject(v)
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])]))
        : v;
  return JSON.stringify(sort(value));
}

const key = (a: Account) => a.username.toLowerCase();

/** Fields that name the account rather than describe it: they find the row and are never merged. */
const IDENTITY = new Set(['username', 'serverId']);
const fieldsOf = (a: object) => Object.keys(a).filter((f) => !IDENTITY.has(f));

type Kept = { id: number; data: string; changed: string; licenseId: number | null };
const rowKey = (serverId: number, usernameKey: string) => `${serverId}\n${usernameKey}`;

/** Every account kept, by server and username in lower case: one query for a whole send, as D1 takes only 50 queries
 * a request on the Workers Free plan (a batch counts as one). */
async function keptRows(db: Db): Promise<Map<string, Kept>> {
  const rows = await db
    .select({ id: table.id, serverId: table.serverId, usernameKey: table.usernameKey, data: table.data, changed: table.changed, licenseId: table.licenseId })
    .from(table);
  return new Map(rows.map((r) => [rowKey(r.serverId, r.usernameKey), { id: r.id, data: r.data, changed: r.changed, licenseId: r.licenseId }]));
}

function stampsOf(text: string): Changed {
  try {
    const v = JSON.parse(text) as unknown;
    return isObject(v) ? (v as Changed) : {};
  } catch {
    return {};
  }
}

/** Who sends: the name the Nick page shows, and the key whose app sent it. */
type Sender = { source: string; licenseId: number };

/** The write that puts `next` in place of `old`, or adds it, only if the row is still as it was read: the same data,
 * times and key, or still none. Its D1 result says how many rows it changed, 0 when another send got there first. */
function save(db: Db, old: Kept | undefined, next: Account, changed: Changed, by: Sender, now: number) {
  const fields = {
    username: next.username,
    label: next.label,
    password: next.password,
    data: canonical(next),
    changed: canonical(changed),
    source: by.source,
    licenseId: by.licenseId,
    updatedAt: now,
  };
  if (old) {
    return db
      .update(table)
      .set(fields)
      .where(
        and(
          eq(table.id, old.id),
          eq(table.data, old.data),
          eq(table.changed, old.changed),
          old.licenseId === null ? isNull(table.licenseId) : eq(table.licenseId, old.licenseId),
        ),
      );
  }
  return db
    .insert(table)
    .values({ ...fields, serverId: next.serverId, usernameKey: key(next), createdAt: now })
    .onConflictDoNothing({ target: [table.serverId, table.usernameKey] });
}

/** Raised when other sends kept changing the same accounts through every try; the sender sends again later. */
export class Busy extends Error {}
const TRIES = 3;

/** What becomes of one account over the row kept (none: a new one): the account and the times of its fields, and
 * whether a field differing was kept as the server had it. */
type Decided = { account: Account; changed: Changed; kept: boolean };

type Sent<T> = { account: T; at: Changed };

/** Each account written as `decide` makes it over the row kept, in one batch. A row another send changed between the
 * read and the write is read again and decided again, so that two sends at once are both merged (TRIES times, then
 * Busy). `admit`, at each read, leaves out what is not taken over the rows as they are then. Gives what was decided for
 * each account taken and the row it was decided over. An account that does not change is written only to note the key
 * that sent it. */
async function write<T extends Account>(
  db: Db,
  sent: Sent<T>[],
  decide: (old: Kept | undefined, one: T, at: Changed) => Decided,
  by: Sender,
  now: number,
  admit: (rows: Map<string, Kept>, sent: Sent<T>[]) => Sent<T>[] = (_, all) => all,
) {
  const out = new Map<string, { old: Kept | undefined; next: Decided }>();
  let pending = sent;
  for (let i = 0; i < TRIES && pending.length; i++) {
    const rows = await keptRows(db);
    const admitted = admit(rows, pending);
    for (const one of pending) if (!admitted.includes(one)) out.delete(rowKey(one.account.serverId, key(one.account)));
    pending = admitted;
    const writes = [];
    for (const one of pending) {
      const id = rowKey(one.account.serverId, key(one.account));
      const old = rows.get(id);
      const next = decide(old, one.account, one.at);
      out.set(id, { old, next });
      const moved = old?.licenseId !== by.licenseId;
      if (old?.data !== canonical(next.account) || moved) writes.push({ one, query: save(db, old, next.account, next.changed, by, now) });
    }
    const [first, ...rest] = writes.map((w) => w.query);
    const results = first ? await db.batch([first, ...rest]) : [];
    pending = writes.filter((_, j) => !(results[j] as D1Result).meta.changes).map((w) => w.one);
  }
  if (pending.length) throw new Busy('Nick đang được máy khác gửi cùng lúc, gửi lại sau');
  return out;
}

/** The accounts once each, the first of the same server and username (any case), and how many were left out. */
function once<T extends { account: Account }>(sent: T[]): [T[], number] {
  const seen = new Set<string>();
  const list = sent.filter((s) => {
    const id = rowKey(s.account.serverId, key(s.account));
    return !seen.has(id) && !!seen.add(id);
  });
  return [list, sent.length - list.length];
}

/** A time the app sent: whole milliseconds, 0 for none, never later than `now` (a clock ahead would win every time). */
const stamp = (t: number | undefined, now: number) => (t && t > 0 ? Math.min(Math.floor(t), now) : 0);

/** The account after an app sent `sent`, its fields changed at `at`, over `old` (none: a new account). Each field
 * takes the sent value (or goes, when the app has it no more) only when the app changed it later than the kept one
 * was; an empty label or password never replaces one. `kept`: some field differs, but the server's is the later. */
export function merge(old: { account: Account; changed: Changed } | null, sent: Account, at: Changed, now: number) {
  if (!old) {
    const changed = Object.fromEntries(fieldsOf({ ...at, ...sent }).map((f) => [f, stamp(at[f], now)]));
    return { account: sent, changed, kept: false };
  }
  const account: Account = { ...old.account };
  const changed: Changed = { ...old.changed };
  let kept = false;
  for (const f of fieldsOf({ ...at, ...sent })) {
    const value = sent[f];
    if (canonical(value) === canonical(old.account[f])) continue;
    if ((f === 'label' || f === 'password') && !value && old.account[f]) continue;
    const t = stamp(at[f], now);
    if (t <= (old.changed[f] ?? -1)) {
      kept = true;
      continue;
    }
    if (value === undefined) delete account[f];
    else account[f] = value;
    changed[f] = t;
  }
  return { account, changed, kept };
}

/** Đồng bộ from the app of a key (POST /api/license/sync): each account merged field by field with the one kept
 * (merge), so that the same account sent twice makes one, and the later edit of each field is the one kept.
 * - An account another key holds is never written, nor taken over: counted in `taken` (and `refused`).
 * - The accounts the key holds always go.
 * - One no key holds (new, or its key deleted) is taken only while the key holds fewer than its
 *   max_accounts; the rest are counted in `refused`.
 * Each account taken notes the key. */
export async function syncLicense(
  db: Db,
  sent: Stamped[],
  license: { id: number; maxAccounts: number },
  source: string,
  now = Date.now(),
): Promise<Merged> {
  const [list, repeated] = once(sent.map(({ account, changed }) => ({ account, at: changed })));
  const refused = new Set<string>();
  const taken = new Set<string>();
  const decided = await write(
    db,
    list,
    (old, one, at) => merge(old ? { account: JSON.parse(old.data) as Account, changed: stampsOf(old.changed) } : null, one, at, now),
    { source, licenseId: license.id },
    now,
    (rows, pending) => {
      let held = [...rows.values()].filter((r) => r.licenseId === license.id).length;
      return pending.filter((one) => {
        const id = rowKey(one.account.serverId, key(one.account));
        const holder = rows.get(id)?.licenseId ?? null;
        if (holder === license.id) return true;
        if (holder === null && held < license.maxAccounts) {
          held++;
          return true;
        }
        refused.add(id);
        if (holder !== null) taken.add(id);
        return false;
      });
    },
  );
  const done: Merged = { added: 0, updated: 0, unchanged: 0, kept: 0, repeated, refused: refused.size, taken: taken.size };
  for (const { old, next } of decided.values()) {
    if (next.kept) done.kept++;
    done[!old ? 'added' : old.data === canonical(next.account) ? 'unchanged' : 'updated']++;
  }
  return done;
}

/** An account of the Nick page, with the key whose app sent it last. */
export type Listed = AccountRow & { license: { id: number; key: string; note: string } | null };

/** Every account, first added first; only those a key sent last, when `licenseId` is given. */
export async function list(db: Db, licenseId?: number): Promise<Listed[]> {
  const rows = await db
    .select({ ...getTableColumns(table), licenseKey: licenses.key, licenseNote: licenses.note })
    .from(table)
    .leftJoin(licenses, eq(licenses.id, table.licenseId))
    .where(licenseId === undefined ? undefined : eq(table.licenseId, licenseId))
    .orderBy(asc(table.id));
  return rows.map(({ licenseKey, licenseNote, ...r }) => ({
    ...r,
    license: r.licenseId !== null && licenseKey !== null ? { id: r.licenseId, key: licenseKey, note: licenseNote ?? '' } : null,
  }));
}

/** How many accounts each key sent last, by the id of the key. */
export async function countsByLicense(db: Db): Promise<Map<number, number>> {
  const rows = await db
    .select({ id: table.licenseId, n: rowCount() })
    .from(table)
    .where(isNotNull(table.licenseId))
    .groupBy(table.licenseId);
  return new Map(rows.map((r) => [r.id!, r.n]));
}

export async function count(db: Db): Promise<number> {
  return (await db.select({ n: rowCount() }).from(table).get())?.n ?? 0;
}

/** The JSON of Tải JSON: Xuất JSON of the app, without its "settings". */
export async function exported(db: Db): Promise<string> {
  const rows = await db.select({ data: table.data }).from(table).orderBy(asc(table.id));
  const accounts = rows.map((r) => JSON.parse(r.data) as Account);
  return JSON.stringify({ app: APP_NAME, format: EXPORT_FORMAT, exportedAt: new Date().toISOString(), accounts }, null, 2) + '\n';
}

/** True when there was one to delete. */
export async function remove(db: Db, id: number): Promise<boolean> {
  const gone = await db.delete(table).where(eq(table.id, id)).returning({ id: table.id });
  return gone.length > 0;
}
