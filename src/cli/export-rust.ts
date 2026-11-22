// Writes what the Rust app (app/, docs/integration/rust/README.md) takes from the TypeScript side: the opcode table of
// config.ts as app/core/src/opcodes.rs, and app/core/tests/vectors.json with the captured protocol vectors, what the TS
// decoders read from captured packets, the request builders' bytes, the captured battles replayed by battle.ts, and the
// moves bestMove picks. test/rust-export.test.ts fails until this is rerun after a TS change (npm run export:rust).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { BASELINE, OPCODE_ENTRIES } from '../protocol/config.ts';
import { PROTOCOL_VERSION, Reader, Writer, characterPrefix, characterProfile, characterLocation, characterSkills, mapPrefix } from '../protocol/protocol.ts';
import { buildRequest, decodeEvent } from '../protocol/events.ts';
import { mapData, mapGrid, mapChange, mapEntities, mapBoss, notice, characterStats, playersSnapshot, playerRecord, ZonePlayers, questData, questProgress, questComplete, duelInvite, skillTable,
  characterExtra, characterGear, characterTail, inventory, currencies, gearUpdate, zoneList } from '../protocol/world.ts';
import { N, swap, settle, bestMove, fighter, unknownMob, battleSetup, battleJoinAck, turnState, battleResult, timeoutResult, STRATEGIES, type Fighter } from '../battle/battle.ts';
import { type Atlas, emptyAtlas, recordMap, recordMobs, recordPortal, recordRefusal, recordWorld, destination, portalsOf, route } from '../bot/atlas.ts';
import { QuestBot, stepAction } from '../bot/quest.ts';
// The v2 search and the v3 choice of an own turn (battleV3 below).
import { readFileSync } from 'node:fs';
import { UNKNOWN, mobMoveOdds, answerValue, castSkill, mobBlock, battleItemResult, applyResult, type Board, type Strategy } from '../battle/battle.ts';
import { skillEffect, learntSkills, destroyPatterns, bestAction, skillWorth, swordPrior, type Potion, type SkillEffect } from '../battle/battle-actions.ts';
import { fixtures } from '../../test/fixtures.ts';
import { npcPackets, STACKED, symapBag } from '../../test/fixtures-npc.ts';
import { shopList } from '../protocol/world.ts';
import { serviceWindow, craftWindow, serviceSlot, stoneSlot, servicePreview, transmuteTarget, serviceResult, stoneResult, quote, mergePlan,
  mergeForecast, upgradeStones, putRequest, startRequest, craftSlot, recipes, craftMaterials, iceHeld, failLevel, charmUseful, charmFor, itemCap,
  PUT_ITEM, PUT_STACK } from '../protocol/npc.ts';
import { o1Packets } from '../../test/fixtures-o1.ts';
import { eggPackets } from '../../test/fixtures-egg.ts';
import { npcMenu } from '../protocol/world.ts';
import { pointsText } from '../protocol/shops.ts';
import { mapPacket, mobsPacket, noticePacket } from '../../test/support/packets.ts';
import { g1Packets } from '../../test/fixtures-g1.ts';
import { pl1Packets } from '../../test/fixtures-pl1.ts';
import { checkinRequest, checkinResult, claimRequest, claimedGifts, eventDefinition, eventKeyRequest, eventProgress, welfareDots } from '../protocol/welfare.ts';
import { q17Packets } from '../../test/fixtures-q17.ts';
import { b8Packets } from '../../test/fixtures-b8.ts';
import { claimedCount, dailyQuest, dailyTaken, dailyText, giftCodeRequest, giftCodeResult, mailAck, mailBody, mailIdRequest, mailList, newMail, slotsNeeded } from '../protocol/mail.ts';
import { Items } from '../protocol/items.ts';
import { market, marketBuyRequest, marketDone, marketExtendRequest, marketListed, marketPageRequest, marketSellRequest, marketTabs, marketWithdrawRequest } from '../protocol/market.ts';
import { ct1Packets } from '../../test/fixtures-ct1.ts';
import { np1Packets } from '../../test/fixtures-np1.ts';
import { fireCasts } from '../../test/fixtures-fire.ts';
import { v007Packets } from '../../test/fixtures-v007.ts';
import { v111Packets } from '../../test/fixtures-v111.ts';

const pick = (o: any, keys: string[]) => Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const bytes = (h: string) => Buffer.from(h, 'hex');
const response = (stage: number, opcode: number) => fixtures.scenario.stages[stage].responses.find((r: any) => r.opcode === opcode).hex as string;

/** Bosses and battle setups have no capture with every byte; these are built in the layout of world.ts and battle.ts. */
const bossGone = new Writer().string('M1').u8(1).string('mob86100001').build();
const setupBoard = fixtures.battles[0].board as number[];
const setup = new Writer().u8(1).u8(0).string('manina').string('manina').u8(0).u8(0).u8(1).i32(21).i32(0).u8(0).i32(150).i32(180)
  .string('mob61000').string('Cóc Xanh').u8(1).u8(0).u8(4).i32(13).i32(100050).u8(0).i32(249).i32(249)
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
  add('mapChange', '000000024d32000000010004', mapChange(bytes('000000024d32000000010004')));
  add('mapEntities', response(11, 43), mapEntities(bytes(response(11, 43))));
  add('mapBoss', response(11, 1177), mapBoss(bytes(response(11, 1177))));
  add('mapBoss', hex(bossGone), mapBoss(bossGone));
  add('notice', bp['s2c/1256'], notice(bytes(bp['s2c/1256'])).text);
  add('characterStats', bp['s2c/10 kind 4'], characterStats(new Reader(bytes(bp['s2c/10 kind 4']))));
  const w = fixtures.world;
  add('playersSnapshot', w['s2c/1263'].hex, playersSnapshot(bytes(w['s2c/1263'].hex)).players.map(p => pick(p, ['id', 'name', 'level', 'x', 'y'])));
  add('playerRecord', w['s2c/1167'].hex, pick(playerRecord(new Reader(bytes(w['s2c/1167'].hex))), ['id', 'name', 'level', 'x', 'y']));
  add('zoneList', w['s2c/1172'].hex, zoneList(bytes(w['s2c/1172'].hex)));
  add('battleSetup', hex(setupPacket), pick(battleSetup(setupPacket), ['me', 'level', 'hp', 'maxHp', 'uuid', 'board', 'turnSeconds']));
  for (const k of ['s2c/18', 's2c/18 player first']) add('battleJoinAck', bp[k], battleJoinAck(new Reader(bytes(bp[k]))));
  for (const k of ['s2c/24 own turn', 's2c/24 mob turn']) add('turnState', bp[k], turnState(new Reader(bytes(bp[k]))));
  for (const k of ['s2c/19 extra turn', 's2c/19 reshuffled']) add('battleResult19', bp[k], battleResult(new Reader(bytes(bp[k])), 19));
  for (const k of ['s2c/20', 's2c/20 skill 1000', 's2c/20 skill on a special']) add('battleResult20', bp[k], battleResult(new Reader(bytes(bp[k])), 20));
  add('timeoutResult', bp['s2c/21'], timeoutResult(new Reader(bytes(bp['s2c/21']))));
  const q = fixtures.quest, si0 = fixtures['skills-items'];
  for (const k of ['s2c/39 quest3', 's2c/39 quest4']) add('questData', q[k], questData(bytes(q[k])));
  add('questProgress', q['s2c/34 dialogue'], questProgress(bytes(q['s2c/34 dialogue'])));
  add('questComplete', q['s2c/35'], questComplete(bytes(q['s2c/35'])));
  // The mob of the duel of quest 12, after Đồng ý (N3, 10-quests.md#s2c-1180).
  add('duelInvite', q['s2c/1180 duel'], duelInvite(bytes(q['s2c/1180 duel'])));
  // Bag, gear and money (12-skills-items.md#túi-đồ, 04-push.md#s2c-46), ahead of the skill cases the Rust side lacks yet.
  add('characterExtra', si0['s2c/42 login'], characterExtra(bytes(si0['s2c/42 login'])));
  add('inventory', si0['s2c/1187 after repair'], inventory(bytes(si0['s2c/1187 after repair'])));
  // Kind 4 (O1, Chế tạo trang bị): one item added, not the whole bag.
  add('inventory', o1Packets['s2c/1187 loại 4'], inventory(bytes(o1Packets['s2c/1187 loại 4'])));
  // Kind 2 (Log lỗi of 02/11, Đập Trứng Gà): what is left in one slot.
  add('inventory', eggPackets['s2c/1187 loại 2'], inventory(bytes(eggPackets['s2c/1187 loại 2'])));
  for (const h of [fixtures.profile['s2c/9 level 21'], fixtures.profile['s2c/9 field01 4']] as string[]) add('characterGear', h, characterGear(bytes(h)));
  // The tail of s2c/9: symap's x2 EXP star "ef7" and faction (P4), and manina with no effect.
  for (const h of [fixtures.equip['s2c/9 symap'], fixtures.profile['s2c/9 level 21']] as string[]) add('characterTail', h, characterTail(bytes(h)));
  add('currencies', fixtures.currencies['s2c/46 E1'], currencies(bytes(fixtures.currencies['s2c/46 E1'])));
  // The gear after Cởi ra and Trang bị on the phone (P4, 12-skills-items.md#c2s-1186).
  for (const k of ['s2c/37 unequip pet', 's2c/37 equip pet']) add('gearUpdate', fixtures.equip[k], gearUpdate(bytes(fixtures.equip[k])));
  // Drops (13-drops-items.md#g2): an item falling (s2c/1182, Xu khóa and a ring), leaving the ground (s2c/1183), and the bag
  // slot of an item picked up (s2c/51 of K3, as in test/items.test.ts).
  for (const k of ['s2c/1182 gold', 's2c/1182 gear']) {
    add('groundItemAdd', w[k].hex, pick(decodeEvent('s2c', 1182, bytes(w[k].hex)).fields as any, ['mapId', 'itemId', 'uuid', 'quantity', 'x', 'y', 'expiresAt']));
  }
  add('groundItemRemove', w['s2c/1183'].hex, decodeEvent('s2c', 1183, bytes(w['s2c/1183'].hex)).fields);
  // Every item on the ground of M1 on entering it (s2c/1184), for Nhặt cả đồ người khác.
  add('groundItems', w['s2c/1184'].hex, (decodeEvent('s2c', 1184, bytes(w['s2c/1184'].hex)).fields as any).items.map((i: any) =>
    pick(i, ['itemId', 'uuid', 'quantity', 'element', 'x', 'y', 'expiresAt'])));
  // Protocol 0.0.7 (the layouts of the game 1.1.0, 20/11): mobs with their tile, the boss's u8 and i32 after its tile, the
  // bytes after each quest step, and the two bytes before the stat count of every item (02-login.md#vg1).
  const v = (k: string) => bytes(v007Packets[k]);
  add('mapEntities', v007Packets['s2c/43 M1'], mapEntities(v('s2c/43 M1')));
  add('mapBoss', v007Packets['s2c/1177 boss'], mapBoss(v('s2c/1177 boss')));
  add('duelInvite', v007Packets['s2c/1180 Võ Quan'], duelInvite(v('s2c/1180 Võ Quan')));
  add('questData', v007Packets['s2c/39 quest3'], questData(v('s2c/39 quest3')));
  add('characterExtra', v007Packets['s2c/42 bag'], characterExtra(v('s2c/42 bag')));
  add('inventory', v007Packets['s2c/1187 bag'], inventory(v('s2c/1187 bag')));
  add('characterGear', v007Packets['s2c/9'], characterGear(v('s2c/9')));
  add('characterTail', v007Packets['s2c/9'], characterTail(v('s2c/9')));
  add('characterTail', v111Packets['s2c/9'], characterTail(bytes(v111Packets['s2c/9'])));
  add('groundItemAdd', v007Packets['s2c/1182 drop'], pick(decodeEvent('s2c', 1182, v('s2c/1182 drop')).fields as any, ['mapId', 'itemId', 'uuid', 'quantity', 'x', 'y', 'expiresAt']));
  add('groundItems', v007Packets['s2c/1184 ground'], (decodeEvent('s2c', 1184, v('s2c/1184 ground')).fields as any).items.map((i: any) =>
    pick(i, ['itemId', 'uuid', 'quantity', 'element', 'x', 'y', 'expiresAt'])));
  for (const k of ['s2c/37 mặc Nón Lá', 's2c/37 cởi Nón Lá']) add('gearUpdate', v007Packets[k], gearUpdate(v(k)));
  const slot51 = 'ffffffff0000000001060000019c0000002434336363626635352d356439372d346434312d393838342d32656263663039396366356300000000ffffffff0000000100ff00000000000000';
  add('bagSlot', slot51, (decodeEvent('s2c', 51, bytes(slot51)).fields as any).item);
  // The skill step (docs/app/events/12-skills-items.md): the tree of s2c/30, the skill list of the s2c/9 tail, s2c/10 kind 32.
  add('skillTable', response(7, 30), skillTable(bytes(response(7, 30))));
  for (const h of [a2, fixtures.profile['s2c/9 level 21'], fixtures.profile['s2c/9 field01 4']] as string[]) add('characterSkills', h, characterSkills(bytes(h)));
  const si = fixtures['skills-items'];
  add('characterStats', si['s2c/10 kind 32'], characterStats(new Reader(bytes(si['s2c/10 kind 32']))));
  return cases;
}

/** stepAction on the step texts of quests 3–9, and ones the bot does not know. */
/** The packets of the NPC shops and of Pháp sư's windows (test/fixtures-npc.ts, J1–J3), what quote reads in each text,
 * and the plans of Gộp đá and Nâng cấp on symap's bag (app/core/tests/npc.rs). */
function npcCases() {
  const fns: Record<number, [string, (p: Uint8Array) => any]> = {
    96: ['serviceWindow', serviceWindow], 99: ['craftWindow', craftWindow], 90: ['serviceSlot', serviceSlot], 92: ['stoneSlot', stoneSlot],
    1258: ['servicePreview', servicePreview], 1260: ['transmuteTarget', transmuteTarget], 91: ['serviceResult', serviceResult],
    93: ['stoneResult', stoneResult], 1190: ['shopList', shopList],
  };
  const decoders: { fn: string; hex: string; expected: unknown }[] = [], texts = new Set<string>();
  // With them the shop of protocol 0.0.7 (test/fixtures-v007.ts): two more bytes in each line.
  const v007Shop = Object.fromEntries(Object.entries(v007Packets).filter(([k]) => k.startsWith('s2c/1190')));
  for (const [key, h] of Object.entries({ ...npcPackets, ...v007Shop })) {
    const f = fns[Number(key.split(' ')[0].split('/')[1])];
    if (!f) continue;
    const expected = f[1](bytes(h));
    decoders.push({ fn: f[0], hex: h, expected });
    if (typeof expected.text === 'string') texts.add(expected.text);
  }
  const extra = [...symapBag, { slot: 60, itemId: 411, field0: 0, field1: 1 }, { slot: 61, itemId: 411, field0: 0, field1: 1 }];
  const plans = [{}, { upTo: 6 }, { upTo: 2 }, { unlocked: false }, { level: 5, locked: true, sets: 1 }, { level: 5 }, { sets: 2 },
    { level: 1, locked: false }, { level: 1, locked: false, unlocked: false }, { level: 12 }].flatMap(opts => [symapBag, extra].map(bag => ({ bag, opts, plan: mergePlan(bag, opts), forecast: mergeForecast(bag, opts) })));
  // Stacked stones (ST1): akaito's bag, and four Đá cấp 2 alone.
  const four = [{ slot: 2, itemId: 412, field0: 0, field1: 0, quantity: 4 }];
  const stackedPlans = [{}, { upTo: 3 }, { level: 2, sets: 2 }, { upTo: 6 }].flatMap(opts => [STACKED, four].map(bag => ({ bag, opts, plan: mergePlan(bag, opts), forecast: mergeForecast(bag, opts) })));
  return {
    decoders, quotes: [...texts].map(text => ({ text, expected: quote(text) })), plans: [...plans, ...stackedPlans],
    upgradeStones: [true, false].map(unlocked => ({ unlocked, slots: upgradeStones(symapBag, { unlocked }).map(i => i.slot) })),
    upgradeStacked: { bag: STACKED, slots: upgradeStones(STACKED).map(i => i.slot) },
    requests: { put45: hex(putRequest(45)), start: hex(startRequest()) },
    o1: o1Cases(),
  };
}

/** Bùa bảo vệ, Chế tạo trang bị and Đổi Băng Tâm (test/fixtures-o1.ts, O1), Điểm năng động (the texts of G1 and J1,
 * 14-npc.md#điểm-năng-động): what the TS side reads in the packets and texts, its rules for charms and caps, the stacks
 * it puts for a recipe, and c2s/97 of a charm and of materials as the phone sent them (app/core/tests/npc.rs). */
function o1Cases() {
  const P = o1Packets, b = (k: string) => bytes(P[k]);
  const fns: Record<string, [string, (p: Uint8Array) => unknown]> = {
    's2c/96': ['serviceWindow', serviceWindow], 's2c/99': ['craftWindow', craftWindow], 's2c/90': ['serviceSlot', serviceSlot],
    's2c/92': ['craftSlot', craftSlot], 's2c/1258': ['servicePreview', servicePreview], 's2c/91': ['serviceResult', serviceResult],
    's2c/93': ['stoneResult', stoneResult], 's2c/57': ['npcMenu', npcMenu],
  };
  const decoders = Object.entries(P).flatMap(([key, h]) => {
    const f = fns[key.split(' ')[0]];
    return f ? [{ fn: f[0], key, hex: h, expected: f[1](bytes(h)) }] : [];
  });
  const items = Items.load(), ids = new Map(items.book.items.filter(i => i.type === 22).map(i => [i.name, i.id]));
  const ring = npcMenu(b('s2c/57 Nhẫn')), recipeList = recipes(ring);
  // The materials of O1 (Quặng 86 in slot 33, Linh Thạch 43 in 37), a smaller Quặng stack, and a Linh Thạch short of 24.
  const quang = ids.get('Quặng Bậc 1')!, linh = ids.get('Linh Thạch Bậc 1')!;
  const bags = [
    [{ slot: 33, itemId: quang, field0: 0, field1: 0, quantity: 86 }, { slot: 37, itemId: linh, field0: 0, field1: 0, quantity: 43 }, { slot: 40, itemId: quang, field0: 0, field1: 0, quantity: 30 }],
    [{ slot: 5, itemId: quang, field0: 0, field1: 0, quantity: 24 }, { slot: 6, itemId: linh, field0: 0, field1: 0, quantity: 10 }],
  ];
  const materials = bags.flatMap(bag => recipeList.map(recipe => {
    const { puts, missing } = craftMaterials(bag, recipe, name => ids.get(name));
    return { bag, tier: recipe.tier, puts: puts.map(p => ({ name: p.name, count: p.count, slot: p.item.slot })), missing };
  }));
  const charmBag = [{ slot: 20, itemId: 35, field0: 0, field1: 1, quantity: 3 }, { slot: 21, itemId: 37, field0: 0, field1: 1, quantity: 1 }];
  const pointTexts = ['Điểm năng động tuần này: 12/100\nHạn mức đổi (cấp 31): 3.000 Xu, cần 3.300 Xu khóa\nTuần này còn 500/500 suất. Hết tuần lúc 00:00 thứ Hai.',
    'Điểm năng động tuần này: 54/100\nHạn mức đổi (cấp 79): 7.000 Xu, cần 7.700 Xu khóa\nTuần này còn 1.200/1.500 suất.', 'Hương Lão chưa nói gì.'];
  return {
    decoders,
    recipes: [{ key: 's2c/57 Nhẫn', text: ring.text, options: ring.options, expected: recipeList },
      { key: 's2c/57 Pháp sư', text: npcMenu(b('s2c/57 Pháp sư')).text, options: npcMenu(b('s2c/57 Pháp sư')).options, expected: recipes(npcMenu(b('s2c/57 Pháp sư'))) }],
    materials, ids: Object.fromEntries([...new Set(recipeList.flatMap(r => r.materials.map(m => m.name)))].map(n => [n, ids.get(n) ?? null])),
    ice: [npcMenu(b('s2c/57 Đổi Băng Tâm có 8')).text, 'Bạn đang có 1.024 Băng Tâm.', 'Không có Băng Tâm.'].map(text => ({ text, held: iceHeld(text) ?? null })),
    points: pointTexts.map(text => ({ text, expected: pointsText(text) })),
    charms: Array.from({ length: 17 }, (_, level) => ({ level, failLevel: failLevel(level), charmUseful: charmUseful(level), charm: charmFor(charmBag, level)?.slot ?? null })),
    charmBag,
    caps: [[4, 1], [0, 51], [3, 21], [0, 101], [1, 20]].map(([type, level]) => ({ type, level, cap: itemCap({ type, level }) })),
    requests: [
      { key: 'c2s/97 Quặng', slot: 33, quantity: 86, kind: PUT_STACK, hex: hex(putRequest(33, 86, PUT_STACK)), phone: P['c2s/97 Quặng'] },
      { key: 'c2s/97 Linh Thạch', slot: 37, quantity: 43, kind: PUT_STACK, hex: hex(putRequest(37, 43, PUT_STACK)), phone: P['c2s/97 Linh Thạch'] },
      { key: 'c2s/97 nhẫn', slot: 19, quantity: 1, kind: PUT_ITEM, hex: hex(putRequest(19, 1, PUT_ITEM)), phone: P['c2s/97 nhẫn'] },
      { key: 'c2s/97 bùa', slot: 20, quantity: 1, kind: PUT_STACK, hex: hex(putRequest(20, 1, PUT_STACK)), phone: P['c2s/97 bùa'] },
    ],
  };
}

/** Mã quà tặng (test/fixtures-g1.ts, G1): what giftCodeResult and newMail read in the captured packets, and the bytes of
 * c2s/1223 for codes as typed (app/core/tests/gift.rs). */
function giftCases() {
  const fns: Record<string, [string, (p: Uint8Array) => unknown]> = { 's2c/1223': ['giftCodeResult', giftCodeResult], 's2c/1222': ['newMail', newMail] };
  const decoders = Object.entries(g1Packets).flatMap(([key, h]) => {
    const f = fns[key.split(' ')[0]];
    return f ? [{ fn: f[0], key, hex: h, expected: f[1](bytes(h)) }] : [];
  });
  const requests = ['ALPHATEST1', 'denbu', '  DENBU  ', 'Saima2026'].map(typed => ({ typed, hex: hex(giftCodeRequest(typed)) }));
  return { decoders, requests };
}

/** Nhiệm vụ hàng ngày (test/fixtures-g1.ts G1, test/fixtures-np1.ts NP1): what dailyQuest reads in every s2c/1195
 * captured and the text the Phụ tab draws of a quest; Hương Lão's menus with how many were taken today (dailyTaken) and
 * their lines; the other packets of Nhận, Hủy and Hoàn thành, for Bot::smith of SmithTask::Daily (app/core/tests/daily.rs). */
function dailyCases() {
  const all: Record<string, string> = { ...g1Packets, ...np1Packets };
  const keys = (prefix: string) => Object.keys(all).filter(k => k.startsWith(prefix));
  const quests = keys('s2c/1195').map(key => {
    const expected = dailyQuest(bytes(all[key]));
    return { key, hex: all[key], expected, text: expected.kind === 1 && expected.quest ? dailyText(expected.quest) : null };
  });
  const menus = keys('s2c/57').map(key => {
    const m = npcMenu(bytes(all[key]));
    return { key, hex: all[key], taken: dailyTaken(m.text) ?? null, options: m.options.map(o => [o.option, o.label]) };
  });
  const packets = ['s2c/1256 Nhận nhiệm vụ thành công', 's2c/1256 Hủy nhiệm vụ thành công', 's2c/10 sau Hoàn thành', 's2c/46 sau Hoàn thành']
    .map(key => ({ key, hex: all[key] }));
  return { quests, menus, packets };
}

/** Hòm thư (test/fixtures-g1.ts, G1): what mailList, mailBody and mailAck read in the captured packets, the bytes of
 * c2s/1216, c2s/1217 and c2s/1219, the bag slots slotsNeeded counts for the mails of G1 against a bag, and the notices of
 * Nhận hết as claimedCount reads them (app/core/tests/mail.rs). */
function mailCases() {
  const fns: Record<string, [string, (p: Uint8Array) => unknown]> = {
    's2c/1215': ['mailList', p => mailList(p).mails], 's2c/1216': ['mailBody', mailBody],
    's2c/1217': ['mailAck', p => mailAck(p, 1217)], 's2c/1219': ['mailAck', p => mailAck(p, 1219)],
  };
  const decoders = Object.entries(g1Packets).flatMap(([key, h]) => {
    const f = fns[key.split(' ')[0]];
    return f ? [{ fn: f[0], key, hex: h, expected: f[1](bytes(h)) }] : [];
  });
  const requests = [6280, 6273, 5118, 2 ** 40 + 7].map(id => ({ id, hex: hex(mailIdRequest(id)) }));
  const items = Items.load(), stack = (id: number) => items.get(id)?.stack ?? 1;
  // 6273 in G1: the bag held Búa (2), Hoàn Linh (0) and Kim Đan (1), locked; another lock is not known to stack.
  const locked = [2, 0, 1].map(itemId => ({ itemId, field1: 0 })), unlocked = locked.map(i => ({ ...i, field1: 1 }));
  const slots = ([['s2c/1216 6280 Đền bù', []], ['s2c/1216 6273 Ngày 1', locked], ['s2c/1216 6273 Ngày 1', unlocked], ['s2c/1216 6273 Ngày 1', []],
    ['s2c/1216 6278 Alpha Test', []], ['s2c/1216 5118 cấp 20', []], ['s2c/1216 5118 cấp 20', [{ itemId: 7, field1: 0 }]]] as const)
    .map(([key, bag]) => ({ key, bag: bag.map(i => [i.itemId, i.field1]), slots: slotsNeeded(mailBody(bytes(g1Packets[key])).items, [...bag], stack) }));
  const claimed = ['Đã nhận quà của 2 thư', 'Đã nhận quà của 1 thư, rương đã đầy', 'Không có quà nào để nhận',
    'Rương đã đầy. Vui lòng bỏ bớt đồ ra hoặc mua thêm ngăn chứa'].map(text => ({ text, count: claimedCount(text) }));
  return { decoders, requests, slots, claimed };
}

/** Phúc lợi (test/fixtures-pl1.ts, PL1): what eventDefinition, eventProgress, checkinResult and welfareDots read in every
 * captured packet (without `stamp`, an i64 that a JS number rounds), the bytes of c2s/1236, c2s/1239, c2s/1232 and
 * c2s/1233, and the notices as claimedGifts reads them (app/core/tests/welfare.rs). */
function welfareCases() {
  const fns: Record<string, [string, (p: Uint8Array) => unknown]> = {
    's2c/1236': ['eventDefinition', eventDefinition], 's2c/1239': ['eventProgress', eventProgress],
    's2c/1232': ['checkinResult', checkinResult], 's2c/1279': ['welfareDots', welfareDots],
  };
  const decoders = Object.entries(pl1Packets).flatMap(([key, h]) => {
    const f = fns[key.split(' ')[0]];
    if (!f) return [];
    const value = f[1](bytes(h));
    const expected = value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([k]) => k !== 'stamp' && k !== 'rest')) : value;
    return [{ fn: f[0], key, hex: h, expected }];
  });
  const packets = Object.entries(pl1Packets).map(([key, h]) => ({ key, hex: h }));
  const requests = {
    keys: ['CHECKIN_MONTHLY', 'ONLINE_DAILY', 'LEVEL_UP'].map(key => ({ key, hex: hex(eventKeyRequest(key)) })),
    checkin: [[64, 0], [64, 299]].map(([event, milestone]) => ({ event, milestone, hex: hex(checkinRequest(event, milestone)) })),
    claim: [21, 65].map(event => ({ event, hex: hex(claimRequest(event)) })),
  };
  const claimed = ['Đã nhận 5 phần thưởng', 'Đã nhận 4 phần thưởng', 'Không có phần thưởng nào để nhận', 'Hôm nay bạn đã điểm danh']
    .map(text => ({ text, count: claimedGifts(text) ?? null }));
  return { decoders, packets, requests, claimed };
}

/** Chợ trời: what market, marketTabs, marketListed and marketDone read in the packets of CT1 (test/fixtures-ct1.ts) and in
 * Đang bán before and after Gia hạn of NP1 (test/fixtures-np1.ts); the bytes of c2s/1192, c2s/115, c2s/112 (kind 1 and 2)
 * and c2s/113 as built here and as on the wire (`wire`: the phone's in CT1, the TS bot's that the server took in NP1); the
 * packets of NP1's Gia hạn in their order, for the bot to replay (app/core/tests/market.rs). */
function marketCases() {
  const fns: Record<string, [string, (p: Uint8Array) => unknown]> = {
    's2c/1192': ['market', market], 's2c/116': ['marketTabs', marketTabs], 's2c/112': ['marketListed', marketListed],
    's2c/113': ['marketDone', p => marketDone(p, 113)], 's2c/115': ['marketDone', p => marketDone(p, 115)],
  };
  const extend = ['s2c/1192 Đang bán trước Gia hạn', 'c2s/112 Gia hạn', 's2c/46 sau Gia hạn', 's2c/1192 Đang bán sau Gia hạn', 's2c/1256 gia hạn'];
  // And two pages of protocol 0.0.7 (test/fixtures-v007.ts, 20/11): one more byte in each listing.
  const v007Pages = Object.fromEntries(Object.entries(v007Packets).filter(([k]) => k.startsWith('s2c/1192')));
  const packets = { ...ct1Packets, ...Object.fromEntries(extend.map(k => [k, np1Packets[k]])), ...v007Pages };
  const decoders = Object.entries(packets).flatMap(([key, h]) => {
    const f = fns[key.split(' ')[0]];
    return f ? [{ fn: f[0], key, hex: h, expected: f[1](bytes(h)) }] : [];
  });
  const uuid = (key: string) => new Reader(bytes(ct1Packets[key])).string();
  const extendUuid = (() => { const r = new Reader(bytes(np1Packets['c2s/112 Gia hạn'])); r.u8(); return r.string(); })();
  const requests = [
    { op: 1192, tab: 1, page: 2, hex: hex(marketPageRequest(1, 2)), wire: ct1Packets['c2s/1192 Nón Nam trang 2'] },
    { op: 1192, tab: -1, page: 1, hex: hex(marketPageRequest(-1)), wire: ct1Packets['c2s/1192 Đang bán'] },
    { op: 115, uuid: uuid('c2s/115 Mua'), hex: hex(marketBuyRequest(uuid('c2s/115 Mua'))), wire: ct1Packets['c2s/115 Mua'] },
    { op: 112, slot: 2, quantity: 1, price: 1_000_000, hex: hex(marketSellRequest(2, 1, 1_000_000)), wire: ct1Packets['c2s/112 Đăng bán ô 2 giá 1.000.000'] },
    { op: 113, uuid: uuid('c2s/113 Thu hồi'), hex: hex(marketWithdrawRequest(uuid('c2s/113 Thu hồi'))), wire: ct1Packets['c2s/113 Thu hồi'] },
    { op: 112, uuid: extendUuid, hex: hex(marketExtendRequest(extendUuid)), wire: np1Packets['c2s/112 Gia hạn'] },
  ];
  return { decoders, requests, extend: extend.map(key => ({ key, hex: np1Packets[key] })) };
}

function stepActions() {
  const steps: [string, number, number?][] = [['Tiêu diệt Heo Mọi', -1], ['Tiêu diệt 1 Sói Xám', -1], ['Đánh bại Kẻ Gây Rối', -1], ['Gây 500 sát thương lên Thủ Lĩnh Sơn Tặc', -1],
    ['Đạt cấp độ 8', -1], ['Nâng điểm tiềm năng', -1], ['Báo cáo với Bà Tư Hạnh', 103], ['Bàn bạc với Thành Chủ Nguyễn Khang', 129], ['Gặp Trại Chủ Phạm Hùng', 127],
    ['Sử dụng điểm kỹ năng', -1], ['Trinh sát Thành Hồng Giang', -1, 3], ['Trinh sát Thành Hồng Giang', 162, 3], ['Trinh sát Thành ', -1, 3], ['Thu thập 5 Da Heo', -1],
    ['Đến Cửu Phong', -1, 9], ['Đến vùng đất Lạc Cốc', -1, 4], ['Đến Cửu Phong', 145, 9], ['Đến Cửu Phong', -1, -1], ['Đến ', -1, 9], ['Đến vùng đất ', -1, 4],
    ['Gây 1.000 sát thương lên Tướng Thiết Hổ', -1, 95], ['Tiêu diệt 1.000 Gà Điên', -1], ['Gây 10.00 sát thương lên Tướng Thiết Hổ', -1], ['Gây 1.0000 sát thương lên Tướng Thiết Hổ', -1]];
  // Every step of every s2c/39 captured live (quests 3, 4, 12, 14, 17): the words and numbers as the server sent them.
  const captured = [fixtures.quest['s2c/39 quest3'], fixtures.quest['s2c/39 quest4'], fixtures.quest['s2c/39 quest12'], fixtures.quest['s2c/39 quest14'], q17Packets['s2c/39 quest17'], b8Packets['s2c/39 quest28']]
    .flatMap(h => questData(bytes(h)).steps.map((s): [string, number, number] => [s.text, s.npcId, s.param]));
  return [...steps, ...captured].map(([text, npcId, param = 0]) => ({ text, npcId, param, action: stepAction({ text, npcId, param }) }));
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

/** scanAtlas() with the world map of S1 and M5 Lạc Cốc, entered by a level 42 (S2): the maps shown more than one level
 * above the character are left out of the way, and portal 1013 keeps the 40 it asked for. */
function gateAtlas(): Atlas {
  const atlas = scanAtlas();
  recordMap(atlas, mapData(mapPacket('M5', 'Lạc Cốc', [[1014, 'Làng Thanh Khê', 0], [1015, 'Vân Sơn', 0]])));
  delete (atlas.maps.M5 as Partial<Atlas['maps'][string]>).seen;
  recordPortal(atlas, 1013, { name: 'Lạc Cốc', mapId: 'M5' });
  recordWorld(atlas, [['M1', 0, false], ['M2', 10, false], ['M4', 20, true], ['M5', 40, true], ['M25', 20, false]]
    .map(([mapId, levelRequired, locked]) => ({ mapId: mapId as string, levelRequired: levelRequired as number, locked: locked as boolean })));
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
    gate: gateCases(),
  };
}
function gateCases() {
  const atlas = gateAtlas();
  const routes: [string, Wanted, number, number[]][] = [['M1', { npc: 162 }, 18, []], ['M1', { npc: 162 }, 19, []], ['M2', { map: 'M5' }, 39, []], ['M2', { map: 'M5' }, 40, []]];
  return {
    atlas,
    routes: routes.map(([from, wanted, level, skip]) => ({ from, wanted, level, skip, portal: route(atlas, from, wants(wanted), level, new Set(skip))?.id ?? null })),
    portalsOf: [['M1', 0], ['M1', 8], ['M1', 9], ['M1', 39], ['M1', 40], ['M2', 18], ['M2', 19], ['M5', 40]].map(([mapId, level]) => ({ mapId, level, portals: portalsOf(atlas, mapId as string, level as number).map(p => p.id) })),
  };
}

/** Packets fed to QuestBot as the quest steps of 10-quests.md play out, with what it sent after each one. `start` is
 * onReady (the app's "Tự làm nhiệm vụ"; with `once`, its ▶ on the current step; with `stats`, QuestBotOptions.stats);
 * `next` is the decision a pending timer makes. Battles are left out (their counting has its own tests); timers are
 * cleared after every step. */
function questReplays() {
  type Ev = { packet: [number, string] } | { start: true; once?: true; stats?: number[] | 'auto' } | { next: true };
  const p = (opcode: number, b: Uint8Array): Ev => ({ packet: [opcode, hex(b)] });
  const at = (mapId: string) => p(29, new Writer().string('manina').string(mapId).i32(0).build());
  const quest = (id: number, title: string, current: number, progress: number, steps: [string, number, number, number][]) => {
    const w = new Writer().i32(id).string(title).string('').string('main').i32(current).i32(progress).i32(steps.length);
    steps.forEach(([text, param, required, npcId], i) => w.i32(i).string(text).i32(param).i32(required).i32(npcId));
    return p(39, w.build());
  };
  const boss = (field: 0 | 1) => p(1177, field === 1 ? new Writer().string('M1').u8(1).string('mob86100001').build()
    : new Writer().string('M1').u8(0).string('mob86100001').string('Thủ Lĩnh Sơn Tặc').i32(11).u8(0).i32(9).i32(1).u8(1).u8(1).i32(85).i32(5).build());
  const quest19 = (current: number) => quest(19, 'Thế Lực Tranh Hùng', current, 0,
    [['Gặp Tướng Quân Lê Viễn', 162, 1, 162], ['Đến Cửu Phong', 9, 1, -1], ['Báo cáo với Tướng Quân Lê Viễn', 162, 1, 162]]);
  const quest7 = quest(7, 'Quét Sạch Sơn Trại', 1, 0, [['Đánh bại Chỉ Huy Sơn Tặc', 87, 1, -1], ['Gây 500 sát thương lên Thủ Lĩnh Sơn Tặc', 0, 500, -1]]);
  const quest9 = (current: number, progress: number) => quest(9, 'Thử Sức Tân Binh', current, progress,
    [['Đạt cấp độ 11', 11, 1, -1], ['Nói chuyện với Võ Quan Đinh Mộc', 141, 1, 141], ['Tiêu diệt Sói Xám', 4, 15, -1], ['Tiêu diệt Cóc Xanh', 5, 15, -1], ['Báo cáo với Võ Quan Đinh Mộc', 141, 1, 141]]);
  const m2 = WORLD[1], q = fixtures.quest, mp = fixtures['map-packets'];
  // Two skills of the Hỏa tree with the costs of s2c/30 (levels 1–5): the root and one that needs it. The whole tree is
  // ~23 KB; skillTable has it among the decoders.
  const tree = new Writer().i32(2);
  for (const [id, name, prerequisite, cost, first] of [[1000, 'Hỏa Cầu Thuật', -1, 1, 2], [1003, 'Liệt Hỏa Chi Kiếm', 1000, 2, 10]] as const) {
    tree.i32(id).string(name).i32(prerequisite).i32(5);
    for (let l = 1; l <= 5; l++) tree.i32(l).string('').i32(cost).i32(first + 5 * (l - 1)).i32(25 * cost);
  }
  const skills = p(30, tree.build());
  const quest3 = (current: number) => quest(3, 'Những Việc Đầu Tiên', current, 0, [['Đạt cấp độ 2', 2, 1, -1], ['Nói chuyện với Hương Lão Trần Bá', 102, 1, 102],
    ['Nâng điểm tiềm năng', 0, 1, -1], ['Sử dụng điểm kỹ năng', 0, 1, -1], ['Tiêu diệt Gà Điên', 0, 1, -1], ['Báo cáo với Hương Lão Trần Bá', 102, 1, 102]]);
  // s2c/10 kind 8 with the potential points left (P1).
  const pointsLeft = (left: number) => p(10, new Writer().i32(8).string('manina').i32(left).i32(16).i32(0).i32(21).string('421').string('125').build());
  const scenarios: [string, Ev[], Atlas?][] = [
    ['damage step: the boss of s2c/1177 with c2s/1178', [at('M1'), p(43, mobsPacket('M1', [['mob872600', 'Chỉ Huy Sơn Tặc', 10]])), boss(0), quest7, { start: true }]],
    ['B8: the boss of a kill step falls, s2c/34 alone ends the step, on to the report', [at('M8'), p(1177, bytes(b8Packets['s2c/1177 Tướng Thiết Kích'])), p(39, bytes(b8Packets['s2c/39 quest28'])), { start: true },
      p(34, bytes(b8Packets['s2c/34 hạ Tướng Thiết Kích'])), { next: true }]],
    ['kill step naming a boss ("Đánh bại Tướng Thiết Kích", B8): c2s/1178 too', [at('M1'), p(43, mobsPacket('M1', [['mob872600', 'Chỉ Huy Sơn Tặc', 10]])), boss(0),
      quest(28, 'Chặt Gãy Mũi Giáo', 0, 0, [['Đánh bại Thủ Lĩnh Sơn Tặc', 0, 1, -1]]), { start: true }]],
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
      { start: true }, p(34, new Writer().i32(0).string('subtask 1').i32(3).string('').build()), { next: true }]],
    ['a step the bot does not know stops it', [at('M1'), quest(3, 'Những Việc Đầu Tiên', 0, 0, [['Thu thập 5 Da Heo', 0, 5, -1]]), { start: true }]],
    // Quest 14 "Trinh sát Thành Hồng Giang" (N5): into M4 through the portal Hồng Giang, the s2c/34 as it enters moves the
    // step, then the report goes back through 1024.
    ['visit step: into the map through the portal named after it, moved on by s2c/34, then back for the report', [p(11, mapPacket('M25', 'Rìa Hồng Giang', WORLD[2][2])), p(43, mobsPacket('M25', [])),
      p(39, bytes(q['s2c/39 quest14'])), { start: true }, p(13, bytes(q['s2c/13 M4'])), p(11, mapPacket('M4', 'Hồng Giang', [[3, 'Bản đồ', 0], [1024, 'Rìa Hồng Giang', 0], [121, 'Tướng Xích Vũ', 2]])),
      p(43, mobsPacket('M4', [])), p(34, bytes(q['s2c/34 scout'])), { next: true }]],
    ['visit step from two maps away: first to the map that has the portal', [p(11, mapPacket('M2', m2[1], m2[2])), p(43, mobsPacket('M2', [])), p(39, bytes(q['s2c/39 quest14'])), { start: true }], scanAtlas()],
    ['visit step: a refused portal stops it', [p(11, mapPacket('M25', 'Rìa Hồng Giang', WORLD[2][2])), p(39, bytes(q['s2c/39 quest14'])), { start: true },
      p(1256, noticePacket('Bạn cần hoàn thành nhiệm vụ trước khi tới đây')), { next: true }]],
    ['visit step: already in the map with no s2c/34 stops it', [p(11, mapPacket('M4', 'Hồng Giang', [[1024, 'Rìa Hồng Giang', 0]])), p(39, bytes(q['s2c/39 quest14'])), { start: true }]],
    // Quest 19 "Thế Lực Tranh Hùng" of wangpt (01/11): "Đến Cửu Phong", param 9, is M10. No portal of M25 has the name, so
    // through Hồng Giang to M4, whose portal Cửu Phong (1020) leads into M10; the s2c/34 as it enters moves the step on.
    // Only step 2 is from the log: steps 1 and 3 are made up, the s2c/13 into M10 is laid out as the portal samples.
    ['Đến step (Q19): to the map with the portal named after it, then into M10, moved on by s2c/34', [p(11, mapPacket('M25', 'Rìa Hồng Giang', WORLD[2][2])),
      p(43, mobsPacket('M25', [])), quest19(1), { start: true }, p(13, bytes(q['s2c/13 M4'])),
      p(11, mapPacket('M4', 'Hồng Giang', [[3, 'Bản đồ', 0], [1020, 'Cửu Phong', 0], [1024, 'Rìa Hồng Giang', 0], [143, 'Tiên phong Hồng Giang', 2]])), p(43, mobsPacket('M4', [])),
      { next: true }, p(13, new Writer().string('M10').i32(9).u8(0).u8(0xff).build()), p(11, mapPacket('M10', 'Cửu Phong', [[1016, 'Hồng Giang', 0]])),
      p(43, mobsPacket('M10', [])), p(34, new Writer().i32(0).string('subtask 2').i32(19).string('').build()), { next: true }]],
    ['Đến step: a map of the param that the atlas names otherwise stops it, nothing sent', [p(11, mapPacket('M25', 'Rìa Hồng Giang', WORLD[2][2])),
      quest(19, 'Thế Lực Tranh Hùng', 0, 0, [['Đến Cửu Phong', 1, 1, -1]]), { start: true }], scanAtlas()],
    ['skill step: a level of the first skill that can take one, then the reply', [p(9, bytes(fixtures.profile['s2c/9 level 21'])), skills, at('M1'), quest3(3),
      { start: true, once: true }, p(10, bytes(fixtures['skills-items']['s2c/10 kind 32'])), p(1191, bytes(fixtures['skills-items']['s2c/1191'])),
      p(34, new Writer().i32(0).string('subtask 1').i32(3).string('').build()), { next: true }]],
    ['stats auto: the main stat of the element, one c2s/10 per s2c/10 kind 8, a point kept for the stat step ahead', [p(9, bytes(fixtures.profile['s2c/9 field01 4'])), at('M1'), quest3(1),
      { start: true, stats: 'auto' }, pointsLeft(3), { next: true }, pointsLeft(2), { next: true }, pointsLeft(1), { next: true },
      p(34, new Writer().i32(0).string('subtask 1').i32(3).string('').build()), { next: true }]],
    ['stats by weight: the stat furthest behind its weight, the lower index on a tie', [pointsLeft(3), at('M1'), quest3(5), { start: true, stats: [1, 0, 1, 0] },
      pointsLeft(2), { next: true }, pointsLeft(1), { next: true }, pointsLeft(0), { next: true }]],
    // A2: Hỏa Cầu Thuật 1 learnt before the step and nothing that can take a level: the server counts it (20/11).
    ['skill step: a skill learnt before moves past it without sending c2s/1191', [p(9, bytes(response(6, 9))), skills, at('M1'), quest3(3), { start: true }]],
    ['a new quest after the report goes on with its first step', [at('M1'), p(11, mapPacket('M1', 'Làng Thanh Khê', WORLD[0][2])), p(43, mobsPacket('M1', [['mob2806', 'Heo Mọi', 7]])),
      quest(3, 'Những Việc Đầu Tiên', 0, 0, [['Báo cáo với Thành Chủ Nguyễn Khang', 129, 1, 129]]), { start: true }, p(35, bytes(q['s2c/35'])),
      p(34, new Writer().i32(0).string('subtask 1').i32(4).string('').build()), p(39, bytes(q['s2c/39 quest4'])), { next: true }]],
    ['one step: the NPC reply ends it before the kill step', [at('M1'), p(43, mobsPacket('M1', [['mob10', 'Gà Điên', 7], ['mob2806', 'Heo Mọi', 7]])), p(39, bytes(q['s2c/39 quest4'])),
      { start: true, once: true }, p(34, bytes(q['s2c/34 dialogue'])), { next: true }]],
    ['one step: a kill count reached ends it before the report', [p(11, mapPacket('M2', m2[1], m2[2])), p(43, mobsPacket('M2', m2[3])), quest9(3, 15), { start: true, once: true }]],
    // Quest 17 (Q17): "Đánh bại Tiên phong Hồng Giang" has npcId 143, so the bot talks to the NPC instead of looking for a
    // mob of that name; Đồng ý in its dialog, c2s/1181 for the mob of s2c/1180, and the s2c/34 after the battle moves the
    // step (the battle itself is left out, as in every replay).
    ['an NPC to defeat: its dialog, Đồng ý, the duel of s2c/1180, then s2c/34', [p(11, mapPacket('M4', 'Hồng Giang', [[1024, 'Rìa Hồng Giang', 0], [143, 'Tiên phong Hồng Giang', 2]])),
      p(43, mobsPacket('M4', [['mob132600', 'Huyết Lang', 40]])), p(39, bytes(q17Packets['s2c/39 quest17'])), { start: true, once: true },
      p(57, bytes(q17Packets['s2c/57 Tiên phong'])), p(1180, bytes(q17Packets['s2c/1180 Tiên phong'])), p(34, bytes(q17Packets['s2c/34 thắng Tiên phong'])), { next: true }]],
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
      else if ('start' in e) { bot.options.once = e.once; bot.options.stats = e.stats; bot.onReady(api as any); }
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
  const ctx: [number, Record<string, unknown>][] = [[1, {}], [1206, {}], [5, { serverId: 24 }], [9, { username: 'Manina' }], [30, {}], [30, { element: 4 }], [42, { characterName: 'manina' }],
    [29, { characterName: 'manina' }], [11, { mapId: 'M2' }], [43, { mapId: 'M2' }], [13, { mapId: 'M1', npcId: 1015 }], [15, { mobId: 'mob61000' }],
    [1178, { mobId: 'mob89100002' }], [18, { battleUuid }], [14, { battleUuid, seq: 4 }], [19, { battleUuid, seq: 3, move }], [20, { battleUuid, seq: 7, skill: 1000 }],
    [10, { stat: 0, amount: 1 }], [1191, { skillId: 1000, amount: 1 }],
    // Khu vực (B2, Z1): the list, the zone picked, then the map of that zone.
    [1172, {}], [1173, { zone: 20 }], [11, { mapId: 'M1', zone: 20 }],
    // Item actions of P4: Cởi ra the pet, Trang bị it again from bag slot 39, Sử dụng bag slot 3, Sửa chữa gear slot 2.
    [1186, { action: 1, slot: 5 }], [1186, { action: 0, slot: 39 }], [84, { slot: 3 }], [48, { slot: 2 }], [48, { where: 0, slot: 0 }],
    // Vứt bỏ the Đá cấp 2 of bag slot 4 (K3), Sắp xếp (I1).
    [1186, { action: 2, slot: 4 }], [1257, {}],
    // Nhặt the Xu khóa of 's2c/1182 gold' (G2).
    [1188, { uuid: 'f573bf90-942b-48d1-b466-4552dfa4f7cb' }],
    // Đồng ý in Võ Quan Đinh Mộc's dialog, then the game's challenge of the duel's mob (N1, N3).
    [57, { option: 0, mapId: 'M2', npcId: 141 }], [1181, { mobId: 'mob880', npcId: 141 }]];
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

type Tree = { id: number; name: string; levels: { level: number; description: string; mana: number }[] }[];

/** What the Rust app plays since the v3 port (07-auto-battle.md#thuật-toán-v2, #chọn-hành-động): skillEffect on every
 * level of the three trees of data/skills.json, Math.exp as the mob's odds use it, mobMoveOdds, answerValue, bestMove with
 * win and farm, castSkill, destroyPatterns on a fixed generator, and bestAction on the replayed positions with sides,
 * skills, potions and buffs varied by position, plus the cases of test/battle-actions.test.ts; then the heal and potion
 * packets, the mob block of s2c/22 and c2s/44. Math.exp itself is checked by a unit test of battle.rs. */
function battleV3() {
  const trees = JSON.parse(readFileSync(new URL('../../data/skills.json', import.meta.url), 'utf8')).trees as Record<string, Tree>;
  const every = Object.values(trees).flat();
  const effect = (id: number, level: number) => {
    const k = every.find(x => x.id === id)!, l = k.levels[level - 1];
    return skillEffect(id, level, l.description, l.mana, k.name);
  };
  // What depends on Math.exp (the mob's odds of win and farm) is rounded: V8 on x86 (CI) computes it without the FMA of
  // arm64, a last bit apart, and the file must come out the same on both. HP to 1e-6, odds to 1e-9.
  const hp = (x: number) => Number(x.toFixed(6)), odd = (x: number) => Number(x.toFixed(9));
  const finite = (f: Fighter) => ({ ...f, hp: Number.isFinite(f.hp) ? f.hp : null, maxHp: Number.isFinite(f.maxHp) ? f.maxHp : null });
  const positions = battles().flatMap(b => [b.board, ...b.steps.map(s => s.board)]) as Board[];
  const timed = (s: Strategy): Strategy => ({ ...s, reply: 0, extraTurn: 0, lookahead: 0, timed: true });
  const strategies: Strategy[] = [STRATEGIES.win, STRATEGIES.farm, timed(STRATEGIES.win), { ...STRATEGIES.win, lookahead: 0.5 }, STRATEGIES.kill, STRATEGIES.exp, { ...STRATEGIES.farm, reply: 0.5 }];
  // Both sides by position: own HP, nội lực and power across their range, the mob near death, full or unknown.
  const side = (i: number) => {
    const me = fighter(20 + (i * 41) % 160, 180, { s1: [0, 24, 25, 30, 49, 50, 60, 75, 80, 100][i % 10], s2: i % 7 === 0 ? 100 : (i * 13) % 100,
      sword: [8, 25 / 3, 10.4, 12][i % 4], heart: [5.45, 3.33][i % 2], yinyang: [2, 2.3][i % 2], peach: [4.4, 5][i % 2], skillCost: 25, skillDamage: 59 });
    const mob = i % 6 === 5 ? { ...unknownMob(), s1: 30, skillCost: 25, skillDamage: 43 }
      : fighter([30, 65, 120, 202, 249][i % 5], 249, { sword: [3.33, 10.9, 12][i % 3], heart: 6.2, yinyang: 3.45, peach: 5, s1: [0, 30, 25, 10][i % 4], s2: (i * 29) % 100, skillCost: 25, skillDamage: [43, 59][i % 2] });
    return { me, mob };
  };
  const lcg = (seed: number) => { let x = seed; return () => (x = (x * 16807) % 2147483647) / 2147483647; };

  const effects = every.flatMap(k => k.levels.map(l => skillEffect(k.id, l.level, l.description, l.mana, k.name)));
  const odds = positions.filter((_, i) => i % 6 === 0).map(board => ({ board, moves: mobMoveOdds(board).map(m => ({ move: m.move, p: odd(m.p), cleared: m.outcome.cleared, extraTurn: m.outcome.extraTurn })) }));
  const answers = positions.map((board, i) => {
    const { me, mob } = side(i);
    return { board, me: finite(me), mob: finite(mob), best: hp(answerValue(board, mob, me, STRATEGIES.kill)), odds: hp(answerValue(board, mob, me, STRATEGIES.win)) };
  });
  const moves = positions.map((board, i) => {
    const { me, mob } = side(i), strategy = strategies[i % strategies.length], p = bestMove(board, me, mob, strategy);
    return { board, me: finite(me), mob: finite(mob), strategy, move: p && p.move, score: p && hp(p.score) };
  });
  const casts = positions.filter((_, i) => i % 2 === 0).map((board, i) => {
    const { me, mob } = side(i * 2), strategy = strategies[i % strategies.length], p = bestMove(board, me, mob, strategy);
    return { board, me: finite(me), mob: finite(mob), strategy, cases: [p?.score ?? null, null, 0, 40, 1e4, -50].map(x => [x, castSkill(board, me, mob, strategy, x)]) };
  });
  const patterns = every.flatMap(k => [1, 20].map(level => ({ id: k.id, level, seed: k.id + level, patterns: destroyPatterns(effect(k.id, level), lcg(k.id + level), 3) })));
  const learnt = ([['4', [[4000, 2], [4001, 1], [4002, 0]]], ['1', [[1000, 4], [1001, 1], [1003, 25], [1004, -1]]]] as [string, [number, number][]][])
    .map(([element, levels]) => ({ element, levels, skills: learntSkills(trees[element], new Map(levels)).map(e => [e.id, e.level, e.kind, e.cost]) }));
  const priors = [[32, 21], [23, 16], [0, 1], [50, 33]].map(([attack, level]) => [attack, level, swordPrior(attack, level)]);
  const worths = [[[4001, 1]], [[4001, 1], [4000, 2]], [[1000, 4], [1003, 1], [1004, 1]], [[1002, 1]]].map(set => ({ sword: 8, skills: set, worth: skillWorth(8, set.map(([id, l]) => effect(id, l))) }));

  // bestAction: every replayed position with one set of learnt skills, then the decisions of test/battle-actions.test.ts.
  type Case = { name?: string; board: Board; me: Fighter; mob: Fighter; strategy: Strategy; skills: [number, number][]; potions?: Potion[]; potionCost?: number; spend?: number; buffs?: Partial<Record<'attack' | 'defense' | 'dodge', number>> };
  const sets: [number, number][][] = [[[4000, 2], [4001, 1]], [[1000, 4], [1001, 1]], [[1002, 1], [1000, 1]], [[2000, 1], [2001, 1], [2002, 1]], [[2004, 1], [2005, 1], [2006, 1]],
    [[1008, 1], [4002, 1], [4006, 1]], [[2008, 1], [4008, 1], [1007, 1], [2007, 1]], [[1003, 1], [1005, 1], [4003, 1], [4004, 1], [1004, 3]], [[4000, 20], [4001, 20], [1001, 20], [2008, 20]]];
  const potionSets: Potion[][] = [[], [{ slot: 0, itemId: 0, quantity: 4 }, { slot: 7, itemId: 1, quantity: 1 }], [{ slot: 4, itemId: 0, quantity: 0 }, { slot: 9, itemId: 7, quantity: 3 }, { slot: 5, itemId: 1, quantity: 2 }]];
  const cases: Case[] = positions.map((board, i) => {
    const { me, mob } = side(i);
    return { board, me, mob, strategy: strategies[i % strategies.length], skills: sets[i % sets.length], potions: potionSets[i % 3], potionCost: [300, 0, undefined, 40][i % 4],
      spend: i % 9 === 4 ? 0.5 : undefined, buffs: i % 5 === 2 ? { attack: 2 } : i % 5 === 4 ? { defense: 1 } : undefined };
  });
  const two = Array<number>(N * N).fill(UNKNOWN);
  for (const [r, c, v] of [[0, 0, 4], [0, 1, 4], [0, 2, 2], [1, 2, 4], [5, 0, 0], [5, 1, 0], [5, 2, 1], [6, 2, 0]]) two[r * N + c] = v;
  const tiheo2 = (hp: number, s1: number, sword = 8) => fighter(hp, 150, { s1, sword, heart: 3.33, yinyang: 2.3, peach: 5 });
  const chiHuy = (hp: number) => fighter(hp, 202, { s1: 30, sword: 3.33, skillCost: 25, skillDamage: 43 });
  const thuy: [number, number][] = [[4000, 2], [4001, 1]], potion: Potion[] = [{ slot: 8, itemId: 0, quantity: 1 }];
  for (const [name, me, mobHp, extra] of [['heal when the mob could end it', tiheo2(40, 50), 200, {}], ['swap at 60 HP', tiheo2(60, 50), 200, {}], ['cast at 80 nội lực', tiheo2(60, 80), 200, {}],
    ['nothing charged', tiheo2(60, 50), 200, { spend: 0 }], ['the skill likely kills', tiheo2(150, 25), 30, {}], ['no nội lực', tiheo2(150, 24), 30, {}],
    ['no potion cost', tiheo2(40, 0), 200, { potions: potion }], ['a potion at 300', tiheo2(40, 0), 200, { potions: potion, potionCost: 300 }], ['no threat', tiheo2(100, 0), 200, { potions: potion, potionCost: 300 }],
    ['heal charged at 60', tiheo2(100, 60), 200, {}], ['heal free at 80', tiheo2(100, 80), 200, {}], ['timed heal', tiheo2(100, 60), 200, { strategy: timed(STRATEGIES.win) }],
    ['a buff that keeps the turn', tiheo2(150, 75, 12), 200, { skills: [[1002, 1]] }], ['the buff lasts', tiheo2(150, 75, 12), 200, { skills: [[1002, 1]], buffs: { attack: 2 } }],
    ['hoàn linh at its max HP', tiheo2(40, 0), 200, { potions: [{ ...potion[0], costShare: 1 }], potionCost: 0 }], ['no threat at its max HP', tiheo2(100, 0), 200, { potions: [{ ...potion[0], costShare: 1 }] }],
    ['kim đan at a share', tiheo2(150, 0), 200, { potions: [{ slot: 9, itemId: 1, quantity: 2, costShare: 0.17 }] }],
    ['no potion when timed', tiheo2(40, 0), 200, { potions: [{ ...potion[0], costShare: 1 }, { slot: 9, itemId: 1, quantity: 2, costShare: 0.17 }], potionCost: -1e9, strategy: timed(STRATEGIES.win) }]] as [string, Fighter, number, Partial<Case>][])
    cases.push({ name, board: two, me, mob: chiHuy(mobHp), strategy: STRATEGIES.win, skills: thuy, ...extra });
  // ×40 (6000 max HP) at 15%: the cost share is capped at what the potion gives plus POTION_MARGIN.
  const x40 = fighter(900, 6000, { s1: 0, sword: 320, heart: 133.2, yinyang: 2.3, peach: 5 }), mob40 = fighter(8000, 8080, { s1: 30, sword: 133.2, skillCost: 25, skillDamage: 1720 });
  for (const [name, hp] of [['hoàn linh at 6000 max HP', 900], ['hoàn linh at 6000 max HP, 80%', 4800]] as [string, number][])
    cases.push({ name, board: two, me: { ...x40, hp }, mob: mob40, strategy: STRATEGIES.win, skills: thuy, potions: [{ ...potion[0], costShare: 1 }] });
  const actions = cases.map(c => {
    const skills = c.skills.map(([id, l]) => effect(id, l)), me = { ...c.me, ...skillWorth(c.me.sword, skills) };
    const { all } = bestAction(c.board, me, c.mob, c.strategy, { skills, potions: c.potions, potionCost: c.potionCost, spend: c.spend, buffs: c.buffs });
    return { name: c.name ?? null, board: c.board, me: finite(me), mob: finite(c.mob), strategy: c.strategy, skills: c.skills, potions: c.potions ?? [], potionCost: c.potionCost ?? null,
      spend: c.spend ?? null, buffs: c.buffs ?? null, all: all.map(a => ({ label: a.label, action: a.action, score: hp(a.score) })) };
  });

  // A proper mob block behind a decoy without its length prefix; the s2c/20 of Hàn Lưu Thánh Thủy and the s2c/44 of P5.
  const block = new Writer().u8(1).string('xmob61000').string('mob61000').string('Cóc Xanh').u8(0).u8(1).u8(2).i32(13).i32(100050).u8(0).i32(201).i32(249).string('tail').build();
  const heal = '0000000700000000c85e76ba00000fa100000000000000000000000000000000000000000100000008547475616e616e68ffffffff000000002200000000ffffffff0000000100000008547475616e616e6800';
  const item = '0000000100000000fafab599000000000000000400000000000000000100000008547475616e616e68ffffffff0000000043ffffffffffffffff0000000100000008547475616e616e6800';
  const battleUuid = 'f88a4c00-bcb7-49bf-8a30-93e3dbbff9ca';
  return {
    effects, odds, answers, moves, casts, patterns, learnt, priors, worths, actions,
    mobBlocks: ([[block, 'mob61000'], [block, 'mob99'], [setupPacket, 'mob61000']] as [Uint8Array, string][]).map(([p, id]) => ({ hex: hex(p), id, expected: mobBlock(p, id) ?? null })),
    healResult: { hex: heal, expected: battleResult(new Reader(bytes(heal)), 20) },
    fireCasts: fireCastCases(),
    itemResult: { hex: item, expected: battleItemResult(new Reader(bytes(item))) },
    request44: { ctx: { battleUuid, slot: 4 }, hex: hex(buildRequest(44, { battleUuid, slot: 4 })) },
  };
}

/** Hỏa Kiếm Thuật (test/fixtures-fire.ts): applyResult on the board before each cast with the skill's effect known
 * (Kiếm lửa), unknown, and taken as destroying, then on the three results after it: the board and outcome after each. */
function fireCastCases() {
  return fireCasts.map(f => {
    const play = (fire?: boolean) => {
      const b = f.board.slice();
      return [f.cast, ...f.next].map((h, i) => {
        const o = applyResult(b, battleResult(new Reader(bytes(h)), i ? 19 : 20), i ? undefined : fire);
        return { board: b.slice(), fire: o.fire, desync: o.desync, cleared: o.cleared, waves: o.waves, refillUsed: o.refillUsed };
      });
    };
    return { source: f.source, board: f.board, cast: f.cast, next: f.next, known: play(true), unknown: play(undefined), destroyed: play(false) };
  });
}

/** Indented JSON with every innermost array or object on one line (a board, a unit), as atlasJson does. */
const oneLineInner = (v: unknown) => JSON.stringify(v, null, 1).replace(/[[{][^[\]{}]*[\]}]/g, s => s.replace(/\s*\n\s*/g, ' ')) + '\n';

export function rustExports(): Record<string, string> {
  const opcodes = `// Generated by \`npm run export:rust\` from src/protocol/config.ts. Do not edit; change the TypeScript side and export again.
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
    password: fixtures['password-vectors'].vectors, // Cut with protocol 0.0.2 (APK 1.0.3); written with the version the bot declares, as test/protocol.test.ts checks them.
    login: fixtures['login-vectors'].vectors.map((v: { data: string }) => ({ ...v, data: v.data.replace('00000005302e302e32', hex(new Writer().string(PROTOCOL_VERSION).build())) })),
    decoders: decoders(), zone: zone(), requests: requests(), battles: battles(), bestMoves: bestMoves(),
    stepActions: stepActions(), atlas: atlasCases(), questReplays: questReplays(),
    battleV3: battleV3(), npc: npcCases(), gift: giftCases(), mail: mailCases(), daily: dailyCases(), market: marketCases(), welfare: welfareCases(),
  };
  return { 'app/core/src/opcodes.rs': opcodes, 'app/core/tests/vectors.json': oneLineInner(vectors) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  for (const [path, content] of Object.entries(rustExports())) { writeFileSync(join(root, path), content); console.log(`wrote ${path} (${content.length} bytes)`); }
}
