# Tài liệu Cờ Lau Loạn Thế

| Mục đích tra cứu | Thư mục |
|---|---|
| App chứa binary gì, đã điều tra bằng cách nào, giao thức và event thực tế ra sao | [Điều tra app](app/README.md) |
| Dùng kết quả điều tra để viết/chạy client Node.js, lấy user, đọc log và xử lý lỗi | [Tích hợp Node.js](integration/nodejs/README.md) |
| App Rust nhiều nick có giao diện, port từ phần TypeScript đã chạy được; quy trình Android → docs → TS → Rust | [App Rust](integration/rust/README.md) |
| Tổng quan kiến trúc: các lớp từ APK tới giao diện, thư mục `src/` và `app/`, kiểm thử, cách thêm một tính năng | [Kiến trúc](architecture.md) |

Phần `app/` mô tả artifact, phương pháp, byte và mức độ chắc chắn của kết luận. Phần `integration/` mô tả API/code/lệnh chạy của dự án và kết quả kiểm thử tích hợp: `nodejs/` là bản TypeScript, nơi thử trước; `rust/` là app, chỉ nhận những gì bản TypeScript đã chạy được. Schema app không phụ thuộc cách đặt tên field hay tổ chức code của một client cụ thể.
