// Keeps every battle in a file for later study of the battle algorithm (07-auto-battle.md#ghi-trận):
// <dir>/<yyyy-mm-dd>/<hhmmss>-<character>-<mob>.jsonl.gz, the gzip of JSON lines:
// - first { kind: 'header', … }: what the bot knew before the battle, both sides and its own settings (QuestBot.onSetup);
// - then each packet of the battle as [ms since s2c/22, "s2c/19", hex], and between them the bot's notes as
//   { ms, note, … }: the actions weighed on each own turn and their scores, skills tried, desyncs, the estimates at the end;
// - last { kind: 'end', … }: the result. The file is written once s2c/1214 follows the end (500 ms at most), so the s2c/10
//   of the reward and the s2c/36 of the durability are in.
// Only the opcodes of BATTLE_OPCODES are kept: no login, no chat, no other players. About 4.4 KB a battle (H1: 33.5 KB of
// JSON lines before gzip).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { gzipSync } from 'node:zlib';

export const RECORD_FORMAT = 1;

/** The packets of a battle (05-battle.md): setup, join, turns, moves, skills, items, surrender, then the reward (s2c/10),
 * the kill count (s2c/1201), the durability (s2c/36) and the end (s2c/1214). */
export const BATTLE_OPCODES = new Set(['s2c/22', 'c2s/18', 's2c/18', 'c2s/14', 's2c/24', 'c2s/19', 's2c/19', 's2c/20', 's2c/21',
  'c2s/20', 'c2s/44', 's2c/44', 'c2s/11', 'c2s/40', 's2c/10', 's2c/1201', 's2c/36', 's2c/1214']);

export type RecordSaved = { file: string; lines: number } | { file: string; error: string };

/** A name for files: no diacritics, lower case, words joined by "-" ("Kẻ Quấy Phá" → "ke-quay-pha"). */
export const fileSlug = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x';

const json = (value: unknown) => JSON.stringify(value, (_, v) => v === Infinity ? null : v);
const pad = (n: number) => String(n).padStart(2, '0');

export class BattleRecorder {
  private lines: string[] = []; private started = 0; private file = '';
  private ending?: ReturnType<typeof setTimeout>;
  readonly dir: string; private saved?: (result: RecordSaved) => void;
  constructor(dir: string, saved?: (result: RecordSaved) => void) { this.dir = dir; this.saved = saved; }
  get recording() { return this.lines.length > 0; }

  /** A new battle; one still open (a late s2c/22) is saved as it is, without its end. */
  start(name: string, header: Record<string, unknown>) {
    if (this.recording) this.save();
    const now = new Date();
    this.started = now.getTime();
    this.file = join(this.dir, `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
      `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}-${fileSlug(name)}.jsonl.gz`);
    this.lines = [json({ kind: 'header', format: RECORD_FORMAT, at: now.toISOString(), ...header })];
  }

  packet(direction: 'c2s' | 's2c', opcode: number, payload: Uint8Array) {
    const op = `${direction}/${opcode}`;
    if (!this.recording || !BATTLE_OPCODES.has(op)) return;
    this.lines.push(json([Date.now() - this.started, op, Buffer.from(payload).toString('hex')]));
    if (this.ending && op === 's2c/1214') this.save();
  }

  note(note: string, fields: Record<string, unknown> = {}) {
    if (this.recording) this.lines.push(json({ ms: Date.now() - this.started, note, ...fields }));
  }

  /** The result; the file follows with s2c/1214, or 500 ms later (the packets after an end come within 1 ms in H1). */
  end(result: Record<string, unknown>) {
    if (!this.recording || this.ending) return;
    this.lines.push(json({ kind: 'end', ms: Date.now() - this.started, ...result }));
    this.ending = setTimeout(() => this.save(), 500);
  }

  save() {
    clearTimeout(this.ending); this.ending = undefined;
    if (!this.recording) return;
    const lines = this.lines;
    this.lines = [];
    // Two battles opened in the same second (a late s2c/22): the second gets "-2".
    let file = this.file;
    for (let n = 2; existsSync(file); n++) file = this.file.replace(/\.jsonl\.gz$/, `-${n}.jsonl.gz`);
    try {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, gzipSync(lines.join('\n') + '\n'));
      this.saved?.({ file, lines: lines.length });
    } catch (error) { this.saved?.({ file, error: (error as Error).message }); }
  }
}
