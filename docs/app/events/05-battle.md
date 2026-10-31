# Đánh quái: chạm bot → trận cờ 8×8

Mốc: APK 1.0.3. Nguồn là phiên Frida **B1** (29/10/2026, máy M2101K7BG, Android 13), hook writer `com.mh.sqje.a(sqi)` và reader `com.mh.sqnw.e()` nên payload dưới đây là **byte trước XOR**, chưa gồm header. Trong B1 nhân vật `manina` (cấp 3) chạm hai bot: Gà Điên `mob13` (trận bị huỷ sau nước đầu) và Chỉ Huy Sơn Tặc `mob872604` (đánh nhiều lượt).

Trận Chỉ Huy Sơn Tặc kết thúc khi manina hết HP (bot thắng), sau 28 bước. Mọi bố cục trong file này đã được kiểm bằng cách giải **111 gói trận** của B1 với `Reader` của [src/protocol/protocol.ts](../../../src/protocol/protocol.ts): mỗi gói đọc hết đúng từng byte, không thừa, không thiếu. Nhãn: **[Đo]** thấy trực tiếp trong byte/màn hình; **[Suy luận]** khớp dữ liệu nhưng chưa có bằng chứng thứ hai; **[Chưa rõ]** giữ nguyên tên trung tính.

## Luồng

```text
Bản đồ   C→S 1169 vị trí nhân vật (~100–130 ms/gói khi chạy)
         nhân vật va vào quái  →  C→S 15  (mobId)                 thách đấu bot
                                  S→C 22  (2 bên, uuid trận, bàn 8×8, thời gian lượt)
                                  C→S 18  (uuid)   S→C 18 (ack)
Trận     lặp:
           S→C 24 playerTurn=1 → người chơi có 30 s
               đổi 2 viên       → C→S 19 (uuid, seq, ô1, ô2) → S→C 19 kết quả nước của mình
               hết giờ          → S→C 24 playerTurn=0
           S→C 24 playerTurn=0 → C→S 14 (uuid, seq)           → S→C 19 nước của bot
                                                                hoặc S→C 20 bot dùng kỹ năng
Hết trận S→C 19 có end=1 + khối kết quả → S→C 10, 36, 1214 → C→S 11/43 tải lại bản đồ
Huỷ trận C→S 40 (uuid) + C→S 11/43; S→C 10
```

- **Vào trận bằng cách đi đè lên quái.** Gói 15 đi ngay khi nhân vật va vào quái, không cần bấm gì. Trong B1, chạm màn hình vào một con quái và bấm nút kiếm khi không có quái kề bên đều không sinh gói. Chưa thử bấm nút kiếm khi đang đứng sát quái. [Đo]
- **Server không kiểm khoảng cách.** Gửi 15 cho một con ở xa, server vẫn mở trận. Bot đã đánh cả trận chỉ bằng gói tin, client không vào màn đánh. Xem [07-auto-battle](07-auto-battle.md). [Đo]
- **Server quyết định mọi thứ.** Client không gửi bàn cờ hay sát thương. Client chỉ gửi cặp ô đổi chỗ (19), hoặc xin nước của bot (14). Server trả viên rơi xuống, sát thương, HP mới. [Đo]
- **AI bot chạy ở server.** Nước của bot chỉ tới khi client gửi 14. Mỗi lần người chơi hết giờ, bot được đi tiếp. [Đo]
- **Mỗi bước có `seq` tăng dần.** 14 và 19 gửi lại `seq` của S→C 19/24 gần nhất. Server trả kết quả với `seq+1`. [Đo]

## Bàn chơi

- Lưới **8×8**. Trong s2c/22 là `i32 64` theo sau bởi 64 byte, **theo hàng** (row-major), hàng 0 ở trên. Hai hàng dưới (chưa bị nước nào chạm) khớp ảnh chụp từng ô. [Đo]
- Toạ độ trong gói 19/20 là **(hàng + 2, cột + 2)**. Ví dụ nước kéo viên tim từ hàng 5 cột 6 lên hàng 4 cột 6 trên màn hình được gửi là `(7,8) → (6,8)`. Bàn trong bộ nhớ có viền 2 ô. [Đo cho phép cộng; lý do viền là Suy luận]
- Mỗi kết quả nước đi có một số 32 bit (trước đây gọi là `seed`) và danh sách viên mới rơi xuống. Client tự mô phỏng rơi rồi lấp bằng danh sách này. [Đo]
- **Số 32 bit đó là CRC32 của 64 byte bàn cờ sau nước đi** (sau khi rơi, lấp và xếp lại nếu có), theo thứ tự hàng như `s2c/22`. Khớp 844/844 kết quả: 136 nước của manina trong 6 trận Sơn Tặc tính giờ (G2), 708 nước của cả manina lẫn quái (đổi chỗ và kỹ năng) trong 20 trận Kẻ Quấy Phá (H1). Đây là checksum để client đối chiếu bàn với server (chuỗi `SQControllerManager.checkSumToSyncDataWithServer()` trong `.so`), không phải mầm sinh số ngẫu nhiên. [Đo]
  - Viên rơi không suy ra được từ số này: đã thử `java.util.Random`, 3 kiểu LCG, xorshift32 và MT19937 với số của chính nước đó, nước trước và nước sau, lệch 0–3 lần rút. Không kiểu nào hơn mức ngẫu nhiên. Số của nước sau cũng không tính được từ nước trước. Danh sách viên rơi dài đúng bằng số ô cần lấp, nên không lộ viên của lượt sau. Vậy bot không thể biết trước viên sắp rơi. [Đo]
  - Dùng được để phát hiện lệch bàn: sau mỗi nước, CRC32 bàn của bot phải bằng số này. Script ở scratchpad `seed/` (`extract.ts`, `prng.ts`, `purity.ts`, `chain.ts`). [Đo]
- Luật rơi/lấp đã kiểm 52/52 bước [Đo]:
  - Đoạn ≥3 cùng loại bị xoá (nén vàng cũng vậy). Viên rơi xuống đáy cột.
  - Lấp **từng cột trái → phải, trong cột từ dưới lên**. Chuỗi ăn lặp lại với cùng danh sách.
  - Có đoạn ≥4 ở bất kỳ đợt nào thì được thêm lượt.
  - Mã `10` là kiếm đặc biệt, khi bị ăn thì phá thêm 3×3.
  - Chi tiết và ví dụ ở [07-auto-battle](07-auto-battle.md#luật-bàn-cờ). Mô hình chạy được: [src/battle/battle.ts](../../../src/battle/battle.ts).
- Thời gian lượt là 30 s, khớp byte `0x1e` cuối s2c/22 và đồng hồ dưới bàn. [Đo]

| Mã | Viên (tên trong Cẩm nang) | Đo được (B1, run3, run4, Q2, Q5, Q6) | Cẩm nang trong game |
|---:|---|---|---|
| `00` | Thanh kiếm | Sát thương cho đối thủ. Chỉ Huy Sơn Tặc ăn 3 kiếm: 14. manina ăn 3 kiếm: 31 (cấp 3), 35 (cấp 4). Gà Điên: 0/4/8. Heo Mọi: 9 [Đo] | Tấn công đối phương |
| `01` | Trái tim | Hồi máu: ăn 4 tim → HP 73 → 80 [Đo] | Hồi sinh lực |
| `02` | Xoáy âm dương | Tăng `s1`: +6 mỗi 3 viên (manina, Gà Điên), +8 (Chỉ Huy). Kỹ năng trừ `s1` [Đo] | Hồi nội lực để dùng tuyệt chiêu, tức `s1` là nội lực |
| `03` | Trái đào | Tăng `s2` (sức mạnh): +15 mỗi 3 viên (manina), +13/+22 cho 3/4 viên (Chỉ Huy). Đầy 100 thì đòn kiếm kế tiếp gấp đôi [Đo Q6] | Hồi sức mạnh, nhân đôi lực tấn công cho một lượt |
| `04` | Giọt nước | Không đổi `units`; +2 EXP cuối trận mỗi viên [Đo Q6] | Tăng kinh nghiệm, bằng 1/2 ngôi sao |
| `05` | Ngôi sao | Không đổi `units`; +4 EXP cuối trận mỗi viên [Đo Q6] | Tăng kinh nghiệm |
| `0x46` (70) | Thỏi vàng | Ăn được như viên thường; không đổi `units`; +2 Xu khoá cuối trận mỗi viên [Đo Q6] | Đổi Xu khoá; đủ 10.000 vàng thì tự đổi thành 10.000 Xu khoá |
| `0x0a` (10) | Kiếm lửa | Như kiếm, khi bị ăn thì phá thêm 3×3 quanh nó [Đo, 2 lần] | Mạnh hơn kiếm thường; nổ 8 ô quanh nó; nổ dây chuyền qua Kiếm lửa khác; viên bị nổ vẫn tính cho người ăn; đôi khi kiếm mới rơi xuống là Kiếm lửa, vài kỹ năng cũng tạo ra |

Thêm lượt [Đo + Cẩm nang]:
- Ăn ≥4 viên thẳng hàng, ở bất kỳ đợt nào của chuỗi. [Đo]
- Hai hàng 3 viên cùng loại cắt nhau (hình L/T). Theo Cẩm nang; chưa gặp trong capture. [src/battle/battle.ts](../../../src/battle/battle.ts) đã tính luật này.

Bàn bị **xếp lại** khi hết nước đi: bàn mới 64 ô đi kèm `s2c/19` (xem bố cục dưới). Thấy 3 lần trong Q1/Q2 của [10-quests](10-quests.md#hai-điều-q1-phát-hiện). [Đo]

Tên mã 3 và 4 đã đổi lại sau Q6, công thức EXP/xu ở [07-auto-battle](07-auto-battle.md#tác-dụng-của-các-viên).

Asset liên quan (đều mã hoá, chưa giải): `chess0b.dat`…`chess8b.dat`, `chesscrystal.dat`, `play/bkboardh|v|hv.dat`, `focusmovechess1|2.dat`, `x1/play/hub-game-hp|mana|power|time.dat`, `strwin.dat`, `strlose.dat`, âm thanh `vs.wav`, `battle.mp3`, `attack.wav`.

## Code native liên quan

Không decompile được (chưa có Ghidra/JADX MCP), nên đây là vị trí tìm bằng string và hằng số trong `lib/arm64-v8a/libgdx-flashds.so`. [Suy luận tĩnh]

| Class | Căn cứ | Vai trò |
|---|---|---|
| `com.mh.sqlq` | Hằng opcode chỉ xuất hiện một lần trong hàm: `h73`=14, `a67`=15, `y104`=18, `a74`=19, `a115`/`B116`=1169, `G133`=1206 | Các hàm dựng/gửi gói |
| `com.mh.sqlm` | `SQControlManager.processSwapChess()`, `checkSumToSyncDataWithServer()`, `Đang đánh quái, đợi tí!`, `Trận đấu bị huỷ.`, `--- process attack reverse:` | Điều khiển trận |
| `com.mh.sqkq` | `[playingcontroller ] actionOpponentSwapChess`, `Đang đợi đối thủ!` | Màn chơi bàn cờ |
| `com.mh.sqjm` | `[NodeChess]…` | Một viên trên bàn |
| `com.mh.sqhz` | `fightingMonster`, `[Map] Loi update monster`, `fightering monster err` | Bản đồ và quái |

String trong `.so` không bị mã hoá. Native-obfuscator gom chúng vào `string_pool` (`0x2e415d0`), và mỗi class tạo jstring trong `register_methods`. Cách tìm xem ở [investigation.md](../investigation.md).

---

<a id="c2s-1169"></a>

## c2s/1169

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Client → Server |
| Nhãn phân tích | player_move |
| Xuất hiện khi | Nhân vật đang chạy/nhảy/rơi; ~100–130 ms một gói; đứng yên thì không gửi |
| Bố cục payload | `i32 x; i32 y; i32 state; u8 f0; u8 f1; u8 f2; u8 f3; u8 f4` (17 byte). x/y theo đơn vị server (ô 32); client vẽ = ×1,5 ([06](06-map-mobs.md#toạ-độ-và-di-chuyển)) |
| Độ chắc chắn | x/y và tần suất [Đo]: id 155 trong s2c/1262 trùng đúng x/y này. `state` 0 đứng, 1 chạy, 5 lên, 6 rơi, 7 chạm đất; byte 3 (f2) = hướng trái, byte 4 (f3) = hướng phải [Đo bằng joystick, xem [09-players-chat](09-players-chat.md#own-move)]. f0, f1, f4 [Chưa rõ] |

```text
000000ec 000000ff 00000005 01 00 00 01 00     x=236, y=255, state=5
000006c7 000002a0 00000001 00 00 01 00 00     x=1735, y=672, state=1 (ngay trước khi chạm Chỉ Huy Sơn Tặc)
```

<a id="s2c-43-mobs"></a>

## s2c/43: danh sách quái của bản đồ

Bố cục đầy đủ đã đo, bổ sung cho [s2c/43](03-world.md#s2c-43). Payload 1398 byte của M1 được đọc hết:

```text
string mapId; u8 field (3)
lặp tới hết payload: string mobId; string tên; i32 cấp; u8 a; i32 b; i32 c; u8 d
```

| mobId | Tên | Cấp | a | b | c | d |
|---|---|---:|---:|---:|---:|---:|
| `mob10`…`mob17` | Gà Điên | 1 | 4 | 1 | 1 | 0 |
| `mob2800`…`mob2805` | Heo Mọi | 7 | 2 | 3 | 1 | 0 |
| `mob31400`…`mob31405` | Kẻ Gây Rối | 7 | 0 | 4 | 1 | 0 |
| `mob42000`…`mob42005` | Sơn Tặc | 9 | 0 | 11 | 1 | 0 |
| `mob872600`…`mob872606` | Chỉ Huy Sơn Tặc | 10 | 2 | 6 | 1 | 2 |

Gói không có toạ độ quái. Vị trí do client tự đặt và tự di chuyển: B2 đọc được toạ độ trong bộ nhớ, còn server không gửi gói vị trí quái nào. Danh sách, toạ độ và cách đọc xem [06-map-mobs](06-map-mobs.md). [Đo] Boss Thủ Lĩnh Sơn Tặc (`mob86100001`) đến riêng qua s2c/1177. `mobId` là chuỗi client gửi trong c2s/15.

<a id="c2s-15"></a>

## c2s/15

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Client → Server |
| Nhãn phân tích | challenge_mob |
| Xuất hiện khi | Nhân vật va vào một con quái trên bản đồ; c2s/1169 cuối cùng ở ngay trước, cách ~0,1 s |
| Sau đó | s2c/22 sau ~2,5 s (trong lúc màn VS hiện) |
| Bố cục payload | `string mobId; u8 flag` (flag = 0 cả hai lần) |
| Độ chắc chắn | [Đo] hai lần: `mob13`, `mob872604` |

```text
00000009 6d6f62383732363034 00          "mob872604", 0
```

<a id="c2s-1178"></a>

## c2s/1178: thách đấu boss

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Client → Server |
| Nhãn phân tích | challenge_boss |
| Xuất hiện khi | Nhân vật va vào boss của map (`s2c/1177`). Code: `sqhz.a18(boss, false)` → `sqhz.a17` → `sqlq.b121(mobId, false)` |
| Sau đó | `s2c/22` sau ~2,8 s, rồi trận như quái thường: `c2s/18` → `s2c/18` → `c2s/14` … |
| Bố cục payload | `string mobId; i32 flag` (flag = 0), 19 byte với `mob86100201` |
| Độ chắc chắn | [Đo] B4, 1 lần, Thủ Lĩnh Sơn Tặc khu 2. Boss **bỏ qua** `c2s/15` (Q10, Q13, cả khi đứng sát boss) |

```text
0000000b 6d6f6238363130303230 31  00000000       "mob86100201", 0
```

Đây là lý do bot cũ kẹt ở bước boss: nó gửi `c2s/15` như với quái thường. Quái thường dùng `sqlq.a67(mobId, bool)` → `c2s/15`; boss dùng hàm dựng riêng `b121(mobId, bool)` → `c2s/1178`. ([10-quests](10-quests.md#boss))

<a id="s2c-22"></a>

## s2c/22

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | battle_setup |
| Xuất hiện khi | Trả c2s/15 |
| Sau đó | c2s/18 với uuid trận |
| Bố cục payload | khối người chơi; khối bot; `string battleUuid; i32 64; u8[64] bàn; u8 turnSeconds; u8` |
| Độ dài mẫu | 640 byte (Gà Điên), 654 byte (Chỉ Huy Sơn Tặc) |
| Độ chắc chắn | Đuôi (uuid, bàn, 30 s) [Đo]. Hai khối nhân vật mới đọc được các trường dưới [Đo giá trị, Suy luận tên] |

Phần đầu, khối người chơi:

```text
00 00  00000006 6d616e696e61  00000006 6d616e696e61            2 byte; tên; tên hiển thị
00 00 01  00000003  00000000 00  00000082 00000082            3 byte; cấp 3; i32 0; u8 0; HP 130/130
00000000 00000064 00000000 00000064  "971" "125" ...
```

Trong đó: tên `manina` lặp hai lần, cấp `3`, HP `130/130` (`0x82`), hai cặp `0, 100` [Chưa rõ, có thể là nội lực/nộ], chuỗi `"971"`, `"125"` [Chưa rõ] và một uuid riêng của người chơi. Khối quái dùng cùng cấu trúc `u8 u8 u8; i32 cấp; i32; u8; i32 hp; i32 hpMax`, với i32 thứ hai là `100000`. Bản đồ offset đầy đủ của một gói thật ở [07-auto-battle](07-auto-battle.md#s2c22-641-byte). [Đo]

Khối bot của trận Chỉ Huy Sơn Tặc: `"mob872604"`, `"Chỉ Huy Sơn Tặc"`, cấp `10`, HP `202/202` (`0xca`), `100/100`, hai chuỗi `"Chưa có"`, rồi 9 số `2000…2008` (`0x7d0…0x7d8`). Mã kỹ năng 2000 trùng với kỹ năng bot dùng ở s2c/20, nên 9 số này là danh sách kỹ năng.

<a id="kỹ-năng-trong-trận"></a>

**Kỹ năng của hai bên trong `s2c/22`.** Mỗi khối (người chơi, rồi quái) có `i32 9; 9 × i32 mãKỹNăng` ngay sau hai chuỗi. Đọc 88 gói `s2c/22` đủ byte trong trace bot Q4–Q20 (30–31/10), cộng gói Gà Điên ở [07](07-auto-battle.md#s2c22-641-byte) [Đo]:

| Bên | 9 ô | Ghi chú |
|---|---|---|
| manina (88 trận, cấp 4–20) | `1000, -1, -1, -1, -1, -1, -1, -1, -1` | Chỉ học Hỏa Cầu Thuật; `-1` là ô chưa học |
| Kẻ Gây Rối (cấp 7), Sơn Tặc (cấp 9) | `1000…1008` | Cả cây Hỏa |
| Sói Xám (cấp 11), Chỉ Huy Sơn Tặc (cấp 10) | `2000…2008` | Cả cây **Lôi** |
| Cóc Xanh (cấp 13), Gà Điên (cấp 1) | `4000…4008` | Cả cây Thủy |

- Vậy app biết được lúc vào trận nhân vật dùng được kỹ năng nào, và quái thuộc hệ gì. [Đo]
- Có đủ 9 ô, nhưng vì manina mới học 1 kỹ năng, chưa biết ô `i` có luôn ứng với kỹ năng `1000 × hệ + i` hay các kỹ năng đã học xếp dồn lên đầu. [Chưa rõ]
- Bốn số `0, 100, 0, 100` trước hai chuỗi có lẽ là nội lực 0/100 và sức mạnh 0/100 lúc vào trận. 100 nội lực bằng 4 thành. [Suy luận]
- Quái chỉ dùng kỹ năng gốc của cây nó. Trong trace bot: 2000 26 lần (Sói Xám, Chỉ Huy Sơn Tặc), 4000 27 lần (Cóc Xanh), 1000 5 lần (Kẻ Gây Rối); Heo Mọi cũng dùng 2000 ở Q2. Chưa thấy quái dùng kỹ năng nào khác. [Đo]

Phần đuôi:

```text
00000024 34363232333361632d373663662d343434342d393030322d643535626465306438313934   battleUuid
00000040                                                                               64 ô
01020103 01460302  00040305 00004601  03020103 05040300  02010003 00020403
05000304 01030304  01044605 02030403  05020201 00000304  00010046 05020302
1e 00                                                                                  30 giây/lượt
```

<a id="c2s-18"></a>

## c2s/18 · s2c/18

| Thuộc tính | Điều tra được |
|---|---|
| Nhãn phân tích | battle_join / battle_join_ack |
| C→S | `string battleUuid` (40 byte), gửi ~1,1 s sau s2c/22 |
| S→C | 6 byte `i32 0; u8 timed; u8 0`. `timed = 0` ở mọi trận Gà Điên, Heo Mọi, Kẻ Gây Rối, Chỉ Huy Sơn Tặc: trận theo lượt, quái đi trước. `timed = 1` ở mọi trận Sơn Tặc (Q6–Q9): **trận tính giờ**, xem [dưới](#trận-tính-giờ) [Đo] |
| Sau đó | ~1 s sau, c2s/14 với `seq=0` để lấy bước đầu của quái; trận tính giờ thì c2s/19 với `seq=0` |

<a id="s2c-24"></a>

## s2c/24

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | turn_state |
| Bố cục payload | `i32 seq; i32 zero; u8 playerTurn; u8 b` (10 byte) |
| Độ chắc chắn | [Đo] qua 21 bước |

- `playerTurn=1`: tới lượt người chơi. Đồng hồ 30 s chạy, nút Kỹ năng/Túi đồ sáng.
- `playerTurn=0`: tới lượt bot. Client gửi c2s/14 trong vòng ~30 ms. Gói này cũng đến khi người chơi **hết giờ**: lúc đó cách gói `playerTurn=1` trước khoảng 34 s, cùng `seq`.

```text
00000004 00000000 01 00     seq 4, tới lượt người chơi
00000004 00000000 00 00     seq 4, hết giờ → lượt bot
```

<a id="c2s-14"></a>

## c2s/14

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Client → Server |
| Nhãn phân tích | battle_step_request |
| Xuất hiện khi | Sau s2c/18 (`seq=0`); sau mỗi s2c/24 `playerTurn=0` |
| Sau đó | s2c/19 hoặc s2c/20 với `seq+1`, chứa nước của bot |
| Bố cục payload | `string battleUuid; i32 seq` (44 byte) |
| Độ chắc chắn | [Đo] 21 lần, không lần nào lệch `seq` |

<a id="c2s-19"></a>

## c2s/19

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Client → Server |
| Nhãn phân tích | swap_pieces |
| Xuất hiện khi | Người chơi kéo một viên sang ô kề, trong lượt của mình |
| Sau đó | s2c/19 với `seq+1`, `from/to` lặp lại đúng nước vừa gửi |
| Bố cục payload | `string battleUuid; i32 seq; i32 row1+2; i32 col1+2; i32 row2+2; i32 col2+2` (60 byte) |
| Hàm dựng gói | `com.mh.sqlq.a74(r1+2, c1+2, r2+2, c2+2, seq)`. `seq` truyền cuối nhưng ghi đầu trên dây [Đo, run2/run4] |
| Nước sai | Server không trả lời; lượt hết sau 34 s như khi không đi [Đo, run2] |
| Độ chắc chắn | [Đo] khớp hai nước kéo tay và 5 nước của bot (run4). Lần vuốt rơi vào lượt bot không sinh gói. Một lần client tự gửi 19 khi người chơi không chạm, ~19 s sau khi tới lượt; cơ chế tự đánh này [Chưa rõ] |

```text
00000024 <36 byte uuid>  0000000d  00000007 00000008  00000006 00000008
                         seq 13    hàng5+2  cột6+2    hàng4+2  cột6+2
```

<a id="s2c-19"></a>

## s2c/19

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | move_result |
| Xuất hiện khi | Trả c2s/19 (nước của mình) hoặc c2s/14 (nước của bot) |
| Sau đó | s2c/24 sau ~1 s (thời gian chạy hiệu ứng) |
| Độ chắc chắn | Bố cục [Đo] (59–125 byte, giải hết byte). `damage`, `hp` [Đo] đối chiếu HUD. `stat1/stat2`, `unk`, `flags[0,2]` [Chưa rõ] |

```text
i32 seq; i32 zero; u32 seed
i32 row1+2; i32 col1+2; i32 row2+2; i32 col2+2
i32 unk (luôn 1)
i32 n; u8[n] viên mới rơi xuống (mã như bảng trên)
u8 xếpLại; nếu 1: i32 64; u8[64] bàn mới    (trước đây ghi là i32 zero2: 3 byte sau luôn 0)
u8 ?; u8 ?; u8 ?
u8 m; m × { string tên; i32 damage; u8 b; i32 hp; i32 stat1; i32 stat2 }   (-1 = không đổi)
u8 flags[4]; string actor; u8 end
nếu end = 1: u8 won; i32 exp; i32 tiền; 7 byte; u8 n; n × {i32; i32}   (xem Kết thúc trận)
```

- `actor` là bên vừa đi nước này (`manina` hoặc `mob872604`).
- `end=1` ở nước làm một bên về HP 0. Ở mọi nước khác `end=0`.
- `flags[3]=1` khi actor là người chơi.
- `flags[1]=1` đi kèm **thêm lượt**: sau nước ăn 4 tim, s2c/24 kế tiếp vẫn là `playerTurn=1`.

Ví dụ nước ăn 4 tim của người chơi, 90 byte:

```text
0000000e 00000000 e429a7ae  00000007 00000008 00000006 00000008  00000001
00000007 01 46 03 46 00 02 00          7 viên mới: tim, vàng, giọt, vàng, kiếm, âm dương, kiếm
00000000 01
  00000006 6d616e696e61 ffffffff 00 00000050 ffffffff ffffffff     manina: HP = 80
00 01 00 01  00000006 6d616e696e61  00
```

Ví dụ nước của bot ăn kiếm:

```text
… 00000002
  00000009 6d6f62383732363034 0000000e 00 ffffffff 00000020 ffffffff   bot: damage 14, stat1 32
  00000006 6d616e696e61       ffffffff 00 00000066 ffffffff ffffffff   manina: HP = 102
00000000 00000009 6d6f62383732363034 00
```

<a id="s2c-20"></a>

## s2c/20

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | skill_result |
| Xuất hiện khi | Trả c2s/14 khi quái dùng kỹ năng thay vì đổi viên (B1 1 lần, Q2 3 lần, Q4–Q6 nhiều lần) |
| Bố cục payload | `i32 seq; i32 zero; u32 seed; i32 skillId; i32 s1; i32 k; k × (i32 row+2, i32 col+2) mục tiêu; i32 j; j × (i32 row+2, i32 col+2) ô bị phá; i32 unk; i32 n; u8[n]; u8 xếpLại; 3 byte; u8 m; m × unit; u8 flags[4]; string actor; u8 end` |
| Độ chắc chắn | [Đo] đọc hết byte mọi mẫu đủ byte (B1, Q2, Q4). Trước đây ghi `i32 s1; i32 s2; i32 k`: với kỹ năng 2000 thì `s2` thực ra là `k = 0` và `k` là `j`, nên mẫu B1 vẫn khớp. Kỹ năng 1000 (Q4) có `k = 2` mới lộ ra danh sách thứ hai |

| Kỹ năng | Tên (theo `s2c/30`) | Mục tiêu `k` | Ô bị phá `j` | Đã thấy |
|---|---|---|---|---|
| 2000 | Xích Lôi Công ("phá hủy ngẫu nhiên từ 1 đến 3 quân cờ" ở cấp 1) | 0 | 1–3 ô rải rác | Chỉ Huy Sơn Tặc (B1), Heo Mọi (Q2): 29 và 20 sát thương |
| 1000 | Hỏa Cầu Thuật | 2 | 8: khối 2×2 tính từ mỗi mục tiêu sang phải và xuống dưới | Kẻ Gây Rối (Q4–Q6): 34–39 sát thương |

Ô bị kỹ năng phá mà là viên đặc biệt (`10`) thì viên đó **cũng nổ 3×3**: Q5 seq 41, khối 2×2 chứa Kiếm lửa ở r3c3, server phá 9 ô và gửi 9 viên mới. [Đo] Quái dùng kỹ năng khi nội lực (`stat1` của nó trong danh sách unit) đủ; Kẻ Gây Rối tích tới 34 rồi dùng Hỏa Cầu Thuật, sau đó còn 22. [Đo 1 lần]

Kỹ năng 2000 (B1):

```text
0000000c 00000000 67f299f1 000007d0 00000000 00000000
00000003 00000007 00000002 00000004 00000006 00000009 00000007     k = 0; j = 3 ô: r5c0, r2c4, r7c5
00000001 00000003 00 02 04 00000000 02
  "mob872604" 0000001d 00 ffffffff 0000000f ffffffff               damage 29
  "manina"    ffffffff 00 00000049 ffffffff ffffffff               HP 73
00000000 "mob872604" 00
```

Kỹ năng 1000 (Q4):

```text
0000000c 00000000 6f58239d 000003e8 00000000
00000002 (00000004 00000007) (00000002 00000004)                    k = 2 mục tiêu: r2c5, r0c2
00000008 (4,7)(4,8)(5,7)(5,8) (2,4)(2,5)(3,4)(3,5)                  j = 8 ô: hai khối 2×2
00000001 00000008 05 04 05 01 02 02 05 04 00000000 02
  "mob31402" 00000027 00 ffffffff 0000000a 0000000f                 damage 39
  "manina"   ffffffff 00 00000057 ffffffff ffffffff                 HP 87
```

<a id="c2s-20"></a>

## c2s/20: người chơi dùng kỹ năng

| Thuộc tính | Điều tra được |
|---|---|
| Nhãn phân tích | use_skill |
| Bố cục payload | `string battleUuid; i32 seq; i32 skillId` |
| Cách tìm | Quét hằng số opcode trong các hàm dựng gói `com.mh.sqlq`: `a67` → 15, `y104` → 18, `h73` → 14, `a74` → 19, `s77` → 40, và **`f75(int, int)` → 20**. Disassembly cho thấy `a74` ghi tham số cuối (`seq`) trước rồi tới các tham số theo thứ tự, khớp bố cục `c2s/19` đã biết; `f75` cũng ghi tham số thứ hai trước tham số thứ nhất. [Suy luận tĩnh] |
| Kết quả | Q9: server trả `s2c/20` với `actor = "manina"`, kỹ năng 1000 Hỏa Cầu Thuật: **62 sát thương** (2 mục tiêu, 7–8 ô), **122** khi thanh sức mạnh đầy, so với 31 cho 3 kiếm. Server tự chọn ô mục tiêu. Nhân vật có kỹ năng này ở cấp 1 (`s2c/9`: `000003e8 00000001 00000019 ff`) [Đo] |
| Nội lực | Hỏa Cầu Thuật tốn **25** (1 thành), theo `nộiLực` của `s2c/30` và chi tiết trên máy ([12](12-skills-items.md#bảng-kỹ-năng)). Từ 31/10 bot chọn mọi kỹ năng đã học bằng `bestAction`, so với nước đổi chỗ và bình ([07-auto-battle](07-auto-battle.md#chọn-hành-động)); `castSkill` chỉ còn dùng khi không có bảng kỹ năng. Hàn Lưu Thánh Thủy 4001 tốn đúng 50 (A1). Trong 71 lần ở trace bot (30–31/10), nội lực trước khi dùng là 25–39, và giảm nhiều nhất 25 (giảm ít hơn khi ô bị phá có viên âm dương). [Đo] |

<a id="trận-tính-giờ"></a>

## Trận tính giờ

Gặp ở mọi trận Sơn Tặc (cấp 9), đánh dấu bằng `s2c/18` byte 4 = 1. [Đo Q6–Q9]

- Không có `s2c/24`. Server bỏ qua `c2s/14` và nhận `c2s/19`, `c2s/20` bất cứ lúc nào, mỗi gói trả `s2c/19`/`s2c/20` sau ~30 ms với `seq + 1`.
- Quái không đổi viên. Nó đánh theo đồng hồ, khoảng 25–31 s một lần, qua `s2c/21` (Sơn Tặc: 46 sát thương). Ba đòn là hết 120 HP.
- Q6–Q8 thua 3 trận vì bot chờ lượt của quái. Q9 đi một nước mỗi giây và dùng Hỏa Cầu Thuật khi đủ nội lực: thắng hai trận trong 22 s và 25 s, chưa trúng đòn nào.



<a id="c2s-40"></a>

## c2s/40 · s2c/10

| Thuộc tính | Điều tra được |
|---|---|
| Nhãn phân tích | battle_leave / character_stats |
| Xuất hiện khi | **Đầu hàng**: nút "Đầu hàng" → OK (B2 đo 4 lần, xem [06-map-mobs](06-map-mobs.md#đầu-hàng)). Trong B1, trận Gà Điên cũng kết thúc bằng 40 sau nước đầu của bot; lúc đó tay vẫn giữ joystick, nguyên nhân [Chưa rõ] |
| C→S 40 | `string battleUuid` (40 byte), gửi cùng lúc với c2s/11 `"M1"` để tải lại bản đồ, sau đó là c2s/43 |
| S→C 10 | 62 byte: `i32 4; string "manina"; i32 hp 130; i32 hpMax 130; i32 exp 176; i32 150; i32 300 (mốc EXP cấp 3); i32 tiền 0; i32 10000; i32 22; i32 9; i32 30; i32 20; i32 6`. HP, EXP, mốc, tiền [Đo qua trận thắng run4: 176 → 184, 0 → 4]; các số khác [Chưa rõ] |
| Độ chắc chắn | 1 lần. Kết thúc bình thường (hết HP) **không** có c2s/40 |

<a id="battle-end"></a>

## Kết thúc trận: s2c/19 end=1 · s2c/36 · s2c/1214

Nước thứ 28 của bot (ăn kiếm, sát thương 14) đưa manina về `hp=0`. Gói s2c/19 dài 2128 byte, `end=1`, và có thêm 2009 byte kết quả:

```text
u8 won; i32 exp; i32 tiền; 7 byte          16 byte, đều = 0 khi thua
u8 n (249)
n × { i32 from; i32 to }                (150,300) (300,500) (500,750) (750,1050) … (124510400, 2147483647)
```

Trận **thắng** run4 (manina thắng Gà Điên) có `01 00000008 00000004 00000000000000`:
- `won=1`.
- EXP +8: trường thứ 3 của s2c/10 tăng từ 176 lên 184, HUD từ 17,2% lên 22,5%.
- Tiền +4: trường thứ 6 của s2c/10 tăng từ 0 lên 4.
- 7 byte cuối [Chưa rõ].

Bảng 249 cặp là mốc EXP theo cấp: cấp 3 = (150, 300), trùng trường thứ 4–5 của s2c/10. [Đo] Byte đầy đủ ở [07-auto-battle](07-auto-battle.md#s2c19-kết-thúc-trận-thắng-2135-byte).

Cùng một mili giây, server gửi thêm:

| Gói | Payload | Ghi chú |
|---|---|---|
| s2c/10 | 62 byte, cùng bố cục như trên | HP lại `130/130` |
| s2c/36 | `00000008 00000000 31 ffffffffffffff` (16 byte) | Độ bền 8 ô trang bị: ô 0 còn 49, các ô khác trống ([bố cục](#s2c-36)) |
| s2c/1214 | rỗng | Cũng có sau lần huỷ trận Gà Điên [Đo]; vai trò [Chưa rõ] |

Sau ~5 s, client gửi c2s/11 `"M1"` rồi c2s/43 và nhận lại map, danh sách quái và người chơi như lúc mới vào bản đồ. Nhân vật xuất hiện lại tại vị trí đã chạm quái (x=1735, y=672 trong s2c/11).

<a id="s2c-36"></a>

### s2c/36: độ bền 8 ô trang bị

Bố cục giống danh sách trang bị cuối `s2c/9` và `s2c/37`: mỗi ô là `ff` khi trống, còn không thì là một bản ghi, ở đây chỉ có số ô và độ bền.

```text
i32 n (8); n × { u8 0xff (ô trống) | u8 ô; i32 độBền }
```

| Mẫu | Byte | Đọc |
|---|---|---|
| B1, thắng Gà Điên | `00000008 00 00000031 ff ff ff ff ff ff ff` (16) | Ô 0 (Nón Âu Lạc) độ bền 49; 7 ô trống |
| Sau Đầu hàng ([07-auto-battle](07-auto-battle.md#các-gói-mới-thấy-trong-bot)) | `00000008 00 0000002f ff ff ff ff ff ff ff` (16) | Ô 0 độ bền 47 |
| Q2 ([10-quests](10-quests.md#kết-quả-q3-q4)) | 20 byte | Ô 0 39 → 34 (byte 8), ô 2 (Rìu Âu Lạc) 50 → 12 (i32 ở offset 11) |
| G2 ([bot tự nhặt đồ](13-drops-items.md#g2)), manina cấp 22, 6 trận Sơn Tặc (31/10) | `00000008 00 00000037 01 0000003c 02 00000000 ff ff ff ff ff` (24) | Ô 0 Nón Âu Lạc 55, ô 1 Áo Hào Kiệt 60, ô 2 Rìu Âu Lạc 0 (đang hỏng) |

- Cả 4 mẫu đọc vừa hết byte theo bố cục trên. Ô có món khớp trang bị của manina trong `s2c/9`. Độ bền về 0 ở cùng trận HP tối đa và sát thương tụt. [Đo]
- Byte trước độ bền là số ô (`00`, `01`, `02` ở G2), như byte ô của bản ghi vật phẩm. [Đo]
- G2: cả 6 gói giống hệt nhau, độ bền không giảm qua 6 trận thắng. Gói đến 1 ms sau kết quả cuối trận, ngay sau `s2c/10` kiểu 4. Vậy không phải trận nào cũng làm mòn đồ; quy luật mòn chưa rõ (Q2 giảm gần như mỗi trận). [Đo; quy luật Chưa rõ]
- Bot TS đọc gói bằng `gearDurability` (src/protocol/world.ts). App Rust cập nhật độ bền trên tab Túi đồ sau mỗi trận, và dựa vào đó để tự sửa đồ ([Tự sửa đồ](../../integration/rust/features.md#tự-sửa-đồ)).

## Push trên bản đồ: đính chính

Đã đối chiếu với vị trí của chính nhân vật trong B1:

- **s2c/1262** là vị trí **người chơi**, không phải quái. Bản ghi `n1` là id người chơi, `n2/n3` là x/y. Id 155 trùng x/y của c2s/1169 do chính client gửi. [Đo] ([04-push](04-push.md#s2c-1262))
- **s2c/1253** (17 byte) có dạng `i32 id; i32 cấp; i32 hp; i32 maxHp; u8`, ví dụ `(538, 21, 343, 423)`, `(1280, 3, 48, 48)`. [Suy luận: các id trùng id người chơi trong 1262, và hp ≤ maxHp ở mọi mẫu]

## Thu lại

1. Chạy `frida-server` 17.x bằng root trên máy.
2. `adb forward tcp:27042 tcp:27042`.
3. Spawn `com.lotasoft.colauloanthe` qua REA (`start_frida_session`, remote `127.0.0.1:27042`) với một agent hook hai export dưới, rồi resume.
   - Hook vào `__ngen_com_mh_sqje_22416__ngen_native_a2E`: tham số `(env, self, packet)`.
   - Hook lúc trả về của `__ngen_com_mh_sqnw_39916__ngen_native_e6E`: giá trị trả về là packet.
   - Đọc field `a` (I, opcode), `d` (I, độ dài), `b` ([B, buffer) bằng các hàm JNI trong bảng của `env`: `GetObjectClass` 31, `GetFieldID` 94, `GetIntField` 100, `GetObjectField` 95, `GetByteArrayRegion` 200. Cách này không cần Java bridge.
4. Xuất evidence bundle, lọc thành JSONL `{seq, at, kind, op, len, hex}`, rồi giải bằng `Reader` theo bố cục ở trên.

Agent của B1 chỉ ghi độ dài của c2s/4 (credentials). Đồng hồ máy chậm hơn máy tính khoảng 0,8 s. Khi ghép thao tác vuốt với gói, phải bù độ lệch này.
