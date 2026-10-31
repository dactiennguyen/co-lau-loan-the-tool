# Phát hành và tự cập nhật

Build trên GitHub Actions, phát hành một bản mới, và cách app đã cài tự cập nhật lên bản đó.

## CI/CD và phát hành

Có hai workflow trong `.github/workflows`, làm theo cách của [cockpit-tools](https://github.com/jlcodes99/cockpit-tools). Có tự cập nhật ([Tự cập nhật](#tự-cập-nhật)), nhưng chưa ký số Apple hay Windows:

| Workflow | Chạy khi | Làm gì |
|---|---|---|
| [build-matrix.yml](../../../.github/workflows/build-matrix.yml) | push lên `main`, mở pull request, hoặc bấm tay (Run workflow) | `npm ci` rồi `npm test` (`tsc --noEmit` trên `src/`, `test/` rồi mới chạy test); `cargo fmt`, `cargo clippy -D warnings`, `cargo test` trên Ubuntu; qua hết mới build app trên 4 máy song song. Có khoá updater trong Secrets thì mỗi bản build có thêm file cập nhật và `.sig`; pull request từ fork không có Secrets nên build không ký. File build nằm 14 ngày trong mục Artifacts của lần chạy |
| [release.yml](../../../.github/workflows/release.yml) | đẩy tag `v*` | Kiểm tra tag khớp version, gọi build-matrix.yml (chuyển Secrets sang), rồi tạo GitHub Release gồm mọi file, `.sig`, `SHA256SUMS.txt`, `latest.json` cho updater và [ghi chú cài đặt](../../../.github/release-notes.md). Thiếu chữ ký của một nền tảng nào thì dừng, không phát hành |

| Máy build | Target | File |
|---|---|---|
| `macos-latest` | `aarch64-apple-darwin` | `colautool_<version>_macos_aarch64.dmg`, `.app.zip`, và `.app.tar.gz` (file updater tải) |
| `macos-latest` (build chéo) | `x86_64-apple-darwin` | `colautool_<version>_macos_x64.dmg`, `.app.zip`, `.app.tar.gz` |
| `windows-latest` | `x86_64-pc-windows-msvc` | `colautool_<version>_windows_x64-setup.exe`, `.msi`, `_portable.exe` (chạy không cần cài) |
| `ubuntu-22.04` | `x86_64-unknown-linux-gnu` | `colautool_<version>_linux_x64.deb`, `.rpm`, `.AppImage` |

[stage-bundles.mjs](../../../.github/scripts/stage-bundles.mjs) đổi tên file Tauri sinh ra theo một mẫu chung, vì tên gốc lẫn lộn `x64`, `amd64`, `x86_64` và `en-US`. File `.sig` đi theo file của nó, cùng tên thêm `.sig`. [latest-json.mjs](../../../.github/scripts/latest-json.mjs) đọc các file đó để viết `latest.json`.

Phát hành một bản mới, ví dụ 0.1.1:
1. Đặt `version` thành `0.1.1` ở cả ba chỗ: [app/Cargo.toml](../../../app/Cargo.toml), [app/desktop/package.json](../../../app/desktop/package.json), [tauri.conf.json](../../../app/desktop/src-tauri/tauri.conf.json). Nếu tag lệch với bất kỳ chỗ nào, release dừng ngay.
2. Commit với tiêu đề "Release 0.1.1", phần thân ghi những gì đã đổi: phần thân này thành mục **Có gì mới** trong app của người dùng (`notes` của `latest.json`; đoạn cuối chỉ gồm các dòng `Co-Authored-By:`, `Signed-off-by:` thì bị bỏ). Rồi chạy `git tag v0.1.1 && git push origin main v0.1.1`.
3. Release hiện ra sau khi 4 bản build và bước publish xong. Bản đã publish không bao giờ bị ghi đè. Bản nháp do một lần chạy lỗi để lại thì bị thay.

Lưu ý:
- **Tên app là `colautool`** (`productName`), không dấu. Tên có dấu làm hỏng hai loại bộ cài:
  - WiX (`.msi`) chỉ nhận ký tự có trong code page 1252. "ờ", "ạ", "ế" không có trong 1252, và cũng không có trong 1258.
  - `.deb`/`.rpm` lấy tên gói là `productName` viết kebab-case, mà dpkg chỉ nhận a–z, 0–9, `+`, `-`, `.`.

  Tiêu đề cửa sổ vẫn là "Cờ Lau Loạn Thế". Identifier vẫn là `vn.colauloanthe.desktop`, nên thư mục chứa `accounts.json` không đổi.
- **Chưa ký số Apple, Windows:** macOS dùng chữ ký ad-hoc (`signingIdentity: "-"`), nên lần đầu người dùng phải chạy `xattr -cr /Applications/colautool.app`. Windows hiện cảnh báo SmartScreen. Muốn ký như cockpit-tools thì cần chứng chỉ Apple Developer ID và 6 secret `APPLE_*`. Chữ ký của updater (minisign, [Tự cập nhật](#tự-cập-nhật)) là chuyện khác: nó chỉ để app biết bản tải về đúng là của mình.
- **Rust 1.90 cố định** trong CI, để một lint clippy mới của bản stable sau không tự làm hỏng build.
- **Đã thử trên máy (30/10/2026):** build macOS Apple Silicon bằng đúng lệnh của CI ra `colautool.app` 4,8 MB và `.dmg` 2,6 MB. Script gom file và bước kiểm tra tag chạy đúng. Bản Intel, Windows và Ubuntu chỉ build trên GitHub Actions và chưa có lần chạy nào.

## Tự cập nhật

Bản cài của app tự tìm, tải và cài bản mới từ [GitHub Releases](https://github.com/dactiennguyen/co-lau-loan-the-tool/releases), giống [cockpit-tools](https://github.com/jlcodes99/cockpit-tools). Code ở `desktop/src-tauri/src/update.rs`, dùng [`tauri-plugin-updater`](https://v2.tauri.app/plugin/updater/) 2.14. Giao diện chỉ gọi 3 lệnh của app (`update_status`, `check_update`, `install_update`) và nghe sự kiện `update`; không mở quyền của plugin cho giao diện.

**Cách chạy:**
1. 20 giây sau khi mở app, rồi cứ 6 giờ một lần, hoặc khi bấm ⟳, app tải `https://github.com/dactiennguyen/co-lau-loan-the-tool/releases/latest/download/latest.json` (địa chỉ trong `plugins.updater.endpoints` của `tauri.conf.json`). Repo công khai nên không cần token.
2. `latest.json` có `version` mới hơn bản đang chạy thì app tải ngay file của đúng máy và đúng loại bộ cài, kèm thanh tiến độ. Tải xong, app kiểm chữ ký minisign của file với khoá công khai trong `tauri.conf.json` (`plugins.updater.pubkey`). Sai chữ ký thì không cài, báo "chữ ký của bản tải về không khớp". `requireSignedVersion` cũng bật: chữ ký phải ghi đúng phiên bản mà `latest.json` công bố. Nhờ vậy, kẻ sửa được `latest.json` cũng không ép được app cài lùi về một bản cũ, dù bản cũ đó vẫn mang chữ ký thật.
3. Bản đã kiểm được giữ trong bộ nhớ, rồi cài theo một trong hai cách:
   - **Khởi động lại để cập nhật:** app cho mọi nick đăng xuất, cài, rồi mở bản mới. Trên Windows bộ cài NSIS hay MSI chạy ở chế độ `passive` (chỉ có thanh tiến độ), app thoát và bộ cài mở lại app.
   - **Khi tắt app:** app cài trước khi thoát hẳn, lần sau mở là bản mới. Bước này chạy trong luồng riêng, chờ tối đa 30 giây. Trên macOS, app nằm ở thư mục người dùng không ghi được sẽ cần hỏi mật khẩu admin; lúc tắt app thì không hỏi được nữa, nên bản đó để lần sau, app không bị treo. Trên Windows bộ cài chạy rồi không mở lại app. Trên Linux, bản `.deb` và `.rpm` cài bằng `pkexec`, nên hệ thống hỏi mật khẩu (cả khi bấm Khởi động lại lẫn khi tắt app). Bản AppImage thì không hỏi.
4. `accounts.json` và `cllt.db` nằm trong thư mục dữ liệu của app nên cập nhật không đụng tới.

**Bản nào không tự cập nhật:** chỉ bản cài mới tự cập nhật (`.app`, bộ cài NSIS hay MSI, AppImage, `.deb`, `.rpm`). Bộ đóng gói ghi loại bộ cài vào file chạy, và app đọc nó qua `tauri::utils::platform::bundle_type()`. `tauri dev`, `cargo run` và `_portable.exe` không có loại bộ cài, nên tắt hẳn, dòng ở thanh bên ghi "không tự cập nhật". Nếu không tắt, bản portable sẽ cài bộ NSIS đè lên. `--sample` cũng tắt.

**`latest.json`** do [latest-json.mjs](../../../.github/scripts/latest-json.mjs) viết khi phát hành:
```json
{
  "version": "0.3.0",
  "notes": "phần thân của commit Release 0.3.0",
  "pub_date": "2026-11-01T02:00:00.000Z",
  "platforms": {
    "darwin-aarch64-app": { "signature": "<nội dung .sig>", "url": "https://github.com/…/releases/download/v0.3.0/colautool_0.3.0_macos_aarch64.app.tar.gz" },
    "windows-x86_64-nsis": { "…": "…" }
  }
}
```
Updater tìm `{hệ}-{kiến trúc}-{bộ cài}` trước (cài từ `.msi` thì lấy bản `.msi`, cài từ `.deb` thì lấy `.deb`), rồi mới tới `{hệ}-{kiến trúc}`. Có 7 file: `darwin-aarch64-app`, `darwin-x86_64-app`, `windows-x86_64-nsis`, `windows-x86_64-msi`, `linux-x86_64-appimage`, `linux-x86_64-deb`, `linux-x86_64-rpm`. Thêm vào đó là `darwin-aarch64`, `darwin-x86_64`, `windows-x86_64` (NSIS) và `linux-x86_64` (AppImage).

**Khoá ký:**
- Tạo ngày 31/10/2026 bằng `npm run tauri signer generate`. Khoá riêng nằm ở `~/.tauri/colautool.key` trên máy phát triển, mật khẩu ở `~/.tauri/colautool.key.password` (cả hai quyền 600, không bao giờ đưa vào repo). Khoá công khai nằm trong `tauri.conf.json`.
- CI cần hai secret của repo (GitHub → Settings → Secrets and variables → Actions → New repository secret):
  - `TAURI_SIGNING_PRIVATE_KEY`: toàn bộ nội dung file `colautool.key`.
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: nội dung file `colautool.key.password`.
- Có hai secret đó, build-matrix.yml bật `createUpdaterArtifacts` bằng `--config`, nên Tauri sinh và ký file cập nhật. `tauri.conf.json` không bật sẵn, để `npm run app` trên máy không có khoá vẫn build được.
- **Mất khoá riêng thì các bản đã cài không bao giờ tự cập nhật được nữa:** người dùng phải tải và cài tay một bản có khoá công khai mới. Giữ một bản sao của hai file ở chỗ an toàn (trình quản lý mật khẩu).

**Lưu ý:**
- Bản đầu tiên có tính năng này phải cài tay. Từ bản sau đó, app mới tự cập nhật.
- Khởi động lại thì các nick phải đăng nhập lại, vì server không giữ phiên.
- Bản phát hành không đánh dấu pre-release, vì `releases/latest` bỏ qua bản pre-release.
