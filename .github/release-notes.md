## Tải về

| Máy | File |
|---|---|
| macOS chip Apple (M1 trở lên) | `colautool_{{VERSION}}_macos_aarch64.dmg` |
| macOS chip Intel | `colautool_{{VERSION}}_macos_x64.dmg` |
| Windows 10/11 | `colautool_{{VERSION}}_windows_x64-setup.exe` (bộ cài), `colautool_{{VERSION}}_windows_x64.msi`, hoặc `colautool_{{VERSION}}_windows_x64_portable.exe` (chạy luôn, không cài) |
| Ubuntu, Debian | `colautool_{{VERSION}}_linux_x64.deb` |
| Fedora, RHEL | `colautool_{{VERSION}}_linux_x64.rpm` |
| Linux khác | `colautool_{{VERSION}}_linux_x64.AppImage`: `chmod +x` rồi chạy |
| Android 7 trở lên (máy arm64) | `colautool_{{VERSION}}_android_arm64.apk`: mở file trên điện thoại, cho phép cài từ nguồn này |

Bản `.app.zip` là app macOS dạng nén, dùng khi không muốn mở file `.dmg`. Kiểm tra file tải về bằng `SHA256SUMS.txt` (`shasum -a 256 -c SHA256SUMS.txt --ignore-missing`).

## Bản này chưa ký số

- **macOS** báo "app bị hỏng" hoặc "không thể mở": kéo `colautool.app` vào Applications, rồi chạy một lần trong Terminal:
  ```bash
  xattr -cr /Applications/colautool.app
  ```
- **Windows** hiện "Windows protected your PC": bấm **More info** → **Run anyway**.

## Tự cập nhật

App đã cài tự tìm bản mới trên trang Releases này (mỗi lần mở app), tải về và kiểm chữ ký. Tải xong, thanh bên có nút **Khởi động lại để cập nhật**; không bấm thì bản mới tự cài khi tắt app. Bản `_portable.exe` và bản Android không tự cập nhật: Android cài file `.apk` mới đè lên bản cũ, nick và key giữ nguyên. Bản 0.2.0 trở về trước chưa có tính năng này: cài tay bản mới một lần, từ đó về sau app tự cập nhật.

Mỗi nick không được online ở máy khác khi dùng app.
