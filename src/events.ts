import { Reader, Writer, PLATFORM, PROTOCOL_VERSION, loginPayload, passwordProof,
  sessionKey, notification, characterPrefix, characterProfile, characterLocation, mapPrefix } from './protocol.ts';
import { BASELINE } from './config.ts';
import { mapData, mapChange, mapEntities, mapBoss, notice, characterStats, moveRequest, positions, playerRecord, playerStatus, playersSnapshot, groundItem, groundItems,
  zoneList, worldMap, questData, questProgress, questComplete, ranking, skillTable, inventory, characterExtra, currencies, gearUpdate } from './world.ts';
import { battleSetup, battleJoinAck, turnState, battleResult, timeoutResult, type Move } from './battle.ts';

export type Direction = 'c2s' | 's2c';
export type Phase = 'boot' | 'login' | 'world' | 'battle' | 'push';
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
event('s2c', 0, 'server_message', 'login', 'Server gửi thông báo; đã quan sát khi account online nơi khác', 'Đọc text và dừng phiên đang chờ; không coi là sai mật khẩu', 'i8 flag; string text', 'Đã nhận trực tiếp từ server thật bằng kết nối kiểm chứng độc lập: flag=-1, thông báo account đang đăng nhập nơi khác');
event('c2s', 2, 'login_begin', 'login', 'Người dùng bấm Đăng nhập', 's2c/2', 'Rỗng');
event('s2c', 2, 'login_gate', 'login', 'Trả login_begin', 'String rỗng: c2s/3; khác: nhánh chưa quan sát', 'string gate');
event('c2s', 3, 'challenge_request', 'login', 'Login gate rỗng', 's2c/3', 'Rỗng');
event('s2c', 3, 'password_challenge', 'login', 'Trả challenge_request', 'Tạo proof từ challenge và password; c2s/4', 'bytes challenge (i32 length + raw)');
event('c2s', 4, 'credentials', 'login', 'Đã có password_challenge', 'Push cấu hình và s2c/4', 'string usernameLower; bytes proof; string platform; string version; i32 serverId; i32 usernameHash');
event('s2c', 4, 'authentication_ack', 'login', 'Server chấp nhận credential trong phiên đã đo', 'Body rỗng: c2s/9; khác: nhánh chưa quan sát', 'Rỗng trong nhánh thành công đã đo');
event('c2s', 9, 'character_request', 'world', 'Đã nhận authentication_ack rỗng', 's2c/9', 'string accountLower; u8 flag=2; i32 field=-1');
event('s2c', 9, 'character_data', 'world', 'Trả character_request', 'c2s/30', 'u8 status; u8 field01; string name; i32 numericId; string displayName; u8 flag1,flag2; i32 level,hp,maxHp; i32 s1,s1Max; i32 stats[10]; i32 combat[5]; i32 exp,coin,field; i32 statPoints,skillPoints; i32 levelExp[2]; string labels[2]; u8[6]; i32 x,y; i32 n; n × kỹ năng {i32 mã; i32 cấp; i32; u8}; i32 8; 8 × (0xff | vật phẩm); i32; khối ngoại hình; i32 n; n × hiệu ứng {string khoá; i32 tỉLệ; i32; i32 msCònLại}; i32; string sứ quân; u8; u8', 'Prefix: getter native, level/HP khớp UI; field01 không phải số nhân vật: bằng flag1 ở cả ba mẫu (1, 1, 4), là hệ nhân vật (1 Hỏa, 4 Thủy; K1). Đuôi: ba mẫu (A2 cấp 3, 30/10 cấp 21, nick thứ hai 31/10 cấp 2) cùng bố cục; hai mẫu đầu khớp s2c/10 và x/y của s2c/11; statPoints khớp bảng Chỉ số (68 ở E2), skillPoints = cấp − 1 − số điểm đã dùng ở cả ba mẫu; đuôi sau x/y đọc hết byte ở symap (P4: hiệu ứng x2 EXP "ef7", sứ quân "Thiên Tôn") và manina');
event('c2s', 30, 'skills_request', 'world', 'Đã lấy nhân vật', 's2c/30', 'u8 element (field01 của s2c/9: 1 Hỏa, 4 Thủy)', 'Đo: app gửi 1 cho manina (Hỏa); K1: gửi 4 cho nick thứ hai (field01 4) thì nhận cây Thủy 4000–4008, gửi 1 thì nhận cây Hỏa');
event('s2c', 30, 'skills_data', 'world', 'Trả skills_request; có push khác xen giữa', 'c2s/42', 'i32 n; n * {i32 skillId; string name; i32 prerequisiteId (-1 = không); i32 maxLevel; maxLevel * {i32 level; string description; i32 skillPointCost; i32 requiredLevel; i32 manaCost}}', 'Đọc hết 23442 byte mẫu A2: 9 kỹ năng hệ Hỏa (1000–1008); điều kiện từng cấp khớp chi tiết kỹ năng trên máy (E1); K1: cây Thủy 4000–4008 cùng bố cục');
event('c2s', 42, 'character_extra_request', 'world', 'Đã nhận skills_data', 's2c/42', 'string characterName');
event('s2c', 42, 'character_extra', 'world', 'Trả character_extra_request', 'c2s/29', 'string label ("test dong 1"); i32 42; i32 3; túi đồ: u8 2; i32 capacity; i32 n; n * item record (như s2c/1187)', 'Đọc hết 608 byte (E1): 8 món khớp túi trên máy; i32 42, i32 3 sau label chưa rõ');
event('c2s', 29, 'location_request', 'world', 'Đã nhận character_extra', 's2c/29', 'string characterName');
event('s2c', 29, 'character_location', 'world', 'Trả location_request', 'c2s/11', 'string characterName; string mapId; i32 field');
event('c2s', 11, 'map_request', 'world', 'Đã có mapId; mapId "M99" khi mở Bản đồ thế giới', 's2c/11', 'string mapId; u8 area=-1 (ff; 00 với "M99"); i32 field=-1');
event('s2c', 11, 'map_data', 'world', 'Trả map_request', 'c2s/43', 'flag 1: u8 flag; string mapId,name; u8 area; i32 x,y,field36,dimension1,dimension2; bytes tiles; bytes lớp 2; bytes lớp 3; i32 ×3; i32 n; n * {i32 id; string tên; u8 loại (0 cổng, 2 NPC); i32 x,y,w,h; u8; i32 p,q}; i32 ×3. flag 0 ("M99"): string "M99"; i32 n; n * {i32 index; string mapId; 17 byte 0; u8 locked; 8 byte 0}; i32 n; n * {i32 index; i32 levelRequired}', 'Getter/offset đã đo; x/y và kích thước lưới là suy luận; nhánh M99 đọc hết 1132 byte, cấp yêu cầu khớp nhãn Lv. trên bản đồ; danh sách NPC/cổng đọc hết byte M1, M2 (B5)');
event('c2s', 43, 'entities_request', 'world', 'Đã nhận map_data', 's2c/43 và snapshot 1263', 'string mapId');
event('s2c', 43, 'entities_data', 'world', 'Trả entities_request', 'Đồng bộ push thế giới; không gửi ACK nguyên gói', 'string mapId; u8 field; tới hết payload: {string mobId; string name; i32 level; u8 a; i32 b; i32 c; u8 d}', 'Đọc hết byte: M1 khu 0 (1398 byte), khu 1 (bot Q2); ý nghĩa field, a..d chưa chốt; không có toạ độ quái');

event('c2s', 1169, 'player_move', 'world', 'Nhân vật đang chạy/nhảy/rơi; ~110 ms một gói', 'Server phát lại trong s2c/1262', 'i32 x; i32 y; i32 state; u8 flags[5]', 'Đo bằng thao tác joystick: state 0 đứng, 1 chạy, 5 lên, 6 rơi, 7 chạm đất; flags[2] trái, flags[3] phải');
event('c2s', 1173, 'change_zone', 'world', 'Chọn khu trong bảng Khu vực', 's2c/13 rồi c2s/11, c2s/43 của khu mới', 'u8 zone', 'Đo B2: khu 20');
event('s2c', 13, 'zone_changed', 'world', 'Trả change_zone (c2s/1173), hoặc c2s/13 với id cổng', 'c2s/11 với mapId, khu mới', 'Đổi khu: string mapId; i32 zone. Qua cổng: string mapId; i32 thứ tự map trong bản đồ thế giới (M1 0, M2 1, M25 24); u8 0; u8 0xff', 'Đo B2 (đổi khu); qua cổng B5, Q16, S1: số sau mapId luôn khớp thứ tự map');
event('c2s', 1172, 'zone_list_request', 'world', 'Mở bảng chọn khu', 's2c/1172', 'Rỗng');
event('s2c', 1172, 'zone_list', 'world', 'Trả zone_list_request', 'Người chơi chọn khu: c2s/1173', 'u8 n; n * {u8 zone; u8 load; u8 players; u8 capacity}', 'Đo: khớp từng ô "Dân số" trên màn hình; load 0/1/2 theo số người');
event('c2s', 13, 'npc_talk', 'world', 'Nói chuyện với NPC của bước nhiệm vụ, hoặc bấm Vào ở một cổng (id cổng trong s2c/11)', 'NPC: s2c/34 (lời thoại), trả nhiệm vụ: s2c/35, 39. Cổng: s2c/13 với map mới', 'string mapId; i32 npcId', 'Đo: npcId lấy từ bước nhiệm vụ trong s2c/39; bot Node gửi và server chấp nhận. Cổng 1015 (M1 → M2) đo B5');
event('c2s', 10, 'add_stat_point', 'world', 'Bấm cộng điểm tiềm năng', 's2c/10 kiểu 2, 4, 8', 'i32 stat; i32 amount', 'L1: 10 lần (0, 1), Cường Lực; P1: (2, 1), Thân Pháp. stat là nút + trên bảng Chỉ số, theo hàng: 0 Cường Lực, 1 Nội Lực (suy luận), 2 Thân Pháp, 3 Thể Lực');
event('c2s', 1191, 'skill_upgrade', 'world', 'Bấm Nâng cấp ở tab Kỹ năng (sqgu.a4 → sqlq.e52(skillId, 1)); bước nhiệm vụ "Sử dụng điểm kỹ năng"', 's2c/10 kiểu 32 và s2c/1191; ở bước nhiệm vụ thêm s2c/34', 'i32 skillId; i32 amount', 'Đo trên dây K1: 00000fa0 00000001 (Băng Tiễn Thuật 4000), server trả trong 30 ms; E1 3 lần qua tham số hàm dựng (1000, 1)');
event('c2s', 1188, 'pickup_item', 'world', 'Chạm hòm đồ trên đất rồi bấm Nhặt (sqhz.d21 → sqlq.c44(uuid))', 's2c/46 (Xu khóa vào ví), s2c/1256 "Bạn vừa nhận được …", s2c/1183 (hòm rời khỏi đất, cả map)', 'string uuid (của s2c/1182, s2c/1184)', 'Đo P3 trên máy 1 lần: Xu khóa ×474 ở M10, server trả trong 52–56 ms');
event('c2s', 48, 'repair_item', 'world', 'Sửa chữa ở chi tiết trang bị rồi OK (sqh.run1 ← sqaj.a5 → sqlq.c47)', 's2c/1187 rồi s2c/48', 'u8 where (0: ô trang bị); i32 slot', 'Đo E2 (nón, 00 00000000) và P4 (vũ khí, 00 00000002); mỗi lần tốn 1 Búa sửa chữa');
event('c2s', 1186, 'equip_item', 'world', 'Trang bị (món trong túi) hoặc Cởi ra (món đang mặc) ở chi tiết vật phẩm (sqe.a2, sqf.run1 → sqlq.b45)', 's2c/10 kiểu 4, s2c/37 (8 ô trang bị), s2c/42 (cả túi), s2c/1186, s2c/1166 và s2c/1212 cho cả khu', 'u8 action (0: mặc món ở ô túi, 1: cởi món ở ô trang bị); i32 slot', 'Đo P4: cởi thú cưng 01 00000005, mặc lại 00 00000027 (ô 39 của túi)');
event('c2s', 84, 'use_item', 'world', 'Sử dụng ở chi tiết vật phẩm trong túi (sqe.a2 → sqlq.i79)', 's2c/1256 "Vật phẩm không thể sử dụng!" với Hoàn Linh Dược ngoài trận', 'i32 slot (ô túi)', 'Đo P4 1 lần: 00000003 (Hoàn Linh Dược), server từ chối');
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

event('c2s', 15, 'challenge_mob', 'battle', 'Nhân vật va vào quái; bot gửi từ xa cũng được', 's2c/22 sau ~2,5 s', 'string mobId; u8 flag=0', 'Đo: B1 2 lần, bot Q1/Q2 11 lần');
event('s2c', 22, 'battle_setup', 'battle', 'Trả challenge_mob', 'c2s/18 với uuid trận', 'khối người chơi; khối quái; string battleUuid; i32 64; u8[64] bàn; u8 turnSeconds; u8', 'Đuôi (uuid, bàn, giây/lượt) đo; khối nhân vật mới đọc tên, cấp, HP; phần còn lại opaque');
event('c2s', 18, 'battle_join', 'battle', '~1,1 s sau s2c/22', 's2c/18', 'string battleUuid');
event('s2c', 18, 'battle_join_ack', 'battle', 'Trả battle_join', 'timed 0: c2s/14 seq 0 (theo lượt, quái đi trước); 1: c2s/19 liên tục (trận tính giờ)', 'i32 field0; u8 timed; u8 field5', 'Đo: 0 ở mọi trận Gà Điên, Heo Mọi, Kẻ Gây Rối, Chỉ Huy; 1 ở mọi trận Sơn Tặc (Q6–Q9): không có s2c/24, server bỏ qua c2s/14, nhận c2s/19 bất cứ lúc nào');
event('s2c', 24, 'turn_state', 'battle', 'Sau mỗi kết quả nước đi (~1 s), hoặc khi người chơi hết 30 s', 'playerTurn 1: c2s/19; 0: c2s/14', 'i32 seq; i32 field; u8 playerTurn; u8 field9', 'Đo: B1 21 bước, Q1/Q2 228 gói');
event('c2s', 14, 'battle_step_request', 'battle', 'Sau s2c/18 (seq 0) và sau s2c/24 playerTurn 0', 's2c/19 hoặc s2c/20: nước của quái', 'string battleUuid; i32 seq', 'Đo: không lần nào lệch seq');
event('c2s', 19, 'swap_pieces', 'battle', 'Người chơi đổi hai viên kề nhau trong lượt của mình', 's2c/19 lặp lại nước vừa gửi; nước sai không được trả lời', 'string battleUuid; i32 seq; i32 row1+2, col1+2, row2+2, col2+2', 'Đo: nước kéo tay, bot run4 và Q2');
event('s2c', 19, 'move_result', 'battle', 'Trả swap_pieces hoặc battle_step_request', 's2c/24 sau ~1 s; end 1: trận kết thúc', 'i32 seq; i32 0; u32 seed; i32 row1+2, col1+2, row2+2, col2+2; i32 1; i32 n; u8[n] viên mới; u8 reshuffled; [i32 64; u8[64] bàn mới]; 3 byte; u8 m; m * {string name; i32 damage; u8; i32 hp; i32 stat1; i32 stat2}; u8 flags[4]; string actor; u8 end; end 1: u8 won; i32 exp; i32 coin; opaque tail', 'Đọc hết byte: 111 gói trận B1, 223 mẫu đủ byte Q1/Q2 (trừ đuôi khi end 1); damage/hp khớp HUD; stat1, stat2, flags[0], flags[2] chưa rõ');
event('c2s', 20, 'use_skill', 'battle', 'Người chơi dùng kỹ năng trong lượt của mình', 's2c/20 với actor là người chơi', 'string battleUuid; i32 seq; i32 skillId', 'Đo Q9: server trả s2c/20 với actor là người chơi (Hỏa Cầu Thuật 62 sát thương, 122 khi thanh sức mạnh đầy). Bố cục suy từ hàm dựng gói sqlq.f75(int skillId, int seq), ghi tham số cuối trước như a74');
event('s2c', 20, 'skill_result', 'battle', 'Trả battle_step_request khi quái dùng kỹ năng', 's2c/24', 'i32 seq; i32 0; u32 seed; i32 skillId; i32; i32 k; k * {i32 row+2; i32 col+2} mục tiêu; i32 j; j * {i32 row+2; i32 col+2} ô bị phá; i32 1; rồi như s2c/19 từ i32 n', 'Đọc hết byte: B1 1 mẫu, Q2 1 mẫu (kỹ năng 2000: k = 0, j = 3 hoặc 1 ô ngẫu nhiên), Q4 (kỹ năng 1000: k = 2, j = 8 = hai khối 2×2)');
event('s2c', 21, 'timed_attack', 'battle', 'Trận tính giờ: quái đánh theo đồng hồ ~25–31 s, không cần đổi viên', 'Người chơi đi tiếp; end 1: trận kết thúc', 'i32 seq; i32 0; i32 0; rồi như s2c/19 từ u8 m (units, flags, actor, end, phần thưởng)', 'Đọc hết byte (Q6–Q8): Sơn Tặc đánh 46 mỗi lần; lần thứ ba end 1 (thua)');
event('c2s', 1178, 'challenge_boss', 'battle', 'Nhân vật va vào boss của s2c/1177 (sqhz.a18 → sqlq.b121(mobId, false))', 's2c/22 sau ~2,8 s, rồi trận như c2s/15', 'string mobId; i32 flag=0', 'Đo B4 1 lần (Thủ Lĩnh Sơn Tặc mob86100201); boss bỏ qua c2s/15');
event('c2s', 40, 'battle_leave', 'battle', 'Đầu hàng (nút Đầu hàng → OK), cùng lúc với c2s/11', 's2c/11, s2c/10, s2c/1214 rồi c2s/43', 'string battleUuid', 'Đo B2 4 lần; kết thúc bình thường không có gói này');
event('s2c', 36, 'durability', 'battle', 'Cùng lúc kết quả cuối trận, và sau đầu hàng', 'Không', 'i32 8; i32 0; 8 byte (B1) hoặc 12 byte (từ Q2). Byte 8 và i32 ở offset 11 giảm dần qua các trận, ff là ô trống', 'Đo giá trị qua 60 trận; vai trò độ bền trang bị là suy luận (về 0 thì HP tối đa và sát thương tụt)');
event('s2c', 1214, 'battle_end_1214', 'battle', 'Cuối trận, sau đầu hàng hoặc huỷ trận', 'Không', 'Rỗng', 'Đo; vai trò chưa rõ');

const pushes: [number, string, string, string, string?][] = [
  [1259, 'config_1259', 'Sau c2s/4, trước s2c/4', '5 byte cấu hình, opaque'],
  [1265, 'faction', 'Sau c2s/4 (lệnh 100, 30 byte) và khi mở Sứ quân', 'u8 lệnh; 100: cấu hình; 0: sứ quân của mình (16 byte 0 khi chưa vào); 1: danh sách (tên, cấp, số người/20, kiểu duyệt)', 'Lệnh đọc được; từng trường danh sách chưa giải'],
  [1269, 'config_1269', 'Sau c2s/4', '30 byte cấu hình, opaque'],
  [1271, 'social_links', 'Sau c2s/4', '140 byte; có URL Facebook, chưa giải cấu trúc danh sách'],
  [1272, 'config_1272', 'Sau c2s/4', '47 byte tham số, opaque'],
  [46, 'currency_notice', 'Sau s2c/9; khi tiền đổi (trả nhiệm vụ)', 'string label ("update Xu"); i64 xu; i64 xuKhoa; i64 luong', 'Đọc hết 37 byte; E1 (31/10) 500, 7370, 0 khớp bảng Bản thân: 500 Xu, 7.370 Xu khoá, 0 Lượng'],
  [10, 'character_stats', 'Sau trận (kiểu 4); khi lên cấp và mỗi điểm tiềm năng (kiểu 2, 4, 8 liền nhau); sau c2s/1191 (kiểu 32)', 'i32 kind; string name; kind 2: i32 level; i32 stats[10]. Kind 4: i32 hp, maxHp, exp; i32 levelExp[2]; i32 coin; i32 extra[6]. Kind 8: i32 statPoints; i32 fields[3]; string labels[2]. Kind 32: i32 n; n * {i32 skillId; i32 level}', 'Đọc hết byte 4 kiểu (L1, Q2, E1, P1); EXP và tiền khớp phần thưởng trận; stats[0] tăng 1 mỗi điểm Cường Lực, stats[1] mỗi điểm Thân Pháp, statPoints giảm 10 → 0; extra[1..5] là combat của s2c/9 (tấn công, phòng thủ, chính xác, né tránh, chí mạng: khớp bảng ở P1), fields[0] là điểm kỹ năng (16 ở P1, khớp bảng), extra[0], labels chưa rõ; kiểu 32 tăng cấp Hỏa Cầu Thuật 1 → 4'],
  [1187, 'inventory', 'Túi đồ đổi: trả nhiệm vụ, sửa đồ', 'u8 1; i32 capacity; i32 n; n * item record: u8 slot; i32 itemId; string uuid; i32; i32 durability (-1 = không có); i32 quantity; u8; u8 element; i32; u8; u8; u8 k; k * {i32 stat; i32 value}', 'Đọc hết 519 byte (E2): 7 món khớp túi trên máy; cùng bản ghi với s2c/1182 trừ x, y, hạn'],
  [1191, 'skill_points', 'Sau c2s/1191', 'i32 statPoints; i32 skillPoints', 'Đo E1 3 lần: 68 và 18, 17, 16, khớp bảng Chỉ số và Kỹ năng'],
  [48, 'repair_ack', 'Sau c2s/48 và s2c/1187', 'u8 where; i32 slot (giống c2s/48)', 'Đo E2, P4'],
  [37, 'gear_update', 'Sau c2s/1186 (mặc hoặc cởi đồ)', 'i32 0; u8 0x40; string name; i32 8; 8 * (u8 0xff | item record)', 'Đọc hết byte 2 mẫu (P4): 350 byte khi cởi thú cưng, 423 khi mặc lại'],
  [1186, 'equip_result', 'Sau c2s/1186, sau s2c/42', 'i32 action (lặp lại action của c2s/1186)', 'Đo P4: 1 khi cởi, 0 khi mặc'],
  [1256, 'notice_1256', 'Cuối trận thua (Q6); cổng chưa đủ cấp sau c2s/13; c2s/11 cho map khác; nhặt được đồ (P3)', 'u8 field; string text ("Thua trận, mất 16 kinh nghiệm", "Bạn phải đạt cấp 40 mới vào được Lạc Cốc", "Không thể chuyển khu vực", "Bạn vừa nhận được 474 Xu khóa")', 'Đọc hết byte 5 mẫu (Q6, Q15, S1, P3)'],
  [1201, 'step_progress', 'Sau mỗi trận được tính cho bước nhiệm vụ đang làm', 'i32 progress: số con đã diệt, hoặc tổng sát thương lên boss', 'Đo: Q2–Q9 tăng 1 sau mỗi trận thắng (1…9); B4 363 = sát thương lên boss sau trận thua'],
  [1200, 'signal_1200', 'Ngay sau s2c/19 end 1, và sau s2c/35 khi trả nhiệm vụ', 'Rỗng', 'Đo; vai trò chưa rõ'],
  [39, 'quest_data', 'Sau s2c/9 và khi nhận nhiệm vụ mới', 'i32 questId; string title; string description; string type; i32 current; i32 progress; i32 n; n * {i32 index; string text; i32 param; i32 required; i32 npcId}', 'Đọc hết byte 3 mẫu; current khớp bước tô xanh trên bảng Nhiệm vụ'],
  [34, 'quest_progress', 'Sau khi nói chuyện với NPC, diệt quái của nhiệm vụ, nhận nhiệm vụ', 'i32 0; string "subtask 1"; i32 questId; string dialogue', 'Đọc hết byte'],
  [35, 'quest_complete', 'Trả nhiệm vụ', 'i32 questId; string title; i32 n; n * string reward; string message', 'Đọc hết byte 1 mẫu'],
  [1261, 'counter_1261', 'Định kỳ ~36 s (log bot)', '10 byte: u8 0x13; i32 bộ đếm tăng 1; u8 3; i32 0', 'Chưa rõ'],
  [1195, 'flag_1195', 'Trong đồng bộ nhân vật', 'u8 field'],
  [1220, 'flag_1220', 'Trong đồng bộ nhân vật', 'u8 field'],
  [1177, 'map_boss', 'Sau c2s/43: boss của map; và khi boss đổi chỗ', 'string mapId; u8 field. field 0: {string mobId; string name; i32 level; u8 a; i32 b; i32 c; u8 d}; u8 1; i32 cột; i32 hàng. field 1: string mobId (boss rời ô, ~13 s sau có field 0 với ô mới)', 'Đọc hết byte: Q9, Q10, Q13, B4, B5, Q16. Cột/hàng là suy luận: luôn nằm trong lưới 156×23 của M1, đổi sau mỗi field 1'],
  [1263, 'players_snapshot', 'Sau c2s/43: mọi người chơi khác trong khu', 'u16 n; n * {player record; status như s2c/1212}', 'Đọc hết byte; số bản ghi + mình = "Dân số" của khu trong s2c/1172'],
  [1262, 'player_positions', 'Mỗi 100 ms khi có người đổi vị trí', 'u16 tickMs=100; u16 n; n * {i32 id; i32 x; i32 y; u8 state; u8 flags; u16 field14}', 'Đo: bản ghi id của mình lặp đúng x/y/state của c2s/1169; flags = bitmask flags[0..3] của 1169; field14 chưa rõ'],
  [1253, 'player_hp', 'Người chơi khác đổi HP/cấp/trang bị', 'i32 id; i32 level; i32 hp; i32 maxHp; u8 field', 'Đo: maxHp giảm theo từng món tháo ở s2c/1166, cấp tăng khi lên cấp'],
  [1184, 'ground_items', 'Vào map: vật phẩm đang nằm trên đất', 'string mapId; i32 n; n * item record (như s2c/1182)', 'Đọc hết byte; vai trò vật phẩm rơi là suy luận'],
  [1182, 'ground_item_add', 'Có vật phẩm rơi xuống đất', 'string mapId; item record: u8 0xfe; i32 itemId; string uuid; i32; i32 durability; i32 quantity; u8; u8 element; i32; u8; u8; u8 n; n * {i32 stat; i32 value}; i32 x; i32 y; i64 expiresAt', 'Đọc hết byte; rơi theo nhóm cách 32 đơn vị, hạn 600 s; tên "vật phẩm rơi" là suy luận'],
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
  characterName?: string; mapId?: string; npcId?: number; zone?: number; stat?: number; amount?: number;
  mobId?: string; battleUuid?: string; seq?: number; move?: Move; skill?: number; skillId?: number;
  /** uuid of an item on the ground (s2c/1182, s2c/1184) for c2s/1188. */
  uuid?: string;
  /** Bag or gear slot for c2s/1186, c2s/84, c2s/48; action 0 equip (bag slot), 1 unequip (gear slot); where 0 = gear. */
  slot?: number; action?: number; where?: number;
  /** The character's element, field01 of s2c/9 (1 Hỏa, 4 Thủy): c2s/30 asks for the skill tree of that element. */
  element?: number;
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
    // The app sends the element of s2c/9 (sqlq.e49(1) for manina, Hỏa); with 4 the server sends the Thủy tree 4000–4008.
    case 30: return w.u8(ctx.element ?? 1).build();
    case 42: case 29: return w.string(required(ctx.characterName, 'characterName')).build();
    case 11: return w.string(required(ctx.mapId, 'mapId')).u8(-1).i32(-1).build();
    case 43: return w.string(required(ctx.mapId, 'mapId')).build();
    case 13: return w.string(required(ctx.mapId, 'mapId')).i32(required(ctx.npcId, 'npcId')).build();
    case 10: return w.i32(required(ctx.stat, 'stat')).i32(required(ctx.amount, 'amount')).build();
    // Nâng cấp in the Kỹ năng tab: sqlq.e52(skillId, amount) writes two i32 like c2s/10 (E1).
    case 1191: return w.i32(required(ctx.skillId, 'skillId')).i32(required(ctx.amount, 'amount')).build();
    case 1173: return w.u8(required(ctx.zone, 'zone')).build();
    // Nhặt in the dialog of a chest on the ground: sqlq.c44(uuid) (P3).
    case 1188: return w.string(required(ctx.uuid, 'uuid')).build();
    // Chi tiết vật phẩm (P4): Trang bị / Cởi ra sqlq.b45(action, slot), Sử dụng sqlq.i79(slot), Sửa chữa sqlq.c47(where, slot).
    case 1186: return w.u8(required(ctx.action, 'action')).i32(required(ctx.slot, 'slot')).build();
    case 84: return w.i32(required(ctx.slot, 'slot')).build();
    case 48: return w.u8(ctx.where ?? 0).i32(required(ctx.slot, 'slot')).build();
    case 15: return w.string(required(ctx.mobId, 'mobId')).u8(0).build();
    case 1178: return w.string(required(ctx.mobId, 'mobId')).i32(0).build();
    case 18: case 40: return w.string(required(ctx.battleUuid, 'battleUuid')).build();
    case 14: return w.string(required(ctx.battleUuid, 'battleUuid')).i32(required(ctx.seq, 'seq')).build();
    case 20: return w.string(required(ctx.battleUuid, 'battleUuid')).i32(required(ctx.seq, 'seq')).i32(required(ctx.skill, 'skill')).build();
    case 19: {
      const { from, to } = required(ctx.move, 'move');
      return w.string(required(ctx.battleUuid, 'battleUuid')).i32(required(ctx.seq, 'seq')).i32(from[0] + 2).i32(from[1] + 2).i32(to[0] + 2).i32(to[1] + 2).build();
    }
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
      case 1173: fields = { zone: r.u8() }; break;
      case 15: fields = { mobId: r.string(), flag: r.u8() }; break;
      case 1178: fields = { mobId: r.string(), flag: r.i32() }; break;
      case 18: case 40: fields = { battleUuid: r.string() }; break;
      case 14: fields = { battleUuid: r.string(), seq: r.i32() }; break;
      case 20: fields = { battleUuid: r.string(), seq: r.i32(), skill: r.i32() }; break;
      case 19: fields = { battleUuid: r.string(), seq: r.i32(), from: [r.i32() - 2, r.i32() - 2], to: [r.i32() - 2, r.i32() - 2] }; break;
      case 10: fields = { stat: r.i32(), amount: r.i32() }; break;
      case 1191: fields = { skillId: r.i32(), amount: r.i32() }; break;
      case 1188: fields = { uuid: r.string() }; break;
      case 1186: fields = { action: r.u8(), slot: r.i32() }; break;
      case 84: fields = { slot: r.i32() }; break;
      case 48: fields = { where: r.u8(), slot: r.i32() }; break;
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
      case 9: {
        // The tail layout comes from two captures; when it does not fit, keep the verified prefix and leave the rest opaque.
        try { fields = characterProfile(payload); r.take(Number(fields.profileBytes)); }
        catch { fields = characterPrefix(payload); r.take(Number(fields.prefixBytes)); }
        break;
      }
      case 11:
        if (payload[0] === 0) { fields = worldMap(payload); r.take(payload.length); }
        else { fields = mapData(payload); r.take(payload.length); }
        break;
      case 29: fields = characterLocation(payload); r.take(payload.length); break;
      // The whole skill tree is ~23 KB of descriptions; the log keeps each skill's id, name, prerequisite and level count.
      case 30: fields = { skills: skillTable(payload).skills.map(({ levels, ...s }) => ({ ...s, maxLevel: levels.length })) }; r.take(payload.length); break;
      case 42: fields = characterExtra(payload); r.take(payload.length); break;
      case 37: fields = gearUpdate(payload); r.take(payload.length); break;
      case 1186: fields = { action: r.i32() }; break;
      case 43: fields = mapEntities(payload); r.take(payload.length); break;
      case 13: fields = mapChange(payload); r.take(payload.length); break;
      case 22: fields = battleSetup(payload); r.take(Number(fields.knownBytes)); break;
      case 18: fields = battleJoinAck(r); break;
      case 21: fields = timeoutResult(r); break;
      case 24: fields = turnState(r); break;
      case 19: case 20: fields = battleResult(r, opcode); break;
      case 10: fields = characterStats(r); break;
      case 1201: fields = { progress: r.i32() }; break;
      case 1256: fields = notice(payload); r.take(payload.length); break;
      case 36: case 1214: case 1200: break;
      case 1187: fields = inventory(payload); r.take(payload.length); break;
      case 1191: fields = { statPoints: r.i32(), skillPoints: r.i32() }; break;
      case 48: fields = { where: r.u8(), slot: r.i32() }; break;
      case 39: fields = questData(payload); r.take(payload.length); break;
      case 34: fields = questProgress(payload); r.take(payload.length); break;
      case 35: fields = questComplete(payload); r.take(payload.length); break;
      case 1254: fields = ranking(payload); r.take(payload.length); break;
      case 1215: case 1196: fields = { count: r.i32() }; break;
      case 1240: case 1241: fields = { flag: r.u8() }; break;
      case 1265: fields = { command: r.u8() }; break;
      case 46: fields = currencies(payload); r.take(payload.length); break;
      case 1177: fields = mapBoss(payload); r.take(payload.length); break;
      case 1182: fields = { mapId: r.string(), ...groundItem(r) }; break;
      case 1184: fields = groundItems(payload); r.take(payload.length); break;
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
