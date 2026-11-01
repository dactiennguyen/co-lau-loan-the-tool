import { Items } from '../protocol/items.ts';
import { CRAFT_KINDS, NPC_MAP } from '../protocol/npc.ts';
import { SmithBot, type SmithTask, type UpgradeTask } from '../bot/smith.ts';
import { Stop } from '../bot/steps.ts';
import { flags, mapOf, runSession, show, showCharacter } from './run-session.ts';

// Pháp sư from the TS bot (docs/integration/nodejs/smith.md): one task a run, as the game does it. Without --confirm the bot
// opens the window, puts the items in and reads the price and the odds, then stops before Bắt đầu: nothing is spent.
//   npm run smith -- [--account=tiheo2]                         the bag and the money
//   npm run smith -- --quote=19 [--careful]                     the price of upgrading the item of bag slot 19
//   npm run smith -- --upgrade=19 [--to=8] [--careful] [--rate=100] [--charm=auto|never] [--tries=N] [--locked-stones]
//   npm run smith -- --merge[=12] | --separate=19 | --transmute=19:20 | --craft=nhan:1 | --ice=1|5|all
//   npm run smith -- --merge --level=3 [--lock=locked|unlocked] [--sets=1]    only Đá cấp 3 into Đá cấp 4, at most 1 time
//   … --confirm                                                  press Bắt đầu
// --account reads app/accounts.json (local only); without it CLLT_USERNAME/CLLT_PASSWORD of .env. CLLT_TRACE=<file>
// keeps every packet.
const { arg, has, usage, int } = flags('smith_run_result');

function upgradeArgs(slot: number): UpgradeTask {
  const charm = arg('charm') ?? 'auto';
  if (charm !== 'auto' && charm !== 'never') usage('--charm phải là auto hoặc never');
  return {
    slot, careful: has('careful'), charm: charm as 'auto' | 'never', lockedStones: has('locked-stones'),
    to: arg('to') === undefined ? undefined : int('to', { min: 1, max: 16 }),
    rate: arg('rate') === undefined ? undefined : int('rate', { min: 1, max: 100 }),
    tries: arg('tries') === undefined ? undefined : int('tries', { min: 1, max: 100 }),
  };
}
function parseTask(): SmithTask {
  if (has('quote')) return { kind: 'quote', ...upgradeArgs(int('quote')) };
  if (has('upgrade')) return { kind: 'upgrade', ...upgradeArgs(int('upgrade')) };
  if (has('merge')) {
    const lock = arg('lock');
    if (lock !== undefined && lock !== 'locked' && lock !== 'unlocked') usage('--lock phải là locked hoặc unlocked');
    return {
      kind: 'merge', upTo: arg('merge') === '' ? 12 : int('merge', { min: 2, max: 12 }),
      level: arg('level') === undefined ? undefined : int('level', { min: 1, max: 11 }),
      locked: lock === undefined ? undefined : lock === 'locked',
      sets: arg('sets') === undefined ? undefined : int('sets', { min: 1, max: 1000 }),
    };
  }
  if (has('separate')) return { kind: 'separate', slot: int('separate') };
  if (has('transmute')) {
    const m = /^(\d{1,3}):(\d{1,3})$/.exec(arg('transmute') ?? ''), [source, target] = [Number(m?.[1]), Number(m?.[2])];
    if (!m || source > 255 || target > 255) usage('--transmute cần dạng <ô nguồn>:<ô đích>');
    return { kind: 'transmute', source, target };
  }
  if (has('craft')) {
    const [name, tier] = (arg('craft') ?? '').split(':'), kind = CRAFT_KINDS[name as keyof typeof CRAFT_KINDS];
    if (kind === undefined || !['1', '2', '3'].includes(tier)) usage('--craft cần dạng <non|ao|vukhi|nhan>:<1|2|3>');
    return { kind: 'craft', itemKind: kind, tier: Number(tier) };
  }
  if (has('ice')) {
    const v = arg('ice');
    if (v !== '1' && v !== '5' && v !== 'all') usage('--ice phải là 1, 5 hoặc all');
    return { kind: 'ice', bottles: v === 'all' ? 'all' : (Number(v) as 1 | 5) };
  }
  return { kind: 'bag' };
}

const task = parseTask();
const bot = new SmithBot({ items: Items.load(), confirm: has('confirm'), waitMs: has('wait-ms') ? int('wait-ms', { min: 500, max: 60000 }) : undefined, log: show });

await runSession({
  event: 'smith_run_result', account: arg('account'),
  onPacket: (opcode, payload) => bot.onPacket(opcode, payload),
  async run(api) {
    const c = api.user.character, mapId = mapOf(api);
    bot.character = { name: c?.name ?? '', level: c?.level ?? 0 };
    showCharacter(api, { task: task.kind, confirm: has('confirm') });
    show({ event: 'bag', ...bot.summary() });
    if (task.kind !== 'bag' && mapId !== NPC_MAP) throw new Stop(`nhân vật đang ở ${mapId}; Pháp sư chỉ trả lời ở ${NPC_MAP} (Làng Thanh Khê)`);
    return bot.run(task, api);
  },
  summary: () => ({ task: task.kind, money: bot.money }),
});
