# Pháp sư bằng Node.js

`npm run smith` đăng nhập và nói chuyện với Pháp sư (NPC 161 ở M1) theo đúng các bước trên máy. Mỗi lần chạy làm **một** việc:

- Hỏi giá
- Nâng cấp (Thường hay Cẩn thận, có bùa bảo vệ)
- Gộp đá
- Tách đá
- Chuyển hoá
- Chế tạo trang bị
- Đổi Băng Tâm

Gói, lời server và giá đã đo nằm ở [16-upgrade](../../app/events/16-upgrade.md).

App Rust đã có Gộp đá, Nâng cấp tới +4, Tách đá và Chuyển hoá trong Tiện ích (`cllt smith`, [features](../rust/features.md#tiện-ích)). Bốn phần sau chỉ có ở bản TS này; tính năng mới luôn làm ở TS trước rồi mới chuyển sang Rust:

- bùa bảo vệ
- nâng trên +4
- chế tạo trang bị
- Đổi Băng Tâm

Code nằm ở [src/bot/smith.ts](../../../src/bot/smith.ts) (luồng) và [src/protocol/npc.ts](../../../src/protocol/npc.ts) (gói, kế hoạch). CLI là [src/cli/smith-run.ts](../../../src/cli/smith-run.ts), test ở [test/smith.test.ts](../../../test/smith.test.ts).

## Chạy

```bash
npm run smith -- --account=tiheo2                                   # xem túi và tiền
npm run smith -- --account=tiheo2 --quote=19 --careful              # hỏi giá nâng món ở ô 19, không bấm
npm run smith -- --account=tiheo2 --upgrade=19 --to=8 --careful     # chạy thử: đặt món, báo giá, dừng
npm run smith -- --account=tiheo2 --upgrade=19 --to=8 --careful --confirm   # bấm thật
npm run smith -- --account=tiheo2 --craft=nhan:1 --confirm          # chế Nhẫn Bậc I
```

**Không có `--confirm` thì không tốn gì.** Bot vẫn mở cửa sổ, đặt món, đọc phí và tỉ lệ, rồi dừng trước nút Bắt đầu (`c2s/91`).

- Đặt món không tốn gì, và không có gói bỏ món ra. Lần sau mở lại menu là có cửa sổ rỗng ([gói](../../app/events/16-upgrade.md#gói)).
- Đổi Băng Tâm là ngoại lệ: server đổi ngay khi chọn dòng. Vì vậy chạy thử chỉ mở menu và đọc số Băng Tâm đang có.

**Tài khoản.**

- `--account=<tên đăng nhập>` lấy tên, mật khẩu và server từ `app/accounts.json`. File này là của app Rust, chỉ nằm trên máy, không vào git, và script không in mật khẩu ra.
- Không có `--account` thì script dùng `CLLT_USERNAME` và `CLLT_PASSWORD` trong `.env`, như [CLI chính](README.md#chạy-với-tài-khoản-của-bạn).

**Trước khi chạy:**

- Nhân vật phải đứng ở **M1** (Làng Thanh Khê). Server chỉ trả lời Pháp sư từ map này, nên ở map khác bot dừng ngay.
- Tắt game trên điện thoại (`am force-stop`) nếu máy đang đăng nhập cùng nick. Khi bot chiếm phiên, kết nối cũ của máy vẫn nhận gói thêm một lúc, và đã có lần Tiheo2 tự bị đổi 50 Lượng đúng lúc đó ([Hương Lão](../../app/events/14-npc.md#điểm-năng-động)).

## Các việc

| Việc | Tham số | Bấm Bắt đầu khi | Tốn |
|---|---|---|---|
| Xem túi | không có việc nào | không bao giờ | không |
| Hỏi giá | `--quote=<ô>` | không bao giờ | không |
| Nâng cấp | `--upgrade=<ô>` | `--confirm` | Xu khóa (thiếu thì lấy cả Xu), đá đã đặt, bùa; Cẩn thận thêm Lượng |
| Gộp đá | `--merge` hoặc `--merge=<cấp cao nhất>`; chỉ một cấp: `--merge --level=3 [--lock=locked\|unlocked] [--sets=1]` | `--confirm` | phí bằng Xu khóa, hoặc bằng Xu ở Luyện đá [Xu] |
| Tách đá | `--separate=<ô>` | `--confirm` | không; cần ô trống cho số đá trả về |
| Chuyển hoá | `--transmute=<ô nguồn>:<ô đích>` | `--confirm` | 1 vật phẩm Chuyển hoá |
| Chế tạo trang bị | `--craft=<non\|ao\|vukhi\|nhan>:<1\|2\|3>` | `--confirm` | Xu, mỗi nguyên liệu 24 |
| Đổi Băng Tâm | `--ice=<1\|5\|all>` | `--confirm` (chọn dòng đổi) | 8 Băng Tâm mỗi bình |

"Ô" là **ô túi** của món, như trong log `bag`. Đồ đang mặc phải cởi ra túi trước: server không trả lời khi đặt đồ đang mặc ([đồ đang mặc](../../app/events/16-upgrade.md#đồ-đang-mặc)).

Tham số chung:

| Tham số | Mặc định | Ý nghĩa |
|---|---|---|
| `--account=<tên>` | `.env` | Tài khoản trong `app/accounts.json` |
| `--confirm` | chạy thử | Cho phép bấm Bắt đầu và chọn dòng Đổi Băng Tâm |
| `--wait-ms=N` | 8000 | Thời gian chờ mỗi câu trả lời. Server thường trả trong khoảng 40 ms |

Tham số của Hỏi giá và Nâng cấp:

| Tham số | Mặc định | Ý nghĩa |
|---|---|---|
| `--to=N` | cấp hiện tại + 1 | Cấp cần đạt. Bot không nâng quá trần theo bậc của món: bậc 1 tới +4, bậc 21 tới +8, bậc 51 tới +12, bậc 101 tới +16 |
| `--careful` | Thường | Dùng Nâng cấp [Cẩn thận]: tỉ lệ ×1,5, mỗi lần tốn thêm Lượng (5 tới +5, 10 ở +5→+6, 15 ở +6→+7) |
| `--rate=R` | 100 | Chỉ bấm khi tỉ lệ từ R% trở lên. Thường có trần (80% ở +0→+1, 50% ở +6→+7), nên muốn nâng Thường thì phải hạ R |
| `--charm=auto\|never` | `auto` | `auto`: khi lần nâng có thể làm tụt cấp thì đặt bùa, không có bùa hợp lệ thì dừng. `never`: không dùng bùa |
| `--tries=N` | số cấp cần lên | Số lần bấm tối đa. Không có `--tries` thì bot dừng ở lần thất bại đầu tiên; có thì bấm tiếp sau thất bại cho tới N lần |
| `--locked-stones` | dùng cả đá chưa khoá | Chỉ dùng đá đã khoá, để giữ đá chưa khoá cho việc khác |

<a id="nâng-cấp"></a>

## Nâng cấp

Mỗi lần lên một cấp, bot làm như sau:

1. **Mở cửa sổ.** Gửi `c2s/13 ("M1", 161)`. Pháp sư trả menu `s2c/57`. Bot chọn 0 Nâng cấp, rồi 0 [Thường] hoặc 1 [Cẩn thận]. Mỗi `c2s/57` chỉ gửi dòng có trong menu vừa nhận ([hộp thoại](../../app/events/14-npc.md#hộp-thoại)). Server mở cửa sổ `s2c/96`.
2. **Đặt món:** `c2s/97 ("", 0, 0, ô, 1)`. Server trả `s2c/90` và bản xem trước `s2c/1258`.
3. **Bùa.** Thất bại ở +L thì món tụt về mốc gần nhất trong +4, +8, +12, +14; dưới +4 thì giữ nguyên ([thất bại và bùa](../../app/events/16-upgrade.md#thất-bại-và-bùa)).
   - Bùa chỉ có ích khi mốc đó thấp hơn L, tức L là 5–7, 9–11, 13 hoặc 15.
   - Khi đó bot đặt bùa bằng `c2s/97 ("", 0, 1, ô, 1)` (loại 1, như client).
   - Bùa sơ, trung, cao, siêu cấp (mã 35–38) dùng cho lần nâng tới +8, +12, +14, +16. Bot chọn bùa thấp nhất còn dùng được.
   - Bùa mất cả khi thành công lẫn thất bại.
4. **Đá.** Bot đặt từng viên, giá trị thấp trước; cùng cấp thì đá khoá trước đá chưa khoá. Một chồng là nhiều viên: bot gửi lại `c2s/97` của cùng ô, mỗi lần thêm một viên ([ST1](../../app/events/16-upgrade.md#đá-xếp-chồng-st1)). Sau mỗi viên, bot đọc tỉ lệ trong `s2c/90` và dừng khi tỉ lệ đạt R. 18 ô đầy đá rẻ mà chưa tới R thì bot mở lại cửa sổ, bỏ cấp đá thấp nhất.
   - Nâng cấp: đặt hết đá (hoặc hết ô) mà tỉ lệ vẫn dưới R thì bot dừng ở bước 5, không bấm.
   - Hỏi giá (`--quote`): trong trường hợp đó, nếu có viên không làm tỉ lệ tăng (đã chạm trần), bot mở lại cửa sổ và đặt lại mà không có các viên đó, để giá báo ra là giá với số đá có ích. Lý do: server lấy hết đá đã đặt, kể cả viên thừa ([nâng cấp](../../app/events/16-upgrade.md#bảng-đo-nâng-cấp)). Tỉ lệ hiện số nguyên, nên hai viên nhỏ có thể cùng làm tỉ lệ tăng mà từng viên thì không: nếu bỏ chúng làm tỉ lệ giảm, bot ghi dòng `warning`.
   - Cửa sổ có 18 ô đá; khi có bùa thì bot đặt nhiều nhất 17 viên.
5. **Kiểm tiền.** Phí phải không quá Xu khóa + Xu, và Lượng của Cẩn thận phải không quá số Lượng đang có. Tỉ lệ dưới R thì bot dừng, không bấm.
6. **Bắt đầu** (chỉ khi có `--confirm`): `c2s/91 ""`. Server trả:
   - `s2c/91`: kết quả và món sau lần nâng. Có bùa thì kèm chồng bùa còn lại.
   - `s2c/1258`, `s2c/46` (tiền). Cẩn thận có thêm một `s2c/46` (Lượng) đến trước.

   Server **không gửi lại túi**, nên bot xin túi bằng `c2s/42` rồi tìm món theo uuid.
7. **Lặp lại** tới `--to`. Không có `--tries` thì một lần thất bại là dừng; có `--tries` thì dừng khi bấm đủ N lần.

Hỏi giá (`--quote`) làm bước 1 tới 5 cho một cấp rồi dừng.

<a id="chế-tạo"></a>

## Chế tạo trang bị

1. **Mở menu.** Gửi `c2s/13`, rồi chọn 3 Chế tạo, 1 Chế tạo trang bị, rồi loại món: 0 Nón, 1 Áo, 2 Vũ khí, 3 Nhẫn. Menu `s2c/57` ghi công thức, ví dụ "Bậc I: Quặng Bậc 1 x24, Linh Thạch Bậc 1 x24, 2.400 Xu". Bot đọc công thức từ chữ này, và đọc cấp cần có từ nhãn dòng, ví dụ "Bậc II (Lv 51)".
2. **Kiểm trước khi chọn bậc:**
   - cấp nhân vật đủ cho bậc;
   - mỗi nguyên liệu có một ô đủ số;
   - đủ Xu;
   - còn một ô trống cho món mới.

   Server vẫn mở cửa sổ khi thiếu cấp, nhưng bấm Bắt đầu thì báo "Cần đạt cấp 51 mới chế tạo được …".
3. **Chọn bậc.** Server mở cửa sổ `s2c/99` (key "abcd1001", 2 ô).
4. **Đặt từng nguyên liệu** bằng `c2s/97 ("", 0, 1, ô, cả chồng)`. Server trả `s2c/92`. Sau nguyên liệu thứ hai, gói này có sẵnSàng 1 và phí Xu. Server chỉ lấy đúng 24 mỗi loại.
5. **Bắt đầu** (chỉ khi có `--confirm`): `c2s/91 ""`. Server trả:
   - `s2c/93`: nguyên liệu còn lại;
   - `s2c/46`: Xu;
   - `s2c/1187` loại 4: món mới;
   - `s2c/1256`: "Bạn vừa nhận được …".

   Món chế ra có hệ ngẫu nhiên ([chế tạo](../../app/events/16-upgrade.md#chế-tạo)).

## Gộp đá, Tách đá, Chuyển hoá

**Gộp đá.**

- Mỗi lần luyện bốn viên cùng cấp và cùng loại khoá. Bốn viên như vậy cho một viên cấp trên, chắc chắn 100% (`mergePlan`). Đá xếp chồng: kế hoạch đếm từng viên, bốn viên của một chồng đi vào bằng một `c2s/97` số lượng 4.
- Đá chưa khoá luyện ở Luyện đá [Xu] (1 → 1), nên viên ra vẫn chưa khoá. Đá khoá luyện ở [Xu khóa] (1 → 0).
- Bot đặt bốn viên, kiểm `s2c/92` báo đúng viên cấp trên với 100%, rồi bấm.
- Sau mỗi lần, bot xin túi rồi lập kế hoạch lại, nên viên vừa ra được luyện tiếp tới cấp `--merge` (mặc định 12).
- Chạy thử in cả dự tính: số lần luyện, phí, ô túi được giải phóng (`mergeForecast`).
- `--level=<k>` chỉ luyện Đá cấp k thành Đá cấp k+1, không luyện tiếp viên vừa ra. `--lock=locked` hay `unlocked` chỉ lấy đá khoá hay chưa khoá. `--sets=<n>` dừng sau n lần. Nút Gộp của từng dòng trong app là `--level=<k> --lock=… --sets=1`.

**Tách đá.**

- Menu 2, cửa sổ không có ô đá. Món phải từ +1 trở lên.
- `s2c/90` cho biết số đá sẽ nhận. Bot đòi đủ ô trống cho số đá đó, vì túi đầy thì server từ chối khi bấm ([túi đầy](../../app/events/16-upgrade.md#túi-đầy)).

**Chuyển hoá.**

- Menu 0 → 2. Bot đặt lần lượt món nguồn (`s2c/90`), món đích +0 (`s2c/1260`), rồi vật phẩm Chuyển hoá rẻ nhất còn chuyển được cấp đó (`s2c/90` sẵnSàng 1). Cả ba đặt bằng loại 0.
- Món đích phải cùng loại với nguồn, có bậc bằng hoặc cao hơn, và nâng được tới cấp của nguồn (`transmuteTargets`).

## Đổi Băng Tâm

- **Mở menu.** Gửi `c2s/13`, chọn 3 Chế tạo, rồi 3 Đổi Băng Tâm lấy bình rỗng. Menu ghi "Bạn đang có N Băng Tâm".
- **Kiểm trước.** Cần 8 Băng Tâm mỗi bình. Nếu túi chưa có chồng Bình Huyết Linh (Rỗng) thì cần thêm một ô trống.
- **Đổi** (chỉ khi có `--confirm`): chọn 0 (1 bình), 1 (5 bình) hoặc 2 (đổi hết). Server đổi ngay và trả `s2c/1187` (cả túi) cùng `s2c/1256` "Đã đổi 8 Băng Tâm lấy 1 Bình Huyết Linh (Rỗng)".
- **Chạy thử** dừng khi menu đổi còn mở. Server nhớ menu cuối cùng của NPC, nên bot gửi lại `c2s/13` để menu cuối là menu gốc, nơi dòng 0 chỉ mở menu Nâng cấp. Cách này tránh để một `c2s/57` cũ đổi nhầm ([hộp thoại](../../app/events/14-npc.md#hộp-thoại)).

## Mua bùa và đá

Bùa và đá cấp 6 trở lên chỉ bán ở Cửa hàng [Lượng] của Lái Buôn. `npm run buy` mua được ở cửa hàng này ([cách chạy](shop.md#cửa-hàng)):

```bash
npm run buy -- --account=tiheo2 --shop=luong --item=35 --qty=2 --buy   # 2 Bùa bảo vệ sơ cấp
npm run buy -- --account=tiheo2 --shop=luong --item=417 --qty=3 --buy  # 3 Đá cấp 7, mua từng viên
```

- Món không chồng được (đá, `stack` 1) phải mua từng cái. Gửi số lượng lớn hơn 1 thì server báo "Số lượng không chính xác!" ([cửa hàng](../../app/events/15-shops.md#lượng)). Vì vậy bot tự mua từng cái một cho đủ `--qty`.
- Không có `--buy` thì bot chỉ mở cửa hàng và báo sẽ mua gì.

## Log

Mỗi dòng là một JSON. Cuối cùng luôn có một dòng `smith_run_result`.

| `event` | Khi nào |
|---|---|
| `character` | Vào game: tên, cấp, map, tiền |
| `bag` | Túi, gom theo loại: tiền, đá theo cấp (khoá hay không), đồ (ô, tên, +cấp, khoá), bùa, nguyên liệu, Băng Tâm |
| `menu`, `window` | `s2c/57` và `s2c/96`/`s2c/99` vừa nhận |
| `put` | Một `c2s/97`: món, ô, loại, câu trả lời (chữ, tỉ lệ, phí, sẵn sàng) |
| `plan` | Việc sắp bấm: tỉ lệ, phí, Lượng, đá, bùa; với Gộp đá thì kèm dự tính |
| `dry_run` | Dừng trước Bắt đầu vì không có `--confirm` |
| `result` | Kết quả một lần bấm: thành công hay không, cấp trước và sau, món nhận, tiền trước và sau |
| `notice`, `server_message` | Lời server: `s2c/1256`, hoặc `s2c/0` (hộp thông báo khi đang trong game) |
| `stop` | Lý do dừng |

Lý do dừng thường gặp:

- ô túi trống, hoặc món ở ô đó không nâng được (không phải trang bị, đã tới cấp cần, đã chạm trần theo bậc);
- hết đá, hoặc tỉ lệ cao nhất thấp hơn `--rate`;
- cần bùa mà túi không có bùa dùng được;
- thiếu Xu khóa, Xu hay Lượng;
- thiếu cấp, nguyên liệu hay ô trống;
- server từ chối (`s2c/1256` hoặc `s2c/0`);
- server không trả lời sau `--wait-ms`.

## Trạng thái

- **Kiểm offline:** `npm test` chạy luồng của bot với một server giả, server này trả các gói thật đã bắt ở O1 (Nâng cấp có bùa, Chế tạo, Đổi Băng Tâm). Test có cả trường hợp dừng.
- **Đã chạy thật: Gộp đá** (CT1, 01/11, manina2, người dùng nhờ dọn túi). Chạy thử trước báo 8 lần, 708 Xu khóa, dọn 24 ô; `--merge --confirm` làm đủ 8/8 lần, phí từng lần 7, 7, 26, 26, 26, 103, 103, 410 Xu khóa, khớp kế hoạch. Nâng cấp, Tách đá, Chuyển hoá, Chế tạo, Đổi Băng Tâm của bot TS **chưa chạy với server thật**; gói của chúng giống hệt gói mà probe O1 (`captures/o1-2026-11-01/probe.ts`) đã gửi và được server nhận. Lần chạy thật đầu tiên cần người dùng đồng ý; nên chạy thử không có `--confirm` trước.
- **Không làm:**
  - nâng đồ đang mặc (app Rust tự cởi ra rồi mặc lại);
  - Chế tạo cánh và Chế Băng Kiếm: chưa có nguyên liệu để đo;
  - Luyện đá tỉ lệ dưới 100%: chưa thấy gói khi thất bại.
