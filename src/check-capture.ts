import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { decodeEvent, findEvent } from './events.ts';
import { EXPECTED, FLOW } from './client.ts';
import { PLATFORM, PROTOCOL_VERSION } from './protocol.ts';
import { BASELINE } from './config.ts';

const baseline = BASELINE;
export interface Finding { severity: 'error' | 'warning'; code: string; message: string; index?: number; opcode?: number; direction?: string; details?: unknown }
export function normalizeCapture(input: string): Record<string, any>[] {
  let whole: any;
  try { whole = JSON.parse(input); } catch { /* JSONL is the normal Frida format. */ }
  if (whole?.stages) {
    const rows: Record<string, any>[] = [{ kind: 'capture_metadata', apkSha256: whole.apkSha256 }];
    for (const stage of whole.stages) {
      rows.push({ kind: 'send', op: stage.requestOpcode, len: stage.observedRequestBytes, hex: stage.observedRequestHex, redacted: stage.requestRedacted });
      for (const r of stage.responses) rows.push({ kind: 'receive', op: r.opcode, len: r.bytes, hex: r.hex });
    }
    for (const r of whole.extraPushExamples ?? []) rows.push({ kind: 'receive', op: r.opcode, len: r.bytes, hex: r.hex });
    return rows;
  }
  const raw = Array.isArray(whole) ? whole : whole?.events ?? input.split(/\r?\n/).filter(x => x.trim()).map((line, i) => {
    try { return JSON.parse(line); } catch { throw new Error(`Invalid JSON on line ${i + 1}; capture direct Node.js/agent output, not npm banners`); }
  });
  return raw.map((row: any) => row.type === 'send' ? row.payload : row);
}

export function checkCapture(input: string, mode: 'bootstrap' | 'login' | 'world' = 'world') {
  const rows = normalizeCapture(input), findings: Finding[] = [];
  const add = (severity: Finding['severity'], code: string, message: string, fields: Partial<Finding> = {}) => findings.push({ severity, code, message, ...fields });
  const requests = FLOW.map(s => s.request);
  const required = mode === 'bootstrap' ? requests.slice(0, 3) : mode === 'login' ? requests.slice(0, 7) : requests;
  let requestIndex = 0, state = 'key', packets = 0, haveList = false, haveFlag = false;
  let haveEntities = false, haveSnapshot = false, completed = false, completionReported = false, identityObserved = false;
  let pendingRequired = new Set<number>();
  const sizes = new Map<string, number[]>();
  for (let i = 0; i < rows.length; i++) {
    const x = rows[i];
    if (x?.event === (mode === 'bootstrap' ? 'bootstrap_verified' : mode === 'login' ? 'login_verified_by_character_response' : 'world_initialization_received')) completionReported = true;
    if (x?.kind === 'capture_metadata') {
      const digest = x.apkSha256 ?? x.apk_sha256;
      if (digest) { identityObserved = true; if (digest !== baseline.apkSha256) add('warning', 'APK_CHANGED', 'Capture belongs to a different APK; baseline is not automatically compatible', { index: i, details: { baseline: baseline.apkSha256, observed: digest } }); }
    }
    if (x?.type === 'error' || x?.kind === 'error' || x?.kind === 'missing') add('error', x.kind === 'missing' ? 'NATIVE_HOOK_MISSING' : 'NATIVE_HOOK_ERROR', String(x.error ?? x.description ?? x.part ?? 'Frida agent error'), { index: i });
    if (x?.event === 'failed') add('error', x.code ?? 'CLIENT_FAILED', x.reason, { index: i, details: x });
    const kind = x?.kind ?? x?.event;
    if (!['send', 'receive'].includes(kind)) continue;
    packets++;
    const direction = kind === 'send' ? 'c2s' : 's2c', opcode = x.op ?? x.opcode;
    const details = { index: i, direction, opcode };
    if (!Number.isInteger(opcode) || !findEvent(direction, opcode)) add('warning', 'OPCODE_NEW', 'Opcode absent from the event catalog; inspect mapping/handler before assigning meaning', details);
    const hex = x.hex ?? x.payloadHex, len = x.len ?? x.payloadBytes;
    const key = `${direction}/${opcode}`;
    if (!sizes.has(key)) sizes.set(key, []);
    if (!sizes.get(key)!.includes(len)) sizes.get(key)!.push(len);
    if (direction === 'c2s' && opcode !== 1 && requestIndex < required.length) {
      if (pendingRequired.size) add('error', 'PREVIOUS_RESPONSE_MISSING', 'Next request appears before the preceding required response was captured', { ...details, details: { state, missingReceiveOpcodes: [...pendingRequired] } });
      if (opcode !== required[requestIndex]) add('error', 'REQUEST_ORDER_CHANGED', `Expected c2s/${required[requestIndex]}, observed c2s/${opcode}`, details);
      else requestIndex++;
      state = FLOW.find(s => s.request === opcode)?.state ?? state;
      pendingRequired = new Set(EXPECTED[state]);
      if (haveSnapshot) pendingRequired.delete(1263);
    }
    if (direction === 's2c') pendingRequired.delete(opcode);
    if (typeof hex !== 'string') {
      if (!(direction === 'c2s' && opcode === 4)) add('warning', 'PAYLOAD_MISSING', 'No payload bytes available for schema verification', details);
      continue;
    }
    if (hex.length % 2 || !/^[0-9a-f]*$/i.test(hex)) { add('error', 'INVALID_HEX', 'Payload is not valid hex', details); continue; }
    if (hex.length / 2 !== len) { add('warning', 'CAPTURE_TRUNCATED', 'Stored bytes differ from original payload size; do not classify this as a server schema failure', { ...details, details: { storedBytes: hex.length / 2, originalBytes: len } }); continue; }
    let decoded;
    try { decoded = decodeEvent(direction, opcode, Buffer.from(hex, 'hex')); }
    catch (error) { add(findEvent(direction, opcode)?.phase === 'push' ? 'warning' : 'error', 'SCHEMA_CHANGED', (error as Error).message, { ...details, details: (error as any).details }); continue; }
    const strict = direction === 'c2s' || [-1, 0, 1, 2, 3, 4, 5, 29, 1207, 1209].includes(opcode);
    if (strict && decoded.known && decoded.opaqueBytes) add('error', 'UNEXPECTED_TAIL', 'Known complete schema left unread bytes', { ...details, details: { opaqueBytes: decoded.opaqueBytes } });
    if (direction === 'c2s' && opcode === 1206 && (decoded.fields.platform !== PLATFORM || decoded.fields.protocolVersion !== PROTOCOL_VERSION)) add('error', 'CLIENT_INFO_CHANGED', 'Client platform/protocol version changed', { ...details, details: decoded.fields });
    if (direction !== 's2c') continue;
    if (opcode === 0) add('error', 'SERVER_MESSAGE', String(decoded.fields.text), { ...details, details: decoded.fields });
    if (opcode === 2 && decoded.fields.gate !== '') add('error', 'UNSUPPORTED_BRANCH', 'Nonempty login gate; inspect official UI branch', details);
    if (opcode === 1207) haveList = true;
    if (opcode === 1209) haveFlag = true;
    if (mode === 'bootstrap' && opcode === 5 && haveList && haveFlag) completed = true;
    if (mode === 'login' && opcode === 9) completed = true;
    if (opcode === 43) haveEntities = true;
    if (opcode === 1263) haveSnapshot = true;
    if (mode === 'world' && haveEntities && haveSnapshot) completed = true;
  }
  if (!identityObserved) add('warning', 'IDENTITY_UNKNOWN', 'Capture has no APK digest; compare the actual installed APK separately with check:apk');
  if (!packets) add('error', 'NO_PACKETS', 'No send/receive packet events; inspect module/export hook availability');
  if (requestIndex < required.length) add('error', 'MISSING_REQUEST', `Flow stopped before c2s/${required[requestIndex]}`, { details: { state, remaining: required.slice(requestIndex) } });
  if (!completed && !completionReported) add('error', 'MISSING_RESPONSE', 'Requested completion event was not observed; capture may have ended too early', { details: { state, expectedReceiveOpcodes: EXPECTED[state], haveEntities, haveSnapshot } });
  if (pendingRequired.size) add('error', 'MISSING_REQUIRED_EVENT', 'Capture ended with required response events still pending', { details: { state, missingReceiveOpcodes: [...pendingRequired] } });
  const payloadValidationComplete = !findings.some(f => ['CAPTURE_TRUNCATED', 'PAYLOAD_MISSING'].includes(f.code));
  return { baseline: baseline.baseline, mode, ok: !findings.some(f => f.severity === 'error'), completed, completionReported, payloadValidationComplete, packets, state,
    eventSizes: Object.fromEntries(sizes), findings };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2), modeIndex = args.indexOf('--mode'), mode = modeIndex < 0 ? 'world' : args[modeIndex + 1];
  if (!args[0] || !['bootstrap', 'login', 'world'].includes(mode)) throw new Error('Usage: check-capture.ts capture.jsonl|scenario.json [--mode bootstrap|login|world]');
  const result = checkCapture(readFileSync(args[0], 'utf8'), mode as 'bootstrap' | 'login' | 'world');
  console.log(JSON.stringify(result, null, 2)); if (!result.ok) process.exitCode = 1;
}
