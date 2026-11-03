// /api: JSON for the desktop app, any origin (no cookie, only a token or nothing).
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTP } from '../config/messages.ts';
import * as account from '../controllers/account.controller.tsx';
import * as device from '../controllers/device.controller.tsx';
import { requireApiToken } from '../middlewares/api.middleware.ts';
import type { AppEnv } from '../types/app.ts';

export const api = new Hono<AppEnv>({ strict: false });

api.use(cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['Authorization', 'Content-Type'] }));

api.get('/health', (c) => c.json({ ok: true, app: 'cllt-server' }));

// The app on every device, as it opens and every 15 minutes: no token, but the device key its first hello brought
// (services/device.service.ts#hello).
api.post('/devices/hello', device.hello);
api.all('/devices/hello', (c) => c.json({ error: HTTP.onlyPost }, 405, { Allow: 'POST, OPTIONS' }));
// After an allowed hello: the accounts that changed on the device, by the id of a device that said hello.
api.post('/devices/sync', device.sync);
api.all('/devices/sync', (c) => c.json({ error: HTTP.onlyPost }, 405, { Allow: 'POST, OPTIONS' }));

api.use('/accounts', requireApiToken);
api.get('/accounts', account.exportJson);
api.post('/accounts', account.sync);
api.all('/accounts', (c) => c.json({ error: HTTP.onlyGetPost }, 405, { Allow: 'GET, POST, OPTIONS' }));
