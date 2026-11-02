-- Đồng bộ nick (README.md#đồng-bộ-nick): each device sends its accounts and its Cài đặt (POST /api/devices/sync), and
-- two devices with the same account are merged field by field, the later edit of each field winning.

-- When each top-level field of the account (label, password, proxy, fight, …) was last changed: JSON {"field": epoch ms},
-- the time the app saw the edit (0 for what a device had before it first synced). A field arriving with a later time
-- replaces the one kept; an earlier one leaves it. POST /api/accounts stamps every field it sends with its own time.
ALTER TABLE accounts ADD COLUMN changed TEXT NOT NULL DEFAULT '{}';

-- Cài đặt of the app on the device at its last sync (settings.json: game server, Lưu dữ liệu trận, closing the window).
ALTER TABLE devices ADD COLUMN settings TEXT NOT NULL DEFAULT '';
ALTER TABLE devices ADD COLUMN synced_at INTEGER;

-- 1 when the admin let the device sync (Cho đồng bộ on the Thiết bị page): a device sends no secret, so the accounts of
-- one never let in are refused, and a made-up device cannot overwrite them.
ALTER TABLE devices ADD COLUMN sync_allowed INTEGER NOT NULL DEFAULT 0;
