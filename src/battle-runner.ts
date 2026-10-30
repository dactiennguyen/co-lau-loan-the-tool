// One mob battle over a live session, without the game UI (docs/app/events/07-auto-battle.md):
// s2c/22 setup → c2s/18 join → s2c/18 → c2s/14 seq 0 → { s2c/19|20 result; s2c/24 turn → c2s/19 own swap | c2s/14 mob step }
// until a result carries end=1.
import { Reader } from './protocol.ts';
import { EMPTY, UNKNOWN, swap, settle, findRuns, bestMove, battleSetup, battleJoinAck, battleResult, timeoutResult, turnState, fighter, unknownMob,
  STRATEGIES, type Board, type Fighter, type Outcome, type Strategy } from './battle.ts';
import { buildRequest } from './events.ts';

export interface BattleEnd { won: boolean; actor: string; exp?: number; coin?: number; myTurns: number; hp: number; mobId: string; damage: number }
export interface BattleIo {
  send(opcode: number, payload: Uint8Array): void;
  log(event: string, fields?: Record<string, unknown>): void;
  onEnd(end: BattleEnd): void;
  /** Own skill to cast (c2s/20) once own stat1 (nội lực) reaches `cost`; without an answer in 3 s the turn falls back to a swap. */
  skill?: { id: number; cost: number };
  /** Move search settings (default STRATEGIES.kill). */
  strategy?: Strategy;
  /** Pause between own swaps in a timed battle (default 1000 ms). */
  timedMoveMs?: number;
}

type Piece = 'sword' | 'heart' | 'yinyang' | 'peach' | 'skillDamage' | 'skillCost';
type Unit = ReturnType<typeof battleResult>['units'][number];

/** Tracks the board and both sides from the server's results and answers every turn: bestMove on own turns, a step
 * request on the mob's. What a piece does for each side is learnt during the battle (learn). */
export class BattleRunner {
  uuid: string; name: string; mobId: string; board: Board; me: Fighter; mob = unknownMob(); turns = 0;
  skillsCast = 0; skillRefused = false; damage = 0;
  /** Running sums behind each learnt value: [total, pieces], seeded with the default as `prior` pieces. */
  private seen = new Map<string, [number, number]>();
  /** s2c/18 timed 1 (Sơn Tặc, Q6–Q9): no turns; the mob hits on a ~30 s timer (s2c/21) and the player may swap any time. */
  timed = false;
  io: BattleIo;
  private skillWait?: ReturnType<typeof setTimeout>;
  /** Fallback for a turn-based battle whose s2c/24 does not come: 2 s after a result the next turn is inferred from it. */
  private turnWait?: ReturnType<typeof setTimeout>;
  constructor(setup: ReturnType<typeof battleSetup>, mobId: string, io: BattleIo) {
    this.uuid = setup.uuid; this.name = setup.me; this.mobId = mobId; this.board = setup.board;
    this.me = fighter(setup.hp, setup.maxHp, { skillCost: io.skill?.cost ?? 0 });
    this.io = io;
  }

  start() { this.io.send(18, buildRequest(18, { battleUuid: this.uuid })); }

  /** Returns false for packets that are not part of the battle. */
  onPacket(opcode: number, payload: Buffer): boolean {
    switch (opcode) {
      case 18:
        this.timed = battleJoinAck(new Reader(payload)).timed === 1;
        if (this.timed) this.myMove(0); else this.step(0);
        return true;
      case 24: {
        clearTimeout(this.turnWait);
        const t = turnState(new Reader(payload));
        if (t.playerTurn === 1) this.myMove(t.seq); else this.step(t.seq);
        return true;
      }
      case 19: case 20: this.onResult(battleResult(new Reader(payload), opcode)); return true;
      case 21: this.io.log('timed_attack', {}); this.onResult(timeoutResult(new Reader(payload))); return true;
      default: return false;
    }
  }

  private step(seq: number) { this.io.send(14, buildRequest(14, { battleUuid: this.uuid, seq })); }

  private myMove(seq: number) {
    const skill = this.io.skill;
    if (skill && !this.skillRefused && this.me.s1 >= skill.cost) {
      this.io.log('skill_try', { seq, skill: skill.id, stat1: this.me.s1 });
      this.io.send(20, buildRequest(20, { battleUuid: this.uuid, seq, skill: skill.id }));
      this.skillWait = setTimeout(() => { this.skillRefused = true; this.io.log('skill_no_answer', { seq, skill: skill.id, stat1: this.me.s1 }); this.swapMove(seq); }, 3000);
      return;
    }
    this.swapMove(seq);
  }

  private swapMove(seq: number) {
    // In a timed battle the mob hits on a timer and never moves pieces: nothing to answer.
    const s = this.io.strategy ?? STRATEGIES.kill, pick = bestMove(this.board, this.me, this.mob, this.timed ? { ...s, reply: 0 } : s);
    if (!pick) { this.io.log('no_legal_move', { seq }); return; }
    this.turns++;
    this.io.send(19, buildRequest(19, { battleUuid: this.uuid, seq, move: pick.move }));
  }

  private onResult(x: ReturnType<typeof battleResult> | ReturnType<typeof timeoutResult>) {
    clearTimeout(this.skillWait); clearTimeout(this.turnWait);
    const skill = 'skill' in x && x.skill !== undefined;
    if (skill && x.actor === this.name) { this.skillsCast++; this.io.log('skill_cast', { seq: x.seq, skill: x.skill, targets: x.targets, cells: x.cells.length }); }
    if ('move' in x && x.move) swap(this.board, x.move);
    const o = settle(this.board, x.refill, x.cells);
    if (o.refillUsed !== x.refill.length || this.board.some(v => v === EMPTY || v === UNKNOWN) || findRuns(this.board).cells.size) this.io.log('board_desync', { seq: x.seq });
    if ('newBoard' in x && x.newBoard) { this.board = x.newBoard; this.io.log('board_reshuffled', { seq: x.seq, actor: x.actor }); }
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
    if (!x.end && this.timed) { this.turnWait = setTimeout(() => this.myMove(x.seq), this.io.timedMoveMs ?? 1000); return; }
    if (!x.end) {
      const mine = x.actor === this.name, again = mine === x.extraTurn;
      this.turnWait = setTimeout(() => { this.io.log('turn_inferred', { seq: x.seq, myTurn: again }); if (again) this.myMove(x.seq); else this.step(x.seq); }, 2000);
      return;
    }
    clearTimeout(this.skillWait);
    const round = (f: Fighter) => Object.fromEntries((['sword', 'heart', 'yinyang', 'peach', 'skillCost', 'skillDamage'] as const).map(k => [k, Math.round(f[k] * 10) / 10]));
    this.io.log('estimates', { mobId: this.mobId, mobMaxHp: this.mob.maxHp, me: round(this.me), mob: round(this.mob) });
    this.io.onEnd({ won: x.reward?.won ?? x.actor === this.name, actor: x.actor, exp: x.reward?.exp, coin: x.reward?.coin, myTurns: this.turns, hp: this.me.hp, mobId: this.mobId, damage: this.damage });
  }

  /** What the actor's pieces did in this result, read before its unit updates the state: damage per sword (dodges
   * included, doubled hits left out), HP per heart (unless capped at the max), stat1 per yin-yang, stat2 per peach, and
   * the damage and stat1 of a skill. */
  private learnFrom(f: Fighter, u: Unit, o: Outcome, skill: boolean) {
    if (skill) { if (u.damage >= 0) this.learn(f, 'skillDamage', u.damage); if (f === this.mob) this.learn(f, 'skillCost', f.s1); return; }
    const n = (piece: number) => o.cleared[piece] ?? 0;
    if (n(0) && u.damage >= 0 && f.s2 < 100) this.learn(f, 'sword', u.damage, n(0));
    if (n(1) && u.hp >= 0 && u.hp < f.maxHp && Number.isFinite(f.hp)) this.learn(f, 'heart', u.hp - f.hp, n(1));
    if (n(2) && u.s1 >= f.s1) this.learn(f, 'yinyang', u.s1 - f.s1, n(2));
    if (n(3) && u.s2 >= 0 && u.s2 < 100 && f.s2 < 100) this.learn(f, 'peach', u.s2 - f.s2, n(3));
  }
  private learn(f: Fighter, key: Piece, total: number, pieces = 1) {
    const id = `${f === this.me ? 'me' : 'mob'}.${key}`, prior = key.startsWith('skill') ? 1 : 6;
    const [sum, n] = this.seen.get(id) ?? [f[key] * prior, prior];
    this.seen.set(id, [sum + total, n + pieces]); f[key] = (sum + total) / (n + pieces);
  }
}
