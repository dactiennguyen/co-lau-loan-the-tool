// The shapes the server works with: rows of the tables (from db/schema.ts), and what the app sends.
import type { accounts, admins, devices, tokens } from '../db/schema.ts';

export type Admin = typeof admins.$inferSelect;
/** A token as the admin page lists it: everything but its hash. */
export type Token = Omit<typeof tokens.$inferSelect, 'hash'>;
/** An account as the admin page lists it. */
export type AccountRow = typeof accounts.$inferSelect;
export type Device = typeof devices.$inferSelect;

/** One account as accounts.json of the app has it: label, username, password, serverId, and whatever else the app keeps
 * (skill, stats, fight, fightTargets, proxy), kept as sent. */
export type Account = { [key: string]: unknown; label: string; username: string; password: string; serverId: number };

/** What POST /api/accounts did. */
export interface Synced {
  added: number;
  updated: number;
  unchanged: number;
  /** Accounts after the first with the same username on the same server in the JSON: left out, as Nhập does. */
  repeated: number;
}

/** What the app sends to POST /api/devices/hello. `id` is the SHA-256 (hex) of the operating system's machine id. */
export interface Hello {
  id: string;
  hostname: string;
  os: string;
  version: string;
  accounts: { username: string; serverId: number }[];
}

/** The answer of POST /api/devices/hello. */
export type HelloAnswer = { allowed: true } | { allowed: false; reason: string };
