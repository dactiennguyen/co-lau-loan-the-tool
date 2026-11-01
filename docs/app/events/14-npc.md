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
| 0 Mã quà tặng | `s2c/1224` rỗng (0 byte). Có lẽ client mở ô nhập mã [Suy luận] |
| 1 Đổi lượng | `s2c/57` "Con muốn đổi gì.": 0 "50 lượng nhận 50.000 Xu", 1 "50 lượng nhận 55.000 Xu khóa" (J2). J3 chọn dòng 1: đổi ngay, không hỏi lại ([Đổi lượng](15-shops.md#đổi-lượng)) |
| 2 Nhiệm vụ hàng ngày | `s2c/57` "Hôm nay con đã nhận 0/3 nhiệm vụ hàng ngày." với một dòng 0 Nhận nhiệm vụ. J1 không nhận |
| 3 Điểm năng động | `s2c/57` "Điểm năng động tuần này: 54/100\nHạn mức đổi (cấp 79): 7.000 Xu, cần 7.700 Xu khóa\nTuần này còn 500/500 suất. Hết tuần lúc 00:00 thứ Hai." với 0 Đổi Xu, 1 Cách tính điểm, 2 Đóng |
| 3 → 1 Cách tính điểm | `s2c/0` (xem [dưới](#s2c-0)): "Điểm năng động tính theo tuần (bắt đầu 00:00 thứ Hai): Nhận thưởng nhiệm vụ ngày: 5 điểm (tối đa 3 nhiệm vụ / ngày); Thắng 10 / 20 / 30 trận đánh quái trong ngày: +2 điểm mỗi mốc (quái không quá thấp so với con); Tham gia Bạch Hổ (cấp 30+): 3 điểm / ngày; Nhiệm vụ Bảo Điển ngày (khi có mùa): 1 điểm (tối đa 4 / ngày). Đủ 100 điểm: đổi Xu khóa lấy Xu một lần mỗi tuần, hạn mức theo cấp. Mỗi tuần chỉ 500 người đổi đầu tiên có suất." |

[Đo J1, J2]

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

- Nhận nhiệm vụ hàng ngày, Đổi Xu (điểm năng động), Chế Băng Kiếm, chọn bậc ở Chế tạo trang bị: đều có thể làm thay đổi tài khoản ngay khi bấm.
- Ở Pháp sư: bùa bảo vệ, nâng từ +2 trở lên, luyện đá thất bại, chế tạo ([16-upgrade](16-upgrade.md#chưa-đo)). Nâng cấp, Cẩn thận, Luyện đá, Tách đá, Chuyển hoá đã bấm thật ở J3 ([kết quả](16-upgrade.md#j3)).
- Mua, bán, rút tiền ở Chợ trời.
