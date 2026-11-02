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
  },
  (t) => [unique().on(t.serverId, t.usernameKey)],
);

/** Devices of the desktop app (services/device.service.ts, migrations/0002_devices.sql). */
export const devices = sqliteTable(
  'devices',
  {
    id: text('id').primaryKey(),
    label: text('label').notNull().default(''),
    hostname: text('hostname').notNull().default(''),
    os: text('os').notNull().default(''),
    version: text('version').notNull().default(''),
    accounts: text('accounts').notNull().default('[]'),
    ip: text('ip').notNull().default(''),
    firstSeen: integer('first_seen').notNull(),
    lastSeen: integer('last_seen').notNull(),
    blocked: integer('blocked').notNull().default(0),
    reason: text('reason').notNull().default(''),
  },
  (t) => [index('devices_last_seen').on(t.lastSeen)],
);

export const schema = { admins, sessions, loginFailures, tokens, accounts, devices };
