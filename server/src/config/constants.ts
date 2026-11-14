// Every fixed number and name of the server, in one place (README.md#bảo-mật for why each is what it is).

// ---- Admin and sessions -----------------------------------------------------------------------------------------

/** The one admin, made at the first login with the ADMIN_PASSWORD secret, which the page then asks to change first.
 * Without that secret no admin is made: a fresh deploy is never open to whoever logs in first. */
export const ADMIN = 'admin';
/** The shortest new password Đổi mật khẩu takes. */
export const MIN_PASSWORD = 8;
/** The most PBKDF2 iterations Cloudflare Workers allow. */
export const PBKDF2_ITERATIONS = 100_000;
/** A login lasts 7 days. */
export const SESSION_MS = 7 * 24 * 3600_000;
export const SESSION_COOKIE = 'cllt_admin';
/** Failed logins of one IP within FAIL_WINDOW_MS at which it must wait for the rest of that window. */
export const FAIL_LIMIT = 10;
export const FAIL_WINDOW_MS = 15 * 60_000;

// ---- Accounts (Xuất JSON of the desktop app, app/desktop/src-tauri/src/backup.rs) ---------------------------------

export const APP_NAME = 'CLLT Tool';
export const EXPORT_FORMAT = 1;
/** The game server of an account without "serverId" (opcodes::SERVER_ID of cllt-core). */
export const DEFAULT_SERVER_ID = 24;
/** The largest body POST /api/license/sync takes. */
export const MAX_ACCOUNTS_BODY = 1 << 20;

// ---- Keys (Key page, POST /api/license/verify and /api/license/sync) ---------------------------------------------

/** A key is "CLLT-XXXX-XXXX-XXXX-XXXX": LICENSE_LENGTH characters of Crockford's base32 (no I, L, O, U). */
export const LICENSE_PREFIX = 'CLLT';
export const LICENSE_CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const LICENSE_LENGTH = 16;
/** What a new key takes unless the admin says otherwise: 100 accounts, 10 years from its activation. */
export const DEFAULT_MAX_ACCOUNTS = 100;
export const DEFAULT_DURATION = 10;
export const DEFAULT_DURATION_UNIT = 'year';
export const MAX_LICENSE_ACCOUNTS = 100_000;
/** Tạo key: the most keys one press makes. */
export const MAX_LICENSE_BATCH = 100;
/** The longest duration in days a key may be given (100 years). */
export const MAX_DURATION_DAYS = 36_500;
export const MAX_LICENSE_NOTE = 100;
export const MAX_REVOKE_REASON = 200;
/** The largest body POST /api/license/verify takes. */
export const MAX_VERIFY_BODY = 4 * 1024;
/** What the app says of the device that holds a key: its name, its system and the version of the app. */
export const MAX_HOSTNAME = 100;
export const MAX_OS = 60;
export const MAX_VERSION = 30;
/** The most accounts one POST /api/license/sync takes, and the largest Cài đặt kept for a key. */
export const MAX_SYNC_ACCOUNTS = 500;
/** The most "events" (what the app did to its accounts) one POST /api/license/sync takes; the longest username and
 * label of one that is kept; the app's id of one: 1 to 40 of these characters. */
export const MAX_SYNC_EVENTS = 200;
/** The period of the API_LIMIT binding of wrangler.toml (its simple.period), for the Retry-After of a refusal. */
export const API_LIMIT_PERIOD_S = 60;
/** The least time between two syncs of one key, unless SYNC_GAP_SECONDS says otherwise: the app syncs every 15 minutes,
 * or at the next turn (15 s) of its key thread after an account changed, so this never refuses it. */
export const SYNC_GAP_S = 10;
export const MAX_EVENT_TEXT = 100;
export const EVENT_ID = /^[A-Za-z0-9_-]{1,40}$/;
export const MAX_SETTINGS = 4 * 1024;
/** Vietnam's time (UTC+7, no summer time): a date of the Key page ends at midnight there. */
export const VN_OFFSET_MS = 7 * 3600_000;

// ---- Log (the Log page, services/log.service.ts) ------------------------------------------------------------------

/** The groups of the kinds of a log row (models/index.ts#LogKind), as the Log page filters them. */
export const LOG_GROUPS = ['key', 'sync', 'app', 'admin'] as const;
/** Rows older than this are deleted: as the Log page opens, and with LOG_PRUNE_CHANCE as one is written. */
export const LOG_KEEP_MS = 90 * 24 * 3600_000;
export const LOG_PRUNE_CHANCE = 0.01;
/** Refusals of a key not known, and failed logins, of one IP within this are one row, counted; LOG_DANGER_COUNT of them
 * make it 'danger'. */
export const LOG_WINDOW_MS = 10 * 60_000;
export const LOG_DANGER_COUNT = 10;
/** Refusals of a known key (revoked, taken, released, ended) from one IP within this are one row, counted, never
 * 'danger': the app of a key that ended checks every hour, a row a day. */
export const LOG_KEY_WINDOW_MS = 24 * 3600_000;
/** The key as typed is kept to this length. */
export const LOG_TYPED_KEY = 40;
/** Rows a page of the Log page shows, then Xem thêm; the longest search kept. */
export const LOG_PAGE = 100;
export const MAX_LOG_SEARCH = 100;
/** The most bound parameters of one D1 query: a write of many rows goes in pieces under it. */
export const D1_MAX_PARAMS = 100;

// ---- HTTP ---------------------------------------------------------------------------------------------------------

export const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  // Not no-referrer: under it a browser posts the forms of these very pages with "Origin: null", which the Origin check
  // refuses ("Sai nguồn gửi"). same-origin still sends nothing to other sites.
  'Referrer-Policy': 'same-origin',
  'Cache-Control': 'no-store',
};

/** The Content-Security-Policy of an admin page: only its own inline style and script, which carry `nonce`. */
export const contentSecurityPolicy = (nonce: string) =>
  `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`;
