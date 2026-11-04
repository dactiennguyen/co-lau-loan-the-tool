// The shapes the server works with: rows of the tables (from db/schema.ts), and what the app sends.
import type { LOG_GROUPS } from '../config/constants.ts';
import type { accounts, admins, licenses, logs } from '../db/schema.ts';

export type Admin = typeof admins.$inferSelect;
/** An account as the admin page lists it. */
export type AccountRow = typeof accounts.$inferSelect;

/** One account as accounts.json of the app has it: label, username, password, serverId, and whatever else the app keeps
 * (skill, stats, fight, fightTargets, proxy), kept as sent. */
export type Account = { [key: string]: unknown; label: string; username: string; password: string; serverId: number };

/** When each top-level field of an account was last changed, as the app saw it: {"field": epoch ms}. */
export type Changed = Record<string, number>;

/** One account of POST /api/license/sync, with the time each of its fields changed. */
export interface Stamped {
  account: Account;
  changed: Changed;
}

/** What the app did to one of its accounts, as POST /api/license/sync tells it ("events"): added, removed, edited,
 * or added by Nhập JSON; `at` epoch ms on the app's clock, `label` '' when not sent; `id` the app's id of the event, so
 * that one sent again is logged once (none from an app that sends none). */
export interface AppEvent {
  id?: string;
  at: number;
  kind: 'add' | 'remove' | 'edit' | 'import';
  username: string;
  serverId: number;
  label: string;
}

/** What the app sends to POST /api/license/sync: its key (as typed) and device id, the accounts that changed since its
 * last sync, its Cài đặt (JSON, null when not sent), and what it did to its accounts since then. */
export interface LicenseSync {
  key: string;
  id: string;
  settings: string | null;
  accounts: Stamped[];
  events: AppEvent[];
}

/** What POST /api/license/sync did. */
export interface Merged {
  added: number;
  updated: number;
  unchanged: number;
  /** Of the updated and unchanged: accounts with a field the server keeps as it is, as another send of the key changed
   * it later. */
  kept: number;
  repeated: number;
  /** Accounts not written: new ones past the key's max_accounts, and those another key holds. */
  refused: number;
  /** Of the refused: those another key holds. */
  taken: number;
}

export type License = typeof licenses.$inferSelect;
export type DurationUnit = 'day' | 'month' | 'year';

/** What the app sends to POST /api/license/verify: the key as typed, this device's id (SHA-256 of the system's machine
 * id), its name and system, the version of the app and how many accounts it has. */
export interface Verify {
  key: string;
  id: string;
  hostname: string;
  os: string;
  version: string;
  accounts: number;
}

/** The answer of POST /api/license/verify, always 200: the key works, or why not. */
export type VerifyAnswer =
  | { ok: true; maxAccounts: number; expiresAt: number; activatedAt: number }
  | { ok: false; code: Refusal; error: string; expiresAt?: number };

/** Why a key does not work: no such key, revoked, held by another device, ended; for a sync also never activated. */
export type Refusal = 'unknown' | 'revoked' | 'taken' | 'expired';
export type SyncRefusal = Refusal | 'inactive';

/** A license row with how many accounts it last sent (Key page). */
export type LicenseRow = License & { synced: number };

/** What a row of the Log page is about, "<group>.<what>" (README.md#log):
 * - key: POST /api/license/verify activated a key, or refused it (why: unknown, revoked, taken, released, expired);
 * - sync: what a POST /api/license/sync took, when it took or refused something;
 * - app: what the app of a key did to an account (the "events" of a sync);
 * - admin: the admin's login and actions. */
export type LogKind =
  | 'key.activate'
  | `key.${KeyRefusal}`
  | 'sync.summary'
  | `app.${AppEvent['kind']}`
  | 'admin.login'
  | 'admin.login_fail'
  | 'admin.logout'
  | 'admin.password'
  | 'admin.create'
  | 'admin.revoke'
  | 'admin.restore'
  | 'admin.release'
  | 'admin.edit'
  | 'admin.delete'
  | 'admin.account_delete';

/** Why POST /api/license/verify refused a key, as the Log page tells them apart: Refusal, and 'released' for the device
 * Gỡ thiết bị took the key from (answered 'taken'). */
export type KeyRefusal = Refusal | 'released';

/** The groups of LogKind, as the Log page filters them. */
export type LogGroup = (typeof LOG_GROUPS)[number];

export type LogLevel = 'info' | 'warn' | 'danger';
export type Log = typeof logs.$inferSelect;
