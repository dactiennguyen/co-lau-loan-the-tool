// The guard of /api/license/*: how many requests one IP may make, by the API_LIMIT binding of wrangler.toml (Cloudflare's
// rate limiting, counted at each location, so a loose limit). Every refusal of a key is a line of the Log page, so
// without it many requests could fill D1. A Worker without the binding (the tests, an old wrangler.toml) is not limited.
import { createMiddleware } from 'hono/factory';
import { API_LIMIT_PERIOD_S } from '../config/constants.ts';
import { HTTP } from '../config/messages.ts';
import type { AppEnv } from '../types/app.ts';
import { clientIp } from '../utils/http.ts';

export const apiLimit = createMiddleware<AppEnv>(async (c, next) => {
  const limiter = c.env.API_LIMIT;
  if (limiter && !(await limiter.limit({ key: clientIp(c) })).success) {
    return c.json({ error: HTTP.tooManyRequests }, 429, { 'Retry-After': String(API_LIMIT_PERIOD_S) });
  }
  await next();
});
