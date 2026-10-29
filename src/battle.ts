// 8×8 board of the mob battle (docs/app/events/07-auto-battle.md). Rules come from replaying captured battles:
// runs of ≥3 (gold 0x46 included) clear, columns fall, new pieces fill column by column left→right and
// bottom→top within a column, cascades repeat; a run ≥4 in any wave grants an extra turn.
// Codes 10..69 are special pieces of type code%10 that also clear their 3×3 neighbourhood.
export const N = 8, EMPTY = -1, UNKNOWN = -2;
export const PIECE = { sword: 0, heart: 1, yinyang: 2, drop: 3, peach: 4, star: 5, gold: 0x46 } as const;
export type Board = number[];
export interface Move { from: [number, number]; to: [number, number] }
export interface Outcome { cleared: Record<number, number>; waves: number; extraTurn: boolean; refillUsed: number }

export const kind = (v: number) => (v >= 10 && v < 0x46 ? v % 10 : v);
const special = (v: number) => v >= 10 && v < 0x46;

export function findRuns(b: Board) {
  const cells = new Set<number>(), runs: { piece: number; len: number }[] = [];
  const at = (r: number, c: number) => (b[r * N + c] < 0 ? b[r * N + c] : kind(b[r * N + c]));
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const v = at(r, c); if (v < 0) continue;
    let k = 1; while (c + k < N && at(r, c + k) === v) k++;
    if (k >= 3 && (c === 0 || at(r, c - 1) !== v)) { runs.push({ piece: v, len: k }); for (let i = 0; i < k; i++) cells.add(r * N + c + i); }
    k = 1; while (r + k < N && at(r + k, c) === v) k++;
    if (k >= 3 && (r === 0 || at(r - 1, c) !== v)) { runs.push({ piece: v, len: k }); for (let i = 0; i < k; i++) cells.add((r + i) * N + c); }
  }
  // A cleared special piece blasts its 3×3 neighbourhood; blasts chain through other specials (chaining not yet observed).
  const pending = [...cells].filter(i => special(b[i]));
  while (pending.length) {
    const i = pending.pop()!, r0 = Math.floor(i / N), c0 = i % N;
    for (let r = r0 - 1; r <= r0 + 1; r++) for (let c = c0 - 1; c <= c0 + 1; c++) {
      if (r < 0 || r >= N || c < 0 || c >= N) continue;
      const j = r * N + c; if (cells.has(j) || b[j] < 0) continue;
      cells.add(j); if (special(b[j])) pending.push(j);
    }
  }
  return { cells, runs };
}

/** Gravity, then fill holes from `refill` (or UNKNOWN when it runs out). Returns how many refill pieces were used. */
function collapse(b: Board, refill: readonly number[] | null, start: number): number {
  for (let c = 0; c < N; c++) {
    let w = N - 1;
    for (let r = N - 1; r >= 0; r--) if (b[r * N + c] !== EMPTY) b[w-- * N + c] = b[r * N + c];
    for (; w >= 0; w--) b[w * N + c] = EMPTY;
  }
  let used = start;
  for (let c = 0; c < N; c++) for (let r = N - 1; r >= 0; r--) if (b[r * N + c] === EMPTY) b[r * N + c] = refill && used < refill.length ? refill[used++] : UNKNOWN;
  return used;
}

/** Clears cascades in place. With refill=null new cells become UNKNOWN (never match): a lower bound for planning. */
export function settle(b: Board, refill: readonly number[] | null, removed: number[] = []): Outcome {
  const cleared: Record<number, number> = {};
  let used = 0, waves = 0, extraTurn = false;
  if (removed.length) { for (const i of removed) { cleared[kind(b[i])] = (cleared[kind(b[i])] ?? 0) + 1; b[i] = EMPTY; } used = collapse(b, refill, used); }
  for (;;) {
    const { cells, runs } = findRuns(b); if (!cells.size) break;
    if (runs.some(x => x.len >= 4)) extraTurn = true;
    waves++;
    for (const i of cells) { cleared[kind(b[i])] = (cleared[kind(b[i])] ?? 0) + 1; b[i] = EMPTY; }
    used = collapse(b, refill, used);
  }
  return { cleared, waves, extraTurn, refillUsed: used };
}

export function swap(b: Board, m: Move) {
  const i = m.from[0] * N + m.from[1], j = m.to[0] * N + m.to[1];
  [b[i], b[j]] = [b[j], b[i]];
}

export function legalMoves(b: Board): Move[] {
  const out: Move[] = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) for (const [dr, dc] of [[0, 1], [1, 0]]) {
    const r2 = r + dr, c2 = c + dc; if (r2 >= N || c2 >= N) continue;
    const m: Move = { from: [r, c], to: [r2, c2] }, t = b.slice();
    if (t[r * N + c] < 0 || t[r2 * N + c2] < 0 || kind(t[r * N + c]) === kind(t[r2 * N + c2])) continue;
    swap(t, m);
    if (findRuns(t).cells.size) out.push(m);
  }
  return out;
}

export interface Weights { [piece: number]: number; extraTurn: number; reply: number }
export const DEFAULT_WEIGHTS: Weights = { 0: 10, 1: 2, 2: 2, 3: 2, 4: 1, 5: 1, 0x46: 1, extraTurn: 30, reply: 0.7 };

function gain(o: Outcome, w: Weights) {
  let s = o.extraTurn ? w.extraTurn : 0;
  for (const [p, n] of Object.entries(o.cleared)) s += (w[Number(p)] ?? 1) * n;
  return s;
}

/** Greedy 2-ply: my gain on known pieces, minus the opponent's best reply when I do not keep the turn. */
export function bestMove(b: Board, w: Weights = DEFAULT_WEIGHTS) {
  let best: { move: Move; score: number; outcome: Outcome } | null = null;
  for (const m of legalMoves(b)) {
    const t = b.slice(); swap(t, m);
    const o = settle(t, null);
    let score = gain(o, w);
    if (!o.extraTurn) {
      let reply = 0;
      for (const r of legalMoves(t)) { const u = t.slice(); swap(u, r); reply = Math.max(reply, gain(settle(u, null), w)); }
      score -= w.reply * reply;
    }
    if (!best || score > best.score) best = { move: m, score, outcome: o };
  }
  return best;
}
