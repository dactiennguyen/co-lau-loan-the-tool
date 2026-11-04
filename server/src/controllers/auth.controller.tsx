// Đăng nhập, Đăng xuất, Đổi mật khẩu: each a line of the Log page (services/auth.service.ts).
import { SESSION_MS } from '../config/constants.ts';
import { FLASH } from '../config/messages.ts';
import * as auth from '../services/auth.service.ts';
import type { Ctx } from '../types/app.ts';
import { clientIp, sessionCookie } from '../utils/http.ts';
import { loginForm, passwordForm } from '../validators/admin.validator.ts';
import { check, formObject } from '../validators/form.ts';
import { render } from '../utils/render.ts';
import { LoginView, PasswordView } from '../views/auth.view.tsx';

export async function loginPage(c: Ctx) {
  if (await auth.session(c.var.db, c.req.raw)) return c.redirect('/admin', 303);
  return render(c, (n) => <LoginView nonce={n} />);
}

export async function login(c: Ctx) {
  const { username, password } = loginForm.parse(formObject(c.var.form));
  const r = await auth.login(c.var.db, clientIp(c), username, password);
  if ('error' in r) return render(c, (n) => <LoginView nonce={n} error={r.error} />, 401);
  c.header('Set-Cookie', sessionCookie(c, r.cookie, SESSION_MS / 1000));
  return c.redirect('/admin', 303);
}

export async function logout(c: Ctx) {
  await auth.logout(c.var.db, c.req.raw, clientIp(c));
  c.header('Set-Cookie', sessionCookie(c, '', 0));
  return c.redirect('/admin/login', 303);
}

export const passwordPage = (c: Ctx) => render(c, (n) => <PasswordView nonce={n} mustChange={c.var.me.mustChange === 1} />);

export async function changePassword(c: Ctx) {
  const mustChange = c.var.me.mustChange === 1;
  const form = check(passwordForm, formObject(c.var.form));
  if (!form.ok) return render(c, (n) => <PasswordView nonce={n} mustChange={mustChange} errors={form.fields} />, 400);
  const wrong = await auth.changePassword(c.var.db, c.req.raw, form.data.current, form.data.next, clientIp(c));
  if (wrong) return render(c, (n) => <PasswordView nonce={n} mustChange={mustChange} errors={{ current: wrong }} />, 400);
  // The first change goes on to the accounts; a later one stays here and says so.
  return mustChange ? c.redirect('/admin?done=password', 303) : render(c, (n) => <PasswordView nonce={n} mustChange={false} ok={FLASH.password} />);
}
