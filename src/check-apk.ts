import { createReadStream, closeSync, fstatSync, openSync, readFileSync, readSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import { BASELINE } from './config.ts';

const defaultBaseline = BASELINE;
interface Baseline { baseline: string; apkSha256: string; members: Record<string, string>; symbolMarkers: Record<string, string> }
interface Entry { method: number; flags: number; compressedBytes: number; bytes: number; localOffset: number }

/** Read only selected APK members. APK signing blocks do not change ZIP central-directory offsets. */
function selectedMembers(path: string, names: string[]) {
  const fd = openSync(path, 'r');
  try {
    const size = fstatSync(fd).size;
    const read = (offset: number, bytes: number) => {
      if (offset < 0 || bytes < 0 || offset + bytes > size) throw new Error('ZIP range outside file');
      const data = Buffer.alloc(bytes);
      let total = 0;
      while (total < bytes) {
        const n = readSync(fd, data, total, bytes - total, offset + total);
        if (!n) throw new Error('Unexpected end of ZIP'); total += n;
      }
      return data;
    };
    const tail = read(Math.max(0, size - 65557), Math.min(size, 65557));
    let end = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50 && i + 22 + tail.readUInt16LE(i + 20) === tail.length) { end = i; break; }
    }
    if (end < 0) throw new Error('Not a supported ZIP/APK: end-of-central-directory missing');
    const count = tail.readUInt16LE(end + 10), centralBytes = tail.readUInt32LE(end + 12), centralOffset = tail.readUInt32LE(end + 16);
    if (tail.readUInt16LE(end + 4) || tail.readUInt16LE(end + 6) || count === 0xffff || centralOffset === 0xffffffff || centralBytes > 64 * 1024 * 1024) throw new Error('Multi-disk/ZIP64 or oversized ZIP is unsupported');
    const central = read(centralOffset, centralBytes), entries = new Map<string, Entry>();
    let cursor = 0;
    for (let i = 0; i < count; i++) {
      if (cursor + 46 > central.length || central.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Invalid ZIP central directory');
      const nameBytes = central.readUInt16LE(cursor + 28), extra = central.readUInt16LE(cursor + 30), comment = central.readUInt16LE(cursor + 32);
      const next = cursor + 46 + nameBytes + extra + comment;
      if (next > central.length) throw new Error('Truncated ZIP entry');
      const name = central.subarray(cursor + 46, cursor + 46 + nameBytes).toString('utf8');
      if (names.includes(name)) {
        if (entries.has(name)) throw new Error(`Duplicate ZIP member ${name}`);
        entries.set(name, { method: central.readUInt16LE(cursor + 10), flags: central.readUInt16LE(cursor + 8), compressedBytes: central.readUInt32LE(cursor + 20), bytes: central.readUInt32LE(cursor + 24), localOffset: central.readUInt32LE(cursor + 42) });
      }
      cursor = next;
    }
    const output = new Map<string, Buffer>();
    for (const [name, entry] of entries) {
      if (entry.flags & 1 || entry.bytes > 128 * 1024 * 1024 || entry.compressedBytes > 128 * 1024 * 1024) throw new Error(`Unsupported encrypted/oversized member ${name}`);
      const local = read(entry.localOffset, 30);
      if (local.readUInt32LE() !== 0x04034b50) throw new Error(`Invalid local ZIP header for ${name}`);
      const dataOffset = entry.localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
      const compressed = read(dataOffset, entry.compressedBytes);
      const data = entry.method === 0 ? compressed : entry.method === 8 ? inflateRawSync(compressed, { maxOutputLength: Math.max(1, entry.bytes) }) : null;
      if (!data || data.length !== entry.bytes) throw new Error(`Unsupported compression or wrong size for ${name}`);
      output.set(name, data);
    }
    return output;
  } finally { closeSync(fd); }
}

export async function inspectApk(path: string, baseline: Baseline = defaultBaseline) {
  const hash = createHash('sha256'); for await (const chunk of createReadStream(path)) hash.update(chunk);
  const sha256 = hash.digest('hex'), sameBuild = sha256 === baseline.apkSha256;
  const findings: Record<string, unknown>[] = [], members: Record<string, unknown> = {}, nativeSymbolMarkers: Record<string, unknown> = {};
  if (!sameBuild) findings.push({ code: 'APK_CHANGED', message: 'Different APK bytes; runtime compatibility is unverified' });
  const extracted = selectedMembers(path, Object.keys(baseline.members));
  for (const [name, previous] of Object.entries(baseline.members)) {
    const data = extracted.get(name);
    if (!data) { findings.push({ code: 'MEMBER_MISSING', member: name }); continue; }
    const current = createHash('sha256').update(data).digest('hex'); members[name] = { sha256: current, same: current === previous };
    if (current !== previous) findings.push({ code: name.endsWith('.so') ? 'NATIVE_CHANGED' : 'DEX_CHANGED', member: name });
    if (name.endsWith('libgdx-flashds.so')) {
      for (const [label, marker] of Object.entries(baseline.symbolMarkers)) {
        const found = data.includes(Buffer.from(marker)); nativeSymbolMarkers[label] = { marker, found };
        if (!found) findings.push({ code: 'HOOK_MARKER_MISSING', hook: label, marker });
      }
    }
  }
  return { baseline: baseline.baseline, apk: path, sha256, sameBuild, runtimeCompatibility: sameBuild ? 'baseline only' : 'unverified', members, nativeSymbolMarkers, findings,
    limitations: 'Marker byte-string search is not ELF export resolution or behavior verification. ZIP64/multi-disk/encrypted ZIP and members over 128 MiB are unsupported.' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (!args[0]) throw new Error('Usage: check-apk.ts file.apk [--baseline baseline.json]');
  const index = args.indexOf('--baseline');
  try {
    const baseline = index < 0 ? defaultBaseline : JSON.parse(readFileSync(args[index + 1], 'utf8'));
    const result = await inspectApk(args[0], baseline); console.log(JSON.stringify(result, null, 2)); if (!result.sameBuild) process.exitCode = 1;
  } catch (error) { console.log(JSON.stringify({ sameBuild: false, findings: [{ code: 'APK_INPUT_ERROR', message: (error as Error).message }] })); process.exitCode = 2; }
}
