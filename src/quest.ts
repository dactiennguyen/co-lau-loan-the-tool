// Quest bot over a live world session (docs/app/events/10-quests.md). It reads the current main quest from s2c/39,
// fights the named mob with BattleRunner, and talks to quest NPCs with c2s/13.
import { Reader, Writer, characterPrefix, characterLocation } from './protocol.ts';
import { battleSetup, type Weights } from './battle.ts';
import { BattleRunner, type BattleEnd } from './battle-runner.ts';
import { buildRequest } from './events.ts';
import type { SessionApi, WorldSession } from './client.ts';
import { mapEntities, mapBoss, characterStats, questData, questProgress, questComplete, type Mob, type Quest, type QuestStep } from './world.ts';

/** What a quest step asks for, read from its text (the steps of quests 3–7 in 10-quests.md). */
export type StepAction =
  | { kind: 'kill'; mob: string }                   // "Tiêu diệt Heo Mọi", "Đánh bại Kẻ Gây Rối": each won battle counts 1
  | { kind: 'damage'; mob: string; amount: number } // "Gây 500 sát thương lên Thủ Lĩnh Sơn Tặc": damage to a boss of s2c/1177, won or lost
  | { kind: 'level'; level: number }                // "Đạt cấp độ 8"
  | { kind: 'stat' }                                // "Nâng điểm tiềm năng"
  | { kind: 'talk'; npcId: number }                 // "Nói chuyện với X", "Báo cáo với X": any other step that names an NPC
  | { kind: 'unknown' };

export function stepAction(step: Pick<QuestStep, 'text' | 'npcId'>): StepAction {
  let m: RegExpExecArray | null;
  if ((m = /^(?:Tiêu diệt|Đánh bại) (.+)$/.exec(step.text))) return { kind: 'kill', mob: m[1] };
  if ((m = /^Gây (\d+) sát thương lên (.+)$/.exec(step.text))) return { kind: 'damage', mob: m[2], amount: Number(m[1]) };
  if ((m = /^Đạt cấp độ (\d+)$/.exec(step.text))) return { kind: 'level', level: Number(m[1]) };
  if (/^Nâng điểm tiềm năng/.test(step.text)) return { kind: 'stat' };
  return step.npcId >= 0 ? { kind: 'talk', npcId: step.npcId } : { kind: 'unknown' };
}
export interface QuestBotOptions {
  maxFights: number; minHpRatio?: number; log: (event: Record<string, unknown>) => void;
  /** Mob name to fight while a "Đạt cấp độ N" step waits for the level; default: the strongest kind not above own level. */
  grind?: string;
  /** Own skill to cast in battle, see BattleIo.skill. */
  skill?: { id: number; cost: number };
  /** Move weights of every battle, see WEIGHTS in battle.ts. */
  weights?: Weights;
  /** Pause between own swaps in a timed battle, and before the next challenge (defaults 1000 and 3000 ms). */
  timedMoveMs?: number; restMs?: number;
  /** Mob name to fight on every step instead of the quest, for speed experiments. */
  farm?: string;
}

/** Plays the steps of the current main quest that stepAction knows; stops on any other step, on a loss, or after maxFights. */
export class QuestBot implements WorldSession {
  api?: SessionApi; quest?: Quest; mapId = ''; mobs: Mob[] = []; battle?: BattleRunner; target?: Mob;
  fights = 0; wins = 0; losses = 0; hp = 0; maxHp = 0; level = 0; statPoints?: number; challenged = 0; battleStart = 0;
  /** A talk or stat-point step is answered by s2c/34 alone. */
  awaitingReply = false;
  private wait?: ReturnType<typeof setTimeout>;
  options: QuestBotOptions;
  constructor(options: QuestBotOptions) { this.options = options; }
  private log(event: string, fields: Record<string, unknown> = {}) { this.options.log({ kind: 'quest', event, at: Date.now(), ...fields }); }

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
    if (this.battle?.onPacket(opcode, payload)) return;
    switch (opcode) {
      case 9: { const c = characterPrefix(payload); this.hp = c.hp; this.maxHp = c.maxHp; this.level = c.level; break; }
      case 29: this.mapId = characterLocation(payload).mapId; break;
      case 43: this.mobs = mapEntities(payload).mobs; break;
      case 1177: { const boss = mapBoss(payload).mob; if (!this.mobs.some(m => m.id === boss.id)) this.mobs.push(boss); this.log('boss', { id: boss.id, name: boss.name, level: boss.level }); break; }
      case 39: {
        const before = this.quest && `${this.quest.id}/${this.quest.current}`;
        this.quest = questData(payload); this.awaitingReply = false;
        this.log('quest', this.describe());
        if (this.api && !this.battle && before !== `${this.quest.id}/${this.quest.current}`) this.later(1500);
        break;
      }
      case 34: {
        const p = questProgress(payload);
        this.log('quest_progress', { questId: p.questId, text: p.text.slice(0, 120) });
        // A talk step is answered by s2c/34 alone (no new s2c/39), so the step is advanced here (L1 capture).
        if (this.awaitingReply && this.quest?.id === p.questId) { this.awaitingReply = false; this.advance('server answered'); }
        if (this.api && !this.battle) this.later(1500);
        break;
      }
      case 35: { const c = questComplete(payload); this.log('quest_complete', { questId: c.questId, title: c.title, rewards: c.rewards }); break; }
      case 10: {
        const s = characterStats(new Reader(payload));
        if (s.level !== undefined && s.level !== this.level) { this.level = s.level; this.log('level', { level: s.level, stats: s.stats }); }
        if (s.hp !== undefined) { this.hp = s.hp; this.maxHp = s.maxHp; this.log('stats', { hp: `${this.hp}/${this.maxHp}`, exp: s.exp, levelExp: s.levelExp, coin: s.coin }); }
        if (s.statPoints !== undefined) this.statPoints = s.statPoints;
        break;
      }
      case 36:
        // Gear durability, sent after every battle end and after c2s/40; inside a battle it means the server ended it.
        this.log('durability', { payloadHex: payload.toString('hex') });
        if (this.battle) { this.log('battle_cancelled'); this.battle = undefined; this.later(2000); }
        break;
      case 46: this.log('currency', { payloadHex: payload.toString('hex') }); break;
      case 1187: this.log('inventory_item', { payloadHex: payload.toString('hex') }); break;
      case 22: this.onSetup(payload); break;
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
  /** Sends a talk or stat-point request; s2c/34 or s2c/39 must answer within 8 s. */
  private ask(opcode: number, payload: Uint8Array, silence: string, fields: Record<string, unknown> = {}) {
    this.awaitingReply = true;
    this.send(opcode, payload);
    this.wait = setTimeout(() => this.stop(silence, fields), 8000);
  }
  private stop(reason: string, fields: Record<string, unknown> = {}) {
    clearTimeout(this.wait);
    this.log('stop', { reason, fights: this.fights, wins: this.wins, losses: this.losses, hp: `${this.hp}/${this.maxHp}`, quest: this.quest && this.describe(), ...fields });
    setTimeout(() => this.api?.close(), 1000);
  }

  /** Decide the next action from the current quest step. */
  next() {
    if (!this.api || this.battle) return;
    const q = this.quest, step = q?.steps[q.current];
    if (this.options.farm) return this.fight(this.mobs.filter(m => m.name === this.options.farm), `farm ${this.options.farm}`);
    if (!q || !step) return this.stop('no current quest step');
    const action = stepAction(step);
    switch (action.kind) {
      case 'kill': case 'damage': return this.fight(this.mobs.filter(m => m.name === action.mob), step.text);
      case 'level':
        if (this.level < action.level) return this.fight(this.grindTargets(), `${step.text} (cấp ${this.level})`);
        this.wait = setTimeout(() => this.stop('level reached but the server did not advance the step', { level: this.level }), 8000);
        return;
      case 'stat':
        this.log('stat_point', { step: step.text, statPoints: this.statPoints });
        return this.ask(10, buildRequest(10, { stat: 0, amount: 1 }), 'no answer to the stat point');
      case 'talk':
        this.log('talk', { step: step.text, mapId: this.mapId, npcId: action.npcId });
        return this.ask(13, buildRequest(13, { mapId: this.mapId, npcId: action.npcId }), 'npc did not answer', { npcId: action.npcId });
      default: return this.stop('step needs an action this bot does not know', { step: step.text });
    }
  }

  private fight(targets: Mob[], reason: string) {
    if (this.fights >= this.options.maxFights) return this.stop('fight limit reached');
    if (this.maxHp && this.hp < this.maxHp * (this.options.minHpRatio ?? 0)) return this.stop('hp too low to fight', { hp: this.hp });
    if (!targets.length) return this.stop('target mob not in this zone', { reason });
    const mob = this.target = targets[this.fights % targets.length];
    this.fights++; this.challenged = Date.now();
    this.log('challenge', { reason, mobId: mob.id, name: mob.name, level: mob.level, fight: this.fights });
    this.send(15, buildRequest(15, { mobId: mob.id }));
    this.wait = setTimeout(() => { if (!this.battle) { this.log('challenge_no_answer', { mobId: mob.id }); this.next(); } }, 8000);
  }

  /** Mobs to fight while waiting for a level: the named kind, or the strongest kind not above own level. */
  private grindTargets() {
    const name = this.options.grind ?? this.mobs.filter(m => m.level <= this.level).sort((a, b) => b.level - a.level)[0]?.name;
    return this.mobs.filter(m => m.name === name);
  }

  private onSetup(payload: Buffer) {
    clearTimeout(this.wait);
    // The mob block of s2c/22 starts with the length-prefixed mob id; a late setup may answer an earlier challenge.
    const s = battleSetup(payload), mobId = this.mobs.find(m => payload.includes(new Writer().string(m.id).build()))?.id ?? this.target?.id ?? '?';
    this.battleStart = Date.now();
    this.log('battle_setup', { uuid: s.uuid, mobId, hp: `${s.hp}/${s.maxHp}`, msAfterChallenge: this.battleStart - this.challenged });
    this.battle = new BattleRunner(s, mobId, { send: (op, p) => this.send(op, p), log: (event, fields) => this.log(event, fields), onEnd: end => this.onBattleEnd(end), skill: this.options.skill, weights: this.options.weights, timedMoveMs: this.options.timedMoveMs });
    this.battle.start();
  }

  private onBattleEnd(end: BattleEnd) {
    if (end.won) this.wins++; else this.losses++;
    this.hp = end.hp;
    this.log('battle_end', { ...end, ms: Date.now() - this.battleStart, skillsCast: this.battle?.skillsCast });
    this.battle = undefined;
    const q = this.quest, step = q?.steps[q.current], action = step && stepAction(step);
    const counts = action && 'mob' in action && this.mobs.find(m => m.id === end.mobId)?.name === action.mob;
    if (q && step && action && counts && action.kind === 'damage') {
      q.progress += end.damage;
      this.log('damage_counted', { step: step.text, progress: `${q.progress}/${action.amount}` });
      if (q.progress >= action.amount) this.advance('damage reached');
    }
    if (!end.won) return this.stop('lost a battle');
    if (q && step && action && counts && action.kind === 'kill') {
      q.progress++;
      this.log('kill_counted', { step: step.text, progress: `${q.progress}/${step.required}` });
      if (q.progress >= step.required) this.advance('kill count reached');
    }
    this.later(this.options.restMs ?? 3000);
  }
}
