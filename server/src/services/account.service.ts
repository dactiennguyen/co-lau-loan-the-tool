// The accounts of the desktop app, in the JSON of its Xuất JSON (app/desktop/src-tauri/src/backup.rs): kept by POST
// /api/accounts and given back by GET /api/accounts and Tải JSON, so that Nhập JSON of the app reads them as they are.
import { and, asc, count as rowCount, eq, sql } from 'drizzle-orm';
import { APP_NAME, EXPORT_FORMAT } from '../config/constants.ts';
import type { Db } from '../db/client.ts';
import { accounts as table } from '../db/schema.ts';
import type { Account, AccountRow, Synced } from '../models/index.ts';
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

/** Đồng bộ lên: each account added, or put in place of the one of the same server and username (any case). `source`
 * is the name of the token that sent them. */
export async function sync(db: Db, sent: Account[], source: string): Promise<Synced> {
  const done: Synced = { added: 0, updated: 0, unchanged: 0, repeated: 0 };
  const seen = new Set<string>();
  const now = Date.now();
  const writes = [];
  for (const one of sent) {
    const id = `${one.serverId}\n${key(one)}`;
    if (seen.has(id)) {
      done.repeated++;
      continue;
    }
    seen.add(id);
    const old = await db
      .select({ id: table.id, data: table.data })
      .from(table)
      .where(and(eq(table.serverId, one.serverId), eq(table.usernameKey, key(one))))
      .get();
    const next = old ? replacement(JSON.parse(old.data) as Account, one) : one;
    const data = canonical(next);
    if (old?.data === data) {
      done.unchanged++;
      continue;
    }
    const fields = { username: next.username, label: next.label, password: next.password, data, source, updatedAt: now };
    if (old) {
      done.updated++;
      writes.push(db.update(table).set(fields).where(eq(table.id, old.id)));
    } else {
      done.added++;
      // Another request may have added it meanwhile: this one then replaces it, as a later send would.
      writes.push(
        db
          .insert(table)
          .values({ ...fields, serverId: next.serverId, usernameKey: key(next), createdAt: now })
          .onConflictDoUpdate({
            target: [table.serverId, table.usernameKey],
            set: {
              username: sql`excluded.username`,
              label: sql`excluded.label`,
              password: sql`excluded.password`,
              data: sql`excluded.data`,
              source: sql`excluded.source`,
              updatedAt: sql`excluded.updated_at`,
            },
          }),
      );
    }
  }
  const [first, ...rest] = writes;
  if (first) await db.batch([first, ...rest]);
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
