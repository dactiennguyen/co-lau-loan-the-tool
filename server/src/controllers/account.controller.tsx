// The accounts: the Nick page with Tải JSON and Xoá.
import * as accounts from '../services/account.service.ts';
import * as licenses from '../services/license.service.ts';
import type { Ctx } from '../types/app.ts';
import { flash } from '../utils/http.ts';
import { render } from '../utils/render.ts';
import { AccountsView } from '../views/accounts.view.tsx';

const JSON_TYPE = { 'Content-Type': 'application/json; charset=utf-8' };

/** The Nick page; ?key=<id> shows the accounts that key sent last only. */
export async function page(c: Ctx) {
  const id = Number(c.req.query('key'));
  const keys = await licenses.names(c.var.db);
  const shown = keys.find((k) => k.id === id) ?? null;
  const rows = await accounts.list(c.var.db, shown?.id);
  return render(c, (n) => <AccountsView nonce={n} rows={rows} now={Date.now()} flash={flash(c)} keys={keys} shown={shown} />);
}

/** Tải JSON: Xuất JSON of every account, passwords included, as a file of the day: Nhập JSON of the app reads it. */
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
