# Dữ liệu kiểm thử

Đã gom các JSON cũ vào duy nhất [fixtures.ts](fixtures.ts), chỉ dành cho kiểm thử. Client thật chỉ dùng src/; không đọc dữ liệu mẫu để tạo kết quả user.

| Mục | Bằng chứng |
|---|---|
| prelogin | Seed, key, byte trên dây và packet native độc lập; kiểm tra frame/XOR/phân mảnh |
| password-vectors | 16 vector native bằng mật khẩu giả |
| login-vectors | 5 payload dựng trên service giả, không gửi mạng |
| fields | Kiểu/offset getter native profile/map, chỉ giữ prefix cần cho parser |
| scenario | Body đầy đủ đại diện cho từng request/response/push, phục vụ regression |
| server-message | Packet 0 nhận thật từ Node: account đang online nơi khác |
| battles | Bàn đầu và từng bước của 3 trận thật (B1, run3, run4) để replay luật bàn cờ |
| battle-packets | Payload đủ byte của gói trận từ bot Q2: lượt, kết quả nước, bàn xếp lại, kỹ năng, chỉ số |
| world | Bản đồ thế giới, khu, người chơi, chat, vật phẩm rơi, di chuyển (L1/W1) |
| quest | Nhiệm vụ `s2c/39`, `34`, `35` và bảng xếp hạng `s2c/1254` |

[docs.test.ts](docs.test.ts) không dùng fixture: nó kiểm mọi link/anchor trong tài liệu, bảng gói của [events/README](../docs/app/events/README.md) và các mục event 01–04 khớp catalog trong `src/events.ts`, và các con số "đã ghi N gói", "N opcode chưa thấy" khớp catalog và danh sách trong [opcode-map](../docs/app/opcode-map.md#unseen).

Cấu hình bản APK và bảng opcode là code trong [src/config.ts](../src/config.ts). Kết quả kiểm tra Node với tài khoản thật nằm trong [báo cáo tích hợp](../docs/integration/nodejs/live-check.md); cách chạy regression/chẩn đoán ở [hướng dẫn Node.js](../docs/integration/nodejs/diagnostics.md).

Fixture giữ dữ liệu cũ làm chuẩn so byte; giá trị HP/vị trí thay đổi trong lần chạy thật là bình thường. Không lưu mật khẩu hoặc outgoing proof của tài khoản thật.
