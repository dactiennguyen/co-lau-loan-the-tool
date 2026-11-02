// Đăng nhập, Đăng xuất, Đổi mật khẩu.
import { SESSION_MS } from '../config/constants.ts';
import { FLASH } from '../config/messages.ts';
import * as auth from '../services/auth.service.ts';
import type { Ctx } from '../types/app.ts';
import { clientIp, field, sessionCookie } from '../utils/http.ts';
import { render } from '../utils/render.ts';
import { loginView, passwordView } from '../views/auth.view.ts';

export async function loginPage(c: Ctx) {
  if (await auth.session(c.var.db, c.req.raw)) return c.redirect('/admin', 303);
  return render(c, (n) => loginView(n));
}

export async function login(c: Ctx) {
  const r = await auth.login(c.var.db, clientIp(c), field(c, 'username'), field(c, 'password'));
  if ('error' in r) return render(c, (n) => loginView(n, r.error), 401);
  c.header('Set-Cookie', sessionCookie(c, r.cookie, SESSION_MS / 1000));
  return c.redirect('/admin', 303);
}

export async function logout(c: Ctx) {
  await auth.logout(c.var.db, c.req.raw);
  c.header('Set-Cookie', sessionCookie(c, '', 0));
  return c.redirect('/admin/login', 303);
}

export const passwordPage = (c: Ctx) => render(c, (n) => passwordView(n, c.var.me.mustChange === 1));

export async function changePassword(c: Ctx) {
  const mustChange = c.var.me.mustChange === 1;
  const error = await auth.changePassword(c.var.db, c.req.raw, field(c, 'current'), field(c, 'next'), field(c, 'confirm'));
  if (error) return render(c, (n) => passwordView(n, mustChange, error), 400);
  // The first change goes on to the accounts; a later one stays here and says so.
  return mustChange ? c.redirect('/admin?done=password', 303) : render(c, (n) => passwordView(n, false, null, FLASH.password));
}
