-- Keys of the desktop app (README.md#key): the admin makes one per customer on the Key page; the app asks for it at its
-- first start and checks it as it opens and every hour (POST /api/license/verify). The first device that brings a key
-- holds it; another device is refused until the admin frees it (Gỡ thiết bị). The app of a key that works sends its
-- accounts (POST /api/license/sync), up to max_accounts of them.

CREATE TABLE licenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- "CLLT-XXXX-XXXX-XXXX-XXXX", 16 Crockford base32 characters: kept in clear, as the admin copies it to the customer.
  key TEXT NOT NULL UNIQUE,
  -- The admin's note: who it is for.
  note TEXT NOT NULL DEFAULT '',
  -- The most accounts the app takes with this key.
  max_accounts INTEGER NOT NULL DEFAULT 100,
  -- 'activation': it lasts `duration` `duration_unit` (day, month, year) from its first activation; 'fixed': it ends
  -- at expires_at, set when made.
  mode TEXT NOT NULL,
  duration INTEGER,
  duration_unit TEXT,
  -- Epoch ms the key stops working; NULL for an 'activation' key never activated.
  expires_at INTEGER,
  revoked INTEGER NOT NULL DEFAULT 0,
  -- Why it is revoked, shown in the app.
  reason TEXT NOT NULL DEFAULT '',
  -- The device that holds it (SHA-256 of its machine id, as the app sends it), and what it said at its last check.
  device_id TEXT,
  hostname TEXT NOT NULL DEFAULT '',
  os TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '',
  ip TEXT NOT NULL DEFAULT '',
  accounts INTEGER NOT NULL DEFAULT 0,
  -- When the device that holds it activated it.
  activated_at INTEGER,
  -- The device Gỡ thiết bị took it from, refused while the key is free (its app still checks every hour and would take
  -- it back first); NULL again once another device activates it.
  released_device TEXT,
  last_check_at INTEGER,
  -- Cài đặt of the app at its last POST /api/license/sync (JSON, '' before any), and when that was.
  settings TEXT NOT NULL DEFAULT '',
  synced_at INTEGER,
  created_at INTEGER NOT NULL
);
