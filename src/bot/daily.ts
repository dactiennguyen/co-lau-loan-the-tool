// Nhiệm vụ hàng ngày at Hương Lão (NPC 102 of M1) from the TS bot (docs/integration/nodejs/mail.md#nhiệm-vụ-ngày,
// docs/app/events/14-npc.md#nhiệm-vụ-hàng-ngày): the quest held (s2c/1195), and line 2 of his menu, whose line 0 is
// Nhận nhiệm vụ or Hủy nhiệm vụ hiện tại and runs at once. Hoàn thành nhiệm vụ is not measured yet (TODO).
import { buildRequest } from '../protocol/events.ts';
import { DAILY, dailyQuest, dailyTaken, dailyText, type DailyQuest } from '../protocol/mail.ts';
import { ELDER, NPC_MAP } from '../protocol/npc.ts';
import { notice, npcMenu } from '../protocol/world.ts';
import { Npc, Steps, Stop, serverText, sleep, type Io, type Log } from './steps.ts';

export type DailyTask = 'show' | 'accept' | 'cancel';
export type Outcome = 'done' | 'dry_run';
const AT = { mapId: NPC_MAP, npcId: ELDER };

export interface DailyOptions {
  /** Nhận or Hủy; without it the bot only reads. */
  confirm?: boolean;
  waitMs?: number;
  /** After s2c/1195, how long its notice gets (default 400 ms). */
  settleMs?: number;
  log?: Log;
}

/** The quest as the Phụ tab of the game shows it. */
export const dailyView = (q: DailyQuest | null | undefined) => (q ? { id: q.id, name: q.name, text: dailyText(q), progress: q.progress, target: q.target } : q);

export class DailyBot {
  /** The daily quest held: null when none, undefined before the first s2c/1195 (it comes at login). */
  quest: DailyQuest | null | undefined;
  private readonly steps: Steps;
  private readonly npc: Npc;
  private readonly confirm: boolean;
  private readonly settleMs: number;
  private readonly log: Log;
  private notices: string[] = [];

  constructor(options: DailyOptions = {}) {
    this.confirm = options.confirm ?? false;
    this.settleMs = options.settleMs ?? 400;
    this.log = options.log ?? (() => {});
    this.steps = new Steps(options.waitMs ?? 8000);
    this.npc = new Npc(this.steps, AT, 'Hương Lão', this.log);
  }

  onPacket(op: number, payload: Buffer) {
    try {
      if (op === 1195) { this.quest = dailyQuest(payload).quest; this.log({ event: 'daily_quest', quest: dailyView(this.quest) }); }
      else if (op === 1256) { const text = notice(payload).text; this.notices.push(text); this.log({ event: 'notice', text }); }
      else if (op === 0) this.log({ event: 'server_message', text: serverText(payload) });
    } catch (error) {
      this.log({ event: 'parse_error', opcode: op, reason: (error as Error).message, payloadHex: payload.toString('hex') });
    }
    this.steps.take(op, payload);
  }

  /** `mapId` is where the character stands: Hương Lão answers in M1 only. */
  async run(task: DailyTask, io: Io, mapId: string | undefined): Promise<Outcome> {
    this.steps.io = io;
    if (mapId !== NPC_MAP) {
      if (task === 'show') { this.log({ event: 'menu', text: `nhân vật đang ở ${mapId}: menu của Hương Lão chỉ mở được ở ${NPC_MAP}` }); return 'done'; }
      throw new Stop(`nhân vật đang ở ${mapId}; Hương Lão chỉ trả lời ở ${NPC_MAP} (Làng Thanh Khê)`);
    }
    let opened = false;
    try {
      const root = await this.npc.talk();
      opened = true;
      const menu = npcMenu((await this.npc.pick(root, [DAILY.path, /^Nhiệm vụ hàng ngày$/], [57])).payload);
      const count = dailyTaken(menu.text), line = menu.options.find(o => o.option === 0);
      this.log({ event: 'menu', text: menu.text, taken: count?.taken, max: count?.max, line: line?.label, quest: dailyView(this.quest) });
      if (task === 'show') return 'done';
      if (line && DAILY.complete.test(line.label)) throw new Stop(`menu có dòng "${line.label}": Hoàn thành nhiệm vụ chưa đo nên bot không bấm (TODO)`);
      const want = task === 'accept' ? DAILY.accept : DAILY.cancel;
      if (!line || !want.test(line.label)) {
        throw new Stop(task === 'accept'
          ? `không nhận được: dòng 0 là "${line?.label ?? 'không có'}"${this.quest ? ` (đang giữ ${this.quest.name})` : ''}`
          : `không hủy được: dòng 0 là "${line?.label ?? 'không có'}" (không giữ nhiệm vụ nào)`);
      }
      if (task === 'accept' && count && count.taken >= count.max) throw new Stop(`hôm nay đã nhận ${count.taken}/${count.max} nhiệm vụ`);
      this.log({ event: 'plan', task: task === 'accept' ? 'Nhận nhiệm vụ' : 'Hủy nhiệm vụ', taken: count?.taken, max: count?.max, quest: dailyView(this.quest),
        note: task === 'cancel' ? 'nhiệm vụ đã hủy vẫn tính một lượt trong ngày' : undefined });
      if (!this.confirm) { this.log({ event: 'dry_run', reason: 'chạy thử: thêm --confirm để bấm' }); return 'dry_run'; }
      // Nhận: the notice, then s2c/1195 with the new quest. Hủy: s2c/1195 empty, then the notice. A refusal is a notice
      // alone, so the step waits for s2c/1195 and reads the notices around it.
      const seen = this.notices.length;
      this.log({ event: 'menu', option: 0, label: line.label });
      try {
        await this.steps.ask(57, buildRequest(57, { option: 0, ...AT }), [1195], task === 'accept' ? 'nhiệm vụ mới (s2c/1195)' : 'nhiệm vụ đã hủy (s2c/1195)', { refuse: false });
      } catch (error) {
        const said = this.notices.slice(seen);
        throw said.length ? new Stop(`server từ chối: "${said.at(-1)}"`) : error;
      }
      await sleep(this.settleMs);
      const notices = this.notices.slice(seen), ok = task === 'accept' ? !!this.quest : this.quest === null;
      this.log({ event: 'result', task: task === 'accept' ? 'Nhận nhiệm vụ' : 'Hủy nhiệm vụ', ok, notices, quest: dailyView(this.quest) });
      if (!ok) throw new Stop(`server trả s2c/1195 nhưng nhiệm vụ ${task === 'accept' ? 'vẫn trống' : 'vẫn còn'}`);
      return 'done';
    } finally {
      // The menu of daily quests runs line 0 at once: leave Hương Lão's first menu as the last one (its line 0 only opens
      // Mã quà tặng).
      if (opened) await this.npc.talk().catch(() => undefined);
    }
  }
}
