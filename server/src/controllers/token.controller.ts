// API token: the list, Tạo token (shown once), Thu hồi.
import { MAX_TOKEN_NAME } from '../config/constants.ts';
import { HTTP } from '../config/messages.ts';
import * as tokens from '../services/token.service.ts';
import type { Ctx } from '../types/app.ts';
import { field } from '../utils/http.ts';
import { render } from '../utils/render.ts';
import { tokensView } from '../views/tokens.view.ts';

export async function page(c: Ctx) {
  const list = await tokens.list(c.var.db);
  return render(c, (n) => tokensView(n, list));
}

export async function create(c: Ctx) {
  const db = c.var.db;
  const name = field(c, 'name').trim();
  if (!name || name.length > MAX_TOKEN_NAME) {
    const list = await tokens.list(db);
    return render(c, (n) => tokensView(n, list, null, HTTP.tokenName), 400);
  }
  const token = await tokens.create(db, name);
  const list = await tokens.list(db);
  return render(c, (n) => tokensView(n, list, { name, token }));
}

export async function remove(c: Ctx) {
  await tokens.remove(c.var.db, Number(c.req.param('id')));
  return c.redirect('/admin/tokens', 303);
}
