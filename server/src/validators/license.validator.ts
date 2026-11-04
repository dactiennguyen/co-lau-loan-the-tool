// Keys, checked with Zod: what the app sends to POST /api/license/verify (as it opens and every hour) and to POST
// /api/license/sync (its accounts), and the forms of the Key page (Tạo key, Sửa, Khoá). Each error of a form is that of
// a field, so the page shows it under the field.
import { z } from 'zod';
import {
  MAX_DURATION_DAYS,
  MAX_HOSTNAME,
  MAX_LICENSE_ACCOUNTS,
  MAX_LICENSE_NOTE,
  MAX_OS,
  MAX_REVOKE_REASON,
  MAX_SETTINGS,
  MAX_SYNC_ACCOUNTS,
  MAX_VERSION,
} from '../config/constants.ts';
import { LICENSE } from '../config/messages.ts';
import type { Changed, DurationUnit, LicenseSync, Verify } from '../models/index.ts';
import { endOfDay, type Term } from '../services/license.service.ts';
import { today } from '../utils/format.ts';
import { accountError, accountSchema } from './account.validator.ts';
import { check, clipped, json } from './form.ts';

/** SHA-256 (hex) of the operating system's machine id, as the app sends it. */
const deviceId = z.string({ error: LICENSE.badId }).regex(/^[0-9a-f]{64}$/, LICENSE.badId);
/** The key as typed; the service reads it (services/license.service.ts#canonical). */
const typedKey = z.string({ error: LICENSE.badKey }).max(100, LICENSE.unknown);

export const verifySchema = z.object(
  {
    key: typedKey,
    id: deviceId,
    hostname: clipped(MAX_HOSTNAME),
    os: clipped(MAX_OS),
    version: clipped(MAX_VERSION),
    accounts: z.int().min(0).max(MAX_LICENSE_ACCOUNTS).catch(0),
  },
  { error: LICENSE.notObject },
);

/** A check read from its JSON, or the reason it is refused. Long texts are cut, not refused. */
export function parseVerify(body: string): Verify | { error: string } {
  const read = json(body, LICENSE.badJson);
  if (!read.ok) return { error: read.error };
  const r = check(verifySchema, read.value);
  return r.ok ? r.data : { error: r.error };
}

/** The times the app saw each field change: numbers only, anything else left out (read as 0). */
const stamps = z
  .record(z.string(), z.unknown())
  .catch({})
  .transform((o) => Object.fromEntries(Object.entries(o).filter(([, t]) => typeof t === 'number' && Number.isFinite(t))) as Changed);

export const syncSchema = z.object(
  {
    key: typedKey,
    id: deviceId,
    accounts: z
      .array(z.object({ account: accountSchema, changed: stamps }, { error: LICENSE.notObject }), { error: LICENSE.notList })
      .max(MAX_SYNC_ACCOUNTS, LICENSE.tooMany(MAX_SYNC_ACCOUNTS)),
    // Cài đặt of the app, kept as JSON; too large or not an object, they are not kept.
    settings: z
      .record(z.string(), z.unknown())
      .optional()
      .catch(undefined)
      .transform((s) => {
        const text = s ? JSON.stringify(s) : null;
        return text && text.length <= MAX_SETTINGS ? text : null;
      }),
  },
  { error: LICENSE.notObject },
);

/** A sync read from its JSON, or the reason it is refused: {"key", "id", "settings"?, "accounts": [{"account",
 * "changed"}]}. Each account is checked as POST /api/accounts checks it. */
export function parseSync(body: string): LicenseSync | { error: string } {
  const read = json(body, LICENSE.badJson);
  if (!read.ok) return { error: read.error };
  const r = syncSchema.safeParse(read.value);
  if (!r.success) {
    const issue = r.error.issues[0]!;
    return { error: issue.path[0] === 'accounts' ? accountError(issue, 1) : issue.message };
  }
  return r.data;
}

const unit = z.enum(['day', 'month', 'year']).catch('year');
const maxAccounts = z.coerce
  .number({ error: LICENSE.maxAccounts })
  .int(LICENSE.maxAccounts)
  .min(1, LICENSE.maxAccounts)
  .max(MAX_LICENSE_ACCOUNTS, LICENSE.maxAccounts);
/** The largest number of each unit: 100 years. */
const LONGEST: Record<DurationUnit, number> = { day: MAX_DURATION_DAYS, month: 1200, year: 100 };
const isDate = (s: string) => /^\d{4}-\d\d-\d\d$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

/** Tạo key: a note, the most accounts, and how it ends, `duration` `unit` from its activation or the end of `date`
 * (Vietnam time), today or later. */
export const createForm = z
  .object({
    note: clipped(MAX_LICENSE_NOTE),
    maxAccounts,
    mode: z.enum(['activation', 'fixed'], { error: LICENSE.mode }),
    duration: z.string().trim().catch(''),
    unit,
    date: z.string().trim().catch(''),
  })
  .superRefine((v, ctx) => {
    if (v.mode === 'activation') {
      const n = Number(v.duration);
      if (!Number.isInteger(n) || n < 1 || n > LONGEST[v.unit]) ctx.addIssue({ code: 'custom', message: LICENSE.duration, path: ['duration'] });
    } else if (!isDate(v.date)) {
      ctx.addIssue({ code: 'custom', message: LICENSE.date, path: ['date'] });
    } else if (v.date < today(Date.now())) {
      ctx.addIssue({ code: 'custom', message: LICENSE.pastDate, path: ['date'] });
    }
  })
  .transform((v) => ({
    note: v.note,
    maxAccounts: v.maxAccounts,
    term: (v.mode === 'activation'
      ? { mode: 'activation', duration: Number(v.duration), unit: v.unit }
      : { mode: 'fixed', expiresAt: endOfDay(v.date) }) satisfies Term as Term,
  }));

/** Sửa: the note, the most accounts, and a new end when one is given: `date` for a key that has an end (a past one ends
 * it), `duration` `unit` for an 'activation' key never activated. */
export const editForm = z
  .object({
    note: clipped(MAX_LICENSE_NOTE),
    maxAccounts,
    duration: z.string().trim().catch(''),
    unit,
    date: z.string().trim().catch(''),
  })
  .superRefine((v, ctx) => {
    if (v.date && !isDate(v.date)) ctx.addIssue({ code: 'custom', message: LICENSE.date, path: ['date'] });
    const n = Number(v.duration);
    if (v.duration && (!Number.isInteger(n) || n < 1 || n > LONGEST[v.unit])) {
      ctx.addIssue({ code: 'custom', message: LICENSE.duration, path: ['duration'] });
    }
  })
  .transform((v) => ({
    note: v.note,
    maxAccounts: v.maxAccounts,
    expiresAt: v.date ? endOfDay(v.date) : null,
    duration: v.duration ? { n: Number(v.duration), unit: v.unit } : null,
  }));

/** Khoá: the reason the app shows. */
export const revokeForm = z.object({ reason: clipped(MAX_REVOKE_REASON) });
