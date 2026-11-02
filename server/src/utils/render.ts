// An admin page as the response: a fresh nonce for its inline style and script, in the Content-Security-Policy too.
import { contentSecurityPolicy } from '../config/constants.ts';
import type { Ctx } from '../types/app.ts';
import { b64url, random } from './crypto.ts';

/** A template of views/ (escaped already), or a line of plain text that goes out as it is. */
type View = string | Promise<string>;

export function render(c: Ctx, view: (nonce: string) => View, status: 200 | 400 | 401 | 403 | 404 | 500 = 200) {
  const nonce = b64url(random(16));
  c.header('Content-Security-Policy', contentSecurityPolicy(nonce));
  return c.html(view(nonce), status);
}
