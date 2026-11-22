// One mob battle over a live session, without the game UI (docs/app/events/07-auto-battle.md):
// s2c/22 setup → c2s/18 join → s2c/18 → c2s/14 seq 0 → { s2c/19|20 result; s2c/24 turn → c2s/19 own swap | c2s/14 mob step }
// until a result carries end=1.
import { Reader } from '../protocol/protocol.ts';
import { applyResult, bestMove, castSkill, battleSetup, battleJoinAck, battleResult, battleItemResult, timeoutResult, turnState, fighter, unknownMob,
  STRATEGIES, type Board, type Fighter, type Move, type Outcome, type Strategy } from './battle.ts';
import { bestAction, skillWorth, swordPrior, type Potion, type SkillEffect } from './battle-actions.ts';
import { buildRequest } from '../protocol/events.ts';
import { HUMAN, OFF, type Human } from '../net/human.ts';

export interface BattleEnd { won: boolean; actor: string; exp?: number; coin?: number; myTurns: number; hp: number; mobId: string; damage: number }
export interface BattleIo {
  send(opcode: number, payload: Uint8Array): void;
  log(event: string, fields?: Record<string, unknown>): void;
  /** Every own turn, not printed: what was picked and the best actions weighed with their scores (the battle file of
   * battle-record.ts). */
  note?(event: string, fields: Record<string, unknown>): void;
  onEnd(end: BattleEnd): void;
  /** Own skill to cast (c2s/20) once own stat1 (nội lực) reaches `cost`, when castSkill says so; without an answer in 3 s the
   * turn falls back to a swap. Only without `skills`. */
  skill?: { id: number; cost: number };
  /** The learnt skills (learntSkills of battle-actions.ts): with it every own turn is chosen by bestAction among the
   * swaps, these skills and `potions`. */
  skills?: SkillEffect[];
  /** Potions of the bag for bestAction; the runner counts down what it uses. */
  potions?: Potion[];
  /** What one potion costs in HP (ActionOptions.potionCost; default Infinity: none is used). */
  potionCost?: number;
  /** Own Tấn công and level (s2c/9): damage per sword before the first hit, unless memory has it. */
  stats?: { attack: number; level: number };
  /** Move search settings (default STRATEGIES.kill). */
  strategy?: Strategy;
  /** Pause between own swaps in a timed battle (default 1000 ms). */
  timedMoveMs?: number;
  /** The mob block of s2c/22 (mobBlock): its HP is known from the first move instead of after its first hit. */
  mob?: { name: string; hp: number; maxHp: number };
  /** Running sums of what was learnt, kept by the session from battle to battle: keys `me.<value>` and `<mob name>.<value>`. */
  memory?: Map<string, [number, number]>;
  /** An own action in place of the search's on this turn: a skill by id (c2s/20), the bag slot of an item (c2s/44, P5),
   * or the best swap without any skill. Test plans use it; without an answer in 3 s the turn falls back to a swap. */
  choose?(runner: BattleRunner, seq: number): { skill: number } | { item: number } | { swap: true } | undefined;
  /** The game's gaps in a turn battle (human.ts): c2s/18 1.1–1.6 s after s2c/22, c2s/14 1–2 s after the mob's turn while
   * our move's cascades still fall (10–40 ms otherwise), an own move never within 1.2 s of its turn. Default OFF. */
  human?: Human;
}
/** The fields of c2s/11 that go with c2s/40 (MapLoads.request of world.ts). */
export interface MapRequest { mapId: string; zone?: number; mapIndex?: number }

const round1 = (x: number) => Math.round(x * 10) / 10;

type Piece = 'sword' | 'heart' | 'yinyang' | 'peach' | 'skillDamage' | 'skillCost';
type Unit = ReturnType<typeof battleResult>['units'][number];

/** Tracks the board and both sides from the server's results and answers every turn: bestAction over the swaps, the
 * learnt skills and the potions when io.skills is given (else bestMove, or the one skill by castSkill) on own turns, a
 * step request on the mob's. What a piece does for each side is learnt as the battle goes (learn), on top
 * of what earlier battles taught (io.memory). Priors are the measured values of 07-auto-battle.md: 2 nội lực per own
 * yin-yang (manina at levels 8–20), skills at 25 nội lực for every side seen, a mob skill of 4 swords + 11. */
export class BattleRunner {
  uuid: string; name: string; mobId: string; board: Board; me: Fighter; mob = unknownMob(); turns = 0;
  skillsCast = 0; skillRefused = false; damage = 0;
  /** The board stopped matching the server's: board_desync is logged once, until a reshuffle sends the board again. */
  private desynced = false;
  /** Skills that got no answer in this battle, and the own turns left of each buff cast. */
  private refused = new Set<number>(); private buffs: Partial<Record<'attack' | 'defense' | 'dodge', number>> = {};
  private potions: Potion[];
  /** Running sums behind each learnt value: [total, pieces], seeded with the default as `prior` pieces. */
  private seen: Map<string, [number, number]>;
  /** Memory key of the mob's values: its name in s2c/22, else its id. Own damage per sword depends on the mob too (Tiheo2:
   * 8 against Sơn Tặc, 7.33 against Chỉ Huy Sơn Tặc, A1), so it is kept as `me>mobKey.sword`. */
  private mobKey: string;
  /** s2c/18 timed 1 (Sơn Tặc, Q6–Q9): no turns; the mob hits on a ~30 s timer (s2c/21) and the player may swap any time. */
  timed = false;
  /** Set by leave() until the session sees the battle end or gives up on it (resume): no move is sent, a result still
   * counts. */
  leaving = false;
  /** leave() was called in this battle: a late s2c/1214 still means the server took the surrender. */
  surrendered = false;
  /** The last turn passed over while leaving: [seq, own turn], for resume(). */
  private missed?: [number, boolean];
  io: BattleIo;
  private skillWait?: ReturnType<typeof setTimeout>;
  /** Fallback for a turn-based battle whose s2c/24 does not come: 2 s after a result the next turn is inferred from it. */
  private turnWait?: ReturnType<typeof setTimeout>;
  /** c2s/18, an own move or a c2s/14 waiting for its human gap (io.human). */
  private actWait?: ReturnType<typeof setTimeout>;
  /** The last result was an own move whose board cascaded (more than one wave). */
  private cascaded = false;
  private human: Human;
  constructor(setup: ReturnType<typeof battleSetup>, mobId: string, io: BattleIo) {
    this.uuid = setup.uuid; this.name = setup.me; this.mobId = mobId; this.board = setup.board;
    this.me = fighter(setup.hp, setup.maxHp, { skillCost: io.skill?.cost ?? 0, yinyang: 2 });
    if (io.stats) this.me.sword = swordPrior(io.stats.attack, io.stats.level);
    this.potions = (io.potions ?? []).map(p => ({ ...p }));
    this.mob = { ...unknownMob(), skillCost: 25, skillDamage: 4 * 8 + 11 };
    if (io.mob) { this.mob.hp = io.mob.hp; this.mob.maxHp = io.mob.maxHp; }
    this.mobKey = io.mob?.name ?? mobId;
    this.seen = io.memory ?? new Map();
    for (const [id, [sum, n]] of this.seen) {
      const who = id.slice(0, id.lastIndexOf('.')), key = id.slice(id.lastIndexOf('.') + 1) as Piece;
      const f = who === 'me' || who === `me>${this.mobKey}` ? this.me : who === this.mobKey ? this.mob : undefined;
      if (f && (who !== 'me' || key !== 'sword')) f[key] = sum / n;
    }
    this.io = io; this.human = io.human ?? OFF;
  }

  start() {
    const join = () => this.io.send(18, buildRequest(18, { battleUuid: this.uuid }));
    if (!this.human.on) return join();
    this.actWait = setTimeout(join, this.human.ms(HUMAN.joinAfterSetup));
  }

  /** An own turn (s2c/24, inferred): played at once, or with io.human after HUMAN.ownMove (never within ownMoveMin). */
  private ownTurn(seq: number) {
    clearTimeout(this.actWait);
    if (!this.human.on || this.timed) return this.myMove(seq);
    this.actWait = setTimeout(() => this.myMove(seq), Math.max(HUMAN.ownMoveMin, this.human.ms(HUMAN.ownMove)));
  }
  /** The mob's turn: c2s/14 at once, or with io.human after the board of our move stops falling. */
  private mobTurn(seq: number) {
    clearTimeout(this.actWait);
    if (!this.human.on || this.timed) return this.step(seq);
    this.actWait = setTimeout(() => this.step(seq), this.human.ms(this.cascaded ? HUMAN.stepAfterCascade : HUMAN.stepAfterTimeout));
  }

  /** Surrenders as the game's "Đầu hàng" → OK does (06-map-mobs): c2s/11 for the map (the zone stood in and the map's
   * index, game 1.1.1), then c2s/40 in the same instant. The session reads the server's answer, or gives up on it with
   * resume(). */
  leave(map: MapRequest) {
    clearTimeout(this.skillWait); clearTimeout(this.turnWait); clearTimeout(this.actWait); this.missed = undefined;
    this.leaving = true; this.surrendered = true;
    this.io.send(11, buildRequest(11, map));
    this.io.send(40, buildRequest(40, { battleUuid: this.uuid }));
  }

  /** Gives up a surrender the server did not take: plays the turn passed over while leaving, if one came. */
  resume() {
    this.leaving = false;
    const m = this.missed; this.missed = undefined;
    if (m) { if (m[1]) this.myMove(m[0]); else this.step(m[0]); }
  }

  /** Returns false for packets that are not part of the battle. */
  onPacket(opcode: number, payload: Buffer): boolean {
    switch (opcode) {
      case 18:
        this.timed = battleJoinAck(new Reader(payload)).timed === 1;
        if (this.leaving) { this.missed = [0, this.timed]; return true; }
        // timed 1: the player moves first. In 1.1.1 every challenge with c2s/15 flag 1 gets it, and only Sơn Tặc and Bạch
        // Hổ are timed battles (no s2c/24); the others go on by turns from the first s2c/24 (05-battle.md#s2c-18).
        if (this.timed) {
          if (!this.human.on) this.myMove(0);
          else this.actWait = setTimeout(() => this.myMove(0), this.human.ms(HUMAN.firstMove));
        } else this.mobTurn(0);
        return true;
      case 24: {
        clearTimeout(this.turnWait);
        // A battle opened with timed 1 that sends turns is a turn battle with the player first (game 1.1.1): no swap on a
        // timer from here, the search of a turn battle.
        if (this.timed) { this.timed = false; this.io.log('turn_battle', { seq: turnState(new Reader(payload)).seq }); }
        const t = turnState(new Reader(payload));
        if (this.leaving) { this.missed = [t.seq, t.playerTurn === 1]; return true; }
        if (t.playerTurn === 1) this.ownTurn(t.seq); else this.mobTurn(t.seq);
        return true;
      }
      case 19: case 20: this.onResult(battleResult(new Reader(payload), opcode)); return true;
      case 21: this.io.log('timed_attack', {}); this.cascaded = false; this.onResult(timeoutResult(new Reader(payload))); return true;
      case 44: {
        const x = battleItemResult(new Reader(payload)), p = this.potions.find(q => q.slot === x.slot);
        if (p) p.quantity--;
        this.io.log('item_used', { seq: x.seq, slot: x.slot, left: p?.quantity });
        this.onResult({ ...x, cells: [] });
        return true;
      }
      default: return false;
    }
  }

  private step(seq: number) { this.io.send(14, buildRequest(14, { battleUuid: this.uuid, seq })); }

  /** The search settings: in a timed battle the mob hits on a timer and never moves pieces, so there is nothing to answer
   * and no turn to keep. */
  private strategy(): Strategy {
    const s = this.io.strategy ?? STRATEGIES.kill;
    return this.timed ? { ...s, reply: 0, extraTurn: 0, lookahead: 0, timed: true } : s;
  }

  private myMove(seq: number) {
    if (this.io.skills) return this.chooseAction(seq);
    const skill = this.io.skill, s = this.strategy(), pick = bestMove(this.board, this.me, this.mob, s), forced = this.io.choose?.(this, seq);
    if (forced && 'item' in forced) return this.useItem(seq, forced.item, pick);
    const id = forced && 'skill' in forced ? forced.skill
      : forced && 'swap' in forced ? undefined
      : skill && !this.skillRefused && castSkill(this.board, this.me, this.mob, s, pick?.score ?? null) ? skill.id : undefined;
    this.io.note?.('turn', { seq, pick: id === undefined ? 'swap' : `skill ${id}`, hp: this.me.hp, stat1: this.me.s1, stat2: this.me.s2, mobHp: this.mob.hp,
      mobStat1: this.mob.s1, mobStat2: this.mob.s2, scores: pick ? [['swap', round1(pick.score)]] : [] });
    if (id !== undefined) return this.castOwn(seq, id, pick);
    this.swapMove(seq, pick);
  }

  /** bestAction over the swaps, the skills the nội lực pays for and the potions; a test plan (io.choose) may override it. */
  private chooseAction(seq: number) {
    const s = this.strategy(), skills = this.io.skills!.filter(e => !this.refused.has(e.id));
    for (const k of Object.keys(this.buffs) as (keyof typeof this.buffs)[]) this.buffs[k] = Math.max(0, (this.buffs[k] ?? 0) - 1);
    Object.assign(this.me, skillWorth(this.me.sword, skills));
    const { best, all } = bestAction(this.board, this.me, this.mob, s, { skills, potions: this.potions, potionCost: this.io.potionCost, buffs: this.buffs });
    const swap = all.find(a => a.action.kind === 'swap'), pick = swap?.action.kind === 'swap' ? { move: swap.action.move, score: swap.score } : null;
    this.io.note?.('turn', { seq, pick: best?.label, hp: this.me.hp, stat1: this.me.s1, stat2: this.me.s2, mobHp: this.mob.hp, mobStat1: this.mob.s1,
      mobStat2: this.mob.s2, scores: all.slice(0, 3).map(a => [a.label, round1(a.score)]) });
    // Only turns where a skill could be cast or something else than a swap was picked: why it cast, healed or did not.
    if (all.some(a => a.action.kind === 'skill') || (best && best.action.kind !== 'swap')) this.io.log('choice', { seq, pick: best?.label, hp: this.me.hp, stat1: this.me.s1, mobHp: this.mob.hp, scores: all.slice(0, 4).map(a => [a.label, Math.round(a.score)]) });
    const forced = this.io.choose?.(this, seq);
    if (forced && 'item' in forced) return this.useItem(seq, forced.item, pick);
    if (forced && 'skill' in forced) return this.castOwn(seq, forced.skill, pick);
    const a = forced ? swap?.action : best?.action;
    if (a?.kind === 'skill') return this.castOwn(seq, a.id, pick);
    if (a?.kind === 'item') return this.useItem(seq, a.slot, pick);
    this.swapMove(seq, pick);
  }

  /** Without an answer in 3 s the turn falls back to the swap. */
  private waitAnswer(seq: number, what: Record<string, unknown>, pick: { move: Move; score: number } | null, refused?: () => void) {
    this.skillWait = setTimeout(() => { refused?.(); this.io.log('action_no_answer', { seq, ...what, stat1: this.me.s1 }); this.swapMove(seq, pick); }, 3000);
  }
  private castOwn(seq: number, id: number, pick: { move: Move; score: number } | null) {
    this.io.log('skill_try', { seq, skill: id, stat1: this.me.s1, hp: this.me.hp });
    this.io.send(20, buildRequest(20, { battleUuid: this.uuid, seq, skill: id }));
    this.waitAnswer(seq, { skill: id }, pick, () => { this.refused.add(id); if (id === this.io.skill?.id) this.skillRefused = true; });
  }
  private useItem(seq: number, slot: number, pick: { move: Move; score: number } | null) {
    this.io.log('item_try', { seq, slot, hp: this.me.hp, stat1: this.me.s1 });
    this.io.send(44, buildRequest(44, { battleUuid: this.uuid, slot }));
    // Not tried again in this battle: the slot is taken as empty.
    this.waitAnswer(seq, { item: slot }, pick, () => { for (const p of this.potions) if (p.slot === slot) p.quantity = 0; });
  }

  private swapMove(seq: number, pick: { move: Move } | null) {
    if (!pick) { this.io.log('no_legal_move', { seq }); return; }
    this.turns++;
    this.io.send(19, buildRequest(19, { battleUuid: this.uuid, seq, move: pick.move }));
  }

  private onResult(x: ReturnType<typeof battleResult> | ReturnType<typeof timeoutResult> | (ReturnType<typeof battleItemResult> & { cells: number[] })) {
    clearTimeout(this.skillWait); clearTimeout(this.turnWait);
    const skill = 'skill' in x && x.skill !== undefined;
    if (skill && x.actor === this.name) {
      this.skillsCast++;
      const e = this.io.skills?.find(k => k.id === x.skill);
      if (e?.buff) this.buffs[e.buff.stat] = Math.ceil(e.buff.turns / 2);
      this.io.log('skill_cast', { seq: x.seq, skill: x.skill, targets: x.targets, cells: x.cells.length });
    }
    const mine = skill && x.actor === this.name ? this.io.skills?.find(k => k.id === x.skill) : undefined;
    const o = applyResult(this.board, x, mine ? !!mine.fire : undefined);
    if (x.actor === this.name) this.cascaded = o.waves > 1;
    // The clock hit that ends a timed battle (time out, the Bạch Hổ kill) brings a refill without the cells it fills:
    // not a board out of step, and the battle is over anyway.
    if (x.end && !('move' in x && x.move) && !skill && !x.cells.length) o.desync = false;
    if (o.desync && !this.desynced) this.io.log('board_desync', { seq: x.seq, actor: x.actor === this.name ? 'me' : 'mob', ...(skill ? { skill: x.skill } : {}) });
    this.desynced ||= o.desync;
    if ('newBoard' in x && x.newBoard) { this.board = x.newBoard; this.desynced = false; this.io.log('board_reshuffled', { seq: x.seq, actor: x.actor }); }
    const actor = x.actor === this.name ? this.me : this.mob, unit = x.units.find(u => u.name === x.actor);
    if (unit) this.learnFrom(actor, unit, o, skill);
    if (unit && actor === this.me && unit.damage > 0) this.damage += unit.damage;
    for (const u of x.units) {
      const f = u.name === this.name ? this.me : u.name === this.mobId ? this.mob : undefined;
      if (!f) continue;
      // The mob's HP shows up after its first hit; its max is that plus the damage dealt so far (Cóc Xanh 249 every time).
      if (u.hp >= 0) { if (f === this.mob && this.mob.maxHp === Infinity) this.mob.maxHp = u.hp + this.damage; f.hp = u.hp; f.maxHp = Math.max(f.maxHp, u.hp); }
      if (u.s1 >= 0) f.s1 = u.s1;
      if (u.s2 >= 0) f.s2 = u.s2;
    }
    // One line per move: what the actor cleared and what it did, for the damage and speed analysis of 10-quests.md.
    this.io.log('move', { seq: x.seq, actor: x.actor === this.name ? 'me' : 'mob', skill, cleared: o.cleared, waves: o.waves, extraTurn: x.extraTurn,
      units: x.units.map(u => [u.name === this.name ? 'me' : 'mob', u.damage, u.hp, u.s1, u.s2]) });
    if (!x.end && this.leaving) { this.missed = [x.seq, this.timed || (x.actor === this.name) === x.extraTurn]; return; }
    if (!x.end && this.timed) {
      // Until an s2c/24 shows a turn battle, the second swap waits for it a little longer (HUMAN.turnOrTimed), whatever
      // the pace: the s2c/24 of the mob's turn comes up to ~1.1 s after a first move that cascades, and a swap on the
      // timer before it would go in the mob's turn and hang the battle.
      const pause = Math.max(this.io.timedMoveMs ?? 1000, x.seq <= 1 ? HUMAN.turnOrTimed : 0);
      this.turnWait = setTimeout(() => this.myMove(x.seq), pause);
      return;
    }
    if (!x.end) {
      const mine = x.actor === this.name, again = mine === x.extraTurn;
      this.turnWait = setTimeout(() => { this.io.log('turn_inferred', { seq: x.seq, myTurn: again }); if (again) this.ownTurn(x.seq); else this.mobTurn(x.seq); }, 2000);
      return;
    }
    clearTimeout(this.skillWait); clearTimeout(this.actWait);
    const round = (f: Fighter) => Object.fromEntries((['sword', 'heart', 'yinyang', 'peach', 'skillCost', 'skillDamage'] as const).map(k => [k, Math.round(f[k] * 10) / 10]));
    this.io.log('estimates', { mobId: this.mobId, mobMaxHp: this.mob.maxHp, me: round(this.me), mob: round(this.mob) });
    this.io.onEnd({ won: x.reward?.won ?? x.actor === this.name, actor: x.actor, exp: x.reward?.exp, coin: x.reward?.coin, myTurns: this.turns, hp: this.me.hp, mobId: this.mobId, damage: this.damage });
  }

  /** What the actor's pieces did in this result, read before its unit updates the state: damage per sword (dodges
   * included, doubled hits left out), HP per heart (unless capped at the max), stat1 per yin-yang, stat2 per peach, and
   * the damage of a skill (its cost stays at the 25 nội lực every side was seen paying). */
  private learnFrom(f: Fighter, u: Unit, o: Outcome, skill: boolean) {
    if (skill) { if (u.damage >= 0) this.learn(f, 'skillDamage', u.damage); return; }
    const n = (piece: number) => o.cleared[piece] ?? 0;
    if (n(0) && u.damage >= 0 && f.s2 < 100) this.learn(f, 'sword', u.damage, n(0));
    if (n(1) && u.hp >= 0 && u.hp < f.maxHp && Number.isFinite(f.hp)) this.learn(f, 'heart', u.hp - f.hp, n(1));
    if (n(2) && u.s1 >= f.s1) this.learn(f, 'yinyang', u.s1 - f.s1, n(2));
    if (n(3) && u.s2 >= 0 && u.s2 < 100 && f.s2 < 100) this.learn(f, 'peach', u.s2 - f.s2, n(3));
  }
  private learn(f: Fighter, key: Piece, total: number, pieces = 1) {
    const who = f === this.me ? (key === 'sword' ? `me>${this.mobKey}` : 'me') : this.mobKey;
    const id = `${who}.${key}`, prior = key.startsWith('skill') ? 1 : 6;
    const [sum, n] = this.seen.get(id) ?? [f[key] * prior, prior];
    this.seen.set(id, [sum + total, n + pieces]); f[key] = (sum + total) / (n + pieces);
  }
}
