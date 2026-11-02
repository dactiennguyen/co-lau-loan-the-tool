// /admin: the admin page. The order is the order of the guards: a post is checked to be a form of this site; the
// login opens without a session; Đổi mật khẩu needs one; everything else also needs the default password changed.
import { Hono } from 'hono';
import * as account from '../controllers/account.controller.tsx';
import * as auth from '../controllers/auth.controller.tsx';
import * as device from '../controllers/device.controller.tsx';
import * as token from '../controllers/token.controller.tsx';
import { adminForm, requireAdmin, requirePasswordChanged } from '../middlewares/admin.middleware.ts';
import type { AppEnv } from '../types/app.ts';

export const admin = new Hono<AppEnv>({ strict: false });

admin.use(adminForm);

admin.get('/login', auth.loginPage);
admin.post('/login', auth.login);
admin.post('/logout', auth.logout);

admin.use(requireAdmin);
admin.get('/password', auth.passwordPage);
admin.post('/password', auth.changePassword);

admin.use(requirePasswordChanged);
admin.get('/', account.page);
admin.get('/accounts.json', account.download);
admin.post('/accounts/:id{[0-9]+}/delete', account.remove);

admin.get('/devices', device.page);
admin.post('/devices/:id{[0-9a-f]{64}}/:action{block|unblock|rename|delete}', device.act);

admin.get('/tokens', token.page);
admin.post('/tokens', token.create);
admin.post('/tokens/:id{[0-9]+}/delete', token.remove);
