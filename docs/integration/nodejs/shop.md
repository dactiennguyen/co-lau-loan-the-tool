# Cửa hàng NPC và Hương Lão bằng Node.js

Hai lệnh dùng các gói đã đo ở J1, J2, J3, P5 và G1:

| Lệnh | Làm gì |
|---|---|
| `npm run buy` | Xem và mua ở 14 cửa hàng của Lái Buôn và Bà Tư Hạnh ([15-shops](../../app/events/15-shops.md)) |
| `npm run elder` | Hương Lão: xem Điểm năng động, Đổi lượng ([Hương Lão](../../app/events/14-npc.md#hương-lão)) |

Mã quà tặng và nhiệm vụ ngày của Hương Lão là `npm run gift` và `npm run daily` ([mail.md](mail.md)). Pháp sư là `npm run smith` ([smith.md](smith.md)), Ngọc Nga là `npm run market` ([market.md](market.md)).

Code nằm ở các file sau:

- gói và đường menu: [src/protocol/shops.ts](../../../src/protocol/shops.ts), `shopList` trong [world.ts](../../../src/protocol/world.ts);
- luồng: [src/bot/shop.ts](../../../src/bot/shop.ts), [src/bot/elder.ts](../../../src/bot/elder.ts);
- CLI: [src/cli/buy-run.ts](../../../src/cli/buy-run.ts), [src/cli/elder-run.ts](../../../src/cli/elder-run.ts);
- test: [test/shop.test.ts](../../../test/shop.test.ts), phát lại bảng `s2c/1190` của J1 và menu Đổi lượng của J2.

Chung cho cả hai lệnh:

- Nhân vật phải ở **M1** (Làng Thanh Khê). Ở map khác server trả "Không thể thực hiện" (B1), nên bot dừng trước khi gửi gì.
- Bot đi menu như game: `c2s/13` tới NPC, rồi `c2s/57` từng dòng, và kiểm **nhãn** của từng dòng trước khi chọn. Nhãn khác thì dừng.
- **Không có `--confirm` thì không làm gì thay đổi tài khoản.** `npm run buy` vẫn nhận `--buy` như bản cũ.
- `--account=<tên>` lấy tài khoản trong `app/accounts.json`. **Tắt game trên điện thoại trước** nếu máy đang đăng nhập cùng nick.

## Cửa hàng

```bash
npm run buy -- --account=tiheo2 --shop=nhan-xu                              # bảng hàng của Nhẫn [Xu]
npm run buy -- --account=tiheo2 --shop=nhan-xu --item=306                   # chạy thử: 1 Nhẫn Trơn, 300 Xu
npm run buy -- --account=tiheo2 --shop=luong --item=35 --qty=2 --confirm    # 2 Bùa bảo vệ sơ cấp bằng Lượng
npm run buy -- --account=tiheo2 --shop=duoc --item=0 --pay=xu --confirm     # Hoàn Linh Dược trả bằng Xu
```

| `--shop` | NPC → menu | Tiền |
|---|---|---|
| `vukhi-xu`, `vukhi-khoa` | Lái Buôn → Vũ khí → Vũ khí [Xu] / [Xu khóa] | Xu / Xu khóa |
| `duoc` (mặc định) | Lái Buôn → Dược phẩm | Xu và Xu khóa (hai dòng cho mỗi món) |
| `luong` | Lái Buôn → Cửa hàng [Lượng] | Lượng |
| `non-nam-xu`, `non-nu-xu`, `non-nam-khoa`, `non-nu-khoa` | Bà Tư Hạnh → Nón → … | Xu / Xu khóa |
| `giap-nam-xu`, `giap-nu-xu`, `giap-nam-khoa`, `giap-nu-khoa` | Bà Tư Hạnh → Giáp → … | Xu / Xu khóa |
| `nhan-xu`, `nhan-khoa` | Bà Tư Hạnh → Nhẫn → … | Xu / Xu khóa |

| Tham số | Ý nghĩa |
|---|---|
| `--item=N` | Mã vật phẩm (`itemId` trong dòng `line`). Không có `--item` thì chỉ in bảng hàng |
| `--qty=N` | Số lượng, mặc định 1 |
| `--pay=xu\|khoa\|luong` | Chọn dòng khi cửa hàng bán một món bằng hai loại tiền. Dược phẩm mặc định Xu khóa |

Với mỗi lần mua, bot làm như sau:

1. **Mở cửa hàng** và kiểm byte đầu của `s2c/1190` đúng mã cửa hàng. In mỗi dòng hàng (`line`): ô cửa hàng, món, cấp, giá, loại tiền, có khoá không, khoảng chỉ số.
2. **Kiểm tra:**
   - đủ tiền đúng loại (giá × số lượng);
   - đủ ô trống: món không chồng được cần một ô mỗi cái; món chồng được thì lấp chồng cùng loại khoá đã có trong túi trước (B1: búa cộng vào ô có búa).
   - Mua bằng **Xu khóa** thì món bị khoá giao dịch, không đăng bán ở Chợ trời được: bot ghi cảnh báo trong `plan`.
3. **Mua** (chỉ khi có `--confirm`): `c2s/1190 (0, ôCửaHàng, sốLượng)`, mỗi lần tối đa một chồng. Món không chồng được (đá, trang bị) thì mỗi cái một lần: server trả "Số lượng không chính xác!" cho nhiều hơn (J3).
4. **Đọc kết quả:** thành công là `s2c/1256` "Bạn vừa mua thành công! …" kèm túi và tiền (với Lượng, `s2c/46` đến cả trước lẫn sau lời báo). Lời báo khác (túi đầy, thiếu tiền) thì bot dừng.

## Hương Lão

```bash
npm run elder -- --account=tiheo2                          # Điểm năng động tuần này và hạn mức đổi
npm run elder -- --account=tiheo2 --rules                  # thêm Cách tính điểm
npm run elder -- --account=tiheo2 --exchange=khoa          # chạy thử Đổi lượng
npm run elder -- --account=tiheo2 --exchange=xu --times=2 --confirm   # đổi 2 lần: 100 Lượng → 100.000 Xu
```

### Điểm năng động

Bot mở dòng 3 Điểm năng động và đọc lời của menu: điểm tuần này (vd. 54/100), cấp và hạn mức đổi (7.000 Xu, cần 7.700 Xu khóa), số suất còn trong tuần. `--rules` chọn thêm Cách tính điểm, server trả bằng `s2c/0` ([s2c/0](../../app/events/14-npc.md#s2c-0)).

- **Đổi Xu** khi đủ 100 điểm chưa đo, nên bot không làm (`--swap-points` bị từ chối).
- Bot **không bao giờ gửi dòng Đóng**: server không trả lời dòng đó, và client trên máy kẹt ở "Vui lòng chờ..." (G1).

### Đổi lượng

| `--exchange` | Dòng | Mỗi lần |
|---|---|---|
| `xu` | 0 "50 lượng nhận 50.000 Xu" | −50 Lượng, +50.000 Xu |
| `khoa` | 1 "50 lượng nhận 55.000 Xu khóa" | −50 Lượng, +55.000 Xu khóa |

1. Mở dòng 1 Đổi lượng, kiểm nhãn của dòng sẽ chọn, kiểm đủ Lượng cho `--times` lần (tối đa 20).
2. Mỗi lần (chỉ khi có `--confirm`): mở lại menu, rồi `c2s/57` dòng đó. **Chọn là đổi ngay, không hỏi lại.** Server trả `s2c/46` hai lần (Lượng giảm, rồi tiền tăng) và "Bạn vừa nhận được …". Lời khác thì bot dừng.
3. **Dù xong hay dừng giữa chừng**, bot nói chuyện lại với Hương Lão để menu cuối là menu gốc. Server nhớ menu cuối; nếu menu Đổi lượng còn là menu cuối thì một `c2s/57` dòng 0 bất kỳ, kể cả của client trên máy lúc chuyển phiên, sẽ đổi thêm một lần (sự cố G1, [Hương Lão](../../app/events/14-npc.md#hương-lão)).

Thiếu Lượng thì server trả gì, và mỗi ngày đổi được mấy lần: chưa đo.

## TODO

- Đổi Xu ở Điểm năng động khi đủ 100 điểm (tốn Xu khóa).
- Đổi lượng: giới hạn mỗi ngày, lời của server khi thiếu Lượng.
- Mua bằng Xu khóa khi thiếu Xu khóa: server có lấy thêm Xu không (Pháp sư thì có).
- Bot `npm run buy` và `npm run elder` mới thử với gói ghi lại; chưa chạy với server thật kể từ khi viết lại (bản `npm run buy` cũ đã mua thật ở B1, J3).

## Log

Mỗi dòng là một JSON. Ngoài các dòng chung (`character`, `menu`, `notice`, `stop`, dòng `summary` `buy_run_result` / `elder_run_result`):

| `event` | Lệnh | Nội dung |
|---|---|---|
| `shop` | buy | Mã và tên cửa hàng, số dòng hàng, tiền, số ô trống |
| `line` | buy | Một dòng hàng: ô cửa hàng, món, cấp, giá, loại tiền, khoá, khoảng chỉ số |
| `plan` | buy, elder | Việc sẽ làm: giá, số lượng, số ô cần, tiền đang có; hay số lần đổi, Lượng cần |
| `bought` | buy | Một lần `c2s/1190` thành công: lời của server, số còn lại, số món trong túi |
| `points` | elder | Điểm năng động, cần, cấp, Xu và Xu khóa của hạn mức, suất còn |
| `rules` | elder | Cách tính điểm |
| `dry_run` | buy, elder | Dừng vì không có `--confirm` |
| `result` | buy, elder | Tiền trước và sau |
