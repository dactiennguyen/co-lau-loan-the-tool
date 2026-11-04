// Times as the admin page shows them, in Vietnam's time zone.
import { VN_OFFSET_MS } from '../config/constants.ts';
import type { DurationUnit } from '../models/index.ts';

export const time = (ms: number | null) =>
  ms == null
    ? '—'
    : new Date(ms).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, dateStyle: 'short', timeStyle: 'short' });

/** "5 phút trước", from the time of the page. */
export function ago(ms: number, now: number): string {
  const m = Math.max(0, Math.round((now - ms) / 60_000));
  if (m < 1) return 'vừa xong';
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h} giờ trước` : `${Math.round(h / 24)} ngày trước`;
}

const vnDate = (ms: number) => new Date(ms + VN_OFFSET_MS).toISOString().slice(0, 10);

/** The last day a key works, "dd/mm/yyyy" in Vietnam: the day of the last millisecond before `expiresAt`. */
export function lastDay(expiresAt: number): string {
  const [y, m, d] = vnDate(expiresAt - 1).split('-');
  return `${d}/${m}/${y}`;
}

/** The same day as a date field holds it, "yyyy-mm-dd". */
export const lastDayInput = (expiresAt: number) => vnDate(expiresAt - 1);

/** Today in Vietnam, "yyyy-mm-dd". */
export const today = (now: number) => vnDate(now);

/** Midnight in Vietnam that began the day of `ms`. */
export const startOfDay = (ms: number) => Date.parse(`${vnDate(ms)}T00:00:00Z`) - VN_OFFSET_MS;

/** "10:09", the time of day in Vietnam. */
export const clock = (ms: number) => new Date(ms + VN_OFFSET_MS).toISOString().slice(11, 16);

/** The same day in Vietnam. */
export const sameDay = (a: number, b: number) => vnDate(a) === vnDate(b);

/** The day `n` days after "yyyy-mm-dd". */
export const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** "yyyy-mm-dd" as "dd/mm/yyyy". */
export const dayText = (date: string) => date.split('-').reverse().join('/');

/** The units of a key's duration, as the Key page names them, in order. */
export const DURATION_UNITS: Record<DurationUnit, string> = { day: 'ngày', month: 'tháng', year: 'năm' };

/** "10 năm". */
export const durationText = (n: number, unit: DurationUnit) => `${n} ${DURATION_UNITS[unit]}`;

/** How the pages name a key: its note, else the start of the key ("CLLT-26WM"). */
export const keyName = (k: { key: string; note: string }) => k.note || k.key.slice(0, 9);
