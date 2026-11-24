# Bản Android

App máy tính (Tauri 2) build được thành file APK cho Android (arm64). Cùng một mã nguồn: phần lõi `cllt-core`, phần Rust của app (`app/desktop/src-tauri`) và giao diện React. Thử lần đầu 24/11 trên Xiaomi Redmi Note 10S (M2101K7BG, Android 13, MIUI).

## Khác bản máy tính

| Phần | Máy tính | Android |
|---|---|---|
| Khay hệ thống, nút đóng cửa sổ (`tray.rs`) | có | không có (`#[cfg(desktop)]`); `close_window` chỉ lưu lựa chọn |
| Tự cập nhật (`update.rs`) | `tauri-plugin-updater`, cài xong tự mở lại | không có plugin đó: app đọc mục `android` của cùng `latest.json`, tải APK, kiểm SHA-256 rồi mở trình cài của Android; người dùng bấm Cài đặt ([release.md](release.md#trên-android)) |
| Cửa sổ trận cho OBS (`battle_window.rs`) | có | `open_battle_window` báo "Cửa sổ trận chỉ có trên máy tính" |
| Mã máy cho key (`machine.rs`) | mã của hệ điều hành (`machine-uid`) | Android không cho app đọc mã máy: app tạo 32 byte ngẫu nhiên một lần, lưu ở `device-id` cạnh `accounts.json`, rồi băm như bản máy tính. Gỡ app là mất mã: key cần **Gỡ thiết bị** trên trang Key |
| Tên máy trên trang Key | tên máy | hãng và model (`getprop`, ví dụ "Xiaomi M2101K7BG") |
| Chạy nền | cửa sổ ở khay | foreground service (dưới đây) |
| Chứng chỉ HTTPS của key và đồng bộ (`machine::client`) | của hệ điều hành (`rustls-platform-verifier`) | bộ gốc Mozilla đóng sẵn trong app (`webpki-roots`): verifier của hệ thống panic "Expect rustls-platform-verifier to be initialized" khi chưa khởi tạo qua JNI, và nút Kích hoạt đứng mãi ở "Đang kiểm tra…" (24/11) |
| Giao diện | cửa sổ | bố cục điện thoại dưới 900px (`features.md`); `MainActivity` đệm nội dung theo thanh trạng thái, thanh điều hướng, tai thỏ và bàn phím, nền tối `#16181D` sau các thanh; Cài đặt không có tab Cửa sổ |

Thư mục dữ liệu là thư mục riêng của app (`app_local_data_dir`): `accounts.json`, `cllt.db`, `license.json`, `settings.json`, `device-id`.

## Chạy nền

Plugin `app/desktop/src-tauri/plugins/keepalive` (crate Rust và thư viện Android bằng Kotlin) giữ app chạy khi tắt màn hình hay chuyển sang app khác:

- **Foreground service** loại `specialUse` (không dùng `dataSync`, vì Android 15 chỉ cho loại đó chạy 6 tiếng mỗi ngày), kèm **partial wake lock** (CPU không ngủ) và **Wi-Fi lock** (Wi-Fi không tắt).
- **Thông báo thường trực**: "Co Lau Tool: N nick đang chạy", bấm vào mở app, nút **Dừng tất cả** đăng xuất mọi nick rồi tắt service.
- **Tự bật và tắt**: luồng flusher của app (`app.rs`, `spawn_flusher`) đếm nick đang đăng nhập hay đang kết nối (`App::running_count`), báo cho plugin khi số đổi (`tauri_plugin_keepalive::set_running`). Có nick là service chạy, hết nick là service tắt.
- **Lần đầu bật** app xin quyền hiện thông báo (Android 13) và xin bỏ tối ưu pin cho app.
- Android tắt hẳn tiến trình thì service không tự chạy lại (`START_NOT_STICKY`): các phiên nằm trong tiến trình, service một mình không giữ được gì.

Đã thử trên máy (24/11, chưa đăng nhập nick nào; service bật bằng `am` với quyền root): service chạy foreground với thông báo và nút Dừng tất cả, giữ wake lock và Wi-Fi lock; app ở nền 70 giây trong Doze ép buộc (`dumpsys deviceidle force-idle`) và app standby vẫn sống, service vẫn foreground; ở nền thêm 45 giây tiến trình vẫn chạy (thời gian CPU tăng, không luồng nào bị đóng băng). Dừng tất cả tắt service và bỏ thông báo. **Chưa thử** với nick đăng nhập thật: đường từ Rust bật service, kết nối game khi tắt màn hình lâu, đổi Wi-Fi sang 4G.

### MIUI (Xiaomi, Redmi, POCO)

- MIUI SmartPower đánh dấu app là "hibernation" vài giây sau khi chuyển nền, kể cả khi có foreground service; trên máy thử tiến trình vẫn chạy, nhưng MIUI có thể tắt app khi máy thiếu RAM hay pin yếu.
- Nên bật trong Cài đặt → Ứng dụng → colautool: **Tự khởi động**, **Tiết kiệm pin → Không hạn chế**, và khoá app trong danh sách đa nhiệm (kéo xuống trên thẻ app) để vuốt "xoá tất cả" không tắt nó.
- Cài APK qua adb: MIUI hỏi "Cài đặt qua USB" trên máy (đếm ngược 10 giây), phải bấm Cài đặt; lần đầu cần bật "Cài đặt qua USB" trong Tuỳ chọn nhà phát triển.

## Build

Cần Android SDK, NDK 28 và Java của Android Studio:

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
export NDK_HOME="$ANDROID_HOME/ndk/28.2.13676358"
cd app/desktop
npm run tauri android build -- --apk --target aarch64
```

File ra: `src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release.apk` (khoảng 18 MB). Chạy thử khi đang sửa: `npm run tauri android dev` (điện thoại cắm USB hay adb qua Wi-Fi).

Project Android sinh bởi `npm run tauri android init` nằm ở `src-tauri/gen/android` và được commit; những gì Tauri sinh lại mỗi lần build (`.tauri`, `jniLibs`, `tauri.build.gradle.kts`, `tauri.settings.gradle`, `assets/tauri.conf.json`, `build/`) có trong `.gitignore` của nó.

## Ký APK

Android chỉ cài APK đã ký, và chỉ cài đè bản mới khi cùng một khoá. Khoá phát hành nằm **ngoài repo**, không bao giờ commit:

- `~/.android-keys/colautool-release.jks` (RSA 4096, alias `colautool`) và `~/.android-keys/colautool-release.properties` (`storeFile`, `password`, `keyAlias`), quyền 600.
- `gen/android/app/build.gradle.kts` đọc file properties đó (hoặc file mà biến `COLAUTOOL_KEYSTORE` chỉ tới). Không có file thì APK release không được ký.
- Mất khoá là người dùng phải gỡ app rồi cài lại (mất dữ liệu trong app): sao lưu hai file này.

**Trên GitHub Actions** (từ 2.2.17): job `android` của [build-matrix.yml](../../../.github/workflows/build-matrix.yml) build APK arm64 mỗi lần release và đưa vào bản release với tên `colautool_<version>_android_arm64.apk`, kèm SHA-256 trong `SHA256SUMS.txt`. Khoá lấy từ Secrets của repo code: `ANDROID_KEYSTORE_B64` (file .jks dạng base64), `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` (đặt 24/11 từ hai file trên). Thiếu Secrets thì APK không được ký và không được tải lên. APK không có trong `latest.json`: người dùng tải file mới về cài đè.

Kiểm tra chữ ký: `apksigner verify --print-certs <apk>` (trong `$ANDROID_HOME/build-tools/36.0.0`).

## Cài lên máy

```bash
adb connect 192.168.2.1:5555              # adb qua Wi-Fi
adb -s 192.168.2.1:5555 install -r app-universal-release.apk
adb -s 192.168.2.1:5555 shell monkey -p vn.colauloanthe.desktop -c android.intent.category.LAUNCHER 1
```

Gói Android là `vn.colauloanthe.desktop` (identifier của `tauri.conf.json`).
