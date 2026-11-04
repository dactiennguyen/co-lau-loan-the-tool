// Every fixed number and name of the server, in one place (README.md#bảo-mật for why each is what it is).

// ---- Admin and sessions -----------------------------------------------------------------------------------------

/** The one admin, made on the first request with DEFAULT_PASSWORD, which the page then asks to change first. */
export const ADMIN = 'admin';
export const DEFAULT_PASSWORD = 'admin';
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
export const MAX_SETTINGS = 4 * 1024;
/** Vietnam's time (UTC+7, no summer time): a date of the Key page ends at midnight there. */
export const VN_OFFSET_MS = 7 * 3600_000;

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
