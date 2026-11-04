// The admin of the admin page and its logins (README.md#bảo-mật). The password is hashed with PBKDF2-SHA256, a session
// cookie is kept as its SHA-256, and an IP that fails too often waits. Logins, failed ones (counted by IP), Đăng xuất and
// Đổi mật khẩu are lines of the Log page, written in the batch of what they change.
import { and, eq, exists, gt, lt, ne, sql } from 'drizzle-orm';
import { ADMIN, DEFAULT_PASSWORD, FAIL_LIMIT, FAIL_WINDOW_MS, LOG_WINDOW_MS, MAX_EVENT_TEXT, SESSION_COOKIE, SESSION_MS } from '../config/constants.ts';
import { AUTH, LOG } from '../config/messages.ts';
import type { Db } from '../db/client.ts';
import { admins, loginFailures, sessions } from '../db/schema.ts';
import type { Admin } from '../models/index.ts';
import { b64url, checkPassword, hashPassword, random, sha256 } from '../utils/crypto.ts';
import { cookieOf } from '../utils/http.ts';
import * as logs from './log.service.ts';

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

/** Đăng nhập: a new session cookie, or why not. An IP that failed FAIL_LIMIT times in 15 minutes waits for the rest of
 * them, right password or not. */
export async function login(db: Db, ip: string, username: string, password: string): Promise<{ cookie: string } | { error: string }> {
  const now = Date.now();
  // A failure, waiting or not, is a line counted with those of the IP within LOG_WINDOW_MS.
  const typed = username.trim().slice(0, MAX_EVENT_TEXT);
  const fail = logs.counted(
    db,
    { kind: 'admin.login_fail', actor: 'ip', ip, message: LOG.loginFail(typed), detail: { username: typed } },
    LOG_WINDOW_MS,
    LOG.burst.login,
    now,
  );
  const failed = await db.select().from(loginFailures).where(eq(loginFailures.ip, ip)).get();
  if (failed && now - failed.firstAt < FAIL_WINDOW_MS && failed.count >= FAIL_LIMIT) {
    const minutes = Math.ceil((failed.firstAt + FAIL_WINDOW_MS - now) / 60_000);
    await logs.run(db, fail, now);
    return { error: AUTH.lockedOut(minutes) };
  }
  const a = await admin(db);
  if (username.trim() !== a.username || !(await checkPassword(password, a.passwordHash))) {
    // Within the window one more failure, else a new window from now.
    const inWindow = sql`${now} - ${loginFailures.firstAt} < ${FAIL_WINDOW_MS}`;
    await logs.run(
      db,
      [
        db
          .insert(loginFailures)
          .values({ ip, count: 1, firstAt: now })
          .onConflictDoUpdate({
            target: loginFailures.ip,
            set: {
              count: sql`CASE WHEN ${inWindow} THEN ${loginFailures.count} + 1 ELSE 1 END`,
              firstAt: sql`CASE WHEN ${inWindow} THEN ${loginFailures.firstAt} ELSE ${now} END`,
            },
          }),
        ...fail,
      ],
      now,
    );
    return { error: AUTH.wrongLogin };
  }
  const cookie = b64url(random(32));
  await logs.run(
    db,
    [
      db.delete(loginFailures).where(eq(loginFailures.ip, ip)),
      db.delete(sessions).where(lt(sessions.expiresAt, now)),
      db.insert(sessions).values({ id: await sha256(cookie), username: a.username, expiresAt: now + SESSION_MS }),
      ...logs.inserts(db, [{ ...logs.byAdmin(ip), kind: 'admin.login', message: LOG.login }], now),
    ],
    now,
  );
  return { cookie };
}

/** The admin of the request's session cookie; null without a live one. */
export async function session(db: Db, req: Request): Promise<Admin | null> {
  const cookie = cookieOf(req, SESSION_COOKIE);
  if (!cookie) return null;
  const row = await db
    .select({ username: sessions.username })
    .from(sessions)
    .where(and(eq(sessions.id, await sha256(cookie)), gt(sessions.expiresAt, Date.now())))
    .get();
  return row ? admin(db) : null;
}

/** Đăng xuất: the session ends; a line of the Log page when there was one. */
export async function logout(db: Db, req: Request, ip: string): Promise<void> {
  const cookie = cookieOf(req, SESSION_COOKIE);
  if (!cookie) return;
  const id = await sha256(cookie);
  const live = exists(db.select({ id: sessions.id }).from(sessions).where(eq(sessions.id, id)));
  await logs.run(db, [
    logs.insertIf(db, { ...logs.byAdmin(ip), kind: 'admin.logout', message: LOG.logout }, live),
    db.delete(sessions).where(eq(sessions.id, id)),
  ]);
}

/** Đổi mật khẩu to `next`, checked by passwordForm (validators/admin.validator.ts): null when changed, else why not.
 * Every other login of the admin ends. */
export async function changePassword(db: Db, req: Request, current: string, next: string, ip: string): Promise<string | null> {
  const a = await admin(db);
  if (!(await checkPassword(current, a.passwordHash))) return AUTH.wrongCurrent;
  const keep = await sha256(cookieOf(req, SESSION_COOKIE) ?? '');
  await logs.run(db, [
    db.update(admins).set({ passwordHash: await hashPassword(next), mustChange: 0, updatedAt: Date.now() }).where(eq(admins.username, a.username)),
    db.delete(sessions).where(and(eq(sessions.username, a.username), ne(sessions.id, keep))),
    ...logs.inserts(db, [{ ...logs.byAdmin(ip), kind: 'admin.password', message: LOG.password }]),
  ]);
  return null;
}
