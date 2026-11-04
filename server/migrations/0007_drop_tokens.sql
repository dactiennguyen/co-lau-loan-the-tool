-- API tokens are gone (README.md#key): the app sends its accounts by its key (POST /api/license/sync), and the admin
-- page downloads them (Tải JSON). Accounts a token sent stay, held by no key.
DROP TABLE tokens;
