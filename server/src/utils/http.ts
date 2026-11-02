// Small helpers on a request: the client's IP, a cookie, a body with a size limit, the session cookie, and the ?done=
// notice of a page. The fields of an admin form are read by validators/form.ts#formObject.
import { SESSION_COOKIE } from '../config/constants.ts';
import { FLASH } from '../config/messages.ts';
import type { Ctx } from '../types/app.ts';

export const clientIp = (c: Ctx) => c.req.header('CF-Connecting-IP') ?? 'local';

export function cookieOf(req: Request, name: string): string | null {
  for (const part of (req.headers.get('Cookie') ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=');
  }
  return null;
}

/** The body as text, or null past `max` bytes (by Content-Length, then by what came). */
export async function bodyText(c: Ctx, max: number): Promise<string | null> {
  if (Number(c.req.header('Content-Length') ?? 0) > max) return null;
  const text = await c.req.text();
  return text.length > max ? null : text;
}

/** The Set-Cookie of the admin session; maxAge 0 ends it. Secure over HTTPS. */
export function sessionCookie(c: Ctx, value: string, maxAge: number): string {
  const secure = new URL(c.req.url).protocol === 'https:' ? '; Secure' : '';
  return `${SESSION_COOKIE}=${value}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

/** The notice ?done=<key> asks for, when it is one of FLASH. */
export function flash(c: Ctx): string | null {
  const key = c.req.query('done') ?? '';
  return Object.hasOwn(FLASH, key) ? FLASH[key] : null;
}
