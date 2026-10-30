import type { Character, Status } from "./types";

const numbers = new Intl.NumberFormat("vi-VN");
const percents = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

/** 14238 → "14.238"; null → "—". */
export const num = (n: number | null | undefined) => (n == null ? "—" : numbers.format(n));
export const pct = (part: number) => `${percents.format(part * 100)}%`;
export const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** CSS colour variable of a status (tokens.css). */
export const statusTone = (s: Status) =>
  ["var(--s-offline)", "var(--s-connecting)", "var(--s-online)", "var(--s-fighting)", "var(--s-error)"][s];

export const isConnected = (s: Status) => s >= 1 && s <= 3;

/** Share of the level done, and the EXP still missing, from the level's EXP range. */
export function levelProgress(c: Character) {
  if (c.exp == null || !c.levelExp || c.levelExp[1] <= c.levelExp[0]) return null;
  const [lo, hi] = c.levelExp;
  return { part: clamp01((c.exp - lo) / (hi - lo)), left: Math.max(0, hi - c.exp), next: hi };
}

/** A stable avatar colour (0–5) for a name. */
export function hue(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)!) | 0;
  return Math.abs(h) % 6;
}

export const initial = (name: string) => (name.trim()[0] ?? "?").toUpperCase();
