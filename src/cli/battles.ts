import { existsSync, writeFileSync } from 'node:fs';
import { battlesIn, battlesInDb, replay, type RecordedBattle } from '../battle/battle-data.ts';

// The recorded battles (07-auto-battle.md#ghi-trận): captures/battles (battle files of the TS bot and older traces) and
// the battle_data table of app/cllt.db. Prints a table by mob and by source with the result of a replay of each battle;
// a battle that replays with a desync lacks a packet. --dir=<folder> and --db=<file> read elsewhere, --db=none skips the
// database; --export=<file> writes one JSON line per battle (header, end, notes, the replayed moves) for training.
const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const dir = arg('dir') ?? 'captures/battles', dbFile = arg('db') ?? 'app/cllt.db', exportFile = arg('export');

const battles: RecordedBattle[] = [...(existsSync(dir) ? battlesIn(dir) : []), ...(dbFile !== 'none' && existsSync(dbFile) ? await battlesInDb(dbFile) : [])];
type Row = { battles: number; won: number; lost: number; other: number; moves: number; desync: number; unread: number };
const rows = new Map<string, Row>(), kinds = new Map<string, Row>(), lines: string[] = [];
const add = (map: Map<string, Row>, key: string) => map.get(key) ?? map.set(key, { battles: 0, won: 0, lost: 0, other: 0, moves: 0, desync: 0, unread: 0 }).get(key)!;
for (const b of battles) {
  const r = (() => { try { return replay(b); } catch { return undefined; } })();
  const won = b.end ? (b.end.won === undefined ? undefined : !!b.end.won) : r?.won;
  const mob = b.header.mob, source = b.header.legacy ? 'trace' : b.source.startsWith('cllt.db:') ? 'app' : String(b.header.bot ?? 'file');
  const key = `${mob?.name ?? '?'} ${mob?.level ?? ''}`.trim(), kind = `${source} ${b.header.play?.strategy ? JSON.stringify(b.header.play.strategy) : b.header.goal ?? ''}`.trim();
  for (const row of [add(rows, key), add(kinds, kind)]) {
    row.battles++;
    if (won === true) row.won++; else if (won === false) row.lost++; else row.other++;
    if (r) { row.moves += r.moves.length; if (r.desyncs) row.desync++; } else row.unread++;
  }
  if (exportFile) lines.push(JSON.stringify({ source: b.source, header: b.header, end: b.end ?? (r && { won: r.won }), notes: b.notes, moves: r?.moves }));
}
const table = (map: Map<string, Row>) => Object.fromEntries([...map].sort((a, b) => b[1].battles - a[1].battles)
  .map(([k, v]) => [k || '?', { ...v, 'win %': v.won + v.lost ? Math.round(100 * v.won / (v.won + v.lost)) : '', 'moves/battle': v.battles - v.unread ? Math.round(v.moves / (v.battles - v.unread)) : '' }]));
console.log(`${battles.length} battles from ${dir}${dbFile !== 'none' && existsSync(dbFile) ? ` and ${dbFile}` : ''}`);
console.table(table(rows));
console.table(table(kinds));
if (exportFile) { writeFileSync(exportFile, lines.join('\n') + '\n'); console.log(`wrote ${lines.length} battles to ${exportFile}`); }
