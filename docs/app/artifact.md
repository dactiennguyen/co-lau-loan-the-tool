# Artifact và binary

## Nhận diện đúng build

| Thuộc tính | Giá trị đã đọc |
|---|---|
| File đầu vào | colauloanthe.1.0.3.apk |
| APK SHA-256 | f6173f90481980b4d81ad0c93ff51c7703a9f2e536c0ba5054b17cb519b5b4dc |
| Package | com.lotasoft.colauloanthe |
| Android manifest | versionName 1.0, versionCode 2 |
| Chuỗi phiên bản trên UI/MyGame2D | 1.0.1 |
| Thông tin client trong packet | android / 0.0.2 |
| minSdk / targetSdk | 24 / 36 |
| Launcher | com.tlgdx.twelvelord.android.AndroidLauncher |
| Thiết bị quan sát | Xiaomi M2101K7BG, UID app 10315, Android có Magisk |

Tên file, version manifest, version UI và protocol version là các giá trị khác nhau. Chỉ dùng hash để xác định artifact đã phân tích; không suy protocol version từ tên APK. APK trên thiết bị đã được băm và khớp file đầu vào trong lần quan sát.

## Bố cục và kích thước

| Thành phần APK | Byte | Vai trò |
|---|---:|---|
| AndroidManifest.xml | 6108 | Manifest Android dạng binary XML |
| classes.dex | 2611068 | Java classes và chữ ký native |
| lib/arm64-v8a/libgdx-flashds.so | 48686752 | Logic game đã chuyển phần lớn sang native |
| lib/arm64-v8a/libgdx.so | 163888 | Thư viện libGDX |
| lib/arm64-v8a/libgdx-freetype.so | 812736 | Hỗ trợ font |
| lib/armeabi-v7a/libgdx-flashds.so | 35639652 | Bản native ARM 32 bit |
| lib/x86/libgdx-flashds.so | 60223988 | Bản native x86 |
| lib/x86_64/libgdx-flashds.so | 50435296 | Bản native x86-64 |

Thư viện arm64 là ELF 64 bit little-endian, kiến trúc AArch64; định dạng ELF little-endian không quyết định byte order của giao thức mạng, vốn đã đo là big-endian.

SHA-256 `classes.dex`: `bf3eea48d6c82e0a4d3505fdb672a38780cbef132a3ad314c410ff852ef6e966`.

SHA-256 `lib/arm64-v8a/libgdx-flashds.so`: `04919c8c840371bb823ce1722dcce55a9cdf15f12ee25dc4c519f6e10d9de694`.

## Lớp Java và phần native

`AndroidLauncher.onCreate()` tạo cấu hình libGDX rồi gọi `initialize(new MyGame2D(this), config)`. Phần lớn lifecycle của MyGame2D và logic game/mạng trong các lớp com.mh là native. Decompiled Java giữ được field/chữ ký và các lời gọi đăng ký native, không cung cấp lại thân hàm nguồn gốc.

| Lớp | Điều quan sát được |
|---|---|
| com.tlgdx.twelvelord.MyGame2D | Game libGDX, lifecycle native; có các chuỗi version và host web |
| com.mh.sqlq | Service/hàng đợi request; a(String,String,int) bắt đầu login; a(String,byte[],byte[]) dựng credential |
| com.mh.sqni | Socket a(String,int,int), timeout 8000 ms; hàm biến đổi proof a(byte[],String) |
| com.mh.sqfa | Quản lý socket, reader và writer |
| com.mh.sqje | Writer: DataOutputStream/BufferedOutputStream, buffer 4096 byte |
| com.mh.sqnw | Luồng socket-reader; e() trả packet; handler/dispatcher native |
| com.mh.n.sqi | Packet, các getter/serializer; runtime field a,b,c,d |
| com.tlgdx.twelvelord.sqq | Đổi opcode: a(int), inverse b(int) |
| com.mh.n.sqg / sqk | Trạng thái kết nối, timeout phiên 30000 ms và đo RTT |

Tên lớp ngắn và thân hàm native cho thấy code bị làm khó đọc. DEX có cơ chế `native0.Loader.registerNativesForClass(...)`/Hidden0; native giữ các symbol C++ mang tên `__ngen_com_mh_...`. Đây là điểm bám để lần Java → native. Không suy ra engine phân tích có thể khôi phục toàn bộ source gốc chỉ vì tên export còn tồn tại.

## Endpoint và phạm vi quan sát

| Đích | Bằng chứng / giới hạn |
|---|---|
| play.colauloanthe.vn:1688 → 14.225.213.40:1688 trong lần đo | Syscall và bảng TCP theo UID: TCP nhị phân, không TLS trong phiên đã bắt |
| cdn.colauloanthe.vn | Kênh tài nguyên HTTPS được xác định ở đợt trước; chưa khôi phục đầy đủ URL/path |
| 104.21.7.38:443 | Socket HTTPS của bản hiện tại; chưa gắn chắc IP này với hostname bằng DNS/SNI mới |
| https://id.lotasoft.vn, https://lotasoft.vn | Hằng trong MyGame2D; không chứng minh login game gọi HTTP vào đây |

JADX không tìm được BuildConfig.java; fingerprint không phát hiện Retrofit/OkHttp/Ktor/Apollo/Volley. Đây chỉ là kết quả quét, không phải bằng chứng app không có HTTP tự viết. Asset mã hoá và lớp bảo vệ socket là hai phạm vi khác nhau; không dùng AES của asset để kết luận credential hay packet TCP dùng AES.
