// API token: the list, Tạo token (shown once), Thu hồi.
import * as tokens from '../services/token.service.ts';
import type { Ctx } from '../types/app.ts';
import { tokenForm } from '../validators/admin.validator.ts';
import { check, formObject } from '../validators/form.ts';
import { render } from '../utils/render.ts';
import { TokensView } from '../views/tokens.view.tsx';

export async function page(c: Ctx) {
  const list = await tokens.list(c.var.db);
  return render(c, (n) => <TokensView nonce={n} list={list} />);
}

export async function create(c: Ctx) {
  const db = c.var.db;
  const form = check(tokenForm, formObject(c.var.form));
  if (!form.ok) {
    const list = await tokens.list(db);
    return render(c, (n) => <TokensView nonce={n} list={list} errors={form.fields} />, 400);
  }
  const name = form.data.name;
  const token = await tokens.create(db, name);
  const list = await tokens.list(db);
  return render(c, (n) => <TokensView nonce={n} list={list} made={{ name, token }} />);
}

export async function remove(c: Ctx) {
  await tokens.remove(c.var.db, Number(c.req.param('id')));
  return c.redirect('/admin/tokens', 303);
}
