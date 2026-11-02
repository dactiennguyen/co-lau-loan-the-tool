// Every own action of a turn on one scale (docs/app/events/07-auto-battle.md#chọn-hành-động): the swaps of bestMove,
// each learnt skill the nội lực pays for, and each potion of the bag. A skill's effect is read from its description in
// s2c/30 (12-skills-items.md#bảng-kỹ-năng); its value comes from the damage formula and the measurements of A1:
// - damage skill: W × (3 + swords it clears) × 2 at full power + K, K lost one cast in seven;
// - a piece a skill destroys counts three times (a destroyed heart heals 10 when a run of 3 hearts heals 10), the pieces
//   falling into runs after it once;
// - Hàn Lưu Thánh Thủy heals ⌊pct × max HP⌋; Hoàn Linh Dược ⌊25% max HP⌋ (the item says 30%); Kim Đan Dược +25 nội lực;
// - a skill or a potion ends the turn like a swap, unless a run ≥4 falls after it or the skill says it keeps the turn.
// Everything is worth HP: damage to the mob, HP healed (up to the max), nội lực at what the best damage skill makes of it.
import { N, kind, swap, settle, legalMoves, blastCells, bestMove, answerValue, moveValue, type Board, type Fighter, type Move, type Outcome, type Strategy } from './battle.ts';

/** One level of a skill as its description in s2c/30 states it. The 14 kinds of description of the three trees are
 * all read; `kind` 'unknown' is a description of none of them, and the bot does not cast it. */
export interface SkillEffect {
  id: number; level: number; cost: number; name?: string;
  kind: 'damage' | 'heal' | 'buff' | 'sap' | 'fire' | 'unknown';
  /** "gây N sát thương": K of the damage formula. */
  damage?: number;
  /** "phá hủy (từ a đến) b vùng HxW", "phá hủy ngẫu nhiên từ a đến b quân cờ", "phá hủy N hàng ngang / dọc". */
  areas?: { min: number; max: number; h: number; w: number };
  random?: { min: number; max: number };
  rows?: number; cols?: number;
  /** "Phục hồi N% sinh lực": the share of max HP healed. */
  heal?: number;
  /** "có P% cơ hội hấp thu N sinh lực". */
  drain?: { chance: number; hp: number };
  /** "có P% cơ hội làm đối phương bị giảm N lực phòng thủ trong T lượt". */
  weaken?: { chance: number; amount: number; turns: number };
  /** "Tăng N lực tấn công / lực phòng thủ / né tránh … trong T lượt". */
  buff?: { stat: 'attack' | 'defense' | 'dodge'; amount: number; turns: number };
  /** "Triệt tiêu N% năng lượng của kẻ thù": the share of the mob's nội lực taken. */
  sap?: number;
  /** "Biến từ a đến b quân cờ thành kiếm lửa". */
  fire?: { min: number; max: number };
  /** Chance the skill keeps the turn: 1 for "Được đi tiếp", P for "có P% cơ hội đi tiếp". */
  keepTurn?: number;
}

export function skillEffect(id: number, level: number, description: string, cost: number, name?: string): SkillEffect {
  const e: SkillEffect = { id, level, cost, name, kind: 'unknown' }, d = description;
  const m = (re: RegExp) => d.match(re)?.slice(1).map(Number);
  let x: number[] | undefined;
  if ((x = m(/gây (\d+) sát thương/))) { e.damage = x[0]; e.kind = 'damage'; }
  if ((x = m(/phá hủy từ (\d+) đến (\d+) vùng (\d+)x(\d+)/))) e.areas = { min: x[0], max: x[1], h: x[2], w: x[3] };
  else if ((x = m(/phá hủy (\d+) vùng (\d+)x(\d+)/))) e.areas = { min: x[0], max: x[0], h: x[1], w: x[2] };
  if ((x = m(/phá hủy ngẫu nhiên từ (\d+) đến (\d+) quân/))) e.random = { min: x[0], max: x[1] };
  if ((x = m(/phá hủy (\d+) hàng ngang/))) e.rows = x[0];
  if ((x = m(/phá hủy (\d+) hàng dọc/))) e.cols = x[0];
  if ((x = m(/(\d+)% cơ hội hấp thu (\d+) sinh lực/))) e.drain = { chance: x[0] / 100, hp: x[1] };
  if ((x = m(/(\d+)% cơ hội làm đối phương bị giảm (\d+) lực phòng thủ trong (\d+) lượt/))) e.weaken = { chance: x[0] / 100, amount: x[1], turns: x[2] };
  if ((x = m(/Phục hồi (\d+)% sinh lực/))) { e.heal = x[0] / 100; e.kind = 'heal'; }
  for (const [re, stat] of [[/Tăng (\d+) lực tấn công.* (\d+) lượt/, 'attack'], [/Tăng (\d+) lực phòng thủ.* (\d+) lượt/, 'defense'], [/Tăng (\d+) né tránh.* (\d+) lượt/, 'dodge']] as const)
    if ((x = m(re))) { e.buff = { stat, amount: x[0], turns: x[1] }; e.kind = 'buff'; }
  if ((x = m(/Triệt tiêu (\d+)% năng lượng/))) { e.sap = x[0] / 100; e.kind = 'sap'; }
  if ((x = m(/Biến từ (\d+) đến (\d+) quân cờ thành kiếm lửa, và có (\d+)% cơ hội đi tiếp/))) { e.fire = { min: x[0], max: x[1] }; e.keepTurn = x[2] / 100; e.kind = 'fire'; }
  if (/Được đi tiếp/.test(d)) e.keepTurn = 1;
  return e;
}

/** The learnt skills of a tree (s2c/30) at their levels (s2c/9 tail, s2c/10 kind 32); its nội lực is the cost. */
export function learntSkills(tree: readonly { id: number; name: string; levels: readonly { level: number; description: string; mana: number }[] }[], levels: ReadonlyMap<number, number>) {
  return tree.flatMap(k => {
    const at = levels.get(k.id) ?? 0, l = k.levels[at - 1];
    return at > 0 && l ? [skillEffect(k.id, at, l.description, l.mana, k.name)] : [];
  });
}

/** A potion of the bag: its bag slot (c2s/44), item id and how many are left. */
export interface Potion { slot: number; itemId: number; quantity: number }
/** What a potion does in battle (A1): Hoàn Linh Dược (item 0) heals ⌊25% max HP⌋, +36 at 145; Kim Đan Dược (item 1)
 * gives 25 nội lực. */
export const POTIONS: Record<number, { name: string; hp?: number; s1?: number }> = {
  0: { name: 'Hoàn Linh Dược', hp: 0.25 },
  1: { name: 'Kim Đan Dược', s1: 25 },
};

/** Share of casts that keep K (17 of 128 lost it). */
const KEEP_K = 6 / 7;
/** Swords taken per own turn (Cóc Xanh, simulator and live 0.98–1.03) and per mob turn (0.42), for buffs. */
const OWN_SWORDS = 1, MOB_SWORDS = 0.42;

/** Expected damage of a damage skill before it sees the board: 3 swords plus about one it clears, plus K. */
export const skillDamage = (e: SkillEffect, sword: number) => (e.kind === 'damage' ? sword * 4 + (e.damage ?? 0) * KEEP_K : 0);

/** The best damage per nội lực among `skills`, as Fighter.skillDamage / skillCost: what a yin-yang piece is worth. */
export function skillWorth(sword: number, skills: readonly SkillEffect[]) {
  let best = { skillDamage: 0, skillCost: 0 };
  for (const e of skills) if (e.kind === 'damage' && (!best.skillCost || skillDamage(e, sword) / e.cost > best.skillDamage / best.skillCost)) best = { skillDamage: skillDamage(e, sword), skillCost: e.cost };
  return best;
}

export type Action = { kind: 'swap'; move: Move } | { kind: 'skill'; id: number } | { kind: 'item'; slot: number; itemId: number };
export interface Scored { action: Action; score: number; label: string }
export interface ActionOptions {
  /** Learnt skills (learntSkills); those the nội lực does not pay for are skipped. */
  skills?: readonly SkillEffect[];
  /** Potions of the bag. */
  potions?: readonly Potion[];
  /** What one potion costs in HP: Infinity (default) never uses one. A potion is used when it beats every other action by
   * this much, which for a few hundred means when the mob's answer could otherwise end the battle. */
  potionCost?: number;
  /** Share of the worth of the nội lực a skill spends that is charged to it (default 1, SPEND). */
  spend?: number;
  /** Destroy patterns tried per skill (default 16). */
  samples?: number;
  /** Own turns left of the buffs cast: not cast again while they last. */
  buffs?: Partial<Record<'attack' | 'defense' | 'dodge', number>>;
}

/** Scores the best swap, every skill `me` can pay for and every potion, and returns the best with all the scores. */
export function bestAction(b: Board, me: Fighter, mob: Fighter, s: Strategy, o: ActionOptions = {}) {
  const all: Scored[] = [], pick = bestMove(b, me, mob, s), perS1 = me.skillCost ? me.skillDamage / me.skillCost : 0;
  if (pick) all.push({ action: { kind: 'swap', move: pick.move }, score: pick.score, label: 'swap' });
  const castable = (o.skills ?? []).filter(e => e.kind !== 'unknown' && me.s1 >= e.cost && !(e.buff && (o.buffs?.[e.buff.stat] ?? 0) > 0));
  // The nội lực spent is charged (SPEND), but not when the bar is too full for the cheapest skill to be cast later
  // without losing what comes in meanwhile, nor in a timed battle (the mob does not answer: every action should deal the
  // most). The same for every skill, so a dearer one is never free while a cheaper one is charged.
  const charged = !!s.reply && me.s1 + Math.min(...castable.map(e => e.cost)) <= 100;
  for (const e of castable) all.push({ action: { kind: 'skill', id: e.id }, score: skillScore(b, e, me, mob, s, charged ? perS1 * (o.spend ?? SPEND) : 0, perS1, o, pick?.score ?? 0), label: `skill ${e.id}` });
  for (const p of o.potions ?? []) {
    const fx = POTIONS[p.itemId], cost = o.potionCost ?? Infinity;
    if (!fx || p.quantity <= 0 || cost === Infinity) continue;
    const hp = fx.hp ? Math.min(me.maxHp - me.hp, Math.floor(fx.hp * me.maxHp)) : 0, s1 = fx.s1 ? Math.min(100 - me.s1, fx.s1) : 0;
    if (!hp && !s1) continue;
    const after = { ...me, hp: me.hp + hp, s1: me.s1 + s1 };
    all.push({ action: { kind: 'item', slot: p.slot, itemId: p.itemId }, score: hp + s1 * perS1 - cost - s.reply * answerValue(b, mob, after, s), label: `item ${p.itemId}` });
  }
  all.sort((x, y) => y.score - x.score);
  return { best: all[0] as Scored | undefined, all };
}

/** Share of the nội lực's worth charged to the skill that spends it. A skill kept for a later turn deals the same damage
 * then, so it is worth casting now only for what the turn adds: the chance to kill, the pieces it clears, a poor swap.
 * In the simulator 1 won most (0 and 0.5 fewer battles, 1.5 and 2 far fewer: the heal then takes the damage skill's
 * place), 07-auto-battle.md#chọn-hành-động. */
export const SPEND = 1;

/** The average over destroy patterns of what the skill is worth now: its damage (1e4 × the chance it kills), the HP and
 * nội lực of the pieces it clears, less its cost at `costPerS1` a point and the mob's answer on the board it leaves. A
 * skill that keeps the turn is worth its effect plus the best swap still to come (the board it leaves is the same). */
function skillScore(b: Board, e: SkillEffect, me: Fighter, mob: Fighter, s: Strategy, costPerS1: number, perS1: number, o: ActionOptions, swapScore: number) {
  const full = me.s2 >= 100, charge = e.cost * costPerS1;
  if (e.kind === 'buff' || e.kind === 'sap') {
    const turns = (e.buff?.turns ?? 0) / 2, swordsOff = (e.buff?.amount ?? 0) / 3;
    const v = e.buff?.stat === 'attack' ? swordsOff * OWN_SWORDS * turns * (full ? 2 : 1)
      : e.buff?.stat === 'defense' ? swordsOff * MOB_SWORDS * turns
      : e.sap ? mob.s1 * e.sap * (mob.skillCost ? mob.skillDamage / mob.skillCost : 0) : 0;
    const keep = e.keepTurn ?? 0, after = e.sap ? { ...mob, s1: mob.s1 * (1 - e.sap) } : mob;
    return v - charge + keep * swapScore - (1 - keep) * s.reply * answerValue(b, after, { ...me, s1: me.s1 - e.cost }, s);
  }
  const rnd = rng(hash(b) ^ e.id), samples = destroyPatterns(e, rnd, o.samples ?? 16);
  let total = 0;
  for (const removed of samples) {
    const t = b.slice();
    if (e.fire) { total += fireValue(t, removed, e, me, mob, s) - charge; continue; }
    const destroyed: Record<number, number> = {};
    if (removed.length) for (const i of blastCells(t, removed)) if (t[i] >= 0) destroyed[kind(t[i])] = (destroyed[kind(t[i])] ?? 0) + 1;
    const out: Outcome = removed.length ? settle(t, null, removed) : { cleared: {}, waves: 0, extraTurn: false, refillUsed: 0 };
    const n = (k: number) => (out.cleared[k] ?? 0) + 2 * (destroyed[k] ?? 0);
    let damage = 0, kill = 0;
    if (e.kind === 'damage') {
      const least = me.sword * (3 + (out.cleared[0] ?? 0)) * (full ? 2 : 1), k = e.damage ?? 0;
      damage = least + k * KEEP_K;
      kill = least >= mob.hp ? 1 : least + k >= mob.hp ? KEEP_K : 0;
    }
    const healed = Math.min(me.maxHp - me.hp || 0, n(1) * me.heart + (e.heal ? Math.floor(e.heal * me.maxHp) : 0) + (e.drain ? e.drain.chance * e.drain.hp : 0));
    const s1 = n(2) * me.yinyang, s2 = full ? 0 : Math.min(100 - me.s2, n(3) * me.peach);
    let v = damage + healed + s1 * perS1 + s2 / 100 * 3 * me.sword - charge;
    for (const [piece, c] of Object.entries(out.cleared)) v += (s.bonus[Number(piece)] ?? 0) * c;
    if (e.weaken) v += e.weaken.chance * e.weaken.amount / 3 * OWN_SWORDS * e.weaken.turns / 2;
    const meAfter = { ...me, hp: me.hp + healed, s1: me.s1 - e.cost + s1, s2: full ? 0 : me.s2 + s2 }, mobAfter = { ...mob, hp: mob.hp - damage };
    if (out.extraTurn || e.keepTurn === 1) v += s.lookahead ? s.lookahead * bestNext(t, meAfter, mobAfter, s) : s.extraTurn;
    else v -= s.reply * answerValue(t, mobAfter, meAfter, s);
    total += kill * 1e4 + (1 - kill) * v;
  }
  return total / samples.length;
}

/** Hỏa Kiếm Thuật: the chosen pieces turn into Kiếm lửa (code 10) and the runs that makes fall as after a swap; the
 * turn is kept with the stated chance. Seen 5 times (symap 02/11): runs fall at once, as here; the server picks the
 * pieces, so they are guessed here. */
function fireValue(t: Board, cells: number[], e: SkillEffect, me: Fighter, mob: Fighter, s: Strategy) {
  for (const i of cells) t[i] = 10;
  const out = settle(t, null), v = moveValue(out, me, mob, { ...s, extraTurn: 0 }, s.bonus);
  if (v >= 1e4) return v;
  const keep = out.extraTurn ? 1 : e.keepTurn ?? 0, hit = (out.cleared[0] ?? 0) * me.sword * (me.s2 >= 100 ? 2 : 1);
  const meAfter = { ...me, s1: me.s1 - e.cost }, mobAfter = { ...mob, hp: mob.hp - hit };
  return v + keep * bestNext(t, meAfter, mobAfter, s) - (1 - keep) * s.reply * answerValue(t, mobAfter, meAfter, s);
}

function bestNext(t: Board, me: Fighter, mob: Fighter, s: Strategy) {
  let next = 0;
  for (const m of legalMoves(t)) { const u = t.slice(); swap(u, m); next = Math.max(next, moveValue(settle(u, null), me, mob, { ...s, extraTurn: 0 }, s.bonus)); }
  return next;
}

/** Cell sets a skill may destroy: random placements of its areas, cells, rows or columns, `n` of them; one empty set for
 * a skill that destroys nothing. Areas may overlap (not seen either way). */
export function destroyPatterns(e: SkillEffect, rnd: () => number, n: number): number[][] {
  const between = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
  const pick = (count: number, of: number) => { const all = Array.from({ length: of }, (_, i) => i); for (let i = 0; i < count; i++) { const j = i + Math.floor(rnd() * (of - i)); [all[i], all[j]] = [all[j], all[i]]; } return all.slice(0, count); };
  const one = (): number[] => {
    if (e.areas) {
      const cells = new Set<number>(), { h, w } = e.areas;
      for (let k = between(e.areas.min, e.areas.max); k > 0; k--) {
        const r0 = Math.floor(rnd() * (N - h + 1)), c0 = Math.floor(rnd() * (N - w + 1));
        for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) cells.add((r0 + r) * N + c0 + c);
      }
      return [...cells];
    }
    if (e.random) return pick(Math.min(N * N, between(e.random.min, e.random.max)), N * N);
    if (e.rows) return pick(Math.min(N, e.rows), N).flatMap(r => Array.from({ length: N }, (_, c) => r * N + c));
    if (e.cols) return pick(Math.min(N, e.cols), N).flatMap(c => Array.from({ length: N }, (_, r) => r * N + c));
    if (e.fire) return pick(between(e.fire.min, e.fire.max), N * N);
    return [];
  };
  return e.areas || e.random || e.rows || e.cols || e.fire ? Array.from({ length: n }, one) : [[]];
}

const hash = (b: Board) => b.reduce((h, v) => Math.imul(h ^ (v + 3), 0x01000193), 0x811c9dc5);
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Damage per sword before any is seen, from the stats (A1): a hit of 3 swords ≈ Tấn công + ⌊level / 2⌋ − 6 (manina 32 at
 * level 21: 36; Tiheo2 23 at level 16: 24 measured, 25 by this). */
export const swordPrior = (attack: number, level: number) => Math.max(1, (attack + Math.floor(level / 2) - 6) / 3);
