// An account of POST /api/license/sync, checked with Zod as backup::parse of the app reads one.
import { z } from 'zod';
import { DEFAULT_SERVER_ID } from '../config/constants.ts';
import { ACCOUNT } from '../config/messages.ts';

type Json = { [key: string]: unknown };
export const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** One account: a username, and a password, label and game server that default as the app's do. The rest the app keeps
 * (skill, stats, fight, fightTargets, proxy) is kept as sent. */
export const accountSchema = z.looseObject(
  {
    username: z.string({ error: ACCOUNT.noUsername }).trim().min(1, ACCOUNT.noUsername),
    password: z.string({ error: ACCOUNT.passwordText }).default(''),
    label: z.string({ error: ACCOUNT.labelText }).default(''),
    serverId: z.int({ error: ACCOUNT.serverIdInt }).default(DEFAULT_SERVER_ID),
  },
  { error: ACCOUNT.notObject },
);

/** The error of an account of a list: "Nick thứ n: …", n counted from 1. */
export function accountError(issue: z.core.$ZodIssue, at = 0): string {
  const n = issue.path[at];
  return typeof n === 'number' ? ACCOUNT.nth(n + 1, issue.message) : issue.message;
}
