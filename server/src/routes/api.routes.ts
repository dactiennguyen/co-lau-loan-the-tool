// /api: JSON for the desktop app, any origin (no cookie, only a token or nothing).
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTP } from '../config/messages.ts';
import * as account from '../controllers/account.controller.tsx';
import * as license from '../controllers/license.controller.tsx';
import { requireApiToken } from '../middlewares/api.middleware.ts';
import type { AppEnv } from '../types/app.ts';

export const api = new Hono<AppEnv>({ strict: false });

api.use(cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['Authorization', 'Content-Type'] }));

api.get('/health', (c) => c.json({ ok: true, app: 'cllt-server' }));


// The app, by its key (README.md#key): no token, the key itself. Verify as it opens and every hour; sync the accounts
// that changed while the key works on the device.
api.post('/license/verify', license.verify);
api.all('/license/verify', (c) => c.json({ error: HTTP.onlyPost }, 405, { Allow: 'POST, OPTIONS' }));
api.post('/license/sync', license.sync);
api.all('/license/sync', (c) => c.json({ error: HTTP.onlyPost }, 405, { Allow: 'POST, OPTIONS' }));

api.use('/accounts', requireApiToken);
api.get('/accounts', account.exportJson);
api.post('/accounts', account.sync);
api.all('/accounts', (c) => c.json({ error: HTTP.onlyGetPost }, 405, { Allow: 'GET, POST, OPTIONS' }));
