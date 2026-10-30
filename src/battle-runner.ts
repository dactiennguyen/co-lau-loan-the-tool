// One mob battle over a live session, without the game UI (docs/app/events/07-auto-battle.md):
// s2c/22 setup → c2s/18 join → s2c/18 → c2s/14 seq 0 → { s2c/19|20 result; s2c/24 turn → c2s/19 own swap | c2s/14 mob step }
// until a result carries end=1.
import { Reader } from './protocol.ts';
import { EMPTY, UNKNOWN, swap, settle, findRuns, bestMove, battleSetup, battleJoinAck, battleResult, timeoutResult, turnState, DEFAULT_WEIGHTS,
  type Board, type Weights } from './battle.ts';
import { buildRequest } from './events.ts';

export interface BattleEnd { won: boolean; actor: string; exp?: number; coin?: number; myTurns: number; hp: number; mobId: string; damage: number }
export interface BattleIo {
  send(opcode: number, payload: Uint8Array): void;
  log(event: string, fields?: Record<string, unknown>): void;
  onEnd(end: BattleEnd): void;
  /** Own skill to cast (c2s/20) once own stat1 (nội lực) reaches `cost`; without an answer in 3 s the turn falls back to a swap. */
  skill?: { id: number; cost: number };
  /** Move weights; hearts get more weight below half HP. */
  weights?: Weights;
  /** Pause between own swaps in a timed battle (default 1000 ms). */
  timedMoveMs?: number;
}

/** Tracks the board from the server's results and answers every turn: bestMove on own turns, a step request on the mob's. */
export class BattleRunner {
  uuid: string; me: string; mobId: string; board: Board; myHp: number; maxHp: number; mobHp?: number; turns = 0;
  myStat1 = 0; skillsCast = 0; skillRefused = false; damage = 0;
  /** s2c/18 timed 1 (Sơn Tặc, Q6–Q9): no turns; the mob hits on a ~30 s timer (s2c/21) and the player may swap any time. */
  timed = false;
  io: BattleIo;
  private skillWait?: ReturnType<typeof setTimeout>;
  /** Fallback for a turn-based battle whose s2c/24 does not come: 2 s after a result the next turn is inferred from it. */
  private turnWait?: ReturnType<typeof setTimeout>;
  constructor(setup: ReturnType<typeof battleSetup>, mobId: string, io: BattleIo) {
    this.uuid = setup.uuid; this.me = setup.me; this.mobId = mobId; this.board = setup.board; this.myHp = setup.hp; this.maxHp = setup.maxHp;
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
    if (skill && !this.skillRefused && this.myStat1 >= skill.cost) {
      this.io.log('skill_try', { seq, skill: skill.id, stat1: this.myStat1 });
      this.io.send(20, buildRequest(20, { battleUuid: this.uuid, seq, skill: skill.id }));
      this.skillWait = setTimeout(() => { this.skillRefused = true; this.io.log('skill_no_answer', { seq, skill: skill.id, stat1: this.myStat1 }); this.swapMove(seq); }, 3000);
      return;
    }
    this.swapMove(seq);
  }

  private swapMove(seq: number) {
    const w = this.io.weights ?? DEFAULT_WEIGHTS;
    const pick = bestMove(this.board, { ...w, 1: this.myHp < this.maxHp * 0.5 ? 6 : w[1] });
    if (!pick) { this.io.log('no_legal_move', { seq }); return; }
    this.turns++;
    this.io.send(19, buildRequest(19, { battleUuid: this.uuid, seq, move: pick.move }));
  }

  private onResult(x: ReturnType<typeof battleResult> | ReturnType<typeof timeoutResult>) {
    clearTimeout(this.skillWait); clearTimeout(this.turnWait);
    if ('skill' in x && x.skill !== undefined && x.actor === this.me) { this.skillsCast++; this.io.log('skill_cast', { seq: x.seq, skill: x.skill, targets: x.targets, cells: x.cells.length }); }
    if ('move' in x && x.move) swap(this.board, x.move);
    const o = settle(this.board, x.refill, x.cells);
    if (o.refillUsed !== x.refill.length || this.board.some(v => v === EMPTY || v === UNKNOWN) || findRuns(this.board).cells.size) this.io.log('board_desync', { seq: x.seq });
    if ('newBoard' in x && x.newBoard) { this.board = x.newBoard; this.io.log('board_reshuffled', { seq: x.seq, actor: x.actor }); }
    for (const u of x.units) {
      if (u.name === this.me && u.hp >= 0) this.myHp = u.hp;
      if (u.name === this.me && u.s1 >= 0) this.myStat1 = u.s1;
      if (u.name === this.me && u.damage > 0) this.damage += u.damage;
      if (u.name === this.mobId && u.hp >= 0) this.mobHp = u.hp;
    }
    // One line per move: what the actor cleared and what it did, for the damage and speed analysis of 10-quests.md.
    this.io.log('move', { seq: x.seq, actor: x.actor === this.me ? 'me' : 'mob', skill: 'skill' in x && x.skill !== undefined, cleared: o.cleared, waves: o.waves, extraTurn: x.extraTurn,
      units: x.units.map(u => [u.name === this.me ? 'me' : 'mob', u.damage, u.hp, u.s1, u.s2]) });
    if (!x.end && this.timed) { this.turnWait = setTimeout(() => this.myMove(x.seq), this.io.timedMoveMs ?? 1000); return; }
    if (!x.end) {
      const mine = x.actor === this.me, again = mine === x.extraTurn;
      this.turnWait = setTimeout(() => { this.io.log('turn_inferred', { seq: x.seq, myTurn: again }); if (again) this.myMove(x.seq); else this.step(x.seq); }, 2000);
      return;
    }
    clearTimeout(this.skillWait);
    this.io.onEnd({ won: x.reward?.won ?? x.actor === this.me, actor: x.actor, exp: x.reward?.exp, coin: x.reward?.coin, myTurns: this.turns, hp: this.myHp, mobId: this.mobId, damage: this.damage });
  }
}
