# Phương pháp và bằng chứng điều tra

## Nguồn dữ liệu

| Nguồn | Đã làm gì | Giới hạn |
|---|---|---|
| T0: APK | Đọc ZIP/manifest, decompile DEX, kiểm tra native exports/assembly | Thân hàm phần lớn là native; Java decompile không phải code nguồn gốc |
| A1: phiên app thứ nhất | Boot → login → thế giới; hook syscall và native packet | Một số body lớn giới hạn 8192 byte; không dùng bản cắt để khẳng định full schema |
| A2: phiên app thứ hai | Đọc packet bằng JNI, trace getter/writer và cursor; body tối đa 65536 byte | Chỉ một nhánh login thành công, một nhân vật và tập tính năng đã kích hoạt |
| V1: kết nối kiểm chứng độc lập | Đối chiếu lại framing/proof/login/world với server; đọc thêm gói 0 account online nơi khác | Là bằng chứng server, không gán thành capture gốc từ APK |

Giá trị HP, khu vực, danh sách thực thể và key có thể khác giữa A1/A2/V1. Nhãn field và nhãn event trong tài liệu là diễn giải, trừ khi đã chỉ rõ chữ ký/field thực của binary. Raw trace/script tạm đã xoá sau khi ghi lại các quan sát cần thiết.

## Công cụ thực sự đã dùng

| Công cụ | Mục đích / kết quả |
|---|---|
| unzip, SHA-256, aapt2 | Inventory, nhận diện artifact, đọc manifest binary |
| JDK 17 + JADX CLI 1.5.5 | Khôi phục Java signatures/fields; tạo 2283 file Java, báo một lỗi decompile |
| llvm-nm / llvm-objdump qua xcrun | Tìm export, disassemble ELF arm64 và các routine writer/reader/key/proof |
| ADB 35.0.2 | Chạy app, xem UID/TCP, chụp UI, điều khiển thao tác và kiểm tra package |
| Frida 17.23.3 + Java bridge | Hook syscall/native/JNI để so wire với packet và giá trị getter |
| REA và skill Android RE | Định hướng điều tra, kiểm tra thiết bị/artifact; provider Ghidra/Hopper và JADX MCP không sẵn có nên không dùng chúng để khẳng định đã decompile native |

Fingerprint script gặp cú pháp Bash mới không tương thích Bash 3 của macOS; quét HTTP gặp lỗi awk. Đã dùng công cụ sẵn có và `rg` thay thế. Các lỗi công cụ không phải lỗi app. Không có kết quả pseudocode Ghidra được xác minh trong đợt này.

## 1. Bắt đầu từ artifact, không đoán theo tên APK

Các lệnh đọc lại trên máy có bộ công cụ tương ứng:

```bash
shasum -a 256 colauloanthe.1.0.3.apk
unzip -l colauloanthe.1.0.3.apk
aapt2 dump badging colauloanthe.1.0.3.apk
aapt2 dump xmltree colauloanthe.1.0.3.apk --file AndroidManifest.xml
```

Ghi package, launcher, ABI, version manifest và hash của DEX/native. Đối chiếu chuỗi version UI với trường thực sự được gửi trên socket, không đồng nhất các version đó.

## 2. Lần từ launcher tới mạng

```bash
mkdir -p captures/research
unzip -p colauloanthe.1.0.3.apk classes.dex > captures/research/classes.dex
unzip -p colauloanthe.1.0.3.apk lib/arm64-v8a/libgdx-flashds.so > captures/research/libgdx-flashds.so
jadx --no-res -d captures/research/java captures/research/classes.dex
rg -n 'Socket|DataOutputStream|InputStream|socket-reader|native' captures/research/java/com/mh
xcrun llvm-nm -D --defined-only captures/research/libgdx-flashds.so
```

Launcher tạo MyGame2D. Từ chữ ký Socket/stream lần tới sqfa, sqje, sqnw và sqi. Lời gọi Loader/Hidden0 cùng export `__ngen_com_mh_*` nối lớp Java với native. JADX đổi tên field trùng thành f3140a…; field runtime vẫn là a,b,c,d, phải xác minh bằng reflection/JNI.

Ví dụ symbol writer đã dùng trong bản này:

```text
_ZN10native_jvm7classes22__ngen_com_mh_sqje_22416__ngen_native_a2EP7JNIEnv_P8_jobjectS5_
```

```bash
xcrun llvm-objdump -d --no-show-raw-insn --disassemble-symbols=_ZN10native_jvm7classes22__ngen_com_mh_sqje_22416__ngen_native_a2EP7JNIEnv_P8_jobjectS5_ captures/research/libgdx-flashds.so
```

Assembly được dùng để chọn điểm hook và kiểm tra thứ tự phép tính. Các bảng cmethods/cfields của native được đối chiếu với chữ ký Java/JNI; một lệnh XOR trong assembly đơn lẻ không chứng minh đầy đủ thuật toán.

## 3. Xác nhận endpoint và hành động UI

```bash
adb -s 192.168.2.3:5555 shell dumpsys package com.lotasoft.colauloanthe
adb -s 192.168.2.3:5555 shell cat /proc/net/tcp /proc/net/tcp6
adb -s 192.168.2.3:5555 exec-out screencap -p > captures/research/screen.png
```

Lọc socket theo UID app 10315 trong lần đo, ghép với peer từ getpeername(fd). Cổng 0698 hex là 1688; dạng IPv4-mapped trong tcp6 cũng phải xử lý đúng. Bảng TCP cho endpoint/state, không cho schema packet.

Tại màn login đã có socket ESTABLISHED và ping. Bấm Đăng nhập không tạo socket game mới; packet đi trên socket cũ. UI sau đăng nhập hiển thị nhân vật trong Làng Thanh Khê, là bằng chứng khác với việc chỉ thấy TCP connect thành công.

## 4. Thu wire và packet ở hai tầng

| Điểm quan sát | Thu gì | Đối chiếu được gì |
|---|---|---|
| libc sendto/recvfrom/read/write + getpeername | Buffer thật của socket cổng 1688, fd, chiều, số byte syscall trả về | Seed, header, ciphertext; phải ghép stream chứ không coi mỗi syscall là một packet |
| sqje.a(sqi), tại entry native | Opcode và payload trước serialize/XOR | Request nào do hành động nào tạo ra |
| sqnw.e(), tại return native | sqi đã được reader tạo, trước dispatcher | Opcode và payload sau giải XOR |
| sqi getter/writer | Kiểu, cursor/độ dài trước lời gọi và giá trị | Field offset và độ dài; phân biệt string với int32 raw |
| sqnw handler e(sqi) trao đổi key | Static sqlq.q/r/s sau setup | Key thật của phiên, counter receive/send |

JNI writer nhận env ở đối số 0, self ở 1, packet ở 2; reader e() trả packet. Packet runtime: a=opcode, b=byte[], c=read cursor, d=used length. Đọc b bằng GetByteArrayRegion hoặc java.lang.reflect.Array, chỉ lấy d byte.

Iterate Java array sai qua bridge từng cho dữ liệu zero/rỗng. Kết quả đó không chứng minh app “giải mã lười”. Phải kiểm tra cách truy cập array trước khi diễn giải byte.

Các marker native của bản đã phân tích:

```text
writer:      __ngen_com_mh_sqje_22416__ngen_native_a2E
reader:      __ngen_com_mh_sqnw_39916__ngen_native_e6E
key setup:   __ngen_com_mh_sqnw_39917__ngen_native_e10E
read int32:  __ngen_com_mh_n_sqi_51816__ngen_native_c7E
read string: __ngen_com_mh_n_sqi_51817__ngen_native_f10E
```

Marker/index có thể đổi ở build sau. Hook module-load chỉ chọn và gắn điểm quan sát; gọi lại JNI sâu ngay trong callback linker từng làm app abort. Việc lấy Java state được hoãn tới khi runtime/classloader sẵn sàng. Bridge phải tương thích Frida; lỗi bridge/hook không được quy thành protocol lỗi.

## 5. Từ byte tới framing, key và serializer

1. So wire send với opcode/payload tại writer: tìm prefix độ dài, byte loại, tag PT01 và vị trí encoded opcode.
2. So wire receive với packet tại return reader: xác định header 14 byte, tổng length ở offset 2, body bắt đầu 14.
3. Lấy gói -1 chưa XOR, so masked key với sqlq.q sau handler: xác minh cumulative XOR, key length 16.
4. Cho hàm XOR native xử lý chuỗi byte giả với key/counter biết trước; so từng byte, kể cả wrap. Đối chiếu bằng nhiều frame thật liên tiếp để chứng minh counter không reset theo packet.
5. Gọi sqq.a/b với opcode giả, giữ cặp inverse hợp lệ. Không gán trực tiếp encoded int thành opcode nghiệp vụ.
6. Gọi writer sqi với int/string/array giả, đọc buffer: c(int) là int32BE, b(int) chỉ là một byte, string/array có length int32BE.

Ví dụ A2 nhận: opcode 3, len 8, hex `00000004100c0001`. Getter c7 tại offset 0 trả 4, g11 cùng offset trả bytes `100c0001`. c7 là lời gọi lồng để đọc length, không phải một field bổ sung.

## 6. Xác minh proof, hash và dữ liệu nhân vật

Hàm sqni.a(byte[],String) được gọi bằng password/challenge giả. Challenge `100c0001` với password giả `abc` trả `030c000111111111111111111111111111707372`. Đây là XOR/padding riêng, không phải AES. Cách làm tổng quát:

```text
p = UTF8(password)
start = signedByte(challenge[0]) + 1
out = array(max(challenge.length, start + p.length), fill=0x11)
copy challenge vào đầu out
out[start+i] = out[start+i] XOR p[i]
out[0] = p.length AND 0xff
```

Builder credential trên service giả được chặn trước hàng đợi mạng. Nó xác nhận thứ tự username/proof/platform/version/serverId/hash, không xác nhận gửi mạng hay login thành công. Đối tượng chưa có hàng đợi có exception sau điểm thu; không lấy exception đó làm bằng chứng protocol bị sai.

Hash cuối username là int32: bắt đầu 17, lặp UTF-16 code unit `h=31*h+unit` có tràn số. Vector giả probe_user cho c65b09cb. So nhiều lần để loại giả thuyết nonce theo phiên.

Ở response 9, getter native xác nhận prefix tới cấp/HP; đối chiếu UI cấp 3, HP 120/130 trong capture cũ. Response 11 cho string M1/Làng Thanh Khê, khu vực, các số và bytearray 3588 byte; `23*156=3588` hỗ trợ suy luận lưới ô, không xác minh mọi field sau đó.

## 7. Phân biệt kết quả với giới hạn

- Kích thước 64 byte hoặc mẫu lặp 16 byte không đủ chứng minh AES. Socket đã xác minh XOR riêng; asset nằm ngoài kết luận này.
- Hook dispatch cấp hai a(int,sqi) từng cho số khác opcode của packet; dùng reader/writer gốc khi dựng bảng giao thức.
- ACK 4 rỗng là nhánh thành công đã đo; không suy mọi packet lạ thành sai password.
- Gói 0 có flag ff và string thông báo account đang online nơi khác, quan sát từ V1; không phải timeout và không được gán là sai mật khẩu.
- Dữ liệu kỹ năng, cấu hình, entity snapshot mới giải prefix; các trường chưa hiểu giữ opaque.
- Các con số/capture timestamp ở đây thuộc phiên đã đo; không dùng key, HP hay vị trí cũ như hằng của game.
