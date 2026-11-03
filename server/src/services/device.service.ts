// Devices of the desktop app (README.md#thiết-bị): recorded at each hello, blocked and unblocked on the admin page. A
// device never seen is allowed.
import { desc, eq } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { devices as table } from '../db/schema.ts';
import { same, sha256 } from '../utils/crypto.ts';
import type { Device, Hello, HelloAnswer } from '../models/index.ts';

/** Whether `key` is the key the device keeps (migrations/0004_device_key.sql): never without one on either side. */
export async function keyOf(device: Device, key: string | undefined): Promise<boolean> {
  return !!device.keyHash && !!key && same(device.keyHash, await sha256(key));
}

/** Records the hello (a new device is allowed) and answers whether the device may run, with the reason if not, and
 * whether it may sync. The first key a device brings is kept; after that a hello without that key changes nothing and
 * is refused (`wrongKey`), so the id alone, which is no secret, cannot rewrite what the device said. */
export async function hello(db: Db, h: Hello, ip: string, now = Date.now()): Promise<HelloAnswer | { wrongKey: true }> {
  const known = await get(db, h.id);
  const keyHash = h.key ? await sha256(h.key) : '';
  if (known?.keyHash && !same(known.keyHash, keyHash)) return { wrongKey: true };
  const seen = {
    hostname: h.hostname,
    os: h.os,
    version: h.version,
    accounts: JSON.stringify(h.accounts),
    ip,
    lastSeen: now,
    ...(keyHash && !known?.keyHash ? { keyHash } : {}),
  };
  const [row] = await db
    .insert(table)
    .values({ id: h.id, ...seen, firstSeen: now })
    .onConflictDoUpdate({ target: table.id, set: seen })
    .returning({ blocked: table.blocked, reason: table.reason, syncAllowed: table.syncAllowed, keyHash: table.keyHash });
  if (!row) return { allowed: true, sync: false };
  if (row.blocked) return { allowed: false, reason: row.reason };
  return { allowed: true, sync: row.syncAllowed === 1 && !!keyHash && row.keyHash === keyHash };
}

/** The device of that id, if it said hello. */
export async function get(db: Db, id: string): Promise<Device | undefined> {
  return db.select().from(table).where(eq(table.id, id)).get();
}

/** How the Nick page names what a device sent: its name on the Thiết bị page, else its host name. */
export const sourceOf = (d: Device) => `Máy ${d.label || d.hostname || d.id.slice(0, 12)}`;

/** Notes a sync, with the Cài đặt of the app when it sent them. */
export async function synced(db: Db, id: string, settings: string | null, now = Date.now()) {
  await db
    .update(table)
    .set(settings === null ? { syncedAt: now } : { syncedAt: now, settings })
    .where(eq(table.id, id));
}

/** Cho đồng bộ (true) or Tắt đồng bộ: whether the accounts the device sends are taken. */
export async function allowSync(db: Db, id: string, allowed: boolean) {
  await db.update(table).set({ syncAllowed: allowed ? 1 : 0 }).where(eq(table.id, id));
}

/** Every device, the one seen last first. */
export async function list(db: Db): Promise<Device[]> {
  return db.select().from(table).orderBy(desc(table.lastSeen));
}

export async function block(db: Db, id: string, reason: string) {
  await db.update(table).set({ blocked: 1, reason }).where(eq(table.id, id));
}

export async function unblock(db: Db, id: string) {
  await db.update(table).set({ blocked: 0, reason: '' }).where(eq(table.id, id));
}

export async function rename(db: Db, id: string, label: string) {
  await db.update(table).set({ label }).where(eq(table.id, id));
}

/** Forgets a device; it comes back, allowed, at its next hello. Blocking is what keeps it out. */
export async function forget(db: Db, id: string) {
  await db.delete(table).where(eq(table.id, id));
}
