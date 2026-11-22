import { Reader, Writer, PLATFORM, PROTOCOL_VERSION, loginPayload, passwordProof,
  sessionKey, notification, characterPrefix, characterProfile, characterLocation, mapPrefix } from './protocol.ts';
import { BASELINE } from './config.ts';
import { mapData, mapChange, mapEntities, mapBoss, notice, characterStats, moveRequest, positions, playerRecord, playerStatus, playersSnapshot, groundDrop, groundItems,
  zoneList, worldMap, itemUsed, bachHoBoard, bachHoResult, questData, questProgress, questComplete, ranking, skillTable, inventory, characterExtra, currencies, gearUpdate, gearDurability, bagSlot, npcMenu, duelInvite, shopList,
  playerSay, worldChat } from './world.ts';
import { serviceWindow, craftWindow, serviceSlot, stoneSlot, servicePreview, transmuteTarget, serviceResult, stoneResult, putRequest, startRequest, PUT_ITEM } from './npc.ts';
import { giftCodeRequest, giftCodeResult, mailList, mailBody, mailAck, newMail, mailIdRequest, dailyQuest } from './mail.ts';
import { checkinRequest, checkinResult, claimRequest, eventDefinition, eventKeyRequest, eventProgress } from './welfare.ts';
import { market, marketBuyRequest, marketDone, marketListed, marketPageRequest, marketSellRequest, marketTabs, marketWithdrawRequest } from './market.ts';
import { battleSetup, battleJoinAck, turnState, battleResult, timeoutResult, battleItemResult, type Move } from '../battle/battle.ts';

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
event('s2c', 1209, 'server_flag', 'boot', 'Sau client_info', 'Đợi thêm 1207 rồi c2s/5', 'u8 flag; từ APK 1.1.0 thêm, mỗi phần chỉ khi còn byte: i32 sqj (com.mh.d.sqj); u8 sqh (com.mh.a.sqh); i32 tA, i16 tB, u8 tC (com.mh.t.sqa); u8 z (com.mh.z.sqa)', 'Đo: 1.0.3 một byte (18); 1.1.0 (20/11) 14 byte 20 00000005 01 000003e8 0014 01 00. Bố cục đọc từ sqpq.aq (native): byte đầu vào static field, 13 byte sau do bốn hàm static a(sqi) đọc; ý nghĩa chưa rõ');
event('c2s', 5, 'notice_request', 'boot', 'Đã nhận danh sách server và flag', 's2c/5', 'i32 serverId; i32 field=-1; u8 flag=1');
event('s2c', 5, 'notification', 'boot', 'Thông báo boot, hoặc thông báo trong giai đoạn khác', 'Boot: chờ bấm login; nhánh khác: dừng và đọc thông báo', 'u8 kind; i32 field0..3; string text');
event('c2s', 1, 'heartbeat_request', 'boot', 'Timer khoảng 2 giây tại login', 's2c/1', 'Rỗng');
event('s2c', 1, 'heartbeat_response', 'boot', 'Trả heartbeat', 'Không gửi ACK riêng', 'Rỗng');
event('s2c', 0, 'server_message', 'login', 'Server gửi hộp thông báo: lúc đăng nhập khi account online nơi khác; trong game là lời nhắc thường (Hương Lão → Cách tính điểm, Chế tạo thiếu nguyên liệu)', 'Lúc đăng nhập: đọc text và dừng phiên đang chờ, không coi là sai mật khẩu. Trong game: client ghi server_message, giao gói cho phiên và chạy tiếp', 'i8 flag; string text', 'Đã nhận trực tiếp từ server thật bằng kết nối kiểm chứng độc lập: flag=-1, thông báo account đang đăng nhập nơi khác. Trong game cũng flag=-1 (J1, G1, O1)');
event('c2s', 2, 'login_begin', 'login', 'Người dùng bấm Đăng nhập', 's2c/2', 'Rỗng');
event('s2c', 2, 'login_gate', 'login', 'Trả login_begin', 'String rỗng: c2s/3; khác: nhánh chưa quan sát', 'string gate');
event('c2s', 3, 'challenge_request', 'login', 'Login gate rỗng', 's2c/3', 'Rỗng');
event('s2c', 3, 'password_challenge', 'login', 'Trả challenge_request', 'Tạo proof từ challenge và password; c2s/4', 'bytes challenge (i32 length + raw)');
event('c2s', 4, 'credentials', 'login', 'Đã có password_challenge', 'Push cấu hình và s2c/4', 'string usernameLower; bytes proof; string platform; string version; i32 serverId; i32 usernameHash');
event('s2c', 4, 'authentication_ack', 'login', 'Server chấp nhận credential trong phiên đã đo', 'Body rỗng: c2s/9; khác: nhánh chưa quan sát', 'Rỗng trong nhánh thành công đã đo');
event('c2s', 9, 'character_request', 'world', 'Đã nhận authentication_ack rỗng', 's2c/9', 'string accountLower; u8 flag=2; i32 field=-1');
event('s2c', 8, 'character_create_options', 'login', 'Trả c2s/9 khi nick chưa có nhân vật (Open Beta 20/11 xoá nhân vật Alpha)', 'Game hiện màn tạo nhân vật; bot dừng với NO_CHARACTER', 'Chưa giải; 4.008 byte, có tên lựa chọn ngoại hình ("Khôi Ngô", "Ngố") và bảng màu ARGB', 'Đo 1 lần (tiheo2, 20/11 12:02)');
event('s2c', 9, 'character_data', 'world', 'Trả character_request', 'c2s/30', 'u8 status; u8 field01; string name; i32 numericId; string displayName; u8 flag1,flag2; i32 level,hp,maxHp; i32 s1,s1Max; i32 stats[10]; i32 combat[5]; i32 exp,coin,field; i32 statPoints,skillPoints; i32 levelExp[2]; string labels[2]; u8[6]; i32 x,y; i32 n; n × kỹ năng {i32 mã; i32 cấp; i32; u8}; i32 8; 8 × (0xff | vật phẩm); i32; khối ngoại hình; i32 n; n × hiệu ứng {string khoá; i32 tỉLệ; i32; i32 msCònLại}; i32; string sứ quân; u8; u8', 'Prefix: getter native, level/HP khớp UI; field01 không phải số nhân vật: bằng flag1 ở cả ba mẫu (1, 1, 4), là hệ nhân vật (1 Hỏa, 4 Thủy; K1). Đuôi: ba mẫu (A2 cấp 3, 30/10 cấp 21, nick thứ hai 31/10 cấp 2) cùng bố cục; hai mẫu đầu khớp s2c/10 và x/y của s2c/11; statPoints khớp bảng Chỉ số (68 ở E2), skillPoints = cấp − 1 − số điểm đã dùng ở cả ba mẫu; đuôi sau x/y đọc hết byte ở symap (P4: hiệu ứng x2 EXP "ef7", sứ quân "Thiên Tôn") và manina');
event('c2s', 30, 'skills_request', 'world', 'Đã lấy nhân vật', 's2c/30', 'u8 element (field01 của s2c/9: 1 Hỏa, 4 Thủy)', 'Đo: app gửi 1 cho manina (Hỏa); K1: gửi 4 cho nick thứ hai (field01 4) thì nhận cây Thủy 4000–4008, gửi 1 thì nhận cây Hỏa');
event('s2c', 30, 'skills_data', 'world', 'Trả skills_request; có push khác xen giữa', 'c2s/42', 'i32 n; n * {i32 skillId; string name; i32 prerequisiteId (-1 = không); i32 maxLevel; maxLevel * {i32 level; string description; i32 skillPointCost; i32 requiredLevel; i32 manaCost}}', 'Đọc hết 23442 byte mẫu A2: 9 kỹ năng hệ Hỏa (1000–1008); điều kiện từng cấp khớp chi tiết kỹ năng trên máy (E1); K1: cây Thủy 4000–4008 cùng bố cục');
event('c2s', 42, 'character_extra_request', 'world', 'Đã nhận skills_data', 's2c/42', 'string characterName');
event('s2c', 42, 'character_extra', 'world', 'Trả character_extra_request', 'c2s/29', 'string label ("test dong 1"); i32 42; i32 3; túi đồ: u8 2; i32 capacity; i32 n; n * item record (như s2c/1187)', 'Đọc hết 608 byte (E1): 8 món khớp túi trên máy; i32 42, i32 3 sau label chưa rõ');
event('c2s', 29, 'location_request', 'world', 'Đã nhận character_extra', 's2c/29', 'string characterName');
event('s2c', 29, 'character_location', 'world', 'Trả location_request', 'c2s/11', 'string characterName; string mapId; i32 field');
event('c2s', 11, 'map_request', 'world', 'Đã có mapId; mapId "M99" khi mở Bản đồ thế giới', 's2c/11', 'string mapId; u8 area=-1 (ff; 00 với "M99"); i32 field=-1. Sau đổi khu: u8 khu; i32 0 (B2)');
event('s2c', 11, 'map_data', 'world', 'Trả map_request', 'c2s/43', 'flag 1: u8 flag; string mapId,name; u8 area; i32 x,y,field36,dimension1,dimension2; bytes tiles; bytes lớp 2; bytes lớp 3; i32 ×3; i32 n; n * {i32 id; string tên; u8 loại (0 cổng, 2 NPC); i32 x,y,w,h; u8; i32 p,q}; i32 ×3. flag 0 ("M99"): string "M99"; i32 n; n * {i32 index; string mapId; 17 byte 0; u8 locked; 8 byte 0}; i32 n; n * {i32 index; i32 levelRequired}', 'Getter/offset đã đo; x/y và kích thước lưới là suy luận; nhánh M99 đọc hết 1132 byte, cấp yêu cầu khớp nhãn Lv. trên bản đồ; danh sách NPC/cổng đọc hết byte M1, M2 (B5)');
event('c2s', 43, 'entities_request', 'world', 'Đã nhận map_data', 's2c/43 và snapshot 1263', 'string mapId');
event('s2c', 43, 'entities_data', 'world', 'Trả entities_request', 'Đồng bộ push thế giới; không gửi ACK nguyên gói', 'string mapId; u8 field; tới hết payload: {string mobId; string name; i32 level; u8 a; i32 b; i32 c; u8 d}', 'Đọc hết byte: M1 khu 0 (1398 byte), khu 1 (bot Q2); ý nghĩa field, a..d chưa chốt; không có toạ độ quái');

event('c2s', 1169, 'player_move', 'world', 'Nhân vật đang chạy/nhảy/rơi; ~110 ms một gói', 'Server phát lại trong s2c/1262', 'i32 x; i32 y; i32 state; u8 flags[5]', 'Đo bằng thao tác joystick: state 0 đứng, 1 chạy, 5 lên, 6 rơi, 7 chạm đất; flags[2] trái, flags[3] phải');
event('c2s', 1174, 'say', 'world', 'Bấm OK trong hộp Chat của nút bong bóng góc trên bên phải', 's2c/1174 với id của mình và chữ đã che từ cấm', 'string text', 'Đo CH1: 2 tin "chao moi nguoi", không tốn Lượng; hàm dựng sqlq.q120');
event('c2s', 1173, 'change_zone', 'world', 'Chọn khu trong bảng Khu vực', 's2c/13 rồi c2s/11, c2s/43 của khu mới', 'u8 zone', 'Đo B2: khu 20');
event('s2c', 13, 'zone_changed', 'world', 'Trả change_zone (c2s/1173), hoặc c2s/13 với id cổng', 'c2s/11 với mapId, khu mới', 'Qua cổng: string mapId; i32 thứ tự map trong bản đồ thế giới (M1 0, M2 1, M25 24); u8 0; u8 0xff. Đổi khu: như qua cổng nhưng byte cuối là khu mới (Z1); bản B2: string mapId; i32 khu', 'Đo B2 (đổi khu, dạng ngắn), Z1 (bot TS sang khu 4 của M2, 26 ms: 000000024d32 00000001 00 04); qua cổng B5, Q16, S1: số sau mapId luôn khớp thứ tự map');
event('c2s', 1172, 'zone_list_request', 'world', 'Mở bảng chọn khu', 's2c/1172', 'Rỗng');
event('c2s', 1257, 'bag_sort', 'world', 'Nút Sắp xếp dưới túi ở Bản thân → Trang bị (sqlq.l53), không hỏi lại', 's2c/1187 (cả túi, ô đánh số lại), s2c/1111 (rỗng)', 'Rỗng', 'Đo I1: server dồn các món về đầu túi lấp ô trống, giữ thứ tự, trả trong 45 ms');
event('s2c', 1172, 'zone_list', 'world', 'Trả zone_list_request', 'Người chơi chọn khu: c2s/1173', 'u8 n; n * {u8 zone; u8 load; u8 players; u8 capacity}', 'Đo: khớp từng ô "Dân số" trên màn hình; load 0/1/2 theo số người');
event('c2s', 13, 'npc_talk', 'world', 'Nói chuyện với NPC của bước nhiệm vụ, hoặc bấm Vào ở một cổng (id cổng trong s2c/11)', 'NPC: s2c/34 (lời thoại), trả nhiệm vụ: s2c/35, 39. Cổng: s2c/13 với map mới', 'string mapId; i32 npcId', 'Đo: npcId lấy từ bước nhiệm vụ trong s2c/39; bot Node gửi và server chấp nhận. Cổng 1015 (M1 → M2) đo B5');
event('c2s', 10, 'add_stat_point', 'world', 'Bấm cộng điểm tiềm năng', 's2c/10 kiểu 2, 4, 8', 'i32 stat; i32 amount', 'L1: 10 lần (0, 1), Cường Lực; P1: (2, 1), Thân Pháp. stat là nút + trên bảng Chỉ số, theo hàng: 0 Cường Lực, 1 Nội Lực (suy luận), 2 Thân Pháp, 3 Thể Lực');
event('c2s', 1191, 'skill_upgrade', 'world', 'Bấm Nâng cấp ở tab Kỹ năng (sqgu.a4 → sqlq.e52(skillId, 1)); bước nhiệm vụ "Sử dụng điểm kỹ năng"', 's2c/10 kiểu 32 và s2c/1191; ở bước nhiệm vụ thêm s2c/34', 'i32 skillId; i32 amount', 'Đo trên dây K1: 00000fa0 00000001 (Băng Tiễn Thuật 4000), server trả trong 30 ms; E1 3 lần qua tham số hàm dựng (1000, 1)');
event('c2s', 1188, 'pickup_item', 'world', 'Chạm hòm đồ trên đất rồi bấm Nhặt (sqhz.d21 → sqlq.c44(uuid))', 's2c/46 (Xu khóa vào ví) hoặc s2c/51 (món vào túi), s2c/1256 "Bạn vừa nhận được …", s2c/1183 (hòm rời khỏi đất, cả map). Không được: s2c/1256 "Không thể nhặt vật phẩm của người khác" hay "Không thể thực hiện"', 'string uuid (của s2c/1182, s2c/1184)', 'Đo P3 trên máy 1 lần (Xu khóa ×474 ở M10, server trả trong 52–56 ms); K3 bot TS 20 lần: đứng xa 1430 px vẫn nhặt được, đồ người khác khoá ~16–17 s');
event('c2s', 48, 'repair_item', 'world', 'Sửa chữa ở chi tiết trang bị rồi OK (sqh.run1 ← sqaj.a5 → sqlq.c47)', 's2c/1187 rồi s2c/48', 'u8 where (0: ô trang bị); i32 slot', 'Đo E2 (nón, 00 00000000) và P4 (vũ khí, 00 00000002); mỗi lần tốn 1 Búa sửa chữa');
event('c2s', 1186, 'equip_item', 'world', 'Trang bị (món trong túi) hoặc Cởi ra (món đang mặc) ở chi tiết vật phẩm (sqe.a2, sqf.run1 → sqlq.b45); Vứt bỏ rồi đồng ý (sqbz.run1 → sqlq.b45)', 'Mặc, cởi: s2c/10 kiểu 4, s2c/37 (8 ô trang bị), s2c/42 (cả túi), s2c/1186, s2c/1166 và s2c/1212 cho cả khu. Vứt bỏ: s2c/83', 'u8 action (0: mặc món ở ô túi, 1: cởi món ở ô trang bị, 2: vứt bỏ món ở ô túi); i32 slot', 'Đo P4: cởi thú cưng 01 00000005, mặc lại 00 00000027 (ô 39 của túi). Vứt bỏ: action 2 đọc tĩnh ở sqbz.run1, đo K3 02 00000004, server trả s2c/83');
event('c2s', 84, 'use_item', 'world', 'Sử dụng ở chi tiết vật phẩm trong túi (sqe.a2 → sqlq.i79)', 'Tăng Kinh Nghiệm: s2c/84 (ô, số còn lại, hiệu ứng ef7 24 giờ), không gì khác. s2c/1256 "Vật phẩm không thể sử dụng!" với Hoàn Linh Dược ngoài trận. Trứng Gà: s2c/46 (phí), s2c/1187 loại 2 (u8 ô; i32 số còn lại), s2c/1256 "Bạn vừa nhận được 1 …", s2c/51 (món vào ô trống), s2c/1256 "Đập Trứng Gà thành công, trừ 500 Xu khóa"', 'i32 slot (ô túi)', 'Đo P4 1 lần: 00000003 (Hoàn Linh Dược), server từ chối. Log lỗi 02/11 (manina3): 00000020, Trứng Gà ô 32 từ 3 còn 2 quả');
event('s2c', 57, 'npc_menu', 'world', 'Sau c2s/13 với NPC không có lời nhiệm vụ (J1: cả 20 NPC), và sau c2s/57 mở một menu con', 'Người chơi chọn một dòng: c2s/57', 'i32 n; string npcName; string text; n * {u8 option; string label}', 'Đọc hết 129 byte (P5): Lái Buôn "Ở chỗ ta có rất nhiều món đồ tốt.", 3 dòng 0 Vũ khí, 1 Dược phẩm, 2 Cửa hàng [Lượng]');
event('c2s', 57, 'npc_menu_choice', 'world', 'Chọn một dòng trong hộp thoại NPC (sqlq.a103(option, mapId, npcId)), ở mọi tầng menu', 's2c/57 (menu con), s2c/1190 (cửa hàng), s2c/96 hay s2c/99 (cửa sổ của Pháp sư), s2c/1192 (Chợ trời), s2c/1224 (mã quà tặng), s2c/0 (thông báo)', 'u8 option; string mapId; i32 npcId', 'Đo P5 1 lần: 01 "M1" 106 (Dược phẩm của Lái Buôn)');
event('s2c', 1190, 'shop_list', 'world', 'Sau c2s/57 chọn một cửa hàng', 'Mua: c2s/1190', 'u8 kind; string title; i32 n; n * {i32 shopId; i32 itemId; u8 currency (0 Xu, 1 Xu khóa, 2 Lượng); i32 price; i32 durability (-1); i32 quantity; u8 lock (1 chưa khoá, 0 khoá); u8 element; i32 0; u8 0; u8 field4 (1 trang bị); [0.0.7: i16 field5]; i32 k; k * {i32 stat; i32 min; i32 max; u8[4]}}: 33 byte với vật phẩm, 49 byte với trang bị (0.0.7: thêm 2)', 'Đọc hết byte cả 14 cửa hàng (P5, J1, J2): kind 6 "Vật Phẩm" 8 món; kind 8 [Lượng] 19 món; 12 cửa hàng trang bị, mỗi món một dòng chỉ số, ví dụ Nhẫn Trơn sức tấn công 5–9. 0.0.7 (20/11): Vũ khí [Xu] 26 dòng, field5 = 1 ở mọi dòng');
event('s2c', 1111, 'empty_ack', 'world', 'Sau c2s/1257 (Sắp xếp) và sau Từ chối trong hộp thoại NPC (c2s/57 dòng 1)', 'Không có', 'Rỗng', 'Đo I1, N1: 0 byte, 31–45 ms sau gói của người chơi; có lẽ báo đã xử lý xong để client đóng cửa sổ (Suy luận)');
event('s2c', 1180, 'duel_invite', 'world', 'Sau c2s/57 Đồng ý trong hộp thoại tỷ thí (Võ Quan Đinh Mộc, nhiệm vụ 12)', 'Client thách đấu quái đó ngay: c2s/1181', 'string mapId; i32 npcId; string mobId; string mobName; i32 level; u8; i32; i32; u8; u8 a; i32 b; 0.0.7: u8 c', 'Đọc hết 63 byte (N2 ba lần, N3): M2, 141, mob880 "Võ Quan Đinh Mộc" cấp 20, a = 2, b = 1, 1, 0 ở N2 và 0 ở N3. Ở 0.0.7 là 64 byte: thêm u8 c = 105 ở cuối, bản ghi quái vẫn như 0.0.2 (D7, 5 gói, 20/11)')
event('c2s', 1181, 'duel_challenge', 'world', 'Client tự gửi khi nhận s2c/1180 (sqlq.a122(mobId, npcId, false), gọi từ hàm chạm sqhz.a17)', 's2c/22 mở trận sau 2,1 s (N3)', 'string mobId; i32 0; i32 npcId', 'Đo N3 1 lần: "mob880" 0 141');
event('c2s', 1190, 'shop_buy', 'world', 'Bấm Mua rồi xác nhận số lượng trong cửa hàng NPC (sqlq.h87(shopId, quantity))', 'Được: s2c/1256 "Bạn vừa mua thành công! 1 Hoàn Linh Dược", s2c/42 (cả túi), s2c/46 (tiền). Thiếu tiền: s2c/1256 "Không đủ Xu để thực hiện"', 'u8 0; i32 shopId (của s2c/1190); i32 quantity', 'Đo P5 2 lần: ô 0 trả bằng Xu (thiếu Xu), ô 4 trả 120 Xu khóa (mua được, Xu khóa 3544 → 3424); J1 1 lần: ô 391 Nhẫn Trơn 300 Xu; J3 2 lần bằng Lượng (ô 404, 480): s2c/46, s2c/1187, s2c/1256, s2c/46; túi đầy: s2c/1256 "Rương đã đầy…"');
event('s2c', 96, 'service_window', 'world', 'Sau c2s/57 chọn Nâng cấp [Thường] hay [Cẩn thận], Chuyển hoá trang bị, Tách đá ở Pháp sư', 'Đặt món: c2s/97', 'string tênNhânVật; string key ("" hoặc "TRANSMUTE"); string lời; string tên; i32 sốÔ (18; 0 ở Tách đá)', 'Đọc hết 4 cửa sổ (J1), mở lại 30 lần (J2); trên máy là cửa sổ Nâng cấp có 18 ô đá');
event('s2c', 99, 'craft_window', 'world', 'Sau c2s/57 chọn Luyện đá [Xu khóa] hay [Xu], Chế tạo cánh, Chế Băng Kiếm, hay một bậc của Chế tạo trang bị ở Pháp sư', 'Đặt món: c2s/97 → s2c/92 (Luyện đá, Chế tạo trang bị)', 'string key ("abcd1002", "abcd1003", "abcd1006", "abcd1007", "abcd1001" Chế tạo trang bị); string lời; string tên; i32 n (24 đá; 3 ô nguyên liệu; 2 ở Chế tạo trang bị)', 'Đọc hết 4 cửa sổ (J1, J2) và cửa sổ Chế tạo trang bị (O1, 121 byte)');
event('c2s', 97, 'service_put', 'world', 'Bấm Chọn ở một món của Hành trang trong mọi cửa sổ của Pháp sư (sqlq.a107)', 's2c/90 (Nâng cấp, Tách đá, nguồn Chuyển hoá; với trang bị thêm s2c/1258), s2c/1260 (đích Chuyển hoá), s2c/92 (Luyện đá, Chế tạo trang bị), s2c/1256 (từ chối), s2c/0 (Chế tạo thiếu nguyên liệu hay sai loại)', 'string ""; u8 0; i32 loại (0 trang bị, đá, Chuyển hoá; 1 bùa bảo vệ, nguyên liệu Chế tạo với cả chồng); i32 ôTúi; i32 sốLượng', 'Đo J1 2 lần trên máy; J2 bot TS gửi hơn 90 lần ở mọi cửa sổ, chưa tốn gì; O1 trên máy: loại 1 cho bùa và nguyên liệu');
event('s2c', 90, 'service_slot', 'world', 'Trả c2s/97', 'Bấm Bắt đầu: c2s/91', 'string tên; u8 0; u8 loạiÔ (1 trang bị, 0 đá); i32 ôTúi; i32 sốLượng; i32 0; i32 0; string chữ; u8 sẵnSàng', 'Đọc hết 98 và 136 byte (J1): "Cần: 12 Xu khóa (không đủ sẽ sử dụng cả Xu)\nCần: 0 Lượng\nTỉ lệ thành công: 80%", sẵnSàng 1. J2: phí, Lượng (Cẩn thận 5) và tỉ lệ 11–100% theo đá; Tách đá "Nhận được: 2 Đá cấp 1, "');
event('s2c', 93, 'stone_result', 'world', 'Trả c2s/91 trong cửa sổ Luyện đá và Chế tạo trang bị', 's2c/46 (phí); Luyện đá: túi không được gửi lại; Chế tạo: s2c/1187 loại 4 (món mới), s2c/1256', 'string tên; u8 kếtQuả; i32 n; n * bản ghi vật phẩm (Luyện đá: viên đá mới; Chế tạo: nguyên liệu còn lại)', 'Đọc hết 80 byte (J3, 6 lần, đều kếtQuả 1): Đá cấp 6 khoá ở ô 20; Đá cấp 2 chưa khoá ở ô 16 (Luyện đá [Xu]). Chế tạo 149 byte (O1): Quặng Bậc 1 ×62, Linh Thạch Bậc 1 ×19');
event('s2c', 92, 'stone_slot', 'world', 'Trả c2s/97 trong cửa sổ Luyện đá và Chế tạo trang bị (s2c/99)', 'Bấm Bắt đầu: c2s/91 → s2c/93', 'string tên; u8 0; i32 ôTúi; i32 0; i32 phíXu (Chế tạo khi đủ nguyên liệu; 0 ở Luyện đá); string chữ; u8 sẵnSàng', 'Đọc hết 70 và 94–150 byte (J2 27 lần, J3 18 lần): "Cần chọn đá số lượng 2 đến 24", hay "Luyện thành Đá cấp 6 Khóa\nCần: 410 Xu khóa (không đủ sẽ sử dụng cả Xu)\nTỉ lệ thành công: 50%"');
event('s2c', 1260, 'transmute_target', 'world', 'Trả c2s/97 trong cửa sổ Chuyển hoá khi món đặt vào là món +0 (món đích)', 'Không có', 'u8 0; i32 ôTúi; string chữ; u8 sẵnSàng', 'Đọc hết 181 byte (J2, 1 lần): ô 15, "Nguồn: chưa có …\nĐích: Nhẫn Trơn (bậc 0)\nVật phẩm: chưa có …", sẵnSàng 0');
event('s2c', 1258, 'service_preview', 'world', 'Sau c2s/97 đặt trang bị, và sau s2c/91', 'Không có', 'u8 0; string uuid; i32 cấpHiệnTại; bản ghi vật phẩm của món sau một lần nâng nữa', 'Đọc hết 127 byte (J1, J2): giáp +0 cho bản ghi +1 (phòng thủ 19, cường lực 11); lên +1 rồi thì bản ghi +2 (23, 14); ba nhẫn +0 (J2)');
event('c2s', 91, 'service_start', 'world', 'Bấm Bắt đầu trong mọi cửa sổ của Pháp sư: Nâng cấp, Cẩn thận, Luyện đá, Tách đá, Chuyển hoá (sqlq.m109)', 'Nâng cấp: s2c/91, s2c/1258, s2c/46 (Cẩn thận thêm s2c/46 Lượng ở đầu). Luyện đá: s2c/93, s2c/46. Tách đá, Chuyển hoá: s2c/91. Không đủ điều kiện: s2c/1256. Không có túi mới', 'string "" (rỗng)', 'Đo J1 1 lần trên máy; J3 bot TS 14 lần: 3 Nâng cấp (1 thất bại), 7 Luyện đá (6 thành công, 1 bị từ chối dưới 40%), 1 gửi key "abcd1002" sau khi đã luyện xong, 2 Tách đá (lần đầu bị từ chối vì túi đầy), 1 Chuyển hoá');
event('s2c', 91, 'service_result', 'world', 'Trả c2s/91 ở Nâng cấp, Tách đá, Chuyển hoá', 'Không có; túi không được gửi lại (xin bằng c2s/42)', 'string tên; u8 kếtQuả (1 thành công, 0 thất bại); bản ghi món sau đó; i32 n; n * bản ghi món nhận được (đá của Tách đá); Chuyển hoá thêm bản ghi món đích', 'Đọc hết byte (J1, J3): Nâng cấp 96 byte n 0, kếtQuả 0 khi thất bại ở 16%; Tách đá 228 byte n 2 (Đá cấp 1); Chuyển hoá 178 byte n 0 rồi Anh Hùng Nhẫn +1');
event('s2c', 1192, 'market', 'world', 'Sau c2s/57 chọn Chợ trời, Bán vật phẩm hay Đang bán ở Ngọc Nga', 'Đọc danh sách món đang bán, luật bán, món của mình đang bán; chưa đo mua, đăng bán', 'u8 loại; loại 1 (Chợ trời): u8 sốMục; u8 mục; string tênMục; i32 sốTrang; i32 trang; i32 n; n × món {i32 mãVậtPhẩm; i32 mãVậtPhẩm; string uuid; string ngườiBán; i32 độBền; i32 field0; i32 phẩmChất; [0.0.7: u8 hệ]; i64 hếtHạn; u8 loạiTiền; i32 giá; i32 field2; i32 sốLượng; u8 field1; i32 m; m × {i32 chỉSố; i32 giáTrị; i32 giáTrị2}}; loại 0 (Bán vật phẩm): string luật; loại 2 (Đang bán): i32 sốTrang; i32 trang; i32 n; n × món', 'J1, CT1: loại 1 "Vũ Khí" 20 món đọc hết 2638/2638 byte; loại 0 "Phí đăng bán 1.000 Xu…"; loại 2 khi không bán gì: (1, 1, 0). 0.0.7 (20/11): Vũ Khí 1 món (Lam Dù hệ 2), Đá Quý 3 món (hệ 0xff)');
event('c2s', 116, 'market_tabs_request', 'world', 'Cửa sổ Chợ trời mở ra (sau s2c/1192 của Ngọc Nga, hay nút Chợ trời của thanh công cụ)', 's2c/116', 'Rỗng', 'CT1 (01/11) trên máy có Frida');
event('s2c', 116, 'market_tabs', 'world', 'Trả c2s/116', 'Cửa sổ vẽ các mục; c2s/1192 cho từng trang', 'i32 n; n × {i32 mục; string tên; i32 sốMón}; string luật; i32 phí (1000); i32 a (1000); i32 sốGiờ (24); i32 b (1000); i32 giáCaoNhất (100.000.000)', 'CT1: 9 mục, 594 món, đọc hết 378/378 byte; a, b chưa rõ (một trong hai có lẽ là giá thấp nhất)');
event('c2s', 1192, 'market_page', 'world', 'Bấm một mục, mũi tên trang, Làm mới hay tab Đang bán trong cửa sổ Chợ trời; nút Chợ trời của thanh công cụ gửi thẳng gói này, không qua Ngọc Nga', 's2c/1192 loại 1 (một mục), loại 2 (mục -1: Đang bán)', 'u8 0; i32 mục (0–8 của s2c/116, -1 là Đang bán); i32 trang (từ 1)', 'CT1: 9 mục, đủ mọi trang trên máy và bằng bot TS; chỉ đọc');
event('c2s', 115, 'market_buy', 'world', 'Bấm Mua ở bảng chi tiết một món, rồi OK ở "Mua … với giá … Xu?"', 'Mua được: s2c/46, s2c/115, s2c/1187; túi đầy: s2c/1256 "Rương đã đầy…"', 'string uuid (của món trong s2c/1192)', 'CT1: một lần bị từ chối (túi đầy, không mất Xu), một lần mua được Slime 1.000 Xu');
event('s2c', 115, 'market_bought', 'world', 'Trả c2s/115 khi mua được, sau s2c/46', 's2c/1187 (cả túi; món có uuid mới); máy hiện "Mua vật phẩm thành công!"', 'string uuid (như c2s/115)', 'CT1: một lần');
event('c2s', 112, 'market_sell', 'world', 'Tab Bán: chọn món chưa khoá, nhập giá, Đăng bán, rồi OK ở "Đăng bán … với giá … Xu? Phí đăng bán 1.000 Xu."', 's2c/46 (trừ phí), s2c/112, s2c/1256 "Rao bán vật phẩm thành công"', 'u8 1; i32 ôTúi; i32 sốLượng; i64 giá', 'CT1: một lần, Slime ở ô 2 giá 1.000.000 Xu; hàm dựng a81(int, int, long). Loại 2 (u8 2; string uuid của Đang bán, hàm dựng g80) là Gia hạn: s2c/46 (−1.000 Xu), s2c/1192 loại 2 (hạn +24 giờ), s2c/1256 "Gia hạn vật phẩm thành công" (NP1, bot TS)');
event('s2c', 112, 'market_listed', 'world', 'Trả c2s/112 khi đăng được', 's2c/1256 "Rao bán vật phẩm thành công"', 'i32 a (1); i32 ôTúi; i32 sốLượng', 'CT1: một lần (1, 2, 1)');
event('c2s', 113, 'market_withdraw', 'world', 'Tab Đang bán: chạm món, Thu hồi, rồi OK ở "Thu hồi … về hành trang?"', 's2c/1187, s2c/113, s2c/1256 "Đã nhận lại vật phẩm …"', 'string uuid (của món trong s2c/1192 loại 2, khác uuid trong túi)', 'CT1: một lần');
event('s2c', 113, 'market_withdrawn', 'world', 'Trả c2s/113 khi thu hồi được, sau s2c/1187', 's2c/1256 "Đã nhận lại vật phẩm …"', 'string uuid (như c2s/113)', 'CT1: một lần');
event('s2c', 1224, 'gift_code_prompt', 'world', 'Sau c2s/57 chọn Mã quà tặng ở Hương Lão', 'Có lẽ client mở ô nhập mã', 'Rỗng', 'J1: 0 byte');
event('c2s', 44, 'battle_use_item', 'battle', 'Trong trận: nút Túi đồ rồi chạm món (sqlq.g76(slot, 0))', 's2c/83 (số còn lại trong ô), s2c/44 (HP mới)', 'string battleUuid; i32 0; i32 bagSlot', 'Đo P5 1 lần trong trận tính giờ với Sơn Tặc: Hoàn Linh Dược ở ô 4, HP 31 → 67');
event('s2c', 44, 'battle_item_result', 'battle', 'Sau c2s/44', 'Trận đi tiếp', 'i32 seq; i32 0; u32 seed; i32 0; i32 bagSlot; i32; i32 n; u8[n] refill; u8 m; m * {string name; i32 damage; u8; i32 hp; i32; i32}; u8 flags[4]; string actor; u8 end', 'Đọc hết 75 byte (P5): Ttuananh hp 67 sau Hoàn Linh Dược');
event('c2s', 1215, 'mail_request', 'world', 'Mở Hòm thư', 's2c/1215', 'Rỗng');
event('s2c', 1215, 'mail_list', 'world', 'Trả mail_request; sau Nhận hết (c2s/1218) và Xóa hết (c2s/1221)', 'Không', 'i32 n; n * thư: i64 mãThư; u8 loại; string tiêuĐề; string ngườiGửi; u8 đãĐọc; u8 cóQuà; u8 đãNhận; i64 giờGửi (ms); i64 0', 'U1: 0 thư. G1 (01/11) trên máy có Frida: đọc hết 279 byte (4 thư quà) và 206 byte (3 thư)');
event('c2s', 1216, 'mail_open', 'world', 'Bấm vào một thư trong Hòm thư', 's2c/1216, s2c/1220', 'i64 mãThư', 'G1 (01/11) trên máy có Frida');
event('s2c', 1216, 'mail_body', 'world', 'Trả mail_open', 'Nhận: c2s/1217', 'i64 mãThư; string tiêuĐề; string nộiDung; string ngườiGửi; u8 đãNhận; i32 n; n * bản ghi vật phẩm (tiền là vật phẩm #40 Xu, #41 Xu khóa, #42 Lượng)', 'G1 (01/11) trên máy có Frida: đọc hết 310, 321, 611, 793 byte');
event('c2s', 1217, 'mail_claim', 'world', 'Bấm Nhận ở một thư', 's2c/46, s2c/1187 (thư có vật phẩm), s2c/1217, s2c/1220; túi không đủ chỗ: s2c/1256 "Rương đã đầy…" rồi s2c/1217 ok 0', 'i64 mãThư', 'G1 (01/11) trên máy có Frida');
event('s2c', 1217, 'mail_claimed', 'world', 'Trả mail_claim', 'Không', 'i64 mãThư; u8 ok', 'G1 (01/11) trên máy có Frida: ok 1 (thư 6280, 6273), ok 0 khi túi đầy (6278)');
event('c2s', 1218, 'mail_claim_all', 'world', 'Bấm Nhận hết', 's2c/46, s2c/1187 (một lần cho cả lượt), s2c/1256 "Đã nhận quà của N thư" (hay "…, rương đã đầy", "Không có quà nào để nhận"), s2c/1215, s2c/1220', 'Rỗng', 'G1 (01/11) trên máy có Frida: thư thiếu chỗ bị bỏ qua, không mất');
event('c2s', 1219, 'mail_delete', 'world', 'Bấm Xóa một thư rồi đồng ý', 's2c/1219, s2c/1220', 'i64 mãThư', 'G1 (01/11) trên máy có Frida');
event('s2c', 1219, 'mail_deleted', 'world', 'Trả mail_delete', 'Không', 'i64 mãThư; u8 ok', 'G1 (01/11) trên máy có Frida');
event('c2s', 1221, 'mail_delete_all', 'world', 'Bấm Xóa hết rồi đồng ý', 's2c/1215 rỗng, s2c/1220 0, s2c/1256 "Đã xoá N thư"', 'Rỗng', 'G1 (01/11) trên máy có Frida: xoá cả thư còn quà chưa nhận (manina2 mất quà của 3 thư). Bot không gửi gói này');
event('s2c', 1222, 'mail_new', 'world', 'Sau mã quà tặng nhập đúng (s2c/1223 ok 1)', 's2c/1220 1', 'như một thư của s2c/1215', 'G1 (01/11) trên máy có Frida: đọc hết 63, 71, 73 byte; mãThư tăng dần chung cả server');
event('c2s', 1223, 'gift_code', 'world', 'Bấm Nhập quà ở Phúc lợi → Mã quà tặng; gửi thẳng không qua NPC cũng được', 's2c/1223; đúng thì s2c/1222, s2c/1220; sai thì s2c/1256 cùng lời', 'string mã (đã cắt dấu cách, chữ hoa, tối đa 32 ký tự)', 'G1 (01/11) trên máy có Frida: 4 mã đúng, 15 mã sai hay đã dùng; 10 lần sai liền thì mọi mã bị chặn 5 phút');
event('s2c', 1223, 'gift_code_result', 'world', 'Trả gift_code', 'Không', 'u8 ok; string lời ("Nhập mã thành công…", "Mã không tồn tại", "Nhân vật này đã dùng mã rồi", "Bạn nhập mã quá nhanh, vui lòng thử lại sau")', 'G1 (01/11) trên máy có Frida: không có số lần sai còn lại');
event('c2s', 1196, 'friends_request', 'world', 'Mở Bạn bè', 's2c/1196', 'Rỗng');
event('s2c', 1196, 'friend_list', 'world', 'Trả friends_request', 'Không', 'i32 n; bản ghi bạn chưa thấy (n = 0)', 'Đo 1 lần, chưa có bạn');
event('c2s', 1254, 'ranking_request', 'world', 'Mở BXH hoặc đổi tab', 's2c/1254 kiểu 0 (tab) rồi kiểu 1 (danh sách)', 'u8 tab; mở lần đầu chỉ có u8 0, đổi tab gửi u8 tab; u8 1');
event('s2c', 1254, 'ranking', 'world', 'Trả ranking_request', 'Không', 'u8 kind; 0: u8 n; n * {u8 tab; string title; string column}; u8. 1: u8 tab; i32 n; n * {i32 rank; i32 id; string name; i32; i32 level}; i32 ownRank; i32; i32 ownLevel; [0.0.7: n × i64 reachedAt; i64 ownReachedAt]', 'Đọc hết byte; manina hạng 1094 khớp màn hình. 0.0.7 (20/11): 7 tab, Cao thủ 100 dòng 3562 byte');
event('c2s', 1252, 'bach_ho_board_request', 'world', 'Bảng công trạng Bạch Hổ: mở hay Làm mới (sqid.c → sqlq.Y, đọc tĩnh)', 's2c/1252', 'Rỗng', 'BH2 (tiheo2, 20/11 15:08, ngoài giờ): server trả s2c/1252 ngay, không cần ở trong hang');
event('s2c', 1252, 'bach_ho_board', 'world', 'Trả bach_ho_board_request', 'Không', 'u8 trạng thái; i32 máu; i32 máu tối đa; i32 số người; i32 n (≤ 64); n × {i32; i32; string tên; i32}; i32 hạng của mình; i32', 'BH2: 25 byte `02 000003e8 000003e8 0 0 0 0` (trạng thái 2, máu 1000/1000, chưa ai đánh); bố cục khớp hàm đọc sqrj.a');
event('c2s', 1240, 'season_request', 'world', 'Mở Bảo Điển', 's2c/1240', 'Rỗng');
event('s2c', 1240, 'season_info', 'world', 'Trả season_request', 'Không', 'u8 (0 = chưa có mùa)', 'Đo 1 lần');
event('c2s', 1241, 'season_quests_request', 'world', 'Mở Bảo Điển', 's2c/1241', 'Rỗng');
event('s2c', 1241, 'season_quests', 'world', 'Trả season_quests_request', 'Không', 'u8 (0 = chưa có nhiệm vụ mùa)', 'Đo 1 lần');
event('c2s', 1265, 'faction_request', 'world', 'Mở Sứ quân', 's2c/1265', 'u8 lệnh: 0 = sứ quân của mình; 1 + 6 byte = danh sách', 'Đo 1 lần mỗi lệnh');

event('c2s', 15, 'challenge_mob', 'battle', 'Nhân vật va vào quái; bot gửi từ xa cũng được', 's2c/22 sau ~2,5 s', 'string mobId; u8 flag (0 khi chạm quái, 1 với Bạch Hổ)', 'Đo: B1 2 lần, bot Q1/Q2 11 lần; BH2 6 lần với Bạch Hổ, cờ 1');
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
event('s2c', 36, 'durability', 'battle', 'Cùng lúc kết quả cuối trận, và sau đầu hàng', 'Không', 'i32 n (8 ô trang bị); n * {u8 0xff: ô trống | u8 ô; i32 độBền}', 'Đọc hết byte: B1 16 byte (nón 49), G2 24 byte (ô 0, 1, 2: 55, 60, 0); về 0 thì món hỏng (HP tối đa và sát thương tụt)');
event('c2s', 1282, 'device_signals', 'world', 'Game 1.1.0: ngay sau s2c/4, trước c2s/1284 và c2s/9 (sqnf.p() đọc DeviceSignals)', 'Không có', 'u8 adb (bit 1 gỡ lỗi USB, bit 2 adb Wi-Fi); u8 chế độ nhà phát triển (0/1); u8 số dịch vụ trợ năng (0–127)', 'Đo VG1 20/11 và 22/11 (game 1.1.1): game gửi 01 00 00 (máy đang bật gỡ lỗi USB). Bot và app gửi 00 00 00 (máy sạch) từ 22/11, cùng chỗ');
event('c2s', 1284, 'chat_block', 'world', 'Lệnh 0: ngay sau c2s/1282, trước c2s/9 (lấy danh sách chặn chat). Lệnh có id: Chặn chat, Bỏ chặn ở popup người chơi (com.mh.d.sqc)', 's2c/1284', 'u8 lệnh (0 lấy danh sách; 1, 2 chặn hay bỏ chặn); lệnh 1, 2: i32 id người chơi', 'Đo VG1: game gửi 00 khi vào game; lệnh 1, 2 đọc từ code (sqc.a(int), sqc.b(int)), chưa đo, chưa rõ số nào là chặn');
event('c2s', 1285, 'report_player', 'world', 'Báo cáo người chơi: chọn lý do Xúc phạm, Spam, Lừa đảo, Khác (com.mh.d.sqc.a(int, int))', 's2c/1285', 'i32 id người chơi; u8 lý do', 'Đọc từ code 1.1.0; chưa đo, thứ tự lý do suy theo thứ tự trên hộp thoại');
event('s2c', 1284, 'chat_block_list', 'world', 'Trả c2s/1284; server cũng tự gửi một lần sau c2s/30 (cả cho bot không gửi c2s/1284)', 'Không', 'u8; u8; string thông báo; i16 n; n * {i32 id người chơi; string tên}', 'Đo VG1: 8 byte 0 (danh sách trống). Kiểu đọc từ code (sqc.a(sqi) → sqd(int, int, String, int[], String[])); nghĩa hai u8 chưa rõ');
event('s2c', 1285, 'report_result', 'world', 'Trả c2s/1285', 'Không', 'u8 kết quả; string thông báo', 'Đọc từ code (sqc.b(sqi) → sqe(int, String)); chưa đo. Game hiện "Đã gửi báo cáo, chúng tôi sẽ xem xét trong 24 giờ." hoặc "Không gửi được báo cáo. Vui lòng thử lại!"');
event('c2s', 1275, 'bach_ho_result_request', 'world', 'Kết quả Bạch Hổ: nút "Xem tất cả bậc" của bảng công trạng mở hộp sqjx, hộp gửi sqnf.Z() (APK 1.1.0)', 's2c/1275', 'Rỗng', 'Đọc tĩnh 1.1.0 (21/11); chưa đo');
event('s2c', 1275, 'bach_ho_result', 'world', 'Trả bach_ho_result_request', 'Không', 'u8 trạng thái (0 đang diễn ra, 1 bị tiêu diệt, 2 tẩu thoát); i64 phiên; i32 máu; i32 máu tối đa; i32 id người kết liễu; string tên người kết liễu; u8 bậc của họ; i32 sát thương của họ; u8 n bậc; n × {u8 bậc; i16 cấp từ; i16 cấp tới; i32 ngưỡng; i32 số người; u8 m; m × {u8 hạng; i32 id; string tên; i16 cấp; i32 sát thương}}; u8 bậc của mình; i32 hạng; i32 sát thương; u8 đạt ngưỡng', 'Đọc tĩnh 1.1.0 (sqtm.a → sqto, chữ của sqtq); chưa đo');
event('c2s', 1277, 'request_1277', 'world', 'sqnf.Q() (APK 1.1.0)', 'Chưa rõ', 'Rỗng', 'Đọc từ code 1.1.0; chưa đo');
event('c2s', 1281, 'request_1281', 'world', 'sqnf.N(), do com.mh.sqip.h14 gọi (APK 1.1.0)', 'Chưa rõ', 'Rỗng', 'Đọc từ code 1.1.0; chưa đo');
// Phúc lợi (PL1, 20/11, docs/app/events/18-players-checkin.md): Điểm danh tháng, Quà thăng cấp, Quà online.
event('c2s', 1236, 'welfare_definition_request', 'world', 'Mở Phúc lợi hay một tab của nó (một lần mỗi khoá mỗi lượt đăng nhập)', 's2c/1236', 'string khoá (CHECKIN_MONTHLY, ONLINE_DAILY, LEVEL_UP, RECHARGE_TOTAL, SPEND_TOTAL, FIRST_CHARGE)', 'Đo PL1 (20/11)');
event('s2c', 1236, 'welfare_definition', 'world', 'Trả c2s/1236', 'Không', 'u8 ok; i64 ?; i64 mãSựKiện; string khoá; string tên; i32 n; n × {i64 mãMốc; i32 điềuKiện; i32 k; k × item record}; CHECKIN_MONTHLY thêm i32 n; n × {item record; i16 ?}', 'Đo PL1: đọc hết byte cho 3 khoá bot dùng; khoá khác còn đuôi chưa giải');
event('c2s', 1239, 'welfare_progress_request', 'world', 'Mở Phúc lợi hay một tab của nó', 's2c/1239', 'string khoá', 'Đo PL1 (20/11)');
event('s2c', 1239, 'welfare_progress', 'world', 'Trả c2s/1239; sau Điểm danh và sau nhận quà', 'Không', 'u8 ok; i64 ?; i64 mãSựKiện; string khoá; string kỳ; i32 tiếnĐộ; i64 0; i32 n; n × {i64 mãMốc; u8 trạngThái 0/1/2}; CHECKIN_MONTHLY thêm u8 hômNayĐã; u8 ngày; u8 sốNgàyThángNày; i32 mặtNạNgày; i64 giờReset', 'Đo PL1');
event('c2s', 1232, 'checkin', 'world', 'Bấm Điểm danh (mốc 0) hay nhận quà mốc tháng', 's2c/1187, s2c/1232, s2c/1239, s2c/1279', 'i64 mãSựKiện (64); i64 mãMốc (0 = quà ngày)', 'Đo PL1 (akaito): mốc 0; mốc tháng chưa đo');
event('s2c', 1232, 'checkin_result', 'world', 'Trả c2s/1232', 'Không', 'i64 mãSựKiện; i64 mãMốc; u8 ok; string lời; u8 ?; u8 chỉSốQuàNgày; i32 ?', 'Đo PL1: "Điểm danh ngày 20: nhận 1 Đá cấp 6", chỉ số 6');
event('c2s', 1233, 'welfare_claim', 'world', 'Bấm Nhận quà ở tab Online (Quà thăng cấp, Quà online)', 's2c/46, s2c/1187, s2c/1256 "Đã nhận N phần thưởng", s2c/1239 (và s2c/1279)', 'i64 mãSựKiện (65 thăng cấp, 21 online): mọi mốc đủ điều kiện một lần', 'Đo PL1 (akaito): 5 mốc thăng cấp, 4 mốc online');
event('s2c', 1214, 'battle_end_1214', 'battle', 'Cuối trận, sau đầu hàng hoặc huỷ trận', 'Không', 'Rỗng', 'Đo; vai trò chưa rõ');

const pushes: [number, string, string, string, string?][] = [
  [1259, 'config_1259', 'Sau c2s/4, trước s2c/4', '5 byte cấu hình, opaque'],
  [1265, 'faction', 'Sau c2s/4 (lệnh 100, 30 byte) và khi mở Sứ quân', 'u8 lệnh; 100: cấu hình; 0: sứ quân của mình (16 byte 0 khi chưa vào); 1: danh sách (tên, cấp, số người/20, kiểu duyệt)', 'Lệnh đọc được; từng trường danh sách chưa giải'],
  [1269, 'config_1269', 'Sau c2s/4', '30 byte cấu hình, opaque'],
  [1271, 'social_links', 'Sau c2s/4', '140 byte; có URL Facebook, chưa giải cấu trúc danh sách'],
  [1272, 'config_1272', 'Sau c2s/4', '47 byte tham số, opaque'],
  [1266, 'chat_history', 'Vào thế giới (game 1.1.1, 22/11): lịch sử chat', 'u8 kênh; u8 n; n * {i64 lúcMs; i32 idNgườiChơi (0 = hệ thống); string tên; u8; string nội dung}', 'Đo MP3/v111 22/11: 790 byte, 14 tin sứ quân đọc hết byte; 2 byte (0 tin) sau khi server khởi động lại'],
  [1279, 'welfare_dots', 'Vào thế giới: sau s2c/1220, ngay trước s2c/1284 (APK 1.1.0); sau Điểm danh và sau nhận quà Phúc lợi', 'i32 mặt nạ: một bit mỗi tab Phúc lợi còn quà (chấm đỏ), Online 0, Tri ân 1, Mua chung 2, Điểm danh 3, Giftcode 4, Nạp đầu 5', 'Đo PL1 20/11 (akaito): 9 lúc vào game, 1 sau Điểm danh, 0 sau quà Online'],
  [1274, 'config_1274', 'Sau c2s/4, trước s2c/1265 (APK 1.1.0)', '884 byte, opaque', 'Đo VG1 20/11; chưa giải'],
  [46, 'currency_notice', 'Sau s2c/9; khi tiền đổi (trả nhiệm vụ)', 'string label ("update Xu"); i64 xu; i64 xuKhoa; i64 luong', 'Đọc hết 37 byte; E1 (31/10) 500, 7370, 0 khớp bảng Bản thân: 500 Xu, 7.370 Xu khoá, 0 Lượng'],
  [10, 'character_stats', 'Sau trận (kiểu 4); khi lên cấp và mỗi điểm tiềm năng (kiểu 2, 4, 8 liền nhau); sau c2s/1191 (kiểu 32)', 'i32 kind; string name; kind 2: i32 level; i32 stats[10]. Kind 4: i32 hp, maxHp, exp; i32 levelExp[2]; i32 coin; i32 extra[6]. Kind 8: i32 statPoints; i32 fields[3]; string labels[2]. Kind 32: i32 n; n * {i32 skillId; i32 level}', 'Đọc hết byte 4 kiểu (L1, Q2, E1, P1); EXP và tiền khớp phần thưởng trận; stats[0] tăng 1 mỗi điểm Cường Lực, stats[1] mỗi điểm Thân Pháp, statPoints giảm 10 → 0; extra[1..5] là combat của s2c/9 (tấn công, phòng thủ, chính xác, né tránh, chí mạng: khớp bảng ở P1), fields[0] là điểm kỹ năng (16 ở P1, khớp bảng), extra[0], labels chưa rõ; kiểu 32 tăng cấp Hỏa Cầu Thuật 1 → 4'],
  [1187, 'inventory', 'Túi đồ đổi: trả nhiệm vụ, sửa đồ; loại 4 sau Chế tạo trang bị', 'u8 kind; kind 4: một item record (món vừa thêm, O1). Kind 1: i32 capacity; i32 n; n * item record: u8 slot; i32 itemId; string uuid; i32; i32 durability (-1 = không có); i32 quantity; u8; u8 element; i32; u8; u8; u8 k; k * {i32 stat; i32 value}', 'Đọc hết 519 byte (E2): 7 món khớp túi trên máy; cùng bản ghi với s2c/1182 trừ x, y, hạn'],
  [1191, 'skill_points', 'Sau c2s/1191', 'i32 statPoints; i32 skillPoints', 'Đo E1 3 lần: 68 và 18, 17, 16, khớp bảng Chỉ số và Kỹ năng'],
  [48, 'repair_ack', 'Sau c2s/48 và s2c/1187', 'u8 where; i32 slot (giống c2s/48)', 'Đo E2, P4'],
  [37, 'gear_update', 'Sau c2s/1186 (mặc hoặc cởi đồ)', 'i32 0; u8 0x40; string name; i32 8; 8 * (u8 0xff | item record)', 'Đọc hết byte 2 mẫu (P4): 350 byte khi cởi thú cưng, 423 khi mặc lại'],
  [1186, 'equip_result', 'Sau c2s/1186, sau s2c/42', 'i32 action (lặp lại action của c2s/1186)', 'Đo P4: 1 khi cởi, 0 khi mặc'],
  [51, 'bag_slot_add', 'Nhặt được món vào túi (sau c2s/1188); không có s2c/1187 lúc này', 'i32 -1; i32 0; u8 1; item record (ô túi vừa nhận món)', 'Đo K3 3 lần, đọc hết byte: Áo Chiến ô 5, Đá cấp 2 ô 6, Rìu Âu Lạc ô 7'],
  [84, 'item_used', 'Sau c2s/84 (Sử dụng) một món có hiệu ứng theo giờ (Tăng Kinh Nghiệm)', 'i32 ô; i32 số còn lại; i32 (256); string tên nhân vật; i32 n; n × {string mã; i32 tỉ lệ; i32; i32 msCòn}', 'Đo U2 (tiheo2, 20/11): Tăng Kinh Nghiệm ô 16 → còn 0, "ef7" 200000, 86.400.000 ms (24 giờ); gói duy nhất server trả'],
  [83, 'bag_slot_count', 'Sau c2s/1186 action 2 (Vứt bỏ); sau c2s/44 (dùng món trong trận)', 'i32 slot; i32 số còn lại trong ô (0: ô trống)', 'Đo K3 (vứt Đá cấp 2 ở ô 4) và P5 (dùng bình duy nhất ở ô 4): cả hai 00000004 00000000; đăng nhập lại thì ô 4 trống'],
  [1256, 'notice_1256', 'Cuối trận thua (Q6); cổng chưa đủ cấp sau c2s/13; c2s/11 cho map khác; nhặt được hay không nhặt được đồ (P3, K3); mua ở NPC (P5, J1); Pháp sư từ chối món hay nút Bắt đầu (J2, J3: "Vật phẩm không phù hợp", "Vật phẩm này đã được chọn rồi", "Tỉ lệ trên 40% mới có thể thực hiện", "Rương đồ không đủ ô trống"); túi đầy khi mua (J3); đổi Lượng (J3: "Bạn vừa nhận được 55.000 Xu khóa")', 'u8 field; string text ("Thua trận, mất 16 kinh nghiệm", "Bạn phải đạt cấp 40 mới vào được Lạc Cốc", "Không thể chuyển khu vực", "Bạn vừa nhận được 474 Xu khóa", "Không thể nhặt vật phẩm của người khác")', 'Đọc hết byte 5 mẫu (Q6, Q15, S1, P3), K3, P5. field 1 ở câu hiện giữa màn hình ("Không thể nhặt…", "Không đủ Xu…", "Bạn vừa mua thành công!…"), 0 ở "Bạn vừa nhận được…" và "Rời trận, mất 25 kinh nghiệm"'],
  [1201, 'step_progress', 'Sau mỗi trận được tính cho bước nhiệm vụ đang làm', 'i32 progress: số con đã diệt, hoặc tổng sát thương lên boss', 'Đo: Q2–Q9 tăng 1 sau mỗi trận thắng (1…9); B4 363 = sát thương lên boss sau trận thua'],
  [1200, 'signal_1200', 'Ngay sau s2c/19 end 1, và sau s2c/35 khi trả nhiệm vụ', 'Rỗng', 'Đo; vai trò chưa rõ'],
  [39, 'quest_data', 'Sau s2c/9 và khi nhận nhiệm vụ mới', 'i32 questId; string title; string description; string type; i32 current; i32 progress; i32 n; n * {i32 index; string text; i32 param; i32 required; i32 npcId}', 'Đọc hết byte 3 mẫu; current khớp bước tô xanh trên bảng Nhiệm vụ'],
  [34, 'quest_progress', 'Sau khi nói chuyện với NPC, diệt quái của nhiệm vụ, nhận nhiệm vụ', 'i32 0; string "subtask 1"; i32 questId; string dialogue', 'Đọc hết byte'],
  [35, 'quest_complete', 'Trả nhiệm vụ', 'i32 questId; string title; i32 n; n * string reward; string message', 'Đọc hết byte 1 mẫu'],
  [1261, 'counter_1261', 'Định kỳ ~36 s (log bot)', '10 byte: u8 0x13; i32 bộ đếm tăng 1; u8 3; i32 0', 'Chưa rõ'],
  [1195, 'daily_quest', 'Trong đồng bộ nhân vật; khi nhận và khi hủy nhiệm vụ ngày ở Hương Lão; khi tiến độ đổi (loại 3)', 'u8 loại; 0 không có; 1: i32 mãNhiệmVụ; string tên; string mẫu (%d là mục tiêu); i32 tiếnĐộ; i32 mụcTiêu; 3: i32 tiếnĐộ; i32 mụcTiêu', 'G1: đọc hết 1, 70, 92 byte (116 Sử dụng vật phẩm 0/3, 113 Nhặt xu 0/2050). NP1: loại 3 (9 byte) sau mỗi lần nhặt Xu khóa, 218/2100, 462/2100…'],
  [1220, 'mail_unread', 'Trong đồng bộ nhân vật; sau s2c/1222, c2s/1216, c2s/1217, c2s/1218, c2s/1219', 'u8 (1 còn thư chưa đọc, 0 đã đọc hết)', 'G1: chấm đỏ của nút Thư'],
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
  [1174, 'player_say', 'Sau c2s/1174: chữ hiện thành bong bóng trên đầu nhân vật khoảng 3 s', 'i32 playerId; string text (từ cấm đã che bằng *)', 'Đo CH1: 2 tin của mình (id 155 = numericId của manina); tin của người khác chưa thấy'],
  [45, 'boss_broadcast', 'Vào map và định kỳ', 'string text ("BOSS … đang ở <map>: khu …")'],
];
for (const [op, name, trigger, schema, confidence] of pushes) {
  event('s2c', op, name, 'push', trigger, 'Không có ACK riêng trong capture; tiếp tục đọc stream', schema,
    confidence ?? 'Byte đã đo; ý nghĩa nghiệp vụ/schema một phần là suy luận; phần chưa biết giữ opaque');
}
export const EVENTS = specs;
export const eventKey = (direction: Direction, opcode: number) => `${direction}/${opcode}`;
/** s2c/1209: the flag, then (APK 1.1.0) the values of four static readers, each read only while bytes are left, as the
 * game does (sqpq.aq → com.mh.d.sqj, com.mh.a.sqh, com.mh.t.sqa, com.mh.z.sqa .a(sqi)). Meanings unknown (apk-1.1.0.md). */
/** s2c/1284 (sqc.a(sqi) of APK 1.1.0): the chat block list. */
function chatBlockList(r: Reader) {
  const a = r.u8(), b = r.u8(), message = r.string(), n = r.take(2).readInt16BE();
  const players = Array.from({ length: n }, () => ({ id: r.i32(), name: r.string() }));
  return { a, b, message, players };
}

function serverFlag(r: Reader) {
  const left = () => r.data.length - r.offset;
  const fields: Record<string, unknown> = { flag: r.u8() };
  if (left() >= 4) fields.sqj = r.i32();
  if (left() >= 1) fields.sqh = r.u8();
  if (left() >= 6) { fields.tA = r.i32(); fields.tB = r.take(2).readInt16BE(); if (left() >= 1) fields.tC = r.u8() === 1; }
  if (left() >= 1) fields.z = r.u8() === 1;
  return fields;
}

export function findEvent(direction: Direction, opcode: number | undefined) {
  return specs.find(s => s.direction === direction && s.opcode === opcode);
}

export interface RequestContext {
  username?: string; password?: string; challenge?: Uint8Array; serverId?: number;
  characterName?: string; mapId?: string; npcId?: number; zone?: number; stat?: number; amount?: number;
  /** u8 after the mob of c2s/15: 0 for a mob touched (B1), 1 for Bạch Hổ (BH2). */
  challengeFlag?: number;
  mobId?: string; battleUuid?: string; seq?: number; move?: Move; skill?: number; skillId?: number;
  /** uuid of an item on the ground (s2c/1182, s2c/1184) for c2s/1188. */
  uuid?: string;
  /** Bag or gear slot for c2s/1186, c2s/84, c2s/48; action 0 equip (bag slot), 1 unequip (gear slot); where 0 = gear. */
  slot?: number; action?: number; where?: number;
  /** The character's element, field01 of s2c/9 (1 Hỏa, 4 Thủy): c2s/30 asks for the skill tree of that element. */
  element?: number;
  /** c2s/57: the choice of s2c/57; c2s/1190: shopId of s2c/1190 and how many. */
  option?: number; shopId?: number; quantity?: number;
  /** c2s/97: 0 gear, stones, Chuyển hoá items; 1 charms and crafting materials (O1). */
  kind?: number;
  /** c2s/1216, c2s/1217, c2s/1219: the mail; c2s/1223: the gift code. */
  mailId?: number; code?: string;
  /** c2s/1236, c2s/1239: the key of a Phúc lợi event; c2s/1232, c2s/1233: its number and milestone. */
  key?: string; event?: number; milestone?: number;
  /** c2s/1192: the Chợ trời tab (-1 Đang bán) and page. c2s/115 takes the listing's uuid. */
  tab?: number; page?: number;
  /** c2s/112: the price in Xu (slot and quantity as above). */
  price?: number;
  /** c2s/1174: what the character says, as typed in the Chat box (09-players-chat.md#c2s-1174). */
  text?: string;
}
function required<T>(value: T | undefined, name: string): T {
  if (value === undefined) throw new Error(`Missing request field: ${name}`);
  return value;
}
/** One entry point per observed outgoing event; no UI or socket dependencies. */
export function buildRequest(opcode: number, ctx: RequestContext = {}): Buffer {
  const w = new Writer();
  switch (opcode) {
    case -1: case 1: case 2: case 3: case 1172: case 1257: case 1215: case 1218: case 116: case 1252: case 1275: return w.build();
    case 1192: return marketPageRequest(required(ctx.tab, 'tab'), ctx.page ?? 1);
    case 115: return marketBuyRequest(required(ctx.uuid, 'uuid'));
    case 113: return marketWithdrawRequest(required(ctx.uuid, 'uuid'));
    case 112: return marketSellRequest(required(ctx.slot, 'slot'), ctx.quantity ?? 1, required(ctx.price, 'price'));
    // Hòm thư and Mã quà tặng (G1). No c2s/1221 (Xóa hết): it deletes gifts not taken too.
    case 1216: case 1217: case 1219: return mailIdRequest(required(ctx.mailId, 'mailId'));
    // Phúc lợi (PL1).
    case 1236: case 1239: return eventKeyRequest(required(ctx.key, 'key'));
    case 1232: return checkinRequest(required(ctx.event, 'event'), ctx.milestone ?? 0);
    case 1233: return claimRequest(required(ctx.event, 'event'));
    case 1223: return giftCodeRequest(required(ctx.code, 'code'));
    case 1206: return w.string(PLATFORM).string(PROTOCOL_VERSION).i32(0).build();
    // A clean phone: no adb (USB or Wi-Fi), developer options off, no accessibility service (02-login.md#c2s-1282).
    case 1282: return w.u8(0).u8(0).u8(0).build();
    case 1284: return w.u8(0).build();
    case 5: return w.i32(ctx.serverId ?? BASELINE.observedServerId).i32(-1).u8(1).build();
    case 4: return loginPayload(required(ctx.username, 'username'), passwordProof(required(ctx.challenge, 'challenge'), required(ctx.password, 'password')), ctx.serverId ?? BASELINE.observedServerId);
    case 9: return w.string(required(ctx.username, 'username').toLowerCase()).u8(2).i32(-1).build();
    // The app sends the element of s2c/9 (sqlq.e49(1) for manina, Hỏa); with 4 the server sends the Thủy tree 4000–4008.
    case 30: return w.u8(ctx.element ?? 1).build();
    case 42: case 29: return w.string(required(ctx.characterName, 'characterName')).build();
    // After a zone change (s2c/13 with the zone) the app asks the map of that zone: (zone, 0) instead of (-1, -1) (B2).
    case 11: return w.string(required(ctx.mapId, 'mapId')).u8(ctx.zone ?? -1).i32(ctx.zone === undefined ? -1 : 0).build();
    case 43: return w.string(required(ctx.mapId, 'mapId')).build();
    case 13: return w.string(required(ctx.mapId, 'mapId')).i32(required(ctx.npcId, 'npcId')).build();
    case 10: return w.i32(required(ctx.stat, 'stat')).i32(required(ctx.amount, 'amount')).build();
    // Nâng cấp in the Kỹ năng tab: sqlq.e52(skillId, amount) writes two i32 like c2s/10 (E1).
    case 1191: return w.i32(required(ctx.skillId, 'skillId')).i32(required(ctx.amount, 'amount')).build();
    case 1173: return w.u8(required(ctx.zone, 'zone')).build();
    // OK of the Chat box of the speech bubble button: sqlq.q120(text) (CH1).
    case 1174: return w.string(required(ctx.text, 'text')).build();
    // Nhặt in the dialog of a chest on the ground: sqlq.c44(uuid) (P3).
    case 1188: return w.string(required(ctx.uuid, 'uuid')).build();
    case 1181: return w.string(required(ctx.mobId, 'mobId')).i32(0).i32(required(ctx.npcId, 'npcId')).build();
    // Chi tiết vật phẩm (P4): Trang bị / Cởi ra sqlq.b45(action, slot), Sử dụng sqlq.i79(slot), Sửa chữa sqlq.c47(where, slot).
    case 1186: return w.u8(required(ctx.action, 'action')).i32(required(ctx.slot, 'slot')).build();
    case 84: return w.i32(required(ctx.slot, 'slot')).build();
    case 48: return w.u8(ctx.where ?? 0).i32(required(ctx.slot, 'slot')).build();
    // Lái Buôn (P5): a line of the NPC menu sqlq.a103(option, mapId, npcId), then Mua sqlq.h87(shopId, quantity).
    case 57: return w.u8(required(ctx.option, 'option')).string(required(ctx.mapId, 'mapId')).i32(required(ctx.npcId, 'npcId')).build();
    case 1190: return w.u8(0).i32(required(ctx.shopId, 'shopId')).i32(ctx.quantity ?? 1).build();
    // Pháp sư (J1, J3, O1): put the item of a bag slot in the open window sqlq.a107(""; 0; kind; slot), kind 1 for charms
    // and crafting materials (npc.ts PUT_STACK), then Bắt đầu sqlq.m109("").
    case 97: return putRequest(required(ctx.slot, 'slot'), ctx.quantity ?? 1, ctx.kind ?? PUT_ITEM);
    case 91: return startRequest();
    // Túi đồ in battle (P5): sqlq.g76(slot, 0) writes the 0 first, like c2s/20 writes seq before the skill.
    case 44: return w.string(required(ctx.battleUuid, 'battleUuid')).i32(0).i32(required(ctx.slot, 'slot')).build();
    case 15: return w.string(required(ctx.mobId, 'mobId')).u8(ctx.challengeFlag ?? 0).build();
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
      case -1: case 1: case 2: case 3: case 1172: case 1257: case 1215: case 1196: case 1240: case 1241: case 1252: case 1218: case 1221: case 1275: case 1277: case 1281: break;
      case 1282: fields = { adb: r.u8(), devOptions: r.u8() === 1, accessibility: r.u8() }; break;
      case 1284: { const command = r.u8(); fields = r.data.length - r.offset >= 4 ? { command, playerId: r.i32() } : { command }; break; }
      case 1285: fields = { playerId: r.i32(), reason: r.u8() }; break;
      case 1216: case 1217: case 1219: fields = { mailId: Number(r.take(8).readBigInt64BE()) }; break;
      case 1223: fields = { code: r.string() }; break;
      case 1236: case 1239: fields = { key: r.string() }; break;
      case 1232: fields = { event: Number(r.take(8).readBigInt64BE()), milestone: Number(r.take(8).readBigInt64BE()) }; break;
      case 1233: fields = { event: Number(r.take(8).readBigInt64BE()) }; break;
      case 1192: fields = { mode: r.u8(), tab: r.i32(), page: r.i32() }; break;
      case 115: case 113: fields = { uuid: r.string() }; break;
      case 116: fields = {}; break;
      case 112: fields = r.data[0] === 1 ? { kind: r.u8(), slot: r.i32(), quantity: r.i32(), price: Number(r.take(8).readBigInt64BE()) } : { kind: r.u8(), uuid: r.string() }; break;
      case 13: fields = { mapId: r.string(), npcId: r.i32() }; break;
      case 1173: fields = { zone: r.u8() }; break;
      case 1174: fields = { text: r.string() }; break;
      case 15: fields = { mobId: r.string(), flag: r.u8() }; break;
      case 1178: fields = { mobId: r.string(), flag: r.i32() }; break;
      case 18: case 40: fields = { battleUuid: r.string() }; break;
      case 14: fields = { battleUuid: r.string(), seq: r.i32() }; break;
      case 20: fields = { battleUuid: r.string(), seq: r.i32(), skill: r.i32() }; break;
      case 19: fields = { battleUuid: r.string(), seq: r.i32(), from: [r.i32() - 2, r.i32() - 2], to: [r.i32() - 2, r.i32() - 2] }; break;
      case 10: fields = { stat: r.i32(), amount: r.i32() }; break;
      case 1191: fields = { skillId: r.i32(), amount: r.i32() }; break;
      case 1188: fields = { uuid: r.string() }; break;
      case 1181: fields = { mobId: r.string(), flag: r.i32(), npcId: r.i32() }; break;
      case 1186: fields = { action: r.u8(), slot: r.i32() }; break;
      case 84: fields = { slot: r.i32() }; break;
      case 57: fields = { option: r.u8(), mapId: r.string(), npcId: r.i32() }; break;
      case 1190: fields = { kind: r.u8(), shopId: r.i32(), quantity: r.i32() }; break;
      case 97: fields = { key: r.string(), from: r.u8(), kind: r.i32(), slot: r.i32(), quantity: r.i32() }; break;
      case 91: fields = { key: r.string() }; break;
      case 44: fields = { battleUuid: r.string(), a: r.i32(), slot: r.i32() }; break;
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
      case 1209: fields = serverFlag(r); break;
      case 1279: fields = { mask: r.i32() }; break;
      case 1236: { const d = eventDefinition(payload); fields = d; r.take(payload.length - (d.rest?.length ?? 0)); break; }
      case 1239: { const p = eventProgress(payload); fields = p; r.take(payload.length - (p.rest?.length ?? 0)); break; }
      case 1232: fields = checkinResult(payload); r.take(payload.length); break;
      case 1284: fields = chatBlockList(r); break;
      case 1285: fields = { result: r.u8(), message: r.string() }; break;
      case 1220: fields = { unread: r.u8() === 1 }; break;
      case 1195: fields = dailyQuest(payload); r.take(payload.length); break;
      case 1192: fields = market(payload); r.take(payload.length); break;
      case 116: fields = marketTabs(payload); r.take(payload.length); break;
      case 112: fields = marketListed(payload); r.take(payload.length); break;
      case 113: fields = marketDone(payload, 113); r.take(payload.length); break;
      case 115: fields = marketDone(payload, 115); r.take(payload.length); break;
      case 1216: fields = mailBody(payload); r.take(payload.length); break;
      case 1217: case 1219: fields = mailAck(payload, opcode); r.take(payload.length); break;
      case 1222: fields = newMail(payload); r.take(payload.length); break;
      case 1223: fields = giftCodeResult(payload); r.take(payload.length); break;
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
      case 51: fields = bagSlot(payload); r.take(payload.length); break;
      case 83: fields = { slot: r.i32(), left: r.i32() }; break;
      case 84: fields = itemUsed(payload); r.take(payload.length); break;
      case 57: fields = npcMenu(payload); r.take(payload.length); break;
      case 1190: fields = shopList(payload); r.take(payload.length); break;
      case 96: fields = serviceWindow(payload); r.take(payload.length); break;
      case 99: fields = craftWindow(payload); r.take(payload.length); break;
      case 90: fields = serviceSlot(payload); r.take(payload.length); break;
      case 92: fields = stoneSlot(payload); r.take(payload.length); break;
      case 1258: fields = servicePreview(payload); r.take(payload.length); break;
      case 1260: fields = transmuteTarget(payload); r.take(payload.length); break;
      case 91: fields = serviceResult(payload); r.take(payload.length); break;
      case 93: fields = stoneResult(payload); r.take(payload.length); break;
      case 1180: fields = duelInvite(payload); r.take(payload.length); break;
      case 44: fields = battleItemResult(r); break;
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
      case 36: fields = gearDurability(payload); r.take(payload.length); break;
      case 1214: case 1200: break;
      case 1187: fields = inventory(payload); r.take(payload.length); break;
      case 1191: fields = { statPoints: r.i32(), skillPoints: r.i32() }; break;
      case 48: fields = { where: r.u8(), slot: r.i32() }; break;
      case 39: fields = { ...questData(payload) }; r.take(payload.length); break;
      case 34: fields = questProgress(payload); r.take(payload.length); break;
      case 35: fields = questComplete(payload); r.take(payload.length); break;
      case 1254: fields = ranking(payload); r.take(payload.length); break;
      case 1252: fields = bachHoBoard(payload); r.take(payload.length); break;
      case 1275: fields = bachHoResult(payload); r.take(payload.length); break;
      case 1215: fields = mailList(payload); r.take(payload.length); break;
      case 1196: fields = { count: r.i32() }; break;
      case 1240: case 1241: fields = { flag: r.u8() }; break;
      case 1265: fields = { command: r.u8() }; break;
      case 46: fields = currencies(payload); r.take(payload.length); break;
      case 1177: fields = mapBoss(payload); r.take(payload.length); break;
      case 1182: fields = groundDrop(payload); r.take(payload.length); break;
      case 1184: fields = groundItems(payload); r.take(payload.length); break;
      case 1183: fields = { mapId: r.string(), uuid: r.string() }; break;
      case 1170: fields = { id: r.i32() }; break;
      // Protocol 0.0.7 adds two bytes, as in the player record: u8 (0) and the weapon's element (20/11).
      case 1166: { const id = r.i32(), gear = Array.from({ length: 6 }, () => r.i32()); fields = r.data.length - r.offset === 2 ? { id, gear, plus: r.u8(), weaponElement: r.u8() } : { id, gear }; break; }
      case 1253: fields = { id: r.i32(), level: r.i32(), hp: r.i32(), maxHp: r.i32(), field: r.u8() }; break;
      case 1167: fields = playerRecord(r); break;
      case 1212: fields = playerStatus(r); break;
      case 1263: fields = playersSnapshot(payload); r.take(payload.length); break;
      case 1262: fields = positions(payload); r.take(payload.length); break;
      case 1172: fields = zoneList(payload); r.take(payload.length); break;
      case 1205: fields = worldChat(payload); r.take(payload.length); break;
      case 1174: fields = playerSay(payload); r.take(payload.length); break;
      case 45: fields = { text: r.string() }; break;
    }
  }
  return { name: spec?.name ?? 'unknown_event', fields, parsedBytes: r.offset, opaqueBytes: payload.length - r.offset, known: Boolean(spec) };
}

export function eventExample(direction: Direction, opcode: number, payload: Uint8Array) {
  const value = decodeEvent(direction, opcode, payload);
  return { ...value, payloadHex: direction === 'c2s' && opcode === 4 ? undefined : Buffer.from(payload).subarray(0, 128).toString('hex'), payloadBytes: payload.length };
}
