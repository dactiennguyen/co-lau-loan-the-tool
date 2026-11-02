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

// ---- API tokens ---------------------------------------------------------------------------------------------------

export const TOKEN_PREFIX = 'cllt_';
/** Characters of a token kept in clear to tell tokens apart ("cllt_" and 5 more). */
export const TOKEN_SHOWN = 10;
export const MAX_TOKEN_NAME = 60;

// ---- Accounts (Xuất JSON of the desktop app, app/desktop/src-tauri/src/backup.rs) ---------------------------------

export const APP_NAME = 'CLLT Tool';
export const EXPORT_FORMAT = 1;
/** The game server of an account without "serverId" (opcodes::SERVER_ID of cllt-core). */
export const DEFAULT_SERVER_ID = 24;
/** The largest body POST /api/accounts takes. */
export const MAX_ACCOUNTS_BODY = 1 << 20;

// ---- Devices ------------------------------------------------------------------------------------------------------

/** The largest hello POST /api/devices/hello takes. */
export const MAX_HELLO_BODY = 16 * 1024;
export const MAX_HELLO_ACCOUNTS = 200;
/** The most accounts one POST /api/devices/sync takes (its body is limited as POST /api/accounts), and the largest
 * Cài đặt kept for a device. */
export const MAX_SYNC_ACCOUNTS = 500;
export const MAX_SETTINGS = 4 * 1024;
export const MAX_HOSTNAME = 100;
export const MAX_OS = 60;
export const MAX_VERSION = 30;
export const MAX_USERNAME = 60;
export const MAX_BLOCK_REASON = 200;
export const MAX_DEVICE_LABEL = 60;

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
  `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`;
