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

Cấu hình bản APK và bảng opcode là code trong [src/config.ts](../src/config.ts). Kết quả kiểm tra Node với tài khoản thật nằm trong [báo cáo tích hợp](../docs/integration/nodejs/live-check.md); cách chạy regression/chẩn đoán ở [hướng dẫn Node.js](../docs/integration/nodejs/diagnostics.md).

Fixture giữ dữ liệu cũ làm chuẩn so byte; giá trị HP/vị trí thay đổi trong lần chạy thật là bình thường. Không lưu mật khẩu hoặc outgoing proof của tài khoản thật.
