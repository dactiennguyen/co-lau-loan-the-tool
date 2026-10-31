import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { inspectApk } from '../src/cli/check-apk.ts';

function zip(files: Record<string, string>, method = 0) {
  const locals: Buffer[] = [], directory: Buffer[] = []; let offset = 0;
  for (const [filename, text] of Object.entries(files)) {
    const name = Buffer.from(filename), data = Buffer.from(text), packed = method === 8 ? deflateRawSync(data) : data;
    let crc = 0xffffffff;
    for (const byte of data) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    crc = (crc ^ 0xffffffff) >>> 0;
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(packed.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(packed.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(offset, 42);
    locals.push(local, name, packed); directory.push(central, name); offset += local.length + name.length + packed.length;
  }
  const end = Buffer.alloc(22), entries = Object.keys(files).length;
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries, 8); end.writeUInt16LE(entries, 10); end.writeUInt32LE(Buffer.concat(directory).length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...directory, end]);
}

test('Node APK comparison reads stored/deflated members and reports changed code/hooks', async t => {
  const folder = mkdtempSync(join(tmpdir(), 'cllt-apk-test-')); t.after(() => rmSync(folder, { recursive: true, force: true }));
  for (const method of [0, 8]) {
    const path = join(folder, `update-${method}.apk`); writeFileSync(path, zip({ 'classes.dex': 'changed dex', 'lib/arm64-v8a/libgdx-flashds.so': 'changed native' }, method));
    const result = await inspectApk(path, { baseline: 'test', apkSha256: 'old', members: { 'classes.dex': 'old', 'lib/arm64-v8a/libgdx-flashds.so': 'old' }, symbolMarkers: { reader: '__old_native_reader' } });
    assert.equal(result.sameBuild, false); assert.equal(result.runtimeCompatibility, 'unverified');
    assert.deepEqual(new Set(result.findings.map(x => x.code)), new Set(['APK_CHANGED', 'DEX_CHANGED', 'NATIVE_CHANGED', 'HOOK_MARKER_MISSING']));
    const missing = await inspectApk(path, { baseline: 'test', apkSha256: 'old', members: { 'missing.so': 'old' }, symbolMarkers: {} });
    assert.ok(missing.findings.some(x => x.code === 'MEMBER_MISSING'));
  }
});

test('matching APK bytes and native marker are recognized without executing the artifact', async t => {
  const folder = mkdtempSync(join(tmpdir(), 'cllt-apk-test-')); t.after(() => rmSync(folder, { recursive: true, force: true }));
  const native = 'binary __reader_marker data', name = 'lib/arm64-v8a/libgdx-flashds.so';
  const bytes = zip({ [name]: native }), path = join(folder, 'baseline.apk'); writeFileSync(path, bytes);
  const digest = (x: Buffer | string) => createHash('sha256').update(x).digest('hex');
  const result = await inspectApk(path, { baseline: 'test', apkSha256: digest(bytes), members: { [name]: digest(native) }, symbolMarkers: { reader: '__reader_marker' } });
  assert.equal(result.sameBuild, true); assert.deepEqual(result.findings, []);
  writeFileSync(path, 'not a zip'); await assert.rejects(inspectApk(path), /ZIP\/APK/);
});
