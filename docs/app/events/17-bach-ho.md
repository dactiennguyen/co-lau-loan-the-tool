# Bạch Hổ Thống Lĩnh (boss thế giới)

Mốc: APK 1.0.3 (`libgdx-flashds.so` arm64, SHA-256 trong [artifact](../artifact.md)), bảng vật phẩm 29. Nguồn:

- **Cẩm nang** của game: `cam-nang.json` chép từ điện thoại ngày 16/11, trang "Bạch Hổ". Chữ trích nguyên văn có nhãn [Cẩm nang].
- **Đọc tĩnh** (01/11 và 16/11):
  - jadx của `classes.dex` cho tên lớp, field, chữ ký và hằng số; thân hàm là `native`.
  - r2 trên `libgdx-flashds.so` cho thân hàm: các lần gọi lại Java qua JNI theo thứ tự, và tham số khi dựng đối tượng.
- **Đo thật BH1** (bot TS, tiheo2, 20/11 15:08, ngoài giờ, khai `0.0.7`): một `s2c/1252` ([dưới](#bh1)). Chưa vào Hang Bạch Hổ lần nào.
- **Game 1.1.0** (20/11): chuỗi mới trong `libgdx-flashds.so` ([dưới](#game-110)).

Nhãn: **[Đo]** (đọc từ code hoặc file), **[Suy luận]**, **[Chưa rõ]**, **[Cẩm nang]**.

## Tóm tắt

| Câu hỏi | Trả lời |
|---|---|
| Là gì, ở đâu, khi nào? | Boss thế giới ở **Hang Bạch Hổ (Luyện Ngục)**, **9 giờ tối mỗi ngày (21:00–21:59)**, từ cấp 30. Người dùng xác nhận 21/11 là 9 giờ tối; bản trước ghi 9:00 sáng là đọc nhầm. Giờ kết thúc 21:59 là [Suy luận]. [Cẩm nang; người dùng] |
| Đánh thế nào? | Mọi người cùng đánh vào **một thanh máu**. Trong trận không có kinh nghiệm, vàng, đồ rơi; thua không bị trừ kinh nghiệm. [Cẩm nang] |
| Thưởng? | Boss bị tiêu diệt thì **top 5 sát thương** và **người kết liễu** nhận quà qua Hòm thư. Người kết liễu phải gây đủ sát thương tối thiểu mới có thưởng. Hết giờ mà boss chưa chết thì không ai nhận. [Cẩm nang] |
| Còn gì nữa? | +3 Điểm năng động mỗi ngày khi tham gia, từ cấp 30 ([14-npc](14-npc.md)). Bình Huyết Linh: mặc Băng Kiếm, đánh đủ sát thương thì bình rỗng trong túi thành bình đầy, tối đa 3 bình mỗi lần boss xuất hiện ([15-shops](15-shops.md), [16-upgrade](16-upgrade.md)). [Cẩm nang] |
| Xem bảng xếp hạng? | Nút bảng xếp hạng cạnh nút chat trong trận. Client gửi `c2s/1252` (rỗng), server trả `s2c/1252` (máu boss, số người, top sát thương, hạng của mình). Xem [Gói](#gói). [Cẩm nang; Đo] |
| Vào hang bằng cách nào? | Cổng Luyện Ngục (M15), tầng dưới cùng, cổng 1006 → **Hang Bạch Hổ (M24)**: `c2s/13 ("M15", 1006)`. Vào được ngoài giờ boss, không cần nhẫn ([19-luyen-nguc](19-luyen-nguc.md#hang-bạch-hổ-m24)). [Đo LN1] |
| Mất phí không? | **[Chưa rõ]** File chạy có câu "Bạn không đủ Xu để tham gia trận đánh này!", chưa biết thuộc trận nào. |

## Gói

```text
Bấm bảng công trạng / Làm mới:  sqid.c()  →  sqlq.Y()      →  C→S 1252 (rỗng)
Server trả:                     sqnw.d9 (bảng nhảy theo opcode)  →  sqnw.B(sqi)
                                →  sqrj.a(sqi) dựng sqrk  →  sqoo.run  →  sqid.a(sqrk) vẽ hộp thoại
```

Opcode trên dây: 1252 ↔ 33571111 ([opcode map](../opcode-map.md)).

### `c2s/1252`: hỏi bảng

- Hàm dựng `com.mh.sqlq.Y()`, mã native `__ngen_com_mh_sqlq_282 … native_Y173` ở `0x13980d0`. [Đo]
- Hàm chỉ dựng gói số `0x4e4` (1252) bằng constructor của `sqi`, rồi gửi. Không có lời gọi ghi trường nào, nên **thân gói rỗng** ([c2s-builders](../c2s-builders.md)). [Đo]

### `s2c/1252`: bảng Bạch Hổ

Hàm đọc là `com.mh.sqrj.a(sqi)`, mã native ở `0x16e451c`. Thứ tự đọc lấy từ các lần gọi `CallByteMethod`, `CallIntMethod`, `CallObjectMethod` của nó; tham số lấy từ lần gọi constructor `sqrk(int, int, int, int, long, Array, int, int)` ở `0x16e6414`. [Đo]

| # | Kiểu | Đích | Ý nghĩa |
|---:|---|---|---|
| 1 | u8 | `sqrk.a` | Trạng thái. `sqrj` có ba hằng số 0, 1, 2. Thứ tự "chưa mở / đang đánh / đã kết thúc" là [Suy luận] theo chữ của hộp thoại. |
| 2 | i32 | `sqrk.b` | Máu hiện tại của boss. |
| 3 | i32 | `sqrk.c` | Máu tối đa. `sqrk.b()` = b × 100 / c, là % máu trên hộp thoại. |
| 4 | i32 | `sqrk.d` | Số người tham gia (hộp thoại ghi "… người tham gia"). [Suy luận] |
| 5 | i32 | không lưu | Số dòng xếp hạng n. Code so với 65 (`cmp 0x41`); `sqrj` có hằng 64, nên đọc tối đa 64 dòng. |
| 6 | n × { i32, i32, string, i32 } | `sqrk.f` (Array của `sqrl`) | Mỗi dòng là `new sqrl(int a, int b, String c, int d)` rồi thêm vào Array. `c` là tên. Đoán `a` là hạng, `b` là mã nhân vật, `d` là sát thương. [Suy luận] |
| 7 | i32 | `sqrk.g` | Hạng của mình. `sqrk.c()` = g > 0: hiện "Bạn (hạng …)", không thì "Bạn - chưa gây sát thương". |
| 8 | i32 | `sqrk.h` | Đoán là sát thương của mình. [Suy luận] |
| — | long | `sqrk.e` | Không đọc từ gói: client luôn truyền 0. [Đo] |

Chữ của hộp thoại `com.g.c.sqid`: "Bạch Hổ Thống Lĩnh", "Đang tải...", "Chưa có ai gây sát thương". Trong `libgdx-flashds.so` còn có " người tham gia", "Hang chưa mở", "BẢNG CÔNG TRẠNG", "HP 0% - Đã kết thúc", "Bạn (hạng ", "Bạn - chưa gây sát thương". [Đo]

Hộp thoại được mở từ `com.g.sqa` và `com.g.m.sqai` (chưa đọc). Bấm nút làm mới (`sqig`) thì gửi lại `c2s/1252`; `sqif` và `sqie` đóng hộp thoại. [Đo]

<a id="bh1"></a>

## Đo BH1: `s2c/1252` ngoài giờ

Bot TS đăng nhập tiheo2 (akaito cấp 13, M1) lúc 15:08 ngày 20/11, gửi `c2s/1252` rỗng. Server trả ngay, dù nhân vật không ở trong hang và chưa đủ cấp 30:

```text
02 000003e8 000003e8 00000000 00000000 00000000 00000000      (25 byte)
trạng thái 2; máu 1000; máu tối đa 1000; 0 người; 0 dòng; hạng 0; 0
```

Bố cục khớp đúng hàm đọc tĩnh ở trên, đọc hết byte. Ngoài giờ trạng thái là **2** và máu đầy. Vì máu đầy, 2 nhiều khả năng là "Hang chưa mở", không phải "HP 0% - Đã kết thúc" như đoán trước đây [Suy luận]. Lúc đo là 15:08, ngoài khung 21:00–21:59. `bachHoBoard` của bot TS đọc gói này; app Rust chưa đọc. [Đo]

Cũng trong BH1: Làng Thanh Khê vẫn đúng 7 NPC như trước (Hương Lão, Vệ Binh, Thành Chủ, Bà Tư Hạnh, Lái Buôn, Pháp sư, Ngọc Nga), không có NPC mới nào dẫn vào hang. [Đo]

<a id="game-110"></a>

## Game 1.1.0: chuỗi liên quan

Chuỗi UTF-8 trong `libgdx-flashds.so` của APK 1.1.0 [Đo], cách hiểu là [Suy luận]:

| Chuỗi | Gợi ý |
|---|---|
| "Tham gia ngay" | Nút của một lời mời hay thông báo: nhiều khả năng đến 9:00 game hiện hộp mời vào Bạch Hổ, bấm thì gửi gói vào hang |
| "Kết quả Bạch Hổ" | Hộp kết quả khi boss chết hay hết giờ (mới so với 1.0.3) |
| "Bạn không đủ Xu để tham gia trận đánh này!" | Có thể vào trận Bạch Hổ tốn Xu |
| "Hang chưa mở", "BẢNG CÔNG TRẠNG", " người tham gia", "Bạch Hổ Thống Lĩnh" | Hộp bảng công trạng (`s2c/1252`) |
| "Luyện Ngục" | Tên map trên bản đồ thế giới (atlas chưa có map nào tên này) |
| "Ai đi Bạch Hổ không?" | Câu chat mẫu |

Chưa tìm được hàm native nào dùng "Tham gia ngay": bản 1.1.0 nạp chuỗi qua `string_pool` riêng của từng lớp, cách tìm xref của 1.0.3 không áp dụng được. [Chưa rõ]

**Vào hang:** đã biết (M15, cổng 1006, [19-luyen-nguc](19-luyen-nguc.md#hang-bạch-hổ-m24)). **Đánh boss thế nào: chưa đo.** Các nick nay đã trên cấp 30 (21/11: 80–91). Cách đo chắc nhất: lúc 21:00–21:59, trên điện thoại, nick cấp 30 trở lên, gắn Frida bắt gói như VG1 ([02-login](02-login.md#vg1)), rồi bấm "Tham gia ngay" (hay tìm nút Bạch Hổ ở Sự kiện). Gói gửi đi lúc đó là gói vào hang.

## Đọc tĩnh 1.1.0

Ngày 21/11: bậc, kết quả, gói thách đấu.

Nguồn: `libgdx-flashds.so` và jadx của bản 1.1.0 trên điện thoại. Cách tìm: mọi lớp native dùng chung một kho chuỗi (`native_jvm::string_pool::get_pool()` = `0x3899400`), mỗi chuỗi được nạp bằng `kho + độ lệch` (`add`, hoặc `mov`/`movk` rồi `add`). Quét các độ lệch đó trong `.text` thì ra hàm và lớp dùng chuỗi; thứ tự đọc gói lấy từ dãy `GetMethodID` của lớp đọc gói (`a ()B` = u8, `b ()S` = i16, `c ()I` = i32, `d ()J` = i64, `f ()String`). [Đo]

**Bạch Hổ có nhiều bậc.** Hộp "Kết quả Bạch Hổ" (`com.g.e.sqjx`) có chữ "Chưa có ai trong bậc này"; bảng công trạng (`com.g.e.sqjs`) có nút "Xem tất cả bậc". Các chữ hộp kết quả dùng nằm trong mảng `cstrings` của `com.mh.sqtq` (tạo lúc nạp lớp bằng `NewStringUTF`, rồi mỗi hàm đọc `cstrings[i]`): "Phiên ", "Bậc ", "Cấp ", "+", " - ", "   Ngưỡng ", " người", "Kết liễu: ", " (", ")", "Bạn: ", ", hạng ", " (chưa đạt ngưỡng)", "Bạn chưa đánh phiên này", "Đang diễn ra - HP ", "%", "Boss đã bị tiêu diệt", "Boss đã tẩu thoát - HP ", "Chưa có phiên nào". Ghép từng hàm của `sqtq` với trường nó đọc (`GetIntField` + tên trường) và chữ nó nối thì ra nghĩa của các trường [Đo]:

| Hàm `sqtq` | Đọc | Chữ hiện ra |
|---|---|---|
| `a(int)` | số bậc | "Bậc " + n |
| `a(sqtn)` | `c`, rồi `b`, `c` | "Cấp " + b + " - " + c, hay "Cấp " + b + "+" ở bậc cuối: **bậc là một khung cấp nhân vật** |
| `b(sqtn)` | `a(sqtn)`, `d`, `e` | "Cấp …   Ngưỡng " + d (số có dấu chấm) + "   " + e + " người" |
| `a(sqto)` | `a`, `c()` | theo `a`: 0 "Đang diễn ra - HP " + % máu; 1 "Boss đã bị tiêu diệt"; 2 "Boss đã tẩu thoát - HP " + %; khác "Chưa có phiên nào" (nhánh `cmp w8, 2` / `cmp w8, 1` / `cbnz`) |
| `b(sqto)` | `b` (i64) | "Phiên " + ngày giờ (`sqtg.a(long)`) |
| `c(sqto)` | `a()`, `f`, `g`, `h` | "Kết liễu: " + f + " (Bậc " + g + ")" + h (sát thương) khi `a()` (`e` > 0) |
| `d(sqto)` | `b()`, `j`, `k`, `m` | "Bạn chưa đánh phiên này" khi chưa đánh; không thì "Bạn: Bậc " + j + ", hạng " + k, thêm " (chưa đạt ngưỡng)" khi `m` sai |
| `e(sqto)` | `i`, `j` | bậc của mình trong danh sách bậc |
| `sqto.c()` | `a`, `d`, `c` | % máu = c × 100 / d |

Vậy: mỗi tối là một **phiên**, chung **một thanh máu boss**. Người chơi được chia **bậc theo cấp nhân vật**; mỗi bậc có **ngưỡng** sát thương (dưới ngưỡng thì "chưa đạt ngưỡng"), **số người** và bảng xếp hạng riêng. Bậc của mình do server gửi. [Đo]

**`1275` = Kết quả Bạch Hổ.** `com.mh.sqtm` có hằng 1275; `sqtm.a(sqi)` đọc `s2c/1275` thành `sqto`. `c2s/1275` là `sqnf.Z()` (rỗng), do hộp `sqjx` gửi khi mở từ nút "Xem tất cả bậc" (`sqjw.clicked` → `sqjx`). Bố cục [Đo thứ tự đọc; nghĩa theo bảng trên]:

```text
u8 trạng thái (sqto.a); i64 phiên (b); i32 máu (c); i32 máu tối đa (d); i32 id người kết liễu (e, > 0 khi có)
string người kết liễu (f); u8 bậc của họ (g); i32 sát thương của họ (h)
u8 n bậc (i), mỗi bậc sqtn:  u8 bậc (a); i16 cấp từ (b); i16 cấp tới (c); i32 ngưỡng (d); i32 số người (e); u8 m dòng
    mỗi dòng sqtp:  u8 hạng; i32 id; string tên; i16 cấp; i32 sát thương   (+ boolean client tự tính)
u8 bậc của mình (j); i32 hạng (k); i32 sát thương (l); u8 đạt ngưỡng (m)
```

**Bảng công trạng và nút Bạch Hổ.** Nút Bạch Hổ trên màn chơi (`com.g.r.sqae.touchDown`, lớp nghe chạm của thanh trên) chỉ mở hộp bảng công trạng `sqjs`; hộp gửi `sqnf.Y()` khi mở và khi Làm mới (`c2s/1252`). Không có gói "vào Bạch Hổ" riêng: vào hang rồi thách đấu boss như thường. [Đo]

**Gói thách đấu chọn theo loại quái.** `com.mh.sqeo.a(int loại, boolean z)` (`0xba2be4`): `loại == 2` hoặc `z` → **1181**; `loại == 1` → **1178**; còn lại → **15**. `sqip.a(sqkd, boolean, int, boolean)` (màn bản đồ, `0xf1ecf8`) đọc `loại` từ byte `sqkf.h` của thực thể rồi gọi `sqnf.b(String, Z)` (15), `sqnf.a(String, Z)` (1178) hay `sqnf.a(String, int, Z)` (1181). `s2c/43` không mang byte loại (byte `a` là hệ, [06](06-map-mobs.md#hệ-của-quái)), nên loại do nguồn của thực thể: quái của `s2c/43` là 0, boss của `s2c/1177` là 1, quái tỷ thí của `s2c/1180` là 2 (`c2s/1181`, [10](10-quests.md#s2c-1180)). App làm đúng quy tắc này: boss của `s2c/1177` → `c2s/1178`, còn lại `c2s/15`. Bạch Hổ đến qua gói nào vẫn [Chưa rõ]; không thấy gói mới nào của 1.1.0 (1273, 1276, 1280, 1283) là boss. [Đo]

**Khác:** "Bạn không đủ Xu để tham gia trận đánh này!" thuộc `com.mh.sqna` (lớp xử lý gói của server), nên là lời server trả cho một lần thách đấu, chưa biết của trận nào. "Không thấy boss trên bản đồ" thuộc `com.mh.b.sqa`, bộ "Tự động" có sẵn trong game: nó biết đi đánh boss trên bản đồ. [Đo]

## App: cửa sổ Bạch Hổ (21/11, chưa chạy thật)

Nút **Bạch Hổ** ở cuối thanh bên mở cửa sổ chung cho mọi nick ([BachHoModal.tsx](../../../app/desktop/src/views/BachHoModal.tsx), [bachho.rs](../../../app/core/src/bot/bachho.rs)):

- Chọn **giờ bắt đầu** và **giờ kết thúc** (mặc định 21:00–22:00, giờ Việt Nam), tích các nick đang trong game từ cấp 30, bấm **Bắt đầu**.
- Mỗi nick dừng việc đang làm (Tự đánh, Nhiệm vụ), nhớ map và khu đang đứng, đợi tới giờ bắt đầu.
- Tới giờ: đi qua **Bản đồ thế giới** `c2s/11 ("M99", 0, -1)` → `s2c/11` (cờ 0) → `c2s/13 ("M99", 14)` → Cổng Luyện Ngục (M15) → cổng 1006 → Hang Bạch Hổ (M24). Đường này đo ở LN1 (`captures/pl1-2026-11-20/3-frida-tiheo1.jsonl`, dòng 2289–2353): từ M25 gửi thẳng `c2s/11 "M99"`, dòng n − 1 của Bản đồ thế giới là map Mn. [Đo LN1]
- Trong hang: cứ 5 giây thử thách đấu boss **như các boss khác** (`c2s/1178` với mobId của `s2c/43`/`s2c/1177`; boss là con có tên chứa "Bạch Hổ", không có thì boss hay quái đầu tiên của hang); không thấy thì hỏi lại `c2s/43`. Vào được trận thì đánh (thuật toán v3), hết trận 1,5 s sau thử lại, tới giờ kết thúc thì thôi. Cách vào trận này là **[Suy luận]**, chưa đo.
- App không đọc bảng công trạng (`c2s/1252`): người dùng không cần bảng xếp hạng (21/11).
- Sau mỗi trận và lúc xong, app hỏi **Kết quả Bạch Hổ** (`c2s/1275`). Dòng của nick hiện chỗ đứng ("Bậc 2 (cấp 60+), hạng 4, 31.000 sát thương", thêm "(chưa đạt ngưỡng …)" khi dưới ngưỡng), nhật ký ghi máu boss hay ai kết liễu. Đã đánh mà server báo boss bị tiêu diệt (1) hay tẩu thoát (2) thì phiên dừng, vì không còn gì để đánh. Gói trả lời không do app hỏi chỉ cập nhật chỗ đứng.
- Mỗi trận vào được lưu vào lịch sử trận (`cllt.db`) như mọi trận, nguồn **Khác**; xem ở Thống kê của nick → Trận. Hết giờ hoặc bấm Dừng thì nhật ký có dòng tổng "Xong Bạch Hổ: … lần thử, … trận (… thắng), … sát thương".
- Mỗi nick một dòng: đang làm gì, số lần thử, số trận, sát thương; nút **Dừng**, và **Quay về** khi xong: nhảy qua Bản đồ thế giới về đúng map cũ rồi sang khu cũ.
- Test: `app/core/tests/bachho.rs` (đường đi và quay về theo đúng byte của LN1; một vòng trong hang; đọc `s2c/1275`; boss bị tiêu diệt thì dừng) và `test/world.test.ts` (`bachHoResult`).

Thư "Quà tham gia Bạch Hổ" của Hệ Thống có trong hòm thư tiheo1 (`s2c/1215`, LN1 dòng 1508): tham gia có quà qua thư. [Đo LN1]

## Chưa rõ, cần đo thật

- Ý nghĩa thật của trạng thái 0 và 1 (2 đã thấy ngoài giờ, BH1), của hai số trước tên trong mỗi dòng, và của số cuối. Cần một `s2c/1252` trong giờ, khi đã có người đánh.
- Hang Bạch Hổ là map nào, vào bằng cổng hay NPC, có cần đeo "Luyện Ngục Tầng" không.
- Trận với boss: có phải trận bàn cờ như đánh quái (`c2s/15`, `s2c/22`, [05](05-battle.md)) không; máu boss trong `s2c/22`; mỗi trận dài bao lâu; đánh lại được bao nhiêu lần trong giờ; phí Xu.
- Mức sát thương tối thiểu của người kết liễu và của Bình Huyết Linh; quà gồm những gì.
