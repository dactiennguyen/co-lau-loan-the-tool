// The accounts of a JSON sent to POST /api/accounts, read as backup::parse of the app reads them.
import { DEFAULT_SERVER_ID, EXPORT_FORMAT } from '../config/constants.ts';
import type { Account } from '../models/index.ts';

type Json = { [key: string]: unknown };
export const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The accounts of a JSON, as backup::parse of the app reads them: Xuất JSON ({"accounts": […]}), an accounts.json, a
 * list, or one account with "username". An account without "password" comes with an empty one. The error says what is
 * wrong, in the words of the app. */
export function parse(body: string): Account[] | { error: string } {
  const trimmed = body.trim().replace(/^﻿/, '');
  if (!trimmed) return { error: 'Chưa có JSON' };
  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch (e) {
    return { error: `JSON không hợp lệ: ${(e as Error).message}` };
  }
  let list: unknown[];
  if (Array.isArray(value)) list = value;
  else if (isObject(value) && 'accounts' in value) {
    if (typeof value.format === 'number' && value.format > EXPORT_FORMAT) {
      return { error: `JSON của bản app mới hơn (format ${value.format}): cập nhật server rồi gửi lại` };
    }
    if (!Array.isArray(value.accounts)) return { error: '"accounts" phải là một danh sách' };
    list = value.accounts;
  } else if (isObject(value) && 'username' in value) list = [value];
  else return { error: 'Không thấy nick nào: cần {"accounts": […]}, một danh sách nick, hoặc một nick có "username"' };
  if (list.length === 0) return { error: 'JSON không có nick nào' };
  const accounts: Account[] = [];
  for (const [i, item] of list.entries()) {
    const n = i + 1;
    if (!isObject(item)) return { error: `Nick thứ ${n} không phải một object` };
    const { username, password = '', label = '', serverId = DEFAULT_SERVER_ID } = item;
    if (typeof username !== 'string' || !username.trim()) return { error: `Nick thứ ${n}: thiếu tài khoản (username)` };
    if (typeof password !== 'string') return { error: `Nick thứ ${n}: "password" phải là chuỗi` };
    if (typeof label !== 'string') return { error: `Nick thứ ${n}: "label" phải là chuỗi` };
    if (!Number.isInteger(serverId)) return { error: `Nick thứ ${n}: "serverId" phải là số nguyên` };
    accounts.push({ ...item, label, username: username.trim(), password, serverId: serverId as number });
  }
  return accounts;
}
