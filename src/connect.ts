import { runClient } from './client.ts';
import { existsSync } from 'node:fs';
import { BASELINE } from './config.ts';

// Existing shell values take precedence; no simulator or Frida imports in the live entry point.
if (existsSync('.env')) process.loadEnvFile('.env');

const args = new Set(process.argv.slice(2));
if ([...args].some(x => !['--bootstrap', '--login', '--world', '--help'].includes(x))) throw new Error('Supported options: --bootstrap, --login, --world, --help');
if (['--bootstrap', '--login', '--world'].filter(x => args.has(x)).length > 1) throw new Error('Choose exactly one mode: --bootstrap, --login, --world');
if (args.has('--help')) {
  console.log('Direct Node.js TCP connection to CLLT_HOST:CLLT_PORT (default play.colauloanthe.vn:1688).');
  console.log('Loads local .env. Default: world if credentials are set, otherwise bootstrap.');
  console.log('--bootstrap: handshake only; --login: user/character; --world: user, map, entities and players snapshot.');
  console.log('Packet event IDs are numeric c2s/<opcode>, s2c/<opcode>; labels are analyst descriptions, not server names.');
} else {
  const configured = Boolean(process.env.CLLT_USERNAME && process.env.CLLT_PASSWORD);
  const mode = args.has('--bootstrap') ? 'bootstrap' : args.has('--login') ? 'login' : args.has('--world') || configured ? 'world' : 'bootstrap';
  const result = await runClient({
    host: process.env.CLLT_HOST, port: Number(process.env.CLLT_PORT ?? BASELINE.port), serverId: Number(process.env.CLLT_SERVER_ID ?? BASELINE.observedServerId),
    username: process.env.CLLT_USERNAME, password: process.env.CLLT_PASSWORD,
    mode,
  });
  console.log(JSON.stringify({ kind: 'summary', event: 'client_result', ...result }));
  if (!result.ok) process.exitCode = 1;
}
