// 8×8 board of the mob battle (docs/app/events/07-auto-battle.md). Rules come from replaying captured battles:
// runs of ≥3 (gold 0x46 included) clear, columns fall, new pieces fill column by column left→right and
// bottom→top within a column, cascades repeat; a run ≥4 in any wave grants an extra turn, and so do two runs of the
// same piece crossing (the in-game guide "Cẩm nang"; never seen in the captured battles).
// Codes 10..69 are special pieces of type code%10 ("Kiếm lửa") that also clear their 3×3 neighbourhood.
// The packet readers at the end follow docs/app/events/05-battle.md; cells go on the wire as row+2, col+2.
import { Reader } from './protocol.ts';

export const N = 8, EMPTY = -1, UNKNOWN = -2;
// Effects measured in Q5/Q6 (docs/app/events/07-auto-battle.md): sword deals damage; heart heals; yin-yang fills stat1
// (nội lực, for skills); peach fills stat2 (power) and at 100 the next sword hit deals double; drop and star add
// battle EXP (2 and 4 each, plus a base of ~26-30); gold adds 2 Xu khóa each.
export const PIECE = { sword: 0, heart: 1, yinyang: 2, peach: 3, drop: 4, star: 5, gold: 0x46 } as const;
export type Board = number[];
export interface Move { from: [number, number]; to: [number, number] }
export interface Outcome { cleared: Record<number, number>; waves: number; extraTurn: boolean; refillUsed: number }

export const kind = (v: number) => (v >= 10 && v < 0x46 ? v % 10 : v);
const special = (v: number) => v >= 10 && v < 0x46;

export function findRuns(b: Board) {
  const cells = new Set<number>(), runs: { piece: number; len: number; cells: number[] }[] = [];
  const at = (r: number, c: number) => (b[r * N + c] < 0 ? b[r * N + c] : kind(b[r * N + c]));
  const add = (piece: number, run: number[]) => { runs.push({ piece, len: run.length, cells: run }); for (const i of run) cells.add(i); };
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const v = at(r, c); if (v < 0) continue;
    let k = 1; while (c + k < N && at(r, c + k) === v) k++;
    if (k >= 3 && (c === 0 || at(r, c - 1) !== v)) add(v, Array.from({ length: k }, (_, i) => r * N + c + i));
    k = 1; while (r + k < N && at(r + k, c) === v) k++;
    if (k >= 3 && (r === 0 || at(r - 1, c) !== v)) add(v, Array.from({ length: k }, (_, i) => (r + i) * N + c));
  }
  return { cells: blast(b, cells), runs };
}

/** A cleared special piece blasts its 3×3 neighbourhood, whether a run or a skill cleared it (Q5); blasts chain
 * through other specials (chaining not yet observed). Adds the blasted cells to `cells`. */
function blast(b: Board, cells: Set<number>) {
  const pending = [...cells].filter(i => special(b[i]));
  while (pending.length) {
    const i = pending.pop()!, r0 = Math.floor(i / N), c0 = i % N;
    for (let r = r0 - 1; r <= r0 + 1; r++) for (let c = c0 - 1; c <= c0 + 1; c++) {
      if (r < 0 || r >= N || c < 0 || c >= N) continue;
      const j = r * N + c; if (cells.has(j) || b[j] < 0) continue;
      cells.add(j); if (special(b[j])) pending.push(j);
    }
  }
  return cells;
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
  if (removed.length) { for (const i of blast(b, new Set(removed))) { cleared[kind(b[i])] = (cleared[kind(b[i])] ?? 0) + 1; b[i] = EMPTY; } used = collapse(b, refill, used); }
  for (;;) {
    const { cells, runs } = findRuns(b); if (!cells.size) break;
    if (runs.some(x => x.len >= 4) || runs.some((x, i) => runs.some((y, j) => j > i && x.piece === y.piece && x.cells.some(c => y.cells.includes(c))))) extraTurn = true;
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
/** `kill` ends battles sooner (swords, power); `exp` collects EXP and coin pieces on the way. */
export const WEIGHTS: Record<'kill' | 'exp', Weights> = {
  kill: { 0: 10, 1: 2, 2: 1, 3: 3, 4: 1, 5: 1, 0x46: 0.5, extraTurn: 30, reply: 0.7 },
  exp: { 0: 10, 1: 2, 2: 1, 3: 3, 4: 4, 5: 8, 0x46: 2, extraTurn: 30, reply: 0.7 },
};

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

/** s2c/22: the player block, the mob block, then `string battleUuid; i32 64; u8[64] board; u8 turnSeconds; u8`.
 * Only the head of the player block and the tail are read; `knownBytes` counts them. */
export function battleSetup(payload: Uint8Array) {
  const r = new Reader(payload); r.u8(); r.u8();
  const me = r.string(); r.string(); r.u8(); r.u8(); r.u8(); const level = r.i32(); r.i32(); r.u8();
  const hp = r.i32(), maxHp = r.i32(), head = r.offset, tail = 4 + 36 + 4 + N * N + 2;
  const t = new Reader(Buffer.from(payload).subarray(payload.length - tail));
  const uuid = t.string(); t.i32();
  return { me, level, hp, maxHp, uuid, board: [...t.take(N * N)], turnSeconds: t.u8(), knownBytes: head + tail };
}

/** s2c/18 answering c2s/18. timed 0: turn-based, c2s/14 seq 0 asks for the mob's first move. timed 1 (Sơn Tặc, Q6–Q9):
 * no turns; the player swaps at will (c2s/19 from seq 0) and the mob hits every ~30 s with s2c/21. */
export function battleJoinAck(r: Reader) {
  return { field0: r.i32(), timed: r.u8(), field5: r.u8() };
}

/** s2c/24: whose turn it is. playerTurn 0 also arrives when the player's 30 s run out. */
export function turnState(r: Reader) {
  return { seq: r.i32(), field: r.i32(), playerTurn: r.u8(), field9: r.u8() };
}

/** s2c/19 (a swap) and s2c/20 (a skill): refill list, optional reshuffled board, unit changes, flags and, when `end`,
 * the reward head (the 7 bytes and the EXP table after it stay unread). A skill lists its target cells, then the cells
 * it destroys: skill 2000 has no target and destroys random cells, skill 1000 destroys a 2×2 block per target. */
export function battleResult(r: Reader, opcode: 19 | 20) {
  const seq = r.i32(); r.i32(); r.i32();
  const cellList = () => Array.from({ length: r.i32() }, () => (r.i32() - 2) * N + (r.i32() - 2));
  let move: Move | undefined, cells: number[] = [], skill: number | undefined, targets: number[] | undefined;
  if (opcode === 19) move = { from: [r.i32() - 2, r.i32() - 2], to: [r.i32() - 2, r.i32() - 2] };
  else { skill = r.i32(); r.i32(); targets = cellList(); cells = cellList(); }
  r.i32(); const refill = [...r.take(r.i32())];
  // u8 1 + i32 64 + 64 bytes when the server reshuffled the board after the move (no move left).
  const newBoard = r.u8() === 1 ? [...r.take(r.i32())] : undefined;
  r.take(3);
  return { seq, move, skill, targets, cells, refill, newBoard, ...resultTail(r) };
}

/** s2c/21: in a timed battle the mob hits on its ~30 s timer, without a board move; same tail as s2c/19 (Q6–Q9). */
export function timeoutResult(r: Reader) {
  const seq = r.i32(); r.i32(); r.i32();
  return { seq, cells: [] as number[], refill: [] as number[], ...resultTail(r) };
}

function resultTail(r: Reader) {
  const units = [];
  for (let n = r.u8(); n > 0; n--) units.push({ name: r.string(), damage: r.i32(), b: r.u8(), hp: r.i32(), s1: r.i32(), s2: r.i32() });
  const flags = [r.u8(), r.u8(), r.u8(), r.u8()], actor = r.string(), end = r.u8();
  const reward = end === 1 ? { won: r.u8() === 1, exp: r.i32(), coin: r.i32() } : undefined;
  return { units, extraTurn: flags[1] === 1, actor, end: end === 1, reward };
}
