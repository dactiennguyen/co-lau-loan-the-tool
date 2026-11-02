// Devices of the desktop app (README.md#thiết-bị). The app sends POST /api/devices/hello as it opens and every 15
// minutes; the answer says whether it may run. A device never seen is allowed; the admin page blocks it afterwards.
import { desc, eq } from 'drizzle-orm';
import { devices as table, type Db } from './db.ts';

/** What the app sends. `id` is the SHA-256 (hex) of the operating system's machine id. */
export interface Hello {
  id: string;
  hostname: string;
  os: string;
  version: string;
  accounts: { username: string; serverId: number }[];
}

export type Device = typeof table.$inferSelect;

/** The largest hello the API takes. */
export const MAX_HELLO = 16 * 1024;
const MAX_ACCOUNTS = 200;
export const MAX_REASON = 200;
export const MAX_LABEL = 60;

export const isId = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v);

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** A hello read from its JSON, or the reason it is refused. Long texts are cut, not refused. */
export function parseHello(body: string): Hello | { error: string } {
  let v: unknown;
  try {
    v = JSON.parse(body);
  } catch {
    return { error: 'JSON không đọc được' };
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { error: 'Cần một object JSON' };
  const o = v as Record<string, unknown>;
  if (!isId(o.id)) return { error: 'id phải là 64 ký tự hex (SHA-256)' };
  const list = Array.isArray(o.accounts) ? o.accounts.slice(0, MAX_ACCOUNTS) : [];
  const accounts = list.flatMap((a) => {
    if (!a || typeof a !== 'object') return [];
    const r = a as Record<string, unknown>;
    const username = text(r.username, 60);
    const serverId = Number.isInteger(r.serverId) ? (r.serverId as number) : 24;
    return username ? [{ username, serverId }] : [];
  });
  return { id: o.id, hostname: text(o.hostname, 100), os: text(o.os, 60), version: text(o.version, 30), accounts };
}

/** Records the hello (a new device is allowed) and answers whether the device may run, with the reason if not. */
export async function hello(db: Db, h: Hello, ip: string, now = Date.now()) {
  const seen = { hostname: h.hostname, os: h.os, version: h.version, accounts: JSON.stringify(h.accounts), ip, lastSeen: now };
  const [row] = await db
    .insert(table)
    .values({ id: h.id, ...seen, firstSeen: now })
    .onConflictDoUpdate({ target: table.id, set: seen })
    .returning({ blocked: table.blocked, reason: table.reason });
  return row?.blocked ? { allowed: false, reason: row.reason } : { allowed: true };
}

/** Every device, the one seen last first. */
export async function devices(db: Db): Promise<Device[]> {
  return db.select().from(table).orderBy(desc(table.lastSeen));
}

export async function block(db: Db, id: string, reason: string) {
  await db.update(table).set({ blocked: 1, reason: text(reason, MAX_REASON) }).where(eq(table.id, id));
}

export async function unblock(db: Db, id: string) {
  await db.update(table).set({ blocked: 0, reason: '' }).where(eq(table.id, id));
}

export async function rename(db: Db, id: string, label: string) {
  await db.update(table).set({ label: text(label, MAX_LABEL) }).where(eq(table.id, id));
}

/** Forgets a device; it comes back, allowed, at its next hello. Blocking is what keeps it out. */
export async function forget(db: Db, id: string) {
  await db.delete(table).where(eq(table.id, id));
}
