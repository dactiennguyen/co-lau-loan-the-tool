# Điều tra app Cờ Lau Loạn Thế

Mốc phân tích: file `colauloanthe.1.0.3.apk`, SHA-256 `f6173f90481980b4d81ad0c93ff51c7703a9f2e536c0ba5054b17cb519b5b4dc`. Kết quả từ phân tích APK và quan sát runtime trên thiết bị người dùng ngày 29/10/2026.

| Cần tra | Tài liệu |
|---|---|
| APK/DEX/native, version, kiến trúc và package liên quan | [Artifact và binary](artifact.md) |
| Đã dùng công cụ gì, lần theo hàm nào, thu byte/field như thế nào | [Phương pháp điều tra](investigation.md) |
| TCP, seed, header, encoded opcode, key và XOR | [Giao thức nhị phân](protocol.md) |
| 47 gói gửi/nhận, khi nào xuất hiện, body và bước tiếp | [Luồng và event](events/README.md) |
| Bảng đổi opcode nghiệp vụ ↔ int32 trên dây | [Opcode map](opcode-map.md) |
| Gói nào mang dữ liệu nhân vật, map, HP/cấp và field nào chưa rõ | [Dữ liệu nhân vật](user-data.md) |
| App cập nhật: điều tra lại lớp nào và giữ bằng chứng gì | [Điều tra lại bản mới](reinvestigation.md) |

## Độ chắc chắn

- **Quan sát:** đọc trực tiếp từ artifact, syscall, packet hoặc getter native.
- **Suy luận:** vai trò của field/gói dựa trên tương quan byte với UI hoặc nhiều mẫu; chưa có tên gốc được khôi phục.
- **Chưa rõ:** chưa đủ schema, chưa chạy nhánh hoặc chưa có công cụ để kết luận.

Trên dây chỉ thấy opcode số; `character_data`, `skills_data`… là nhãn phân tích. Các body lớn mới giải một phần được ghi rõ số byte còn chưa hiểu. Bộ tài liệu này chưa mô tả toàn bộ gameplay, reconnect/redirect, tạo nhân vật hoặc mọi lỗi xác thực.

Bản giải nén, raw trace và script hook tạm đã dọn. Tài liệu giữ lại cách điều tra, điểm quan sát, ví dụ byte và giới hạn; không coi việc đã xoá file tạm là bằng chứng rằng một nhánh chưa đo đã được xác minh.
