// Quest bot over a live world session (docs/app/events/10-quests.md). It reads the current main quest from s2c/39,
// fights the named mob with the headless battle flow of 07-auto-battle.md, and talks to quest NPCs with c2s/13.
import { Reader, Writer } from './protocol.ts';
import { N, EMPTY, UNKNOWN, swap, settle, findRuns, bestMove, DEFAULT_WEIGHTS, type Board, type Move } from './battle.ts';
import type { SessionApi, WorldSession } from './client.ts';
import { questData, questProgress, questComplete, type Quest } from './world.ts';

/** s2c/22: the two fighters, the battle uuid and the 8×8 board (tail: string uuid; i32 64; u8[64]; u8 seconds; u8). */
export function battleSetup(payload: Uint8Array) {
  const r = new Reader(payload); r.u8(); r.u8();
  const me = r.string(); r.string(); r.u8(); r.u8(); r.u8(); const level = r.i32(); r.i32(); r.u8();
  const hp = r.i32(), maxHp = r.i32();
  const t = new Reader(Buffer.from(payload).subarray(payload.length - 2 - 64 - 4 - 40));
  const uuid = t.string(); t.i32();
  return { me, level, hp, maxHp, uuid, board: [...t.take(64)], turnSeconds: t.u8() };
}
/** s2c/19 (a swap) and s2c/20 (a skill): refill list, unit changes, flags and the end-of-battle block. */
export function battleResult(payload: Uint8Array, opcode: 19 | 20) {
  const r = new Reader(payload), seq = r.i32(); r.i32(); r.i32();
  let move: Move | undefined, cells: number[] = [];
  if (opcode === 19) move = { from: [r.i32() - 2, r.i32() - 2], to: [r.i32() - 2, r.i32() - 2] };
  else { r.i32(); r.i32(); r.i32(); cells = Array.from({ length: r.i32() }, () => (r.i32() - 2) * N + (r.i32() - 2)); }
  r.i32(); const refill = [...r.take(r.i32())];
  // u8 1 + i32 64 + 64 bytes when the server reshuffled the board after the move (seen on a mob move, quest run 1).
  const newBoard = r.u8() === 1 ? [...r.take(r.i32())] : undefined;
  r.take(3);
  const units = [];
  for (let n = r.u8(); n > 0; n--) units.push({ name: r.string(), damage: r.i32(), b: r.u8(), hp: r.i32(), s1: r.i32(), s2: r.i32() });
  const flags = [r.u8(), r.u8(), r.u8(), r.u8()], actor = r.string(), end = r.u8();
  const reward = end === 1 ? { won: r.u8() === 1, exp: r.i32(), coin: r.i32() } : undefined;
  return { seq, move, cells, refill, newBoard, units, extraTurn: flags[1] === 1, actor, end: end === 1, reward };
}

interface Mob { id: string; name: string; level: number }
/** Kill steps seen so far: "Tiêu diệt Gà Điên", "Tiêu diệt Heo Mọi", "Đánh bại Kẻ Gây Rối". */
const KILL_STEP = /^(?:Tiêu diệt|Đánh bại) (.+)$/;
interface Battle { uuid: string; me: string; mobId: string; board: Board; myHp: number; maxHp: number; mobHp?: number; turns: number }
export interface QuestBotOptions { maxFights: number; minHpRatio?: number; log: (event: Record<string, unknown>) => void }

/** Plays kill and talk steps of the current main quest; stops on anything else, on a loss, or after maxFights. */
export class QuestBot implements WorldSession {
  api?: SessionApi; quest?: Quest; mapId = ''; mobs: Mob[] = []; battle?: Battle;
  fights = 0; wins = 0; losses = 0; hp = 0; maxHp = 0; challenged = 0; talking = false;
  private wait?: ReturnType<typeof setTimeout>;
  options: QuestBotOptions;
  constructor(options: QuestBotOptions) { this.options = options; }
  private log(event: string, fields: Record<string, unknown> = {}) { this.options.log({ kind: 'quest', event, ...fields }); }

  onReady(api: SessionApi) {
    this.api = api;
    this.log('ready', { mapId: this.mapId, hp: `${this.hp}/${this.maxHp}`, mobs: this.mobs.length, quest: this.quest && this.describe() });
    this.next();
  }

  onPacket(opcode: number, payload: Buffer) {
    try { this.handle(opcode, payload); }
    catch (error) { this.log('parse_error', { opcode, reason: (error as Error).message, payloadHex: payload.toString('hex') }); }
  }

  private handle(opcode: number, payload: Buffer) {
    switch (opcode) {
      case 9: { const r = new Reader(payload); r.u8(); r.u8(); r.string(); r.i32(); r.string(); r.u8(); r.u8(); r.i32(); this.hp = r.i32(); this.maxHp = r.i32(); break; }
      case 29: { const r = new Reader(payload); r.string(); this.mapId = r.string(); break; }
      case 43: {
        const r = new Reader(payload); r.string(); r.u8(); this.mobs = [];
        while (r.offset < payload.length) { const id = r.string(), name = r.string(), level = r.i32(); r.u8(); r.i32(); r.i32(); r.u8(); this.mobs.push({ id, name, level }); }
        break;
      }
      case 39: {
        const before = this.quest && `${this.quest.id}/${this.quest.current}`;
        this.quest = questData(payload); this.talking = false;
        this.log('quest', this.describe());
        if (this.api && !this.battle && before !== `${this.quest.id}/${this.quest.current}`) this.later(1500);
        break;
      }
      case 34: {
        const p = questProgress(payload);
        this.log('quest_progress', { questId: p.questId, text: p.text.slice(0, 120) });
        // A talk step is answered by s2c/34 alone (no new s2c/39), so the step is advanced here (L1 capture).
        if (this.talking && this.quest?.id === p.questId) { this.talking = false; this.advance('npc answered'); }
        if (this.api && !this.battle) this.later(1500);
        break;
      }
      case 35: { const c = questComplete(payload); this.log('quest_complete', { questId: c.questId, title: c.title, rewards: c.rewards }); break; }
      case 10: {
        const r = new Reader(payload);
        if (r.i32() === 4) { r.string(); this.hp = r.i32(); this.maxHp = r.i32(); this.log('stats', { hp: `${this.hp}/${this.maxHp}`, exp: r.i32() }); }
        break;
      }
      case 22: this.onSetup(payload); break;
      case 18: if (this.battle) this.send(14, new Writer().string(this.battle.uuid).i32(0).build()); break;
      case 24: {
        if (!this.battle) break;
        const r = new Reader(payload), seq = r.i32(); r.i32();
        if (r.u8() === 1) this.myMove(seq); else this.send(14, new Writer().string(this.battle.uuid).i32(seq).build());
        break;
      }
      case 19: case 20: this.onResult(payload, opcode); break;
      case 36: if (this.battle) { this.log('battle_cancelled'); this.battle = undefined; this.later(2000); } break;
      case 0: case 5: this.log('server_text', { opcode, text: payload.toString('utf8').replace(/[\x00-\x1f]/g, ' ').trim().slice(0, 160) }); break;
    }
  }

  private describe() {
    const q = this.quest!, step = q.steps[q.current];
    return { id: q.id, title: q.title, current: q.current, progress: q.progress, step: step && `${step.text} (${step.required})`, steps: q.steps.map(s => s.text) };
  }
  private send(opcode: number, payload: Uint8Array) { this.api?.send(opcode, payload); }
  private advance(reason: string) {
    const q = this.quest!; q.current++; q.progress = 0;
    this.log('step_advanced', { reason, current: q.current, step: q.steps[q.current]?.text ?? null });
  }
  private later(ms: number) { clearTimeout(this.wait); this.wait = setTimeout(() => this.next(), ms); }
  private stop(reason: string, fields: Record<string, unknown> = {}) {
    clearTimeout(this.wait);
    this.log('stop', { reason, fights: this.fights, wins: this.wins, losses: this.losses, hp: `${this.hp}/${this.maxHp}`, quest: this.quest && this.describe(), ...fields });
    setTimeout(() => this.api?.close(), 1000);
  }

  /** Decide the next action from the current quest step. */
  next() {
    if (!this.api || this.battle) return;
    const q = this.quest, step = q?.steps[q.current];
    if (!q || !step) return this.stop('no current quest step');
    const kill = KILL_STEP.exec(step.text);
    if (kill) {
      if (this.fights >= this.options.maxFights) return this.stop('fight limit reached');
      if (this.maxHp && this.hp < this.maxHp * (this.options.minHpRatio ?? 0.4)) return this.stop('hp too low to fight', { hp: this.hp });
      const targets = this.mobs.filter(m => m.name === kill[1]);
      if (!targets.length) return this.stop('target mob not in this zone', { target: kill[1] });
      const mob = targets[this.fights % targets.length];
      this.fights++; this.challenged = Date.now();
      this.log('challenge', { step: step.text, mobId: mob.id, name: mob.name, level: mob.level, fight: this.fights });
      this.send(15, new Writer().string(mob.id).u8(0).build());
      this.wait = setTimeout(() => { if (!this.battle) { this.log('challenge_no_answer', { mobId: mob.id }); this.next(); } }, 8000);
      return;
    }
    if (step.npcId >= 0) {
      this.log('talk', { step: step.text, mapId: this.mapId, npcId: step.npcId });
      this.talking = true;
      this.send(13, new Writer().string(this.mapId).i32(step.npcId).build());
      this.wait = setTimeout(() => this.stop('npc did not answer', { npcId: step.npcId }), 8000);
      return;
    }
    this.stop('step needs an action this bot does not know', { step: step.text });
  }

  private onSetup(payload: Buffer) {
    clearTimeout(this.wait);
    const s = battleSetup(payload), mobId = this.mobs.find(m => payload.includes(Buffer.from(m.id)))?.id ?? '?';
    this.battle = { uuid: s.uuid, me: s.me, mobId, board: s.board, myHp: s.hp, maxHp: s.maxHp, turns: 0 };
    this.log('battle_setup', { uuid: s.uuid, mobId, hp: `${s.hp}/${s.maxHp}`, msAfterChallenge: Date.now() - this.challenged });
    this.send(18, new Writer().string(s.uuid).build());
  }

  private myMove(seq: number) {
    const b = this.battle!;
    const pick = bestMove(b.board, { ...DEFAULT_WEIGHTS, 1: b.myHp < b.maxHp * 0.5 ? 6 : 2 });
    if (!pick) { this.log('no_legal_move', { seq }); return; }
    const { from: [r1, c1], to: [r2, c2] } = pick.move;
    b.turns++;
    this.send(19, new Writer().string(b.uuid).i32(seq).i32(r1 + 2).i32(c1 + 2).i32(r2 + 2).i32(c2 + 2).build());
  }

  private onResult(payload: Buffer, opcode: 19 | 20) {
    const b = this.battle; if (!b) return;
    const x = battleResult(payload, opcode);
    if (x.move) swap(b.board, x.move);
    const o = settle(b.board, x.refill, x.cells);
    if (o.refillUsed !== x.refill.length || b.board.some(v => v === EMPTY || v === UNKNOWN) || findRuns(b.board).cells.size) this.log('board_desync', { seq: x.seq });
    if (x.newBoard) { b.board = x.newBoard; this.log('board_reshuffled', { seq: x.seq, actor: x.actor }); }
    for (const u of x.units) {
      if (u.name === b.me && u.hp >= 0) b.myHp = u.hp;
      if (u.name === b.mobId && u.hp >= 0) b.mobHp = u.hp;
    }
    if (!x.end) return;
    const won = x.reward?.won ?? x.actor === b.me;
    if (won) this.wins++; else this.losses++;
    this.hp = b.myHp;
    this.log('battle_end', { won, actor: x.actor, exp: x.reward?.exp, coin: x.reward?.coin, myTurns: b.turns, hp: b.myHp, mobId: b.mobId });
    this.battle = undefined;
    if (!won) return this.stop('lost a battle');
    const q = this.quest, step = q?.steps[q.current], kill = step && KILL_STEP.exec(step.text);
    if (q && step && kill && this.mobs.find(m => m.id === b.mobId)?.name === kill[1]) {
      q.progress++;
      this.log('kill_counted', { step: step.text, progress: `${q.progress}/${step.required}` });
      if (q.progress >= step.required) this.advance('kill count reached');
    }
    this.later(3000);
  }
}
