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

## App: cửa sổ Bạch Hổ (21/11, chưa chạy thật)

Nút **Bạch Hổ** ở cuối thanh bên mở cửa sổ chung cho mọi nick ([BachHoModal.tsx](../../../app/desktop/src/views/BachHoModal.tsx), [bachho.rs](../../../app/core/src/bot/bachho.rs)):

- Chọn **giờ bắt đầu** và **giờ kết thúc** (mặc định 21:00–22:00, giờ Việt Nam), tích các nick đang trong game từ cấp 30, bấm **Bắt đầu**.
- Mỗi nick dừng việc đang làm (Tự đánh, Nhiệm vụ), nhớ map và khu đang đứng, đợi tới giờ bắt đầu.
- Tới giờ: đi qua **Bản đồ thế giới** `c2s/11 ("M99", 0, -1)` → `s2c/11` (cờ 0) → `c2s/13 ("M99", 14)` → Cổng Luyện Ngục (M15) → cổng 1006 → Hang Bạch Hổ (M24). Đường này đo ở LN1 (`captures/pl1-2026-11-20/3-frida-tiheo1.jsonl`, dòng 2289–2353): từ M25 gửi thẳng `c2s/11 "M99"`, dòng n − 1 của Bản đồ thế giới là map Mn. [Đo LN1]
- Trong hang: cứ 5 giây thử thách đấu boss **như các boss khác** (`c2s/1178` với mobId của `s2c/43`/`s2c/1177`; boss là con có tên chứa "Bạch Hổ", không có thì boss hay quái đầu tiên của hang); không thấy thì hỏi lại `c2s/43`. Vào được trận thì đánh (thuật toán v3), hết trận 1,5 s sau thử lại, tới giờ kết thúc thì thôi. Cách vào trận này là **[Suy luận]**, chưa đo.
- App không đọc bảng công trạng (`c2s/1252`): người dùng không cần bảng xếp hạng (21/11).
- Mỗi trận vào được lưu vào lịch sử trận (`cllt.db`) như mọi trận, nguồn **Khác**; xem ở Thống kê của nick → Trận. Hết giờ hoặc bấm Dừng thì nhật ký có dòng tổng "Xong Bạch Hổ: … lần thử, … trận (… thắng), … sát thương".
- Mỗi nick một dòng: đang làm gì, số lần thử, số trận, sát thương; nút **Dừng**, và **Quay về** khi xong: nhảy qua Bản đồ thế giới về đúng map cũ rồi sang khu cũ.
- Test: `app/core/tests/bachho.rs` (đường đi và quay về theo đúng byte của LN1).

Thư "Quà tham gia Bạch Hổ" của Hệ Thống có trong hòm thư tiheo1 (`s2c/1215`, LN1 dòng 1508): tham gia có quà qua thư. [Đo LN1]

## Chưa rõ, cần đo thật

- Ý nghĩa thật của trạng thái 0 và 1 (2 đã thấy ngoài giờ, BH1), của hai số trước tên trong mỗi dòng, và của số cuối. Cần một `s2c/1252` trong giờ, khi đã có người đánh.
- Hang Bạch Hổ là map nào, vào bằng cổng hay NPC, có cần đeo "Luyện Ngục Tầng" không.
- Trận với boss: có phải trận bàn cờ như đánh quái (`c2s/15`, `s2c/22`, [05](05-battle.md)) không; máu boss trong `s2c/22`; mỗi trận dài bao lâu; đánh lại được bao nhiêu lần trong giờ; phí Xu.
- Mức sát thương tối thiểu của người kết liễu và của Bình Huyết Linh; quà gồm những gì.
