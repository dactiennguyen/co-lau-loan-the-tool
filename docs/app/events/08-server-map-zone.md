# Máy chủ, bản đồ, khu vực và số người

Mốc: APK 1.0.3. Ngày đo: 30/10/2026, cùng máy và nhân vật `manina` như [07-auto-battle](07-auto-battle.md). Nguồn:
- **L1**: spawn app bằng Frida, đăng nhập bằng tài khoản đã lưu trong app, rồi ở lại 15 phút.
- **W1**: attach vào game đang chạy, khu 0.
- **A1/B2**: các capture cũ của [05-battle](05-battle.md) và [06-map-mobs](06-map-mobs.md).

Agent hook đọc packet ở native writer/reader như các file trước. `c2s/4` (mật khẩu) chỉ ghi độ dài. Bộ giải mã: [src/protocol/world.ts](../../../src/protocol/world.ts). Test với mẫu thật: [test/world.test.ts](../../../test/world.test.ts). Nhãn **[Đo]**, **[Suy luận]**, **[Chưa rõ]** dùng như các file khác.

## Trả lời nhanh

| Câu hỏi | Trả lời | Căn cứ |
|---|---|---|
| Lấy danh sách máy chủ thế nào? | App có sẵn một dòng mặc định trong `.so`. Sau khi bắt tay, server gửi lại danh sách qua `s2c/1207`. Hiện chỉ có **1 máy chủ: Thanh Khê**. | Chuỗi trong `.so`, L1 [Đo] |
| Kết nối máy chủ thế nào? | TCP tới `play.colauloanthe.vn:1688`, bắt tay seed, trao khoá, rồi `1206`/`1207`/`1209`/`5`. Cả đăng nhập lẫn chơi đều trên **một** kết nối đó. | L1 [Đo] |
| Có bao nhiêu map? | **25 map**, `M1`…`M25`. Bấm "Bản đồ" thì client gửi `c2s/11 "M99"` và nhận danh sách map kèm cấp yêu cầu. | L1 [Đo] |
| Mỗi map bao nhiêu khu? | Làng Thanh Khê (`M1`) và Trại Vân Sơn (`M2`) đều có **100 khu**, mỗi khu tối đa **20 người**. Các map khác chưa đo. | `s2c/1172`: M1 2 lần, M2 bằng bot TS (Z1, [06-map-mobs](06-map-mobs.md#bot-ts-đổi-khu-z1)) [Đo] |
| Mỗi khu bao nhiêu người? | `c2s/1172` (rỗng) → `s2c/1172`: số người của từng khu trong map hiện tại. Lúc 06:08 có 33 người trên 10 khu, lúc 00:12 có 107 người trên 18 khu. | Khớp từng ô "Dân số" trên màn hình [Đo] |
| Ai đang ở trong khu? | Vào map thì nhận `s2c/1263` với đủ người chơi khác trong khu. Chi tiết ở [09-players-chat](09-players-chat.md). | 18 người + mình = 19, đúng "Dân số 19/20" [Đo] |

## Kết nối máy chủ

### Danh sách máy chủ

- Trong `libgdx-flashds.so` có sẵn chuỗi `Thanh Khê:play.colauloanthe.vn:1688:0` và host `play.colauloanthe.vn`. Đây là danh sách mặc định khi app chưa có gì. [Đo chuỗi]
- **APK 1.1.0 (Google Play, cài 20/11) đổi server:** chuỗi mặc định thành `Thanh Khê:plays1.colauloanthe.vn:1688:0`, không còn host `play.colauloanthe.vn`. Ngày 20/11, `play.colauloanthe.vn` trỏ về `127.0.0.1` (cổng 1688 đóng), còn `plays1.colauloanthe.vn` trỏ về `14.225.213.40`, cùng IP cũ, cổng 1688 mở. Bot TS và app đã đổi mặc định sang `plays1`. Chưa đăng nhập thử qua host mới. Bản 1.1.0 còn gửi phiên bản giao thức `0.0.7` (bot vẫn gửi `0.0.2`), chưa biết server có từ chối bản cũ không. [Đo chuỗi, DNS, cổng]
- Sau `c2s/1206`, server gửi `s2c/1207` gồm một `string` theo dạng `tên:host:cổng:cờ`, lần đo là `Thanh Khê:play.colauloanthe.vn:1688:1`. Cờ là `0` trong bản mặc định và `1` trong bản server gửi, ý nghĩa [Chưa rõ]. Chưa thấy chuỗi có nhiều máy chủ nên chưa biết ký tự phân cách giữa các máy chủ. [Đo]
- `.so` còn có khoá lưu `colau.servers`, các câu "Chọn máy chủ", "khong luu duoc lua chon server" và "server yeu cau chuyen IP". Có lẽ app lưu danh sách lại, cho chọn khi có nhiều máy chủ, và có cơ chế server bảo client đổi IP. Không thấy file nào trong `/data/data/com.lotasoft.colauloanthe` chứa `colau.servers` ở dạng chữ, nên có thể nó nằm trong cache mã hoá `files/dyncache/`. [Suy luận]
- `c2s/5` và `c2s/4` đều gửi `serverId = 24` (`0x18`). Không thấy số 24 trong `1207` hay `1209`, nên nguồn gốc của nó [Chưa rõ].

### Trình tự đo được (L1)

Thời gian tính từ lúc app mở socket. Byte mỗi gói xem [01-boot](01-boot.md), [02-login](02-login.md), [03-world](03-world.md); framing và XOR xem [protocol](../protocol.md).

```text
   0 ms  TCP play.colauloanthe.vn → 14.225.213.40:1688; S→C seed 4 byte; C→S handshake 21 byte
   0 ms  C→S -1   (rỗng)                          S→C -1   khoá 17 byte              (+4 ms)
   9 ms  C→S 1206 "android", "0.0.2", 0           S→C 1207 danh sách máy chủ           (+31 ms)
                                                  S→C 1209 12                          (+36 ms)
 406 ms  C→S 5    00000018 ffffffff 01            S→C 5    thông báo "Thông Báo / Cờ Lau Loạn Thế"
 936 ms  C→S 1 ↔ S→C 1  heartbeat, ~2 s một lần trong lúc chờ ở màn đăng nhập
         … người dùng bấm "Đăng nhập" …
33,7 s   C→S 2 → S→C 2 → C→S 3 → S→C 3 (challenge) → C→S 4 (username + proof, không ghi)
34,1 s   S→C 1259, 1265, 1269, 1271, 1272 (cấu hình) → S→C 4 (rỗng = thành công)
34,1 s   C→S 9 → S→C 9 nhân vật → C→S 30 → S→C 46, 39, 1195, 1220, 30 (kỹ năng)
34,5 s   C→S 42 → S→C 42 → C→S 29 → S→C 29 ("manina", "M1", 0)
34,9 s   C→S 11 ("M1", ff, -1) → S→C 11 bản đồ 11379 byte (+344 ms)
35,5 s   S→C 1182 ×4 (vật phẩm rơi), 1170/1167 (người chơi), 1212
36,4 s   C→S 43 → S→C 43 quái của khu (+54 ms), 1177 boss, 1263 người chơi trong khu (+125 ms), 1184 vật phẩm trên đất
```

Từ lúc bấm "Đăng nhập" đến khi có bản đồ và danh sách người chơi mất khoảng **2,8 s**. [Đo]

### Giữ kết nối

- Ở màn đăng nhập, client gửi `c2s/1` khoảng 2 s một lần. Vào game rồi thì khoảng **30 s** một lần (trung vị 30.006 ms). [Đo]
- Khi app bị đưa ra nền, client **vẫn nhận** gói (`1262` về đều thêm 90 s) nhưng **không gửi** heartbeat. Đúng 90 s sau `c2s/1` cuối, server ngừng gửi và đóng phiên. Mở lại app thì hiện "Mất kết nối với máy chủ!". [Đo 1 lần]
- Một bot phải tự gửi `c2s/1` dưới 90 s một lần; 30 s như client gốc là an toàn. [Suy luận từ lần đo trên]
- Đăng nhập cùng tài khoản ở nơi khác thì phiên cũ nhận `s2c/0`, xem [02-login](02-login.md#s2c-0).

## Bản đồ thế giới

<a id="world-map"></a>

### c2s/11 "M99" → s2c/11

| Thuộc tính | Điều tra được |
|---|---|
| Xuất hiện khi | Bấm nút "Bản đồ" ở góc phải. Mỗi lần mở là một lần gửi. [Đo 2 lần] |
| C→S | `string "M99"; u8 0; i32 -1`, 12 byte. Map thật dùng `u8 ff`. |
| S→C | `u8 0; string "M99"; i32 n=25; n × {i32 index; string mapId; 17 byte 0; u8 khoá; 8 byte 0}; i32 n=25; n × {i32 index; i32 cấpYêuCầu}`, 1132 byte |
| Độ chắc chắn | Đọc hết 1132 byte [Đo]. Byte `u8 0` đầu gói phân biệt với bản đồ thật (`u8 1`). Các byte 0 trong bản ghi [Chưa rõ]. |

```text
C→S 11: 00000003 4d3939 00 ffffffff                         "M99", 0, -1
S→C 11: 00 00000003 4d3939 00000019                         flag 0, "M99", 25 map
        00000000 00000002 4d31 00×17 00 00×8                index 0, "M1", mở
        00000001 00000002 4d32 00×17 01 00×8                index 1, "M2", khoá
        …
        00000019 00000000 00000000 00000001 0000000a 00000002 00000082 …
                                                            25 cặp: (0,0) (1,10) (2,130) …
```

### 25 map

Tên lấy bằng cách khớp nhãn "Lv." trên màn hình bản đồ với bảng cấp trong gói. Tên boss lấy từ thông báo `s2c/45`, câu có dạng "BOSS … đang ở <tên map>: khu 0, 1, …, 9". Chỉ `M1` mở với nhân vật cấp 4.

| mapId | Cấp | Tên trên bản đồ | Boss (s2c/45) | Độ chắc chắn |
|---|---:|---|---|---|
| M1 | 0 | Làng Thanh Khê | Thủ Lĩnh Sơn Tặc | Tên từ `s2c/11` [Đo] |
| M2 | 10 | Vân Sơn ("Trại Vân Sơn") | Hào Trưởng phía Bắc, Hào Trưởng phía Nam | Lv. duy nhất [Đo] |
| M3 | 130 | Cổ Phong | Vệ Xích | [Đo] |
| M4 | 20 | Hồng Giang | Tướng Xích Vũ | Lv.20 có cả M25. Cổng "Hồng Giang" (1016) ở M25 đòi xong nhiệm vụ (S1). Đến nhiệm vụ 14 thì vào được: `s2c/13` báo `"M4"`, thứ tự 3; 32 quái; boss Tướng Xích Vũ cấp 35 ([N5](10-quests.md#trinh-sát)) [Đo] |
| M5 | 40 | Lạc Cốc | Tướng Hùng Liệt | [Đo] |
| M6 | 110 | Tân Trạch | Lôi Tướng | [Đo] |
| M7 | 100 | Nguyệt Đàm | Thạch Khôi | [Đo] |
| M8 | 50 | Bạch Nham | Tướng Thiết Kích | [Đo] |
| M9 | 120 | Lam Lĩnh | Nguyễn Bá Dực | [Đo] |
| M10 | 30 | Cửu Phong hoặc Luyện Ngục | Cửu Phong: Tướng Thiết Hổ | Hai map cùng Lv.30 [Chưa rõ] |
| M11 | 70 | Tiên Cốc | Tướng Vũ Kình | [Đo] |
| M12 | 80 | Tam Khê | Tướng Nham Hổ | [Đo] |
| M13 | 60 | Phong Nguyên | Tướng Trấn Vũ | [Đo] |
| M14 | 90 | Huyền Hồ | Đàm Xuyên | [Đo] |
| M15 | 30 | Luyện Ngục hoặc Cửu Phong | | [Chưa rõ] |
| M16, M17 | 0 | Thiên Môn, Mẫu Sơn | | Hai địa danh không ghi Lv. trên bản đồ [Suy luận] |
| M18…M24 | 30 | Không có trên bản đồ | | [Chưa rõ] |
| M25 | 20 | Rìa Hồng Giang | Không có boss, không có quái | Vào qua cổng 1024 từ M2: `s2c/13` báo `"M25"`, `s2c/11` tên "Rìa Hồng Giang" (S1, [06-map-mobs](06-map-mobs.md#atlas)). Cấp 19 vẫn vào được [Đo] |

`.so` chứa đúng 17 tên này, không có tên nào khác. `M18`…`M24` có thể là map phụ hoặc phó bản, chưa vào được. [Suy luận] M25 có tên "Rìa Hồng Giang" do server gửi trong `s2c/11`, không nằm trong 17 tên của `.so`. [Đo]

App lưu bản đồ đã tải vào `files/dyncache/rs_map<mapId>.bin`; trên máy hiện chỉ có `rs_mapM1.bin`. [Đo]

Thông báo `s2c/45` đến thành đợt 15 câu, mỗi boss một câu, trong vòng 40 ms. Mỗi phiên L1, A1, B2 thấy đúng một đợt, lúc 188 s, 288 s và 192 s sau khi tải map, không trùng thao tác nào; chu kỳ [Chưa rõ]. Câu nào cũng liệt kê "khu 0, 1, …, 9", vậy có thể boss chỉ xuất hiện ở 10 khu đầu. [Suy luận]

```text
00000058 "BOSS Thủ Lĩnh Sơn Tặc đang ở Làng Thanh Khê: khu 0, 1, 2, 3, 4, 5, 6, 7, 8, 9"
```

## Khu vực và số người

<a id="zone-list"></a>

### c2s/1172 → s2c/1172

| Thuộc tính | Điều tra được |
|---|---|
| Xuất hiện khi | Bấm "Khu vực N" dưới tên map, mở bảng "Khu vực" [Đo] |
| C→S | Rỗng. Không có mapId nên chỉ trả về map đang đứng. [Đo rỗng; chỉ map hiện tại là Suy luận] |
| S→C | `u8 n=100; n × {u8 khu; u8 độĐông; u8 sốNgười; u8 tốiĐa=20}`, 401 byte |
| Sau đó | Chọn khu thì gửi `c2s/1173`, xem [06-map-mobs](06-map-mobs.md#đổi-khu-vực-trong-cùng-map) |
| Độ chắc chắn | Khớp từng ô trên màn hình: khu 0 `19/20` chữ đỏ, khu 1 `6/20`, khu 2 `0/20`, khu 3 `1/20` … [Đo] |

```text
64                    n = 100
00 02 13 14           khu 0, độ đông 2, 19 người, tối đa 20   (chữ đỏ trên màn hình)
01 00 06 14           khu 1, 0,  6/20
02 00 00 14           khu 2, 0,  0/20
03 00 01 14           khu 3, 0,  1/20
…
63 00 00 14           khu 99
```

Độ đông theo số người, gộp hai lần đo:

| Độ đông | Số người thấy | Màn hình |
|---:|---|---|
| 0 | 0–7 | chữ thường |
| 1 | 10–13 | [Chưa rõ màu] |
| 2 | 15–20 | chữ đỏ |

Thêm lần đo trong U1 ([10-quests](10-quests.md)): khu 0 `20/20` và khu 1 `15/20` đều chữ đỏ. Ngưỡng ở 8, 9, 14 người chưa thấy. [Chưa rõ]

Hai lần đo `M1` (giờ Việt Nam):

| Thời điểm | Tổng người | Khu có người | Khu đông nhất |
|---|---:|---:|---|
| 30/10 00:12 (B2) | 107 | 18 | khu 0: 19, khu 1: 17, khu 3: 13, khu 2: 12, khu 4: 11, khu 6: 10 |
| 30/10 06:08 (L1) | 33 | 10 | khu 0: 19, khu 1: 6 |

Người chơi dồn vào khu 0 và 1, còn khoảng 80–90 khu trống.

### Người trong khu

`s2c/1263` đến ngay sau `c2s/43` khi vào map hoặc đổi khu. Gói liệt kê mọi người chơi **khác** trong khu: tên, id, cấp, HP, toạ độ, trang bị. Lần L1 có 18 người. Cộng nhân vật của mình là 19, khớp `s2c/1172` khu 0 `19/20`. Sau đó danh sách được cập nhật bằng `1167` (vào), `1170` (ra) và `1262` (di chuyển). Bố cục đầy đủ ở [09-players-chat](09-players-chat.md#s2c-1263). [Đo]

## Chưa rõ

- Ký tự phân cách khi `1207` có nhiều máy chủ, ý nghĩa cờ cuối, và nguồn của `serverId = 24`.
- Số khu của các map khác `M1`, `M2`; có xin được `1172` của map khác không.
- Tên chắc chắn của `M10`, `M15`, `M16`, `M17`, và `M18`…`M24` là map gì.
- Ngưỡng của độ đông 1 và 2 (8, 9, 14 người).
