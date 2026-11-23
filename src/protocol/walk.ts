// Đi lại như người chơi (MV1, 23/11/2026, game 1.1.1; docs/app/events/06-map-mobs.md#toạ-độ-và-di-chuyển): the
// character's own moves as c2s/1169, shaped as the phone sent them, on the one platform it stands on.
// - c2s/1169 = i32 x; i32 y; i32 state; 5 flag bytes (2 left, 3 right), server units (tiles of 32), the feet's y.
// - Running: a packet every 105–145 ms, ~230 units a second; on arriving, two packets of state 0 at once.
// - On a map load the game falls from the y of s2c/11 to the ground (state 6, up to ~48 units a packet), then state 0.
// - Where one stands is in the drawn layer of s2c/11 (layer 1): a tile drawn with nothing drawn above it. Layer 3 is not
//   collision. Slopes are tiles too and their ids are not told apart yet, so a walk keeps to one row of tiles.
import { Writer } from './protocol.ts';

export const STAND = 0, RUN = 1, FALL = 6;
export const WALK = {
  /** Units a second while running, and the gap between two packets (ms). */
  speed: 230, gapMin: 105, gapMax: 145,
  /** Falling: the speed at the first packet, what it gains a second, its top (units a second). */
  fallStart: 120, fallGain: 2000, fallMax: 400,
  /** Kept from either end of a platform; the narrowest platform walked on (both in units). */
  margin: 12, minRun: 96,
  /** A walk goes this far at least and at most (units). */
  stepMin: 24, stepMax: 160,
} as const;

export interface Grid { rows: number; cols: number; tiles: number[] }
export interface Step { at: number; x: number; y: number; state: number; flags: number[] }

const drawn = (g: Grid, r: number, c: number) => r >= 0 && r < g.rows && c >= 0 && c < g.cols && g.tiles[r * g.cols + c] !== 0;
/** A tile one can stand on: drawn, with nothing drawn above it. */
export const standable = (g: Grid, r: number, c: number) => drawn(g, r, c) && !drawn(g, r - 1, c);

/** The row of the ground under (x, y), from the row of y down: the first standable tile of that column; null when none. */
export function groundRow(g: Grid, x: number, y: number) {
  const c = Math.floor(x / 32);
  if (c < 0 || c >= g.cols) return null;
  for (let r = Math.max(0, Math.floor(y / 32)); r < g.rows; r++) if (standable(g, r, c)) return r;
  return null;
}

/** The x range one can walk on along row `r` from column of `x`: the standable tiles side by side, less WALK.margin at
 * either end; null when narrower than WALK.minRun. */
export function platform(g: Grid, r: number, x: number) {
  let lo = Math.floor(x / 32), hi = lo;
  if (!standable(g, r, lo)) return null;
  while (standable(g, r, lo - 1)) lo--;
  while (standable(g, r, hi + 1)) hi++;
  if ((hi - lo + 1) * 32 < WALK.minRun) return null;
  return { from: lo * 32 + WALK.margin, to: (hi + 1) * 32 - WALK.margin };
}

export const RIGHT = [0, 0, 0, 1, 0], LEFT = [0, 0, 1, 0, 0], NONE = [0, 0, 0, 0, 0];

/** The fall from (x, y) to the ground, as the game after a map load; [] when standing on it already or none is under. */
export function planFall(g: Grid, x: number, y: number, right: boolean, pick: (lo: number, hi: number) => number): Step[] {
  const r = groundRow(g, x, y);
  if (r == null || r * 32 <= y) return [];
  const ground = r * 32, steps: Step[] = [];
  let at = 0, v: number = WALK.fallStart, now = y;
  steps.push({ at, x, y: now, state: FALL, flags: NONE });
  while (now < ground) {
    const gap = pick(WALK.gapMin, WALK.gapMax);
    at += gap;
    v = Math.min(WALK.fallMax, v + (WALK.fallGain * gap) / 1000);
    now = Math.min(ground, now + Math.round((v * gap) / 1000));
    steps.push({ at, x, y: now, state: now < ground ? FALL : STAND, flags: now < ground ? NONE : right ? RIGHT : LEFT });
  }
  return steps;
}

/** A walk on the platform under (x, y) to a spot `pick` chooses (WALK.stepMin to WALK.stepMax away, inside it), then
 * the two packets of standing; [] when (x, y) is not on the ground or the platform is too narrow. */
export function planWalk(g: Grid, x: number, y: number, pick: (lo: number, hi: number) => number): Step[] {
  if (y % 32 !== 0) return [];
  const r = y / 32, p = platform(g, r, x);
  if (!p || x < p.from || x > p.to) return [];
  const room = [p.to - x, x - p.from];
  const ways = [room[0] >= WALK.stepMin, room[1] >= WALK.stepMin];
  if (!ways[0] && !ways[1]) return [];
  const right = ways[0] && (!ways[1] || pick(0, 1) === 1);
  const far = pick(WALK.stepMin, Math.max(WALK.stepMin, Math.min(WALK.stepMax, right ? room[0] : room[1])));
  const target = right ? x + far : x - far, flags = right ? RIGHT : LEFT, steps: Step[] = [];
  let at = 0, now = x;
  while (now !== target) {
    steps.push({ at, x: now, y, state: RUN, flags });
    const gap = pick(WALK.gapMin, WALK.gapMax);
    at += gap;
    const d = Math.round((WALK.speed * gap) / 1000);
    now = right ? Math.min(target, now + d) : Math.max(target, now - d);
  }
  steps.push({ at, x: now, y, state: STAND, flags }, { at, x: now, y, state: STAND, flags });
  return steps;
}

/** c2s/1169. */
export const moveBytes = (s: Step) => s.flags.reduce((w, f) => w.u8(f), new Writer().i32(s.x).i32(s.y).i32(s.state)).build();
