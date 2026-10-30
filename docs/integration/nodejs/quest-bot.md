# Bot làm nhiệm vụ bằng Node.js

Bot đăng nhập trực tiếp như `npm run world`, giữ kết nối sau khi vào thế giới, rồi tự làm nhiệm vụ chính đang nhận. Kết quả đã chạy và các gói gặp phải nằm ở [10-quests](../../app/events/10-quests.md); bố cục gói trận ở [05-battle](../../app/events/05-battle.md).

## Chạy

```bash
npm run quest -- --fights=40
```

| Tham số / biến | Mặc định | Ý nghĩa |
|---|---|---|
| `--fights=N` | 3 | Số trận tối đa trong một lần chạy |
| `--min-hp=R` | 0 | Không thách đấu khi HP trên bản đồ dưới `R × HP tối đa`. Server hồi đầy HP lúc vào trận nên mặc định không chặn |
| `--grind=<tên quái>` | quái mạnh nhất không quá cấp mình | Quái để đánh khi bước "Đạt cấp độ N" chưa đủ cấp |
| `--skill=ID:COST` | tắt | Dùng kỹ năng `ID` (`c2s/20`) khi nội lực ≥ `COST`; `1000:25` là Hỏa Cầu Thuật |
| `--goal=kill\|exp` | `kill` | Bộ trọng số chọn nước: thắng nhanh, hoặc ăn sao/giọt nước/vàng |
| `--move-ms=N`, `--rest-ms=N` | 1000, 3000 | Nghỉ giữa các nước trong trận tính giờ; nghỉ trước trận sau |
| `--farm=<tên quái>` | tắt | Bỏ qua nhiệm vụ, chỉ đánh loại quái này (để đo tốc độ) |
| `CLLT_USERNAME`, `CLLT_PASSWORD` | | Đọc từ `.env` như [CLI chính](README.md#chạy-với-tài-khoản-của-bạn) |
| `CLLT_TRACE=<file>` | | Ghi mọi log client ra JSONL, kèm hex đầy đủ của từng gói (trừ `c2s/4`) |

- Tài khoản **không được online ở máy khác**. Khi đó server trả `s2c/0` và từ chối đăng nhập; đóng game trên điện thoại trước.
- Bot đánh trận thật với server: EXP, tiền, vật phẩm và tiến độ nhiệm vụ được ghi vào tài khoản. Bot không mua bán, không chat.
- Lệnh in JSON từng dòng: sự kiện của bot (`kind: "quest"`), gói ít gặp, và dòng cuối `quest_run_result`.

## Bot làm gì với từng bước

| Bước trong `s2c/39` | Hành động |
|---|---|
| "Nói chuyện với X", "Báo cáo với X" | `c2s/13 (mapId, npcId)`; `s2c/34` trả lời thì tự sang bước sau |
| "Tiêu diệt X", "Đánh bại X" | `c2s/15` lần lượt từng con tên X trong `s2c/43`, đánh hết trận, mỗi trận thắng tính 1 |
| "Đạt cấp độ N" (chưa đủ cấp) | Đánh quái mạnh nhất không quá cấp mình, hoặc `--grind` |
| "Nâng điểm tiềm năng" | `c2s/10 (0, 1)`: cộng 1 điểm vào chỉ số 0 |
| "Gây N sát thương lên X" | Thách đấu boss X từ `s2c/1177`, cộng dồn sát thương. Server chưa nhận thách đấu boss (xem [10-quests](../../app/events/10-quests.md#bước-boss-chưa-làm-được-q10)) |
| Khác | Dừng với `step needs an action this bot does not know` |

Bot dừng khi thua một trận, khi HP dưới `--min-hp`, khi đủ `--fights`, khi NPC không trả lời trong 8 s, hoặc khi không có quái cần đánh trong khu hiện tại.

## Luồng code

```text
quest-run.ts ─ envConnection() ─ runClient({ mode: 'world', session: QuestBot })
client.ts    đăng nhập theo FLOW; sau s2c/43 + s2c/1263 gọi session.onReady(api) và chuyển mọi gói cho session.onPacket
quest.ts     QuestBot: đọc s2c/39, chọn bước, gửi c2s/13 hoặc c2s/15; s2c/22 → tạo BattleRunner
battle-runner.ts  BattleRunner: c2s/18 → s2c/18
                  theo lượt:  s2c/24 → c2s/19 (hoặc c2s/20 kỹ năng) / c2s/14 → s2c/19|20 cập nhật bàn
                  tính giờ:   c2s/19|20 liên tục mỗi --move-ms; s2c/21 là đòn của quái
                  → onEnd khi end=1
battle.ts    mô hình bàn 8×8, bestMove, đọc s2c/22, s2c/24, s2c/19|20
events.ts    buildRequest() cho mọi gói gửi đi, decodeEvent() cho log
```

`WorldSession` ([client.ts](../../../src/client.ts)) là điểm nối chung: bot khác chỉ cần cài `onReady(api)` và `onPacket(opcode, payload)`, rồi gửi bằng `api.send(opcode, buildRequest(opcode, ctx))`. Sau khi vào thế giới, lỗi giải mã một gói chỉ sinh `schema_warning`, không đóng kết nối.

## Sự kiện log của bot

| `event` | Khi nào |
|---|---|
| `ready`, `quest` | Vào thế giới; nhận `s2c/39` (kèm bước hiện tại) |
| `talk`, `quest_progress`, `step_advanced` | Gửi `c2s/13`; nhận `s2c/34`; tự tăng bước |
| `challenge`, `battle_setup`, `battle_end`, `kill_counted` | Một trận, từ thách đấu tới kết quả |
| `board_reshuffled`, `board_desync`, `no_legal_move` | Server xếp lại bàn; mô hình lệch với server; không còn nước |
| `move`, `skill_try`, `skill_cast`, `skill_no_answer`, `timed_attack`, `turn_inferred` | Từng nước (viên ăn được, sát thương); dùng kỹ năng; đòn của quái trong trận tính giờ; tự suy lượt khi thiếu `s2c/24` |
| `boss`, `damage_counted`, `level`, `durability`, `battle_cancelled`, `currency` | Boss từ `s2c/1177`; sát thương cộng dồn cho bước boss; lên cấp; độ bền trang bị (`s2c/36`); `s2c/36` đến giữa trận nghĩa là server đã kết thúc trận; tiền |
| `quest_complete`, `stats` | `s2c/35` phần thưởng; `s2c/10` kiểu 4 (HP, EXP) |
| `parse_error`, `server_text`, `stop` | Gói đọc lỗi (kèm hex); `s2c/0`, `s2c/5`; lý do dừng |
