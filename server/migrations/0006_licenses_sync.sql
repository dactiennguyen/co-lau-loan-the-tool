-- Keys replace devices (README.md#key): the app no longer says hello, and its accounts are synced by its key (POST
-- /api/license/sync). Every device is forgotten with the table.
DROP TABLE devices;

-- The key whose app sent the account last; NULL for one a token sent, or whose key was deleted (license.service.ts
-- sets it NULL before it deletes a key). A key takes new accounts only up to its max_accounts.
ALTER TABLE accounts ADD COLUMN license_id INTEGER;
CREATE INDEX accounts_license ON accounts (license_id);
