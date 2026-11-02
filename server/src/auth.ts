// The admin of the admin page, its logins, and the API tokens (README.md#bảo-mật). Passwords are hashed with
// PBKDF2-SHA256; cookies and tokens are kept as their SHA-256 only, so the database alone opens nothing.

/** The one admin, made on the first request with DEFAULT_PASSWORD, which the page then asks to change first. */
export const ADMIN = 'admin';
export const DEFAULT_PASSWORD = 'admin';
/** The shortest new password Đổi mật khẩu takes. */
export const MIN_PASSWORD = 8;
/** The most PBKDF2 iterations Cloudflare Workers allow. */
const ITERATIONS = 100_000;
/** A login lasts 7 days. */
const SESSION_MS = 7 * 24 * 3600_000;
export const COOKIE = 'cllt_admin';
/** Failed logins of one IP within FAIL_WINDOW_MS at which it must wait for the rest of that window. */
export const FAIL_LIMIT = 10;
const FAIL_WINDOW_MS = 15 * 60_000;

export interface Admin {
  username: string;
  password_hash: string;
  must_change: number;
}
export interface Token {
  id: number;
  name: string;
  prefix: string;
  created_at: number;
  last_used_at: number | null;
}

const text = new TextEncoder();

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64url(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
export const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

export async function sha256(value: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', text.encode(value)));
  return Array.from(d, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** The same in a time that does not depend on where they differ. */
function same(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', text.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return b64url(new Uint8Array(bits));
}

/** "pbkdf2$100000$<salt>$<hash>". */
export async function hashPassword(password: string): Promise<string> {
  const salt = random(16);
  return `pbkdf2$${ITERATIONS}$${b64url(salt)}$${await derive(password, salt, ITERATIONS)}`;
}

export async function checkPassword(password: string, stored: string): Promise<boolean> {
  const [kind, iterations, salt, hash] = stored.split('$');
  if (kind !== 'pbkdf2' || !salt || !hash) return false;
  return same(await derive(password, fromB64url(salt), Number(iterations)), hash);
}

/** The admin, made with DEFAULT_PASSWORD (to change first) when the database has none yet. */
export async function admin(db: D1Database): Promise<Admin> {
  const read = () =>
    db.prepare('SELECT username, password_hash, must_change FROM admins WHERE username = ?').bind(ADMIN).first<Admin>();
  const found = await read();
  if (found) return found;
  await db
    .prepare('INSERT OR IGNORE INTO admins (username, password_hash, must_change, updated_at) VALUES (?, ?, 1, ?)')
    .bind(ADMIN, await hashPassword(DEFAULT_PASSWORD), Date.now())
    .run();
  return (await read())!;
}

export function cookieOf(req: Request, name: string): string | null {
  for (const part of (req.headers.get('Cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

/** Đăng nhập: a new session cookie, or why not. An IP that failed FAIL_LIMIT times in 15 minutes waits for the rest of
 * them, right password or not. */
export async function login(
  db: D1Database,
  ip: string,
  username: string,
  password: string,
): Promise<{ cookie: string } | { error: string }> {
  const now = Date.now();
  const failed = await db
    .prepare('SELECT count, first_at FROM login_failures WHERE ip = ?')
    .bind(ip)
    .first<{ count: number; first_at: number }>();
  if (failed && now - failed.first_at < FAIL_WINDOW_MS && failed.count >= FAIL_LIMIT) {
    const minutes = Math.ceil((failed.first_at + FAIL_WINDOW_MS - now) / 60_000);
    return { error: `Đăng nhập sai ${FAIL_LIMIT} lần liền: thử lại sau ${minutes} phút` };
  }
  const a = await admin(db);
  if (username.trim() !== a.username || !(await checkPassword(password, a.password_hash))) {
    await db
      .prepare(
        `INSERT INTO login_failures (ip, count, first_at) VALUES (?1, 1, ?2)
         ON CONFLICT (ip) DO UPDATE SET
           count = CASE WHEN ?2 - first_at < ?3 THEN count + 1 ELSE 1 END,
           first_at = CASE WHEN ?2 - first_at < ?3 THEN first_at ELSE ?2 END`,
      )
      .bind(ip, now, FAIL_WINDOW_MS)
      .run();
    return { error: 'Sai tên đăng nhập hoặc mật khẩu' };
  }
  const cookie = b64url(random(32));
  await db.batch([
    db.prepare('DELETE FROM login_failures WHERE ip = ?').bind(ip),
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    db.prepare('INSERT INTO sessions (id, username, expires_at) VALUES (?, ?, ?)').bind(await sha256(cookie), a.username, now + SESSION_MS),
  ]);
  return { cookie };
}

/** The admin of the request's session cookie; null without a live one. */
export async function session(db: D1Database, req: Request): Promise<Admin | null> {
  const cookie = cookieOf(req, COOKIE);
  if (!cookie) return null;
  const row = await db
    .prepare('SELECT username FROM sessions WHERE id = ? AND expires_at > ?')
    .bind(await sha256(cookie), Date.now())
    .first();
  return row ? admin(db) : null;
}

export async function logout(db: D1Database, req: Request): Promise<void> {
  const cookie = cookieOf(req, COOKIE);
  if (cookie) await db.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256(cookie)).run();
}

/** Đổi mật khẩu: null when changed, else why not. Every other login of the admin ends. */
export async function changePassword(
  db: D1Database,
  req: Request,
  current: string,
  next: string,
  confirm: string,
): Promise<string | null> {
  const a = await admin(db);
  if (!(await checkPassword(current, a.password_hash))) return 'Mật khẩu hiện tại không đúng';
  if (next.length < MIN_PASSWORD) return `Mật khẩu mới cần ít nhất ${MIN_PASSWORD} ký tự`;
  if (next === DEFAULT_PASSWORD || next === current) return 'Mật khẩu mới phải khác mật khẩu cũ và khác "admin"';
  if (next !== confirm) return 'Nhập lại mật khẩu mới không khớp';
  const keep = await sha256(cookieOf(req, COOKIE) ?? '');
  await db.batch([
    db
      .prepare('UPDATE admins SET password_hash = ?, must_change = 0, updated_at = ? WHERE username = ?')
      .bind(await hashPassword(next), Date.now(), a.username),
    db.prepare('DELETE FROM sessions WHERE username = ? AND id != ?').bind(a.username, keep),
  ]);
  return null;
}

/** A new API token named `name`: "cllt_" and 43 characters. Only its SHA-256 is kept, so it is shown once. */
export async function createToken(db: D1Database, name: string): Promise<string> {
  const token = `cllt_${b64url(random(32))}`;
  await db
    .prepare('INSERT INTO tokens (name, hash, prefix, created_at) VALUES (?, ?, ?, ?)')
    .bind(name, await sha256(token), token.slice(0, 10), Date.now())
    .run();
  return token;
}

export async function tokens(db: D1Database): Promise<Token[]> {
  const { results } = await db
    .prepare('SELECT id, name, prefix, created_at, last_used_at FROM tokens ORDER BY id')
    .all<Token>();
  return results;
}

export async function deleteToken(db: D1Database, id: number): Promise<void> {
  await db.prepare('DELETE FROM tokens WHERE id = ?').bind(id).run();
}

/** The token of "Authorization: Bearer <token>", its last use noted; null without a known one. */
export async function bearer(db: D1Database, req: Request): Promise<Token | null> {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('Authorization') ?? '');
  if (!m) return null;
  const token = await db
    .prepare('SELECT id, name, prefix, created_at, last_used_at FROM tokens WHERE hash = ?')
    .bind(await sha256(m[1]))
    .first<Token>();
  if (token) await db.prepare('UPDATE tokens SET last_used_at = ? WHERE id = ?').bind(Date.now(), token.id).run();
  return token;
}
