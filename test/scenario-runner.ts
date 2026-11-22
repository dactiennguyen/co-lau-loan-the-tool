import { startSimulator, SIM_FAULTS } from './support/game-server.ts';
import type { SimFault } from './support/game-server.ts';
import { runClient } from '../src/net/client.ts';
import { ZERO_PACE } from '../src/net/human.ts';

const args = process.argv.slice(2);
let fault: SimFault = 'none', quiet = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--quiet') quiet = true;
  else if (args[i] === '--fault' && SIM_FAULTS.includes(args[i + 1] as SimFault)) fault = args[++i] as SimFault;
  else throw new Error(`Usage: npm run test:scenario -- [--quiet] [--fault ${SIM_FAULTS.join('|')}]`);
}
const log = (e: Record<string, unknown>) => console.log(JSON.stringify(e));
const server = await startSimulator({ fault, log: quiet ? undefined : log });
log({ event: 'simulation_started', host: '127.0.0.1', port: server.port, fault, source: 'Recorded response payloads; synthetic local credentials and wire framing' });
try {
  const result = await runClient({ host: '127.0.0.1', port: server.port, mode: 'world', username: 'probe_user', password: 'abc', settleMs: 75, heartbeatMs: 20, worldHeartbeatMs: [20, 20], human: ZERO_PACE, responseTimeoutMs: fault === 'stall-map' ? 150 : 3000, log });
  log({ event: 'simulation_finished', ...result }); if (!result.ok) process.exitCode = 1;
} finally { await server.close(); }
