// The devices: POST /api/devices/hello for the app, and the Thiết bị page with its actions.
import { MAX_HELLO_BODY } from '../config/constants.ts';
import { HTTP } from '../config/messages.ts';
import * as devices from '../services/device.service.ts';
import type { Ctx } from '../types/app.ts';
import { bodyText, clientIp, field, flash } from '../utils/http.ts';
import { render } from '../utils/render.ts';
import { parseHello } from '../validators/device.validator.ts';
import { devicesView } from '../views/devices.view.ts';

/** POST /api/devices/hello: records the device and says whether it may run. */
export async function hello(c: Ctx) {
  const text = await bodyText(c, MAX_HELLO_BODY);
  if (text === null) return c.json({ error: HTTP.helloTooLarge }, 413);
  const h = parseHello(text);
  if ('error' in h) return c.json(h, 400);
  return c.json(await devices.hello(c.var.db, h, clientIp(c)));
}

export async function page(c: Ctx) {
  const list = await devices.list(c.var.db);
  return render(c, (n) => devicesView(n, list, flash(c), Date.now()));
}

/** Chặn, Bỏ chặn, Đặt tên, Xoá khỏi danh sách; back to the page with what was done. */
export async function act(c: Ctx) {
  const { id, action } = c.req.param() as { id: string; action: 'block' | 'unblock' | 'rename' | 'delete' };
  const db = c.var.db;
  const done = {
    block: () => devices.block(db, id, field(c, 'reason')).then(() => 'blocked'),
    unblock: () => devices.unblock(db, id).then(() => 'unblocked'),
    rename: () => devices.rename(db, id, field(c, 'label')).then(() => 'renamed'),
    delete: () => devices.forget(db, id).then(() => 'forgotten'),
  }[action];
  return c.redirect(`/admin/devices?done=${await done()}`, 303);
}
