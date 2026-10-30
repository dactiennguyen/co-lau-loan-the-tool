import { Reader, Writer, PLATFORM, PROTOCOL_VERSION, loginPayload, passwordProof,
  sessionKey, notification, characterPrefix, mapPrefix } from './protocol.ts';
import { BASELINE } from './config.ts';
import { moveRequest, positions, playerRecord, playerStatus, playersSnapshot, groundItem, zoneList, worldMap,
  questData, questProgress, questComplete, ranking } from './world.ts';

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
event('c2s', 11, 'map_request', 'world', 'Đã có mapId; mapId "M99" khi mở Bản đồ thế giới', 's2c/11', 'string mapId; u8 area=-1 (ff; 00 với "M99"); i32 field=-1');
event('s2c', 11, 'map_data', 'world', 'Trả map_request', 'c2s/43', 'flag 1: u8 flag; string mapId,name; u8 area; i32 x,y,field36,dimension1,dimension2; bytes tiles; opaque tail. flag 0 ("M99"): string "M99"; i32 n; n * {i32 index; string mapId; 17 byte 0; u8 locked; 8 byte 0}; i32 n; n * {i32 index; i32 levelRequired}', 'Getter/offset đã đo; x/y và kích thước lưới là suy luận; nhánh M99 đọc hết 1132 byte, cấp yêu cầu khớp nhãn Lv. trên bản đồ');
event('c2s', 43, 'entities_request', 'world', 'Đã nhận map_data', 's2c/43 và snapshot 1263', 'string mapId');
event('s2c', 43, 'entities_data', 'world', 'Trả entities_request', 'Đồng bộ push thế giới; không gửi ACK nguyên gói', 'Prefix string mapId; u8 field; string entityId,label; opaque tail', 'Prefix thấy trong bytes; ý nghĩa u8 field chưa chốt');

event('c2s', 1169, 'player_move', 'world', 'Nhân vật đang chạy/nhảy/rơi; ~110 ms một gói', 'Server phát lại trong s2c/1262', 'i32 x; i32 y; i32 state; u8 flags[5]', 'Đo bằng thao tác joystick: state 0 đứng, 1 chạy, 5 lên, 6 rơi, 7 chạm đất; flags[2] trái, flags[3] phải');
event('c2s', 1172, 'zone_list_request', 'world', 'Mở bảng chọn khu', 's2c/1172', 'Rỗng');
event('s2c', 1172, 'zone_list', 'world', 'Trả zone_list_request', 'Người chơi chọn khu: c2s/1173', 'u8 n; n * {u8 zone; u8 load; u8 players; u8 capacity}', 'Đo: khớp từng ô "Dân số" trên màn hình; load 0/1/2 theo số người');
event('c2s', 13, 'npc_talk', 'world', 'Nói chuyện với NPC của bước nhiệm vụ', 's2c/34 (lời thoại); trả nhiệm vụ: s2c/35, 39', 'string mapId; i32 npcId', 'Đo: npcId lấy từ bước nhiệm vụ trong s2c/39; bot Node gửi và server chấp nhận');
event('c2s', 10, 'add_stat_point', 'world', 'Bấm cộng điểm tiềm năng', 's2c/10 kiểu 2, 4, 8', 'i32 stat; i32 amount', 'Thấy 10 lần, đều 0 và 1; tên field là suy luận');
event('c2s', 1215, 'mail_request', 'world', 'Mở Hòm thư', 's2c/1215', 'Rỗng');
event('s2c', 1215, 'mail_list', 'world', 'Trả mail_request', 'Không', 'i32 n; bản ghi thư chưa thấy (n = 0)', 'Đo 1 lần, hòm thư trống');
event('c2s', 1196, 'friends_request', 'world', 'Mở Bạn bè', 's2c/1196', 'Rỗng');
event('s2c', 1196, 'friend_list', 'world', 'Trả friends_request', 'Không', 'i32 n; bản ghi bạn chưa thấy (n = 0)', 'Đo 1 lần, chưa có bạn');
event('c2s', 1254, 'ranking_request', 'world', 'Mở BXH hoặc đổi tab', 's2c/1254 kiểu 0 (tab) rồi kiểu 1 (danh sách)', 'u8 tab; mở lần đầu chỉ có u8 0, đổi tab gửi u8 tab; u8 1');
event('s2c', 1254, 'ranking', 'world', 'Trả ranking_request', 'Không', 'u8 kind; 0: u8 n; n * {u8 tab; string title; string column}; u8. 1: u8 tab; i32 n; n * {i32 rank; i32 id; string name; i32; i32 level}; i32 ownRank; i32; i32 ownLevel', 'Đọc hết byte; manina hạng 1094 khớp màn hình');
event('c2s', 1240, 'season_request', 'world', 'Mở Bảo Điển', 's2c/1240', 'Rỗng');
event('s2c', 1240, 'season_info', 'world', 'Trả season_request', 'Không', 'u8 (0 = chưa có mùa)', 'Đo 1 lần');
event('c2s', 1241, 'season_quests_request', 'world', 'Mở Bảo Điển', 's2c/1241', 'Rỗng');
event('s2c', 1241, 'season_quests', 'world', 'Trả season_quests_request', 'Không', 'u8 (0 = chưa có nhiệm vụ mùa)', 'Đo 1 lần');
event('c2s', 1265, 'faction_request', 'world', 'Mở Sứ quân', 's2c/1265', 'u8 lệnh: 0 = sứ quân của mình; 1 + 6 byte = danh sách', 'Đo 1 lần mỗi lệnh');

const pushes: [number, string, string, string, string?][] = [
  [1259, 'config_1259', 'Sau c2s/4, trước s2c/4', '5 byte cấu hình, opaque'],
  [1265, 'faction', 'Sau c2s/4 (lệnh 100, 30 byte) và khi mở Sứ quân', 'u8 lệnh; 100: cấu hình; 0: sứ quân của mình (16 byte 0 khi chưa vào); 1: danh sách (tên, cấp, số người/20, kiểu duyệt)', 'Lệnh đọc được; từng trường danh sách chưa giải'],
  [1269, 'config_1269', 'Sau c2s/4', '30 byte cấu hình, opaque'],
  [1271, 'social_links', 'Sau c2s/4', '140 byte; có URL Facebook, chưa giải cấu trúc danh sách'],
  [1272, 'config_1272', 'Sau c2s/4', '47 byte tham số, opaque'],
  [46, 'currency_notice', 'Sau s2c/9', 'Prefix string update Xu; opaque tail'],
  [39, 'quest_data', 'Sau s2c/9 và khi nhận nhiệm vụ mới', 'i32 questId; string title; string description; string type; i32 current; i32 progress; i32 n; n * {i32 index; string text; i32 param; i32 required; i32 npcId}', 'Đọc hết byte 3 mẫu; current khớp bước tô xanh trên bảng Nhiệm vụ'],
  [34, 'quest_progress', 'Sau khi nói chuyện với NPC, diệt quái của nhiệm vụ, nhận nhiệm vụ', 'i32 0; string "subtask 1"; i32 questId; string dialogue', 'Đọc hết byte'],
  [35, 'quest_complete', 'Trả nhiệm vụ', 'i32 questId; string title; i32 n; n * string reward; string message', 'Đọc hết byte 1 mẫu'],
  [1261, 'counter_1261', 'Định kỳ ~36 s (log bot)', '10 byte: u8 0x13; i32 bộ đếm tăng 1; u8 3; i32 0', 'Chưa rõ'],
  [1195, 'flag_1195', 'Trong đồng bộ nhân vật', 'u8 field'],
  [1220, 'flag_1220', 'Trong đồng bộ nhân vật', 'u8 field'],
  [1177, 'map_special_entity', 'Sau c2s/43', 'Prefix string mapId; có tên Thủ Lĩnh Sơn Tặc; opaque tail'],
  [1263, 'players_snapshot', 'Sau c2s/43: mọi người chơi khác trong khu', 'u16 n; n * {player record; status như s2c/1212}', 'Đọc hết byte; số bản ghi + mình = "Dân số" của khu trong s2c/1172'],
  [1262, 'player_positions', 'Mỗi 100 ms khi có người đổi vị trí', 'u16 tickMs=100; u16 n; n * {i32 id; i32 x; i32 y; u8 state; u8 flags; u16 field14}', 'Đo: bản ghi id của mình lặp đúng x/y/state của c2s/1169; flags = bitmask flags[0..3] của 1169; field14 chưa rõ'],
  [1253, 'player_hp', 'Người chơi khác đổi HP/cấp/trang bị', 'i32 id; i32 level; i32 hp; i32 maxHp; u8 field', 'Đo: maxHp giảm theo từng món tháo ở s2c/1166, cấp tăng khi lên cấp'],
  [1184, 'ground_items', 'Vào map: vật phẩm đang nằm trên đất', 'string mapId; i32 n; n * item record (như s2c/1182)', 'Đọc hết byte; vai trò vật phẩm rơi là suy luận'],
  [1182, 'ground_item_add', 'Có vật phẩm rơi xuống đất', 'string mapId; item record: u8 0xfe; i32 itemId; string uuid; i32; i32 durability; i32 quantity; u8; u8 grade; i32; u8; u8; u8 n; n * {i32 stat; i32 value}; i32 x; i32 y; i64 expiresAt', 'Đọc hết byte; rơi theo nhóm cách 32 đơn vị, hạn 600 s; tên "vật phẩm rơi" là suy luận'],
  [1183, 'ground_item_remove', 'Vật phẩm bị nhặt hoặc hết hạn', 'string mapId; string uuid', 'uuid khớp s2c/1182 trước đó'],
  [1170, 'player_leave', 'Người chơi rời khu; cặp 1170→1167 cùng mili giây là xuất hiện lại', 'i32 id'],
  [1167, 'player_enter', 'Người chơi vào khu hoặc xuất hiện lại', 'player record: u8 kind; string name; i32 id; string displayName; u8; u8; i32 level,hp,maxHp,s1,s1Max; u16; i32 x,y; i32 gear[6]; appearance; i32; string faction; u8; u8', 'Đọc hết byte 60 mẫu; khối appearance (bảng màu) chưa đặt tên'],
  [1166, 'player_gear', 'Người chơi khác đổi trang bị', 'i32 id; i32 gear[6]', 'Đo: 6 số trùng gear trong player record; tháo đồ thì về 0'],
  [1212, 'player_status', 'Người chơi vào khu hoặc đổi trạng thái', 'i32 id; u8 mode; mode 2: u8 n; n * {u8; i32 effect; u8}; u8 / khác: {u8; i32 effect; u8}', 'Đọc hết byte; effect 9300..9302 chưa rõ nghĩa'],
  [1205, 'world_chat', 'Có người chat kênh Thế giới', 'i32 senderId; string name; string text', 'Đo 3 tin; server che từ cấm bằng *'],
  [45, 'boss_broadcast', 'Vào map và định kỳ', 'string text ("BOSS … đang ở <map>: khu …")'],
];
for (const [op, name, trigger, schema, confidence] of pushes) {
  event('s2c', op, name, 'push', trigger, 'Không có ACK riêng trong capture; tiếp tục đọc stream', schema,
    confidence ?? 'Byte đã đo; ý nghĩa nghiệp vụ/schema một phần là suy luận; phần chưa biết giữ opaque');
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
    case -1: case 1: case 2: case 3: case 1172: return w.build();
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
      case -1: case 1: case 2: case 3: case 1172: case 1215: case 1196: case 1240: case 1241: break;
      case 13: fields = { mapId: r.string(), npcId: r.i32() }; break;
      case 10: fields = { stat: r.i32(), amount: r.i32() }; break;
      case 1254: fields = payload.length > 1 ? { tab: r.u8(), field: r.u8() } : { tab: r.u8() }; break;
      case 1265: fields = { command: r.u8() }; break;
      case 1169: fields = moveRequest(payload); r.take(payload.length); break;
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
      case 11:
        if (payload[0] === 0) { fields = worldMap(payload); r.take(payload.length); }
        else { fields = mapPrefix(payload); r.take(Number(fields.prefixBytes)); }
        break;
      case 29: fields = { characterName: r.string(), mapId: r.string(), field: r.i32() }; break;
      case 30: fields = { field0: r.i32(), firstId: r.i32(), firstLabel: r.string() }; break;
      case 42: fields = { firstLabel: r.string() }; break;
      case 43: fields = { mapId: r.string(), field: r.u8(), firstEntityId: r.string(), firstLabel: r.string() }; break;
      case 39: fields = questData(payload); r.take(payload.length); break;
      case 34: fields = questProgress(payload); r.take(payload.length); break;
      case 35: fields = questComplete(payload); r.take(payload.length); break;
      case 1254: fields = ranking(payload); r.take(payload.length); break;
      case 1215: case 1196: fields = { count: r.i32() }; break;
      case 1240: case 1241: fields = { flag: r.u8() }; break;
      case 1265: fields = { command: r.u8() }; break;
      case 46: fields = { label: r.string() }; break;
      case 1177: fields = { mapId: r.string() }; break;
      case 1182: fields = { mapId: r.string(), ...groundItem(r) }; break;
      case 1184: { const mapId = r.string(), items = []; for (let n = r.i32(); n > 0; n--) items.push(groundItem(r)); fields = { mapId, items }; break; }
      case 1183: fields = { mapId: r.string(), uuid: r.string() }; break;
      case 1170: fields = { id: r.i32() }; break;
      case 1166: fields = { id: r.i32(), gear: Array.from({ length: 6 }, () => r.i32()) }; break;
      case 1253: fields = { id: r.i32(), level: r.i32(), hp: r.i32(), maxHp: r.i32(), field: r.u8() }; break;
      case 1167: fields = playerRecord(r); break;
      case 1212: fields = playerStatus(r); break;
      case 1263: fields = playersSnapshot(payload); r.take(payload.length); break;
      case 1262: fields = positions(payload); r.take(payload.length); break;
      case 1172: fields = zoneList(payload); r.take(payload.length); break;
      case 1205: fields = { senderId: r.i32(), name: r.string(), text: r.string() }; break;
      case 45: fields = { text: r.string() }; break;
    }
  }
  return { name: spec?.name ?? 'unknown_event', fields, parsedBytes: r.offset, opaqueBytes: payload.length - r.offset, known: Boolean(spec) };
}

export function eventExample(direction: Direction, opcode: number, payload: Uint8Array) {
  const value = decodeEvent(direction, opcode, payload);
  return { ...value, payloadHex: direction === 'c2s' && opcode === 4 ? undefined : Buffer.from(payload).subarray(0, 128).toString('hex'), payloadBytes: payload.length };
}
