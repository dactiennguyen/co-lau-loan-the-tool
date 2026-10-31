import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { BattleRecorder, fileSlug, RECORD_FORMAT, type RecordSaved } from '../src/bot/battle-record.ts';
import { parseRecord, replay, traceBattles } from '../src/battle/battle-data.ts';
import { Writer } from '../src/protocol/protocol.ts';

/** The JSON lines of a battle file. */
export const readRecord = (file: string) => gunzipSync(readFileSync(file)).toString('utf8').trimEnd().split('\n').map(l => JSON.parse(l));

const scratch = (t: { after(fn: () => void): void }) => {
  const dir = mkdtempSync(join(tmpdir(), 'cllt-record-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
};

test('fileSlug: no diacritics, lower case, words joined by "-"', () => {
  assert.deepEqual(['manina Kẻ Quấy Phá', 'Ttuananh Đá cấp 2', '  Sói   Xám! '].map(fileSlug), ['manina-ke-quay-pha', 'ttuananh-da-cap-2', 'soi-xam']);
});

test('battle file: header first, only the battle opcodes as [ms, op, hex], notes, the end, written on s2c/1214', t => {
  const dir = scratch(t), saved: RecordSaved[] = [];
  const r = new BattleRecorder(dir, x => saved.push(x));
  r.packet('s2c', 22, Buffer.from('00', 'hex')); // nothing before start
  r.start('manina Kẻ Quấy Phá', { character: 'manina', element: 1, elementName: 'Hỏa', mob: { name: 'Kẻ Quấy Phá', element: 1 }, potionCost: Infinity });
  r.packet('s2c', 22, Buffer.from('0102', 'hex'));
  r.packet('c2s', 18, Buffer.from('aa', 'hex'));
  r.packet('s2c', 1263, Buffer.from('bb', 'hex')); // other players: left out
  r.packet('c2s', 4, Buffer.from('cc', 'hex'));    // login: left out
  r.note('turn', { seq: 1, pick: 'swap', scores: [['swap', 12.5]] });
  r.packet('s2c', 19, Buffer.from('dd', 'hex'));
  r.end({ won: true, exp: 312 });
  r.end({ won: false }); // a second end changes nothing
  r.packet('s2c', 36, Buffer.from('ee', 'hex'));
  assert.equal(saved.length, 0, 'waits for s2c/1214');
  r.packet('s2c', 1214, Buffer.alloc(0));
  assert.equal(saved.length, 1);
  assert.ok(!('error' in saved[0]) && saved[0].lines === 8, JSON.stringify(saved[0]));
  const file = saved[0].file;
  assert.match(file, /\/\d{4}-\d\d-\d\d\/\d{6}-manina-ke-quay-pha\.jsonl\.gz$/);
  const lines = readRecord(file);
  assert.deepEqual({ ...lines[0], at: undefined }, { kind: 'header', format: RECORD_FORMAT, at: undefined, character: 'manina', element: 1, elementName: 'Hỏa', mob: { name: 'Kẻ Quấy Phá', element: 1 }, potionCost: null });
  assert.deepEqual(lines.slice(1).map(l => Array.isArray(l) ? `${l[1]} ${l[2]}` : l.note ?? l.kind),
    ['s2c/22 0102', 'c2s/18 aa', 'turn', 's2c/19 dd', 'end', 's2c/36 ee', 's2c/1214 ']);
  assert.ok(lines.slice(1).every(l => (Array.isArray(l) ? l[0] : l.ms) >= 0));
  assert.deepEqual({ ...lines[5], ms: 0 }, { kind: 'end', ms: 0, won: true, exp: 312 });
  r.packet('s2c', 19, Buffer.from('ff', 'hex'));
  assert.equal(r.recording, false, 'nothing kept between battles');
});

test('battle file: without s2c/1214 it is written 500 ms after the end; a new s2c/22 saves an open battle as it is', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] }); // one clock: every file of this test gets the same time
  const dir = scratch(t), saved: RecordSaved[] = [];
  const r = new BattleRecorder(dir, x => saved.push(x));
  r.start('a b', {});
  r.end({ cancelled: true });
  t.mock.timers.tick(499);
  assert.equal(saved.length, 0);
  t.mock.timers.tick(1);
  assert.equal(saved.length, 1);
  r.start('c d', {});
  r.packet('s2c', 24, Buffer.from('01', 'hex'));
  r.start('c d', {}); // a late s2c/22
  assert.equal(saved.length, 2);
  assert.deepEqual(readRecord(saved[1].file).map(l => l.kind ?? l[1]), ['header', 's2c/24']);
  r.end({ won: true });
  r.packet('s2c', 1214, Buffer.alloc(0));
  assert.deepEqual(saved.map(x => x.file.split('/').pop()), ['000000-a-b.jsonl.gz', '000000-c-d.jsonl.gz', '000000-c-d-2.jsonl.gz'].map(f => f.replace('000000', saved[0].file.split('/').pop()!.slice(0, 6))),
    'the same second and names: "-2", nothing overwritten');
  assert.equal(readdirSync(dir).length, 1, 'one folder for the day');
});

/** s2c/22 in the layout of 07-auto-battle.md#s2c22-641-byte: manina (Hỏa) against Cóc Xanh (Thủy), an empty board. */
const setup = () => {
  const head = new Writer().u8(1).u8(0).string('manina').string('manina').u8(0).u8(0).u8(1).i32(21).i32(0).u8(0).i32(150).i32(180)
    .string('mob61000').string('Cóc Xanh').u8(1).u8(0).u8(4).i32(13).i32(100000).u8(0).i32(249).i32(249)
    .string('3f1c2a9e-6b1d-4c55-9a27-0d3e4b5c6d7e').i32(64).build();
  return Buffer.concat([head, Buffer.alloc(64, 2), Buffer.from([30, 0])]);
};

test('reading back: a battle file parses into header, packets, notes and end; a trace is cut at s2c/22 and s2c/1214', t => {
  const dir = scratch(t), saved: RecordSaved[] = [];
  const r = new BattleRecorder(dir, x => saved.push(x));
  r.start('manina Cóc Xanh', { character: 'manina', mob: { name: 'Cóc Xanh' } });
  r.packet('s2c', 22, setup());
  r.note('turn', { seq: 1 });
  r.end({ won: true });
  r.packet('s2c', 1214, Buffer.alloc(0));
  const b = parseRecord(readFileSync(saved[0].file), 'file');
  assert.deepEqual([b.header.character, b.packets.map(p => p.op), b.notes.map(n => n.note), b.end?.won], ['manina', ['s2c/22', 's2c/1214'], ['turn'], true]);
  assert.deepEqual(replay(b), { me: 'manina', board: Array(64).fill(2), moves: [], desyncs: 0, won: undefined });

  const line = (kind: string, op: string, ms: number, payload: Buffer) => JSON.stringify({ kind, event: op, direction: op.slice(0, 3), opcode: Number(op.slice(4)), elapsedMs: ms, payloadHex: payload.toString('hex') });
  const trace = [line('receive', 's2c/1263', 0, Buffer.from('00', 'hex')), line('receive', 's2c/22', 10, setup()), line('send', 'c2s/18', 11, Buffer.from('aa', 'hex')),
    line('receive', 's2c/1214', 50, Buffer.alloc(0)), line('receive', 's2c/1', 60, Buffer.alloc(0)), line('receive', 's2c/22', 90, setup())].join('\n');
  const battles = traceBattles(trace, 'x.jsonl');
  assert.deepEqual(battles.map(x => [x.source, x.packets.map(p => `${p.ms} ${p.op}`)]), [['x.jsonl#1', ['0 s2c/22', '1 c2s/18', '40 s2c/1214']], ['x.jsonl#2', ['0 s2c/22']]]);
  assert.deepEqual(battles[0].header.mob, { id: 'mob61000', name: 'Cóc Xanh', level: 13, element: 4, elementName: 'Thủy', hp: 249, maxHp: 249 });
});
