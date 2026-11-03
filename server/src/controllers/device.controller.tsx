// The devices: POST /api/devices/hello and /api/devices/sync for the app, and the Thiết bị page with its actions.
import { MAX_ACCOUNTS_BODY, MAX_HELLO_BODY } from '../config/constants.ts';
import { HTTP } from '../config/messages.ts';
import * as accounts from '../services/account.service.ts';
import * as devices from '../services/device.service.ts';
import type { Ctx } from '../types/app.ts';
import { bodyText, clientIp, flash } from '../utils/http.ts';
import { render } from '../utils/render.ts';
import { blockForm, parseHello, parseSync, renameForm } from '../validators/device.validator.ts';
import { formObject } from '../validators/form.ts';
import { DevicesView } from '../views/devices.view.tsx';

/** POST /api/devices/hello: records the device and says whether it may run. */
export async function hello(c: Ctx) {
  const text = await bodyText(c, MAX_HELLO_BODY);
  if (text === null) return c.json({ error: HTTP.helloTooLarge }, 413);
  const h = parseHello(text);
  if ('error' in h) return c.json(h, 400);
  const answer = await devices.hello(c.var.db, h, clientIp(c));
  if ('wrongKey' in answer) return c.json({ error: HTTP.wrongDeviceKey }, 403);
  return c.json(answer);
}

/** POST /api/devices/sync: the accounts and Cài đặt of a device that said hello with its key, brings that key, is not
 * blocked and that the admin let sync, merged into the accounts kept (services/account.service.ts#merge). */
export async function sync(c: Ctx) {
  const text = await bodyText(c, MAX_ACCOUNTS_BODY);
  if (text === null) return c.json({ error: HTTP.accountsTooLarge }, 413);
  const s = parseSync(text);
  if ('error' in s) return c.json(s, 400);
  const device = await devices.get(c.var.db, s.id);
  if (!device) return c.json({ error: HTTP.unknownDevice }, 404);
  if (!device.keyHash) return c.json({ error: HTTP.noDeviceKey }, 403);
  if (!(await devices.keyOf(device, s.key))) return c.json({ error: HTTP.wrongDeviceKey }, 403);
  if (device.blocked) return c.json({ error: HTTP.blockedDevice }, 403);
  if (!device.syncAllowed) return c.json({ error: HTTP.syncNotAllowed }, 403);
  try {
    const done = await accounts.syncDevice(c.var.db, s.accounts, devices.sourceOf(device));
    await devices.synced(c.var.db, s.id, s.settings);
    return c.json(done);
  } catch (e) {
    if (e instanceof accounts.Busy) return c.json({ error: e.message }, 503);
    throw e;
  }
}

export async function page(c: Ctx) {
  const list = await devices.list(c.var.db);
  return render(c, (n) => <DevicesView nonce={n} list={list} flash={flash(c)} now={Date.now()} />);
}

/** Chặn, Bỏ chặn, Đặt tên, Xoá khỏi danh sách, Cho đồng bộ, Tắt đồng bộ; back to the page with what was done. */
export async function act(c: Ctx) {
  const { id, action } = c.req.param() as { id: string; action: 'block' | 'unblock' | 'rename' | 'delete' | 'sync-on' | 'sync-off' };
  const db = c.var.db;
  const form = formObject(c.var.form);
  const done = {
    block: () => devices.block(db, id, blockForm.parse(form).reason).then(() => 'blocked'),
    unblock: () => devices.unblock(db, id).then(() => 'unblocked'),
    rename: () => devices.rename(db, id, renameForm.parse(form).label).then(() => 'renamed'),
    delete: () => devices.forget(db, id).then(() => 'forgotten'),
    'sync-on': () => devices.allowSync(db, id, true).then(() => 'syncOn'),
    'sync-off': () => devices.allowSync(db, id, false).then(() => 'syncOff'),
  }[action];
  return c.redirect(`/admin/devices?done=${await done()}`, 303);
}
