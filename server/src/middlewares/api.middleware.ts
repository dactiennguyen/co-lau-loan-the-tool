// The guard of /api/accounts: an API token made on the admin page. Its name goes to c.var.source.
import { createMiddleware } from 'hono/factory';
import { HTTP } from '../config/messages.ts';
import * as tokens from '../services/token.service.ts';
import type { AppEnv } from '../types/app.ts';

export const requireApiToken = createMiddleware<AppEnv>(async (c, next) => {
  const token = await tokens.fromBearer(c.var.db, c.req.raw);
  if (!token) return c.json({ error: HTTP.noToken }, 401);
  c.set('source', token.name);
  await next();
});
