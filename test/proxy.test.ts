import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { runClient } from '../src/client.ts';
import { ProtocolError } from '../src/protocol.ts';
import { ProxyTunnel, parseProxy, proxyLabel } from '../src/proxy.ts';
import { startSimulator } from './support/game-server.ts';

interface FakeProxyOptions {
  kind: 'socks5' | 'http'; username?: string; password?: string;
  /** Hold the proxy's last reply until the game server's first bytes, and send both in one write. */
  coalesce?: boolean;
  /** Accept the connection and never answer. */
  silent?: boolean;
}

/** A local SOCKS5 / HTTP CONNECT proxy in front of the simulator: checks the credentials, then pipes both ways. */
async function startProxy(options: FakeProxyOptions) {
  const seen: { target?: string; auth?: string }[] = [], sockets = new Set<net.Socket>();
  const server = net.createServer(client => {
    sockets.add(client); client.on('close', () => sockets.delete(client)); client.on('error', () => {});
    if (options.silent) return;
    let buffer = Buffer.alloc(0), stage = options.kind === 'http' ? 'http' : 'method';
    const record: { target?: string; auth?: string } = {}; seen.push(record);
    const open = (host: string, port: number, reply: Buffer) => {
      client.removeAllListeners('data');
      const upstream = net.createConnection({ host: host === 'localhost' ? '127.0.0.1' : host, port });
      upstream.on('error', () => client.destroy());
      upstream.once('connect', () => {
        if (!options.coalesce) client.write(reply);
        upstream.once('data', first => {
          client.write(options.coalesce ? Buffer.concat([reply, first]) : first);
          upstream.pipe(client); client.pipe(upstream);
        });
      });
      client.on('close', () => upstream.destroy()); upstream.on('close', () => client.destroy());
    };
    client.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      if (stage === 'http') {
        const end = buffer.indexOf('\r\n\r\n'); if (end < 0) return;
        const head = buffer.subarray(0, end).toString(), [, host, port] = /^CONNECT (.+):(\d+) HTTP\/1\.1/.exec(head)!;
        record.target = `${host}:${port}`; record.auth = /Proxy-Authorization: Basic (\S+)/.exec(head)?.[1];
        const expected = options.username && Buffer.from(`${options.username}:${options.password}`).toString('base64');
        if (expected && record.auth !== expected) { client.end('HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Basic\r\n\r\n'); return; }
        open(host, Number(port), Buffer.from('HTTP/1.1 200 Connection established\r\nVia: fake\r\n\r\n'));
      } else if (stage === 'method') {
        if (buffer.length < 2 || buffer.length < 2 + buffer[1]) return;
        const methods = [...buffer.subarray(2, 2 + buffer[1])]; buffer = buffer.subarray(2 + buffer[1]);
        const method = options.username ? (methods.includes(2) ? 2 : 0xff) : 0;
        client.write(Buffer.from([5, method])); stage = method === 2 ? 'auth' : 'connect';
        if (method === 0xff) client.end();
      } else if (stage === 'auth') {
        if (buffer.length < 2 || buffer.length < 3 + buffer[1] || buffer.length < 3 + buffer[1] + buffer[2 + buffer[1]]) return;
        const ulen = buffer[1], user = buffer.subarray(2, 2 + ulen).toString(), plen = buffer[2 + ulen], pass = buffer.subarray(3 + ulen, 3 + ulen + plen).toString();
        buffer = buffer.subarray(3 + ulen + plen); record.auth = `${user}:${pass}`;
        const ok = user === options.username && pass === options.password;
        client.write(Buffer.from([1, ok ? 0 : 1])); if (!ok) { client.end(); return; }
        stage = 'connect';
      } else if (stage === 'connect') {
        if (buffer.length < 5) return;
        const atyp = buffer[3], len = atyp === 1 ? 4 : atyp === 3 ? 1 + buffer[4] : 16;
        if (buffer.length < 4 + len + 2) return;
        const host = atyp === 1 ? [...buffer.subarray(4, 8)].join('.') : buffer.subarray(5, 5 + buffer[4]).toString();
        const port = buffer.readUInt16BE(4 + len); record.target = `${host}:${port}`;
        // The bound address as a name, so the client has to read its length.
        open(host, port, Buffer.from([5, 0, 0, 3, 5, ...Buffer.from('proxy'), 0x04, 0x38]));
      }
    });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return { port: (server.address() as net.AddressInfo).port, seen, close: () => new Promise<void>(r => { server.close(() => r()); for (const s of sockets) s.destroy(); }) };
}

async function viaProxy(proxyUrl: (port: number) => string, options: FakeProxyOptions, gameHost = '127.0.0.1') {
  const events: Record<string, any>[] = [];
  const game = await startSimulator(), proxy = await startProxy(options);
  try {
    const result = await runClient({ host: gameHost, port: game.port, mode: 'world', username: 'probe_user', password: 'abc', proxy: proxyUrl(proxy.port),
      settleMs: 30, heartbeatMs: 20, responseTimeoutMs: 300, snapshotWaitMs: 40, log: e => events.push(e) });
    return { result, events, seen: proxy.seen, gamePort: game.port, proxyPort: proxy.port };
  } finally { await proxy.close(); await game.close(); }
}

test('parseProxy reads socks5 / http URLs, default ports and encoded credentials, and never echoes the text', () => {
  assert.deepEqual(parseProxy('socks5://u%40x:p%3Aw@1.2.3.4:1080'), { kind: 'socks5', host: '1.2.3.4', port: 1080, username: 'u@x', password: 'p:w' });
  assert.deepEqual(parseProxy('socks5h://proxy.example'), { kind: 'socks5', host: 'proxy.example', port: 1080, username: undefined, password: undefined });
  assert.deepEqual(parseProxy('http://user:pw@[::1]:8080'), { kind: 'http', host: '::1', port: 8080, username: 'user', password: 'pw' });
  assert.equal(parseProxy('http://proxy.example').port, 80);
  assert.equal(proxyLabel(parseProxy('http://user:pw@[::1]:8080')), 'http [::1]:8080');
  for (const bad of ['https://user:hunter2@1.2.3.4:443', '1.2.3.4:1080:user:hunter2', 'socks4://user:hunter2@1.2.3.4']) {
    assert.throws(() => parseProxy(bad), (e: Error) => !e.message.includes('hunter2'));
  }
});

test('the SOCKS5 tunnel offers username/password only with credentials, and keeps the bytes after its reply', () => {
  const t = new ProxyTunnel(parseProxy('socks5://ab:cd@p:1'), 'play.colauloanthe.vn', 1688);
  assert.deepEqual([...t.start()], [5, 2, 0, 2]);
  assert.deepEqual([...t.receive(Buffer.from([5, 2])).send!], [1, 2, 0x61, 0x62, 2, 0x63, 0x64]);
  const name = [...Buffer.from('play.colauloanthe.vn')];
  assert.deepEqual([...t.receive(Buffer.from([1, 0])).send!], [5, 1, 0, 3, name.length, ...name, 0x06, 0x98]);
  // The reply one byte at a time, its last byte in the same chunk as the start of the seed.
  for (const b of [5, 0, 0, 1, 10, 0, 0, 1, 0x04]) assert.equal(t.receive(Buffer.from([b])).rest.length, 0);
  assert.equal(t.open, false);
  assert.deepEqual([...t.receive(Buffer.from([0x38, 0xde, 0xad])).rest], [0xde, 0xad]);
  assert.equal(t.open, true);
  const plain = new ProxyTunnel(parseProxy('socks5://p:1'), '10.1.2.3', 80);
  assert.deepEqual([...plain.start()], [5, 1, 0]);
  assert.deepEqual([...plain.receive(Buffer.from([5, 0])).send!], [5, 1, 0, 1, 10, 1, 2, 3, 0, 80]);
});

test('proxy refusals throw PROXY_AUTH, PROXY_REFUSED or PROXY_PROTOCOL', () => {
  const code = (url: string, ...replies: number[][]) => {
    const t = new ProxyTunnel(parseProxy(url), '1.2.3.4', 1688); t.start();
    try { for (const r of replies) t.receive(Buffer.from(r)); } catch (e) { assert.ok(e instanceof ProtocolError); return [e.code, e.message]; }
    return ['open'];
  };
  assert.deepEqual(code('socks5://p:1', [5, 0xff]), ['PROXY_AUTH', 'The proxy needs a username and password']);
  assert.deepEqual(code('socks5://u:x@p:1', [5, 2], [1, 1]), ['PROXY_AUTH', 'The proxy refused the username or password']);
  assert.deepEqual(code('socks5://p:1', [5, 0], [5, 5]), ['PROXY_REFUSED', 'SOCKS5 proxy: connection refused by the game server']);
  assert.deepEqual(code('socks5://p:1', [0x48, 0x54]), ['PROXY_PROTOCOL', 'Not a SOCKS5 proxy']);
  const http = (url: string, answer: string) => code(url, [...Buffer.from(answer)]);
  assert.deepEqual(http('http://p:1', 'HTTP/1.1 407 Proxy Authentication Required\r\n\r\n'), ['PROXY_AUTH', 'The proxy needs a username and password']);
  assert.deepEqual(http('http://p:1', 'HTTP/1.0 403 Forbidden\r\n\r\n'), ['PROXY_REFUSED', 'HTTP proxy: 403 Forbidden']);
  assert.deepEqual(http('http://p:1', '\x05\x00\r\n\r\n'), ['PROXY_PROTOCOL', 'Not an HTTP proxy answer']);
  const t = new ProxyTunnel(parseProxy('http://u:p@p:1'), 'play.colauloanthe.vn', 1688);
  assert.equal(t.start().toString(), 'CONNECT play.colauloanthe.vn:1688 HTTP/1.1\r\nHost: play.colauloanthe.vn:1688\r\nProxy-Authorization: Basic dTpw\r\n\r\n');
  assert.deepEqual([...t.receive(Buffer.from('HTTP/1.1 200 OK\r\n\r\n\x01\x02')).rest], [1, 2]);
});

test('the whole login runs through a SOCKS5 proxy with a password, the reply sharing a chunk with the seed', async () => {
  const { result, events, seen, gamePort, proxyPort } = await viaProxy(p => `socks5://bot:s3cret@127.0.0.1:${p}`, { kind: 'socks5', username: 'bot', password: 's3cret', coalesce: true }, 'localhost');
  assert.equal(result.ok, true, JSON.stringify(events.filter(e => e.kind === 'lifecycle')));
  assert.equal(result.user.character?.name, 'manina');
  assert.deepEqual(seen, [{ target: `localhost:${gamePort}`, auth: 'bot:s3cret' }]);
  const connected = events.find(e => e.event === 'proxy_connected')!;
  assert.equal(connected.proxy, `socks5 127.0.0.1:${proxyPort}`);
  assert.equal(connected.target, `localhost:${gamePort}`);
  assert.ok(events.findIndex(e => e.event === 'proxy_connected') < events.findIndex(e => e.event === 'seed'));
  assert.ok(!JSON.stringify(events).includes('s3cret'));
});

test('the whole login runs through an HTTP CONNECT proxy', async () => {
  const { result, events, seen } = await viaProxy(p => `http://bot:s3cret@127.0.0.1:${p}`, { kind: 'http', username: 'bot', password: 's3cret' });
  assert.equal(result.ok, true, JSON.stringify(events.filter(e => e.kind === 'lifecycle')));
  assert.equal(seen[0].auth, Buffer.from('bot:s3cret').toString('base64'));
  assert.ok(!JSON.stringify(events).includes('s3cret') && !JSON.stringify(events).includes(seen[0].auth!));
});

test('a wrong proxy password, a dead proxy and a silent proxy fail in state proxy with their own code', async () => {
  const socks = await viaProxy(p => `socks5://bot:wrong@127.0.0.1:${p}`, { kind: 'socks5', username: 'bot', password: 's3cret' });
  assert.deepEqual([socks.result.ok, socks.result.state, socks.result.diagnostic?.code], [false, 'proxy', 'PROXY_AUTH']);
  const http = await viaProxy(p => `http://127.0.0.1:${p}`, { kind: 'http', username: 'bot', password: 's3cret' });
  assert.deepEqual([http.result.state, http.result.diagnostic?.code, http.result.diagnostic?.reason], ['proxy', 'PROXY_AUTH', 'The proxy needs a username and password']);
  const silent = await viaProxy(p => `socks5://127.0.0.1:${p}`, { kind: 'socks5', silent: true });
  assert.deepEqual([silent.result.state, silent.result.diagnostic?.code], ['proxy', 'PROXY_TIMEOUT']);
  const free = net.createServer(); free.listen(0, '127.0.0.1'); await once(free, 'listening');
  const port = (free.address() as net.AddressInfo).port; await new Promise(r => free.close(r));
  const dead = await runClient({ host: '127.0.0.1', port: 1688, mode: 'bootstrap', proxy: `socks5://127.0.0.1:${port}`, responseTimeoutMs: 300, log: () => {} });
  assert.deepEqual([dead.state, dead.diagnostic?.code, dead.diagnostic?.socketCode], ['proxy', 'PROXY_UNREACHABLE', 'ECONNREFUSED']);
});
