// Keys of the desktop app (README.md#key): made on the Key page, checked by the app as it opens and every hour
// (POST /api/license/verify). The first device that brings a key holds it; a key ends at expires_at, which an
// 'activation' key gets at its first activation and a 'fixed' one when made. The app of a key that works on its
// device sends its accounts (POST /api/license/sync, services/account.service.ts#syncLicense).
import { and, desc, eq, exists, isNotNull, isNull, ne, or, sql, type SQL } from 'drizzle-orm';
import {
  LICENSE_CHARS,
  LICENSE_LENGTH,
  LICENSE_PREFIX,
  LOG_KEEP_MS,
  LOG_KEY_WINDOW_MS,
  LOG_TYPED_KEY,
  LOG_WINDOW_MS,
  VN_OFFSET_MS,
} from '../config/constants.ts';
import { LICENSE, LOG } from '../config/messages.ts';
import type { Db } from '../db/client.ts';
import { accounts, licenses as table } from '../db/schema.ts';
import type { AppEvent, DurationUnit, KeyRefusal, License, LicenseRow, Merged, SyncRefusal, Verify, VerifyAnswer } from '../models/index.ts';
import { countsByLicense, marks, stamp } from './account.service.ts';
import * as logs from './log.service.ts';
import { random } from '../utils/crypto.ts';
import { durationText, keyName, lastDay } from '../utils/format.ts';

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
  return (await createMany(db, note, maxAccounts, term, 1, now))[0]!;
}

/** Tạo key with Số lượng: `count` keys alike (note, accounts, end), in one batch of writes; a key that happens to be
 * taken already (never seen: 80 random bits) is made again. Their ids, in the order made. */
export async function createMany(db: Db, note: string, maxAccounts: number, term: Term, count: number, now = Date.now(), bachHo = true): Promise<number[]> {
  const ends =
    term.mode === 'activation'
      ? { mode: 'activation' as const, duration: term.duration, durationUnit: term.unit, expiresAt: null }
      : { mode: 'fixed' as const, duration: null, durationUnit: null, expiresAt: term.expiresAt };
  const ids: number[] = [];
  while (ids.length < count) {
    const keys = new Set<string>();
    while (keys.size < count - ids.length) keys.add(newKey());
    const inserts = [...keys].map((key) =>
      db.insert(table).values({ key, note, maxAccounts, ...ends, bachHo: bachHo ? 1 : 0, createdAt: now }).onConflictDoNothing().returning({ id: table.id }),
    );
    const made = await db.batch(inserts as [(typeof inserts)[0], ...typeof inserts]);
    for (const [row] of made) if (row) ids.push(row.id);
  }
  return ids;
}

/** A key that does not work: the answer, and why as the Log page tells it. */
type Refused = { answer: VerifyAnswer & { ok: false }; why: KeyRefusal };

/** Why a key does not work on the device `id` before anything is written: none, revoked, held by another device, or
 * taken by Gỡ thiết bị from this very device (until another one activates it). Null when nothing stands in the way. */
function refusal(row: License | undefined, id: string): Refused | null {
  if (!row) return { answer: { ok: false, code: 'unknown', error: LICENSE.unknown }, why: 'unknown' };
  if (row.revoked) return { answer: { ok: false, code: 'revoked', error: LICENSE.revoked(row.reason) }, why: 'revoked' };
  if (row.deviceId !== null && row.deviceId !== id) return { answer: { ok: false, code: 'taken', error: LICENSE.taken }, why: 'taken' };
  if (row.deviceId === null && row.releasedDevice === id) return { answer: { ok: false, code: 'taken', error: LICENSE.released }, why: 'released' };
  return null;
}

const ended = (expiresAt: number): Refused => ({
  answer: { ok: false, code: 'expired', error: LICENSE.expired(lastDay(expiresAt)), expiresAt },
  why: 'expired',
});

/** Logs a refusal of POST /api/license/verify (one query) and gives its answer. The key as typed is kept, cut to
 * LOG_TYPED_KEY. Counted with those of the same IP, why and key: a key not known within LOG_WINDOW_MS, 'danger' from
 * LOG_DANGER_COUNT (someone guessing); a known key within LOG_KEY_WINDOW_MS, never 'danger' (its app checks every
 * hour). */
async function refuse(db: Db, no: Refused, v: Verify, ip: string, row: License | undefined, now: number): Promise<VerifyAnswer> {
  const typed = v.key.slice(0, LOG_TYPED_KEY);
  const name = row ? keyName(row) : '';
  const message =
    no.why === 'unknown'
      ? LOG.refused.unknown(typed, v.hostname)
      : no.why === 'expired'
        ? LOG.refused.expired(name, v.hostname, lastDay(no.answer.expiresAt ?? now))
        : LOG.refused[no.why](name, v.hostname);
  const entry: logs.Entry & { ip: string } = {
    kind: `key.${no.why}`,
    licenseId: row?.id ?? null,
    actor: row ? 'app' : 'ip',
    ip,
    deviceId: v.id,
    hostname: v.hostname,
    message,
    detail: { key: typed, code: no.answer.code, os: v.os, version: v.version },
  };
  const writes =
    no.why === 'unknown'
      ? logs.counted(db, entry, LOG_WINDOW_MS, LOG.burst.unknown, now)
      : logs.counted(db, entry, LOG_KEY_WINDOW_MS, undefined, now);
  await logs.run(db, writes, now);
  return no.answer;
}

/** POST /api/license/verify: whether the key works on this device. The first device to bring a key holds it: a write
 * that only goes when no device holds it yet, so two devices at once cannot both; a key already ended is not taken.
 * The device that holds it is noted at each check (name, system, version, IP, accounts), even once the key has ended,
 * by a write that only goes while it still holds the key and the key is not revoked. When a write finds the key
 * changed meanwhile, the key is read again and the answer is why it does not work, never ok. Two D1 queries. The Log
 * page gets every activation, in the batch of its write, and every refusal, by one more query; a check that works,
 * nothing. */
export async function verify(db: Db, v: Verify, ip: string, now = Date.now()): Promise<VerifyAnswer> {
  const key = canonical(v.key);
  const row = key ? await db.select().from(table).where(eq(table.key, key)).get() : undefined;
  const no = refusal(row, v.id);
  if (no || !row) return refuse(db, no!, v, ip, row, now);
  const seen = { hostname: v.hostname, os: v.os, version: v.version, ip, accounts: v.accounts, lastCheckAt: now };
  let held: License | undefined;
  if (row.deviceId === null) {
    // A key freed by Gỡ thiết bị keeps the end it got at its first activation; one past it is not taken.
    if (row.expiresAt !== null && now >= row.expiresAt) return refuse(db, ended(row.expiresAt), v, ip, row, now);
    const expiresAt = row.expiresAt ?? addDuration(now, row.duration ?? 0, row.durationUnit ?? 'day');
    const activation: logs.Entry = {
      kind: 'key.activate',
      licenseId: row.id,
      actor: 'app',
      ip,
      deviceId: v.id,
      hostname: v.hostname,
      message: LOG.activated(keyName(row), v.hostname),
      detail: { os: v.os, version: v.version, expiresAt },
    };
    // Logged only when the write went: the insert after it in the batch finds the key held by this device since now.
    const [rows] = await db.batch([
      db
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
        .returning(),
      logs.insertIf(db, activation, logs.activated(db, row.id, v.id, now), now),
    ]);
    [held] = rows;
  } else {
    [held] = await db
      .update(table)
      .set(seen)
      .where(and(eq(table.id, row.id), eq(table.deviceId, v.id), eq(table.revoked, 0)))
      .returning();
  }
  if (!held) {
    const fresh = await db.select().from(table).where(eq(table.id, row.id)).get();
    const no: Refused = refusal(fresh, v.id) ?? { answer: { ok: false, code: 'taken', error: LICENSE.taken }, why: 'taken' };
    return refuse(db, no, v, ip, fresh ?? row, now);
  }
  const expiresAt = held.expiresAt!;
  if (now >= expiresAt) return refuse(db, ended(expiresAt), v, ip, held, now);
  return { ok: true, maxAccounts: held.maxAccounts, expiresAt, activatedAt: held.activatedAt ?? now, bachHo: held.bachHo !== 0 };
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

/** A line of the Log page for each event of a sync, from the app of the key `l` (its device and name as the key has
 * them): an account removed is a 'warn'. */
function eventEntries(l: License, events: AppEvent[], ip: string): logs.Entry[] {
  return events.map((e) => ({
    ...logs.byApp(l, ip),
    at: e.at,
    kind: `app.${e.kind}`,
    level: e.kind === 'remove' ? 'warn' : 'info',
    username: e.username,
    serverId: e.serverId,
    message: LOG.app[e.kind](e.username, e.serverId),
    detail: e.label ? { label: e.label } : null,
    eventId: e.id ?? null,
  }));
}

/** The line of a sync that took or refused accounts; none for a sync that only updated what the key holds. */
function summary(l: License, done: Merged, ip: string): logs.Entry | null {
  if (!done.added && !done.refused) return null;
  const parts = [
    done.added ? LOG.added(done.added) : '',
    done.updated ? LOG.updated(done.updated) : '',
    done.refused - done.taken ? LOG.overMax(done.refused - done.taken) : '',
    done.taken ? LOG.ofOther(done.taken) : '',
  ].filter(Boolean);
  return { ...logs.byApp(l, ip), kind: 'sync.summary', level: done.refused ? 'warn' : 'info', message: LOG.synced(parts), detail: { ...done } };
}

/** Notes a sync of the key `l` in one batch: the Cài đặt of the app when it sent them; what its app did to its accounts
 * (`events`, at whole ms within the LOG_KEEP_MS before now), each a line of the Log page unless the same event (its
 * "id") was logged already, a removal marking the account (account.service.ts#marks); and a line of what the sync took,
 * when it took or refused anything. How many events were logged now. */
export async function synced(db: Db, l: License, settings: string | null, events: AppEvent[], done: Merged, ip: string, now = Date.now()) {
  const happened = events.map((e) => ({ ...e, at: Math.max(now - LOG_KEEP_MS, stamp(e.at, now)) }));
  const lines = logs.inserts(db, eventEntries(l, happened, ip), now);
  const line = summary(l, done, ip);
  const results = await logs.run(
    db,
    [
      ...lines,
      db
        .update(table)
        .set(settings === null ? { syncedAt: now } : { syncedAt: now, settings })
        .where(eq(table.id, l.id)),
      ...marks(db, happened, l.id),
      ...(line ? logs.inserts(db, [line], now) : []),
    ],
    now,
  );
  return results.slice(0, lines.length).reduce<number>((n, r) => n + (r as D1Result).meta.changes, 0);
}

/** A key by its id. */
export const get = (db: Db, id: number) => db.select().from(table).where(eq(table.id, id)).get();

/** What Sửa changes of the key `l`, as the Log page says it: the note, the most accounts, the end. */
/** What Sửa asks: the note, the most accounts, a new end (a date, or the duration of a key never activated), and Bạch Hổ
 * (null: as it is). */
type Edit = { note: string; maxAccounts: number; expiresAt: number | null; duration: { n: number; unit: DurationUnit } | null; bachHo?: boolean | null };

export function changes(
  l: License,
  e: Edit,
): string[] {
  const out: string[] = [];
  if (e.bachHo != null && e.bachHo !== (l.bachHo !== 0)) out.push(LOG.bachHo(e.bachHo));
  if (e.note !== l.note) out.push(LOG.note(l.note, e.note));
  if (e.maxAccounts !== l.maxAccounts) out.push(LOG.maxAccounts(l.maxAccounts, e.maxAccounts));
  if (e.duration && (e.duration.n !== l.duration || e.duration.unit !== l.durationUnit)) {
    out.push(LOG.ends(durationText(l.duration ?? 0, l.durationUnit ?? 'day'), durationText(e.duration.n, e.duration.unit)));
  } else if (!e.duration && e.expiresAt !== null && e.expiresAt !== l.expiresAt) {
    out.push(LOG.ends(l.expiresAt === null ? '—' : lastDay(l.expiresAt), lastDay(e.expiresAt)));
  }
  return out;
}

/** The line of an action of the admin, written in the batch of the action before it, only when the key is then as
 * `when` says (one the action changes); none without a line. */
const lineIf = (db: Db, id: number, line: logs.Entry | undefined, when?: SQL) =>
  line ? [logs.insertIf(db, line, exists(db.select({ id: table.id }).from(table).where(and(eq(table.id, id), when))))] : [];

/** Khoá with a reason the app shows, or Mở khoá; `line` logged when it was not revoked (not, for Mở khoá) before. */
export async function revoke(db: Db, id: number, reason: string, line?: logs.Entry) {
  await logs.run(db, [...lineIf(db, id, line, eq(table.revoked, 0)), db.update(table).set({ revoked: 1, reason }).where(eq(table.id, id))]);
}

export async function restore(db: Db, id: number, line?: logs.Entry) {
  await logs.run(db, [...lineIf(db, id, line, eq(table.revoked, 1)), db.update(table).set({ revoked: 0, reason: '' }).where(eq(table.id, id))]);
}

/** Bật Bạch Hổ or Tắt Bạch Hổ for the app of the key, heard at its next check; `line` logged when it was the other way. */
export async function setBachHo(db: Db, id: number, on: boolean, line?: logs.Entry) {
  const v = on ? 1 : 0;
  await logs.run(db, [...lineIf(db, id, line, eq(table.bachHo, 1 - v)), db.update(table).set({ bachHo: v }).where(eq(table.id, id))]);
}

/** Gỡ thiết bị: no device holds it and what the last one said is forgotten. The device it is taken from is refused
 * (its app would take the key back at its next check), until another device activates it. Its end stays as it is.
 * `line` logged when a device held it. */
export async function release(db: Db, id: number, line?: logs.Entry) {
  const free = db
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
  await logs.run(db, [...lineIf(db, id, line, isNotNull(table.deviceId)), free]);
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
  e: Edit,
): Promise<Edited> {
  const fields = { note: e.note, maxAccounts: e.maxAccounts, ...(e.bachHo == null ? {} : { bachHo: e.bachHo ? 1 : 0 }) };
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

/** Xoá: the key goes; the accounts it sent stay, without a key. `line` logged when it was there. */
export async function remove(db: Db, id: number, line?: logs.Entry) {
  await logs.run(db, [
    ...lineIf(db, id, line),
    db.update(accounts).set({ licenseId: null }).where(eq(accounts.licenseId, id)),
    db.delete(table).where(eq(table.id, id)),
  ]);
}
