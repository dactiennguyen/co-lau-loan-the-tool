# Chợ trời bằng Node.js

`npm run market` làm việc với Chợ trời của Ngọc Nga bằng các gói đã đo ở CT1 và NP1 (01/11, manina2, Tiheo2) ([Ngọc Nga](../../app/events/14-npc.md#ngọc-nga)):

- xem các mục, xem một trang;
- quét mọi trang để tìm món rẻ nhất;
- xem món mình đang bán;
- Mua, Đăng bán, Gia hạn, Thu hồi.

Bot mở chợ như nút **Chợ trời** trên thanh công cụ của game: gửi thẳng `c2s/116` rồi `c2s/1192`, không qua Ngọc Nga. Vì vậy bot chạy được ở mọi map sau khi vào game: CT1 chạy thật từ M1, NP1 mua được khi Tiheo2 đứng ở M2.

Code nằm ở các file sau:

- gói: [src/protocol/market.ts](../../../src/protocol/market.ts);
- luồng: [src/bot/market.ts](../../../src/bot/market.ts);
- CLI: [src/cli/market-run.ts](../../../src/cli/market-run.ts);
- test: [test/market.test.ts](../../../test/market.test.ts), phát lại gói CT1 (tên người bán được thay bằng "Người bán 1, 2…") và NP1 ([test/fixtures-np1.ts](../../../test/fixtures-np1.ts)).

Chung cho mọi lệnh:

- **Không có `--confirm` thì không làm gì thay đổi tài khoản.** Bot chỉ đọc các trang và báo việc sẽ làm.
- `--account=<tên>` lấy tài khoản trong `app/accounts.json` và không in mật khẩu. Không có `--account` thì dùng `.env`.
- **Tắt game trên điện thoại trước** nếu máy đang đăng nhập cùng nick. Bot đăng nhập sẽ đá phiên đang chơi ra.

## Xem chợ

```bash
npm run market -- --account=manina2                                   # các mục và số món mỗi mục
npm run market -- --account=manina2 --tab=6 --page=4                  # một trang
npm run market -- --account=manina2 --scan --name=slime --top=5       # mọi trang, rẻ nhất trước
npm run market -- --account=manina2 --scan --tab=5 --max-price=10000  # Nhẫn dưới 10.000 Xu
npm run market -- --account=manina2 --mine                            # Đang bán
```

| Tham số | Ý nghĩa |
|---|---|
| `--tab=N` | Mục 0–8: 0 Vũ Khí, 1 Nón Nam, 2 Nón Nữ, 3 Giáp Nam, 4 Giáp Nữ, 5 Nhẫn, 6 Vật Phẩm Khác, 7 Đá Quý, 8 Vật Dụng |
| `--page=N` | Trang, từ 1. Mặc định 1 |
| `--scan` | Đọc mọi trang (của `--tab`, hay của cả 9 mục), rồi in các món rẻ nhất. Món lặp lại giữa hai trang (khi có người đăng món mới lúc đang đọc) chỉ tính một lần |
| `--name=…` | Chỉ món có tên chứa chuỗi này, không phân biệt hoa thường |
| `--max-price=N` | Chỉ món có giá không quá N Xu |
| `--top=N` | Số món in ra, mặc định 10 |

Đọc cả 33 trang của 9 mục (592 món) mất vài giây. Mỗi trang là một `c2s/1192` chỉ đọc, giống bấm mũi tên trang trên máy.

## Mua

```bash
npm run market -- --account=manina2 --buy=<uuid> --max-price=1000 --tab=6 --page=4            # chạy thử
npm run market -- --account=manina2 --buy=<uuid> --max-price=1000 --tab=6 --page=4 --confirm  # mua thật
```

1. **Tìm món.** uuid lấy từ `--scan` hay `--tab`; dòng của món có cả `tab` và `page`. Bot đọc trang đó trước, rồi cả mục, rồi mọi mục. Không thấy thì dừng: món đã bán, hết hạn hay bị thu hồi.
2. **Kiểm tra.** Có ba điều kiện:
   - giá không quá `--max-price` (bắt buộc phải có, để tránh gõ nhầm uuid mua phải món 50 triệu);
   - đủ Xu;
   - túi còn ít nhất một ô trống. Túi đầy thì server trả "Rương đã đầy…".
3. **Mua** (chỉ khi có `--confirm`): `c2s/115 (uuid)`. Server trả `s2c/46` (tiền), `s2c/115` (cùng uuid), `s2c/1187` (cả túi). Bot ghi ô túi của món mới. Món mua về có uuid mới và **chưa khoá**, nên bán lại được.
4. **Server từ chối** bằng `s2c/1256`: bot dừng và ghi lời của server.

## Đăng bán

```bash
npm run market -- --account=manina2 --sell=2 --price=1000000            # chạy thử
npm run market -- --account=manina2 --sell=2 --price=1000000 --confirm  # đăng thật, phí 1.000 Xu
```

| Tham số | Ý nghĩa |
|---|---|
| `--sell=N` | Ô túi của món (số `slot` trong `npm run bag` hay dòng `result` của Mua) |
| `--price=N` | Giá, từ 1.000 tới 100.000.000 Xu |
| `--qty=N` | Số lượng, mặc định 1. Mới đo với 1 [Chưa rõ: món chồng và giá là của cả chồng hay từng cái] |

1. **Kiểm tra.** Ô có món, món **chưa khoá** (game từ chối món khoá với "Vật phẩm không thể rao bán!"), đủ số lượng, giá trong khoảng, đủ Xu cho phí.
2. **Kế hoạch:** phí 1.000 Xu, phí chợ 5% khi bán được, số tiền nhận về hòm thư.
3. **Đăng** (chỉ khi có `--confirm`): `c2s/112 (1, ô, số lượng, giá)`. Server trả `s2c/46` (trừ phí), `s2c/112`, rồi "Rao bán vật phẩm thành công". Món rời túi, sang Đang bán, bán trong 24 giờ.

## Thu hồi

```bash
npm run market -- --account=manina2 --mine                                # uuid của món đang bán
npm run market -- --account=manina2 --withdraw=<uuid> --confirm           # lấy về túi
```

uuid trong Đang bán **khác** uuid của món trong túi; phải lấy từ `--mine`. Bot đọc Đang bán, kiểm món có ở đó, rồi gửi `c2s/113 (uuid)`. Server trả `s2c/1187` (món về túi, lại có uuid mới), `s2c/113`, rồi "Đã nhận lại vật phẩm …". Phí đăng bán không được hoàn.

## Gia hạn

```bash
npm run market -- --account=manina2 --mine                                # uuid của món đang bán
npm run market -- --account=manina2 --extend=<uuid> --confirm             # thêm 24 giờ, phí 1.000 Xu
```

Bot đọc Đang bán, kiểm món có ở đó và đủ Xu trả phí, rồi gửi `c2s/112 (2, uuid)`. Server trả `s2c/46` (trừ 1.000 Xu), `s2c/1192` Đang bán mới, rồi "Gia hạn vật phẩm thành công". Hạn mới là **hạn cũ cộng 24 giờ**, không tính từ lúc gia hạn; uuid giữ nguyên. Bot ghi hạn trước và sau trong dòng `result` ([Gia hạn](../../app/events/14-npc.md#gia-hạn)). Bot TS mới gia hạn bằng script dò ở NP1, chưa chạy lệnh `--extend` với server thật.

## Khi món bán được

Tiền về **hòm thư**: thư của Hệ Thống "Chợ trời: đã bán vật phẩm", ví dụ "Thú cưng Slime x1 đã bán được 20.000 Xu. Phí chợ 5%: 1.000 Xu, thực nhận 19.000 Xu.", quà là số Xu thực nhận. Nhận bằng `npm run mail -- --claim=<mã thư> --confirm` ([hòm thư](mail.md)). Người bán đang online chỉ nhận `s2c/1222` (thư mới) và `s2c/1220`; Xu không cộng tới khi nhận thư. [Đo NP1]

## TODO

- Món hết hạn sau 24 giờ: về hòm thư thế nào.
- Món chồng (đá, vật dụng): `--qty` lớn hơn 1, và giá là của cả chồng hay từng cái.

## Log

Mỗi dòng là một JSON. Ngoài các dòng chung (`character`, `notice`, `server_message`, `stop`, dòng `summary` `market_run_result`):

| `event` | Khi nào | Nội dung |
|---|---|---|
| `tabs` | Mở chợ (`s2c/116`) | Các mục và số món, phí, số giờ bán, giá cao nhất, tiền, số ô trống |
| `page` | Mỗi trang đọc | Mục, tên mục, trang, số trang, số món |
| `listing` | `--tab`, `--mine` | Một món: tên kèm chỉ số, phẩm chất, cấp, giá, người bán, thời gian còn, mục, trang, uuid |
| `cheap` | `--scan` | Như `listing`, các món rẻ nhất |
| `scanned` | `--scan` | Số món đọc được, số món khớp bộ lọc |
| `plan` | Mua, Đăng bán, Gia hạn, Thu hồi | Việc sẽ làm và các số đã kiểm |
| `dry_run` | Không có `--confirm` | Dừng trước khi gửi |
| `result` | Sau khi server nhận | Tiền trước và sau, ô túi, các lời báo của server; với Gia hạn thêm hạn trước và sau |
