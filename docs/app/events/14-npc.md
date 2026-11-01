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
| `s2c/0` là gì? | Hộp thông báo chung của server, không chỉ báo "đăng nhập nơi khác". Hương Lão → Điểm năng động → Cách tính điểm trả lời bằng `s2c/0`, và bot TS hiện coi gói này là lỗi nên ngắt phiên ([s2c/0](#s2c-0)). [Đo] |

<a id="hộp-thoại"></a>

## Hộp thoại `s2c/57`

`s2c/57` = `i32 n; string tênNPC; string lời; n × {u8 mãDòng; string nhãn}`, bố cục ở [12-skills-items](12-skills-items.md#c2s-1190). Nhãn có thể xuống dòng ("Bán\nvật phẩm", "Nón Nam\n[Xu]"). Server trả lời trong khoảng 30 ms. [Đo]

`c2s/57` = `u8 mãDòng; string mapId; i32 npcId`, cùng một gói ở mọi tầng menu. Lúc chọn menu con, trên máy gửi `00 "M1" 161` cho Nâng cấp rồi lại `00 "M1" 161` cho Nâng cấp [Thường]. [Đo]

**Server nhớ menu đang mở, gói không nói tầng nào.** Ở Hương Lão, cùng một gói `00 "M1" 102` là Mã quà tặng (menu gốc), "50 lượng nhận 50.000 Xu" (Đổi lượng, **đổi ngay**), Nhận nhiệm vụ hay Hủy nhiệm vụ hiện tại (Nhiệm vụ hàng ngày), hoặc Đổi Xu (Điểm năng động), tuỳ `s2c/57` cuối cùng server đã gửi [Đo G1]. Bot phải mở NPC bằng `c2s/13`, đi đúng đường menu, và chỉ gửi `c2s/57` với dòng có trong `s2c/57` vừa nhận. Không bao giờ gửi lại một `c2s/57` cũ. Sau khi menu đóng (chạm vào khung chữ, hay sau một việc), server có còn nhớ menu cũ không thì chưa thử [Chưa rõ].

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
| M10 | 145 Tướng phe Thiết Hổ, 132 Lính Cửu Phong | "Xin chào" | 0 OK |

NPC của nhiệm vụ (Võ Quan, Tướng Quân Lê Viễn…) chỉ có lời riêng khi bước nhiệm vụ cần họ ([Bước Tỷ thí](10-quests.md#tỷ-thí)). [Đo]

<a id="cửa-hàng"></a>

## Cửa hàng

Bà Tư Hạnh và Lái Buôn bán ở 14 cửa hàng. Chọn một cửa hàng thì server gửi `s2c/1190`, byte đầu là mã cửa hàng. Bà Tư Hạnh và Vũ khí của Lái Buôn có thêm một tầng menu chọn loại tiền (và đồ nam hay nữ). Đường menu của từng cửa hàng, mọi sản phẩm với giá, bố cục bản ghi 33 và 49 byte, mua bằng Lượng và Đổi lượng ở [15-shops](15-shops.md). [Đo J1]

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
s2c/1195  u8 có                   0: không có nhiệm vụ ngày (1 byte)
          nếu 1: i32 mãNhiệmVụ; string tên; string mẫu ("%d" là mục tiêu); i32 tiếnĐộ; i32 mụcTiêu
```

| Mã | Tên | Mẫu | Mục tiêu |
|---|---|---|---|
| 116 | Sử dụng vật phẩm | Sử dụng %d vật phẩm trong trận đấu | 3 |
| 113 | Nhặt xu | Thu thập %d xu khóa từ đánh quái | 2050 |

- Tab **Phụ** của khung nhiệm vụ bên trái hiện "Sử dụng 0/3 vật phẩm trong trận đấu"; mở tab không gửi gói nào. Nhân vật vẫn giữ nhiệm vụ chính (tab Chính).
- Cẩm nang (mục Nhiệm vụ): mỗi ngày nhận tối đa 3 nhiệm vụ, mỗi lần làm 1; làm xong thì về Hương Lão chọn **Hoàn thành nhiệm vụ**; thưởng là kinh nghiệm, Xu khóa hoặc vật phẩm. Theo Cách tính điểm, mỗi lần nhận thưởng nhiệm vụ ngày được 5 điểm năng động.
- Chưa đo [Chưa rõ]: tiến độ tăng thế nào (có `s2c/1195` mới sau mỗi trận không), dòng Hoàn thành nhiệm vụ và phần thưởng, nhận lượt thứ 4 trong ngày, mấy giờ thì tính sang ngày mới. Muốn đo thì phải đánh trận. Tiheo2 đang giữ nhiệm vụ 113 (0/2050), đã dùng 2/3 lượt của 01/11.

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
- Thời gian chặn: vẫn bị chặn ở 3 phút 10 s sau lần sai thứ 10, hết chặn ở 6 phút 10 s, nên khớp 5 phút của Cẩm nang. Lần thử ở phút thứ 3 không làm chặn lâu thêm: nếu mỗi lần thử lúc bị chặn tính lại 5 phút thì ở phút thứ 6 vẫn còn bị chặn [Đo G1].
- Đếm "liền" theo gì: lần chặn đến sau đúng 10 lần sai của cùng một lần đăng nhập (SAIMA2028–2037). SAIMA2026 và SAIMA2027 ở hai lần đăng nhập trước, hay bị ngắt quãng bởi một mã đã dùng ("  DENBU  "), không cộng vào. Server đếm theo lần đăng nhập, hay lần nhập mã đã dùng làm số đếm về 0, thì chưa phân biệt được [Chưa rõ].
- Ô mã nhận tối đa 32 ký tự (`setMaxLength(32)` trong `sqcc`) và có bộ lọc ký tự (`sqcd`, chưa đọc) [Đọc code].
- Server có phân biệt chữ hoa, chữ thường không: chưa thử được qua client, vì client luôn gửi chữ hoa. Cẩm nang ghi "không phân biệt chữ hoa, chữ thường".
- Phần thưởng nằm trong hòm thư ([Hòm thư](#hòm-thư)).
- **Bot TS gửi `c2s/1223` thẳng được:** 1,5 s sau khi vào game, nhân vật đứng ở M1 nhưng không mở Hương Lão hay Phúc lợi. Server trả `s2c/1223` và `s2c/1256` sau 52 ms, giống hệt khi bấm trên điện thoại [Đo G1].
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

Không cần điện thoại hay NPC: mọi gói ở trên gửi được ngay sau khi vào game. Client mở Mã quà tặng qua Hương Lão, nhưng bot gửi thẳng `c2s/1223` cũng được [Đo G1].

1. Nhập mã: `c2s/1223 (string mã)`, đổi chữ hoa và cắt dấu cách trước, tối đa 32 ký tự. Đọc `s2c/1223`: `ok` 1 thì chờ `s2c/1222` (thư mới); `ok` 0 thì dừng và báo lời của server. Server không cho biết đã sai mấy lần, nên bot tự đếm số lần sai liền của nick: 10 lần sai liền thì mọi mã (kể cả mã đúng) bị từ chối với "Bạn nhập mã quá nhanh, vui lòng thử lại sau" trong 5 phút. Gặp lời này thì chờ đủ 5 phút rồi mới gửi tiếp. Không thử mã đoán mò.
2. Xem hòm: `c2s/1215` → `s2c/1215`. Với mỗi thư `cóQuà` 1, `đãNhận` 0: `c2s/1216` để biết món (tiền là `#40`–`#42`), rồi `c2s/1217`. Đếm ô trống của túi trước: món đã có trong túi thì cộng vào chồng (đã thấy khi cùng đã khoá); món mới và mỗi viên đá (không chồng) cần một ô. `s2c/1217` `ok` 1 thì cập nhật tiền theo `s2c/46` và túi theo `s2c/1187`; `ok` 0 kèm "Rương đã đầy" thì dừng, báo người dùng.
3. Hay dùng `c2s/1218` (Nhận hết): nhận được thư nào hay thư đó, an toàn với túi đầy. Đọc lời trong `s2c/1256` ("Đã nhận quà của N thư", "…, rương đã đầy", "Không có quà nào để nhận") và danh sách mới trong `s2c/1215`.
4. Xoá: chỉ `c2s/1219` từng thư có `đãNhận` 1. **Không bao giờ gửi `c2s/1221`** khi còn thư có quà chưa nhận.

<a id="ngọc-nga"></a>

## Ngọc Nga (Chợ trời)

Cả ba dòng đều trả `s2c/1192`; byte đầu cho biết loại. [Đo J1]

| Dòng | `s2c/1192` |
|---|---|
| 0 Chợ trời | Byte đầu 1, 2664 byte: tên mục "Vũ Khí", rồi các món đang bán, mỗi món có uuid, tên người bán và giá. Bố cục từng món chưa giải hết [Chưa rõ] |
| 1 Bán vật phẩm | Byte đầu 0, rồi `string`: "Phí đăng bán 1.000 Xu, bán trong 24 giờ, phí chợ 5% khi bán được. Tiền bán được và vật phẩm hết hạn gửi về hộp thư." |
| 2 Đang bán | 13 byte `02 00000001 00000001 00000000`: byte đầu 2, rồi ba số i32 (1, 1, 0). Có lẽ là trang, số trang và số món đang bán [Suy luận] |

`c2s/1192` có hàm dựng `sqlq.m144(int, int)` = `u8; i32; i32` ([c2s-builders](../c2s-builders.md)); có lẽ đó là gói lật trang hay chọn mục, nhưng chưa đo. [Chưa rõ]

<a id="s2c-0"></a>

## `s2c/0` là hộp thông báo chung

Cách tính điểm của Hương Lão trả lời bằng `s2c/0` với cả đoạn chữ ở trên, không phải `s2c/57`. Trước J1, `s2c/0` chỉ thấy khi tài khoản đang đăng nhập nơi khác ([02-login](02-login.md#s2c-0)). Bot TS (`runClient`) coi mọi `s2c/0` là lỗi `SERVER_MESSAGE` và ngắt phiên, nên lần chạy thứ ba của J1 dừng ngay sau gói này. Muốn bot đọc được các thông báo kiểu này thì phải phân biệt hai trường hợp, ví dụ theo lúc đến (đang đăng nhập hay đã vào game) hoặc theo cờ đầu gói. [Đo; cách phân biệt Chưa rõ]

## Ghi chú về Frida

Sau khoảng 8 phút gắn agent ghi gói và agent đi xuyên quái (thay `sqhz.a17` bằng hàm rỗng), game tắt khi nhân vật đang đi bằng cần điều khiển. Logcat có `SIGSEGV` trong luồng `GLThread` lúc bộ dọn rác của ART quét gốc (`art::gc::Verification::LogHeapCorruption`). Nhân vật không ở trong trận nên không mất gì. Nguyên nhân chưa rõ; lần sau nên gắn ít hook hơn và tháo agent đi xuyên quái khi không cần. [Đo; nguyên nhân Chưa rõ]

## Chưa đo

- Hoàn thành nhiệm vụ hàng ngày (phải đánh trận cho xong), Đổi Xu khi đủ 100 điểm năng động, Chế Băng Kiếm, chọn bậc ở Chế tạo trang bị: đều có thể làm thay đổi tài khoản ngay khi bấm. Nhận và Hủy nhiệm vụ hàng ngày, Đổi Xu khi chưa đủ điểm đã đo ở G1 ([Nhiệm vụ hàng ngày](#nhiệm-vụ-hàng-ngày), [Điểm năng động](#điểm-năng-động)).
- Ở Pháp sư: bùa bảo vệ, nâng từ +2 trở lên, luyện đá thất bại, chế tạo ([16-upgrade](16-upgrade.md#chưa-đo)). Nâng cấp, Cẩn thận, Luyện đá, Tách đá, Chuyển hoá đã bấm thật ở J3 ([kết quả](16-upgrade.md#j3)).
- Mua, bán, rút tiền ở Chợ trời.
