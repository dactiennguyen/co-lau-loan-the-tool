// Nói trong khu from the TS bot (docs/integration/nodejs/chat.md, docs/app/events/09-players-chat.md#c2s-1174): what
// the Chat box of the speech bubble button at the top right sends. c2s/1174 carries the text; the server answers
// s2c/1174 with the speaker's id and the text, the words it forbids starred out, and the game shows that above the
// speaker for about 3 s. It costs nothing. While it runs the bot also logs what the others say in the zone (s2c/1174)
// and the lines of the Thế giới channel (s2c/1205). It never sends chat Thế giới: that packet is not captured, and each
// line costs 5 Lượng.
import { buildRequest } from '../protocol/events.ts';
import { ZonePlayers, notice, playerSay, worldChat } from '../protocol/world.ts';
import { Steps, Stop, sleep, type Io, type Log, type Packet } from './steps.ts';

/** The bot's own limit on what it says: how long a line the game takes is not measured. */
export const SAY_MAX = 100;

export type Outcome = 'done' | 'dry_run';
export interface ChatTask {
  /** What to say once; without it the bot only listens. */
  say?: string;
  /** After saying it, how long to keep logging what is said (default 0). */
  listenMs?: number;
}
export interface ChatOptions {
  /** Sends c2s/1174; without it the bot only shows what it would say. */
  confirm?: boolean;
  waitMs?: number;
  log?: Log;
}

/** The text as the bot sends it: trimmed, not empty (the game says "Chưa nhập nội dung chat."), one line, at most
 * SAY_MAX characters. */
export function sayText(text: string) {
  const t = text.trim(), length = [...t].length;
  if (!t) throw new Stop('chưa nhập nội dung chat');
  if (/[\r\n]/.test(t)) throw new Stop('chỉ nói được một dòng');
  if (length > SAY_MAX) throw new Stop(`chữ dài ${length} ký tự; bot chỉ gửi tối đa ${SAY_MAX}`);
  return t;
}

export class ChatBot {
  /** The other players of the zone as far as the packets after login tell (s2c/1167, s2c/1263): names for the ids. */
  readonly zone = new ZonePlayers();
  /** What the server showed of the own line (s2c/1174), once said. */
  shown?: string;
  /** What the others said in the zone while the bot ran, oldest first. */
  readonly heard: { playerId: number; name?: string; text: string }[] = [];
  private readonly steps: Steps;
  private readonly confirm: boolean;
  private readonly log: Log;
  /** The own character's id (numericId of s2c/9): its s2c/1174 is the answer to c2s/1174. */
  private selfId?: number;

  constructor(options: ChatOptions = {}) {
    this.confirm = options.confirm ?? false;
    this.log = options.log ?? (() => {});
    this.steps = new Steps(options.waitMs ?? 8000);
  }

  onPacket(op: number, payload: Buffer) {
    try {
      this.zone.on(op, payload);
      if (op === 1174) {
        const s = playerSay(payload);
        if (s.playerId !== this.selfId) {
          const name = this.zone.players.get(s.playerId)?.name;
          this.heard.push({ playerId: s.playerId, name, text: s.text });
          this.log({ event: 'heard', playerId: s.playerId, name, text: s.text });
        }
      } else if (op === 1205) {
        const c = worldChat(payload);
        this.log({ event: 'world_chat', senderId: c.senderId, name: c.name, text: c.text });
      } else if (op === 1256) this.log({ event: 'notice', text: notice(payload).text });
    } catch (error) {
      this.log({ event: 'parse_error', opcode: op, reason: (error as Error).message, payloadHex: payload.toString('hex') });
    }
    this.steps.take(op, payload);
  }

  async run(task: ChatTask, io: Io, selfId: number | undefined): Promise<Outcome> {
    this.steps.io = io;
    this.selfId = selfId;
    let outcome: Outcome = 'done';
    if (task.say !== undefined) outcome = await this.say(task.say);
    if (task.listenMs) {
      this.log({ event: 'listen', seconds: task.listenMs / 1000 });
      await sleep(task.listenMs);
    }
    return outcome;
  }

  private async say(raw: string): Promise<Outcome> {
    const text = sayText(raw);
    this.log({ event: 'plan', task: 'Nói trong khu', text });
    if (!this.confirm) {
      this.log({ event: 'dry_run', reason: 'chạy thử: thêm --confirm để nói (người trong khu thấy được)' });
      return 'dry_run';
    }
    if (this.selfId === undefined) throw new Stop('chưa biết id của nhân vật (s2c/9)');
    const sentAt = Date.now();
    const own = (p: Packet) => { try { return playerSay(p.payload).playerId === this.selfId; } catch { return false; } };
    const answer = await this.steps.ask(1174, buildRequest(1174, { text }), [1174], 'nói trong khu', { match: own });
    const shown = this.shown = playerSay(answer.payload).text;
    this.log({ event: 'said', text, shown, censored: shown !== text, ms: Date.now() - sentAt });
    return 'done';
  }
}
