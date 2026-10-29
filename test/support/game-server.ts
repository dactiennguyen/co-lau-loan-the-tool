import net from 'node:net';
import { once } from 'node:events';
import { fixtures } from '../fixtures.ts';
import { encodedOpcodes, handshake, sessionKey, XorStream, MAX_FRAME } from '../../src/protocol.ts';
import { buildRequest, decodeEvent } from '../../src/events.ts';

export const scenario = fixtures.scenario;
const boot = fixtures.prelogin;
export type SimFault = 'none' | 'bad-key' | 'bad-frame' | 'bad-map' | 'new-opcode' | 'stall-map' | 'already-online';
export const SIM_FAULTS = ['none', 'bad-key', 'bad-frame', 'bad-map', 'new-opcode', 'stall-map', 'already-online'] as const;
interface SimOptions { port?: number; fault?: SimFault; log?: (event: Record<string, unknown>) => void }

/** Real local TCP server. Response bodies come from captures; framing/padding/timing are simulated. */
export async function startSimulator(options: SimOptions = {}) {
  const peers = new Set<net.Socket>(), log = options.log ?? (() => {}), fault = options.fault ?? 'none';
  const server = net.createServer(socket => {
    peers.add(socket); socket.on('close', () => peers.delete(socket)); socket.on('error', () => {}); socket.setNoDelay(true);
    const keyPacket = scenario.stages.find((s: { requestOpcode: number }) => s.requestOpcode === -1).responses[0];
    const key = sessionKey(Buffer.from(keyPacket.hex, 'hex'));
    const rx = new XorStream(key), tx = new XorStream(key);
    let pending: Buffer = Buffer.alloc(0), keyed = false, handshaken = false, nextStage = 0;
    const seed = Buffer.from(boot.seed, 'hex'); socket.write(seed.subarray(0, 1)); socket.write(seed.subarray(1));
    function reply(opcode: number, payload: Buffer, source: string, encodedOverride?: number) {
      let body = payload;
      if (fault === 'bad-key' && opcode === -1) body = Buffer.from([8, ...Array(8).fill(0)]);
      if (fault === 'bad-map' && opcode === 11) body = Buffer.from('0100000010ff', 'hex');
      const frame = Buffer.alloc(14); frame.writeInt32BE(14 + body.length, 2);
      const e = Buffer.alloc(4); e.writeInt32BE(encodedOverride ?? encodedOpcodes.get(opcode)!);
      for (const [i, pos] of [10, 6, 12, 8].entries()) frame[pos] = e[i];
      if (keyed) tx.apply(frame.subarray(6, 14)).copy(frame, 6);
      const encodedBody = keyed ? tx.apply(body) : body;
      if (fault === 'bad-frame' && opcode === 1207) frame.writeInt32BE(13, 2);
      log({ event: 'sim_send', direction: 's2c', opcode, payloadBytes: body.length, source, syntheticWireHeader: true });
      socket.write(frame.subarray(0, 3)); socket.write(Buffer.concat([frame.subarray(3), encodedBody]));
    }
    socket.on('data', chunk => {
      try {
        pending = Buffer.concat([pending, chunk]);
        if (!handshaken) {
          if (pending.length < 21) return;
          if (!pending.subarray(0, 21).equals(handshake(seed.readInt32BE()))) throw new Error('Wrong seed response');
          pending = pending.subarray(21); handshaken = true;
        }
        while (pending.length >= 17) {
          const n = pending.readInt32BE() + 4;
          if (n < 17 || n > MAX_FRAME) throw new Error('Invalid client frame size');
          if (pending.length < n) return;
          const frame = Buffer.from(pending.subarray(0, n)); pending = pending.subarray(n);
          if (frame[4] !== 1 || frame.subarray(5, 9).toString() !== 'PT01' || frame.readInt32BE(9) !== n - 17) throw new Error('Invalid client header');
          const body = keyed ? rx.apply(frame.subarray(13)) : frame.subarray(13);
          const opcode = [...encodedOpcodes].find(([, value]) => value === body.readInt32BE())?.[0];
          if (opcode === undefined) throw new Error('Unknown client opcode');
          if (opcode === 1) { reply(1, Buffer.alloc(0), 'synthetic heartbeat'); continue; }
          const stage = scenario.stages[nextStage];
          if (stage?.requestOpcode !== opcode) throw new Error(`Wrong request order: expected ${stage?.requestOpcode}, got ${opcode}`);
          const expected = buildRequest(opcode, { username: 'probe_user', password: 'abc', challenge: Buffer.from('100c0001', 'hex'), serverId: 24, characterName: 'manina', mapId: 'M1' });
          if (!body.subarray(4).equals(expected)) throw new Error(`Wrong request body for ${opcode}`);
          log({ event: 'sim_receive', direction: 'c2s', opcode, payloadBytes: body.length - 4, name: decodeEvent('c2s', opcode, body.subarray(4)).name });
          nextStage++;
          if (fault === 'already-online' && opcode === 4) { reply(0, Buffer.from(fixtures['server-message'].hex, 'hex'), 'recorded live server message'); continue; }
          if (fault === 'stall-map' && opcode === 11) continue;
          if (fault === 'new-opcode' && opcode === 1206) reply(0, Buffer.from([1, 2]), 'injected unknown opcode', 123456789);
          for (const response of stage.responses) {
            if (!response.complete || response.hex.length / 2 !== response.bytes) throw new Error(`Truncated fixture ${response.opcode}`);
            reply(response.opcode, Buffer.from(response.hex, 'hex'), `recorded stage ${opcode}`);
          }
          if (opcode === -1) keyed = true;
          if (opcode === 43) {
            for (const push of scenario.extraPushExamples) reply(push.opcode, Buffer.from(push.hex, 'hex'), 'recorded extra example from first capture');
          }
        }
      } catch (error) { log({ event: 'sim_error', reason: (error as Error).message }); socket.destroy(); }
    });
  });
  server.listen(options.port ?? 0, '127.0.0.1'); await once(server, 'listening');
  const port = (server.address() as net.AddressInfo).port;
  return { port, close: async () => { for (const p of peers) p.destroy(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); } };
}
