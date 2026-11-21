// The models: the tables of the D1 database for Drizzle. migrations/*.sql stays what makes them (yarn db:migrate): each
// table here mirrors its CREATE TABLE there, column for column, so the two must change together.
import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, unique, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { LogKind } from '../models/index.ts';

/** The one admin of the admin page (services/auth.service.ts). */
export const admins = sqliteTable('admins', {
  username: text('username').primaryKey(),
  passwordHash: text('password_hash').notNull(),
  mustChange: integer('must_change').notNull().default(1),
  updatedAt: integer('updated_at').notNull(),
});

/** Logins of the admin page: the SHA-256 of the cookie, never the cookie itself. */
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  username: text('username').notNull(),
  expiresAt: integer('expires_at').notNull(),
});

/** Failed logins by IP, to slow down guessing. */
export const loginFailures = sqliteTable('login_failures', {
  ip: text('ip').primaryKey(),
  count: integer('count').notNull(),
  firstAt: integer('first_at').notNull(),
});

/** The accounts of the desktop app, one per game server and username in lower case (services/account.service.ts). */
export const accounts = sqliteTable(
  'accounts',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    serverId: integer('server_id').notNull(),
    username: text('username').notNull(),
    usernameKey: text('username_key').notNull(),
    label: text('label').notNull().default(''),
    password: text('password').notNull().default(''),
    data: text('data').notNull(),
    source: text('source').notNull().default(''),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
    /** JSON {"field": epoch ms}: when each field of `data` was last changed (migrations/0003_sync.sql). */
    changed: text('changed').notNull().default('{}'),
    /** The key whose app sent it last (POST /api/license/sync, migrations/0006_licenses_sync.sql); null when an API
     * token sent it before 0007, or that key was deleted. */
    licenseId: integer('license_id'),
    /** When the app of a key removed it (an event "remove" of POST /api/license/sync, migrations/0008_logs.sql): the
     * server keeps it; null while the app has it. */
    removedAt: integer('removed_at'),
    /** What the app last saw of the character (models/index.ts#AccountInfo, JSON; migrations/0009_account_info.sql),
     * and when it saw it; null until the app of its key sends one. */
    info: text('info'),
    infoAt: integer('info_at'),
  },
  (t) => [unique().on(t.serverId, t.usernameKey), index('accounts_license').on(t.licenseId)],
);

/** Keys of the desktop app (services/license.service.ts, migrations/0005_licenses.sql). */
export const licenses = sqliteTable('licenses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  note: text('note').notNull().default(''),
  maxAccounts: integer('max_accounts').notNull().default(100),
  /** 'activation': `duration` `durationUnit` from its first activation; 'fixed': until expiresAt, set when made. */
  mode: text('mode', { enum: ['activation', 'fixed'] }).notNull(),
  duration: integer('duration'),
  durationUnit: text('duration_unit', { enum: ['day', 'month', 'year'] }),
  /** Epoch ms it stops working; null for an 'activation' key never activated. */
  expiresAt: integer('expires_at'),
  revoked: integer('revoked').notNull().default(0),
  reason: text('reason').notNull().default(''),
  /** The device that holds it; null for a key no device holds. */
  deviceId: text('device_id'),
  hostname: text('hostname').notNull().default(''),
  os: text('os').notNull().default(''),
  version: text('version').notNull().default(''),
  ip: text('ip').notNull().default(''),
  accounts: integer('accounts').notNull().default(0),
  activatedAt: integer('activated_at'),
  /** The device Gỡ thiết bị took it from: refused while no device holds it. */
  releasedDevice: text('released_device'),
  lastCheckAt: integer('last_check_at'),
  /** Cài đặt of the app at its last POST /api/license/sync, JSON; '' before any. */
  settings: text('settings').notNull().default(''),
  syncedAt: integer('synced_at'),
  createdAt: integer('created_at').notNull(),
});

/** What happened, for the Log page (services/log.service.ts, migrations/0008_logs.sql): one row each, or one row with
 * `count` for the refusals of one IP, code and key within a window. */
export const logs = sqliteTable(
  'logs',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    at: integer('at').notNull(),
    kind: text('kind').$type<LogKind>().notNull(),
    level: text('level', { enum: ['info', 'warn', 'danger'] }).notNull().default('info'),
    /** The key it is about; null for none. Kept when the key is deleted. */
    licenseId: integer('license_id'),
    actor: text('actor', { enum: ['admin', 'app', 'ip'] }).notNull(),
    ip: text('ip').notNull().default(''),
    deviceId: text('device_id').notNull().default(''),
    hostname: text('hostname').notNull().default(''),
    username: text('username').notNull().default(''),
    serverId: integer('server_id'),
    message: text('message').notNull(),
    /** JSON of more about it; null for nothing more. */
    detail: text('detail'),
    count: integer('count').notNull().default(1),
    lastAt: integer('last_at').notNull(),
    /** The app's id of an event of a sync, unique for its key: an event sent again is not logged twice. */
    eventId: text('event_id'),
  },
  (t) => [
    index('logs_at').on(t.at),
    index('logs_last_at').on(t.lastAt),
    index('logs_kind_ip_at').on(t.kind, t.ip, t.at),
    uniqueIndex('logs_event').on(t.licenseId, t.eventId).where(sql`event_id IS NOT NULL`),
  ],
);

export const schema = { admins, sessions, loginFailures, accounts, licenses, logs };
