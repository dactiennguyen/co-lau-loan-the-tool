// Bạch Hổ Thống Lĩnh, the world boss of Hang Bạch Hổ (M24, through portal 1006 of Cổng Luyện Ngục M15): every day from
// 21:00 Vietnam time for an hour, from level 30 (docs/app/events/17-bach-ho.md). Without React, like utils/format.ts.

/** The hour the cave opens and how long, in Vietnam time (UTC+7), whatever the clock of the computer is set to. */
export const BACH_HO_HOUR = 21;
export const BACH_HO_MINUTES = 60;
/** The least level that may go in. */
export const BACH_HO_LEVEL = 30;
const VN_OFFSET_MS = 7 * 3_600_000;

export type BachHoPhase = "before" | "open";

/** Where today stands: before the cave opens (`minutes` until it does, today or tomorrow) or open (`minutes` left). */
export function bachHoClock(now: number): { phase: BachHoPhase; minutes: number } {
  const vn = new Date(now + VN_OFFSET_MS);
  const minute = vn.getUTCHours() * 60 + vn.getUTCMinutes();
  const start = BACH_HO_HOUR * 60;
  if (minute >= start && minute < start + BACH_HO_MINUTES) return { phase: "open", minutes: start + BACH_HO_MINUTES - minute };
  return { phase: "before", minutes: (start - minute + 24 * 60) % (24 * 60) };
}

/** 135 → "2 giờ 15 phút", 7 → "7 phút". */
export function minutesText(minutes: number): string {
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return h ? (m ? `${h} giờ ${m} phút` : `${h} giờ`) : `${m} phút`;
}

/** 135 → "2:15", 7 → "0:07": the short countdown of the sidebar button. */
export function minutesClock(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** "21:00" → minutes of the day, null when it is not a time. */
function minuteOf(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  const h = Number(m[1]), min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/**
 * The run of the Bạch Hổ window for "from" and "until" (Vietnam time): today's, or tomorrow's once today's end is past;
 * an end before the start is the next day. In ms since 1970, whether it is on now, the minutes left of it and to its
 * start. Null for a time that is not one, or a run of no length.
 */
export function runWindow(from: string, until: string, now: number) {
  const a = minuteOf(from), b = minuteOf(until);
  if (a == null || b == null || a === b) return null;
  const vn = new Date(now + VN_OFFSET_MS);
  const midnight = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - VN_OFFSET_MS;
  let fromMs = midnight + a * 60_000;
  let untilMs = midnight + b * 60_000 + (b < a ? 86_400_000 : 0);
  if (untilMs <= now) {
    fromMs += 86_400_000;
    untilMs += 86_400_000;
  }
  const open = now >= fromMs;
  return {
    fromMs,
    untilMs,
    open,
    leftMinutes: Math.ceil((untilMs - now) / 60_000),
    toStartMinutes: Math.max(0, Math.ceil((fromMs - now) / 60_000)),
    text: `${pad(Math.floor(a / 60))}:${pad(a % 60)}–${pad(Math.floor(b / 60))}:${pad(b % 60)}`,
  };
}

/** The level tabs of the Bạch Hổ window's list of accounts: 1–50, 51–100, 101–150 (and above, in the last). */
export type LevelTab = "low" | "mid" | "high";
export const LEVEL_TABS: { key: LevelTab; label: string }[] = [
  { key: "low", label: "Cấp 1–50" },
  { key: "mid", label: "Cấp 51–100" },
  { key: "high", label: "Cấp 101–150" },
];
export const levelTab = (level: number): LevelTab => (level <= 50 ? "low" : level <= 100 ? "mid" : "high");

/** The two waits of a run in seconds: between two moves in a battle, and from a battle's end to the next try. */
export interface BachHoWaits {
  move: number;
  rejoin: number;
}

/** The accounts to start, grouped by their waits (each one's own, else `shared`), one Bắt đầu each, in ms. */
export function waitGroups(ids: number[], own: Record<number, BachHoWaits>, shared: BachHoWaits) {
  const groups = new Map<string, { ids: number[]; moveMs: number; rejoinMs: number }>();
  for (const id of ids) {
    const w = own[id] ?? shared;
    const moveMs = Math.round(w.move * 1000), rejoinMs = Math.round(w.rejoin * 1000);
    const key = `${moveMs}/${rejoinMs}`;
    const g = groups.get(key) ?? { ids: [], moveMs, rejoinMs };
    g.ids.push(id);
    groups.set(key, g);
  }
  return [...groups.values()];
}
