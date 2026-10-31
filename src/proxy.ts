import net from 'node:net';
import { ProtocolError } from './protocol.ts';

/** A proxy the client reaches the game server through: SOCKS5 (RFC 1928/1929) or an HTTP proxy with CONNECT. The
 * game protocol is unchanged; only the TCP connection goes through the proxy (docs/integration/nodejs/README.md#proxy). */
export interface Proxy { kind: 'socks5' | 'http'; host: string; port: number; username?: string; password?: string }

const SCHEMES: Record<string, Proxy['kind']> = { 'socks5:': 'socks5', 'socks5h:': 'socks5', 'socks:': 'socks5', 'http:': 'http' };

/** CLLT_PROXY: socks5://[user:pass@]host:port (socks5h:// and socks:// too) or http://[user:pass@]host:port. The error
 * never repeats the text, which may hold the proxy's password. */
export function parseProxy(text: string): Proxy {
  let url: URL;
  try { url = new URL(text.trim()); } catch { throw new Error('Invalid proxy: expected socks5://host:port or http://host:port'); }
  const kind = SCHEMES[url.protocol];
  if (!kind) throw new Error(`Unsupported proxy scheme ${url.protocol} (socks5:// or http://)`);
  const host = url.hostname.replace(/^\[(.*)\]$/, '$1');
  if (!host) throw new Error('Invalid proxy: no host');
  const port = url.port ? Number(url.port) : kind === 'http' ? 80 : 1080;
  const username = url.username ? decodeURIComponent(url.username) : undefined;
  const password = url.password ? decodeURIComponent(url.password) : undefined;
  if (kind === 'socks5' && (Buffer.byteLength(username ?? '') > 255 || Buffer.byteLength(password ?? '') > 255)) throw new Error('SOCKS5 username and password are at most 255 bytes');
  return { kind, host, port, username, password };
}

/** For logs: kind and address, never the credentials. */
export const proxyLabel = (p: Proxy) => `${p.kind} ${p.host.includes(':') ? `[${p.host}]` : p.host}:${p.port}`;

/** SOCKS5 replies other than 0 (RFC 1928 §6). */
const SOCKS_REPLIES: Record<number, string> = {
  1: 'general failure', 2: 'connection not allowed by ruleset', 3: 'network unreachable', 4: 'host unreachable',
  5: 'connection refused by the game server', 6: 'TTL expired', 7: 'command not supported', 8: 'address type not supported',
};
/** An HTTP proxy answer bigger than this without its blank line is not a CONNECT reply. */
const HTTP_HEAD_MAX = 16384;

/**
 * Opens a tunnel to host:port through a proxy, with no I/O of its own: send `start()` once connected to the proxy, then
 * feed every chunk the proxy sends to `receive()` and write back what it returns, until `open`. `rest` is whatever came
 * after the proxy's last reply: the game server's 4-byte seed may share a chunk with it. Failures throw ProtocolError
 * PROXY_AUTH (credentials missing or refused), PROXY_REFUSED (the proxy would not reach the game server) or
 * PROXY_PROTOCOL (not a SOCKS5 / HTTP proxy answer).
 */
export class ProxyTunnel {
  open = false;
  private buffer = Buffer.alloc(0);
  private stage: 'method' | 'auth' | 'connect' | 'http' = 'method';
  readonly proxy: Proxy; readonly host: string; readonly port: number;
  constructor(proxy: Proxy, host: string, port: number) { this.proxy = proxy; this.host = host; this.port = port; }

  start(): Buffer {
    const { kind, username, password } = this.proxy;
    if (kind === 'http') {
      this.stage = 'http';
      const target = `${this.host.includes(':') ? `[${this.host}]` : this.host}:${this.port}`;
      const auth = username !== undefined ? `Proxy-Authorization: Basic ${Buffer.from(`${username}:${password ?? ''}`).toString('base64')}\r\n` : '';
      return Buffer.from(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n${auth}\r\n`);
    }
    // No authentication (0), plus username/password (2) when there are credentials.
    return Buffer.from(username !== undefined ? [5, 2, 0, 2] : [5, 1, 0]);
  }

  receive(chunk: Buffer): { send?: Buffer; rest: Buffer } {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const b = this.buffer, none = { rest: Buffer.alloc(0) };
    switch (this.stage) {
      case 'method': {
        if (b.length < 2) return none;
        if (b[0] !== 5) throw new ProtocolError('PROXY_PROTOCOL', 'Not a SOCKS5 proxy', { proxy: proxyLabel(this.proxy) });
        this.buffer = b.subarray(2);
        if (b[1] === 0) return this.connect();
        if (b[1] === 2 && this.proxy.username !== undefined) {
          this.stage = 'auth';
          const user = Buffer.from(this.proxy.username), pass = Buffer.from(this.proxy.password ?? '');
          return { send: Buffer.concat([Buffer.from([1, user.length]), user, Buffer.from([pass.length]), pass]), rest: Buffer.alloc(0) };
        }
        if (b[1] === 0xff) throw new ProtocolError('PROXY_AUTH', this.proxy.username === undefined ? 'The proxy needs a username and password' : 'The proxy accepts none of the offered authentication methods', { proxy: proxyLabel(this.proxy) });
        throw new ProtocolError('PROXY_PROTOCOL', `SOCKS5 proxy chose method ${b[1]}, which was not offered`, { proxy: proxyLabel(this.proxy) });
      }
      case 'auth':
        if (b.length < 2) return none;
        if (b[1] !== 0) throw new ProtocolError('PROXY_AUTH', 'The proxy refused the username or password', { proxy: proxyLabel(this.proxy) });
        this.buffer = b.subarray(2);
        return this.connect();
      case 'connect': {
        if (b.length < 2) return none;
        if (b[0] !== 5) throw new ProtocolError('PROXY_PROTOCOL', 'Not a SOCKS5 reply', { proxy: proxyLabel(this.proxy) });
        if (b[1] !== 0) throw new ProtocolError('PROXY_REFUSED', `SOCKS5 proxy: ${SOCKS_REPLIES[b[1]] ?? `reply ${b[1]}`}`, { proxy: proxyLabel(this.proxy), socksReply: b[1] });
        if (b.length < 5) return none;
        // VER REP RSV ATYP BND.ADDR BND.PORT: the bound address is IPv4 (1), a name with its length (3) or IPv6 (4).
        const address = b[3] === 1 ? 4 : b[3] === 3 ? 1 + b[4] : b[3] === 4 ? 16 : -1;
        if (address < 0) throw new ProtocolError('PROXY_PROTOCOL', `SOCKS5 reply with address type ${b[3]}`, { proxy: proxyLabel(this.proxy) });
        if (b.length < 4 + address + 2) return none;
        this.open = true;
        return { rest: b.subarray(4 + address + 2) };
      }
      case 'http': {
        const end = b.indexOf('\r\n\r\n');
        if (end < 0) {
          if (b.length > HTTP_HEAD_MAX) throw new ProtocolError('PROXY_PROTOCOL', 'HTTP proxy answer has no end of headers', { proxy: proxyLabel(this.proxy) });
          return none;
        }
        const line = b.subarray(0, b.indexOf('\r\n')).toString('latin1'), status = Number(/^HTTP\/1\.[01] (\d{3})/.exec(line)?.[1]);
        if (!status) throw new ProtocolError('PROXY_PROTOCOL', 'Not an HTTP proxy answer', { proxy: proxyLabel(this.proxy) });
        if (status === 407) throw new ProtocolError('PROXY_AUTH', this.proxy.username === undefined ? 'The proxy needs a username and password' : 'The proxy refused the username or password', { proxy: proxyLabel(this.proxy), httpStatus: status });
        if (status < 200 || status > 299) throw new ProtocolError('PROXY_REFUSED', `HTTP proxy: ${line.slice(9).trim()}`, { proxy: proxyLabel(this.proxy), httpStatus: status });
        this.open = true;
        return { rest: b.subarray(end + 4) };
      }
    }
  }

  /** CONNECT host:port: IPv4 and IPv6 as addresses, anything else as a name the proxy resolves (the game's host). */
  private connect(): { send: Buffer; rest: Buffer } {
    this.stage = 'connect';
    let address: Buffer;
    if (net.isIPv4(this.host)) address = Buffer.from([1, ...this.host.split('.').map(Number)]);
    else if (net.isIPv6(this.host)) address = Buffer.concat([Buffer.from([4]), ipv6(this.host)]);
    else {
      const name = Buffer.from(this.host);
      if (name.length > 255) throw new ProtocolError('PROXY_PROTOCOL', 'Host name too long for SOCKS5');
      address = Buffer.concat([Buffer.from([3, name.length]), name]);
    }
    const port = Buffer.alloc(2); port.writeUInt16BE(this.port);
    return { send: Buffer.concat([Buffer.from([5, 1, 0]), address, port]), rest: Buffer.alloc(0) };
  }
}

/** The 16 bytes of an IPv6 address, :: expanded. */
function ipv6(text: string): Buffer {
  const [head, tail] = text.split('::'), part = (s?: string) => (s ? s.split(':') : []);
  const groups = tail === undefined ? part(head) : [...part(head), ...Array(8 - part(head).length - part(tail).length).fill('0'), ...part(tail)];
  const out = Buffer.alloc(16);
  groups.forEach((g, i) => out.writeUInt16BE(parseInt(g, 16), i * 2));
  return out;
}
