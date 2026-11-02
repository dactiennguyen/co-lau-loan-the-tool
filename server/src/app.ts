// The Hono app: the context of every request, the two route groups, and what answers an unknown path or an error.
import { Hono } from 'hono';
import { HTTP } from './config/messages.ts';
import { context } from './middlewares/context.middleware.ts';
import { admin } from './routes/admin.routes.ts';
import { api } from './routes/api.routes.ts';
import type { AppEnv, Ctx } from './types/app.ts';
import { render } from './utils/render.ts';

const isApi = (c: Ctx) => c.req.path.startsWith('/api/');

export function createApp() {
  const app = new Hono<AppEnv>({ strict: false });
  app.use(context);
  app.get('/', (c) => c.redirect('/admin', 303));
  app.route('/api', api);
  app.route('/admin', admin);
  app.notFound((c) => (isApi(c) ? c.json({ error: HTTP.noApi }, 404) : render(c, () => HTTP.noPage, 404)));
  app.onError((e, c) => {
    console.error(e);
    return isApi(c) ? c.json({ error: HTTP.serverError }, 500) : render(c, () => HTTP.serverError, 500);
  });
  return app;
}
