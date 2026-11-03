// What the app on a device sends, checked with Zod: the hello of POST /api/devices/hello (as it opens and every 15
// minutes) and the sync of POST /api/devices/sync that follows an allowed hello; and the forms of the Thiết bị page.
import { z } from 'zod';
import {
  DEFAULT_SERVER_ID,
  MAX_BLOCK_REASON,
  MAX_DEVICE_LABEL,
  MAX_HELLO_ACCOUNTS,
  MAX_HOSTNAME,
  MAX_OS,
  MAX_SETTINGS,
  MAX_SYNC_ACCOUNTS,
  MAX_USERNAME,
  MAX_VERSION,
} from '../config/constants.ts';
import { DEVICE } from '../config/messages.ts';
import type { Changed, DeviceSync, Hello } from '../models/index.ts';
import { accountError, accountSchema } from './account.validator.ts';
import { check, clipped, json } from './form.ts';

/** SHA-256 (hex) of the operating system's machine id, as the app sends it. */
export const deviceId = z.string({ error: DEVICE.badId }).regex(/^[0-9a-f]{64}$/, DEVICE.badId);

/** The device key (device.key of the app: 32 random bytes in hex); absent from an app before 1.1.8. */
const deviceKey = z.string({ error: DEVICE.badKey }).regex(/^[0-9a-f]{64}$/, DEVICE.badKey).nullish().transform((k) => k ?? undefined);

/** An account of the hello: its username and game server, no password. One without a username is left out. */
const helloAccount = z.object({
  username: clipped(MAX_USERNAME).pipe(z.string().min(1)),
  serverId: z.int().catch(DEFAULT_SERVER_ID),
});

export const helloSchema = z.object(
  {
    id: deviceId,
    key: deviceKey,
    hostname: clipped(MAX_HOSTNAME),
    os: clipped(MAX_OS),
    version: clipped(MAX_VERSION),
    accounts: z
      .array(z.unknown())
      .catch([])
      .transform((list) =>
        list.slice(0, MAX_HELLO_ACCOUNTS).flatMap((a) => {
          const r = helloAccount.safeParse(a);
          return r.success ? [r.data] : [];
        }),
      ),
  },
  { error: DEVICE.notObject },
);

/** The times the app saw each field change: numbers only, anything else left out (read as 0). */
const stamps = z
  .record(z.string(), z.unknown())
  .catch({})
  .transform((o) => Object.fromEntries(Object.entries(o).filter(([, t]) => typeof t === 'number' && Number.isFinite(t))) as Changed);

export const syncSchema = z.object(
  {
    id: deviceId,
    key: deviceKey,
    accounts: z
      .array(z.object({ account: accountSchema, changed: stamps }, { error: DEVICE.notObject }), { error: DEVICE.notList })
      .max(MAX_SYNC_ACCOUNTS, DEVICE.tooMany(MAX_SYNC_ACCOUNTS)),
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
  { error: DEVICE.notObject },
);

/** A hello read from its JSON, or the reason it is refused. Long texts are cut, not refused. */
export function parseHello(body: string): Hello | { error: string } {
  const read = json(body, DEVICE.badJson);
  if (!read.ok) return { error: read.error };
  const r = check(helloSchema, read.value);
  return r.ok ? r.data : { error: r.error };
}

/** A sync read from its JSON, or the reason it is refused: {"id", "settings"?, "accounts": [{"account", "changed"}]}.
 * Each account is checked as POST /api/accounts checks it. */
export function parseSync(body: string): DeviceSync | { error: string } {
  const read = json(body, DEVICE.badJson);
  if (!read.ok) return { error: read.error };
  const r = syncSchema.safeParse(read.value);
  if (!r.success) {
    const issue = r.error.issues[0]!;
    return { error: issue.path[0] === 'accounts' ? accountError(issue, 1) : issue.message };
  }
  return r.data;
}

/** Chặn: the reason the app shows. Đặt tên: the admin's name for it. */
export const blockForm = z.object({ reason: clipped(MAX_BLOCK_REASON) });
export const renameForm = z.object({ label: clipped(MAX_DEVICE_LABEL) });
