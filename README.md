# Cờ Lau Loạn Thế

Kho này lưu kết quả điều tra APK, phần tích hợp TypeScript (Node.js) dựa trên giao thức đã xác minh, và app Rust nhiều nick dựng trên những gì bản TypeScript đã chạy được. Tài liệu được chia theo mục đích tra cứu:

| Nội dung | Tài liệu |
|---|---|
| Binary/DEX/native, công cụ và phương pháp điều tra, byte giao thức, event, dữ liệu nhân vật | [Điều tra app](docs/app/README.md) |
| Chạy client Node.js, dùng API, lấy user, đọc log, chẩn đoán và kiểm thử | [Tích hợp Node.js](docs/integration/nodejs/README.md) |
| Bot Node.js tự làm nhiệm vụ, đánh quái không giao diện | [Bot làm nhiệm vụ](docs/integration/nodejs/quest-bot.md) |
| App desktop (Tauri 2, React + TypeScript, lõi Rust): nhiều nick; cấp, EXP, chỉ số, vị trí và số người xung quanh của từng nick; chọn quái/boss và số trận để tự đánh | [App Rust](docs/integration/rust/README.md) |
| Build và phát hành app `colautool` cho macOS, Windows, Ubuntu bằng GitHub Actions | [CI/CD và phát hành](docs/integration/rust/README.md#cicd-và-phát-hành) |
| Toàn bộ mục lục tài liệu | [docs](docs/README.md) |
| Nguồn dữ liệu và phạm vi regression | [test](test/README.md) |

Mốc app hiện tại là `colauloanthe.1.0.3.apk`, được nhận diện bằng hash trong [artifact](docs/app/artifact.md). Phần tích hợp đã có [báo cáo đăng nhập và lấy user/map từ server thật](docs/integration/nodejs/live-check.md).

## Quy trình

Repo phát triển song song TypeScript và Rust, theo đúng thứ tự sau:

1. **Điều tra Android** (APK, Frida, REA, bắt gói trên điện thoại): ghi kết quả vào [docs/app](docs/app/README.md) ngay khi tìm ra, kèm bằng chứng và độ chắc chắn.
2. **Mô phỏng bằng TypeScript** trong `src/` và `test/`: viết decoder, bot, mô phỏng; dùng gói thật làm fixture; chạy thật bằng `npm run …`; ghi kết quả chạy vào docs.
3. **Port sang Rust** trong `app/`, chỉ khi bản TypeScript đã qua test và đã chạy thật. Lệnh `npm run export:rust` xuất bảng opcode và vector kiểm thử từ TypeScript, và `cargo test` phải khớp ([App Rust](docs/integration/rust/README.md#quy-trình-android--docs--typescript--rust)).

`src/` là nơi thử trước, còn `app/` là app thật. Không viết thẳng vào Rust một tính năng chưa có bên TypeScript.

Để chạy client, dùng Node.js ≥22.6 và làm theo [hướng dẫn tích hợp](docs/integration/nodejs/README.md). Node chạy thẳng file `.ts` mà không kiểm kiểu, nên `npm install` một lần rồi `npm test`: lệnh này chạy `tsc --noEmit` trên `src/` và `test/` ([tsconfig.json](tsconfig.json), có cả `npm run typecheck`) rồi mới chạy test; CI cũng vậy. App Rust cần Rust ≥1.90, xem [App Rust](docs/integration/rust/README.md#chạy). Script điều tra/sinh tài liệu tạm đã được xoá; phương pháp, điểm quan sát và kết quả nằm trong `docs/app/` để tra lại.
