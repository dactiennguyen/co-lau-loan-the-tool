// The models: the tables of the D1 database for Drizzle. migrations/*.sql stays what makes them (yarn db:migrate): each
// table here mirrors its CREATE TABLE there, column for column, so the two must change together.
import { index, integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

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

/** API tokens: the SHA-256 of the token, and its first characters to tell them apart. */
export const tokens = sqliteTable('tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  hash: text('hash').notNull().unique(),
  prefix: text('prefix').notNull(),
  createdAt: integer('created_at').notNull(),
  lastUsedAt: integer('last_used_at'),
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
    /** The key whose app sent it last (POST /api/license/sync, migrations/0006_licenses_sync.sql); null when a token
     * sent it, or that key was deleted. */
    licenseId: integer('license_id'),
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

export const schema = { admins, sessions, loginFailures, tokens, accounts, licenses };
