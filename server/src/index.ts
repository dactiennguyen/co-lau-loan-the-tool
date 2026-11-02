// cllt-server: a Cloudflare Worker with a D1 database that keeps the accounts and the devices of CLLT Tool (README.md).
// Hono routes the requests, Drizzle (db.ts) reads and writes D1.
//   /api/*    JSON, with an API token (Authorization: Bearer cllt_…) made on the admin page; /api/devices/hello needs none.
//   /admin/*  the admin page: login admin / admin at first, which must be changed before anything else.
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { count, exported, parse, remove, rows, sync } from './accounts.ts';
import * as auth from './auth.ts';
import { database, type Db } from './db.ts';
import * as device from './devices.ts';
import { accountsPage, devicesPage, loginPage, passwordPage, tokensPage } from './pages.ts';

export interface Env {
  DB: D1Database;
}

type App = {
  Bindings: Env;
  Variables: {
    db: Db;
    /** The fields of an admin form (POST). */
    form: FormData;
    /** The admin of the session (admin pages after the login). */
    me: auth.Admin;
    /** The name of the API token of the request (/api/accounts). */
    source: string;
  };
};

/** The largest body POST /api/accounts takes. */
const MAX_BODY = 1 << 20;

const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  // Not no-referrer: under it a browser posts the forms of these very pages with "Origin: null", which the Origin check
  // below refuses ("Sai nguồn gửi"). same-origin still sends nothing to other sites.
  'Referrer-Policy': 'same-origin',
  'Cache-Control': 'no-store',
};

/** The fixed lines a redirect may ask a page to show (?done=…): never text from the URL itself. */
const DONE: Record<string, string> = {
  deleted: 'Đã xoá nick khỏi server.',
  password: 'Đã đổi mật khẩu.',
  blocked: 'Đã chặn thiết bị: app trên máy đó bị khoá ở lần báo tiếp theo (tối đa 15 phút).',
  unblocked: 'Đã bỏ chặn thiết bị.',
  renamed: 'Đã đặt tên thiết bị.',
  forgotten: 'Đã xoá thiết bị khỏi danh sách. Lần mở app tới nó sẽ hiện lại, vẫn được dùng; muốn ngăn thì Chặn.',
};

/** An HTML page with its own nonce in the Content-Security-Policy: the one inline script and style carry it. */
function html(c: Context<App>, body: (nonce: string) => string, status: 200 | 400 | 401 | 403 | 404 | 500 = 200) {
  const nonce = auth.b64url(auth.random(16));
  c.header(
    'Content-Security-Policy',
    `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
  );
  return c.html(body(nonce), status);
}

const ip = (c: Context<App>) => c.req.header('CF-Connecting-IP') ?? 'local';
const done = (c: Context<App>) => {
  const key = c.req.query('done') ?? '';
  return Object.hasOwn(DONE, key) ? DONE[key] : null;
};

function sessionCookie(c: Context<App>, value: string, maxAge: number): string {
  const secure = new URL(c.req.url).protocol === 'https:' ? '; Secure' : '';
  return `${auth.COOKIE}=${value}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

const app = new Hono<App>({ strict: false });

app.use(async (c, next) => {
  c.set('db', database(c.env.DB));
  await next();
  for (const [k, v] of Object.entries(SECURITY)) c.res.headers.set(k, v);
});

app.onError((e, c) => {
  console.error(e);
  const message = 'Lỗi server, xem log của Worker (yarn wrangler tail)';
  return c.req.path.startsWith('/api/') ? c.json({ error: message }, 500) : html(c, () => message, 500);
});

app.notFound((c) => (c.req.path.startsWith('/api/') ? c.json({ error: 'Không có API này' }, 404) : html(c, () => 'Không có trang này', 404)));

app.get('/', (c) => c.redirect('/admin', 303));

// ---- API ----------------------------------------------------------------------------------------------------------

/** The API answers any origin: it takes no cookie, only a token. */
app.use('/api/*', cors({ origin: '*', allowMethods: ['GET', 'POST', 'OPTIONS'], allowHeaders: ['Authorization', 'Content-Type'] }));

app.get('/api/health', (c) => c.json({ ok: true, app: 'cllt-server' }));

/** The body as text, or null past `max` bytes. */
async function body(c: Context<App>, max: number): Promise<string | null> {
  if (Number(c.req.header('Content-Length') ?? 0) > max) return null;
  const text = await c.req.text();
  return text.length > max ? null : text;
}

// The app on every device, as it opens and every 15 minutes: no token, as the app keeps no secret.
app.post('/api/devices/hello', async (c) => {
  const text = await body(c, device.MAX_HELLO);
  if (text === null) return c.json({ error: 'JSON quá lớn' }, 413);
  const h = device.parseHello(text);
  if ('error' in h) return c.json(h, 400);
  return c.json(await device.hello(c.var.db, h, ip(c)));
});
app.all('/api/devices/hello', (c) => c.json({ error: 'Chỉ có POST' }, 405, { Allow: 'POST, OPTIONS' }));

app.use('/api/accounts', async (c, next) => {
  const token = await auth.bearer(c.var.db, c.req.raw);
  if (!token) return c.json({ error: 'Thiếu hoặc sai API token (Authorization: Bearer …)' }, 401);
  c.set('source', token.name);
  await next();
});
app.get('/api/accounts', async (c) => c.body(await exported(c.var.db), 200, { 'Content-Type': 'application/json; charset=utf-8' }));
app.post('/api/accounts', async (c) => {
  const text = await body(c, MAX_BODY);
  if (text === null) return c.json({ error: 'JSON quá lớn (tối đa 1 MB)' }, 413);
  const accounts = parse(text);
  if (!Array.isArray(accounts)) return c.json(accounts, 400);
  const synced = await sync(c.var.db, accounts, c.var.source);
  return c.json({ ...synced, total: await count(c.var.db) });
});
app.all('/api/accounts', (c) => c.json({ error: 'Chỉ có GET và POST' }, 405, { Allow: 'GET, POST, OPTIONS' }));

// ---- Admin page ---------------------------------------------------------------------------------------------------

// A form of another site cannot post here: SameSite=Strict keeps the cookie off it, and its Origin is refused.
app.use('/admin/*', async (c, next) => {
  if (c.req.method !== 'POST') return next();
  const origin = c.req.header('Origin');
  if (origin && origin !== new URL(c.req.url).origin) return html(c, () => 'Sai nguồn gửi', 403);
  const form = await c.req.formData().catch(() => null);
  if (!form) return html(c, () => 'Cần gửi bằng form', 400);
  c.set('form', form);
  await next();
});
const field = (c: Context<App>, name: string) => String(c.var.form?.get(name) ?? '');

app.get('/admin/login', async (c) => ((await auth.session(c.var.db, c.req.raw)) ? c.redirect('/admin', 303) : html(c, (n) => loginPage(n))));
app.post('/admin/login', async (c) => {
  const r = await auth.login(c.var.db, ip(c), field(c, 'username'), field(c, 'password'));
  if ('error' in r) return html(c, (n) => loginPage(n, r.error), 401);
  c.header('Set-Cookie', sessionCookie(c, r.cookie, 7 * 24 * 3600));
  return c.redirect('/admin', 303);
});
app.post('/admin/logout', async (c) => {
  await auth.logout(c.var.db, c.req.raw);
  c.header('Set-Cookie', sessionCookie(c, '', 0));
  return c.redirect('/admin/login', 303);
});

// Every other admin page needs a login.
app.use('/admin/*', async (c, next) => {
  const me = await auth.session(c.var.db, c.req.raw);
  if (!me) return c.redirect('/admin/login', 303);
  c.set('me', me);
  await next();
});

app.get('/admin/password', (c) => html(c, (n) => passwordPage(n, c.var.me.mustChange === 1)));
app.post('/admin/password', async (c) => {
  const mustChange = c.var.me.mustChange === 1;
  const error = await auth.changePassword(c.var.db, c.req.raw, field(c, 'current'), field(c, 'next'), field(c, 'confirm'));
  if (error) return html(c, (n) => passwordPage(n, mustChange, error), 400);
  return mustChange ? c.redirect('/admin?done=password', 303) : html(c, (n) => passwordPage(n, false, null, DONE.password));
});

// With the default password nothing else opens: the accounts page shows every game password.
app.use('/admin/*', async (c, next) => (c.var.me.mustChange === 1 ? c.redirect('/admin/password', 303) : next()));

app.get('/admin', async (c) => {
  const list = await rows(c.var.db);
  return html(c, (n) => accountsPage(n, list, done(c)));
});
app.get('/admin/accounts.json', async (c) => {
  const day = new Date().toISOString().slice(0, 10);
  return c.body(await exported(c.var.db), 200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Disposition': `attachment; filename="cllt-accounts-server-${day}.json"`,
  });
});
app.post('/admin/accounts/:id{[0-9]+}/delete', async (c) => {
  await remove(c.var.db, Number(c.req.param('id')));
  return c.redirect('/admin?done=deleted', 303);
});

app.get('/admin/devices', async (c) => {
  const list = await device.devices(c.var.db);
  return html(c, (n) => devicesPage(n, list, done(c), Date.now()));
});
app.post('/admin/devices/:id{[0-9a-f]{64}}/:action{block|unblock|rename|delete}', async (c) => {
  const { id, action } = c.req.param();
  const db = c.var.db;
  if (action === 'block') await device.block(db, id, field(c, 'reason'));
  if (action === 'unblock') await device.unblock(db, id);
  if (action === 'rename') await device.rename(db, id, field(c, 'label'));
  if (action === 'delete') await device.forget(db, id);
  const said = { block: 'blocked', unblock: 'unblocked', rename: 'renamed', delete: 'forgotten' }[action];
  return c.redirect(`/admin/devices?done=${said}`, 303);
});

app.get('/admin/tokens', async (c) => {
  const list = await auth.listTokens(c.var.db);
  return html(c, (n) => tokensPage(n, list));
});
app.post('/admin/tokens', async (c) => {
  const db = c.var.db;
  const name = field(c, 'name').trim();
  if (!name || name.length > 60) {
    const list = await auth.listTokens(db);
    return html(c, (n) => tokensPage(n, list, null, 'Đặt tên token từ 1 tới 60 ký tự'), 400);
  }
  const token = await auth.createToken(db, name);
  const list = await auth.listTokens(db);
  return html(c, (n) => tokensPage(n, list, { name, token }));
});
app.post('/admin/tokens/:id{[0-9]+}/delete', async (c) => {
  await auth.deleteToken(c.var.db, Number(c.req.param('id')));
  return c.redirect('/admin/tokens', 303);
});

export default app;
