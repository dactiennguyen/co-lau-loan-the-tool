import { createWriteStream } from 'node:fs';
import { runClient, type SessionApi } from '../net/client.ts';
import { connectionFor } from '../net/accounts.ts';
import { Stop } from '../bot/steps.ts';

// What the step-by-step CLIs (smith, gift, mail, daily) share: their flags, the login (--account from app/accounts.json,
// else .env), one task once in the world, then a summary line `<event>` and the exit code. CLLT_TRACE=<file> keeps
// every packet (c2s/4 redacted by the client).

export const show = (e: Record<string, unknown>) => console.log(JSON.stringify(e));

export function flags(event: string) {
  /** `--name=value` → "value", a bare `--name` → "", absent → undefined. */
  const arg = (name: string) => {
    const hit = process.argv.find(a => a === `--${name}` || a.startsWith(`--${name}=`));
    return hit === undefined ? undefined : hit.slice(name.length + 3);
  };
  const has = (name: string) => arg(name) !== undefined;
  const usage = (reason: string): never => {
    show({ kind: 'summary', event, ok: false, reason });
    process.exit(2);
  };
  const int = (name: string, { min = 0, max = 255 } = {}) => {
    const raw = arg(name), n = Number(raw);
    if (!raw || !Number.isInteger(n) || n < min || n > max) usage(`--${name}=${raw ?? ''}: cần số nguyên từ ${min} tới ${max}`);
    return n;
  };
  return { arg, has, usage, int };
}

/** The character line every CLI starts with. */
export function showCharacter(api: SessionApi, extra: Record<string, unknown> = {}) {
  const c = api.user.character;
  show({ event: 'character', name: c?.name, level: c?.level, mapId: mapOf(api), map: api.user.map?.name, zone: api.user.map?.area, ...extra });
}
export const mapOf = (api: SessionApi) => api.user.location?.mapId ?? api.user.map?.mapId;

/** Logs in, runs `run` once in the world, logs out. A Stop ends the task with its reason; the summary says it. */
export async function runSession(o: {
  event: string;
  account?: string;
  onPacket(opcode: number, payload: Buffer): void;
  run(api: SessionApi): Promise<string>;
  summary?(): Record<string, unknown>;
}) {
  const trace = process.env.CLLT_TRACE ? createWriteStream(process.env.CLLT_TRACE) : undefined;
  let outcome: string | undefined, reason: string | undefined;
  const result = await runClient({
    ...connectionFor(o.account), mode: 'world', hexBytes: trace ? 65536 : 128,
    log: e => {
      trace?.write(JSON.stringify(e) + '\n');
      if (e.event === 'failed') show({ ...e, payloadHex: undefined });
    },
    session: {
      onPacket: (opcode, payload) => o.onPacket(opcode, payload),
      onReady(api) {
        (async () => {
          try {
            outcome = await o.run(api);
          } catch (error) {
            reason = error instanceof Stop ? error.message : `lỗi: ${(error as Error).stack ?? error}`;
            show({ event: 'stop', reason });
          }
          api.close();
        })();
      },
    },
  });
  show({ kind: 'summary', event: o.event, ok: result.ok && !reason, outcome, reason, ...o.summary?.(), state: result.state, diagnostic: result.diagnostic });
  trace?.end();
  if (!result.ok || reason) process.exitCode = 1;
}
