-- The D1 database of cllt-server (README.md). Applied with `npm run db:migrate` (Cloudflare) or `npm run
-- db:migrate:local` (wrangler dev). Times are ms since 1970.

-- The one admin of the admin page. Made on the first request with the password "admin" and must_change = 1: the page
-- then only offers Đổi mật khẩu until it is changed.
CREATE TABLE admins (
  username TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  must_change INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);

-- Logins of the admin page: the SHA-256 of the cookie, never the cookie itself.
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Failed logins by IP, to slow down guessing.
CREATE TABLE login_failures (
  ip TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  first_at INTEGER NOT NULL
);

-- API tokens made on the admin page: the SHA-256 of the token, and its first characters to tell them apart.
CREATE TABLE tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  prefix TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  last_used_at INTEGER
);

-- The accounts of the desktop app, one per game server and username (any case, as the app compares them). `data` is
-- the account as accounts.json and Xuất JSON of the app write it, password included (not encrypted: the admin page
-- shows it); label and password are copied out of it for the admin page.
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL,
  username TEXT NOT NULL,
  username_key TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  password TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (server_id, username_key)
);
