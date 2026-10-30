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
import { mapData, mapGrid, mapChange, mapEntities, mapBoss, notice, characterStats, playersSnapshot, playerRecord, ZonePlayers } from './world.ts';
import { N, swap, settle, bestMove, fighter, unknownMob, battleSetup, battleJoinAck, turnState, battleResult, timeoutResult, STRATEGIES, type Fighter } from './battle.ts';
import { fixtures } from '../test/fixtures.ts';

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
  for (const h of [a2, fixtures.profile['s2c/9 level 21'] as string]) add('characterProfile', h, pick(characterProfile(bytes(h)), profileKeys));
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
  return cases;
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
    [1178, { mobId: 'mob89100002' }], [18, { battleUuid }], [14, { battleUuid, seq: 4 }], [19, { battleUuid, seq: 3, move }], [20, { battleUuid, seq: 7, skill: 1000 }]];
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
  };
  return { 'app/core/src/opcodes.rs': opcodes, 'app/core/tests/vectors.json': oneLineInner(vectors) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  for (const [path, content] of Object.entries(rustExports())) { writeFileSync(join(root, path), content); console.log(`wrote ${path} (${content.length} bytes)`); }
}
