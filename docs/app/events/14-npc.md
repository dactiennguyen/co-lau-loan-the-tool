# NPC: hộp thoại và danh sách NPC

Mốc: APK 1.0.3, server Thanh Khê. Nguồn là phiên **J1** (01/11/2026), nhân vật symap (tài khoản tiheo1, cấp 79):

- Bot TS nói chuyện (`c2s/13`) với mọi NPC của 6 map vào được (M1, M2, M4, M5, M10, M25). Bot mở từng dòng của hộp thoại (`c2s/57`), ghi mọi gói server trả về, và không chọn dòng nào làm thay đổi gì.
- Điện thoại có Frida ghi gói (writer và reader như [05-battle](05-battle.md#thu-lại)). Bot TS đặt symap đứng cạnh Pháp sư bằng `c2s/1169`. Trên máy mở **Nâng cấp [thường]**, đặt một trang bị và một viên đá, rồi bấm Bắt đầu một lần (người dùng đồng ý; tốn 12 Xu khóa và 1 Đá cấp 5).
- Bot TS mua 1 Nhẫn Trơn giá 300 Xu ở Bà Tư Hạnh (người dùng đồng ý), để biết cửa hàng trang bị có dùng chung gói mua hay không.

Dữ liệu thô (JSONL) và script nằm ở `captures/n1-2026-11-01/`, chỉ có trên máy, không vào git.

Chi tiết cửa hàng (mọi sản phẩm, giá, mua bằng Lượng) ở [15-shops](15-shops.md). Chi tiết Pháp sư (nâng cấp, luyện đá, tách đá, chuyển hoá, chế tạo, đo thêm ở J2) ở [16-upgrade](16-upgrade.md).

Nhãn: **[Đo]**, **[Suy luận]**, **[Chưa rõ]** như các file khác.

## Tóm tắt

| Câu hỏi | Trả lời |
|---|---|
| Nói chuyện với NPC thế nào? | `c2s/13 (mapId, npcId)`. NPC không có việc gì cho nhân vật thì trả `s2c/57` ([hộp thoại](#hộp-thoại)); NPC của bước nhiệm vụ trả `s2c/34` ([10-quests](10-quests.md#c2s-13)). Không cần đứng gần: bot gửi từ chỗ đăng nhập, server vẫn nhận. NPC phải ở map đang đứng. [Đo] |
| Chọn một dòng? | `c2s/57 (mãDòng, mapId, npcId)`. Dòng mở menu con thì server trả `s2c/57` mới, và dòng của menu con cũng chọn bằng `c2s/57` như vậy. [Đo] |
| NPC nào có việc? | Ở M1: Hương Lão Trần Bá, Bà Tư Hạnh, Lái Buôn, Pháp sư, Ngọc Nga. 15 NPC còn lại chỉ nói "Xin chào" với một nút OK ([bảng](#danh-sách-npc)). [Đo] |
| Mua ở NPC? | Mọi cửa hàng dùng chung một gói mua: `c2s/1190 (0, ôCửaHàng, sốLượng)`. Byte đầu của `s2c/1190` là mã cửa hàng, có 14 cửa hàng, 193 dòng hàng ([15-shops](15-shops.md)). [Đo] |
| Nâng cấp trang bị? | Pháp sư → Nâng cấp → Nâng cấp [Thường]: `s2c/96` mở cửa sổ; `c2s/97` đặt món (không tốn gì); `s2c/90` báo giá và tỉ lệ; `c2s/91` là nút Bắt đầu; `s2c/91` trả kết quả. Luyện đá, Tách đá, Chuyển hoá dùng cùng gói đặt món ([16-upgrade](16-upgrade.md)). [Đo] |
| `s2c/0` là gì? | Hộp thông báo chung của server, không chỉ báo "đăng nhập nơi khác". Hương Lão → Điểm năng động → Cách tính điểm trả lời bằng `s2c/0`. Đã vào game thì client TS ghi gói này thành `server_message` và chạy tiếp, trừ lời báo đăng nhập nơi khác: phiên đó dừng ngay ([s2c/0](#s2c-0)). [Đo] |

<a id="hộp-thoại"></a>

## Hộp thoại `s2c/57`

`s2c/57` = `i32 n; string tênNPC; string lời; n × {u8 mãDòng; string nhãn}`, bố cục ở [12-skills-items](12-skills-items.md#c2s-1190). Nhãn có thể xuống dòng ("Bán\nvật phẩm", "Nón Nam\n[Xu]"). Server trả lời trong khoảng 30 ms. [Đo]

`c2s/57` = `u8 mãDòng; string mapId; i32 npcId`, cùng một gói ở mọi tầng menu. Lúc chọn menu con, trên máy gửi `00 "M1" 161` cho Nâng cấp rồi lại `00 "M1" 161` cho Nâng cấp [Thường]. [Đo]

**Server nhớ menu đang mở, gói không nói tầng nào.** Ở Hương Lão, cùng một gói `00 "M1" 102` là Mã quà tặng (menu gốc), "50 lượng nhận 50.000 Xu" (Đổi lượng, **đổi ngay**), Nhận nhiệm vụ hay Hủy nhiệm vụ hiện tại (Nhiệm vụ hàng ngày), hoặc Đổi Xu (Điểm năng động), tuỳ `s2c/57` cuối cùng server đã gửi [Đo G1]. Bot phải mở NPC bằng `c2s/13`, đi đúng đường menu, và chỉ gửi `c2s/57` với dòng có trong `s2c/57` vừa nhận. Không bao giờ gửi lại một `c2s/57` cũ.

<a id="trí-nhớ-menu"></a>

**Server nhớ menu thế nào (NP1).** manina2, bot TS, chỉ dùng những menu mà dòng được chọn mở cửa hàng, chợ hay menu con. Script `captures/np1-2026-11-01/menu-memory.ts` [Đo NP1]:

| Trước đó | Gửi, không `c2s/13` trước | Server trả |
|---|---|---|
| Lái Buôn → 0 Vũ khí (menu con), rồi `c2s/13` Bà Tư (menu gốc) | `c2s/57 (0, "M1", 106)` Lái Buôn | Menu con Vũ khí, tức dòng 0 của **menu gốc** Lái Buôn |
| (tiếp, menu cuối là menu con Vũ khí) | `c2s/57 (0, "M1", 103)` Bà Tư | Cửa hàng 1 Nón Nam [Xu], tức Bà Tư → 0 Nón → 0 |
| Pháp sư → 1 Luyện đá (menu con) | `c2s/57 (0, "M1", 103)` Bà Tư | Cửa hàng 1 Nón Nam [Xu], **không phải** Giáp (dòng 1) |
| Lái Buôn → 0 Vũ khí | `c2s/57 (1, "M1", 103)` Bà Tư | Cửa hàng 2 Nón Nữ [Xu] (Nón → 1) |
| Bà Tư → 1 Giáp, rồi Lái Buôn → 0 Vũ khí | `c2s/57 (0, "M1", 103)` Bà Tư | Cửa hàng 1 Nón Nam [Xu], **không phải** Giáp Nam |
| Ngọc Nga chưa `c2s/13` trong phiên, menu cuối là cửa hàng của Bà Tư | `c2s/57 (0, "M1", 104)` | `s2c/1192` loại 1 (Chợ trời) |
| Phiên mới, chưa `c2s/13` nào; phiên trước để menu con Vũ khí | `c2s/57 (0, "M1", 106)` | **Không trả gì** |

Vậy:

- Server giữ **một** trạng thái menu cho mỗi nhân vật, không giữ riêng từng NPC. `c2s/13` đặt lại về menu gốc của NPC đó.
- `c2s/57` cho **đúng NPC** của menu cuối: server hiểu theo đúng menu đó. Đây là trường hợp Hương Lão ở G1: menu cuối là Đổi lượng, dòng 0 đổi ngay.
- `c2s/57` cho **NPC khác**: server chỉ dùng **tầng** của menu cuối. Ở tầng gốc thì là menu gốc của NPC đó; ở tầng menu con thì là menu con của **dòng 0** của NPC đó (của Bà Tư là Nón), dù trước đó đã chọn dòng nào. Mới đo một tầng menu con.
- Trạng thái **không qua phiên mới**: đăng nhập lại thì `c2s/57` không có `c2s/13` bị bỏ qua. Vì vậy lần Đổi lượng thừa ở Tiheo2 (G1) phải đến từ **kết nối cũ** của điện thoại, khi phiên đó còn sống và còn nhớ menu Đổi lượng [Suy luận].
- Chưa thử, vì có thể tốn tiền: `c2s/57` cho Hương Lão khi đang ở menu con của NPC khác. Dòng 0 menu gốc của Hương Lão là Mã quà tặng, không phải menu con [Chưa rõ]. Bot luôn gửi `c2s/13` trước, và gửi lại `c2s/13` sau mỗi việc ở Hương Lão.
- Cả 7 NPC ở M1 trả cùng lời và cùng dòng cho manina (cấp 33, nhiệm vụ 16) như cho symap (cấp 79) ở J1.

Đi kèm trả lời của NPC có thể có các gói nền không liên quan: `s2c/1` (ping), `s2c/1166`, `s2c/1167`, `s2c/1170` (người chơi khác), `s2c/1182`, `s2c/1183` (đồ trên đất). [Đo]

<a id="danh-sách-npc"></a>

## Danh sách NPC

Lời và các dòng của từng NPC khi symap (không làm nhiệm vụ của họ) nói chuyện. Toạ độ NPC ở [06-map-mobs](06-map-mobs.md#npc-và-cổng). [Đo J1]

| Map | NPC | Lời | Các dòng |
|---|---|---|---|
| M1 | 102 Hương Lão Trần Bá | "Chào mừng con đến với Thanh Khê\nNếu cần gì hãy tới tìm ta." | 0 Mã quà tặng, 1 Đổi lượng, 2 Nhiệm vụ hàng ngày, 3 Điểm năng động ([chi tiết](#hương-lão)) |
| M1 | 103 Bà Tư Hạnh | "Nếu con cần mua trang phục hãy tới tìm ta." | 0 Nón, 1 Giáp, 2 Nhẫn ([cửa hàng](#cửa-hàng)) |
| M1 | 106 Lái Buôn | "Ở chỗ ta có rất nhiều món đồ tốt." | 0 Vũ khí, 1 Dược phẩm, 2 Cửa hàng [Lượng] ([cửa hàng](#cửa-hàng)) |
| M1 | 161 Pháp sư | "Cậu muốn ta giúp việc gì." | 0 Nâng cấp, 1 Luyện đá, 2 Tách đá, 3 Chế tạo ([Pháp sư](#pháp-sư)) |
| M1 | 104 Ngọc Nga | "Xin chào." | 0 Chợ trời, 1 Bán vật phẩm, 2 Đang bán ([Ngọc Nga](#ngọc-nga)) |
| M1 | 111 Vệ Binh Lê Dũng, 129 Thành Chủ Nguyễn Khang | "Xin chào" | 0 OK |
| M2 | 127 Trại Chủ Phạm Hùng, 141 Võ Quan Đinh Mộc, 142 Dân Phu Vân Sơn | "Xin chào" | 0 OK |
| M25 | 162 Tướng Quân Lê Viễn | "Xin chào" | 0 OK |
| M4 | 143 Tiên phong Hồng Giang, 131 Lính Hồng Giang, 121 Tướng Xích Vũ, 144 Phó Tướng Hồng Giang | "Xin chào" | 0 OK |
| M5 | 146 Tướng quân Lạc Cốc, 133 Lính Lạc Cốc | "Xin chào" | 0 OK |
| M10 | 145 Tướng phe Thiết Hổ, 132 Lính Cửu Phong | "Xin chào" | 0 OK. Với nhân vật ở bước 2 nhiệm vụ 22, Tướng phe Thiết Hổ hỏi "Ngươi cần gì ở châu này?": Thông tin châu, Nói chuyện [Đo từ nhật ký app, 20/11; mã dòng chưa ghi] |

NPC của nhiệm vụ (Võ Quan, Tướng Quân Lê Viễn…) chỉ có lời riêng khi bước nhiệm vụ cần họ ([Bước Tỷ thí](10-quests.md#tỷ-thí)). [Đo]

<a id="cửa-hàng"></a>

## Cửa hàng

Bà Tư Hạnh và Lái Buôn bán ở 14 cửa hàng. Chọn một cửa hàng thì server gửi `s2c/1190`, byte đầu là mã cửa hàng. Bà Tư Hạnh và Vũ khí của Lái Buôn có thêm một tầng menu chọn loại tiền (và đồ nam hay nữ). Đường menu của từng cửa hàng, mọi sản phẩm với giá, bố cục bản ghi 33 và 49 byte, mua bằng Lượng và Đổi lượng ở [15-shops](15-shops.md). [Đo J1]

Bot TS: `npm run buy -- --shop=…` mở và mua ở cả 14 cửa hàng; `npm run elder` đọc Điểm năng động và Đổi lượng ([Cửa hàng NPC và Hương Lão](../../integration/nodejs/shop.md)).

<a id="pháp-sư"></a>

## Pháp sư

| Dòng | Menu con hay cửa sổ |
|---|---|
| 0 Nâng cấp | `s2c/57`: 0 Nâng cấp [Thường], 1 Nâng cấp [Cẩn thận], 2 Chuyển hoá trang bị. Cả ba mở cửa sổ `s2c/96` |
| 1 Luyện đá | `s2c/57`: 0 Luyện đá [Xu khóa], 1 Luyện đá [Xu]. Cả hai mở cửa sổ `s2c/99` |
| 2 Tách đá | Mở thẳng `s2c/96` "Tách đá trang bị" |
| 3 Chế tạo | `s2c/57`: 0 Chế tạo cánh, 1 Chế tạo trang bị (menu 0 Nón, 1 Áo, 2 Vũ khí, 3 Nhẫn), 2 Chế Băng Kiếm, 3 Đổi Băng Tâm lấy bình rỗng |

Các cửa sổ, gói đặt món, giá và tỉ lệ đo được, quy luật luyện đá, và luồng nâng cấp trên máy của J1 ở [16-upgrade](16-upgrade.md). [Đo J1, J2]

<a id="hương-lão"></a>

## Hương Lão Trần Bá

| Dòng | Server trả |
|---|---|
| 0 Mã quà tặng | `s2c/1224` rỗng (0 byte), rồi client mở cửa sổ Phúc lợi → Mã quà tặng. Gửi mã là `c2s/1223` ([Mã quà tặng](#mã-quà-tặng)) [Đo G1] |
| 1 Đổi lượng | `s2c/57` "Con muốn đổi gì.": 0 "50 lượng nhận 50.000 Xu", 1 "50 lượng nhận 55.000 Xu khóa" (J2). Chọn dòng nào cũng đổi ngay, không hỏi lại: J3 đổi dòng 1, G1 đổi dòng 0 ([Đổi lượng](15-shops.md#đổi-lượng)) |
| 2 Nhiệm vụ hàng ngày | `s2c/57` "Hôm nay con đã nhận N/3 nhiệm vụ hàng ngày." Chưa có nhiệm vụ: một dòng 0 Nhận nhiệm vụ. Đang có nhiệm vụ: một dòng 0 Hủy nhiệm vụ hiện tại ([Nhiệm vụ hàng ngày](#nhiệm-vụ-hàng-ngày)) |
| 3 Điểm năng động | `s2c/57` "Điểm năng động tuần này: 54/100\nHạn mức đổi (cấp 79): 7.000 Xu, cần 7.700 Xu khóa\nTuần này còn 500/500 suất. Hết tuần lúc 00:00 thứ Hai." với 0 Đổi Xu, 1 Cách tính điểm, 2 Đóng ([Điểm năng động](#điểm-năng-động)) |
| 3 → 1 Cách tính điểm | `s2c/0` (xem [dưới](#s2c-0)): "Điểm năng động tính theo tuần (bắt đầu 00:00 thứ Hai): Nhận thưởng nhiệm vụ ngày: 5 điểm (tối đa 3 nhiệm vụ / ngày); Thắng 10 / 20 / 30 trận đánh quái trong ngày: +2 điểm mỗi mốc (quái không quá thấp so với con); Tham gia Bạch Hổ (cấp 30+): 3 điểm / ngày; Nhiệm vụ Bảo Điển ngày (khi có mùa): 1 điểm (tối đa 4 / ngày). Đủ 100 điểm: đổi Xu khóa lấy Xu một lần mỗi tuần, hạn mức theo cấp. Mỗi tuần chỉ 500 người đổi đầu tiên có suất." |

[Đo J1, J2, G1]

<a id="nhiệm-vụ-hàng-ngày"></a>

### Nhiệm vụ hàng ngày

G1 (01/11, Tiheo2 / Ttuananh cấp 31, điện thoại có Frida ghi gói):

| Bấm | Gửi | Server trả |
|---|---|---|
| Hương Lão → Nhiệm vụ hàng ngày | `c2s/57 (2, "M1", 102)` | `s2c/57` "Hôm nay con đã nhận 0/3 nhiệm vụ hàng ngày." với 0 Nhận nhiệm vụ |
| Nhận nhiệm vụ | `c2s/57 (0, "M1", 102)` | `s2c/1256` "Nhận nhiệm vụ hàng ngày thành công.", rồi `s2c/1195` với nhiệm vụ mới (116 "Sử dụng vật phẩm") |
| Nhiệm vụ hàng ngày lần nữa | `c2s/57 (2, …)` | "Hôm nay con đã nhận 1/3 nhiệm vụ hàng ngày." với 0 Hủy nhiệm vụ hiện tại |
| Hủy nhiệm vụ hiện tại | `c2s/57 (0, …)` | `s2c/1195` `00` (hết nhiệm vụ), rồi `s2c/1256` "Hủy nhiệm vụ thành công". Không hỏi lại |
| Nhiệm vụ hàng ngày sau khi hủy | `c2s/57 (2, …)` | Vẫn "đã nhận 1/3", với 0 Nhận nhiệm vụ: nhiệm vụ đã hủy vẫn tính một lượt |
| Nhận nhiệm vụ lần hai | `c2s/57 (0, …)` | "Nhận nhiệm vụ hàng ngày thành công." và nhiệm vụ khác (113 "Nhặt xu") |

`s2c/1195` là **nhiệm vụ ngày đang làm**, không phải cờ như [04-push](04-push.md#s2c-1195) ghi trước đây. Lúc đăng nhập nó đến cùng các gói nhân vật.

```text
s2c/1195  u8 loại                 0: không có nhiệm vụ ngày (1 byte)
          loại 1: i32 mãNhiệmVụ; string tên; string mẫu ("%d" là mục tiêu); i32 tiếnĐộ; i32 mụcTiêu
          loại 3: i32 tiếnĐộ; i32 mụcTiêu    tiến độ vừa đổi (9 byte, NP1)
```

**Tiến độ (NP1):** ngay sau mỗi lần nhặt Xu khóa của quái, server gửi `s2c/46` (Xu khóa mới), `s2c/1195` loại 3, rồi `s2c/1256` "Bạn vừa nhận được 218 Xu khóa". Ví dụ manina (cấp 32, nhiệm vụ 113, mục tiêu 2100) đánh Cua Càng ở M2: `03 000000da 00000834` (218/2100), rồi 462/2100, 709/2100. Nhặt đồ (Áo Chiến, Đá cấp 3) không có `s2c/1195`. Mục tiêu của Nhặt xu theo cấp: 2050 ở cấp 31 (Tiheo2), 2100 ở cấp 32. Quái thấp hơn quá 20 cấp không rơi gì nên không tính (Sơn Tặc cấp 9). [Đo NP1]

| Mã | Tên | Mẫu | Mục tiêu |
|---|---|---|---|
| 116 | Sử dụng vật phẩm | Sử dụng %d vật phẩm trong trận đấu | 3 |
| 113 | Nhặt xu | Thu thập %d xu khóa từ đánh quái | 2050 |

- Bot TS: `npm run daily` đọc nhiệm vụ và menu, Nhận, Hủy hay Hoàn thành với `--confirm`, rồi để menu gốc của Hương Lão là menu cuối ([cách chạy](../../integration/nodejs/mail.md#nhiệm-vụ-ngày)). Đọc và Hoàn thành đã chạy thật ở NP1; Nhận và Hủy bằng bot thì chưa.
- App: tab Nhiệm vụ ngày của Tiện ích làm cùng bốn việc, và thẻ Nhiệm vụ hiện tiến độ từ `s2c/1195` ([Tiện ích](../../integration/rust/features.md#tiện-ích)). Mới chạy trong test với gói của G1 và NP1.
- Tab **Phụ** của khung nhiệm vụ bên trái hiện "Sử dụng 0/3 vật phẩm trong trận đấu"; mở tab không gửi gói nào. Nhân vật vẫn giữ nhiệm vụ chính (tab Chính).
- Cẩm nang (mục Nhiệm vụ): mỗi ngày nhận tối đa 3 nhiệm vụ, mỗi lần làm 1; làm xong thì về Hương Lão chọn **Hoàn thành nhiệm vụ**; thưởng là kinh nghiệm, Xu khóa hoặc vật phẩm. Theo Cách tính điểm, mỗi lần nhận thưởng nhiệm vụ ngày được 5 điểm năng động.
**Hoàn thành nhiệm vụ (NP1):** manina (cấp 33) xong 113 Nhặt xu 2100/2100 sau 22 trận thắng Cua Càng ở M2, rồi về M1 [Đo NP1]:

| Bấm | Gửi | Server trả |
|---|---|---|
| Nhiệm vụ hàng ngày khi đã xong | `c2s/57 (2, "M1", 102)` | "Hôm nay con đã nhận 1/3 nhiệm vụ hàng ngày." với **hai** dòng: 0 Hoàn thành nhiệm vụ, 1 Hủy nhiệm vụ hiện tại |
| Hoàn thành nhiệm vụ | `c2s/57 (0, "M1", 102)` | Trong 32 ms: `s2c/10` loại 4 (EXP 59.094 → 59.821), `s2c/46` (Xu khóa +590), `s2c/1187` (cả túi, không thêm món), rồi `s2c/1195` **loại 2**: `"Nhặt xu"; i32 2; "727 kinh nghiệm"; "590 xu khóa"`. Không có `s2c/1256` |
| Nhiệm vụ hàng ngày sau đó | `c2s/57 (2, …)` | Vẫn "đã nhận 1/3", dòng 0 Nhận nhiệm vụ; không còn giữ nhiệm vụ |

- Điểm năng động 16 → 23 cùng lúc. Có lẽ là 5 điểm phần thưởng cộng 2 điểm mốc 10 trận thắng; mốc 20 trận không thấy cộng. Có thể vì quái thấp hơn quá nhiều ("quái không quá thấp so với con") [Suy luận].
- Bot TS: `npm run daily -- --complete --confirm` ([cách chạy](../../integration/nodejs/mail.md#nhiệm-vụ-ngày)).
- Chưa đo [Chưa rõ]: nhận lượt thứ 4 trong ngày, mấy giờ thì tính sang ngày mới, các loại nhiệm vụ khác 113 và 116, phần thưởng có đổi theo cấp hay theo loại không. Tiheo2 vẫn giữ 113 (0/2050), đã dùng 2/3 lượt của 01/11.

<a id="điểm-năng-động"></a>

### Điểm năng động

G1, Tiheo2 cấp 31: "Điểm năng động tuần này: 12/100\nHạn mức đổi (cấp 31): 3.000 Xu, cần 3.300 Xu khóa\nTuần này còn 500/500 suất. Hết tuần lúc 00:00 thứ Hai."

| Bấm | Gửi | Server trả |
|---|---|---|
| Đổi Xu khi chưa đủ 100 điểm | `c2s/57 (0, "M1", 102)` | `s2c/1256` "Chưa đủ 100 điểm năng động (đang có 12).", hộp thoại đóng. Không tốn gì |
| Đóng | `c2s/57 (2, "M1", 102)` | **Không trả gì.** Client hiện "Vui lòng chờ..." và kẹt ở đó (hơn 2 phút); chạm vào hộp không tắt, phím Back đưa game xuống nền, mở lại vẫn kẹt. G1 gỡ bằng cách cho bot TS đăng nhập Tiheo2 để điện thoại bị đẩy ra ("Mất kết nối với máy chủ!"), rồi đăng nhập lại |

- Hạn mức theo cấp: cấp 31 được 3.000 Xu (cần 3.300 Xu khóa), cấp 79 được 7.000 Xu (cần 7.700, J1). Có lẽ là 1.000 Xu cho mỗi 10 cấp và Xu khóa cần gấp 1,1 lần [Suy luận, mới có 2 điểm].
- Đổi Xu khi đủ 100 điểm chưa đo (tốn Xu khóa) [Chưa rõ].
- Bot không gửi dòng 2 Đóng: chỉ cần không chọn gì nữa. Trên máy, chạm vào khung chữ của hộp thoại thì hộp đóng mà không gửi gói nào [Đo G1].

App Rust đọc Điểm năng động ở tab Đổi lượng của Tiện ích: điểm tuần, hạn mức đổi, số suất, và Cách tính điểm nếu hỏi. Không chọn Đổi Xu hay Đóng, và nói lại với Hương Lão trước khi xong để menu Đổi Xu không còn là menu server nhớ ([features](../../integration/rust/features.md#tiện-ích)).

**Đổi lượng dòng 0 ở G1:** `c2s/57 (0, "M1", 102)` → `s2c/46` (Lượng 30.000 → 29.950), `s2c/46` (Xu 15.003.600 → 15.053.600), `s2c/1256` "Bạn vừa nhận được 50.000 Xu"; hộp thoại đóng ([15-shops](15-shops.md#đổi-lượng)).

**Sự cố ở manina2 (G1):** trên điện thoại, nhân vật manina đứng cạnh Hương Lão (chưa gắn Frida). Hai lần bấm định mở menu ≡ và đóng một hộp thoại thì hiện ra hộp Nhiệm vụ hàng ngày, rồi "Bạn vừa nhận được 50.000 Xu". Bot đọc lại ví: Lượng 10.000 → 9.950, Xu 5.003.600 → 5.053.600, tức dòng 0 của Đổi lượng đã chạy. Không biết lần bấm nào gây ra. Chạm vào khung chữ thì không gửi gì (đã thử ở Tiheo2) [Chưa rõ]. Cách tránh: gắn Frida trước khi bấm, chụp màn hình trước mỗi lần bấm, và không bấm gì quanh một NPC có dòng đổi tiền ngay.

**Thêm một lần ở Tiheo2 (cùng ngày):** sau lần đổi dòng 0 ở trên (Lượng 30.000 → 29.950, Xu 15.053.600) và tháo Frida, không bấm gì thêm trên máy. Khi bot TS đăng nhập Tiheo2 (lần đầu bị "đang đăng nhập ở một nơi khác", 15 s sau thì vào được), ví đã là Lượng 29.900, Xu 15.103.600: thêm một lần đổi dòng 0. Cùng lúc, điện thoại hiện hộp thoại Pháp sư mà bot vừa mở (`c2s/13 ("M1", 161)` của bot), tức kết nối cũ của máy **vẫn nhận gói của nhân vật** sau khi bot vào, rồi mới báo "Mất kết nối với máy chủ!". Có lẽ client trên máy đã gửi lại `c2s/57 (0, "M1", 102)` lúc chuyển phiên, khi server vẫn nhớ menu Đổi lượng; chưa chứng minh vì không có Frida [Chưa rõ]. Cách tránh: tắt hẳn game trên máy (`am force-stop`) trước khi bot đăng nhập cùng nick, và không để hộp thoại đổi tiền là menu cuối cùng của một NPC.

<a id="mã-quà-tặng"></a>

### Mã quà tặng

G1 (01/11/2026, Tiheo2 / Ttuananh cấp 31, M1 khu 0): điện thoại có Frida ghi gói, nhân vật được đặt sẵn cạnh Hương Lão bằng một `c2s/1169` của bot TS. Luồng:

1. `c2s/13 ("M1", 102)` → `s2c/57` với 4 dòng.
2. `c2s/57 (0, "M1", 102)` → `s2c/1224` rỗng → client mở cửa sổ **Phúc lợi**, tab **Mã quà tặng**: ô "Nhập mã tại đây", lưu ý "Nếu nhập sai quá 5 lần, bạn sẽ không thể nhập tiếp trong vòng 24h. Phần thưởng sẽ được gửi vào hộp thư.", nút **Nhập quà**, và "NHẬN CODE NGAY TẠI" với nút Tham gia ngay.
3. Nhập quà → `c2s/1223` → `s2c/1223`; thành công thì thêm `s2c/1222` và `s2c/1220`, lỗi thì thêm `s2c/1256`.

| Gói | Bố cục | Ghi chú |
|---|---|---|
| `c2s/1223` | `string mã` | `0000000a 414c5048415445535431` là "ALPHATEST1". Client đổi chữ thường thành chữ hoa và cắt dấu cách hai đầu trước khi gửi: gõ "denbu" hay "  DENBU  " đều gửi `00000005 44454e4255`. Ô trống thì client báo "Bạn chưa nhập mã quà tặng." và không gửi gì. Gói không mang map hay NPC |
| `s2c/1223` | `u8 ok; string lời` | `ok` 1: "Nhập mã thành công, phần thưởng đã được gửi vào hộp thư" (chữ xanh dưới nút, ô mã được xoá). `ok` 0: lời lỗi (chữ đỏ, ô giữ mã) |
| `s2c/1256` | `u8 1; string` | Chỉ khi lỗi: cùng lời đó, hiện thành dải thông báo giữa màn hình |
| `s2c/1222` | `i64 mãThư; u8 1; string tiêuĐề; string ngườiGửi; u8 0; u8 1; u8 0; i64 giờGửi; i64 0` | Thư mới trong hộp thư, client hiện "Bạn có thư mới: …". `giờGửi` là ms theo giờ server (sớm hơn lúc điện thoại nhận khoảng 0,8 s, do đồng hồ điện thoại lệch). `mãThư` tăng dần chung cả server: 6273, 6278, 6280 trong 80 s. Ba byte giữa và `i64` cuối chưa rõ nghĩa [Chưa rõ] |
| `s2c/1220` | `u8 1` | Ngay sau `s2c/1222`: còn thư chưa đọc ([Hòm thư](#hòm-thư)) |

Các trường hợp đã thử, theo thứ tự:

| Gõ vào ô | Gửi trong `c2s/1223` | `ok` | Lời | Thư mới |
|---|---|---|---|---|
| ALPHATEST1 | ALPHATEST1 | 1 | Nhập mã thành công, phần thưởng đã được gửi vào hộp thư | "Quà Alpha Test Ngày 1" (6273) |
| ALPHATEST1 lần hai | ALPHATEST1 | 0 | Nhân vật này đã dùng mã rồi | |
| ALPHATEST2 | ALPHATEST2 | 1 | Nhập mã thành công, … | "Quà Alpha Test" (6278) |
| denbu | DENBU | 1 | Nhập mã thành công, … | "Quà Đền bù AlphaTest" (6280) |
| (để trống) | không gửi | | Bạn chưa nhập mã quà tặng. (client) | |
| SAIMA2026 | SAIMA2026 | 0 | Mã không tồn tại | |
| "  DENBU  " | DENBU | 0 | Nhân vật này đã dùng mã rồi | |
| SAIMA2027, gửi bằng bot TS, không qua NPC | SAIMA2027 | 0 | Mã không tồn tại | |
| SAIMA2028 … SAIMA2037 (10 mã sai liền, cùng một lần đăng nhập, cách nhau 9–25 s) | như gõ | 0 | Mã không tồn tại (cả 10 lần) | |
| SAIMA2038, SAIMA2039, DENBU (ngay sau đó) | như gõ | 0 | Bạn nhập mã quá nhanh, vui lòng thử lại sau | |
| DENBU, 3 phút sau lần sai thứ 10 | DENBU | 0 | Bạn nhập mã quá nhanh, vui lòng thử lại sau | |
| DENBU, 6 phút 10 s sau lần sai thứ 10 | DENBU | 0 | Nhân vật này đã dùng mã rồi | |

- Lời "Nhân vật này đã dùng mã rồi" cho thấy mã tính theo nhân vật, không theo tài khoản [Suy luận]. Cẩm nang ghi "mỗi nhân vật (có mã tính theo tài khoản) chỉ dùng một lần; mã còn có hạn dùng và số lượt".
- **Không có chỗ nào báo còn mấy lần nhập sai.** Cửa sổ Mã quà tặng của client (`com.g.m.sqcc`) chỉ có dòng lưu ý cố định "Nếu nhập sai quá 5 lần…" và một nhãn hiện lời của server. `s2c/1223` chỉ có `ok` và lời, không có số đếm. Cả 12 lần sai của Tiheo2 đều nhận đúng một lời, "Mã không tồn tại" [Đo G1].
- **Khoá thật là 10 lần sai liền thì chặn 5 phút**, không phải "quá 5 lần thì 24h" như dòng lưu ý của cửa sổ. Cẩm nang (`cam-nang.json`, mục Mã quà tặng) ghi đúng điều server làm: "gõ sai mã 10 lần liền thì bị khóa nhập 5 phút". Khi bị chặn, server trả `s2c/1223` với `ok` 0 và `s2c/1256`, cùng lời "Bạn nhập mã quá nhanh, vui lòng thử lại sau", cho **mọi** mã, kể cả mã thật (DENBU). Lời này đến sau khoảng 27 ms, nhanh hơn lời "Mã không tồn tại" (43–85 ms) [Đo G1].
- **"Quá nhanh" còn là giới hạn tốc độ** (Log lỗi của app 0.9.0, 02/11, manina3): ALPHATEST1 được lúc 05:24:58, ALPHATEST2 gửi khoảng 1,5 s sau thì bị "Bạn nhập mã quá nhanh, vui lòng thử lại sau", dù nick chưa sai mã nào. Cùng sáng đó manina2 gửi 3 mã cách nhau khoảng 8 s, server trả lời bình thường ("Nhân vật này đã dùng mã rồi"). Vậy giữa hai mã cần một khoảng tối thiểu, ở giữa 1,5 s và 8 s; khoảng đúng và việc bị chặn bao lâu sau lời này chưa đo [Đo 1 lần]. App và bot TS giờ để hai mã cách nhau 10 s, và gặp lời này khi chưa sai đủ 10 lần liền thì đợi 30 s rồi gửi lại mã đó một lần.
- Thời gian chặn: vẫn bị chặn ở 3 phút 10 s sau lần sai thứ 10, hết chặn ở 6 phút 10 s, nên khớp 5 phút của Cẩm nang. Lần thử ở phút thứ 3 không làm chặn lâu thêm: nếu mỗi lần thử lúc bị chặn tính lại 5 phút thì ở phút thứ 6 vẫn còn bị chặn [Đo G1].
- Đếm "liền" theo gì: lần chặn đến sau đúng 10 lần sai của cùng một lần đăng nhập (SAIMA2028–2037). SAIMA2026 và SAIMA2027 ở hai lần đăng nhập trước, hay bị ngắt quãng bởi một mã đã dùng ("  DENBU  "), không cộng vào. Server đếm theo lần đăng nhập, hay lần nhập mã đã dùng làm số đếm về 0, thì chưa phân biệt được [Chưa rõ].
- Ô mã nhận tối đa 32 ký tự (`setMaxLength(32)` trong `sqcc`) và có bộ lọc ký tự (`sqcd`, chưa đọc) [Đọc code].
- Server có phân biệt chữ hoa, chữ thường không: chưa thử được qua client, vì client luôn gửi chữ hoa. Cẩm nang ghi "không phân biệt chữ hoa, chữ thường".
- Phần thưởng nằm trong hòm thư ([Hòm thư](#hòm-thư)).
- **Bot TS gửi `c2s/1223` thẳng được:** 1,5 s sau khi vào game, nhân vật đứng ở M1 nhưng không mở Hương Lão hay Phúc lợi. Server trả `s2c/1223` và `s2c/1256` sau 52 ms, giống hệt khi bấm trên điện thoại [Đo G1].
- App Rust làm cùng việc ở tab Mã quà tặng của Tiện ích: nhiều mã một lần, dừng sau 5 mã bị từ chối liền nhau và nhớ số đó qua các lần đăng nhập ([features](../../integration/rust/features.md#mã-quà-tặng)).
- Gói của G1 (chỉ các gói ở trên và các bước bấm) giữ ở `captures/g1-2026-11-01/gift.jsonl` (điện thoại), `code-bot.jsonl` (bot TS) và `gift-lock.jsonl` (10 lần sai và lúc bị chặn), không đưa vào git.

<a id="hòm-thư"></a>

### Hòm thư

G1, cùng phiên: Chức năng (góc phải màn hình) → **Thư** mở cửa sổ **HÒM THƯ**: danh sách thư bên trái (tiêu đề, người gửi, nhãn "quà", "7 phút trước", chấm đỏ khi chưa đọc), nội dung bên phải ("Chọn thư để xem nội dung.", "(Không có vật phẩm)"), và 4 nút Xóa hết, Xóa, Nhận, Nhận hết. Thư đã nhận có dấu "ĐÃ NHẬN" và nút Nhận mờ đi.

| Gói | Bố cục | Ghi chú |
|---|---|---|
| `c2s/1215` | rỗng | Mở hòm thư |
| `s2c/1215` | `i32 n; n × thư` | Một thư: `i64 mãThư; u8 loại; string tiêuĐề; string ngườiGửi; u8 đãĐọc; u8 cóQuà; u8 đãNhận; i64 giờGửi; i64 0`. `loại` 1 ở mọi thư quà. Thư mới chưa mở là `0 1 0`, thư đã nhận `1 1 1`. Cũng là bố cục của `s2c/1222` (thư mới) |
| `c2s/1216` | `i64 mãThư` | Bấm vào một thư |
| `s2c/1216` | `i64 mãThư; string tiêuĐề; string nộiDung; string ngườiGửi; u8 đãNhận; i32 n; n × bản ghi vật phẩm` | Bản ghi vật phẩm như của túi ([12-skills-items](12-skills-items.md#túi-đồ)), ô 0xff. Tiền cũng là vật phẩm: Xu `#40`, Xu khóa `#41`, Lượng `#42`, số tiền ở `quantity`. `field1` là cờ khoá như trong túi (0 đã khoá, client vẽ ổ khoá; 1 chưa khoá) |
| `s2c/1220` | `u8` | Sau mỗi `s2c/1216` và `s2c/1217`: 1 khi còn thư chưa đọc, 0 khi đã mở hết (chấm đỏ của nút Thư) |
| `c2s/1217` | `i64 mãThư` | Nhận |
| `s2c/1217` | `i64 mãThư; u8 ok` | 1 nhận được, 0 không. Được thì trước đó có `s2c/46` "update Xu" với số tiền mới, và nếu thư có vật phẩm thì thêm `s2c/1187` (cả túi sau khi nhận, [12-skills-items](12-skills-items.md#túi-đồ)); thứ tự là `s2c/46`, `s2c/1187`, `s2c/1217`, `s2c/1220`. Không có `s2c/51` (thêm một ô). Túi không đủ chỗ thì trước đó có `s2c/1256` "Rương đã đầy. Vui lòng bỏ bớt đồ ra hoặc mua thêm ngăn chứa" và thư không nhận được gì, kể cả tiền |
| `c2s/1218` | rỗng | Nhận hết. Server nhận từng thư còn chỗ, bỏ qua thư không đủ chỗ. Nhận được mọi thư: **một** `s2c/46` với tổng tiền mới, **một** `s2c/1187` với cả túi, rồi `s2c/1256` "Đã nhận quà của 2 thư" (Tiheo2, sau khi gộp đá). Nhận được một phần: `s2c/46`, rồi `s2c/1256` "Đã nhận quà của 1 thư, rương đã đầy" (manina2: thư chỉ có tiền nhận được, ba thư có vật phẩm bị bỏ qua). Không thư nào nhận được: `s2c/1256` "Rương đã đầy. …". Không còn thư nào có quà: `s2c/1256` "Không có quà nào để nhận". Sau đó luôn có `s2c/1215` (cả danh sách mới) và `s2c/1220`. Thư nhận bằng Nhận hết vẫn là chưa đọc. Sau Nhận hết, ô nội dung của thư đang chọn hiện "Đang tải nội dung…" mãi, vì client không gửi lại `c2s/1216` |
| `c2s/1219` | `i64 mãThư` | Xóa một thư. Client hỏi lại trước khi gửi: "Bạn có muốn xóa thư này không?" với thư đã nhận, "Thư này còn quà chưa nhận, xóa đi sẽ mất quà. Bạn có chắc muốn xóa không?" với thư còn quà |
| `s2c/1219` | `i64 mãThư; u8 ok` | 1 đã xoá; rồi `s2c/1220`. Client bỏ thư khỏi danh sách, không xin lại `s2c/1215` |
| `c2s/1221` | rỗng | **Xóa hết: xoá mọi thư, kể cả thư còn quà chưa nhận.** Client hỏi "Bạn có muốn xóa tất cả thư đã nhận không?", nhưng "đã nhận" ở đây là thư đã đến hòm, không phải thư đã lấy quà. Server trả `s2c/1215` rỗng (`00000000`), `s2c/1220` 0 và `s2c/1256` "Đã xoá 4 thư" |

Bốn thư của Ttuananh (cấp 31, túi 42/42 ô, phần lớn là đá):

| Thư (mã) | Nội dung | Món | Nhận |
|---|---|---|---|
| Quà Đền bù AlphaTest (6280) | Cảm ơn Sứ Quân đã chịu khó chờ đợi | Xu 5.000.000, Lượng 10.000, Xu khóa 5.000.000 | Được: `s2c/46` đổi Xu 3.600 → 5.003.600, Xu khóa 26.138 → 5.026.138, Lượng 0 → 10.000 |
| Quà Alpha Test (6278) | Quà Alpha Test | Xu 10.000.000, Xu khóa 10.000.000, Lượng 20.000; Gỗ, Da, Linh Thạch, Quặng Bậc 2 và Bậc 3, mỗi thứ 500 | Túi đầy; sau khi gộp đá nhận bằng Nhận hết |
| Quà Alpha Test Ngày 1 (6273) | Chào mừng Sứ Quân | Xu khóa 1.000.000; Tăng Kinh Nghiệm 1, Đá cấp 5 × 3 (ba bản ghi), Búa Sửa Chữa 10, Hoàn Linh Dược 10, Kim Đan Dược 10, đều đã khoá | Túi đầy; sau khi gộp đá nhận bằng Nhận |
| Quà đạt cấp 20 (5118, từ 31/10) | Chúc mừng bạn đạt cấp 20! Bấm nhận để lấy quà. | Xu khóa 4.350, Tăng Kinh Nghiệm 1, Đá cấp 5, đã khoá | Túi đầy; sau khi gộp đá nhận bằng Nhận hết |

- Một thư nhận cả hoặc không nhận gì. Thư chỉ có tiền thì nhận được dù túi đầy.

**Nhận thư có vật phẩm (G1, Tiheo2, sau khi gộp đá).** Để có chỗ, `cllt smith --account=tiheo2 --merge=5 --confirm` gộp 17 Đá cấp 2, 11 Đá cấp 3 và 1 Đá cấp 4 (đều đã khoá) qua 8 lần luyện, cả 8 lần đều được và tốn 209 Xu khóa. Túi từ 42/42 còn 18/42. Rồi trên điện thoại (Frida ghi gói): Nhận thư 6273, rồi Nhận hết hai thư còn lại, rồi Nhận hết lần nữa khi không còn quà:

| Bấm | Tiền (`s2c/46`) | Túi (`s2c/1187`) |
|---|---|---|
| Nhận thư 6273 | Xu khóa 5.025.929 → 6.025.929 | 18 → 22 món: Tăng Kinh Nghiệm (ô 3), 3 Đá cấp 5 (ô 6, 7, 8) vào ô trống thấp nhất; Hoàn Linh Dược 3 → 13, Kim Đan Dược 2 → 12, Búa Sửa Chữa 93 → 103 cộng vào chồng sẵn có |
| Nhận hết (6278, 5118) | Xu 5.003.600 → 15.003.600; Xu khóa → 16.030.279 (+10.004.350, cả hai thư); Lượng 10.000 → 30.000 | 22 → 31 món: 8 nguyên liệu ×500 (ô 9–16, chưa khoá, như `field1` 1 trong thư), Đá cấp 5 (ô 17); Tăng Kinh Nghiệm 1 → 2 |

- Món đã có trong túi cộng vào chồng sẵn có (G1: chồng cũ và món trong thư đều đã khoá), nên chỉ món mới hay đá (không chồng được, `stack` 1) mới cần ô trống. Món khác cờ khoá có vào chung chồng không thì chưa thử [Chưa rõ].
- Nhận hết nhiều thư chỉ gửi một `s2c/46` và một `s2c/1187` cho cả lượt.
- manina2 (cùng ngày, manina cấp 32, túi cũng 42/42): nhập 3 mã đều thành công (thư 6336, 6338, 6339), nên mã tính theo nhân vật: Tiheo2 đã dùng không làm mã hết lượt. Bấm Nhận hết ngay: chỉ nhận được thư Đền bù (Xu 3.600 → 5.003.600, Xu khóa 31.986 → 5.031.986, Lượng 0 → 10.000). Rồi Xóa hết: **cả 4 thư bị xoá, quà của ba thư chưa nhận (Quà Alpha Test, Quà Alpha Test Ngày 1, Quà đạt cấp 20) mất hẳn**, không nhập lại mã được ("Nhân vật này đã dùng mã rồi").
- Lần bấm Xóa đầu tiên ở Tiheo2 lại hỏi về thư "Quà Alpha Test" (chưa nhận) dù thư đang chọn là thư đã nhận; G1 bấm Hủy. Lần thứ hai hỏi đúng thư đã nhận. Vì sao lựa chọn nhảy sang thư khác thì chưa rõ [Chưa rõ].
- Cẩm nang (mục Hòm thư, Mã quà tặng) ghi thêm, chưa đo: hộp hiện 50 thư mới nhất; thư hết hạn vẫn còn trong danh sách nhưng không nhận quà được nữa; thư quà từ mã không hết hạn; "mỗi món quà cần 1 ô hành trang, tiền thì không; hết ô thì Nhận hết dừng lại" (đo được thì món chồng vào chồng có sẵn không cần ô mới, và Nhận hết bỏ qua thư thiếu chỗ chứ chưa chắc dừng). Cẩm nang cũng ghi "Xóa hết: … mọi thư đã nhận", cùng chữ dễ hiểu lầm như hộp hỏi lại; server xoá cả thư chưa nhận quà.
- Chưa thấy: thư có Đá hay đồ (không chồng được) khi túi chỉ đủ chỗ cho một phần món của thư; thư hết hạn trên dây (cờ nào trong `s2c/1215`).
- Gói của G1 ở `captures/g1-2026-11-01/mail.jsonl` (Tiheo2), `mail-2.jsonl` (Xóa ở Tiheo2, manina2) và `mail-3.jsonl` (nhận thư có vật phẩm, Nhận hết, Tiheo2), không đưa vào git.

<a id="hòm-thư-bot"></a>

#### Làm bằng bot TS

Không cần điện thoại hay NPC: mọi gói ở trên gửi được ngay sau khi vào game. Client mở Mã quà tặng qua Hương Lão, nhưng bot gửi thẳng `c2s/1223` cũng được [Đo G1]. Bot TS làm đúng các bước dưới bằng `npm run gift` và `npm run mail` ([cách chạy](../../integration/nodejs/mail.md)); chưa chạy với server thật.

1. Nhập mã: `c2s/1223 (string mã)`, đổi chữ hoa và cắt dấu cách trước, tối đa 32 ký tự. Đọc `s2c/1223`: `ok` 1 thì chờ `s2c/1222` (thư mới); `ok` 0 thì dừng và báo lời của server. Server không cho biết đã sai mấy lần, nên bot tự đếm số lần sai liền của nick: 10 lần sai liền thì mọi mã (kể cả mã đúng) bị từ chối với "Bạn nhập mã quá nhanh, vui lòng thử lại sau" trong 5 phút. Lời này cũng đến khi hai mã gửi quá sát nhau, nên hai mã cách nhau 10 s; gặp lời này khi chưa sai đủ 10 lần liền thì đợi 30 s rồi gửi lại mã đó một lần, lần hai mới coi là bị chặn và chờ đủ 5 phút rồi mới gửi tiếp. Không thử mã đoán mò.
2. Xem hòm: `c2s/1215` → `s2c/1215`. Với mỗi thư `cóQuà` 1, `đãNhận` 0: `c2s/1216` để biết món (tiền là `#40`–`#42`), rồi `c2s/1217`. Đếm ô trống của túi trước: món đã có trong túi thì cộng vào chồng (đã thấy khi cùng đã khoá); món mới và mỗi viên đá (không chồng) cần một ô. `s2c/1217` `ok` 1 thì cập nhật tiền theo `s2c/46` và túi theo `s2c/1187`; `ok` 0 kèm "Rương đã đầy" thì dừng, báo người dùng.
3. Hay dùng `c2s/1218` (Nhận hết): nhận được thư nào hay thư đó, an toàn với túi đầy. Đọc lời trong `s2c/1256` ("Đã nhận quà của N thư", "…, rương đã đầy", "Không có quà nào để nhận") và danh sách mới trong `s2c/1215`.
4. Xoá: chỉ `c2s/1219` từng thư có `đãNhận` 1. **Không bao giờ gửi `c2s/1221`** khi còn thư có quà chưa nhận.

App Rust làm các bước 2–4 ở tab Hòm thư của Tiện ích: danh sách, mở thư, Nhận (đếm ô trước), Nhận hết, xoá từng thư đã nhận quà; không có Xóa hết ([features](../../integration/rust/features.md#hòm-thư)).

<a id="ngọc-nga"></a>

## Ngọc Nga (Chợ trời)

Ngọc Nga (104, M1) có ba dòng, nhãn đúng như server gửi: 0 "Chợ trời", 1 "Bán\nvật phẩm" (có xuống dòng), 2 "Đang bán". Cả ba trả `s2c/1192`; byte đầu cho biết loại. Chọn dòng chỉ mở bảng, không tốn gì. Trên máy, cả ba dòng mở cùng một cửa sổ Chợ trời, ở tab tương ứng. [Đo J1, CT1]

| Dòng | `s2c/1192` |
|---|---|
| 0 Chợ trời | Loại 1: một trang của một mục. CT1: mục 0 "Vũ Khí", trang 1/9, 20 món, 2638 byte ([bố cục](#bố-cục-chợ-trời)) |
| 1 Bán vật phẩm | Loại 0, rồi `string`: "Phí đăng bán 1.000 Xu, bán trong 24 giờ, phí chợ 5% khi bán được. Tiền bán được và vật phẩm hết hạn gửi về hộp thư." |
| 2 Đang bán | Loại 2: `i32 sốTrang; i32 trang; i32 n`, rồi n món cùng bố cục với loại 1. Không bán gì thì là (1, 1, 0), 13 byte ([Thu hồi](#thu-hồi)) |

### Cửa sổ Chợ trời

CT1 (01/11), điện thoại có Frida với manina2, chỉ xem: [Đo CT1]

- Cửa sổ có ba tab **Mua**, **Bán**, **Đang bán**. Tab Mua có 9 mục, danh sách 20 món mỗi trang, dòng "Trang 1/9" với mũi tên, và nút **Làm mới**. Dưới cùng là Xu, Xu khóa, Lượng.
- Cửa sổ vừa mở thì client gửi `c2s/116` (rỗng). Server trả `s2c/116`: 9 mục kèm số món mỗi mục, luật bán, rồi 5 số (đọc hết 378/378 byte):

  ```text
  s2c/116: i32 n; n × {i32 mục; string tên; i32 sốMón}; string luật;
           i32 phí (1000); i32 a (1000); i32 sốGiờ (24); i32 b (1000); i32 giáCaoNhất (100.000.000)
  ```

  | Mục | 0 Vũ Khí | 1 Nón Nam | 2 Nón Nữ | 3 Giáp Nam | 4 Giáp Nữ | 5 Nhẫn | 6 Vật Phẩm Khác | 7 Đá Quý | 8 Vật Dụng |
  |---|---|---|---|---|---|---|---|---|---|
  | Số món (CT1) | 169 | 102 | 9 | 50 | 9 | 77 | 139 | 16 | 23 |

  `a`, `b` chưa rõ. Một trong hai có lẽ là giá thấp nhất: món rẻ nhất trong 592 món đúng 1.000 Xu [Suy luận].
- **Đổi mục, lật trang, Làm mới, tab Đang bán** đều là `c2s/1192 (u8 0; i32 mục; i32 trang)`, server trả `s2c/1192`. Làm mới gửi lại gói của trang đang xem. Tab Đang bán là mục **-1**: `00 ffffffff 00000001`. Ví dụ Nón Nam trang 2: `00 00000001 00000002`.
- **Nút Chợ trời của thanh công cụ** (góc phải trên) mở cửa sổ ở mục xem lần trước bằng `c2s/1192 (0, 6, 1)` thẳng, không qua `c2s/13`/`c2s/57` của Ngọc Nga. Server vẫn trả danh sách, nên chợ không cần đứng cạnh NPC.
- Bot TS gửi lại đúng `c2s/1192` đó cho 9 mục và mọi trang của chúng (33 trang, sau khi mở dòng 0 của Ngọc Nga): đọc được 592 món, không bị từ chối.
- Chạm một món chỉ mở bảng chi tiết trên máy, không gửi gói: giá, thời gian còn, người bán, phẩm chất, yêu cầu cấp, độ bền (vd. "60/60"), chỉ số, và nút **Mua**.

### Bố cục Chợ trời

```text
s2c/1192 loại 1: u8 1; u8 sốMục (9); u8 mục; string tênMục ("Vũ Khí"); i32 sốTrang; i32 trang; i32 n; n × món
món: i32 mãVậtPhẩm; i32 mãVậtPhẩm (lặp lại); string uuid; string ngườiBán;
     i32 độBền; i32 field0; i32 phẩmChất; [0.0.7: u8 hệ]; i64 hếtHạn (ms); u8 loạiTiền; i32 giá;
     i32 field2; i32 sốLượng; u8 field1; i32 m; m × {i32 chỉSố; i32 giáTrị; i32 giáTrị2}
```

**Khi khai `0.0.7`** (bot TS, 20/11): mỗi món thêm **1 byte hệ** ngay trước `hếtHạn`, như byte hệ của bản ghi vật phẩm trong túi: Lam Dù ở mục Vũ Khí có 2 (Lôi), ba món đá ở mục Đá Quý có 0xff. Các trường khác không đổi. Bot TS và app Rust đọc được cả hai bố cục (`market`, thử `0.0.7` trước). [Đo 4 món]

CT1 đọc hết 20 món, đúng 2638/2638 byte, rồi cả 33 trang của 9 mục (592 món); J1 (bản ghi chỉ giữ 2048 byte đầu) cũng khớp ở 15 món đầu. Các trường giống bản ghi vật phẩm của túi ([12-skills-items](12-skills-items.md#túi-đồ)) nhưng khác thứ tự, và vài trường u8 thành i32. [Đo CT1]

- **Mã vật phẩm** có hai lần, luôn giống nhau. Mục "Vũ Khí" chỉ có loại 2 (vũ khí) trong `data/items.json`.
- **Độ bền** 60 ở đồ cấp 21 và 51, 300 ở đồ cấp 101; -1 ở món không có độ bền (thú cưng, đá, vật dụng). Bảng chi tiết ghi "Độ bền: 60/60".
- **Phẩm chất**: 1, 2 hoặc 3 ở đồ mặc, 0 ở mọi món khác. Bảng chi tiết: 1 là "Hiếm" (tên màu xanh lá), 3 là "Sử Thi" (tên màu tím). Món có 2 chưa mở xem ở Chợ trời; 2 là "Quý" theo bản ghi vật phẩm, cùng thang ([13-drops-items](13-drops-items.md#phẩm-chất)), nên app ghi Quý. Trước CT1 trường này bị đoán là hệ; sai.
- **field0** luôn 0. Trong túi field0 là cấp cường hoá (+N); chưa thấy món đã cường hoá nào [Chưa rõ].
- **Hết hạn**: giờ hết hạn bằng mili giây, khoảng 24 giờ sau lúc đăng. Danh sách xếp theo giờ đăng, mới nhất trước.
- **Loại tiền** luôn 0, tức Xu, như loại tiền 0 của cửa hàng ([15-shops](15-shops.md)). **Giá** từ 1.000 tới 50.000.000 Xu.
- **Số lượng** 1 ở 586/592 món; đá và vật dụng có món 99, 109, 900, 999. **field1** luôn 1 (trong túi, 1 là chưa khoá), **field2** luôn 0.
- **Chỉ số**: mỗi chỉ số có hai giá trị, ở mọi món đều bằng nhau. Mã chỉ số như ở túi (5 là sức tấn công, 6 phòng thủ, 9 sinh lực).

<a id="mua"></a>

### Mua

Người dùng cho thử mua món rẻ nhất (Thú cưng Slime +16 thể lực, 1.000 Xu, mục Vật Phẩm Khác trang 4) và cho dọn túi. [Đo CT1]

1. Bảng chi tiết → **Mua**. Game hỏi "Mua Thú cưng Slime với giá 1.000 Xu?" với OK và Hủy; chưa gửi gì.
2. **OK** → `c2s/115 (string uuid)`: chỉ uuid của món trong `s2c/1192`, không có giá hay mục.
3. Lần đầu túi manina đầy, server trả ngay `s2c/1256` "Rương đã đầy. Vui lòng bỏ bớt đồ ra hoặc mua thêm ngăn chứa". Không mất Xu.
4. Sau khi Gộp đá (bot TS, 8 lần, 708 Xu khóa, túi còn 24 ô trống), mua lại được. Server trả trong 60 ms:
   - `s2c/46`: Xu 5.053.600 → 5.052.600.
   - `s2c/115`: đúng uuid đã gửi.
   - `s2c/1187`: cả túi. Slime nằm ở ô 2, **chưa khoá** (field1 1), với **uuid mới** (khác uuid của món trên chợ).

   Game hiện "Mua vật phẩm thành công!" và bỏ món khỏi danh sách; không có `s2c/1256`, cũng không xin lại trang.

<a id="đăng-bán"></a>

### Đăng bán

- Tab **Bán** hiện túi đồ ngay trên máy, không gửi gói: ô "Vật phẩm bán", ô "Nhập giá" (Xu), luật bán và nút **Đăng bán**.
- Chạm một món trong túi mở bảng chi tiết với nút **Chọn**. Món đã khoá (biểu tượng ổ khoá) thì Chọn báo "Vật phẩm không thể rao bán!" ngay trên máy, không gửi gói. Mọi món manina có trước CT1 đều đã khoá; Slime vừa mua thì không.
- Chọn Slime, nhập giá 1000000, **Đăng bán**. Game hỏi "Đăng bán Thú cưng Slime với giá 1.000.000 Xu? Phí đăng bán 1.000 Xu." OK thì gửi:

  ```text
  c2s/112: u8 1; i32 ôTúi (2); i32 sốLượng (1); i64 giá (1.000.000)   01 00000002 00000001 00000000000f4240
  ```

- Server trả `s2c/46` (Xu 5.052.600 → 5.051.600: phí 1.000), `s2c/112` (`i32 1; i32 ôTúi; i32 sốLượng` = 1, 2, 1), `s2c/1256` "Rao bán vật phẩm thành công". [Đo CT1]
- Hàm dựng của `c2s/112` là `a81(int, int, long)`; cùng opcode còn `g80(Object)` = `u8 2; string uuid`, là **Gia hạn** ([dưới](#gia-hạn)). Số 2 đọc từ mã máy: `g80` gọi `sqi.b(I)` với hằng 2, chữ ký `(I)Lcom/mh/n/sqi;` ở bảng chuỗi +0xf5eb [Đo tĩnh NP1].

<a id="thu-hồi"></a>

### Đang bán và Thu hồi

- Tab **Đang bán**: `c2s/1192 (0, -1, 1)` → `s2c/1192` loại 2. Khi chưa bán gì: (1, 1, 0) và "Bạn chưa ký gửi vật phẩm nào." Có Slime: 1 trang, 1 món cùng bố cục với loại 1, người bán là chính mình, uuid **khác** uuid trong túi. [Đo CT1]
- Chạm món đang bán mở bảng chi tiết với hai nút **Gia hạn** và **Thu hồi**.
- **Thu hồi** → "Thu hồi Thú cưng Slime về hành trang?" → OK → `c2s/113 (string uuid)`, với uuid của món trong Đang bán. Server trả `s2c/1187` (cả túi: Slime về ô 2, chưa khoá, lại có uuid mới), `s2c/113` (đúng uuid đã gửi), `s2c/1256` "Đã nhận lại vật phẩm Thú cưng Slime". Không hoàn phí đăng bán. [Đo CT1]

<a id="gia-hạn"></a>

### Gia hạn, bán được (NP1)

NP1 (01/11, bot TS, không dùng điện thoại; người dùng đồng ý tốn phí): manina2 đăng Slime giá 20.000 Xu, gia hạn, rồi Tiheo2 mua. Sau đó làm ngược lại: Tiheo2 đăng bán và ở lại trong game, manina2 mua.

- **Gia hạn** = `c2s/112: u8 2; string uuid` (uuid của món trong Đang bán). Server trả theo thứ tự [Đo NP1]:
  1. `s2c/46`: Xu 5.050.600 → 5.049.600 (phí 1.000, đúng như cẩm nang);
  2. `s2c/1192` loại 2: Đang bán mới, uuid giữ nguyên, `expiresAt` **cộng 24 giờ vào hạn cũ** (2/11 18:33 → 3/11 18:33), không tính lại từ lúc gia hạn;
  3. `s2c/1256` "Gia hạn vật phẩm thành công".
- **Chợ dùng được ở map khác M1.** Tiheo2 đứng ở M2 vẫn mở chợ (`c2s/116`), tìm món và mua bằng `c2s/115`. Người mua: Xu −20.000, món vào túi và **không bị khoá**: Tiheo2 đăng bán lại ngay được. [Đo NP1]
- **Người bán offline:** tiền đến bằng thư của Hệ Thống, tiêu đề "Chợ trời: đã bán vật phẩm", nội dung "Thú cưng Slime x1 đã bán được 20.000 Xu. Phí chợ 5%: 1.000 Xu, thực nhận 19.000 Xu.", quà là 19.000 Xu. Nhận như mọi thư quà (`c2s/1217`, [Hòm thư](#hòm-thư)). [Đo NP1]
- **Người bán đang online:** ngay lúc người mua nhận hàng, người bán nhận `s2c/1222` (thư mới, cùng tiêu đề) rồi `s2c/1220 01`. Không có `s2c/1256`, `s2c/46` hay `s2c/1192`: Xu không cộng tới khi nhận thư. [Đo NP1]

Chưa đo: món hết hạn về hòm thư. Các hàm dựng khác gần `c2s/1192` vẫn chưa thấy trên dây: `c2s/1193` `k124(int, int)` = `i32; u8`; `c2s/1194` `E125()` rỗng; `c2s/1197`, `c2s/1198` `(int)` = `i32`; `c2s/1199` `b129(int, Object)` = `i32; string` ([c2s-builders](../c2s-builders.md)). Chưa rõ chúng có thuộc chợ hay không [Chưa rõ].

### Làm bằng bot TS

`npm run market` xem chợ, quét món rẻ nhất, Mua, Đăng bán, Thu hồi bằng đúng các gói trên, mở chợ như nút của thanh công cụ (không qua Ngọc Nga). Không có `--confirm` thì chỉ đọc. Cách chạy, các bước kiểm tra trước khi gửi và TODO: [Chợ trời bằng Node.js](../../integration/nodejs/market.md).

**Đăng bán ở protocol 0.0.7 (21/11, app Rust qua `cllt market`, manina2):** 1 Trứng Gà (ô túi 19) giá 9.000 Xu. Server trả như CT1: Xu 6.500 → 5.500 (phí 1.000), "Rao bán vật phẩm thành công", Trứng Gà 14 → 13, Đang bán đọc lại có món đó (×1, 9.000 Xu, uuid mới). `s2c/112` và Đang bán của 0.0.7 đọc đúng. [Đo]

App Rust làm Mua, Đăng bán (từng cái một), Gia hạn và Thu hồi ở tab Chợ trời của Tiện ích, cũng mở chợ như nút của thanh công cụ và hỏi lại trước mỗi việc tốn tiền hay chuyển đồ; chưa quét món rẻ nhất trên mọi trang ([features](../../integration/rust/features.md#chợ-trời)).

### Lời mời của người chơi khác

Trong CT1, một người chơi khác gửi lời mời (`s2c/17`, 73 byte: `string uuid; string tên; …`) khi cửa sổ Chợ trời đang mở. Lần chạm kế tiếp của ADB (vào nút một mục) bị hộp mời lấy mất. Client gửi `c2s/17 (false, uuid, "")`, có lẽ là từ chối, và không có gì xảy ra. Loại lời mời chưa rõ [Chưa rõ]. Cũng như lời mời giao dịch ở I1, phải xem ảnh màn hình trước mỗi lần chạm.

<a id="s2c-0"></a>

## `s2c/0` là hộp thông báo chung

Cách tính điểm của Hương Lão trả lời bằng `s2c/0` với cả đoạn chữ ở trên, không phải `s2c/57`. Trước J1, `s2c/0` chỉ thấy khi tài khoản đang đăng nhập nơi khác ([02-login](02-login.md#s2c-0)). Trước đây bot TS (`runClient`) coi mọi `s2c/0` là lỗi `SERVER_MESSAGE` và ngắt phiên, nên lần chạy thứ ba của J1 dừng ngay sau gói này. Cờ đầu gói không phân biệt được hai trường hợp: lúc đăng nhập lẫn trong game đều là -1 (J1, G1, O1). Vì vậy client phân biệt theo lúc đến [Đo]:

- **Đang đăng nhập** (chưa vào game): vẫn là lỗi `SERVER_MESSAGE` kèm chữ của server, như "Tài khoản hiện đang đăng nhập ở một nơi khác".
- **Đã vào game:** client ghi dòng `server_message` (cờ, chữ), giao gói cho phiên (`onPacket(0, …)`) rồi chạy tiếp. Nếu sau đó server đóng kết nối thì chẩn đoán `SERVER_CLOSED` có kèm `lastServerMessage` và `secondsAgo` (gói đó đến bao lâu trước).
- **Đã vào game mà chữ là "…đăng nhập ở một nơi khác":** vẫn là lỗi `SERVER_MESSAGE` (kèm `inWorld: true`) và phiên dừng ngay. Phiên đã bị nơi khác chiếm; kết nối cũ còn nhận gói một lúc (lần ở Tiheo2 trong [Hương Lão](#hương-lão-trần-bá)), nên bot không được gửi gì thêm.
- Test: `test/client.test.ts` (server giả gửi hộp thông báo của O1, rồi lời báo đăng nhập nơi khác, sau khi vào game).

## Ghi chú về Frida

Sau khoảng 8 phút gắn agent ghi gói và agent đi xuyên quái (thay `sqhz.a17` bằng hàm rỗng), game tắt khi nhân vật đang đi bằng cần điều khiển. Logcat có `SIGSEGV` trong luồng `GLThread` lúc bộ dọn rác của ART quét gốc (`art::gc::Verification::LogHeapCorruption`). Nhân vật không ở trong trận nên không mất gì. Nguyên nhân chưa rõ; lần sau nên gắn ít hook hơn và tháo agent đi xuyên quái khi không cần. [Đo; nguyên nhân Chưa rõ]

## Chưa đo

- Ở Hương Lão: Đổi Xu khi đủ 100 điểm năng động, lượt nhiệm vụ ngày thứ 4, Đổi lượng khi thiếu Lượng. Nhận, Hủy, Hoàn thành nhiệm vụ ngày (G1, NP1), Đổi Xu khi chưa đủ điểm (G1), Đổi lượng 41 lần một ngày (NP1) đã đo ([Nhiệm vụ hàng ngày](#nhiệm-vụ-hàng-ngày), [Điểm năng động](#điểm-năng-động)).
- `c2s/57` cho Hương Lão khi menu cuối là menu con của NPC khác ([trí nhớ menu](#trí-nhớ-menu)).
- Ở Pháp sư: luyện đá thất bại, Chế Băng Kiếm, Chế tạo cánh ([16-upgrade](16-upgrade.md#chưa-đo)). Nâng cấp, Cẩn thận, Luyện đá, Tách đá, Chuyển hoá đã bấm thật ở J3; bùa, nâng tới +7, Chế tạo trang bị, Đổi Băng Tâm ở O1 ([kết quả](16-upgrade.md#o1)).
- Ở Chợ trời: món hết hạn sau 24 giờ. Mua, Đăng bán, Thu hồi (CT1), Gia hạn và bán được (NP1) đã đo ([Gia hạn, bán được](#gia-hạn)).
