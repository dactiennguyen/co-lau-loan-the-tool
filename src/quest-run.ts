import { existsSync, createWriteStream } from 'node:fs';
import { runClient } from './client.ts';
import { QuestBot } from './quest.ts';
import { BASELINE } from './config.ts';

// Logs in directly (CLLT_USERNAME/CLLT_PASSWORD from .env) and plays the current main quest.
// The account must not be online on another device: the server then answers s2c/0 and refuses the login.
if (existsSync('.env')) process.loadEnvFile('.env');
const arg = (name: string, fallback: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1] ?? fallback;
const trace = process.env.CLLT_TRACE ? createWriteStream(process.env.CLLT_TRACE) : undefined;
const quiet = new Set(['s2c/1263', 's2c/30', 's2c/1262', 's2c/1253', 's2c/1', 'c2s/1', 's2c/1166', 's2c/1167', 's2c/1170', 's2c/1182', 's2c/1183', 's2c/1212', 's2c/45']);
const show = (e: Record<string, unknown>) => console.log(JSON.stringify(e));

const bot = new QuestBot({ maxFights: Number(arg('fights', '3')), minHpRatio: Number(arg('min-hp', '0.4')), log: show });
const result = await runClient({
  host: process.env.CLLT_HOST, port: Number(process.env.CLLT_PORT ?? BASELINE.port), serverId: Number(process.env.CLLT_SERVER_ID ?? BASELINE.observedServerId),
  username: process.env.CLLT_USERNAME, password: process.env.CLLT_PASSWORD, mode: 'world', session: bot,
  log: e => {
    trace?.write(JSON.stringify(e) + '\n');
    const name = String(e.event);
    if (e.event === 'failed' || e.event === 'world_initialization_received' || (/^[cs]2c\//.test(name) && !quiet.has(name))) show({ ...e, payloadHex: undefined });
  },
});
show({ kind: 'summary', event: 'quest_run_result', ok: result.ok, state: result.state, diagnostic: result.diagnostic, fights: bot.fights, wins: bot.wins, losses: bot.losses });
trace?.end();
if (!result.ok) process.exitCode = 1;
