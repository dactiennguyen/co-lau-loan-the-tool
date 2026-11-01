// Nhiệm vụ hàng ngày at Hương Lão (NPC 102 of M1) from the TS bot (docs/integration/nodejs/mail.md#nhiệm-vụ-ngày,
// docs/app/events/14-npc.md#nhiệm-vụ-hàng-ngày): the quest held (s2c/1195), and line 2 of his menu, whose line 0 is
// Nhận nhiệm vụ or Hủy nhiệm vụ hiện tại and runs at once. Hoàn thành nhiệm vụ (task 'complete') presses the line of
// that label once the quest is done, and logs whatever comes back: first measured in NP1.
import { buildRequest } from '../protocol/events.ts';
import { DAILY, DAILY_DONE, dailyAfter, dailyQuest, dailyTaken, dailyText, type DailyQuest } from '../protocol/mail.ts';
import { ELDER, NPC_MAP } from '../protocol/npc.ts';
import { notice, npcMenu } from '../protocol/world.ts';
import { Holdings, Npc, Steps, Stop, serverText, sleep, type Io, type Log } from './steps.ts';

export type DailyTask = 'show' | 'accept' | 'cancel' | 'complete';
export type Outcome = 'done' | 'dry_run';
const AT = { mapId: NPC_MAP, npcId: ELDER };

export interface DailyOptions {
  /** Nhận, Hủy or Hoàn thành; without it the bot only reads. */
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
  readonly holdings = new Holdings();
  /** The opcodes come after Hoàn thành, in order, for the log. */
  private after?: number[];
  /** The rewards of the quest just done (s2c/1195 kind 2): "727 kinh nghiệm", "590 xu khóa". */
  rewards?: string[];
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
      this.holdings.update(op, payload);
      this.after?.push(op);
      if (op === 1195) {
        const d = dailyQuest(payload);
        if (d.kind === DAILY_DONE) { this.rewards = d.done.rewards; this.log({ event: 'daily_done', name: d.done.name, rewards: d.done.rewards }); }
        this.quest = dailyAfter(this.quest, d);
        this.log({ event: 'daily_quest', quest: dailyView(this.quest) });
      }
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
      if (task === 'complete') return await this.complete(menu, count);
      if (line && DAILY.complete.test(line.label)) throw new Stop(`menu có dòng "${line.label}": dùng --complete để trả nhiệm vụ`);
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

  /** Hoàn thành nhiệm vụ: the line of that label, only when the quest held is done. The answer is waited for as a
   * s2c/1195 or a notice; then whatever else comes in `settleMs` × 3 is logged with the money and the bag around it.
   * Done is s2c/1195 kind 2, which leaves no quest held. */
  private async complete(menu: ReturnType<typeof npcMenu>, count: ReturnType<typeof dailyTaken>): Promise<Outcome> {
    const line = menu.options.find(o => DAILY.complete.test(o.label)), q = this.quest;
    if (!line) throw new Stop(`menu không có dòng Hoàn thành nhiệm vụ (${menu.options.map(o => `${o.option} ${o.label}`).join(', ') || 'không có dòng nào'})`);
    if (!q) throw new Stop('không giữ nhiệm vụ ngày nào');
    if (q.progress < q.target) throw new Stop(`${q.name} mới ${q.progress}/${q.target}: chưa xong`);
    this.log({ event: 'plan', task: 'Hoàn thành nhiệm vụ', line: `${line.option} ${line.label}`, taken: count?.taken, max: count?.max, quest: dailyView(q),
      money: this.holdings.money, bag: this.holdings.bag.length });
    if (!this.confirm) { this.log({ event: 'dry_run', reason: 'chạy thử: thêm --confirm để bấm' }); return 'dry_run'; }
    const seen = this.notices.length, moneyBefore = this.holdings.money && { ...this.holdings.money }, bagBefore = new Set(this.holdings.bag.map(i => i.uuid));
    this.after = [];
    this.rewards = undefined;
    this.log({ event: 'menu', option: line.option, label: line.label });
    await this.steps.ask(57, buildRequest(57, { option: line.option, ...AT }), [1195, 1256, 0], 'Hoàn thành nhiệm vụ', { refuse: false });
    await sleep(this.settleMs * 3);
    const opcodes = this.after;
    this.after = undefined;
    const got = this.holdings.bag.filter(i => !bagBefore.has(i.uuid)).map(i => ({ slot: i.slot, itemId: i.itemId, quantity: i.quantity }));
    // Done (NP1): s2c/10 (the EXP), s2c/46 (the Xu khóa), s2c/1187 (the bag), then s2c/1195 kind 2 with the rewards; no
    // notice. The quest held is then none.
    const ok = this.quest === null && !!this.rewards;
    this.log({ event: 'result', task: 'Hoàn thành nhiệm vụ', ok, rewards: this.rewards, notices: this.notices.slice(seen), quest: dailyView(this.quest), opcodes,
      moneyBefore, moneyAfter: this.holdings.money, got });
    if (!ok) throw new Stop(`server không báo xong nhiệm vụ${this.notices.length > seen ? `: "${this.notices.at(-1)}"` : ''}`);
    return 'done';
  }
}
