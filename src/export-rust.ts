// Writes what the Rust app (app/, docs/integration/rust/README.md) takes from the TypeScript side: the opcode table of
// config.ts as app/core/src/opcodes.rs, and app/core/tests/vectors.json with the captured protocol vectors, what the TS
// decoders read from captured packets, the request builders' bytes, the captured battles replayed by battle.ts, and the
// moves bestMove picks. test/rust-export.test.ts fails until this is rerun after a TS change (npm run export:rust).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { BASELINE, OPCODE_ENTRIES } from './config.ts';
import { Reader, Writer, characterPrefix, characterProfile, characterLocation, mapPrefix } from './protocol.ts';
import { buildRequest } from './events.ts';
import { mapData, mapGrid, mapChange, mapEntities, mapBoss, notice, characterStats, playersSnapshot, playerRecord, ZonePlayers, questData, questProgress, questComplete } from './world.ts';
import { N, swap, settle, bestMove, fighter, unknownMob, battleSetup, battleJoinAck, turnState, battleResult, timeoutResult, STRATEGIES, type Fighter } from './battle.ts';
import { type Atlas, emptyAtlas, recordMap, recordMobs, recordPortal, recordRefusal, destination, portalsOf, route } from './atlas.ts';
import { QuestBot, stepAction } from './quest.ts';
import { fixtures } from '../test/fixtures.ts';
import { mapPacket, mobsPacket, noticePacket } from '../test/support/packets.ts';

const pick = (o: any, keys: string[]) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const bytes = (h: string) => Buffer.from(h, 'hex');
const response = (stage: number, opcode: number) => fixtures.scenario.stages[stage].responses.find((r: any) => r.opcode === opcode).hex as string;

/** Bosses and battle setups have no capture with every byte; these are built in the layout of world.ts and battle.ts. */
const bossGone = new Writer().string('M1').u8(1).string('mob86100001').build();
const setupBoard = fixtures.battles[0].board as number[];
const setup = new Writer().u8(1).u8(0).string('manina').string('manina').u8(0).u8(0).u8(0).i32(21).i32(0).u8(0).i32(150).i32(180)
  .string('mob61000').string('Cóc Xanh').i32(13).i32(249).i32(249)
  .string('3f1c2a9e-6b1d-4c55-9a27-0d3e4b5c6d7e').i32(64).bytes(Buffer.alloc(0)).build();
const setupPacket = Buffer.concat([setup.subarray(0, setup.length - 4), Buffer.from(setupBoard), Buffer.from([30, 0])]);

function decoders() {
  const mp = fixtures['map-packets'], bp = fixtures['battle-packets'], f = fixtures.fields.examples;
  const field = (op: number) => f.find((x: { op: number }) => x.op === op).hex as string;
  const cases: { fn: string; hex: string; expected: unknown }[] = [];
  const add = (fn: string, h: string, expected: unknown) => cases.push({ fn, hex: h, expected });
  add('characterPrefix', field(9), pick(characterPrefix(bytes(field(9))), ['name', 'numericId', 'displayName', 'level', 'hp', 'maxHp']));
  const profileKeys = ['name', 'level', 'hp', 'maxHp', 's1', 's1Max', 'stats', 'combat', 'exp', 'coin', 'statPoints', 'skillPoints', 'levelExp', 'x', 'y'];
  const a2 = fixtures.scenario.stages.flatMap((st: any) => st.responses ?? []).find((r: any) => r.opcode === 9).hex as string;
  for (const h of [a2, fixtures.profile['s2c/9 level 21'], fixtures.profile['s2c/9 field01 4']] as string[]) add('characterProfile', h, pick(characterProfile(bytes(h)), profileKeys));
  add('characterLocation', response(9, 29), characterLocation(bytes(response(9, 29))));
  add('mapPrefix', field(11), pick(mapPrefix(bytes(field(11))), ['mapId', 'name', 'area', 'x', 'y']));
  const m2 = mapData(bytes(mp['s2c/11 M2']));
  add('mapData', mp['s2c/11 M2'], { ...pick(m2, ['mapId', 'name', 'area', 'x', 'y']), places: m2.places.map(p => pick(p, ['id', 'name', 'type', 'x', 'y', 'w', 'h'])) });
  add('mapGrid', mp['s2c/11 M2'], pick(mapGrid(bytes(mp['s2c/11 M2'])), ['rows', 'cols', 'tiles', 'collision']));
  add('mapChange', mp['s2c/13 portal'], mapChange(bytes(mp['s2c/13 portal'])));
  const zone = new Writer().string('M1').i32(3).build();
  add('mapChange', hex(zone), mapChange(zone));
  add('mapEntities', response(11, 43), mapEntities(bytes(response(11, 43))));
  add('mapBoss', response(11, 1177), mapBoss(bytes(response(11, 1177))));
  add('mapBoss', hex(bossGone), mapBoss(bossGone));
  add('notice', bp['s2c/1256'], notice(bytes(bp['s2c/1256'])).text);
  add('characterStats', bp['s2c/10 kind 4'], characterStats(new Reader(bytes(bp['s2c/10 kind 4']))));
  const w = fixtures.world;
  add('playersSnapshot', w['s2c/1263'].hex, playersSnapshot(bytes(w['s2c/1263'].hex)).players.map(p => pick(p, ['id', 'name', 'level', 'x', 'y'])));
  add('playerRecord', w['s2c/1167'].hex, pick(playerRecord(new Reader(bytes(w['s2c/1167'].hex))), ['id', 'name', 'level', 'x', 'y']));
  add('battleSetup', hex(setupPacket), pick(battleSetup(setupPacket), ['me', 'level', 'hp', 'maxHp', 'uuid', 'board', 'turnSeconds']));
  for (const k of ['s2c/18', 's2c/18 player first']) add('battleJoinAck', bp[k], battleJoinAck(new Reader(bytes(bp[k]))));
  for (const k of ['s2c/24 own turn', 's2c/24 mob turn']) add('turnState', bp[k], turnState(new Reader(bytes(bp[k]))));
  for (const k of ['s2c/19 extra turn', 's2c/19 reshuffled']) add('battleResult19', bp[k], battleResult(new Reader(bytes(bp[k])), 19));
  for (const k of ['s2c/20', 's2c/20 skill 1000', 's2c/20 skill on a special']) add('battleResult20', bp[k], battleResult(new Reader(bytes(bp[k])), 20));
  add('timeoutResult', bp['s2c/21'], timeoutResult(new Reader(bytes(bp['s2c/21']))));
  const q = fixtures.quest;
  for (const k of ['s2c/39 quest3', 's2c/39 quest4']) add('questData', q[k], questData(bytes(q[k])));
  add('questProgress', q['s2c/34 dialogue'], questProgress(bytes(q['s2c/34 dialogue'])));
  add('questComplete', q['s2c/35'], questComplete(bytes(q['s2c/35'])));
  return cases;
}

/** stepAction on the step texts of quests 3–9, and ones the bot does not know. */
function stepActions() {
  const steps: [string, number][] = [['Tiêu diệt Heo Mọi', -1], ['Tiêu diệt 1 Sói Xám', -1], ['Đánh bại Kẻ Gây Rối', -1], ['Gây 500 sát thương lên Thủ Lĩnh Sơn Tặc', -1],
    ['Đạt cấp độ 8', -1], ['Nâng điểm tiềm năng', -1], ['Báo cáo với Bà Tư Hạnh', 103], ['Bàn bạc với Thành Chủ Nguyễn Khang', 129], ['Gặp Trại Chủ Phạm Hùng', 127],
    ['Sử dụng điểm kỹ năng', -1], ['Thu thập 5 Da Heo', -1]];
  return steps.map(([text, npcId]) => ({ text, npcId, action: stepAction({ text, npcId }) }));
}

/** Three maps of the live scan S1 (M1 ↔ M2 ↔ M25) with every kind of portal answer; `seen` (the day) is left out. */
const WORLD: [string, string, [number, string, number][], [string, string, number][]][] = [
  ['M1', 'Làng Thanh Khê', [[0, 'Bản đồ', 0], [1010, 'Cổ Phong', 0], [1013, 'Lạc Cốc', 0], [1015, 'Vân Sơn', 0], [129, 'Thành Chủ Nguyễn Khang', 2], [103, 'Bà Tư Hạnh', 2]], [['mob18', 'Gà Điên', 1], ['mob2806', 'Heo Mọi', 7]]],
  ['M2', 'Trại Vân Sơn', [[1, 'Bản đồ', 0], [1013, 'Lạc Cốc', 0], [1014, 'Làng Thanh Khê', 0], [1024, 'Rìa Hồng Giang', 0], [127, 'Trại Chủ Phạm Hùng', 2], [141, 'Võ Quan Đinh Mộc', 2]], [['mob80', 'Kẻ Quấy Phá', 20], ['mob61000', 'Cóc Xanh', 13]]],
  ['M25', 'Rìa Hồng Giang', [[1016, 'Hồng Giang', 0], [1015, 'Vân Sơn', 0], [162, 'Tướng Quân Lê Viễn', 2]], []],
];
function scanAtlas(): Atlas {
  const atlas = emptyAtlas();
  for (const [mapId, name, places, mobs] of WORLD) {
    recordMap(atlas, mapData(mapPacket(mapId, name, places)));
    recordMobs(atlas, mapId, 0, mapEntities(mobsPacket(mapId, mobs)).mobs);
    delete (atlas.maps[mapId] as Partial<Atlas['maps'][string]>).seen;
  }
  for (const [id, name, mapId] of [[1014, 'Làng Thanh Khê', 'M1'], [1015, 'Vân Sơn', 'M2'], [1024, 'Rìa Hồng Giang', 'M25']] as const) recordPortal(atlas, id, { name, mapId });
  recordRefusal(atlas, { id: 1013, name: 'Lạc Cốc' }, 'Bạn phải đạt cấp 40 mới vào được Lạc Cốc');
  recordRefusal(atlas, { id: 1010, name: 'Cổ Phong' }, 'Bạn phải đạt cấp 130 mới vào được Cổ Phong');
  recordRefusal(atlas, { id: 1016, name: 'Hồng Giang' }, 'Bạn cần hoàn thành nhiệm vụ trước khi tới đây');
  return atlas;
}

type Wanted = { npc: number } | { mob: string } | { map: string };
const wants = (w: Wanted) => (m: Atlas['maps'][string]) => 'npc' in w ? m.places.some(p => p.type === 2 && p.id === w.npc)
  : 'mob' in w ? m.mobs.some(k => k.name === w.mob) || m.bosses.some(b => b.name === w.mob) : m.mapId === w.map;

/** route, destination and portalsOf of atlas.ts on scanAtlas(). */
function atlasCases() {
  const atlas = scanAtlas();
  const routes: [string, Wanted, number, number[]][] = [['M1', { npc: 162 }, 21, []], ['M1', { mob: 'Kẻ Quấy Phá' }, 21, []], ['M2', { npc: 129 }, 21, []], ['M2', { npc: 162 }, 21, []],
    ['M25', { npc: 129 }, 21, []], ['M1', { map: 'M2' }, 21, [1015]], ['M1', { npc: 162 }, 21, [1024]], ['M2', { mob: 'Sói Xám' }, 21, []], ['M2', { npc: 141 }, 21, []]];
  const destinations: [number, string, string][] = [[1015, 'Vân Sơn', 'M1'], [1016, 'Hồng Giang', 'M25'], [1014, 'Làng Thanh Khê', 'M2'], [9999, 'Trại Vân Sơn', 'M1'], [9998, 'Hồng Giang', 'M1']];
  return {
    atlas,
    routes: routes.map(([from, wanted, level, skip]) => ({ from, wanted, level, skip, portal: route(atlas, from, wants(wanted), level, new Set(skip))?.id ?? null })),
    destinations: destinations.map(([id, name, from]) => ({ id, name, from, mapId: destination(atlas, { id, name }, from) ?? null })),
    portalsOf: [['M1', 21], ['M1', 50], ['M1', 200], ['M2', 21]].map(([mapId, level]) => ({ mapId, level, portals: portalsOf(atlas, mapId as string, level as number).map(p => p.id) })),
  };
}

/** Packets fed to QuestBot as the quest steps of 10-quests.md play out, with what it sent after each one. `start` is
 * onReady (the app's "Tự làm nhiệm vụ"); `next` is the decision a pending timer makes. Battles are left out (their
 * counting has its own tests); timers are cleared after every step. */
function questReplays() {
  type Ev = { packet: [number, string] } | { start: true } | { next: true };
  const p = (opcode: number, b: Uint8Array): Ev => ({ packet: [opcode, hex(b)] });
  const at = (mapId: string) => p(29, new Writer().string('manina').string(mapId).i32(0).build());
  const quest = (id: number, title: string, current: number, progress: number, steps: [string, number, number, number][]) => {
    const w = new Writer().i32(id).string(title).string('').string('main').i32(current).i32(progress).i32(steps.length);
    steps.forEach(([text, param, required, npcId], i) => w.i32(i).string(text).i32(param).i32(required).i32(npcId));
    return p(39, w.build());
  };
  const boss = (field: 0 | 1) => p(1177, field === 1 ? new Writer().string('M1').u8(1).string('mob86100001').build()
    : new Writer().string('M1').u8(0).string('mob86100001').string('Thủ Lĩnh Sơn Tặc').i32(11).u8(0).i32(9).i32(1).u8(1).u8(1).i32(85).i32(5).build());
  const quest7 = quest(7, 'Quét Sạch Sơn Trại', 1, 0, [['Đánh bại Chỉ Huy Sơn Tặc', 87, 1, -1], ['Gây 500 sát thương lên Thủ Lĩnh Sơn Tặc', 0, 500, -1]]);
  const quest9 = (current: number, progress: number) => quest(9, 'Thử Sức Tân Binh', current, progress,
    [['Đạt cấp độ 11', 11, 1, -1], ['Nói chuyện với Võ Quan Đinh Mộc', 141, 1, 141], ['Tiêu diệt Sói Xám', 4, 15, -1], ['Tiêu diệt Cóc Xanh', 5, 15, -1], ['Báo cáo với Võ Quan Đinh Mộc', 141, 1, 141]]);
  const m2 = WORLD[1], q = fixtures.quest, mp = fixtures['map-packets'];
  const scenarios: [string, Ev[], Atlas?][] = [
    ['damage step: the boss of s2c/1177 with c2s/1178', [at('M1'), p(43, mobsPacket('M1', [['mob872600', 'Chỉ Huy Sơn Tặc', 10]])), boss(0), quest7, { start: true }]],
    ['a boss changing tiles is waited for in its map', [p(11, mapPacket('M1', 'Làng Thanh Khê', [[1015, 'Vân Sơn', 0]])), p(43, mobsPacket('M1', [])), boss(0), boss(1), quest7, { start: true }, boss(0), { next: true }]],
    ['talk step, the NPC reply, then the kill step', [at('M1'), p(43, mobsPacket('M1', [['mob10', 'Gà Điên', 7], ['mob2806', 'Heo Mọi', 7]])), p(39, bytes(q['s2c/39 quest4'])), { start: true },
      p(34, bytes(q['s2c/34 dialogue'])), { next: true }]],
    ['an NPC in another map: through the portal the quest names', [at('M1'), p(11, mapPacket('M1', 'Làng Thanh Khê', [[1015, 'Vân Sơn', 0], [129, 'Thành Chủ Nguyễn Khang', 2]])), p(43, mobsPacket('M1', [])),
      quest(8, 'Tìm Đến Vân Sơn', 1, 0, [['Nói chuyện với Thành Chủ Nguyễn Khang', 129, 1, 129], ['Gặp Trại Chủ Phạm Hùng', 127, 1, 127]]), { start: true },
      p(13, bytes(mp['s2c/13 portal'])), p(11, bytes(mp['s2c/11 M2'])), p(43, mobsPacket('M2', [])), { next: true }]],
    ['a refused portal is left out and the next one tried', [p(11, mapPacket('M2', 'Trại Vân Sơn', [[1, 'Bản đồ', 0], [1013, 'Lạc Cốc', 0], [1024, 'Rìa Hồng Giang', 0], [141, 'Võ Quan Đinh Mộc', 2]])),
      quest(10, 'Tìm Tướng Quân', 0, 0, [['Gặp Tướng Quân Lê Viễn', 162, 1, 162]]), { start: true }, p(1256, noticePacket('Bạn phải đạt cấp 40 mới vào được Lạc Cốc')), { next: true }]],
    ['the known way to an NPC two maps away', [p(11, mapPacket('M1', 'Làng Thanh Khê', WORLD[0][2])), p(43, mobsPacket('M1', [])), quest(10, 'Tìm Tướng Quân', 0, 0, [['Gặp Tướng Quân Lê Viễn', 162, 1, 162]]), { start: true }], scanAtlas()],
    ['kill count reached: on to the report', [p(11, mapPacket('M2', m2[1], m2[2])), p(43, mobsPacket('M2', m2[3])), quest9(3, 15), { start: true }]],
    ['kill step: the mobs of that name in turn', [p(11, mapPacket('M2', m2[1], m2[2])), p(43, mobsPacket('M2', [['mob61000', 'Cóc Xanh', 13], ['mob80', 'Kẻ Quấy Phá', 20], ['mob61001', 'Cóc Xanh', 13]])), quest9(3, 14), { start: true }]],
    ['level step: the strongest kind not above own level, never a boss', [p(9, bytes(fixtures.profile['s2c/9 level 21'])), p(11, mapPacket('M2', m2[1], m2[2])),
      p(43, mobsPacket('M2', [['mob61000', 'Cóc Xanh', 13], ['mob80', 'Kẻ Quấy Phá', 20], ['mob2806', 'Heo Mọi', 7]])),
      p(1177, new Writer().string('M2').u8(0).string('mob89100002').string('Hào Trưởng phía Bắc').i32(21).u8(0).i32(9).i32(1).u8(1).u8(1).i32(57).i32(12).build()),
      quest(11, 'Rèn Luyện', 0, 0, [['Đạt cấp độ 30', 30, 1, -1]]), { start: true }]],
    ['stat step: one potential point, then the reply', [at('M1'), quest(3, 'Những Việc Đầu Tiên', 2, 0, [['Đạt cấp độ 2', 2, 1, -1], ['Nói chuyện với Hương Lão Trần Bá', 102, 1, 102], ['Nâng điểm tiềm năng', 0, 1, -1], ['Báo cáo với Hương Lão Trần Bá', 102, 1, 102]]),
      { start: true }, p(34, bytes(new Writer().i32(0).string('subtask 1').i32(3).string('').build())), { next: true }]],
    ['a step the bot does not know stops it', [at('M1'), quest(3, 'Những Việc Đầu Tiên', 0, 0, [['Sử dụng điểm kỹ năng', 0, 1, -1]]), { start: true }]],
    ['a new quest after the report goes on with its first step', [at('M1'), p(11, mapPacket('M1', 'Làng Thanh Khê', WORLD[0][2])), p(43, mobsPacket('M1', [['mob2806', 'Heo Mọi', 7]])),
      quest(3, 'Những Việc Đầu Tiên', 0, 0, [['Báo cáo với Thành Chủ Nguyễn Khang', 129, 1, 129]]), { start: true }, p(35, bytes(q['s2c/35'])),
      p(34, bytes(new Writer().i32(0).string('subtask 1').i32(4).string('').build())), p(39, bytes(q['s2c/39 quest4'])), { next: true }]],
  ];
  return scenarios.map(([name, events, atlas]) => {
    const sent: [number, string][] = [];
    let stopped = false;
    const bot = new QuestBot({ maxFights: 100, maxLosses: 1, log: e => { if (e.event === 'stop') stopped = true; } });
    if (atlas) bot.atlas = structuredClone(atlas);
    const api = { send: (opcode: number, payload: Uint8Array) => { sent.push([opcode, hex(payload)]); }, close: () => {}, user: { account: 'export' } };
    const steps = events.map(e => {
      const before = sent.length;
      if ('packet' in e) bot.onPacket(e.packet[0], bytes(e.packet[1]));
      else if ('start' in e) bot.onReady(api as any);
      else bot.next();
      clearTimeout((bot as any).wait);
      return { ...e, sent: sent.slice(before), stopped, current: bot.quest?.current ?? null };
    });
    return { name, atlas: atlas ?? null, steps, portals: bot.atlas.portals };
  });
}

/** ZonePlayers fed the captured player pushes in order: the list after each one. */
function zone() {
  const z = new ZonePlayers(), w = fixtures.world;
  return ['s2c/1263', 's2c/1170', 's2c/1170', 's2c/1167', 's2c/1253'].map(k => ({
    opcode: w[k].opcode, hex: w[k].hex, changed: z.on(w[k].opcode, bytes(w[k].hex)), players: z.list().map(p => [p.id, p.name, p.level]),
  }));
}

function requests() {
  const move = { from: [5, 6] as [number, number], to: [5, 7] as [number, number] }, battleUuid = '3f1c2a9e-6b1d-4c55-9a27-0d3e4b5c6d7e';
  const ctx: [number, Record<string, unknown>][] = [[1, {}], [1206, {}], [5, { serverId: 24 }], [9, { username: 'Manina' }], [30, {}], [42, { characterName: 'manina' }],
    [29, { characterName: 'manina' }], [11, { mapId: 'M2' }], [43, { mapId: 'M2' }], [13, { mapId: 'M1', npcId: 1015 }], [15, { mobId: 'mob61000' }],
    [1178, { mobId: 'mob89100002' }], [18, { battleUuid }], [14, { battleUuid, seq: 4 }], [19, { battleUuid, seq: 3, move }], [20, { battleUuid, seq: 7, skill: 1000 }],
    [10, { stat: 0, amount: 1 }]];
  return ctx.map(([opcode, c]) => ({ opcode, ctx: c, hex: hex(buildRequest(opcode, c as any)) }));
}

/** Every captured battle replayed by swap + settle: the board and what was cleared after each server result. */
function battles() {
  return (fixtures.battles as { source: string; board: number[]; steps: { move?: number[]; cells?: number[][]; refill: number[] }[] }[]).map(b => {
    const board = b.board.slice();
    return { source: b.source, board: b.board, steps: b.steps.map(s => {
      if (s.move) swap(board, { from: [s.move[0], s.move[1]], to: [s.move[2], s.move[3]] });
      const o = settle(board, s.refill, (s.cells ?? []).map(([r, c]) => r * N + c));
      return { move: s.move, cells: s.cells, refill: s.refill, board: board.slice(), cleared: o.cleared, waves: o.waves, extraTurn: o.extraTurn };
    }) };
  });
}

/** bestMove on every replayed position, with sides and strategies varied by position so each term of moveValue counts. */
function bestMoves() {
  const out: unknown[] = [];
  const finite = (f: Fighter) => ({ ...f, hp: Number.isFinite(f.hp) ? f.hp : null, maxHp: Number.isFinite(f.maxHp) ? f.maxHp : null });
  let i = 0;
  for (const b of battles()) for (const board of [b.board, ...b.steps.map(s => s.board)]) {
    const me = fighter(30 + (i * 37) % 150, 180, { s1: (i * 7) % 40, s2: i % 5 === 0 ? 100 : (i * 13) % 100 });
    const mob = i % 3 === 0 ? unknownMob() : fighter(20 + (i * 53) % 230, 249, { sword: 10.9, heart: 6.2, yinyang: 3.45, peach: 5, skillCost: 30, skillDamage: 60, s2: (i * 29) % 100 });
    const strategy = i % 4 === 3 ? 'exp' : 'kill', reply = i % 6 === 5 ? 0 : 1;
    const pickMove = bestMove(board, me, mob, { ...STRATEGIES[strategy], reply });
    out.push({ board, me: finite(me), mob: finite(mob), strategy, reply, move: pickMove && pickMove.move, score: pickMove && pickMove.score });
    i++;
  }
  return out;
}

/** Indented JSON with every innermost array or object on one line (a board, a unit), as atlasJson does. */
const oneLineInner = (v: unknown) => JSON.stringify(v, null, 1).replace(/[[{][^[\]{}]*[\]}]/g, s => s.replace(/\s*\n\s*/g, ' ')) + '\n';

export function rustExports(): Record<string, string> {
  const opcodes = `// Generated by \`npm run export:rust\` from src/config.ts. Do not edit; change the TypeScript side and export again.
pub const PLATFORM: &str = ${JSON.stringify(BASELINE.platform)};
pub const PROTOCOL_VERSION: &str = ${JSON.stringify(BASELINE.protocolVersion)};
pub const HOST: &str = ${JSON.stringify(BASELINE.host)};
pub const PORT: u16 = ${BASELINE.port};
pub const SERVER_ID: i32 = ${BASELINE.observedServerId};
/// (opcode, int32 on the wire)
pub const OPCODES: &[(i32, i32)] = &[\n${OPCODE_ENTRIES.map(([o, e]) => `    (${o}, ${e}),`).join('\n')}\n];\n`;
  const vectors = {
    note: 'Generated by npm run export:rust from test/fixtures.ts and the TS decoders. Do not edit.',
    prelogin: pick(fixtures.prelogin, ['seed', 'handshake', 'key', 'received_chunks', 'sent_frames', 'decoded_receive', 'decoded_send']),
    password: fixtures['password-vectors'].vectors, login: fixtures['login-vectors'].vectors,
    decoders: decoders(), zone: zone(), requests: requests(), battles: battles(), bestMoves: bestMoves(),
    stepActions: stepActions(), atlas: atlasCases(), questReplays: questReplays(),
  };
  return { 'app/core/src/opcodes.rs': opcodes, 'app/core/tests/vectors.json': oneLineInner(vectors) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  for (const [path, content] of Object.entries(rustExports())) { writeFileSync(join(root, path), content); console.log(`wrote ${path} (${content.length} bytes)`); }
}
