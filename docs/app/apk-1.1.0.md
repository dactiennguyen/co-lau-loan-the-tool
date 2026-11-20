# APK 1.1.0: khác gì 1.0.3

Mốc: bản Google Play cài trên máy M2101K7BG ngày 20/11/2026, `versionName 1.1.0`, `versionCode 3`, gồm các file split APK. Mình so bản này với 1.0.3 ([artifact](artifact.md)) bằng jadx (`classes.dex`) và r2 (`lib/arm64-v8a/libgdx-flashds.so`). Chưa bắt được phiên đăng nhập nào của 1.1.0, vì server bảo trì tới lúc Open Beta 12:00 ngày 20/11.

Nhãn: **[Đo]** (đọc từ code, file hoặc mạng), **[Suy luận]**, **[Chưa rõ]**.

| File | SHA-256 |
|---|---|
| `base.apk` | `769af020596b4e516b45c4723fa989765ef1af77645e6a662e8286fd05b61f33` |
| `split_config.arm64_v8a.apk` | `de558b7943d2b8b153325b76456e2de773732cefe4d0f0bf122278ab88d90fb1` |
| `classes.dex` | `e58f3e9719bed5fd66216b8b3b3630d38835ab90881a123c401c44ebb8316cb3` |
| `lib/arm64-v8a/libgdx-flashds.so` (59.590.816 byte; bản cũ 48.686.752) | `64cc535d858e2a7329fd7948f10334b317db6170042acc77520ff52c04c20c52` |

`libgdx.so` và `libgdx-freetype.so` giữ nguyên. [Đo]

## Kết nối và đăng nhập

| | 1.0.3 | 1.1.0 | |
|---|---|---|---|
| Server mặc định | `Thanh Khê:play.colauloanthe.vn:1688:0` | `Thanh Khê:plays1.colauloanthe.vn:1688:0` | Ngày 20/11, `play` trỏ về `127.0.0.1`; `plays1` trỏ về `14.225.213.40`. Xem [08](events/08-server-map-zone.md#danh-sách-máy-chủ). [Đo] |
| Phiên bản giao thức trong `c2s/1206` và `c2s/4` | `0.0.2` | `0.0.7` | Là hằng `sqnf.E` trong Java. [Đo] |
| Bắt tay, bảng đổi opcode | | không đổi | Bot TS gửi `0.0.2` vẫn bắt tay được, và các gói `-1`, `1206`, `1207`, `1209`, `5`, `2`, `3`, `4`, `0` giữ nguyên mã trên dây. [Đo] |
| Hàm dựng `c2s/4` | `sqlq.a37` | `sqnf.a38` | Hai hàm có cùng tham số và dãy lời gọi JNI giống hệt, nên các trường và thứ tự trường không đổi. [Đo] |
| Hàm dựng `c2s/1206` | `sqlq.G133` | `sqnf.J143` | Vẫn ghi `string; string; i32`. [Đo] |

### Đo thật sau Open Beta (12:02 ngày 20/11)

- Bot TS đăng nhập `tiheo2`, vẫn gửi phiên bản `0.0.2` và không gửi `c2s/1282`. Server **nhận đăng nhập**:
  - Sau `c2s/4`, server gửi `s2c/1259`, `s2c/1265`, `s2c/1269`, `s2c/1271` (link mạng xã hội), `s2c/1272`, rồi `s2c/4` (rỗng, đăng nhập thành công).
  - Sau đó server gửi `s2c/8`, 4.008 byte, thay cho `s2c/9` (danh sách nhân vật). Bot chưa biết gói này nên chờ `s2c/9` rồi hết giờ sau 8 giây. [Đo]
- `s2c/8` là **dữ liệu tạo nhân vật**. Mở đầu gói có các tên lựa chọn "Khôi Ngô", "Ngố" và bảng màu ARGB. Game thật trên điện thoại cùng lúc hiện màn hình tạo nhân vật (Khuôn Mặt, Kiểu Tóc, Màu Tóc, Màu Da, ô "Nhập tên nhân vật"). Open Beta đã xoá nhân vật của đợt Alpha. [Đo]
- Người dùng tạo nhân vật mới cho `tiheo2` trên điện thoại rồi vào Làng Thanh Khê, khu 10. Thanh chức năng có thêm nút "Bạch Hổ" và "Tự động". [Đo]
- Chưa đo: gói tạo nhân vật (`c2s` nào, có những trường gì), và server có xử lý gì khác khi thiếu `c2s/1282` hoặc khi phiên bản là `0.0.2` sau lúc vào thế giới. [Chưa rõ]
- Lúc 12:10, sau khi tạo nhân vật trên điện thoại, `npm run connect -- --world` chạy hết luồng tới `s2c/1263`. Bot đọc đúng nhân vật akaito (cấp 2, HP 60/66, M1). [Đo]
- So từng gói với bản ghi 1.0.3 ngày 01/11 (`captures/b6-2026-11-01/b6-far.jsonl`):
  - Thứ tự gói không đổi.
  - `s2c/2`, `3`, `4`, `1259`, `1269`, `1271`, `1272` giống từng byte.
  - `s2c/1209` dài từ 1 lên 14 byte, mẫu `20 00000005 01 000003e8 0014 01 00`. Bot chỉ đọc byte đầu nên vẫn chạy. `check:capture` báo `UNEXPECTED_TAIL` vì xếp gói này vào loại phải đọc hết byte.
  - `s2c/1265` dài từ 30 lên 43 byte; phần thêm ở cuối là `03` rồi 3 × i32 (25, 26, 27).
  - Các gói khác dài ngắn khác nhau (túi đồ, nhiệm vụ, người chơi) vì đây là một nhân vật khác.

  [Đo]

Lớp phiên đổi tên do làm rối: `com.mh.sqlq` thành `com.mh.sqnf`, gói `com.mh.n.sqi` thành `com.mh.w.sqi`. Trong 88 hàm dựng gói đọc được mã gói bằng `mov w4`, mọi opcode có ở cả hai bản đều giữ nguyên tham số và dãy lời gọi JNI. Khoảng 90 hàm còn lại không đọc được mã gói theo cách này nên chưa so. [Đo]

## Gói mới và gói bị bỏ

| Opcode | Hàm | Thân gói | Ghi chú |
|---:|---|---|---|
| 1275 | `sqnf.Z()` | rỗng | Chưa rõ dùng làm gì. |
| 1277 | `sqnf.Q()` | rỗng | Chưa rõ dùng làm gì. |
| 1281 | `sqnf.N()` | rỗng | Do `com.mh.sqip.h14` gọi. Chưa rõ dùng làm gì. |
| 1282 | `sqnf.a(DeviceSignals)`, static | `u8 adb; u8 devOptions; u8 accessibility` | Trạng thái máy, xem dưới. Server cũng gửi `s2c/1282` (8 byte) lúc vào thế giới. |
| 1279 (s2c) | | i32 | Server gửi cùng lúc với `s2c/1282`; chưa rõ. |

Gói bị bỏ: 1228, 1229, 1230, 1235, 1238. [Đo]

Mã trên dây: các opcode 1241–1272 đã biết theo đúng quy luật sau. Với `m = op − 1249`, mã là `(m mod 3 = 0 ? 3 : 3 − m mod 3) × 10⁷ + (358 − ⌊m/3⌋) × 10⁴ + 1111`. Theo quy luật này: 1275 = `13501111`, 1277 = `23491111`, 1279 = `33481111`, 1281 = `13481111`, 1282 = `33471111`. [Suy luận]

Ngày 20/11 server gửi xuống hai gói mã `33481111` và `33471111`, đúng mã tính ra cho 1279 và 1282. Quy luật vì vậy có hai mẫu kiểm chứng. [Đo]

### `c2s/1282`: trạng thái máy (chống bot)

- `AndroidLauncher.readDeviceSignals()` (Java) đọc các giá trị sau:
  - `Settings.Global.adb_enabled` → bit 1.
  - `adb_wifi_enabled` → bit 2.
  - `development_settings_enabled` → `c`.
  - Nếu `accessibility_enabled` bật: số dịch vụ trong `enabled_accessibility_services`, đếm bằng `DeviceSignals.countServices`, giới hạn 0–127 → `d`.
- Kết quả được gói vào `new DeviceSignals(b & 3, c, d)`. [Đo]
- `sqnf.a(DeviceSignals)` ở `0x15e19dc` làm `new sqi(1282)`, rồi gọi `sqi.b(B)` ba lần với `b` (`GetIntField`), `c` (`GetBooleanField`) và `d` (`GetIntField`). Thân gói vì vậy là 3 byte. [Đo]
- `sqnf.p()` ở `0x15e2820` gọi `DeviceSignals.a()` để đọc trạng thái máy, rồi `sqnf.a(DeviceSignals)` để dựng gói, rồi `sqnf.g(sqi)` để xếp gói vào hàng gửi. [Đo]
- `sqnf.p()` được gọi trong `com.mh.sqna.d(int)` ở `0x148fcbc`, ngay sau một lời gọi `l()`. [Đo] Nhiều khả năng đây là nhánh xử lý `s2c/1282`, xem dưới. [Suy luận]
- Server dùng gói này làm gì thì chưa rõ: chặn, đánh dấu hay chỉ ghi log. Bot TS và app chưa gửi gói này. [Chưa rõ]

### `s2c/1282` và `s2c/1279`: server hỏi trạng thái máy

Đo bằng bot TS, nick `tiheo2` (nhân vật akaito, cấp 2, M1), ngày 20/11, hai lần lúc 12:10 và 12:12. Bot không gửi `c2s/1282`.

| Gói | Thân gói đo được | Lúc nào |
|---|---|---|
| `s2c/1279` | `00000008`, tức i32 = 8 | Cùng một lúc với `s2c/1282` |
| `s2c/1282` | `0000000000000000`, 8 byte 0 (2 × i32 hoặc i64, chưa rõ) | Một lần, ngay sau `c2s/30`, giữa `s2c/1220` và `s2c/30` |

Thứ tự lúc vào thế giới: `c2s/9` → `s2c/9` → `c2s/30` → `s2c/46` → `s2c/39` → `s2c/1195` → `s2c/1220` → **`s2c/1279`** → **`s2c/1282`** → `s2c/30` → `c2s/42` … [Đo]

- **Server có bắt buộc trả lời không:** lần 12:12 bot đứng yên 140 giây, chỉ gửi heartbeat `c2s/1` và không trả lời `s2c/1282`. Server **không gửi lại** `s2c/1282` và **không ngắt kết nối**: 70 heartbeat đều được trả lời, các gói đẩy như `s2c/1262`, `s2c/1183`, `s2c/1253` vẫn tới đều. Phiên dừng vì người dùng ngắt tay, không phải do server. Server có ghi nhận nick "không trả lời" hay xử lý sau đó không thì không thấy được từ phía client. [Đo]
- **Game thật làm gì:** khi nhận `s2c/1282`, game đọc trạng thái máy rồi gửi `c2s/1282` 3 byte (xem trên). Ý nghĩa 8 byte của `s2c/1282` và số 8 của `s2c/1279` chưa rõ. Có thể là mốc thời gian hay chu kỳ hỏi lại, chưa thấy lần hỏi thứ hai. [Suy luận]
- **Chưa đo:** game thật có gửi `c2s/1282` ngay lúc nhận `s2c/1282` không (cần bắt gói trên điện thoại); server có hỏi lại sau một thời gian dài hơn 140 giây không.
- **Không làm:** gửi `c2s/1282` với giá trị giả (giả máy không bật adb), vì đó là qua mặt cơ chế chống bot của game.

## Khác

- **Kiểm tra bản quyền Google Play (PairIP).** Thêm `com.pairip.licensecheck`; `Application` của app thành `com.pairip.application.Application`, cần quyền `CHECK_LICENSE`. Chỉ ảnh hưởng tới game trên điện thoại, ví dụ khi cài APK bằng adb. [Đo]
- **Bỏ quyền** `READ_MEDIA_AUDIO` và `READ_EXTERNAL_STORAGE`. [Đo]
- **Chữ mới trong game:**
  - Tự động đánh có hạn giờ mỗi ngày ("Giờ tự động còn hôm nay", "Hôm nay đã hết giờ tự động. Giờ mới có lúc 0:00.").
  - Nhập mã quà tặng (sai quá 5 lần thì khoá 24 giờ).
  - Sứ quân ("Gia nhập một sứ quân để tranh châu").
  - Có khoá `colau.autofarm.fake`, `colau.autopath.map`, `colau.autopath.target`, và dòng dev "[dev] Server giả tự động cày: BẬT (8 giờ miễn phí)".

  [Đo chuỗi]

## Cách làm lại

1. `adb pull` các file split APK.
2. `jadx --no-res` cho `classes.dex`; `apktool d -s` để xem manifest.
3. r2:
   - `ir` lấy relocation. Tên các hàm trung gian của PLT (`CallObjectMethod`, `CallNonvirtualVoidMethod`…) suy ra từ ô `.got.plt` tương ứng: stub thứ i ở `.plt + 0x20 + 16i` dùng ô `.got.plt + 0x18 + 8i`.
   - Bảng chuỗi chung của 1.1.0 nằm ở `string_pool::get_pool()` = vaddr `0x3899400`, offset file `0x3891400`. Chuỗi ở dạng chữ thường, nên tên và chữ ký trong `GetMethodID`/`GetFieldID` đọc thẳng được từ `add xN, x8, #off` (kể cả dạng `add x8, x8, #hi, lsl 12`).
   - Mã gói nằm ở `mov w4, #op` ngay trước constructor `sqi.<init>(I)V`.
