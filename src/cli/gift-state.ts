import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

// The codes refused in a row, per nick, between runs of npm run gift (docs/integration/nodejs/mail.md#nhập-mã-quà-tặng):
// the server counts them across logins and blocks every code for 5 minutes at 10. Local only (.gitignore).
export const GIFT_STATE = '.cache/gift-codes.json';
export interface GiftState { wrong: number; lockedUntil?: number; at: string }

const read = (path: string): Record<string, GiftState> => {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return {}; }
};
export const loadGiftState = (user: string, path = GIFT_STATE): GiftState | undefined => read(path)[user.toLowerCase()];
export function saveGiftState(user: string, state: GiftState, path = GIFT_STATE) {
  const all = read(path);
  all[user.toLowerCase()] = state;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(all, null, 2) + '\n');
}
