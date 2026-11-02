// The accounts: GET and POST /api/accounts for the app, and the Nick page with Tải JSON and Xoá.
import { MAX_ACCOUNTS_BODY } from '../config/constants.ts';
import { HTTP } from '../config/messages.ts';
import * as accounts from '../services/account.service.ts';
import type { Ctx } from '../types/app.ts';
import { bodyText, flash } from '../utils/http.ts';
import { render } from '../utils/render.ts';
import { parse } from '../validators/account.validator.ts';
import { accountsView } from '../views/accounts.view.ts';

const JSON_TYPE = { 'Content-Type': 'application/json; charset=utf-8' };

/** GET /api/accounts: Xuất JSON of every account, passwords included. */
export async function exportJson(c: Ctx) {
  return c.body(await accounts.exported(c.var.db), 200, JSON_TYPE);
}

/** POST /api/accounts: add or replace the accounts of the JSON, as Nhập JSON of the app does. */
export async function sync(c: Ctx) {
  const text = await bodyText(c, MAX_ACCOUNTS_BODY);
  if (text === null) return c.json({ error: HTTP.accountsTooLarge }, 413);
  const sent = parse(text);
  if (!Array.isArray(sent)) return c.json(sent, 400);
  const done = await accounts.sync(c.var.db, sent, c.var.source);
  return c.json({ ...done, total: await accounts.count(c.var.db) });
}

export async function page(c: Ctx) {
  const rows = await accounts.list(c.var.db);
  return render(c, (n) => accountsView(n, rows, flash(c)));
}

/** Tải JSON: the same JSON as GET /api/accounts, as a file of the day. */
export async function download(c: Ctx) {
  const day = new Date().toISOString().slice(0, 10);
  return c.body(await accounts.exported(c.var.db), 200, {
    ...JSON_TYPE,
    'Content-Disposition': `attachment; filename="cllt-accounts-server-${day}.json"`,
  });
}

export async function remove(c: Ctx) {
  await accounts.remove(c.var.db, Number(c.req.param('id')));
  return c.redirect('/admin?done=deleted', 303);
}
