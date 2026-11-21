// The Worker end to end on an in-memory D1 (test/d1.ts): the admin page's login and Đổi mật khẩu, the keys of the app
// with the accounts they sync, and the Nick and Key pages.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { count, merge, syncLicense } from '../src/services/account.service.ts';
import { addDuration, create as createLicense, verify as verifyLicense } from '../src/services/license.service.ts';
import { database } from '../src/db/client.ts';
import worker from '../src/index.ts';
import { syncGap } from '../src/controllers/license.controller.tsx';
import { proxyLine } from '../src/views/accounts.view.tsx';
import { d1 } from './d1.ts';

const ORIGIN = 'https://cllt.example';

/** A browser of the admin page: it keeps the session cookie the Worker sets. */
type TestEnv = { DB: D1Database; ADMIN_PASSWORD?: string; API_LIMIT?: RateLimit; SYNC_GAP_SECONDS?: string };

function client(env: TestEnv = { DB: d1(), ADMIN_PASSWORD: 'admin', SYNC_GAP_SECONDS: '0' }) {
  let cookie = '';
  const call = async (
    path: string,
    o: { form?: Record<string, string>; body?: string; method?: string; origin?: string; ip?: string } = {},
  ) => {
    const headers = new Headers();
    if (cookie) headers.set('Cookie', `cllt_admin=${cookie}`);
    // As Cloudflare says it; none is 'local'.
    if (o.ip) headers.set('CF-Connecting-IP', o.ip);
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

test('admin with the ADMIN_PASSWORD secret logs in, and nothing but Đổi mật khẩu opens until it is changed', async () => {
  const { env, call } = client();
  assert.equal((await call('/')).location, '/admin');
  assert.equal((await call('/admin')).location, '/admin/login');
  const wrong = await call('/admin/login', { form: { username: 'admin', password: 'sai' } });
  assert.equal(wrong.status, 401);
  assert.match(wrong.text, /Sai tên đăng nhập hoặc mật khẩu/);
  const ok = await call('/admin/login', { form: { username: 'admin', password: 'admin' } });
  assert.equal(ok.location, '/admin');
  assert.match(ok.res.headers.get('Set-Cookie')!, /HttpOnly; SameSite=Strict; Max-Age=604800; Secure/);
  for (const path of ['/admin', '/admin/licenses', '/admin/accounts.json']) {
    assert.equal((await call(path)).location, '/admin/password', path);
  }
  const page = await call('/admin/password');
  assert.match(page.text, /mật khẩu đầu tiên \(secret ADMIN_PASSWORD\)/);
  assert.match(page.res.headers.get('Content-Security-Policy')!, /script-src 'nonce-/);
  // The script of the page loads with the nonce of the page's policy.
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
    // Under the field it is about, in red (Zod's path of the issue).
    assert.match(r.text, new RegExp(`name="(current|next|confirm)"[^>]*aria-invalid="true"[^>]*/?>(?:<span class="suffix">[^<]*</span>)?</span><span class="error"[^>]*>[^<]*${why}`), why);
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

test('without the ADMIN_PASSWORD secret no admin is made, so a fresh deploy is not open to whoever logs in first', async () => {
  const db = d1();
  const bare = client({ DB: db });
  for (const password of ['admin', '']) {
    const r = await bare.call('/admin/login', { form: { username: 'admin', password } });
    assert.equal(r.status, 401);
    assert.match(r.text, /Server chưa có mật khẩu quản trị: đặt secret ADMIN_PASSWORD/);
  }
  assert.equal(await db.prepare('SELECT COUNT(*) AS n FROM admins').first('n'), 0);
  assert.equal((await bare.call('/admin')).location, '/admin/login');
  // Once the admin is made, the secret is not read again: changing it does not reset the password.
  const first = client({ DB: db, ADMIN_PASSWORD: 'bi-mat-dau' });
  assert.equal((await first.call('/admin/login', { form: { username: 'admin', password: 'bi-mat-dau' } })).location, '/admin');
  const later = client({ DB: db, ADMIN_PASSWORD: 'bi-mat-khac' });
  assert.equal((await later.call('/admin/login', { form: { username: 'admin', password: 'bi-mat-khac' } })).status, 401);
  assert.equal((await client({ DB: db }).call('/admin/login', { form: { username: 'admin', password: 'bi-mat-dau' } })).location, '/admin');
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
  assert.ok(!odd.text.includes('native code') && !odd.text.includes('class="toast ok"'), odd.text);
  const r = await c.call('/admin/licenses', { body: '{"note": "x"}', method: 'POST' });
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
      if (done || !sql.startsWith('select "id", "server_id", "username_key", "data", "changed", "license_id", "removed_at" from "accounts"')) return real;
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
  // Added meanwhile: this send's add finds it there, reads again, and merges into it, its later edit winning.
  const one = { id: 1, maxAccounts: 100 };
  const nick1 = { label: '', username: 'cung-luc', password: 'cu', serverId: 24 };
  let pending: Promise<unknown> = Promise.resolve();
  const raced = racing(db, () => (pending = syncLicense(database(db), [{ account: nick1, changed: { password: 5 } }], one, 'Key A', 10)));
  // Its batch waits for the other send, as two Workers at once might.
  const late = { ...raced, batch: async (list: D1PreparedStatement[]) => (await pending, db.batch(list)) } as unknown as D1Database;
  const done = await syncLicense(database(late), [{ account: { ...nick1, password: 'moi' }, changed: { password: 6 } }], one, 'Key A', 10);
  assert.equal(await count(database(db)), 1);
  assert.equal(await db.prepare('SELECT password FROM accounts').first('password'), 'moi');
  assert.equal(done.updated, 1);

  // Changed meanwhile by another send of the same key: both sends' edits are kept, each in its field.
  const db2 = d1();
  const nick = { label: 'N', username: 'hai-may', password: 'p', serverId: 24, fight: { autoRepair: false } };
  const a = { id: 1, maxAccounts: 100 };
  await syncLicense(database(db2), [{ account: nick, changed: { label: 1, password: 1, fight: 1 } }], a, 'Key A', 10);
  let between: Promise<unknown> = Promise.resolve();
  const raced2 = racing(db2, () => (between = syncLicense(database(db2), [{ account: { ...nick, password: 'p-moi' }, changed: { password: 5 } }], a, 'Key A', 10)));
  // This send's batch waits for the other one, as before.
  const slow = { ...raced2, batch: async (list: D1PreparedStatement[]) => (await between, db2.batch(list)) } as unknown as D1Database;
  const b = await syncLicense(database(slow), [{ account: { ...nick, fight: { autoRepair: true } }, changed: { fight: 6 } }], a, 'Key A', 10);
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

/** The ids of two devices (SHA-256 of their machine id). */
const DEVICE = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

/** The accounts kept, from Tải JSON of the Nick page. */
const kept = async (c: Awaited<ReturnType<typeof ready>>) =>
  (JSON.parse((await c.call('/admin/accounts.json')).text) as { accounts: Record<string, unknown>[] }).accounts;

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

test('a send of many accounts is a few D1 queries, as the Workers Free plan takes 50 a request (a batch counts as one)', async () => {
  const db = d1();
  let queries = 0;
  const counted = {
    ...db,
    prepare: (sql: string) => (queries++, db.prepare(sql)),
    batch: (list: D1PreparedStatement[]) => ((queries -= list.length - 1), db.batch(list)),
  } as unknown as D1Database;
  const many = Array.from({ length: 120 }, (_, i) => ({ account: { label: '', username: `nick${i}`, password: 'p', serverId: 24 }, changed: { password: 5 } }));
  const key = { id: 1, maxAccounts: 1000 };
  assert.equal((await syncLicense(database(counted), many, key, 'Key A', 10)).added, 120);
  assert.ok(queries <= 3, `${queries} queries for a first send`);
  queries = 0;
  const done = await syncLicense(database(counted), many.map(({ account }) => ({ account: { ...account, password: 'q' }, changed: { password: 6 } })), key, 'Key A', 10);
  assert.equal(done.updated, 120);
  assert.ok(queries <= 3, `${queries} queries for a send of changes`);
  assert.equal(await count(database(db)), 120);
});

// ---- Key (POST /api/license/verify, the Key page) -----------------------------------------------------------------

const verify = (call: ReturnType<typeof client>['call'], key: string, extra: Record<string, unknown> = {}) =>
  call('/api/license/verify', {
    body: JSON.stringify({ key, id: DEVICE, hostname: 'MAY-NHA', os: 'windows x86_64', version: '1.1.8', accounts: 3, ...extra }),
  }).then((r) => ({ ...r, json: JSON.parse(r.text) }));

/** Tạo key on the Key page, read from the page it goes back to. */
async function newKey(c: Awaited<ReturnType<typeof ready>>, form: Record<string, string> = {}) {
  const r = await c.call('/admin/licenses', { form: { note: 'Anh A', maxAccounts: '100', mode: 'activation', duration: '10', unit: 'year', ...form } });
  assert.equal(r.status, 303, r.text);
  assert.match(r.location!, /^\/admin\/licenses\?created=\d+$/);
  const page = await c.call(r.location!);
  assert.match(page.text, /<dialog id="created" data-autoopen="1"/);
  return /<code data-made="true">(CLLT-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4})<\/code>/.exec(page.text)![1];
}

test('key: Số lượng makes up to 100 keys alike in one press, all shown to copy and download; more is refused', async () => {
  const c = await ready();
  assert.match((await c.call('/admin/licenses')).text, /name="count" type="number" value="1"/);
  const r = await c.call('/admin/licenses', {
    form: { note: 'Quán net', maxAccounts: '20', mode: 'fixed', date: '2099-12-31', count: '3' },
  });
  assert.equal(r.status, 303, r.text);
  assert.match(r.location!, /^\/admin\/licenses\?created=\d+,\d+,\d+$/);
  const page = (await c.call(r.location!)).text;
  assert.match(page, /Đã tạo 3 key/);
  const keys = [...page.matchAll(/<li><code>(CLLT-[0-9A-Z-]{19})<\/code>/g)].map((m) => m[1]);
  assert.equal(new Set(keys).size, 3);
  // The keys of Tải .txt, one a line (the newline written as &#10; in the attribute or as itself).
  const download = /data-download="([^"]*)"/.exec(page)![1].replace(/&#10;/g, '\n');
  assert.deepEqual(download.split('\n'), keys);
  const rows = await c.env.DB.prepare('SELECT note, max_accounts, mode FROM licenses').all<Record<string, unknown>>();
  assert.equal(rows.results.length, 3);
  for (const row of rows.results) assert.deepEqual([row.note, row.max_accounts, row.mode], ['Quán net', 20, 'fixed']);
  // One key keeps the large single view.
  const one = await c.call('/admin/licenses', { form: { maxAccounts: '5', mode: 'activation', duration: '7', unit: 'day' } });
  assert.match((await c.call(one.location!)).text, /<code data-made="true">CLLT-/);
  // 101 or 0: the dialog again, with the reason under Số lượng, nothing made.
  for (const count of ['101', '0']) {
    const bad = await c.call('/admin/licenses', { form: { maxAccounts: '5', mode: 'activation', duration: '7', unit: 'day', count } });
    assert.equal(bad.status, 400);
    assert.match(bad.text, /Số lượng là số nguyên từ 1 tới 100/);
  }
  assert.equal(await c.env.DB.prepare('SELECT COUNT(*) AS n FROM licenses').first('n'), 4);
  // The most at once.
  const most = await c.call('/admin/licenses', { form: { maxAccounts: '5', mode: 'activation', duration: '7', unit: 'day', count: '100' } });
  assert.equal(most.location!.split(',').length, 100);
  assert.equal(await c.env.DB.prepare('SELECT COUNT(*) AS n FROM licenses').first('n'), 104);
});

/** The id of the key in the actions of the Key page. */
async function keyId(c: Awaited<ReturnType<typeof ready>>, key: string) {
  const page = (await c.call('/admin/licenses')).text;
  const row = page.slice(page.indexOf(`data-find="${key.toLowerCase()}`));
  return /\/admin\/licenses\/(\d+)\/edit/.exec(row)![1];
}

test('key: Tạo key gives 100 accounts and 10 years from activation; the first device holds it, another is refused until Gỡ thiết bị', async () => {
  const c = await ready();
  const form = await c.call('/admin/licenses');
  assert.match(form.text, /name="maxAccounts" type="number" value="100"/);
  assert.match(form.text, /name="duration" type="number" value="10"/);
  assert.match(form.text, /<option value="year" selected="">năm<\/option>/);
  const key = await newKey(c);
  // Loading the page of the new key again (F5) makes no other key.
  const id = await keyId(c, key);
  for (let i = 0; i < 2; i++) assert.ok((await c.call(`/admin/licenses?created=${id}`)).text.includes(`<code data-made="true">${key}</code>`));
  // The plain page opens no dialog, and the dialog says what the key is.
  const plain = await c.call('/admin/licenses');
  assert.ok(!plain.text.includes('id="created"'));
  assert.match((await c.call(`/admin/licenses?created=${id}`)).text, /<dt>Hạn<\/dt><dd>10 năm sau khi kích hoạt<\/dd>/);
  assert.equal(await c.env.DB.prepare('SELECT COUNT(*) AS n FROM licenses').first('n'), 1);
  const row = await c.env.DB.prepare('SELECT * FROM licenses').first<Record<string, unknown>>();
  assert.deepEqual(
    [row!.max_accounts, row!.mode, row!.duration, row!.duration_unit, row!.expires_at, row!.device_id, row!.note],
    [100, 'activation', 10, 'year', null, null, 'Anh A'],
  );
  assert.match((await c.call('/admin/licenses')).text, /10 năm sau kích hoạt/);

  // No token; a key typed in lower case with spaces, or without CLLT and with O for 0, is the same key.
  const before = Date.now();
  const first = await verify(c.call, key.toLowerCase().replace(/-/g, ' '));
  assert.equal(first.status, 200);
  assert.equal(first.json.ok, true);
  assert.equal(first.json.maxAccounts, 100);
  assert.ok(first.json.activatedAt >= before && first.json.activatedAt <= Date.now());
  assert.equal(first.json.expiresAt, addDuration(first.json.activatedAt, 10, 'year'));
  const held = await c.env.DB.prepare('SELECT * FROM licenses').first<Record<string, unknown>>();
  assert.deepEqual(
    [held!.device_id, held!.hostname, held!.os, held!.version, held!.ip, held!.accounts],
    [DEVICE, 'MAY-NHA', 'windows x86_64', '1.1.8', 'local', 3],
  );
  // Again from it: the same end, what it says now noted.
  const again = await verify(c.call, key.slice(5).replace(/0/g, 'O'), { accounts: 7, version: '1.1.9' });
  assert.deepEqual(again.json, first.json);
  const page = await c.call('/admin/licenses');
  assert.match(page.text, /data-state="using"/);
  assert.match(page.text, /App báo 7 nick/);
  assert.match(page.text, /bản 1\.1\.9/);

  const taken = await verify(c.call, key, { id: OTHER, hostname: 'MAY-KHAC' });
  assert.deepEqual(taken.json, { ok: false, code: 'taken', error: 'Key đã được kích hoạt trên máy khác' });
  assert.ok(!(await c.call('/admin/licenses')).text.includes('MAY-KHAC'));

  // Gỡ thiết bị: the first device, whose app checks again within the hour, cannot take the key back while it is free;
  // another device takes it, with the end it had; the first is still refused.
  assert.equal((await c.call(`/admin/licenses/${id}/release`, { form: {} })).location, '/admin/licenses?done=released');
  const back = { ok: false, code: 'taken', error: 'Key đã được gỡ khỏi máy này, liên hệ admin' };
  assert.deepEqual((await verify(c.call, key)).json, back);
  assert.equal(await c.env.DB.prepare('SELECT device_id FROM licenses').first('device_id'), null);
  // Gỡ again while free: still the first device that is refused.
  await c.call(`/admin/licenses/${id}/release`, { form: {} });
  assert.deepEqual((await verify(c.call, key)).json, back);
  const moved = await verify(c.call, key, { id: OTHER, hostname: 'MAY-KHAC' });
  assert.equal(moved.json.ok, true);
  assert.equal(moved.json.expiresAt, first.json.expiresAt);
  assert.equal(await c.env.DB.prepare('SELECT released_device FROM licenses').first('released_device'), null);
  assert.deepEqual((await verify(c.call, key)).json, taken.json);
  assert.match((await c.call('/admin/licenses')).text, /MAY-KHAC/);
});

test('key: unknown, revoked with its reason, expired on its day, deleted; bad bodies are 400 and only POST is taken', async () => {
  const c = await ready();
  for (const typed of ['CLLT-0000-0000-0000-0000', 'abc', '']) {
    assert.deepEqual((await verify(c.call, typed)).json, { ok: false, code: 'unknown', error: 'Key không đúng' }, typed);
  }
  assert.equal((await c.call('/api/license/verify')).status, 405);
  for (const body of ['{', '[]', JSON.stringify({ key: 'x', id: 'abc' }), JSON.stringify({ key: 5, id: DEVICE })]) {
    assert.equal((await c.call('/api/license/verify', { body })).status, 400, body);
  }

  const key = await newKey(c, { note: 'Chị B', maxAccounts: '20', mode: 'fixed', date: '2099-12-31' });
  const ok = await verify(c.call, key);
  assert.deepEqual([ok.json.ok, ok.json.maxAccounts, ok.json.expiresAt], [true, 20, Date.UTC(2099, 11, 31, 17)]);
  const id = await keyId(c, key);

  await c.call(`/admin/licenses/${id}/revoke`, { form: { reason: 'Chưa trả tiền' } });
  assert.deepEqual((await verify(c.call, key)).json, { ok: false, code: 'revoked', error: 'Key đã bị khoá: Chưa trả tiền' });
  assert.match((await c.call('/admin/licenses')).text, /data-state="revoked"/);
  await c.call(`/admin/licenses/${id}/restore`, { form: {} });
  assert.equal((await verify(c.call, key)).json.ok, true);

  // Sửa to a past day: it has ended, and the device is still noted.
  const edited = await c.call(`/admin/licenses/${id}/edit`, { form: { note: 'Chị B', maxAccounts: '30', date: '2020-01-31' } });
  assert.equal(edited.location, '/admin/licenses?done=saved');
  const ended = await verify(c.call, key, { accounts: 9 });
  assert.deepEqual(ended.json, { ok: false, code: 'expired', error: 'Key đã hết hạn ngày 31/01/2020', expiresAt: Date.UTC(2020, 0, 31, 17) });
  const page = await c.call('/admin/licenses');
  assert.match(page.text, /data-state="expired"/);
  assert.match(page.text, /App báo 9 nick/);
  assert.match(page.text, /0<span class="faint">\/30/);

  assert.equal((await c.call(`/admin/licenses/${id}/delete`, { form: {} })).location, '/admin/licenses?done=removed');
  assert.equal((await verify(c.call, key)).json.code, 'unknown');
});

test('key: an activation key never activated takes a new duration; the forms say what is wrong under the field', async () => {
  const c = await ready();
  const key = await newKey(c, { duration: '30', unit: 'day' });
  const id = await keyId(c, key);
  await c.call(`/admin/licenses/${id}/edit`, { form: { note: '', maxAccounts: '5', duration: '2', unit: 'month' } });
  const ok = await verify(c.call, key);
  assert.equal(ok.json.maxAccounts, 5);
  assert.equal(ok.json.expiresAt, addDuration(ok.json.activatedAt, 2, 'month'));

  for (const [form, field, why] of [
    [{ maxAccounts: '0' }, 'maxAccounts', 'Số nick tối đa là số nguyên'],
    [{ duration: '0' }, 'duration', 'Thời hạn là số nguyên'],
    [{ duration: '101', unit: 'year' }, 'duration', 'tối đa 100 năm'],
    [{ mode: 'fixed', date: '' }, 'date', 'Chọn ngày hết hạn'],
    [{ mode: 'fixed', date: '2020-01-01' }, 'date', 'Ngày hết hạn phải từ hôm nay'],
  ] as const) {
    const r = await c.call('/admin/licenses', { form: { maxAccounts: '100', mode: 'activation', duration: '10', unit: 'year', ...form } });
    assert.equal(r.status, 400, why);
    assert.match(r.text, new RegExp(`name="${field}"[^>]*aria-invalid="true"[^>]*/?>(?:<span class="suffix">[^<]*</span>)?</span><span class="error"[^>]*>[^<]*${why}`), why);
    // The dialog opens again with what was wrong.
    assert.match(r.text, /<dialog id="create" class="wide" data-autoopen="1"/);
  }
  // The form of a key never activated sends a duration; the key is activated meanwhile: nothing saved, and said.
  const other = await newKey(c, { duration: '5', unit: 'day' });
  const otherId = await keyId(c, other);
  await verify(c.call, other, { id: OTHER });
  const late = await c.call(`/admin/licenses/${otherId}/edit`, { form: { note: 'Mới', maxAccounts: '7', duration: '1', unit: 'year' } });
  assert.equal(late.location, '/admin/licenses?error=activated');
  assert.match((await c.call(late.location!)).text, /class="toast error"[\s\S]*Chưa lưu gì: key vừa được kích hoạt/);
  const kept = await c.env.DB.prepare('SELECT note, max_accounts, duration FROM licenses WHERE id = ?').bind(Number(otherId)).first<Record<string, unknown>>();
  assert.deepEqual([kept!.note, kept!.max_accounts, kept!.duration], ['Anh A', 100, 5]);
  const gone = await c.call('/admin/licenses/999/edit', { form: { note: '', maxAccounts: '1', date: '2099-01-01' } });
  assert.equal(gone.location, '/admin/licenses?error=gone');
  const bad = await c.call(`/admin/licenses/${id}/edit`, { form: { maxAccounts: 'x' } });
  assert.equal(bad.status, 400);
  assert.match(bad.text, /class="toast error"[\s\S]*Số nick tối đa là số nguyên/);
  assert.equal(await c.env.DB.prepare('SELECT COUNT(*) AS n FROM licenses').first('n'), 2);
});

test('key: the page and its actions need the admin, and a form of another site cannot revoke', async () => {
  const { call } = client();
  assert.equal((await call('/admin/licenses')).location, '/admin/login');
  assert.equal((await call('/admin/licenses', { form: { maxAccounts: '1', mode: 'activation', duration: '1', unit: 'day' } })).location, '/admin/login');
  assert.equal((await call('/admin/licenses/1/revoke', { form: { reason: 'x' } })).location, '/admin/login');
  const c = await ready();
  const key = await newKey(c);
  const id = await keyId(c, key);
  const r = await c.call(`/admin/licenses/${id}/revoke`, { form: { reason: 'x' }, origin: 'https://evil.example' });
  assert.equal(r.status, 403);
  assert.equal((await verify(c.call, key)).json.ok, true);
});

test('key: a check is two D1 queries, the first one too (its log in the batch of its write); a refusal one more for its log', async () => {
  const db = d1();
  let queries = 0;
  // A batch is one query for D1, whatever it holds.
  const counted = {
    ...db,
    prepare: (sql: string) => (queries++, db.prepare(sql)),
    batch: (list: D1PreparedStatement[]) => ((queries -= list.length - 1), db.batch(list)),
  } as unknown as D1Database;
  const v = { key: await keyOf(db, await createLicense(database(db), '', 100, { mode: 'activation', duration: 1, unit: 'year' })), id: DEVICE, hostname: 'h', os: 'o', version: 'v', accounts: 1 };
  assert.equal((await verifyLicense(database(counted), v, 'local')).ok, true);
  assert.equal(queries, 2);
  queries = 0;
  assert.equal((await verifyLicense(database(counted), v, 'local')).ok, true);
  assert.equal(queries, 2);
  assert.equal(await db.prepare("SELECT COUNT(*) AS n FROM logs WHERE kind = 'key.activate'").first('n'), 1);
  // Refused: the read, and the log counted in one batch; a key that cannot be one is not even read.
  for (const [key, n] of [['CLLT-0000-0000-0000-0000', 2], ['abc', 1]] as const) {
    queries = 0;
    assert.equal((await verifyLicense(database(counted), { ...v, key }, 'local')).ok, false);
    assert.equal(queries, n, key);
  }
  queries = 0;
  assert.equal((await verifyLicense(database(counted), { ...v, id: OTHER }, 'local')).ok, false);
  assert.equal(queries, 2);
});

const keyOf = async (db: D1Database, id: number) => (await db.prepare('SELECT key FROM licenses WHERE id = ?').bind(id).first('key')) as string;

/** A D1 on which `between` runs once, right after the first read of a key: as if the admin acted between a check's read
 * and its write. */
function racingKey(db: D1Database, between: () => Promise<unknown>) {
  let done = false;
  return {
    ...db,
    prepare: (sql: string) => {
      const real = db.prepare(sql);
      if (done || !sql.startsWith('select') || !sql.includes('from "licenses"')) return real;
      return {
        bind: (...args: unknown[]) => {
          const bound = real.bind(...args);
          const after = async <T>(rows: T) => (done ? rows : ((done = true), await between(), rows));
          return { ...bound, raw: async () => after(await bound.raw()) };
        },
      };
    },
  } as unknown as D1Database;
}

test('key: a device whose key is revoked or freed between the read and the write of its check gets no ok; a key already ended is not taken', async () => {
  for (const [act, code] of [
    ['UPDATE licenses SET revoked = 1', 'revoked'],
    ['UPDATE licenses SET released_device = device_id, device_id = NULL', 'taken'],
    ["UPDATE licenses SET device_id = '" + 'e'.repeat(64) + "'", 'taken'],
  ] as const) {
    const db = d1();
    const v = { key: await keyOf(db, await createLicense(database(db), '', 100, { mode: 'activation', duration: 1, unit: 'year' })), id: DEVICE, hostname: 'h', os: 'o', version: 'v', accounts: 1 };
    assert.equal((await verifyLicense(database(db), v, 'local')).ok, true);
    const stale = racingKey(db, () => db.prepare(act).run());
    const answer = await verifyLicense(database(stale), v, 'local');
    assert.deepEqual([answer.ok, !answer.ok && answer.code], [false, code], act);
  }
  // Ended before any device took it: answered expired, and still free.
  const db = d1();
  const id = await createLicense(database(db), '', 100, { mode: 'fixed', expiresAt: Date.now() - 1000 });
  const v = { key: await keyOf(db, id), id: DEVICE, hostname: 'h', os: 'o', version: 'v', accounts: 1 };
  const answer = await verifyLicense(database(db), v, 'local');
  assert.equal(!answer.ok && answer.code, 'expired');
  assert.equal(await db.prepare('SELECT device_id FROM licenses').first('device_id'), null);
});

// ---- Đồng bộ nick by key (POST /api/license/sync) ---------------------------------------------------------------

/** POST /api/license/sync of the app of `key` on device `id`: each account with the time each field changed (`at` for
 * every field, or per field). */
function syncOf(
  call: ReturnType<typeof client>['call'],
  key: string,
  id: string,
  accounts: [Record<string, unknown>, Record<string, number> | number][],
  settings?: object,
) {
  const body = {
    key,
    id,
    settings,
    accounts: accounts.map(([account, at]) => ({
      account,
      changed: typeof at === 'number' ? Object.fromEntries(Object.keys(account).map((k) => [k, at])) : at,
    })),
  };
  return call('/api/license/sync', { body: JSON.stringify(body) }).then((r) => ({ ...r, json: JSON.parse(r.text) }));
}

test('key sync: a key never writes nor takes an account another key holds; its own merge field by field; one no key holds is taken', async () => {
  const c = await ready();
  const home = await newKey(c, { note: 'Nhà' });
  const office = await newKey(c, { note: '' });
  await verify(c.call, home);
  await verify(c.call, office, { id: OTHER, hostname: 'MAY-CTY' });
  const nick = { label: 'Nick nhà', username: 'tiheo1', password: 'p1', serverId: 24, fight: { autoRepair: false } };

  for (const body of ['{', JSON.stringify({ key: home, id: DEVICE }), JSON.stringify({ key: home, id: DEVICE, accounts: [{ changed: {} }] })]) {
    assert.equal((await c.call('/api/license/sync', { body })).status, 400, body);
  }
  assert.equal((await c.call('/api/license/sync')).status, 405);

  const first = await syncOf(c.call, home, DEVICE, [[nick, 0]], { record: true });
  assert.deepEqual(first.json, { added: 1, updated: 0, unchanged: 0, kept: 0, repeated: 0, refused: 0, taken: 0, logged: 0 });
  const row = await c.env.DB.prepare('SELECT license_id, source FROM accounts').first<{ license_id: number; source: string }>();
  assert.equal(row!.source, 'Key Nhà');

  // The office key sends the same account (any case), later: not written, still the home key's.
  const other = { ...nick, username: 'TIHEO1', password: 'p-ke-khac', fight: { autoRepair: true } };
  const refused = await syncOf(c.call, office, OTHER, [[other, Date.now()]]);
  assert.deepEqual(refused.json, { added: 0, updated: 0, unchanged: 0, kept: 0, repeated: 0, refused: 1, taken: 1, logged: 0 });
  assert.deepEqual((await kept(c)).map((x) => [x.password, x.fight]), [['p1', { autoRepair: false }]]);
  assert.equal(await c.env.DB.prepare('SELECT license_id FROM accounts').first('license_id'), row!.license_id);

  // Its own edits merge field by field: the later one wins, an older one is kept out.
  const now = Date.now();
  assert.equal((await syncOf(c.call, home, DEVICE, [[{ ...nick, password: 'p2' }, { password: now - 1000 }]])).json.updated, 1);
  assert.equal((await syncOf(c.call, home, DEVICE, [[{ ...nick, password: 'p-cu' }, { password: now - 2000 }]])).json.kept, 1);
  assert.equal((await kept(c))[0].password, 'p2');

  // The Nick page names the key it came from and filters on it; the Key page counts it and keeps the Cài đặt.
  const homeId = await keyId(c, home);
  const nicks = await c.call('/admin');
  assert.match(nicks.text, new RegExp(`<a class="tag" href="/admin\\?key=${homeId}"[^>]*>[\\s\\S]*?Nhà</a>`));
  assert.match((await c.call(`/admin?key=${homeId}`)).text, /Nick của key Nhà<\/div><div class="num">1</);
  const officeId = await keyId(c, office);
  assert.match((await c.call(`/admin?key=${officeId}`)).text, /Key này chưa đồng bộ nick nào/);
  const keys = await c.call('/admin/licenses');
  assert.match(keys.text, new RegExp(`<a class="meter" href="/admin\\?key=${homeId}"[^>]*><span class="n">1<span class="faint">/100</span>`));
  assert.match(keys.text, /Cài đặt: \{&quot;record&quot;:true\}/);

  // Deleted, the key goes and its account stays, held by no key: then the office key may take it, and merges into it.
  await c.call(`/admin/licenses/${homeId}/delete`, { form: {} });
  assert.equal(await c.env.DB.prepare('SELECT license_id FROM accounts').first('license_id'), null);
  const claimed = await syncOf(c.call, office, OTHER, [[other, { fight: Date.now() }]]);
  assert.deepEqual([claimed.json.updated, claimed.json.refused, claimed.json.taken], [1, 0, 0]);
  assert.deepEqual((await kept(c)).map((x) => [x.password, x.fight]), [['p2', { autoRepair: true }]]);
  assert.equal(await c.env.DB.prepare('SELECT source FROM accounts').first('source'), `Key ${office.slice(0, 9)}`);
});

test('key sync: the info of its characters goes on the Nick page, never an older one nor on an account of another key; the proxy shows whole, to copy as one line', async () => {
  const c = await ready();
  const home = await newKey(c, { note: 'Nhà' });
  const office = await newKey(c, { note: '' });
  await verify(c.call, home);
  await verify(c.call, office, { id: OTHER, hostname: 'MAY-CTY' });
  const proxy = { enabled: true, kind: 'http', host: '1.2.3.4', port: 8080, username: 'u', password: 'p:w' };
  const nick = { label: '', username: 'tiheo1', password: 'p1', serverId: 24, proxy };
  const now = Date.now();
  const seen = { username: 'TIHEO1', serverId: 24, at: now, name: 'Tiheo1', level: 90, levelPart: 0.5, map: 'Tiên Cốc', zone: 0, xu: 6500, luong: 3, online: true };
  const send = (key: string, id: string, accounts: object[], info: object[]) =>
    c.call('/api/license/sync', { body: JSON.stringify({ key, id, accounts, info }) });
  assert.equal((await send(home, DEVICE, [{ account: nick, changed: {} }], [seen, { username: 'x', bad: true }])).status, 200);

  const page = (await c.call('/admin')).text;
  assert.match(page, /Tiheo1<\/span><span class="tag">LV 90<\/span><span class="small muted">50%/);
  assert.match(page, /Tiên Cốc · Khu 0/);
  assert.match(page, /6\.500 Xu · 3 Lượng/);
  assert.match(page, /đang trong game/);
  assert.match(page, /data-secret="1\.2\.3\.4:8080:u:p:w" data-hidden="1\.2\.3\.4:8080:u:••••"/);
  assert.match(page, /data-copy="1\.2\.3\.4:8080:u:p:w"/);

  // An older info is left; the office key cannot write the info of an account the home key holds.
  await send(home, DEVICE, [], [{ ...seen, at: now - 60_000, level: 89 }]);
  await send(office, OTHER, [], [{ ...seen, at: now + 60_000, name: 'Ke khac' }]);
  const info = JSON.parse((await c.env.DB.prepare('SELECT info FROM accounts').first<string>('info'))!);
  assert.deepEqual([info.level, info.name, info.at], [90, 'Tiheo1', now]);

  assert.equal(proxyLine({ kind: 'socks5', host: 'h.vn', port: 1080, username: 'u', password: 'p' }), 'socks5://u:p@h.vn:1080');
  assert.equal(proxyLine({ kind: 'http', host: 'h.vn', port: 3128 }), 'h.vn:3128');
  assert.equal(proxyLine({ kind: 'http', host: '::1', port: 3128, username: 'u' }), 'http://u@[::1]:3128');
});

test('key sync: refused with its code for an unknown key, another device, a key revoked, ended or never activated; devices are gone', async () => {
  const c = await ready();
  const nick = { label: '', username: 'manina', password: 'p', serverId: 24 };
  const refused = async (key: string, id: string, code: string) => {
    const r = await syncOf(c.call, key, id, [[nick, 0]]);
    assert.deepEqual([r.status, r.json.code], [403, code], code);
    assert.ok(r.json.error, code);
  };
  const key = await newKey(c);
  await refused('CLLT-0000-0000-0000-0000', DEVICE, 'unknown');
  await refused(key, DEVICE, 'inactive');
  await verify(c.call, key);
  await refused(key, OTHER, 'taken');
  const id = await keyId(c, key);
  await c.call(`/admin/licenses/${id}/revoke`, { form: { reason: 'Chưa trả tiền' } });
  await refused(key, DEVICE, 'revoked');
  await c.call(`/admin/licenses/${id}/restore`, { form: {} });
  await c.call(`/admin/licenses/${id}/edit`, { form: { note: '', maxAccounts: '100', date: '2020-01-31' } });
  await refused(key, DEVICE, 'expired');
  assert.equal(await count(database(c.env.DB)), 0);
  // The key as typed works, as for verify.
  await c.call(`/admin/licenses/${id}/edit`, { form: { note: '', maxAccounts: '100', date: '2099-01-01' } });
  assert.equal((await syncOf(c.call, key.toLowerCase().replace(/-/g, ' '), DEVICE, [[nick, 0]])).json.added, 1);

  // The devices of before are gone, their page and API too.
  for (const path of ['/api/devices/hello', '/api/devices/sync']) {
    assert.equal((await c.call(path, { body: JSON.stringify({ id: DEVICE }) })).status, 404, path);
  }
  assert.equal((await c.call('/admin/devices')).status, 404);
  assert.ok(!(await c.call('/admin')).text.includes('/admin/devices'));
});

test('key sync: new accounts stop at the key\'s max; those it holds still sync; the rest are counted as refused', async () => {
  const c = await ready();
  const key = await newKey(c, { maxAccounts: '2' });
  await verify(c.call, key);
  const a = (n: number, password = 'p') => ({ label: '', username: `nick${n}`, password, serverId: 24 });
  // An account no key holds (its key deleted) is not the key's: taking it counts.
  const gone = await newKey(c);
  await verify(c.call, gone, { id: OTHER });
  await syncOf(c.call, gone, OTHER, [[a(9), 1]]);
  await c.call(`/admin/licenses/${await keyId(c, gone)}/delete`, { form: {} });

  const first = await syncOf(c.call, key, DEVICE, [[a(1), 1], [a(2), 1], [a(3), 1]]);
  assert.deepEqual([first.json.added, first.json.refused], [2, 1]);
  assert.equal(await count(database(c.env.DB)), 3);
  // Full: an update of its own goes, another account (a token's) does not.
  const later = Date.now();
  const second = await syncOf(c.call, key, DEVICE, [[a(1, 'p-moi'), later], [a(9, 'x'), later], [a(4), later]]);
  assert.deepEqual([second.json.updated, second.json.refused, second.json.taken], [1, 2, 0]);
  const all = await kept(c);
  assert.deepEqual(all.map((x) => [x.username, x.password]), [['nick9', 'p'], ['nick1', 'p-moi'], ['nick2', 'p']]);
  const ids = await c.env.DB.prepare('SELECT username, license_id FROM accounts ORDER BY id').all<{ username: string; license_id: number | null }>();
  assert.deepEqual(ids.results.map((r) => [r.username, r.license_id === null]), [['nick9', true], ['nick1', false], ['nick2', false]]);

  // More allowed on the Key page: the rest come in.
  await c.call(`/admin/licenses/${await keyId(c, key)}/edit`, { form: { note: '', maxAccounts: '10', date: '2099-01-01' } });
  const third = await syncOf(c.call, key, DEVICE, [[a(3), 1], [a(9, 'x'), Date.now()]]);
  assert.deepEqual([third.json.added, third.json.updated, third.json.refused], [1, 1, 0]);
});

test('API tokens are gone: their page, /api/accounts and the nav item; Tải JSON and the Nick page show what keys synced', async () => {
  const c = await ready();
  for (const [path, method] of [['/admin/tokens', 'GET'], ['/api/accounts', 'GET'], ['/api/accounts', 'POST']] as const) {
    assert.equal((await c.call(path, { method })).status, 404, `${method} ${path}`);
  }
  assert.ok(!(await c.call('/admin')).text.includes('API token'));
  assert.deepEqual(JSON.parse((await c.call('/api/health')).text), { ok: true, app: 'cllt-server' });

  const home = await c.call('/admin');
  assert.match(home.text, /Chưa có nick nào/);
  const key = await newKey(c, { note: 'Nhà' });
  await verify(c.call, key);
  const nick = {
    label: '<img src=x onerror=alert(1)>',
    username: 'manina',
    password: 'pw-manina',
    serverId: 24,
    proxy: { enabled: true, kind: 'http', host: '10.0.0.1', port: 8080, username: 'bot', password: 'pw-proxy' },
  };
  await syncOf(c.call, key, DEVICE, [[nick, 0], [{ label: 'Phụ', username: 'tiheo1', password: '', serverId: 25 }, 0]]);

  // Every account with its password, the label escaped, its server, proxy and key.
  const page = await c.call('/admin');
  assert.match(page.text, /Tổng nick<\/div><div class="num">2</);
  assert.ok(page.text.includes('data-secret="pw-manina"'));
  assert.ok(page.text.includes('&lt;img src=x onerror=alert(1)&gt;') && !page.text.includes('<img src=x'));
  assert.match(page.text, /10\.0\.0\.1:8080/);
  assert.match(page.text, />S25</);
  assert.match(page.text, /\(trống\)/);

  // Tải JSON: Xuất JSON of the app, passwords included.
  const file = await c.call('/admin/accounts.json');
  assert.match(file.res.headers.get('Content-Disposition')!, /attachment; filename="cllt-accounts-server-\d{4}-\d{2}-\d{2}\.json"/);
  const back = JSON.parse(file.text);
  assert.deepEqual([back.app, back.format, back.accounts[0]], ['CLLT Tool', 1, nick]);

  // Xoá: its dialog posts to the account's delete.
  const id = /&quot;action&quot;:&quot;\/admin\/accounts\/(\d+)\/delete&quot;/.exec(page.text)![1];
  assert.equal((await c.call(`/admin/accounts/${id}/delete`, { form: {} })).location, '/admin?done=deleted');
  assert.equal((await kept(c)).length, 1);
});

// ---- Log (the Log page, services/log.service.ts) ------------------------------------------------------------------

type LogRow = {
  kind: string;
  level: string;
  license_id: number | null;
  actor: string;
  ip: string;
  device_id: string;
  hostname: string;
  username: string;
  server_id: number | null;
  message: string;
  detail: string | null;
  count: number;
  at: number;
  last_at: number;
};

/** Every log row of a kind (all with none), first written first. */
const logsOf = async (db: D1Database, kind?: string) =>
  (await db.prepare(`SELECT * FROM logs ${kind ? 'WHERE kind = ?' : ''} ORDER BY id`).bind(...(kind ? [kind] : [])).all<LogRow>()).results;

/** POST /api/license/verify from the IP `ip`. */
const verifyFrom = (call: ReturnType<typeof client>['call'], key: string, ip: string, extra: Record<string, unknown> = {}) =>
  call('/api/license/verify', {
    body: JSON.stringify({ key, id: DEVICE, hostname: 'MAY-NHA', os: 'windows x86_64', version: '1.1.8', accounts: 3, ...extra }),
    ip,
  }).then((r) => JSON.parse(r.text));

test('log: a refusal of verify is logged with its IP, device and the key as typed; one IP and code within 10 minutes is one row, danger from 10', async () => {
  const c = await ready();
  for (let i = 0; i < 3; i++) assert.equal((await verifyFrom(c.call, `CLLT-0000-0000-0000-000${i}`, '1.2.3.4')).code, 'unknown');
  let [row, ...rest] = await logsOf(c.env.DB, 'key.unknown');
  assert.equal(rest.length, 0);
  assert.deepEqual(
    [row!.count, row!.level, row!.actor, row!.ip, row!.device_id, row!.hostname, row!.license_id],
    [3, 'warn', 'ip', '1.2.3.4', DEVICE, 'MAY-NHA', null],
  );
  assert.equal(row!.message, 'Nhập key sai "CLLT-0000-0000-0000-0000" trên máy MAY-NHA');
  assert.deepEqual(JSON.parse(row!.detail!), { key: 'CLLT-0000-0000-0000-0000', code: 'unknown', os: 'windows x86_64', version: '1.1.8' });
  assert.ok(row!.last_at >= row!.at);
  // Another IP is another row; the key as typed is kept to 40 characters.
  await verifyFrom(c.call, 'x'.repeat(60), '5.6.7.8');
  const other = (await logsOf(c.env.DB, 'key.unknown'))[1]!;
  assert.deepEqual([other.ip, other.count, JSON.parse(other.detail!).key], ['5.6.7.8', 1, 'x'.repeat(40)]);
  // The tenth within the window: danger, and said so.
  for (let i = 0; i < 7; i++) await verifyFrom(c.call, 'CLLT-0000-0000-0000-0000', '1.2.3.4');
  [row] = await logsOf(c.env.DB, 'key.unknown');
  assert.deepEqual([row!.count, row!.level, row!.message], [10, 'danger', 'IP 1.2.3.4 nhập key sai 10 lần trong 10 phút']);
  await verifyFrom(c.call, 'CLLT-0000-0000-0000-0000', '1.2.3.4');
  assert.equal((await logsOf(c.env.DB, 'key.unknown'))[0]!.message, 'IP 1.2.3.4 nhập key sai 11 lần trong 10 phút');
  // Past the window, a new row.
  await c.env.DB.prepare('UPDATE logs SET at = at - 11 * 60000').run();
  await verifyFrom(c.call, 'CLLT-0000-0000-0000-0000', '1.2.3.4');
  const rows = await logsOf(c.env.DB, 'key.unknown');
  assert.deepEqual(
    rows.map((r) => [r.ip, r.count, r.level]),
    [
      ['1.2.3.4', 11, 'danger'],
      ['5.6.7.8', 1, 'warn'],
      ['1.2.3.4', 1, 'warn'],
    ],
  );
});

test('log: an activation is logged once, a check that works never; refusals of a known key name it, by why', async () => {
  const c = await ready();
  const key = await newKey(c, { note: 'Anh A' });
  const id = Number(await keyId(c, key));
  for (let i = 0; i < 3; i++) assert.equal((await verifyFrom(c.call, key, '1.2.3.4')).ok, true);
  const [activation, ...more] = await logsOf(c.env.DB, 'key.activate');
  assert.equal(more.length, 0);
  assert.deepEqual(
    [activation!.message, activation!.level, activation!.actor, activation!.license_id, activation!.ip, activation!.device_id],
    ['Kích hoạt key Anh A trên máy MAY-NHA', 'info', 'app', id, '1.2.3.4', DEVICE],
  );
  assert.equal((await logsOf(c.env.DB)).filter((r) => r.kind.startsWith('key.')).length, 1);
  // Another device: taken, with the key and that device.
  await verifyFrom(c.call, key, '9.9.9.9', { id: OTHER, hostname: 'MAY-KHAC' });
  const [taken] = await logsOf(c.env.DB, 'key.taken');
  assert.deepEqual(
    [taken!.message, taken!.license_id, taken!.actor, taken!.device_id],
    ['Key Anh A đang ở máy khác: máy MAY-KHAC bị từ chối', id, 'app', OTHER],
  );
  // Gỡ thiết bị: the old device is 'released'; then revoked; then ended.
  await c.call(`/admin/licenses/${id}/release`, { form: {} });
  await verifyFrom(c.call, key, '1.2.3.4');
  assert.equal((await logsOf(c.env.DB, 'key.released'))[0]!.message, 'Key Anh A đã gỡ khỏi máy MAY-NHA: máy đó bị từ chối');
  await verifyFrom(c.call, key, '9.9.9.9', { id: OTHER, hostname: 'MAY-KHAC' });
  assert.equal((await logsOf(c.env.DB, 'key.activate')).length, 2);
  await c.call(`/admin/licenses/${id}/revoke`, { form: { reason: 'Chưa trả tiền' } });
  await verifyFrom(c.call, key, '9.9.9.9', { id: OTHER, hostname: 'MAY-KHAC' });
  assert.equal((await logsOf(c.env.DB, 'key.revoked'))[0]!.message, 'Key Anh A đã bị khoá: máy MAY-KHAC bị từ chối');
  await c.call(`/admin/licenses/${id}/restore`, { form: {} });
  await c.call(`/admin/licenses/${id}/edit`, { form: { note: 'Anh A', maxAccounts: '100', date: '2020-01-31' } });
  await verifyFrom(c.call, key, '9.9.9.9', { id: OTHER, hostname: 'MAY-KHAC' });
  assert.equal((await logsOf(c.env.DB, 'key.expired'))[0]!.message, 'Key Anh A hết hạn ngày 31/01/2020: máy MAY-KHAC bị từ chối');
});

/** POST /api/license/sync of the app of `key` on DEVICE with `events`, and the accounts given (none by default). */
const syncEvents = (call: ReturnType<typeof client>['call'], key: string, events: unknown, accounts: unknown[] = []) =>
  call('/api/license/sync', { body: JSON.stringify({ key, id: DEVICE, accounts, events }), ip: '1.2.3.4' }).then((r) => ({
    ...r,
    json: JSON.parse(r.text),
  }));

const removedAt = (db: D1Database, username = 'manina') => db.prepare('SELECT removed_at FROM accounts WHERE username = ?').bind(username).first('removed_at');

test('log: the events of a sync are logged; a removal keeps the account and marks it, an add or the account sent clears it; bad events are left out', async () => {
  const c = await ready();
  const key = await newKey(c, { note: 'Nhà' });
  const id = Number(await keyId(c, key));
  await verify(c.call, key);
  const nick = { label: 'Nick chính', username: 'manina', password: 'p', serverId: 24 };
  const first = await syncOf(c.call, key, DEVICE, [[nick, 0]]);
  assert.equal(first.json.logged, 0);
  // One line of what a sync took; a sync that takes nothing new has none.
  const [summary] = await logsOf(c.env.DB, 'sync.summary');
  assert.deepEqual([summary!.message, summary!.level, summary!.license_id], ['Đồng bộ: thêm 1 nick', 'info', id]);
  await syncOf(c.call, key, DEVICE, [[{ ...nick, password: 'p2' }, Date.now()]]);
  await syncOf(c.call, key, DEVICE, [[{ ...nick, password: 'p2' }, Date.now()]]);
  assert.equal((await logsOf(c.env.DB, 'sync.summary')).length, 1);

  // Removed on the app, no account sent: still on the server, marked, and logged; the bad events left out.
  const at = Date.now() - 60_000;
  const removed = await syncEvents(c.call, key, [
    { at, kind: 'remove', username: 'MANINA', serverId: 24, label: 'Nick chính', extra: true },
    { at, kind: 'fly', username: 'manina', serverId: 24 },
    { at: 'x', kind: 'add', username: 'manina', serverId: 24 },
    { at, kind: 'add', username: '  ', serverId: 24 },
    { at, kind: 'add', username: 'manina', serverId: 2.5 },
    5,
    null,
  ]);
  assert.equal(removed.status, 200, removed.text);
  assert.deepEqual(removed.json, { added: 0, updated: 0, unchanged: 0, kept: 0, repeated: 0, refused: 0, taken: 0, logged: 1 });
  assert.equal(await count(database(c.env.DB)), 1);
  assert.equal(await removedAt(c.env.DB), at);
  const [line] = await logsOf(c.env.DB, 'app.remove');
  assert.deepEqual(
    [line!.message, line!.level, line!.actor, line!.license_id, line!.device_id, line!.hostname, line!.username, line!.server_id, line!.at, line!.ip],
    ['Xoá nick MANINA (S24) trên máy', 'warn', 'app', id, DEVICE, 'MAY-NHA', 'MANINA', 24, at, '1.2.3.4'],
  );
  assert.deepEqual(JSON.parse(line!.detail!), { label: 'Nick chính' });
  // The Nick page says so, with a filter for them.
  const page = (await c.call('/admin')).text;
  assert.match(page, /<tr data-find="[^"]*" data-state="removed">/);
  assert.match(page, /<span class="pill warn" title="App xoá nick này lúc [^"]+; server vẫn giữ">Đã xoá ở máy<\/span>/);
  assert.match(page, /data-state="removed">Đã xoá ở máy <span class="n">1<\/span>/);

  // Added again: cleared. Removed, then the account sent: cleared too.
  assert.equal((await syncEvents(c.call, key, [{ at: Date.now(), kind: 'add', username: 'manina', serverId: 24 }])).json.logged, 1);
  assert.equal(await removedAt(c.env.DB), null);
  assert.equal((await logsOf(c.env.DB, 'app.add'))[0]!.message, 'Thêm nick manina (S24)');
  await syncEvents(c.call, key, [{ at: Date.now(), kind: 'remove', username: 'manina', serverId: 24 }]);
  assert.notEqual(await removedAt(c.env.DB), null);
  assert.ok((await c.call('/admin')).text.includes('Đã xoá ở máy'));
  await syncOf(c.call, key, DEVICE, [[{ ...nick, password: 'p2' }, 0]]);
  assert.equal(await removedAt(c.env.DB), null);
  assert.ok(!(await c.call('/admin')).text.includes('Đã xoá ở máy'));

  // The last event of an account decides; edit and import are logged; a time ahead of the server counts as now.
  const before = Date.now();
  const many = await syncEvents(c.call, key, [
    { at: before - 2000, kind: 'import', username: 'tiheo1', serverId: 25 },
    { at: before - 1000, kind: 'remove', username: 'manina', serverId: 24 },
    { at: before - 3000, kind: 'edit', username: 'manina', serverId: 24 },
    { at: before + 9e9, kind: 'edit', username: 'tiheo1', serverId: 25 },
  ]);
  assert.equal(many.json.logged, 4);
  assert.equal(await removedAt(c.env.DB), before - 1000);
  assert.equal((await logsOf(c.env.DB, 'app.import'))[0]!.message, 'Nhập nick tiheo1 (S25) từ JSON');
  const edits = await logsOf(c.env.DB, 'app.edit');
  assert.equal(edits[0]!.message, 'Sửa nick manina (S24)');
  assert.ok(edits[1]!.at >= before && edits[1]!.at <= Date.now());

  // An account another key holds is never marked by this one.
  const office = await newKey(c, { note: 'Cty' });
  await verify(c.call, office, { id: OTHER });
  await syncOf(c.call, office, OTHER, [[{ label: '', username: 'cuacty', password: 'p', serverId: 24 }, 0]]);
  await syncEvents(c.call, key, [{ at: Date.now(), kind: 'remove', username: 'cuacty', serverId: 24 }]);
  assert.equal(await removedAt(c.env.DB, 'cuacty'), null);

  // More than 200, or not a list: 400, nothing logged. 200 at once are.
  const n = (await logsOf(c.env.DB)).length;
  const tooMany = Array.from({ length: 201 }, () => ({ at: Date.now(), kind: 'add', username: 'x', serverId: 24 }));
  for (const events of [tooMany, 'x', { kind: 'add' }]) assert.equal((await syncEvents(c.call, key, events)).status, 400);
  assert.equal((await logsOf(c.env.DB)).length, n);
  assert.equal((await syncEvents(c.call, key, tooMany.slice(0, 200))).json.logged, 200);
  assert.equal((await logsOf(c.env.DB, 'app.add')).length, 201);
});

test('log: a sync that refuses accounts is a warning that says why', async () => {
  const c = await ready();
  const key = await newKey(c, { maxAccounts: '1' });
  await verify(c.call, key);
  const other = await newKey(c);
  await verify(c.call, other, { id: OTHER });
  await syncOf(c.call, other, OTHER, [[{ label: '', username: 'cua-khac', password: 'p', serverId: 24 }, 0]]);
  const a = (n: number) => ({ label: '', username: `nick${n}`, password: 'p', serverId: 24 });
  await syncOf(c.call, key, DEVICE, [[a(1), 0], [a(2), 0], [{ label: '', username: 'cua-khac', password: 'x', serverId: 24 }, 0]]);
  const last = (await logsOf(c.env.DB, 'sync.summary')).at(-1)!;
  assert.deepEqual([last.message, last.level], ['Đồng bộ: thêm 1 nick, 1 nick vượt số nick tối đa, 1 nick của key khác', 'warn']);
});

test("log: the admin's actions are logged with the IP; failed logins of one IP are one row, counted", async () => {
  const { env, call } = client();
  for (let i = 0; i < 3; i++) await call('/admin/login', { form: { username: 'ke-gian', password: `sai${i}` }, ip: '6.6.6.6' });
  const [fail, ...more] = await logsOf(env.DB, 'admin.login_fail');
  assert.equal(more.length, 0);
  assert.deepEqual([fail!.count, fail!.level, fail!.ip, fail!.actor, fail!.message], [3, 'warn', '6.6.6.6', 'ip', 'Đăng nhập sai (tên "ke-gian")']);
  // Ten and more, those made to wait too: danger.
  for (let i = 0; i < 9; i++) await call('/admin/login', { form: { username: 'admin', password: 'sai' }, ip: '6.6.6.6' });
  const [burst] = await logsOf(env.DB, 'admin.login_fail');
  assert.deepEqual([burst!.count, burst!.level, burst!.message], [12, 'danger', 'IP 6.6.6.6 đăng nhập sai 12 lần trong 10 phút']);

  // The rest from one IP.
  const c = { env, call: (path: string, o: Parameters<typeof call>[1] = {}) => call(path, { ip: '7.7.7.7', ...o }) };
  await c.call('/admin/login', { form: { username: 'admin', password: 'admin' } });
  await c.call('/admin/password', { form: { current: 'admin', next: 'mat-khau-moi', confirm: 'mat-khau-moi' } });
  const made = await c.call('/admin/licenses', { form: { note: 'Quán net', maxAccounts: '20', mode: 'fixed', date: '2099-12-31', count: '3' } });
  assert.equal(made.status, 303);
  const key = await newKey(c, { note: 'Anh A' });
  const id = Number(await keyId(c, key));
  await verify(c.call, key);
  // An action that changes nothing is not logged: Mở khoá of a key not revoked, Khoá of a revoked one, Gỡ thiết bị of a
  // key no device holds, Sửa that changes nothing.
  await c.call(`/admin/licenses/${id}/restore`, { form: {} });
  await c.call(`/admin/licenses/${id}/revoke`, { form: { reason: 'Chưa trả tiền' } });
  await c.call(`/admin/licenses/${id}/revoke`, { form: { reason: 'Lý do khác' } });
  await c.call(`/admin/licenses/${id}/restore`, { form: {} });
  await c.call(`/admin/licenses/${id}/release`, { form: {} });
  await c.call(`/admin/licenses/${id}/release`, { form: {} });
  await c.call(`/admin/licenses/${id}/edit`, { form: { note: 'Anh B', maxAccounts: '30', date: '2099-12-31' } });
  await c.call(`/admin/licenses/${id}/edit`, { form: { note: 'Anh B', maxAccounts: '30', date: '' } });
  await c.call(`/admin/licenses/${id}/edit`, { form: { note: 'Anh B', maxAccounts: '30', date: '2099-12-31' } });
  // A failed edit, and an action on a key that is not there, are not logged.
  await c.call(`/admin/licenses/${id}/edit`, { form: { maxAccounts: 'x' } });
  await c.call(`/admin/licenses/${id}/delete`, { form: {} });
  await c.call('/admin/licenses/999/revoke', { form: { reason: 'x' } });
  const other = await newKey(c, { note: '' });
  await verify(c.call, other);
  await syncOf(c.call, other, DEVICE, [[{ label: '', username: 'manina', password: 'p', serverId: 24 }, 0]]);
  const account = await env.DB.prepare('SELECT id FROM accounts').first<{ id: number }>();
  await c.call(`/admin/accounts/${account!.id}/delete`, { form: {} });
  // Logged out once: the second has no session.
  await c.call('/admin/logout', { form: {} });
  await c.call('/admin/logout', { form: {} });

  const admin = (await logsOf(env.DB)).filter((r) => r.kind.startsWith('admin.') && r.kind !== 'admin.login_fail');
  assert.ok(admin.every((r) => r.actor === 'admin' && r.ip === '7.7.7.7' && r.level === 'info'));
  assert.deepEqual(
    admin.map((r) => r.kind),
    [
      'admin.login',
      'admin.password',
      'admin.create',
      'admin.create',
      'admin.revoke',
      'admin.restore',
      'admin.release',
      'admin.edit',
      'admin.delete',
      'admin.create',
      'admin.account_delete',
      'admin.logout',
    ],
  );
  const messages = admin.map((r) => r.message);
  assert.deepEqual(messages.slice(0, 7), [
    'Đăng nhập trang quản trị',
    'Đổi mật khẩu quản trị',
    'Tạo 3 key: Quán net',
    'Tạo key Anh A',
    'Khoá key Anh A: Chưa trả tiền',
    'Mở khoá key Anh A',
    'Gỡ máy MAY-NHA khỏi key Anh A',
  ]);
  // Sửa says what changed: the end it had from its activation (10 years) to the day chosen.
  assert.match(messages[7]!, /^Sửa key Anh A: ghi chú "Anh A" → "Anh B", số nick 100 → 30, hạn \d\d\/\d\d\/\d{4} → 31\/12\/2099$/);
  assert.deepEqual(messages.slice(8), [
    `Xoá key Anh B (${key})`,
    `Tạo key ${other.slice(0, 9)}`,
    'Xoá nick manina (S24) khỏi server',
    'Đăng xuất',
  ]);
  const of = (kind: string) => admin.find((r) => r.kind === kind)!;
  assert.equal(JSON.parse(of('admin.create').detail!).ids.length, 3);
  assert.equal(of('admin.create').license_id, null);
  assert.equal(of('admin.revoke').license_id, id);
  assert.deepEqual([of('admin.release').device_id, of('admin.release').hostname], [DEVICE, 'MAY-NHA']);
  assert.deepEqual([of('admin.account_delete').username, of('admin.account_delete').server_id], ['manina', 24]);
});

test('log: the Log page needs the admin; it filters by level, kind, key and search on the server, 100 rows a page, Xem thêm', async () => {
  const { call } = client();
  assert.equal((await call('/admin/logs')).location, '/admin/login');
  const c = await ready();
  assert.match((await c.call('/admin/logs?kind=app')).text, /Không có log nào khớp/);
  const key = await newKey(c, { note: 'Anh A' });
  const id = await keyId(c, key);
  // The Key page links the Log of each key.
  assert.ok((await c.call('/admin/licenses')).text.includes(`href="/admin/logs?key=${id}"`));
  await verifyFrom(c.call, key, '1.2.3.4');
  for (let i = 0; i < 12; i++) await verifyFrom(c.call, 'CLLT-0000-0000-0000-0000', '6.6.6.6', { hostname: 'MAY-LA' });
  await c.call(`/admin/licenses/${id}/revoke`, { form: { reason: 'Chưa trả tiền' } });

  const rows = (text: string) => [...text.matchAll(/<tr(?: class="danger")? data-level="(\w+)"/g)].map((m) => m[1]);
  const all = await c.call('/admin/logs');
  assert.equal(all.status, 200);
  assert.match(all.text, /<a href="\/admin\/logs" aria-current="page">Log<\/a>/);
  // Newest first: the revoke, the wrong keys counted (12, danger, from when to when), the activation.
  assert.match(
    all.text,
    /Khoá key Anh A: Chưa trả tiền[\s\S]*IP 6\.6\.6\.6 nhập key sai 12 lần trong 10 phút<span class="times">×12<\/span><div class="faint small">từ \d\d:\d\d tới \d\d:\d\d<\/div>[\s\S]*Kích hoạt key Anh A trên máy MAY-NHA/,
  );
  assert.match(all.text, /Nhập key sai 24h<\/div><div class="num">12<\/div><div class="cap">từ 1 IP<\/div>/);
  assert.match(all.text, /Cảnh báo 24h<\/div><div class="num">1<\/div><div class="cap">1 nguy hiểm<\/div>/);
  assert.ok(!all.text.includes('>Xem thêm</a>'));
  // Who: the key (its Log), the admin, an IP.
  assert.match(all.text, new RegExp(`<a class="tag" href="/admin/logs\\?key=${id}"[^>]*>[\\s\\S]*?Anh A</a>`));
  assert.match(all.text, /<span class="tag">[\s\S]*?admin<\/span>/);
  assert.match(all.text, /<span class="mono small">6\.6\.6\.6<\/span>/);

  assert.deepEqual(rows((await c.call('/admin/logs?level=danger')).text), ['danger']);
  assert.deepEqual(rows((await c.call('/admin/logs?level=warn')).text), ['danger']);
  const ofKey = (await c.call(`/admin/logs?key=${id}`)).text;
  assert.ok(ofKey.includes('Khoá key Anh A') && ofKey.includes('Kích hoạt key') && !ofKey.includes('6.6.6.6'));
  assert.match(ofKey, new RegExp(`<option value="${id}" selected="">Anh A`));
  const admin = (await c.call('/admin/logs?kind=admin')).text;
  assert.ok(admin.includes('Đổi mật khẩu quản trị') && !admin.includes('Kích hoạt key'));
  assert.equal(rows((await c.call('/admin/logs?q=may-la')).text).length, 1);
  assert.equal(rows((await c.call('/admin/logs?q=6.6.6')).text).length, 1);
  // "_" and "%" are themselves, not wildcards.
  assert.equal(rows((await c.call('/admin/logs?q=_')).text).length, 0);
  // Nonsense is no filter.
  assert.equal(rows((await c.call('/admin/logs?level=x&kind=y&key=z&before=-1')).text).length, rows(all.text).length);

  // 150 more: 100 a page, then the rest with Xem thêm.
  const now = Date.now();
  for (let i = 0; i < 150; i++) {
    await c.env.DB.prepare("INSERT INTO logs (at, kind, actor, message, last_at) VALUES (?, 'app.edit', 'app', ?, ?)").bind(now, `Sửa nick n${i} (S24)`, now).run();
  }
  const total = (await logsOf(c.env.DB)).length;
  const first = await c.call('/admin/logs');
  assert.equal(rows(first.text).length, 100);
  assert.match(first.text, /Việc của app 24h<\/div><div class="num">150<\/div>/);
  const next = /<a class="btn" href="(\/admin\/logs\?before=\d+-\d+)">Xem thêm<\/a>/.exec(first.text)![1]!;
  const second = await c.call(next);
  assert.equal(rows(second.text).length, total - 100);
  assert.ok(!second.text.includes('>Xem thêm</a>') && second.text.includes('Về mới nhất'));
  // The cursor keeps the filter.
  assert.match((await c.call('/admin/logs?kind=app')).text, /href="\/admin\/logs\?kind=app&amp;before=\d+-\d+">Xem thêm/);
});

test('log: rows older than 90 days go as the Log page opens', async () => {
  const c = await ready();
  const day = 86_400_000;
  for (const [age, message] of [
    [91, 'cũ quá'],
    [89, 'còn giữ'],
  ] as const) {
    const at = Date.now() - age * day;
    await c.env.DB.prepare("INSERT INTO logs (at, kind, actor, message, last_at) VALUES (?, 'admin.login', 'admin', ?, ?)").bind(at, message, at).run();
  }
  const page = await c.call('/admin/logs');
  assert.ok(page.text.includes('còn giữ') && !page.text.includes('cũ quá'));
  const kept = (await logsOf(c.env.DB)).map((r) => r.message);
  assert.ok(kept.includes('còn giữ') && !kept.includes('cũ quá'));
});

test('log: refusals of a known key are counted by IP and key over 24 hours, never danger; two keys from one IP are two rows', async () => {
  const c = await ready();
  const a = await newKey(c, { note: 'Anh A', mode: 'fixed', date: '2099-12-31' });
  const b = await newKey(c, { note: 'Chị B', mode: 'fixed', date: '2099-12-31' });
  await verify(c.call, a, { id: OTHER });
  await verify(c.call, b, { id: OTHER });
  // The same IP tries both keys from another device: one row each, never merged.
  for (let i = 0; i < 12; i++) {
    await verifyFrom(c.call, a, '1.2.3.4');
    await verifyFrom(c.call, b, '1.2.3.4');
  }
  const taken = await logsOf(c.env.DB, 'key.taken');
  assert.deepEqual(
    taken.map((r) => [r.license_id, r.count, r.level, r.message]),
    [
      [Number(await keyId(c, a)), 12, 'warn', 'Key Anh A đang ở máy khác: máy MAY-NHA bị từ chối'],
      [Number(await keyId(c, b)), 12, 'warn', 'Key Chị B đang ở máy khác: máy MAY-NHA bị từ chối'],
    ],
  );
  // An app whose key ended checks every hour: still the same row 23 hours later, a new one after 24.
  const idA = await keyId(c, a);
  await c.call(`/admin/licenses/${idA}/edit`, { form: { note: 'Anh A', maxAccounts: '100', date: '2020-01-31' } });
  await verifyFrom(c.call, a, '9.9.9.9', { id: OTHER });
  await c.env.DB.prepare("UPDATE logs SET at = at - 23 * 3600000 WHERE kind = 'key.expired'").run();
  await verifyFrom(c.call, a, '9.9.9.9', { id: OTHER });
  assert.deepEqual((await logsOf(c.env.DB, 'key.expired')).map((r) => [r.count, r.level]), [[2, 'warn']]);
  await c.env.DB.prepare("UPDATE logs SET at = at - 2 * 3600000 WHERE kind = 'key.expired'").run();
  await verifyFrom(c.call, a, '9.9.9.9', { id: OTHER });
  assert.deepEqual((await logsOf(c.env.DB, 'key.expired')).map((r) => r.count), [2, 1]);
  // Keys not known still count within 10 minutes, whatever was typed.
  await verifyFrom(c.call, 'CLLT-0000-0000-0000-0000', '1.2.3.4');
  await verifyFrom(c.call, 'CLLT-1111-1111-1111-1111', '1.2.3.4');
  assert.deepEqual((await logsOf(c.env.DB, 'key.unknown')).map((r) => [r.count, r.license_id]), [[2, null]]);
});

test('log: an event with an id is logged once for its key, a sync sent again logs nothing twice; its time is whole ms within 90 days', async () => {
  const c = await ready();
  const key = await newKey(c, { note: 'Nhà' });
  await verify(c.call, key);
  await syncOf(c.call, key, DEVICE, [[{ label: '', username: 'manina', password: 'p', serverId: 24 }, 0]]);
  const now = Date.now();
  const events = [
    { id: 'ev-1', at: now - 5000, kind: 'remove', username: 'manina', serverId: 24 },
    { id: 'ev_2', at: now - 4000, kind: 'add', username: 'tiheo1', serverId: 25 },
    { at: now - 3000, kind: 'edit', username: 'tiheo1', serverId: 25 },
    // An id that is not 1 to 40 of [A-Za-z0-9_-]: a bad event, left out.
    { id: 'có dấu', at: now, kind: 'add', username: 'x', serverId: 24 },
    { id: 'a'.repeat(41), at: now, kind: 'add', username: 'x', serverId: 24 },
    { id: '', at: now, kind: 'add', username: 'x', serverId: 24 },
  ];
  assert.equal((await syncEvents(c.call, key, events)).json.logged, 3);
  // Sent again (the app did not get the answer): only the event without an id is logged again.
  const again = await syncEvents(c.call, key, events);
  assert.equal(again.status, 200);
  assert.equal(again.json.logged, 1);
  assert.deepEqual(
    (await logsOf(c.env.DB)).filter((r) => r.kind.startsWith('app.')).map((r) => r.kind),
    ['app.remove', 'app.add', 'app.edit', 'app.edit'],
  );
  assert.equal(await removedAt(c.env.DB), now - 5000);
  // The same id twice in one sync is one row; another key may use the same id.
  assert.equal((await syncEvents(c.call, key, [{ id: 'ev-3', at: now, kind: 'edit', username: 'a', serverId: 24 }, { id: 'ev-3', at: now, kind: 'edit', username: 'a', serverId: 24 }])).json.logged, 1);
  const other = await newKey(c, { note: 'Cty' });
  await verify(c.call, other, { id: OTHER });
  const fromOther = await c.call('/api/license/sync', { body: JSON.stringify({ key: other, id: OTHER, accounts: [], events: [{ id: 'ev-1', at: now, kind: 'add', username: 'b', serverId: 24 }] }) });
  assert.equal(JSON.parse(fromOther.text).logged, 1);

  // A time is whole milliseconds, and no earlier than 90 days ago, so the write that logs it does not prune it.
  const before = Date.now();
  await syncEvents(c.call, key, [
    { id: 'old', at: 1, kind: 'edit', username: 'cu', serverId: 24 },
    { id: 'frac', at: before - 1000.75, kind: 'edit', username: 'le', serverId: 24 },
  ]);
  const rows = await logsOf(c.env.DB, 'app.edit');
  const old = rows.find((r) => r.username === 'cu')!;
  assert.ok(old.at >= before - 90 * 86_400_000 && old.at <= Date.now() - 90 * 86_400_000, String(old.at));
  assert.equal(old.last_at, old.at);
  assert.equal(rows.find((r) => r.username === 'le')!.at, Math.floor(before - 1000.75));
});

test('log: the Log page shows the last to happen first, a counted row by its last time, and pages by it', async () => {
  const c = await ready();
  await verifyFrom(c.call, 'CLLT-0000-0000-0000-0000', '1.2.3.4');
  const key = await newKey(c, { note: 'Anh A' });
  // Counted once more after the key was made: it comes first again.
  await new Promise((r) => setTimeout(r, 5));
  await verifyFrom(c.call, 'CLLT-0000-0000-0000-0000', '1.2.3.4');
  const page = (await c.call('/admin/logs')).text;
  assert.ok(key && page.indexOf('<span class="times">×2</span>') < page.indexOf('Tạo key Anh A'), 'counted row first');
  // Rows of the same time are by id, and the cursor goes on from the last shown, none twice, none left out.
  const at = Date.now() + 60_000;
  for (let i = 0; i < 130; i++) {
    await c.env.DB.prepare("INSERT INTO logs (at, kind, actor, message, last_at) VALUES (?, 'app.edit', 'app', ?, ?)").bind(at - (i % 3), `m${i}`, at - (i % 3)).run();
  }
  const seen: string[] = [];
  let path = '/admin/logs?kind=app';
  for (;;) {
    const text = (await c.call(path)).text;
    seen.push(...[...text.matchAll(/<td class="msg">(m\d+)/g)].map((m) => m[1]!));
    const next = /<a class="btn" href="([^"]+)">Xem thêm<\/a>/.exec(text);
    if (!next) break;
    path = next[1]!.replace(/&amp;/g, '&');
  }
  assert.equal(seen.length, 130);
  assert.equal(new Set(seen).size, 130);
  // Within a time, the later row first.
  assert.deepEqual(seen.slice(0, 3), ['m129', 'm126', 'm123']);
});

// ---- Limits of /api/license/* -----------------------------------------------------------------------------------

test('API_LIMIT: past what it allows an IP, /api/license/* answers 429 with Retry-After, counted by IP; /api/health is not counted', async () => {
  const asked: string[] = [];
  const limiter: RateLimit = {
    limit: async ({ key }) => {
      asked.push(key);
      return { success: asked.filter((k) => k === key).length <= 2 };
    },
  };
  const c = client({ DB: d1(), API_LIMIT: limiter, SYNC_GAP_SECONDS: '0' });
  const body = (key: string) => JSON.stringify({ key, id: DEVICE, hostname: 'MAY', os: 'windows', version: '1.1.11', accounts: 0 });
  assert.equal((await c.call('/api/health')).status, 200);
  const lines = () => c.env.DB.prepare('SELECT COUNT(*) AS n FROM logs').first('n');
  let before: unknown;
  for (const want of [200, 200, 429]) {
    if (want === 429) before = await lines();
    const r = await c.call('/api/license/verify', { body: body('CLLT-0000-0000-0000-0000'), ip: '1.2.3.4' });
    assert.equal(r.status, want, r.text);
    if (want === 429) {
      assert.equal(r.res.headers.get('Retry-After'), '60');
      assert.match(JSON.parse(r.text).error, /Gửi quá nhiều/);
    }
  }
  assert.equal((await c.call('/api/license/sync', { body: '{}', ip: '1.2.3.4' })).status, 429);
  // A refusal writes nothing: the 429s are not lines of the Log page.
  assert.equal(await lines(), before);
  // Another IP has its own count.
  assert.equal((await c.call('/api/license/verify', { body: body('CLLT-0000-0000-0000-0000'), ip: '5.6.7.8' })).status, 200);
  assert.deepEqual(asked, ['1.2.3.4', '1.2.3.4', '1.2.3.4', '1.2.3.4', '5.6.7.8']);
});

test('SYNC_GAP_SECONDS: a key that syncs again within the gap gets 429 "tooSoon" and nothing is written; after it, the sync goes', async () => {
  const c = await ready();
  const key = await newKey(c);
  assert.equal((await verify(c.call, key)).json.ok, true);
  const gapped = client({ DB: c.env.DB, ADMIN_PASSWORD: 'admin', SYNC_GAP_SECONDS: '10' });
  const nick = (label: string) => ({ label, username: 'tiheo1', password: 'p1', serverId: 24 });
  const first = await syncOf(gapped.call, key, DEVICE, [[nick('Một'), 1000]]);
  assert.equal(first.status, 200, first.text);
  const again = await syncOf(gapped.call, key, DEVICE, [[nick('Hai'), 2000]]);
  assert.equal(again.status, 429);
  assert.equal(again.json.code, 'tooSoon');
  assert.match(again.json.error, /ít nhất 10 giây/);
  assert.equal(again.res.headers.get('Retry-After'), '10');
  assert.equal(await c.env.DB.prepare('SELECT label FROM accounts').first('label'), 'Một');
  // As if the last sync were 11 s ago.
  await c.env.DB.prepare('UPDATE licenses SET synced_at = synced_at - 11000').run();
  assert.equal((await syncOf(gapped.call, key, DEVICE, [[nick('Hai'), 2000]])).status, 200);
  assert.equal(await c.env.DB.prepare('SELECT label FROM accounts').first('label'), 'Hai');
});

test('syncGap: SYNC_GAP_SECONDS when it is a number of 0 or more, else 10 s', () => {
  assert.equal(syncGap(undefined), 10);
  assert.equal(syncGap(''), 10);
  assert.equal(syncGap('abc'), 10);
  assert.equal(syncGap('-1'), 10);
  assert.equal(syncGap('0'), 0);
  assert.equal(syncGap('30'), 30);
});
