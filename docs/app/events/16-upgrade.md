# Pháp sư: nâng cấp, luyện đá, tách đá, chuyển hoá, chế tạo

Mốc: APK 1.0.3, server Thanh Khê, nhân vật symap (tài khoản tiheo1, cấp 79, hệ Hỏa). Nguồn:

- **J1** (01/11): điện thoại có Frida ghi gói. Nâng cấp [thường] Giáp Đại Tướng từ +0 lên +1 bằng 1 Đá cấp 5 (người dùng đồng ý; tốn 12 Xu khóa) ([luồng trên máy](#trên-máy)).
- **J2** (01/11): bot TS chạy 4 lượt. Mỗi lượt mở các cửa sổ của Pháp sư, đặt món và đá (`c2s/97`), rồi đọc giá và tỉ lệ server báo. **Không bấm Bắt đầu lần nào**, nên không tốn gì. Dữ liệu thô và script ở `captures/n2-2026-11-01/` (chỉ có trên máy, không vào git).
- **J3** (01/11, người dùng đồng ý tiêu): bot TS **bấm Bắt đầu thật** ở mọi cửa sổ: 7 lần Luyện đá (6 thành công, 1 bị từ chối), 3 lần Nâng cấp (1 thất bại), 2 lần Tách đá (lần đầu túi đầy), 1 Chuyển hoá; mua 2 món bằng Lượng, đổi 50 Lượng. Sau mỗi lần, bot xin lại cả túi (`c2s/42`) để so món nào mất, món nào thêm ([kết quả J3](#j3)). Tổng: tốn 2 Xu, 87 Lượng, 1.800 Xu khóa, nhận 55.000 Xu khóa.
- **O1** (01/11, nhân vật Ttuananh của tài khoản tiheo2, cấp 31; người dùng nhờ "thử hết" Pháp sư): bot TS (`captures/o1-2026-11-01/probe.ts`, chỉ chạy với tiheo2) và điện thoại có Frida. Chế tạo Nhẫn Bậc I, thử Bậc II và III, nâng một Nhẫn Thái Cực từ +0 lên +7 (có thất bại tụt cấp, có bùa), Đổi Băng Tâm lấy bình. Trên máy chỉ để bắt gói client gửi khi đặt nguyên liệu chế tạo và đặt bùa. Tốn 6.400 Xu, 71.507 Xu khóa, 139 Lượng ([kết quả O1](#o1)).
- **ST1** (21/11, nhân vật akaito của tài khoản tiheo2, cấp 57, máy chủ plays1; người dùng nhờ "check hết"): bot TS đặt **đá xếp chồng** vào Luyện đá và Nâng cấp theo nhiều cách mà không bấm, rồi bấm thật 1 lần Luyện đá (4 Đá cấp 2 của một chồng, 7 Xu khóa). App Rust (`cllt`) nâng 1 lần Nhẫn Chữ Thập +0→+1 (10 Xu khóa) và chạy Gộp đá ([đá xếp chồng](#đá-xếp-chồng-st1)).
- **Cẩm nang** của game (`cam-nang.json` chép từ máy ngày 01/11, trang Trang bị và Tiền tệ). Chữ trích nguyên văn có nhãn [Cẩm nang].

Nhãn: **[Đo]**, **[Suy luận]**, **[Chưa rõ]**, **[Cẩm nang]**.

## Tóm tắt

| Câu hỏi | Trả lời |
|---|---|
| Có hợp nhất đá không? | Có: **Luyện đá** ở Pháp sư. Đặt 2 đến 24 viên đá; server tính ra một viên cấp cao hơn, kèm tỉ lệ và phí. 4 viên cùng cấp k thành 1 viên cấp k+1 chắc chắn (100%), 2 viên 50%, 3 viên 75%. Tỉ lệ phải **trên 40%** mới được bấm. Bắt đầu là `c2s/91 ""`, kết quả là `s2c/93` ([Luyện đá](#luyện-đá)). [Đo J2, J3] |
| Đá cấp nào nâng được gì? | Không thấy giới hạn cấp đá theo cấp món: Đá cấp 1, 3, 4, 5, 6, 9 đều đặt được ở mọi lần nâng đã thử; cấp đá chỉ làm đổi tỉ lệ. Mỗi viên Đá cấp k có giá trị bằng 4^(k−1) viên Đá cấp 1 ([các loại đá](#các-loại-đá)). Đá cấp 2, 7, 8, 10–12 chưa đặt thử ở Nâng cấp. [Đo + Suy luận] |
| Tỉ lệ thành công tính sao? | Server báo sẵn trong `s2c/90` mỗi khi đặt thêm món: "Tỉ lệ thành công: 75%". Có trần theo cấp: +0→+1 là 80%, +1→+2 là 75%. Đặt thêm đá khi đã chạm trần không tăng nữa ([bảng đo](#bảng-đo-nâng-cấp)). [Đo] |
| Nâng đồ đang mặc được không? | Trong game thì phải cởi ra trước: cửa sổ Nâng cấp chỉ có tab Hành trang (túi đồ) để chọn món, và `c2s/97` gửi số ô túi (J1). Server có nhận đồ đang mặc qua một dạng khác của `c2s/97` hay không thì chưa đo. App tự cởi ra túi, nâng, rồi mặc lại ([đồ đang mặc](#đồ-đang-mặc)). [Đo J1; Chưa rõ: dạng khác của gói] |
| Thường khác Cẩn thận chỗ nào? | Cẩn thận tốn thêm **5 Lượng** và tỉ lệ ×1,5 (tối đa 100%): cùng một viên Đá cấp 5 cho 75% ở Thường, 100% ở Cẩn thận. Phí Xu khóa như nhau ([Cẩn thận](#cẩn-thận)). [Đo] |
| Thất bại mất gì? | Mất đá và phí. Đo ở +0: `s2c/91` kếtQuả 0, món giữ +0 và **không bị khoá**. Đo ở O1: Nhẫn Thái Cực **+7 → +4** khi thất bại không bùa, đúng [Cẩm nang]: cấp tụt về mốc gần nhất +4, +8, +12 hoặc +14; dưới +4 giữ nguyên ([thất bại](#thất-bại-và-bùa)). [Đo J3, O1] |
| Bùa bảo vệ? | Đặt bằng `c2s/97` với **i32 thứ ba = 1** (`"", 0, 1, ôTúi, 1`), như client gửi. Với 0 (cách J2 làm) server trả "Vật phẩm không phù hợp", nên lời từ chối ở J2 là do gói chứ chưa chắc do cấp. Thất bại có bùa thì **giữ cấp** (+7 vẫn +7); bùa **mất cả khi thành công** lẫn thất bại ([bùa](#thất-bại-và-bùa)). [Đo O1] |
| Trần cường hoá? | [Cẩm nang] bậc 1 tới +4, bậc 21 tới +8, bậc 51 tới +12, từ bậc 101 và cánh tới +16. |
| Tách đá trả gì? | Giáp Đại Tướng +1 → 2 Đá cấp 1 (đã khoá); giáp về +0, chỉ số về như cũ. Không tốn Xu. Cần đủ ô trống cho số đá nhận ([Tách đá](#tách-đá)). [Đo J3] |
| Chuyển hoá? | Chuyển cấp cường hoá từ món nguồn sang món +0 cùng loại; cần 1 vật phẩm Chuyển hoá (mua bằng Lượng). Đã làm 1 lần: Nhẫn Quỷ +1 → +0, Anh Hùng Nhẫn +0 → +1, không tốn Xu ([Chuyển hoá](#chuyển-hoá)). [Đo J3] |
| Gói gì? | Mở cửa sổ: `c2s/13` → `c2s/57` → `s2c/96` hoặc `s2c/99`. Đặt món: `c2s/97` ở **mọi** cửa sổ; trường i32 thứ ba là 0 với trang bị, đá, vật phẩm Chuyển hoá, và 1 với bùa và nguyên liệu Chế tạo (O1). Server trả `s2c/90` (Nâng cấp, Tách đá, nguồn Chuyển hoá), `s2c/1260` (đích Chuyển hoá), `s2c/92` (Luyện đá). Bắt đầu: `c2s/91 ""` ở mọi cửa sổ; kết quả `s2c/91` (Nâng cấp, Tách đá, Chuyển hoá) hay `s2c/93` (Luyện đá). Server **không gửi lại túi**: bot phải tự sửa túi hoặc xin lại bằng `c2s/42` ([gói](#gói)). [Đo J3] |
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

### Đá xếp chồng (ST1)

Từ bản cập nhật bảng vật phẩm ngày 16/11, Đá cấp 1–12 **xếp chồng tới 999 viên một ô** ([bảng 29](../artifact.md)), nên "mỗi viên một ô" ở các phần đo trước 16/11 không còn đúng. Túi của akaito ngày 21/11 có Đá cấp 2 ×37, cấp 3 ×82, cấp 4 ×58, cấp 5 ×38, cấp 6 ×2, mỗi loại một ô. Cách server nhận một chồng [Đo ST1]:

| Gửi `c2s/97` | Luyện đá [Xu khóa] (`s2c/92`) | Nâng cấp [thường] Nhẫn Chữ Thập +0 (`s2c/90`) |
|---|---|---|
| Loại 0, ô chồng Đá 2, **sốLượng 4** | Đá cấp 3 Khóa, 7 Xu khóa, **100%** (tính đủ 4 viên) | |
| Loại 0, sốLượng 8 | Đá cấp 4 Khóa, 26 Xu khóa, 50% (8 viên) | |
| Loại 0, sốLượng 3 | | 80% (trần; 1 viên chỉ 66%) |
| **Cùng ô, sốLượng 1, gửi nhiều lần** | lần 1 "Cần chọn đá số lượng 2 đến 24", rồi 50%, 75%, 100%: **cộng dồn** | 66% rồi 80%: **cộng dồn** |
| Loại 1, sốLượng 4 / 3 | "Cần chọn đá số lượng 2 đến 24" | "Vật phẩm không phù hợp" |

- Bấm thật 4 Đá cấp 2 gửi một gói sốLượng 4: chồng Đá 2 từ 37 còn 33, chồng Đá 3 từ 82 lên 83 (viên mới vào luôn chồng có sẵn, `s2c/93` báo ô 1 sốLượng 1), Xu khóa −7. Vậy server trừ đúng số viên đặt vào. [Đo ST1]
- Trường sốLượng của `s2c/90` vẫn là 1 cả khi gửi sốLượng 3. [Đo ST1; ý nghĩa Chưa rõ]
- **Với bot:** đặt đá từng viên như trước vẫn đúng, chỉ cần gửi **lại cùng ô** khi chồng còn viên (loại 0, sốLượng 1), hoặc gửi sốLượng N một lần khi đã biết đủ N viên (Luyện đá 4 viên). Code đếm theo ô sẽ coi cả chồng là 1 viên ([trong app](#trong-app)).

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

Chọn một bậc ở Chế tạo trang bị mở cửa sổ `s2c/99` "Chế tạo trang bị" (key "abcd1001", 2 ô), không chế ngay ([chế tạo](#chế-tạo)). [Đo menu J3, cửa sổ O1]

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
| `c2s/97` | `string ""; u8 0; i32 loại; i32 ôTúi; i32 sốLượng` | Đặt một món vào cửa sổ đang mở, ở cả `s2c/96` lẫn `s2c/99`. Không tốn gì. Hàm dựng `sqlq.a107`. **loại** 0: trang bị, đá, vật phẩm Chuyển hoá (J1–J3); 1: bùa bảo vệ, nguyên liệu Chế tạo, với sốLượng là **cả chồng** (client gửi 86 khi có 86 Quặng; O1). Gửi sai loại thì bùa bị "Vật phẩm không phù hợp", nguyên liệu bị lời nhắc `s2c/0` "Cần chọn đủ 2 loại nguyên liệu và Xu…". Hàm dựng thứ hai `sqlq.a108(Object, byte, int, int)` cùng opcode chưa đọc được ([c2s-builders](../c2s-builders.md)) [Đo] |
| `s2c/90` | `string tên; u8 0; u8 loạiÔ; i32 ôTúi; i32 sốLượng; i32 0; i32 0; string chữ; u8 sẵnSàng` | loạiÔ 1 là ô trang bị, 0 là ô đá. `chữ` là lời nhắc, hoặc giá và tỉ lệ khi đủ món. sẵnSàng 1 thì nút Bắt đầu sáng [Đo] |
| `s2c/1258` | `u8 0; string uuid; i32 cấpHiệnTại; bản ghi vật phẩm` | Món **sau một lần nâng nữa**, để hiện ở ô kết quả ([chỉ số](#chỉ-số-sau-khi-nâng)) [Đo] |
| `s2c/92` | `string tên; u8 0; i32 ôTúi; i32 0; i32 phíXu; string chữ; u8 sẵnSàng` | Trả `c2s/97` trong cửa sổ Luyện đá và Chế tạo trang bị. Giống `s2c/90` nhưng không có byte loạiÔ và số lượng. Chế tạo: khi đủ nguyên liệu thì `phíXu` là 2.400 (Bậc I) và sẵnSàng 1. Đọc hết 70, 105 và 146–150 byte [Đo J2, O1] |
| `s2c/1260` | `u8 0; i32 ôTúi; string chữ; u8 sẵnSàng` | Trả `c2s/97` khi món đặt vào là món +0, tức món đích của Chuyển hoá: "Đích: Nhẫn Trơn (bậc 0)". Đọc hết 181 byte [Đo J2] |
| `s2c/1256` | `u8 1; string chữ` | Lời từ chối hiện giữa màn hình ([dưới](#từ-chối)) [Đo] |
| `c2s/91` | `string ""` | Nút Bắt đầu, hàm dựng `sqlq.m109`. Cùng gói ở Nâng cấp, Cẩn thận, Luyện đá [Xu] và [Xu khóa], Tách đá, Chuyển hoá. Gửi `"abcd1002"` thay cho `""` khi cửa sổ đã xong thì server chỉ trả lời nhắc "Cần chọn đá số lượng 2 đến 24" [Đo J1, J3] |
| `s2c/91` | `string tên; u8 kếtQuả; bản ghi món; i32 n; n × bản ghi món nhận được`; Chuyển hoá thêm `bản ghi món đích` | kếtQuả 1 thành công, 0 thất bại. Nâng cấp: bản ghi là món sau lần nâng (thất bại thì như cũ), n = 0, dài 96 byte. Tách đá: món đã về +0, n = 2 bản ghi Đá cấp 1, dài 228 byte. Chuyển hoá: món nguồn đã về +0, n = 0, rồi bản ghi món đích đã lên cấp, dài 178 byte. Có bùa thì n = 1: bản ghi **chồng bùa còn lại** (Bùa ×2 sau lần thành công, ×1 sau lần thất bại), dài 165 byte. Đọc hết byte [Đo J1, J3, O1] |
| `s2c/93` | `string tên; u8 kếtQuả; i32 n; n × bản ghi vật phẩm` | Kết quả Luyện đá: viên đá mới (ô túi, mã, cờ khoá). 80 byte. 6 lần đều kếtQuả 1; gói khi luyện thất bại chưa thấy. Chế tạo trang bị cũng trả `s2c/93`, với n bản ghi là **nguyên liệu còn lại** (Quặng Bậc 1 86 → 62, Linh Thạch Bậc 1 43 → 19); món mới đến riêng bằng `s2c/1187` loại 4 [Đo J3, O1] |

**Bỏ món ra:** bot chưa biết gói nào làm việc này. Nhưng cửa sổ Luyện đá của game **có nút Bỏ ra** (LD1, 23/11, xem [Luyện đá](#luyện-đá)), nên có một gói chưa bắt được. Đặt lại món đã có trong cửa sổ thì server trả "Vật phẩm này đã được chọn rồi". Đóng cửa sổ cũng không gửi gì. Muốn làm lại từ đầu thì chọn lại menu: mỗi `s2c/96`/`s2c/99` mới là một cửa sổ rỗng (J2 mở lại Nâng cấp 24 lần, lần nào đặt lại cùng món cũng được). [Đo]

Thứ tự không bắt buộc: đặt đá trước trang bị thì `s2c/90` báo ô đá với lời nhắc và sẵnSàng 0; giá và tỉ lệ hiện khi có cả hai. [Đo J2]

<a id="từ-chối"></a>

### Lời từ chối

| Lời (`s2c/1256` trừ dòng cuối) | Khi nào [Đo J2, J3] |
|---|---|
| "Vật phẩm này đã được chọn rồi" | Đặt lại món đã ở trong cửa sổ |
| "Vật phẩm không phù hợp" | Bùa bảo vệ gửi với loại 0 trong `c2s/97` (J2 ở +1→+2, O1 ở +5; với loại 1 thì O1 đặt được ở +5 tới +7); trang bị vào Luyện đá; đá vào Tách đá |
| "Cần đạt cấp 51 mới chế tạo được Áo Bậc II", "Cần đạt cấp 101 mới chế tạo được Vũ khí Bậc III" | Bấm Bắt đầu ở Chế tạo trang bị khi nhân vật thấp cấp hơn bậc (O1, cấp 31). Đặt nguyên liệu vẫn được; không mất gì |
| `s2c/0` (cờ 255) "Cần chọn đủ 2 loại nguyên liệu và Xu\n…công thức…" | Chế tạo: đặt nguyên liệu bằng `c2s/97` loại 0 (sai loại), và bấm Bắt đầu khi chưa đặt gì. Đặt đúng loại 1 thì server trả `s2c/92` (O1) |
| "Cần chọn trang bị đã nâng cấp" | Món +0 vào Tách đá |
| "Trang bị đích phải cùng loại với trang bị nguồn" | Chuyển hoá: nguồn là giáp, đích là nhẫn |
| "Cần trang bị nguồn (đã cường hoá), trang bị đích (+0) và vật phẩm Chuyển hoá" | Chuyển hoá: đặt bùa vào lưới vật phẩm |
| "Tỉ lệ trên 40% mới có thể thực hiện" | Bấm Bắt đầu ở Luyện đá khi tỉ lệ 31% |
| "Rương đồ không đủ ô trống" | Bấm Bắt đầu ở Tách đá khi túi 54/54 ô |
| "Cần 20 Băng Tâm, 30 Kim Thạch và 30 Huyết Thạch" | Đặt Băng Tâm vào Chế Băng Kiếm khi thiếu |
| "Cần 8 Băng Tâm để đổi 1 Bình Huyết Linh (Rỗng)" | Chọn Đổi 1 bình khi có 1 Băng Tâm |
| `s2c/0` "Cần 1 Lông Vũ (Cánh Tiên) hoặc 1 Vuốt Quỷ (Cánh Quỷ), 100 Kim Thạch và 100 Huyết Thạch" | Chế tạo cánh: đặt Huyết Thạch khi thiếu nguyên liệu. Đã vào game thì client TS ghi `server_message` rồi chạy tiếp ([s2c/0](14-npc.md#s2c-0)) |

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
| | +1→+2 | Thường | Đá 2 + Đá 3 (Hỏi giá của app, 01/11) | 49 | 0 | 75% |
| Nhẫn Quỷ (51) | +0→+1 | Thường | Đá 5 | 19 | 0 | 80% |
| | | Cẩn thận | Đá 5 | 19 | 5 | 100% |
| Anh Hùng Nhẫn (51) | +0→+1 | Thường | Đá 5 | 19 | 0 | 80% |

**Phí** không đổi theo số đá, cấp đá hay chế độ; chỉ đổi theo món và cấp hiện tại. Nhẫn +0 là 19 Xu khóa dù bậc 1 hay bậc 51, nhẫn +1 là 49 (Hỏi giá của app, 01/11). Giáp +0 là 12 (J1), giáp +1 là 33. Phí giáp +0 rẻ hơn nhẫn +0 vì loại món hay vì thời điểm đo khác nhau thì chưa rõ. [Đo; Chưa rõ: công thức phí]

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
- J2: đặt Bùa bảo vệ sơ cấp và trung cấp ở lần nâng +1→+2 thì server trả "Vật phẩm không phù hợp", đặt trước hay sau đá đều vậy. **O1 cho thấy đó là do gói:** J2 gửi `c2s/97` loại 0. Client gửi bùa với loại 1 (`"", 0, 1, ôTúi, 1`, bắt trên máy); bot gửi loại 0 ở +5 cũng bị "Vật phẩm không phù hợp", loại 1 thì `s2c/90` nhận bùa và Lượng của Cẩn thận vẫn tính như thường. Ở +1→+2 với loại 1 chưa thử. [Đo O1]
- **J3 thất bại thật:** Nhẫn Trơn +0 với 1 Đá cấp 1 (16%). `s2c/91` kếtQuả 0 kèm bản ghi Nhẫn Trơn +0 như cũ, rồi `s2c/1258` (vẫn xem trước +1) và `s2c/46` (trừ 19 Xu khóa). Viên đá mất. Lần thứ hai cùng 16% thì thành công lên +1. [Đo J3]
- **O1, thất bại không bùa:** Nhẫn Thái Cực +7→+8, Thường, 1 Đá cấp 5 (5%): `s2c/91` kếtQuả 0 với bản ghi nhẫn **+4** (chỉ số về đúng mức +4: sức tấn công 57 → 32), mất đá. [Đo O1]
- **O1, có bùa:** +5→+6 và +6→+7 Cẩn thận có Bùa sơ cấp đều thành công, bùa bị trừ mỗi lần (4 → 3 → 2). +7→+8 Thường có bùa, 1 Đá cấp 6 (20%): thất bại, nhẫn **vẫn +7**, mất bùa và đá. `s2c/91` có thêm bản ghi chồng bùa còn lại ([gói](#gói)). [Đo O1]

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

<a id="đồ-đang-mặc"></a>

### Đồ đang mặc

- **Trong game:** cửa sổ "Nâng cấp [thường]" chỉ có hai tab, Nâng cấp và **Hành trang** (túi đồ). Món được chọn từ Hành trang bằng nút **Chọn**. Không có tab hay nút nào cho đồ đang mặc, nên người chơi phải cởi món ra túi trước ([trên máy](#trên-máy)). [Đo J1]
- **Gói:** `c2s/97` mang số **ô túi** (`"", 0, 0, ôTúi, 1`); mọi lần đặt món ở J1, J2, J3 đều từ túi. Byte thứ hai (luôn 0) có thể là nơi lấy món. Client còn hàm dựng thứ hai cùng opcode, `sqlq.a108(Object, byte, int, int)`, chưa đọc được ([c2s-builders](../c2s-builders.md)). Gửi `c2s/97` với byte đó khác 0 và số ô trang bị thì server làm gì: chưa đo. O1 gửi thử ở cửa sổ Nâng cấp [thường] hai dạng với byte 1 và ô trang bị 3 (Nhẫn Trơn đang đeo): `"", 1, 0, 3, 1` (dạng `a107`) và `"", 1, 3, 1` (4 trường): server **không trả gì** cả hai lần. Vậy server không cho đặt đồ đang mặc, ít nhất với các dạng này. [Đo J1–J3, O1]
- **App:** việc Nâng cấp một món đang mặc (`SmithTask::Upgrade { worn: true }`, ô là ô trang bị) làm như người chơi:
  1. Cởi món ra túi bằng `c2s/1186 (1, ô trang bị)`, như nút Cởi ra; server trả `s2c/37`, `s2c/42`, `s2c/1186` ([mặc và cởi](12-skills-items.md#c2s-1186)).
  2. Tìm món trong túi theo uuid của bản ghi rồi nâng như món trong túi.
  3. Khi việc kết thúc (xong, hết đá, thiếu tiền, Pháp sư từ chối, im lặng 8 s, hay bấm Dừng), mặc lại bằng `c2s/1186 (0, ô túi)`.

  Món đã khoá từ lần mặc đầu, nên mặc lại không làm mất gì thêm. Bot từ chối trước khi cởi khi túi đầy (cởi ra cần 1 ô trống), khi món đã tới cấp cần nâng, hay khi túi không có đá. Mất kết nối giữa chừng thì món nằm lại trong túi. [Đo các gói Cởi, Mặc ở P4; luồng ghép trong app đã có test, chưa chạy thật]

  Bot không coi gói nào là "câu trả lời" của Cởi ra hay Mặc, mà xem ô trang bị (`s2c/37`) và túi (`s2c/42`) mới nhất. Cởi xong là khi món có trong túi và rời ô trang bị. Mặc xong là khi món về đúng ô trang bị cũ. Gói túi của lần bấm trước (trả cho `c2s/42`) hay một câu báo `s2c/1256` đến giữa chừng không làm việc kết thúc; câu báo chỉ được giữ làm lý do nếu 8 giây sau món vẫn chưa đổi chỗ ("không cởi được Nhẫn Trơn: …", "…; chưa mặc lại được Nhẫn Trơn: …").

  **Chưa đo:** mặc lại một món vừa được đặt vào cửa sổ của Pháp sư mà chưa bấm Bắt đầu (Hỏi giá, Dừng giữa chừng, Pháp sư từ chối). Đóng cửa sổ không gửi gói nào (J1), nên với server cửa sổ có thể vẫn giữ món. Nếu server không cho mặc lúc đó, việc dừng sau 8 giây với "chưa mặc lại được …" và món nằm ở túi để mặc tay. Lần đo K1 sẽ thử đúng trường hợp này.

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

**Chưa đo:** gói và đá còn lại khi luyện thất bại; 24 viên một lần; gói của nút Bỏ ra.

**Cửa sổ trên máy (LD1, 23/11, một nhân vật cấp 99 người dùng cho mượn, game 1.1.1, không có Frida, không bấm Kết hợp)** [Đo]:

- Tiêu đề "Luyện đá [Xu khóa]" (hay [Xu]), hai tab **Kết hợp** và **Hành trang**. Tab Kết hợp: lưới **24 ô** (6 × 4), mỗi viên một ô với số 1; bên phải là chữ server báo; dưới cùng là Xu, Xu khóa, Lượng và nút **Kết hợp** (mờ khi chưa đủ 2 viên). Lúc chưa đặt gì, chữ là "Cần chọn đá số lượng 2 đến 24".
- Tab Hành trang: cả túi (12 cột), món khoá có ổ khoá nhỏ ở góc trên trái, số lượng ở góc dưới phải. Chạm một viên đá mở hộp: ảnh, "Đá cấp 5", "Yêu cầu cấp: 1", "Nguyên liệu nâng cấp vật phẩm", hai nút **Chọn** (1 viên) và **Chọn nhiều**: hộp "Đặt Đá cấp 5 vào lưới" với − số + và **Đặt** / Hủy. Chồng đã lấy bớt thì số giảm (21 → 10) và ô có góc viền vàng.
- 11 Đá cấp 5 khoá: "Luyện thành Đá cấp 7 Khóa / Cần: 1.639 Xu khóa (không đủ sẽ sử dụng cả Xu) / Tỉ lệ thành công: 68%", đúng quy luật trên (2.816 ÷ 4.096).
- Chạm một viên trong lưới mở hộp cùng kiểu với nút **Bỏ ra**. Bỏ ra một viên thì còn 10 ô và chữ đổi thành 62% (2.560 ÷ 4.096). Vậy server nhận được việc rút đá ra; gói đó chưa bắt (cần Frida).

**Trộn nhiều cấp, có Frida (LD2, 23/11, cùng nhân vật, game 1.1.1, không bấm Kết hợp)** [Đo]:

| Client gửi `c2s/97` | Server trả |
|---|---|
| `"", 0, 0, ô 19, 5` (Chọn nhiều 5 Đá cấp 5) | **5 gói `s2c/92` giống hệt nhau**, cùng chữ "Luyện thành Đá cấp 7 Khóa … 31%" (1.280 ÷ 4.096) |
| `"", 0, 0, ô 20, 1` (Chọn 1 Đá cấp 8) | 1 `s2c/92` "Đá cấp 9 Khóa / Cần: 26.215 Xu khóa / 26%" (17.664 ÷ 65.536) |
| `"", 1, 1, 5, 1` (Bỏ ra viên Đá cấp 8) | 1 `s2c/92` về lại 31% |
| `"", 0, 0, ô 24, 1` (Chọn 1 Đá cấp 6) | 1 `s2c/92` 56% (2.304 ÷ 4.096) |

- Trộn nhiều cấp đá là được: server cộng giá trị mọi chồng đã đặt.
- **Đặt N viên một lần thì server trả N gói `s2c/92`**, gói nào cũng mang tỉ lệ sau khi đã đặt đủ N viên. Bot 2.2.11 coi mỗi `s2c/92` là lời đáp cho lần đặt gần nhất. Nó gửi chồng thứ hai ngay khi nhận gói đầu, rồi nhận các gói còn lại của chồng thứ nhất và tưởng đã đặt xong, nên thấy tỉ lệ chỉ của chồng thứ nhất. Trên app: "Pháp sư báo khác kế hoạch … 31%" với 1–2 Đá cấp 6 + 5 Đá cấp 5 (một nick của người dùng, 23/11), và không bấm. Đã sửa sau 2.2.11: đặt N viên loại 0 thì bot đợi đủ N gói rồi mới đặt món tiếp hay xét tỉ lệ; loại 1 (cả chồng) vẫn 1 gói như O1 (`luyen_tu_chon_of_two_stacks_waits_for_every_answer_of_the_first` trong `app/core/tests/npc.rs`).
- Bỏ ra cũng là `c2s/97`, với byte thứ hai = 1 rồi `1, 5, 1`. Số 5 khớp vị trí đếm từ 0 của viên Đá cấp 8 trong lưới (viên thứ 6), chứ không khớp ô túi của nó (20). Hai số 1 chưa rõ. [Đo; Suy luận: số 5]

**Trong app (23/11):** tab Gộp đá có chip **Luyện tự chọn**: chọn đá mỗi cấp, app tính tỉ lệ theo quy luật trên (`fuseQuote` trong `src/protocol/npc.ts`, `npc::fuse_quote`), chặn từ 40% trở xuống, bot so cấp đá và tỉ lệ `s2c/92` báo trước khi bấm. Lần thất bại đầu tiên sẽ ghi số đá mỗi cấp đã mất vào nhật ký. Bấm thật lần đầu 23/11 (một nick của người dùng, 2.2.11): 2 Đá cấp 6 khoá → Đá cấp 7 ở 50%, **thành công**, tốn 1.639 Xu khóa. Chưa thấy lần thất bại nào.

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
| Bình Huyết Linh (Rỗng) | 8 Băng Tâm mỗi bình (Đổi 1 bình, 5 bình, hoặc hết) | | Pháp sư → 3 → 3. Thiếu thì "Cần 8 Băng Tâm để đổi 1 Bình Huyết Linh (Rỗng)" [Đo J3]. Đổi được (O1, có 8 Băng Tâm mua ở Dược phẩm, ô cửa hàng 487): menu ghi "Đổi 8 Băng Tâm lấy 1 Bình Huyết Linh (Rỗng). Bạn đang có 8 Băng Tâm."; `c2s/57 (0, "M1", 161)` → `s2c/1187` (cả túi: Bình Huyết Linh (Rỗng) ô 0, đã khoá) và `s2c/1256` "Đã đổi 8 Băng Tâm lấy 1 Bình Huyết Linh (Rỗng)". Không tốn Xu [Đo O1] |

Chế tạo trang bị: Pháp sư → 3 Chế tạo → 1 Chế tạo trang bị ("Cậu muốn chế tạo món gì?") → 0 Nón, 1 Áo, 2 Vũ khí, 3 Nhẫn. Mỗi loại trả `s2c/57` ghi công thức, với ba dòng 0 Bậc I (Lv 21), 1 Bậc II (Lv 51), 2 Bậc III (Lv 101) [Đo J3]:

| Món | Nguyên liệu (mỗi bậc 24 + 24 viên) | Bậc I | Bậc II | Bậc III |
|---|---|---:|---:|---:|
| Nón | Da, Linh Thạch | 2.400 Xu | 26.500 Xu | 90.000 Xu |
| Áo | Da, Gỗ | 2.400 Xu | 26.500 Xu | 90.000 Xu |
| Vũ khí | Quặng, Gỗ | 2.400 Xu | 26.500 Xu | 90.000 Xu |
| Nhẫn | Quặng, Linh Thạch | 2.400 Xu | 26.500 Xu | 90.000 Xu |

Bậc I dùng nguyên liệu Bậc 1, Bậc II dùng Bậc 2, Bậc III dùng Bậc 3; ví dụ Nón Bậc II cần Da Bậc 2 ×24, Linh Thạch Bậc 2 ×24 và 26.500 Xu. Cửa hàng không bán đồ Bậc III (cấp 101), nên chế tạo là cách có đồ bậc 101. [Đo menu J3]

**Chế thật (O1, Ttuananh cấp 31).** Chọn bậc mở cửa sổ, chưa chế:

```text
C→S 57    0, "M1", 161                  Bậc I (sau 3 Chế tạo → 1 Chế tạo trang bị → 3 Nhẫn)
S→C 99    "abcd1001", "Nhẫn Bậc I\nQuặng Bậc 1: 86/24\nLinh Thạch Bậc 1: 43/24\nXu: 2.400", "Chế tạo trang bị", 2
C→S 97    "", 0, 1, 33, 86              chọn Quặng Bậc 1 ở tab Hành trang (cả chồng 86)
S→C 92    "Ttuananh", 0, 33, 0, 0, "Nhẫn Bậc I\n…", 0
C→S 97    "", 0, 1, 37, 43              chọn Linh Thạch Bậc 1 (cả chồng 43)
S→C 92    "Ttuananh", 0, 37, 0, 2400, "Nhẫn Bậc I\n…", 1        sẵn sàng, phí 2.400 Xu
C→S 91    ""                            nút Kết hợp
S→C 93    "Ttuananh", 1, 2 bản ghi: Quặng Bậc 1 ×62 (ô 33), Linh Thạch Bậc 1 ×19 (ô 37)
S→C 46    Xu 15.103.600 → 15.101.200
S→C 1187  04, bản ghi món mới: ô 19 Nhẫn Thái Cực (#333), +12 sức tấn công, +20 thể lực, hệ Lôi, chưa khoá
S→C 1256  1, "Bạn vừa nhận được Nhẫn Thái Cực"
```

- Cửa sổ có hai tab Kết hợp và Hành trang, 2 ô nguyên liệu và nút **Kết hợp**. Chọn món ở Hành trang hiện chi tiết với nút Chọn, như cửa sổ Nâng cấp.
- Server lấy đúng 24 mỗi loại dù client gửi cả chồng.
- `s2c/1187` byte đầu 4 là **thêm một món** (một bản ghi vật phẩm, 83 byte), khác byte đầu 1 là cả túi.
- Byte đầu 2 là **số còn lại của một ô** (`u8 ô; i32 số`, 6 byte), sau Dùng Trứng Gà (`c2s/84`): Log lỗi của app 0.9.0 (02/11, manina3) giữ gói `02 20 00000002`, tức ô 32 từ 3 còn 2 quả. App Rust trước đó không đọc được loại này 9 lần từ 31/10 tới 01/11 ("Invalid field length 4 at 5"), túi trên app không đổi nên lần bấm sau server báo "Vật phẩm không đủ số lượng". Giờ app đọc được và trừ đúng ô ([12-skills-items](12-skills-items.md#túi-đồ)). Cùng lúc server gửi `s2c/46` (phí), `s2c/1256` "Bạn vừa nhận được 1 Huyết Thạch", `s2c/51` (món ra từ trứng vào ô trống) và `s2c/1256` "Đập Trứng Gà thành công, trừ 500 Xu khóa". [Đo 1 lần]
- Món chế ra có hệ ngẫu nhiên và phẩm chất: chi tiết trên máy ghi "Phẩm chất: Quý", "Đúng hệ nhân vật: +5% chỉ số trang bị", "Bộ cùng hệ (4/4)" (Cẩm nang: "Đồ chế tạo: có cơ hội có thưởng hệ và thưởng bộ"). Nhẫn Thái Cực bậc 21 nên nâng được tới +8.
- **Cấp nhân vật:** Bậc II và Bậc III cũng mở cửa sổ và nhận nguyên liệu, nhưng Bắt đầu thì "Cần đạt cấp 51 mới chế tạo được Áo Bậc II", "Cần đạt cấp 101 mới chế tạo được Vũ khí Bậc III" (`s2c/1256`), không mất gì.
- Bot đặt nguyên liệu bằng loại 0 thì chỉ nhận lời nhắc `s2c/0` "Cần chọn đủ 2 loại nguyên liệu và Xu…", vì vậy bot TS phải chịu được `s2c/0` khi đang ở trong game. O1 dùng một bản chép của client cho việc này; từ sau O1 client TS không ngắt phiên vì `s2c/0` khi đã vào game nữa ([s2c/0](14-npc.md#s2c-0)). [Đo O1]

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

<a id="o1"></a>

## Kết quả O1 (Tiheo2, bấm thật)

Nhẫn Thái Cực (#333, bậc 21, chế ở O1) nâng bằng bot, mỗi lần mở cửa sổ mới. Cột "Một viên" là tỉ lệ `s2c/90` báo ở Thường với đúng một viên đá (đo, không bấm). Người dùng chỉ cần gói, nên bảng chỉ ghi số đã thấy, không tìm công thức. [Đo O1]

| Lần nâng | Phí Xu khóa | Lượng (Cẩn thận) | Một viên (Thường) | Trần Thường / Cẩn thận | Bấm | Kết quả |
|---|---:|---:|---|---|---|---|
| +0→+1 | 19 | 5 | Đá 2: 66% | | Cẩn thận 100% | thành công |
| +1→+2 | 49 | 5 | Đá 3: 75% | 75% / 100% | Cẩn thận 100% | thành công |
| +2→+3 | 121 | 5 | Đá 3: 32% | | Cẩn thận 100% | thành công |
| +3→+4 | 280 | 5 | Đá 5: 65% | 65% / 97% | Cẩn thận 97% | thành công |
| +4→+5 | 769 | 5 | Đá 5: 60% | 60% / 90% | Cẩn thận 90% (hai lần) | thành công |
| +5→+6 | 2.910 | 10 | Đá 5: 50% | 55% / 82% | Thường 50%; Cẩn thận 82% + bùa | thành công cả hai |
| +6→+7 | 9.440 | 15 | Đá 5: 25% | 50% / 75% | Thường 25%; Cẩn thận 75% + bùa | thành công cả hai |
| +7→+8 | 22.400 | | Đá 5: 5%; Đá 6: 20% | | Thường 5%; Thường 20% + bùa | **thất bại**: +7 → +4; có bùa: giữ +7 |

- Thêm đá khi đã chạm trần thì tỉ lệ không tăng, và server vẫn lấy hết đá đã đặt (giống J3). Trần Cẩn thận bằng trần Thường × 1,5 (làm tròn xuống).
- Lượng của Cẩn thận tăng từ +5 (10, 15); phí Xu khóa tính cả khi thất bại.
- Gói thứ tự như J3: Cẩn thận có `s2c/46` (Lượng) trước `s2c/91`, `s2c/1258`, `s2c/46` (Xu khóa).
- Mua ở Cửa hàng [Lượng] để có đá và bùa: đá (không chồng được) phải mua **từng viên**; gửi `c2s/1190` với số lượng 10 thì "Số lượng không chính xác!" ([cửa hàng](15-shops.md#lượng)).

Tiền của Tiheo2 trước và sau O1: Xu 15.103.600 → 15.097.200 (chế Nhẫn 2.400, 8 Băng Tâm 4.000); Xu khóa 16.030.279 → 15.958.772; Lượng 29.900 → 29.761 (4 bùa 40, 12 viên đá 44, Cẩn thận 55). Dữ liệu thô ở `captures/o1-2026-11-01/` (`probe-*.jsonl` của bot, `phone-craft-charm.jsonl` của máy), không vào git.

<a id="trong-app"></a>

## Trong app

Modal **Tiện ích** của app Rust (trước gọi là Cửa hàng) làm được mọi việc ở trên, theo đúng các bước đã đo ([features](../../integration/rust/features.md#tiện-ích)): Mua ở 14 cửa hàng (cả Lượng), Gộp đá (chỉ bộ 4 viên, 100%; gộp hết tới một cấp, hay từng bộ một bằng nút Gộp của mỗi dòng), Nâng cấp tới trần của món (Thường hay Cẩn thận, đá rẻ nhất trước, mở lại cửa sổ khi một viên không làm tỉ lệ tăng, hết đá mà chưa đủ tỉ lệ thì không bấm; đồ đang mặc thì cởi ra, nâng, rồi mặc lại; **Bùa bảo vệ** `c2s/97` loại 1 ở mỗi lần nâng mà thất bại sẽ tụt cấp, không bùa thì dừng ở lần tụt đầu tiên), Hỏi giá (miễn phí), Tách đá, Chuyển hoá, **Chế tạo trang bị** (bảng 4 loại × 3 bậc hiện ngay theo công thức đã đo, với nguyên liệu đang có, cái còn thiếu và món đang mặc; bot đọc lại menu trước khi chế, nguyên liệu loại 1 với cả chồng), **Đổi Băng Tâm**, Đổi lượng. CLI: `cllt smith` (thêm `--charm=never`). **Tự gộp đá khi túi đầy** (Cài đặt đánh) dùng chính Gộp đá này giữa các trận của Tự đánh quái: túi đầy thì sang M1, gộp đá khoá chỉ bằng Xu khóa rồi quay về ([features](../../integration/rust/features.md#tự-gộp-đá-khi-túi-đầy)). Bùa, Chế tạo và Đổi Băng Tâm mới chạy trong test phát lại gói O1, chưa chạy thật trong app.

**Giày và Dây chuyền (21/11):** game 1.1.0 có thêm Giày (it1 loại 8) và Dây chuyền (loại 9), mặc ở ô trang bị 8 và 9. App và bot TS cho nâng cả hai (`npc::upgradable`: loại 0–4, 8, 9), trần theo bậc như Nón, Áo. Pháp sư nhận chúng hay không, trần và phí ra sao: **chưa đo**; server từ chối thì việc dừng với lời của Pháp sư.

**Tự chọn đá (21/11):** tab Nâng cấp mặc định giống cửa sổ của game: người chơi đặt từng viên vào 18 ô, app hỏi giá với đúng các viên đó (không bấm) và hiện tỉ lệ sau từng viên, rồi Bắt đầu nâng 1 cấp với đúng các viên đó (`SmithTask::Upgrade { stones }`, [features](../../integration/rust/features.md#tiện-ích)). Gói gửi như bot vẫn gửi (`c2s/97` loại 0 từng viên, gửi lại cùng ô cho chồng). Chưa chạy thật.

**Đá xếp chồng (ST1 21/11):** trước bản sửa ngày 21/11, `npc::upgrade_stones`, `npc::merge_plan` (Rust) và `upgradeStones`, `mergePlan` (TS) coi mỗi ô là một viên. Đo với túi của akaito: Gộp đá báo "không có 4 viên đá cùng cấp nào để gộp" dù có 32 Đá cấp 2 trong một ô; Nâng cấp +0→+1 dùng Đá 2 + **Đá 3** thay vì 2 Đá 2; Tự gộp đá không bao giờ đi. Bản sửa ([đá xếp chồng](#đá-xếp-chồng-st1)):

- Gộp đá đếm từng viên; bộ 4 viên của một chồng đi vào bằng một `c2s/97` số lượng 4. Túi đầy mà viên luyện ra không có chỗ thì dừng trước.
- Nâng cấp gửi lại cùng ô cho mỗi viên thêm; 18 ô đầy đá rẻ chưa đủ tỉ lệ thì mở lại cửa sổ bỏ cấp thấp nhất.
- Dự báo số ô trống tính theo chồng; Tự gộp đá chỉ đi khi lần gộp làm trống ít nhất một ô.
- Bảng đá của app, `cllt` và `npm run smith` đếm từng viên.
- Chưa chạy thật trong app sau bản sửa (chỉ test phát lại và các lần đo ST1).

Bot TS `npm run smith` ([Pháp sư bằng Node.js](../../integration/nodejs/smith.md)) làm cùng các việc như app: Hỏi giá, Nâng cấp có bùa, Gộp đá, Tách đá, Chuyển hoá, Chế tạo trang bị, Đổi Băng Tâm. Khác ở chỗ bản TS mặc định dừng ở thất bại đầu tiên (`--tries` để bấm tiếp), còn app có bùa thì thử lại cấp đó. Không có `--confirm` thì bot dừng trước Bắt đầu. Đã có test phát lại gói O1; chưa chạy với server thật.

<a id="todo"></a>

## Còn để sau (TODO)

- **Chạy thật trong app:** Bùa bảo vệ với nâng trên +4, Chế tạo trang bị và Đổi Băng Tâm đã port sang app từ gói O1 ([features](../../integration/rust/features.md#tiện-ích)); chưa bấm thật lần nào bằng app.
- **Chế tạo cánh, Chế Băng Kiếm:** chưa đo.

<a id="tính-năng"></a>

## Làm tính năng nâng cấp

Những gì bot cần, theo các phần trên:

1. **Túi đồ:** `s2c/42` lúc đăng nhập; khi mua bằng Xu hay Xu khóa cũng là `s2c/42` (P5, J1), mua bằng Lượng là `s2c/1187` (J3). Sau Bắt đầu ở Pháp sư server không gửi túi; bot tự sửa túi theo `s2c/91`/`s2c/93` hoặc gửi `c2s/42 (tênNhânVật)` để nhận lại `s2c/42`. Đá là vật phẩm loại 10, mã 411–422 (Đá cấp 1–12), mỗi viên một ô (không chồng). Mã 43, 45, 46 cũng mang tên Đá cấp 9, 11, 12 nhưng là loại 22, chồng được 999; chưa thấy ở túi hay cửa hàng nào, chưa biết server có nhận để nâng cấp không. Cấp cường hoá là `field0`, cờ khoá là `field1` ([bản ghi vật phẩm](12-skills-items.md#cường-hoá)).
2. **Phải ở M1.** Mở cửa sổ: `c2s/13 ("M1", 161)`, rồi `c2s/57` theo đường menu ở [bảng cửa sổ](#cửa-sổ); chờ `s2c/96` hoặc `s2c/99`.
3. **Đặt trang bị:** `c2s/97` với ô túi. Đọc `s2c/1258` để biết chỉ số sau khi nâng.
4. **Đặt đá từng viên**, từ giá trị thấp lên. Sau mỗi viên đọc `s2c/90`: phí Xu khóa, Lượng, tỉ lệ. Dừng ngay khi tỉ lệ đạt mức người dùng muốn hoặc chạm trần, vì **server lấy hết đá đã đặt**.
5. **Bùa:** ở lần nâng có thể tụt cấp (món đang +5 trở lên, theo Cẩm nang), đặt bùa bằng `c2s/97` **loại 1** (loại 0 thì server trả "Vật phẩm không phù hợp", O1). Bùa mất cả khi thành công. Lần nâng dưới +5 server có nhận bùa loại 1 không thì chưa đo.
6. **Kiểm tiền:** Xu khóa (thiếu thì server lấy cả Xu), Lượng nếu Cẩn thận. Xin người dùng duyệt trước khi gửi `c2s/91`.
7. **Bắt đầu:** `c2s/91 ("")`. Đọc `s2c/91` (kếtQuả 1 hay 0, món sau đó), `s2c/1258`, `s2c/46` (tiền). Thành công thì món bị khoá. Lời từ chối đến bằng `s2c/1256` ([danh sách](#từ-chối)).
8. **Làm lại:** mở lại menu là có cửa sổ rỗng. Không có gói bỏ món.
9. **Luyện đá:** cùng cách, cửa sổ `s2c/99`, đọc `s2c/92`; Bắt đầu cũng là `c2s/91 ""`, kết quả `s2c/93`. Dùng [quy luật](#luyện-đá) để chọn số viên (4 viên cùng cấp là 100%; từ 40% trở xuống server không cho bấm). Muốn đá ra không khoá thì chỉ dùng đá chưa khoá và cửa sổ [Xu].
10. **Ô trống:** Tách đá cần đủ ô cho số đá nhận; mua cần 1 ô ([túi đầy](#túi-đầy)).
11. **Xử lý `s2c/0`:** Chế tạo trả lời thiếu nguyên liệu (hay đặt sai loại) bằng `s2c/0`. Client TS đã sửa: khi đã vào game, `s2c/0` được ghi thành `server_message` và giao cho phiên; `npm run smith` coi nó là lời từ chối của bước đang chờ.

## Chưa đo

Các phần sau đều tốn tiền hoặc đồ, cần người dùng đồng ý từng lần:

- Luyện đá thất bại: gói `s2c/93` kếtQuả 0 và đá còn lại; 24 viên một lần.
- Bùa ở lần nâng dưới +5 với loại 1; bùa trung, cao, siêu cấp; nâng trên +8 (cần món bậc 51 trở lên, tức nhân vật cấp 51 mới chế được).
- Chế Băng Kiếm và Chế tạo cánh: cần Kim Thạch, Huyết Thạch, Lông Vũ hoặc Vuốt Quỷ, không có ở cửa hàng nào.
- Nâng cấp hay Chuyển hoá khi túi đầy.
