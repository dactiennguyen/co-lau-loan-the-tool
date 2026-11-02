// The accounts of the desktop app, in the JSON of its Xuất JSON (app/desktop/src-tauri/src/backup.rs): kept by POST
// /api/accounts and given back by GET /api/accounts and Tải JSON, so that Nhập JSON of the app reads them as they are.
import { and, asc, count as rowCount, eq } from 'drizzle-orm';
import { APP_NAME, EXPORT_FORMAT } from '../config/constants.ts';
import type { Db } from '../db/client.ts';
import { accounts as table } from '../db/schema.ts';
import type { Account, AccountRow, Changed, Merged, Stamped, Synced } from '../models/index.ts';
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

/** The account replacing `old`, as Ghi đè of the app (backup::replacement): everything sent, but an empty label or
 * password keeps the old one, and so does an empty proxy password for the same proxy user. */
export function replacement(old: Account, sent: Account): Account {
  const next: Account = { ...sent, label: sent.label.trim() ? sent.label : old.label, password: sent.password || old.password };
  const [was, now] = [old.proxy, sent.proxy];
  if (isObject(was) && isObject(now) && now.username && !now.password && now.username === was.username && was.password) {
    next.proxy = { ...now, password: was.password };
  }
  return next;
}

const key = (a: Account) => a.username.toLowerCase();

/** Fields that name the account rather than describe it: they find the row and are never merged. */
const IDENTITY = new Set(['username', 'serverId']);
const fieldsOf = (a: object) => Object.keys(a).filter((f) => !IDENTITY.has(f));

type Kept = { id: number; data: string; changed: string };
const rowKey = (serverId: number, usernameKey: string) => `${serverId}\n${usernameKey}`;

/** Every account kept, by server and username in lower case: one query for a whole send, as D1 takes only 50 queries
 * a request on the Workers Free plan (a batch counts as one). */
async function keptRows(db: Db): Promise<Map<string, Kept>> {
  const rows = await db
    .select({ id: table.id, serverId: table.serverId, usernameKey: table.usernameKey, data: table.data, changed: table.changed })
    .from(table);
  return new Map(rows.map((r) => [rowKey(r.serverId, r.usernameKey), { id: r.id, data: r.data, changed: r.changed }]));
}

function stampsOf(text: string): Changed {
  try {
    const v = JSON.parse(text) as unknown;
    return isObject(v) ? (v as Changed) : {};
  } catch {
    return {};
  }
}

/** The write that puts `next` in place of `old`, or adds it, only if the row is still as it was read: the same data
 * and times, or still none. Its D1 result says how many rows it changed, 0 when another send got there first. */
function save(db: Db, old: Kept | undefined, next: Account, changed: Changed, source: string, now: number) {
  const fields = {
    username: next.username,
    label: next.label,
    password: next.password,
    data: canonical(next),
    changed: canonical(changed),
    source,
    updatedAt: now,
  };
  if (old) {
    return db
      .update(table)
      .set(fields)
      .where(and(eq(table.id, old.id), eq(table.data, old.data), eq(table.changed, old.changed)));
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

/** Each account written as `decide` makes it over the row kept, in one batch. A row another send changed between the
 * read and the write is read again and decided again, so that two sends at once are both merged (TRIES times, then
 * Busy). Gives what was decided for each account and the row it was decided over. */
async function write<T extends Account>(db: Db, sent: { account: T; at: Changed }[], decide: (old: Kept | undefined, one: T, at: Changed) => Decided, source: string, now: number) {
  const out = new Map<string, { old: Kept | undefined; next: Decided }>();
  let pending = sent;
  for (let i = 0; i < TRIES && pending.length; i++) {
    const rows = await keptRows(db);
    const writes = [];
    for (const one of pending) {
      const id = rowKey(one.account.serverId, key(one.account));
      const old = rows.get(id);
      const next = decide(old, one.account, one.at);
      out.set(id, { old, next });
      if (old?.data !== canonical(next.account)) writes.push({ one, query: save(db, old, next.account, next.changed, source, now) });
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

/** Đồng bộ lên by token: each account added, or put in place of the one of the same server and username (any case).
 * Every field it sends is stamped `now`, so a device that changed one earlier does not undo it. `source` is the name of
 * the token. */
export async function sync(db: Db, sent: Account[], source: string, now = Date.now()): Promise<Synced> {
  const [list, repeated] = once(sent.map((account) => ({ account, at: {} })));
  const decided = await write(
    db,
    list,
    (old, one) => {
      const account = old ? replacement(JSON.parse(old.data) as Account, one) : one;
      const changed = { ...(old ? stampsOf(old.changed) : {}), ...Object.fromEntries(fieldsOf(account).map((f) => [f, now])) };
      return { account, changed, kept: false };
    },
    source,
    now,
  );
  const done: Synced = { added: 0, updated: 0, unchanged: 0, repeated };
  for (const { old, next } of decided.values()) done[!old ? 'added' : old.data === canonical(next.account) ? 'unchanged' : 'updated']++;
  return done;
}

/** A time the app sent: whole milliseconds, 0 for none, never later than `now` (a clock ahead would win every time). */
const stamp = (t: number | undefined, now: number) => (t && t > 0 ? Math.min(Math.floor(t), now) : 0);

/** The account after a device sent `sent`, its fields changed at `at`, over `old` (none: a new account). Each field
 * takes the sent value (or goes, when the device has it no more) only when the device changed it later than the kept
 * one was; an empty label or password never replaces one. `kept`: some field differs, but the server's is the later. */
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

/** Đồng bộ from a device (POST /api/devices/sync): each account merged field by field with the one kept (merge), so
 * that two devices sending the same account make one, and the later edit of each field is the one kept. `source` names
 * the device. */
export async function syncDevice(db: Db, sent: Stamped[], source: string, now = Date.now()): Promise<Merged> {
  const [list, repeated] = once(sent.map(({ account, changed }) => ({ account, at: changed })));
  const decided = await write(
    db,
    list,
    (old, one, at) => merge(old ? { account: JSON.parse(old.data) as Account, changed: stampsOf(old.changed) } : null, one, at, now),
    source,
    now,
  );
  const done: Merged = { added: 0, updated: 0, unchanged: 0, kept: 0, repeated };
  for (const { old, next } of decided.values()) {
    if (next.kept) done.kept++;
    done[!old ? 'added' : old.data === canonical(next.account) ? 'unchanged' : 'updated']++;
  }
  return done;
}

/** Every account, first added first. */
export async function list(db: Db): Promise<AccountRow[]> {
  return db.select().from(table).orderBy(asc(table.id));
}

export async function count(db: Db): Promise<number> {
  return (await db.select({ n: rowCount() }).from(table).get())?.n ?? 0;
}

/** The JSON of GET /api/accounts and Tải JSON: Xuất JSON of the app, without its "settings". */
export async function exported(db: Db): Promise<string> {
  const accounts = (await list(db)).map((r) => JSON.parse(r.data) as Account);
  return JSON.stringify({ app: APP_NAME, format: EXPORT_FORMAT, exportedAt: new Date().toISOString(), accounts }, null, 2) + '\n';
}

/** True when there was one to delete. */
export async function remove(db: Db, id: number): Promise<boolean> {
  const gone = await db.delete(table).where(eq(table.id, id)).returning({ id: table.id });
  return gone.length > 0;
}
