# Bản đồ, khu vực và quái: liệt kê, di chuyển, va chạm

Mốc: APK 1.0.3, bản đồ M1 "Làng Thanh Khê". Nguồn:
- Phiên **B1** (spawn, khu 0).
- Phiên **B2** (29/10/2026, attach vào cùng tiến trình, khu 20): hook packet như [05-battle](05-battle.md), cộng hook tại các hàm dựng gói trong `com.mh.sqlq`, và đọc object quái trong bộ nhớ bằng reflection qua JNI.
- Phiên **S1** (30/10/2026, bot Node, không cần điện thoại): thử xin dữ liệu map khác, thử từng cổng, rồi quét mọi map vào được bằng `npm run scan` ([Bản đồ đã quét](#atlas)).
- Phiên **Z1** (31/10/2026, bot TS `npm run zone`, manina ở M2): xem danh sách khu, đổi sang khu 4, đăng nhập lại ([Đổi khu](#đổi-khu-vực-trong-cùng-map)).
- Phiên **S2** (01/11/2026, `npm run scan` với tiheo1 = symap cấp 42, đứng ở M5 Lạc Cốc): quét lại, học thêm M4 Hồng Giang và M5 Lạc Cốc, cập nhật M10 Cửu Phong ([Bản đồ đã quét](#atlas)).

Nhãn: **[Đo]**, **[Suy luận]**, **[Chưa rõ]** như các file khác.

## Tóm tắt

| Câu hỏi | Trả lời |
|---|---|
| Map có những quái nào? | `c2s/43 (mapId)` → `s2c/43`: danh sách đủ `mobId`, tên, cấp của **khu hiện tại**. M1 có 5 loại, 33 con mỗi khu; M2 có 6 loại, 31 con; M4 có 6 loại, 31 con; M5 có 5 loại, 26 con; M10 có 5 loại, 30 con; M25 không có quái ([Bản đồ đã quét](#atlas)). [Đo] |
| Xem được map chưa vào không? | **Không.** Server chỉ trả map đang đứng: `c2s/11` với map khác bị từ chối ("Không thể chuyển khu vực"), `c2s/43` với map khác vẫn trả quái của map đang đứng. Muốn biết NPC, cổng, quái của map nào thì phải vào map đó qua cổng. [Đo S1] |
| Vị trí quái? | Server **không gửi** cho quái thường. Client tự đặt và cho quái đi lại. Muốn có toạ độ phải đọc trong bộ nhớ: `sqhz.J.e` chứa mọi entity. Boss thì có ô đứng trong `s2c/1177`; NPC và cổng có toạ độ trong `s2c/11`. [Đo] |
| Di chuyển? | Client tự di chuyển trên lưới va chạm của `s2c/11` và báo vị trí bằng `c2s/1169` (x, y, trạng thái). Server nhận cả vị trí do bot Node tự gửi và lưu lại. Sang bản đồ khác: đứng ở cổng, bấm "Vào" → `c2s/13 (mapId, id cổng)` ([10-quests](10-quests.md#cổng)). [Đo] |
| Đổi khu cùng map? | `c2s/1173 (u8 khu)` → `s2c/13 (mapId, khu)` → `c2s/11 (mapId, khu)` → `s2c/11` → `c2s/43` → `s2c/43`. Bot TS làm được (`npm run zone -- --zone=N`, Z1). Đăng nhập lại thì về khu 0. [Đo] |
| Code nào chạy khi va chạm quái? | `com.mh.sqhz.a18(mob, bool)` → `sqhz.a17(mob, bool, int)` → `sqlq.a67(mobId, false)` → `c2s/15`. [Đo] |

## Quái của M1

Mỗi khu có cùng 5 loại và cùng số lượng; chỉ `mobId` đổi theo khu. [Đo khu 0 và khu 20]

| Loại | Cấp | Số con/khu | mobId khu 0 | mobId khu 20 | Hitbox (đơn vị server) |
|---|---:|---:|---|---|---|
| Gà Điên | 1 | 8 | `mob10`…`mob17` | `mob1160`…`mob1167` | 24×20 |
| Heo Mọi | 7 | 6 | `mob2800`…`mob2805` | `mob2920`…`mob2925` | 25×20 |
| Kẻ Gây Rối | 7 | 6 | `mob31400`…`mob31405` | `mob31520`…`mob31525` | 29×20 |
| Sơn Tặc | 9 | 6 | `mob42000`…`mob42005` | `mob42120`…`mob42125` | 29×20 |
| Chỉ Huy Sơn Tặc | 10 | 7 | `mob872600`…`mob872606` | `mob872740`…`mob872746` | 25×20 |

Các khu đã thấy (0, 1, 20) đều khớp quy luật `"mob" + mãLoại + (gốc + khu × sốCon + i)`, ghép chuỗi: Gà Điên `1|0+20·8`, Heo Mọi `2|800+20·6`, Kẻ Gây Rối `3|1400+20·6`, Sơn Tặc `4|2000+20·6`, Chỉ Huy `87|2600+20·7`. Gà Điên khu 1 là `mob18`, `mob19`, `mob110`…`mob115` (mã loại `1`, số 8…15). `mãLoại` = loại quái trong bước nhiệm vụ + 1 ([mã quái](#mã-quái)). [Suy luận]

Boss Thủ Lĩnh Sơn Tặc (`mob86100001`) không có trong 43; nó đến riêng qua s2c/1177.

### Ảnh chụp vị trí, khu 20

Toạ độ đổi về đơn vị server (= bộ nhớ ÷ 1,5). Đây là một thời điểm duy nhất lúc 17:25:03; quái luôn đi lại, nên không dùng làm toạ độ cố định. [Đo]

| mobId | Tên | Cấp | x | y | hitbox x,y,w,h |
|---|---|---:|---:|---:|---|
| `mob1160` | Gà Điên | 1 | 3296 | 588 | 3304,620,24,20 |
| `mob1161` | Gà Điên | 1 | 1470 | 620 | 1478,652,24,20 |
| `mob1162` | Gà Điên | 1 | 4020 | 620 | 4023,652,24,20 |
| `mob1163` | Gà Điên | 1 | 4056 | 364 | 4066,396,24,20 |
| `mob1164` | Gà Điên | 1 | 2793 | 140 | 2797,172,24,20 |
| `mob1165` | Gà Điên | 1 | 4350 | 236 | 4358,268,24,20 |
| `mob1166` | Gà Điên | 1 | 591 | 620 | 599,652,24,20 |
| `mob1167` | Gà Điên | 1 | 3247 | 172 | 3255,204,24,20 |
| `mob2920` | Heo Mọi | 7 | 2819 | 667 | 2827,684,25,20 |
| `mob2921` | Heo Mọi | 7 | 4845 | 635 | 4853,652,25,20 |
| `mob2922` | Heo Mọi | 7 | 2817 | 667 | 2821,684,25,20 |
| `mob2923` | Heo Mọi | 7 | 2373 | 91 | 2381,108,25,20 |
| `mob2924` | Heo Mọi | 7 | 1901 | 603 | 1905,620,25,20 |
| `mob2925` | Heo Mọi | 7 | 3741 | 251 | 3750,268,25,20 |
| `mob31520` | Kẻ Gây Rối | 7 | 4623 | 361 | 4631,396,29,20 |
| `mob31521` | Kẻ Gây Rối | 7 | 1091 | 425 | 1101,460,29,20 |
| `mob31522` | Kẻ Gây Rối | 7 | 1107 | 233 | 1109,268,29,20 |
| `mob31523` | Kẻ Gây Rối | 7 | 724 | 137 | 727,172,29,20 |
| `mob31524` | Kẻ Gây Rối | 7 | 1213 | 425 | 1217,460,29,20 |
| `mob31525` | Kẻ Gây Rối | 7 | 1759 | 649 | 1762,684,29,20 |
| `mob42120` | Sơn Tặc | 9 | 2809 | 393 | 2817,428,29,20 |
| `mob42121` | Sơn Tặc | 9 | 4507 | 617 | 4517,652,29,20 |
| `mob42122` | Sơn Tặc | 9 | 203 | 297 | 213,332,29,20 |
| `mob42123` | Sơn Tặc | 9 | 1891 | 73 | 1901,108,29,20 |
| `mob42124` | Sơn Tặc | 9 | 1324 | 617 | 1330,652,29,20 |
| `mob42125` | Sơn Tặc | 9 | 2159 | 201 | 2161,236,29,20 |
| `mob872740` | Chỉ Huy Sơn Tặc | 10 | 4165 | 603 | 4169,620,25,20 |
| `mob872741` | Chỉ Huy Sơn Tặc | 10 | 2095 | 219 | 2103,236,25,20 |
| `mob872742` | Chỉ Huy Sơn Tặc | 10 | 2135 | 603 | 2143,620,25,20 |
| `mob872743` | Chỉ Huy Sơn Tặc | 10 | 3635 | 603 | 3645,620,25,20 |
| `mob872744` | Chỉ Huy Sơn Tặc | 10 | 1072 | 251 | 1081,268,25,20 |
| `mob872745` | Chỉ Huy Sơn Tặc | 10 | 1871 | 283 | 1879,300,25,20 |
| `mob872746` | Chỉ Huy Sơn Tặc | 10 | 640 | 635 | 643,652,25,20 |

<a id="atlas"></a>

## Bản đồ đã quét (S1, S2)

**Kết luận: ở cấp 19 chỉ vào được 3 map: M1, M2, M25.** Mọi cổng khác bị server từ chối: hoặc vì cấp, hoặc vì chưa xong nhiệm vụ. Server cũng không trả dữ liệu của map mình chưa đứng trong đó, nên chưa lấy được NPC, cổng, quái của 22 map còn lại. [Đo S1]

**Ở cấp 42 (symap, nhiệm vụ 23) vào được 6 map: M1, M2, M4, M5, M10, M25.** Atlas có thêm M4 Hồng Giang và M5 Lạc Cốc. Ba cổng còn khoá theo nhiệm vụ (Bạch Nham 1011, Phong Nguyên 1012, Tiên Cốc 1021), bốn cổng khoá theo cấp (Tam Khê 80, Nguyệt Đàm 100, Tân Trạch 110, Cổ Phong 130). Bot không thử lại cổng đã biết cần cấp cao hơn nhân vật. Quét mất 16 giây. [Đo S2]

**Ở cấp 79 (S3, 01/11, symap, nhiệm vụ 25 bước 3) vẫn chỉ 6 map ấy.** Bạch Nham, Phong Nguyên và Tiên Cốc vẫn trả lời "Bạn cần hoàn thành nhiệm vụ trước khi tới đây", nên chúng mở theo nhiệm vụ chính chứ không theo cấp; Tam Khê cần cấp 80. Không có quái hay boss mới, chỉ ô đứng của boss đổi. Chín boss còn lại (Tướng Thiết Kích, Tướng Trấn Vũ, Tướng Vũ Kình, Tướng Nham Hổ, Đàm Xuyên, Thạch Khôi, Lôi Tướng, Nguyễn Bá Dực, Vệ Xích) mới biết tên qua `s2c/45`. Lên cấp bằng đánh quái cũng không được: quái ở 6 map này cao nhất cấp 58, thấp hơn symap quá 20 cấp nên không cho EXP. [Đo S3]

**Ở cấp 98 (MP1, 22/11, manina3 = mania4, nhiệm vụ "Phá Cổng Thành Đông", Hỏa Điểu 4/10) vào được 17 map**, atlas ghi đủ (`npm run scan`, rồi một script thử thêm Bản đồ thế giới và các cổng loại 1; log ở `captures/mp1-2026-11-22/`): M1, M2, M4, M5, M8, M10, **M11 Tiên Cốc** (mới), M13, M15, **M18–M23 Luyện Ngục 1–6** (mới trong atlas), M24, M25. [Đo]
- **M11 Tiên Cốc** (cổng 1021 ở Cửu Phong, cổng 10 Bản đồ, 1018 Nguyệt Đàm, 1020 Cửu Phong): Quái Điểu 80, Yêu Cáo Chiến Binh 82, Báo Hồng 83, **Hỏa Điểu 83**, Mộc Linh 85, Thanh Xà 89; boss Tướng Vũ Kình 85; NPC Thống Lĩnh Định Phong, Lính Tiên Cốc, Phó Tướng Trịnh Mộc, Tướng hộ vệ. Trước đây atlas thiếu M11, nên nhiệm vụ "Tiêu diệt Hỏa Điểu" của app đi dò sang Tam Khê, bị từ chối rồi dừng với câu "Không thấy quái của bước này ở khu này" (manina3, 22/11 04:40).
- **M22 Luyện Ngục 5, M23 Luyện Ngục 6**: nhảy thẳng qua Bản đồ thế giới được (dòng 21, 22), không có quái nào lúc 05:03, mỗi map một cổng ra (21, 22 "Cổng Luyện Ngục", loại 1).
- Bị từ chối: M12 Tam Khê và M14 Huyền Hồ (cả cổng 1022, 1023 lẫn Bản đồ thế giới) "Bạn cần hoàn thành nhiệm vụ trước khi tới đây"; M7 Nguyệt Đàm "Bạn phải đạt cấp 100 mới vào được Nguyệt Đàm", M6 Tân Trạch cấp 110, M9 Lam Lĩnh cấp 120, M3 Cổ Phong cấp 130 (cổng 1018, 1017, 1019, 1010 trả lời giống hệt); M16, M17 "Khu vực này hiện tại chưa mở".
- **MP2 (22/11, manina3 đã lên cấp 100, `npm run scan`, log ở `captures/mp2-2026-11-22/`)**: Nguyệt Đàm không còn đòi cấp mà đòi nhiệm vụ: cổng 1018 ở cả M11 lẫn M4 trả lời "Bạn cần hoàn thành nhiệm vụ trước khi tới đây". Vẫn 9 map đi bộ được (M11, M10, M8, M5, M1, M2, M25, M4, M13), Tam Khê và Huyền Hồ vẫn khoá theo nhiệm vụ; Tân Trạch (110), Lam Lĩnh (120), Cổ Phong (130) bot không thử vì cấp. Quét ở khu 1 cho thấy mã quái khu 1 giờ là `mob` + loại + (i × 100 + khu) giống khu 0, 6, 8 (Gà Điên `mob11`, `mob1101`…), khác số cũ `mob18`, `mob19`… của atlas; atlas đã thay. [Đo]

**Cấp trên bản đồ thế giới và cấp cổng đòi.** Ở S1 (cấp 19), `s2c/11 "M99"` ghi M25 cấp 20 mà không khoá, và cổng Rìa Hồng Giang vẫn cho vào; M4 (cấp 20) thì khoá vì nhiệm vụ. Ở S2 (cấp 42), M10 (30) và M4 hết khoá, M8 (50) còn khoá. Lạc Cốc (40), Tam Khê (80), Nguyệt Đàm (100), Tân Trạch (110), Cổ Phong (130): cấp trong lời từ chối của cổng bằng đúng cấp trên bản đồ thế giới. Vì vậy bot TS và app Rust không đi qua map mà bản đồ thế giới ghi cấp cao hơn cấp nhân vật quá 1. Cổng cũng giữ cấp nó từng đòi, cả khi nhân vật cấp cao hơn đã đi qua: atlas dùng chung cho mọi tài khoản, mà S2 đã xoá mất cấp 40 của Lạc Cốc (đã ghi lại vào [data/maps.json](../../../data/maps.json)). Hộp Đổi map hiện "Cần cấp N" cho những map đó ([features](../../integration/rust/features.md)). [Đo S1, S2; giới hạn "quá 1" chỉ dựa vào M25]

Cách quét: `npm run scan` ([quest-bot](../../integration/nodejs/quest-bot.md#quét-map)) đăng nhập, xin bản đồ thế giới `c2s/11 "M99"`, rồi đi lần lượt qua từng cổng vào được. Ở mỗi map nó xin `c2s/11` (map, NPC, cổng) và `c2s/43` (quái), nhận `s2c/1177` (boss), rồi quay về map ban đầu. Kết quả ghi vào [data/maps.json](../../../data/maps.json); bot nhiệm vụ đọc file này để biết đường đi qua các lần chạy ([src/bot/atlas.ts](../../../src/bot/atlas.ts)). Lệnh chỉ gửi `c2s/11`, `c2s/13`, `c2s/43`: không đánh, không chat, không mua bán.

| Thử | Server trả | Kết luận |
|---|---|---|
| `c2s/11 "M1"` khi đang ở M2 | `s2c/1256` "Không thể chuyển khu vực", không có `s2c/11` | Chỉ xin được map đang đứng. Vị trí lưu vẫn là M2. [Đo] |
| `c2s/43 "M1"` khi đang ở M2 | `s2c/43` của M2 | Server bỏ qua mapId. [Đo] |
| `c2s/13` cổng chưa đủ cấp | `s2c/1256` "Bạn phải đạt cấp 40 mới vào được Lạc Cốc" | Khoá theo cấp. Trước đây bot ghi nhầm là "cổng không trả lời" vì chưa đọc gói này (Q15). [Đo] |
| `c2s/13` cổng Hồng Giang từ M25 | `s2c/1256` "Bạn cần hoàn thành nhiệm vụ trước khi tới đây" | Khoá theo nhiệm vụ. Ở S1 (nhiệm vụ 9) cổng từ chối; ngày 31/10, wangpt ở bước "Trinh sát Thành Hồng Giang" của nhiệm vụ 14 thì vào được M4 ([N5](10-quests.md#trinh-sát)). Mốc mở chính xác [Chưa rõ]. [Đo] |
| `c2s/13` cổng vào được | `s2c/13 (mapId, thứ tự map, 0, 0xff)` | Số sau mapId là thứ tự map trong bản đồ thế giới (M1 0, M2 1, M4 3, M25 24), không phải khu. Khu là byte `area` của `s2c/11` sau đó, khớp với mã quái. [Đo] |
| Gửi `c2s/13` từ xa cổng | Được nhận | Không cần đứng ở cổng: bot gửi từ chỗ đăng nhập. [Đo] |

Id cổng là id của **map đích**, giống nhau ở mọi map: 1013 là Lạc Cốc ở cả M1 và M2, 1015 là Vân Sơn ở cả M1 và M25. [Đo]

| Cổng | Tên | Kết quả ở cấp 19 (S1) | Kết quả ở cấp 42 (S2) |
|---:|---|---|---|
| 1010 | Cổ Phong | Cần cấp 130 | Không thử lại (cần cấp 130) |
| 1011 | Bạch Nham | Chưa thấy | Cần xong nhiệm vụ (cổng ở M5 và M10) |
| 1012 | Phong Nguyên | Chưa thấy | Cần xong nhiệm vụ (cổng ở M10) |
| 1013 | Lạc Cốc | Cần cấp 40 | → M5 |
| 1014 | Làng Thanh Khê | → M1 | → M1 |
| 1015 | Vân Sơn | → M2 | → M2 |
| 1016 | Hồng Giang | Cần xong nhiệm vụ; ở nhiệm vụ 14 thì → M4 ([N5](10-quests.md#trinh-sát)) | → M4 |
| 1017 | Tân Trạch | Cần cấp 110 | Không thử lại (cần cấp 110) |
| 1018 | Nguyệt Đàm | Chưa thấy | Cần cấp 100 (cổng ở M4) |
| 1020 | Cửu Phong | Chưa thấy | → M10 |
| 1021 | Tiên Cốc | Chưa thấy | Cần xong nhiệm vụ (cổng ở M10) |
| 1022 | Tam Khê | Chưa thấy | Cần cấp 80 (cổng ở M10) |
| 1024 | Rìa Hồng Giang | → M25 (bản đồ thế giới ghi cấp 20, nhưng cấp 19 vẫn vào được) | → M25 |

### NPC và cổng

Toạ độ là góc trên-trái của ô, đơn vị server (ô 32). Cổng "Bản đồ" (id 0 ở M1, 1 ở M2) là nút mở bản đồ thế giới, không phải cổng thật. [Đo]

| Map | NPC (id, x, y) | Cổng (id, x, y) |
|---|---|---|
| M1 Làng Thanh Khê | 102 Hương Lão Trần Bá (336, 576); 103 Bà Tư Hạnh (700, 608); 104 Ngọc Nga (915, 544); 106 Lái Buôn (576, 416); 111 Vệ Binh Lê Dũng (1167, 672); 129 Thành Chủ Nguyễn Khang (1472, 416); 161 Pháp sư (712, 512) | 1010 Cổ Phong (34, 336); 1013 Lạc Cốc (4960, 336); 1015 Vân Sơn (4960, 656) |
| M2 Trại Vân Sơn | 127 Trại Chủ Phạm Hùng (1600, 800); 141 Võ Quan Đinh Mộc (1730, 800); 142 Dân Phu Vân Sơn (1830, 736) | 1013 Lạc Cốc (32, 624); 1014 Làng Thanh Khê (32, 464); 1017 Tân Trạch (2848, 304); 1024 Rìa Hồng Giang (2848, 880) |
| M25 Rìa Hồng Giang | 162 Tướng Quân Lê Viễn (960, 352) | 1015 Vân Sơn (32, 400); 1016 Hồng Giang (1504, 624) |
| M4 Hồng Giang | 143 Tiên phong Hồng Giang (1008, 352); 131 Lính Hồng Giang (1072, 352); 121 Tướng Xích Vũ (1936, 160); 144 Phó Tướng Hồng Giang (2032, 160); 131 Lính Hồng Giang (2128, 160) | 1020 Cửu Phong (32, 144); 1024 Rìa Hồng Giang (32, 400); 1017 Tân Trạch (3808, 176); 1018 Nguyệt Đàm (3808, 656); nút Bản đồ id 3 |
| M5 Lạc Cốc | 146 Tướng quân Lạc Cốc (1494, 256); 133 Lính Lạc Cốc (1219, 160), (1697, 224), (950, 384) | 1014 Làng Thanh Khê (34, 112); 1015 Vân Sơn (34, 560); 1017 Tân Trạch (4959, 144); 1011 Bạch Nham (4959, 592) |
| M10 Cửu Phong | 145 Tướng phe Thiết Hổ (2448, 224); 132 Lính Cửu Phong (2032, 224), (2192, 448) | 1011 Bạch Nham (32, 624); 1012 Phong Nguyên (32, 176); 1016 Hồng Giang (4960, 624); 1021 Tiên Cốc (4960, 112); 1022 Tam Khê (4960, 400) |

### Quái và boss của M2

Quái của M1 ở [bảng trên](#quái-của-m1). M25 không có quái và không có boss. [Đo]

| Loại | Cấp | Số con/khu | mobId khu 0 | mobId khu 1 |
|---|---:|---:|---|---|
| Kẻ Quấy Phá | 20 | 5 | `mob80`…`mob84` | `mob85`…`mob89` |
| Cua Càng | 15 | 5 | `mob7500`…`mob7504` | `mob7505`…`mob7509` |
| Cóc Xanh | 13 | 5 | `mob61000`…`mob61004` | `mob61005`…`mob61009` |
| Sói Xám | 11 | 6 | `mob51500`…`mob51505` | `mob51506`…`mob51511` |
| Sơn Tặc | 9 | 5 | `mob42100`…`mob42104` | `mob42105`…`mob42109` |
| Heo Mọi | 7 | 5 | `mob22600`…`mob22604` | `mob22605`…`mob22609` |

| Boss | Map | Cấp | mobId khu 0 | mobId khu 1 | Ô đứng lần cuối thấy (cột, hàng) |
|---|---|---:|---|---|---|
| Thủ Lĩnh Sơn Tặc | M1 | 11 | `mob86100001` | `mob86100101` | (115, 8) ở khu 1 |
| Hào Trưởng phía Bắc | M2 | 21 | `mob89100002` | `mob89100102` | (51, 14) ở khu 0 |
| Hào Trưởng phía Nam | M2 | 21 | `mob90100003` | `mob90100103` | (14, 30) ở khu 0 |

Boss đổi ô sau mỗi lần rời đi (`s2c/1177` field 1 rồi field 0 với ô mới, [04-push](04-push.md#s2c-1177)), nên ô chỉ đúng tại lúc quét. [Đo]

<a id="đánh-boss"></a>

### Đánh boss (B6)

B6 (01/11, người dùng nhờ thử): bot TS với symap cấp 79 (tiheo1) đánh Thủ Lĩnh Sơn Tặc cấp 11 ở M1 khu 0 hai trận, trận 1 từ chỗ đang đứng, trận 2 sau khi dịch chuyển lên ô của boss. [Đo B6]

| Câu hỏi | Kết quả |
|---|---|
| Thách đấu từ xa được không? | **Được.** symap đứng ở (698, 512), boss ở ô (74, 3) = (2368, 96), cách khoảng 1.700 đơn vị; `c2s/1178` vẫn mở trận, `s2c/22` đến sau 2,2 s. Không cần đi tới boss. |
| Dịch chuyển tới boss được không? | **Được.** Một gói `c2s/1169` (x 1984, y 96, state 0, cờ 0) đặt nhân vật lên ô của boss ngay, không cần đi từng bước: `s2c/1262` phát lại đúng toạ độ sau chưa tới 100 ms. Thách đấu sau đó mở trận sau 2,6 s, như khi đứng xa, nên đánh boss không cần dịch chuyển. |
| HP boss dùng chung với ai? | Với mọi người chơi của khu: lúc trận 1 mở, boss chỉ còn 74/5000 vì người khác đã đánh trước. |
| Hạ boss thì sao? | Hết HP thì server gửi `s2c/1177` field 1 (boss rời ô) cùng lúc với nước kết thúc trận; không có thông báo, `s2c/45` hay gói thưởng riêng. Khoảng 13 s sau boss hiện lại (`s2c/1177` field 0) ở ô khác, **đầy HP**: trận 2 mở với 5000/5000, symap hạ trong 2 lượt (5.249 sát thương). |
| Được gì? | Cả hai trận 0 EXP, 0 Xu, không rơi đồ. Boss thấp hơn symap 68 cấp, mà Cẩm nang ghi quái thấp hơn quá 20 cấp thì không có kinh nghiệm, vàng và đồ rơi. Hạ boss ở cấp gần mình được gì thì [Chưa rõ]. |
| Độ bền | Trừ như trận quái thường: vũ khí 60 → 59 → 56, áo 34 → 32 → 31 sau hai trận. |

App Rust cũng đã đánh 15 trận boss thật khi tự làm nhiệm vụ (31/10: Thủ Lĩnh Sơn Tặc 2 trận, Hào Trưởng phía Bắc 6, phía Nam 7, các nick cấp 18–27), thua cả, 0 EXP, theo bảng `battles` của `cllt.db`. Bot TS và app Rust đợi boss đổi chỗ 5 s, tối đa 6 lần, nên sau khi hạ boss chúng đợi được tới lúc boss hiện lại rồi đánh tiếp. Dữ liệu thô và script đo ở `captures/b6-2026-11-01/` (chỉ trên máy, không vào git); hai trận ghi ở `captures/battles/2026-11-01/`.

### Quái và boss của M4, M5, M10 (S2)

Chỉ có khu 0: bot quét không đổi khu. Chim Điên và Hỏa Hầu của nhiệm vụ 15 ở M4; Heo Tím và Báo Đốm của nhiệm vụ 23 ở M5 ([10-quests](10-quests.md)). [Đo S2]

| Map | Loại | Cấp | Số con/khu | mobId khu 0 |
|---|---|---:|---:|---|
| M4 | Sơn Tặc | 9 | 5 | `mob40`…`mob44` |
| M4 | Chim Điên | 25 | 5 | `mob9500`…`mob9504` |
| M4 | Hỏa Hầu | 29 | 5 | `mob101000`…`mob101004` |
| M4 | Cá Sấu | 31 | 6 | `mob111500`…`mob111505` |
| M4 | Cóc Tía | 35 | 5 | `mob122100`…`mob122104` |
| M4 | Huyết Lang | 40 | 5 | `mob132600`…`mob132604` |
| M5 | Báo Đốm | 51 | 6 | `mob45500`…`mob45505` |
| M5 | Heo Tím | 51 | 5 | `mob172100`…`mob172104` |
| M5 | Hổ Vằn | 53 | 5 | `mob570`…`mob574` |
| M5 | Voi Mập | 56 | 5 | `mob181100`…`mob181104` |
| M5 | Tiểu Yêu Dê | 58 | 5 | `mob411600`…`mob411604` |
| M10 | Thỏ Hồng | 39 | 6 | `mob491800`…`mob491805` |
| M10 | Huyết Lang | 40 | 6 | `mob132400`…`mob132405` |
| M10 | Heo Lửa | 46 | 6 | `mob150`…`mob155` |
| M10 | Báo Đốm | 51 | 6 | `mob451200`…`mob451205` |
| M10 | Thỏ Xanh | 53 | 6 | `mob50600`…`mob50605` |

| Boss | Map | Cấp | mobId khu 0 | Ô đứng lúc quét (cột, hàng) |
|---|---|---:|---|---|
| Tướng Xích Vũ | M4 | 35 | `mob93100004` | (49, 19) |
| Tướng Thiết Hổ | M10 | 45 | `mob96100005` | (41, 12) |
| Tướng Hùng Liệt | M5 | 55 | `mob98100006` | (126, 3) |

<a id="mã-quái"></a>

### Mã quái

`mobId` = `"mob"` + (loại quái + 1) + số thứ tự, ghép chuỗi. "Loại quái" là `thamSố` của bước diệt quái trong `s2c/39` ([10-quests](10-quests.md#s2c-39)). Số thứ tự của quái thường là `gốc + khu × sốCon + i`; của boss là `100000 + khu × 100 + n`. [Suy luận: 8/8 loại đã có trong nhiệm vụ khớp]

| Quái | Loại trong nhiệm vụ | Đầu mã | Ví dụ |
|---|---:|---|---|
| Gà Điên | 0 | `mob1` | `mob10` = 1 + "0" |
| Heo Mọi | 1 | `mob2` | `mob2800` (M1), `mob22600` (M2) |
| Kẻ Gây Rối | 2 | `mob3` | `mob31400` |
| Sơn Tặc | 3 | `mob4` | `mob42000` (M1), `mob42100` (M2) |
| Sói Xám | 4 | `mob5` | `mob51500` |
| Cóc Xanh | 5 | `mob6` | `mob61000` |
| Thủ Lĩnh Sơn Tặc (boss) | 85 | `mob86` | `mob86100001` |
| Chỉ Huy Sơn Tặc | 86 | `mob87` | `mob872600` |
| Cua Càng, Kẻ Quấy Phá, Hào Trưởng phía Bắc, phía Nam | chưa gặp trong nhiệm vụ | `mob7`, `mob8`, `mob89`, `mob90` | loại 6, 7, 88, 89 theo quy luật [Suy luận] |
| Gà Trống Yêu Tinh (M8) | 21 | `mob22` | `mob221800` |
| Tướng Thiết Kích (boss M8) | chưa gặp trong nhiệm vụ | `mob101` | `mob101100007`: loại 100, boss thứ 7 ở khu 0 [Suy luận theo quy luật boss] |

Vì ghép chuỗi nên mã có thể nhập nhằng (`mob110` là Gà Điên số 10, không phải loại 10). Bot so tên quái, không tách mã.

Gốc của các nhóm quái trong một map nối thành một dãy: nhóm đầu từ 0, nhóm sau bắt đầu ở gốc nhóm trước + 100 × số con mỗi khu. Ví dụ M4: Sơn Tặc 0 (5 con) → Chim Điên 500 (5) → Hỏa Hầu 1000 (5) → Cá Sấu 1500 (6) → Cóc Tía 2100 (5) → Huyết Lang 2600; M1: Gà Điên 0 (8) → Heo Mọi 800 → Kẻ Gây Rối 1400 → Sơn Tặc 2000 → Chỉ Huy Sơn Tặc 2600. [Đo: đúng ở M1, M4, M5, M10] Có đủ các nhóm của map thì dãy này tách được mã: `mob122100` chỉ có thể là loại 11 từ gốc 2100, không phải loại 121 từ gốc 100. `mobTypes` của [sprite.ts](../../../src/protocol/sprite.ts) làm như vậy và ra loại của cả 28 tên trong `data/maps.json`, khớp mọi loại đã biết từ nhiệm vụ. Một tên thiếu các nhóm còn lại của map mà vẫn đọc được hai cách thì bị bỏ, trừ khi một cách là loại tên khác đã chắc chắn có (Báo Đốm `mob45500` không thể là loại 3 của Sơn Tặc).

<a id="hệ-của-quái"></a>

### Hệ của quái

**Byte `a` của mỗi quái trong `s2c/43`, và của boss trong `s2c/1177`, là hệ của quái.** Bot biết hệ ngay từ danh sách quái, không cần vào trận. [Đo]

| `a` | Hệ | Số hệ ở `s2c/9`, `s2c/22`, vật phẩm | Ví dụ |
|---:|---|---:|---|
| 0 | Hỏa | 1 | Sơn Tặc, Kẻ Quấy Phá, Hỏa Hầu, Huyết Lang, Heo Lửa, Gà Lửa, Thủ Lĩnh Sơn Tặc, Tướng Xích Vũ |
| 2 | Lôi | 2 | Heo Mọi, Sói Xám, Chỉ Huy Sơn Tặc, Chim Điên, Báo Đen, Gà Trống Yêu Tinh, Tướng Thiết Kích |
| 4 | Thủy | 4 | Gà Điên, Cóc Xanh, Cua Càng, Cá Sấu, Cóc Tía, Thỏ Hồng, Voi Mập, Gà Tinh, Hào Trưởng phía Nam |

- **Cách đo (02/11):** đối chiếu `a` của mọi `s2c/43` và `s2c/1177` trong `captures/` với byte hệ của khối quái trong `s2c/22` (`mobBlock` của [battle.ts](../../../src/battle/battle.ts)) của các trận đã ghi trong `cllt.db`. Khớp 25/25 loại, khoảng 1.800 trận. Mỗi loại luôn có cùng một `a`. Hỏa là 0 ở đây nhưng là 1 ở mọi gói khác.
- Quái đấu với NPC (Võ Quan, Tiên phong, Lính…) không có trong `s2c/43`; hệ của chúng chỉ biết khi vào trận.
- Code: `mobElement` trong [world.ts](../../../src/protocol/world.ts), `Mob::element` trong `app/core/src/world.rs`. App hiện icon hệ ở mỗi dòng của danh sách Tự đánh ([features](../../integration/rust/features.md)).

**Quái không cho EXP.** Cẩm nang ghi: quái thấp hơn nhân vật quá 20 cấp thì không có kinh nghiệm, vàng và đồ rơi. Trận thắng trong `cllt.db` của app khớp với điều này: chênh 15–18 cấp vẫn có EXP; chênh từ 21 cấp trở lên thì 0 EXP ở mọi trận thắng: 57 trận chênh 21–25 cấp, cùng B6 (chênh 68) và B8 (chênh 21). Chưa có trận nào chênh đúng 19 hay 20 cấp. App đánh dấu "0 EXP" khi chênh hơn 20 cấp (`NO_EXP_GAP`). [Đo; ranh giới 20 theo Cẩm nang]

<a id="ảnh-quái"></a>

### Ảnh quái

Mỗi loại quái có một tấm sprite trong `files/dyncache/offline-a2` của game, giải bằng `decodeAsset` như icon vật phẩm ([13-drops-items](13-drops-items.md#cách-lấy-lại-dữ-liệu)). File `.fx` cùng số + 9 là bảng khung hình của tấm đó. Quái thường dùng tấm `<100000 + 10 × loại>.dat`: Gà Điên (loại 0) là `100000.dat` và `100009.fx`; Sơn Tặc (loại 3) là `100030.dat`. Boss, Báo Đen và Chỉ Huy Sơn Tặc dùng tấm khác; quái nào dùng tấm nào thì `s2c/22` ghi rõ ([tấm ảnh của quái](#tấm-ảnh-của-quái)). [Đo]

| File | Là gì |
|---|---|
| `100000`…`100780` (.dat, .fx) | Tấm 0–78, thiếu 59. Mỗi tấm 5–9 khung hình. Chưa quái nào đã gặp dùng tấm 59: Báo Đen, loại 59 theo mã, dùng `100600` |
| `101000`…`101070` | Tấm lớn hơn (tới 2048 px): hồ ly chín đuôi, hổ, hạc, chó ba đầu, người tuyết, người cầm kiếm. `101050` là vị tướng tóc đỏ cầm kiếm của Tướng Thiết Kích, Tướng Xích Vũ và Võ Quan Đinh Mộc; `101060` là của Tiên phong, Phó Tướng Hồng Giang và Tướng phe Thiết Hổ. Các tấm còn lại chưa biết của ai [Đo `s2c/22`] |
| `100850`, `100860`, `100880`…`100970` | Không có trên máy. Thủ Lĩnh Sơn Tặc (loại 85), Chỉ Huy Sơn Tặc (86), Hào Trưởng (88, 89) và Tướng Xích Vũ (92) không dùng tấm theo loại của mình; Tướng Thiết Hổ (95) và Tướng Hùng Liệt (97) chưa đánh trận nào nên chưa biết [Đo] |
| `1`…`13`, `10000`…`10045` | Không phải quái: tileset và ảnh nền của map |

Bố cục `.fx` (big endian), đọc hết tới byte cuối ở cả 86 file:

```text
u8 2; i32 số tấm; u16 rộng; u16 cao; u8 0; u16 số khung
số khung × (u16 x; u16 y; u16 w; u16 h)                    vị trí khung trên tấm
u8 số động tác
mỗi động tác: u8 id; u16 rộng; u16 cao; u8 a (36 hoặc 0); u8 lặp; u16 b (0); u8 số bước
              số bước × (u8 số mảnh; số mảnh × (u16 khung; i16 dx; i16 dy))
              u16 n; n × i16 bước vẽ ở mỗi nhịp (−1: không vẽ)
```

**Game 1.1.0 (21/11):** tấm nằm ở `files/dyncache2/offline-a2`, mã hoá bằng khoá asset mới ([13-drops-items](13-drops-items.md#bảng-32)); `npm run mobs -- --adb=…` đọc thư mục này. Vẫn đúng 86 tấm `.fx` như trước, hình quái giống hệt bản 1.0.3. Quái của map chưa có trong atlas (Tiên Cốc) lấy tấm theo `s2c/22` của các trận đã ghi (`--battles`, cả cllt.db của app desktop): Mộc Linh tấm 26, Thanh Xà 28, Hỏa Điểu 30, Báo Hồng 46, Yêu Cáo Chiến Binh 39, Lính Tiên Cốc 66, Tướng quân Lạc Cốc 106. `names.json` giữ các tên đã có, nên chạy lại không có `--battles` cũng không mất. Boss chưa đánh trận nào (Tướng Vũ Kình) vẫn chưa có ảnh. [Đo]

Động tác 0 là quái đứng thở: Gà Điên lặp bước 0, 1, 2, 1, mỗi bước 7 nhịp. Ở Gà Điên, động tác 4 (không lặp) nháy bước 0 với −1, như lúc quái chết; các tấm `1010x0` có tới 8 động tác. Các động tác 1–3 chưa rõ là gì. Ở cả 86 tấm, bước đầu của động tác 0 chỉ có một mảnh, nên ảnh đứng yên là đúng một khung cắt ra.

<a id="tấm-ảnh-của-quái"></a>

#### Tấm ảnh của quái

**Số `i32` ngay sau cấp trong khối quái của `s2c/22` là tấm ảnh của quái.** Trước đây ghi là "i32 100000" chưa rõ. Quái thường có đúng `100000 + 10 × loại`. Boss, Báo Đen và các NPC đấu thì khác: [Đo]

| Quái | Loại theo mã | Tấm trong `s2c/22` | Icon |
|---|---:|---:|---|
| Báo Đen | 59 | `100600` | `60.webp`, con báo đen |
| Thủ Lĩnh Sơn Tặc (boss), Chỉ Huy Sơn Tặc | 85, 86 | `100070` | `7.webp`, như Kẻ Quấy Phá |
| Hào Trưởng phía Bắc, phía Nam (boss) | 88, 89 | `100660` | `66.webp` |
| Tướng Xích Vũ, Tướng Thiết Kích (boss) | 92, 100 | `101050` | `105.webp`, vị tướng tóc đỏ |
| NPC đấu: Lính Hồng Giang, Lính Bạch Nham | | `100660` | |
| NPC đấu: Võ Quan Đinh Mộc | | `101050` | |
| NPC đấu: Tiên phong Hồng Giang, Phó Tướng Hồng Giang, Tiên phong Bạch Nham, Tướng phe Thiết Hổ | | `101060` | |

- **Cách đo (02/11):** đọc `s2c/22` của 2.090 trận đã ghi (`captures/battles`, `app/cllt.db`, `cllt.db` của app đã cài) với 31 tên quái. Mỗi tên luôn một tấm. 20 loại quái thường có tấm đúng bằng loại; chỉ Báo Đen khác.
- **Quái không đổi giữa các trận.** Ở cùng 2.090 trận, mỗi loại luôn cùng cấp, cùng hệ, cùng máu và cùng 9 kỹ năng, từ 31/10 tới 02/11 và với mọi cấp nhân vật. Ví dụ Sơn Tặc luôn cấp 9, 248 máu, dù nhân vật cấp 8 hay 32. Boss có máu tối đa cố định nhưng vào trận với máu còn lại sau người đánh trước: Hào Trưởng phía Bắc từ 3.389 tới 20.000 trên 20.000, Thủ Lĩnh Sơn Tặc có lần 74 trên 5.000. [Đo]
- **Atlas:** mỗi quái và boss của `data/maps.json` có `sprite` khi bot đã đánh nó. `recordSprite` ([atlas.ts](../../../src/bot/atlas.ts)) ghi cho mọi quái cùng tên. Bot nhiệm vụ TS ghi khi vào trận; `npm run mobs -- --battles` ghi từ các trận đã lưu.
- Code: `sprite` của `mobBlock` ([battle.ts](../../../src/battle/battle.ts)) và `MobBlock` (`app/core/src/battle.rs`); `mobPictures` của [sprite.ts](../../../src/protocol/sprite.ts). Test: [sprite.test.ts](../../../test/sprite.test.ts) với khối quái thật của 4 quái.

Icon trong app: `npm run mobs -- --adb=<máy>` ([mobs-run.ts](../../../src/cli/mobs-run.ts)) chép các tấm từ điện thoại (máy root, không mở game), cắt khung đầu của động tác 0, thu về cạnh dài 44 px (gấp đôi ô 22 px của danh sách) và lưu `data/icons/mobs/<n>.webp` cho tấm `100000 + 10 × n` (86 file, tổng 119 KB). Lệnh cũng ghi `data/icons/mobs/names.json`: số ảnh của từng tên quái trong `data/maps.json` (`mobPictures`). Có `sprite` thì lấy theo `sprite`; không có thì quái thường lấy theo loại, còn boss chưa đánh trận nào thì không có ảnh, vì boss dùng tấm khác loại. Sau khi bot gặp quái mới, chạy `npm run mobs` không tham số để ghi lại bảng tên mà không cần điện thoại. Thêm `--battles` để lấy `sprite` từ các trận đã lưu trước (`--battles=<thư mục hay cllt.db>,…` để chọn nguồn).
- Ngày 02/11, sau `npm run mobs -- --battles` trên mọi trận đã ghi, bảng có 32 tên và cả 32 có ảnh. Boss hiện đúng ảnh: Tướng Thiết Kích và Tướng Xích Vũ là vị tướng, Hào Trưởng là `66`, Thủ Lĩnh Sơn Tặc và Chỉ Huy Sơn Tặc là tên sơn tặc. Báo Đen là con báo đen `60`, có sẵn từ trước, nên không cần mở điện thoại.
- Tướng Thiết Hổ và Tướng Hùng Liệt chưa đánh trận nào nên chưa có trong bảng; đánh một trận rồi chạy `npm run mobs -- --battles` là có.
- App hiện ảnh ở đầu mỗi dòng của danh sách Tự đánh ([features](../../integration/rust/features.md#việc-đánh-x-n-lần)). Tên chưa có ảnh vẫn hiện vương miện (boss) hay thanh kiếm.

## Cách liệt kê toàn bộ bot của map

### 1. Qua gói tin

Gửi `c2s/43` với `string mapId`, nhận `s2c/43`. Bố cục ở [05-battle](05-battle.md#s2c-43-mobs):

```text
string mapId; u8 field
lặp tới hết payload: string mobId; string tên; i32 cấp; u8 a; i32 b; i32 c; u8 d
```

Client gửi 43 sau mỗi lần nhận map: lúc vào game, sau khi đổi khu, sau mỗi trận. Danh sách là của **khu đang đứng**. Khu 20 cho đúng 33 id, cùng thứ tự với danh sách trong bộ nhớ. [Đo]

Gói không có toạ độ. Theo luồng đã đo, `c2s/15` chỉ chứa `mobId`, và client chỉ gửi gói này khi hitbox chạm nhau. Server **không** kiểm tra khoảng cách: bot gửi 15 cho `mob10` khi nhân vật đứng xa, server vẫn mở trận, 3/3 lần. [Đo, xem [07-auto-battle](07-auto-battle.md)]

### 2. Qua bộ nhớ client

Đọc được bằng hook tại `sqhz.a17`, object `self` là `com.mh.sqhz`. [Đo]

| Đường dẫn | Kiểu | Nội dung |
|---|---|---|
| `sqhz.J` | `com.mh.sqil` | Quản lý entity |
| `sqhz.J.e.a` | `Object[]` (sức chứa 40) | Mọi entity của khu: phần tử 0 là nhân vật mình, sau đó 33 quái theo thứ tự `s2c/43` |
| `sqhz.J.j.a` | `Object[]` (10) | Entity đang trong khung camera |
| `sqhz.H.o` (phần tử 1) | — | Thông số lưới: ô `48×48` (đơn vị client), `23` hàng × `156` cột, rộng `7488`, cao `1104` |

Object quái là `com.mh.sqiz`, kế thừa `com.mh.sqfb`:

| Field | Ý nghĩa |
|---|---|
| `sqfb.A`, `sqfb.B` | x, y góc trên-trái sprite (đơn vị client) [Đo] |
| `sqfb.C`, `sqfb.D` | Kích thước sprite: Gà Điên 54×78, Heo Mọi/Chỉ Huy 56×56, Sơn Tặc/Kẻ Gây Rối 62×83 [Đo] |
| `sqfb.F` | `true` khi đang trong khung camera, khớp đúng các phần tử của `J.j` [Đo] |
| `sqiz.g` (`com.mh.sqlu`) | **Hitbox** `a,b,c,d` = x, y, w, h, nằm ở chân sprite [Đo] |
| `sqiz.h` (`com.mh.sqjb`) | Bản ghi s2c/43: `a`=mobId, `b`=tên, `d`=cấp, `c/e/f/g`=các trường còn lại của 43 [Đo] |
| `sqiz.t` (`com.mh.sqqk`) | `a,b` gần bằng x, y; `c=62028` [Chưa rõ] |
| `sqiz.o` (`com.mh.sqes`) | `o` đổi theo từng con (0–8), có thể là trạng thái AI hoặc hướng đi [Chưa rõ] |
| `sqiz.j` | `1` ở con đang bị thách đấu, `0` ở các con khác [Đo 1 lần] |

## Toạ độ và di chuyển

- **Hai hệ đơn vị.** Gói tin và map data dùng đơn vị server: ô 32, map 4992×736. Client vẽ bằng ô 48, nên toạ độ trong bộ nhớ = server × **1,5**. Ví dụ c2s/1169 cuối cùng là x=1315, y=640, còn trong bộ nhớ nhân vật có A=1973 (= 1315×1,5). [Đo]
- **c2s/1169** chỉ được gửi khi đang chạy, nhảy hoặc rơi (~100–130 ms/gói): `i32 x; i32 y; i32 state; 5 byte cờ`. State thấy được: 0 đứng, 1 chạy, 5 lên, 6 rơi. [Đo] Server không trả lời gói nào. Vị trí của người chơi khác đến qua s2c/1262.
- **Lưới s2c/11.** Sau prefix là 3 lớp, mỗi lớp gồm `i32 n` và `n` byte. Số byte là `dimension1 × dimension2` (M1: 23 × 156 = 3588; M2: 35 × 90 = 3150).
  - `dimension1` là số hàng, `dimension2` là số cột. Lưới lưu theo từng hàng, từ hàng trên cùng xuống, mỗi byte là một ô 32 đơn vị server.
  - Vì vậy `x / 32` và `y / 32` của nhân vật (`s2c/11`), NPC và cổng chỉ thẳng vào ô của lưới. Ở M2 (2880 × 1120 đơn vị), cổng nằm ở x = 32 và x = 2848, đúng mép trái và mép phải. [Đo, `mapGrid` trong [world.ts](../../../src/protocol/world.ts)]

  | Lớp | Giá trị | Ý nghĩa |
  |---|---|---|
  | 1 | Nhiều mã (M2: 126 mã), 0 là ô trống | Hình vẽ của ô. Ở M2, bốn hàng cuối (31–34) có hình ở mọi cột: đó là mặt đất. [Đo] |
  | 2 | M1: 15/27/47/89/…; M2: 6 mã | Trang trí [Chưa rõ] |
  | 3 | M1: `1` 3391 ô, `0` 164 ô, `2` 33 ô. M2: `1` 2937, `0` 182, `2` 31 | Ô `0`/`2` nằm thành từng đoạn ngang trùng với các bục vẽ ở lớp 1 (M2 hàng 30, cột 4–17), mỗi đoạn có một ô `2` (có thể là thang). Mặt đất ở hàng 31–34 lại có giá trị `1`, nên `1` không phải "ô trống" như từng suy luận. Nghĩa đúng của `1`/`0`/`2` [Chưa rõ] |

  App Rust vẽ bản đồ thu nhỏ từ lớp 1 (ô có hình) và lớp 3 (bục), rồi đặt nhân vật, NPC, cổng và boss vào theo cách quy đổi trên ([App Rust](../../integration/rust/features.md#giao-diện)).

- **NPC và cổng.** Cuối s2c/11 có danh sách `i32 n; n × {i32 id; string tên; u8 loại; i32 x; i32 y; i32 w; i32 h; u8; i32 p; i32 q}`, đơn vị server, rồi 12 byte chưa rõ. Đọc hết byte M1 và M2 (`mapData` trong [world.ts](../../../src/protocol/world.ts)). [Đo]

  | Loại | Tên (id) | x, y |
  |---|---|---|
  | 0 (cổng) | Cổ Phong (1010) | 34, 336 (mép trái) |
  | 0 | Lạc Cốc (1013) | 4960, 336 (mép phải) |
  | 0 | Vân Sơn (1015) | 4960, 656 (mép phải) |
  | 0 | Bản đồ (0) | 0, 656, w=64 [Chưa rõ] |
  | 2 (NPC) | Hương Lão Trần Bá 102, Vệ Binh Lê Dũng 111, Thành Chủ Nguyễn Khang 129, Bà Tư Hạnh 103, Lái Buôn 106, Pháp sư 161, Ngọc Nga 104 | 336,576 · 1167,672 · 1472,416 · 700,608 · 576,416 · 712,512 · 915,544 |

  Loại 0 là cổng: đứng ở cổng thì app hiện nút "Vào", bấm thì gửi `c2s/13 (mapId, id cổng)` và server chuyển sang map đích (B5: cổng Vân Sơn 1015 → M2). Xem [10-quests](10-quests.md#cổng). [Đo]

- **Đi tới một con quái** = di chuyển đến khi hitbox nhân vật (trong bộ nhớ là field `Y`, `com.mh.sqlu`, 25×81 đơn vị client) chồng lên `sqiz.g` của quái. Không cần bấm gì. [Đo]

## Đổi khu vực trong cùng map

Mở "Khu vực" (góc trên phải) ra danh sách khu kèm "Dân số N/20". Hộp này lấy số dân bằng `c2s/1172` → `s2c/1172` ([08-server-map-zone](08-server-map-zone.md#zone-list)); trong `.so` có log `[ZONE]: id|color|num|max`. (Ghi chép B2 từng ghi là mở hộp không sinh gói; U1 và L1 sau đó bắt được `c2s/1172`.)

| Bước | Gói | Payload mẫu (khu 20) |
|---|---|---|
| Chọn khu | **c2s/1173** | `14` (`u8 khu`) |
| Server nhận | **s2c/13** | `00000002 4d31 00000014` (`string mapId; i32 khu`) |
| Xin map | c2s/11 | `00000002 4d31 14 00000000` (`string mapId; u8 khu; i32 0`); lúc login là `ff, -1` |
| Map | s2c/11 | 11379 byte, byte `area` = 20 |
| Xin quái | c2s/43 | `00000002 4d31` |
| Quái | s2c/43 | 33 id của khu 20 |

Toàn bộ chuỗi mất ~3,6 s. Hàm dựng gói (tìm qua hằng số): `sqlq.b119` → 1173, `sqlq.a63` → 11, `sqlq.e66` → 43. [Đo gói; hàm là Suy luận tĩnh]

### Bot TS đổi khu (Z1)

`npm run zone` đăng nhập, gửi `c2s/1172` rồi in số người của từng khu; `--zone=N` đi tiếp đúng chuỗi trên rồi in quái và người của khu mới ([src/cli/zone-run.ts](../../../src/cli/zone-run.ts)). Lần chạy với manina ở M2 (31/10, khoảng 12:30):

| Bước | Gói | Kết quả |
|---|---|---|
| Danh sách khu | `s2c/1172` | M2 cũng có **100 khu**, mỗi khu tối đa 20. 26–29 người: khu 0 có 15–16, khu 5 có 4, khu 1 có 3, 91–93 khu trống |
| Chọn khu 4 | `c2s/1173` `04` | |
| Server nhận | `s2c/13` sau 26 ms | `000000024d32 00000001 00 04`: dạng dài như khi qua cổng (mapId, thứ tự map 1, `00`), byte cuối là **khu mới** thay cho `ff` |
| Xin map | `c2s/11` `000000024d32 04 00000000` | `s2c/11` với `area` = 4, cùng x/y (2784, 864) |
| Xin quái | `c2s/43` | `s2c/43` sau 83 ms tính từ `c2s/1173`: 31 con, đủ 6 loại của M2 (Kẻ Quấy Phá 20, Cua Càng 15, Cóc Xanh 13, Sói Xám 11, Sơn Tặc 9, Heo Mọi 7) |
| Người trong khu | `s2c/1263` | Không có (khu trống không gửi gói này) |

- Dạng `s2c/13` của B2 (`string mapId; i32 khu`, 10 byte) không gặp lại. Bộ giải mã đọc cả hai dạng: trong dạng dài, byte cuối khác `ff` là khu. [Đo]
- Lần đầu script dừng ngay sau `s2c/13` (chưa đọc được dạng dài), không gửi `c2s/11`. Đăng nhập lại thì vẫn ở khu 0. [Đo]
- Sau khi đổi khu trọn chuỗi rồi thoát, đăng nhập lại cũng về **khu 0**: server không nhớ khu giữa hai lần đăng nhập, chỉ nhớ map. [Đo]
- App Rust làm lại cùng chuỗi (`cllt zone --zone=4`), rồi đi M2 → M1 → M2 qua cổng (`cllt goto`): qua cổng Làng Thanh Khê thì server xếp manina vào **khu 1** của M1, đăng nhập lại vẫn khu 1; về M2 thì khu 0. Có lẽ server xếp vào khu đầu tiên còn chỗ (khu 0 của M1 hay đông). [Đo; lý do là Suy luận]

## Code khi va chạm quái

Hook trực tiếp hàm dựng gói (`Interceptor` + `Backtracer.FUZZY`) cho chuỗi gọi sau. B2 có 5 lần va chạm (`mob2921`, `mob1165`, `mob1160`, `mob1161`, `mob42124`): `a17` có ở cả 5, `a18` bắt được ở 4. [Đo]

```text
com.mh.sqhz.a18(Object mob, boolean)          kiểm tra va chạm của quái
  └ com.mh.sqhz.a17(Object mob, boolean, int)   bắt đầu đánh quái
      └ com.mh.sqlq.a67(String mobId, boolean)   dựng gói, mobId lấy từ mob.h.a
          └ c2s/15 (mobId, 0) → hàng đợi gửi → sqlq.ab8 → sqfa.a6 → writer
```

| Hàm/class | Địa chỉ trong `libgdx-flashds.so` (arm64) | Ghi chú |
|---|---|---|
| `com.mh.sqhz.a18` | `0xd19670` | `(Object, boolean)` |
| `com.mh.sqhz.a17` | `0xd12b5c` | `(Object, boolean, int)` |
| `com.mh.sqlq.a67` | `0x134173c` | `(String, boolean)` → c2s/15 |
| `com.mh.sqhz` | — | Màn bản đồ: string `fightingMonster`, `[Map] Loi update monster` |

- Stack chỉ bắt được tới `a18`. Hàm gọi `a18` (vòng update mỗi frame) chưa xác định vì unwind FUZZY không đi qua được frame ART. [Chưa rõ]
- Writer luôn có stack `sqlq.ab8 → sqfa.a6` cho mọi gói, vì gói được xếp hàng rồi gửi từ một luồng riêng. Muốn biết nơi tạo gói thì phải hook hàm dựng gói, không phải writer.
- Sau khi về bản đồ (thua hoặc đầu hàng), nếu nhân vật đứng đúng đường quái đi thì va chạm lại sau ~2,3 s kể từ s2c/43. Trong B2 việc này lặp liền 3 lần với Gà Điên.

## Đầu hàng

Nút "Đầu hàng" → "Bạn muốn thoát khỏi trận đấu" → OK. Client gửi **c2s/11** (map) rồi **c2s/40** (`string battleUuid`), nhận s2c/11, s2c/10, s2c/1214, sau đó gửi c2s/43. Không có opcode đầu hàng riêng. [Đo 4 lần]

c2s/40 được dựng trong `sqlq.s77`, gọi từ luồng `com.mh.sqln.run1`, do nút OK của `com.g.c.sqaj.a5` kích hoạt.

## Thông báo boss (s2c/45)

Không phải quái thường, ghi lại để tham khảo. s2c/45 là `string text`. Lúc 16:54:57 server đẩy 15 gói cùng lúc, mỗi gói `"BOSS <tên> đang ở <map>: khu 0, 1, …, 9"`: [Đo]

Thủ Lĩnh Sơn Tặc (Làng Thanh Khê), Hào Trưởng phía Bắc và Hào Trưởng phía Nam (Trại Vân Sơn), Tướng Xích Vũ (Hồng Giang), Tướng Thiết Hổ (Cửu Phong), Tướng Hùng Liệt (Lạc Cốc), Tướng Thiết Kích (Bạch Nham), Tướng Trấn Vũ (Phong Nguyên), Tướng Vũ Kình (Tiên Cốc), Tướng Nham Hổ (Tam Khê), Đàm Xuyên (Huyền Hồ), Thạch Khôi (Nguyệt Đàm), Lôi Tướng (Tân Trạch), Nguyễn Bá Dực (Lam Lĩnh), Vệ Xích (Cổ Phong).

## Thu lại

Giống [05-battle](05-battle.md#thu-lại), thêm hai hook:

1. `Interceptor.attach` vào các export `com_mh_sqlq_*__ngen_native_{a67,b119,a63,e66,s77}E`, lấy `Thread.backtrace(ctx, Backtracer.FUZZY)` và `DebugSymbol.fromAddress`. Tham số String đọc bằng `GetStringUTFChars` (JNI 169).
2. Tại `sqhz.a17`, đọc field bằng reflection qua JNI thô:
   - `Class.getDeclaredFields`, `Field.getName/getType/getModifiers`, rồi `GetFieldID/Get*Field`;
   - `PushLocalFrame/PopLocalFrame` để không tràn local ref;
   - `NewGlobalRef` cho object cần giữ qua nhiều frame.
