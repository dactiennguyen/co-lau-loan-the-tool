// The Worker end to end on an in-memory D1 (test/d1.ts): the admin page's login and Đổi mật khẩu, the keys of the app
// with the accounts they sync, and the Nick and Key pages.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { count, merge, syncLicense } from '../src/services/account.service.ts';
import { addDuration, create as createLicense, verify as verifyLicense } from '../src/services/license.service.ts';
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
    o: { form?: Record<string, string>; body?: string; method?: string; origin?: string } = {},
  ) => {
    const headers = new Headers();
    if (cookie) headers.set('Cookie', `cllt_admin=${cookie}`);
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
  for (const path of ['/admin', '/admin/licenses', '/admin/accounts.json']) {
    assert.equal((await call(path)).location, '/admin/password', path);
  }
  const page = await call('/admin/password');
  assert.match(page.text, /mật khẩu mặc định &quot;admin&quot;/);
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
      if (done || !sql.startsWith('select "id", "server_id", "username_key", "data", "changed", "license_id" from "accounts"')) return real;
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

test('key: a check is two D1 queries, the first one too', async () => {
  const db = d1();
  let queries = 0;
  const counted = { ...db, prepare: (sql: string) => (queries++, db.prepare(sql)) } as unknown as D1Database;
  const v = { key: await keyOf(db, await createLicense(database(db), '', 100, { mode: 'activation', duration: 1, unit: 'year' })), id: DEVICE, hostname: 'h', os: 'o', version: 'v', accounts: 1 };
  assert.equal((await verifyLicense(database(counted), v, 'local')).ok, true);
  assert.equal(queries, 2);
  queries = 0;
  assert.equal((await verifyLicense(database(counted), v, 'local')).ok, true);
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
  assert.deepEqual(first.json, { added: 1, updated: 0, unchanged: 0, kept: 0, repeated: 0, refused: 0, taken: 0 });
  const row = await c.env.DB.prepare('SELECT license_id, source FROM accounts').first<{ license_id: number; source: string }>();
  assert.equal(row!.source, 'Key Nhà');

  // The office key sends the same account (any case), later: not written, still the home key's.
  const other = { ...nick, username: 'TIHEO1', password: 'p-ke-khac', fight: { autoRepair: true } };
  const refused = await syncOf(c.call, office, OTHER, [[other, Date.now()]]);
  assert.deepEqual(refused.json, { added: 0, updated: 0, unchanged: 0, kept: 0, repeated: 0, refused: 1, taken: 1 });
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
