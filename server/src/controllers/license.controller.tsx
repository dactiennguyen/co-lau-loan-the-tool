// Keys: POST /api/license/verify and /api/license/sync for the app, and the Key page with Tạo key and the actions of a
// key.
import { MAX_ACCOUNTS_BODY, MAX_VERIFY_BODY } from '../config/constants.ts';
import { HTTP } from '../config/messages.ts';
import * as accounts from '../services/account.service.ts';
import * as licenses from '../services/license.service.ts';
import type { Ctx } from '../types/app.ts';
import { bodyText, clientIp, flash, flashError } from '../utils/http.ts';
import { render } from '../utils/render.ts';
import { check, formObject } from '../validators/form.ts';
import { createForm, editForm, parseSync, parseVerify, revokeForm } from '../validators/license.validator.ts';
import { LicensesView, type LicensesProps } from '../views/licenses.view.tsx';

/** POST /api/license/verify: whether the key works on this device. A verdict is always 200 ({"ok": false, "code"}), so
 * the app tells it from a failure of the network or the server. */
export async function verify(c: Ctx) {
  const text = await bodyText(c, MAX_VERIFY_BODY);
  if (text === null) return c.json({ error: HTTP.tooLarge }, 413);
  const v = parseVerify(text);
  if ('error' in v) return c.json(v, 400);
  return c.json(await licenses.verify(c.var.db, v, clientIp(c)));
}

/** POST /api/license/sync: the accounts and Cài đặt of the app of a key that works on its device (it holds the key,
 * which is neither revoked nor ended), merged into the accounts kept (services/account.service.ts#syncLicense), new
 * ones up to the key's max_accounts. Else 403 with why ("code"). */
export async function sync(c: Ctx) {
  const text = await bodyText(c, MAX_ACCOUNTS_BODY);
  if (text === null) return c.json({ error: HTTP.accountsTooLarge }, 413);
  const s = parseSync(text);
  if ('error' in s) return c.json(s, 400);
  const held = await licenses.holder(c.var.db, s.key, s.id);
  if (!('license' in held)) return c.json(held, 403);
  const l = held.license;
  try {
    const done = await accounts.syncLicense(c.var.db, s.accounts, l, licenses.sourceOf(l));
    await licenses.synced(c.var.db, l.id, s.settings);
    return c.json(done);
  } catch (e) {
    if (e instanceof accounts.Busy) return c.json({ error: e.message }, 503);
    throw e;
  }
}

async function show(c: Ctx, props: Omit<LicensesProps, 'nonce' | 'list' | 'now'>, status: 200 | 400 = 200) {
  const list = await licenses.list(c.var.db);
  return render(c, (n) => <LicensesView nonce={n} list={list} now={Date.now()} {...props} />, status);
}

/** The Key page; ?created=<id> shows the key Tạo key just made, to copy. */
export async function page(c: Ctx) {
  const list = await licenses.list(c.var.db);
  const created = Number(c.req.query('created'));
  const made = list.find((l) => l.id === created) ?? null;
  return render(c, (n) => <LicensesView nonce={n} list={list} now={Date.now()} flash={flash(c)} error={flashError(c)} made={made} />);
}

/** Tạo key: back to the page with the new key (Post/Redirect/Get, so loading the page again makes no other key), or the
 * page with what is wrong under its field. */
export async function create(c: Ctx) {
  const form = check(createForm, formObject(c.var.form));
  if (!form.ok) return show(c, { errors: form.fields, values: formObject(c.var.form) }, 400);
  const { note, maxAccounts, term } = form.data;
  const id = await licenses.create(c.var.db, note, maxAccounts, term);
  return c.redirect(`/admin/licenses?created=${id}`, 303);
}

/** Khoá, Mở khoá, Gỡ thiết bị, Sửa, Xoá; back to the page with what was done. */
export async function act(c: Ctx) {
  const id = Number(c.req.param('id'));
  const action = c.req.param('action') as 'revoke' | 'restore' | 'release' | 'edit' | 'delete';
  const db = c.var.db;
  const form = formObject(c.var.form);
  if (action === 'edit') {
    const e = check(editForm, form);
    if (!e.ok) return show(c, { error: e.error }, 400);
    const done = await licenses.edit(db, id, e.data);
    return c.redirect(done === 'saved' ? '/admin/licenses?done=saved' : `/admin/licenses?error=${done}`, 303);
  }
  const done = {
    revoke: () => licenses.revoke(db, id, revokeForm.parse(form).reason).then(() => 'revoked'),
    restore: () => licenses.restore(db, id).then(() => 'restored'),
    release: () => licenses.release(db, id).then(() => 'released'),
    delete: () => licenses.remove(db, id).then(() => 'removed'),
  }[action];
  return c.redirect(`/admin/licenses?done=${await done()}`, 303);
}
