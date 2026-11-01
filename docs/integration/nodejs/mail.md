# Mã quà tặng, hòm thư và nhiệm vụ ngày bằng Node.js

Ba lệnh dùng các gói đã đo ở G1 (01/11, Tiheo2) ([14-npc](../../app/events/14-npc.md#mã-quà-tặng)):

| Lệnh | Làm gì |
|---|---|
| `npm run gift` | Nhập mã quà tặng (`c2s/1223`). Phần thưởng vào hòm thư |
| `npm run mail` | Xem hòm thư, xem quà trong thư, Nhận một thư, Nhận hết, xoá thư đã nhận |
| `npm run daily` | Xem nhiệm vụ ngày đang làm và tiến độ; Nhận hay Hủy nhiệm vụ ở Hương Lão |

Mã quà và hòm thư gửi thẳng được từ bất kỳ đâu sau khi vào game, không cần mở NPC hay bảng nào [Đo G1]. Riêng menu nhiệm vụ ngày là của Hương Lão (NPC 102), nên nhân vật phải ở **M1** (Làng Thanh Khê).

Code nằm ở các file sau:

- gói: [src/protocol/mail.ts](../../../src/protocol/mail.ts);
- luồng: [src/bot/mail.ts](../../../src/bot/mail.ts) (mã quà, hòm thư) và [src/bot/daily.ts](../../../src/bot/daily.ts) (nhiệm vụ ngày);
- CLI: [src/cli/gift-run.ts](../../../src/cli/gift-run.ts), [mail-run.ts](../../../src/cli/mail-run.ts), [daily-run.ts](../../../src/cli/daily-run.ts);
- test: [test/mail.test.ts](../../../test/mail.test.ts), phát lại gói G1.

Chung cho cả ba lệnh:

- **Không có `--confirm` thì không làm gì thay đổi tài khoản.** Bot chỉ đọc và báo việc sẽ làm.
- `--account=<tên>` lấy tài khoản trong `app/accounts.json` và không in mật khẩu. Không có `--account` thì dùng `.env`, như [Pháp sư](smith.md#chạy).
- Tắt game trên điện thoại trước nếu máy đang đăng nhập cùng nick.

## Nhập mã quà tặng

```bash
npm run gift -- --account=tiheo2 --code=ALPHATEST1,DENBU            # chạy thử: chỉ in mã sẽ gửi
npm run gift -- --account=tiheo2 --code=ALPHATEST1,DENBU --confirm  # nhập thật
```

| Tham số | Mặc định | Ý nghĩa |
|---|---|---|
| `--code=A,B,…` | bắt buộc | Các mã, cách nhau bằng dấu phẩy. Bot cắt dấu cách và đổi chữ hoa như client; bỏ mã trùng; mỗi mã tối đa 32 ký tự |
| `--max-wrong=N` | 5 | Dừng sau N mã bị từ chối liền nhau, phải từ 1 tới 9. Tính cả số lần sai của các lần chạy trước (xem bước 3) |
| `--gap-ms=N` | 10000 | Nghỉ giữa hai mã. 1,5 s sau một mã đúng thì server báo "Bạn nhập mã quá nhanh" (Log lỗi 02/11, manina3); cách 8 s trở lên thì được (manina2 cùng ngày, G1) |
| `--retry-ms=N` | 30000 | Bị báo "quá nhanh" khi chưa sai đủ 10 lần liền: đợi chừng này rồi gửi lại đúng mã đó một lần (bước 4) |
| `--reset-wrong` | | Quên số lần sai đã lưu của nick, ví dụ sau khi đã nhập đúng một mã trên điện thoại |
| `--confirm` | chạy thử | Gửi mã. Chạy thử không đăng nhập |

Với mỗi mã, bot làm như sau:

1. Gửi `c2s/1223 (mã)` rồi đọc `s2c/1223 (ok, lời)`.
2. **Đúng** ("Nhập mã thành công, phần thưởng đã được gửi vào hộp thư"): server gửi thêm `s2c/1222` là thư quà mới. Bot ghi mã thư và tiêu đề, rồi đặt lại số lần sai về 0.
3. **Bị từ chối** ("Mã không tồn tại", "Nhân vật này đã dùng mã rồi"): bot cộng một lần sai liền.
   - Server không nói đã sai mấy lần, và chưa rõ mã đã dùng có làm số đếm về 0 không. Vì vậy bot đếm mọi lần bị từ chối.
   - Server chặn khi sai 10 lần liền. Bot dừng sớm hơn nhiều, ở `--max-wrong`.
   - Server đếm qua nhiều lần đăng nhập, nên bot lưu số lần sai liền của từng nick vào `.cache/gift-codes.json` (chỉ ở máy, không vào git). Lần chạy sau cộng tiếp từ số đó. Nếu số đó đã tới `--max-wrong`, bot không gửi mã nào.
   - Bot chỉ biết các lần sai do chính nó gửi. Mã sai nhập trên điện thoại, hay trước khi có file này, thì không được đếm.
4. **"Bạn nhập mã quá nhanh, vui lòng thử lại sau"**: server dùng cùng một lời cho hai việc. Gửi hai mã quá sát nhau thì bị báo vậy dù chưa sai mã nào. Sai 10 lần liền thì server chặn **mọi** mã trong 5 phút, kể cả mã đúng.
   - Bot đếm chưa tới 10 lần sai liền: coi là gửi quá nhanh, không cộng vào số lần sai. Đợi `--retry-ms` rồi gửi lại đúng mã đó một lần (dòng log `too_fast`).
   - Lần gửi lại vẫn bị báo vậy, hay đã sai đủ 10 lần liền: coi là bị chặn. Bot dừng ngay, ghi các mã chưa gửi, và lưu giờ hết chặn. Chạy với `--confirm` trước giờ đó thì bot dừng luôn, không đăng nhập.
   - Sau lần chặn, bot đặt số lần sai về 0. Chưa đo server có làm vậy không [Chưa rõ].

Quà không tự vào túi: chạy `npm run mail -- --claim-all --confirm` để nhận, hay bấm Nhận hết ở tab Hòm thư của app ([app Rust](../rust/features.md#hòm-thư)).

## Hòm thư

```bash
npm run mail -- --account=tiheo2                          # danh sách thư
npm run mail -- --account=tiheo2 --open                   # xem quà trong các thư chưa nhận
npm run mail -- --account=tiheo2 --claim=6273 --confirm   # Nhận một thư
npm run mail -- --account=tiheo2 --claim-all --confirm    # Nhận hết
npm run mail -- --account=tiheo2 --delete-claimed --confirm   # xoá thư đã nhận
```

| Việc | Gói | Bot kiểm trước |
|---|---|---|
| Danh sách | `c2s/1215` → `s2c/1215` (mỗi thư: mã, tiêu đề, người gửi, đã đọc, có quà, đã nhận, giờ gửi) | |
| Xem quà (`--open`) | `c2s/1216 (mãThư)` → `s2c/1216` (nội dung, vật phẩm; tiền là vật phẩm #40 Xu, #41 Xu khóa, #42 Lượng). Mở thư làm thư thành đã đọc | Số ô túi cần: tiền không cần ô; món chồng được và đã có trong túi cùng cờ khoá thì cộng vào chồng; mỗi món khác (kể cả từng viên đá) một ô |
| Nhận một thư (`--claim`) | `c2s/1217 (mãThư)` → `s2c/46` (tiền), `s2c/1187` (túi, nếu có món), `s2c/1217 (mãThư, ok)` | Thư có quà và chưa nhận; đủ ô trống. Túi thiếu chỗ thì server trả "Rương đã đầy…" và ok 0, thư không mất gì |
| Nhận hết (`--claim-all`) | `c2s/1218` → `s2c/46`, `s2c/1187`, `s2c/1256` "Đã nhận quà của N thư", `s2c/1215` (danh sách mới) | Không cần đủ chỗ: server bỏ qua thư thiếu chỗ ("…, rương đã đầy"). Bot không mở thư trước (mở là thành đã đọc): kế hoạch chỉ ghi các thư quà theo danh sách và số ô trống |
| Xoá thư đã nhận (`--delete-claimed`) | `c2s/1219 (mãThư)` → `s2c/1219 (mãThư, ok)` cho từng thư | Chỉ thư đã nhận quà, hoặc thư không có quà |

Chạy thử `--claim` vẫn mở thư đó (`c2s/1216`) để đếm số ô cần, nên thư thành đã đọc; ngoài cờ đã đọc thì không có gì đổi. `--open` cũng vậy với mọi thư chưa nhận.

**Bot không bao giờ gửi `c2s/1221` (Xóa hết).** Gói đó xoá cả thư còn quà chưa nhận, và quà mất hẳn; manina2 đã mất quà của ba thư như vậy ([hòm thư](../../app/events/14-npc.md#hòm-thư)). Catalog TS không có builder cho gói này, và bot từ chối gửi nó.

Sau khi nhận, bot ghi tiền trước và sau (`s2c/46`) và số món trong túi.

## Nhiệm vụ ngày

```bash
npm run daily -- --account=tiheo2                      # nhiệm vụ đang làm, tiến độ, số lượt đã nhận hôm nay
npm run daily -- --account=tiheo2 --accept --confirm   # Nhận nhiệm vụ
npm run daily -- --account=tiheo2 --cancel --confirm   # Hủy nhiệm vụ đang làm
npm run daily -- --account=tiheo2 --complete --confirm # Hoàn thành nhiệm vụ đã xong, nhận thưởng
```

1. **Đọc nhiệm vụ.** Lúc đăng nhập server gửi `s2c/1195`: không có nhiệm vụ, hoặc mã, tên, mẫu, tiến độ, mục tiêu. Bot in như tab Phụ của game, ví dụ "Thu thập 0/2050 xu khóa từ đánh quái".
2. **Đọc menu.** Ở M1, bot mở Hương Lão (`c2s/13 ("M1", 102)`) và chọn dòng 2 Nhiệm vụ hàng ngày (`c2s/57`).
   - Menu ghi "Hôm nay con đã nhận N/3 nhiệm vụ hàng ngày." và có đúng một dòng 0.
   - Dòng 0 là **Nhận nhiệm vụ** khi đang không giữ nhiệm vụ, hoặc **Hủy nhiệm vụ hiện tại** khi đang giữ một nhiệm vụ.
3. **`--accept`** (dòng 0 phải là Nhận nhiệm vụ). Server trả `s2c/1256` "Nhận nhiệm vụ hàng ngày thành công." rồi `s2c/1195` với nhiệm vụ mới.
4. **`--cancel`** (dòng 0 phải là Hủy nhiệm vụ hiện tại). Server trả `s2c/1195` không có nhiệm vụ, rồi "Hủy nhiệm vụ thành công". Nhiệm vụ đã hủy **vẫn tính một lượt** trong 3 lượt của ngày.
5. **Quay về menu gốc.** Server nhớ menu cuối cùng và đọc `c2s/57` theo menu đó. Ở menu nhiệm vụ ngày, dòng 0 là Nhận hoặc Hủy, chạy ngay không hỏi lại. Vì vậy, xong việc (hay chạy thử, hay dừng), bot gửi lại `c2s/13` để menu cuối là menu gốc của Hương Lão. Ở menu gốc, dòng 0 chỉ mở Mã quà tặng ([hộp thoại](../../app/events/14-npc.md#hộp-thoại)).

6. **`--complete`** (đo ở NP1). Nhiệm vụ đang giữ phải đủ tiến độ và menu phải có dòng "Hoàn thành nhiệm vụ" (khi đó menu có hai dòng: 0 Hoàn thành nhiệm vụ, 1 Hủy nhiệm vụ hiện tại). Bot chọn dòng đó. Server trả `s2c/10` (EXP), `s2c/46` (Xu khóa), `s2c/1187` (túi), rồi `s2c/1195` loại 2 với tên nhiệm vụ và các phần thưởng ("727 kinh nghiệm", "590 xu khóa"), không có lời báo. Bot ghi `daily_done` và dòng `result` với phần thưởng, tiền trước và sau, các opcode đã đến. Lần chạy thật ở NP1 trả được nhiệm vụ, nhưng bot lúc đó chưa đọc được `s2c/1195` loại 2 nên ghi `parse_error` và `ok: false`; bản đọc loại 2 mới thử với gói ghi lại của lần đó (`test/fixtures-np1.ts`).

Dòng chữ của nút không đúng như mong đợi thì bot dừng, không bấm. Ví dụ: muốn Nhận nhưng đang giữ nhiệm vụ, hoặc muốn Hoàn thành khi chưa đủ tiến độ.

**Tiến độ.** Khi tiến độ đổi, server gửi `s2c/1195` loại 3 (`i32 tiếnĐộ; i32 mụcTiêu`). Với Nhặt xu, gói này đến ngay sau mỗi lần nhặt Xu khóa của quái, giữa `s2c/46` và lời báo "Bạn vừa nhận được … Xu khóa". Tiến độ dừng ở mục tiêu (2087 → 2100). Quái thấp hơn quá 20 cấp không rơi gì nên không tính. Bot nhiệm vụ (`npm run quest`) ghi dòng `daily_quest` với tiến độ; `npm run daily` cộng tiến độ vào nhiệm vụ đang giữ.

<a id="todo"></a>

### Còn để sau (TODO)

- Chưa đo: nhận lượt thứ 4 trong ngày, giờ nào thì tính sang ngày mới, tiến độ của các loại khác Nhặt xu (116 Sử dụng vật phẩm trong trận), phần thưởng có vật phẩm không.
- Bot chưa tự làm nhiệm vụ ngày: farm cho đủ tiến độ vẫn là `npm run quest -- --farm=…` chạy tay.

## Log

Mỗi dòng là một JSON; cuối cùng có `gift_run_result`, `mail_run_result` hoặc `daily_run_result`, với `ok`, `outcome` (`done`, `dry_run`) và `reason` khi dừng.

| `event` | Lệnh | Khi nào |
|---|---|---|
| `character` | cả ba | Vào game: tên, cấp, map, tiền |
| `code` | gift | Một mã: mã đã gửi, ok, lời server, thư mới (mã thư, tiêu đề), số lần sai liền |
| `mails` | mail | Danh sách thư |
| `mail` | mail | Một thư đã mở: vật phẩm, tiền, số ô cần |
| `plan`, `dry_run` | cả ba | Việc sẽ làm; dừng vì không có `--confirm` |
| `result` | cả ba | Kết quả: thư đã nhận hay xoá, tiền trước và sau; nhiệm vụ mới |
| `daily_quest` | daily, quest | `s2c/1195` vừa đến: nhiệm vụ đang giữ, hay tiến độ mới (loại 3) |
| `daily_done` | daily | `s2c/1195` loại 2 sau Hoàn thành nhiệm vụ: tên nhiệm vụ và các phần thưởng |
| `menu` | daily | Dòng menu đã chọn, và chữ của menu nhiệm vụ ngày |
| `notice`, `server_message` | cả ba | `s2c/1256`, `s2c/0` |
| `stop` | cả ba | Lý do dừng |

## Trạng thái

- Test offline phát lại gói thật của G1:
  - mã đúng có thư mới; mã đã dùng; mã sai; bị chặn 5 phút; dừng ở `--max-wrong`, kể cả số lần sai của lần chạy trước;
  - danh sách thư; xem quà; Nhận khi túi đủ và thiếu chỗ; Nhận hết; xoá thư đã nhận; từ chối `c2s/1221`;
  - nhiệm vụ ngày: đọc, Nhận, Hủy, chạy thử.
- **Chưa chạy với server thật** bằng các lệnh này. Gói giống hệt gói điện thoại gửi ở G1, và bot TS đã gửi `c2s/1223` thẳng được (G1). Lần chạy thật đầu cần người dùng đồng ý.
