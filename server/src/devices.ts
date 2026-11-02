// Devices of the desktop app (README.md#thiết-bị). The app sends POST /api/devices/hello as it opens and every 15
// minutes; the answer says whether it may run. A device never seen is allowed; the admin page blocks it afterwards.

/** What the app sends. `id` is the SHA-256 (hex) of the operating system's machine id. */
export interface Hello {
  id: string;
  hostname: string;
  os: string;
  version: string;
  accounts: { username: string; serverId: number }[];
}

export interface Device {
  id: string;
  label: string;
  hostname: string;
  os: string;
  version: string;
  accounts: string;
  ip: string;
  first_seen: number;
  last_seen: number;
  blocked: number;
  reason: string;
}

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
export async function hello(db: D1Database, h: Hello, ip: string, now = Date.now()) {
  await db
    .prepare(
      `INSERT INTO devices (id, hostname, os, version, accounts, ip, first_seen, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET hostname = excluded.hostname, os = excluded.os, version = excluded.version,
         accounts = excluded.accounts, ip = excluded.ip, last_seen = excluded.last_seen`,
    )
    .bind(h.id, h.hostname, h.os, h.version, JSON.stringify(h.accounts), ip, now, now)
    .run();
  const row = await db.prepare('SELECT blocked, reason FROM devices WHERE id = ?').bind(h.id).first<{ blocked: number; reason: string }>();
  return row?.blocked ? { allowed: false, reason: row.reason } : { allowed: true };
}

/** Every device, the one seen last first. */
export async function devices(db: D1Database): Promise<Device[]> {
  return (await db.prepare('SELECT * FROM devices ORDER BY last_seen DESC').all<Device>()).results;
}

export async function block(db: D1Database, id: string, reason: string) {
  await db.prepare('UPDATE devices SET blocked = 1, reason = ? WHERE id = ?').bind(text(reason, MAX_REASON), id).run();
}

export async function unblock(db: D1Database, id: string) {
  await db.prepare("UPDATE devices SET blocked = 0, reason = '' WHERE id = ?").bind(id).run();
}

export async function rename(db: D1Database, id: string, label: string) {
  await db.prepare('UPDATE devices SET label = ? WHERE id = ?').bind(text(label, MAX_LABEL), id).run();
}

/** Forgets a device; it comes back, allowed, at its next hello. Blocking is what keeps it out. */
export async function forget(db: D1Database, id: string) {
  await db.prepare('DELETE FROM devices WHERE id = ?').bind(id).run();
}
