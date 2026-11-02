// The guards of the admin page, in the order routes/admin.routes.ts puts them.
import { createMiddleware } from 'hono/factory';
import { HTTP } from '../config/messages.ts';
import * as auth from '../services/auth.service.ts';
import type { AppEnv } from '../types/app.ts';
import { render } from '../utils/render.ts';

/** A post must be a form of this very site: SameSite=Strict keeps the cookie off another site's form, and its Origin is
 * refused. The form is read once, as c.var.form. */
export const adminForm = createMiddleware<AppEnv>(async (c, next) => {
  if (c.req.method !== 'POST') return next();
  const origin = c.req.header('Origin');
  if (origin && origin !== new URL(c.req.url).origin) return render(c, () => HTTP.wrongOrigin, 403);
  const form = await c.req.formData().catch(() => null);
  if (!form) return render(c, () => HTTP.notAForm, 400);
  c.set('form', form);
  await next();
});

/** A live session, else the login page. The admin goes to c.var.me. */
export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  const me = await auth.session(c.var.db, c.req.raw);
  if (!me) return c.redirect('/admin/login', 303);
  c.set('me', me);
  await next();
});

/** With the default password nothing but Đổi mật khẩu opens: the accounts page shows every game password. */
export const requirePasswordChanged = createMiddleware<AppEnv>(async (c, next) =>
  c.var.me.mustChange === 1 ? c.redirect('/admin/password', 303) : next(),
);
