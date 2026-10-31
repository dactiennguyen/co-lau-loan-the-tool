# Điều tra app Cờ Lau Loạn Thế

Mốc phân tích: file `colauloanthe.1.0.3.apk`, SHA-256 `f6173f90481980b4d81ad0c93ff51c7703a9f2e536c0ba5054b17cb519b5b4dc`. Kết quả từ phân tích APK và quan sát runtime trên thiết bị người dùng ngày 29/10/2026.

| Cần tra | Tài liệu |
|---|---|
| APK/DEX/native, version, kiến trúc và package liên quan | [Artifact và binary](artifact.md) |
| Đã dùng công cụ gì, lần theo hàm nào, thu byte/field như thế nào; các phiên bắt gói A1, B1, L1, Q2… | [Phương pháp điều tra](investigation.md) |
| TCP, seed, header, encoded opcode, key và XOR | [Giao thức nhị phân](protocol.md) |
| 95 gói gửi/nhận, khi nào xuất hiện, body và bước tiếp | [Luồng và event](events/README.md) |
| Đánh quái: bàn cờ 8×8, các gói trong trận, phần thưởng | [Đánh quái](events/05-battle.md) |
| Quái của map, toạ độ, di chuyển, đổi khu, code va chạm | [Bản đồ và quái](events/06-map-mobs.md) |
| Đánh quái online hay offline, luật rơi/lấp, thuật toán bot, dữ liệu mẫu trận thắng | [Đánh quái tự động](events/07-auto-battle.md) |
| Danh sách máy chủ, kết nối, heartbeat, 25 map, 100 khu và số người mỗi khu | [Máy chủ, bản đồ, khu vực](events/08-server-map-zone.md) |
| Di chuyển của mình, vị trí/vào/ra/trang bị/HP của người khác, chat Thế giới, vật phẩm rơi | [Người chơi và chat](events/09-players-chat.md) |
| Nhiệm vụ, chuỗi nhiệm vụ đã thấy, kết quả bot TS tự làm nhiệm vụ | [Nhiệm vụ](events/10-quests.md) |
| Các bảng chức năng: thư, bạn bè, xếp hạng, Bảo Điển, sứ quân | [Bảng chức năng](events/11-panels.md) |
| Kỹ năng, điểm tiềm năng, túi đồ, sửa đồ, luật trong Cẩm nang | [Kỹ năng và vật phẩm](events/12-skills-items.md) |
| Đồ rơi, nhặt đồ, tên của 646 vật phẩm và 17 mã chỉ số, giải mã icon (dữ liệu game trên máy) | [Đồ rơi và vật phẩm](events/13-drops-items.md) |
| Bảng đổi opcode nghiệp vụ ↔ int32 trên dây; 119 opcode chưa thấy | [Opcode map](opcode-map.md) |
| Mọi gói client gửi được: hàm dựng native, opcode, kiểu từng trường | [Hàm dựng gói](c2s-builders.md) |
| Gói nào mang dữ liệu nhân vật, map, HP/cấp và field nào chưa rõ | [Dữ liệu nhân vật](user-data.md) |
| App cập nhật: điều tra lại lớp nào và giữ bằng chứng gì | [Điều tra lại bản mới](reinvestigation.md) |

Mỗi lần điều tra Android, kết quả được ghi vào thư mục này trước. Sau đó phần mô phỏng TypeScript ([Tích hợp Node.js](../integration/nodejs/README.md)) mới dùng tới, rồi mới đến app Rust ([App Rust](../integration/rust/README.md)).

## Độ chắc chắn

- **Quan sát:** đọc trực tiếp từ artifact, syscall, packet hoặc getter native.
- **Suy luận:** vai trò của field/gói dựa trên tương quan byte với UI hoặc nhiều mẫu; chưa có tên gốc được khôi phục.
- **Chưa rõ:** chưa đủ schema, chưa chạy nhánh hoặc chưa có công cụ để kết luận.

Trên dây chỉ thấy opcode số; `character_data`, `skills_data`… là nhãn phân tích. Các body lớn mới giải một phần được ghi rõ số byte còn chưa hiểu. Bộ tài liệu này chưa mô tả toàn bộ gameplay, reconnect/redirect, tạo nhân vật hoặc mọi lỗi xác thực.

Bản giải nén, raw trace và script hook tạm đã dọn. Tài liệu giữ lại cách điều tra, điểm quan sát, ví dụ byte và giới hạn; không coi việc đã xoá file tạm là bằng chứng rằng một nhánh chưa đo đã được xác minh.
