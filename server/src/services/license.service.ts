// Keys of the desktop app (README.md#key): made on the Key page, checked by the app as it opens and every hour
// (POST /api/license/verify). The first device that brings a key holds it; a key ends at expires_at, which an
// 'activation' key gets at its first activation and a 'fixed' one when made. The app of a key that works on its
// device sends its accounts (POST /api/license/sync, services/account.service.ts#syncLicense).
import { and, desc, eq, isNotNull, isNull, ne, or, sql } from 'drizzle-orm';
import { LICENSE_CHARS, LICENSE_LENGTH, LICENSE_PREFIX, VN_OFFSET_MS } from '../config/constants.ts';
import { LICENSE } from '../config/messages.ts';
import type { Db } from '../db/client.ts';
import { accounts, licenses as table } from '../db/schema.ts';
import type { DurationUnit, License, LicenseRow, SyncRefusal, Verify, VerifyAnswer } from '../models/index.ts';
import { countsByLicense } from './account.service.ts';
import { random } from '../utils/crypto.ts';
import { keyName, lastDay } from '../utils/format.ts';

/** How a new key, or a key edited, ends: `duration` `unit` from its activation, or at `expiresAt`. */
export type Term = { mode: 'activation'; duration: number; unit: DurationUnit } | { mode: 'fixed'; expiresAt: number };

/** "CLLT-XXXX-XXXX-XXXX-XXXX" of its 16 characters. */
const format = (chars: string) => `${LICENSE_PREFIX}-${chars.match(/.{4}/g)!.join('-')}`;

/** A key as the user typed it, in the form it is kept: case, spaces and dashes do not matter, nor "CLLT" before it, and
 * O, I, L read as 0, 1, 1 as Crockford's base32 has it. Null when it cannot be a key. */
export function canonical(typed: string): string | null {
  let s = typed.toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (s.length === LICENSE_PREFIX.length + LICENSE_LENGTH && s.startsWith(LICENSE_PREFIX)) s = s.slice(LICENSE_PREFIX.length);
  s = s.replace(/O/g, '0').replace(/[IL]/g, '1');
  if (s.length !== LICENSE_LENGTH || [...s].some((c) => !LICENSE_CHARS.includes(c))) return null;
  return format(s);
}

/** A new random key: 16 characters, 80 bits. */
function newKey(): string {
  return format(Array.from(random(LICENSE_LENGTH), (b) => LICENSE_CHARS[b & 31]).join(''));
}

/** `from` plus the duration, on the calendar: 10 years from 04/11/2026 is 04/11/2036 at the same time. */
export function addDuration(from: number, n: number, unit: DurationUnit): number {
  const d = new Date(from);
  if (unit === 'day') d.setUTCDate(d.getUTCDate() + n);
  else if (unit === 'month') d.setUTCMonth(d.getUTCMonth() + n);
  else d.setUTCFullYear(d.getUTCFullYear() + n);
  return d.getTime();
}

/** The end of a day "yyyy-mm-dd" of the Key page: midnight after it in Vietnam, so the key works all that day. */
export function endOfDay(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d! + 1) - VN_OFFSET_MS;
}

/** Every key, the one made last first, with how many accounts it sent last. */
export async function list(db: Db): Promise<LicenseRow[]> {
  const [rows, counts] = await Promise.all([db.select().from(table).orderBy(desc(table.id)), countsByLicense(db)]);
  return rows.map((l) => ({ ...l, synced: counts.get(l.id) ?? 0 }));
}

/** Every key by its id, key and note: the filter of the Nick page. */
export async function names(db: Db): Promise<{ id: number; key: string; note: string }[]> {
  return db.select({ id: table.id, key: table.key, note: table.note }).from(table).orderBy(desc(table.id));
}

/** How the Nick page names what the app of a key sent: "Key " and the key's name. */
export const sourceOf = (l: License) => `Key ${keyName(l)}`;

/** A new key, by its id; the rare clash with a key there is takes another one. */
export async function create(db: Db, note: string, maxAccounts: number, term: Term, now = Date.now()): Promise<number> {
  const ends =
    term.mode === 'activation'
      ? { mode: 'activation' as const, duration: term.duration, durationUnit: term.unit, expiresAt: null }
      : { mode: 'fixed' as const, duration: null, durationUnit: null, expiresAt: term.expiresAt };
  for (;;) {
    const key = newKey();
    const [made] = await db
      .insert(table)
      .values({ key, note, maxAccounts, ...ends, createdAt: now })
      .onConflictDoNothing()
      .returning({ id: table.id });
    if (made) return made.id;
  }
}

/** Why a key does not work on the device `id` before anything is written: none, revoked, held by another device, or
 * taken by Gỡ thiết bị from this very device (until another one activates it). Null when nothing stands in the way. */
function refusal(row: License | undefined, id: string): VerifyAnswer | null {
  if (!row) return { ok: false, code: 'unknown', error: LICENSE.unknown };
  if (row.revoked) return { ok: false, code: 'revoked', error: LICENSE.revoked(row.reason) };
  if (row.deviceId !== null && row.deviceId !== id) return { ok: false, code: 'taken', error: LICENSE.taken };
  if (row.deviceId === null && row.releasedDevice === id) return { ok: false, code: 'taken', error: LICENSE.released };
  return null;
}

const ended = (expiresAt: number): VerifyAnswer => ({ ok: false, code: 'expired', error: LICENSE.expired(lastDay(expiresAt)), expiresAt });

/** POST /api/license/verify: whether the key works on this device. The first device to bring a key holds it: a write
 * that only goes when no device holds it yet, so two devices at once cannot both; a key already ended is not taken.
 * The device that holds it is noted at each check (name, system, version, IP, accounts), even once the key has ended,
 * by a write that only goes while it still holds the key and the key is not revoked. When a write finds the key
 * changed meanwhile, the key is read again and the answer is why it does not work, never ok. Two D1 queries. */
export async function verify(db: Db, v: Verify, ip: string, now = Date.now()): Promise<VerifyAnswer> {
  const key = canonical(v.key);
  const row = key ? await db.select().from(table).where(eq(table.key, key)).get() : undefined;
  const no = refusal(row, v.id);
  if (no || !row) return no!;
  const seen = { hostname: v.hostname, os: v.os, version: v.version, ip, accounts: v.accounts, lastCheckAt: now };
  let held: License | undefined;
  if (row.deviceId === null) {
    // A key freed by Gỡ thiết bị keeps the end it got at its first activation; one past it is not taken.
    if (row.expiresAt !== null && now >= row.expiresAt) return ended(row.expiresAt);
    const expiresAt = row.expiresAt ?? addDuration(now, row.duration ?? 0, row.durationUnit ?? 'day');
    [held] = await db
      .update(table)
      .set({ deviceId: v.id, releasedDevice: null, activatedAt: now, expiresAt, ...seen })
      .where(
        and(
          eq(table.id, row.id),
          isNull(table.deviceId),
          eq(table.revoked, 0),
          or(isNull(table.releasedDevice), ne(table.releasedDevice, v.id)),
        ),
      )
      .returning();
  } else {
    [held] = await db
      .update(table)
      .set(seen)
      .where(and(eq(table.id, row.id), eq(table.deviceId, v.id), eq(table.revoked, 0)))
      .returning();
  }
  if (!held) {
    const fresh = await db.select().from(table).where(eq(table.id, row.id)).get();
    return refusal(fresh, v.id) ?? { ok: false, code: 'taken', error: LICENSE.taken };
  }
  const expiresAt = held.expiresAt!;
  if (now >= expiresAt) return ended(expiresAt);
  return { ok: true, maxAccounts: held.maxAccounts, expiresAt, activatedAt: held.activatedAt ?? now };
}

/** The key of a POST /api/license/sync when it works on the device `id` (it holds it, and it is neither revoked nor
 * ended), else why not. One D1 query. */
export async function holder(
  db: Db,
  typed: string,
  id: string,
  now = Date.now(),
): Promise<{ license: License } | { code: SyncRefusal; error: string }> {
  const key = canonical(typed);
  const row = key ? await db.select().from(table).where(eq(table.key, key)).get() : undefined;
  if (!row) return { code: 'unknown', error: LICENSE.unknown };
  if (row.revoked) return { code: 'revoked', error: LICENSE.revoked(row.reason) };
  if (row.deviceId === null) return { code: 'inactive', error: LICENSE.inactive };
  if (row.deviceId !== id) return { code: 'taken', error: LICENSE.taken };
  if (row.expiresAt === null || now >= row.expiresAt) return { code: 'expired', error: LICENSE.expired(lastDay(row.expiresAt ?? now)) };
  return { license: row };
}

/** Notes a sync of the key, with the Cài đặt of the app when it sent them. */
export async function synced(db: Db, id: number, settings: string | null, now = Date.now()) {
  await db
    .update(table)
    .set(settings === null ? { syncedAt: now } : { syncedAt: now, settings })
    .where(eq(table.id, id));
}

/** Khoá with a reason the app shows, or Mở khoá. */
export async function revoke(db: Db, id: number, reason: string) {
  await db.update(table).set({ revoked: 1, reason }).where(eq(table.id, id));
}

export async function restore(db: Db, id: number) {
  await db.update(table).set({ revoked: 0, reason: '' }).where(eq(table.id, id));
}

/** Gỡ thiết bị: no device holds it and what the last one said is forgotten. The device it is taken from is refused
 * (its app would take the key back at its next check), until another device activates it. Its end stays as it is. */
export async function release(db: Db, id: number) {
  await db
    .update(table)
    .set({
      releasedDevice: sql`coalesce(${table.deviceId}, ${table.releasedDevice})`,
      deviceId: null,
      hostname: '',
      os: '',
      version: '',
      ip: '',
      accounts: 0,
      lastCheckAt: null,
    })
    .where(eq(table.id, id));
}

/** What Sửa did: saved, nothing saved as the key was activated since the page showed it without an end (its form had a
 * duration, it has a date now), or nothing saved as the key is gone. */
export type Edited = 'saved' | 'activated' | 'gone';

/** Sửa: the note, the most accounts and the end: a date for a key that has one, a duration for an 'activation' key
 * never activated (null: as it is). The write goes only while the key is still as the form showed it (with an end or
 * without), so an end that no longer applies is never dropped in silence. */
export async function edit(
  db: Db,
  id: number,
  e: { note: string; maxAccounts: number; expiresAt: number | null; duration: { n: number; unit: DurationUnit } | null },
): Promise<Edited> {
  const fields = { note: e.note, maxAccounts: e.maxAccounts };
  // The form of a key with an end sends a date; that of a key never activated, a duration.
  const [done] = e.duration
    ? await db
        .update(table)
        .set({ ...fields, duration: e.duration.n, durationUnit: e.duration.unit })
        .where(and(eq(table.id, id), isNull(table.expiresAt)))
        .returning({ id: table.id })
    : await db
        .update(table)
        .set(e.expiresAt === null ? fields : { ...fields, expiresAt: e.expiresAt })
        .where(and(eq(table.id, id), e.expiresAt === null ? undefined : isNotNull(table.expiresAt)))
        .returning({ id: table.id });
  if (done) return 'saved';
  const row = await db.select({ id: table.id }).from(table).where(eq(table.id, id)).get();
  return row ? 'activated' : 'gone';
}

/** Xoá: the key goes; the accounts it sent stay, without a key. */
export async function remove(db: Db, id: number) {
  await db.batch([db.update(accounts).set({ licenseId: null }).where(eq(accounts.licenseId, id)), db.delete(table).where(eq(table.id, id))]);
}
