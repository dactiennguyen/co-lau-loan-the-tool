-- The key of each device (README.md#khoá-thiết-bị): the app makes a secret once (device.key beside accounts.json) and
-- sends it with every hello and sync. The server keeps its SHA-256 from the first hello that brings one; after that a
-- hello or a sync of that id without the same key is refused, so knowing the id (a hash of the machine id) is not enough
-- to pass for the device. '' for a device that never sent one (an app before 1.1.8): it may say hello, but not sync.
-- Xoá khỏi danh sách on the Thiết bị page forgets it, so a device that lost its key can say hello again.
ALTER TABLE devices ADD COLUMN key_hash TEXT NOT NULL DEFAULT '';
