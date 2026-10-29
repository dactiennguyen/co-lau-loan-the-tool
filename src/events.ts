import { Reader, Writer, PLATFORM, PROTOCOL_VERSION, loginPayload, passwordProof,
  sessionKey, notification, characterPrefix, mapPrefix } from './protocol.ts';
import { BASELINE } from './config.ts';

export type Direction = 'c2s' | 's2c';
export type Phase = 'boot' | 'login' | 'world' | 'push';
export interface EventSpec {
  direction: Direction;
  opcode: number;
  /** Analyst label only. No textual event name has been recovered from the binary protocol. */
  name: string;
  phase: Phase;
  trigger: string;
  next: string;
  schema: string;
  confidence: string;
}

const specs: EventSpec[] = [];
function event(direction: Direction, opcode: number, name: string, phase: Phase,
  trigger: string, next: string, schema: string, confidence = 'Đã đo kiểu/byte; tên field chưa rõ được giữ trung tính') {
  specs.push({ direction, opcode, name, phase, trigger, next, schema, confidence });
}
event('c2s', -1, 'key_request', 'boot', 'Sau handshake seed 21 byte', 's2c/-1', 'Rỗng');
event('s2c', -1, 'key_exchange', 'boot', 'Server trả key_request', 'Khôi phục key; reset RX/TX; c2s/1206', 'u8 length=16; maskedKey[16]');
event('c2s', 1206, 'client_info', 'boot', 'Đã bật XOR', 's2c/1207 và s2c/1209', 'string platform; string protocolVersion; i32 field0');
event('s2c', 1207, 'server_list', 'boot', 'Sau client_info', 'Đợi thêm 1209 rồi c2s/5', 'string serverList');
event('s2c', 1209, 'server_flag', 'boot', 'Sau client_info', 'Đợi thêm 1207 rồi c2s/5', 'u8 flag (mẫu 18; ý nghĩa chưa rõ)');
event('c2s', 5, 'notice_request', 'boot', 'Đã nhận danh sách server và flag', 's2c/5', 'i32 serverId; i32 field=-1; u8 flag=1');
event('s2c', 5, 'notification', 'boot', 'Thông báo boot, hoặc thông báo trong giai đoạn khác', 'Boot: chờ bấm login; nhánh khác: dừng và đọc thông báo', 'u8 kind; i32 field0..3; string text');
event('c2s', 1, 'heartbeat_request', 'boot', 'Timer khoảng 2 giây tại login', 's2c/1', 'Rỗng');
event('s2c', 1, 'heartbeat_response', 'boot', 'Trả heartbeat', 'Không gửi ACK riêng', 'Rỗng');
event('s2c', 0, 'server_message', 'login', 'Server gửi thông báo; đã quan sát khi account online nơi khác', 'Đọc text và dừng phiên đang chờ; không coi là sai mật khẩu', 'i8 flag; string text', 'Đã nhận trực tiếp từ server thật bằng Node.js: flag=-1, thông báo account đang đăng nhập nơi khác');
event('c2s', 2, 'login_begin', 'login', 'Người dùng bấm Đăng nhập', 's2c/2', 'Rỗng');
event('s2c', 2, 'login_gate', 'login', 'Trả login_begin', 'String rỗng: c2s/3; khác: nhánh chưa hỗ trợ', 'string gate');
event('c2s', 3, 'challenge_request', 'login', 'Login gate rỗng', 's2c/3', 'Rỗng');
event('s2c', 3, 'password_challenge', 'login', 'Trả challenge_request', 'Tạo proof từ challenge và password; c2s/4', 'bytes challenge (i32 length + raw)');
event('c2s', 4, 'credentials', 'login', 'Đã có password_challenge', 'Push cấu hình và s2c/4', 'string usernameLower; bytes proof; string platform; string version; i32 serverId; i32 usernameHash');
event('s2c', 4, 'authentication_ack', 'login', 'Server chấp nhận credential trong phiên đã đo', 'Body rỗng: c2s/9; khác: nhánh chưa hỗ trợ', 'Rỗng trong nhánh thành công đã đo');
event('c2s', 9, 'character_request', 'world', 'Đã nhận authentication_ack rỗng', 's2c/9', 'string accountLower; u8 flag=2; i32 field=-1');
event('s2c', 9, 'character_data', 'world', 'Trả character_request', 'c2s/30', 'u8 status; u8 field01; string name; i32 numericId; string displayName; u8 flag1,flag2; i32 level,hp,maxHp; opaque tail', 'Getter/byte đã đo; field01 có thể là số nhân vật, chưa chốt; level/HP khớp UI');
event('c2s', 30, 'skills_request', 'world', 'Đã lấy nhân vật', 's2c/30', 'u8 flag=1');
event('s2c', 30, 'skills_data', 'world', 'Trả skills_request; có push khác xen giữa', 'c2s/42', 'Payload 23442 byte trong mẫu; prefix i32, i32, string; phần còn lại opaque', 'Vai trò kỹ năng suy từ chuỗi Hỏa Cầu Thuật; chưa giải schema toàn bộ');
event('c2s', 42, 'character_extra_request', 'world', 'Đã nhận skills_data', 's2c/42', 'string characterName');
event('s2c', 42, 'character_extra', 'world', 'Trả character_extra_request', 'c2s/29', 'Prefix string; phần còn lại opaque', 'Vai trò chưa chốt; prefix chuỗi quan sát từ length/bytes');
event('c2s', 29, 'location_request', 'world', 'Đã nhận character_extra', 's2c/29', 'string characterName');
event('s2c', 29, 'character_location', 'world', 'Trả location_request', 'c2s/11', 'string characterName; string mapId; i32 field');
event('c2s', 11, 'map_request', 'world', 'Đã có mapId', 's2c/11', 'string mapId; u8 area=-1 (ff); i32 field=-1');
event('s2c', 11, 'map_data', 'world', 'Trả map_request', 'c2s/43', 'u8 flag; string mapId,name; u8 area; i32 x,y,field36,dimension1,dimension2; bytes tiles; opaque tail', 'Getter/offset đã đo; x/y và kích thước lưới là suy luận; không gán tên các field còn lại');
event('c2s', 43, 'entities_request', 'world', 'Đã nhận map_data', 's2c/43 và snapshot 1263', 'string mapId');
event('s2c', 43, 'entities_data', 'world', 'Trả entities_request', 'Đồng bộ push thế giới; không gửi ACK nguyên gói', 'Prefix string mapId; u8 field; string entityId,label; opaque tail', 'Prefix thấy trong bytes; ý nghĩa u8 field chưa chốt');

const pushes: [number, string, string, string][] = [
  [1259, 'config_1259', 'Sau c2s/4, trước s2c/4', '5 byte cấu hình, opaque'],
  [1265, 'config_1265', 'Sau c2s/4', '30 byte cấu hình, opaque'],
  [1269, 'config_1269', 'Sau c2s/4', '30 byte cấu hình, opaque'],
  [1271, 'social_links', 'Sau c2s/4', '140 byte; có URL Facebook, chưa giải cấu trúc danh sách'],
  [1272, 'config_1272', 'Sau c2s/4', '47 byte tham số, opaque'],
  [46, 'currency_notice', 'Sau s2c/9', 'Prefix string update Xu; opaque tail'],
  [39, 'quest_data', 'Sau s2c/9', 'Prefix i32, string title, string description; opaque tail'],
  [1195, 'flag_1195', 'Trong đồng bộ nhân vật', 'u8 field'],
  [1220, 'flag_1220', 'Trong đồng bộ nhân vật', 'u8 field'],
  [1177, 'map_special_entity', 'Sau c2s/43', 'Prefix string mapId; có tên Thủ Lĩnh Sơn Tặc; opaque tail'],
  [1263, 'players_snapshot', 'Sau c2s/43 trong mẫu', 'Prefix u16 field0, u8 field2, string firstName; opaque tail'],
  [1262, 'entity_updates', 'Push thường xuyên khi ở bản đồ', 'Giả thuyết: u16 field0; u16 count; count * 16 byte (i32 n1,n2,n3; u8 b1,b2; u16 n4)'],
  [1253, 'update_1253', 'Push thế giới', '17 byte trong mẫu, opaque'],
  [1184, 'update_1184', 'Push thế giới', '108 byte trong mẫu, opaque'],
  [1182, 'entity_1182', 'Push thế giới', 'Prefix string mapId; phần còn lại opaque'],
  [1183, 'entity_1183', 'Push thế giới', 'string mapId; string entityKey; phần còn lại opaque'],
  [1170, 'update_1170', 'Push thế giới', 'i32 field; ý nghĩa chưa rõ'],
  [1167, 'entity_1167', 'Push thế giới', 'u8 field; string name; i32 numericId; opaque tail'],
  [1166, 'update_1166', 'Push thế giới', '28 byte trong mẫu, opaque'],
];
for (const [op, name, trigger, schema] of pushes) {
  event('s2c', op, name, 'push', trigger, 'Không có ACK riêng trong capture; tiếp tục đọc stream', schema,
    'Byte đã đo; ý nghĩa nghiệp vụ/schema một phần là suy luận; phần chưa biết giữ opaque');
}
export const EVENTS = specs;
export const eventKey = (direction: Direction, opcode: number) => `${direction}/${opcode}`;
export function findEvent(direction: Direction, opcode: number | undefined) {
  return specs.find(s => s.direction === direction && s.opcode === opcode);
}

export interface RequestContext {
  username?: string; password?: string; challenge?: Uint8Array; serverId?: number;
  characterName?: string; mapId?: string;
}
function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`Missing request field: ${name}`);
  return value;
}
/** One entry point per observed outgoing event; no UI or socket dependencies. */
export function buildRequest(opcode: number, ctx: RequestContext = {}): Buffer {
  const w = new Writer();
  switch (opcode) {
    case -1: case 1: case 2: case 3: return w.build();
    case 1206: return w.string(PLATFORM).string(PROTOCOL_VERSION).i32(0).build();
    case 5: return w.i32(ctx.serverId ?? BASELINE.observedServerId).i32(-1).u8(1).build();
    case 4: return loginPayload(required(ctx.username, 'username'), passwordProof(required(ctx.challenge, 'challenge'), required(ctx.password, 'password')), ctx.serverId ?? BASELINE.observedServerId);
    case 9: return w.string(required(ctx.username, 'username').toLowerCase()).u8(2).i32(-1).build();
    case 30: return w.u8(1).build();
    case 42: case 29: return w.string(required(ctx.characterName, 'characterName')).build();
    case 11: return w.string(required(ctx.mapId, 'mapId')).u8(-1).i32(-1).build();
    case 43: return w.string(required(ctx.mapId, 'mapId')).build();
    default: throw new Error(`Outgoing event ${opcode} is not implemented`);
  }
}

export function decodeEvent(direction: Direction, opcode: number | undefined, payload: Uint8Array) {
  const spec = findEvent(direction, opcode), r = new Reader(payload);
  let fields: Record<string, unknown> = {};
  if (direction === 'c2s') {
    switch (opcode) {
      case -1: case 1: case 2: case 3: break;
      case 1206: fields = { platform: r.string(), protocolVersion: r.string(), field0: r.i32() }; break;
      case 5: fields = { serverId: r.i32(), field: r.i32(), flag: r.u8() }; break;
      case 4:
        // Even local diagnostics must not log real proof bytes or a reversible wire frame.
        fields = { username: r.string(), proofBytes: r.bytes().length, platform: r.string(), protocolVersion: r.string(), serverId: r.i32(), usernameHash: r.i32(), redacted: true }; break;
      case 9: fields = { account: r.string(), flag: r.u8(), field: r.i32() }; break;
      case 30: fields = { flag: r.u8() }; break;
      case 29: case 42: fields = { characterName: r.string() }; break;
      case 11: fields = { mapId: r.string(), area: r.u8(), field: r.i32() }; break;
      case 43: fields = { mapId: r.string() }; break;
    }
  } else {
    switch (opcode) {
      case 0: { const flag = r.u8(); fields = { flag: flag > 127 ? flag - 256 : flag, text: r.string() }; break; }
      case -1: fields = { keyBytes: sessionKey(payload).length }; r.take(payload.length); break;
      case 1: case 4: break;
      case 1207: fields = { serverList: r.string() }; break;
      case 1209: case 1195: case 1220: fields = { flag: r.u8() }; break;
      case 2: fields = { gate: r.string() }; break;
      case 3: fields = { challenge: r.bytes().toString('hex') }; break;
      case 5: fields = notification(payload); r.take(payload.length); break;
      case 9: fields = characterPrefix(payload); r.take(Number(fields.prefixBytes)); break;
      case 11: fields = mapPrefix(payload); r.take(Number(fields.prefixBytes)); break;
      case 29: fields = { characterName: r.string(), mapId: r.string(), field: r.i32() }; break;
      case 30: fields = { field0: r.i32(), firstId: r.i32(), firstLabel: r.string() }; break;
      case 42: fields = { firstLabel: r.string() }; break;
      case 43: fields = { mapId: r.string(), field: r.u8(), firstEntityId: r.string(), firstLabel: r.string() }; break;
      case 39: fields = { field0: r.i32(), title: r.string(), description: r.string() }; break;
      case 46: fields = { label: r.string() }; break;
      case 1177: case 1182: fields = { mapId: r.string() }; break;
      case 1183: fields = { mapId: r.string(), entityKey: r.string() }; break;
      case 1170: fields = { field: r.i32() }; break;
      case 1167: fields = { field: r.u8(), name: r.string(), numericId: r.i32() }; break;
      case 1263: fields = { field0: r.take(2).readUInt16BE(), field2: r.u8(), firstName: r.string() }; break;
      case 1262: {
        const field0 = r.take(2).readUInt16BE(), count = r.take(2).readUInt16BE();
        if (r.data.length !== 4 + count * 16) throw new Error('Unobserved 1262 record layout: expected 4 + count * 16 bytes');
        const records = [];
        for (let i = 0; i < count; i++) records.push({ n1: r.i32(), n2: r.i32(), n3: r.i32(), b1: r.u8(), b2: r.u8(), n4: r.take(2).readUInt16BE() });
        fields = { interpretation: 'inferred-layout', field0, count, records }; break;
      }
    }
  }
  return { name: spec?.name ?? 'unknown_event', fields, parsedBytes: r.offset, opaqueBytes: payload.length - r.offset, known: Boolean(spec) };
}

export function eventExample(direction: Direction, opcode: number, payload: Uint8Array) {
  const value = decodeEvent(direction, opcode, payload);
  return { ...value, payloadHex: direction === 'c2s' && opcode === 4 ? undefined : Buffer.from(payload).subarray(0, 128).toString('hex'), payloadBytes: payload.length };
}
