// The shapes the server works with: rows of the tables (from db/schema.ts), and what the app sends.
import type { accounts, admins, licenses } from '../db/schema.ts';

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

/** What the app sends to POST /api/license/sync: its key (as typed) and device id, the accounts that changed since its
 * last sync, and its Cài đặt (JSON, null when not sent). */
export interface LicenseSync {
  key: string;
  id: string;
  settings: string | null;
  accounts: Stamped[];
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
