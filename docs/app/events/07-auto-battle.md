# Đánh quái tự động: online hay offline, luật bàn cờ, thuật toán

Mốc: APK 1.0.3, server Thanh Khê (`play.colauloanthe.vn:1688`). Ngày đo: 30/10/2026, máy M2101K7BG (Android 13, root), nhân vật `manina` cấp 3, bản đồ M1 (Làng Thanh Khê) khu 0.

Bot đã đánh thật với server:
- **run2**: sai thứ tự tham số `a74`, nước gửi lên bị server bỏ qua.
- **run3**: phát hiện viên đặc biệt, mô hình cũ lệch bàn.
- **run4**: thắng Gà Điên sau 5 nước, mô hình không lệch lần nào.

Mọi luật bàn cờ trong file này đã kiểm bằng cách replay 52 bước của ba trận thật (B1 của [05-battle](05-battle.md), run3, run4), xem test [test/battle.test.ts](../../../test/battle.test.ts) và mô hình [src/battle/battle.ts](../../../src/battle/battle.ts). Nhãn **[Đo]**, **[Suy luận]**, **[Chưa rõ]** dùng như các file khác.

## Trả lời nhanh

| Câu hỏi | Trả lời | Căn cứ |
|---|---|---|
| Vừa vào một khu có quét được hết quái không? | **Có.** Gửi `c2s/43` (mapId), server trả `s2c/43` với id, tên, cấp của cả 33 con trong khu. | run2/3/4, mỗi lần 33 con [Đo] |
| Có phải di chuyển tới quái mới đánh được không? | **Không**, với quái thường. Gửi thẳng `c2s/15` (mobId) khi nhân vật đứng xa, server vẫn mở trận. Boss của map thì bỏ qua `c2s/15`; phải dùng `c2s/1178` ([10-quests](10-quests.md#boss)). | `mob10` ở xa, s2c/22 về sau 2,4 s, 3 lần; Q3–Q12 hơn 40 trận [Đo] |
| Có cần giao diện game vào màn đánh không? | **Không.** Client đứng yên ở bản đồ, cả trận diễn ra chỉ bằng gói tin. Server vẫn cộng EXP, tiền và tiến độ nhiệm vụ. | run4: màn hình không đổi, HUD EXP 17,2% → 22,5%, nhiệm vụ "Tiêu diệt Gà Điên" hoàn thành [Đo] |
| Theo dõi được bàn cờ không? | **Có, chính xác từng ô.** Server gửi bàn đầu và danh sách viên rơi xuống của mỗi nước. Client tự mô phỏng rơi theo luật bên dưới. | 52/52 bước replay khớp [Đo] |
| Dùng thuật toán để đánh được không? | **Được.** Bot tìm nước tốt nhất trong ≤8 ms, gửi `c2s/19`, server chấp nhận. Thắng Gà Điên sau 5 nước. | run4 [Đo] |
| Đánh quái là online hay offline? | **Online, server quyết định.** Xem phần dưới. | |
| Có những kiểu trận nào? | **Theo lượt** (`s2c/18` byte 4 = 0: quái đi trước, mỗi lượt có `s2c/24`) và **tính giờ** (= 1, Sơn Tặc: người chơi đi liên tục, quái đánh mỗi ~30 s qua `s2c/21`). | [05-battle](05-battle.md#trận-tính-giờ) [Đo Q6–Q12] |
| Người chơi dùng kỹ năng được không? | **Được**: `c2s/20 (uuid, seq, skillId)`, Hỏa Cầu Thuật gây 62. | [05-battle](05-battle.md#c2s-20) [Đo Q9] |
| Cách nhanh nhất? | Trận tính giờ, 0,5 s/nước, dùng kỹ năng: ~500 EXP/phút. | [10-quests](10-quests.md#đánh-nhanh-hay-ăn-sao) [Đo] |
| Sát thương tính thế nào? | Nước thường: `W × số kiếm ăn được`, gấp đôi khi thanh sức mạnh đầy. Kỹ năng: `W × (3 + số kiếm nó phá) + K`. `W` là một phần ba của `Tấn công × (1 + 0,0175 × chênh cấp) × 200 / (200 + P.Thủ bên bị đánh)`. | [Công thức sát thương](#công-thức-sát-thương), [W theo chỉ số](#công-thức-theo-chỉ-số) [Đo, 176 nhóm đòn của 1033 trận] |
| Quái chọn nước thế nào? | Không chọn nước tốt nhất. Nó bốc thăm, nghiêng về nước ăn tim, kiếm, âm dương, nước được thêm lượt và nước nó gặp đầu tiên khi quét bàn. Có đủ nội lực thì một nửa số lượt nó dùng kỹ năng. | [Cách quái chọn nước](#cách-quái-chọn-nước) [Đo, 1011 nước] |
| Bot đánh bằng thuật toán nào? | `--goal=win` (thắng nhiều nhất) hoặc `--goal=farm` (nhiều EXP nhất), thuật toán v2. Trên mô phỏng đã khớp trận thật, v2 thắng thêm 10% số trận mỗi giờ và `farm` thêm 33% EXP mỗi giờ so với cách cũ. | [Thuật toán v2](#thuật-toán-v2) [Mô phỏng] |
| Bot có tự dùng kỹ năng, hồi máu, bình không? | **Có** (v3). Mỗi lượt bot so nước đổi chỗ, từng kỹ năng đã học đủ nội lực, và bình nếu được phép, tính hết ra HP. Hiệu ứng đọc từ mô tả kỹ năng trong `s2c/30` (cả 540 mô tả). Nội lực tiêu đi bị trừ đúng giá trị của nó, nên kỹ năng chỉ được dùng khi lượt này có lợi hơn để dành. Trên mô phỏng v3 thắng thêm 1,1–1,4 trận mỗi giờ so với v2. Chạy thật thắng 13/13 trận. | [Chọn hành động](#chọn-hành-động) [Mô phỏng; Đo A2] |
| App có tự uống bình máu, bình mana không? | **Có, khi bật** Dùng bình máu hay Dùng bình mana ở Cài đặt đánh (mặc định tắt). Mặc định mỗi trận tối đa 1 bình máu và 2 bình mana, luôn giữ lại 30 bình mỗi loại trong túi, không tự mua. Bình máu chỉ uống khi sắp chết (khoảng 15–20% máu). Bình mana uống khi kỹ năng cần nội lực, gần như trận nào cũng đủ 2 bình: thắng thêm 40–70% số trận mỗi giờ. | [Bình máu và mana](#bình-máu-và-mana) [Mô phỏng] |
| Nên cộng điểm tiềm năng vào đâu? | Tuỳ hệ. Theo mô phỏng với công thức F2 (01/11): manina (Hỏa) nên cộng Nội Lực, vì nội lực đang nạp quá chậm; Ttuananh (Thủy) chia đôi Nội Lực và Thể Lực; wangpt (Lôi) giữ Thân Pháp. | [Cộng điểm theo chỉ số](#cộng-điểm-f2) [Mô phỏng] |
| Nên cộng điểm kỹ năng nào? | Kỹ năng gốc (Băng Tiễn, Hỏa Cầu) trước: nó cho nhiều sát thương nhất trên mỗi điểm nội lực. Tiheo2 nâng Băng Tiễn lên cấp 4 thì thắng thêm khoảng 13% trận mỗi giờ với quái khó. Hồi 11–12% máu gần như không được dùng. | [Kỹ năng và điểm kỹ năng](#chọn-hành-động) [Mô phỏng] |

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
| Đồng hồ lượt | Server | Hết 30 s (+~4 s) thì server tự gửi s2c/24 `playerTurn=0` [Đo]. Vì vậy Chờ trước mỗi lượt đi của app tối đa 10 s, gấp đôi khi ngẫu nhiên là 20 s ([Thời gian chờ](../../integration/rust/features.md#thời-gian-chờ)) |
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

<a id="công-thức-sát-thương"></a>

## Công thức sát thương

Rút ra bằng cách phát lại 3041 nước của mọi trace bot (Q3–Q20 và trận Sơn Tặc mA của manina ngày 31/10), bàn khớp server ở mọi nước. Script ở scratchpad `formula/replay.ts` và `formula/fit.js`.

```text
Nước thường:  W × (số kiếm ăn được, mọi đợt của chuỗi) × 2 nếu sức mạnh = 100 trước nước đó
Kỹ năng:      W × (3 + S) × 2 nếu sức mạnh = 100  +  K
              S = số kiếm trong các ô kỹ năng phá (cả vùng nổ của Kiếm lửa) và trong chuỗi rơi sau đó
              K = số "gây … sát thương" trong mô tả kỹ năng (Hỏa Cầu Thuật cấp 1: 11), không nhân đôi
```

- `W` là sát thương một viên kiếm, riêng cho từng cặp bên đánh – bên bị đánh. Lấy giá trị thường gặp nhất của đòn 3 kiếm chia 3. [Đo]
  - manina đánh Sơn Tặc: đòn 3 kiếm = 26 + ⌊cấp/2⌋.
  - manina cấp 21, Tấn công 32: 36, tức `W = 12`. Hỏa Cầu Thuật gây 83 = 12 × 6 + 11.
- `W` của quái đánh manina: Cóc Xanh 12, Kẻ Gây Rối 5,67, Sói Xám 4,33, Chỉ Huy Sơn Tặc 4–4,33. [Đo]
- 128 lần dùng kỹ năng (Hỏa Cầu Thuật của manina, kỹ năng 2000 và 4000 của quái) xếp như sau. Sai số cho phép là 2. [Đo]
  - 105 lần khớp đúng công thức.
  - 17 lần thiếu đúng `K`, khoảng 1/7. 13 trong 17 lần này kỹ năng phá đúng 1 kiếm. Vì `W ≈ K ≈ 11`, chưa phân biệt được "mất K" với "viên kiếm đó không được tính".
  - 3 lần chí mạng ×1,5.
  - 3 lần lệch, chưa giải thích được.
- Nước thường: 8,7% số nước có kiếm gây 0 (né). Khoảng 4% số nước chí mạng ×1,5. [Đo]
- Dùng kỹ năng là hết lượt, như một nước đi. Lượt chỉ được giữ khi chuỗi rơi sau kỹ năng có đoạn ≥4: 3 trong 29 lần của manina. Cả manina lẫn 5 loại quái đều tốn đúng 25 nội lực mỗi lần. [Đo]
- Nội lực mỗi viên âm dương: manina 2,08 ở mọi cấp từ 8 tới 20 (1,92–2,22 theo từng lượt chạy). Cóc Xanh 3,51, Sói Xám 2,74. [Đo]
- Viên âm dương bị **kỹ năng phá** cho người dùng nhiều hơn viên ăn theo hàng. Nội lực manina mất khi dùng Hỏa Cầu Thuật, theo số âm dương trong các ô bị phá:

| Âm dương bị phá | Nội lực mất | Số lần |
|---:|---:|---:|
| 0 | 25 | 17 |
| 1 | 19 (được lại 6) | 28 |
| 2 | 14 (được lại 11) | 10 |
| 3 | 8 (được lại 17) | 2 |

  Một hàng 3 âm dương rơi theo chuỗi chỉ cho 6. Quái cũng vậy: Cóc Xanh được lại 8–10 cho 1 viên bị phá. Hệ quả: kỹ năng phá nhiều ô còn hồi nội lực, nên thuật toán phải tính phần này. [Đo]
- `W` theo chỉ số: đến 31/10, Tấn công của manina luôn là 32, nên chưa tách được phần do Tấn công. F2 (01/11) đã tách được nhờ 847 trận của app với ba nhân vật: xem [W theo chỉ số](#công-thức-theo-chỉ-số) ngay dưới. `K` đúng như mô tả ở mọi cấp kỹ năng đã dùng (tới cấp 8). [Đo]

<a id="công-thức-theo-chỉ-số"></a>

### W theo chỉ số (F2, 01/11)

Dữ liệu là 1033 trận đã ghi (`npm run battles`): 847 trận app chơi bằng v3 từ 19h ngày 31/10 tới 21h ngày 01/11, cộng các trace bot TS. Có ba nhân vật: Ttuananh (Thủy) cấp 18–34, manina (Hỏa) cấp 8–34, wangpt (Lôi) cấp 25–39. Tấn công từ 32 tới 180, P.Thủ từ 5 tới 85, đánh 18 loại quái. Script nằm ở `captures/f2-2026-11-01/` (`hits.py`, `fit.py`, `rates.py`, `missfit.py`, `gains.py`, `mobs.py`), chỉ có trên máy.

```text
Đòn 3 kiếm  H = Tấn công × (1 + 0,0175 × (cấp bên đánh − cấp bên bị đánh)) × 200 / (200 + P.Thủ bên bị đánh)
W = H / 3;  n kiếm ≈ n × W;  kỹ năng = W × (3 + S) + K như trên
```

- **Cách khớp:** nhóm các đòn 3 kiếm không gấp đôi theo cặp (bên đánh với Tấn công và cấp, bên bị đánh với P.Thủ và cấp), rồi lấy giá trị hay gặp nhất của mỗi nhóm. Cách này bỏ được chí mạng và đánh hụt. Có 94 nhóm mình đánh quái và 82 nhóm quái đánh mình. Mỗi quái có một Tấn công và một P.Thủ riêng, khớp cùng lúc với hai hệ số chung. [Đo]
- **Độ khớp:** công thức trên lệch trung bình 0,68 sát thương, với đòn từ 10 tới 200. [Đo]
  - Thay phần P.Thủ bằng `1 − P.Thủ/292`: lệch 0,72.
  - Tính cấp theo tỉ lệ `(38 + cấp bên đánh) / (38 + cấp bên bị đánh)`: lệch 0,96.
  - Trừ thẳng P.Thủ khỏi Tấn công: lệch 15.
- **Ví dụ:**
  - Ttuananh, Tấn công 160, cấp 34, đánh Cá Sấu cấp 31: đòn 3 kiếm 150. Công thức cũ `Tấn công + ⌊cấp/2⌋ − 6` cho 171.
  - manina, Tấn công 158, cấp 32: đòn 3 kiếm đánh Sơn Tặc 9, Cua Càng 15, Hỏa Hầu 29, Cá Sấu 31, Cóc Tía 35 lần lượt là 201, 185, 152, 144, 130.
  - Cá Sấu cấp 31 đánh manina (P.Thủ 24, cấp 29): 100. Đánh wangpt (P.Thủ 81, cấp 37): 68.

  Mỗi cấp chênh làm đòn đổi 1,75%. Một điểm P.Thủ bớt khoảng 0,4% đòn của quái. [Đo]
- **Tấn công không chỉ là Cường Lực**: mỗi hệ một chỉ số chính, hệ số khác nhau, và đồ cộng thêm ([Điểm tiềm năng](12-skills-items.md#điểm-tiềm-năng)). [Đo]
- **Chí mạng ×1,5 chỉ có ở mình**: quái không chí mạng lần nào trong 1644 đòn kiếm của chúng. Tỉ lệ chí mạng của mình xấp xỉ chỉ số Chí mạng tính theo %: manina (6–10) 4–7%, Ttuananh (9–10) khoảng 10%, wangpt (12–23) 12–25%. [Đo]
- **Đánh hụt** (kiếm gây 0) khớp với `1 / (1 + e^(−(Né tránh bên bị đánh − Chính xác bên đánh) / 130))`, mỗi quái có Né tránh và Chính xác riêng. [Đo; mô hình là Suy luận]
  - Mình đánh hụt 4% với wangpt (Chính xác 177–369), 7,5% với manina, 12% với Ttuananh (Chính xác 64).
  - Quái đánh hụt mình 16–28%. Hỏa Hầu đánh hụt wangpt 22% khi Né tránh 88 và 31–35% khi Né tránh 118–130.
- Khoảng 12% số đòn cao hơn giá trị hay gặp 2–3% (140 → 144, 89 → 91, 78 → 80), ở mọi số kiếm và không theo thanh sức mạnh. Có thể là ngẫu nhiên, hoặc là "đánh xuyên giáp". [Chưa rõ]
- `K` của kỹ năng vẫn đúng ở cấp cao: Băng Tiễn cấp 6, Xích Lôi Công cấp 5–8, Bách Lôi Uy Vũ cấp 4, Tuyết Sơn Áp Đỉnh cấp 4 đều khớp `W × (3 + S) + K` ở 60–75% số lần. 10–20% số lần mất `K`, còn lại là chí mạng. [Đo]
- Bot vẫn ước `W` ban đầu bằng `Tấn công + ⌊cấp/2⌋ − 6` (`swordPrior` trong [battle-actions.ts](../../../src/battle/battle-actions.ts) và bản Rust), rồi học `W` thật sau vài nước. Chưa đổi sang công thức mới. [Đo code]

Thông số quái khớp được (Tấn công và P.Thủ theo công thức trên; tim tính bằng HP mỗi viên):

| Quái | Cấp | HP | Tấn công | P.Thủ | Tim mỗi viên | EXP mỗi trận thắng |
|---|---:|---:|---:|---:|---:|---:|
| Kẻ Quấy Phá | 20 | 526 | 50 | 19 | 9,7 | 162 |
| Chim Điên | 25 | 491 | 35 | 28 | 13 | 212 |
| Hỏa Hầu | 29 | 766 | 69 | 19 | 13,7 | 271 |
| Cá Sấu | 31 | 577 | 109 | 24 | 12 | 264 |
| Cóc Tía | 35 | 661 | 126 | 30 | 13,7 | 333 |
| Thỏ Hồng | 39 | 755 | 154 | 29 | 15,3 | 383 |
| Huyết Lang | 40 | 1080 | 107 | 29 | 19 | 425 |
| Heo Lửa (4 trận) | 46 | 1270 | 132 | 39 | 21,7 | 532 |
| Hào Trưởng phía Bắc / Nam (boss) | 21 | 20.000 | 94–96 | 38–39 | 0 | |

Hai boss Hào Trưởng có 20.000 HP: thua cả 13/13 trận là do HP, không phải do thuật toán.

<a id="đo-trên-máy-a1"></a>

## Đo trên máy với Tiheo2 (A1, 31/10)

Tiheo2 (Ttuananh, hệ Thủy) cấp 15 → 16, đăng nhập sẵn trên điện thoại. Chỉ số theo `s2c/10` kiểu 4: Tấn công 23, P.Thủ 16, Chính xác 64, Né tránh 96, Chí mạng 9. manina: 32, 5–9, 30, 20, 6.

Cách làm:
- Bàn cờ không nhận chạm ADB, nên trận do cầu nối trong game đánh, như run4. Cầu nối có ba phần: agent Frida gọi hàm dựng gói của chính game (`a67`, `y104`, `h73`, `a74`, `f75`, `g76`, `e52`…), host Python, và brain Node chạy `BattleRunner` của [src/battle/battle-runner.ts](../../../src/battle/battle-runner.ts) với chiến lược `win`.
- Mỗi gói BattleRunner dựng được đổi thành lời gọi hàm dựng tương ứng. Gói game gửi đi được so với gói BattleRunner dựng: không lệch lần nào.
- Đã làm: nâng Hàn Lưu Thánh Thủy (4001) cấp 1 và Băng Tiễn Thuật (4000) lên cấp 2, tốn 3 điểm kỹ năng. Mua 4 Kim Đan và 2 Hoàn Linh Dược, tốn 720 Xu khóa.
- 7 trận do bot đánh, thắng cả 7: Heo Mọi, 3 Sơn Tặc, Kẻ Gây Rối, Chỉ Huy Sơn Tặc. 3 lần đầu hàng, sau khi brain lỗi hoặc game tự mở trận.
- Log và script ở `captures/a1-2026-10-31/` (không commit).

| Câu hỏi | Kết quả | Căn cứ |
|---|---|---|
| Kim Đan Dược ("Bơm 25% công lực") | Nội lực **+25** (0 → 25 → 50), tức 25% của 100. | 4 lần, a5 và a15 [Đo] |
| Dùng bình trong trận có mất lượt không? | **Có.** Sau `s2c/44` là nước của quái. | 5 lần [Đo] |
| Hoàn Linh Dược ("Bơm 30% sinh lực") | **+36** khi HP tối đa 145 (24 → 60), giống P5 (31 → 67). Tức khoảng 25% (⌊36,25⌋), không phải 30%. Chưa đo được ở HP tối đa khác. | 2 lần [Đo] |
| Hàn Lưu Thánh Thủy cấp 1 ("Phục hồi 11% sinh lực") | **+⌊11% × HP tối đa⌋**: +15 khi tối đa 145 (19 → 34), +16 khi tối đa 150 (113 → 129). Tốn 50 nội lực, **mất lượt**. | 2 lần [Đo] |
| Băng Tiễn Thuật cấp 2 | **51 = 8 × (3 + 1) + 19**: `K = 19` đúng như mô tả cấp 2, `W = 8`. | a8 seq 31 [Đo] |
| Viên bị kỹ năng phá có tác dụng không? | Có, và mạnh hơn viên ăn theo hàng: mỗi **tim bị phá hồi 10** (3 tim +30, 2 tim +20), bằng cả một hàng 3 tim (+10); 1 âm dương bị phá cho +7 nội lực. | a8 [Đo] |
| Tấn công đổi sát thương bao nhiêu? | Đòn 3 kiếm ở cấp 16: Tiheo2 (Tấn công 23) gây **24** với Sơn Tặc, Heo Mọi, Kẻ Gây Rối, và 22 với Chỉ Huy Sơn Tặc. manina (Tấn công 32) gây 34 với Sơn Tặc. Chênh 9 Tấn công cho chênh 10 sát thương. Công thức thử `3 kiếm ≈ Tấn công + ⌊cấp/2⌋ − 6` khớp mọi số của manina với Sơn Tặc nhưng dư 1 với Tiheo2, nên mới là [Suy luận]. | 34 đòn [Đo] |
| Chính xác / Né tránh | Tiheo2 (Chính xác 64) bị né 0/42 nước có kiếm; manina (Chính xác 30) bị né 7,1% (37/523). Quái đánh trúng manina (Né tránh 20) 84,8%, trúng Tiheo2 (Né tránh 96) 9/11 lần. | [Đo, mẫu Tiheo2 nhỏ] |
| Chí mạng | Tiheo2 (Chí mạng 9): 1/20 đòn 3 kiếm với Sơn Tặc gây 36 = 24 × 1,5. | [Đo] |
| Game có tự đánh khi hết giờ lượt không? | **Không.** Hết khoảng 33,5 s thì server gửi `s2c/24 playerTurn = 0`, game chỉ tự gửi `c2s/14` để xin nước quái. | a10 [Đo] |
| Kết quả không có viên rơi (kỹ năng hồi máu) | `s2c/20` không có byte xếp lại bàn và 3 byte theo sau, như `s2c/44`. `battleResult` đã sửa. | a5 [Đo] |
| Đầu hàng mất bao nhiêu? | 25 EXP ở cấp 15, 27 ở cấp 16. HP giữ nguyên. | [Đo] |
| Mở NPC từ xa | `c2s/13 ("M1", 106)` và `c2s/57` của Lái Buôn được trả lời khi đứng xa NPC. Hai lần ngay sau khi đầu hàng bằng nút trong trận thì server im lặng; thắng một trận xong lại được. Gói mua `c2s/1190` thì gọi `h87` (static) không tạo gói, nên phải chạm ADB trên cửa sổ cửa hàng. | [Đo; lý do Chưa rõ] |

Bài học khi chạy cầu nối:
- Lấy đối tượng `sqlq` chỉ từ hàm dựng gắn với đối tượng (`a115` được gọi liên tục, hoặc mở danh sách khu); hàm static như `a1` trả về class.
- Không đẩy cần điều khiển gần quái: nhân vật chạm quái thì game tự mở trận mà brain không có bàn đầu.
- Không `kill` host khi agent còn gắn vào luồng vẽ: game bị tắt một lần như vậy, phải đăng nhập lại (máy nhớ mật khẩu).
- Brain đọc lại log của lần chạy trước (`RESUME`) để đánh tiếp một trận bỏ dở: trận Heo Mọi a7 → a8 đánh tiếp từ seq 12, bàn khớp.

<a id="cách-quái-chọn-nước"></a>

## Cách quái chọn nước

Dữ liệu là 1011 nước đổi chỗ của quái, trên bàn đã dựng lại đúng từng ô, lấy từ cùng các trace (Sói Xám 359, Cóc Xanh 419, Kẻ Gây Rối 175, Chỉ Huy Sơn Tặc 58). Script ở scratchpad `formula/mobai.ts`, `mobhyp.ts`, `mobfit.ts`.

- Quái **không** đi nước tốt nhất. Chỉ 10% nước của nó ăn kiếm. [Đo]
- 42% số nước trùng với nước hợp lệ đầu tiên khi quét bàn theo hàng từ trên xuống, trong hàng từ trái sang, thử ô dưới trước ô bên phải. Thứ tự quét này khớp nhiều nhất trong 64 thứ tự đã thử. [Đo]
- Mô hình khớp nhất là bốc thăm có trọng số: mỗi nước hợp lệ được chọn với xác suất tỉ lệ với `exp(Σ trọng số × đặc trưng)`. Trọng số fit bằng maximum likelihood:

| Đặc trưng | Trọng số |
|---|---:|
| Mỗi viên tim trong đợt đầu | 0,41 |
| Mỗi viên kiếm | 0,38 |
| Mỗi viên âm dương | 0,26 |
| Mỗi viên đào | 0,16 |
| Mỗi viên giọt / sao / vàng | −0,07 / −0,05 / −0,03 |
| Mỗi viên của các đợt sau đã biết | −0,01 |
| Nước được thêm lượt | 1,49 |
| Nước đầu tiên khi quét | 1,02 |

So sánh các mô hình bằng log-likelihood trên 1011 nước:

| Mô hình | log-likelihood |
|---|---:|
| Chọn đều mọi nước | −1716 |
| 27% nước có hàng dài nhất, còn lại chọn đều | −1579 |
| Bốc thăm có trọng số (bảng trên) | **−1485** |

- Quái nghiêng về viên có ích cho trận (tim, kiếm, âm dương, đào). Nó gần như bỏ qua giọt, sao, vàng, vì các viên này chỉ cho người chơi EXP và Xu. [Suy luận]
- Kỹ năng: khi nội lực ≥ 25, quái dùng kỹ năng ở 57 trong 114 lượt. Nó cũng có lúc đổi chỗ dù đủ nội lực, ví dụ Sói Xám q16 trận 1: hai lượt liền với nội lực 32. [Đo]
- Viên rơi xuống (16 919 viên): mỗi loại 14,1–14,8%, riêng kiếm 12,9% cộng Kiếm lửa (mã 10) 1,4%, tức 1/10 số kiếm là Kiếm lửa. Bàn đầu trận không có Kiếm lửa. [Đo]

<a id="thuật-toán-của-bot"></a>

## Thuật toán của bot

Xem `bestMove` và `moveValue` trong [src/battle/battle.ts](../../../src/battle/battle.ts); `BattleRunner` ([src/battle/battle-runner.ts](../../../src/battle/battle-runner.ts)) giữ trạng thái hai bên và tự học thông số trong trận.

**Tốc độ do server quyết định, không phải do thuật toán.** Trong trận theo lượt, bot gửi nước và nhận kết quả mất ~35 ms, rồi server đợi ~965 ms mới gửi `s2c/24` cho lượt sau, sau **mọi** nước của cả hai bên (Q19: 106 lần đo). Một trận Cóc Xanh khoảng 27 nước của bot + 26 nước của quái ≈ 53 s. Muốn trận ngắn hơn chỉ có cách thắng bằng ít nước hơn. Chọn nước mất dưới 10 ms. [Đo]

### Cách chấm nước (từ Q20)

Mỗi viên được đổi ra **lượng HP chênh lệch** theo trạng thái trận, thay cho bộ trọng số cố định trước đây:

| Viên | Giá trị cho bên ăn |
|---|---|
| Kiếm | `số viên × sát thương/viên`, gấp đôi khi `s2` = 100. Nếu đủ giết đối thủ: 10 000 (chọn ngay) |
| Tim | `số viên × HP/viên`, nhưng không quá số HP đang thiếu: HP đầy thì tim không đáng gì |
| Âm dương | `số viên × nội lực/viên × sát thương kỹ năng / nội lực cần` (0 nếu không có kỹ năng) |
| Đào | Phần đóng góp vào đòn gấp đôi kế tiếp: `s2 thêm / 100 × sát thương 3 kiếm` (0 khi `s2` đã 100) |
| Thêm lượt | +10 |
| Giọt, sao, vàng | 0 với `--goal=kill`; 2, 4, 1 với `--goal=exp` |

Điểm của một nước = giá trị của mình − **giá trị nước đáp trả tốt nhất của quái** trên bàn còn lại, tính với HP của mình sau khi hồi và HP quái sau khi trúng đòn. Nước được thêm lượt thì không trừ. Trận tính giờ không trừ, vì quái không đi viên. Viên chưa rơi xuống coi như không biết, nên điểm là cận dưới.

Thông số mặc định là trung bình đo ở Q16–Q19. Trong trận, `BattleRunner` cập nhật từng thông số cho mỗi bên bằng trung bình chạy (mặc định tính như 6 viên đã thấy), nên sau vài nước đã biết đúng con quái đang đánh:

| Thông số | manina cấp 19 | Sói Xám cấp 11 | Cóc Xanh cấp 13 |
|---|---:|---:|---:|
| HP tối đa | 174 | 220 | 249 |
| Sát thương mỗi viên kiếm (gồm né) | 10,4 (20,6 khi gấp đôi) | 3,9 | 10,9 |
| HP mỗi viên tim | 5,45 | | 6,2 (mọi quái) |
| Nội lực mỗi viên âm dương | 1,24 | 2,7 | 3,45 |
| `s2` mỗi viên đào | 4,4 | | |
| Kỹ năng: nội lực lúc dùng, sát thương | 25–39, 44–110 (Hỏa Cầu Thuật) | 25–37, 24–28 | 25–41, 47–72 |

Viên rơi xuống chia đều 7 loại (5703 viên, mỗi loại 13,7–15,1%). [Đo]

Hệ quả: với Cóc Xanh, mỗi viên âm dương quái ăn được đáng khoảng 6–7 HP của mình, gần bằng một viên kiếm. Kỹ năng của quái chiếm phần lớn sát thương trong các trận thua (Q19: 177/225, 118/226). Bộ trọng số cũ (kiếm 10, tim 2 hoặc 6, âm dương 1, đào 3, thêm lượt 30) không chặn âm dương của quái, coi đào quá cao và tim luôn có giá. [Đo, Suy luận]

### Thử trên mô phỏng

Mô phỏng dùng đúng `legalMoves`/`settle` của bot, viên rơi ngẫu nhiên đều 7 loại, và thông số trong bảng trên (manina 174 HP gặp Cóc Xanh 249 HP; quái dùng kỹ năng khi nội lực ≥ 30, bot khi ≥ 25; né 10%). Không biết AI của quái nên thử ba kiểu: quái chọn nước ăn nhiều nhất trong 40%, 60%, 100% số lượt, còn lại chọn ngẫu nhiên. Kiểu 60% cho tỉ lệ kiếm mỗi lượt gần nhất với trận thật (quái 0,5–0,6, bot ~0,9). 1000 trận mỗi ô:

| Quái chọn nước tốt | Trọng số cũ: thắng, nước/trận thắng | Cách chấm mới |
|---|---|---|
| 40% | 70,6%, 34,8 | **80,2%**, 31,7 |
| 60% | 50,1%, 34,7 | **64,7%**, 32,9 |
| 100% | 37,0%, 36,6 | **42,6%**, 30,3 |

Đã thử thêm: trừ 0,5 hoặc 0,7 nước đáp trả, thêm lượt +20 hoặc +35; trừ đủ 1 nước đáp trả với thêm lượt +10 tốt nhất ở cả ba kiểu quái. Trận thật trước khi đổi: Cóc Xanh 3 thắng / 8 trận (Q17–Q19). [Đo trên mô phỏng; trận thật ở [10-quests](10-quests.md#kết-quả-q18-q20)]

Bảng trên dùng mô hình quái cũ (chọn nước ăn nhiều nhất 40–100% số lượt). Mô hình đo được ở [Cách quái chọn nước](#cách-quái-chọn-nước) thay cho nó, xem phần dưới.

<a id="thuật-toán-v2"></a>

### Thuật toán v2 (31/10)

Chọn bằng `--goal=win` (thắng nhiều trận nhất) hoặc `--goal=farm` (thêm thưởng cho giọt 2, sao 4, vàng 1 như `exp`). `kill` và `exp` giữ nguyên cách Q20. App Rust chơi `win` với `best_action` (v3) từ 31/10, xem [Chọn hành động](#chọn-hành-động); v1 của app (`kill`) vẫn giữ để so. `export:rust` kiểm cả bốn chiến lược. Code ở `bestMove`, `answerValue`, `castSkill`, `mobMoveOdds` trong [src/battle/battle.ts](../../../src/battle/battle.ts).

| Phần | Q20 (`kill`, `exp`) | v2 (`win`, `farm`) |
|---|---|---|
| Nước đáp trả của quái | Nước có giá trị nhất với quái | Giá trị trung bình theo xác suất của [mô hình quái](#cách-quái-chọn-nước). Đủ nội lực thì một nửa là kỹ năng |
| Nước được thêm lượt | +10 | Cộng giá trị nước tốt nhất của mình ngay sau đó, trên phần bàn đã biết |
| Dùng kỹ năng | Ngay khi nội lực đủ | `castSkill` (mọi chiến lược): dùng khi sát thương thấp nhất (3 kiếm) đã giết được quái; khi nội lực gấp đôi giá; hoặc khi sát thương trung bình trừ nước đáp trả của quái lớn hơn điểm nước đổi chỗ tốt nhất. Sức mạnh đầy thì kỹ năng được tính gấp đôi phần kiếm. Từ v3, chỉ dùng khi bot không có bảng kỹ năng ([Chọn hành động](#chọn-hành-động)) |
| HP quái | Biết sau đòn đầu của nó | Đọc từ khối quái của `s2c/22` (`mobBlock`), mọi chiến lược |
| Thông số học được | Học lại từ đầu mỗi trận | Nhớ suốt phiên theo tên quái (`BattleIo.memory`); giá trị ban đầu theo số đo: âm dương 2 nội lực/viên (trước là 1,2), kỹ năng quái 25 nội lực (trước là 30) và 4 kiếm + 11 sát thương (trước là 40) |

**Mô phỏng.** Script ở scratchpad `formula/sim.ts`, `policies.ts`, `run-src.ts`. Mô phỏng chạy đúng `legalMoves`/`settle`/`bestMove` của bot, cùng các số đo ở trên:
- công thức sát thương, né và chí mạng;
- viên rơi xuống như đã đo;
- quái theo mô hình bốc thăm.

HP **mang sang trận sau** và chỉ hồi đầy sau một trận thua, như [Q19 đo](10-quests.md#kết-quả-q18-q20). Mỗi giờ tính 1 s một nước của mỗi bên cộng 6 s mỗi trận. EXP mỗi trận thắng là `2 × (2 × sao + giọt) + 28`, mỗi trận thua −36.

Đối chiếu với trận thật trước khi so các cách chơi:
- Cóc Xanh, mỗi nước:

| Mỗi nước | Mô phỏng | Thật |
|---|---:|---:|
| Kiếm bot ăn | 0,98 | 1,03 |
| Tim bot ăn | 0,71 | 0,73 |
| Kiếm quái ăn | 0,42 | 0,42 |
| Tim quái ăn | 0,74 | 0,64 |
| Âm dương quái ăn | 0,50 | 0,67 |

- Số lần quái dùng kỹ năng mỗi trận: 0,94 trên mô phỏng, 1,04 thật.
- Cách cũ thắng 70,1% trên mô phỏng, Q20 thật thắng 67% (10/15).

Mỗi ô dưới đây là 12 giờ đánh Cóc Xanh liên tục, cùng các ván cho mọi cách chơi:

| manina | Cách chơi | Thắng/giờ | Thua/giờ | EXP/giờ | Tỉ lệ thắng |
|---|---|---:|---:|---:|---:|
| 174 HP (Q20) | Q20 (`kill`, kỹ năng ngay khi đủ) | 55,5 | 23,7 | 5806 | 70,1% |
| | `kill` + `castSkill` | 55,5 | 23,8 | 5840 | 70,0% |
| | **`win`** | **61,1** | **19,2** | 6677 | **76,1%** |
| | **`farm`** | 60,2 | 21,8 | **7728** | 73,4% |
| 238 HP (31/10) | Q20 | 59,3 | 16,4 | 6717 | 78,3% |
| | **`win`** | 63,9 | **13,8** | 7270 | **82,2%** |
| | **`farm`** | **64,2** | 14,7 | **8659** | 81,4% |

Đánh Sói Xám (6 giờ, mọi cách đều thắng 100%): Q20 74,2 trận/giờ, 8867 EXP/giờ; bản thử của `farm` 77,8 trận/giờ, 10 979 EXP/giờ.

Đã thử thêm trên mô phỏng nhưng không có lợi:
- Tính giá tim gấp 1,5 hoặc 2 lần vì HP mang sang trận sau: thắng ít hơn.
- Thêm lượt tính bằng 0,5; 1,2 hoặc 1,5 lần nước sau: không hơn 1 lần.
- Tính nước sau rồi trừ thêm nước đáp trả của quái: kém hơn, 57,7 thắng/giờ.
- Thử 6 bộ viên rơi ngẫu nhiên cho mỗi nước thay vì coi ô chưa rơi là không biết: không hơn.
- Giữ kỹ năng tới khi sức mạnh đầy: không hơn.
- Thưởng giọt/sao gấp đôi `farm`: thêm 4% EXP nhưng thua nhiều hơn 16%.

[Mô phỏng]. Chưa chạy trận thật với v2.

Hướng cải thiện tiếp theo:
- Tính giá trị của Kiếm lửa còn nằm trên bàn (nổ 3×3).
- Thua chủ yếu vì vào trận với HP thấp. Khi HP thấp có thể đánh quái yếu như Sói Xám trước (quái này gây ~70 HP mỗi trận, trong khi bot hồi được tim), hoặc dùng bình. Bình đã làm ở [Chọn hành động](#chọn-hành-động).

<a id="chọn-hành-động"></a>

### Chọn hành động: kỹ năng, hồi máu, bình (v3, 31/10)

Mỗi lượt bot so ba loại hành động trên cùng một thang điểm, tính bằng HP:
- nước đổi chỗ tốt nhất (`bestMove` của v2);
- từng kỹ năng đã học mà nội lực đủ trả;
- từng bình trong túi.

Code ở `bestAction` trong [src/battle/battle-actions.ts](../../../src/battle/battle-actions.ts). `BattleRunner` dùng nó khi biết danh sách kỹ năng. `QuestBot` tự lấy danh sách này từ bảng kỹ năng và túi đồ. Tham số dòng lệnh: `--skills` (mặc định `auto`) và `--potions` ([quest-bot](../../integration/nodejs/quest-bot.md#chạy)). Không có bảng kỹ năng thì bot chơi như v2 với `--skill`. Test: [test/battle-actions.test.ts](../../../test/battle-actions.test.ts).

**App Rust (31/10).** App desktop chơi v3, chọn mỗi lượt giống hệt bot TS. Code ở `app/core/src/battle_actions.rs` (bản port của `battle-actions.ts`), `battle.rs` (phần v2: `mob_move_odds`, `answer_value`, `cast_skill`, `mob_block`) và `runner_v3.rs` (`chooseAction` của `BattleRunner`).
- Bot biết cây kỹ năng (`s2c/30`) thì dùng v3; chưa biết thì chơi v2, dùng kỹ năng ghi trong `accounts.json` theo `castSkill`. Nick có ghi kỹ năng thì v3 chỉ dùng kỹ năng đó, như `--skill` của bot TS.
- Bot lấy kỹ năng đã học và cấp từ đuôi `s2c/9` và `s2c/10` kiểu 32, bình từ túi đồ, Tấn công và cấp từ `s2c/9`, HP quái từ khối quái của `s2c/22`. Thông số học được nhớ suốt phiên theo tên quái, kể cả `W` của mình (`me>tên.sword`).
- App dùng bình khi Dùng bình máu hay Dùng bình mana ở Cài đặt đánh được bật (mặc định tắt). Giá mỗi bình tính theo HP tối đa ([Bình máu và mana](#bình-máu-và-mana)).
- **v1 vẫn giữ** ở `runner.rs`, không sửa dòng nào: chiến lược `kill`, kỹ năng của nick dùng ngay khi đủ nội lực, giá trị ban đầu cho kỹ năng của quái là 40 sát thương và 30 nội lực (v3 dùng 43 và 25 như bot TS). Giao diện không có chỗ chọn; `cllt fight --algo=v1` chơi v1 để so.
- Gói kết quả không có viên rơi (kỹ năng chỉ hồi máu, `s2c/44` của bình) không còn byte xếp lại bàn và 3 byte sau đó; trước đây Rust luôn đọc 4 byte ấy, nay đọc như `battleResult` của TS, cho cả v1.
- Kiểm bằng `npm run export:rust` rồi `cargo test` ([tests/battle_v3.rs](../../../app/core/tests/battle_v3.rs)): 75 thế cờ cho cùng danh sách hành động, cùng thứ tự, cùng điểm; 540 mô tả kỹ năng được đọc giống nhau. Ngày 31/10 thêm một lần trên mọi bàn của 119 trận đã ghi: 4865 trường hợp `best_action` và 4851 thế `bestMove` khớp hết; 47 960 lựa chọn không có cái nào sai luật ([status](../../integration/rust/status.md)).
- Rust tính `Math.exp` như V8 trên máy arm64 (`js_exp`: `exp` của fdlibm, phần đa thức tính bằng FMA); `f64::exp` lệch ở khoảng 10% giá trị. V8 trên x86 không dùng FMA nên có thể lệch bit cuối, vì vậy vector ghi những số phụ thuộc `Math.exp` đã làm tròn (HP tới 1e-6, xác suất tới 1e-9). [Đo]
- App chưa đánh trận thật nào với v3.

**Bot biết gì trước trận:**

| Dữ liệu | Lấy từ | Dùng làm gì |
|---|---|---|
| Kỹ năng đã học và cấp | đuôi `s2c/9`, `s2c/10` kiểu 32 | Danh sách hành động |
| Mô tả và nội lực từng cấp | `s2c/30` ([12](12-skills-items.md#bảng-kỹ-năng)) | Hiệu ứng (bảng dưới) và giá |
| Túi đồ | `s2c/42` lúc vào game, `s2c/1187` khi túi đổi, `s2c/83` cho một ô | Bình nào còn, ở ô nào (`c2s/44`) |
| Tấn công và cấp | `combat[0]` của `s2c/9` | `W` trước đòn kiếm đầu tiên: (Tấn công + ⌊cấp/2⌋ − 6) / 3. manina 12 (đo 12), Tiheo2 8,33 (đo 8) |
| HP quái | khối quái của `s2c/22` | Biết lúc nào kỹ năng có thể kết liễu |
| `W`, tim, âm dương của từng loại quái | học trong trận, nhớ suốt phiên theo tên quái | Như v2 |
| `W` của mình với từng loại quái | học trong trận, nhớ riêng theo tên quái (`me>tên.sword`) | Tiheo2 gây 8 với Sơn Tặc nhưng 7,33 với Chỉ Huy Sơn Tặc (A1), nên không dùng chung một số |

**Đọc hiệu ứng từ mô tả.** Cả 540 mô tả của 3 cây kỹ năng (9 kỹ năng × 20 cấp × 3 hệ) đều thuộc 14 dạng câu, và `skillEffect` đọc được hết. Giá trị của từng dạng:

| Mô tả | Bot tính | Căn cứ |
|---|---|---|
| "Tấn công và gây K sát thương" (kèm phá vùng, phá ngẫu nhiên, phá hàng ngang hoặc dọc) | `W × (3 + số kiếm bị phá và rơi) × 2 nếu sức mạnh đầy + K × 6/7`. Nếu có thể kết liễu thì tính 10 000 nhân xác suất kết liễu | [Đo] ở kỹ năng gốc (1000, 2000, 4000). Kỹ năng không phá ô (4003 Băng Đao Kích…) dùng cùng công thức với số kiếm bằng 0 [Suy luận] |
| "Phục hồi P% sinh lực" | ⌊P × HP tối đa⌋, không quá phần HP đang thiếu | [Đo] 4001 cấp 1 ở A1 |
| "… có P% cơ hội hấp thu N sinh lực" | P × N | [Suy luận] |
| "… có P% cơ hội làm đối phương bị giảm N lực phòng thủ trong T lượt" | P × N/3 × 1 kiếm mỗi lượt × T/2 | [Suy luận] |
| "Tăng N lực tấn công trong T lượt. Được đi tiếp" | N/3 × 1 kiếm mỗi lượt × T/2, cộng nước đổi chỗ tốt nhất ngay sau đó | [Suy luận]: 9 Tấn công ≈ 3 sát thương cho đòn 3 kiếm, theo A1 |
| "Tăng N lực phòng thủ … trong T lượt" | N/3 × 0,42 kiếm của quái mỗi lượt × T/2 | [Suy luận] |
| "Tăng N né tránh …" | 0 | [Suy luận từ Đo]: Tiheo2 (Né tránh 96) vẫn bị trúng 9/11 lần, manina (20) bị trúng 85% |
| "Triệt tiêu P% năng lượng của kẻ thù" | P × nội lực quái × giá trị nội lực của quái, và quái bớt nội lực ngay | [Suy luận]: coi "năng lượng" là nội lực |
| "Biến từ a đến b quân cờ thành kiếm lửa, và có P% cơ hội đi tiếp" | Đặt Kiếm lửa vào các ô ngẫu nhiên, cho rơi như sau một nước đổi chỗ, P% được đi tiếp | [Đo 5 lần] các ô của `s2c/20` thành Kiếm lửa, không ô nào bị phá; hàng 3 chúng làm thành rơi ngay như sau một nước đổi chỗ ([s2c/20](05-battle.md#s2c-20)). Server chọn ô, bot đoán ô ngẫu nhiên |
| Hoàn Linh Dược / Kim Đan Dược | ⌊25% HP tối đa⌋ / +25 nội lực. Dùng bình mất lượt | [Đo A1] |

Những viên kỹ năng phá được tính gấp 3 với tim, âm dương và đào. Những viên rơi thành hàng sau đó tính như thường ([Đo A1](#đo-trên-máy-a1)).

**Cách chấm điểm kỹ năng:**
- Kỹ năng phá ô được thử với 16 cách đặt vùng ngẫu nhiên. Cách đặt cố định theo bàn cờ, nên cùng một bàn luôn cho cùng điểm.
- Với mỗi cách đặt, bot phá các ô, cho rơi phần đã biết, rồi tính sát thương, máu hồi và nội lực nhận lại. Sau đó trừ nước đáp trả trung bình của quái trên bàn còn lại ([mô hình quái](#cách-quái-chọn-nước)).
- Kỹ năng hoặc bình làm rơi một hàng từ 4 viên trở lên, hoặc kỹ năng ghi "được đi tiếp", thì không bị trừ nước đáp trả.
- **Nội lực tiêu đi bị trừ đúng bằng giá trị của nó** (`SPEND = 1`). Giá trị một điểm nội lực = sát thương trung bình của kỹ năng đánh tốt nhất ÷ nội lực của nó. Kỹ năng để dành tới lượt sau vẫn gây đúng sát thương đó, nên bot chỉ dùng ngay khi lượt này cho thêm cái gì đó:
  - có cơ hội kết liễu;
  - phá được viên có lợi;
  - nước đổi chỗ hiện có kém.
- Hai trường hợp không trừ giá nội lực:
  - thanh nội lực đầy tới mức không còn chỗ cho thêm một lần kỹ năng rẻ nhất (nội lực + giá rẻ nhất > 100), vì phần âm dương ăn thêm sẽ mất. Ngưỡng này chung cho mọi kỹ năng, để kỹ năng đắt (hồi máu 50) không được miễn trừ khi kỹ năng rẻ (25) vẫn bị trừ;
  - trận tính giờ, vì quái không đi nước nào, nên mỗi lượt chỉ cần gây nhiều sát thương nhất.
- Bình bị trừ thêm giá `--potions=HP`. Mặc định không dùng bình. Với `300`, bot chỉ dùng bình khi nước sau của quái có thể kết thúc trận. Ở trận tính giờ bot không dùng bình, vì đòn theo đồng hồ của quái chưa được tính vào điểm. Server không trả lời một bình thì trong trận đó bot coi ô ấy đã hết. Bình có `costShare` thì giá của nó là `costShare × HP tối đa`, không quá phần bình mang lại cộng 2000, thay cho `--potions` (app: [Bình máu và mana](#bình-máu-và-mana)).
- Buff còn hiệu lực thì không dùng lại.

**Mô phỏng** (`formula/sim2.ts`, `run2.ts` trong `captures/a2-2026-10-31/`). Mô phỏng v2 được thêm:
- mọi kỹ năng theo mô tả;
- viên bị phá tính gấp 3;
- hồi máu theo % HP;
- bình;
- tỉ lệ đánh hụt riêng cho từng bên: manina hụt 8,7%; Tiheo2 2%; quái đánh Tiheo2 hụt 15%.

Các trận của Tiheo2 dùng HP và `W` đo ở A1. Riêng `W` của Cóc Xanh khi đánh Tiheo2 chưa đo được (đánh manina, P.Thủ 5–9, là 12; Tiheo2 có P.Thủ 16), nên tạm lấy 10. Mỗi ô là trung bình 2 × 24 giờ đánh liên tục, cùng các ván cho mọi cách chơi:

| Nhân vật, quái | Cách chơi | Thắng/giờ | Thua/giờ | EXP/giờ | Tỉ lệ thắng |
|---|---|---:|---:|---:|---:|
| manina 174 HP, Hỏa Cầu Thuật cấp 1 (như Q20), Cóc Xanh | v2 (`castSkill`) | 57,6 | 21,9 | 6131 | 72,4% |
| | **v3** | **58,9** | **21,0** | **6261** | **73,7%** |
| manina hiện tại: Hỏa Cầu Thuật cấp 4, Hỏa Kiếm Thuật cấp 1; Cóc Xanh | v2 | 63,5 | 20,5 | 6463 | 75,6% |
| | **v3** | **64,6** | **20,1** | **6580** | **76,3%** |
| Tiheo2 cấp 16 (4000 cấp 2, 4001 cấp 1), Cóc Xanh | v2 | 40,9 | 28,9 | 4854 | 58,6% |
| | **v3** | **42,3** | **27,5** | **5050** | **60,6%** |
| Tiheo2, Kẻ Gây Rối (24 giờ) | v2 / v3 | 74,7 / 75,7 | 0 / 0,1 | 8956 / 8980 | ~100% |
| Tiheo2, Sơn Tặc tính giờ (24 giờ) | v2 / v3 | 102,2 / 102,1 | 0 | 14 754 / 14 744 | 100% |

Các mức trừ giá nội lực đã thử, cùng 2 × 24 giờ:

| Trừ | manina Q20, thắng/giờ | Tiheo2 / Cóc Xanh, thắng/giờ |
|---:|---:|---:|
| 0 | 57,3 | 39,8 |
| 0,5 | 57,8 | 40,6 |
| 0,75 | 58,1 | 41,8 |
| **1** | **58,9** | **42,3** |
| 1,5 | 56,0 | 31,8 (dùng hồi máu 22 lần/giờ thay cho Băng Tiễn) |
| 2 | 53,8 | 26,8 |

Không trừ thì v3 kém v2 khoảng 1 trận mỗi giờ. So từng lượt cho thấy lý do: v3 dùng kỹ năng ở những lượt v2 đổi chỗ (31 trên 43 lượt khác nhau, trong 4041 lượt). Đã thử thêm nhưng không hơn:
- tính nước đáp trả của quái trên bàn trước khi dùng kỹ năng thay vì bàn sau đó;
- luật "đủ nội lực cho 2 lần thì dùng" của `castSkill`;
- thử 32 cách đặt vùng thay cho 16.

[Mô phỏng]

**Kỹ năng và điểm kỹ năng.** Cùng mô phỏng cho Tiheo2 đánh Cóc Xanh, 2 × 24 giờ:

| Kỹ năng | Điểm kỹ năng | Thắng/giờ | Thua/giờ | EXP/giờ | Kỹ năng mới được dùng |
|---|---:|---:|---:|---:|---|
| Như hiện tại (4000 cấp 2, 4001 cấp 1) | | 42,3 | 27,5 | 5050 | |
| Bỏ Hàn Lưu Thánh Thủy (24 giờ) | | 41,8 | 27,6 | 5043 | |
| Băng Tiễn Thuật cấp 3 (`K` = 27, cần cấp 12) | 1 | 45,5 | 26,6 | 5322 | |
| **Băng Tiễn Thuật cấp 4 (`K` = 35, cần cấp 17)** | 2 | **48,0** | **25,7** | **5517** | |
| Hàn Lưu Thánh Thủy cấp 2 (12%) | 2 | 42,3 | 27,5 | 5050 | 0 lần/giờ |
| Thêm Băng Đao Kích 4003 cấp 1 (45, 50 nội lực) | 2 | 42,3 | 27,4 | 5056 | 0,2 lần/giờ |
| Thêm Tuyết Sơn Áp Đỉnh 4006 cấp 1 (57 + vùng 3×3, 50 nội lực) | 2 | 42,4 | 27,5 | 5064 | 0,9 lần/giờ |

- Băng Tiễn Thuật cho nhiều sát thương nhất trên mỗi điểm nội lực. Ở cấp 2 nó gây khoảng 48 cho 25 nội lực. Băng Đao Kích chỉ được khoảng 63 cho 50, Tuyết Sơn Áp Đỉnh khoảng 83 cho 50. Bot dùng Băng Tiễn ngay khi có lợi, nên hiếm khi để dành được 50 nội lực. [Mô phỏng]
- Hàn Lưu Thánh Thủy cấp thấp gần như không bao giờ được dùng. 16 HP cho 50 nội lực ít hơn hẳn 2 lần Băng Tiễn. Bot chỉ dùng nó khi kỹ năng của quái có thể giết mình và hồi máu đủ đưa HP qua ngưỡng đó. [Mô phỏng]
- Với manina, Hỏa Kiếm Thuật chỉ được dùng 0,2–0,3 lần mỗi giờ. Hiệu ứng của nó là đoán ([Suy luận]); cần một trận thật có dùng nó để biết đúng.

**Bình.** Với `--potions=300` (300 hay 1000 cho kết quả như nhau):

| Nhân vật | Thắng/giờ | Thua/giờ | EXP/giờ | Bình mỗi giờ |
|---|---:|---:|---:|---|
| manina hiện tại | 64,6 → 66,1 | 20,1 → 17,6 | 6580 → 6877 | 11,3 Hoàn Linh Dược, 1,0 Kim Đan |
| Tiheo2 / Cóc Xanh | 42,3 → 44,1 | 27,5 → 23,8 | 5050 → 5508 | 18,6 Hoàn Linh Dược, 1,1 Kim Đan |

Mỗi giờ tốn khoảng 1500–2400 Xu khóa (120 mỗi bình) để thua ít hơn 2,5–3,7 trận. Vì vậy mặc định bot không dùng bình. [Mô phỏng]

**Chạy thật (A2, 31/10).** Tiheo2 đánh qua cầu nối trong game như A1, brain chạy `BattleRunner` với `SKILLS=4000:2,4001:1` và bình giá 300. Log ở `captures/a2-2026-10-31/phone/` (không commit).
- **b1** (trừ giá nội lực bằng 0, bản đầu): thắng 7/7 (2 Kẻ Gây Rối, Chỉ Huy Sơn Tặc, 3 Sơn Tặc, Heo Mọi), 940 EXP. Tiheo2 lên cấp 17.
- **b2** (bản cuối, trừ giá 1): thắng 6/6 (Chỉ Huy Sơn Tặc, Kẻ Gây Rối, 4 Sơn Tặc), 844 EXP. Tiheo2 lên cấp 18, xong bước "Đánh bại Sơn Tặc (10/10)".
- Cả hai lượt không có `board_desync`, `tx_mismatch` hay `action_no_answer`. Mỗi gói BattleRunner dựng đều khớp gói game gửi. HP không xuống dưới 120, nên hồi máu và bình không cần dùng.
- Dòng `choice` cho biết vì sao bot dùng hoặc giữ kỹ năng. Chỉ Huy Sơn Tặc ở b2: lượt 21–26 giữ Băng Tiễn (đổi chỗ 13–51 điểm, kỹ năng −7 đến 7), rồi dùng ở lượt 28 khi HP quái còn 65 (kỹ năng 9110, vì có thể kết liễu). Ở trận tính giờ Sơn Tặc, bot dùng ngay khi đủ nội lực (kỹ năng 59, đổi chỗ 14). [Đo]

**Kết luận cho người chơi:**
- Tiheo2 (cấp 18; sau A1 còn 10 điểm kỹ năng) nên dùng **2 điểm nâng Băng Tiễn Thuật lên cấp 4**. Trên mô phỏng với quái khó, bot thắng thêm khoảng 13% trận mỗi giờ. Cấp 5 cần cấp nhân vật 22.
- Chưa nên tốn điểm cho Hàn Lưu Thánh Thủy cấp 2, Băng Đao Kích hay Tuyết Sơn Áp Đỉnh khi Băng Tiễn còn nâng được.
- Bình chỉ đáng dùng khi một trận thua đáng giá hơn khoảng 5–6 bình.

<a id="bình-máu-và-mana"></a>

### Bình máu và mana trong app (02/11)

Cài đặt đánh có dòng **Dùng bình trong trận**. Bấm ▾ để mở hai ô tích **Bình máu** (Hoàn Linh Dược) và **Bình mana** (Kim Đan Dược), mặc định tắt, mỗi loại có hai số: **Tối đa mỗi trận** (mặc định 1 bình máu, 2 bình mana) và **Giữ lại trong túi** (mặc định 30 mỗi loại). Bot không tự mua bình.

- **Số bình một trận được uống** là số nhỏ hơn trong hai số: tối đa mỗi trận, và số đang có trong túi trừ số giữ lại. Bot lấy từ ô túi đầu tiên có bình đó (`battle_potions` trong [bot/fight.rs](../../../app/core/src/bot/fight.rs)). Sau mỗi bình, server gửi `s2c/83` với số còn lại trong ô, nên trận sau tính lại đúng.
- **Khi túi chỉ còn bằng số giữ lại hoặc ít hơn** (túi đã đọc được), nhật ký ghi một lần trong lượt chạy: "Không dùng Kim Đan Dược nữa: túi còn 30, giữ lại 30 (không tự mua)". Thẻ Cài đặt đánh hiện số bình trong túi bằng chữ đỏ, kèm nút Mua bình.
- **Giá mỗi bình tính theo HP tối đa** (`costShare` của `Potion`, cả TS lẫn Rust): Hoàn Linh Dược `1 × HP tối đa`, Kim Đan Dược `0,17 × HP tối đa`, nhưng không quá phần bình mang lại cộng `POTION_MARGIN` (2000). Giá cố định như `--potions=300` chỉ hợp với cấp thấp. Với 174 HP, bot uống khi còn khoảng 18% máu; với 3480 HP (×20, tầm symap), nó uống ngay khi còn 70%, gần như trận nào cũng uống.
  - Bình máu giá bằng cả HP tối đa nhưng chỉ hồi 25%. Vì vậy bot chỉ uống khi nước sau của quái có thể kết thúc trận, tức lúc sắp chết: còn khoảng 15–20% máu ở mọi cấp.
  - **Vì sao có trần 2000:** cái chết được tính 10 000 điểm, cố định. Không có trần, từ khoảng 5000 HP tối đa giá bình máu đã vượt cái lợi nó cứu được, và bot không bao giờ uống (mô phỏng ×40, 7000 HP: 0 bình). Với trần, bình được uống khi nó cứu trận một lần trong năm. Ở ×40 và ×80, bot uống 0,11–0,2 bình mỗi trận, khi còn 13–22% máu, và thua ít hơn 2–3 trận mỗi giờ.
  - **Giới hạn:** trên một thế cờ thử, bot vẫn uống tới 9000 HP tối đa nhưng không uống từ khoảng 10 000 HP. Ở mức đó đòn thường của quái đã gần 10 000 điểm của cái chết. Có nhân vật như vậy thì phải đổi điểm của cái chết theo HP, cho cả thuật toán chứ không riêng bình.
  - Bình mana được uống khi 25 nội lực, tính theo sát thương của kỹ năng đánh tốt nhất trên mỗi điểm nội lực, đáng hơn giá của nó. Nhân vật không có kỹ năng đánh thì không uống.
- **Trận tính giờ không dùng bình** (cả TS lẫn Rust): đòn theo đồng hồ của quái chưa vào điểm, nên cũng không tính được cái chết bình cứu được.
- **Chưa có bảng kỹ năng** (`s2c/30` chưa đến hay đọc lỗi, bot chơi v2) thì không dùng bình.
- **Tối đa mỗi trận** từ 1 tới 10; file sửa tay ghi 0 thì coi như tắt. Tắt một loại giữa trận thì bot thôi uống loại đó ngay trong trận đang đánh; đổi số tối đa hay số giữ lại thì có hiệu lực từ trận sau. Gõ số vào ô thì 0,5 giây sau lần gõ cuối mới lưu.
- Dòng "Đã dùng Hoàn Linh Dược (ô 0) ở lượt 7, trận này còn được dùng 0" nói số bình trận này còn được uống, không phải số trong túi.
- Mỗi trận ghi vào dữ liệu trận (`play.potions`) những bình được phép uống và giá của chúng.

**Mô phỏng** (`capped.ts` trong `captures/p2-2026-11-02/`, cùng mô phỏng v3 ở trên). Bot uống tối đa 1 bình máu và 2 bình mana mỗi trận, giữ lại 30. Dòng "không dùng" là 24 giờ; các dòng khác là 8 giờ. "×20" là HP, `W` và máu mỗi tim của cả hai bên nhân 20, giống nhân vật cấp cao đánh quái cùng cấp; nội lực và `K` của kỹ năng giữ nguyên.

| Nhân vật, quái | Bình | Thắng/giờ | Thua/giờ | EXP/giờ | Bình mỗi trận |
|---|---|---:|---:|---:|---|
| manina, Cóc Xanh | không dùng | 65,8 | 19,6 | 6669 | |
| | máu | 66,9 | 19,0 | 6868 | 0,11 máu, uống khi còn 19% |
| | mana | 114,8 | 14,5 | 8314 | 1,96 mana |
| | cả hai | **115,3** | **12,5** | **8511** | 0,04 máu, 1,95 mana |
| Tiheo2, Cóc Xanh | không dùng | 42,6 | 27,2 | 5036 | |
| | máu | 45,4 | 24,9 | 5398 | 0,16 máu, uống khi còn 19% |
| | mana | 65,5 | 23,8 | 6300 | 1,93 mana |
| | cả hai | **66,4** | **20,8** | **6623** | 0,12 máu, 1,93 mana |
| manina ×20 | không dùng | 58,7 | 18,8 | 6565 | |
| | cả hai | **86,1** | **11,1** | **8011** | 0,05 máu (uống khi còn 16%), 1,84 mana |
| Tiheo2 ×20 | không dùng | 36,4 | 26,5 | 4681 | |
| | cả hai | **54,8** | **17,8** | **6585** | 0,11 máu (13%), 1,78 mana |

- **Bình máu**: giá `0,5 × HP tối đa` cho kết quả gần như `1 ×`. Với giá cố định ở ×20: 300 làm bot uống khi còn 70% máu (0,9 bình mỗi trận, thua 12,4/giờ), 1000 khi còn 38%, 3000 khi còn 15%. Uống sớm thì thua ít hơn một chút nhưng tốn gấp khoảng 7 lần số bình.
- **Bình mana**: giá `0,3 × HP tối đa` ở cấp thấp tốt ngang `0,17` (Tiheo2 thắng 68,5/giờ, thua 16,8/giờ), nhưng ở ×20 gần như không uống (0,24–0,32 bình mỗi trận). `0,17` uống đều ở mọi cấp nên được chọn.
- **Chi phí**: 2 bình mana mỗi trận là 130–250 bình mỗi giờ, khoảng 15 000–30 000 Xu khóa mỗi giờ (120 mỗi bình). Có 200 bình và giữ lại 30 thì bot dùng được khoảng 1 giờ rồi thôi.
- **Chưa chạy thật.** App chưa đánh trận nào với hai cài đặt này. [Mô phỏng]

<a id="quái-mạnh-h1"></a>

### Đo v3 với quái gần cấp mình (H1, 31/10)

Các trận thật trước đây gần như thắng hết vì nhân vật cao hơn quái 8–15 cấp. H1 thử quái mạnh nhất manina tới được: **Kẻ Quấy Phá cấp 20** ở M2 (manina cấp 22, Tấn công 32, HP 244, 71 điểm tiềm năng chưa cộng). Bot TS v3, không bình, đánh tiếp cả khi thua: `npm run quest -- --farm="Kẻ Quấy Phá" --fights=20 --max-losses=20` có `CLLT_TRACE`.

- **Thắng 6/20 (30%)**, 14 trận thua bắt đầu cả với HP đầy. Trận thắng 35–60 nước, trận thua 16–66 nước, trung bình 1,35 phút một trận. [Đo]
- EXP 16 121 → 17 447: trận thắng được 260–356 EXP, trận thua mất khoảng 41. Nhặt được 2 đống Xu khóa (211, 243), Đá cấp 2 và Áo Hào Kiệt (+8 phòng thủ, +6 cường lực). [Đo]
- Bàn phát lại khớp server ở cả 1614 nước (`desync` 0), kể cả 45 lần manina dùng Hỏa Cầu Thuật và 26 lần quái dùng kỹ năng. [Đo]

Thông số đo được (script `plan/replay-any.ts`, `plan/calib.ts` trong scratchpad):

| | manina đánh Kẻ Quấy Phá | Kẻ Quấy Phá đánh manina |
|---|---|---|
| HP | 244 | **526** (`s2c/22`) |
| Đòn 3 kiếm hay gặp nhất | 29 (162/199 lần), `W` = 9,67 | **45** (42/62 lần), `W` = 15 |
| Kiếm đánh hụt | 9,1% | 19,7% |
| Kỹ năng | Hỏa Cầu Thuật cấp 4: 2,25 lần/trận, 64–112 | Hỏa Cầu Thuật cấp 1 (`K` = 11): 1,3 lần/trận, 56–131 |
| Hồi máu | | 149–245 HP trong mỗi trận thắng, khoảng 8,5 mỗi viên tim |

- Theo `3 kiếm ≈ Tấn công + ⌊cấp/2⌋ − 6`, manina lẽ ra đánh 37. Thực tế 29, nên Kẻ Quấy Phá bớt khoảng 8, có lẽ do phòng thủ của quái. [Đo; lý do là Suy luận]
- Trên mô phỏng với thông số này (tim quái 10), manina thắng 39% khi đánh liên tục (thật: 30%, khoảng tin cậy 95% của 6/20 là 12–54%). Mô phỏng hơi lạc quan: manina mô phỏng dùng kỹ năng 2,8 lần/trận, thật 2,25. [Mô phỏng]

<a id="cộng-điểm"></a>

### Cộng điểm tiềm năng và kỹ năng cho manina (mô phỏng, 31/10)

> Mô hình ở mục này đã cũ. F2 (01/11) đo được rằng Tấn công, HP và `W` tính khác với giả định dưới đây: [W theo chỉ số](#công-thức-theo-chỉ-số). Kết quả mới ở [Cộng điểm theo chỉ số](#cộng-điểm-f2). Thực tế cả ba nick đã cộng mọi điểm vào chỉ số chính, đúng như mục này đề xuất.

Mô hình chỉ số rút từ số đo:
- **Tấn công = Cường Lực** với hệ Hỏa: manina có cả hai bằng 32, không đổi từ cấp 8 tới 22 ([12-skills-items](12-skills-items.md#điểm-tiềm-năng)). [Đo, 1 nhân vật]
- **Đòn 3 kiếm tăng khoảng 1 cho mỗi điểm Tấn công**: Tiheo2 (23) và manina (32) chênh 9 Tấn công thì chênh 10 sát thương ([A1](#đo-trên-máy-a1)). Mô phỏng coi `W = (Tấn công + ⌊cấp/2⌋ − 6 − phần của quái) / 3` đúng cả khi Tấn công lên gấp 3. Đây là chỗ yếu nhất của mô hình. [Suy luận]
- **HP = 6 × Thể Lực + đồ**: manina Thể Lực 30 → HP gốc 180, lên cấp 22 (Thể Lực 31) → 186; Tiheo2 Thể Lực 25 → 150. Nón Âu Lạc cộng 58. [Đo]
- Thân Pháp: +3 Chính xác mỗi điểm ([P1](12-skills-items.md#điểm-tiềm-năng)); mô phỏng cho tỉ lệ đánh hụt giảm từ 8,7% (Chính xác 30) về 0 (Chính xác 64). Phần P.Thủ, Né tránh, Chí mạng của Thân Pháp chưa đo nên không tính. [Suy luận]

Script `plan/run-plan.ts` trong scratchpad (dùng `sim2.ts`, bot v3, HP mang sang trận sau). Mỗi ô là 24 giờ đánh liên tục. EXP/giờ của mô phỏng tính theo công thức của Cóc Xanh, nên với Kẻ Quấy Phá (thắng ~300 EXP) nên nhìn số thắng/giờ:

| 71 điểm tiềm năng | Tấn công | HP | Cóc Xanh: tỉ lệ, thắng/giờ | Kẻ Quấy Phá: tỉ lệ, thắng/giờ, thua/giờ |
|---|---:|---:|---|---|
| Giữ nguyên | 32 | 244 | 84,7%, 72,6 | 39,0%, 17,1, 26,8 |
| Chỉ nâng Hỏa Cầu Thuật lên cấp 5 | 32 | 244 | 86,0%, 74,8 | 42,3%, 18,8, 25,6 |
| 71 Cường Lực | 103 | 244 | 94,6%, **165** | 86,5%, **89,2**, 14,0 |
| 55 Cường Lực, 16 Thân Pháp | 87 | 244 | 94,1%, 155 | 85,3%, 79,8, 13,8 |
| 50 Cường Lực, 21 Thể Lực | 82 | 370 | 96,0%, 144 | **89,5%**, 75,9, 8,9 |
| 36 Cường Lực, 35 Thể Lực | 68 | 454 | 96,6%, 127 | 89,8%, 65,4, 7,4 |
| 21 Cường Lực, 50 Thể Lực | 53 | 544 | 96,7%, 109 | 87,9%, 52,5, 7,3 |
| 71 Thể Lực | 32 | 670 | 95,7%, 78 | 76,1%, 28,3, 8,9 |
| 71 Thân Pháp | 32 | 244 | 85,6%, 75 | |

- Cường Lực cho nhiều trận thắng nhất: gấp 2,3 lần với Cóc Xanh, 5 lần với Kẻ Quấy Phá. Thêm Thể Lực bớt trận thua nhưng bớt cả trận thắng. [Mô phỏng]
- **Điểm kỹ năng:** ở cấp 22 chỉ học thêm được Hỏa Cầu Thuật cấp 5 (1 điểm), Hỏa Kiếm Thuật tới cấp 3, Liệt Hỏa Chi Kiếm và Thiên Hỏa Kích tới cấp 3 (2 điểm mỗi cấp). Mọi tổ hợp 15 điểm cho kết quả y như chỉ nâng Hỏa Cầu Thuật cấp 5. Bot không bao giờ dùng các kỹ năng 50 nội lực: nội lực vừa đủ 25 là Hỏa Cầu Thuật đã đáng dùng hơn (khoảng 92 sát thương cho 25 nội lực, Liệt Hỏa Chi Kiếm cấp 3 khoảng 112 cho 50). [Mô phỏng]
- Cách làm an toàn: cộng một phần Cường Lực trước (ví dụ 21, Tấn công 53), đánh khoảng 10 trận để đo `W` mới (dự đoán đòn 3 kiếm vào Kẻ Quấy Phá ≈ 50). Nếu khớp thì cộng phần còn lại. Cộng điểm thì không lấy lại được, trừ khi dùng Tẩy Tủy Đan. Chưa cộng điểm nào.

<a id="cộng-điểm-f2"></a>

### Cộng điểm theo chỉ số (mô phỏng F2, 01/11)

Mô phỏng v2 được chuyển sang `captures/f2-2026-11-01/sim/` và dùng mọi công thức của F2:
- chỉ số tính từ tiềm năng và đồ ([bảng](12-skills-items.md#chỉ-số-theo-tiềm-năng));
- `W` của cả hai bên ([W theo chỉ số](#công-thức-theo-chỉ-số));
- đánh hụt theo Né tránh và Chính xác, chí mạng bằng Chí mạng %;
- tim, đào, âm dương nạp theo Thể Lực, Cường Lực, Nội Lực;
- thông số quái lấy từ bảng ở trên.

Bot là v3, chơi như app (`win`, không dùng bình). HP mang sang trận sau, giống app: chỉ 39% số trận thật bắt đầu với máu đầy. Các file: `model.ts` (mô hình), `calib.ts` (đối chiếu), `plan.ts` và `robust.ts` (kế hoạch).

**Đối chiếu với trận thật** (`calib.ts`): lấy 28 nhóm (nick, cấp, quái) có từ 12 trận thật trở lên, mỗi nhóm cho chơi 40 trận mô phỏng. Tỉ lệ thắng lệch trung bình 6,9 điểm %, và mô phỏng lạc quan hơn thật trung bình khoảng 4 điểm. Phần lớn độ lệch nằm trong sai số của 12–42 trận thật mỗi nhóm. Ví dụ: [Mô phỏng]

| Nhóm | Thật | Mô phỏng |
|---|---:|---:|
| Ttuananh cấp 33 với Cá Sấu | 74% (38 trận) | 80% |
| manina cấp 33 với Cá Sấu | 59% (41 trận) | 63% |
| wangpt cấp 35 với Cá Sấu | 76% (42 trận) | 80% |
| wangpt cấp 32 với Hỏa Hầu | 96% (24 trận) | 93% |

**Cách so:** mỗi nick ở cấp hiện tại được thêm 20 điểm tiềm năng (5 cấp) vào một chỗ, rồi đánh liên tục 2 giờ với mỗi quái (`plan.ts`). Các phương án sát nhau được chạy lại 3 giờ với hạt ngẫu nhiên khác (`robust.ts`). EXP mỗi giờ tính bằng số trận thắng × EXP mỗi trận thắng, trừ số trận thua × 2 × cấp. Lượng EXP mất khi thua là ước lượng, vì bản ghi trận không có số này. Hai lần chạy lệch nhau khoảng 10% ở cùng một ô, nhưng thứ hạng các phương án giữ nguyên. [Mô phỏng]

Số là EXP mỗi giờ (nghìn). Ô có hai số là lần chạy 2 giờ / lần chạy 3 giờ với hạt khác; ô một số chỉ có lần chạy đầu. Trong ngoặc là số trận thua mỗi giờ, lấy từ lần chạy sau nếu có.

| manina (Hỏa, cấp 34, Tấn công 180, HP 316) | Cá Sấu 31 | Cóc Tía 35 | Huyết Lang 40 |
|---|---|---|---|
| Như hiện tại | 23,1 / 25,9 (42) | 19,8 / 21,7 (68) | 18,6 / 19,1 (44) |
| +20 Cường Lực (chỉ số chính) | 25,4 / 28,0 (45) | 22,8 / 25,2 (65) | 23,1 / 22,8 (42) |
| **+20 Nội Lực** | **28,7 / 31,0** (40) | **27,8 / 27,1** (66) | **24,9 / 26,6** (41) |
| +10 Nội Lực, +10 Thể Lực | – / 29,2 (35) | – / 27,5 (56) | – / 24,9 (34) |
| +20 Thể Lực | 27,3 / 28,9 (29) | 23,9 / 25,9 (50) | 23,0 / 24,6 (26) |
| +20 Thân Pháp | 25,3 (40) | 21,2 (66) | 22,4 (37) |

| Ttuananh (Thủy, cấp 34, Tấn công 160, HP 304) | Cá Sấu 31 | Cóc Tía 35 | Huyết Lang 40 |
|---|---|---|---|
| Như hiện tại | 35,9 / 36,0 (39) | 34,6 / 35,2 (61) | 37,1 / 38,3 (34) |
| +20 Nội Lực (chỉ số chính) | 38,2 / 39,4 (38) | 37,1 / 39,4 (60) | 39,8 / 43,4 (35) |
| **+10 Nội Lực, +10 Thể Lực** | **38,9 / 40,6** (29) | **38,7 / 38,6** (53) | **43,8 / 42,7** (28) |
| +20 Thể Lực | 38,1 / 40,1 (24) | 38,4 / 40,4 (41) | 42,9 / 43,1 (19) |
| +20 Thân Pháp | 37,6 (34) | 34,6 (59) | 39,6 (30) |

| wangpt (Lôi, cấp 39, Tấn công 126, HP 392) | Cá Sấu 31 | Thỏ Hồng 39 | Huyết Lang 40 | Heo Lửa 46 |
|---|---|---|---|---|
| Như hiện tại | 36,5 (16) | 33,4 (38) | 36,6 (13) | 26,2 (36) |
| **+20 Thân Pháp (chỉ số chính)** | **40,5** (14) | **38,7** (32) | **40,5** (12) | **34,3** (27) |
| +20 Nội Lực | 39,6 (17) | 38,9 (35) | 39,8 (15) | 33,8 (34) |
| +10 Thân Pháp, +10 Thể Lực | 39,8 (11) | 37,9 (30) | 40,0 (8) | 31,9 (28) |
| +20 Thể Lực | 38,1 (8) | 36,7 (28) | 38,0 (7) | 30,5 (25) |

**Kết luận.** [Mô phỏng]
- **manina: cộng Nội Lực, không cộng Cường Lực nữa.** 20 Nội Lực cho thêm 10–16% EXP mỗi giờ so với 20 Cường Lực, ở cả ba quái và cả hai lần chạy. Lý do:
  - Nội Lực của manina chỉ có 10, nên một hàng âm dương nạp 6 nội lực. Cộng 20 Nội Lực thì nạp khoảng 10.
  - Nhờ vậy số lần dùng Hỏa Cầu Thuật cấp 6 mỗi trận tăng từ 0,23 lên 0,56.
  - Trận thật cho thấy cùng hướng: lúc đồ còn cộng 10 Nội Lực (cấp 24–32), manina dùng kỹ năng 0,49 lần mỗi trận.

  Gợi ý trong game nói hệ Hỏa "Không cần tăng nội lực". Số đo âm dương của hệ Hỏa mới có ở Nội Lực 10 và 20, nên điều cần kiểm là manina ở Nội Lực 30 có nạp khoảng 10 mỗi hàng không.
- **Ttuananh: chia đôi Nội Lực và Thể Lực, hoặc dồn Thể Lực.** EXP mỗi giờ ngang với dồn hết Nội Lực, nhưng số trận thua giảm từ 38 xuống 24–29 mỗi giờ. Nguyên nhân là Thể Lực hệ Thủy cho 5 HP và hồi thêm máu ở mỗi viên tim.
- **wangpt: giữ Thân Pháp.** Thân Pháp của hệ Lôi vừa tăng Tấn công, vừa tăng P.Thủ, Chính xác và Né tránh. Nội Lực đứng thứ hai, sát nút.
- **Không đáng dùng Tẩy Tủy Đan để làm lại.** Chuyển 40 điểm chính sang Thể Lực bớt 30–60% số trận thua. Với manina, EXP mỗi giờ gần như giữ nguyên; với Ttuananh và wangpt, giảm 7–28%. Chuyển sang Thân Pháp làm cả ba mất EXP. Cộng đúng chỗ các điểm sắp có thì lợi hơn.
- Theo mô phỏng, quái nhiều EXP mỗi giờ nhất ở cấp hiện tại:
  - manina: Cá Sấu.
  - Ttuananh và wangpt: Huyết Lang, gần bằng Cá Sấu.
  - Cóc Tía và Thỏ Hồng thua nhiều mà không thêm EXP.
- **Cách áp dụng:** trong app, mở khung Chỉ số → nút bánh răng cạnh Tiềm năng → **Tự cộng** → **Tỉ lệ** ([Tự cộng điểm tiềm năng](../../integration/rust/features.md#tự-cộng-điểm-tiềm-năng)).
  - manina: Nội Lực 1, các ô khác 0. Thử trước vài cấp rồi đo âm dương.
  - Ttuananh: Nội Lực 1, Thể Lực 1.
  - wangpt: giữ **Theo hệ**.

  Chưa đổi gì trên nick nào.

<a id="ghi-trận"></a>

### Ghi trận để học thuật toán (31/10)

Mỗi trận bot đánh được ghi thành một file, để sau này hiệu chỉnh mô phỏng, dò tham số và dạy mô hình chọn nước. Hai thứ phải có: **thông tin trước trận** của cả hai bên và của bot, và **mọi gói tin của trận**. Thiếu chúng thì chỉ đếm được thắng thua. Code: [src/bot/battle-record.ts](../../../src/bot/battle-record.ts) (ghi), [src/battle/battle-data.ts](../../../src/battle/battle-data.ts) (đọc lại, phát lại). Test: [test/battle-record.test.ts](../../../test/battle-record.test.ts).

- **Bot TS** (`npm run quest`) ghi mặc định vào `captures/battles/<ngày>/<giờ phút giây>-<nhân vật>-<quái>.jsonl.gz`, ví dụ `2026-10-31/161203-manina-ke-quay-pha.jsonl.gz`. `captures/` không lên git. `--record=<thư mục>` ghi chỗ khác, `--no-record` không ghi ([quest-bot](../../integration/nodejs/quest-bot.md#chạy)).
- **App Rust** ghi cùng các dòng này vào bảng `battle_data` của `cllt.db`, mỗi trận một dòng, khi ô **Lưu dữ liệu trận** đang bật (mặc định bật). Ô này nằm trong hộp Cài đặt của app, mở từ nút bánh răng cạnh chữ COLAUTOOL, và áp dụng cho mọi nick. Nút **Xuất dữ liệu trận** cũng nằm ở đó: nó chép cả bảng ra file `cllt-battles-<ngày>-<giờ>.db` trong Downloads, rồi đọc bằng `npm run battles -- --db=<file>` ([Cài đặt của app](../../integration/rust/features.md#cài-đặt-của-app)). `cllt fight`, `cllt quest` ghi file vào `captures/battles/` như bot TS ([features](../../integration/rust/features.md#nhật-ký-và-thống-kê)). Dòng đầu của app có `bot: "app"`, `version` và `play.algorithm` (`v3`, hay `v1` khi chạy `cllt --algo=v1`); với v3 thêm `memory`, và dòng `turn` có ba hành động điểm cao nhất như bot TS. Với v1 dòng `turn` chỉ có điểm nước đổi viên.
- **Đọc lại:** `npm run battles` đọc `captures/battles` (cả file trận lẫn trace `CLLT_TRACE` cũ) và bảng `battle_data` của `app/cllt.db` nếu có. Lệnh in bảng theo quái và theo nguồn: số trận, thắng, thua, số nước, số trận phát lại bị lệch. `--export=<file>` ghi mỗi trận một dòng JSON (dòng đầu, kết quả, ghi chú, từng nước đã phát lại) để học.

**Định dạng (bản 1).** File là gzip của các dòng JSON, theo thứ tự:

1. **Dòng đầu** `{ "kind": "header", "format": 1, "at": "<ISO>", … }`, ghi lúc nhận `s2c/22`:

   | Trường | Nghĩa | Lấy từ |
   |---|---|---|
   | `bot`, `commit`, `goal` | `ts`, commit của repo, `--goal` | `quest-run.ts` |
   | `character`, `level`, `hp`, `maxHp` | Nhân vật lúc vào trận | `s2c/22`, `s2c/9` |
   | `element`, `elementName` | Hệ nhân vật: 1 Hỏa, 2 Lôi, 4 Thủy | `field01` của `s2c/9` |
   | `combat` | Tấn công, phòng thủ, chính xác, né tránh, chí mạng | `s2c/9`, `extra[1..5]` của `s2c/10` kiểu 4 |
   | `potentials` | 10 số chỉ số tiềm năng, thứ tự của `s2c/9` | `s2c/9`, `s2c/10` kiểu 2 |
   | `skills` | `[mã, cấp]` các kỹ năng đã học | đuôi `s2c/9`, `s2c/10` kiểu 32 |
   | `gear` | Mỗi ô: `slot`, `itemId`, `plus` (cường hoá +0…+16, `field0` của bản ghi), `element`, `durability` (theo `s2c/36` của trận trước), `stats` | `s2c/9`, `s2c/36` |
   | `potions` | Bình trong túi: ô, mã, số lượng | `s2c/42`, `s2c/1187` |
   | `mob` | `id`, `name`, `level`, `element`, `elementName`, `hp`, `maxHp`, `boss` | khối quái của `s2c/22` |
   | `map`, `zone` | Chỗ đánh | `s2c/29`, `s2c/11` |
   | `play` | `strategy` (các trọng số của `--goal`), `skills` (kỹ năng bot được dùng), `skill`, `potionCost`; app thêm `potions` (bình trận được uống, kèm `costShare`) | tham số dòng lệnh, Cài đặt đánh của app |
   | `memory` | Thông số bot đã học từ các trận trước trong phiên: `[tổng, số lần]` theo `tên quái.sword`, `me>tên quái.sword`… | `BattleIo.memory` |
   | `before` | Bối cảnh trước trận: `session` (trận thứ mấy của phiên, từ 1), `restMs` (ms từ lúc trận trước kết thúc tới `s2c/22` này, tức bot đã nghỉ bao lâu), `last` (`won`, `hp`, `maxHp`, `mob` của trận trước). Trận đầu phiên có `restMs` và `last` là `null`. Dùng để học khi nào nên nghỉ hay hồi máu trước trận: máu lúc vào trận ảnh hưởng mạnh tới thắng thua (dưới 30% máu chỉ thắng 41% so với khoảng 80%, 567 trận v3 ngày 31/10–01/11) | bot, lúc trận trước kết thúc |

2. **Gói tin** `[ms, "s2c/19", "hex"]`: ms tính từ `s2c/22`, hex đủ cả gói. Chỉ có các gói của trận: `s2c/22`, `c2s/18`, `s2c/18`, `c2s/14`, `s2c/24`, `c2s/19`, `s2c/19`, `s2c/20`, `s2c/21`, `c2s/20`, `c2s/44`, `s2c/44`, `c2s/11`, `c2s/40`, `s2c/10`, `s2c/1201`, `s2c/36`, `s2c/1214`. Không có gói đăng nhập (`c2s/4`), chat, hay người chơi khác.
3. **Ghi chú của bot** `{ "ms": …, "note": … }`, xen giữa các gói:
   - `turn` mỗi lượt của mình: `pick` (`swap`, `skill 1000`, `item 0`), `scores` (3 hành động điểm cao nhất kèm điểm); với v3 thêm những gì bot đang tin lúc chọn: `hp`, `stat1` (nội lực), `stat2` (sức mạnh) của mình, `mobHp`, `mobStat1`, `mobStat2` của quái. Nội lực và sức mạnh cho biết giá trị của âm dương và đào theo hệ, kỹ năng và chỉ số của nhân vật;
   - `skill_try`, `item_try`, `action_no_answer`, `skill_cast`, `item_used`, `board_desync`, `board_reshuffled`, `turn_inferred`, `timed_attack`, `no_legal_move`;
   - `estimates` lúc hết trận: các thông số bot học được.
4. **Kết quả** `{ "kind": "end", … }`: `won`, `exp`, `coin`, `myTurns`, `hp`, `damage`, `ms`, `skillsCast`; hoặc `cancelled`, `left` (đầu hàng), `stopped` (bot dừng giữa trận). Sau dòng này còn `s2c/10`, `s2c/36` và `s2c/1214`, vì chúng đến trong khoảng 1 ms sau gói kết thúc trận. File được ghi khi có `s2c/1214`, chậm nhất 500 ms sau dòng kết quả.

**Kích thước.** Với 20 trận của H1, phần gói của trận là 33,5 KB mỗi trận trước khi nén, 4,4 KB sau khi nén. 100 000 trận khoảng 440 MB. [Đo]

**Trace cũ.** 20 trace `CLLT_TRACE` còn lại của các lần chạy 30–31/10 (trong đó Q3–Q20 và H1) được chép (gzip) vào `captures/battles/traces/`. `npm run battles` đọc ra 134 trận. 119 trận phát lại khớp server ở cả 4921 nước, không trận nào lệch. 15 trận của Q3, Q4 và hai lần chạy đầu không phát lại được, vì trace lúc đó chỉ giữ 128 byte hex đầu của mỗi gói. Dòng đầu của trận trong trace cũ chỉ có nhân vật (từ `s2c/9` gần nhất) và quái (`legacy: true`). [Đo]

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
- Phần não (TypeScript, dùng `src/protocol/protocol.ts` `Reader` và `src/battle/battle.ts`) nhận gói qua relay Python `frida` (bộ binding đi kèm Frida 17.10 trên máy Mac), rồi trả lệnh dạng `{fn: 'a74', args: [...]}`.

### B. Client Node.js không giao diện, đã chạy

[src/battle/battle-runner.ts](../../../src/battle/battle-runner.ts) gửi các gói dưới (dựng bằng `buildRequest` của [src/protocol/events.ts](../../../src/protocol/events.ts)) sau khi `runClient` vào thế giới; [src/bot/quest.ts](../../../src/bot/quest.ts) chọn quái và thách đấu. Cần `CLLT_USERNAME`/`CLLT_PASSWORD`, và tài khoản không được online ở máy khác (server từ chối bằng `s2c/0`). Bot đã thắng 10/10 trận Heo Mọi, xem [10-quests](10-quests.md#kết-quả-q2); cách chạy ở [bot làm nhiệm vụ](../../integration/nodejs/quest-bot.md).

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
  22  00 00 01 00000003 00000000 00 00000082 00000082           2 byte; hệ 1 (Hỏa); cấp 3; i32 0; u8 0; HP 130/130
  42  00000000 00000064 00000000 00000064                       nội lực 0/100, sức mạnh 0/100  [Suy luận]
  58  00000004 "1097" 00000003 "125"                            [Chưa rõ]
  73  00000009 000003e8 ffffffff × 8                           9 ô kỹ năng: 1000, còn lại -1 (chưa học)  [Đo]
 113  00016120, …, uuid người chơi "d3d51a41-…", bảng màu ARGB (ff525252 ffbfbfbf …)   [Chưa rõ]
 369  00000005 "mob10" 0000000a "Gà Điên"                       khối quái
 392  01 00 04 00000001 000186a0 00 00000032 00000032           2 byte; hệ 4 (Thủy); cấp 1; tấm ảnh 100000; u8 0; HP 50/50
 412  00000000 00000064 00000000 00000064                       0, 100, 0, 100
 428  00000009 "Chưa có" 00000009 "Chưa có"
 454  00000009 00000fa0 … 00000fa8                              9 kỹ năng 4000…4008  [Đo]
 494  24 byte 0, ffffffff, 9 byte 0                            [Chưa rõ]
 531  00000024 "c451ecac-ea99-42b8-a22a-c5c72e898659"           uuid trận
 571  00000040 + 64 byte bàn (575–638)                          xem dưới
 639  1e 00                                                     30 giây/lượt
```

Byte thứ ba của khối người chơi và của khối quái là **hệ** (1 Hỏa, 2 Lôi, 4 Thủy, như hệ của vật phẩm). manina luôn có 1. Trong các trace: Kẻ Quấy Phá 1 (nó dùng Hỏa Cầu Thuật), Sơn Tặc 1, Kẻ Gây Rối 1, Sói Xám 2, Chỉ Huy Sơn Tặc 2, Cóc Xanh 4, Gà Điên 4 (khối của nó liệt kê các kỹ năng Thủy 4000–4008). `mobBlock` đọc byte này. [Suy luận từ 7 loại quái]

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
| còn lại | 10000, 22, 9, 30, 20, 6 | giống | 10000 chưa rõ. 5 số sau là chỉ số chiến đấu (tấn công, phòng thủ, …), cũng có trong đuôi `s2c/9` ([user-data](../user-data.md#đuôi-s2c9)) |

## Các gói mới thấy trong bot

| Gói | Payload | Ý nghĩa |
|---|---|---|
| s2c/34 | `i32 0; string "subtask 1"; i32 3; string thông báo` | Tiến độ nhiệm vụ. Client hiện hộp thoại "Tiếp theo hãy tới gặp Hương Lão Trần Bá" [Đo] |
| s2c/1212 | 13 byte `000001cc 02 01 01 00002455 01 00` | Đến ngay sau nước đầu của trận [Chưa rõ] |
| s2c/1200 | rỗng | Ngay sau s2c/19 `end=1` [Chưa rõ] |
| s2c/36 | `00000008 00000000 2f ffffffffffffff` | Sau c2s/40 (đầu hàng). Độ bền trang bị: B1 là `31`, trận huỷ cũng làm mòn 2 [Suy luận] |

## Chưa biết

- Giá nội lực của kỹ năng ngoài kỹ năng gốc: Hàn Lưu Thánh Thủy tốn đúng 50 như bảng `s2c/30` (A1). Các kỹ năng 75–100 chưa ai dùng.
- Hiệu ứng thật của các kỹ năng chưa thấy trong trận: buff tấn công, phòng thủ, né tránh; hút máu; giảm phòng thủ; "triệt tiêu năng lượng". Bot đang tính theo các giả định ở [Chọn hành động](#chọn-hành-động). Hỏa Kiếm Thuật đã thấy 5 lần (symap 02/11): các ô được chọn thành Kiếm lửa, hàng chúng làm thành rơi ngay. Server chọn những ô nào thì chưa biết.
- Sát thương của kỹ năng không phá ô (Liệt Hỏa Chi Kiếm, Băng Đao Kích…): có phần `W × 3` như kỹ năng gốc không.
- `W` của Cóc Xanh khi đánh Tiheo2 (P.Thủ 16); mô phỏng đang lấy 10.
- Mã viên đặc biệt khác `10`.
- `W` đổi theo Tấn công / Phòng thủ / cấp thế nào; `K` của kỹ năng cấp 2, 3 ([Công thức sát thương](#công-thức-sát-thương)).
- Quái có biến mất hoặc hồi sinh phía server sau khi bị giết không.
- Có giới hạn tần suất thách đấu không.
