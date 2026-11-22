# Game 1.1.1 và server cập nhật (22/11)

Mốc: điện thoại cập nhật game lên `versionName 1.1.1`, `versionCode 5` lúc 09:02 ngày 22/11/2026. Server khởi động lại cùng lúc: mọi nick của app bị ngắt lúc 09:02:19 ("Server đã đóng kết nối"). File APK ở `captures/apk-1.1.1/` (gitignore). Nhãn: **[Đo]**, **[Suy luận]**, **[Chưa rõ]**.

| File | SHA-256 |
|---|---|
| `base.apk` | `9aedfefb590e2f96de394287376385eef378932c1722a4de9a2edbc23b9a5160` |
| `split_config.arm64_v8a.apk` | `00ee4edf53c81f1b8fb0eb1a87c82ed0a462300c1369becb267245703d425025` |
| `classes.dex` | `ef10640f3d9ba32aa4a1200a4ecc669b1eab503ed286037263c1ca3856e7f536` |
| `libgdx-flashds.so` (59.965.912 byte; 1.1.0 là 59.590.816) | `2c8e9ef524b840a527c1d7c42987fdb207cc4f62ee45f0a7b9f13ce82487ad0a` |

## Không đổi

- Phiên bản giao thức vẫn `0.0.7` (`com.mh.sqng.E`), máy chủ mặc định vẫn `Thanh Khê:plays1.colauloanthe.vn:1688:0`. Màn đăng nhập vẫn ghi "Phiên bản: 1.1.0" (`MyGame2D`). [Đo]
- **Gói đăng nhập** của game (Frida, nick manina3, 09:10): `c2s/1206`, `5`, `2`, `3`, `4`, `1284`, `9`, `30`, `42`, `29`, `11`, `43` cùng thứ tự và cùng bố cục với bot; mã băm tên trong `c2s/4` khớp `usernameHash` (`manina3` → `0x17c0c700`). Game vẫn gửi `c2s/1282` = `01 00 00`. [Đo]
- **Gói server** (bot TS đăng nhập tiheo1 và đi 11 map, 09:08, so với trace của chính nick đó lúc 08:23): mọi gói đăng nhập, bản đồ (`s2c/11`, `13`, `43`, `1177`), người chơi (`1262`, `1263`), đồ rơi (`1182`, `1183`, `1184`), túi đồ (`42`) đọc hết byte như trước. [Đo]
- **Trận đánh**: bot TS thắng một trận Quái Điểu (09:11), chạy lại không lệch nước nào, không gói đọc thiếu. `s2c/22` và `s2c/19` (bàn cờ xếp lại) vẫn chỉ được bộ giải mã chung đọc phần đầu, như 40 trận app ngay trước cập nhật. Game thật mở trận bằng `c2s/15` (`string mobId; u8 1`), `c2s/18` (uuid), nước đi `c2s/14`, như bot. [Đo]

## Đổi

| Gói | Thay đổi | Sửa |
|---|---|---|
| `s2c/9` | Thêm **một chuỗi** cuối gói, sau phần sứ quân: chữ số, có lẽ là mã nhân vật (tiheo1 `"100005131"`). App 2.2.1 đọc tới phần sứ quân thì còn thừa 13 byte nên bỏ bố cục có `field5` của bản ghi vật phẩm, thử bố cục không có `field5` và trượt ở byte 384: "Không đọc được trang bị trong s2c/9 … at 384". App mất ô trang bị đang mặc và hiệu ứng (x2 EXP); túi đồ (`s2c/42`) vẫn đúng. | `characterTail` (TS) và `character_tail` (Rust) đọc chuỗi khi còn byte (`code`); gói cũ vẫn đọc được. Mẫu ở `test/fixtures-v111.ts`. |
| `c2s/1282` | Không đổi, nhưng từ 22/11 bot TS và app gửi `00 00 00` (máy sạch: không gỡ lỗi, không chế độ nhà phát triển, không dịch vụ trợ năng), ngay sau `s2c/4`, trước `c2s/1284`, như game. Server không trả gói nào. | `buildRequest(1282)`, `requests.rs`, `client.ts`, `session.rs`. |
| Tên lớp | Làm rối lại: lớp phiên `sqnf` → `sqng`, gói `com.mh.w.sqi` → `com.mh.w.sqk`; hàm gửi `com.mh.sqfi.a(sqk)` (export `…sqfi_14716__ngen_native_a6E`), hàm đọc `com.mh.sqpr.e()` (`…sqpr_44616__ngen_native_e6E`). Agent Frida của 1.1.1: `captures/v111-2026-11-22/agent.js`. | |

## Gói mới giải được

`s2c/1266`, lúc vào game: **lịch sử chat** (14 tin sứ quân trước cập nhật, 0 tin ngay sau server khởi động lại). Đọc hết 790 byte:

```text
u8 kênh (1); u8 n; n × {i64 lúc (ms); i32 id người chơi (0 = tin hệ thống); string tên; u8 (0 hoặc 4, chưa rõ); string nội dung}
```

Tin hệ thống có id 0, tên rỗng: "… đã gia nhập sứ quân", "Sứ quân đứng hạng 1 Bạch Hổ hôm nay: Thanh thế +300 …", "… góp 111.111 Xu vào quân lương". [Đo]

## Chưa rõ

- Mã trong `s2c/9` là gì (ID hiển thị, mã mời?). [Chưa rõ]
- `c2s/1276` (1 byte `00`), game gửi khi mở cửa sổ Tự động. [Chưa rõ]
- Server làm gì với `c2s/1282`. [Chưa rõ]
