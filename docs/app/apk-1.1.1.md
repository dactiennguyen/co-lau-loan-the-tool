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
- **Trận đánh**: bot TS thắng một trận Quái Điểu (09:11), chạy lại không lệch nước nào, không gói đọc thiếu. `s2c/22` và `s2c/19` (bàn cờ xếp lại) vẫn chỉ được bộ giải mã chung đọc phần đầu, như 40 trận app ngay trước cập nhật. Game thật mở trận bằng `c2s/15` (`string mobId; u8 1`), `c2s/18` (uuid), nước đi `c2s/14`. Cờ của `c2s/15` là **1** với mọi lần thách đấu bằng nút tấn công (chạm quái chỉ chọn nó), không phải 0 như bot lúc đó gửi: đo hai lần ngày 22/11, một lần ngay sau khi mở game, chưa mở Tự động. Từ 22/11 bot TS và app gửi 1 ([05-battle](events/05-battle.md#c2s-15)). [Đo]

## Đổi

| Gói | Thay đổi | Sửa |
|---|---|---|
| `s2c/9` | Thêm **một chuỗi** cuối gói, sau phần sứ quân: chữ số, có lẽ là mã nhân vật (tiheo1 `"100005131"`). App 2.2.1 đọc tới phần sứ quân thì còn thừa 13 byte nên bỏ bố cục có `field5` của bản ghi vật phẩm, thử bố cục không có `field5` và trượt ở byte 384: "Không đọc được trang bị trong s2c/9 … at 384". App mất ô trang bị đang mặc và hiệu ứng (x2 EXP); túi đồ (`s2c/42`) vẫn đúng. | `characterTail` (TS) và `character_tail` (Rust) đọc chuỗi khi còn byte (`code`); gói cũ vẫn đọc được. Mẫu ở `test/fixtures-v111.ts`. |
| `c2s/1282` | Không đổi, nhưng từ 22/11 bot TS và app gửi `00 00 00` (máy sạch: không gỡ lỗi, không chế độ nhà phát triển, không dịch vụ trợ năng), ngay sau `s2c/4`, trước `c2s/1284`, như game. Server không trả gói nào. | `buildRequest(1282)`, `requests.rs`, `client.ts`, `session.rs`. |
| Tên lớp | Làm rối lại: lớp phiên `sqnf` → `sqng`, gói `com.mh.w.sqi` → `com.mh.w.sqk`; hàm gửi `com.mh.sqfi.a(sqk)` (export `…sqfi_14716__ngen_native_a6E`), hàm đọc `com.mh.sqpr.e()` (`…sqpr_44616__ngen_native_e6E`). Agent Frida của 1.1.1: `captures/v111-2026-11-22/agent.js`. | |

## Nhịp của game (Frida, 22/11)

Hai lượt so gói của game với gói bot gửi (mọi `c2s` của các bản ghi `captures/v111-2026-11-22/game-1.1.1*.jsonl`, `bh2-2026-11-21`, `mp1-2026-11-22`, `vg1-2026-11-20`) cho thấy bố cục đã giống, chỉ còn khác ở nhịp và ở vài trường. Bot TS và app sửa theo từ 22/11: [Đo]

| Chỗ | Game 1.1.1 | Sửa |
|---|---|---|
| Heartbeat `c2s/1` | Mỗi 2 s tới `s2c/4`; trong game lần đầu ~25 s sau `s2c/4`, rồi mỗi 30 s (30,00–30,8 s), cả trong trận | `client.ts`, `session.rs`; app coi mất kết nối sau 70 s im lặng (trước 30 s) |
| `c2s/15` | cờ 1 với mọi quái | mặc định 1 (`buildRequest`, `requests.rs`) |
| `c2s/11` | `i32` là số thứ tự map khi map đã tải trong phiên, -1 lần đầu; `u8` là `ff` sau cổng và lúc đăng nhập, khu mới sau đổi khu, khu đang đứng sau trận và khi đầu hàng ([06](events/06-map-mobs.md#c2s-11)) | `MapLoads` (TS, Rust) |
| Sau trận | `c2s/11` 2,4–4,7 s sau khi hết trận, `c2s/43` 0,3–0,8 s sau `s2c/11`, rồi mới nhặt đồ và thách đấu ([05](events/05-battle.md#sau-trận)) | `QuestBot`, `bot/reload.rs` (trừ Bạch Hổ) |
| Đầu hàng | `c2s/11` (map, khu, số) và `c2s/40` cùng lúc, `c2s/43` ~0,6 s sau `s2c/1214` | `BattleRunner.leave`, `runner_v3.rs`, `fight.rs` |
| Trong trận | `c2s/18` 1,1–1,6 s sau `s2c/22`; `c2s/14` 1–2 s sau lượt quái khi bàn còn rơi, 10–40 ms khi hết giờ; nước mình không dưới ~1,2 s | `battle-runner.ts`, `runner_v3.rs` |
| Đăng nhập, vào map, NPC | các khoảng ở [02-login](events/02-login.md#nhịp-như-người-chơi) | `human.ts`, `human.rs` |

Chưa làm: `c2s/1169` (vị trí), vì bố cục của 1.1.x chưa đo.

## Cờ thách đấu chọn kiểu trận

`c2s/15` cờ 1 → `s2c/18` `timed = 1` với quái thường: mình đi trước, vẫn theo lượt (`s2c/24`), đồng hồ ~30 s mỗi lượt. Cờ 0 → `timed = 0`, quái đi trước. Bot trước 22/11 gửi cờ 0 nên trận của nó khác trận của game ngay từ lượt đầu. Bot giờ gửi cờ 1, đi nước đầu sau 1,2–2,6 s, và chuyển sang trận theo lượt ở `s2c/24` đầu tiên (Sơn Tặc, Bạch Hổ không có `s2c/24`). Bot TS đánh thử 2 trận Độc Hoa với nhịp mới (22/11 10:15): thắng cả hai, chạy lại 0 lệch; ping 30 s, `c2s/18` 1,2–1,4 s, nước đầu 1,3–2,1 s, tải lại map 2–2,8 s sau trận. [Đo]

## Gói mới giải được

`s2c/1266`, lúc vào game: **lịch sử chat** (14 tin sứ quân trước cập nhật, 0 tin ngay sau server khởi động lại). Đọc hết 790 byte:

```text
u8 kênh (1); u8 n; n × {i64 lúc (ms); i32 id người chơi (0 = tin hệ thống); string tên; u8 (0 hoặc 4, chưa rõ); string nội dung}
```

Tin hệ thống có id 0, tên rỗng: "… đã gia nhập sứ quân", "Sứ quân đứng hạng 1 Bạch Hổ hôm nay: Thanh thế +300 …", "… góp 111.111 Xu vào quân lương". [Đo]

**Hòm thư và Tự động** (game 1.1.1, 22/11): [Đo]

- `c2s/1281` (rỗng) là tab **Thư đã gửi** của Hòm thư; server trả `s2c/1281` với một `i32` là số thư đã gửi (`00000000` khi chưa gửi thư nào).
- Hòm thư có thêm tab **Gửi thư**: người nhận, tiêu đề, nội dung, tối đa 6 vật phẩm đính kèm, phí 1.000 Xu. Gói gửi chưa bắt.
- `c2s/1276` (1 byte `00`) là lúc **mở cửa sổ Tự động**; server trả `s2c/1276`. Cửa sổ này cần giờ Bùa Tự Động.

## Chưa rõ

- Mã trong `s2c/9` là gì (ID hiển thị, mã mời?). [Chưa rõ]
- Server làm gì với cờ của `c2s/1276`. [Chưa rõ]
- Server làm gì với `c2s/1282`. [Chưa rõ]
