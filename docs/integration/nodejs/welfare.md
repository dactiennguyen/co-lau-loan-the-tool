# Phúc lợi bằng Node.js: Điểm danh, Quà online, Quà thăng cấp

`npm run welfare` nhận quà của 3 tab Phúc lợi bằng các gói đã đo ở PL1 (20/11, akaito) ([18-players-checkin](../../app/events/18-players-checkin.md#điểm-danh)). Lệnh chạy được từ bất kỳ đâu sau khi vào game, không cần mở NPC hay bảng nào.

| Quà | Gói | Khi nào có |
|---|---|---|
| Điểm danh | `c2s/1232 (64, 0)` | Mỗi ngày một lần, reset 00:00 |
| Mốc tháng (7, 14, 21, 28 ngày) | `c2s/1232 (64, mãMốc)` | Đủ số ngày điểm danh trong tháng; **chưa đo** |
| Quà online | `c2s/1233 (21)` | Đủ 30, 60, 120, 180 phút online trong ngày |
| Quà thăng cấp | `c2s/1233 (65)` | Đạt cấp 10, 21, 30, 40, 51, 75, 101 |

Code nằm ở các file sau:

- gói: [src/protocol/welfare.ts](../../../src/protocol/welfare.ts);
- luồng: [src/bot/welfare.ts](../../../src/bot/welfare.ts);
- CLI: [src/cli/welfare-run.ts](../../../src/cli/welfare-run.ts);
- test: [test/welfare.test.ts](../../../test/welfare.test.ts), phát lại gói PL1 ([test/fixtures-pl1.ts](../../../test/fixtures-pl1.ts)).

## Luồng

1. Hỏi định nghĩa và tiến độ của 3 sự kiện như game làm khi mở tab: `c2s/1236` rồi `c2s/1239`, mỗi gói một khoá (`CHECKIN_MONTHLY`, `ONLINE_DAILY`, `LEVEL_UP`). Mã sự kiện (64, 21, 65) lấy từ định nghĩa, không viết cứng.
2. Lập danh sách việc cần làm:
   - **Điểm danh** khi `hômNayĐãĐiểmDanh` = 0;
   - **mốc tháng** có trạng thái 1;
   - **Quà online** và **Quà thăng cấp** khi có mốc trạng thái 1.

   Trạng thái mốc: 0 chưa đủ, 1 nhận được, 2 đã nhận.
3. Không có `--confirm` thì dừng ở đây (`dry_run`). Không có gì để nhận thì kết quả là `nothing`.
4. Kiểm túi trước mỗi lần nhận:
   - Điểm danh cần số ô của món lớn nhất trong 10 món quà ngày, vì quà là ngẫu nhiên;
   - các quà khác cần số ô của mọi mốc sắp nhận.

   Xu và Xu khóa không cần ô; món chồng được vào chồng đã có thì không cần ô mới (cách tính giống hòm thư). Túi thiếu chỗ thì bỏ qua lần nhận đó, ghi `skip`.
5. Gửi từng gói, chờ câu trả lời và ghi `claim`, kèm:
   - lời server;
   - tiền trước và sau;
   - trạng thái mốc mới.

   Server không trả lời thì ghi lỗi rồi làm tiếp lần nhận sau.

`s2c/1279` (đến lúc vào game) là mặt nạ chấm đỏ của Phúc lợi: bit 0 là Online, bit 3 là Điểm danh. Lệnh ghi lại giá trị này nhưng không dựa vào nó, vì tiến độ `c2s/1239` đã đủ.

## Lệnh

```sh
npm run welfare -- --account=tiheo2                     # xem có gì để nhận (chỉ đọc)
npm run welfare -- --account=tiheo2 --confirm           # nhận
npm run welfare -- --account=tiheo2 --confirm --again   # gửi cả khi không còn gì, để xem server từ chối thế nào
```

Không có `--account` thì lệnh đăng nhập bằng `.env`, giống các lệnh khác ([mail](mail.md)). `CLLT_TRACE=<file>` ghi mọi gói vào file đó.

App Rust làm cùng việc này: ô Tiền → nút **Phúc lợi** có công tắc **Tự điểm danh và nhận quà** và nút **Nhận ngay** (`cllt-core` `welfare.rs`, `bot/welfare.rs`; [Phúc lợi](../rust/features.md#phúc-lợi)). Gói PL1 dùng chung: `npm run export:rust` đưa chúng vào `app/core/tests/vectors.json` cho `app/core/tests/welfare.rs`.
