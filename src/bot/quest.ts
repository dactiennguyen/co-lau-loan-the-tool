// Quest bot over a live world session (docs/app/events/10-quests.md). It reads the current main quest from s2c/39,
// fights the named mob with BattleRunner, talks to quest NPCs with c2s/13, and walks through portals (c2s/13 with the
// portal id) when the NPC or mob of a step is in another map. What it sees of each map goes to the atlas (atlas.ts), which
// also tells it the way to maps seen in earlier runs.
import { Reader, Writer, characterPrefix, characterProfile, characterLocation, characterSkills } from '../protocol/protocol.ts';
import { battleSetup, duelMobId, mobBlock, type Strategy } from '../battle/battle.ts';
import { BattleRunner, type BattleEnd } from '../battle/battle-runner.ts';
import { learntSkills, POTIONS } from '../battle/battle-actions.ts';
import { buildRequest } from '../protocol/events.ts';
import type { SessionApi, WorldSession } from '../net/client.ts';
import { ITEM_ELEMENTS, type Items } from '../protocol/items.ts';
import { skillTree } from '../protocol/skills.ts';
import { mapData, mapChange, mapEntities, mapBoss, notice, groundItem, characterStats, ZonePlayers, questData, questProgress, questComplete, npcMenu, skillTable, inventory, characterExtra, characterGear, characterTail, currencies, gearDurability, POTENTIALS, MAIN_STAT, type Mob, type Place, type Quest, type QuestStep, type Skill } from '../protocol/world.ts';
import { BattleRecorder } from './battle-record.ts';
import { type Atlas, type MapRecord, loadAtlas, atlasJson, saveAtlas, recordMap, recordMobs, recordBoss, recordPortal, recordRefusal, destination, portalsOf, route } from './atlas.ts';

/** What a quest step asks for, read from its text (the steps of quests 3–8 in 10-quests.md). */
export type StepAction =
  | { kind: 'kill'; mob: string }                   // "Tiêu diệt Heo Mọi", "Tiêu diệt 1 Sói Xám", "Đánh bại Kẻ Gây Rối": each won battle counts 1
  | { kind: 'damage'; mob: string; amount: number } // "Gây 500 sát thương lên Thủ Lĩnh Sơn Tặc": damage to a boss of s2c/1177, won or lost
  | { kind: 'level'; level: number }                // "Đạt cấp độ 8"
  | { kind: 'stat' }                                // "Nâng điểm tiềm năng"
  | { kind: 'skill' }                               // "Sử dụng điểm kỹ năng": a level of a skill (c2s/1191)
  | { kind: 'talk'; npcId: number }                 // "Nói chuyện với X", "Báo cáo với X": any other step that names an NPC
  | { kind: 'unknown' };

export function stepAction(step: Pick<QuestStep, 'text' | 'npcId'>): StepAction {
  let m: RegExpExecArray | null;
  if ((m = /^(?:Tiêu diệt|Đánh bại) (?:\d+ )?(.+)$/.exec(step.text))) return { kind: 'kill', mob: m[1] };
  if ((m = /^Gây (\d+) sát thương lên (.+)$/.exec(step.text))) return { kind: 'damage', mob: m[2], amount: Number(m[1]) };
  if ((m = /^Đạt cấp độ (\d+)$/.exec(step.text))) return { kind: 'level', level: Number(m[1]) };
  if (/^Nâng điểm tiềm năng/.test(step.text)) return { kind: 'stat' };
  if (/^Sử dụng điểm kỹ năng/.test(step.text)) return { kind: 'skill' };
  return step.npcId >= 0 ? { kind: 'talk', npcId: step.npcId } : { kind: 'unknown' };
}

/** --stats: "auto", or stat keys of POTENTIALS with an optional weight, "than" or "cuong:3,than:1"; the weights come out
 * by c2s/10 index. */
export function statPlan(spec: string): number[] | 'auto' {
  if (spec === 'auto') return 'auto';
  const weights = POTENTIALS.map(() => 0);
  for (const part of spec.split(',')) {
    const [key, weight = '1'] = part.split(':'), i = POTENTIALS.findIndex(p => p.key === key.trim()), n = Number(weight);
    if (i < 0 || !Number.isInteger(n) || n < 1) throw new Error(`--stats: "${part}" is not auto or one of ${POTENTIALS.map(p => p.key).join(', ')} with an optional :weight`);
    weights[i] += n;
  }
  return weights;
}
export interface QuestBotOptions {
  maxFights: number; minHpRatio?: number; log: (event: Record<string, unknown>) => void;
  /** Mob name to fight while a "Đạt cấp độ N" step waits for the level; default: the strongest kind not above own level. */
  grind?: string;
  /** Own skill to cast in battle, see BattleIo.skill. With the skill table it limits `skills` to this one. */
  skill?: { id: number; cost: number };
  /** Skills bestAction may cast (battle-actions.ts): every learnt skill ('auto', the default), none ('none', swaps only),
   * or these ids. */
  skills?: 'auto' | 'none' | number[];
  /** What one potion of the bag costs in HP for bestAction (BattleIo.potionCost); default Infinity: none is used. */
  potionCost?: number;
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
  /** Spends the potential points (c2s/10) by these weights per c2s/10 index (Cường Lực, Nội Lực, Thân Pháp, Thể Lực), or
   * by 'auto': the main stat of the element (MAIN_STAT). See statPlan and allot(). The "Nâng điểm tiềm năng" step takes
   * its point the same way. Without it that step raises Cường Lực and the other points are left alone. */
  stats?: number[] | 'auto';
  /** Item names for the bag log (s2c/1187); quest-run loads data/items.json. Without it items show as #id. */
  items?: Items;
  /** Picks up the own drops of a won battle with c2s/1188 (pick()); default true. */
  pickup?: boolean;
  /** Keeps each battle as a file in `dir` (battle-record.ts); `tags` go into the header of every file (quest-run: the
   * commit and the --goal). */
  record?: { dir: string; tags?: Record<string, unknown> };
}

/** Plays the steps of the current main quest that stepAction knows; stops on any other step, after maxLosses losses, or after maxFights. */
export class QuestBot implements WorldSession {
  api?: SessionApi; quest?: Quest; mapId = ''; zone = 0; mobs: Mob[] = []; places: Place[] = []; battle?: BattleRunner; target?: Mob;
  /** What the battles of this session taught about each side (BattleIo.memory). */
  battleMemory = new Map<string, [number, number]>();
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
  /** Tấn công (combat[0] of s2c/9) and the bag (s2c/42 at login, s2c/1187 after a change, s2c/83 for one slot). */
  attack?: number; bag: { slot: number; itemId: number; quantity: number }[] = [];
  /** Tấn công, phòng thủ, chính xác, né tránh, chí mạng (combat of s2c/9, then extra[1..5] of s2c/10 kind 4), and the 8
   * gear slots of s2c/9 with the durability of the last s2c/36: for the header of the battle files. */
  combat: number[] = []; gear: ReturnType<typeof characterGear> = [];
  private recorder?: BattleRecorder;
  /** Other players of the zone (s2c/1263, 1167, 1170, 1253). */
  readonly nearby = new ZonePlayers();
  /** A talk or stat-point step is answered by s2c/34 alone. */
  awaitingReply = false;
  /** Duels taken for the current talk step (Đồng ý in its s2c/57); a step still there after 3 stops the bot. */
  duels = 0;
  /** The skill tree of s2c/30, the level of each skill (s2c/9 tail, then s2c/10 kind 32) and the skill points left (s2c/9,
   * then s2c/1191). upgrading is the skill of the c2s/1191 waiting for its answer. */
  skills: Skill[] = []; skillLevels = new Map<number, number>(); skillPoints?: number; upgrading?: { id: number; name: string };
  /** Element (field01 of s2c/9) and potential stats in s2c/9 order (POTENTIALS slot). allotted counts the points --stats
   * gave each stat in this run, spent those since the last summary; allotting is set while a c2s/10 waits for s2c/10. */
  element?: number; potentials: number[] = []; allotted = POTENTIALS.map(() => 0); spent = 0; allotting = false;
  private planWarned = false;
  /** With `once`: the quest id and step index played, and the step's text. */
  playing?: { id: number; at: number; text: string };
  /** After surrender(): 8 s for the server to end the battle; and s2c/11 of the map asked with c2s/40 still to answer
   * with c2s/43, as the game does. */
  private leaving?: ReturnType<typeof setTimeout>;
  private reloadMap = false;
  /** --surrender-after tries once in a run, even when the server ignores it. */
  private surrenderTried = false;
  /** Items fallen in the map in the last 2 s (s2c/1182); lootUntil keeps picking those that come just after a won battle;
   * toPick waits for its turn, picking holds what c2s/1188 asked for (and when) until s2c/1183 takes it off the ground. */
  private drops: { uuid: string; name: string; at: number }[] = [];
  private lootUntil = 0; private toPick: { uuid: string; name: string }[] = []; private pickTimer?: ReturnType<typeof setTimeout>;
  private picking = new Map<string, { name: string; at: number }>(); private pickedAt = 0;
  /** Items picked up in this run. */
  picked = 0;
  private wait?: ReturnType<typeof setTimeout>;
  options: QuestBotOptions;
  constructor(options: QuestBotOptions) {
    this.options = options; this.atlas = loadAtlas(options.atlas); this.saved = atlasJson(this.atlas);
    if (options.record) this.recorder = new BattleRecorder(options.record.dir, r => this.log('error' in r ? 'battle_record_error' : 'battle_recorded', r));
  }
  private log(event: string, fields: Record<string, unknown> = {}) { this.options.log({ kind: 'quest', event, at: Date.now(), ...fields }); }

  onReady(api: SessionApi) {
    this.api = api;
    const q = this.quest, step = q?.steps[q.current];
    this.playing = this.options.once && q && step ? { id: q.id, at: q.current, text: step.text } : undefined;
    this.log('ready', { mapId: this.mapId, hp: `${this.hp}/${this.maxHp}`, mobs: this.mobs.length, quest: this.quest && this.describe(), once: this.playing?.text });
    this.next();
  }

  onPacket(opcode: number, payload: Buffer) {
    // s2c/22 opens the battle file in onSetup, and goes in after its header.
    if (opcode !== 22) this.recorder?.packet('s2c', opcode, payload);
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
        const c = characterPrefix(payload); this.hp = c.hp; this.maxHp = c.maxHp; this.level = c.level; this.element = c.field01;
        const p = characterProfile(payload); this.statPoints = p.statPoints; this.skillPoints = p.skillPoints; this.potentials = p.stats; this.attack = p.combat[0]; this.combat = p.combat;
        this.log('character', { level: p.level, hp: `${p.hp}/${p.maxHp}`, exp: p.exp, levelExp: p.levelExp, coin: p.coin, combat: p.combat, statPoints: p.statPoints, skillPoints: p.skillPoints });
        this.skillLevels = new Map(characterSkills(payload).map(k => [k.id, k.level]));
        try {
          const items = this.options.items, max = (id: number) => items?.get(id)?.durability;
          this.gear = characterGear(payload);
          const gear = this.gear.flatMap(g => g ? [`${g.slot}: ${items?.describe(g) ?? `#${g.itemId}`}, hệ ${ITEM_ELEMENTS[g.element] ?? g.element}, độ bền ${g.durability}${max(g.itemId) ? `/${max(g.itemId)}` : ''}`] : []);
          this.log('gear', { gear });
          // Timed effects at the end of s2c/9, such as the x2 EXP star of item 7 (12-skills-items.md#x2-exp).
          const { effects, faction } = characterTail(payload), left = (ms: number) => `${Math.floor(ms / 3_600_000)}h${String(Math.floor(ms / 60_000) % 60).padStart(2, '0')}`;
          if (effects.length || faction) this.log('effects', { effects: effects.map(e => `${e.key} x${e.rate / 100_000}, còn ${left(e.remainingMs)}`), faction });
        } catch (error) { this.log('parse_error', { opcode, part: 'gear', reason: (error as Error).message }); }
        break;
      }
      case 1263: case 1167: case 1170: case 1253:
        if (this.nearby.on(opcode, payload) && opcode === 1263) this.log('players', { count: this.nearby.players.size, players: this.nearby.list().map(p => `${p.name} ${p.level}`) });
        break;
      case 29: this.mapId = characterLocation(payload).mapId; break;
      case 30:
        this.skills = skillTable(payload).skills;
        this.log('skill_table', { skills: this.skills.map(k => `${k.id} ${k.name} ${this.skillLevels.get(k.id) ?? 0}/${k.levels.length}`) });
        break;
      // Answer to c2s/1191 after s2c/10 kind 32 (E1). The quest step moves on with s2c/34 or s2c/39 as for a stat point;
      // without either the bot stops below rather than spend another point.
      case 1191: {
        const r = new Reader(payload), statPoints = r.i32(), skillPoints = r.i32();
        this.statPoints = statPoints; this.skillPoints = skillPoints;
        this.log('skill_points', { statPoints, skillPoints, upgraded: this.upgrading && `${this.upgrading.id} ${this.upgrading.name} ${this.skillLevels.get(this.upgrading.id) ?? 0}` });
        if (this.upgrading && this.awaitingReply) {
          const skillId = this.upgrading.id;
          clearTimeout(this.wait);
          this.wait = setTimeout(() => this.stop('skill point used but the server did not advance the step', { skillId }), 8000);
        }
        break;
      }
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
      // A pickup is answered by "Bạn vừa nhận được 474 Xu khóa" or "Không thể nhặt vật phẩm của người khác" (13-drops-items),
      // which may come after the next step went for a portal (--rest-ms under 1 s): it is not that portal's refusal.
      case 1256: {
        const text = notice(payload).text;
        if (Date.now() - this.pickedAt < 2000 && (!this.travelling || /nhặt|nhận được/i.test(text))) { this.log('pickup_notice', { text }); break; }
        if (!this.travelling) break;
        recordRefusal(this.atlas, this.travelling, text); this.remember(); this.refused.add(this.travelling.id);
        this.log('portal_refused', { portal: this.travelling.id, name: this.travelling.name, text });
        this.travelling = undefined; this.later(1000);
        break;
      }
      // An item fell in the map. Own drops come in the same ms as the end of a won battle (13-drops-items.md#tỉ-lệ-rơi).
      case 1182: {
        const r = new Reader(payload); r.string();
        const g = groundItem(r), now = Date.now(), drop = { uuid: g.uuid, name: this.options.items?.describe(g) ?? `#${g.itemId} ×${g.quantity}`, at: now };
        this.drops = [...this.drops.filter(d => now - d.at < 2000), drop];
        if (now < this.lootUntil) this.pick(drop);
        break;
      }
      // An item left the ground: picked up by someone, or expired. Ours goes 25–56 ms after c2s/1188; a stranger's item the
      // server refused us may go later, when its owner picks it up.
      case 1183: {
        const r = new Reader(payload); r.string();
        const uuid = r.string(), asked = this.picking.get(uuid);
        if (!asked) break;
        this.picking.delete(uuid);
        if (Date.now() - asked.at < 1000) { this.picked++; this.log('picked', { item: asked.name, picked: this.picked }); }
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
        this.quest = questData(payload); this.awaitingReply = false; this.upgrading = undefined; this.duels = 0;
        this.log('quest', this.describe());
        if (this.api && !this.battle && before !== `${this.quest.id}/${this.quest.current}`) this.later(1500);
        break;
      }
      case 34: {
        const p = questProgress(payload);
        this.log('quest_progress', { questId: p.questId, text: p.text.slice(0, 120) });
        // A talk step is answered by s2c/34 alone (no new s2c/39), so the step is advanced here (L1 capture).
        if (this.awaitingReply && this.quest?.id === p.questId) { this.awaitingReply = false; this.upgrading = undefined; this.advance('server answered'); }
        if (this.api && !this.battle) this.later(1500);
        break;
      }
      case 57: this.dialog(payload); break;
      // The server's count for the current step, right after each battle that counts (kills, or total boss damage).
      case 1201: { const progress = new Reader(payload).i32(); if (this.quest) this.quest.progress = progress; this.log('step_progress', { progress }); break; }
      case 35: { const c = questComplete(payload); this.log('quest_complete', { questId: c.questId, title: c.title, rewards: c.rewards }); break; }
      case 10: {
        const s = characterStats(new Reader(payload));
        if (s.level !== undefined && s.level !== this.level) { this.level = s.level; this.log('level', { level: s.level, stats: s.stats }); }
        if (s.hp !== undefined) { this.hp = s.hp; this.maxHp = s.maxHp; this.log('stats', { hp: `${this.hp}/${this.maxHp}`, exp: s.exp, levelExp: s.levelExp, coin: s.coin }); }
        // extra[1..5] of kind 4 are the combat stats of s2c/9 (user-data.md): Tấn công follows the gear worn.
        if (s.extra) { this.attack = s.extra[1]; this.combat = s.extra.slice(1, 6); }
        if (s.stats) this.potentials = s.stats;
        // Kind 8 comes last of the three that answer c2s/10 (P1): the next point of --stats.
        if (s.statPoints !== undefined) { this.statPoints = s.statPoints; if (this.allotting) { this.allotting = false; this.later(250); } }
        if (s.skills) { for (const k of s.skills) this.skillLevels.set(k.id, k.level); this.log('skills', { levels: s.skills.filter(k => k.level > 0).map(k => `${k.id} ${k.level}`) }); }
        break;
      }
      case 36:
        // Gear durability, sent after every battle end and after c2s/40; inside a battle it means the server ended it.
        this.log('durability', { payloadHex: payload.toString('hex') });
        try { for (const d of gearDurability(payload).slots) { const g = d && this.gear[d.slot]; if (g) g.durability = d.durability; } } catch { /* logged as hex above */ }
        if (this.battle?.surrendered) this.left(36);
        else if (this.battle) { this.log('battle_cancelled'); this.recorder?.end({ cancelled: true }); this.battle = undefined; this.later(2000); }
        break;
      // Empty, at the end of a battle and after c2s/40 (05-battle).
      case 1214: if (this.battle?.surrendered) this.left(1214); break;
      // Xu, Xu khóa, Lượng after a change: login, a quest reward, a pickup (P3).
      case 46: {
        let money: ReturnType<typeof currencies> | undefined;
        try { money = currencies(payload); } catch { this.log('currency', { payloadHex: payload.toString('hex') }); break; }
        this.log('currency', { xu: money.xu, xuKhoa: money.xuKhoa, luong: money.luong });
        break;
      }
      case 1187: {
        // The whole bag after it changed: a quest reward, a repair, an item picked up.
        let bag: ReturnType<typeof inventory> | undefined;
        try { bag = inventory(payload); } catch { this.log('inventory', { payloadHex: payload.toString('hex') }); break; }
        this.bag = bag.items.map(i => ({ slot: i.slot, itemId: i.itemId, quantity: i.quantity }));
        this.log('inventory', { capacity: bag.capacity, items: bag.items.map(i => this.options.items?.describe(i) ?? `#${i.itemId} ×${i.quantity}`) });
        break;
      }
      case 42: try { this.bag = characterExtra(payload).items.map(i => ({ slot: i.slot, itemId: i.itemId, quantity: i.quantity })); } catch { /* the bag log of s2c/1187 covers it */ } break;
      // One bag slot after an item was used or thrown away: i32 slot; i32 quantity left (12-skills-items.md#c2s-44).
      case 83: {
        const r = new Reader(payload), slot = r.i32(), quantity = r.i32(), item = this.bag.find(i => i.slot === slot);
        if (item) item.quantity = quantity;
        this.bag = this.bag.filter(i => i.quantity > 0);
        break;
      }
      case 22: this.onSetup(payload); break;
      case 0: case 5: this.log('server_text', { opcode, text: payload.toString('utf8').replace(/[\x00-\x1f]/g, ' ').trim().slice(0, 160) }); break;
    }
  }

  private describe() {
    const q = this.quest!, step = q.steps[q.current];
    return { id: q.id, title: q.title, current: q.current, progress: q.progress, step: step && `${step.text} (${step.required})`, steps: q.steps.map(s => s.text) };
  }
  private send(opcode: number, payload: Uint8Array) { this.api?.send(opcode, payload); this.recorder?.packet('c2s', opcode, payload); }
  /** Writes the atlas file when something changed. */
  private remember() {
    const json = atlasJson(this.atlas);
    if (this.options.atlas && json !== this.saved) { saveAtlas(this.options.atlas, this.atlas); this.saved = json; }
  }
  private advance(reason: string) {
    const q = this.quest!; q.current++; q.progress = 0; this.hops = 0; this.duels = 0;
    this.log('step_advanced', { reason, current: q.current, step: q.steps[q.current]?.text ?? null });
  }
  private later(ms: number) { clearTimeout(this.wait); this.wait = setTimeout(() => this.next(), ms); }
  /** Sends a talk or stat-point request; s2c/34 or s2c/39 must answer within 8 s. */
  private ask(opcode: number, payload: Uint8Array, silence: string, fields: Record<string, unknown> = {}) {
    this.awaitingReply = true;
    this.send(opcode, payload);
    this.wait = setTimeout(() => this.stop(silence, fields), 8000);
  }
  /** s2c/57 to a talk step's c2s/13: the NPC asks instead of answering with s2c/34. "Tỷ thí với Võ Quan Đinh Mộc" asks
   * "Cậu đã sẵn sàng chiến đấu chưa." with 0 Đồng ý and 1 Từ chối (N1); Đồng ý (c2s/57) opens a battle with the NPC, played
   * as the step's own, and the s2c/34 after a won one moves the step on. A dialog without Đồng ý stops the bot. */
  private dialog(payload: Buffer) {
    const menu = npcMenu(payload), q = this.quest, step = q?.steps[q.current];
    this.log('npc_menu', { npc: menu.npc, text: menu.text, options: menu.options.map(o => `${o.option} ${o.label}`) });
    if (!this.awaitingReply || !step || step.npcId < 0) return;
    const yes = menu.options.find(o => o.label === 'Đồng ý');
    if (!yes) return this.stop('npc asked something the bot cannot answer', { npc: menu.npc, text: menu.text });
    if (this.duels >= 3) return this.stop('3 duels and the step did not move', { npc: menu.npc, step: step.text });
    // As fight() does before a challenge.
    if (this.fights >= this.options.maxFights) return this.stop('fight limit reached');
    if (this.maxHp && this.hp < this.maxHp * (this.options.minHpRatio ?? 0)) return this.stop('hp too low to fight', { hp: this.hp });
    clearTimeout(this.wait);
    this.duels++; this.fights++; this.challenged = Date.now();
    // No mob was challenged: onSetup finds the NPC's id in the battle by its name (duelMobId).
    this.target = { id: `npc${step.npcId}`, name: menu.npc, level: 0, a: 0, b: 0, c: 0, d: 0 };
    this.log('duel', { npc: menu.npc, npcId: step.npcId, option: yes.option, fight: this.fights });
    this.send(57, buildRequest(57, { option: yes.option, mapId: this.mapId, npcId: step.npcId }));
    this.wait = setTimeout(() => { if (!this.battle) { this.log('duel_no_answer', { npc: menu.npc }); this.next(); } }, 8000);
  }

  private stop(reason: string, fields: Record<string, unknown> = {}) {
    clearTimeout(this.wait);
    this.recorder?.end({ stopped: reason });
    this.log('stop', { reason, fights: this.fights, wins: this.wins, losses: this.losses, picked: this.picked, hp: `${this.hp}/${this.maxHp}`, quest: this.quest && this.describe(), ...fields });
    setTimeout(() => this.api?.close(), 1000);
  }

  /** Picks up an item on the ground with c2s/1188 (13-drops-items.md#c2s-1188), as the game's Nhặt button does but from
   * anywhere in the map: the server does not check the distance. One every 200 ms. */
  private pick(drop: { uuid: string; name: string }) {
    if (this.picking.has(drop.uuid) || this.toPick.some(d => d.uuid === drop.uuid)) return;
    this.toPick.push(drop);
    if (!this.pickTimer) this.pickNext();
  }
  private pickNext() {
    const drop = this.toPick.shift();
    this.pickTimer = undefined;
    if (!drop) return;
    this.pickedAt = Date.now(); this.picking.set(drop.uuid, { name: drop.name, at: this.pickedAt });
    this.log('pickup', { item: drop.name });
    this.send(1188, buildRequest(1188, { uuid: drop.uuid }));
    this.pickTimer = setTimeout(() => this.pickNext(), 200);
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
    this.recorder?.end({ left: `s2c/${by}` });
    this.battle = undefined;
    this.stop('surrendered');
  }

  /** Decide the next action from the current quest step. */
  next(): void {
    if (!this.api || this.battle || this.allotting) return;
    const q = this.quest, step = q?.steps[q.current];
    if (this.options.farm) { if (!this.allot()) this.farm(this.options.farm); return; }
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
    if (action.kind !== 'stat' && this.allot()) return;
    if (this.elsewhere(action, step.text)) return;
    switch (action.kind) {
      case 'kill': return this.fight(this.mobs.filter(m => m.name === action.mob), step.text);
      // The boss of s2c/1177 ignores c2s/15; the game challenges it with c2s/1178 (B4).
      case 'damage': return this.fight(this.mobs.filter(m => m.name === action.mob), step.text, 1178);
      case 'level':
        if (this.level < action.level) return this.fight(this.grindTargets(), `${step.text} (cấp ${this.level})`);
        this.wait = setTimeout(() => this.stop('level reached but the server did not advance the step', { level: this.level }), 8000);
        return;
      case 'stat': {
        const weights = this.statWeights(), stat = weights ? this.nextStat(weights) : 0;
        if (weights) this.allotted[stat]++;
        this.log('stat_point', { step: step.text, stat: POTENTIALS[stat].name, statPoints: this.statPoints });
        return this.ask(10, buildRequest(10, { stat, amount: 1 }), 'no answer to the stat point');
      }
      case 'skill': return this.upgradeSkill(step.text);
      case 'talk':
        this.log('talk', { step: step.text, mapId: this.mapId, npcId: action.npcId });
        return this.ask(13, buildRequest(13, { mapId: this.mapId, npcId: action.npcId }), 'npc did not answer', { npcId: action.npcId });
      default: return this.stop('step needs an action this bot does not know', { step: step.text });
    }
  }

  /** --stats: one c2s/10 (stat, 1), as the game's "Cộng +1" sends (P1); the s2c/10 kind 8 that answers it calls next()
   * for the next point, so points go out between battles only. Points for the "Nâng điểm tiềm năng" steps still ahead
   * in the quest are kept for them. True when a point was sent. */
  private allot(): boolean {
    const weights = this.statWeights();
    if (!weights) {
      if (this.options.stats && !this.planWarned) { this.planWarned = true; this.log('stat_plan_unknown_element', { element: this.element }); }
      return false;
    }
    const q = this.quest, keep = q ? q.steps.slice(q.current).filter(s => stepAction(s).kind === 'stat').length : 0;
    if ((this.statPoints ?? 0) <= keep) {
      if (this.spent) this.log('stat_points_spent', { spent: this.spent, kept: keep, statPoints: this.statPoints, stats: Object.fromEntries(POTENTIALS.map(p => [p.name, this.potentials[p.slot]])) });
      this.spent = 0;
      return false;
    }
    const stat = this.nextStat(weights);
    this.allotted[stat]++; this.spent++; this.allotting = true;
    this.log('stat_allot', { stat: POTENTIALS[stat].name, statPoints: this.statPoints });
    this.send(10, buildRequest(10, { stat, amount: 1 }));
    this.wait = setTimeout(() => this.stop('no answer to the stat point', { stat: POTENTIALS[stat].name }), 8000);
    return true;
  }
  /** The --stats weights, 'auto' read from the element; undefined without a plan or for an element of no known main stat. */
  private statWeights() {
    const plan = this.options.stats, main = this.element === undefined ? undefined : MAIN_STAT[this.element];
    if (plan !== 'auto') return plan?.some(w => w > 0) ? plan : undefined;
    return main === undefined ? undefined : POTENTIALS.map((_, i) => i === main ? 1 : 0);
  }
  /** The stat furthest behind its weight among the points given in this run; on a tie the lower c2s/10 index. */
  private nextStat(weights: number[]) {
    let best = -1;
    weights.forEach((w, i) => { if (w > 0 && (best < 0 || (this.allotted[i] + 1) / w < (this.allotted[best] + 1) / weights[best])) best = i; });
    return best;
  }

  /** "Sử dụng điểm kỹ năng": c2s/1191 (skill id, 1) for the first skill of the s2c/30 tree that can take a level now. For a
   * new character that is the root skill: Hỏa Cầu Thuật 1000, or 4000 for the element of the second account. */
  private upgradeSkill(text: string) {
    const skill = this.upgradable()[0];
    if (!skill) return this.stop('no skill can take a level now', { step: text, level: this.level, skillPoints: this.skillPoints, skills: this.skills.length });
    const level = this.skillLevels.get(skill.id) ?? 0;
    this.upgrading = { id: skill.id, name: skill.name };
    this.log('skill_upgrade', { step: text, skillId: skill.id, name: skill.name, level: `${level} → ${level + 1}`, cost: skill.levels[level].cost, skillPoints: this.skillPoints });
    return this.ask(1191, buildRequest(1191, { skillId: skill.id, amount: 1 }), 'no answer to the skill upgrade', { skillId: skill.id });
  }

  /** Skills of s2c/30 whose next level the character can take now (prerequisite learned, character level and skill points
   * enough), in the order of the tree, the root first. */
  upgradable() {
    return skillTree(this.skills, this.skillLevels, { level: this.level, skillPoints: this.skillPoints ?? 0 }).filter(k => !k.blockers.length).map(k => k.skill);
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
    const duel = this.target?.id.startsWith('npc') ? this.target : undefined;
    const s = battleSetup(payload), mobId = this.mobs.find(m => payload.includes(new Writer().string(m.id).build()))?.id
      ?? (duel && (duelMobId(payload, duel.name) ?? duel.id)) ?? this.target?.id ?? '?';
    const mob = mobBlock(payload, mobId);
    this.battleStart = Date.now(); this.hp = s.hp; this.maxHp = s.maxHp;
    this.log('battle_setup', { uuid: s.uuid, mobId, hp: `${s.hp}/${s.maxHp}`, mob: mob && `${mob.name} ${mob.hp}/${mob.maxHp}`, msAfterChallenge: this.battleStart - this.challenged });
    const skills = this.battleSkills(), potions = this.bag.filter(i => POTIONS[i.itemId] && i.quantity > 0);
    if (skills) this.log('battle_skills', { skills: skills.map(k => `${k.id} ${k.name} ${k.level}: ${k.kind}, ${k.cost} nội lực`), potions: potions.map(p => `${POTIONS[p.itemId].name} ×${p.quantity}`), potionCost: this.options.potionCost });
    if (this.recorder) { this.recorder.start(`${s.me} ${mob?.name ?? mobId}`, this.recordHeader(s, mobId, mob, skills, potions)); this.recorder.packet('s2c', 22, payload); }
    // The bot's notes go to the battle file too, except the move lines that its packets hold.
    const log = (event: string, fields?: Record<string, unknown>) => { this.log(event, fields); if (event !== 'move' && event !== 'choice') this.recorder?.note(event, fields); };
    this.battle = new BattleRunner(s, mobId, { send: (op, p) => this.send(op, p), log, note: (event, fields) => this.recorder?.note(event, fields), onEnd: end => this.onBattleEnd(end), skill: this.options.skill, strategy: this.options.strategy, timedMoveMs: this.options.timedMoveMs,
      mob, memory: this.battleMemory, skills, potions, potionCost: this.options.potionCost, stats: this.attack === undefined ? undefined : { attack: this.attack, level: this.level } });
    this.battle.start();
  }

  /** The first line of a battle file (battle-record.ts): both sides and the bot's settings as the battle opens. Elements
   * as codes and names (1 Hỏa, 2 Lôi, 4 Thủy): the character's from s2c/9, the mob's from its block of s2c/22. */
  private recordHeader(s: ReturnType<typeof battleSetup>, mobId: string, mob: ReturnType<typeof mobBlock>, skills: ReturnType<QuestBot['battleSkills']>,
    potions: QuestBot['bag']) {
    const element = (code?: number) => code === undefined ? undefined : ITEM_ELEMENTS[code];
    return {
      ...this.options.record?.tags,
      character: s.me, level: this.level, element: this.element, elementName: element(this.element), hp: s.hp, maxHp: s.maxHp,
      combat: this.combat, potentials: this.potentials, skills: [...this.skillLevels].filter(([, level]) => level > 0),
      gear: this.gear.flatMap(g => g ? [{ slot: g.slot, itemId: g.itemId, element: g.element, durability: g.durability, stats: g.stats }] : []),
      potions: potions.map(p => ({ slot: p.slot, itemId: p.itemId, quantity: p.quantity })),
      mob: { id: mobId, name: mob?.name, level: mob?.level ?? this.mobs.find(m => m.id === mobId)?.level, element: mob?.element, elementName: element(mob?.element),
        hp: mob?.hp, maxHp: mob?.maxHp, boss: this.bosses.has(mobId) },
      map: this.mapId, zone: this.zone,
      play: { strategy: this.options.strategy, skills: skills?.map(k => k.id) ?? null, skill: this.options.skill, potionCost: this.options.potionCost },
      memory: Object.fromEntries(this.battleMemory),
    };
  }

  /** The skills of options.skills among the learnt ones of the s2c/30 table; undefined without the table (BattleIo.skill
   * then plays as before). */
  private battleSkills() {
    const want = this.options.skills ?? 'auto';
    if (!this.skills.length || want === 'none') return want === 'none' ? [] : undefined;
    const learnt = learntSkills(this.skills, this.skillLevels), only = this.options.skill ? [this.options.skill.id] : want === 'auto' ? undefined : want;
    return only ? learnt.filter(k => only.includes(k.id)) : learnt;
  }

  private onBattleEnd(end: BattleEnd) {
    if (end.won) this.wins++; else this.losses++;
    this.hp = end.hp;
    this.log('battle_end', { ...end, ms: Date.now() - this.battleStart, skillsCast: this.battle?.skillsCast });
    this.recorder?.end({ ...end, ms: Date.now() - this.battleStart, skillsCast: this.battle?.skillsCast });
    this.battle = undefined;
    // Own drops land with the battle end: within 0–58 ms before it in every capture (13-drops-items.md#tỉ-lệ-rơi). A
    // stranger's item in these 600 ms (about 5% of battles, at 4.6 items a minute) is refused for its first 16 s.
    if (end.won && this.options.pickup !== false) {
      const now = Date.now(); this.lootUntil = now + 300; this.picking.clear();
      for (const d of this.drops) if (now - d.at <= 300) this.pick(d);
    }
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
