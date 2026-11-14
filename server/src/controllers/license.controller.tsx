// Keys: POST /api/license/verify and /api/license/sync for the app, and the Key page with Tạo key and the actions of a
// key, each one a line of the Log page.
import { MAX_ACCOUNTS_BODY, MAX_VERIFY_BODY, SYNC_GAP_S } from '../config/constants.ts';
import { HTTP, LICENSE, LOG } from '../config/messages.ts';
import * as accounts from '../services/account.service.ts';
import * as licenses from '../services/license.service.ts';
import * as logs from '../services/log.service.ts';
import type { License } from '../models/index.ts';
import type { Ctx } from '../types/app.ts';
import { keyName } from '../utils/format.ts';
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
 * ones up to the key's max_accounts; and what the app did to its accounts ("events"), each a line of the Log page.
 * The answer says what was merged, and how many events were logged ("logged"). Else 403 with why ("code"). */
/** The least seconds between two syncs of a key: SYNC_GAP_SECONDS when it is a number of 0 or more, else SYNC_GAP_S. */
export function syncGap(text: string | undefined): number {
  const n = Number(text);
  return text !== undefined && text.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : SYNC_GAP_S;
}

export async function sync(c: Ctx) {
  const text = await bodyText(c, MAX_ACCOUNTS_BODY);
  if (text === null) return c.json({ error: HTTP.accountsTooLarge }, 413);
  const s = parseSync(text);
  if ('error' in s) return c.json(s, 400);
  const held = await licenses.holder(c.var.db, s.key, s.id);
  if (!('license' in held)) return c.json(held, 403);
  const l = held.license;
  // A key that syncs again within the gap is refused before anything is read or written; the app sends it all again
  // at its next sync, as for any answer but 200.
  const gap = syncGap(c.env.SYNC_GAP_SECONDS);
  if (l.syncedAt !== null && Date.now() - l.syncedAt < gap * 1000) {
    return c.json({ code: 'tooSoon', error: LICENSE.tooSoon(gap) }, 429, { 'Retry-After': String(gap) });
  }
  try {
    const done = await accounts.syncLicense(c.var.db, s.accounts, l, licenses.sourceOf(l));
    const logged = await licenses.synced(c.var.db, l, s.settings, s.events, done, clientIp(c));
    return c.json({ ...done, logged });
  } catch (e) {
    if (e instanceof accounts.Busy) return c.json({ error: e.message }, 503);
    throw e;
  }
}

async function show(c: Ctx, props: Omit<LicensesProps, 'nonce' | 'list' | 'now'>, status: 200 | 400 = 200) {
  const list = await licenses.list(c.var.db);
  return render(c, (n) => <LicensesView nonce={n} list={list} now={Date.now()} {...props} />, status);
}

/** The Key page; ?created=<id>,<id>… shows the keys Tạo key just made, to copy. */
export async function page(c: Ctx) {
  const list = await licenses.list(c.var.db);
  const created = new Set((c.req.query('created') ?? '').split(',').map(Number));
  const made = list.filter((l) => created.has(l.id)).sort((a, b) => a.id - b.id);
  return render(c, (n) => <LicensesView nonce={n} list={list} now={Date.now()} flash={flash(c)} error={flashError(c)} made={made} />);
}

/** Tạo key: back to the page with the new key (Post/Redirect/Get, so loading the page again makes no other key), or the
 * page with what is wrong under its field. */
export async function create(c: Ctx) {
  const form = check(createForm, formObject(c.var.form));
  if (!form.ok) return show(c, { errors: form.fields, values: formObject(c.var.form) }, 400);
  const { note, maxAccounts, term, count } = form.data;
  const ids = await licenses.createMany(c.var.db, note, maxAccounts, term, count);
  const first = count === 1 ? await licenses.get(c.var.db, ids[0]!) : undefined;
  await logs.add(c.var.db, {
    ...logs.byAdmin(clientIp(c)),
    kind: 'admin.create',
    licenseId: first?.id ?? null,
    message: LOG.created(count, first ? keyName(first) : note),
    detail: { ids, maxAccounts, term },
  });
  return c.redirect(`/admin/licenses?created=${ids.join(',')}`, 303);
}

/** Khoá, Mở khoá, Gỡ thiết bị, Sửa, Xoá; back to the page with what was done. Each is a line of the Log page, naming
 * the key as it was (read before), when it changed something: Khoá of a key not revoked, Mở khoá of a revoked one, Gỡ
 * thiết bị of a key a device holds, Sửa that changes something, Xoá of a key that is there. The line goes in the batch of
 * the action, Sửa's after it. */
export async function act(c: Ctx) {
  const id = Number(c.req.param('id'));
  const action = c.req.param('action') as 'revoke' | 'restore' | 'release' | 'edit' | 'delete';
  const db = c.var.db;
  const form = formObject(c.var.form);
  const l = await licenses.get(db, id);
  /** The line of the action, for a key that is there. */
  const lineOf = (message: (name: string, l: License) => string): logs.Entry | undefined =>
    l && {
      ...logs.byAdmin(clientIp(c)),
      kind: `admin.${action}`,
      licenseId: id,
      // Gỡ thiết bị: the device it is taken from.
      ...(action === 'release' ? { deviceId: l.deviceId ?? '', hostname: l.hostname } : {}),
      message: message(keyName(l), l),
    };
  if (action === 'edit') {
    const e = check(editForm, form);
    if (!e.ok) return show(c, { error: e.error }, 400);
    const changes = l ? licenses.changes(l, e.data) : [];
    const done = await licenses.edit(db, id, e.data);
    const line = lineOf((name) => LOG.edited(name, changes));
    if (done === 'saved' && changes.length && line) await logs.add(db, line);
    return c.redirect(done === 'saved' ? '/admin/licenses?done=saved' : `/admin/licenses?error=${done}`, 303);
  }
  const reason = revokeForm.parse(form).reason;
  // Each with its line, and the notice of the page after it (FLASH).
  const acts: Record<typeof action, [() => Promise<void>, string]> = {
    revoke: [() => licenses.revoke(db, id, reason, lineOf((name) => LOG.revoked(name, reason))), 'revoked'],
    restore: [() => licenses.restore(db, id, lineOf(LOG.restored)), 'restored'],
    release: [() => licenses.release(db, id, lineOf((name, l) => LOG.released(name, l.hostname))), 'released'],
    delete: [() => licenses.remove(db, id, lineOf((name, l) => LOG.deleted(name, l.key))), 'removed'],
  };
  const [run, done] = acts[action];
  await run();
  return c.redirect(`/admin/licenses?done=${done}`, 303);
}
