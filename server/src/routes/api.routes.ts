// /api: JSON for the desktop app, any origin (no cookie: the key of the app, or nothing).
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTP } from '../config/messages.ts';
import * as license from '../controllers/license.controller.tsx';
import type { AppEnv } from '../types/app.ts';

export const api = new Hono<AppEnv>({ strict: false });

api.use(cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['Content-Type'] }));

api.get('/health', (c) => c.json({ ok: true, app: 'cllt-server' }));

// The app, by its key (README.md#key): no login, the key itself. Verify as it opens and every hour; sync the accounts
// that changed while the key works on the device.
api.post('/license/verify', license.verify);
api.all('/license/verify', (c) => c.json({ error: HTTP.onlyPost }, 405, { Allow: 'POST, OPTIONS' }));
api.post('/license/sync', license.sync);
api.all('/license/sync', (c) => c.json({ error: HTTP.onlyPost }, 405, { Allow: 'POST, OPTIONS' }));

