-- Devices of the desktop app (README.md#thiết-bị): each one says hello as it opens and every 15 minutes
-- (POST /api/devices/hello), and the admin page blocks or unblocks it. A device unknown so far is allowed.

CREATE TABLE devices (
  -- SHA-256 (hex) of the operating system's machine id, as the app sends it: the same after the app is reinstalled.
  id TEXT PRIMARY KEY,
  -- The admin's name for it; empty shows the host name.
  label TEXT NOT NULL DEFAULT '',
  hostname TEXT NOT NULL DEFAULT '',
  os TEXT NOT NULL DEFAULT '',
  -- Version of the app at the last hello.
  version TEXT NOT NULL DEFAULT '',
  -- The game accounts of the app at the last hello: JSON [{"username": …, "serverId": …}], no passwords.
  accounts TEXT NOT NULL DEFAULT '[]',
  ip TEXT NOT NULL DEFAULT '',
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  blocked INTEGER NOT NULL DEFAULT 0,
  -- Why it is blocked, shown in the app.
  reason TEXT NOT NULL DEFAULT ''
);

CREATE INDEX devices_last_seen ON devices (last_seen);
