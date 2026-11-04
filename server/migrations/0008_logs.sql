-- Log (README.md#log): what happened, for the Log page of the admin page: keys activated and refused (POST
-- /api/license/verify), what the app did to its accounts (the "events" of POST /api/license/sync) and what a sync took,
-- and the admin's actions. Refusals of one IP, code and key are one row: `count` of them, the first at `at`, the last
-- at `last_at`; within 10 minutes for a key not known and for failed logins (10 of them make it 'danger'), within 24
-- hours for a known key (an app whose key ended checks every hour). Rows older than 90 days are deleted as the Log page
-- opens (and now and then as one is written). The page shows the last to happen first (by `last_at`).
CREATE TABLE logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  -- "<group>.<what>": key.activate, key.unknown, …, sync.summary, app.add, …, admin.login, … (models/index.ts#LogKind).
  kind TEXT NOT NULL,
  -- 'info', 'warn' or 'danger' (a key not known, or a failed login, counted 10 times or more within 10 minutes).
  level TEXT NOT NULL DEFAULT 'info',
  -- The key it is about; NULL for none (a key typed wrong, a login). Not cleared when the key is deleted.
  license_id INTEGER,
  -- Who did it: 'admin', 'app' (by its key) or 'ip' (someone not known, by the IP only).
  actor TEXT NOT NULL,
  ip TEXT NOT NULL DEFAULT '',
  device_id TEXT NOT NULL DEFAULT '',
  hostname TEXT NOT NULL DEFAULT '',
  -- The account it is about (an event of the app, Xoá on the Nick page), and its game server.
  username TEXT NOT NULL DEFAULT '',
  server_id INTEGER,
  -- What happened, in Vietnamese as the Log page shows it.
  message TEXT NOT NULL,
  -- More of it as JSON (the key as typed, the label of an account, …); NULL for nothing more.
  detail TEXT,
  count INTEGER NOT NULL DEFAULT 1,
  last_at INTEGER NOT NULL,
  -- The app's id of an event of POST /api/license/sync ("events"): an event sent again (a sync retried) is not logged
  -- twice. NULL for everything else, and for the events of an app that sends no id.
  event_id TEXT
);

-- Pruning.
CREATE INDEX logs_at ON logs (at);
-- The Log page: the last to happen first.
CREATE INDEX logs_last_at ON logs (last_at);
-- The row a refusal of the same IP and code is counted in.
CREATE INDEX logs_kind_ip_at ON logs (kind, ip, at);
CREATE UNIQUE INDEX logs_event ON logs (license_id, event_id) WHERE event_id IS NOT NULL;

-- When the app of a key removed the account (an event "remove" of POST /api/license/sync): the server keeps it, the
-- Nick page shows "Đã xoá ở máy". NULL again once the app adds, imports, edits or sends it.
ALTER TABLE accounts ADD COLUMN removed_at INTEGER;
