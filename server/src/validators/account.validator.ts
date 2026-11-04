// The accounts of a JSON sent to POST /api/accounts or POST /api/license/sync, checked with Zod as backup::parse of the
// app reads them.
import { z } from 'zod';
import { DEFAULT_SERVER_ID, EXPORT_FORMAT } from '../config/constants.ts';
import { ACCOUNT } from '../config/messages.ts';
import type { Account } from '../models/index.ts';
import { check, json } from './form.ts';

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

/** Xuất JSON of the app: {"format", "accounts": […]}, its "settings" and the rest left aside. */
const exported = z.looseObject({
  format: z.number().optional().catch(undefined),
  accounts: z.array(z.unknown(), { error: ACCOUNT.notList }),
});

/** The error of an account of a list: "Nick thứ n: …", n counted from 1. */
export function accountError(issue: z.core.$ZodIssue, at = 0): string {
  const n = issue.path[at];
  return typeof n === 'number' ? ACCOUNT.nth(n + 1, issue.message) : issue.message;
}

/** The accounts of a JSON, as backup::parse of the app reads them: Xuất JSON ({"accounts": […]}), an accounts.json, a
 * list, or one account with "username". An account without "password" comes with an empty one. The error says what is
 * wrong, in the words of the app. */
export function parse(body: string): Account[] | { error: string } {
  const trimmed = body.trim().replace(/^﻿/, '');
  if (!trimmed) return { error: ACCOUNT.empty };
  const read = json(trimmed, ACCOUNT.badJson);
  if (!read.ok) return { error: read.error };
  const value = read.value;
  let list: unknown[];
  if (Array.isArray(value)) list = value;
  else if (isObject(value) && 'accounts' in value) {
    const file = check(exported, value);
    if (!file.ok) return { error: file.error };
    if ((file.data.format ?? 0) > EXPORT_FORMAT) return { error: ACCOUNT.newerFormat(file.data.format!) };
    list = file.data.accounts;
  } else if (isObject(value) && 'username' in value) list = [value];
  else return { error: ACCOUNT.noAccounts };
  if (list.length === 0) return { error: ACCOUNT.none };
  return accountsOf(list);
}

/** The accounts of a list, each checked by accountSchema; the error names the first one wrong. */
export function accountsOf(list: unknown[]): Account[] | { error: string } {
  const r = z.array(accountSchema).safeParse(list);
  return r.success ? (r.data as Account[]) : { error: accountError(r.error.issues[0]!) };
}
