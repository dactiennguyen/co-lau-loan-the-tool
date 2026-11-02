// The admin of the admin page, its logins, and the API tokens (README.md#bảo-mật). Passwords are hashed with
// PBKDF2-SHA256; cookies and tokens are kept as their SHA-256 only, so the database alone opens nothing.
import { and, eq, gt, lt, ne, sql } from 'drizzle-orm';
import { admins, loginFailures, sessions, tokens, type Db } from './db.ts';

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

export type Admin = typeof admins.$inferSelect;
/** A token as the admin page lists it: everything but its hash. */
export type Token = Omit<typeof tokens.$inferSelect, 'hash'>;
const tokenColumns = { id: tokens.id, name: tokens.name, prefix: tokens.prefix, createdAt: tokens.createdAt, lastUsedAt: tokens.lastUsedAt };

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
export async function admin(db: Db): Promise<Admin> {
  const read = () => db.select().from(admins).where(eq(admins.username, ADMIN)).get();
  const found = await read();
  if (found) return found;
  await db
    .insert(admins)
    .values({ username: ADMIN, passwordHash: await hashPassword(DEFAULT_PASSWORD), mustChange: 1, updatedAt: Date.now() })
    .onConflictDoNothing();
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
export async function login(db: Db, ip: string, username: string, password: string): Promise<{ cookie: string } | { error: string }> {
  const now = Date.now();
  const failed = await db.select().from(loginFailures).where(eq(loginFailures.ip, ip)).get();
  if (failed && now - failed.firstAt < FAIL_WINDOW_MS && failed.count >= FAIL_LIMIT) {
    const minutes = Math.ceil((failed.firstAt + FAIL_WINDOW_MS - now) / 60_000);
    return { error: `Đăng nhập sai ${FAIL_LIMIT} lần liền: thử lại sau ${minutes} phút` };
  }
  const a = await admin(db);
  if (username.trim() !== a.username || !(await checkPassword(password, a.passwordHash))) {
    // Within the window one more failure, else a new window from now.
    const inWindow = sql`${now} - ${loginFailures.firstAt} < ${FAIL_WINDOW_MS}`;
    await db
      .insert(loginFailures)
      .values({ ip, count: 1, firstAt: now })
      .onConflictDoUpdate({
        target: loginFailures.ip,
        set: {
          count: sql`CASE WHEN ${inWindow} THEN ${loginFailures.count} + 1 ELSE 1 END`,
          firstAt: sql`CASE WHEN ${inWindow} THEN ${loginFailures.firstAt} ELSE ${now} END`,
        },
      });
    return { error: 'Sai tên đăng nhập hoặc mật khẩu' };
  }
  const cookie = b64url(random(32));
  await db.batch([
    db.delete(loginFailures).where(eq(loginFailures.ip, ip)),
    db.delete(sessions).where(lt(sessions.expiresAt, now)),
    db.insert(sessions).values({ id: await sha256(cookie), username: a.username, expiresAt: now + SESSION_MS }),
  ]);
  return { cookie };
}

/** The admin of the request's session cookie; null without a live one. */
export async function session(db: Db, req: Request): Promise<Admin | null> {
  const cookie = cookieOf(req, COOKIE);
  if (!cookie) return null;
  const row = await db
    .select({ username: sessions.username })
    .from(sessions)
    .where(and(eq(sessions.id, await sha256(cookie)), gt(sessions.expiresAt, Date.now())))
    .get();
  return row ? admin(db) : null;
}

export async function logout(db: Db, req: Request): Promise<void> {
  const cookie = cookieOf(req, COOKIE);
  if (cookie) await db.delete(sessions).where(eq(sessions.id, await sha256(cookie)));
}

/** Đổi mật khẩu: null when changed, else why not. Every other login of the admin ends. */
export async function changePassword(db: Db, req: Request, current: string, next: string, confirm: string): Promise<string | null> {
  const a = await admin(db);
  if (!(await checkPassword(current, a.passwordHash))) return 'Mật khẩu hiện tại không đúng';
  if (next.length < MIN_PASSWORD) return `Mật khẩu mới cần ít nhất ${MIN_PASSWORD} ký tự`;
  if (next === DEFAULT_PASSWORD || next === current) return 'Mật khẩu mới phải khác mật khẩu cũ và khác "admin"';
  if (next !== confirm) return 'Nhập lại mật khẩu mới không khớp';
  const keep = await sha256(cookieOf(req, COOKIE) ?? '');
  await db.batch([
    db.update(admins).set({ passwordHash: await hashPassword(next), mustChange: 0, updatedAt: Date.now() }).where(eq(admins.username, a.username)),
    db.delete(sessions).where(and(eq(sessions.username, a.username), ne(sessions.id, keep))),
  ]);
  return null;
}

/** A new API token named `name`: "cllt_" and 43 characters. Only its SHA-256 is kept, so it is shown once. */
export async function createToken(db: Db, name: string): Promise<string> {
  const token = `cllt_${b64url(random(32))}`;
  await db.insert(tokens).values({ name, hash: await sha256(token), prefix: token.slice(0, 10), createdAt: Date.now() });
  return token;
}

export async function listTokens(db: Db): Promise<Token[]> {
  return db.select(tokenColumns).from(tokens).orderBy(tokens.id);
}

export async function deleteToken(db: Db, id: number): Promise<void> {
  await db.delete(tokens).where(eq(tokens.id, id));
}

/** The token of "Authorization: Bearer <token>", its last use noted; null without a known one. */
export async function bearer(db: Db, req: Request): Promise<Token | null> {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('Authorization') ?? '');
  if (!m) return null;
  const token = await db.select(tokenColumns).from(tokens).where(eq(tokens.hash, await sha256(m[1]))).get();
  if (!token) return null;
  await db.update(tokens).set({ lastUsedAt: Date.now() }).where(eq(tokens.id, token.id));
  return token;
}
