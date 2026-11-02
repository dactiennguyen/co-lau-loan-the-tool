// The accounts of the desktop app, in the JSON of its Xuất JSON (app/desktop/src-tauri/src/backup.rs): what POST
// /api/accounts takes and GET /api/accounts gives back, so that Nhập JSON of the app reads it as it is.

/** As backup.rs writes them. */
export const APP = 'CLLT Tool';
export const FORMAT = 1;
/** The game server of an account without "serverId" (opcodes::SERVER_ID of cllt-core). */
export const SERVER_ID = 24;

/** One account as accounts.json has it: label, username, password, serverId, and whatever else the app keeps (skill,
 * stats, fight, fightTargets, proxy), kept as sent. */
export type Account = { [key: string]: unknown; label: string; username: string; password: string; serverId: number };

export interface Row {
  id: number;
  server_id: number;
  username: string;
  label: string;
  password: string;
  data: string;
  source: string;
  created_at: number;
  updated_at: number;
}

export interface Synced {
  added: number;
  updated: number;
  unchanged: number;
  /** Accounts after the first with the same username on the same server in the JSON: left out, as Nhập does. */
  repeated: number;
}

type Json = { [key: string]: unknown };
const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

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
    if (typeof value.format === 'number' && value.format > FORMAT) {
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
    const { username, password = '', label = '', serverId = SERVER_ID } = item;
    if (typeof username !== 'string' || !username.trim()) return { error: `Nick thứ ${n}: thiếu tài khoản (username)` };
    if (typeof password !== 'string') return { error: `Nick thứ ${n}: "password" phải là chuỗi` };
    if (typeof label !== 'string') return { error: `Nick thứ ${n}: "label" phải là chuỗi` };
    if (!Number.isInteger(serverId)) return { error: `Nick thứ ${n}: "serverId" phải là số nguyên` };
    accounts.push({ ...item, label, username: username.trim(), password, serverId: serverId as number });
  }
  return accounts;
}

/** JSON with the keys of every object in order, so that the same account is the same text however it was sent. */
export function canonical(value: unknown): string {
  const sort = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(sort)
      : isObject(v)
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])]))
        : v;
  return JSON.stringify(sort(value));
}

/** The account replacing `old`, as Ghi đè of the app (backup::replacement): everything sent, but an empty label or
 * password keeps the old one, and so does an empty proxy password for the same proxy user. */
export function replacement(old: Account, sent: Account): Account {
  const next: Account = { ...sent, label: sent.label.trim() ? sent.label : old.label, password: sent.password || old.password };
  const [was, now] = [old.proxy, sent.proxy];
  if (isObject(was) && isObject(now) && now.username && !now.password && now.username === was.username && was.password) {
    next.proxy = { ...now, password: was.password };
  }
  return next;
}

const key = (a: Account) => a.username.toLowerCase();

/** Đồng bộ lên: each account added, or put in place of the one of the same server and username (any case). `source`
 * is the name of the token that sent them. */
export async function sync(db: D1Database, accounts: Account[], source: string): Promise<Synced> {
  const done: Synced = { added: 0, updated: 0, unchanged: 0, repeated: 0 };
  const seen = new Set<string>();
  const now = Date.now();
  const writes: D1PreparedStatement[] = [];
  for (const sent of accounts) {
    const id = `${sent.serverId}\n${key(sent)}`;
    if (seen.has(id)) {
      done.repeated++;
      continue;
    }
    seen.add(id);
    const old = await db
      .prepare('SELECT id, data FROM accounts WHERE server_id = ? AND username_key = ?')
      .bind(sent.serverId, key(sent))
      .first<{ id: number; data: string }>();
    const next = old ? replacement(JSON.parse(old.data) as Account, sent) : sent;
    const data = canonical(next);
    if (old?.data === data) {
      done.unchanged++;
      continue;
    }
    if (old) {
      done.updated++;
      writes.push(
        db
          .prepare('UPDATE accounts SET username = ?, label = ?, password = ?, data = ?, source = ?, updated_at = ? WHERE id = ?')
          .bind(next.username, next.label, next.password, data, source, now, old.id),
      );
    } else {
      done.added++;
      // Another request may have added it meanwhile: this one then replaces it, as a later send would.
      writes.push(
        db
          .prepare(
            `INSERT INTO accounts (server_id, username, username_key, label, password, data, source, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (server_id, username_key) DO UPDATE SET username = excluded.username, label = excluded.label,
               password = excluded.password, data = excluded.data, source = excluded.source, updated_at = excluded.updated_at`,
          )
          .bind(next.serverId, next.username, key(next), next.label, next.password, data, source, now, now),
      );
    }
  }
  if (writes.length) await db.batch(writes);
  return done;
}

/** Every account, first added first. */
export async function rows(db: D1Database): Promise<Row[]> {
  const { results } = await db
    .prepare('SELECT id, server_id, username, label, password, data, source, created_at, updated_at FROM accounts ORDER BY id')
    .all<Row>();
  return results;
}

export async function count(db: D1Database): Promise<number> {
  return (await db.prepare('SELECT COUNT(*) AS n FROM accounts').first<number>('n')) ?? 0;
}

/** The JSON of GET /api/accounts and Tải JSON: Xuất JSON of the app, without its "settings". */
export async function exported(db: D1Database): Promise<string> {
  const accounts = (await rows(db)).map((r) => JSON.parse(r.data) as Account);
  return JSON.stringify({ app: APP, format: FORMAT, exportedAt: new Date().toISOString(), accounts }, null, 2) + '\n';
}

/** True when there was one to delete. */
export async function remove(db: D1Database, id: number): Promise<boolean> {
  const r = await db.prepare('DELETE FROM accounts WHERE id = ?').bind(id).run();
  return (r.meta.changes ?? 0) > 0;
}
