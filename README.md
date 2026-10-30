# Cờ Lau Loạn Thế

Kho này lưu kết quả điều tra APK và phần tích hợp Node.js dựa trên giao thức đã xác minh. Tài liệu được chia theo mục đích tra cứu:

| Nội dung | Tài liệu |
|---|---|
| Binary/DEX/native, công cụ và phương pháp điều tra, byte giao thức, event, dữ liệu nhân vật | [Điều tra app](docs/app/README.md) |
| Chạy client Node.js, dùng API, lấy user, đọc log, chẩn đoán và kiểm thử | [Tích hợp Node.js](docs/integration/nodejs/README.md) |
| Bot Node.js tự làm nhiệm vụ, đánh quái không giao diện | [Bot làm nhiệm vụ](docs/integration/nodejs/quest-bot.md) |
| Toàn bộ mục lục tài liệu | [docs](docs/README.md) |
| Nguồn dữ liệu và phạm vi regression | [test](test/README.md) |

Mốc app hiện tại là `colauloanthe.1.0.3.apk`, được nhận diện bằng hash trong [artifact](docs/app/artifact.md). Phần tích hợp đã có [báo cáo đăng nhập và lấy user/map từ server thật](docs/integration/nodejs/live-check.md).

Để chạy client, dùng Node.js ≥22.6 và làm theo [hướng dẫn tích hợp](docs/integration/nodejs/README.md). Script điều tra/sinh tài liệu tạm đã được xoá; phương pháp, điểm quan sát và kết quả nằm trong `docs/app/` để tra lại.
