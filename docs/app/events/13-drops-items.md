# Đồ rơi, nhặt đồ và bảng vật phẩm

Mốc: APK 1.0.3, ngày 31/10/2026. Nguồn ([các phiên](../investigation.md#nguồn-dữ-liệu)):
- **D1**: dữ liệu game tải về trên điện thoại, thư mục `files/dyncache` của app: `it1` (bảng vật phẩm), `it0` (bảng mã chỉ số), `itv` (phiên bản bảng, `0x12`), `offline-a2/cam-nang.json` (Cẩm nang).
- **S2**: `npm run scan` có `CLLT_TRACE`, đi M2, M1, M25 bằng cổng (không đi bộ, không đánh).
- **K2**: bot TS đánh một trận Cóc Xanh với manina ở M2.
- **P2**: Frida trên điện thoại (ghi mọi gói, hook 114 hàm dựng), thử bắt gói nhặt đồ. Chưa bắt được, xem [Nhặt đồ](#nhặt-đồ).
- **T2**: đọc tĩnh `libgdx-flashds.so`, dựng đồ thị gọi JNI của cả thư viện: hàm nào gọi phương thức Java nào. Từ đó tìm ra gói nhặt đồ, xem [Nhặt đồ](#nhặt-đồ).
- Thêm các gói vật phẩm trên đất của E1, E2 ([12-skills-items](12-skills-items.md)).

Nhãn **[Đo]**, **[Suy luận]**, **[Chưa rõ]** như các file khác.

## Trả lời nhanh

| Câu hỏi | Trả lời |
|---|---|
| Đồ rơi ra sao? | Sau trận thắng quái, hòm đồ "có thể rơi xuống đất" (Cẩm nang). Server báo cho cả map: `s2c/1182` khi có món rơi, `s2c/1183` khi món mất (bị nhặt hoặc hết hạn), `s2c/1184` là danh sách món đang nằm trên đất lúc vào map hay vào khu. Mỗi món hết hạn khoảng 600 s sau khi rơi. Xem [Đồ trên đất](#đồ-trên-đất). [Đo] |
| Nhặt thế nào? | Trên máy: đứng lên hòm rồi bấm **Nhặt** (Cẩm nang). Nút đó gửi **`c2s/1188` = `string`**, là id của món, có lẽ là uuid trong `s2c/1182`/`1184`. Đọc tĩnh, **chưa gửi thử lên server**; server trả gì chưa biết. Xem [Nhặt đồ](#nhặt-đồ). [Đo tĩnh] |
| Nhặt đồ người khác được không? | Bản ghi đồ trên đất không có trường chủ, và chưa thấy client kiểm tra chủ trước khi hỏi "Nhặt". Vậy server quyết; luật chưa đo. [Đo tĩnh; luật Chưa rõ] |
| Đồ gì rơi? | 106 món đã thấy, gần hết ở M2: Xu khóa (mã 41) 54 đống, mỗi đống 124–250; Đá cấp 1–3 (411–413) 28 viên; Trứng Gà (3) 7 quả; 12 món trang bị cấp 1 (nón, áo, nhẫn, vũ khí), mỗi món 2 chỉ số. M1: 4 đống Xu khóa, 1 Đá cấp 2. M25 không có quái. Xem [Đồ đã thấy](#đồ-đã-thấy). [Đo] |
| Mã 41 là gì? | **Xu khóa**. Trước đây đoán là tiền ([09](09-players-chat.md#ground-items)). Cẩm nang: "Kiếm Xu khóa: nhặt Xu khóa quái rơi". [Đo] |
| Tên vật phẩm lấy ở đâu? | Không có trong APK, cũng không có gói nào khi mở popup vật phẩm. Game tải bảng `it1` về máy: 646 món (407 món "Ngừng dùng"), mỗi món có tên, mô tả, loại, cấp mặc, hệ, độ bền, số xếp chồng. Xem [Bảng vật phẩm](#bảng-vật-phẩm). [Đo] |
| Mã chỉ số của trang bị? | Bảng `it0`: 1 cường lực, 2 nội lực, 3 thân pháp, 4 thể lực, 5 sức tấn công, 6 phòng thủ, 7 né tránh, 8 % chí mạng, 9 sinh lực… Xem [Mã chỉ số](#mã-chỉ-số). [Đo] |

<a id="nhặt-đồ"></a>

## Nhặt đồ

Cẩm nang (`cam-nang.json`, tab Trận đấu và Cơ bản) [Đo chữ của game]:
- "Đồ rơi: hòm đồ có thể rơi xuống đất sau trận; đứng lên hòm rồi bấm **Nhặt**."
- "Kiếm Xu khóa: nhặt Xu khóa quái rơi, làm nhiệm vụ hàng ngày, đầy thanh Vàng."
- "Quái quá thấp: thấp hơn bạn hơn 20 cấp thì không có kinh nghiệm, vàng và đồ rơi."
- Bạch Hổ Thống Lĩnh (boss thế giới): "Trong trận: không có kinh nghiệm, vàng, đồ rơi."

Chuỗi trong `libgdx-flashds.so` [Đo]:
- "Nhặt", nằm giữa các chuỗi của lớp bản đồ ("fightingMonster", "Finish Map.destroy()").
- Enum `com.g.m.sqaf` gồm `OTHER`, `END_MATCH`, `ITEM_PICKUP`. Có lẽ là loại hiệu ứng hay âm thanh, không phải gói. [Suy luận]
- Công cụ thử của nhà phát triển: "F2: chỉ thả hòm thử trên bản đồ.", "dev-chest-", thuộc tính hệ thống `colau.uitest` và "F2: túi trống, không có vật phẩm làm mẫu.". Bấm F2 khi bật `colau.uitest` thì thả một hòm giả ngay trên máy, lấy một món trong túi làm mẫu. [Suy luận]

<a id="c2s-1188"></a>

### Gói nhặt: `c2s/1188`

```text
c2s/1188 = string uuid      (hàm dựng sqlq.c(String), ngen c44)
```

Chuỗi gửi đi là trường `n` của món. Với hòm thật, `n` có lẽ là uuid trong bản ghi `s2c/1182`/`s2c/1184` ([09](09-players-chat.md#ground-items)). Tìm bằng đọc tĩnh (T2), **chưa gửi thử lên server**. [Đo tĩnh; uuid là Suy luận mạnh]

Luồng trong client (lớp bản đồ `com.mh.sqhz`):

| Bước | Hàm | Làm gì |
|---|---|---|
| 1 | `sqhz.a(sqgu)` (ngen `a60`) | `sqgu` là hòm trên đất. `sqhz.w` (ngen `w59`) gọi hàm này khi mục tiêu đang chọn là hòm (trường tĩnh `sqkf.J`). Có lẽ đó là lúc người chơi chạm vào hòm. Nếu nhân vật đang đứng trên hòm (`sqhz.b(sqgu)`) thì sang bước 2. Nếu chưa thì tìm đường và đi tới; `g_14`, `x61` gọi lại `sqhz.b(sqgu)`. |
| 2 | `sqhz.c(sqgu)` (ngen `c63`) | Lưu hòm vào `sqhz.ab` và món (`com.mh.j.sqf`) vào `sqhz.ac`. Mở hộp thoại `com.f.sqa.a(món, listener, "Nhặt", 2000, "Bỏ qua", 1000)`. |
| 3 | `sqhz.d(2000, …)` (ngen `d21`, `sqfm.d(int, int)`) | Bấm "Nhặt": lấy `sqhz.ac.n` (chuỗi), gọi `sqhz.x.c(n)` với `x` là `com.mh.sqlq`, tức gửi `c2s/1188`. Rồi xoá `ac`, `ab`, đóng hộp thoại. |

Bước 2 và 3 đọc theo đường đi thật trong mã: nhánh `cmp w21, #2000` của `d21`, các lời gọi theo thứ tự. [Đo tĩnh] Bước 1 đọc theo thứ tự lời gọi, chưa theo từng nhánh; ý nghĩa "chạm vào hòm" và "đi tới" là suy luận. Lệnh 1000 ("Bỏ qua") chưa đọc. [Suy luận]

Vì sao tin là đúng:
- Call site `0xd23250` trong `d21` dùng method ID `c(Ljava/lang/String;)V`. Method ID đó được tạo bằng `GetMethodID` trên lớp ở ô `cclasses[0x178]` của `sqhz`, ô này giữ `com.mh.sqlq`. `sqlq` chỉ có một `c(String)`, là `c44`, opcode 1188 ([bảng hàm dựng](../c2s-builders.md#bảng)). [Đo tĩnh]
- `com.mh.j.sqf` là lớp vật phẩm. Nó có hằng byte 0–8, 21, 23, 29, đúng các mã `loại` của [bảng vật phẩm](#bảng-vật-phẩm). Trường chuỗi duy nhất của mỗi món là `n`. [Đo tĩnh]
- `n` là id của hòm trên đất. Hàm tạo hòm thử của nhà phát triển (`sqck.a3`) gán `n = "dev-chest-" + số`. `sqnw.a103` tạo món từ một bản ghi `com.mh.j.sqq` và gán `n` bằng trường chuỗi `sqq.r`. Với hòm thật, `n` có lẽ là uuid trong `s2c/1182`, vì đó là chuỗi duy nhất của bản ghi. [Đo tĩnh; khớp uuid là Suy luận]
- Chữ "Nhặt" chỉ được tham chiếu ở một chỗ: `register_methods` của `sqhz` đặt nó vào `cstrings[0x3b8]`, và chỉ `c63` đọc ô đó. [Đo tĩnh]

Hai ứng viên cũ không phải gói nhặt:
- `c2s/1174` (`q120`) do `com.g.m.sqfk.run` gửi. Hàm này lấy chuỗi từ `com.g.c.sqbj.a()`; `sqbj` là một Dialog. Bỏ qua nếu chuỗi rỗng. Có lẽ là chữ người chơi gõ vào. [Đo tĩnh; "chữ gõ vào" là Suy luận]
- `c2s/1181` (`a122`, `string; i32; i32`) do `sqhz.a17` gửi. Hàm này xử lý khi nhân vật chạm vào thực thể `sqjb`, chọn gói theo byte loại `sqjb.h`: quái thường `c2s/15`, boss `c2s/1178`, loại thứ ba `c2s/1181`. Không liên quan tới hòm. [Đo tĩnh; loại thứ ba Chưa rõ]

Server trả gì khi nhặt được (có lẽ `s2c/1183` cho cả map và `s2c/1187` túi mới), và trả gì khi không được: chưa đo. Opcode s2c trên dây bị băm ([opcode-map](../opcode-map.md)), nên không dò tĩnh. [Chưa rõ]

**Ai được nhặt.** Bản ghi đồ trên đất không có trường chủ [Đo]. Phép kiểm tra đầu tiên `sqgu.a(sqgu)` (ngen `a5`) chỉ đọc byte `a`, cờ `F` của hòm và xem hòm có trong mảng `sqil.i` không (có lẽ là danh sách đồ trên map). Chưa thấy chỗ nào so tên người chơi. Có lẽ ai cũng thấy nút "Nhặt" trên mọi hòm. [Đo tĩnh; Suy luận] Server có giữ hòm cho người làm rơi một thời gian không thì chưa đo. Món người khác làm rơi thường mất sau 7–20 s ([Đồ trên đất](#đồ-trên-đất)). [Đo; luật Chưa rõ]

Đồ thị JNI dựng bằng script tạm, không lưu trong repo:
- Đọc `R_AARCH64_GLOB_DAT` để biết GOT của từng lớp (`cstrings`, `cclasses`, `cmethods`, `cfields`, `string_pool`).
- Theo dõi thanh ghi từ `adrp`/`ldr`/`add` tới các lời gọi `NewStringUTF`, `find_class_wo_static`, `GetMethodID`/`GetFieldID` và lệnh `str x0` ngay sau đó, để biết mỗi ô cache giữ gì.
- Gắn tên cho mọi call site `Call*Method` và `Get*Field`. Đọc được 38.827/39.299 call site.
- `JNIEnv*` luôn nằm ở `x19` sau prologue.

**P2: lần thử bắt gói** (manina, M2):
- Lúc vào map, server gửi `s2c/1184` với 8 món đang nằm trên đất, cách manina 2000–2600 đơn vị.
- Đi bộ bằng cần điều khiển (ADB) thì đụng phải Kẻ Quấy Phá (cấp 20). Đụng quái là client tự gửi `c2s/15` và vào trận.
- Trên bàn cờ, cả chạm, chạm giữ và kéo bằng `adb shell input` đều không làm client gửi nước đi (`c2s/19`). Hết giờ lượt nào thì lượt đó chuyển cho quái.
- manina thua: "Thua trận, mất 39 kinh nghiệm", HP được hồi đầy. Ngay sau đó tiến trình game trên máy kết thúc.

Sau T2 không cần điện thoại nữa. Để đo trên dây, bot TS:
1. Đọc uuid, x, y từ `s2c/1182`/`s2c/1184`.
2. Đi tới (x, y) bằng `c2s/1169` ([09](09-players-chat.md)).
3. Gửi `c2s/1188 (uuid)` và ghi mọi gói server trả về.

Nên thử hai lần: một hòm do chính bot làm rơi, và một hòm người khác làm rơi.

<a id="đồ-trên-đất"></a>

## Đồ trên đất

Bố cục ba gói và bản ghi vật phẩm ở [09-players-chat](09-players-chat.md#ground-items) và [12-skills-items](12-skills-items.md#bản-ghi-vật-phẩm). Phần đo thêm:
- `s2c/1184` đến ngay sau `s2c/43` mỗi khi vào map hay vào khu. Nó gồm cả món đã nằm vài phút: lúc K2 vào M2, có món còn 7–9 phút mới hết hạn. [Đo]
- Món người khác làm rơi thường mất sau 7–20 s (`s2c/1183`), có lẽ do chính họ nhặt. Có món nằm tới khi gần hết hạn. [Đo]
- Ở M2 đông người, P2 nhận 33 lần `s2c/1182` trong khoảng 9 phút. [Đo]
- Trận Cóc Xanh thắng ở K2 không rơi gì: sau `s2c/36` không có `s2c/1182`. [Đo, 1 trận]
- Ai được nhặt món của người khác, và sau bao lâu. [Chưa rõ]

<a id="đồ-đã-thấy"></a>

### Đồ đã thấy

106 món khác uuid, gộp từ S2, K2, P2, E1, E2. Tên lấy từ [bảng vật phẩm](#bảng-vật-phẩm).

| Map | Mã | Món | Số lần | Số lượng | Phẩm | Chỉ số (mẫu) |
|---|---:|---|---:|---|---|---|
| M2 | 41 | Xu khóa | 54 | 124–250 | | |
| M2 | 413 | Đá cấp 3 | 13 | 1 | | |
| M2 | 412 | Đá cấp 2 | 12 | 1 | | |
| M2 | 3 | Trứng Gà | 7 | 1 | | |
| M2 | 411 | Đá cấp 1 | 3 | 1 | | |
| M2 | 502, 509 | Áo Âu Lạc | 3 | 1 | 1, 2, 4 | 6: 5, 2: 6 |
| M2 | 217 | Áo Hào Kiệt | 2 | 1 | 2, 4 | 6: 6, 1: 5 |
| M2 | 312 | Nhẫn Hào Kiệt | 2 | 1 | 1, 2 | 5: 9, 8: 1 |
| M2 | 273 | Ngư Tinh Kiếm | 2 | 1 | 4 | 5: 7, 3: 7 |
| M2 | 318 | Nhẫn Âu Lạc | 1 | 1 | 1 | 5: 7, 2: 14 |
| M2 | 54 | Nón Âu Lạc | 1 | 1 | 1 | 6: 4, 9: 52 |
| M2 | 99 | Khăn Vòng | 1 | 1 | 1 | 6: 5, 9: 71 |
| M1 | 41 | Xu khóa | 4 | 126–143 | | |
| M1 | 412 | Đá cấp 2 | 1 | 1 | | |

- **Trang bị rơi** đều là món cấp mặc 1, độ bền 60, đủ các hệ. Mỗi món có đúng 2 chỉ số. Chỉ số đầu theo ô: nón và áo là 6 (phòng thủ), nhẫn và vũ khí là 5 (sức tấn công). Chỉ số sau thay đổi: 1–4 (tiềm năng), 8 (% chí mạng) hoặc 9 (sinh lực). [Đo]
- **Phẩm**: 2 là "Hiếm" (popup Nón Âu Lạc, E1). Bốn tên phẩm trong `.so` đứng cạnh nhau: "Hiếm", "Thường", "Quý", "Sử Thi". Phẩm 1 có lẽ là Thường. Phẩm 4 là Quý hay Sử Thi thì chưa rõ. Vật phẩm không phải trang bị có phẩm `0xff`. [Suy luận]
- M2 có quái cấp 7–20 ([atlas](06-map-mobs.md#atlas)). Chưa biết món nào rơi từ quái nào. [Chưa rõ]

<a id="bảng-vật-phẩm"></a>

## Bảng vật phẩm (`it1`)

File `files/dyncache/it1` (73195 byte) của app, đọc bằng root. Bố cục được kiểm trên cả 646 bản ghi, đọc hết đúng tới byte cuối:

```text
i32 n; n × {
  i32 mã; string tên; string môTả; u8 loại; i32 biểuTượng; i32 hìnhẢnh; i32 hệ;
  u8 cấpMặc; u8 giớiTính; i32 xếpChồng; u8 e; i32 độBềnTốiĐa; i32 g
}
```

| Trường | Giá trị | Nghĩa |
|---|---|---|
| `loại` | Xem bảng dưới | Ô trang bị hoặc nhóm vật phẩm [Đo theo tên] |
| `biểuTượng` | 0, 1, 2… | Ảnh nhỏ, có lẽ là `offline-a2/i<số>.dat` [Suy luận] |
| `hìnhẢnh` | 90200… (nón), 70100… (áo), 80000… (vũ khí), 130000 (cánh), 9300 (thú cưng); -1 nếu không có | Hình trên người. Trùng tên các file `m90900.dat`, `pet_9300.pet` trong `dyncache` [Suy luận mạnh] |
| `hệ` | Byte cao `0x01`, `0x02`, `0x04`, `0x07`; 0 với vật phẩm thường | 1 Lôi (popup "Nón Âu Lạc hệ Lôi"), 2 Thủy ("Băng Kiếm", "Thanh Lam Đao"), 4 Hỏa ("Liệt Hỏa Đao", "Hỏa Phủ"), 7 mọi hệ. Khác số hệ `field01` của nhân vật (1 Hỏa, 4 Thủy) [Suy luận] |
| `cấpMặc` | 1, 21, 51, 101 (trang bị); 1 (khác) | Khớp các bậc cấp mặc trong Cẩm nang [Đo] |
| `giớiTính` | 0, 1 ở nón và áo; 2 ở loại khác | Một tên có hai mã, ví dụ Áo Âu Lạc 502 (0) và 509 (1). Có lẽ là nam và nữ [Suy luận] |
| `xếpChồng` | 1 (trang bị), 4, 999 | Số lượng tối đa trong một ô [Suy luận] |
| `e` | 1; 0 ở danh hiệu, thú cưng, thẻ tuần… | [Chưa rõ] |
| `độBềnTốiĐa` | 60, 300; nhẫn 30–300; 0 với vật phẩm không có độ bền | Khớp độ bền 60 của trang bị trong túi [Đo] |
| `g` | 1 (trang bị cấp 1–51), 5 (cấp 101); -1, 0 với loại khác | [Chưa rõ] |

| `loại` | Nhóm | Số món (ngừng dùng) | Ví dụ |
|---:|---|---:|---|
| 0 | Nón | 159 (128) | 48 Nón Lá, 54 Nón Âu Lạc, 59 Nón Tiên Phong |
| 1 | Áo | 149 (119) | 147 Áo Hào Kiệt, 149 Giáp Tiên Phong |
| 2 | Vũ khí | 110 (77) | 246 Đao Đại Hiệp, 261 Rìu Âu Lạc, 273 Ngư Tinh Kiếm |
| 3 | Nhẫn | 96 (80) | 306 Nhẫn Trơn, 312 Nhẫn Hào Kiệt, 318 Nhẫn Âu Lạc |
| 4 | Cánh | 6 | 393 Cánh Tiên, 396 Cánh Quỷ |
| 5 | Huyết Châu, thú cưng | 11 | 399 Huyết Châu, 423 Thú cưng Slime |
| 7 | Danh hiệu | 16 | 427 Danh hiệu 'Tân binh Cờ Lau' |
| 10 | Đá nâng cấp | 12 | 411–415 Đá cấp 1–5 ("Nguyên liệu nâng cấp vật phẩm") |
| 20 | Bình | 2 | 0 Hoàn Linh Dược ("Bơm 30% sinh lực"), 1 Kim Đan Dược ("Bơm 25% công lực") |
| 21 | Búa | 1 | 2 Búa Sửa Chữa |
| 22 | Nguyên liệu, vật phẩm khác | 74 (3) | 8 Bùa May Mắn, 9 Kim Thạch, 41 Xu khóa |
| 23 | Tăng Kinh Nghiệm | 1 | 7 Tăng Kinh Nghiệm |
| 24 | Tẩy điểm | 2 | 47 Tẩy Tủy Đan, 645 Tẩy Kinh Đan |
| 29 | Trứng | 7 | 3 Trứng Gà ("Đập ra vật phẩm ngẫu nhiên. Phí đập 500 Xu khóa, cần 3 ô trống."), 4 Trứng Linh Điểu, 5 Trứng Thần Ưng |

- Tổng 646 món, 407 món tên "Ngừng dùng". [Đo]
- Mô tả của trang bị để trống: chỉ số nằm ở từng món (bản ghi vật phẩm), không ở bảng. [Đo]
- Bảng chỉ đọc trên máy, chưa có trong repo. Các tên ở đây khớp popup trên máy (Nón Âu Lạc, Hoàn Linh Dược, Búa Sửa Chữa) và phần thưởng nhiệm vụ trong `s2c/35` ("1 Áo Hào Kiệt", "1 Nón Lá"). [Đo]

<a id="mã-chỉ-số"></a>

## Mã chỉ số (`it0`)

File `files/dyncache/it0` (387 byte): `i32 n; n × {i32 mã; string mẫu}`, với `#` là chỗ điền giá trị. Đọc hết 17 mã:

| Mã | Mẫu | Mã | Mẫu |
|---:|---|---:|---|
| 1 | # cường lực | 9 | # sinh lực |
| 2 | # nội lực | 10 | #% hấp thu sát thương |
| 3 | # thân pháp | 11 | #% đánh xuyên giáp |
| 4 | # thể lực | 12 | #% cản đòn |
| 5 | # sức tấn công | 13 | #% hồi sinh |
| 6 | # phòng thủ | 14 | #% sức tấn công |
| 7 | # né tránh | 15 | #% sinh lực |
| 8 | #% chí mạng | 16 | # chính xác |

Mã 0 có mẫu rỗng. Mã 6 và 9 khớp popup Nón Âu Lạc ("+4 phòng thủ, +58 sinh lực", E1). [Đo]

## Cách lấy lại dữ liệu

`adb shell su` chép các file trong `/data/data/com.lotasoft.colauloanthe/files/dyncache/` sang `/data/local/tmp`, rồi `adb pull`. Không dùng `adb exec-out su -c cat`: đường đó đổi mỗi byte `0a` thành `0d 0a`, làm `it1` dài thêm 29 byte và lệch bản ghi. Khi app cập nhật bảng, `itv` (hiện `0x12`) có lẽ đổi theo. [Đo]

## Chưa rõ

- `c2s/1188` chưa gửi thử: server trả gì khi nhặt được hoặc không được; có bắt đứng gần hòm không.
- Ai được nhặt món người khác làm rơi, sau bao lâu; tỉ lệ rơi theo quái.
- Loại thực thể thứ ba trong `sqhz.a17` (gửi `c2s/1181`).
- Phẩm 4 là Quý hay Sử Thi; trường `e`, `g` của bảng vật phẩm.
