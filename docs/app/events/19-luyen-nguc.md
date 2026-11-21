# Luyện Ngục

Phiên **LN1** (20/11, game 1.1.0): tiheo1 (cấp 53) trên điện thoại, Frida ghi gói gửi và nhận (`captures/pl1-2026-11-20/3-frida-tiheo1.jsonl`, từ dòng 5300). Không đánh quái nào.

## Cổng Luyện Ngục (M15)

- **M15 là "Cổng Luyện Ngục"** (`s2c/11`, `s2c/29` lúc đăng nhập). Bảng [08](08-server-map-zone.md) ghi M15 [Chưa rõ]; nay đã rõ. Map không có quái: `s2c/43` chỉ có `"M15"` và byte `03`. [Đo LN1]
- Bảy điểm ở cuối `s2c/11`, mỗi điểm `i32 id; string tên; u8 loại; i32 x; i32 y; i32 32; i32 32; i32 0; i32 0` [Đo LN1]:

| id | Tên | Loại | x, y | Dẫn tới |
|---|---|---|---|---|
| 14 | Trở Về | 0 (biển gỗ) | 33, 176 | map trước |
| 1000 | Luyện Ngục 1 | 1 (cổng đầu quỷ) | 225, 169 | M18 |
| 1001 | Luyện Ngục 2 | 1 | 417, 169 | M19 |
| 1002 | Luyện Ngục 3 | 1 | 609, 169 | M20 |
| 1003 | Luyện Ngục 4 | 1 | 865, 296 | M21 (tầng giữa) |
| 1006 | Hang Bạch Hổ | 1 | 129, 425 | M24 (tầng dưới cùng) |
| 1008 | Sơn Vi | 0 (biển gỗ) | 1022, 432 | map Sơn Vi |

- Map có ba tầng: tầng trên có Trở Về và cổng 1–3; rơi khỏi mép phải xuống tầng giữa có cổng 4 và một thang; thang xuống tầng dưới cùng có Hang Bạch Hổ (trái) và biển Sơn Vi (phải). Hai cổng đầu quỷ ở tầng dưới không có quả cầu âm dương và không có tên: chỉ là hình trang trí. [Đo LN1]
- Vào cổng trên điện thoại: chạm vào cổng không làm gì. Phải **đi bộ (cần điều khiển) vào ô của cổng** thì nút **Vào** hiện ở giữa phía dưới, bấm thì gửi `c2s/13 (mapId, id cổng)`, như các cổng khác ([10-quests](10-quests.md#cổng)). Đẩy cần lên không vào. [Đo LN1]

## Luyện Ngục 1 (M18)

- Bấm Vào ở cổng 1: `c2s/13 ("M15", 1000)` → `s2c/13 ("M18", 17, 0, 0xff)` → `c2s/11 ("M18", -1)` → `s2c/11` "Luyện Ngục 1" → `c2s/43` → `s2c/43`. Không mất phí, không hỏi gì. Số sau mapId trong `s2c/13` là thứ tự map ([06-map-mobs](06-map-mobs.md)): M15 14, M18 17, M19 18, M20 19, M21 20, M24 23. [Đo LN1]
- Ngay khi vào, server gửi `s2c/1256` **"Cần Nhẫn Luyện Ngục 1 trở lên còn độ bền, không thì vào trận là thua ngay"**. tiheo1 đeo Nhẫn Chữ Thập (372), túi không có nhẫn Luyện Ngục, nên không đánh. [Đo LN1]
- Nhẫn Luyện Ngục trong bảng 29 ([13-drops-items](13-drops-items.md)): 375 Luyện Ngục Tầng 1 ("Đeo để đánh quái tại Luyện Ngục 1"), 402 Tầng 2 (LN 1, 2), 405 Tầng 3 (LN 1–3), 408 Tầng 4 (LN 1–4); đều loại 3 (Nhẫn). Nhẫn tầng cao dùng được ở tầng thấp. [Bảng 29]
- Quái khu 0 (`s2c/43`, 16 con) [Đo LN1]:

| Quái | mobId | Cấp | Hệ (`a`) | Số con |
|---|---|---|---|---|
| Ma Binh Nhất Cấp | mob680, mob68100–68400 | 30 | 0 | 5 |
| Ma Binh Nhị Cấp | mob71500–71900 | 40 | 2 | 5 |
| Ma Tướng Nhất Cấp | mob691000–691500 | 50 | 4 | 6 |

- Cổng ra duy nhất: id 17 "Cổng Luyện Ngục" (loại 1, x 97, y 200), ngay chỗ vừa vào. Đi vào ô cổng, nút Vào hiện, bấm: `c2s/13 ("M18", 17)` → `s2c/13 ("M15", 14, 0, 0xff)` → `c2s/11` → `s2c/11` → `c2s/43` → `s2c/43`. [Đo LN1]
- Người khác đánh ở đây thì đồ rơi hiện ra bằng `s2c/1182` (ví dụ 497 Xu khóa, 4 Linh Thạch Bậc 1). Quái đi lại trên bục (mob di chuyển). [Đo LN1]

## Luyện Ngục 2, 3, 4

Giống hệt Luyện Ngục 1: cùng hình map (`s2c/11` 4374 byte), một cổng ra "Cổng Luyện Ngục" ở x 97, y 200 (id 18, 19, 20), vào là có `s2c/1256` "Cần Nhẫn Luyện Ngục N trở lên còn độ bền, không thì vào trận là thua ngay" với N là số tầng. Ra thì `s2c/13 ("M15", 14, 0, 0xff)`. Quái khu 0 (`s2c/43`) [Đo LN1]:

| Tầng | Map | Quái (cấp, hệ `a`, số con) |
|---|---|---|
| 1 | M18 | Ma Binh Nhất Cấp (30, 0, 5), Ma Binh Nhị Cấp (40, 2, 5), Ma Tướng Nhất Cấp (50, 4, 6) |
| 2 | M19 | Ma Binh Tam Cấp (60, 0, 5), Ma Binh Tứ Cấp (70, 2, 5), Ma Tướng Nhị Cấp (80, 4, 6) |
| 3 | M20 | Ác Ma Nhất Cấp (90, 2, 5), Ác Ma Nhị Cấp (100, 4, 5), Hỏa Hồng Trư (110, 0, 6) |
| 4 | M21 | Ác Ma Tam Cấp (120, 2, 5), Ác Ma Tứ Cấp (130, 4, 5), Đại Địa Cự Hùng (140, 0, 5), **Ngưu Ma Thống Lĩnh** (150, 0, 1 con) |

**Luyện Ngục 5 (M22) và 6 (M23)** (MP1, 22/11, cấp 98): vào thẳng qua Bản đồ thế giới (`c2s/13 ("M99", 21)` và `22`), không có quái nào lúc 05:03 sáng, mỗi map một cổng ra 21, 22 "Cổng Luyện Ngục" (loại 1). Có quái theo giờ hay theo sự kiện thì chưa biết. [Đo]

Cấp quái tăng 10 mỗi loại, từ 30 tới 150. Ngưu Ma Thống Lĩnh chỉ có một con và nằm trong `s2c/43` như quái thường (không có `s2c/1177` như boss) [Đo LN1]. Quái ở đây có lẽ là nơi luyện cấp cho nhân vật cao cấp, nhưng chưa đánh nên chưa biết EXP, đồ rơi và độ bền nhẫn mất bao nhiêu mỗi trận [Chưa đo].

## Hang Bạch Hổ (M24)

- Cổng 1006 ở tầng dưới cùng của Cổng Luyện Ngục. `c2s/13 ("M15", 1006)` → `s2c/13 ("M24", 23, 0, 0xff)` → `s2c/11` "Hang Bạch Hổ" (2169 byte). **Vào được lúc 20/11 ngoài giờ boss (21:00–21:59)**, không có thông báo, không cần nhẫn. [Đo LN1]
- Trong hang: không quái (`s2c/43` chỉ có `"M24"` và `03`), một tảng đá mắt đỏ ở giữa, một cổng ra id 23 "Cổng Luyện Ngục" (x 97, y 328). Không có gói boss (`s2c/1252`, `s2c/1177`) lúc ở trong hang. [Đo LN1]
- Đây là câu hỏi còn mở của [17-bach-ho](17-bach-ho.md) ("Vào hang bằng cách nào?"): đi M15 rồi vào cổng 1006. Bot TS gửi `c2s/13 ("M15", 1006)` khi đang ở M15 là được, như mọi cổng. Chưa biết trong giờ boss thì boss hiện ở đâu và đánh bằng gì. [Đo LN1, phần sau là suy luận]

## Ra khỏi Luyện Ngục

- Biển **Sơn Vi** (id 1008, tầng dưới cùng, bên phải) không dẫn tới map tên Sơn Vi: đi vào nó thì client tự gửi `c2s/13 ("M15", 1008)` (không có nút Vào), server trả `s2c/13 ("M99", 14, 0, 0xff)` và client mở **bản đồ thế giới** (`c2s/11 "M99"`). Trên bản đồ, Luyện Ngục là một ngọn núi xám ở góc trên bên trái, không có cấp; nhân vật đứng ở đó. [Đo LN1]
- Bấm **Vào thành** (đang chọn Thanh Khê) gửi `c2s/13 ("M99", 0)` → `s2c/13 ("M1", 0, 0, 0xff)` → `c2s/11 "M1"` → `s2c/11` "Làng Thanh Khê" → `c2s/43`. tiheo1 tới Làng Thanh Khê khu 0, cạnh biển Cổ Phong. [Đo LN1]
- Biển **Trở Về** (id 14, tầng trên cùng) chưa thử. [Chưa đo]
