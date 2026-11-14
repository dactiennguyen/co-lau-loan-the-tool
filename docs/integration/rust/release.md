# Phát hành và tự cập nhật

Build trên GitHub Actions, phát hành một bản mới, và cách app đã cài tự cập nhật lên bản đó.

## CI/CD và phát hành

Có hai workflow trong `.github/workflows`, làm theo cách của [cockpit-tools](https://github.com/jlcodes99/cockpit-tools). Có tự cập nhật ([Tự cập nhật](#tự-cập-nhật)), nhưng chưa ký số Apple hay Windows:

| Workflow | Chạy khi | Làm gì |
|---|---|---|
| [build-matrix.yml](../../../.github/workflows/build-matrix.yml) | push lên `main`, mở pull request, hoặc bấm tay (Run workflow) | `npm ci` ở gốc và trong `app/desktop` (test import vài file của giao diện, cần kiểu của `@tauri-apps/api`), rồi `npm test` (`tsc --noEmit` trên `src/`, `test/` rồi mới chạy test); `cargo fmt`, `cargo clippy -D warnings`, `cargo test` trên Ubuntu. Push và pull request chỉ chạy chừng đó. Khi phát hành (tag `v*`) hoặc bấm tay, test qua hết mới build app trên 4 máy song song: repo private tính phút macOS gấp 10, một lần build đủ tốn khoảng 115 trong 2000 phút mỗi tháng của gói Free. Có khoá updater trong Secrets thì mỗi bản build có thêm file cập nhật và `.sig`; pull request từ fork không có Secrets nên build không ký. Khi phát hành, mỗi bản build tải file thẳng vào bản nháp của release (bằng `RELEASE_TOKEN`), không qua Artifacts; bấm tay thì file nằm 1 ngày trong mục Artifacts của lần chạy. Cache Rust chỉ lưu từ `main`: bấm tay trên `main` là làm nóng cache cho lần phát hành sau |
| [release.yml](../../../.github/workflows/release.yml) | đẩy tag `v*` | Kiểm tra tag khớp version, tạo bản nháp của release với [ghi chú cài đặt](../../../.github/release-notes.md), gọi build-matrix.yml (chuyển Secrets sang) để 4 bản build tải file, `.sig` và SHA-256 của mình vào bản nháp, rồi thêm `SHA256SUMS.txt`, `latest.json` cho updater và phát hành. Thiếu chữ ký của một nền tảng nào thì dừng, không phát hành |
| [release-retry.yml](../../../.github/workflows/release-retry.yml) | một lần chạy release.yml kết thúc | Nếu lần đó hỏng chỉ vì GitHub huỷ một job không cấp được máy, thì chạy lại các job bị huỷ, tối đa tới lần thứ 3 ([Chạy lại khi thiếu máy](#chạy-lại-khi-thiếu-máy)) |

| Máy build | Target | File |
|---|---|---|
| `macos-latest` | `aarch64-apple-darwin` | `colautool_<version>_macos_aarch64.dmg`, `.app.zip`, và `.app.tar.gz` (file updater tải) |
| `macos-latest` (build chéo) | `x86_64-apple-darwin` | `colautool_<version>_macos_x64.dmg`, `.app.zip`, `.app.tar.gz` |
| `windows-latest` | `x86_64-pc-windows-msvc` | `colautool_<version>_windows_x64-setup.exe`, `.msi`, `_portable.exe` (chạy không cần cài) |
| `ubuntu-22.04` | `x86_64-unknown-linux-gnu` | `colautool_<version>_linux_x64.deb`, `.rpm`, `.AppImage` |

[stage-bundles.mjs](../../../.github/scripts/stage-bundles.mjs) đổi tên file Tauri sinh ra theo một mẫu chung, vì tên gốc lẫn lộn `x64`, `amd64`, `x86_64` và `en-US`. File `.sig` đi theo file của nó, cùng tên thêm `.sig`. [latest-json.mjs](../../../.github/scripts/latest-json.mjs) đọc các file đó để viết `latest.json`.

Phát hành một bản mới, ví dụ 0.1.1:
1. Chạy `node .github/scripts/bump-version.mjs 0.1.1` ở gốc repo. Script đặt version ở cả 7 chỗ: [app/Cargo.toml](../../../app/Cargo.toml), hai crate trong `app/Cargo.lock`, [app/desktop/package.json](../../../app/desktop/package.json), hai chỗ trong `app/desktop/package-lock.json`, và [tauri.conf.json](../../../app/desktop/src-tauri/tauri.conf.json). Chạy không tham số thì chỉ in version ở từng chỗ. Nếu tag lệch với bất kỳ chỗ nào, release dừng ngay (`bump-version.mjs --check`).
2. Commit với tiêu đề "Release 0.1.1", phần thân ghi những gì đã đổi: phần thân này thành mục **Có gì mới** trong app của người dùng (`notes` của `latest.json`; đoạn cuối chỉ gồm các dòng `Co-Authored-By:`, `Signed-off-by:` thì bị bỏ). Rồi chạy `git tag v0.1.1 && git push origin main v0.1.1`.
3. Release hiện ra sau khi 4 bản build và bước publish xong; trước đó nó là bản nháp, người dùng không thấy. Bản đã publish không bao giờ bị ghi đè. Bản nháp do một lần chạy trước để lại thì bị thay.

**Vì sao không dùng Artifacts:** ngày 04/11/2026, bản 1.1.9 rồi 1.1.10 không phát hành được: cả 4 bản build dừng ở bước tải lên Artifacts với lỗi "Artifact storage quota has been hit". Mỗi bản build khoảng 210 MB, và GitHub chỉ tính lại dung lượng sau 6–12 giờ, nên xoá artifact cũ không giải phóng chỗ ngay. Giờ các file đi thẳng vào release, không tính vào dung lượng đó. Vì vậy cần `RELEASE_TOKEN` cả khi phát hành vào chính repo code (`github.token` của bản build chỉ được đọc).

### Chạy lại khi thiếu máy

**Lỗi đã gặp**
- Ngày 02/11/2026, bản 1.1.7 không được phát hành.
- GitHub thiếu máy macOS Apple Silicon, nên job build trên `macos-latest` chờ 15 phút rồi bị huỷ. GitHub ghi: "The job was not acquired by Runner of type hosted even after multiple attempts".
- Ba bản kia build xong, nhưng bước publish cần đủ cả 4 bản nên bị bỏ qua. `latest.json` vẫn ở 1.1.6, và app không thấy có bản mới.
- Bấm "Re-run failed jobs" thì chỉ job bị huỷ chạy lại, rồi publish. Bản 1.1.7 lên sau khoảng 10 phút.

**release-retry.yml tự làm việc đó**
- Nó chạy mỗi khi một lần chạy `Release` kết thúc. Lần đó phải hỏng (`failure`) và chưa tới lần thứ 3.
- Nó xem các job của lần chạy:
  - Có job lỗi thật (`failure`: test, build, publish): không chạy lại, vì chạy lại cũng lỗi như cũ.
  - Có job bị huỷ (`cancelled`): `gh run rerun --failed`, chạy lại các job bị huỷ và các job sau nó.
- Lần chạy bị huỷ bằng tay kết thúc là `cancelled` chứ không phải `failure`, nên không bị chạy lại.
- Mỗi lần chạy lại lại chờ máy tới 15 phút, nên hai lần chạy lại phủ khoảng 45 phút.
- Nếu GitHub thiếu máy lâu hơn thế, mở lần chạy Release trong tab Actions và bấm **Re-run failed jobs**.

Lưu ý:
- **Tên app là `colautool`** (`productName`), không dấu. Tên có dấu làm hỏng hai loại bộ cài:
  - WiX (`.msi`) chỉ nhận ký tự có trong code page 1252. "ờ", "ạ", "ế" không có trong 1252, và cũng không có trong 1258.
  - `.deb`/`.rpm` lấy tên gói là `productName` viết kebab-case, mà dpkg chỉ nhận a–z, 0–9, `+`, `-`, `.`.

  Tên hiện ra là **Co Lau Tool**: tiêu đề cửa sổ, khay, thanh bên, và `CFBundleName` (`bundle.macOS.bundleName`) trên thanh menu macOS. `productName` vẫn là `colautool`, vì nó đặt tên tệp cài, thư mục cài và gói trên Windows và Linux: đổi nó thì bộ cài mới không nhận ra bản cũ và cài thêm một bản nữa. Identifier vẫn là `vn.colauloanthe.desktop`, nên thư mục chứa `accounts.json` không đổi. Bản dev là **Co Lau Tool DEV** ([Chạy](README.md#chạy)), không bao giờ được đóng gói.
- **Chưa ký số Apple, Windows:** macOS dùng chữ ký ad-hoc (`signingIdentity: "-"`), nên lần đầu người dùng phải chạy `xattr -cr /Applications/colautool.app`. Windows hiện cảnh báo SmartScreen. Muốn ký như cockpit-tools thì cần chứng chỉ Apple Developer ID và 6 secret `APPLE_*`. Chữ ký của updater (minisign, [Tự cập nhật](#tự-cập-nhật)) là chuyện khác: nó chỉ để app biết bản tải về đúng là của mình.
- **Rust 1.90 cố định** trong CI, để một lint clippy mới của bản stable sau không tự làm hỏng build.
- **Đã thử trên máy (30/10/2026):** build macOS Apple Silicon bằng đúng lệnh của CI ra `colautool.app` 4,8 MB và `.dmg` 2,6 MB. Script gom file và bước kiểm tra tag chạy đúng. Bản Intel, Windows và Ubuntu chỉ build trên GitHub Actions và chưa có lần chạy nào.

## Tự cập nhật

Bản cài của app tự tìm, tải và cài bản mới từ [GitHub Releases của repo phát hành](https://github.com/dactiennguyen/colautool-releases/releases) ([Repo phát hành riêng](#repo-phát-hành-riêng)), giống [cockpit-tools](https://github.com/jlcodes99/cockpit-tools). Code ở `desktop/src-tauri/src/update.rs`, dùng [`tauri-plugin-updater`](https://v2.tauri.app/plugin/updater/) 2.14. Giao diện chỉ gọi 3 lệnh của app (`update_status`, `check_update`, `install_update`) và nghe sự kiện `update`; không mở quyền của plugin cho giao diện.

**Cách chạy:**
1. Một lần ngay khi mở app, hoặc khi bấm ⟳, app tải `https://github.com/dactiennguyen/colautool-releases/releases/latest/download/latest.json` (địa chỉ trong `plugins.updater.endpoints` của `tauri.conf.json`). Repo công khai nên không cần token. App đang chạy thì không tự kiểm tra lại: bản phát hành lúc đó đợi tới lần mở app sau, để các nick đang chơi không bị đăng xuất giữa chừng.
2. `latest.json` có `version` mới hơn bản đang chạy thì app tải ngay file của đúng máy và đúng loại bộ cài, kèm thanh tiến độ. Tải xong, app kiểm chữ ký minisign của file với khoá công khai trong `tauri.conf.json` (`plugins.updater.pubkey`). Sai chữ ký thì không cài, báo "chữ ký của bản tải về không khớp". `requireSignedVersion` cũng bật: chữ ký phải ghi đúng phiên bản mà `latest.json` công bố. Nhờ vậy, kẻ sửa được `latest.json` cũng không ép được app cài lùi về một bản cũ, dù bản cũ đó vẫn mang chữ ký thật.
3. **Mọi bản mới đều bắt buộc** (từ bản sau 1.1.1). Từ lúc thấy bản mới tới lúc app mở lại, một hộp "Cập nhật bắt buộc" che cả cửa sổ, không đóng được (kể cả Escape), có thanh tiến độ và Có gì mới ([UpdateGate.tsx](../../../app/desktop/src/views/UpdateGate.tsx)). Không kiểm tra được (mất mạng, GitHub lỗi) thì không chặn gì, app dùng bình thường. Cài lỗi thì hộp đóng lại, dòng phiên bản báo lỗi, lần mở app sau (hay bấm ⟳) thử lại. Bản đã kiểm được cài ngay:
   - **Cài ngay:** app cho mọi nick đăng xuất (trận đang đánh bị bỏ dở), cài, rồi mở bản mới. Nút Khởi động lại để cập nhật làm đúng việc này. Trên Windows bộ cài NSIS hay MSI chạy ở chế độ `passive` (chỉ có thanh tiến độ), app thoát và bộ cài mở lại app.
   - **Khi tắt app**, nếu bản đã tải mà chưa cài được: app cài trước khi thoát hẳn, lần sau mở là bản mới. Bước này chạy trong luồng riêng, chờ tối đa 30 giây. Trên macOS, app nằm ở thư mục người dùng không ghi được sẽ cần hỏi mật khẩu admin; lúc tắt app thì không hỏi được nữa, nên bản đó để lần sau, app không bị treo. Trên Windows bộ cài chạy rồi không mở lại app. Trên Linux, bản `.deb` và `.rpm` cài bằng `pkexec`, nên hệ thống hỏi mật khẩu (cả khi bấm Khởi động lại lẫn khi tắt app). Bản AppImage thì không hỏi.
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

## Repo phát hành riêng

Bản phát hành có thể nằm ở một repo public khác, [dactiennguyen/colautool-releases](https://github.com/dactiennguyen/colautool-releases), để repo code này chuyển sang private được. Updater tải `latest.json` và bộ cài mà không có token, nên Releases phải nằm ở repo public.

- **Script:** [setup-release-repo.ps1](../../../.github/scripts/setup-release-repo.ps1) làm từng bước, chạy lại không sao: không tham số thì tạo repo; `-SetSecret` lưu `RELEASE_TOKEN` (cần `gh`); `-SetVariable` đặt `RELEASE_REPO`; `-CleanRemote` bỏ token khỏi remote `origin`; `-Check` chỉ xem trạng thái.
- **Cấu hình** (repo code → Settings → Secrets and variables → Actions):
  - Variable `RELEASE_REPO` = `dactiennguyen/colautool-releases`.
  - Secret `RELEASE_TOKEN`: Fine-grained token chỉ có quyền `Contents: Read and write` trên repo phát hành. `github.token` của workflow không ghi được sang repo khác.
- **Chưa có `RELEASE_REPO`:** release.yml vẫn phát hành vào chính repo code như trước, nhưng vẫn cần `RELEASE_TOKEN` (có quyền `Contents: Read and write` trên repo code), vì các bản build tải file vào bản nháp bằng nó. Thiếu `RELEASE_TOKEN` thì release dừng ngay ở bước đầu và báo lỗi.
- **Ở repo phát hành:** tag `v*` chưa có, nên `gh release create` tạo tag trên nhánh mặc định của repo đó, không dùng `--verify-tag` (tag đã được kiểm ở repo code) và `--generate-notes`. Link tải trong `latest.json` trỏ về repo phát hành, vì latest-json.mjs lấy tên repo từ `GH_REPO`.
- **Chuyển các bản đã cài sang repo mới:** các bản đến 1.1.0 vẫn hỏi `co-lau-loan-the-tool`. Phát hành **một bản cuối vào repo code** (chưa đặt `RELEASE_REPO`) có `tauri.conf.json` trỏ sang repo mới, rồi mới đặt `RELEASE_REPO` cho các bản sau. Chờ người dùng lên bản đó rồi mới chuyển repo code sang private.
