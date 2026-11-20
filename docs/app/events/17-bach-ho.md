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
| Là gì, ở đâu, khi nào? | Boss thế giới ở **Hang Bạch Hổ (Luyện Ngục)**, **9:00–9:59 mỗi ngày**, từ cấp 30. [Cẩm nang] |
| Đánh thế nào? | Mọi người cùng đánh vào **một thanh máu**. Trong trận không có kinh nghiệm, vàng, đồ rơi; thua không bị trừ kinh nghiệm. [Cẩm nang] |
| Thưởng? | Boss bị tiêu diệt thì **top 5 sát thương** và **người kết liễu** nhận quà qua Hòm thư. Người kết liễu phải gây đủ sát thương tối thiểu mới có thưởng. Hết giờ mà boss chưa chết thì không ai nhận. [Cẩm nang] |
| Còn gì nữa? | +3 Điểm năng động mỗi ngày khi tham gia, từ cấp 30 ([14-npc](14-npc.md)). Bình Huyết Linh: mặc Băng Kiếm, đánh đủ sát thương thì bình rỗng trong túi thành bình đầy, tối đa 3 bình mỗi lần boss xuất hiện ([15-shops](15-shops.md), [16-upgrade](16-upgrade.md)). [Cẩm nang] |
| Xem bảng xếp hạng? | Nút bảng xếp hạng cạnh nút chat trong trận. Client gửi `c2s/1252` (rỗng), server trả `s2c/1252` (máu boss, số người, top sát thương, hạng của mình). Xem [Gói](#gói). [Cẩm nang; Đo] |
| Vào hang bằng cách nào? | **[Chưa rõ]** Luyện Ngục là tên một map Lv.30 trên bản đồ thế giới, có thể là M15 ([08](08-server-map-zone.md)). Bảng 29 có "Luyện Ngục Tầng 1–4" (375, 402, 405, 408), "Đeo để đánh quái tại Luyện Ngục" ([13](13-drops-items.md#bảng-29)). |
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

Bố cục khớp đúng hàm đọc tĩnh ở trên, đọc hết byte. Ngoài giờ trạng thái là **2** và máu đầy. Vì máu đầy, 2 nhiều khả năng là "Hang chưa mở", không phải "HP 0% - Đã kết thúc" như đoán trước đây [Suy luận]. Hôm nay Open Beta mở lúc 12:00, nên khung 9:00–9:59 chưa diễn ra lần nào. `bachHoBoard` của bot TS đọc gói này; app Rust chưa đọc. [Đo]

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

**Vào hang thế nào: chưa biết.** Hiện cũng chưa đo được, vì Bạch Hổ cần cấp 30 mà các nick sau khi bị xoá ở Open Beta đều thấp hơn (20/11: wangpt 24, manina2 và manina3 21, tiheo1 20, tiheo2 13). Cách đo chắc nhất: lúc 9:00–9:59, trên điện thoại, nick cấp 30 trở lên, gắn Frida bắt gói như VG1 ([02-login](02-login.md#vg1)), rồi bấm "Tham gia ngay" (hay tìm nút Bạch Hổ ở Sự kiện). Gói gửi đi lúc đó là gói vào hang.

## Chưa rõ, cần đo thật

- Ý nghĩa thật của trạng thái 0 và 1 (2 đã thấy ngoài giờ, BH1), của hai số trước tên trong mỗi dòng, và của số cuối. Cần một `s2c/1252` trong giờ, khi đã có người đánh.
- Hang Bạch Hổ là map nào, vào bằng cổng hay NPC, có cần đeo "Luyện Ngục Tầng" không.
- Trận với boss: có phải trận bàn cờ như đánh quái (`c2s/15`, `s2c/22`, [05](05-battle.md)) không; máu boss trong `s2c/22`; mỗi trận dài bao lâu; đánh lại được bao nhiêu lần trong giờ; phí Xu.
- Mức sát thương tối thiểu của người kết liễu và của Bình Huyết Linh; quà gồm những gì.
