// An admin page as the response: a fresh nonce for its inline style and script, in the Content-Security-Policy too,
// and the doctype before the page (a JSX component of views/) or before a line of plain text.
import { html } from 'hono/html';
import type { Child } from 'hono/jsx';
import { contentSecurityPolicy } from '../config/constants.ts';
import type { Ctx } from '../types/app.ts';
import { b64url, random } from './crypto.ts';

export function render(c: Ctx, view: (nonce: string) => Child, status: 200 | 400 | 401 | 403 | 404 | 500 = 200) {
  const nonce = b64url(random(16));
  c.header('Content-Security-Policy', contentSecurityPolicy(nonce));
  return c.html(html`<!doctype html>${view(nonce)}`, status);
}
