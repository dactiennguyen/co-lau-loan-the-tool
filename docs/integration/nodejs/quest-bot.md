# Bot làm nhiệm vụ bằng Node.js

Bot đăng nhập trực tiếp như `npm run world`, giữ kết nối sau khi vào thế giới, rồi tự làm nhiệm vụ chính đang nhận. Kết quả đã chạy và các gói gặp phải nằm ở [10-quests](../../app/events/10-quests.md); bố cục gói trận ở [05-battle](../../app/events/05-battle.md).

## Chạy

```bash
npm run quest -- --fights=40
```

| Tham số / biến | Mặc định | Ý nghĩa |
|---|---|---|
| `--fights=N` | 3 | Số trận tối đa trong một lần chạy |
| `--max-losses=N` | 1 | Thua N trận (không tính trận boss) thì dừng. Mỗi trận thua mất EXP (36 ở cấp 19) nhưng HP được hồi đầy |
| `--min-hp=R` | 0 | Dừng thay vì thách đấu khi HP trên bản đồ dưới `R × HP tối đa`. Trận mới bắt đầu với HP trên bản đồ, HP không tự hồi khi đứng yên (Q19), chỉ được hồi đầy sau một trận thua |
| `--grind=<tên quái>` | quái mạnh nhất không quá cấp mình | Quái để đánh khi bước "Đạt cấp độ N" chưa đủ cấp |
| `--skills=auto\|none\|ID,ID` | `auto` | Kỹ năng bot được dùng trong trận. `auto`: mọi kỹ năng đã học (cây `s2c/30`, cấp trong `s2c/9` và `s2c/10` kiểu 32). Mỗi lượt bot so nước đổi chỗ, từng kỹ năng đủ nội lực và bình trên cùng một thang điểm ([Chọn hành động](../../app/events/07-auto-battle.md#chọn-hành-động)). `none`: chỉ đổi chỗ |
| `--skill=ID:COST` | tắt | Cách cũ: chỉ một kỹ năng. Có bảng kỹ năng thì giống `--skills=ID`; không có thì dùng `castSkill` với giá `COST` |
| `--potions=HP` | không dùng | Cho phép dùng Hoàn Linh Dược và Kim Đan Dược trong túi (`c2s/44`), mỗi bình tính như mất `HP` máu. `300`: chỉ dùng khi quái có thể kết thúc trận ở nước sau. Mỗi bình tốn 120 Xu khóa ở Lái Buôn |
| `--no-pickup` | nhặt | Không nhặt đồ. Mặc định, thắng trận xong bot gửi `c2s/1188` cho từng món của mình vừa rơi (đến trong 300 ms quanh gói kết thúc), mỗi món cách nhau 200 ms, không cần đi tới hòm ([G2](../../app/events/13-drops-items.md#g2)). Dòng log `pickup`, `pickup_notice` (lời server), `picked` (món rời khỏi đất trong 1 s sau gói nhặt, tức bot nhặt được); tổng ở `picked` của `stop` và `quest_run_result` |
| `--goal=kill\|exp\|win\|farm` | `kill` | Cách chấm nước ([07-auto-battle](../../app/events/07-auto-battle.md#thuật-toán-của-bot)): thắng nhanh, hoặc ăn thêm sao/giọt nước/vàng. `win` và `farm` là hai mục tiêu đó với mô hình quái đo được ([Thuật toán v2](../../app/events/07-auto-battle.md#thuật-toán-v2)) |
| `--move-ms=N`, `--rest-ms=N` | 1000, 3000 | Nghỉ giữa các nước trong trận tính giờ; nghỉ trước trận sau |
| `--farm=<tên quái>` | tắt | Bỏ qua nhiệm vụ, chỉ đánh loại quái hoặc boss này ở map đang đứng; với `--fights=N` là "đánh X N lần". Boss (`s2c/1177`, hoặc `data/maps.json` ghi có ở map này) được thách đấu bằng `c2s/1178`, được đợi 6 × 5 s khi đang đổi chỗ, và thua boss không làm bot dừng. App Rust port đúng luật này ([App Rust](../rust/features.md#việc-đánh-x-n-lần)) |
| `--once` | tắt | Chỉ làm bước đang làm lúc vào game. Dừng với `step done` ngay khi nhiệm vụ qua bước đó: NPC trả lời (`s2c/34`), có `s2c/39` mới, hoặc đủ số con hay đủ sát thương. Nếu nhiệm vụ lùi về bước trước thì dừng với `quest left the step`. App Rust dùng cho nút ▶ trên từng bước ([App Rust](../rust/features.md#làm-một-bước)) |
| `--surrender-after=N` | tắt | Đầu hàng trận đầu tiên sau N nước của mình, như nút "Đầu hàng" của game: `c2s/11` rồi `c2s/40`, không đi nước nữa, trả `s2c/11` bằng `c2s/43`. Trận xong khi có `s2c/1214` hoặc `s2c/36`, kể cả đến muộn, rồi bot dừng (`surrendered`). Không có trong 8 s thì đánh tiếp, bắt đầu bằng lượt đã đến trong lúc chờ; trận kết thúc thì bot cũng dừng. Mất EXP (29 ở B3). Để thử đầu hàng với server thật |
| `--stats=auto`, `--stats=than`, `--stats=cuong:3,than:1` | tắt | Cộng hết điểm tiềm năng: `auto` vào chỉ số chính của hệ (Hỏa Cường Lực, Thủy Nội Lực; hệ khác thì không cộng), hoặc chia theo tỉ lệ giữa `cuong`, `noi`, `than`, `the`. Từng `c2s/10 (chỉ số, 1)` như nút "Cộng +1", gói sau đợi `s2c/10` kiểu 8 của gói trước; lúc vào game và giữa các trận. Chừa điểm cho các bước "Nâng điểm tiềm năng" còn lại của nhiệm vụ ([12-skills-items](../../app/events/12-skills-items.md#điểm-tiềm-năng)). Chưa chạy thật |
| `--atlas=<file>` | `data/maps.json` | Bản đồ đã biết ([Quét map](#quét-map)): bot đọc lúc bắt đầu và ghi lại khi gặp map, quái, boss, cổng mới |
| `--record=<thư mục>`, `--no-record` | `captures/battles` | Mỗi trận một file `<ngày>/<giờ>-<nhân vật>-<quái>.jsonl.gz`: thông tin trước trận (nhân vật, hệ, chỉ số, kỹ năng, đồ, bình, quái và hệ quái, tham số bot), mọi gói của trận, lựa chọn của bot từng lượt, kết quả ([Ghi trận](../../app/events/07-auto-battle.md#ghi-trận)). Dòng log `battle_recorded` (file, số dòng) hay `battle_record_error`. `npm run battles` đọc lại và phát lại các trận đã ghi |
| `CLLT_USERNAME`, `CLLT_PASSWORD` | | Đọc từ `.env` như [CLI chính](README.md#chạy-với-tài-khoản-của-bạn) |
| `CLLT_TRACE=<file>` | | Ghi mọi log client ra JSONL, kèm hex đầy đủ của từng gói (trừ `c2s/4`) |

- Tài khoản **không được online ở máy khác**. Khi đó server trả `s2c/0` và từ chối đăng nhập; đóng game trên điện thoại trước.
- Bot đánh trận thật với server: EXP, tiền, vật phẩm và tiến độ nhiệm vụ được ghi vào tài khoản. Bot nhặt đồ mình làm rơi (trừ khi có `--no-pickup`), không mua bán, không chat.
- Lệnh in JSON từng dòng: sự kiện của bot (`kind: "quest"`), gói ít gặp, và dòng cuối `quest_run_result`.

## Bot làm gì với từng bước

| Bước trong `s2c/39` | Hành động |
|---|---|
| "Nói chuyện với X", "Báo cáo với X" | `c2s/13 (mapId, npcId)`; `s2c/34` trả lời thì tự sang bước sau |
| "Tỷ thí với X" (nhiệm vụ 12) | `c2s/13` như trên, server trả hộp thoại `s2c/57`. Bot gửi `c2s/57 (dòng "Đồng ý", mapId, npcId)` và đánh trận với NPC; mã NPC trong `s2c/22` là chuỗi ngay trước tên nó (`duelMobId`). `s2c/34` sau trận mới sang bước sau. Hộp thoại không có "Đồng ý" thì dừng với `npc asked something the bot cannot answer`; trận không mở trong 8 s thì nói chuyện lại, lần tỷ thí thứ tư thì dừng với `3 duels and the step did not move` ([Bước Tỷ thí](../../app/events/10-quests.md#tỷ-thí)) |
| "Tiêu diệt X", "Tiêu diệt 1 X", "Đánh bại X" | `c2s/15` lần lượt từng con tên X trong `s2c/43`, đánh hết trận, mỗi trận thắng tính 1 |
| "Đạt cấp độ N" (chưa đủ cấp) | Đánh quái mạnh nhất không quá cấp mình, không chọn boss (boss bỏ qua `c2s/15`), hoặc `--grind` |
| "Nâng điểm tiềm năng" | `c2s/10 (0, 1)`: cộng 1 điểm vào Cường Lực; với `--stats` là chỉ số tới lượt theo lựa chọn đó |
| "Sử dụng điểm kỹ năng" | `c2s/1191 (mã, 1)` cho kỹ năng đầu tiên trong cây `s2c/30` lên được một cấp ngay: đã học kỹ năng đứng trước, đủ cấp, đủ điểm. Nhân vật mới thì là kỹ năng gốc (1000 Hỏa Cầu Thuật, 4000 Băng Tiễn Thuật). Server trả `s2c/10` kiểu 32, `s2c/1191`, rồi `s2c/34` sang bước sau. Có `s2c/1191` mà không có lời nhiệm vụ trong 8 s thì dừng. Không kỹ năng nào lên được thì dừng với `no skill can take a level now` ([12-skills-items](../../app/events/12-skills-items.md#c2s-1191)) |
| "Gây N sát thương lên X" | `c2s/1178` với boss X từ `s2c/1177`; thua vẫn đánh tiếp, tiến độ là tổng sát thương ([10-quests](../../app/events/10-quests.md#boss)) |
| NPC hoặc quái của bước không có ở map này | Đi qua cổng: `c2s/13 (mapId, id cổng)` → `s2c/13` → `c2s/11` → `c2s/43`. Chọn cổng đầu tiên trên đường ngắn nhất (theo `data/maps.json`) tới map có NPC/quái đó, nếu không thì cổng mà tên nhiệm vụ nhắc tới, nếu không thì cổng tới map chưa đi; tối đa 6 lần cho mỗi bước. Cổng bị từ chối (`s2c/1256`: thiếu cấp, chưa xong nhiệm vụ) được ghi lại và bỏ qua ([10-quests](../../app/events/10-quests.md#cổng)) |
| Khác | Dừng với `step needs an action this bot does not know` |

App Rust port đúng bảng này thành nút "Tự làm nhiệm vụ" ([App Rust](../rust/features.md#tự-làm-nhiệm-vụ)); `npm run export:rust` xuất các kịch bản để hai bên gửi đúng cùng gói.

Bot dừng khi thua đủ `--max-losses` trận (trừ trận boss của bước sát thương), khi HP dưới `--min-hp`, khi đủ `--fights`, khi NPC hoặc cổng không trả lời trong 8 s, hoặc khi không còn cổng nào để tìm map có quái cần đánh. Tiến độ bước lấy từ `s2c/1201` của server; bot chỉ tự đếm trong vài mili giây trước khi gói này tới.

## Luồng code

```text
quest-run.ts ─ envConnection() ─ runClient({ mode: 'world', session: QuestBot })
client.ts    đăng nhập theo FLOW (c2s/30 gửi hệ nhân vật = field01 của s2c/9); sau s2c/43 + s2c/1263 (khu vắng: 1,5 s sau s2c/43) gọi session.onReady(api)
             và chuyển mọi gói cho session.onPacket
quest.ts     QuestBot: đọc s2c/39, chọn bước (stepAction), gửi c2s/13 (NPC hoặc cổng), c2s/15 hoặc c2s/1178 (boss),
             c2s/10 (điểm tiềm năng), c2s/1191 (điểm kỹ năng); s2c/9 + s2c/30 → cấp từng kỹ năng và cây kỹ năng;
             s2c/11 → danh sách NPC/cổng; s2c/1201 → tiến độ; s2c/22 → tạo BattleRunner
atlas.ts     data/maps.json: NPC/cổng, quái theo khu, boss, cổng dẫn đâu hoặc bị từ chối; route() tìm đường
battle-runner.ts  BattleRunner: c2s/18 → s2c/18
                  theo lượt:  s2c/24 → c2s/19 (hoặc c2s/20 kỹ năng) / c2s/14 → s2c/19|20 cập nhật bàn
                  tính giờ:   c2s/19|20 liên tục mỗi --move-ms; s2c/21 là đòn của quái
                  → onEnd khi end=1
battle.ts    mô hình bàn 8×8, bestMove, đọc s2c/22, s2c/24, s2c/19|20
events.ts    buildRequest() cho mọi gói gửi đi, decodeEvent() cho log
```

`WorldSession` ([client.ts](../../../src/net/client.ts)) là điểm nối chung: bot khác chỉ cần cài `onReady(api)` và `onPacket(opcode, payload)`, rồi gửi bằng `api.send(opcode, buildRequest(opcode, ctx))`. Sau khi vào thế giới, lỗi giải mã một gói chỉ sinh `schema_warning`, không đóng kết nối.

## Sự kiện log của bot

| `event` | Khi nào |
|---|---|
| `ready`, `quest` | Vào thế giới; nhận `s2c/39` (kèm bước hiện tại) |
| `talk`, `quest_progress`, `step_advanced` | Gửi `c2s/13`; nhận `s2c/34`; tự tăng bước |
| `npc_menu`, `duel`, `duel_no_answer` | Hộp thoại `s2c/57` (tên NPC, câu hỏi, các dòng); gửi `c2s/57` "Đồng ý" để tỷ thí; trận tỷ thí không mở trong 8 s |
| `challenge`, `battle_setup`, `battle_end`, `kill_counted`, `estimates` | Một trận, từ thách đấu tới kết quả; thông số hai bên học được trong trận (sát thương mỗi viên kiếm, kỹ năng, HP tối đa của quái) |
| `board_reshuffled`, `board_desync`, `no_legal_move` | Server xếp lại bàn; mô hình lệch với server; không còn nước |
| `move`, `skill_try`, `skill_cast`, `skill_no_answer`, `timed_attack`, `turn_inferred` | Từng nước (viên ăn được, sát thương); dùng kỹ năng; đòn của quái trong trận tính giờ; tự suy lượt khi thiếu `s2c/24` |
| `map`, `travel`, `map_changed`, `arrived`, `portal_refused` | `s2c/11` (NPC, cổng của map); gửi `c2s/13` qua cổng; `s2c/13`; `s2c/43` của map mới; `s2c/1256` từ chối cổng (kèm lời server) |
| `step_progress`, `boss_moving`, `waiting_for_mob` | `s2c/1201` (tiến độ server); `s2c/1177` field 1 (boss rời ô); quái của bước thuộc map này theo `data/maps.json` (như boss đang đổi chỗ) mà chưa thấy: đợi 5 s, tối đa 6 lần, rồi dừng, không đi map khác |
| `boss`, `boss_loss`, `damage_counted`, `level`, `durability`, `battle_cancelled`, `currency` | Boss từ `s2c/1177`; thua boss (không dừng bot); sát thương cộng dồn cho bước boss; lên cấp; độ bền trang bị (`s2c/36`); `s2c/36` đến giữa trận nghĩa là server đã kết thúc trận; tiền: Xu, Xu khóa, Lượng của `s2c/46` |
| `character`, `gear`, `effects`, `players` | `effects`: hiệu ứng có hạn giờ và sứ quân ở cuối `s2c/9`, ví dụ `"ef7 x2, còn 3h40"` (ngôi sao x2 EXP, [12](../../app/events/12-skills-items.md#x2-exp)). `gear`: trang bị đang mặc ở đuôi `s2c/9`, ví dụ `"0: Nón Âu Lạc (+4 phòng thủ, +58 sinh lực), hệ Lôi, độ bền 55/60"` ([ô trang bị](../../app/events/12-skills-items.md#ô-trang-bị)). Lúc đăng nhập, từ đuôi `s2c/9`: cấp, HP, EXP, mốc EXP, xu, chỉ số chiến đấu, điểm tiềm năng và điểm kỹ năng ([user-data](../../app/user-data.md#đuôi-s2c9)). Mỗi `s2c/1263`: số người khác trong khu kèm tên và cấp ([09](../../app/events/09-players-chat.md#đếm-người-xung-quanh)) |
| `quest_complete`, `stats`, `inventory` | `s2c/35` phần thưởng; `s2c/10` kiểu 4 (HP, EXP); `s2c/1187` cả túi đồ khi đổi, mỗi món theo tên trong `data/items.json`, ví dụ `"Hoàn Linh Dược ×4"`, `"Nón Lá (+5 phòng thủ, +66 sinh lực)"` ([13-drops-items](../../app/events/13-drops-items.md#bảng-vật-phẩm)) |
| `parse_error`, `server_text`, `stop` | Gói đọc lỗi (kèm hex); `s2c/0`, `s2c/5`; lý do dừng |

## Quét map

```bash
npm run scan
```

Đăng nhập như `npm run quest`, xin bản đồ thế giới (`c2s/11 "M99"`), rồi đi lần lượt qua mọi cổng vào được, sâu trước. Ở mỗi map lệnh xin `c2s/11` và `c2s/43`, đợi `s2c/1177` 1,5 s, rồi quay lại map trước đó, và cuối cùng về map lúc đăng nhập. Lệnh chỉ gửi `c2s/11`, `c2s/13`, `c2s/43`. Kết quả ở [06-map-mobs](../../app/events/06-map-mobs.md#atlas).

| Tham số | Mặc định | Ý nghĩa |
|---|---|---|
| `--atlas=<file>` | `data/maps.json` | File đọc vào rồi ghi lại sau mỗi map và mỗi cổng bị từ chối |
| `CLLT_TRACE=<file>` | | Ghi mọi log client ra JSONL kèm hex đầy đủ, như `npm run quest`. Đồ đang nằm trên đất của từng map là `s2c/1184` trong file này ([13-drops-items](../../app/events/13-drops-items.md#đồ-đã-thấy)) |

`data/maps.json` ([src/bot/atlas.ts](../../../src/bot/atlas.ts)) gồm:

| Khoá | Nội dung | Nguồn |
|---|---|---|
| `world` | 25 map: cấp yêu cầu, bị khoá hay không | `s2c/11 "M99"` |
| `maps.<mapId>.places` | NPC (loại 2) và cổng (loại 0): id, tên, x, y, w, h (đơn vị server) | `s2c/11` |
| `maps.<mapId>.mobs` | Loại quái, cấp, và các `mobId` của từng khu đã gặp | `s2c/43` + byte `area` của `s2c/11` |
| `maps.<mapId>.bosses` | Boss: `mobId` theo khu, ô đứng lần cuối thấy | `s2c/1177` |
| `portals.<id>` | Cổng dẫn tới map nào (`mapId`), hoặc cần cấp (`level`), hoặc lời từ chối khác (`refused`) | `s2c/13`, `s2c/1256` |

Chỉ ghi những gì server đã gửi. Cổng bị từ chối vì cấp chỉ được thử lại khi nhân vật đủ cấp; cổng bị từ chối vì nhiệm vụ được thử lại ở mỗi lần quét. Bot nhiệm vụ ghi vào cùng file, nên mỗi lần chạy bot hay quét đều làm file đầy thêm.

| `event` (`kind: "scan"`) | Khi nào |
|---|---|
| `map` | Một map mới: NPC, cổng, loại quái, boss |
| `portal`, `portal_refused` | Qua được cổng (map đích, khu); bị từ chối (lời server) |
| `ground_items` | Đồ đang nằm trên đất lúc vào map (`s2c/1184`), theo tên kèm toạ độ, ví dụ `"Xu khóa ×123 @1391,640"` |
| `done`, `stop` | Quét xong (các map đã đi, đã về map đầu chưa); dừng giữa chừng (lý do) |
