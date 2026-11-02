// The Worker end to end on an in-memory D1 (test/d1.ts): the admin page's login and Đổi mật khẩu, API tokens, and the
// accounts the API keeps, in the JSON of Xuất JSON of the desktop app.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { count, merge, sync, syncDevice } from '../src/services/account.service.ts';
import { database } from '../src/db/client.ts';
import worker from '../src/index.ts';
import { d1 } from './d1.ts';

const ORIGIN = 'https://cllt.example';

/** A browser of the admin page: it keeps the session cookie the Worker sets. */
function client() {
  const env = { DB: d1() };
  let cookie = '';
  const call = async (
    path: string,
    o: { form?: Record<string, string>; body?: string; token?: string; method?: string; origin?: string } = {},
  ) => {
    const headers = new Headers();
    if (cookie) headers.set('Cookie', `cllt_admin=${cookie}`);
    if (o.token) headers.set('Authorization', `Bearer ${o.token}`);
    let body: BodyInit | undefined = o.body;
    if (o.form) {
      body = new URLSearchParams(o.form);
      headers.set('Origin', o.origin ?? ORIGIN);
    }
    const method = o.method ?? (body === undefined ? 'GET' : 'POST');
    const res = await worker.fetch(new Request(ORIGIN + path, { method, headers, body }), env);
    const set = res.headers.get('Set-Cookie');
    if (set) cookie = /cllt_admin=([^;]*)/.exec(set)![1];
    return { res, status: res.status, location: res.headers.get('Location'), text: await res.text() };
  };
  return { env, call };
}

/** A client logged in with the password changed from admin to `password`. */
async function ready(password = 'mat-khau-moi') {
  const c = client();
  await c.call('/admin/login', { form: { username: 'admin', password: 'admin' } });
  const r = await c.call('/admin/password', { form: { current: 'admin', next: password, confirm: password } });
  assert.equal(r.location, '/admin?done=password');
  return c;
}

/** A token made on the admin page, read from the page that shows it once. */
async function token(c: Awaited<ReturnType<typeof ready>>, name = 'Máy nhà') {
  const r = await c.call('/admin/tokens', { form: { name } });
  assert.equal(r.status, 200);
  return /<code class="token">(cllt_[A-Za-z0-9_-]{43})<\/code>/.exec(r.text)![1];
}

test('admin / admin logs in, and nothing but Đổi mật khẩu opens until it is changed', async () => {
  const { env, call } = client();
  assert.equal((await call('/')).location, '/admin');
  assert.equal((await call('/admin')).location, '/admin/login');
  const wrong = await call('/admin/login', { form: { username: 'admin', password: 'sai' } });
  assert.equal(wrong.status, 401);
  assert.match(wrong.text, /Sai tên đăng nhập hoặc mật khẩu/);
  const ok = await call('/admin/login', { form: { username: 'admin', password: 'admin' } });
  assert.equal(ok.location, '/admin');
  assert.match(ok.res.headers.get('Set-Cookie')!, /HttpOnly; SameSite=Strict; Max-Age=604800; Secure/);
  for (const path of ['/admin', '/admin/tokens', '/admin/accounts.json']) {
    assert.equal((await call(path)).location, '/admin/password', path);
  }
  const page = await call('/admin/password');
  assert.match(page.text, /mật khẩu mặc định &quot;admin&quot;/);
  assert.match(page.res.headers.get('Content-Security-Policy')!, /script-src 'nonce-/);
  // The Material Web script loads with the nonce of the page's policy.
  const nonce = /script-src 'nonce-([^']+)'/.exec(page.res.headers.get('Content-Security-Policy')!)![1];
  assert.ok(page.text.includes(`<script type="module" nonce="${nonce}" src="/assets/admin.js">`));
  for (const [form, why] of [
    [{ current: 'sai', next: 'mat-khau-moi', confirm: 'mat-khau-moi' }, 'Mật khẩu hiện tại không đúng'],
    [{ current: 'admin', next: 'ngan', confirm: 'ngan' }, 'ít nhất 8 ký tự'],
    [{ current: 'admin', next: 'mat-khau-moi', confirm: 'mat-khau-khac' }, 'không khớp'],
  ] as const) {
    const r = await call('/admin/password', { form });
    assert.equal(r.status, 400);
    // Under the field it is about, in red (Zod's path of the issue).
    assert.match(r.text, new RegExp(`<md-outlined-text-field name="(current|next|confirm)"[^>]*error="true" error-text="[^"]*${why}`), why);
  }
  const changed = await call('/admin/password', { form: { current: 'admin', next: 'mat-khau-moi', confirm: 'mat-khau-moi' } });
  assert.equal(changed.location, '/admin?done=password');
  const home = await call('/admin?done=password');
  assert.match(home.text, /Đã đổi mật khẩu/);
  assert.match(home.text, /Chưa có nick nào/);
  const stored = await env.DB.prepare('SELECT password_hash, must_change FROM admins').first<{ password_hash: string; must_change: number }>();
  assert.match(stored!.password_hash, /^pbkdf2\$100000\$/);
  assert.equal(stored!.must_change, 0);
  // Logged out, the old password no longer opens it; the new one does, straight to the accounts.
  assert.equal((await call('/admin/logout', { form: {} })).location, '/admin/login');
  assert.equal((await call('/admin')).location, '/admin/login');
  assert.equal((await call('/admin/login', { form: { username: 'admin', password: 'admin' } })).status, 401);
  assert.equal((await call('/admin/login', { form: { username: 'admin', password: 'mat-khau-moi' } })).location, '/admin');
  assert.equal((await call('/admin')).status, 200);
  // Changed again later: said on the page, no redirect.
  const again = await call('/admin/password', { form: { current: 'mat-khau-moi', next: 'mat-khau-ba', confirm: 'mat-khau-ba' } });
  assert.equal(again.status, 200);
  assert.match(again.text, /Đã đổi mật khẩu/);
});

test('ten wrong passwords from one IP lock the login for 15 minutes, the right one too', async () => {
  const { call } = client();
  for (let i = 0; i < 10; i++) await call('/admin/login', { form: { username: 'admin', password: `sai${i}` } });
  const r = await call('/admin/login', { form: { username: 'admin', password: 'admin' } });
  assert.equal(r.status, 401);
  assert.match(r.text, /thử lại sau 15 phút/);
});

test('a done= the page does not know shows nothing, and a post that is not a form is refused', async () => {
  const c = await ready();
  const odd = await c.call('/admin?done=constructor');
  assert.equal(odd.status, 200);
  assert.ok(!odd.text.includes('native code') && !odd.text.includes('class="msg ok"'), odd.text);
  const r = await c.call('/admin/tokens', { body: '{"name": "x"}', method: 'POST' });
  assert.equal(r.status, 400);
});

/** A D1 on which `between` runs once, right after the first read of the accounts: as if another send wrote between this
 * send's read and its write. */
function racing(db: D1Database, between: () => void) {
  let done = false;
  return {
    ...db,
    prepare: (sql: string) => {
      const real = db.prepare(sql);
      if (done || !sql.startsWith('select "id", "server_id", "username_key", "data", "changed" from "accounts"')) return real;
      return {
        bind: (...args: unknown[]) => {
          const bound = real.bind(...args);
          return { ...bound, raw: async () => { const rows = await bound.raw(); if (!done) { done = true; between(); } return rows; } };
        },
        raw: async () => { const rows = await real.raw(); if (!done) { done = true; between(); } return rows; },
      };
    },
  } as unknown as D1Database;
}

test('an account another send added or changed between the read and the write is read again and merged, not lost', async () => {
  const db = d1();
  // Added meanwhile: this send's add finds it there, reads again, and replaces it, as a later send would.
  let pending: Promise<unknown> = Promise.resolve();
  const raced = racing(db, () => (pending = sync(database(db), [{ label: '', username: 'cung-luc', password: 'cu', serverId: 24 }], 'Máy nhà')));
  // Its batch waits for the other send, as two Workers at once might.
  const late = { ...raced, batch: async (list: D1PreparedStatement[]) => (await pending, db.batch(list)) } as unknown as D1Database;
  const done = await sync(database(late), [{ label: '', username: 'cung-luc', password: 'moi', serverId: 24 }], 'Máy công ty');
  assert.equal(await count(database(db)), 1);
  assert.equal(await db.prepare('SELECT password FROM accounts').first('password'), 'moi');
  assert.equal(done.updated, 1);

  // Changed meanwhile by another device: both devices' edits are kept, each in its field.
  const db2 = d1();
  const nick = { label: 'N', username: 'hai-may', password: 'p', serverId: 24, fight: { autoRepair: false } };
  await syncDevice(database(db2), [{ account: nick, changed: { label: 1, password: 1, fight: 1 } }], 'Máy A', 10);
  let between: Promise<unknown> = Promise.resolve();
  const raced2 = racing(db2, () => (between = syncDevice(database(db2), [{ account: { ...nick, password: 'p-moi' }, changed: { password: 5 } }], 'Máy A', 10)));
  // This send's batch waits for the other one, as before.
  const slow = { ...raced2, batch: async (list: D1PreparedStatement[]) => (await between, db2.batch(list)) } as unknown as D1Database;
  const b = await syncDevice(database(slow), [{ account: { ...nick, fight: { autoRepair: true } }, changed: { fight: 6 } }], 'Máy B', 10);
  assert.equal(b.updated, 1);
  const data = JSON.parse((await db2.prepare('SELECT data FROM accounts').first('data')) as string);
  assert.deepEqual([data.password, data.fight], ['p-moi', { autoRepair: true }]);
});

test('pages keep the Origin of their own forms: Referrer-Policy same-origin, not no-referrer', async () => {
  const { call } = client();
  const r = await call('/admin/login');
  assert.equal(r.res.headers.get('Referrer-Policy'), 'same-origin');
});

test('a form of another site is refused', async () => {
  const { call } = client();
  const r = await call('/admin/login', { form: { username: 'admin', password: 'admin' }, origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});

const manina = {
  label: 'Nick chính',
  username: 'manina',
  password: 'pw-manina',
  serverId: 24,
  stats: 'auto',
  fight: { repair: true, pickup: true, pickupOthers: true, pickupOwnElement: false },
  proxy: { enabled: true, kind: 'http', host: '10.0.0.1', port: 8080, username: 'bot', password: 'pw-proxy' },
};
const tiheo = { label: '<img src=x onerror=alert(1)>', username: 'Tiheo1', password: 'pw-tiheo' };

test('the API keeps the accounts of Xuất JSON with their passwords, and gives them back for Nhập JSON', async () => {
  const c = await ready();
  const t = await token(c);
  assert.equal((await c.call('/api/accounts')).status, 401);
  assert.equal((await c.call('/api/accounts', { token: 'cllt_sai' })).status, 401);
  assert.deepEqual(JSON.parse((await c.call('/api/health')).text), { ok: true, app: 'cllt-server' });

  const xuat = JSON.stringify({ app: 'CLLT Tool', format: 1, exportedAt: '2026-11-02T10:00:00+07:00', accounts: [manina, tiheo], settings: { record: true } });
  const sent = await c.call('/api/accounts', { body: xuat, token: t });
  assert.equal(sent.status, 200);
  assert.deepEqual(JSON.parse(sent.text), { added: 2, updated: 0, unchanged: 0, repeated: 0, total: 2 });
  const back = JSON.parse((await c.call('/api/accounts', { token: t })).text);
  assert.equal(back.app, 'CLLT Tool');
  assert.equal(back.format, 1);
  assert.deepEqual(back.accounts[0], manina);
  assert.deepEqual(back.accounts[1], { ...tiheo, serverId: 24 });

  // As Ghi đè of the app: empty label and passwords keep the old ones, so nothing changed; another username case is the
  // same account; one sent twice in a JSON counts once.
  const blank = { ...manina, username: 'MANINA', label: '', password: '', proxy: { ...manina.proxy, password: '' } };
  const r = await c.call('/api/accounts', { body: JSON.stringify([blank, { ...blank }]), token: t });
  assert.deepEqual(JSON.parse(r.text), { added: 0, updated: 1, unchanged: 0, repeated: 1, total: 2 });
  const kept = JSON.parse((await c.call('/api/accounts', { token: t })).text).accounts[0];
  assert.deepEqual(kept, { ...manina, username: 'MANINA' });
  const same = await c.call('/api/accounts', { body: JSON.stringify(blank), token: t });
  assert.deepEqual(JSON.parse(same.text), { added: 0, updated: 0, unchanged: 1, repeated: 0, total: 2 });

  for (const [body, why] of [
    ['', 'Chưa có JSON'],
    ['{', 'JSON không hợp lệ'],
    ['{"accounts": [], "format": 2}', 'bản app mới hơn'],
    ['[{"password": "x"}]', 'thiếu tài khoản'],
    ['{"x": 1}', 'Không thấy nick nào'],
  ]) {
    const bad = await c.call('/api/accounts', { body, token: t });
    assert.equal(bad.status, 400, body);
    assert.ok(JSON.parse(bad.text).error.includes(why), `${body}: ${bad.text}`);
  }

  // The admin page: every account with its password, the label escaped, the token that sent it.
  const home = await c.call('/admin');
  assert.match(home.text, /2 nick/);
  assert.ok(home.text.includes('data-secret="pw-manina"'));
  assert.ok(home.text.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(!home.text.includes('<img src=x'));
  assert.match(home.text, /10\.0\.0\.1:8080/);
  assert.match(home.text, /Máy nhà/);
  const file = await c.call('/admin/accounts.json');
  assert.match(file.res.headers.get('Content-Disposition')!, /attachment; filename="cllt-accounts-server-\d{4}-\d{2}-\d{2}\.json"/);
  assert.equal(JSON.parse(file.text).accounts.length, 2);

  // Xoá on the admin page; a token revoked opens nothing.
  const id = /action="\/admin\/accounts\/(\d+)\/delete"/.exec(home.text)![1];
  assert.equal((await c.call(`/admin/accounts/${id}/delete`, { form: {} })).location, '/admin?done=deleted');
  assert.equal(JSON.parse((await c.call('/api/accounts', { token: t })).text).accounts.length, 1);
  const tokens = await c.call('/admin/tokens');
  assert.match(tokens.text, /Máy nhà/);
  assert.ok(!tokens.text.includes(t), 'the token is shown once only');
  const tid = /action="\/admin\/tokens\/(\d+)\/delete"/.exec(tokens.text)![1];
  await c.call(`/admin/tokens/${tid}/delete`, { form: {} });
  assert.equal((await c.call('/api/accounts', { token: t })).status, 401);
});

const DEVICE = 'a'.repeat(64);
const hello = (call: ReturnType<typeof client>['call'], extra: Record<string, unknown> = {}) =>
  call('/api/devices/hello', {
    body: JSON.stringify({ id: DEVICE, hostname: 'MAY-NHA', os: 'windows x86_64', version: '1.1.2', accounts: [{ username: 'manina', serverId: 24 }], ...extra }),
  });

test('devices: a new one is allowed and listed with its accounts; blocked, it is refused with the reason until unblocked', async () => {
  const c = await ready();
  // No token: the app keeps no secret.
  const first = await hello(c.call);
  assert.equal(first.status, 200);
  assert.deepEqual(JSON.parse(first.text), { allowed: true });
  assert.equal((await c.call('/api/devices/hello')).status, 405);
  for (const body of ['{', '[]', '{"id": "abc"}', JSON.stringify({ id: 'A'.repeat(64) })]) {
    assert.equal((await c.call('/api/devices/hello', { body })).status, 400, body);
  }

  const list = await c.call('/admin/devices');
  assert.match(list.text, /1 thiết bị/);
  assert.match(list.text, /MAY-NHA/);
  assert.match(list.text, /<span class="mono">manina<\/span>/);
  assert.match(list.text, /Được dùng/);

  const blocked = await c.call(`/admin/devices/${DEVICE}/block`, { form: { reason: 'Hết hạn dùng thử' } });
  assert.equal(blocked.location, '/admin/devices?done=blocked');
  assert.deepEqual(JSON.parse((await hello(c.call)).text), { allowed: false, reason: 'Hết hạn dùng thử' });
  assert.match((await c.call('/admin/devices')).text, /1 bị chặn/);

  await c.call(`/admin/devices/${DEVICE}/rename`, { form: { label: 'Máy <anh A>' } });
  const named = await c.call('/admin/devices');
  assert.ok(named.text.includes('Máy &lt;anh A&gt;') && !named.text.includes('<anh A>'));

  await c.call(`/admin/devices/${DEVICE}/unblock`, { form: {} });
  assert.deepEqual(JSON.parse((await hello(c.call, { accounts: [] })).text), { allowed: true });

  // Forgotten, it comes back allowed at its next hello.
  assert.equal((await c.call(`/admin/devices/${DEVICE}/delete`, { form: {} })).location, '/admin/devices?done=forgotten');
  assert.match((await c.call('/admin/devices')).text, /Chưa có thiết bị nào/);
  assert.deepEqual(JSON.parse((await hello(c.call)).text), { allowed: true });
});

test('devices: the page and its actions need the admin, and a form of another site cannot block', async () => {
  const { call } = client();
  assert.equal((await call('/admin/devices')).location, '/admin/login');
  assert.equal((await call(`/admin/devices/${DEVICE}/block`, { form: { reason: 'x' } })).location, '/admin/login');
  const c = await ready();
  await hello(c.call);
  const r = await c.call(`/admin/devices/${DEVICE}/block`, { form: { reason: 'x' }, origin: 'https://evil.example' });
  assert.equal(r.status, 403);
  assert.deepEqual(JSON.parse((await hello(c.call)).text), { allowed: true });
});

// ---- Đồng bộ nick from devices (POST /api/devices/sync) ------------------------------------------------------------

const OTHER = 'b'.repeat(64);

/** POST /api/devices/sync of `id`: each account with the time each field changed (`at` for every field, or per field). */
function syncOf(call: ReturnType<typeof client>['call'], id: string, accounts: [Record<string, unknown>, Record<string, number> | number][], settings?: object) {
  const body = {
    id,
    settings,
    accounts: accounts.map(([account, at]) => ({
      account,
      changed: typeof at === 'number' ? Object.fromEntries(Object.keys(account).map((k) => [k, at])) : at,
    })),
  };
  return call('/api/devices/sync', { body: JSON.stringify(body) }).then((r) => ({ ...r, json: JSON.parse(r.text) }));
}

const kept = async (c: Awaited<ReturnType<typeof ready>>, t: string) =>
  (JSON.parse((await c.call('/api/accounts', { token: t })).text) as { accounts: Record<string, unknown>[] }).accounts;

test('merge: each field takes the later edit; an older one, an empty password or a clock ahead of the server does not win', () => {
  const now = 1_000;
  const old = { account: { label: 'A', username: 'Nick', password: 'p1', serverId: 24, proxy: { host: 'h' } }, changed: { label: 10, password: 20, proxy: 10 } };
  // Another device changed the password earlier and the label later: the label comes, the password stays.
  const a = merge(old, { label: 'B', username: 'nick', password: 'p0', serverId: 24, proxy: { host: 'h' } }, { label: 30, password: 15, proxy: 10 }, now);
  assert.deepEqual([a.account.label, a.account.password, a.account.username, a.kept], ['B', 'p1', 'Nick', true]);
  assert.deepEqual(a.changed, { label: 30, password: 20, proxy: 10 });
  // Proxy taken off later: it goes. An empty password never replaces one.
  const b = merge(old, { label: 'A', username: 'nick', password: '', serverId: 24 }, { proxy: 40, password: 40 }, now);
  assert.equal(b.account.proxy, undefined);
  assert.equal(b.account.password, 'p1');
  // A time past the server's clock counts as now, so it cannot hold a field for ever.
  assert.equal(merge(old, { ...old.account, label: 'C' }, { label: 9e15 }, now).changed.label, now);
  // The same account: nothing changes, nothing kept back.
  const same = merge(old, old.account, { label: 0, password: 0, proxy: 0 }, now);
  assert.deepEqual([same.account, same.changed, same.kept], [old.account, old.changed, false]);
});

test('devices sync: two devices with the same account make one row; each field keeps its later edit', async () => {
  const c = await ready();
  const t = await token(c);
  const nick = { label: 'Nick nhà', username: 'tiheo1', password: 'p1', serverId: 24, fight: { autoRepair: false } };

  // Unknown device: refused until it says hello. Wrong shapes: 400.
  assert.equal((await syncOf(c.call, DEVICE, [[nick, 0]])).status, 404);
  await hello(c.call);
  await hello(c.call, { id: OTHER, hostname: 'MAY-CTY' });
  // Said hello, but the admin has not let them sync: refused, with what the app logs.
  const waiting = await syncOf(c.call, DEVICE, [[nick, 0]]);
  assert.deepEqual([waiting.status, waiting.json.error], [403, 'Admin chưa cho máy này đồng bộ nick (Cho đồng bộ trên trang Thiết bị)']);
  assert.match((await c.call('/admin/devices')).text, /Chưa cho đồng bộ nick/);
  for (const id of [DEVICE, OTHER]) {
    assert.equal((await c.call(`/admin/devices/${id}/sync-on`, { form: {} })).location, '/admin/devices?done=syncOn');
  }
  for (const body of ['{', JSON.stringify({ id: DEVICE }), JSON.stringify({ id: DEVICE, accounts: [{ changed: {} }] })]) {
    assert.equal((await c.call('/api/devices/sync', { body })).status, 400, body);
  }
  assert.equal((await c.call('/api/devices/sync')).status, 405);

  // First sync of both devices, everything from before (time 0): the first one sent is kept, the second changes nothing.
  assert.deepEqual((await syncOf(c.call, DEVICE, [[nick, 0]], { record: true })).json, { added: 1, updated: 0, unchanged: 0, kept: 0, repeated: 0 });
  const other = { ...nick, username: 'TIHEO1', password: 'p-cu', fight: { autoRepair: true } };
  // kept counts among the unchanged and updated: an account whose differing fields the server has later.
  assert.deepEqual((await syncOf(c.call, OTHER, [[other, 0]])).json, { added: 0, updated: 0, unchanged: 1, kept: 1, repeated: 0 });
  assert.equal(await count(database(c.env.DB)), 1);
  assert.equal((await kept(c, t))[0].password, 'p1');

  // The office device turns Tự sửa đồ on, the home one changes the password later: both edits are kept.
  const now = Date.now();
  assert.equal((await syncOf(c.call, OTHER, [[other, { fight: now - 2000 }]])).json.updated, 1);
  assert.equal((await syncOf(c.call, DEVICE, [[{ ...nick, password: 'p2' }, { password: now - 1000 }]])).json.updated, 1);
  const [one] = await kept(c, t);
  assert.deepEqual([one.password, one.fight, one.username], ['p2', { autoRepair: true }, 'tiheo1']);
  // The office device, still with an old password, sends it again: the later edit stays.
  assert.equal((await syncOf(c.call, OTHER, [[other, { fight: now - 2000 }]])).json.kept, 1);
  assert.equal((await kept(c, t))[0].password, 'p2');

  // The page names the device it came from, and the device shows its sync.
  assert.match((await c.call('/admin')).text, /Máy MAY-NHA/);
  assert.match((await c.call('/admin/devices')).text, /Đồng bộ nick vừa xong/);
  // Turned off: refused again, the accounts it sent stay.
  await c.call(`/admin/devices/${OTHER}/sync-off`, { form: {} });
  assert.equal((await syncOf(c.call, OTHER, [[other, Date.now()]])).status, 403);
  assert.equal(await count(database(c.env.DB)), 1);
  await c.call(`/admin/devices/${OTHER}/sync-on`, { form: {} });

  // A token sends it later: its fields are stamped now, and an edit made on a device before that does not undo it.
  await c.call('/api/accounts', { token: t, body: JSON.stringify({ ...nick, password: 'p-token' }) });
  assert.equal((await syncOf(c.call, DEVICE, [[{ ...nick, password: 'p3' }, { password: now }]])).json.kept, 1);
  assert.equal((await kept(c, t))[0].password, 'p-token');

  // Blocked: refused, with what the app shows.
  await c.call(`/admin/devices/${DEVICE}/block`, { form: { reason: 'x' } });
  const refused = await syncOf(c.call, DEVICE, [[nick, Date.now()]]);
  assert.equal(refused.status, 403);
  assert.match(refused.json.error, /Thiết bị đã bị khoá/);
});

test('a send of many accounts is a few D1 queries, as the Workers Free plan takes 50 a request (a batch counts as one)', async () => {
  const db = d1();
  let queries = 0;
  const counted = {
    ...db,
    prepare: (sql: string) => (queries++, db.prepare(sql)),
    batch: (list: D1PreparedStatement[]) => ((queries -= list.length - 1), db.batch(list)),
  } as unknown as D1Database;
  const many = Array.from({ length: 120 }, (_, i) => ({ label: '', username: `nick${i}`, password: 'p', serverId: 24 }));
  await sync(database(counted), many, 'Máy nhà');
  assert.ok(queries <= 3, `${queries} queries for a token send`);
  queries = 0;
  const done = await syncDevice(database(counted), many.map((account) => ({ account: { ...account, password: 'q' }, changed: { password: 1 } })), 'Máy A', 2);
  assert.equal(done.updated, 0); // the token's stamps are later
  assert.ok(queries <= 3, `${queries} queries for a device send`);
  assert.equal(await count(database(db)), 120);
});
