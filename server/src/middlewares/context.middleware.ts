// Every request: the Drizzle client of D1 as c.var.db, and the security headers on whatever answers.
import { createMiddleware } from 'hono/factory';
import { SECURITY_HEADERS } from '../config/constants.ts';
import { database } from '../db/client.ts';
import type { AppEnv } from '../types/app.ts';

export const context = createMiddleware<AppEnv>(async (c, next) => {
  c.set('db', database(c.env.DB));
  await next();
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) c.res.headers.set(k, v);
});
