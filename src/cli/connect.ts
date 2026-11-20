import { runClient } from '../net/client.ts';
import { envConnection } from '../net/env.ts';

// No simulator or Frida imports in the live entry point.
const connection = envConnection();

const args = new Set(process.argv.slice(2));
if ([...args].some(x => !['--bootstrap', '--login', '--world', '--help'].includes(x))) throw new Error('Supported options: --bootstrap, --login, --world, --help');
if (['--bootstrap', '--login', '--world'].filter(x => args.has(x)).length > 1) throw new Error('Choose exactly one mode: --bootstrap, --login, --world');
if (args.has('--help')) {
  console.log('Direct Node.js TCP connection to CLLT_HOST:CLLT_PORT (default plays1.colauloanthe.vn:1688).');
  console.log('Loads local .env. Default: world if credentials are set, otherwise bootstrap.');
  console.log('--bootstrap: handshake only; --login: user/character; --world: user, map, entities and players snapshot.');
  console.log('Packet event IDs are numeric c2s/<opcode>, s2c/<opcode>; labels are analyst descriptions, not server names.');
} else {
  const configured = Boolean(connection.username && connection.password);
  const mode = args.has('--bootstrap') ? 'bootstrap' : args.has('--login') ? 'login' : args.has('--world') || configured ? 'world' : 'bootstrap';
  const result = await runClient({ ...connection, mode });
  console.log(JSON.stringify({ kind: 'summary', event: 'client_result', ...result }));
  if (!result.ok) process.exitCode = 1;
}
