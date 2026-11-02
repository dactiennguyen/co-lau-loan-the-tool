// cllt-server: a Cloudflare Worker with a D1 database that keeps the accounts of CLLT Tool (README.md).
//   /api/*    JSON, with an API token (Authorization: Bearer cllt_…) made on the admin page.
//   /admin/*  the admin page: login admin / admin at first, which must be changed before anything else.
import { count, exported, parse, remove, rows, sync } from './accounts.ts';
import * as auth from './auth.ts';
import { accountsPage, loginPage, passwordPage, tokensPage } from './pages.ts';

export interface Env {
  DB: D1Database;
}

/** The largest body POST /api/accounts takes. */
const MAX_BODY = 1 << 20;

const SECURITY = {
  'X-Content-Type-Options': 'nosniff',
  // Not no-referrer: under it a browser posts the forms of these very pages with "Origin: null", which the Origin check
  // below refuses ("Sai nguồn gửi"). same-origin still sends nothing to other sites.
  'Referrer-Policy': 'same-origin',
  'Cache-Control': 'no-store',
};

function html(body: (nonce: string) => string, status = 200, headers: Record<string, string> = {}): Response {
  const nonce = auth.b64url(auth.random(16));
  return new Response(body(nonce), {
    status,
    headers: {
      ...SECURITY,
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'`,
      ...headers,
    },
  });
}

/** The API answers any origin: it takes no cookie, only a token. */
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

function json(value: unknown, status = 200, headers: Record<string, string> = {}): Response {
  const body = typeof value === 'string' ? value : JSON.stringify(value) + '\n';
  return new Response(body, { status, headers: { ...SECURITY, ...CORS, 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}

const redirect = (to: string, headers: Record<string, string> = {}) =>
  new Response(null, { status: 303, headers: { ...SECURITY, Location: to, ...headers } });

function sessionCookie(url: URL, value: string, maxAge: number): string {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${auth.COOKIE}=${value}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

/** The fixed lines a redirect may ask the accounts page to show (?done=…): never text from the URL itself. */
const DONE: Record<string, string> = {
  deleted: 'Đã xoá nick khỏi server.',
  password: 'Đã đổi mật khẩu.',
};

async function api(req: Request, url: URL, env: Env): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (url.pathname === '/api/health') return json({ ok: true, app: 'cllt-server' });
  if (url.pathname !== '/api/accounts') return json({ error: 'Không có API này' }, 404);
  const token = await auth.bearer(env.DB, req);
  if (!token) return json({ error: 'Thiếu hoặc sai API token (Authorization: Bearer …)' }, 401);
  if (req.method === 'GET') return json(await exported(env.DB));
  if (req.method !== 'POST') return json({ error: 'Chỉ có GET và POST' }, 405, { Allow: 'GET, POST, OPTIONS' });
  if (Number(req.headers.get('Content-Length') ?? 0) > MAX_BODY) return json({ error: 'JSON quá lớn (tối đa 1 MB)' }, 413);
  const body = await req.text();
  if (body.length > MAX_BODY) return json({ error: 'JSON quá lớn (tối đa 1 MB)' }, 413);
  const accounts = parse(body);
  if (!Array.isArray(accounts)) return json(accounts, 400);
  const done = await sync(env.DB, accounts, token.name);
  return json({ ...done, total: await count(env.DB) });
}

async function admin(req: Request, url: URL, env: Env): Promise<Response> {
  const db = env.DB;
  const path = url.pathname.replace(/\/+$/, '') || '/admin';
  const post = req.method === 'POST';
  // A form of another site cannot post here: SameSite=Strict keeps the cookie off it, and its Origin is refused.
  const origin = req.headers.get('Origin');
  if (post && origin && origin !== url.origin) return html(() => 'Sai nguồn gửi', 403);
  const form = post ? await req.formData().catch(() => null) : null;
  if (post && !form) return html(() => 'Cần gửi bằng form', 400);
  const field = (name: string) => String(form?.get(name) ?? '');

  if (path === '/admin/login') {
    if (!post) return (await auth.session(db, req)) ? redirect('/admin') : html((n) => loginPage(n));
    const ip = req.headers.get('CF-Connecting-IP') ?? 'local';
    const r = await auth.login(db, ip, field('username'), field('password'));
    if ('error' in r) return html((n) => loginPage(n, r.error), 401);
    return redirect('/admin', { 'Set-Cookie': sessionCookie(url, r.cookie, 7 * 24 * 3600) });
  }
  if (path === '/admin/logout' && post) {
    await auth.logout(db, req);
    return redirect('/admin/login', { 'Set-Cookie': sessionCookie(url, '', 0) });
  }
  const me = await auth.session(db, req);
  if (!me) return redirect('/admin/login');
  const mustChange = me.must_change === 1;
  if (path === '/admin/password') {
    if (!post) return html((n) => passwordPage(n, mustChange));
    const error = await auth.changePassword(db, req, field('current'), field('next'), field('confirm'));
    if (error) return html((n) => passwordPage(n, mustChange, error), 400);
    return mustChange ? redirect('/admin?done=password') : html((n) => passwordPage(n, false, null, DONE.password));
  }
  // With the default password nothing else opens: the accounts page shows every game password.
  if (mustChange) return redirect('/admin/password');

  if (path === '/admin' && !post) {
    const list = await rows(db);
    const key = url.searchParams.get('done') ?? '';
    const done = Object.hasOwn(DONE, key) ? DONE[key] : null;
    return html((n) => accountsPage(n, list, done));
  }
  if (path === '/admin/accounts.json' && !post) {
    const day = new Date().toISOString().slice(0, 10);
    return new Response(await exported(db), {
      headers: {
        ...SECURITY,
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="cllt-accounts-server-${day}.json"`,
      },
    });
  }
  const deleting = /^\/admin\/accounts\/(\d+)\/delete$/.exec(path);
  if (deleting && post) {
    await remove(db, Number(deleting[1]));
    return redirect('/admin?done=deleted');
  }
  if (path === '/admin/tokens') {
    if (!post) {
      const list = await auth.tokens(db);
      return html((n) => tokensPage(n, list));
    }
    const name = field('name').trim();
    if (!name || name.length > 60) {
      const list = await auth.tokens(db);
      return html((n) => tokensPage(n, list, null, 'Đặt tên token từ 1 tới 60 ký tự'), 400);
    }
    const token = await auth.createToken(db, name);
    const list = await auth.tokens(db);
    return html((n) => tokensPage(n, list, { name, token }));
  }
  const revoking = /^\/admin\/tokens\/(\d+)\/delete$/.exec(path);
  if (revoking && post) {
    await auth.deleteToken(db, Number(revoking[1]));
    return redirect('/admin/tokens');
  }
  return html(() => 'Không có trang này', 404);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    try {
      if (url.pathname === '/' || url.pathname === '') return redirect('/admin');
      if (url.pathname.startsWith('/api/')) return await api(req, url, env);
      if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) return await admin(req, url, env);
      return html(() => 'Không có trang này', 404);
    } catch (e) {
      console.error(e);
      const message = 'Lỗi server, xem log của Worker (npx wrangler tail)';
      return url.pathname.startsWith('/api/') ? json({ error: message }, 500) : html(() => message, 500);
    }
  },
} satisfies ExportedHandler<Env>;
