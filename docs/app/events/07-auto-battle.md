# Đánh quái tự động: online hay offline, luật bàn cờ, thuật toán

Mốc: APK 1.0.3, server Thanh Khê (`play.colauloanthe.vn:1688`). Ngày đo: 30/10/2026, máy M2101K7BG (Android 13, root), nhân vật `manina` cấp 3, bản đồ M1 (Làng Thanh Khê) khu 0.

Bot đã đánh thật với server:
- **run2**: sai thứ tự tham số `a74`, nước gửi lên bị server bỏ qua.
- **run3**: phát hiện viên đặc biệt, mô hình cũ lệch bàn.
- **run4**: thắng Gà Điên sau 5 nước, mô hình không lệch lần nào.

Mọi luật bàn cờ trong file này đã kiểm bằng cách replay 52 bước của ba trận thật (B1 của [05-battle](05-battle.md), run3, run4), xem test [test/battle.test.ts](../../../test/battle.test.ts) và mô hình [src/battle.ts](../../../src/battle.ts). Nhãn **[Đo]**, **[Suy luận]**, **[Chưa rõ]** dùng như các file khác.

## Trả lời nhanh

| Câu hỏi | Trả lời | Căn cứ |
|---|---|---|
| Vừa vào một khu có quét được hết quái không? | **Có.** Gửi `c2s/43` (mapId), server trả `s2c/43` với id, tên, cấp của cả 33 con trong khu. | run2/3/4, mỗi lần 33 con [Đo] |
| Có phải di chuyển tới quái mới đánh được không? | **Không**, với quái thường. Gửi thẳng `c2s/15` (mobId) khi nhân vật đứng xa, server vẫn mở trận. Boss Thủ Lĩnh Sơn Tặc thì server không trả lời ([10-quests](10-quests.md#bước-boss-chưa-làm-được-q10)). | `mob10` ở xa, s2c/22 về sau 2,4 s, 3 lần; Q3–Q12 hơn 40 trận [Đo] |
| Có cần giao diện game vào màn đánh không? | **Không.** Client đứng yên ở bản đồ, cả trận diễn ra chỉ bằng gói tin. Server vẫn cộng EXP, tiền và tiến độ nhiệm vụ. | run4: màn hình không đổi, HUD EXP 17,2% → 22,5%, nhiệm vụ "Tiêu diệt Gà Điên" hoàn thành [Đo] |
| Theo dõi được bàn cờ không? | **Có, chính xác từng ô.** Server gửi bàn đầu và danh sách viên rơi xuống của mỗi nước. Client tự mô phỏng rơi theo luật bên dưới. | 52/52 bước replay khớp [Đo] |
| Dùng thuật toán để đánh được không? | **Được.** Bot tìm nước tốt nhất trong ≤8 ms, gửi `c2s/19`, server chấp nhận. Thắng Gà Điên sau 5 nước. | run4 [Đo] |
| Đánh quái là online hay offline? | **Online, server quyết định.** Xem phần dưới. | |
| Có những kiểu trận nào? | **Theo lượt** (`s2c/18` byte 4 = 0: quái đi trước, mỗi lượt có `s2c/24`) và **tính giờ** (= 1, Sơn Tặc: người chơi đi liên tục, quái đánh mỗi ~30 s qua `s2c/21`). | [05-battle](05-battle.md#trận-tính-giờ) [Đo Q6–Q12] |
| Người chơi dùng kỹ năng được không? | **Được**: `c2s/20 (uuid, seq, skillId)`, Hỏa Cầu Thuật gây 62. | [05-battle](05-battle.md#c2s-20) [Đo Q9] |
| Cách nhanh nhất? | Trận tính giờ, 0,5 s/nước, dùng kỹ năng: ~500 EXP/phút. | [10-quests](10-quests.md#đánh-nhanh-hay-ăn-sao) [Đo] |

## Online hay offline

Trận đánh quái **chạy trên server**. Client chỉ hiển thị và gửi lựa chọn của người chơi.

| Việc | Ai làm | Căn cứ |
|---|---|---|
| Sinh bàn 8×8 ban đầu | Server (s2c/22) | Bàn mỗi trận khác nhau, client không gửi bàn [Đo] |
| Sinh viên mới rơi xuống | Server (danh sách `refill` trong s2c/19/20) | Client không có cách tự chọn viên [Đo] |
| Mô phỏng rơi, chuỗi ăn | Cả hai. Server tính, client tính lại để vẽ | Kết quả của server khớp mô hình rơi 52/52 bước [Đo]. Client có `checkSumToSyncDataWithServer()` [Suy luận] |
| Kiểm tra nước đi của người chơi | Server | Nước sai (run2, sai `seq` và sai ô) không được trả lời. Lượt hết sau đúng 34 s rồi chuyển cho quái [Đo] |
| AI của quái | Server | Nước của quái chỉ tới khi client gửi c2s/14 [Đo] |
| Sát thương, máu, nội lực, `s2` | Server (danh sách `units` trong s2c/19/20) | Client không gửi số liệu nào [Đo] |
| Đồng hồ lượt | Server | Hết 30 s (+~4 s) thì server tự gửi s2c/24 `playerTurn=0` [Đo] |
| Thắng/thua, phần thưởng, nhiệm vụ | Server (s2c/19 `end=1`, s2c/10, s2c/34) | run4 [Đo] |
| Di chuyển trên bản đồ | Client, báo vị trí bằng c2s/1169 | [06-map-mobs](06-map-mobs.md) [Đo] |
| Vị trí quái, va chạm với quái | **Chỉ client** | Server không gửi toạ độ quái, và nhận c2s/15 từ xa [Đo] |

Kết luận cho việc viết bot:
- Phần bản đồ (vị trí quái, va chạm) là việc của client và **không được server kiểm**. Bot không cần đi tới quái.
- Phần trận đấu là **online thật**. Mọi nước đi phải hợp lệ trên bàn của server, nên bot phải theo dõi bàn đúng như server.
- Cùng một `mobId` (`mob10`) được thách đấu 3 lần liên tiếp và đều được nhận: 2 lần sau khi đầu hàng, 1 lần thắng. [Đo] Quái có bị "chết" phía server sau khi thắng không thì chưa thử. [Chưa rõ]

## Luồng một trận không giao diện

Trong mọi lần thử, client không tự vào màn đánh khi trận do bot mở, nên bot phải tự gửi c2s/18 và c2s/14. [Đo] Thời gian lấy từ run4.

```text
Bot                                   Server
C→S 43  "M1"                      →
                                  ←   S→C 43  33 quái                          (+39 ms)
C→S 15  "mob10", 0                →
                                  ←   S→C 22  2 bên, uuid, bàn 64 ô, 30 s      (+2,35 s)
C→S 18  uuid                      →
                                  ←   S→C 18  000000000000                     (+0,49 s)
C→S 14  uuid, seq=0               →                                            xin nước đầu (bên nào đi trước do server)
                                  ←   S→C 19  seq=1, nước của quái             (+30 ms)
                                  ←   S→C 24  seq=1, playerTurn=1              (+0,2 s)
C→S 19  uuid, 1, r1+2,c1+2,r2+2,c2+2 →                                         bot chọn nước trong ~50 ms
                                  ←   S→C 19  seq=2, nước của mình             (+40 ms)
                                  ←   S→C 24  seq=2, playerTurn=0|1            (+~1 s)
  playerTurn=0 → C→S 14 (uuid, 2) → S→C 19 nước của quái → S→C 24 …
  playerTurn=1 (thêm lượt) → bot đi tiếp
… S→C 19 end=1 → S→C 1200, 34, 10, 1214                                        hết trận
```

- Từ lúc gửi c2s/15 tới lúc thắng: **21,5 s** cho 5 nước của bot và 5 nước của quái. [Đo]
- Bên nào có lượt là do s2c/24 quyết định. Lượt đầu của cả 5 trận đã thấy (B1 hai trận, run2–run4) đều là của quái: c2s/14 `seq=0` trả về nước của quái. [Đo]
- Muốn huỷ trận thì gửi c2s/40 (uuid). Server trả s2c/36, s2c/1214. [Đo]
- Phiên để không lâu (run1) có thể chết ngầm: TCP vẫn ESTABLISHED nhưng server không trả gì, cả heartbeat. Bot cần theo dõi heartbeat (s2c/1) và đăng nhập lại khi mất. [Đo]

## Luật bàn cờ

Bàn 8×8 lưu theo hàng (`index = hàng × 8 + cột`), hàng 0 ở trên. Toạ độ trên dây là (hàng + 2, cột + 2). [Đo]

1. **Đổi chỗ** hai ô kề nhau (ngang hoặc dọc). Nước chỉ hợp lệ khi tạo ra ít nhất một hàng ≥3. [Đo, 52/52 nước]
2. **Ăn**: mọi đoạn ngang/dọc ≥3 viên **cùng loại** đều bị xoá trong cùng một đợt, kể cả nén vàng (`0x46`). [Đo]
3. **Rơi**: trong mỗi cột, viên còn lại rơi xuống đáy. [Đo]
4. **Lấp**: các ô trống được lấp bằng danh sách `refill` của server, **từng cột từ trái sang phải; trong một cột, từ ô trống dưới cùng lên trên**. Thứ tự này là cách duy nhất trong 5 cách thử khớp mọi bước. [Đo]
5. **Chuỗi**: sau khi lấp, nếu có đoạn ≥3 mới thì lặp lại bước 2–4. Một danh sách `refill` dùng cho cả chuỗi. Đã thấy tới 5 đợt. [Đo]
6. **Thêm lượt**: có đoạn ≥4 ở **bất kỳ đợt nào** của nước đó. Server đánh dấu bằng `flags[1]=1`. Bước 7 của run3 là bằng chứng: đoạn 4 âm dương chỉ xuất hiện ở đợt 4 của chuỗi, và quái được đi tiếp. [Đo] Cẩm nang trong game nói thêm: hai hàng 3 viên cùng loại cắt nhau (L/T) cũng được thêm lượt. Chưa gặp trong capture; mô hình đã tính. [Cẩm nang]
7. **Viên đặc biệt**: mã `10..69` là loại `mã % 10` (mã `10` là kiếm) và ăn chung với viên thường cùng loại. Khi bị ăn, nó **phá thêm ô vuông 3×3 quanh nó**. Viên đặc biệt đến qua `refill` (run3 bước 7, run4 bước 2). [Đo với mã `10`: run3 và run4 chỉ khớp khi có luật 3×3. Các luật "phá cả hàng", "phá cả cột", "phá chữ thập", "viên hoàn hảo" đều lệch]
   - Mã 11–15: [Suy luận] theo quy luật `mã % 10`, chưa thấy.
   - Nổ dây chuyền giữa hai Kiếm lửa: có, theo Cẩm nang ("Kiếm lửa khác nằm trong vùng nổ cũng nổ theo"). Mô hình cho nổ lan.
   - Kiếm lửa bị **kỹ năng của quái** phá cũng nổ 3×3 (Q5 seq 41, xem [s2c/20](05-battle.md#s2c-20)). Mô hình cũ chỉ cho nổ khi viên được ăn trong hàng nên lệch bàn ở nước đó. [Đo]
   - Cách sinh ra: "đôi khi kiếm mới thêm vào bàn là Kiếm lửa; vài kỹ năng cũng tạo ra Kiếm lửa" (Cẩm nang).
8. **Hết nước đi**: server **xếp lại cả bàn** và gửi bàn mới 64 ô ngay trong `s2c/19` của nước vừa đi (`u8 1; i32 64; u8[64]` sau danh sách refill). Thấy 3 lần ở bot Node, xem [10-quests](10-quests.md#hai-điều-q1-phát-hiện). [Đo]

Ví dụ lấp (run4, seq 2). Nước của bot: đổi `r6c0 ↔ r6c1`, refill `[3, 70, 4, 0, 10, 4]`:

```text
Đợt 1: cột 1 có 3 kiếm (r5–r7) → xoá, viên phía trên rơi xuống.
       3 ô trống ở đỉnh cột 1 lấp từ dưới lên: r2c1 = 3, r1c1 = 70, r0c1 = 4
Đợt 2: hàng 6 có 3 giọt (c0–c2) → xoá. Cột 0, 1, 2 mỗi cột trống 1 ô ở đỉnh
       lấp từ trái sang phải: r0c0 = 0, r0c1 = 10 (kiếm đặc biệt), r0c2 = 4
Dùng hết 6/6 viên, bàn đầy, không còn đoạn ≥3 → hết nước.
```

Ở seq 10, bot ăn 3 kiếm có kèm viên `10` đó. Vụ nổ 3×3 kéo thêm 1 kiếm, 5 tim và các viên khác, gây 29 sát thương và kết thúc trận.

## Tác dụng của các viên

Số liệu đo trong `units` của s2c/19. `-1` nghĩa là không đổi.

| Mã | Viên | Tác dụng | Số đo |
|---:|---|---|---|
| `0` | Kiếm | Gây sát thương cho đối thủ (`damage` của bên ăn, `hp` của bên bị đánh) | manina cấp 3: 31 cho 3 kiếm; cấp 8–11: **30 cho 3 kiếm, 41 cho 4 kiếm**, có lần 0 (né). Gà Điên 0/4/8, Heo Mọi 9, Kẻ Gây Rối 17 (3 kiếm) và 22 (4 kiếm), Chỉ Huy Sơn Tặc 14 [Đo] |
| `1` | Tim | Hồi máu cho bên ăn | manina ăn 4 tim: 73 → 80; Kẻ Gây Rối ăn 3 tim: +11 [Đo] |
| `2` | Âm dương | Tăng `s1` = nội lực để dùng kỹ năng | +6 cho mỗi 3 viên (manina, Gà Điên), +8 (Chỉ Huy), +6 (Kẻ Gây Rối). Kẻ Gây Rối dùng Hỏa Cầu Thuật khi `s1 = 34`, còn 22 [Đo] |
| `3` | **Trái đào** | Tăng `s2` = sức mạnh (thanh "power" của HUD); `s2` chặn ở 100, và **đòn kiếm kế tiếp gây gấp đôi** rồi `s2` về 0 | manina +15–16 cho mỗi 3 viên. Q6: 3 kiếm gây 60 thay vì 30, 4 kiếm gây 82 thay vì 41, ba lần, lần nào `s2` cũng 100 → 0 [Đo] |
| `4` | **Giọt nước** | Kinh nghiệm cuối trận, bằng 1/2 ngôi sao | +2 EXP mỗi viên mình ăn (công thức dưới) [Đo 7 trận] |
| `5` | Ngôi sao | Kinh nghiệm cuối trận | +4 EXP mỗi viên mình ăn [Đo 7 trận] |
| `0x46` | Thỏi vàng | Xu khoá cuối trận | +2 Xu khoá mỗi viên mình ăn [Đo 7 trận, lệch ≤ 2] |
| `10` | Kiếm lửa | Mạnh hơn kiếm thường, cộng nổ 3×3, kể cả khi bị kỹ năng phá | [Đo nổ; Cẩm nang] |

Trước Q6 tài liệu gọi mã 3 là "Giọt nước" và mã 4 là "Trái đào". Số đo Q5/Q6 cho thấy mã 3 làm đúng việc Cẩm nang mô tả cho Trái đào (hồi sức mạnh, nhân đôi đòn), còn mã 4 và 5 quyết định EXP như Cẩm nang mô tả cho Giọt nước và Ngôi sao, nên tên hai mã được đổi lại. Mã số trên dây không đổi. [Suy luận từ số đo]

**Phần thưởng một trận thắng** (7 trận Kẻ Gây Rối, manina cấp 9–11, Q6), chỉ tính viên **mình** ăn, kể cả viên rơi theo chuỗi và viên bị nổ:

```text
EXP = 2 × (2 × sao + giọt nước) + 26…30
Xu  = 2 × thỏi vàng   (±2)
```

| Sao | Giọt nước | Vàng | EXP tính | EXP thật | Xu tính | Xu thật |
|---:|---:|---:|---:|---:|---:|---:|
| 8 | 20 | 12 | 72 + 28 | 100 | 24 | 24 |
| 21 | 16 | 46 | 116 + 28 | 144 | 92 | 92 |
| 9 | 15 | 25 | 66 + 26 | 92 | 50 | 52 |
| 21 | 21 | 16 | 126 + 26 | 152 | 32 | 32 |
| 23 | 35 | 31 | 162 + 30 | 192 | 62 | 64 |
| 18 | 13 | 21 | 98 + 26 | 124 | 42 | 44 |
| 23 | 19 | 16 | 130 + 26 | 156 | 32 | 34 |

Phần cộng 26–30 có thể phụ thuộc cấp quái và cấp mình [Chưa rõ]. Thua thì EXP và tiền đều 0 (B1). Hệ quả: trận dài hơn, ăn nhiều sao hơn thì được nhiều EXP hơn, nên "thắng nhanh" và "nhiều EXP mỗi phút" là hai mục tiêu khác nhau (so sánh ở [10-quests](10-quests.md#đánh-nhanh-hay-ăn-sao)).

Ăn ≥4 viên bất kỳ loại nào, hoặc hai hàng 3 cùng loại cắt nhau, được thêm lượt.

## Thuật toán của bot

Xem `bestMove` trong [src/battle.ts](../../../src/battle.ts).

1. Liệt kê mọi nước đổi chỗ hợp lệ (tối đa 112 cặp kề nhau).
2. Với mỗi nước, mô phỏng chuỗi ăn trên **các viên đã biết**. Viên sắp rơi xuống chưa biết nên coi là ô "không rõ", không ăn được. Như vậy điểm tính ra là cận dưới.
3. Chấm điểm theo số viên ăn được: kiếm 10, tim 2 (6 khi máu dưới 50%), âm dương 2, giọt 2, đào/sao/vàng 1, thêm lượt +30.
4. Nếu nước đó không cho thêm lượt, trừ đi `0,7 ×` điểm của nước tốt nhất mà đối thủ có thể đi ngay sau (nhìn trước 2 nước).
5. Chọn nước điểm cao nhất.

Đo được:
- Chậm nhất 8 ms mỗi lần chọn.
- Chạy lại trên các thế cờ của B1, thuật toán chọn trùng nước với AI phía server 13/27 lần.
- run4 thắng sau 5 nước của bot, máu còn 130/130.

Hướng cải thiện:
- Đặt trọng số theo chỉ số nhân vật.
- Tính giá trị của viên đặc biệt.
- Dùng kỹ năng khi `s1` đủ. Chưa bắt được gói người chơi dùng kỹ năng. [Chưa rõ]

## Cách bot gửi gói

Có hai cách. Cả hai dùng cùng bố cục payload.

### A. Bên trong game (Frida), cách đã chạy

Bot gọi thẳng hàm dựng gói native của `com.mh.sqlq` trong `libgdx-flashds.so`. Hàm tự lấy uuid trận từ trạng thái client, ghi gói và mã hoá XOR như bình thường. [Đo]

| Hàm | Chữ ký native (sau `JNIEnv*`, `sqlq this`) | Gói | Ghi chú |
|---|---|---|---|
| `a67` | `(jstring mobId, jboolean)` | c2s/15 | Truyền `false` như client |
| `y104` | `()` | c2s/18 | uuid lấy từ s2c/22 client đã nhận |
| `h73` | `(jint seq)` | c2s/14 | |
| **`a74`** | **`(jint r1+2, jint c1+2, jint r2+2, jint c2+2, jint seq)`** | c2s/19 | Trên dây `seq` đứng trước. Truyền `seq` ở đầu là sai: run2 gọi `a74(1,3,7,4,7)` ra `seq=7, (1,3)→(7,4)` và server bỏ qua [Đo] |
| `s77` | `()` | c2s/40 | Đầu hàng |
| `e66` | `(jstring mapId)` | c2s/43 | |
| `b119` | `(jbyte zone)` | c2s/1173 | Đổi khu |
| `a63` | `(jstring mapId, jint)` | c2s/11 | |

- Lấy object `sqlq`: hook bất kỳ hàm `sqlq` nào. Hàm `a115` (c2s/1169) được gọi đều đặn kể cả khi đứng yên, nên bắt được ngay. Giữ object bằng `NewGlobalRef`.
- Gọi trên **luồng GL**: hook `eglSwapBuffers` trong `libEGL.so` (13–38 lần/giây), lấy `JNIEnv` bằng `JNI_GetCreatedJavaVMs` → `GetEnv`, rồi gọi hàm dựng gói giữa `PushLocalFrame`/`PopLocalFrame`.
- Đọc gói: hook writer `sqje.a2` và lúc trả về của reader `sqnw.e6` như [05-battle § Thu lại](05-battle.md#thu-lại).
- Phần não (TypeScript, dùng `src/protocol.ts` `Reader` và `src/battle.ts`) nhận gói qua relay Python `frida` (bộ binding đi kèm Frida 17.10 trên máy Mac), rồi trả lệnh dạng `{fn: 'a74', args: [...]}`.

### B. Client Node.js không giao diện, đã chạy

[src/battle-runner.ts](../../../src/battle-runner.ts) gửi các gói dưới (dựng bằng `buildRequest` của [src/events.ts](../../../src/events.ts)) sau khi `runClient` vào thế giới; [src/quest.ts](../../../src/quest.ts) chọn quái và thách đấu. Cần `CLLT_USERNAME`/`CLLT_PASSWORD`, và tài khoản không được online ở máy khác (server từ chối bằng `s2c/0`). Bot đã thắng 10/10 trận Heo Mọi, xem [10-quests](10-quests.md#kết-quả-q2); cách chạy ở [bot làm nhiệm vụ](../../integration/nodejs/quest-bot.md).

| Gói | Payload |
|---|---|
| c2s/43 | `string mapId` |
| c2s/15 | `string mobId; u8 0` |
| c2s/18 | `string battleUuid` |
| c2s/14 | `string battleUuid; i32 seq` |
| c2s/19 | `string battleUuid; i32 seq; i32 r1+2; i32 c1+2; i32 r2+2; i32 c2+2` |
| c2s/40 | `string battleUuid` |

`seq` luôn là `seq` của s2c/19 hoặc s2c/24 gần nhất. uuid lấy ở đuôi s2c/22.

## Dữ liệu mẫu: run4, manina thắng Gà Điên

### Dòng thời gian gói tin

Payload trước XOR, chưa có header. Thời gian tính từ lúc gửi c2s/15. Gói dài cắt bằng `…`. `<uuid>` là chuỗi uuid trận kèm độ dài (`00000024` + 36 byte ASCII).

```text
     0ms C→S   15 len   10  000000056d6f62313000                                   "mob10", 0
  2351ms S→C   22 len  641  (xem bên dưới)
  5929ms C→S   18 len   40  00000024 63343531656361632d656139392d343262382d613232612d633563373265383938363539
  6416ms S→C   18 len    6  000000000000
  9104ms C→S   14 len   44  00000024 <uuid> 00000000                                seq 0
  9134ms S→C   19 len   84  00000001 00000000 3c2da447 00000007 00000004 00000007 00000005 00000001
                            00000003 050303 00000000 01 "mob10" ffffffff 00 ffffffff 00000006 ffffffff
                            00000000 "mob10" 00                                     quái: r5c2→r5c3, âm dương ×3, s1=6
  9151ms S→C 1212 len   13  000001cc020101000024550100                              [Chưa rõ]
  9334ms S→C   24 len   10  00000001 00000000 01 00                                 seq 1, tới lượt bot
  9385ms C→S   19 len   60  00000024 <uuid> 00000001 00000008 00000002 00000008 00000003   seq 1, r6c0→r6c1
  9424ms S→C   19 len  115  00000002 00000000 87534192 00000008 00000002 00000008 00000003 00000001
                            00000006 03 46 04 00 0a 04 00000000 02
                            "manina" 0000001f 00 ffffffff ffffffff 0000000f           manina: damage 31, s2=15
                            "mob10"  ffffffff 00 00000013 ffffffff ffffffff           Gà Điên: hp 19
                            00 00 00 01 "manina" 00
 10410ms S→C   24 len   10  00000002000000000000                                    lượt quái
 12022ms C→S   14 len   44  <uuid> 00000002
 12054ms S→C   19 len   90  00000003 … "mob10" 00                                   quái ăn giọt, sao, vàng
 12334ms S→C   24 len   10  00000003000000000100
 12414ms C→S   19 len   60  <uuid> 00000003 00000002 00000005 00000002 00000006       r0c3→r0c4
 12445ms S→C   19 len   86  00000004 …                                              manina: s1=6
 13387ms S→C   24 len   10  00000004000000000000
 15121ms C→S   14 len   44  <uuid> 00000004
 15152ms S→C   19 len   58  00000005 …                                              quái ăn đào
 15334ms S→C   24 len   10  00000005000000000100
 15427ms C→S   19 len   60  <uuid> 00000005 00000004 00000009 00000005 00000009       r2c7→r3c7
 15458ms S→C   19 len   86  00000006 …                                              manina: s1=12
 16350ms S→C   24 len   10  00000006000000000000
 18276ms C→S   14 len   44  <uuid> 00000006
 18308ms S→C   19 len   58  00000007 …                                              quái ăn đào
 18337ms S→C   24 len   10  00000007000000000100
 18380ms C→S   19 len   60  <uuid> 00000007 00000006 00000008 00000007 00000008       r4c6→r5c6
 18413ms S→C   19 len   86  00000008 …                                              manina: s2=30
 19422ms S→C   24 len   10  00000008000000000000
 21103ms C→S   14 len   44  <uuid> 00000008
 21136ms S→C   19 len   58  00000009 …                                              quái ăn vàng
 21334ms S→C   24 len   10  00000009000000000100
 21377ms C→S   19 len   60  <uuid> 00000009 00000003 00000004 00000004 00000004       r1c2→r2c2
 21456ms S→C   19 len 2135  (end=1, xem bên dưới)
 21462ms S→C 1200 len    0
 21463ms S→C   34 len   77  00000000 00000009 "subtask 1" 00000003 00000034 "Tiếp theo hãy tới gặp Hương Lão Trần Bá"
 21464ms S→C   10 len   62  00000004 "manina" 00000082 00000082 000000b8 00000096 0000012c 00000004
                            00002710 00000016 00000009 0000001e 00000014 00000006
 21465ms S→C 1214 len    0
```

### Từng nước

| seq | Bên đi | Nước (hàng/cột bàn) | Ăn (đã mô phỏng) | Đợt | Kết quả server |
|---:|---|---|---|---:|---|
| 1 | Gà Điên | r5c2 → r5c3 | âm dương 3 | 1 | Gà Điên s1 = 6 |
| 2 | **bot** | r6c0 → r6c1 | kiếm 3, giọt 3 | 2 | **sát thương 31**, Gà Điên còn 19/50. manina s2 = 15 |
| 3 | Gà Điên | r5c3 → r5c4 | giọt 3, sao 3, vàng 3 | 3 | Gà Điên s2 = 13 |
| 4 | **bot** | r0c3 → r0c4 | âm dương 3 | 1 | manina s1 = 6 |
| 5 | Gà Điên | r0c2 → r1c2 | đào 3 | 1 | không đổi |
| 6 | **bot** | r2c7 → r3c7 | âm dương 3 | 1 | manina s1 = 12 |
| 7 | Gà Điên | r5c2 → r6c2 | đào 3 | 1 | không đổi |
| 8 | **bot** | r4c6 → r5c6 | giọt 3 | 1 | manina s2 = 30 |
| 9 | Gà Điên | r1c1 → r2c1 | vàng 3 | 1 | không đổi |
| 10 | **bot** | r1c2 → r2c2 | kiếm 4, tim 5, giọt 3, đào 2, sao 1, vàng 2 (có nổ 3×3) | 2 | **sát thương 29**, Gà Điên hp 0, `end=1` |

Từ seq 3 tới seq 8 bàn không còn kiếm nào ăn được. Bot chọn những nước ít mở đường cho quái nhất, nên các nước đó có điểm thấp (1,8 và −0,3).

### s2c/22 (641 byte)

```text
   0  0000 00000006 "manina" 00000006 "manina"                 2 byte đầu; tên; tên hiển thị
  22  00 00 01 00000003 00000000 00 00000082 00000082           3 byte; cấp 3; i32 0; u8 0; HP 130/130
  42  00000000 00000064 00000000 00000064                       0, 100, 0, 100  [Chưa rõ]
  58  00000004 "1097" 00000003 "125" 00000009 000003e8          [Chưa rõ]
  81  ffffffff × 8, 00016120, …, uuid người chơi "d3d51a41-…", bảng màu ARGB (ff525252 ffbfbfbf …)   [Chưa rõ]
 369  00000005 "mob10" 0000000a "Gà Điên"                       khối quái
 392  01 00 04 00000001 000186a0 00 00000032 00000032           3 byte; cấp 1; i32 100000; u8 0; HP 50/50
 412  00000000 00000064 00000000 00000064                       0, 100, 0, 100
 428  00000009 "Chưa có" 00000009 "Chưa có"
 454  00000009 00000fa0 … 00000fa8                              9 kỹ năng 4000…4008  [Suy luận]
 494  24 byte 0, ffffffff, 9 byte 0                            [Chưa rõ]
 531  00000024 "c451ecac-ea99-42b8-a22a-c5c72e898659"           uuid trận
 571  00000040 + 64 byte bàn (575–638)                          xem dưới
 639  1e 00                                                     30 giây/lượt
```

Bàn ban đầu (`G` = nén vàng `0x46`):

```text
   c0 c1 c2 c3 c4 c5 c6 c7
r0  4  1  1  0  G  2  1  3
r1  1  4  1  1  5  5  G  3
r2  G  3  0  3  G  5  G  2
r3  5  3  G  2  5  3  1  G
r4  2  2  4  2  0  4  3  2
r5  G  0  2  1  G  3  3  2
r6  0  3  3  4  4  2  0  1
r7  4  0  5  G  1  1  0  1
```

### s2c/19 kết thúc trận (thắng, 2135 byte)

```text
0000000a 00000000 83e558be                         seq 10; 0; seed
00000003 00000004 00000004 00000004                r1c2 → r2c2 (wire +2)
00000001                                            unk
00000011 03 04 01 04 46 04 04 05 04 46 46 04 04 46 04 02 04     17 viên mới
00000000 02
  "manina" 0000001d 00 ffffffff ffffffff 0000002d   damage 29, s2 = 45
  "mob10"  ffffffff 00 00000000 ffffffff ffffffff   hp = 0
00 00 00 01 "manina" 01                             flags; actor; end = 1
01 00000008 00000004 00 00 00 00 00 00 00           thắng = 1; EXP +8; tiền +4; 7 byte [Chưa rõ]
f9 (00000096 0000012c) (0000012c 000001f4) … ×249   bảng mốc EXP theo cấp
```

Khi thua (B1), 16 byte sau `end` đều là 0. Đối chiếu s2c/10 trước và sau trận:

| Trường s2c/10 (thứ tự) | Trước (B1) | Sau run4 | Ý nghĩa |
|---|---:|---:|---|
| HP, HP tối đa | 130, 130 | 130, 130 | Máu trên bản đồ được hồi đầy sau trận [Đo: HUD 30/130 → 130/130] |
| thứ 3 | 176 | **184** | EXP (+8, khớp phần thưởng). HUD `(EXP − 150) / 151` = 17,2% → 22,5% [Đo] |
| thứ 4, 5 | 150, 300 | 150, 300 | Mốc EXP của cấp 3, trùng cặp đầu bảng mốc [Đo] |
| thứ 6 | 0 | **4** | Tiền (+4, khớp phần thưởng) [Suy luận về loại tiền] |
| còn lại | 10000, 22, 9, 30, 20, 6 | giống | [Chưa rõ] |

## Các gói mới thấy trong bot

| Gói | Payload | Ý nghĩa |
|---|---|---|
| s2c/34 | `i32 0; string "subtask 1"; i32 3; string thông báo` | Tiến độ nhiệm vụ. Client hiện hộp thoại "Tiếp theo hãy tới gặp Hương Lão Trần Bá" [Đo] |
| s2c/1212 | 13 byte `000001cc 02 01 01 00002455 01 00` | Đến ngay sau nước đầu của trận [Chưa rõ] |
| s2c/1200 | rỗng | Ngay sau s2c/19 `end=1` [Chưa rõ] |
| s2c/36 | `00000008 00000000 2f ffffffffffffff` | Sau c2s/40 (đầu hàng). Độ bền trang bị: B1 là `31`, trận huỷ cũng làm mòn 2 [Suy luận] |

## Chưa biết

- Giá nội lực chính xác của Hỏa Cầu Thuật và các kỹ năng khác của nhân vật.
- Mã viên đặc biệt khác `10`.
- Công thức sát thương.
- Quái có biến mất hoặc hồi sinh phía server sau khi bị giết không.
- Có giới hạn tần suất thách đấu không.
