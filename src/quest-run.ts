import { createWriteStream } from 'node:fs';
import { runClient } from './client.ts';
import { QuestBot } from './quest.ts';
import { envConnection } from './env.ts';
import { WEIGHTS } from './battle.ts';

// Logs in directly (CLLT_USERNAME/CLLT_PASSWORD from .env) and plays the current main quest.
// The account must not be online on another device: the server then answers s2c/0 and refuses the login.
const connection = envConnection();
const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const trace = process.env.CLLT_TRACE ? createWriteStream(process.env.CLLT_TRACE) : undefined;
// Printed elsewhere by the bot, or too frequent to read; CLLT_TRACE still keeps every packet.
const quiet = new Set(['s2c/1263', 's2c/30', 's2c/1262', 's2c/1253', 's2c/1', 'c2s/1', 's2c/1166', 's2c/1167', 's2c/1170', 's2c/1182', 's2c/1183', 's2c/1212', 's2c/45',
  'c2s/15', 'c2s/1178', 's2c/22', 'c2s/18', 's2c/18', 's2c/24', 'c2s/14', 'c2s/19', 's2c/19', 's2c/20', 's2c/10', 's2c/36', 's2c/1214', 's2c/1205', 's2c/1261', 's2c/46', 's2c/1187', 's2c/1201', 's2c/1177', 's2c/13', 'c2s/13', 's2c/11', 'c2s/11', 's2c/43', 'c2s/43']);
const show = (e: Record<string, unknown>) => console.log(JSON.stringify(e));

// --skill=1000:25 casts skill 1000 whenever own nội lực reaches 25.
const [skillId, skillCost] = (arg('skill') ?? '').split(':').map(Number);
const skill = skillId ? { id: skillId, cost: skillCost || 25 } : undefined;
// --goal=kill (default: end battles fast) or --goal=exp (collect stars, drops and gold).
const goal = (arg('goal') ?? 'kill') as keyof typeof WEIGHTS;
if (!WEIGHTS[goal]) throw new Error('--goal must be kill or exp');
const bot = new QuestBot({ maxFights: Number(arg('fights') ?? 3), minHpRatio: Number(arg('min-hp') ?? 0), grind: arg('grind'), skill, weights: WEIGHTS[goal],
  timedMoveMs: Number(arg('move-ms') ?? 1000), restMs: Number(arg('rest-ms') ?? 3000), farm: arg('farm'), healBelow: Number(arg('heal-below') ?? 0.4), log: show });
const result = await runClient({
  ...connection, mode: 'world', session: bot, hexBytes: trace ? 65536 : 128,
  log: e => {
    trace?.write(JSON.stringify(e) + '\n');
    const name = String(e.event);
    if (e.event === 'failed' || e.event === 'world_initialization_received' || (/^[cs]2c\//.test(name) && !quiet.has(name))) show({ ...e, payloadHex: undefined });
  },
});
show({ kind: 'summary', event: 'quest_run_result', ok: result.ok, state: result.state, diagnostic: result.diagnostic, fights: bot.fights, wins: bot.wins, losses: bot.losses });
trace?.end();
if (!result.ok) process.exitCode = 1;
