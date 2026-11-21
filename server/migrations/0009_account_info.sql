-- What the app last saw of the character of an account (the "info" of POST /api/license/sync): its name, level and
-- share of the level, map and zone, Xu, Xu khoá, Lượng and Vàng, as JSON (models/index.ts#AccountInfo); the Nick page
-- shows it. NULL until the app of the key that holds the account sends one. `info_at`: when the app saw it (epoch ms on
-- the app's clock).
ALTER TABLE accounts ADD COLUMN info TEXT;
ALTER TABLE accounts ADD COLUMN info_at INTEGER;
