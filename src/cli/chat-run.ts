import { ChatBot, sayText, type ChatTask } from '../bot/chat.ts';
import { Stop } from '../bot/steps.ts';
import { flags, runSession, show, showCharacter } from './run-session.ts';

// Nói trong khu from the TS bot (docs/integration/nodejs/chat.md): what the Chat box of the speech bubble button sends.
//   npm run chat -- [--account=tiheo2] --say="chao ca nha"              shows what it would say; no login
//   npm run chat -- [--account=tiheo2] --say="chao ca nha" --confirm    says it: the players of the zone see it ~3 s
//   npm run chat -- [--account=tiheo2] --listen=60                      logs what is said in the zone and in Thế giới
// --listen also goes after --say. It costs nothing. Chat Thế giới (5 Lượng) is not sent: its packet is not captured.
const { arg, has, usage, int } = flags('chat_run_result');
function parseTask(): ChatTask {
  const say = arg('say'), listenMs = has('listen') ? int('listen', { min: 1, max: 600 }) * 1000 : 0;
  if (has('world')) usage('chưa gửi được chat Thế giới: gói gửi chưa bắt (mỗi tin 5 Lượng)');
  if (say === undefined && !listenMs) usage('cần --say="chữ" hoặc --listen=giây');
  if (say !== undefined) {
    try { sayText(say); } catch (error) { if (error instanceof Stop) usage(error.message); throw error; }
  }
  return { say, listenMs };
}
const task = parseTask();
const bot = new ChatBot({ confirm: has('confirm'), log: show });
// A dry run needs nothing from the server: no login, so a phone playing the same account is not kicked.
if (task.say !== undefined && !has('confirm') && !task.listenMs) {
  await bot.run(task, { send() { throw new Error('dry run sends nothing'); } }, undefined);
  show({ kind: 'summary', event: 'chat_run_result', ok: true, outcome: 'dry_run' });
  process.exit(0);
}

await runSession({
  event: 'chat_run_result', account: arg('account'),
  onPacket: (opcode, payload) => bot.onPacket(opcode, payload),
  async run(api) {
    showCharacter(api, { id: api.user.character?.numericId, confirm: has('confirm') });
    return bot.run(task, api, api.user.character?.numericId);
  },
  summary: () => ({ shown: bot.shown, heard: bot.heard.length }),
});
