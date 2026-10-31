import type { Character, Status } from "./types";

const numbers = new Intl.NumberFormat("vi-VN");
const percents = new Intl.NumberFormat("vi-VN", { maximumFractionDigits: 1 });

/** 14238 → "14.238"; null → "—". */
export const num = (n: number | null | undefined) => (n == null ? "—" : numbers.format(n));
export const pct = (part: number) => `${percents.format(part * 100)}%`;
export const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);

/** 245 → "4:05", 3723 → "1:02:03": seconds as a clock. */
export function clock(secs: number) {
  const two = (n: number) => String(n).padStart(2, "0");
  const [h, m, s] = [Math.floor(secs / 3600), Math.floor(secs / 60) % 60, secs % 60];
  return h > 0 ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

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

/** The notes of a release (the body of its release commit) in paragraphs: a line goes on with the one before unless a
 * blank line or a "- " starts it. */
export function paragraphs(notes: string): string[] {
  const out: string[] = [];
  let open = false;
  for (const raw of notes.split("\n")) {
    const line = raw.trim();
    if (!line) open = false;
    else if (open && !/^[-•*] /.test(line)) out[out.length - 1] += ` ${line}`;
    else {
      out.push(line);
      open = true;
    }
  }
  return out;
}
