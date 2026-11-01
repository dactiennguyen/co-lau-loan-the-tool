# Đồ rơi, nhặt đồ và bảng vật phẩm

Mốc: APK 1.0.3, ngày 31/10/2026. Nguồn ([các phiên](../investigation.md#nguồn-dữ-liệu)):
- **D1**: dữ liệu game tải về trên điện thoại, thư mục `files/dyncache` của app: `it1` (bảng vật phẩm), `it0` (bảng mã chỉ số), `itv` (phiên bản bảng, `0x12`), `offline-a2/cam-nang.json` (Cẩm nang).
- **S2**: `npm run scan` có `CLLT_TRACE`, đi M2, M1, M25 bằng cổng (không đi bộ, không đánh).
- **K2**: bot TS đánh một trận Cóc Xanh với manina ở M2.
- **P2**: Frida trên điện thoại (ghi mọi gói, hook 114 hàm dựng), thử bắt gói nhặt đồ. Chưa bắt được, xem [Nhặt đồ](#nhặt-đồ).
- **P3**: Frida trên điện thoại với Tiheo1 (symap, M10): bắt được gói nhặt đồ và câu trả lời của server; xem [P3](#p3).
- **K3**: bot TS với Tiheo2 (Ttuananh, cấp 15, M1): nhặt từ xa, nhặt món đã mất, và thử nhặt đồ người khác ở nhiều mốc tuổi trong 6 phút; xem [K3](#k3).
- **T3**: đọc tĩnh hàm nạp asset và lớp AES, rồi giải mã thật 246 icon; xem [Giải mã asset](#giải-mã-asset).
- **T2**: đọc tĩnh `libgdx-flashds.so`, dựng đồ thị gọi JNI của cả thư viện: hàm nào gọi phương thức Java nào. Từ đó tìm ra gói nhặt đồ, xem [Nhặt đồ](#nhặt-đồ).
- Thêm các gói vật phẩm trên đất của E1, E2 ([12-skills-items](12-skills-items.md)).
- **G1** (31/10): đọc lại log của 108 trận. 89 trận do bot TS đánh (manina cấp 8–20, Q3–Q20, M1 và M2); 19 trận qua cầu nối trên điện thoại (Tiheo2 cấp 15–18, A1 và A2, M1). Xem [Tỉ lệ rơi](#tỉ-lệ-rơi).
- **G2** (31/10): bot TS với manina (cấp 21–22, M1) đánh 6 trận Sơn Tặc và tự nhặt đồ của mình sau mỗi trận thắng; xem [G2](#g2).

Bộ giải mã và bảng vật phẩm: [src/protocol/items.ts](../../../src/protocol/items.ts), [src/protocol/world.ts](../../../src/protocol/world.ts); lệnh `npm run items` ở [src/cli/items-run.ts](../../../src/cli/items-run.ts). Test: [test/items.test.ts](../../../test/items.test.ts) (đồ trên đất, gói nhặt P3, bảng vật phẩm, icon).

Nhãn **[Đo]**, **[Suy luận]**, **[Chưa rõ]** như các file khác.

## Trả lời nhanh

| Câu hỏi | Trả lời |
|---|---|
| Đồ rơi ra sao? | Sau trận thắng quái, hòm đồ "có thể rơi xuống đất" (Cẩm nang). Server báo cho cả map: `s2c/1182` khi có món rơi, `s2c/1183` khi món mất (bị nhặt hoặc hết hạn), `s2c/1184` là danh sách món đang nằm trên đất lúc vào map hay vào khu. Mỗi món hết hạn khoảng 600 s sau khi rơi. Xem [Đồ trên đất](#đồ-trên-đất). [Đo] |
| Đánh xong có rơi đồ không, tỉ lệ bao nhiêu? | **Có, chỉ khi thắng.** 59/93 trận thắng có đồ (**63%**, khoảng tin cậy 95%: 53–73%), trung bình 0,76 món mỗi trận thắng. 0/15 trận thua có đồ. Xu khóa rơi ở 44% trận thắng, Đá 20%, trang bị 10%, Trứng Gà 2%. Trung bình mỗi trận thắng có 63 Xu khóa trên đất ở M1 và 91 ở M2, gấp 2–3 lần Vàng thưởng cuối trận (34). Bot TS tự nhặt từ G2; app Rust cũng nhặt (cài đặt Tự nhặt đồ, mặc định bật, [app Rust](../../integration/rust/features.md#tự-nhặt-đồ)). Xem [Tỉ lệ rơi](#tỉ-lệ-rơi). [Đo G1] |
| Nhặt thế nào? | Trên máy: chạm hòm rồi bấm **Nhặt**. Nút đó gửi **`c2s/1188` = `string uuid`**, uuid của món trong `s2c/1182`/`1184`. Đã bắt trên máy thật (P3, 31/10): server trả trong 52–56 ms `s2c/46` (số Xu mới), `s2c/1256` "Bạn vừa nhận được 474 Xu khóa" và `s2c/1183` (món rời khỏi đất, báo cả map). Bot TS gửi gói này ngay khi thắng trận, cho từng món của mình: 4/4 món nhặt được, server trả trong 25 ms ([G2](#g2)). Xem [Nhặt đồ](#nhặt-đồ). [Đo] |
| Nhặt đồ người khác được không? | **Được, sau khoảng 16–17 s.** Trước đó server trả `s2c/1256` "Không thể nhặt vật phẩm của người khác" (16 lần thất bại khi món 5–7 s và 16 s tuổi; nhặt được ở 17, 18, 31 s). Bản ghi đồ trên đất không có trường chủ, server tự giữ. Xem [K3](#k3). [Đo] |
| Phải đứng gần hòm không? | **Không.** Bot đứng ở (90, 640) vẫn nhặt được món ở (1520, 640), cách 1430 px, và món ở (3413, 192). [Đo K3] |
| Đồ gì rơi? | 106 món đã thấy, gần hết ở M2: Xu khóa (mã 41) 54 đống, mỗi đống 124–250; Đá cấp 1–3 (411–413) 28 viên; Trứng Gà (3) 7 quả; 12 món trang bị cấp 1 (nón, áo, nhẫn, vũ khí), mỗi món 2 chỉ số. M1: 4 đống Xu khóa, 1 Đá cấp 2. M25 không có quái. Xem [Đồ đã thấy](#đồ-đã-thấy). [Đo] |
| Mã 41 là gì? | **Xu khóa**. Trước đây đoán là tiền ([09](09-players-chat.md#ground-items)). Cẩm nang: "Kiếm Xu khóa: nhặt Xu khóa quái rơi". [Đo] |
| Tên vật phẩm lấy ở đâu? | Không có trong APK, cũng không có gói nào khi mở popup vật phẩm. Game tải bảng `it1` về máy: 646 món (407 món "Ngừng dùng"), mỗi món có tên, mô tả, loại, cấp mặc, hệ, độ bền, số xếp chồng. Repo có bản sao ở `data/items.json`. Xem [Bảng vật phẩm](#bảng-vật-phẩm). [Đo] |
| Icon vật phẩm ở đâu? | `files/dyncache/offline-a2/i<icon>.dat` trên máy, mã hoá AES-128 sau khi đảo 63 byte đầu. Đã giải mã cả 246 icon (PNG 96 × 96) và đổi sang WebP ở `data/icons/`. Xem [Giải mã asset](#giải-mã-asset). [Đo] |
| Mã chỉ số của trang bị? | Bảng `it0`: 1 cường lực, 2 nội lực, 3 thân pháp, 4 thể lực, 5 sức tấn công, 6 phòng thủ, 7 né tránh, 8 % chí mạng, 9 sinh lực… Xem [Mã chỉ số](#mã-chỉ-số). [Đo] |

<a id="nhặt-đồ"></a>

## Nhặt đồ

Cẩm nang (`cam-nang.json`, tab Trận đấu và Cơ bản) [Đo chữ của game]:
- "Đồ rơi: hòm đồ có thể rơi xuống đất sau trận; đứng lên hòm rồi bấm **Nhặt**."
- "Kiếm Xu khóa: nhặt Xu khóa quái rơi, làm nhiệm vụ hàng ngày, đầy thanh Vàng."
- "Quái quá thấp: thấp hơn bạn hơn 20 cấp thì không có kinh nghiệm, vàng và đồ rơi." Đúng như vậy ở NP1 (01/11): manina cấp 32 thắng 11 trận Sơn Tặc cấp 9 ở M1, trận nào cũng `exp` 0, `coin` 0, không có `s2c/1182`; nhiệm vụ ngày Nhặt xu không tăng. [Đo NP1]
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

Chuỗi gửi đi là trường `n` của món. Với hòm thật, `n` có lẽ là uuid trong bản ghi `s2c/1182`/`s2c/1184` ([09](09-players-chat.md#ground-items)). Tìm bằng đọc tĩnh (T2). P3 bắt được gói này trên máy: chuỗi gửi đi đúng là uuid của bản ghi đồ trên đất ([P3](#p3)). Bot TS dùng `buildRequest(1188, { uuid })` để nhặt đồ của mình sau mỗi trận thắng ([G2](#g2)). [Đo]

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

<a id="p3"></a>

**P3: bắt được gói nhặt** (Tiheo1, nhân vật symap cấp 42, M10 Cửu Phong khu 0, 31/10). Frida gắn vào game đang chạy, hook writer, reader và 114 hàm dựng gói. Chạm hòm mở hộp thoại "Xu khóa, Yêu cầu cấp: 1" với hai nút **Bỏ qua** và **Nhặt**. Bấm Nhặt:

| ms | Gói | Byte | Nghĩa |
|---:|---|---|---|
| 0 | hàm dựng `sqlq.c44("cd89eb9a-…")` | | Gọi từ `sqhz.d21` ← `sqd.a1` ← `sqak.a10`, đúng đường đọc tĩnh ở bảng trên |
| 0 | `c2s/1188` | `00000024` + 36 byte `"cd89eb9a-24f3-4cfd-a3e2-66046f4b11f5"` (40 byte) | `string uuid` của hòm |
| 52 | `s2c/46` | `"update Xu"; i64 4895400; i64 5480412; i64 8581` | Xu, Xu khóa, Lượng sau khi nhặt ([04-push](04-push.md)) |
| 54 | `s2c/1256` | `u8 0; string "Bạn vừa nhận được 474 Xu khóa"` | Dòng chữ hiện trên màn hình |
| 56 | `s2c/1183` | `string "M10"; string "cd89eb9a-…"` | Hòm rời khỏi đất, gửi cho cả map |

- Bố cục `c2s/1188` khớp đọc tĩnh, và uuid gửi đi đúng là uuid của bản ghi đồ trên đất. [Đo]
- Xu khóa vào ví nên server gửi `s2c/46` chứ không gửi `s2c/1187`. Món vào túi đi kèm `s2c/51`, cũng không phải `s2c/1187` ([K3](#k3)). [Đo]
- Trước đó người cầm máy đã tự nhặt một hòm Xu khóa khác, lúc Frida chưa gắn. Xu khóa trên bảng Bản thân tăng tổng cộng 867, tức hòm kia có 393. [Đo]
- Hòm nằm sẵn cạnh nhân vật lúc vào map, và symap chưa đánh trận nào trong phiên này. Vậy hòm có lẽ do người khác làm rơi, nhưng chưa chắc. [Suy luận]
- Trong 80 s ghi, map M10 còn rơi thêm 7 món từ trận của người khác: Xu khóa ×382 và ×476, Quặng Bậc 1, Trứng Gà, Đá cấp 4, Nhẫn Thái Cực. Món nào cũng hết hạn sau 601 s. [Đo]

<a id="k3"></a>

**K3: nhặt bằng bot TS** (Tiheo2, nhân vật Ttuananh cấp 15, M1 Làng Thanh Khê khu 0, 31/10). Bot đứng yên ở chỗ đăng nhập (90, 640), chỉ gửi `c2s/1188` với uuid lấy từ `s2c/1184`, `s2c/1182`. Tuổi của món tính bằng `hếtHạn − 601 s` so với đồng hồ máy, nên lệch được khoảng 1 s.

| Lần thử | Server trả (sau ~26 ms) |
|---|---|
| Đá cấp 2 ở (1520, 640), cách 1430 px, món cũ | `s2c/51` (ô túi 4), `s2c/1256` field 0 "Bạn vừa nhận được Đá cấp 2", `s2c/1183` |
| Cùng uuid đó lần nữa | `s2c/1256` field 1 "Không thể thực hiện" |
| Món người khác vừa làm rơi, 5–7 s và 16 s tuổi (16 lần, 13 món) | `s2c/1256` field 1 "Không thể nhặt vật phẩm của người khác" |
| Món người khác, 17 s (Đá cấp 2), 18 s (Rìu Âu Lạc), 31 s (Xu khóa ×144); món cũ 177 s (Áo Chiến ở (3413, 192)) | Nhặt được: `s2c/51` hoặc `s2c/46`, rồi `s2c/1256` field 0 |

- **Đồ người khác bị khoá khoảng 16–17 s** cho người làm rơi, sau đó ai cũng nhặt được. Nhiều món biến mất lúc 10–14 s tuổi (`s2c/1183`): chính chủ nhặt trong lúc còn khoá. [Đo]
- **Không cần đứng gần.** Server không kiểm khoảng cách: nhặt được từ 1430 px và từ đầu kia bản đồ. Game trên máy bắt đi tới hòm trước khi hiện nút Nhặt, nhưng đó là luật của client. [Đo]
- `s2c/1256` có field 0 với "Bạn vừa nhận được…" và 1 với hai câu từ chối. Field 1 không có nghĩa là lỗi: "Bạn vừa mua thành công!…" cũng là 1 ([P5](12-skills-items.md#c2s-1190)); có lẽ 1 là câu hiện giữa màn hình. [Đo]
- **`s2c/51`** (opcode trước đó chưa từng thấy): `i32 -1; i32 0; u8 1; bản ghi vật phẩm` của ô túi vừa nhận món. 3 mẫu đọc hết byte: Áo Chiến ô 5, Đá cấp 2 ô 6, Rìu Âu Lạc ô 7. Món nhặt sau vào ô trống kế tiếp; Đá cấp 2 có `xếpChồng` 1 nên viên thứ hai vào ô riêng. Bộ giải mã: `bagSlot` trong [src/protocol/world.ts](../../../src/protocol/world.ts). [Đo]
- Áo Chiến mất 844 ms mới có trả lời, các lần khác 25–30 ms. [Đo]

**Ai được nhặt.** Bản ghi đồ trên đất không có trường chủ [Đo]. Phép kiểm tra đầu tiên `sqgu.a(sqgu)` (ngen `a5`) chỉ đọc byte `a`, cờ `F` của hòm và xem hòm có trong mảng `sqil.i` không (có lẽ là danh sách đồ trên map). Chưa thấy chỗ nào so tên người chơi. Có lẽ ai cũng thấy nút "Nhặt" trên mọi hòm. [Đo tĩnh; Suy luận] Server giữ hòm cho người làm rơi khoảng 16–17 s rồi mới cho người khác nhặt ([K3](#k3)). [Đo]

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

Bước tiếp theo, đo bằng bot TS:
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
- Ai được nhặt món của người khác, và sau bao lâu: sau khoảng 16–17 s thì ai cũng được ([K3](#k3)). [Đo]

<a id="tỉ-lệ-rơi"></a>

### Tỉ lệ rơi sau trận (G1)

**Cách đếm.** Đồ của chính mình đến cùng lúc với gói kết thúc trận (`s2c/19`, `s2c/20` hay `s2c/21` có end = 1):
- trace bot TS: cùng mili-giây (0 hoặc −1 ms);
- log cầu nối trên điện thoại: sớm hơn 45–58 ms, do agent ghi gói theo lúc đọc.

Món nằm đúng chỗ nhân vật đứng, các món cùng trận cách nhau 32. Ví dụ Tiheo2 đứng ở (320, 576): món rơi ở (320, 576) và (352, 576). Script đếm mọi `s2c/1182` từ 100 ms trước đến 5 ms sau gói kết thúc. Đồ người khác rơi khoảng 4,6 món mỗi phút, nên xác suất một món của người khác lọt vào khung này là 0,8% mỗi trận. [Đo]

| Quái (map, cấp) | Trận thắng | Trận có đồ | Khoảng tin cậy 95% | Đồ đã rơi (số lần) |
|---|---:|---:|---|---|
| Sơn Tặc (M1, 9) | 40 | 30 (75%) | 60–86% | Xu khóa 21 (121–148 mỗi đống), Đá cấp 1: 6, Đá cấp 2: 3, Muôi Sắt, Khăn rằn, Khăn Vòng, Nhẫn Âu Lạc |
| Sói Xám (M2, 11) | 16 | 9 (56%) | 33–77% | Xu khóa 5 (205–247), Đá cấp 2: 2, Đá cấp 3, Khăn Vòng: 2, Trứng Gà: 2, Nhẫn Hào Kiệt |
| Cóc Xanh (M2, 13) | 14 | 9 (64%) | 39–84% | Xu khóa 7 (209–250), Đá cấp 2: 2 |
| Kẻ Gây Rối (M1, 7) | 14 | 5 (36%) | 16–61% | Xu khóa 3 (137–142), Đá cấp 2, Nón Lá |
| Chỉ Huy Sơn Tặc (M1, 10) | 7 | 5 (71%) | 36–92% | Xu khóa 4 (129–136), Đá cấp 1: 3, Áo Âu Lạc |
| Heo Mọi (M1, 7) | 1 | 1 | | Xu khóa 134, Đá cấp 2 |
| Một trận không rõ quái (A1) | 1 | 0 | | |
| **Tổng** | **93** | **59 (63%)** | **53–73%** | 71 món |

- **Thua thì không rơi gì**: 0/15 trận thua có món trong khung. [Đo]
- Số món mỗi trận thắng: 34 trận không có món, 49 trận 1 món, 8 trận 2 món, 2 trận 3 món. Trung bình 0,76 món. [Đo]
- Theo loại, tính trên 93 trận thắng: có Xu khóa 44%, Đá 20%, trang bị 10%, Trứng Gà 2%. [Đo]
- Hai nhân vật như nhau: manina 47/74 (64%), Tiheo2 12/19 (63%). Chưa thấy cấp chênh lệch ảnh hưởng tới tỉ lệ. [Đo]
- Giữa các loại quái, khoảng tin cậy còn chồng lên nhau. Kẻ Gây Rối có vẻ rơi ít hơn, nhưng chưa đủ trận để khẳng định. [Đo, mẫu nhỏ]
- Mỗi đống Xu khóa ở M1 là 121–148, ở M2 là 205–250. Sói Xám cấp 11 cho nhiều gấp rưỡi Chỉ Huy Sơn Tặc cấp 10, nên số Xu khóa có lẽ theo map hơn là theo cấp quái. [Suy luận]
- **Đồ trên đất đáng hơn thưởng cuối trận.** Trung bình mỗi trận thắng có 63 Xu khóa nằm trên đất ở M1 và 91 ở M2. Thưởng cuối trận chỉ là Vàng, trung bình 34 (74 trận của bot TS). Vàng chỉ đổi ra Xu khóa khi đầy thanh 10.000 ([04-push](04-push.md)). Nhặt từ xa được, và trong 16–17 s đầu chỉ người làm rơi nhặt được ([K3](#k3)). Vì vậy bot nhặt ngay sau gói kết thúc trận mà không phải đi tới hòm. Bot TS làm vậy từ G2; app Rust cũng vậy ([Tự nhặt đồ](../../integration/rust/features.md#tự-nhặt-đồ)). [Đo]

<a id="g2"></a>

### Bot tự nhặt sau trận (G2)

Bot TS ([quest-bot](../../integration/nodejs/quest-bot.md#chạy), mặc định bật, tắt bằng `--no-pickup`) nhớ mọi `s2c/1182` trong 2 s gần nhất. Khi thắng một trận, bot gửi `c2s/1188` cho mỗi món đến trong khoảng 300 ms quanh gói kết thúc trận. Các món cách nhau 200 ms. Thua thì không nhặt. Code: `pick()` trong [src/bot/quest.ts](../../../src/bot/quest.ts); test trong [test/quest.test.ts](../../../test/quest.test.ts).

Chạy thật 31/10 với manina (cấp 21, lên 22 ở trận 4), M1, `--farm="Sơn Tặc" --fights=6`:

| Trận | Kết quả | Món rơi (`s2c/1182`, cùng mili-giây với gói kết thúc) | Server trả lời `c2s/1188` sau 25–26 ms |
|---:|---|---|---|
| 1 | thắng | Xu khóa ×137 | `s2c/46` Xu khóa 8.357 → 8.494, `s2c/1256` "Bạn vừa nhận được 137 Xu khóa", `s2c/1183` |
| 2 | thắng | Xu khóa ×131 | `s2c/46` → 8.625, `s2c/1256`, `s2c/1183` |
| 3 | thắng | Áo Âu Lạc (+6 phòng thủ, +4 thể lực) | `s2c/51` (ô túi 6), `s2c/1256` "Bạn vừa nhận được Áo Âu Lạc", `s2c/1183` |
| 4 | thắng | Xu khóa ×137 | `s2c/46` → 8.762, `s2c/1256`, `s2c/1183` |
| 5, 6 | thắng | không rơi | |

- 4/6 trận có đồ (Sơn Tặc ở G1: 75%). Bot nhặt đủ 4/4 món: 405 Xu khóa và 1 Áo Âu Lạc. Cùng 6 trận đó, Vàng thưởng cộng lại là 186. [Đo]
- Không nhặt nhầm món nào. Một món của người khác rơi 511 ms trước gói kết thúc trận 2, ngoài khung 300 ms, nên bot để lại. Không có lần nào server trả "Không thể nhặt". [Đo]
- Đồ mình rơi luôn đến trước gói kết thúc trong cùng lần đọc. Vì vậy gói nhặt đi ngay trong mili-giây đó, trước cả `s2c/10` và `s2c/36` của trận. [Đo]
- Chưa thử: túi đầy; app Rust với server thật (đã port, test bằng gói thật). [Chưa rõ]

<a id="hiển-thị-đồ-trên-đất"></a>

### Hiển thị trên máy và danh sách của một map (P3, M10)

Game vẽ mỗi món trên đất là **cùng một hình rương màu cam** ở (x, y) của bản ghi. Rương không ghi tên hay số lượng. Chạm vào rương thì mới hiện hộp thoại: icon của món (`data/icons/i<icon>.webp`), tên, "Yêu cầu cấp: n" (`cấpMặc` trong [bảng vật phẩm](#bảng-vật-phẩm)), hai nút **Bỏ qua** và **Nhặt**. [Đo]

Đổi khu 0 → 1 → 0 trên máy để có `s2c/1184` của từng khu. Thứ tự gói: `c2s/1173` → `s2c/13` → client gửi `c2s/11`, `c2s/43` → `s2c/11`, `s2c/43`, `s2c/1177`, `s2c/1263`, `s2c/1212`, rồi `s2c/1184`. [Đo]

| Khu | Số món | Các món (mã) |
|---|---:|---|
| 0 (7–8 người) | 20 | Gỗ Bậc 1 (604) ×2–6: 6 đống; Quặng Bậc 1 (598) ×2–6: 5 đống; Đá cấp 3 (413) ×2; Đá cấp 4 (414); Xu khóa (41) ×381 và ×420; Da Bậc 1 (592) ×2; Linh Thạch Bậc 1 (610) ×2; Trứng Gà (3); Nhẫn Thái Cực (333, Hỏa, +14 sức tấn công, +23 thân pháp) |
| 1 (1–3 người) | 5 | Gỗ Bậc 1 ×4–6: 3 đống; Quặng Bậc 1 ×4; Nón Tiên Phong (59, Lôi, +7 phòng thủ, +14 thân pháp) |

- Món còn nằm từ 36 s tới 589 s nữa mới hết hạn. Nhiều món nằm đó vài phút mà không ai nhặt. [Đo]
- Ở map cấp 40, quái rơi chủ yếu nguyên liệu Bậc 1 (Gỗ, Quặng, Da, Linh Thạch), Đá cấp 3–4, Xu khóa 381–476 mỗi đống, thỉnh thoảng một trang bị 2 chỉ số. [Đo 1 lần]
- Các món rơi cùng một trận nằm cách nhau 32 đơn vị, ví dụ Xu khóa ×420 @466 và Gỗ ×6 @498. [Đo]
- Bot TS ghi danh sách này theo tên khi vào map: sự kiện `ground_items` của `npm run scan` ([quest-bot](../../integration/nodejs/quest-bot.md#quét-map)).

<a id="đồ-đã-thấy"></a>

### Đồ đã thấy

106 món khác uuid, gộp từ S2, K2, P2, E1, E2. Tên lấy từ [bảng vật phẩm](#bảng-vật-phẩm).

| Map | Mã | Món | Số lần | Số lượng | Hệ | Chỉ số (mẫu) |
|---|---:|---|---:|---|---|---|
| M2 | 41 | Xu khóa | 54 | 124–250 | | |
| M2 | 413 | Đá cấp 3 | 13 | 1 | | |
| M2 | 412 | Đá cấp 2 | 12 | 1 | | |
| M2 | 3 | Trứng Gà | 7 | 1 | | |
| M2 | 411 | Đá cấp 1 | 3 | 1 | | |
| M2 | 502, 509 | Áo Âu Lạc | 3 | 1 | Hỏa, Lôi, Thủy | 6: 5, 2: 6 |
| M2 | 217 | Áo Hào Kiệt | 2 | 1 | Lôi, Thủy | 6: 6, 1: 5 |
| M2 | 312 | Nhẫn Hào Kiệt | 2 | 1 | Hỏa, Lôi | 5: 9, 8: 1 |
| M2 | 273 | Ngư Tinh Kiếm | 2 | 1 | Thủy | 5: 7, 3: 7 |
| M2 | 318 | Nhẫn Âu Lạc | 1 | 1 | Hỏa | 5: 7, 2: 14 |
| M2 | 54 | Nón Âu Lạc | 1 | 1 | Hỏa | 6: 4, 9: 52 |
| M2 | 99 | Khăn Vòng | 1 | 1 | Hỏa | 6: 5, 9: 71 |
| M1 | 41 | Xu khóa | 4 | 126–143 | | |
| M1 | 412 | Đá cấp 2 | 1 | 1 | | |

- **Trang bị rơi** đều là món cấp mặc 1, độ bền 60, đủ các hệ. Mỗi món có đúng 2 chỉ số. Chỉ số đầu theo ô: nón và áo là 6 (phòng thủ), nhẫn và vũ khí là 5 (sức tấn công). Chỉ số sau thay đổi: 1–4 (tiềm năng), 8 (% chí mạng) hoặc 9 (sinh lực). [Đo]
- **Hệ**: byte trước đây ghi là "phẩm" chính là hệ của món. Popup ngày 31/10: 1 có ngọn lửa (Hỏa), 2 có tia sét (Lôi). 4 là Thủy theo cách đánh số hệ nhân vật ([12](12-skills-items.md#bản-ghi-vật-phẩm)). Vật phẩm không phải trang bị có `0xff`. Cùng một món rơi ra với nhiều hệ khác nhau (Áo Âu Lạc có cả ba hệ). [Đo 1, 2; Suy luận 4]
- **Phẩm chất**: mọi trang bị đã mở popup đều là "Hiếm". Bốn tên phẩm trong `.so` đứng cạnh nhau: "Hiếm", "Thường", "Quý", "Sử Thi". Có lẽ phẩm chất là `field4` của bản ghi vật phẩm: 1 ở mọi trang bị, 0 ở thú cưng ([12](12-skills-items.md#cường-hoá)). [Suy luận]
- M2 có quái cấp 7–20 ([atlas](06-map-mobs.md#atlas)). Chưa biết món nào rơi từ quái nào. [Chưa rõ]

<a id="bảng-vật-phẩm"></a>

## Bảng vật phẩm (`it1`)

File `files/dyncache/it1` (73195 byte) của app, đọc bằng root. Bố cục được kiểm trên cả 646 bản ghi, đọc hết đúng tới byte cuối:

```text
i32 n; n × {
  i32 mã; string tên; string môTả; u8 loại; i32 biểuTượng; i32 hìnhẢnh; i32 hệ (chưa rõ);
  u8 cấpMặc; u8 giớiTính; i32 xếpChồng; u8 e; i32 độBềnTốiĐa; i32 g
}
```

| Trường | Giá trị | Nghĩa |
|---|---|---|
| `loại` | Xem bảng dưới | Ô trang bị hoặc nhóm vật phẩm [Đo theo tên] |
| `biểuTượng` | 0–244 (226 giá trị) | Icon: file `offline-a2/i<số>.dat`. Máy có đủ `i0.dat`–`i245.dat`, mọi giá trị đều có file. Giải mã ra icon đúng món: `i0` là bình máu của Hoàn Linh Dược. [Đo] |
| `hìnhẢnh` | 90200… (nón), 70100… (áo), 80000… (vũ khí), 130000 (cánh), 9300 (thú cưng); -1 nếu không có | Hình trên người: file `<số>.dat`, `m<số>.dat` hoặc `pet_<số>.pet` trong `offline-a2`. 103/104 giá trị của món còn dùng có file; giá trị 8 thì không. `90200.dat` (Nón Lá) giải mã ra sprite sheet của chiếc nón. [Đo] |
| `hệ` (`elementBits` trong `data/items.json`) | Byte cao `0x01`, `0x02`, `0x04`, `0x07`; 0 với vật phẩm thường | **Không phải hệ của món.** Nón Âu Lạc (54) có 1 ở đây mà chiếc manina đang mặc là Lôi. Hệ thật nằm ở byte `hệ` của bản ghi vật phẩm ([12](12-skills-items.md#bản-ghi-vật-phẩm)). Trước đây đoán 1 Lôi, 2 Thủy, 4 Hỏa, nhưng tên món không khớp: hệ 1 có cả "Lôi Kiếm" lẫn "Hỏa Kiếm". [Chưa rõ] |
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
- Id liền nhau từ 0 tới 645, không trùng. Còn dùng 239 món. [Đo]
- Asset nằm trên máy, trong `files/dyncache/offline-a2/` (1305 file, 148 MB): 985 `.dat`, 189 `.fx`, 126 `.meta`, 3 `.pet`. APK không có icon vật phẩm. File `.dat` đã mã hoá, xem [Giải mã asset](#giải-mã-asset). [Đo]
- Bảng có trong repo: [data/items.json](../../../data/items.json), cùng 17 mẫu chỉ số và byte phiên bản `itv`. Icon WebP nằm ở [data/icons/](../../../data/icons/). Cả hai dựng lại bằng `npm run items` ([Cách lấy lại dữ liệu](#cách-lấy-lại-dữ-liệu)). Các tên khớp popup trên máy (Nón Âu Lạc, Hoàn Linh Dược, Búa Sửa Chữa) và phần thưởng nhiệm vụ trong `s2c/35` ("1 Áo Hào Kiệt", "1 Nón Lá"). [Đo]

<a id="giải-mã-asset"></a>

### Giải mã asset (`offline-a2/*.dat`)

```text
file = AES-128-ECB(PKCS#7)(asset), rồi đảo ngược 63 byte đầu
asset = AES-128-ECB-decrypt(đảo ngược 63 byte đầu của file), khoá a84cdae8d8757c5b29e158cdcef70efd
```

Đọc tĩnh (T3) [Đo tĩnh]:
- Hàm nạp `com.tlgdx.twelvelord.sqo.b6(path)` đọc byte của file. Đường dẫn `offline/…` lấy từ kho tải về, đường khác lấy từ APK.
- Rồi `sqo.a(byte[], 63)` (ngen `a8`) đảo ngược 63 byte đầu tại chỗ.
- Rồi `com.e.sqa.b(byte[])` giải mã AES/ECB/PKCS5Padding. Không có provider thì dùng bản AES tự viết `com.tlgdx.twelvelord.sqn` (Nk 4, Nr 10).
- Khoá 16 byte do hàm khởi tạo tĩnh của `com.e.sqa` ghi từng byte bằng `bastore`.

Đã kiểm bằng cách giải mã thật [Đo]:
- 246/246 file `i<số>.dat` ra PNG. `i0.dat` là icon 96 × 96 RGBA của Hoàn Linh Dược.
- `90200.dat` là sprite sheet 2048 × 162 của Nón Lá: các góc nhìn và khung hình của chiếc nón trên người nhân vật.

Trước bước đảo, các icon trùng nhau từ byte 31 tới byte 62. Sau khi đảo, đoạn đó thành hai khối AES đầu, là phần đầu PNG giống nhau ở mọi icon.

Icon xuất ra WebP, mặc định chất lượng 90 với alpha nguyên vẹn: 246 icon từ 4,37 MB PNG còn 0,80 MB. `--lossless` giữ đúng từng điểm ảnh, mỗi icon khoảng 12 KB thay vì 3,3 KB. [Đo]

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

```bash
npm run items -- --adb=192.168.2.3:5555        # điện thoại đã root, không cần mở game
npm run items -- --from=<thư mục có it0, it1, itv, offline-a2/>
npm run items -- --adb=192.168.2.3:5555 --apk=colauloanthe.1.0.3.apk   # thêm ảnh nền cây kỹ năng từ APK
```

Lệnh này ([src/cli/items-run.ts](../../../src/cli/items-run.ts)) làm các việc sau:
- Ghi lại `data/items.json`.
- Giải mã `offline-a2/i*.dat` thành PNG, rồi đổi sang WebP trong `data/icons/` bằng `cwebp`. `--png=<thư mục>` giữ thêm các PNG.
- Cắt `offline-a2/skill<hệ>.dat` và `skill<hệ>grey.dat` thành từng icon kỹ năng trong `data/icons/skills/` ([tab Kỹ năng](12-skills-items.md#tab-kỹ-năng)).
- Với `--apk`, giải mã thêm ảnh nền cây kỹ năng `assets/x1/skill/tree-skill.dat`, ghi ra `data/icons/skills/tree.webp`.

`--adb` dùng `su` chép các file cần dùng trong `/data/data/com.lotasoft.colauloanthe/files/dyncache/` sang `/data/local/tmp`, `adb pull` về, rồi xoá bản chép trên máy. Không dùng `adb exec-out su -c cat`: đường đó đổi mỗi byte `0a` thành `0d 0a`, làm `it1` dài thêm 29 byte và lệch bản ghi. Khi game cập nhật bảng, `itv` (hiện 18) có lẽ đổi theo. [Đo]

Code đọc bảng và giải mã: [src/protocol/items.ts](../../../src/protocol/items.ts). Bot TS dùng tên đồ ở hai chỗ:
- `npm run quest` ghi túi đồ mỗi khi đổi (`s2c/1187`, sự kiện `inventory`).
- `npm run scan` ghi đồ đang nằm trên đất của từng map (`s2c/1184`, sự kiện `ground_items`).

<a id="todo"></a>

## Còn để sau (TODO)

**Nhặt đồ người khác bỏ lại** (app Rust; người dùng hỏi 01/11, chưa làm). Hiện app chỉ nhặt đồ của mình ([Tự nhặt đồ](../../integration/rust/features.md#tự-nhặt-đồ)).
- **Giữ danh sách đồ trên đất của khu đang đứng:**
  - đọc `s2c/1184` lúc vào map hay đổi khu (app chưa đọc gói này; bot TS đọc bằng `groundItems`);
  - thêm món theo `s2c/1182`;
  - bỏ món theo `s2c/1183`.

  Hiện app chỉ nhớ `s2c/1182` trong 2 s.
- **Chỉ nhặt món đủ tuổi:** tuổi = bây giờ − (hếtHạn − 601 s). Nhặt từ 18 s tuổi trở lên, vì đồ bị khoá 16–17 s cho người làm rơi ([K3](#k3)). Nhặt giữa các trận, sau khi nhặt đồ của mình, mỗi món cách nhau 200 ms.
- **Không di chuyển:** server không kiểm khoảng cách ([K3](#k3)).
  - Dịch chuyển bằng một gói `c2s/1169` thì người khác thấy nhân vật nhảy tới hòm.
  - Đi bộ thật thì app chưa có.
- **Lọc theo món:** bản ghi trên đất đã có mã món, số lượng, hệ, chỉ số và độ bền ([Đồ trên đất](#đồ-trên-đất)), nên bot biết món gì trước khi nhặt. Lọc được theo:
  - Xu khóa;
  - nguyên liệu theo bậc;
  - Đá từ cấp N;
  - trang bị đúng hệ và đúng giới tính của nhân vật.
- **Túi đầy:**
  - luôn nhặt Xu khóa, vì vào ví chứ không vào túi;
  - nhặt món có `xếpChồng` 999 (nguyên liệu, Trứng Gà, Băng Tâm, Hoàn Linh Dược, Búa Sửa Chữa) khi túi đã có ô cùng món mà cộng vào chưa quá 999;
  - bỏ qua Đá cấp 1–12 và trang bị (`xếpChồng` 1). [Suy luận từ [bảng vật phẩm](#bảng-vật-phẩm)]
- **Cần đo trước khi làm:**
  - nhặt lúc túi đầy thì server trả gì, có cộng vào ô cùng món không;
  - món nhặt về có cộng vào ô cũ không, kể cả khi một bên đã khoá giao dịch;
  - nhặt trong lúc đang đánh được không;
  - nhặt từ xa liên tục có bị server để ý không.

## Chưa rõ

- `c2s/1188`: túi đầy thì server trả gì; thời gian khoá có đổi theo loại món, hay khi người làm rơi ở trong tổ đội không.
- Tỉ lệ rơi của từng loại quái: mỗi loại mới có 7–40 trận thắng, khoảng tin cậy còn rộng ([Tỉ lệ rơi](#tỉ-lệ-rơi)). Chênh cấp có làm giảm tỉ lệ không: Cẩm nang chỉ nói quái thấp hơn quá 20 cấp thì không rơi.
- Loại thực thể thứ ba trong `sqhz.a17` (gửi `c2s/1181`).
- Phẩm chất có đúng là `field4` không (cần một món không phải Hiếm); trường `hệ` (`elementBits`), `e`, `g` của bảng vật phẩm; hệ 4 có đúng là Thủy không.
