// The forms of the admin page, checked with Zod: Đăng nhập and Đổi mật khẩu. Each error is that of a field, so the page
// shows it under the field.
import { z } from 'zod';
import { DEFAULT_PASSWORD, MIN_PASSWORD } from '../config/constants.ts';
import { AUTH } from '../config/messages.ts';

const text = z.string().catch('');

/** Đăng nhập: anything is read; a wrong one is told by the login itself, which counts it. */
export const loginForm = z.object({ username: text.transform((s) => s.trim()), password: text });

/** Đổi mật khẩu: long enough, not "admin" nor the current one, typed twice the same. Whether the current one is right
 * is the service's to say (services/auth.service.ts). */
export const passwordForm = z
  .object({
    current: z.string({ error: AUTH.noCurrent }).min(1, AUTH.noCurrent),
    next: z.string({ error: AUTH.tooShort }).min(MIN_PASSWORD, AUTH.tooShort),
    confirm: text,
  })
  .superRefine((v, ctx) => {
    if (v.next === DEFAULT_PASSWORD || v.next === v.current) ctx.addIssue({ code: 'custom', message: AUTH.sameAsOld, path: ['next'] });
    if (v.confirm !== v.next) ctx.addIssue({ code: 'custom', message: AUTH.mismatch, path: ['confirm'] });
  });
