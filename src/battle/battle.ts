// 8×8 board of the mob battle (docs/app/events/07-auto-battle.md). Rules come from replaying captured battles:
// runs of ≥3 (gold 0x46 included) clear, columns fall, new pieces fill column by column left→right and
// bottom→top within a column, cascades repeat; a run ≥4 in any wave grants an extra turn, and so do two runs of the
// same piece crossing (the in-game guide "Cẩm nang"; never seen in the captured battles).
// Codes 10..69 are special pieces of type code%10 ("Kiếm lửa") that also clear their 3×3 neighbourhood.
// The packet readers at the end follow docs/app/events/05-battle.md; cells go on the wire as row+2, col+2.
import { Reader } from '../protocol/protocol.ts';

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

/** The cells a skill that destroys `removed` clears before the board falls: those cells and the 3×3 blast of every
 * Kiếm lửa among them. */
export const blastCells = (b: Board, removed: readonly number[]) => blast(b, new Set(removed));

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

/** One side of a battle as the move search sees it: HP, stat1 (nội lực) and stat2 (power), and what one piece is worth
 * to it: damage per sword, HP per heart, stat1 per yin-yang, stat2 per peach, plus the stat1 its skill costs and the
 * damage the skill deals (skillCost 0: no skill). Defaults are the averages of Q16–Q19 (manina level 19 against Sói Xám
 * and Cóc Xanh, docs/app/events/07-auto-battle.md#thuật-toán-của-bot); BattleRunner replaces them with what it sees. */
export interface Fighter { hp: number; maxHp: number; s1: number; s2: number; sword: number; heart: number; yinyang: number; peach: number; skillCost: number; skillDamage: number }
export const fighter = (hp: number, maxHp: number, f: Partial<Fighter> = {}): Fighter =>
  ({ hp, maxHp, s1: 0, s2: 0, sword: 10, heart: 5.5, yinyang: 1.2, peach: 4.4, skillCost: 25, skillDamage: 60, ...f });
/** A mob before anything is known of it: HP unknown, Sói Xám and Cóc Xanh averaged. */
export const unknownMob = (): Fighter => fighter(Infinity, Infinity, { sword: 8, heart: 6, yinyang: 3, peach: 5, skillCost: 30, skillDamage: 40 });

/** extraTurn: worth of keeping the turn; reply: share of the opponent's answer subtracted (0 in a timed battle, where
 * the mob does not move pieces); bonus: worth of own EXP and coin pieces (goal `exp`).
 * mobModel `best` (Q20): the mob answers with the move worth most to it. `odds`: the mob plays as MOB_AI says it does
 * and the answer is what it is worth on average. lookahead: a move that keeps the turn is worth this share of the best
 * move after it, in place of the flat extraTurn. */
export interface Strategy { extraTurn: number; reply: number; bonus: Partial<Record<number, number>>; mobModel?: 'best' | 'odds'; lookahead?: number }
/** `kill` ends battles soonest; `exp` also collects drops, stars and gold on the way. `win` and `farm` are the same goals
 * with the mob as it really plays (MOB_AI) and a look at the move after an extra turn. In the simulator of
 * 07-auto-battle.md#thuật-toán-v2 (manina 174 HP against Cóc Xanh, HP carried from battle to battle, 12 hours) `win`
 * won 61.1 battles an hour against 55.5 for `kill`, and `farm` made 7728 EXP an hour against 5806. The Rust app
 * (app/core) plays `win` with bestAction (v3, runner_v3.rs); its v1 (runner.rs, `kill`) stays for comparison. export-rust
 * checks all four. */
export const STRATEGIES: Record<'kill' | 'exp' | 'win' | 'farm', Strategy> = {
  kill: { extraTurn: 10, reply: 1, bonus: {} },
  exp: { extraTurn: 10, reply: 1, bonus: { 4: 2, 5: 4, 0x46: 1 } },
  win: { extraTurn: 10, reply: 1, bonus: {}, mobModel: 'odds', lookahead: 1 },
  farm: { extraTurn: 10, reply: 1, bonus: { 4: 2, 5: 4, 0x46: 1 }, mobModel: 'odds', lookahead: 1 },
};

/** How the server's mob picks its swap, fitted on 1011 mob swaps of the bot traces (07-auto-battle.md#cách-quái-chọn-nước):
 * P(move) ∝ exp(Σ weight × feature) over its legal moves. Features: pieces of each kind in the first wave, pieces of the
 * later waves already known, whether the move keeps the turn, whether it is the first legal move of a scan by rows from
 * the top, columns from the left, down before right. The mob wants hearts, swords, yin-yang and peaches, ignores drops,
 * stars and gold, and likes an extra turn and the first move it finds. With the nội lực for its skill it casts half the
 * time (57 of 114 turns). */
export const MOB_AI = { piece: { 0: 0.379, 1: 0.412, 2: 0.255, 3: 0.163, 4: -0.068, 5: -0.054, 0x46: -0.028 } as Record<number, number>,
  cascade: -0.014, extraTurn: 1.485, firstFound: 1.024, cast: 0.5 };

/** The mob's legal moves on `b` with the share of the time it plays each (MOB_AI), and what each clears on the known
 * cells. */
export function mobMoveOdds(b: Board) {
  const out: { move: Move; p: number; outcome: Outcome }[] = [];
  let total = 0;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) for (const [dr, dc] of [[1, 0], [0, 1]]) {
    const r2 = r + dr, c2 = c + dc; if (r2 >= N || c2 >= N) continue;
    const i = r * N + c, j = r2 * N + c2;
    if (b[i] < 0 || b[j] < 0 || kind(b[i]) === kind(b[j])) continue;
    const move: Move = { from: [r, c], to: [r2, c2] }, t = b.slice(); swap(t, move);
    const first = findRuns(t).cells; if (!first.size) continue;
    let x = out.length ? 0 : MOB_AI.firstFound;
    for (const k of first) x += MOB_AI.piece[kind(t[k])] ?? 0;
    const outcome = settle(t, null), cleared = Object.values(outcome.cleared).reduce((a, n) => a + n, 0);
    x += (cleared - first.size) * MOB_AI.cascade + (outcome.extraTurn ? MOB_AI.extraTurn : 0);
    const p = Math.exp(x); total += p;
    out.push({ move, p, outcome });
  }
  for (const m of out) m.p /= total;
  return out;
}

const swordDamage = (o: Outcome, f: Fighter) => (o.cleared[0] ?? 0) * f.sword * (f.s2 >= 100 ? 2 : 1);
/** HP swing of an outcome for `actor` against `target`: damage (doubled at full power), healing up to the max, yin-yang
 * as its share of a skill, peach as its share of the next doubled hit (three swords). A killing move is worth 1e4. */
export function moveValue(o: Outcome, actor: Fighter, target: Fighter, s: Strategy, bonus: Strategy['bonus'] = {}) {
  const damage = swordDamage(o, actor);
  if (damage >= target.hp) return 1e4;
  // A mob whose HP is not known yet (Infinity) is at full HP: the battle has just started.
  let v = damage + Math.min((o.cleared[1] ?? 0) * actor.heart, actor.maxHp - actor.hp || 0) + (o.extraTurn ? s.extraTurn : 0);
  if (actor.skillCost) v += (o.cleared[2] ?? 0) * actor.yinyang * actor.skillDamage / actor.skillCost;
  if (actor.s2 < 100) v += Math.min(100 - actor.s2, (o.cleared[3] ?? 0) * actor.peach) / 100 * 3 * actor.sword;
  for (const [piece, n] of Object.entries(o.cleared)) v += (bonus[Number(piece)] ?? 0) * n;
  return v;
}

/** Two plies on the known pieces: own value of each move, minus `reply` × the mob's answer on the board it leaves (its
 * best move, or its average one under MOB_AI), valued with own HP after the heal and the mob's HP after the hit. A move
 * that keeps the turn is not answered; with `lookahead` it is worth that share of the best own move after it instead of
 * the flat extraTurn. */
export function bestMove(b: Board, me: Fighter = fighter(100, 100), mob: Fighter = unknownMob(), s: Strategy = STRATEGIES.kill) {
  const own = s.lookahead ? { ...s, extraTurn: 0 } : s;
  let best: { move: Move; score: number; outcome: Outcome } | null = null;
  for (const m of legalMoves(b)) {
    const t = b.slice(); swap(t, m);
    const o = settle(t, null);
    let score = moveValue(o, me, mob, own, s.bonus);
    if (score < 1e4) {
      const meAfter = { ...me, hp: Math.min(me.maxHp, me.hp + (o.cleared[1] ?? 0) * me.heart) }, mobAfter = { ...mob, hp: mob.hp - swordDamage(o, me) };
      if (o.extraTurn && s.lookahead) {
        let next = 0;
        for (const m2 of legalMoves(t)) { const u = t.slice(); swap(u, m2); next = Math.max(next, moveValue(settle(u, null), meAfter, mobAfter, own, s.bonus)); }
        score += s.lookahead * next;
      } else if (!o.extraTurn && s.reply) score -= s.reply * answerValue(t, mobAfter, meAfter, s);
    }
    if (!best || score > best.score) best = { move: m, score, outcome: o };
  }
  return best;
}

/** What the mob's answer on `t` (its turn) is worth to it: its best move (mobModel `best`), or the average under MOB_AI,
 * with its skill in place of a swap half the time once it has the nội lực (`odds`). */
export function answerValue(t: Board, mob: Fighter, me: Fighter, s: Strategy) {
  let v = 0;
  if (s.mobModel !== 'odds') {
    for (const r of legalMoves(t)) { const u = t.slice(); swap(u, r); v = Math.max(v, moveValue(settle(u, null), mob, me, s)); }
    return v;
  }
  for (const a of mobMoveOdds(t)) v += a.p * moveValue(a.outcome, mob, me, s);
  if (mob.skillCost && mob.s1 >= mob.skillCost) v = MOB_AI.cast * (mob.skillDamage >= me.hp ? 1e4 : mob.skillDamage) + (1 - MOB_AI.cast) * v;
  return v;
}

/** Whether to cast the own skill now rather than play `swapScore` (bestMove's best, null without a legal swap). Used for
 * the one skill of BattleIo.skill; with the learnt skills bestAction of battle-actions.ts decides instead. The skill
 * deals W × (3 + swords it destroys) + K, its sword part doubled at full power (07-auto-battle.md#công-thức-sát-thương):
 * on average `skillDamage` (+ 4 swords at full power), at least 3 swords (K is lost about one cast in seven). Cast when the
 * least damage kills, when the average damage less the mob's answer on the board as it stands beats the swap, or when
 * nội lực piles up to twice the cost. */
export function castSkill(b: Board, me: Fighter, mob: Fighter, s: Strategy, swapScore: number | null) {
  if (!me.skillCost || me.s1 < me.skillCost) return false;
  const full = me.s2 >= 100, least = 3 * me.sword * (full ? 2 : 1), damage = me.skillDamage + (full ? 4 * me.sword : 0);
  if (least >= mob.hp || swapScore === null || me.s1 >= 2 * me.skillCost) return true;
  const score = damage >= mob.hp ? 0.85e4 : damage - s.reply * answerValue(b, { ...mob, hp: mob.hp - damage }, me, s);
  return score >= swapScore;
}

/** The mob block of s2c/22, found by its length-prefixed id: `string id; string name; u8; u8; u8 element; i32 level; i32;
 * u8; i32 hp; i32 maxHp` (07-auto-battle.md#s2c22-641-byte). The element byte is 1 Hỏa, 2 Lôi, 4 Thủy as for items: Kẻ
 * Quấy Phá 1 (it casts Hỏa Cầu Thuật), Sói Xám 2, Cóc Xanh and Gà Điên 4 (its block lists the Thủy skills 4000–4008);
 * the player block has manina's 1 at the same place. Undefined when the id is not in the packet. */
export function mobBlock(payload: Uint8Array, mobId: string) {
  const id = Buffer.from(mobId), p = Buffer.from(payload);
  for (let i = p.indexOf(id); i >= 4; i = p.indexOf(id, i + 1)) {
    if (p.readInt32BE(i - 4) !== id.length) continue;
    const r = new Reader(p.subarray(i - 4)); r.string();
    const name = r.string(); r.u8(); r.u8(); const element = r.u8(), level = r.i32(); r.i32(); r.u8();
    return { name, element, level, hp: r.i32(), maxHp: r.i32() };
  }
}

/** The mob id of a duel's s2c/22, opened by Đồng ý to an NPC (c2s/57) rather than by a challenge (N1, "Tỷ thí với Võ Quan
 * Đinh Mộc"): the length-prefixed id just before the NPC's name, as a mob block starts `string id; string name` (the
 * shortest that ends there, so 4 earlier bytes that happen to read as a longer length are not taken), else the first
 * `mob<digits>` id that has a block. Undefined when neither is in the packet. */
export function duelMobId(payload: Uint8Array, name: string) {
  const p = Buffer.from(payload), strings: { at: number; end: number; text: string }[] = [];
  for (let i = 0; i + 4 <= p.length; i++) {
    const n = p.readInt32BE(i);
    if (n > 0 && n <= 64 && i + 4 + n <= p.length) strings.push({ at: i, end: i + 4 + n, text: p.subarray(i + 4, i + 4 + n).toString('utf8') });
  }
  const named = strings.find(s => s.text === name), id = named && strings.findLast(s => s.end === named.at);
  return id?.text ?? strings.find(s => /^mob\d+$/.test(s.text) && mobBlock(p, s.text))?.text;
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
  // u8 1 + i32 64 + 64 bytes when the server reshuffled the board after the move (no move left), then 3 bytes. A result
  // without refill (Hàn Lưu Thánh Thủy 4001 heals and destroys nothing, A1) has neither, like s2c/44.
  const newBoard = refill.length && r.u8() === 1 ? [...r.take(r.i32())] : undefined;
  if (refill.length) r.take(3);
  return { seq, move, skill, targets, cells, refill, newBoard, ...resultTail(r) };
}

/** s2c/44 after c2s/44 (an item of the bag used in battle, P5): like s2c/19 without the reshuffle flag and the 3 bytes
 * before the units; the unit line carries the new HP. */
export function battleItemResult(r: Reader) {
  const seq = r.i32(); r.i32(); r.i32();
  const a = r.i32(), slot = r.i32(); r.i32();
  const refill = [...r.take(r.i32())];
  return { seq, a, slot, refill, ...resultTail(r) };
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
