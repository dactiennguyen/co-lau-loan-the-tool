import net from 'node:net';
import { Protocol, ProtocolError, Reader, handshake, sessionKey, characterPrefix, characterLocation, mapPrefix, encodedOpcodes } from '../protocol/protocol.ts';
import { buildRequest, decodeEvent, findEvent } from '../protocol/events.ts';
import { BASELINE } from '../protocol/config.ts';
import { ProxyTunnel, parseProxy, proxyLabel } from './proxy.ts';

/** Login/world flow: entering `state` sends `request`; the state ends when its `expect` responses arrived. */
export const FLOW: { state: string; request: number; expect: number[] }[] = [
  { state: 'key', request: -1, expect: [-1] }, { state: 'version', request: 1206, expect: [1207, 1209] },
  { state: 'notice', request: 5, expect: [5] }, { state: 'challenge2', request: 2, expect: [2] },
  { state: 'challenge3', request: 3, expect: [3] }, { state: 'authenticating', request: 4, expect: [4] },
  { state: 'character', request: 9, expect: [9] }, { state: 'skills', request: 30, expect: [30] },
  { state: 'profile42', request: 42, expect: [42] }, { state: 'location', request: 29, expect: [29] },
  { state: 'map', request: 11, expect: [11] }, { state: 'entities', request: 43, expect: [43, 1263] },
];
export const EXPECTED: Record<string, number[]> = { proxy: [], seed: [], ...Object.fromEntries(FLOW.map(s => [s.state, s.expect])) };
/** The s2c/0 of a session taken over by a login elsewhere (02-login.md#s2c-0): ends the session, in the world too. */
export const LOGGED_IN_ELSEWHERE = /đăng nhập ở (một )?nơi khác/i;
/** The s2c/8 of a login whose account has no character yet (02-login.md#s2c-8). */
export const NO_CHARACTER = 'Nick chưa có nhân vật: vào game tạo nhân vật trước';
export interface ClientOptions {
  host?: string; port?: number; serverId?: number; username?: string; password?: string;
  mode?: 'bootstrap' | 'login' | 'world'; responseTimeoutMs?: number; overallTimeoutMs?: number;
  settleMs?: number; heartbeatMs?: number; log?: (event: Record<string, unknown>) => void;
  /** After s2c/43, how long to wait for s2c/1263 (default 1500 ms): a zone with no other player sends none (M25, 31/10). */
  snapshotWaitMs?: number;
  /** socks5://[user:pass@]host:port or http://[user:pass@]host:port (CLLT_PROXY): the TCP connection goes through it,
   * the game protocol is unchanged. Logs name the proxy without its credentials. */
  proxy?: string;
  /** Payload prefix kept in packet logs (default 128 bytes); credentials `c2s/4` are never logged. */
  hexBytes?: number;
  /** World mode: keep the connection after the players snapshot and hand every packet to this handler. Decode errors
   * after that point are logged as schema_warning instead of closing the connection. */
  session?: WorldSession;
}
export interface SessionApi { send(opcode: number, payload: Uint8Array): void; close(): void; user: UserInfo }
export interface WorldSession { onPacket(opcode: number, payload: Buffer): void; onReady(api: SessionApi): void }
export interface UserInfo {
  account: string;
  character?: ReturnType<typeof characterPrefix>;
  location?: ReturnType<typeof characterLocation>;
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
  const log = options.log ?? (e => console.log(JSON.stringify(e))), hexBytes = options.hexBytes ?? 128;
  const proxy = options.proxy ? parseProxy(options.proxy) : undefined;
  return new Promise(resolve => {
    const protocol = new Protocol();
    const user: UserInfo = { account: username.toLowerCase() };
    let seedBytes: Buffer = Buffer.alloc(0), haveSeed = false, haveList = false, haveFlag = false;
    let state = 'seed', done = false, characterName = '', mapId = '', packets = 0;
    let entities = false, snapshot = false, players = false, ready = false, lastReceiveOpcode: number | null = null;
    let lastServerMessage: { flag: unknown; text: unknown; at: number } | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let stepTimer: ReturnType<typeof setTimeout> | undefined;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let snapshotTimer: ReturnType<typeof setTimeout> | undefined;
    const start = Date.now();
    const emit = (event: string, fields: Record<string, unknown> = {}) => log({ kind: 'lifecycle', event, elapsedMs: Date.now() - start, state, ...fields });
    // Through a proxy, state 'proxy' opens the tunnel first; the seed then comes through it.
    const tunnel = proxy && new ProxyTunnel(proxy, host, port);
    const socket = net.createConnection(proxy ? { host: proxy.host, port: proxy.port } : { host, port }); socket.setNoDelay(true);
    const overall = setTimeout(() => fail('OVERALL_TIMEOUT', 'Overall observation timed out'), options.overallTimeoutMs ?? 30000);
    function move(next: string) {
      state = next; clearTimeout(stepTimer);
      emit('state', { expectedReceiveOpcodes: EXPECTED[state] });
      stepTimer = setTimeout(() => fail(state === 'proxy' ? 'PROXY_TIMEOUT' : haveSeed ? 'RESPONSE_TIMEOUT' : 'SEED_TIMEOUT', 'Expected response did not arrive; heartbeat does not reset this deadline'), options.responseTimeoutMs ?? 8000);
    }
    function finish(diagnostic?: Record<string, unknown>) {
      if (done) return;
      done = true; clearInterval(heartbeat); clearTimeout(stepTimer); clearTimeout(settleTimer); clearTimeout(snapshotTimer); clearTimeout(overall);
      socket.destroy(); resolve({ ok: !diagnostic, state, diagnostic, packets, user });
    }
    function fail(code: string, reason: string, details: Record<string, unknown> = {}) {
      if (done) return;
      const diagnostic = { code, reason, lastReceiveOpcode, expectedReceiveOpcodes: EXPECTED[state], bufferedBytes: protocol.pending.length, rxCounter: protocol.rx?.counter ?? null, txCounter: protocol.tx?.counter ?? null, ...details };
      emit('failed', diagnostic); finish(diagnostic);
    }
    function write(opcode: number, payload: Uint8Array) {
      let fields: Record<string, unknown> | undefined;
      try { fields = decodeEvent('c2s', opcode, payload).fields; } catch { /* a session may send a layout the catalog does not know yet */ }
      emit(`c2s/${opcode}`, { kind: 'send', direction: 'c2s', opcode, encodedOpcode: encodedOpcodes.get(opcode),
        label: findEvent('c2s', opcode)?.name ?? 'unknown_event', labelSource: 'analyst', protocolEventName: null, fields, payloadBytes: payload.length,
        ...(opcode === 4 ? { redacted: true } : { payloadHex: Buffer.from(payload).subarray(0, hexBytes).toString('hex') }) });
      socket.write(protocol.encode(opcode, payload));
    }
    /** Enter the next FLOW state and send its request. */
    function step(next: string, extra: { challenge?: Uint8Array } = {}) {
      move(next);
      const opcode = FLOW.find(s => s.state === next)!.request;
      write(opcode, buildRequest(opcode, { username, password, serverId, characterName, mapId, element: user.character?.field01, ...extra }));
    }
    function requestNotice() {
      if (state === 'version' && haveList && haveFlag) step('notice');
    }
    function worldReady() {
      if (!entities || !snapshot || settleTimer) return;
      clearTimeout(stepTimer); clearTimeout(snapshotTimer);
      settleTimer = setTimeout(() => {
        emit('world_initialization_received', { mapId, entitiesReceived: true, playersSnapshotReceived: players });
        if (!options.session) { finish(); return; }
        clearTimeout(overall); ready = true;
        options.session.onReady({ send: (opcode, payload) => { if (!done) write(opcode, payload); }, close: () => finish(), user });
      }, options.settleMs ?? 0);
    }
    move(tunnel ? 'proxy' : 'seed');
    socket.on('connect', () => {
      emit('tcp_connected', { host: proxy?.host ?? host, address: socket.remoteAddress, port: socket.remotePort, ...(proxy && { proxy: proxyLabel(proxy) }) });
      if (tunnel) socket.write(tunnel.start());
    });
    socket.on('error', error => {
      const code = (error as NodeJS.ErrnoException).code;
      if (state === 'proxy') fail('PROXY_UNREACHABLE', error.message, { socketCode: code, proxy: proxyLabel(proxy!) });
      else fail(code === 'ENOTFOUND' || code === 'EAI_AGAIN' ? 'DNS_ERROR' : 'TCP_ERROR', error.message, { socketCode: code });
    });
    socket.on('close', () => {
      if (done) return;
      if (state === 'proxy') fail('PROXY_CLOSED', 'Proxy closed the connection before the tunnel opened', { proxy: proxyLabel(proxy!) });
      else {
        const m = lastServerMessage && { flag: lastServerMessage.flag, text: lastServerMessage.text, secondsAgo: Math.round((Date.now() - lastServerMessage.at) / 1000) };
        fail('SERVER_CLOSED', 'Server closed connection before the requested result', m && { lastServerMessage: m });
      }
    });
    socket.on('data', (chunk: Buffer) => {
      if (done) return;
      try {
        if (tunnel && !tunnel.open) {
          const { send, rest } = tunnel.receive(chunk);
          if (send) socket.write(send);
          if (!tunnel.open) return;
          emit('proxy_connected', { proxy: proxyLabel(proxy!), target: `${host}:${port}` });
          move('seed'); chunk = rest;
          if (!chunk.length) return;
        }
        if (!haveSeed) {
          seedBytes = Buffer.concat([seedBytes, chunk]); if (seedBytes.length < 4) return;
          const seed = seedBytes.readInt32BE(), reply = handshake(seed);
          emit('seed', { payloadHex: seedBytes.subarray(0, 4).toString('hex') });
          socket.write(reply); emit('handshake_sent', { payloadHex: reply.toString('hex'), bytes: reply.length });
          haveSeed = true; step('key'); chunk = seedBytes.subarray(4); seedBytes = Buffer.alloc(0);
        }
        for (const packet of protocol.receive(chunk)) {
          if (done) break;
          packets++; lastReceiveOpcode = packet.opcode ?? null;
          const spec = findEvent('s2c', packet.opcode);
          let decoded: ReturnType<typeof decodeEvent> | undefined;
          try { decoded = decodeEvent('s2c', packet.opcode, packet.payload); }
          catch (error) {
            if (!ready && spec?.phase !== 'push') throw error;
            emit('schema_warning', { code: 'PUSH_SCHEMA', opcode: packet.opcode, name: spec?.name, reason: (error as Error).message });
          }
          emit(packet.opcode === undefined ? `s2c/encoded:${packet.encodedOpcode}` : `s2c/${packet.opcode}`, {
            kind: 'receive', direction: 's2c', opcode: packet.opcode ?? null, encodedOpcode: packet.encodedOpcode,
            label: spec?.name ?? 'unknown_event', labelSource: 'analyst', protocolEventName: null, payloadBytes: packet.payload.length,
            payloadHex: packet.payload.subarray(0, hexBytes).toString('hex'), hexTruncated: packet.payload.length > hexBytes,
            fields: decoded?.fields, parsedBytes: decoded?.parsedBytes ?? 0, opaqueBytes: decoded?.opaqueBytes ?? packet.payload.length });
          if (packet.opcode === undefined || !spec) emit('unknown_opcode', { code: 'OPCODE_MAPPING_OR_CATALOG', encodedOpcode: packet.encodedOpcode, opcode: packet.opcode ?? null });
          if (packet.opcode !== undefined) options.session?.onPacket(packet.opcode, packet.payload);
          // In the world s2c/0 is the server's message box (Hương Lão's Cách tính điểm, Chế tạo short of materials:
          // 14-npc.md#s2c-0): logged and handed to the session, which goes on. Before that it ends the login, and so does
          // "logged in elsewhere" in the world: the session was taken over and must send nothing more.
          if (ready && packet.opcode === 0) {
            const text = String(decoded?.fields.text ?? '');
            if (LOGGED_IN_ELSEWHERE.test(text)) throw new ProtocolError('SERVER_MESSAGE', text, { serverFlag: decoded?.fields.flag, sourceEvent: 's2c/0', inWorld: true });
            lastServerMessage = { flag: decoded?.fields.flag, text, at: Date.now() };
            emit('server_message', { flag: lastServerMessage.flag, text });
            continue;
          }
          if (ready) continue;
          const r = new Reader(packet.payload);
          switch (packet.opcode) {
            case 0:
              throw new ProtocolError('SERVER_MESSAGE', String(decoded?.fields.text ?? 'Server sent opcode 0'), { serverFlag: decoded?.fields.flag, sourceEvent: 's2c/0' });
            case -1:
              if (state !== 'key') throw new ProtocolError('UNSUPPORTED_BRANCH', 'Repeated key exchange');
              protocol.enableKey(sessionKey(packet.payload)); step('version');
              heartbeat = setInterval(() => { if (!done) write(1, buildRequest(1)); }, options.heartbeatMs ?? 2000); break;
            case 1207: emit('server_list', { value: r.string() }); haveList = true; requestNotice(); break;
            case 1209: emit('server_flag', { value: r.u8() }); haveFlag = true; requestNotice(); break;
            case 5:
              emit('notification', { fields: decoded?.fields });
              if (state !== 'notice') throw new ProtocolError('SERVER_NOTIFICATION', 'Notification outside bootstrap', { notification: decoded?.fields });
              if (mode === 'bootstrap') { emit('bootstrap_verified'); finish(); break; }
              step('challenge2'); break;
            case 2:
              if (state !== 'challenge2') break;
              if (r.string() !== '') throw new ProtocolError('UNSUPPORTED_BRANCH', 'Nonempty login gate; capture the official app branch');
              step('challenge3'); break;
            case 3:
              if (state !== 'challenge3') break;
              step('authenticating', { challenge: r.bytes() }); break;
            case 4:
              if (state !== 'authenticating') break;
              if (packet.payload.length) throw new ProtocolError('UNSUPPORTED_BRANCH', 'Nonempty authentication ACK');
              emit('authentication_acknowledged');
              // As the game does (VG1 20/11, game 1.1.1 22/11): c2s/1282, the state of the phone (adb, developer options,
              // accessibility services), here a clean phone 00 00 00, then the chat block list (c2s/1284 command 0), then c2s/9.
              write(1282, buildRequest(1282, {}));
              write(1284, buildRequest(1284, {}));
              step('character'); break;
            // A login without a character gets the options of the character screen instead of s2c/9 (20/11, after the
            // Open Beta wiped the Alpha characters): nothing to play until one is made in the game.
            case 8:
              if (state !== 'character') break;
              throw new ProtocolError('NO_CHARACTER', NO_CHARACTER, { sourceEvent: 's2c/8', payloadBytes: packet.payload.length });
            case 9: {
              if (state !== 'character') break;
              const profile = characterPrefix(packet.payload); user.character = profile; characterName = profile.name;
              emit('user_info', { kind: 'derived', sourceEvent: 's2c/9', user: { ...user } });
              if (mode === 'login') { emit('login_verified_by_character_response'); finish(); break; }
              step('skills'); break;
            }
            case 30: if (state === 'skills') step('profile42'); break;
            case 42: if (state === 'profile42') step('location'); break;
            case 29:
              if (state !== 'location') break;
              user.location = characterLocation(packet.payload); mapId = user.location.mapId;
              emit('user_location', { kind: 'derived', sourceEvent: 's2c/29', location: user.location });
              step('map'); break;
            case 11:
              if (state !== 'map') break;
              user.map = mapPrefix(packet.payload);
              emit('user_map', { kind: 'derived', sourceEvent: 's2c/11', map: user.map }); step('entities'); break;
            case 43:
              if (state !== 'entities') break;
              entities = true; emit('initial_entities_received', { mapId: r.string(), payloadBytes: packet.payload.length }); worldReady();
              // Alone in the zone, the server sends no s2c/1263 at all.
              if (!snapshot) snapshotTimer ??= setTimeout(() => { snapshot = true; emit('players_snapshot_absent', { mapId }); worldReady(); }, options.snapshotWaitMs ?? 1500);
              break;
            // Receipt is what counts: a player record this decoder does not know yet is already a schema_warning.
            case 1263: snapshot = players = true; worldReady(); break;
          }
        }
      } catch (error) {
        if (error instanceof ProtocolError) fail(error.code, error.message, error.details);
        else fail('PAYLOAD_OR_BRANCH', (error as Error).message);
      }
    });
  });
}
