// Reads recorded battles back for study (07-auto-battle.md#ghi-trận): the battle files of battle-record.ts (the TS bot,
// and the battle_data rows of the app's cllt.db, same lines), and the older CLLT_TRACE files, cut into battles from
// s2c/22 to s2c/1214. replay() plays each one on the board of battle.ts as BattleRunner does, so a battle whose packets
// are all there replays without a desync.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { Reader, characterPrefix, characterProfile } from '../protocol/protocol.ts';
import { ITEM_ELEMENTS } from '../protocol/items.ts';
import { EMPTY, UNKNOWN, battleSetup, battleResult, battleItemResult, timeoutResult, findRuns, mobBlock, settle, swap } from './battle.ts';

export interface RecordedPacket { ms: number; op: string; payload: Buffer }
export interface RecordedBattle {
  /** Where it was read: the file (with "#n" for the n-th battle of a trace) or "cllt.db:<username>". */
  source: string;
  header: Record<string, any>;
  packets: RecordedPacket[];
  notes: Record<string, any>[];
  end?: Record<string, any>;
  /** A trace written with short hex: its packets cannot be replayed. */
  truncated?: boolean;
}

/** The lines of a battle file (gzip or not) as a battle. */
export function parseRecord(data: Buffer, source: string): RecordedBattle {
  const text = (data[0] === 0x1f && data[1] === 0x8b ? gunzipSync(data) : data).toString('utf8');
  const b: RecordedBattle = { source, header: {}, packets: [], notes: [] };
  for (const line of text.split('\n')) {
    if (!line) continue;
    const x = JSON.parse(line);
    if (Array.isArray(x)) b.packets.push({ ms: x[0], op: x[1], payload: Buffer.from(x[2], 'hex') });
    else if (x.kind === 'header') b.header = x;
    else if (x.kind === 'end') b.end = x;
    else b.notes.push(x);
  }
  return b;
}

/** The length-prefixed mob id ("mob61000") of an s2c/22. */
function mobIdOf(payload: Buffer) {
  const mob = Buffer.from('mob');
  for (let i = payload.indexOf(mob); i >= 4; i = payload.indexOf(mob, i + 1)) {
    const n = payload.readInt32BE(i - 4), id = payload.subarray(i, i + n).toString();
    if (n >= 4 && n <= 24 && /^mob\d+$/.test(id)) return id;
  }
}

/** The battles of a CLLT_TRACE file: from each s2c/22 to its s2c/1214 (or the next s2c/22), with a header from the last
 * s2c/9 before it and the mob block of the s2c/22. */
export function traceBattles(text: string, source: string): RecordedBattle[] {
  const battles: RecordedBattle[] = [];
  let open: RecordedBattle | undefined, start = 0, character: Record<string, unknown> = {};
  for (const line of text.split('\n')) {
    if (!line.includes('"payloadHex"')) continue;
    let e: any; try { e = JSON.parse(line); } catch { continue; }
    if (e.kind !== 'send' && e.kind !== 'receive') continue;
    const op = `${e.direction}/${e.opcode}`, payload = Buffer.from(e.payloadHex ?? '', 'hex');
    if (op === 's2c/9' && !e.hexTruncated) {
      try {
        const c = characterPrefix(payload), p = characterProfile(payload);
        character = { character: c.name, level: c.level, element: c.field01, elementName: ITEM_ELEMENTS[c.field01], combat: p.combat, potentials: p.stats };
      } catch { /* a profile this decoder does not read */ }
    }
    if (op === 's2c/22') {
      if (open) battles.push(open);
      const id = mobIdOf(payload), mob = id ? mobBlock(payload, id) : undefined;
      open = { source: `${source}#${battles.length + 1}`, header: { kind: 'header', legacy: true, ...character,
        mob: { id, name: mob?.name, level: mob?.level, element: mob?.element, elementName: mob && ITEM_ELEMENTS[mob.element], hp: mob?.hp, maxHp: mob?.maxHp } }, packets: [], notes: [] };
      start = e.elapsedMs;
    }
    if (!open) continue;
    if (e.hexTruncated) open.truncated = true;
    open.packets.push({ ms: e.elapsedMs - start, op, payload });
    if (op === 's2c/1214') { battles.push(open); open = undefined; }
  }
  if (open) battles.push(open);
  return battles;
}

/** Every battle under `dir`: battle files (first line a header) and traces, *.jsonl or *.jsonl.gz, in name order. */
export function battlesIn(dir: string): RecordedBattle[] {
  const out: RecordedBattle[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const path = join(d, name);
      if (statSync(path).isDirectory()) { walk(path); continue; }
      if (!/\.jsonl(\.gz)?$/.test(name)) continue;
      const raw = readFileSync(path), data = raw[0] === 0x1f && raw[1] === 0x8b ? gunzipSync(raw) : raw;
      const first = data.subarray(0, data.indexOf(10) < 0 ? data.length : data.indexOf(10)).toString('utf8');
      if ((() => { try { return JSON.parse(first).kind === 'header'; } catch { return false; } })()) out.push(parseRecord(data, path));
      else out.push(...traceBattles(data.toString('utf8'), path));
    }
  };
  walk(dir);
  return out;
}

/** The battle_data rows of the app's cllt.db (store.rs), when the table is there. */
export async function battlesInDb(file: string): Promise<RecordedBattle[]> {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    if (!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'battle_data'").get()) return [];
    return db.prepare('SELECT username, packets FROM battle_data ORDER BY id').all()
      .map(r => parseRecord(Buffer.from(r.packets as Uint8Array), `cllt.db:${r.username}`));
  } finally { db.close(); }
}

/** One move of a replay: who, what it cleared, the unit lines of both sides, as BattleRunner reads them. */
export interface ReplayedMove {
  ms: number; seq: number; actor: 'me' | 'mob'; kind: 'swap' | 'skill' | 'item' | 'timer';
  move?: { from: number[]; to: number[] }; skill?: number; cleared: Record<number, number>; waves: number; extraTurn: boolean;
  units: [string, number, number, number, number][]; end: boolean; reward?: { won: boolean; exp: number; coin: number }; desync: boolean;
}

/** Plays the results of a battle on its s2c/22 board (BattleRunner.onResult): a move whose refill does not fill the
 * board exactly, or leaves a run, is a desync. Undefined without s2c/22 or with truncated hex. */
export function replay(b: RecordedBattle) {
  const setup = b.packets.find(p => p.op === 's2c/22');
  if (!setup || b.truncated) return undefined;
  const s = battleSetup(setup.payload);
  let board = [...s.board];
  const moves: ReplayedMove[] = [];
  for (const p of b.packets) {
    type Result = ReturnType<typeof timeoutResult> & Partial<Pick<ReturnType<typeof battleResult>, 'move' | 'skill' | 'newBoard'>>;
    let x: Result, kind: ReplayedMove['kind'];
    if (p.op === 's2c/19' || p.op === 's2c/20') { x = battleResult(new Reader(p.payload), p.op === 's2c/19' ? 19 : 20); kind = x.move ? 'swap' : 'skill'; }
    else if (p.op === 's2c/21') { x = timeoutResult(new Reader(p.payload)); kind = 'timer'; }
    else if (p.op === 's2c/44') { x = { ...battleItemResult(new Reader(p.payload)), cells: [] }; kind = 'item'; }
    else continue;
    if (x.move) swap(board, x.move);
    const o = settle(board, x.refill, x.cells);
    const desync = o.refillUsed !== x.refill.length || board.some(v => v === EMPTY || v === UNKNOWN) || findRuns(board).cells.size > 0;
    if (x.newBoard) board = [...x.newBoard];
    moves.push({ ms: p.ms, seq: x.seq, actor: x.actor === s.me ? 'me' : 'mob', kind, move: x.move, skill: x.skill,
      cleared: o.cleared, waves: o.waves, extraTurn: x.extraTurn, units: x.units.map(u => [u.name === s.me ? 'me' : 'mob', u.damage, u.hp, u.s1, u.s2]),
      end: x.end, reward: x.reward, desync });
  }
  const last = moves.at(-1);
  return { me: s.me, board: s.board, moves, desyncs: moves.filter(m => m.desync).length, won: last?.end ? last.reward?.won ?? last.actor === 'me' : undefined };
}
