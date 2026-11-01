# Pháp sư: nâng cấp, luyện đá, tách đá, chuyển hoá, chế tạo

Mốc: APK 1.0.3, server Thanh Khê, nhân vật symap (tài khoản tiheo1, cấp 79, hệ Hỏa). Nguồn:

- **J1** (01/11): điện thoại có Frida ghi gói. Nâng cấp [thường] Giáp Đại Tướng từ +0 lên +1 bằng 1 Đá cấp 5 (người dùng đồng ý; tốn 12 Xu khóa) ([luồng trên máy](#trên-máy)).
- **J2** (01/11): bot TS chạy 4 lượt. Mỗi lượt mở các cửa sổ của Pháp sư, đặt món và đá (`c2s/97`), rồi đọc giá và tỉ lệ server báo. **Không bấm Bắt đầu lần nào**, nên không tốn gì. Dữ liệu thô và script ở `captures/n2-2026-11-01/` (chỉ có trên máy, không vào git).
- **J3** (01/11, người dùng đồng ý tiêu): bot TS **bấm Bắt đầu thật** ở mọi cửa sổ: 7 lần Luyện đá (6 thành công, 1 bị từ chối), 3 lần Nâng cấp (1 thất bại), 2 lần Tách đá (lần đầu túi đầy), 1 Chuyển hoá; mua 2 món bằng Lượng, đổi 50 Lượng. Sau mỗi lần, bot xin lại cả túi (`c2s/42`) để so món nào mất, món nào thêm ([kết quả J3](#j3)). Tổng: tốn 2 Xu, 87 Lượng, 1.800 Xu khóa, nhận 55.000 Xu khóa.
- **Cẩm nang** của game (`cam-nang.json` chép từ máy ngày 01/11, trang Trang bị và Tiền tệ). Chữ trích nguyên văn có nhãn [Cẩm nang].

Nhãn: **[Đo]**, **[Suy luận]**, **[Chưa rõ]**, **[Cẩm nang]**.

## Tóm tắt

| Câu hỏi | Trả lời |
|---|---|
| Có hợp nhất đá không? | Có: **Luyện đá** ở Pháp sư. Đặt 2 đến 24 viên đá; server tính ra một viên cấp cao hơn, kèm tỉ lệ và phí. 4 viên cùng cấp k thành 1 viên cấp k+1 chắc chắn (100%), 2 viên 50%, 3 viên 75%. Tỉ lệ phải **trên 40%** mới được bấm. Bắt đầu là `c2s/91 ""`, kết quả là `s2c/93` ([Luyện đá](#luyện-đá)). [Đo J2, J3] |
| Đá cấp nào nâng được gì? | Không thấy giới hạn cấp đá theo cấp món: Đá cấp 1, 3, 4, 5, 6, 9 đều đặt được ở mọi lần nâng đã thử; cấp đá chỉ làm đổi tỉ lệ. Mỗi viên Đá cấp k có giá trị bằng 4^(k−1) viên Đá cấp 1 ([các loại đá](#các-loại-đá)). Đá cấp 2, 7, 8, 10–12 chưa đặt thử ở Nâng cấp. [Đo + Suy luận] |
| Tỉ lệ thành công tính sao? | Server báo sẵn trong `s2c/90` mỗi khi đặt thêm món: "Tỉ lệ thành công: 75%". Có trần theo cấp: +0→+1 là 80%, +1→+2 là 75%. Đặt thêm đá khi đã chạm trần không tăng nữa ([bảng đo](#bảng-đo-nâng-cấp)). [Đo] |
| Thường khác Cẩn thận chỗ nào? | Cẩn thận tốn thêm **5 Lượng** và tỉ lệ ×1,5 (tối đa 100%): cùng một viên Đá cấp 5 cho 75% ở Thường, 100% ở Cẩn thận. Phí Xu khóa như nhau ([Cẩn thận](#cẩn-thận)). [Đo] |
| Thất bại mất gì? | Đo ở +0: `s2c/91` kếtQuả 0, mất đá và phí, món giữ +0 và **không bị khoá**. [Cẩm nang] cấp tụt về mốc gần nhất +4, +8, +12 hoặc +14; dưới +4 giữ nguyên ([thất bại](#thất-bại-và-bùa)). [Đo J3 + Cẩm nang] |
| Bùa bảo vệ? | Giữ cấp khi thất bại. Server **không nhận bùa** ở lần nâng +1→+2 ("Vật phẩm không phù hợp"), khớp với luật dưới +4 không tụt cấp. Mức nào thì nhận: chưa đo ([bùa](#thất-bại-và-bùa)). [Đo + Cẩm nang] |
| Trần cường hoá? | [Cẩm nang] bậc 1 tới +4, bậc 21 tới +8, bậc 51 tới +12, từ bậc 101 và cánh tới +16. |
| Tách đá trả gì? | Giáp Đại Tướng +1 → 2 Đá cấp 1 (đã khoá); giáp về +0, chỉ số về như cũ. Không tốn Xu. Cần đủ ô trống cho số đá nhận ([Tách đá](#tách-đá)). [Đo J3] |
| Chuyển hoá? | Chuyển cấp cường hoá từ món nguồn sang món +0 cùng loại; cần 1 vật phẩm Chuyển hoá (mua bằng Lượng). Đã làm 1 lần: Nhẫn Quỷ +1 → +0, Anh Hùng Nhẫn +0 → +1, không tốn Xu ([Chuyển hoá](#chuyển-hoá)). [Đo J3] |
| Gói gì? | Mở cửa sổ: `c2s/13` → `c2s/57` → `s2c/96` hoặc `s2c/99`. Đặt món: `c2s/97` ở **mọi** cửa sổ. Server trả `s2c/90` (Nâng cấp, Tách đá, nguồn Chuyển hoá), `s2c/1260` (đích Chuyển hoá), `s2c/92` (Luyện đá). Bắt đầu: `c2s/91 ""` ở mọi cửa sổ; kết quả `s2c/91` (Nâng cấp, Tách đá, Chuyển hoá) hay `s2c/93` (Luyện đá). Server **không gửi lại túi**: bot phải tự sửa túi hoặc xin lại bằng `c2s/42` ([gói](#gói)). [Đo J3] |
| Túi đầy thì sao? | Mua: "Rương đã đầy. Vui lòng bỏ bớt đồ ra hoặc mua thêm ngăn chứa". Tách đá: đặt món vẫn được, bấm Bắt đầu thì "Rương đồ không đủ ô trống". Luyện đá làm túi trống bớt nên vẫn chạy ([túi đầy](#túi-đầy)). [Đo J3] |

<a id="luật"></a>

## Luật trong Cẩm nang

Trang "Trang bị 6 bậc, cường hoá +16" [Cẩm nang]:

- **Bậc:** 1, 21, 51, 101, 151, 201; bậc càng cao, chỉ số gốc càng mạnh.
- **Trần cường hoá:** bậc 1 tới +4, bậc 21 tới +8, bậc 51 tới +12, từ bậc 101 và cánh tới +16.
- **Nâng cấp:** chọn Nâng cấp [Thường], đặt đồ và đá; đá càng nhiều, cấp đá càng cao thì càng dễ thành công.
- **Cẩn thận:** Nâng cấp [Cẩn thận] tốn thêm Lượng, tỉ lệ thành công cao hơn.
- **Thất bại:** mất đá, bùa và phí; cấp tụt về mốc gần nhất +4, +8, +12 hoặc +14, dưới +4 thì giữ nguyên.
- **Bùa bảo vệ:** giữ cấp khi thất bại; bùa sơ, trung, cao, siêu cấp dùng cho lần nâng tới +8, +12, +14, +16.
- **Hào quang:** đủ 4 món từ +8, +12, +14, +16 có hào quang cấp 1 đến 4.
- **Trang bị khóa:** đồ bị khóa khi mặc lần đầu hoặc khi nâng cấp thành công ([khoá](15-shops.md#khoá)).

Trang Tiền tệ: "Xu khóa: dùng mua đồ ở cửa hàng NPC, trả phí cường hoá"; "Lượng: … dùng cho Nâng cấp [Cẩn thận], bùa bảo vệ…". Phí nâng cấp ghi "không đủ sẽ sử dụng cả Xu", tức thiếu Xu khóa thì server lấy thêm Xu. [Cẩm nang; Đo lời báo]

<a id="các-loại-đá"></a>

## Các loại đá

Đá cấp 1 tới Đá cấp 12 (mã 411–422, vật phẩm loại 10, mỗi viên một ô) đều là "Nguyên liệu nâng cấp vật phẩm". Chúng chỉ khác **giá trị**: Đá cấp k bằng 4^(k−1) Đá cấp 1, tức 4 viên cấp k bằng 1 viên cấp k+1 ([giá trị đá](#giá-trị-đá)). Giá trị quyết định tỉ lệ ở cả Nâng cấp lẫn Luyện đá; chưa thấy giới hạn cấp đá theo cấp món. [Đo + Suy luận]

| Đá | Mã | Giá trị (Đá cấp 1) | Kiếm ở đâu | Giá ở Cửa hàng [Lượng] | Phí luyện ra viên này |
|---|---:|---:|---|---:|---:|
| Đá cấp 1 | 411 | 1 | Quái M1, M2 (Sơn Tặc, Chỉ Huy Sơn Tặc); Tách đá (+1 trả 2 viên) | | |
| Đá cấp 2 | 412 | 4 | Quái M1, M2 (Sói Xám, Cóc Xanh, Kẻ Gây Rối, Heo Mọi); luyện | | 2 [Đo] |
| Đá cấp 3 | 413 | 16 | Quái M2 (Sói Xám), M10 Cửu Phong (cấp 40); luyện | | 7 |
| Đá cấp 4 | 414 | 64 | Quái M10 Cửu Phong; luyện | | 26 [Đo] |
| Đá cấp 5 | 415 | 256 | Luyện. symap có nhiều nhưng chưa ghi được quái nào rơi | | 103 [Đo] |
| Đá cấp 6 | 416 | 1.024 | Cửa hàng [Lượng] (ô 404); luyện | 2 [Đo mua] | 410 [Đo] |
| Đá cấp 7 | 417 | 4.096 | Cửa hàng [Lượng] (ô 405); luyện | 7 | 1.639 [Đo] |
| Đá cấp 8 | 418 | 16.384 | Cửa hàng [Lượng] (ô 406); luyện | 30 | 6.554 |
| Đá cấp 9 | 419 | 65.536 | Cửa hàng [Lượng] (ô 407); luyện | 120 | 26.215 |
| Đá cấp 10 | 420 | 262.144 | Cửa hàng [Lượng] (ô 408); luyện | 480 | 104.858 |
| Đá cấp 11 | 421 | 1.048.576 | Cửa hàng [Lượng] (ô 409); luyện | 1.900 | 419.431 |
| Đá cấp 12 | 422 | 4.194.304 | Chỉ luyện (4 Đá cấp 11) | không bán | 1.677.722 |

- **Nơi kiếm:** đồ rơi đo ở [13-drops-items](13-drops-items.md#tỉ-lệ-rơi) (M1, M2) và [map cấp 40](13-drops-items.md#hiển-thị-trên-máy-và-danh-sách-của-một-map-p3-m10) (M10). Cửa hàng Xu và Xu khóa không bán đá ([15-shops](15-shops.md#danh-sách-sản-phẩm)). [Đo]
- **Phí luyện** tính bằng Xu khóa, hoặc bằng Xu khi dùng Luyện đá [Xu] với đá chưa khoá. Phí chỉ theo cấp đá ra, = ⌈0,4 × giá trị⌉. Số không có nhãn [Đo] là dự đoán theo công thức đó ([Luyện đá](#luyện-đá)).
- **Mua hay luyện:** Đá cấp 7 giá 7 Lượng, rẻ hơn mua 4 Đá cấp 6 (8 Lượng) rồi luyện thêm 1.639 Xu khóa. Từ cấp 8 trở lên, giá Lượng gần đúng bằng 4 viên cấp dưới (30 so với 28, 120 so với 120, 480 so với 480, 1.900 so với 1.920), nên luyện chỉ tốn thêm phí. [Đo giá; Suy luận]
- **Khoá:** đá rơi từ quái và đá Tách đá trả về đều đã khoá. Đá mua bằng Lượng thì chưa khoá. Đá luyện ra chỉ không khoá khi mọi viên đặt vào chưa khoá và dùng Luyện đá [Xu] ([khoá](15-shops.md#khoá)). [Đo]
- **Mã 43, 45, 46** cũng tên Đá cấp 9, 11, 12, cùng mô tả, nhưng là loại 22 và chồng được 999. Chưa thấy ở túi, đồ rơi hay cửa hàng nào; chưa biết server có nhận để nâng cấp không. [Chưa rõ]
- **Không phải đá nâng cấp:** Gỗ, Da, Quặng, Linh Thạch Bậc 1–3 là nguyên liệu Chế tạo trang bị ([chế tạo](#chế-tạo)); Linh Thạch Bậc 4–6 ghi "bậc cao (chưa mở)". Kim Thạch, Huyết Thạch, Lông Vũ, Vuốt Quỷ, Băng Tâm dùng chế cánh và Băng Kiếm.

<a id="cửa-sổ"></a>

## Các cửa sổ của Pháp sư

Pháp sư là NPC 161 ở M1 (Làng Thanh Khê). Bot gửi từ chỗ nào trong M1 cũng được, không cần đứng gần. [Đo J2]

| Cửa sổ | Đường menu (mã dòng) | Gói mở | key | Số ô | Server trả khi đặt món |
|---|---|---|---|---:|---|
| Nâng cấp [thường] | 0 Nâng cấp → 0 | `s2c/96` | "" | 18 | `s2c/90`; trang bị thêm `s2c/1258` |
| Nâng cấp [cẩn thận] | 0 → 1 | `s2c/96` | "" | 18 | `s2c/90`; trang bị thêm `s2c/1258` |
| Chuyển hoá trang bị | 0 → 2 | `s2c/96` | "TRANSMUTE" | 18 | nguồn: `s2c/90`; đích: `s2c/1260` |
| Tách đá trang bị | 2 Tách đá | `s2c/96` | "" | 0 | `s2c/90` |
| Luyện đá [Xu khóa] | 1 Luyện đá → 0 | `s2c/99` | "abcd1002" | 24 | `s2c/92` |
| Luyện đá [Xu] | 1 → 1 | `s2c/99` | "abcd1003" | 24 | `s2c/92` |
| Chế tạo cánh | 3 Chế tạo → 0 | `s2c/99` | "abcd1006" | 3 | thiếu nguyên liệu: `s2c/0` |
| Chế tạo Băng Kiếm | 3 → 2 | `s2c/99` | "abcd1007" | 3 | thiếu nguyên liệu: `s2c/1256` "Cần 20 Băng Tâm, 30 Kim Thạch và 30 Huyết Thạch" |
| Chế tạo trang bị | 3 → 1 → 0 Nón, 1 Áo, 2 Vũ khí, 3 Nhẫn → 0 Bậc I, 1 Bậc II, 2 Bậc III | `s2c/57` (công thức) | | | chưa chọn bậc ([chế tạo](#chế-tạo)) |
| Đổi Băng Tâm lấy bình rỗng | 3 → 3 → 0 Đổi 1 bình, 1 Đổi 5 bình, 2 Đổi hết | `s2c/57` | | | thiếu: `s2c/1256` "Cần 8 Băng Tâm để đổi 1 Bình Huyết Linh (Rỗng)" |

Chọn một bậc ở Chế tạo trang bị chưa thử, vì có thể chế ngay và tốn nguyên liệu, Xu. [Đo menu J3]

Lời nhắc của từng cửa sổ (`s2c/96`, `s2c/99`) [Đo]:

- Nâng cấp: "Cần chọn trang bị và đá (có thể thêm bùa bảo vệ)".
- Chuyển hoá: "Nguồn: chưa có (trang bị đã cường hoá)\nĐích: chưa có (trang bị +0 cùng loại, bậc bằng hoặc cao hơn)\nVật phẩm: chưa có (sơ cấp tới +10, trung cấp tới +13, cao cấp tới +16)".
- Tách đá: "Cần chọn trang bị đã nâng cấp".
- Luyện đá: "Cần chọn đá số lượng 2 đến 24".
- Chế tạo cánh: "Cánh Tiên (Lông Vũ) hoặc Cánh Quỷ (Vuốt Quỷ): 50% thành công\nLông Vũ / Vuốt Quỷ: 0/1\nKim Thạch: 0/100\nHuyết Thạch: 1/100\nThất bại mất 1 mảnh + 50 Kim Thạch + 50 Huyết Thạch".
- Chế tạo Băng Kiếm: "Băng Kiếm: 100% thành công\nBăng Tâm: 1/20\nKim Thạch: 0/30\nHuyết Thạch: 1/30\nMỗi loại cần đủ số trong một ô, mặc Băng Kiếm vào thì khoá giao dịch". Số "1/20" là số symap đang có trong túi.

<a id="gói"></a>

## Gói

```text
C→S 13    "M1", 161                         nói chuyện với Pháp sư
S→C 57    0 Nâng cấp, 1 Luyện đá, 2 Tách đá, 3 Chế tạo
C→S 57    mãDòng, "M1", 161                 (lặp lại ở mỗi tầng menu)
S→C 96 | 99                                 cửa sổ mở, chưa có món
C→S 97    "", 0, 0, ôTúi, 1                 đặt một món (lặp lại cho từng món)
S→C 90 | 92 | 1260 | 1256                   trạng thái ô, hoặc lời từ chối
S→C 1258                                    (Nâng cấp) bản xem trước món ở cấp sau
C→S 91    ""                                Bắt đầu: tốn tiền, đá (cùng gói ở mọi cửa sổ)
S→C 91 | 93, 1258, 46                      kết quả, bản xem trước, tiền; KHÔNG có túi mới
```

Thứ tự gói server trả khi bấm Bắt đầu (J3, mỗi dòng đo 1–4 lần) [Đo]:

| Việc | Gói, theo thứ tự |
|---|---|
| Nâng cấp [thường], thành công hay thất bại | `s2c/91`, `s2c/1258`, `s2c/46` (Xu khóa) |
| Nâng cấp [cẩn thận] | `s2c/46` (Lượng), `s2c/91`, `s2c/1258`, `s2c/46` (Xu khóa) |
| Luyện đá | `s2c/93`, `s2c/46` |
| Tách đá, Chuyển hoá | chỉ `s2c/91` (không tốn tiền) |
| Không đủ điều kiện | chỉ `s2c/1256` ("Tỉ lệ trên 40% mới có thể thực hiện", "Rương đồ không đủ ô trống") |

**Túi không được gửi lại** sau Bắt đầu (khác với mua ở cửa hàng, có `s2c/1187`). Client tự bỏ các món đã đặt vào cửa sổ và thêm món trong `s2c/91`/`s2c/93`. Bot làm theo cách đó, hoặc gửi `c2s/42 (tênNhânVật)` để server trả cả túi `s2c/42` như lúc đăng nhập (J3 làm vậy sau mỗi lần). Món mới vào ô trống đầu tiên của túi. [Đo J3]

| Gói | Bố cục | Ghi chú |
|---|---|---|
| `s2c/96` | `string tênNhânVật; string key; string lời; string tên; i32 sốÔ` | Cửa sổ của Nâng cấp, Chuyển hoá, Tách đá [Đo] |
| `s2c/99` | `string key; string lời; string tên; i32 n` | Cửa sổ của Luyện đá, Chế tạo. n là số đá tối đa (24) hoặc số ô nguyên liệu (3) [Đo] |
| `c2s/97` | `string ""; u8 0; i32 0; i32 ôTúi; i32 sốLượng` | Đặt một món vào cửa sổ đang mở, ở cả `s2c/96` lẫn `s2c/99`. Không tốn gì. Hàm dựng `sqlq.a107`. Còn một hàm dựng `sqlq.a108(Object, byte, int, int)` cùng opcode chưa đọc được ([c2s-builders](../c2s-builders.md)) [Đo] |
| `s2c/90` | `string tên; u8 0; u8 loạiÔ; i32 ôTúi; i32 sốLượng; i32 0; i32 0; string chữ; u8 sẵnSàng` | loạiÔ 1 là ô trang bị, 0 là ô đá. `chữ` là lời nhắc, hoặc giá và tỉ lệ khi đủ món. sẵnSàng 1 thì nút Bắt đầu sáng [Đo] |
| `s2c/1258` | `u8 0; string uuid; i32 cấpHiệnTại; bản ghi vật phẩm` | Món **sau một lần nâng nữa**, để hiện ở ô kết quả ([chỉ số](#chỉ-số-sau-khi-nâng)) [Đo] |
| `s2c/92` | `string tên; u8 0; i32 ôTúi; i32 0; i32 0; string chữ; u8 sẵnSàng` | Trả `c2s/97` trong cửa sổ Luyện đá. Giống `s2c/90` nhưng không có byte loạiÔ và số lượng. Đọc hết 70 và 146–150 byte [Đo J2] |
| `s2c/1260` | `u8 0; i32 ôTúi; string chữ; u8 sẵnSàng` | Trả `c2s/97` khi món đặt vào là món +0, tức món đích của Chuyển hoá: "Đích: Nhẫn Trơn (bậc 0)". Đọc hết 181 byte [Đo J2] |
| `s2c/1256` | `u8 1; string chữ` | Lời từ chối hiện giữa màn hình ([dưới](#từ-chối)) [Đo] |
| `c2s/91` | `string ""` | Nút Bắt đầu, hàm dựng `sqlq.m109`. Cùng gói ở Nâng cấp, Cẩn thận, Luyện đá [Xu] và [Xu khóa], Tách đá, Chuyển hoá. Gửi `"abcd1002"` thay cho `""` khi cửa sổ đã xong thì server chỉ trả lời nhắc "Cần chọn đá số lượng 2 đến 24" [Đo J1, J3] |
| `s2c/91` | `string tên; u8 kếtQuả; bản ghi món; i32 n; n × bản ghi món nhận được`; Chuyển hoá thêm `bản ghi món đích` | kếtQuả 1 thành công, 0 thất bại. Nâng cấp: bản ghi là món sau lần nâng (thất bại thì như cũ), n = 0, dài 96 byte. Tách đá: món đã về +0, n = 2 bản ghi Đá cấp 1, dài 228 byte. Chuyển hoá: món nguồn đã về +0, n = 0, rồi bản ghi món đích đã lên cấp, dài 178 byte. Đọc hết byte [Đo J1, J3] |
| `s2c/93` | `string tên; u8 kếtQuả; i32 n; n × bản ghi vật phẩm` | Kết quả Luyện đá: viên đá mới (ô túi, mã, cờ khoá). 80 byte. 6 lần đều kếtQuả 1; gói khi luyện thất bại chưa thấy [Đo J3] |

**Không có gói bỏ món ra.** Đặt lại món đã có trong cửa sổ thì server trả "Vật phẩm này đã được chọn rồi". Đóng cửa sổ cũng không gửi gì. Muốn làm lại từ đầu thì chọn lại menu: mỗi `s2c/96`/`s2c/99` mới là một cửa sổ rỗng (J2 mở lại Nâng cấp 24 lần, lần nào đặt lại cùng món cũng được). [Đo]

Thứ tự không bắt buộc: đặt đá trước trang bị thì `s2c/90` báo ô đá với lời nhắc và sẵnSàng 0; giá và tỉ lệ hiện khi có cả hai. [Đo J2]

<a id="từ-chối"></a>

### Lời từ chối

| Lời (`s2c/1256` trừ dòng cuối) | Khi nào [Đo J2, J3] |
|---|---|
| "Vật phẩm này đã được chọn rồi" | Đặt lại món đã ở trong cửa sổ |
| "Vật phẩm không phù hợp" | Bùa bảo vệ ở lần nâng +1→+2 (đặt trước hay sau đá đều vậy); trang bị vào Luyện đá; đá vào Tách đá |
| "Cần chọn trang bị đã nâng cấp" | Món +0 vào Tách đá |
| "Trang bị đích phải cùng loại với trang bị nguồn" | Chuyển hoá: nguồn là giáp, đích là nhẫn |
| "Cần trang bị nguồn (đã cường hoá), trang bị đích (+0) và vật phẩm Chuyển hoá" | Chuyển hoá: đặt bùa vào lưới vật phẩm |
| "Tỉ lệ trên 40% mới có thể thực hiện" | Bấm Bắt đầu ở Luyện đá khi tỉ lệ 31% |
| "Rương đồ không đủ ô trống" | Bấm Bắt đầu ở Tách đá khi túi 54/54 ô |
| "Cần 20 Băng Tâm, 30 Kim Thạch và 30 Huyết Thạch" | Đặt Băng Tâm vào Chế Băng Kiếm khi thiếu |
| "Cần 8 Băng Tâm để đổi 1 Bình Huyết Linh (Rỗng)" | Chọn Đổi 1 bình khi có 1 Băng Tâm |
| `s2c/0` "Cần 1 Lông Vũ (Cánh Tiên) hoặc 1 Vuốt Quỷ (Cánh Quỷ), 100 Kim Thạch và 100 Huyết Thạch" | Chế tạo cánh: đặt Huyết Thạch khi thiếu nguyên liệu. Bot TS hiện coi mọi `s2c/0` là lỗi và ngắt phiên ([s2c/0](14-npc.md#s2c-0)) |

<a id="nâng-cấp"></a>

## Nâng cấp

<a id="giá-trị-đá"></a>

### Giá trị của đá

Luyện đá cho thấy: mỗi viên **Đá cấp k bằng 4^(k−1) viên Đá cấp 1** (Đá cấp 2 = 4, Đá cấp 3 = 16, Đá cấp 4 = 64, Đá cấp 5 = 256…), và server cộng giá trị mọi viên trong cửa sổ, kể cả đá khác cấp ([Luyện đá](#luyện-đá)). Đã kiểm với đá đặt vào từ cấp 1 tới cấp 5 và đá ra tới cấp 7; từ cấp 6 trở lên là suy ra. Các số đo ở Nâng cấp khớp với cùng thang giá trị đó. [Đo Luyện đá; Suy luận cho cấp 6–12 và cho Nâng cấp]

Gọi V là tổng giá trị đá đã đặt (tính bằng Đá cấp 1), R là giá trị cần cho lần nâng. Các số đo khớp với:

- **Thường:** tỉ lệ = min(trần, ⌊100 × V / R⌋).
- **Cẩn thận:** tỉ lệ = min(100, ⌊100 × V / R × 1,5⌋). Số thực bị làm tròn xuống, nên 25 thành 24 và 50 thành 49.
- R = 6 cho +0→+1 và 9 cho +1→+2. Trần của Thường là 80% (+0→+1) và 75% (+1→+2).

Vậy ở cấp thấp, chỉ một viên Đá cấp 3 trở lên đã chạm trần. R và trần ở các cấp cao hơn chưa đo vì symap chưa có món +2 trở lên trong túi. [Suy luận từ các lần đo ở bảng dưới]

<a id="bảng-đo-nâng-cấp"></a>

### Bảng đo

Mỗi dòng là một lần mở cửa sổ mới rồi đặt món. "Đá" là các viên đã đặt (mỗi viên một ô túi). [Đo J1 dòng đầu, J2 các dòng còn lại]

| Món (bậc) | Lần nâng | Chế độ | Đá | Xu khóa | Lượng | Tỉ lệ |
|---|---|---|---|---:|---:|---:|
| Giáp Đại Tướng (51) | +0→+1 | Thường | Đá 5 | 12 | 0 | 80% |
| Giáp Đại Tướng (51) | +1→+2 | Thường | Đá 1 | 33 | 0 | 11% |
| | | Thường | Đá 1 ×2 | 33 | 0 | 22% |
| | | Thường | Đá 3; Đá 4; Đá 5; Đá 6; Đá 9 (từng lần một viên) | 33 | 0 | 75% |
| | | Thường | Đá 5 ×3; Đá 4 + Đá 5; Đá 1 + Đá 3 | 33 | 0 | 75% |
| | | Cẩn thận | Đá 1 | 33 | 5 | 16% |
| | | Cẩn thận | Đá 1 ×2 | 33 | 5 | 33% |
| | | Cẩn thận | Đá 5 | 33 | 5 | 100% |
| Nhẫn Trơn (1) | +0→+1 | Thường | Đá 1 | 19 | 0 | 16% |
| | | Thường | Đá 1 ×2 | 19 | 0 | 33% |
| | | Thường | Đá 3; Đá 5; Đá 1 + Đá 4 | 19 | 0 | 80% |
| | | Cẩn thận | Đá 1 | 19 | 5 | 24% |
| | | Cẩn thận | Đá 1 ×2 | 19 | 5 | 49% |
| Nhẫn Quỷ (51) | +0→+1 | Thường | Đá 5 | 19 | 0 | 80% |
| | | Cẩn thận | Đá 5 | 19 | 5 | 100% |
| Anh Hùng Nhẫn (51) | +0→+1 | Thường | Đá 5 | 19 | 0 | 80% |

**Phí** không đổi theo số đá, cấp đá hay chế độ; chỉ đổi theo món và cấp hiện tại. Nhẫn +0 là 19 Xu khóa dù bậc 1 hay bậc 51. Giáp +0 là 12 (J1), giáp +1 là 33. Phí giáp +0 rẻ hơn nhẫn +0 vì loại món hay vì thời điểm đo khác nhau thì chưa rõ. [Đo; Chưa rõ: công thức phí]

**Server lấy hết đá đã đặt.** J3 đặt 2 Đá cấp 5 vào Cẩn thận dù 1 viên đã cho 100%: cả 2 viên mất. Vậy bot phải đặt từng viên, từ giá trị thấp lên, và dừng ngay khi tỉ lệ đạt mức cần hoặc chạm trần. [Đo J3]

**Thành công thì món bị khoá.** Nhẫn Trơn (mua bằng Xu, `field1` 1) lên +1 thì `field1` thành 0. Thất bại thì giữ nguyên 1. [Đo J3]

<a id="cẩn-thận"></a>

### Cẩn thận

Nâng cấp [Cẩn thận] mở cùng cửa sổ (`s2c/96`, chỉ khác tên "Nâng cấp [cẩn thận]"), cùng gói đặt món. Khác Thường hai chỗ: thêm **5 Lượng** (cả +0→+1 lẫn +1→+2), và tỉ lệ ×1,5 tới tối đa 100%. Với một viên Đá cấp 5, Cẩn thận cho 100% ở cả hai lần nâng đã đo. Lượng ở cấp cao hơn chưa đo. [Đo J2]

J3 bấm thật: Nhẫn Quỷ +0 với 2 Đá cấp 5 (100%) lên +1. Server trừ 5 Lượng trước (`s2c/46` đầu tiên, Lượng 16.673 → 16.668), rồi mới gửi kết quả và trừ 19 Xu khóa. [Đo J3]

<a id="thất-bại-và-bùa"></a>

### Thất bại và bùa bảo vệ

- [Cẩm nang] Thất bại mất đá, bùa và phí; cấp tụt về mốc gần nhất +4, +8, +12 hoặc +14; dưới +4 giữ nguyên. Ví dụ +6→+7 thất bại thì về +4.
- Bùa bảo vệ (mua bằng Lượng, [cửa hàng](15-shops.md#lượng)): sơ, trung, cao, siêu cấp cho lần nâng tới +8, +12, +14, +16; mô tả vật phẩm ghi: "Bảo vệ không rớt cấp khi nâng cấp trang bị từ cấp 1 đến cấp 8 / 12 / 14 / 16".
- J2: đặt Bùa bảo vệ sơ cấp và trung cấp ở lần nâng +1→+2 thì server trả "Vật phẩm không phù hợp", đặt trước hay sau đá đều vậy. Có lẽ server chỉ nhận bùa ở lần nâng có thể tụt cấp, tức khi món đang từ +5 trở lên. Bùa đặt bằng gói nào (có thể vẫn là `c2s/97`) và từ cấp nào thì nhận: chưa đo. [Đo lời từ chối; Suy luận]
- **J3 thất bại thật:** Nhẫn Trơn +0 với 1 Đá cấp 1 (16%). `s2c/91` kếtQuả 0 kèm bản ghi Nhẫn Trơn +0 như cũ, rồi `s2c/1258` (vẫn xem trước +1) và `s2c/46` (trừ 19 Xu khóa). Viên đá mất. Lần thứ hai cùng 16% thì thành công lên +1. [Đo J3]
- Tụt cấp khi thất bại từ +5 trở lên và bùa: chưa đo (chưa có món +5).

<a id="chỉ-số-sau-khi-nâng"></a>

### Chỉ số sau khi nâng

`s2c/1258` cho bản ghi của món ở cấp sau. Mã chỉ số: 1 cường lực, 2 nội lực, 5 sức tấn công, 6 phòng thủ, 8 chí mạng (`stats` trong [items.json](../../../data/items.json)). Tách đá hay Chuyển hoá đưa món về +0 thì chỉ số về đúng như lúc +0 (Giáp 19/11 → 16/9; Nhẫn Quỷ 20/28 → 17/26). Món đích của Chuyển hoá có đúng chỉ số +1 như khi nâng (Anh Hùng Nhẫn 15/23). [Đo J1, J2, J3]

| Món | +0 | +1 | +2 |
|---|---|---|---|
| Giáp Đại Tướng (bậc 51) | phòng thủ 16, cường lực 9 | 19, 11 | 23, 14 |
| Nhẫn Trơn (bậc 1) | sức tấn công 5, chí mạng 1 | 6, 2 | 8, 2 |
| Nhẫn Quỷ (bậc 51) | sức tấn công 17, nội lực 26 | 20, 28 | 24, 31 |
| Anh Hùng Nhẫn (bậc 51) | sức tấn công 12, nội lực 21 | 15, 23 | |

Mỗi cấp tăng cả chỉ số chính lẫn chỉ số phụ, khoảng +18–25% ở chỉ số chính. Công thức chưa tìm ra; bot chỉ cần đọc `s2c/1258`. [Đo; công thức Chưa rõ]

<a id="trên-máy"></a>

### Trên máy (J1)

Cửa sổ "Nâng cấp [thường]" có hai tab: **Nâng cấp** (ô trang bị → ô kết quả, 18 ô đá, bảng chữ bên phải, nút Bắt đầu) và **Hành trang** (túi đồ). Dưới cùng là Xu, Xu khóa, Lượng đang có. Đổi tab, xem chi tiết một món hay đóng cửa sổ đều không gửi gói nào. Chạm một món của Hành trang thì hiện chi tiết với nút **Chọn**; bấm Chọn thì món vào cửa sổ. [Đo J1]

Mở hộp thoại trên máy: chạm NPC để chọn (tên hiện ở góc trên trái), rồi chạm bong bóng trên đầu NPC (J1) hoặc nút hành động hình thanh kiếm (P5, [cách mua](12-skills-items.md#cách-mua)). Nên đứng trên cùng bục với Pháp sư: J2 đứng dưới bục thì chạm bong bóng không mở gì, nhân vật chỉ đi về phía NPC rồi dừng. Bot TS đặt nhân vật cạnh Pháp sư bằng `c2s/1169` (740, 512) trước khi mở game trên máy. [Đo J1, J2]

```text
C→S 13    "M1", 161                         chạm bong bóng trên đầu Pháp sư
S→C 57    4 dòng                            +27 ms
C→S 57    0, "M1", 161                      Nâng cấp
S→C 57    3 dòng                            +28 ms
C→S 57    0, "M1", 161                      Nâng cấp [Thường]
S→C 96    "symap", "", "Cần chọn trang bị và đá (có thể thêm bùa bảo vệ)", "Nâng cấp [thường]", 18
C→S 97    "", 0, 0, 45, 1                   Chọn Giáp Đại Tướng (ô túi 45)
S→C 90    "symap", 0, 1, 45, 1, 0, 0, "Cần chọn trang bị và đá (có thể thêm bùa bảo vệ)", 0      +29 ms
S→C 1258  0, uuid, 0, bản ghi món ở +1                                                         +35 ms
C→S 97    "", 0, 0, 15, 1                   Chọn Đá cấp 5 (ô túi 15)
S→C 90    "symap", 0, 0, 15, 1, 0, 0, "Cần: 12 Xu khóa (không đủ sẽ sử dụng cả Xu)\nCần: 0 Lượng\nTỉ lệ thành công: 80%", 1
C→S 91    ""                                Bắt đầu
S→C 91    "symap", 1, bản ghi món ở +1                                                         +30 ms
S→C 1258  0, uuid, 1, bản ghi món ở +2                                                         +34 ms
S→C 46    "update Xu", Xu 13.755.900, Xu khóa 7.952.514, Lượng 16.675                          +37 ms
```

Kết quả: Giáp Đại Tướng (đồ nữ, bậc 51) lên +1; mất 1 Đá cấp 5 và 12 Xu khóa (7.952.526 → 7.952.514); `field1` của giáp thành 0 (khoá giao dịch, đúng luật "khóa khi nâng cấp thành công"). [Đo J1, J2]

<a id="luyện-đá"></a>

## Luyện đá (hợp nhất đá)

Pháp sư → 1 Luyện đá → 0 [Xu khóa] hoặc 1 [Xu]. Cửa sổ `s2c/99` nhận 2 đến 24 viên. Mỗi lần đặt thêm một viên (`c2s/97`), server trả `s2c/92` với viên đá sẽ ra, phí và tỉ lệ. [Đo J2]

| Đá đặt | Cửa sổ | Ra | Phí | Tỉ lệ |
|---|---|---|---|---:|
| 1 viên bất kỳ | | "Cần chọn đá số lượng 2 đến 24", sẵnSàng 0 | | |
| 2 Đá 1 chưa khoá | Xu khóa | Đá cấp 2 Khóa | 2 Xu khóa | 50% |
| 2 Đá 1 chưa khoá | Xu | **Đá cấp 2** (không khoá) | **2 Xu** | 50% |
| 2, 3 Đá 4 | Xu khóa | Đá cấp 5 Khóa | 103 Xu khóa | 50%, 75% |
| 2, 3, 4 Đá 5 | Xu khóa | Đá cấp 6 Khóa | 410 Xu khóa | 50%, 75%, 100% |
| 2, 3, 4 Đá 5 đã khoá | Xu | Đá cấp 6 Khóa | 410 Xu khóa | 50%, 75%, 100% |
| 5, 6, 7, 8 Đá 5 | Xu khóa | Đá cấp 7 Khóa | 1.639 Xu khóa | 31%, 37%, 43%, 50% |
| Đá 4 + Đá 5 | Xu khóa | Đá cấp 6 Khóa | 410 Xu khóa | 31% |
| 1 Đá 5 chưa khoá + 1 Đá 5 đã khoá | Xu khóa | Đá cấp 6 Khóa | 410 Xu khóa | 50% |
| Một trang bị | Xu khóa | "Vật phẩm không phù hợp" | | |
| Đá 2 + Đá 3 chưa khoá | Xu | Đá cấp 4 | 26 Xu | 31% (bấm: bị từ chối) |

Quy luật khớp mọi dòng trên [Suy luận từ các lần đo ở bảng trên]:

- **Giá trị:** V = tổng 4^(k−1) của các viên (Đá cấp 1 = 1).
- **Đá ra:** cấp T nhỏ nhất có 4^(T−1) ≥ V. Ví dụ 4 Đá 5 = 1024 = đúng một Đá 6, nên ra Đá 6; 5 Đá 5 = 1280 thì vượt Đá 6, nên server nhắm Đá 7.
- **Tỉ lệ:** ⌊100 × V / 4^(T−1)⌋. Vì vậy luôn ra **một** viên; thêm đá chỉ làm tăng tỉ lệ cho tới khi đủ, rồi nhảy sang cấp sau với tỉ lệ thấp. Muốn chắc chắn thì đặt đúng 4 viên cùng cấp, hoặc 16 viên cho hai cấp.
- **Phí:** chỉ theo cấp đá ra, = ⌈0,4 × 4^(T−1)⌉. Đã đo T = 2, 4, 5, 6, 7 (T = 4 được 26 đúng như dự đoán). Dự đoán cho các cấp khác: Đá 3: 7; Đá 8: 6.554; Đá 9: 26.215; Đá 10: 104.858; Đá 11: 419.431; Đá 12: 1.677.722.
- **Khoá:** đá ra chỉ không khoá khi mọi viên đặt vào đều chưa khoá và chọn Luyện đá [Xu] (khi đó phí tính bằng Xu). Có một viên đã khoá, hoặc chọn [Xu khóa], thì ra đá khoá và phí tính bằng Xu khóa, kể cả trong cửa sổ [Xu].

- **Ngưỡng:** tỉ lệ phải **trên 40%** thì server mới cho bấm ("Tỉ lệ trên 40% mới có thể thực hiện"), dù `s2c/92` vẫn báo sẵnSàng 1 ở 31%. [Đo J3]

So với cửa hàng: Đá cấp 6 bán 2 Lượng ở Cửa hàng [Lượng]; luyện thì cần 4 Đá 5 và 410 Xu khóa ([cửa hàng](15-shops.md#lượng)).

**Bấm thật (J3)** [Đo]:

| Lần | Đá | Cửa sổ | Tỉ lệ báo | Kết quả | Tiền |
|---|---|---|---:|---|---|
| V1 | 4 Đá 5 khoá | Xu khóa | 100% | Đá cấp 6 khoá ở ô 20 | −410 Xu khóa |
| W1 | 4 Đá 5 khoá | Xu khóa | 100% | Đá cấp 6 khoá ở ô 24 | −410 Xu khóa |
| X4 | 2 Đá 1 chưa khoá | Xu | 50% | Đá cấp 2 **chưa khoá** ở ô 16 | −2 Xu |
| X5 | 2 Đá 4 khoá | Xu khóa | 50% | Đá cấp 5 khoá ở ô 17 | −103 Xu khóa |
| Y1 | Đá 2 + Đá 3 chưa khoá | Xu | 31% | Từ chối: "Tỉ lệ trên 40% mới có thể thực hiện" | 0 |
| Y2, Y3 | 2 Đá 5 khoá | Xu khóa | 50% | Đá cấp 6 khoá | −410 Xu khóa mỗi lần |

Mỗi lần thành công: mọi viên đặt vào đều mất, viên mới vào ô trống đầu tiên của túi (thường là ô của viên đầu tiên đã đặt). Bốn lần ở 50% đều thành công; nếu tỉ lệ đúng là 50% thì khả năng đó chỉ 6%, nên có thể tỉ lệ thật cao hơn số báo. Chưa thấy lần thất bại nào. [Đo; tỉ lệ thật Chưa rõ]

**Chưa đo:** gói và đá còn lại khi luyện thất bại; 24 viên một lần.

<a id="tách-đá"></a>

## Tách đá

Pháp sư → 2 Tách đá mở thẳng `s2c/96` "Tách đá trang bị", 0 ô đá. [Đo J2]

| Đặt | Server trả |
|---|---|
| Giáp Đại Tướng +1 | `s2c/90` loạiÔ 1, "Nhận được: 2 Đá cấp 1, ", sẵnSàng 1 |
| Nhẫn Trơn +0 | `s2c/1256` "Cần chọn trang bị đã nâng cấp" |
| Đá cấp 5 | `s2c/1256` "Vật phẩm không phù hợp" |

Dấu phẩy cuối của lời báo cho thấy danh sách có thể có nhiều loại đá. Giáp +1 được nâng bằng 1 Đá cấp 5 (256 Đá cấp 1), nhưng tách chỉ trả 2 Đá cấp 1, nên số đá trả theo cấp của món, không theo đá đã dùng. [Đo lời báo; Suy luận]

**Bấm thật (J3):** lần đầu túi đầy (54/54) thì Bắt đầu bị từ chối "Rương đồ không đủ ô trống", dù lúc đặt món `s2c/90` vẫn báo sẵnSàng 1. Có 5 ô trống thì được: `s2c/91` kếtQuả 1, bản ghi Giáp Đại Tướng **+0** (phòng thủ 16, cường lực 9), n = 2 bản ghi Đá cấp 1 **đã khoá** ở ô 26 và 30. Không có `s2c/46`: Tách đá không tốn tiền. Giáp vẫn khoá. [Đo J3]

<a id="chuyển-hoá"></a>

## Chuyển hoá trang bị

Pháp sư → 0 Nâng cấp → 2 Chuyển hoá trang bị: `s2c/96` key "TRANSMUTE", 18 ô. Cần ba thứ: món nguồn đã cường hoá, món đích +0 cùng loại, một vật phẩm Chuyển hoá (sơ cấp tới +10, trung cấp tới +13, cao cấp tới +16; mua 30, 150, 500 Lượng). [Đo; Cẩm nang]

| Đặt | Server trả [Đo J2] |
|---|---|
| Giáp Đại Tướng +1 | `s2c/90` "Nguồn: Giáp Đại Tướng +1 (bậc II)\nĐích: chưa có …\nVật phẩm: chưa có …", sẵnSàng 0 |
| Nhẫn Trơn +0 (cửa sổ mới) | `s2c/1260` "Nguồn: chưa có …\nĐích: Nhẫn Trơn (bậc 0)\nVật phẩm: chưa có …", sẵnSàng 0 |
| Nhẫn Quỷ +0 sau Giáp +1 | `s2c/1256` "Trang bị đích phải cùng loại với trang bị nguồn" |
| Bùa bảo vệ sau Giáp +1 | `s2c/1256` "Cần trang bị nguồn (đã cường hoá), trang bị đích (+0) và vật phẩm Chuyển hoá" |

Server tự xếp món vào ô nguồn hay ô đích theo cấp cường hoá (+0 là đích). Bậc được viết bằng số La Mã đếm từ 0: Nhẫn Trơn (cấp mặc 1) là bậc 0, Giáp Đại Tướng (cấp mặc 51) là bậc II. Menu Chế tạo trang bị ghi "Bậc I (Lv 21)", "Bậc II (Lv 51)", "Bậc III (Lv 101)". [Đo]

**Bấm thật (J3):** mua 1 Chuyển hoá trang bị sơ cấp (30 Lượng). Cửa sổ mới, đặt lần lượt [Đo J3]:

```text
C→S 97  Nhẫn Quỷ +1 (ô 42)       S→C 90    "Nguồn: Nhẫn Quỷ +1 (bậc II)\nĐích: chưa có …\nVật phẩm: chưa có …", 0
C→S 97  Anh Hùng Nhẫn +0 (ô 50)  S→C 1260  "Nguồn: Nhẫn Quỷ +1 (bậc II)\nĐích: Anh Hùng Nhẫn (bậc II)\nVật phẩm: chưa có …", 0
C→S 97  Chuyển hoá sơ cấp (ô 26) S→C 90    loạiÔ 0, "… Vật phẩm: Chuyển hoá trang bị sơ cấp (tối đa +10)\nSau khi chuyển: Anh Hùng Nhẫn +1 và bị khoá giao dịch, Nhẫn Quỷ về +0", 1
C→S 91  ""                       S→C 91    kếtQuả 1, Nhẫn Quỷ +0 (17, 26), n 0, Anh Hùng Nhẫn +1 (15, 23)
```

Không có `s2c/46`: không tốn Xu. Vật phẩm Chuyển hoá mất. [Đo J3]

[Cẩm nang] Luôn thành công, không tốn Xu; nguồn về +0, đích lên đúng cấp của nguồn; đích phải nâng được tới cấp đó (đồ bậc 51 tối đa +12); món đích bị khoá; món có hạn dùng không chuyển hoá được; mỗi lần dùng 1 vật phẩm Chuyển hoá.

<a id="chế-tạo"></a>

## Chế tạo

| Món | Nguyên liệu | Tỉ lệ | Ghi chú |
|---|---|---:|---|
| Cánh Tiên / Cánh Quỷ | 1 Lông Vũ hoặc 1 Vuốt Quỷ, 100 Kim Thạch, 100 Huyết Thạch | 50% | Thất bại mất 1 mảnh, 50 Kim Thạch, 50 Huyết Thạch. Không tốn Xu. Cánh nâng cấp tới +16 [Cẩm nang, Đo lời cửa sổ] |
| Băng Kiếm | 20 Băng Tâm, 30 Kim Thạch, 30 Huyết Thạch | 100% | Mặc vào thì khoá giao dịch. Mặc khi đánh Bạch Hổ để làm đầy Bình Huyết Linh [Đo lời cửa sổ; bảng vật phẩm] |
| Trang bị | Xem bảng dưới | | [Cẩm nang] "Đồ chế tạo: có cơ hội có thưởng hệ và thưởng bộ" |
| Bình Huyết Linh (Rỗng) | 8 Băng Tâm mỗi bình (Đổi 1 bình, 5 bình, hoặc hết) | | Pháp sư → 3 → 3. Thiếu thì "Cần 8 Băng Tâm để đổi 1 Bình Huyết Linh (Rỗng)" [Đo J3] |

Chế tạo trang bị: Pháp sư → 3 Chế tạo → 1 Chế tạo trang bị ("Cậu muốn chế tạo món gì?") → 0 Nón, 1 Áo, 2 Vũ khí, 3 Nhẫn. Mỗi loại trả `s2c/57` ghi công thức, với ba dòng 0 Bậc I (Lv 21), 1 Bậc II (Lv 51), 2 Bậc III (Lv 101) [Đo J3]:

| Món | Nguyên liệu (mỗi bậc 24 + 24 viên) | Bậc I | Bậc II | Bậc III |
|---|---|---:|---:|---:|
| Nón | Da, Linh Thạch | 2.400 Xu | 26.500 Xu | 90.000 Xu |
| Áo | Da, Gỗ | 2.400 Xu | 26.500 Xu | 90.000 Xu |
| Vũ khí | Quặng, Gỗ | 2.400 Xu | 26.500 Xu | 90.000 Xu |
| Nhẫn | Quặng, Linh Thạch | 2.400 Xu | 26.500 Xu | 90.000 Xu |

Bậc I dùng nguyên liệu Bậc 1, Bậc II dùng Bậc 2, Bậc III dùng Bậc 3; ví dụ Nón Bậc II cần Da Bậc 2 ×24, Linh Thạch Bậc 2 ×24 và 26.500 Xu. Cửa hàng không bán đồ Bậc III (cấp 101), nên chế tạo là cách có đồ bậc 101. Chọn bậc rồi server làm gì (mở cửa sổ hay chế ngay) chưa đo. [Đo menu; Chưa rõ: bước sau]

Băng Tâm bán ở Dược phẩm giá 500 Xu ([cửa hàng](15-shops.md#danh-sách-sản-phẩm)).

<a id="túi-đầy"></a>

## Túi đầy

Túi của symap có 54 ô (`sứcChứa` của `s2c/42`, `s2c/1187`). Lúc J3 bắt đầu, cả 54 ô đều có món [Đo J3]:

| Việc | Khi túi đầy |
|---|---|
| Mua ở cửa hàng (`c2s/1190`) | `s2c/1256` "Rương đã đầy. Vui lòng bỏ bớt đồ ra hoặc mua thêm ngăn chứa". Không trừ tiền |
| Tách đá: đặt món (`c2s/97`) | Vẫn được: `s2c/90` "Nhận được: 2 Đá cấp 1, ", sẵnSàng 1 |
| Tách đá: Bắt đầu (`c2s/91`) | `s2c/1256` "Rương đồ không đủ ô trống". Không mất gì |
| Luyện đá: Bắt đầu | Vẫn chạy, vì các viên đặt vào được bỏ ra trước (4 viên thành 1, túi trống thêm 3 ô) |

Nâng cấp và Chuyển hoá không thêm món nên chắc không cần ô trống (chưa thử khi túi đầy). Muốn thêm ô thì dùng Túi vải cấp 1, cấp 2 (mỗi túi +6 ô, 10 và 12 Lượng, [cửa hàng](15-shops.md#danh-sách-sản-phẩm)). [Suy luận]

<a id="j3"></a>

## Kết quả J3 (bấm thật)

Mọi lần do bot TS, mỗi lần mở cửa sổ mới, đặt món bằng `c2s/97`, bấm `c2s/91 ""`, rồi xin lại túi bằng `c2s/42` [Đo J3]:

| Lần | Việc | Tỉ lệ báo | Kết quả | Tiền | Túi thay đổi |
|---|---|---:|---|---|---|
| V1 | Luyện đá [Xu khóa], 4 Đá 5 khoá | 100% | thành công | −410 Xu khóa | 4 Đá 5 → 1 Đá 6 khoá |
| W1 | Luyện đá [Xu khóa], 4 Đá 5 khoá | 100% | thành công | −410 Xu khóa | 4 Đá 5 → 1 Đá 6 khoá |
| W2 | Mua Đá cấp 6 ở Cửa hàng [Lượng] | | thành công | −2 Lượng | +1 Đá 6 chưa khoá ([mua bằng Lượng](15-shops.md#lượng)) |
| W3 | Tách đá Giáp Đại Tướng +1 | | thành công | 0 | giáp +1 → +0; +2 Đá 1 khoá |
| X1 | Nâng cấp [thường] Nhẫn Trơn +0, 1 Đá 1 | 16% | **thất bại** | −19 Xu khóa | mất 1 Đá 1; nhẫn vẫn +0, chưa khoá |
| X2 | Nâng cấp [thường] Nhẫn Trơn +0, 1 Đá 1 | 16% | thành công | −19 Xu khóa | mất 1 Đá 1; nhẫn +1, bị khoá |
| X3 | Nâng cấp [cẩn thận] Nhẫn Quỷ +0, 2 Đá 5 | 100% | thành công | −5 Lượng, −19 Xu khóa | mất **cả 2** Đá 5; nhẫn +1 |
| X4 | Luyện đá [Xu], 2 Đá 1 chưa khoá | 50% | thành công | −2 Xu | 2 Đá 1 → 1 Đá 2 chưa khoá |
| X5 | Luyện đá [Xu khóa], 2 Đá 4 khoá | 50% | thành công | −103 Xu khóa | 2 Đá 4 → 1 Đá 5 khoá |
| X6 | Mua Chuyển hoá trang bị sơ cấp | | thành công | −30 Lượng | +1 Chuyển hoá sơ cấp |
| X7 | Chuyển hoá Nhẫn Quỷ +1 → Anh Hùng Nhẫn +0 | | thành công | 0 | Nhẫn Quỷ +0; Anh Hùng Nhẫn +1; mất vật phẩm Chuyển hoá |
| X8 | Đổi 50 Lượng lấy Xu khóa ([Đổi lượng](15-shops.md#đổi-lượng)) | | thành công | −50 Lượng, +55.000 Xu khóa | |
| Y1 | Luyện đá [Xu], Đá 2 + Đá 3 | 31% | từ chối (dưới 40%) | 0 | |
| Y2, Y3 | Luyện đá [Xu khóa], 2 Đá 5 khoá | 50% | thành công cả hai | −410 Xu khóa mỗi lần | 2 Đá 5 → 1 Đá 6 khoá |

Tiền trước và sau J3: Xu 13.755.600 → 13.755.598; Xu khóa 7.952.514 → 8.005.714 (tiêu 1.800, nhận 55.000); Lượng 16.675 → 16.588 (tiêu 87). Dữ liệu thô ở `captures/n2-2026-11-01/probe-5.jsonl` tới `probe-10.jsonl`.

<a id="tính-năng"></a>

## Làm tính năng nâng cấp

Những gì bot cần, theo các phần trên:

1. **Túi đồ:** `s2c/42` lúc đăng nhập; khi mua bằng Xu hay Xu khóa cũng là `s2c/42` (P5, J1), mua bằng Lượng là `s2c/1187` (J3). Sau Bắt đầu ở Pháp sư server không gửi túi; bot tự sửa túi theo `s2c/91`/`s2c/93` hoặc gửi `c2s/42 (tênNhânVật)` để nhận lại `s2c/42`. Đá là vật phẩm loại 10, mã 411–422 (Đá cấp 1–12), mỗi viên một ô (không chồng). Mã 43, 45, 46 cũng mang tên Đá cấp 9, 11, 12 nhưng là loại 22, chồng được 999; chưa thấy ở túi hay cửa hàng nào, chưa biết server có nhận để nâng cấp không. Cấp cường hoá là `field0`, cờ khoá là `field1` ([bản ghi vật phẩm](12-skills-items.md#cường-hoá)).
2. **Phải ở M1.** Mở cửa sổ: `c2s/13 ("M1", 161)`, rồi `c2s/57` theo đường menu ở [bảng cửa sổ](#cửa-sổ); chờ `s2c/96` hoặc `s2c/99`.
3. **Đặt trang bị:** `c2s/97` với ô túi. Đọc `s2c/1258` để biết chỉ số sau khi nâng.
4. **Đặt đá từng viên**, từ giá trị thấp lên. Sau mỗi viên đọc `s2c/90`: phí Xu khóa, Lượng, tỉ lệ. Dừng ngay khi tỉ lệ đạt mức người dùng muốn hoặc chạm trần, vì **server lấy hết đá đã đặt**.
5. **Bùa:** ở lần nâng có thể tụt cấp (món đang +5 trở lên, theo Cẩm nang), đặt bùa có mức đủ cao; ở cấp thấp server từ chối.
6. **Kiểm tiền:** Xu khóa (thiếu thì server lấy cả Xu), Lượng nếu Cẩn thận. Xin người dùng duyệt trước khi gửi `c2s/91`.
7. **Bắt đầu:** `c2s/91 ("")`. Đọc `s2c/91` (kếtQuả 1 hay 0, món sau đó), `s2c/1258`, `s2c/46` (tiền). Thành công thì món bị khoá. Lời từ chối đến bằng `s2c/1256` ([danh sách](#từ-chối)).
8. **Làm lại:** mở lại menu là có cửa sổ rỗng. Không có gói bỏ món.
9. **Luyện đá:** cùng cách, cửa sổ `s2c/99`, đọc `s2c/92`; Bắt đầu cũng là `c2s/91 ""`, kết quả `s2c/93`. Dùng [quy luật](#luyện-đá) để chọn số viên (4 viên cùng cấp là 100%; từ 40% trở xuống server không cho bấm). Muốn đá ra không khoá thì chỉ dùng đá chưa khoá và cửa sổ [Xu].
10. **Ô trống:** Tách đá cần đủ ô cho số đá nhận; mua cần 1 ô ([túi đầy](#túi-đầy)).
11. **Xử lý `s2c/0`:** bot TS hiện ngắt phiên khi gặp `s2c/0`, mà Chế tạo cánh trả lời thiếu nguyên liệu bằng gói này. Cần sửa trước khi làm Chế tạo.

## Chưa đo

Các phần sau đều tốn tiền hoặc đồ, cần người dùng đồng ý từng lần:

- Nâng cấp từ +2 trở lên: phí, Lượng của Cẩn thận, R và trần của tỉ lệ; tụt cấp khi thất bại từ +5.
- Bùa bảo vệ: cấp nào server nhận, gói đặt bùa, bùa có mất khi thành công không.
- Luyện đá thất bại: gói `s2c/93` kếtQuả 0 và đá còn lại; 24 viên một lần; tỉ lệ thật so với số báo.
- Chế tạo trang bị (chọn một bậc), Chế Băng Kiếm, Chế tạo cánh (thiếu nguyên liệu).
- Nâng cấp hay Chuyển hoá khi túi đầy.
