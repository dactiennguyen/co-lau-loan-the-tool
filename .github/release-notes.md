## Tải về

| Máy | File |
|---|---|
| macOS chip Apple (M1 trở lên) | `colautool_{{VERSION}}_macos_aarch64.dmg` |
| macOS chip Intel | `colautool_{{VERSION}}_macos_x64.dmg` |
| Windows 10/11 | `colautool_{{VERSION}}_windows_x64-setup.exe` (bộ cài), `colautool_{{VERSION}}_windows_x64.msi`, hoặc `colautool_{{VERSION}}_windows_x64_portable.exe` (chạy luôn, không cài) |
| Ubuntu, Debian | `colautool_{{VERSION}}_linux_x64.deb` |
| Fedora, RHEL | `colautool_{{VERSION}}_linux_x64.rpm` |
| Linux khác | `colautool_{{VERSION}}_linux_x64.AppImage`: `chmod +x` rồi chạy |

Bản `.app.zip` là app macOS dạng nén, dùng khi không muốn mở file `.dmg`. Kiểm tra file tải về bằng `SHA256SUMS.txt` (`shasum -a 256 -c SHA256SUMS.txt --ignore-missing`).

## Bản này chưa ký số

- **macOS** báo "app bị hỏng" hoặc "không thể mở": kéo `colautool.app` vào Applications, rồi chạy một lần trong Terminal:
  ```bash
  xattr -cr /Applications/colautool.app
  ```
- **Windows** hiện "Windows protected your PC": bấm **More info** → **Run anyway**.

Mỗi nick không được online ở máy khác khi dùng app.
