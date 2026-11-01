# Cửa hàng NPC: mọi sản phẩm, giá và cách mua

Mốc: APK 1.0.3, server Thanh Khê, nhân vật symap (cấp 79, hệ Hỏa). Nguồn:

- **J1** (01/11): bot TS mở cả 14 cửa hàng, ghi mọi `s2c/1190`, và mua 1 Nhẫn Trơn giá 300 Xu (người dùng đồng ý) ([14-npc](14-npc.md)).
- **J2** (01/11): bot TS mở lại Dược phẩm và menu Đổi lượng của Hương Lão. Không mua, không đổi gì.
- **J3** (01/11, người dùng đồng ý): bot TS mua 1 Đá cấp 6 (2 Lượng) và 1 Chuyển hoá trang bị sơ cấp (30 Lượng), đổi 50 Lượng lấy 55.000 Xu khóa, và gặp túi đầy ([16-upgrade](16-upgrade.md#j3)).
- **Cẩm nang** của game (`cam-nang.json`, chép từ máy ngày 01/11): trang Tiền tệ, Trang bị, Hệ và bộ trang bị.

App Rust mua được ở cả 14 cửa hàng trong modal Tiện ích ([features](../../integration/rust/features.md#tiện-ích)).

Mọi bảng dưới đây được sinh từ byte của gói, không chép tay. Dữ liệu thô ở `captures/n1-2026-11-01/` và `captures/n2-2026-11-01/` (chỉ có trên máy, không vào git).

Nhãn: **[Đo]**, **[Suy luận]**, **[Chưa rõ]** như các file khác.

## Tóm tắt

| Câu hỏi | Trả lời |
|---|---|
| Có bao nhiêu cửa hàng, bán gì? | 14 cửa hàng ở hai NPC của M1. Lái Buôn: Vũ khí (Xu và Xu khóa), Dược phẩm, Cửa hàng [Lượng]. Bà Tư Hạnh: Nón Nam, Nón Nữ, Giáp Nam, Giáp Nữ, Nhẫn, mỗi loại có bản Xu và bản Xu khóa. Tổng 193 dòng hàng ([danh sách](#danh-sách-sản-phẩm)). [Đo] |
| Mua thế nào? | Mọi cửa hàng dùng chung một gói: `c2s/1190 (0, ôCửaHàng, sốLượng)`. Ô cửa hàng là số riêng của từng dòng hàng, không phải mã vật phẩm ([mua](#mua)). [Đo] |
| Mua bằng Lượng thế nào? | Cũng `c2s/1190`, chỉ khác ô: Cửa hàng [Lượng] (mã 8) có loại tiền 2 = Lượng. J3 mua 2 món: server trả `s2c/46` (Lượng giảm), `s2c/1187` (cả túi), `s2c/1256` "Bạn vừa mua thành công! …", `s2c/46`. Món mua bằng Lượng chưa khoá ([Lượng](#lượng)). [Đo J3] |
| Đổi Lượng ra Xu? | Hương Lão Trần Bá → Đổi lượng → "50 lượng nhận 50.000 Xu" hoặc "50 lượng nhận 55.000 Xu khóa". Chọn dòng là đổi ngay, không hỏi lại. J3 đổi lấy Xu khóa: `s2c/46` hai lần rồi `s2c/1256` "Bạn vừa nhận được 55.000 Xu khóa" ([Đổi lượng](#đổi-lượng)). [Đo J3] |
| Túi đầy thì sao? | `s2c/1256` "Rương đã đầy. Vui lòng bỏ bớt đồ ra hoặc mua thêm ngăn chứa", không trừ tiền ([túi đầy](#túi-đầy)). [Đo J3] |
| Mua Lượng bằng tiền thật? | Lượng là tiền nạp (Cẩm nang). Không có NPC nào bán Lượng. [Đo chữ của game] |
| Đồ mua có bị khoá giao dịch không? | Món mua bằng **Xu khóa** bị khoá; mua bằng Xu hoặc Lượng thì không. Cờ khoá là `field1` của bản ghi vật phẩm: 1 chưa khoá, 0 đã khoá ([khoá](#khoá)). [Đo + Cẩm nang] |
| Đồ mua có hệ gì? | Luôn đúng hệ của người mua (Cẩm nang), nhưng chưa có % thưởng hệ. Nhẫn Trơn symap mua có hệ 1 = Hỏa. [Đo 1 món] |
| Chỉ số của trang bị mua? | Chỉ số chính rơi ngẫu nhiên trong một khoảng ghi sẵn trong bản ghi cửa hàng, ví dụ Nhẫn Trơn: sức tấn công 5–9. Món mua về còn có thể thêm một chỉ số phụ ([bản ghi](#bản-ghi)). [Đo] |

<a id="mở-cửa-hàng"></a>

## Mở từng cửa hàng

Nói chuyện với NPC (`c2s/13 "M1", npcId`), rồi chọn từng dòng bằng `c2s/57 (mãDòng, "M1", npcId)` ([hộp thoại](14-npc.md#hộp-thoại)). Byte đầu của `s2c/1190` là mã cửa hàng. Bot gửi từ chỗ nào trong M1 cũng được; ở map khác server trả "Không thể thực hiện" ([P5](12-skills-items.md#c2s-1190)). [Đo]

| Mã | Đường menu (mã dòng) | Tên bảng | Món | Tiền |
|---:|---|---|---:|---|
| 0 | Lái Buôn 106 → 0 Vũ khí → 0 Vũ khí [Xu] | Vũ Khí | 26 | Xu |
| 7 | Lái Buôn 106 → 0 Vũ khí → 1 Vũ khí [Xu khóa] | Vũ Khí | 26 | Xu khóa |
| 6 | Lái Buôn 106 → 1 Dược phẩm | Vật Phẩm | 8 | Xu, Xu khóa |
| 8 | Lái Buôn 106 → 2 Cửa hàng [Lượng] | Vật Phẩm | 19 | Lượng |
| 1 / 9 | Bà Tư Hạnh 103 → 0 Nón → 0 Nón Nam [Xu] / 2 Nón Nam [Xu khóa] | Nón Nam | 12 | Xu / Xu khóa |
| 2 / 10 | Bà Tư Hạnh 103 → 0 Nón → 1 Nón Nữ [Xu] / 3 Nón Nữ [Xu khóa] | Nón Nữ | 11 | Xu / Xu khóa |
| 3 / 11 | Bà Tư Hạnh 103 → 1 Giáp → 0 Giáp Nam [Xu] / 2 Giáp Nam [Xu khóa] | Giáp Nam | 11 | Xu / Xu khóa |
| 4 / 12 | Bà Tư Hạnh 103 → 1 Giáp → 1 Giáp Nữ [Xu] / 3 Giáp Nữ [Xu khóa] | Giáp Nữ | 11 | Xu / Xu khóa |
| 5 / 13 | Bà Tư Hạnh 103 → 2 Nhẫn → 0 Nhẫn [Xu] / 1 Nhẫn [Xu khóa] | Nhẫn | 12 | Xu / Xu khóa |

<a id="danh-sách-sản-phẩm"></a>

## Danh sách sản phẩm

Trang bị chia ba bậc theo cấp mặc: 1, 21, 51. Cửa hàng không bán đồ bậc 101 trở lên. Bản Xu và bản Xu khóa bán cùng món, cùng thứ tự, nhưng ô khác nhau; đồ bậc 1 cùng giá, đồ bậc 21 và 51 đắt hơn 8–11% khi trả bằng Xu khóa. [Đo]

Giá theo bậc (Xu / Xu khóa) [Đo]:

| Loại | Bậc 1 | Bậc 21 | Bậc 51 | Chỉ số chính (bậc 1 / 21 / 51) |
|---|---|---|---|---|
| Vũ khí | 400 / 400 | 2.900 / 3.200 | 32.000 / 35.000 | sức tấn công 7–11 / 12–20 / 20–34 |
| Nón | 400 / 400 | 2.300 / 2.500 | 25.500 / 28.000 | phòng thủ 3–5 / 7–11 / 11–19 |
| Giáp | 400 / 400 | 2.500 / 2.700 | 27.500 / 30.500 | phòng thủ 5–9 / 8–14 / 12–20 |
| Nhẫn | 300 / 300 | 1.900 / 2.100 | 21.500 / 23.500 | sức tấn công 5–9 / 8–14 / 11–19 |

**Vũ Khí** (cửa hàng 0 và 7, 26 món)

| Món | Mã | Cấp mặc | Chỉ số chính | Ô [Xu] | Giá Xu | Ô [Xu khóa] | Giá Xu khóa |
|---|---:|---:|---|---:|---:|---:|---:|
| Đao Đại Hiệp | 246 | 1 | sức tấn công 7–11 | 263 | 400 | 332 | 400 |
| Chùy Gỗ | 249 | 1 | sức tấn công 7–11 | 264 | 400 | 333 | 400 |
| Cành Gai | 252 | 1 | sức tấn công 7–11 | 265 | 400 | 334 | 400 |
| Kiếm Hào Kiệt | 255 | 1 | sức tấn công 7–11 | 266 | 400 | 335 | 400 |
| Rìu Âu Lạc | 261 | 1 | sức tấn công 7–11 | 267 | 400 | 336 | 400 |
| Muôi Sắt | 264 | 1 | sức tấn công 7–11 | 268 | 400 | 337 | 400 |
| Ngư Tinh Kiếm | 273 | 1 | sức tấn công 7–11 | 271 | 400 | 340 | 400 |
| Cự Chùy | 267 | 21 | sức tấn công 12–20 | 269 | 2.900 | 338 | 3.200 |
| Lam Dù | 270 | 21 | sức tấn công 12–20 | 270 | 2.900 | 339 | 3.200 |
| Cổ Kiếm | 285 | 21 | sức tấn công 12–20 | 272 | 2.900 | 341 | 3.200 |
| Thiết Côn | 248 | 21 | sức tấn công 12–20 | 283 | 2.900 | 352 | 3.200 |
| Vũ Phiến | 257 | 21 | sức tấn công 12–20 | 286 | 2.900 | 355 | 3.200 |
| Chiến Đao | 247 | 21 | sức tấn công 12–20 | 483 | 2.900 | 484 | 3.200 |
| Quỷ Vong Kiếm | 287 | 51 | sức tấn công 20–34 | 292 | 32.000 | 361 | 35.000 |
| Kiếm Đại Tướng | 278 | 51 | sức tấn công 20–34 | 323 | 32.000 | 382 | 35.000 |
| Liệt Hỏa Đao | 299 | 51 | sức tấn công 20–34 | 324 | 32.000 | 383 | 35.000 |
| Hỏa Phủ | 302 | 51 | sức tấn công 20–34 | 325 | 32.000 | 384 | 35.000 |
| Kim Đao | 548 | 51 | sức tấn công 20–34 | 326 | 32.000 | 385 | 35.000 |
| Ngũ Độc Trảo | 555 | 51 | sức tấn công 20–34 | 327 | 32.000 | 386 | 35.000 |
| Hắc Chùy | 560 | 51 | sức tấn công 20–34 | 328 | 32.000 | 387 | 35.000 |
| Chổi Chà | 565 | 51 | sức tấn công 20–34 | 329 | 32.000 | 388 | 35.000 |
| Lưỡi Hái | 574 | 51 | sức tấn công 20–34 | 330 | 32.000 | 389 | 35.000 |
| Hổ Đao | 581 | 51 | sức tấn công 20–34 | 331 | 32.000 | 390 | 35.000 |
| Thanh Lam Đao | 277 | 51 | sức tấn công 20–34 | 466 | 32.000 | 467 | 35.000 |
| Xà Kiếm | 283 | 51 | sức tấn công 20–34 | 468 | 32.000 | 469 | 35.000 |
| Kiếm Anh Hùng | 286 | 51 | sức tấn công 20–34 | 485 | 32.000 | 486 | 35.000 |

**Nón Nam** (cửa hàng 1 và 9, 12 món)

| Món | Mã | Cấp mặc | Chỉ số chính | Ô [Xu] | Giá Xu | Ô [Xu khóa] | Giá Xu khóa |
|---|---:|---:|---|---:|---:|---:|---:|
| Nón Lá | 48 | 1 | phòng thủ 3–5 | 7 | 400 | 71 | 400 |
| Khăn rằn | 51 | 1 | phòng thủ 3–5 | 8 | 400 | 72 | 400 |
| Nón Âu Lạc | 54 | 1 | phòng thủ 3–5 | 9 | 400 | 73 | 400 |
| Tử Kim Quan | 50 | 21 | phòng thủ 7–11 | 27 | 2.300 | 91 | 2.500 |
| Nón Tiên Phong | 59 | 21 | phòng thủ 7–11 | 30 | 2.300 | 94 | 2.500 |
| Nón Hào Kiệt | 68 | 21 | phòng thủ 7–11 | 31 | 2.300 | 95 | 2.500 |
| Vòng Cốt Hổ | 60 | 51 | phòng thủ 11–19 | 60 | 25.500 | 124 | 28.000 |
| Nón Đại Tướng | 63 | 51 | phòng thủ 11–19 | 61 | 25.500 | 125 | 28.000 |
| Mặt Nạ Ma Cà Rồng | 69 | 51 | phòng thủ 11–19 | 62 | 25.500 | 126 | 28.000 |
| Mặt Nạ Xương | 72 | 51 | phòng thủ 11–19 | 63 | 25.500 | 127 | 28.000 |
| Khăn Long Quân | 75 | 51 | phòng thủ 11–19 | 450 | 25.500 | 451 | 28.000 |
| Vòng Anh Hùng | 78 | 51 | phòng thủ 11–19 | 452 | 25.500 | 453 | 28.000 |

**Nón Nữ** (cửa hàng 2 và 10, 11 món)

| Món | Mã | Cấp mặc | Chỉ số chính | Ô [Xu] | Giá Xu | Ô [Xu khóa] | Giá Xu khóa |
|---|---:|---:|---|---:|---:|---:|---:|
| Khăn Vòng | 99 | 1 | phòng thủ 3–5 | 12 | 400 | 76 | 400 |
| Nón Âu Lạc | 105 | 1 | phòng thủ 3–5 | 14 | 400 | 78 | 400 |
| Búi Tóc | 104 | 21 | phòng thủ 7–11 | 33 | 2.300 | 97 | 2.500 |
| Nón Tiên Phong | 110 | 21 | phòng thủ 7–11 | 35 | 2.300 | 99 | 2.500 |
| Nón Hào Kiệt | 119 | 21 | phòng thủ 7–11 | 36 | 2.300 | 100 | 2.500 |
| Vòng Cốt Hổ | 111 | 51 | phòng thủ 11–19 | 67 | 25.500 | 131 | 28.000 |
| Nón Đại Tướng | 114 | 51 | phòng thủ 11–19 | 68 | 25.500 | 132 | 28.000 |
| Nón Ác Ma | 120 | 51 | phòng thủ 11–19 | 69 | 25.500 | 133 | 28.000 |
| Nón Phù Thủy | 123 | 51 | phòng thủ 11–19 | 70 | 25.500 | 134 | 28.000 |
| Mão Âu Cơ | 127 | 51 | phòng thủ 11–19 | 454 | 25.500 | 455 | 28.000 |
| Vòng Anh Hùng | 130 | 51 | phòng thủ 11–19 | 456 | 25.500 | 457 | 28.000 |

**Giáp Nam** (cửa hàng 3 và 11, 11 món)

| Món | Mã | Cấp mặc | Chỉ số chính | Ô [Xu] | Giá Xu | Ô [Xu khóa] | Giá Xu khóa |
|---|---:|---:|---|---:|---:|---:|---:|
| Áo Hào Kiệt | 147 | 1 | phòng thủ 5–9 | 135 | 400 | 199 | 400 |
| Áo Chiến | 150 | 1 | phòng thủ 5–9 | 136 | 400 | 200 | 400 |
| Áo Âu Lạc | 502 | 1 | phòng thủ 5–9 | 137 | 400 | 201 | 400 |
| Giáp Tiên Phong | 149 | 21 | phòng thủ 8–14 | 155 | 2.500 | 219 | 2.700 |
| Áo Thuật Sĩ | 519 | 21 | phòng thủ 8–14 | 158 | 2.500 | 222 | 2.700 |
| Áo Da Thú | 536 | 21 | phòng thủ 8–14 | 159 | 2.500 | 223 | 2.700 |
| Giáp Đại Tướng | 179 | 51 | phòng thủ 12–20 | 186 | 27.500 | 250 | 30.500 |
| Áo Ma Cà Rồng | 187 | 51 | phòng thủ 12–20 | 187 | 27.500 | 251 | 30.500 |
| Áo Quỷ | 188 | 51 | phòng thủ 12–20 | 188 | 27.500 | 252 | 30.500 |
| Áo Long Quân | 175 | 51 | phòng thủ 12–20 | 458 | 27.500 | 459 | 30.500 |
| Áo Anh Hùng | 178 | 51 | phòng thủ 12–20 | 460 | 27.500 | 461 | 30.500 |

**Giáp Nữ** (cửa hàng 4 và 12, 11 món)

| Món | Mã | Cấp mặc | Chỉ số chính | Ô [Xu] | Giá Xu | Ô [Xu khóa] | Giá Xu khóa |
|---|---:|---:|---|---:|---:|---:|---:|
| Áo Lụa | 198 | 1 | phòng thủ 5–9 | 140 | 400 | 204 | 400 |
| Áo Hào Kiệt | 217 | 1 | phòng thủ 5–9 | 141 | 400 | 205 | 400 |
| Áo Âu Lạc | 509 | 1 | phòng thủ 5–9 | 142 | 400 | 206 | 400 |
| Giáp Tiên Phong | 200 | 21 | phòng thủ 8–14 | 160 | 2.500 | 224 | 2.700 |
| Áo Thiếu Nữ | 526 | 21 | phòng thủ 8–14 | 163 | 2.500 | 227 | 2.700 |
| Áo Chiến | 541 | 21 | phòng thủ 8–14 | 164 | 2.500 | 228 | 2.700 |
| Giáp Đại Tướng | 227 | 51 | phòng thủ 12–20 | 192 | 27.500 | 256 | 30.500 |
| Áo Phù Thủy | 238 | 51 | phòng thủ 12–20 | 194 | 27.500 | 258 | 30.500 |
| Áo Ma Cà Rồng | 239 | 51 | phòng thủ 12–20 | 195 | 27.500 | 259 | 30.500 |
| Áo Âu Cơ | 226 | 51 | phòng thủ 12–20 | 462 | 27.500 | 463 | 30.500 |
| Giáp Anh Hùng | 229 | 51 | phòng thủ 12–20 | 464 | 27.500 | 465 | 30.500 |

**Nhẫn** (cửa hàng 5 và 13, 12 món)

| Món | Mã | Cấp mặc | Chỉ số chính | Ô [Xu] | Giá Xu | Ô [Xu khóa] | Giá Xu khóa |
|---|---:|---:|---|---:|---:|---:|---:|
| Nhẫn Trơn | 306 | 1 | sức tấn công 5–9 | 391 | 300 | 397 | 300 |
| Nhẫn Hào Kiệt | 312 | 1 | sức tấn công 5–9 | 392 | 300 | 398 | 300 |
| Nhẫn Âu Lạc | 318 | 1 | sức tấn công 5–9 | 393 | 300 | 399 | 300 |
| Nhẫn Thái Cực | 333 | 21 | sức tấn công 8–14 | 394 | 1.900 | 400 | 2.100 |
| Nhẫn Tiên Phong | 342 | 21 | sức tấn công 8–14 | 395 | 1.900 | 401 | 2.100 |
| Nhẫn Đại Hiệp | 315 | 21 | sức tấn công 8–14 | 472 | 1.900 | 473 | 2.100 |
| Nhẫn Đại Tướng | 354 | 51 | sức tấn công 11–19 | 396 | 21.500 | 402 | 23.500 |
| Nhẫn Long Cơ | 363 | 51 | sức tấn công 11–19 | 474 | 21.500 | 475 | 23.500 |
| Nhẫn Quỷ | 366 | 51 | sức tấn công 11–19 | 476 | 21.500 | 477 | 23.500 |
| Nhẫn Ma Cà Rồng | 369 | 51 | sức tấn công 11–19 | 478 | 21.500 | 479 | 23.500 |
| Anh Hùng Nhẫn | 357 | 51 | sức tấn công 11–19 | 489 | 21.500 | 490 | 23.500 |
| Nhẫn Chữ Thập | 372 | 51 | sức tấn công 11–19 | 491 | 21.500 | 492 | 23.500 |

**Vật Phẩm** (cửa hàng 6, 8 món)

| Ô | Món | Mã | Giá | Tiền | Công dụng (bảng vật phẩm) |
|---:|---|---:|---:|---|---|
| 0 | Hoàn Linh Dược | 0 | 109 | Xu | Bơm 30% sinh lực |
| 1 | Kim Đan Dược | 1 | 109 | Xu | Bơm 25% công lực |
| 2 | Búa Sửa Chữa | 2 | 73 | Xu | Sử dụng để sửa chữa |
| 4 | Hoàn Linh Dược | 0 | 120 | Xu khóa | Bơm 30% sinh lực |
| 5 | Kim Đan Dược | 1 | 120 | Xu khóa | Bơm 25% công lực |
| 6 | Búa Sửa Chữa | 2 | 80 | Xu khóa | Sử dụng để sửa chữa |
| 415 | Bình Huyết Linh (Rỗng) | 16 | 4.000 | Xu | Mặc Băng Kiếm và mang bình khi đánh Bạch Hổ Thống Lĩnh: gây đủ sát thương thì bình được làm đầy (tối đa 3 bình mỗi lần boss xuất hiện). |
| 487 | Băng Tâm | 21 | 500 | Xu | Nguyên liệu chế tạo Băng Kiếm |

**Vật Phẩm** (cửa hàng 8, 19 món)

| Ô | Món | Mã | Giá | Tiền | Công dụng (bảng vật phẩm) |
|---:|---|---:|---:|---|---|
| 3 | Tăng Kinh Nghiệm | 7 | 10 | Lượng | Tăng x2 kinh nghiệm trong 24 giờ kể từ lúc dùng, tính cả khi không đăng nhập. Dùng thêm khi còn hiệu lực thì cộng dồn thời gian. |
| 305 | Tẩy Tủy Đan | 47 | 30 | Lượng | Điều chỉnh lại toàn bộ điểm cường lực, nội lực, thân pháp, thể lực |
| 488 | Tẩy Kinh Đan | 645 | 30 | Lượng | Đặt lại toàn bộ kỹ năng về cấp 0 và hoàn trả toàn bộ điểm kỹ năng đã cộng. |
| 301 | Bùa bảo vệ sơ cấp | 35 | 10 | Lượng | Bảo vệ không rớt cấp khi nâng cấp trang bị từ cấp 1 đến cấp 8 |
| 302 | Bùa bảo vệ trung cấp | 36 | 45 | Lượng | Bảo vệ không rớt cấp khi nâng cấp trang bị từ cấp 1 đến cấp 12 |
| 303 | Bùa bảo vệ cao cấp | 37 | 150 | Lượng | Bảo vệ không rớt cấp khi nâng cấp trang bị từ cấp 1 đến cấp 14 |
| 304 | Bùa bảo vệ siêu cấp | 38 | 350 | Lượng | Bảo vệ không rớt cấp khi nâng cấp trang bị từ cấp 1 đến cấp 16 |
| 306 | Vé may mắn | 39 | 5 | Lượng | Sử dụng để lật hình may mắn |
| 307 | Túi vải cấp 1 | 432 | 10 | Lượng | Sử dụng để mở rộng hành trang thêm 6 ô trống |
| 403 | Túi vải cấp 2 | 433 | 12 | Lượng | Sử dụng để mở rộng hành trang thêm 6 ô trống |
| 404 | Đá cấp 6 | 416 | 2 | Lượng | Nguyên liệu nâng cấp vật phẩm |
| 405 | Đá cấp 7 | 417 | 7 | Lượng | Nguyên liệu nâng cấp vật phẩm |
| 406 | Đá cấp 8 | 418 | 30 | Lượng | Nguyên liệu nâng cấp vật phẩm |
| 407 | Đá cấp 9 | 419 | 120 | Lượng | Nguyên liệu nâng cấp vật phẩm |
| 408 | Đá cấp 10 | 420 | 480 | Lượng | Nguyên liệu nâng cấp vật phẩm |
| 409 | Đá cấp 11 | 421 | 1.900 | Lượng | Nguyên liệu nâng cấp vật phẩm |
| 480 | Chuyển hoá trang bị sơ cấp | 616 | 30 | Lượng | Chuyển cấp cường hoá của trang bị nguồn (tối đa +10) sang trang bị +0 cùng loại, bậc bằng hoặc cao hơn. Trang bị nhận bị khoá giao dịch. Dùng ở Pháp Sư: Nâng cấp, Chuyển hoá trang bị. |
| 481 | Chuyển hoá trang bị trung cấp | 617 | 150 | Lượng | Chuyển cấp cường hoá của trang bị nguồn (tối đa +13) sang trang bị +0 cùng loại, bậc bằng hoặc cao hơn. Trang bị nhận bị khoá giao dịch. Dùng ở Pháp Sư: Nâng cấp, Chuyển hoá trang bị. |
| 482 | Chuyển hoá trang bị cao cấp | 618 | 500 | Lượng | Chuyển cấp cường hoá của trang bị nguồn (tối đa +16) sang trang bị +0 cùng loại, bậc bằng hoặc cao hơn. Trang bị nhận bị khoá giao dịch. Dùng ở Pháp Sư: Nâng cấp, Chuyển hoá trang bị. |

Ô cửa hàng là số riêng trên mọi cửa hàng (ô 3 là Tăng Kinh Nghiệm của cửa hàng [Lượng], ô 7 là Nón Lá của Nón Nam [Xu]), nên dãy ô của một cửa hàng có chỗ trống. [Đo J1, J2]

<a id="bản-ghi"></a>

## Bản ghi của `s2c/1190`

`s2c/1190` = `u8 mãCửaHàng; string tênBảng; i32 n; n × bản ghi`. Vật phẩm thường có bản ghi 33 byte; **trang bị có bản ghi 49 byte** vì có thêm một dòng chỉ số. Ba cửa hàng vật phẩm (6, 8) và 12 cửa hàng trang bị đều đọc hết byte với bố cục sau. [Đo J1, J2]

| Trường | Kiểu | Vật phẩm (Hoàn Linh Dược, ô 4) | Trang bị (Nhẫn Trơn, ô 391) | Ghi chú |
|---|---|---|---|---|
| Ô cửa hàng | i32 | 4 | 391 | Số gửi lên trong `c2s/1190`. Không phải mã vật phẩm |
| Mã vật phẩm | i32 | 0 | 306 | Tra ở [bảng vật phẩm](13-drops-items.md#bảng-vật-phẩm) |
| Loại tiền | u8 | 1 | 0 | 0 Xu, 1 Xu khóa, 2 Lượng |
| Giá một món | i32 | 120 | 300 | |
| Độ bền | i32 | -1 | -1 | -1 ở mọi dòng, kể cả trang bị (món mua về có độ bền 60) |
| Số lượng | i32 | 1 | 1 | |
| Cờ khoá | u8 | 0 | 1 | 1 ở mọi món giá Xu và Lượng, 0 ở món giá Xu khóa; giống `field1` của món trong túi ([khoá](#khoá)) |
| Hệ | u8 | 0xff | 1 | Trang bị luôn mang hệ của người mua (symap là Hỏa = 1), vật phẩm 0xff |
| field2 | i32 | 0 | 0 | |
| field3 | u8 | 0 | 0 | |
| field4 | u8 | 0 | 1 | 1 ở mọi trang bị, như `field4` của bản ghi vật phẩm |
| Số dòng chỉ số k | i32 | 0 | 1 | Bản ghi vật phẩm trong túi dùng `u8` ở chỗ này; cửa hàng dùng `i32` |
| k × {mã chỉ số; nhỏ nhất; lớn nhất; 4 byte} | i32; i32; i32; u8×4 | | 5, 5, 9, `01 01 01 01` | Mã chỉ số tra ở `stats` của [items.json](../../../data/items.json): 5 sức tấn công, 6 phòng thủ. 4 byte cuối là `01 01 01 01` ở mọi dòng, trừ vũ khí bậc 51 có `01 01 02 01` [Chưa rõ] |

Món mua về: Nhẫn Trơn của J1 có sức tấn công 5 (trong khoảng 5–9) và thêm **chí mạng 1%**. Chỉ số phụ đó không có trong bản ghi cửa hàng, nên có lẽ server rút ngẫu nhiên lúc bán. [Đo 1 món; Suy luận]

Hàm `shopList` của bot TS (`src/protocol/world.ts`) chỉ đọc bản ghi 33 byte, nên với cửa hàng trang bị nó báo "unread bytes". Phải sửa theo bảng trên trước khi app mua trang bị. [Đo]

<a id="mua"></a>

## Mua

`c2s/1190` = `u8 0; i32 ôCửaHàng; i32 sốLượng`, hàm dựng `sqlq.h87(ô, sốLượng)`. Không cần đứng gần NPC và không cần mở bảng trước: chỉ cần đang ở M1. [Đo P5, J1]

| Lần đo | Gói | Kết quả |
|---|---|---|
| P5 | `00 00000004 00000001`: 1 Hoàn Linh Dược, ô 4, 120 Xu khóa | `s2c/1256` "Bạn vừa mua thành công! 1 Hoàn Linh Dược", `s2c/42` (cả túi), `s2c/46` (Xu khóa 3544 → 3424) |
| P5 | `00 00000000 00000001`: ô 0, giá Xu, khi không đủ Xu | `s2c/1256` "Không đủ Xu để thực hiện" |
| J1 | `00 00000187 00000001`: 1 Nhẫn Trơn, ô 391, 300 Xu | `s2c/1256` "Bạn vừa mua thành công! 1 Nhẫn Trơn", `s2c/42`, `s2c/46` (Xu 13.755.900 → 13.755.600) |

Vậy một gói mua dùng cho mọi cửa hàng, cả vật phẩm lẫn trang bị. Món mới vào ô trống đầu tiên của túi. Luồng gói đầy đủ và màn hình trên máy ở [12-skills-items](12-skills-items.md#luồng-gói-mua). [Đo]

<a id="lượng"></a>

## Mua bằng Lượng

Cửa hàng [Lượng] (mã 8) có 19 món ở bảng trên, giá ghi bằng Lượng (loại tiền 2). Gói mua là `c2s/1190 (0, ô, sốLượng)` như mọi cửa hàng. [Đo]

J3 mua hai lần (người dùng đồng ý), sau khi mở bảng bằng `c2s/57 (2, "M1", 106)` [Đo J3]:

```text
C→S 1190  00 00000194 00000001          1 Đá cấp 6, ô 404, 2 Lượng
S→C 46    Xu 13.755.600, Xu khóa 7.951.694, Lượng 16.673     (16.675 − 2)
S→C 1187  cả túi, 49 món: Đá cấp 6 ở ô 25, field1 1 (chưa khoá)
S→C 1256  1, "Bạn vừa mua thành công! 1 Đá cấp 6"
S→C 46    như trên

C→S 1190  00 000001e0 00000001          1 Chuyển hoá trang bị sơ cấp, ô 480, 30 Lượng
S→C 46    Lượng 16.668 → 16.638
S→C 1187  cả túi, món mới ở ô 26
S→C 1256  1, "Bạn vừa mua thành công! 1 Chuyển hoá trang bị sơ cấp"
S→C 46    như trên
```

Khác với mua bằng Xu (J1) và Xu khóa (P5), vốn trả `s2c/1256`, `s2c/42`, `s2c/46`: mua bằng Lượng thì túi đến bằng `s2c/1187`, và `s2c/46` đến cả trước lẫn sau. Bot nên nhận cả hai cách. Thiếu Lượng thì có lẽ "Không đủ Lượng để thực hiện", như "Không đủ Xu…" ở P5 [Suy luận].

Lượng là tiền nạp. Theo Cẩm nang, Lượng dùng cho: Nâng cấp [Cẩn thận] ([16-upgrade](16-upgrade.md#cẩn-thận)), bùa bảo vệ, Bảo Điển, chat kênh Thế giới (1 Lượng mỗi tin), lập sứ quân (500 Lượng), mua quỹ Trưởng thành, mua cấp Bảo Điển. VIP tính theo tổng Lượng đã nạp. [Đo chữ của game]

<a id="đổi-lượng"></a>

## Đổi lượng ở Hương Lão

```text
C→S 13    "M1", 102                 Hương Lão Trần Bá
S→C 57    4 dòng: 0 Mã quà tặng, 1 Đổi lượng, 2 Nhiệm vụ hàng ngày, 3 Điểm năng động
C→S 57    1, "M1", 102              Đổi lượng
S→C 57    "Con muốn đổi gì.": 0 "50 lượng nhận 50.000 Xu", 1 "50 lượng nhận 55.000 Xu khóa"
```

Chọn một dòng là đổi ngay, không có hộp hỏi lại. J3 chọn dòng 1 (người dùng đồng ý) [Đo J3]:

```text
C→S 57    1, "M1", 102                  50 lượng nhận 55.000 Xu khóa
S→C 46    Xu khóa 7.951.534, Lượng 16.588          (Lượng − 50)
S→C 46    Xu khóa 8.006.534, Lượng 16.588          (Xu khóa + 55.000)
S→C 1256  1, "Bạn vừa nhận được 55.000 Xu khóa"
```

Dòng 0 cùng dạng, G1 đổi trên Tiheo2 (người dùng nhờ điều tra menu này) [Đo G1]:

```text
C→S 57    0, "M1", 102                  50 lượng nhận 50.000 Xu
S→C 46    Xu 15.003.600, Lượng 29.950              (Lượng − 50)
S→C 46    Xu 15.053.600, Lượng 29.950              (Xu + 50.000)
S→C 1256  1, "Bạn vừa nhận được 50.000 Xu"
```

Gói của dòng 0 trùng từng byte với Mã quà tặng ở menu gốc, Nhận nhiệm vụ và Đổi Xu; server hiểu theo menu nó vừa gửi ([hộp thoại](14-npc.md#hộp-thoại)). Cẩm nang ghi cùng tỉ giá. Thiếu Lượng thì server trả gì, và mỗi ngày đổi được mấy lần: chưa đo.

Chiều ngược lại (Xu khóa → Xu) có ở Điểm năng động, mỗi tuần một lần khi đủ 100 điểm ([Hương Lão](14-npc.md#hương-lão)).

<a id="túi-đầy"></a>

## Túi đầy

Túi của symap có 54 ô (`sứcChứa` trong `s2c/42` và `s2c/1187`). Khi cả 54 ô có món, `c2s/1190` mua 1 Đá cấp 6 thì server chỉ trả `s2c/1256` (field 1) "Rương đã đầy. Vui lòng bỏ bớt đồ ra hoặc mua thêm ngăn chứa"; không có `s2c/46`, không trừ Lượng. Mua thêm ô bằng Túi vải cấp 1, cấp 2 (+6 ô mỗi túi). Pháp sư cũng từ chối Tách đá khi túi đầy ([16-upgrade](16-upgrade.md#túi-đầy)). [Đo J3]

<a id="khoá"></a>

## Đồ khoá giao dịch

Cẩm nang: "đồ mua bằng Xu khóa sẽ bị khóa"; "đồ bị khóa khi mặc lần đầu hoặc khi nâng cấp thành công". Trong túi của symap (J2, J3), `field1` của bản ghi vật phẩm khớp đúng luật đó [Đo]:

| Món | Nguồn | `field1` |
|---|---|---:|
| Nhẫn Trơn | Mua bằng Xu (J1) | 1 |
| Bùa bảo vệ sơ, trung cấp | Mua bằng Lượng | 1 |
| Giáp Đại Tướng +1 | Vừa nâng cấp thành công (J1) | 0 |
| Hoàn Linh Dược | Mua bằng Xu khóa (P5, Tiheo2) | 0 |
| Gỗ Bậc 2 | Hai ô: 116 viên có 1, 689 viên có 0 | 1 và 0 |
| Đá cấp 6, Chuyển hoá sơ cấp | Mua bằng Lượng (J3) | 1 |
| Nhẫn Trơn | Nâng cấp thất bại (J3) | 1, giữ nguyên |
| Nhẫn Trơn +1 | Nâng cấp thành công (J3) | 1 → 0 |
| Đá cấp 1 | Nhận từ Tách đá một món đã khoá (J3) | 0 |
| Đá cấp 2 | Luyện từ 2 Đá cấp 1 chưa khoá ở Luyện đá [Xu] (J3) | 1 |

Món cùng loại nhưng khác cờ khoá nằm ở hai ô riêng. Vậy `field1` = 1 là chưa khoá, 0 là đã khoá giao dịch. Đá luyện từ đá đã khoá cũng bị khoá ([Luyện đá](16-upgrade.md#luyện-đá)). [Đo]

## Chưa đo

- Thiếu Lượng khi mua hay khi đổi; đổi 50 Lượng lấy 50.000 Xu.
- Mua nhiều món một lần (`sốLượng` > 1) với trang bị; túi đầy.
- Bán đồ: Ngọc Nga → Bán vật phẩm là Chợ trời (phí đăng 1.000 Xu), không phải bán cho NPC ([Ngọc Nga](14-npc.md#ngọc-nga)).
