// Devices of the desktop app (README.md#thiết-bị): recorded at each hello, blocked and unblocked on the admin page. A
// device never seen is allowed.
import { desc, eq } from 'drizzle-orm';
import { MAX_BLOCK_REASON, MAX_DEVICE_LABEL } from '../config/constants.ts';
import type { Db } from '../db/client.ts';
import { devices as table } from '../db/schema.ts';
import type { Device, Hello, HelloAnswer } from '../models/index.ts';
import { text } from '../validators/device.validator.ts';

/** Records the hello (a new device is allowed) and answers whether the device may run, with the reason if not. */
export async function hello(db: Db, h: Hello, ip: string, now = Date.now()): Promise<HelloAnswer> {
  const seen = { hostname: h.hostname, os: h.os, version: h.version, accounts: JSON.stringify(h.accounts), ip, lastSeen: now };
  const [row] = await db
    .insert(table)
    .values({ id: h.id, ...seen, firstSeen: now })
    .onConflictDoUpdate({ target: table.id, set: seen })
    .returning({ blocked: table.blocked, reason: table.reason });
  return row?.blocked ? { allowed: false, reason: row.reason } : { allowed: true };
}

/** Every device, the one seen last first. */
export async function list(db: Db): Promise<Device[]> {
  return db.select().from(table).orderBy(desc(table.lastSeen));
}

export async function block(db: Db, id: string, reason: string) {
  await db.update(table).set({ blocked: 1, reason: text(reason, MAX_BLOCK_REASON) }).where(eq(table.id, id));
}

export async function unblock(db: Db, id: string) {
  await db.update(table).set({ blocked: 0, reason: '' }).where(eq(table.id, id));
}

export async function rename(db: Db, id: string, label: string) {
  await db.update(table).set({ label: text(label, MAX_DEVICE_LABEL) }).where(eq(table.id, id));
}

/** Forgets a device; it comes back, allowed, at its next hello. Blocking is what keeps it out. */
export async function forget(db: Db, id: string) {
  await db.delete(table).where(eq(table.id, id));
}
