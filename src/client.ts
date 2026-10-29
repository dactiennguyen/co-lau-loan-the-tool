import net from 'node:net';
import { Protocol, ProtocolError, Reader, handshake, sessionKey, characterPrefix, mapPrefix, encodedOpcodes } from './protocol.ts';
import { buildRequest, decodeEvent, findEvent } from './events.ts';
import { BASELINE } from './config.ts';

export const EXPECTED: Record<string, number[]> = {
  seed: [], key: [-1], version: [1207, 1209], notice: [5], challenge2: [2], challenge3: [3],
  authenticating: [4], character: [9], skills: [30], profile42: [42], location: [29], map: [11], entities: [43, 1263],
};
export interface ClientOptions {
  host?: string; port?: number; serverId?: number; username?: string; password?: string;
  mode?: 'bootstrap' | 'login' | 'world'; responseTimeoutMs?: number; overallTimeoutMs?: number;
  settleMs?: number; heartbeatMs?: number; log?: (event: Record<string, unknown>) => void;
}
export interface UserInfo {
  account: string;
  character?: ReturnType<typeof characterPrefix>;
  location?: { characterName: string; mapId: string; field: number };
  map?: ReturnType<typeof mapPrefix>;
}
export interface ClientResult { ok: boolean; state: string; diagnostic?: Record<string, unknown>; packets: number; user: UserInfo }

/** Owns a direct TCP connection to the configured game server; no gateway process is started. */
export function runClient(options: ClientOptions = {}): Promise<ClientResult> {
  const host = options.host ?? BASELINE.host, port = options.port ?? BASELINE.port, serverId = options.serverId ?? BASELINE.observedServerId;
  const mode = options.mode ?? 'bootstrap', username = options.username ?? '', password = options.password;
  if (mode !== 'bootstrap' && (!username || password === undefined)) throw new Error('Set CLLT_USERNAME and CLLT_PASSWORD locally before login/world');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid port');
  if (!Number.isInteger(serverId) || serverId < 0 || serverId > 0x7fffffff) throw new Error('Invalid server ID');
  const log = options.log ?? (e => console.log(JSON.stringify(e)));
  return new Promise(resolve => {
    const protocol = new Protocol();
    const user: UserInfo = { account: username.toLowerCase() };
    let seedBytes: Buffer = Buffer.alloc(0), haveSeed = false, haveList = false, haveFlag = false;
    let state = 'seed', done = false, characterName = '', mapId = '', packets = 0;
    let entities = false, snapshot = false, lastReceiveOpcode: number | null = null;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let stepTimer: ReturnType<typeof setTimeout> | undefined;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const start = Date.now();
    const emit = (event: string, fields: Record<string, unknown> = {}) => log({ kind: 'lifecycle', event, elapsedMs: Date.now() - start, state, ...fields });
    const socket = net.createConnection({ host, port }); socket.setNoDelay(true);
    const overall = setTimeout(() => fail('OVERALL_TIMEOUT', 'Overall observation timed out'), options.overallTimeoutMs ?? 30000);
    function move(next: string) {
      state = next; clearTimeout(stepTimer);
      emit('state', { expectedReceiveOpcodes: EXPECTED[state] });
      stepTimer = setTimeout(() => fail(haveSeed ? 'RESPONSE_TIMEOUT' : 'SEED_TIMEOUT', 'Expected response did not arrive; heartbeat does not reset this deadline'), options.responseTimeoutMs ?? 8000);
    }
    function finish(diagnostic?: Record<string, unknown>) {
      if (done) return;
      done = true; clearInterval(heartbeat); clearTimeout(stepTimer); clearTimeout(settleTimer); clearTimeout(overall);
      socket.destroy(); resolve({ ok: !diagnostic, state, diagnostic, packets, user });
    }
    function fail(code: string, reason: string, details: Record<string, unknown> = {}) {
      if (done) return;
      const diagnostic = { code, reason, lastReceiveOpcode, expectedReceiveOpcodes: EXPECTED[state], bufferedBytes: protocol.pending.length, rxCounter: protocol.rx?.counter ?? null, txCounter: protocol.tx?.counter ?? null, ...details };
      emit('failed', diagnostic); finish(diagnostic);
    }
    function send(opcode: number, extra: { challenge?: Uint8Array } = {}) {
      const payload = buildRequest(opcode, { username, password, serverId, characterName, mapId, ...extra });
      const info = decodeEvent('c2s', opcode, payload);
      emit(`c2s/${opcode}`, { kind: 'send', direction: 'c2s', opcode, encodedOpcode: encodedOpcodes.get(opcode),
        label: info.name, labelSource: 'analyst', protocolEventName: null, fields: info.fields, payloadBytes: payload.length,
        ...(opcode === 4 ? { redacted: true } : { payloadHex: payload.subarray(0, 128).toString('hex') }) });
      socket.write(protocol.encode(opcode, payload));
    }
    function requestNotice() {
      if (state === 'version' && haveList && haveFlag) { move('notice'); send(5); }
    }
    function worldReady() {
      if (!entities || !snapshot || settleTimer) return;
      clearTimeout(stepTimer);
      settleTimer = setTimeout(() => { emit('world_initialization_received', { mapId, entitiesReceived: true, playersSnapshotReceived: true }); finish(); }, options.settleMs ?? 0);
    }
    move('seed');
    socket.on('connect', () => emit('tcp_connected', { host, address: socket.remoteAddress, port: socket.remotePort }));
    socket.on('error', error => {
      const code = (error as NodeJS.ErrnoException).code;
      fail(code === 'ENOTFOUND' || code === 'EAI_AGAIN' ? 'DNS_ERROR' : 'TCP_ERROR', error.message, { socketCode: code });
    });
    socket.on('close', () => { if (!done) fail('SERVER_CLOSED', 'Server closed connection before the requested result'); });
    socket.on('data', chunk => {
      if (done) return;
      try {
        if (!haveSeed) {
          seedBytes = Buffer.concat([seedBytes, chunk]); if (seedBytes.length < 4) return;
          const seed = seedBytes.readInt32BE(), reply = handshake(seed);
          emit('seed', { payloadHex: seedBytes.subarray(0, 4).toString('hex') });
          socket.write(reply); emit('handshake_sent', { payloadHex: reply.toString('hex'), bytes: reply.length });
          haveSeed = true; move('key'); send(-1); chunk = seedBytes.subarray(4); seedBytes = Buffer.alloc(0);
        }
        for (const packet of protocol.receive(chunk)) {
          if (done) break;
          packets++; lastReceiveOpcode = packet.opcode ?? null;
          const spec = findEvent('s2c', packet.opcode);
          let decoded: ReturnType<typeof decodeEvent> | undefined;
          try { decoded = decodeEvent('s2c', packet.opcode, packet.payload); }
          catch (error) {
            if (spec?.phase !== 'push') throw error;
            emit('schema_warning', { code: 'PUSH_SCHEMA', opcode: packet.opcode, name: spec.name, reason: (error as Error).message });
          }
          emit(packet.opcode === undefined ? `s2c/encoded:${packet.encodedOpcode}` : `s2c/${packet.opcode}`, {
            kind: 'receive', direction: 's2c', opcode: packet.opcode ?? null, encodedOpcode: packet.encodedOpcode,
            label: spec?.name ?? 'unknown_event', labelSource: 'analyst', protocolEventName: null, payloadBytes: packet.payload.length,
            payloadHex: packet.payload.subarray(0, 128).toString('hex'), hexTruncated: packet.payload.length > 128,
            fields: decoded?.fields, parsedBytes: decoded?.parsedBytes ?? 0, opaqueBytes: decoded?.opaqueBytes ?? packet.payload.length });
          if (packet.opcode === undefined || !spec) emit('unknown_opcode', { code: 'OPCODE_MAPPING_OR_CATALOG', encodedOpcode: packet.encodedOpcode, opcode: packet.opcode ?? null });
          const r = new Reader(packet.payload);
          switch (packet.opcode) {
            case 0:
              throw new ProtocolError('SERVER_MESSAGE', String(decoded?.fields.text ?? 'Server sent opcode 0'), { serverFlag: decoded?.fields.flag, sourceEvent: 's2c/0' });
            case -1:
              if (state !== 'key') throw new ProtocolError('UNSUPPORTED_BRANCH', 'Repeated key exchange');
              protocol.enableKey(sessionKey(packet.payload)); move('version'); send(1206);
              heartbeat = setInterval(() => { if (!done) send(1); }, options.heartbeatMs ?? 2000); break;
            case 1207: emit('server_list', { value: r.string() }); haveList = true; requestNotice(); break;
            case 1209: emit('server_flag', { value: r.u8() }); haveFlag = true; requestNotice(); break;
            case 5:
              emit('notification', { fields: decoded?.fields });
              if (state !== 'notice') throw new ProtocolError('SERVER_NOTIFICATION', 'Notification outside bootstrap', { notification: decoded?.fields });
              if (mode === 'bootstrap') { emit('bootstrap_verified'); finish(); break; }
              move('challenge2'); send(2); break;
            case 2:
              if (state !== 'challenge2') break;
              if (r.string() !== '') throw new ProtocolError('UNSUPPORTED_BRANCH', 'Nonempty login gate; capture the official app branch');
              move('challenge3'); send(3); break;
            case 3:
              if (state !== 'challenge3') break;
              move('authenticating'); send(4, { challenge: r.bytes() }); break;
            case 4:
              if (state !== 'authenticating') break;
              if (packet.payload.length) throw new ProtocolError('UNSUPPORTED_BRANCH', 'Nonempty authentication ACK');
              emit('authentication_acknowledged'); move('character'); send(9); break;
            case 9: {
              if (state !== 'character') break;
              const profile = characterPrefix(packet.payload); user.character = profile; characterName = profile.name;
              emit('user_info', { kind: 'derived', sourceEvent: 's2c/9', user: { ...user } });
              if (mode === 'login') { emit('login_verified_by_character_response'); finish(); break; }
              move('skills'); send(30); break;
            }
            case 30: if (state === 'skills') { move('profile42'); send(42); } break;
            case 42: if (state === 'profile42') { move('location'); send(29); } break;
            case 29:
              if (state !== 'location') break;
              user.location = { characterName: r.string(), mapId: mapId = r.string(), field: r.i32() };
              emit('user_location', { kind: 'derived', sourceEvent: 's2c/29', location: user.location });
              move('map'); send(11); break;
            case 11:
              if (state !== 'map') break;
              user.map = mapPrefix(packet.payload);
              emit('user_map', { kind: 'derived', sourceEvent: 's2c/11', map: user.map }); move('entities'); send(43); break;
            case 43:
              if (state !== 'entities') break;
              entities = true; emit('initial_entities_received', { mapId: r.string(), payloadBytes: packet.payload.length }); worldReady(); break;
            case 1263: if (decoded) { snapshot = true; worldReady(); } break;
          }
        }
      } catch (error) {
        if (error instanceof ProtocolError) fail(error.code, error.message, error.details);
        else fail('PAYLOAD_OR_BRANCH', (error as Error).message);
      }
    });
  });
}
