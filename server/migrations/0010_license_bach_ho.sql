-- Bạch Hổ by key (24/11/2026): whether the app of the key may run Bạch Hổ Thống Lĩnh. On for every key, those made
-- before too; the admin turns it off (Tắt Bạch Hổ in the key's menu), and the app hears it at its next check
-- (POST /api/license/verify answers bachHo), at most an hour later or when it opens or its Bạch Hổ window opens.
ALTER TABLE licenses ADD COLUMN bach_ho INTEGER NOT NULL DEFAULT 1;
