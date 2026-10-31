// Quest bot over a live world session (docs/app/events/10-quests.md). It reads the current main quest from s2c/39,
// fights the named mob with BattleRunner, talks to quest NPCs with c2s/13, and walks through portals (c2s/13 with the
// portal id) when the NPC or mob of a step is in another map. What it sees of each map goes to the atlas (atlas.ts), which
// also tells it the way to maps seen in earlier runs.
import { Reader, Writer, characterPrefix, characterProfile, characterLocation } from './protocol.ts';
import { battleSetup, type Strategy } from './battle.ts';
import { BattleRunner, type BattleEnd } from './battle-runner.ts';
import { buildRequest } from './events.ts';
import type { SessionApi, WorldSession } from './client.ts';
import { mapData, mapChange, mapEntities, mapBoss, notice, characterStats, ZonePlayers, questData, questProgress, questComplete, type Mob, type Place, type Quest, type QuestStep } from './world.ts';
import { type Atlas, type MapRecord, loadAtlas, atlasJson, saveAtlas, recordMap, recordMobs, recordBoss, recordPortal, recordRefusal, destination, portalsOf, route } from './atlas.ts';

/** What a quest step asks for, read from its text (the steps of quests 3–8 in 10-quests.md). */
export type StepAction =
  | { kind: 'kill'; mob: string }                   // "Tiêu diệt Heo Mọi", "Tiêu diệt 1 Sói Xám", "Đánh bại Kẻ Gây Rối": each won battle counts 1
  | { kind: 'damage'; mob: string; amount: number } // "Gây 500 sát thương lên Thủ Lĩnh Sơn Tặc": damage to a boss of s2c/1177, won or lost
  | { kind: 'level'; level: number }                // "Đạt cấp độ 8"
  | { kind: 'stat' }                                // "Nâng điểm tiềm năng"
  | { kind: 'talk'; npcId: number }                 // "Nói chuyện với X", "Báo cáo với X": any other step that names an NPC
  | { kind: 'unknown' };

export function stepAction(step: Pick<QuestStep, 'text' | 'npcId'>): StepAction {
  let m: RegExpExecArray | null;
  if ((m = /^(?:Tiêu diệt|Đánh bại) (?:\d+ )?(.+)$/.exec(step.text))) return { kind: 'kill', mob: m[1] };
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
  /** Move search of every battle, see STRATEGIES in battle.ts. */
  strategy?: Strategy;
  /** Pause between own swaps in a timed battle, and before the next challenge (defaults 1000 and 3000 ms). */
  timedMoveMs?: number; restMs?: number;
  /** Mob name to fight on every step instead of the quest, for speed experiments. */
  farm?: string;
  /** Lost battles allowed before the bot stops (default 1). A loss costs EXP (36 at level 19) but refills HP (Q17, Q18). */
  maxLosses?: number;
  /** Atlas file read at start and written when the bot learns something (quest-run: data/maps.json); none keeps it in memory. */
  atlas?: string;
  /** Plays only the step current at onReady (the app's ▶ on a step), and stops once the quest moves past it. */
  once?: boolean;
  /** Surrenders the first battle once own swaps reach this (surrender()), then stops when that battle is over, left or
   * played out: to try leaving live. It costs EXP ("Rời trận, mất 29 kinh nghiệm" in B3). */
  surrenderAfter?: number;
}

/** Plays the steps of the current main quest that stepAction knows; stops on any other step, after maxLosses losses, or after maxFights. */
export class QuestBot implements WorldSession {
  api?: SessionApi; quest?: Quest; mapId = ''; zone = 0; mobs: Mob[] = []; places: Place[] = []; battle?: BattleRunner; target?: Mob;
  /** Ids of the bosses of s2c/1177 (challenged with c2s/1178). */
  bosses = new Set<string>();
  /** Maps seen in this run and in earlier ones. */
  atlas: Atlas; private saved = '';
  /** Set from c2s/13 through a portal until s2c/43 of the new map; hops counts portals taken for the current step;
   * refused holds the portals the server refused in this run. */
  travelling?: Pick<Place, 'id' | 'name'>; hops = 0; refused = new Set<number>();
  /** Waits for a moving boss before the current challenge. */
  waits = 0;
  fights = 0; wins = 0; losses = 0; hp = 0; maxHp = 0; level = 0; statPoints?: number; challenged = 0; battleStart = 0;
  /** Other players of the zone (s2c/1263, 1167, 1170, 1253). */
  readonly nearby = new ZonePlayers();
  /** A talk or stat-point step is answered by s2c/34 alone. */
  awaitingReply = false;
  /** With `once`: the quest id and step index played, and the step's text. */
  playing?: { id: number; at: number; text: string };
  /** After surrender(): 8 s for the server to end the battle; and s2c/11 of the map asked with c2s/40 still to answer
   * with c2s/43, as the game does. */
  private leaving?: ReturnType<typeof setTimeout>;
  private reloadMap = false;
  /** --surrender-after tries once in a run, even when the server ignores it. */
  private surrenderTried = false;
  private wait?: ReturnType<typeof setTimeout>;
  options: QuestBotOptions;
  constructor(options: QuestBotOptions) { this.options = options; this.atlas = loadAtlas(options.atlas); this.saved = atlasJson(this.atlas); }
  private log(event: string, fields: Record<string, unknown> = {}) { this.options.log({ kind: 'quest', event, at: Date.now(), ...fields }); }

  onReady(api: SessionApi) {
    this.api = api;
    const q = this.quest, step = q?.steps[q.current];
    this.playing = this.options.once && q && step ? { id: q.id, at: q.current, text: step.text } : undefined;
    this.log('ready', { mapId: this.mapId, hp: `${this.hp}/${this.maxHp}`, mobs: this.mobs.length, quest: this.quest && this.describe(), once: this.playing?.text });
    this.next();
  }

  onPacket(opcode: number, payload: Buffer) {
    try { this.handle(opcode, payload); }
    catch (error) { this.log('parse_error', { opcode, reason: (error as Error).message, payloadHex: payload.toString('hex') }); }
  }

  private handle(opcode: number, payload: Buffer) {
    if (this.battle?.onPacket(opcode, payload)) {
      const n = this.options.surrenderAfter;
      if (n !== undefined && !this.surrenderTried && this.battle && this.battle.turns >= n) { this.surrenderTried = true; this.surrender(); }
      return;
    }
    switch (opcode) {
      case 9: {
        const c = characterPrefix(payload); this.hp = c.hp; this.maxHp = c.maxHp; this.level = c.level;
        const p = characterProfile(payload); this.statPoints = p.statPoints;
        this.log('character', { level: p.level, hp: `${p.hp}/${p.maxHp}`, exp: p.exp, levelExp: p.levelExp, coin: p.coin, combat: p.combat, statPoints: p.statPoints, skillPoints: p.skillPoints });
        break;
      }
      case 1263: case 1167: case 1170: case 1253:
        if (this.nearby.on(opcode, payload) && opcode === 1263) this.log('players', { count: this.nearby.players.size, players: this.nearby.list().map(p => `${p.name} ${p.level}`) });
        break;
      case 29: this.mapId = characterLocation(payload).mapId; break;
      case 11: {
        if (payload[0] !== 1) break; // flag 0 is the world map ("M99")
        const d = mapData(payload);
        this.mapId = d.mapId; this.zone = d.area; this.places = d.places;
        recordMap(this.atlas, d); this.remember();
        this.log('map', { mapId: d.mapId, name: d.name, npcs: d.places.filter(p => p.type === 2).map(p => `${p.id} ${p.name}`), portals: d.places.filter(p => p.type === 0).map(p => `${p.id} ${p.name}`) });
        // After a surrender the map comes back for the c2s/11 sent with c2s/40; it answers that request, so it does not
        // prove the battle over (s2c/36 or s2c/1214 does).
        const reload = this.reloadMap; this.reloadMap = false;
        if (this.travelling || reload) this.send(43, buildRequest(43, { mapId: d.mapId }));
        break;
      }
      // Through a portal: the new map; the client then asks for the map (c2s/11) and its mobs (c2s/43), B5.
      case 13: {
        const { mapId } = mapChange(payload);
        this.log('map_changed', { mapId, portal: this.travelling?.name });
        if (this.travelling) { clearTimeout(this.wait); recordPortal(this.atlas, this.travelling.id, { name: this.travelling.name, mapId }); this.send(11, buildRequest(11, { mapId })); }
        break;
      }
      case 43: {
        const d = mapEntities(payload); this.mobs = d.mobs;
        recordMobs(this.atlas, d.mapId, this.zone, d.mobs); this.remember();
        if (this.travelling) { this.log('arrived', { mapId: this.mapId, name: this.atlas.maps[this.mapId]?.name, via: this.travelling.name }); this.travelling = undefined; this.later(2000); }
        break;
      }
      // A portal the character may not enter answers c2s/13 with "Bạn phải đạt cấp 40 mới vào được Lạc Cốc" (Q15) or
      // "Bạn cần hoàn thành nhiệm vụ trước khi tới đây" (S1); travel() then leaves it out.
      case 1256: {
        if (!this.travelling) break;
        const text = notice(payload).text;
        recordRefusal(this.atlas, this.travelling, text); this.remember(); this.refused.add(this.travelling.id);
        this.log('portal_refused', { portal: this.travelling.id, name: this.travelling.name, text });
        this.travelling = undefined; this.later(1000);
        break;
      }
      case 1177: {
        const b = mapBoss(payload);
        if ('gone' in b) { this.mobs = this.mobs.filter(m => m.id !== b.gone); this.log('boss_moving', { id: b.gone }); break; }
        if (!this.mobs.some(m => m.id === b.mob.id)) this.mobs.push(b.mob);
        this.bosses.add(b.mob.id);
        recordBoss(this.atlas, b.mapId, this.zone, b.mob, b.tile); this.remember();
        this.log('boss', { id: b.mob.id, name: b.mob.name, level: b.mob.level, tile: b.tile });
        break;
      }
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
      // The server's count for the current step, right after each battle that counts (kills, or total boss damage).
      case 1201: { const progress = new Reader(payload).i32(); if (this.quest) this.quest.progress = progress; this.log('step_progress', { progress }); break; }
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
        if (this.battle?.surrendered) this.left(36);
        else if (this.battle) { this.log('battle_cancelled'); this.battle = undefined; this.later(2000); }
        break;
      // Empty, at the end of a battle and after c2s/40 (05-battle).
      case 1214: if (this.battle?.surrendered) this.left(1214); break;
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
  /** Writes the atlas file when something changed. */
  private remember() {
    const json = atlasJson(this.atlas);
    if (this.options.atlas && json !== this.saved) { saveAtlas(this.options.atlas, this.atlas); this.saved = json; }
  }
  private advance(reason: string) {
    const q = this.quest!; q.current++; q.progress = 0; this.hops = 0;
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

  /** Leaves the battle in progress as the game's Đầu hàng does (BattleRunner.leave). s2c/1214 (every capture) or s2c/36
   * then ends it, even after the 8 s wait; without either by then the battle is played on (BattleRunner.resume). */
  surrender() {
    const b = this.battle;
    if (!b || b.leaving) return;
    this.log('surrender', { mobId: b.mobId, turns: b.turns });
    b.leave(this.mapId); this.reloadMap = true;
    this.leaving = setTimeout(() => { if (this.battle === b && b.leaving) { this.log('surrender_no_answer', { mobId: b.mobId }); b.resume(); } }, 8000);
  }
  private left(by: number) {
    clearTimeout(this.leaving);
    this.log('battle_left', { by: `s2c/${by}`, mobId: this.battle?.mobId });
    this.battle = undefined;
    this.stop('surrendered');
  }

  /** Decide the next action from the current quest step. */
  next() {
    if (!this.api || this.battle) return;
    const q = this.quest, step = q?.steps[q.current];
    if (this.options.farm) return this.farm(this.options.farm);
    // The step moves on after the NPC reply (s2c/34), a new s2c/39, or the kill count or damage reached just below. It is
    // done once the quest is past it or a new quest came after the report; a quest moving back has not been seen.
    const p = this.playing;
    if (p && (!q || q.id !== p.id || q.current !== p.at)) return this.stop(q && (q.id !== p.id || q.current > p.at) ? 'step done' : 'quest left the step', { step: p.text });
    if (!q || !step) return this.stop('no current quest step');
    const action = stepAction(step);
    if ((action.kind === 'kill' && q.progress >= step.required) || (action.kind === 'damage' && q.progress >= action.amount)) {
      this.advance(action.kind === 'kill' ? 'kill count reached' : 'damage reached');
      return this.next();
    }
    if (this.elsewhere(action, step.text)) return;
    switch (action.kind) {
      case 'kill': return this.fight(this.mobs.filter(m => m.name === action.mob), step.text);
      // The boss of s2c/1177 ignores c2s/15; the game challenges it with c2s/1178 (B4).
      case 'damage': return this.fight(this.mobs.filter(m => m.name === action.mob), step.text, 1178);
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

  private fight(targets: Mob[], reason: string, opcode: 15 | 1178 = 15) {
    if (this.fights >= this.options.maxFights) return this.stop('fight limit reached');
    if (this.maxHp && this.hp < this.maxHp * (this.options.minHpRatio ?? 0)) return this.stop('hp too low to fight', { hp: this.hp });
    this.waits = 0;
    if (!targets.length) return this.stop('target mob not in this zone', { reason });
    const mob = this.target = targets[this.fights % targets.length];
    this.fights++; this.challenged = Date.now();
    this.log('challenge', { reason, opcode, mobId: mob.id, name: mob.name, level: mob.level, fight: this.fights });
    this.send(opcode, buildRequest(opcode, { mobId: mob.id }));
    this.wait = setTimeout(() => { if (!this.battle) { this.log('challenge_no_answer', { mobId: mob.id }); this.next(); } }, 8000);
  }

  /** --farm: the named mob or boss on every fight, in this map only. A boss of s2c/1177 is challenged with c2s/1178 and
   * waited for (6 × 5 s) while it changes tiles, as the atlas or an earlier s2c/1177 puts it in this map. */
  private farm(name: string): void {
    const targets = this.mobs.filter(m => m.name === name);
    const boss = targets.some(m => this.bosses.has(m.id)) || !!this.atlas.maps[this.mapId]?.bosses.some(b => b.name === name);
    if (!targets.length && boss && this.waits < 6) {
      this.waits++; this.log('waiting_for_mob', { mob: name, wait: this.waits });
      return this.later(5000);
    }
    return this.fight(targets, `farm ${name}`, boss ? 1178 : 15);
  }

  /** True when the mob or NPC of the step is not in this map and the bot waits for it or travels. */
  private elsewhere(action: StepAction, reason: string) {
    if ('mob' in action && !this.mobs.some(m => m.name === action.mob)) {
      const has = (m: MapRecord) => m.mobs.some(k => k.name === action.mob) || m.bosses.some(b => b.name === action.mob);
      // A mob the atlas puts in this map, like a boss between its s2c/1177 field 1 and field 0 (~13 s), is waited for
      // here (6 × 5 s), never searched elsewhere: then fight() stops with "target mob not in this zone".
      if (!this.atlas.maps[this.mapId] || !has(this.atlas.maps[this.mapId])) return this.travel(reason, has);
      if (this.waits >= 6) return false;
      this.waits++; this.log('waiting_for_mob', { mob: action.mob, wait: this.waits });
      this.later(5000);
      return true;
    }
    if (action.kind === 'talk' && this.places.length && !this.places.some(p => p.type === 2 && p.id === action.npcId))
      return this.travel(reason, m => m.places.some(p => p.type === 2 && p.id === action.npcId));
    return false;
  }

  /** The NPC or mob of a step is not in this map: walk through a portal of s2c/11 (c2s/13 with its id, B5). The portal
   * is the first of the shortest known way to a map that has it (`wanted`), else one the quest names ("Tìm Đến Vân Sơn")
   * towards a map not seen yet, else any towards a map not seen yet. Portals refused (level, quest) are left out. */
  private travel(reason: string, wanted: (m: MapRecord) => boolean) {
    const q = this.quest!, text = `${q.title} ${q.description} ${q.steps[q.current]?.text ?? ''}`;
    const fresh = portalsOf(this.atlas, this.mapId, this.level, this.refused).filter(p => !destination(this.atlas, p, this.mapId));
    const portal = route(this.atlas, this.mapId, wanted, this.level, this.refused) ?? fresh.find(p => text.includes(p.name)) ?? fresh[0];
    if (!portal || this.hops >= 6) return false;
    this.hops++; this.travelling = { id: portal.id, name: portal.name };
    this.log('travel', { reason, from: this.mapId, portal: portal.id, name: portal.name, hop: this.hops });
    this.send(13, buildRequest(13, { mapId: this.mapId, npcId: portal.id }));
    this.wait = setTimeout(() => this.stop('portal did not answer', { portal: portal.id }), 8000);
    return true;
  }

  /** Mobs to fight while waiting for a level: the named kind, or the strongest kind not above own level that is not a
   * boss (a boss ignores c2s/15). */
  private grindTargets() {
    const name = this.options.grind ?? this.mobs.filter(m => m.level <= this.level && !this.bosses.has(m.id)).sort((a, b) => b.level - a.level)[0]?.name;
    return this.mobs.filter(m => m.name === name);
  }

  private onSetup(payload: Buffer) {
    clearTimeout(this.wait);
    // The mob block of s2c/22 starts with the length-prefixed mob id; a late setup may answer an earlier challenge.
    const s = battleSetup(payload), mobId = this.mobs.find(m => payload.includes(new Writer().string(m.id).build()))?.id ?? this.target?.id ?? '?';
    this.battleStart = Date.now(); this.hp = s.hp; this.maxHp = s.maxHp;
    this.log('battle_setup', { uuid: s.uuid, mobId, hp: `${s.hp}/${s.maxHp}`, msAfterChallenge: this.battleStart - this.challenged });
    this.battle = new BattleRunner(s, mobId, { send: (op, p) => this.send(op, p), log: (event, fields) => this.log(event, fields), onEnd: end => this.onBattleEnd(end), skill: this.options.skill, strategy: this.options.strategy, timedMoveMs: this.options.timedMoveMs });
    this.battle.start();
  }

  private onBattleEnd(end: BattleEnd) {
    if (end.won) this.wins++; else this.losses++;
    this.hp = end.hp;
    this.log('battle_end', { ...end, ms: Date.now() - this.battleStart, skillsCast: this.battle?.skillsCast });
    this.battle = undefined;
    const q = this.quest, step = q?.steps[q.current], action = step && stepAction(step);
    const counted = q && step && action && 'mob' in action && this.mobs.find(m => m.id === end.mobId)?.name === action.mob;
    // Local count; s2c/1201 replaces it with the server's a few ms later, before next() decides (and advances). A boss
    // (5000 HP for Thủ Lĩnh Sơn Tặc) is not expected to fall: its damage counts won or lost, and a loss does not stop the
    // bot, in a quest step or with --farm. A kill counts only when won.
    const boss = counted && action.kind === 'damage';
    if (!end.won && this.bosses.has(end.mobId)) this.log('boss_loss', { mobId: end.mobId, damage: end.damage });
    if (boss) { q.progress += end.damage; this.log('damage_counted', { step: step.text, progress: `${q.progress}/${action.amount}` }); }
    if (counted && action.kind === 'kill' && end.won) { q.progress++; this.log('kill_counted', { step: step.text, progress: `${q.progress}/${step.required}` }); }
    if (this.surrenderTried) return this.stop('battle over without the surrender');
    if (!end.won && !this.bosses.has(end.mobId) && this.losses >= (this.options.maxLosses ?? 1)) return this.stop('lost a battle');
    this.later(this.options.restMs ?? 3000);
  }
}
