import { BASELINE, OPCODE_ENTRIES } from './config.ts';

export const encodedOpcodes: Map<number, number> = new Map(OPCODE_ENTRIES);
const decodedOpcodes = new Map<number, number>(OPCODE_ENTRIES.map(([op, encoded]) => [encoded, op]));
export const PLATFORM = BASELINE.platform;
export const PROTOCOL_VERSION = BASELINE.protocolVersion;
export const MAX_FRAME = 16 * 1024 * 1024;

export class ProtocolError extends Error {
  code: string;
  details: Record<string, unknown>;
  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message); this.name = 'ProtocolError'; this.code = code; this.details = details;
  }
}

export class Writer {
  chunks: Buffer[] = [];
  i32(value: number): this {
    const b = Buffer.alloc(4); b.writeInt32BE(value | 0); this.chunks.push(b); return this;
  }
  u8(value: number): this { this.chunks.push(Buffer.from([value & 255])); return this; }
  bytes(value: Uint8Array): this { this.i32(value.length); this.chunks.push(Buffer.from(value)); return this; }
  string(value: string): this { return this.bytes(Buffer.from(value, 'utf8')); }
  build(): Buffer { return Buffer.concat(this.chunks); }
}

export class Reader {
  data: Buffer;
  offset = 0;
  constructor(data: Uint8Array) { this.data = Buffer.from(data); }
  take(n: number): Buffer {
    if (!Number.isInteger(n) || n < 0 || n > this.data.length - this.offset) throw new ProtocolError('PAYLOAD_SCHEMA', `Invalid field length ${n} at ${this.offset}`, { offset: this.offset, requestedBytes: n, remainingBytes: this.data.length - this.offset });
    const b = this.data.subarray(this.offset, this.offset + n); this.offset += n; return b;
  }
  u8(): number { return this.take(1)[0]; }
  i32(): number { return this.take(4).readInt32BE(); }
  bytes(): Buffer { return this.take(this.i32()); }
  string(): string { return this.bytes().toString('utf8'); }
}

/** Verified for the observed 16-byte session key. RX and TX need separate objects. */
export class XorStream {
  key: Buffer;
  counter = 0;
  constructor(key: Uint8Array) {
    if (key.length !== 16) throw new ProtocolError('KEY_LAYOUT', 'Only the observed 16-byte session key is supported', { keyBytes: key.length });
    this.key = Buffer.from(key);
  }
  apply(input: Uint8Array): Buffer {
    const out = Buffer.alloc(input.length);
    for (let i = 0; i < input.length; i++) {
      const n = this.counter + 1;
      out[i] = input[i] ^ this.key[n & 15] ^ (n >> 4);
      this.counter = n % this.key.length;
    }
    return out;
  }
}

export function handshake(seed: number): Buffer {
  const b = Buffer.from('000000110101010101000000043b9c50a000000000', 'hex');
  b.writeInt32BE((Math.imul(seed, 2) + 123) | 0, 17); return b;
}

export function sessionKey(payload: Uint8Array): Buffer {
  const b = Buffer.from(payload), n = b[0];
  if (n !== 16 || b.length !== n + 1) throw new ProtocolError('KEY_LAYOUT', 'Unexpected key-exchange body', { declaredKeyBytes: n ?? null, payloadBytes: b.length });
  const out = Buffer.alloc(n); out[0] = b[1];
  for (let i = 1; i < n; i++) out[i] = b[i + 1] ^ out[i - 1];
  return out;
}

export function usernameHash(username: string): number {
  let h = 17;
  for (let i = 0; i < username.length; i++) h = (Math.imul(h, 31) + username.charCodeAt(i)) | 0;
  return h;
}

/** Challenge byte zero is a signed offset; it is not the XOR session key. */
export function passwordProof(challenge: Uint8Array, password: string): Buffer {
  if (!challenge.length) throw new Error('Empty password challenge');
  const pass = Buffer.from(password, 'utf8');
  if (pass.length > 255) throw new Error('Password exceeds the one-byte length supported by this implementation');
  const start = Buffer.from(challenge).readInt8(0) + 1;
  if (start < 0) throw new Error('Unsupported negative challenge offset');
  const out = Buffer.alloc(Math.max(challenge.length, start + pass.length), 0x11);
  Buffer.from(challenge).copy(out);
  for (let i = 0; i < pass.length; i++) out[start + i] ^= pass[i];
  out[0] = pass.length; return out;
}

export function loginPayload(username: string, proof: Uint8Array, serverId = BASELINE.observedServerId): Buffer {
  const name = username.toLowerCase();
  return new Writer().string(name).bytes(proof).string(PLATFORM).string(PROTOCOL_VERSION)
    .i32(serverId).i32(usernameHash(name)).build();
}

export interface Packet { opcode: number | undefined; encodedOpcode: number; payload: Buffer; flags: number }

export class Protocol {
  pending: Buffer = Buffer.alloc(0);
  rx: XorStream | null = null;
  tx: XorStream | null = null;
  enableKey(key: Uint8Array): void { this.rx = new XorStream(key); this.tx = new XorStream(key); }
  encode(opcode: number, payload: Uint8Array = Buffer.alloc(0)): Buffer {
    const encoded = encodedOpcodes.get(opcode);
    if (encoded === undefined) throw new Error(`Opcode ${opcode} is absent from the verified mapping`);
    if (payload.length + 17 > MAX_FRAME) throw new Error('Frame too large');
    const body = Buffer.alloc(4 + payload.length); body.writeInt32BE(encoded); Buffer.from(payload).copy(body, 4);
    const header = Buffer.alloc(13);
    header.writeInt32BE(payload.length + 13); header[4] = 1; header.write('PT01', 5, 'ascii');
    header.writeInt32BE(payload.length, 9);
    return Buffer.concat([header, this.tx ? this.tx.apply(body) : body]);
  }
  /** Handle each yielded frame before requesting the next: opcode -1 enables XOR. */
  *receive(chunk: Uint8Array): Generator<Packet> {
    this.pending = Buffer.concat([this.pending, Buffer.from(chunk)]);
    while (this.pending.length >= 14) {
      const n = this.pending.readInt32BE(2);
      if (n < 14 || n > MAX_FRAME) throw new ProtocolError('FRAME_LENGTH', `Invalid server frame size ${n}`, { declaredFrameBytes: n, bufferedBytes: this.pending.length });
      if (this.pending.length < n) return;
      const frame = Buffer.from(this.pending.subarray(0, n)); this.pending = this.pending.subarray(n);
      const flags = frame.readUInt16BE(0);
      const opBytes = this.rx ? this.rx.apply(frame.subarray(6, 14)) : frame.subarray(6, 14);
      const encodedOpcode = Buffer.from([opBytes[4], opBytes[0], opBytes[6], opBytes[2]]).readInt32BE();
      const payload = this.rx ? this.rx.apply(frame.subarray(14)) : frame.subarray(14);
      yield { opcode: decodedOpcodes.get(encodedOpcode), encodedOpcode, payload, flags };
    }
  }
}

export function notification(payload: Uint8Array) {
  const r = new Reader(payload), kind = r.u8();
  const fields = [r.i32(), r.i32(), r.i32(), r.i32()];
  return { kind, fields, text: r.string() };
}

/** Prefix verified with native sqi getters; later character fields remain opaque. */
export function characterPrefix(payload: Uint8Array) {
  const r = new Reader(payload), status = r.u8(), count = r.u8();
  if (status !== 1 || count !== 1) throw new ProtocolError('UNSUPPORTED_BRANCH', `Unobserved character response: status=${status}, field01=${count}`, { status, field01: count });
  const name = r.string(), numericId = r.i32(), displayName = r.string();
  const flag1 = r.u8(), flag2 = r.u8(), level = r.i32(), hp = r.i32(), maxHp = r.i32();
  return { status, count, name, numericId, displayName, flag1, flag2, level, hp, maxHp, prefixBytes: r.offset };
}

export function mapPrefix(payload: Uint8Array) {
  const r = new Reader(payload), flag = r.u8();
  if (flag !== 1) throw new ProtocolError('UNSUPPORTED_BRANCH', `Unobserved map flag ${flag}`, { flag });
  const mapId = r.string(), name = r.string(), area = r.u8();
  const x = r.i32(), y = r.i32(), field36 = r.i32(), dimension1 = r.i32(), dimension2 = r.i32();
  const tiles = r.bytes();
  return { flag, mapId, name, area, x, y, field36, dimension1, dimension2, tileBytes: tiles.length, prefixBytes: r.offset };
}
