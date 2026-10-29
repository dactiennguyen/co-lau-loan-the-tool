# Tài liệu phân tích — Cờ Lau Loạn Thế (APK 1.0.0)

Tài liệu kỹ thuật mô tả **kiến trúc và hành vi** của ứng dụng `com.lotasoft.colauloanthe`, phục vụ mục đích hiểu và đánh giá bảo mật chính ứng dụng của mình. Dựa trên phân tích tĩnh file APK và quan sát động trên thiết bị của người dùng (có uỷ quyền).

## Mục lục

| Tài liệu | Nội dung |
|---|---|
| [kien-truc-apk.md](kien-truc-apk.md) | Kiến trúc tổng thể: engine (libGDX 1.14.2), lớp bảo vệ code (R8 + native-obfuscator), bố cục APK, phân rã module, tài nguyên mã hoá, suy luận gameplay. |
| [giao-tiep-server-va-login.md](giao-tiep-server-va-login.md) | Luồng đăng nhập và giao tiếp server: endpoint thật, khung gói nhị phân, heartbeat, quan sát mã hoá (AES-ECB cho asset) — có cả phần phân tích động bằng Frida. |

## Tóm tắt nhanh

- **Engine:** libGDX 1.14.2 (Java), gần như toàn bộ logic game đã dịch sang C++ native trong `libgdx-flashds.so`.
- **Kết nối:** TCP thô tới server game (cổng 1688, giao thức nhị phân, không TLS) + HTTPS tới CDN (Cloudflare) cho tài nguyên.
- **Tài nguyên:** file `.dat` mã hoá AES/ECB — chế độ ECB làm lộ cấu trúc dữ liệu (điểm cần cải thiện).
- **Phương pháp:** APK tĩnh (jadx, aapt2, REA) + động (adb, Frida trên máy đã root của người dùng).

## Khuyến nghị bảo mật (cho đội phát triển app)

- Cân nhắc **bật TLS** cho kênh game (hiện là TCP cleartext).
- Chuyển cipher tài nguyên/dữ liệu từ **AES-ECB** sang chế độ có IV (CBC/GCM/CTR) để không lộ cấu trúc.
- Khoá AES hiện là hằng tĩnh trong ứng dụng; cân nhắc cơ chế khoá theo phiên.

## Phạm vi

Tài liệu dừng ở mức **hiểu kiến trúc và đánh giá bảo mật** của ứng dụng. Không bao gồm việc dựng client/bot hay bộ giải mã giao thức để tương tác trực tiếp với máy chủ đang vận hành.
