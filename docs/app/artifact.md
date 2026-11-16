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
| cdn.colauloanthe.vn | HTTPS (Cloudflare): kiểm tra phiên bản và gói nội dung, xem [Cơ chế cập nhật](#cơ-chế-cập-nhật) |
| 104.21.7.38:443 | Socket HTTPS của bản hiện tại; chưa gắn chắc IP này với hostname bằng DNS/SNI mới |
| https://id.lotasoft.vn, https://lotasoft.vn | Hằng trong MyGame2D; không chứng minh login game gọi HTTP vào đây |

## Cơ chế cập nhật

Đo ngày 16/11: chữ trong `libgdx-flashds.so`, file trên điện thoại (root), file công khai trên CDN. Chưa bắt mạng lúc game cập nhật, nên thứ tự gọi là suy từ chữ và file. Game có ba lớp cập nhật, không lớp nào cài lại APK:

1. **Kiểm tra phiên bản** (`checkVersion`):
   - Game đọc `https://cdn.colauloanthe.vn/version/<nền tảng>.json` (android, ios, pc). Đợi tối đa 8 s, gửi lại nếu cần.
   - Ví dụ `android.json` (sửa lần cuối 31/10): `{"schema":1,"platform":"android","minimumVersion":"1.0.0","latestVersion":"1.0.1","updateUrl":"https://colauloanthe.lotasoft.vn/","message":"Đã có phiên bản mới, vui lòng cập nhật để tiếp tục chơi."}`.
   - Bản game (chữ "1.0.1" trong file chạy) thấp hơn `minimumVersion` thì game chặn ("Version check CHAN", `NEED_APP_UPDATE`) và mở `updateUrl` để người chơi tự tải APK.
   - Không có trả lời, hoặc JSON hỏng, thì game vẫn vào ("fail-open"). iOS và PC đang đòi 1.0.1.
2. **Gói nội dung** (hình, hiệu ứng, Cẩm nang):
   - Manifest ở `https://cdn.colauloanthe.vn/offline/<nền tảng>-<mức>/manifest.json`, có `schema`, `platform`, `revision`, `baseUrl` (`revisions/<revision>/`), `packs` và `files`.
     - `packs`: gói `base-<rev>` loại `full` và `icons-<rev>` loại `delta`, mỗi gói có `url`, `size`, `crc32`, `count`.
     - `files`: mỗi file có tên `n`, size `s`, CRC32 `c` và gói `p`.
   - Tải theo `offline/<nền tảng>-<mức>/revisions/<rev>/packs/<id>.pak`, hoặc từng file ở `…/revisions/<rev>/files/<tên>` khi gói hỏng ("se tai file le"). File tạm `.tmp` hoặc `.new` được kiểm size và CRC rồi mới đổi tên.
   - Gói `.pak` **không nén**, chỉ là nhiều file ghép lại: `"CLOP"`, u8 phiên bản (1), u32 số file, rồi mỗi file `{u16 độ dài tên, tên, u32 size, byte của file}`, số nguyên big-endian. Byte của mỗi file giữ nguyên như file `.dat` trên máy, nghĩa là vẫn đang mã hoá (AES-128 sau khi đảo 63 byte đầu); game chỉ giải mã lúc nạp hình ([giải mã asset](events/13-drops-items.md#giải-mã-asset)). Đo trên `icons-64.pak` của android-a2 (4.375.119 byte): đọc hết 246 file tới byte cuối, size và CRC32 từng file khớp manifest.
   - Kết quả nằm ở `files/dyncache/offline-<mức>/`, cùng `_state.json` (`revision` và CRC từng file). Mức chất lượng là `a2` trên máy đo (file `asset_tier`), hoặc `a1`. Gói có thể đòi `minClientVersion`.
3. **Bảng dữ liệu** `it0`, `it1`, `itv` (vật phẩm, mẫu chỉ số, phiên bản bảng): ghi vào `files/dyncache/` ([bảng 29](events/13-drops-items.md#bảng-29)). **Đường tải chưa đo.** Đã kiểm:
   - Bảng không có trong APK, cũng không có trong manifest nội dung trên CDN. [Đo]
   - 13 lần vào game trong 161 file bắt gói (bảng 18, khi máy đã có bảng đúng phiên bản) không có gói nào trên 20 KB, ngoài `s2c/30` (bảng kỹ năng, khoảng 23 KB). Vậy server không gửi bảng ở mỗi lần vào game. [Đo]
   - Client không gửi phiên bản bảng trong `c2s/9` (luôn `u8 2; i32 -1`), cũng không trong `c2s/4` (`i32` cuối là mã băm tên tài khoản). [Đo]
   - Chữ `it0`, `it1` nằm trong bảng chuỗi cạnh lớp `com.mh.sqfg` (biến toàn cục của game, có `a(byte[])` và `b(byte[])`), `itv` ở chỗ khác. Thân hàm là native, chưa đọc. [Đo]
   - Điện thoại ghi bảng 29 lúc 05:30 ngày 14/11, sau khi server Alpha Test đóng (03/11) rồi mở lại. Phỏng đoán: lúc vào game server báo phiên bản bảng, client thấy cũ thì xin bảng mới bằng một gói chưa bắt được. Cách kiểm: so các gói vào game của bot bây giờ (bảng 29) với gói cũ (bảng 18). [Suy luận]

   Chữ `UpdateTables` trong `classes.dex` là hàm của bộ nén LZMA trong libGDX, không liên quan tới bảng.

Revision trên CDN ngày 16/11:

| Manifest | Revision | Sửa lần cuối | Icon tới |
|---|---:|---|---:|
| android-a2, android-a1, android | 64 | 29/10 | i245 |
| ios | 72 | 03/11 | i245 |
| pc, pc-a2 | 92 | 12/11 | i335 |
| ios-a2 | 93 | 12/11 | i335 |

Nội dung Android dừng ở revision 64 (bản cài đầu tiên). Điện thoại có `_state.json` revision 64, `offline-a2/` không đổi từ 29/10, nên các món mới của bảng 29 không có icon trên Android. Cloudflare trả 403 cho trình tải có user agent của Python; curl tải được.

JADX không tìm được BuildConfig.java; fingerprint không phát hiện Retrofit/OkHttp/Ktor/Apollo/Volley. Đây chỉ là kết quả quét, không phải bằng chứng app không có HTTP tự viết. Asset mã hoá và lớp bảo vệ socket là hai phạm vi khác nhau; không dùng AES của asset để kết luận credential hay packet TCP dùng AES.
