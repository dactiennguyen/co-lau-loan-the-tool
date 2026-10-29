# Điều tra lại khi có bản APK mới

Lấy [artifact hiện tại](artifact.md) làm mốc đối chiếu và lặp lại [phương pháp điều tra](investigation.md). Tên file hoặc số version UI không chứng minh giao thức còn tương thích. Mục tiêu là tìm lớp đã thay đổi bằng bằng chứng từ app mới.

## 1. Nhận diện artifact mới

```bash
shasum -a 256 /duong/dan/app-NEW.apk
unzip -l /duong/dan/app-NEW.apk
aapt2 dump badging /duong/dan/app-NEW.apk
aapt2 dump xmltree /duong/dan/app-NEW.apk --file AndroidManifest.xml
```

Ghi hash APK, classes.dex và native đúng ABI; package, launcher, manifest version, version UI và version thực gửi trong packet là các trường riêng. Xác nhận APK đang cài trên thiết bị là artifact đã nhận diện; đường dẫn package lấy từ `adb shell pm path com.lotasoft.colauloanthe`, rồi pull/băm các APK tương ứng. Nếu là split APK, ghi đủ các phần thay vì chỉ coi base.apk là toàn app.

| Thành phần thay đổi | Cần xem lại |
|---|---|
| Chỉ hash APK khác | Kiểm tra member trước; có thể đổi asset/signature, chưa đủ kết luận đổi protocol |
| DEX khác | Launcher, lớp đăng ký native, chữ ký/field, platform/version, luồng UI |
| libgdx-flashds.so khác | Writer/reader, key, proof, opcode map, serializer và handler |
| Không còn member/ABI cũ | Tìm kiến trúc đóng gói/engine/ABI mới trước khi tái dùng điểm hook |
| Marker native mất | Tìm lại lớp/registration/export; marker cũ chỉ nhận diện bản đã đo |

Marker còn nguyên không chứng minh thân hàm còn nguyên. Không thay baseline cũ chỉ vì đã nhận một APK có tên mới.

## 2. Xác nhận runtime trước khi diễn giải packet

Kiểm tra package/PID/UID/ABI của app mới và Java bridge/Frida tương thích. Mở app, ghi thao tác UI và socket peer thực tế theo UID/getpeername. Đối chiếu DNS/IP/cổng và việc có TLS hay không từ phiên mới; không coi IP cũ là hằng.

Nếu không thu được packet, tách lỗi hook với lỗi mạng: module đã load chưa, export có tồn tại không, packet có đúng field runtime a/b/c/d không, cách đọc Java bytearray có trả byte thật không? Không dùng buffer rỗng do bridge lỗi để kết luận app mã hoá kiểu mới.

Để giữ màn hình trong lần điều tra trên thiết bị đã dùng:

```bash
adb -s 192.168.2.3:5555 shell settings put system screen_off_timeout 2147483647
adb -s 192.168.2.3:5555 shell svc power stayon true
adb -s 192.168.2.3:5555 shell input keyevent KEYCODE_WAKEUP
```

Timeout này khoảng 24,9 ngày khi dùng pin; stay-on áp dụng khi cắm nguồn. Serial/UID/PID của lần đo trước có thể thay đổi ở lần sau.

## 3. Thu lại từ boot tới thế giới

Thu đồng thời wire ở syscall và packet tại native writer/reader, trước dispatcher. Với mỗi record, giữ chiều truyền, opcode đã giải và encoded opcode nếu có, độ dài gốc, byte thực đã thu, cursor, thời điểm và thao tác UI. Ghi giới hạn capture/truncation rõ ràng; không điền byte chưa thu được.

1. Boot: seed, handshake, `-1`, `1206`, `1207/1209`, `5`, heartbeat.
2. Bấm login: `2`, `3`, `4`; đối chiếu challenge và nhánh ACK/gate với UI.
3. Nhân vật/thế giới: `9`, `30`, `42`, `29`, `11`, `43`, push `1263` và các gói xen giữa.
4. Muốn hiểu một tính năng khác: ghi mốc thao tác của tính năng đó, so trước/sau và lặp lại với một thay đổi đầu vào mỗi lần.

Không bắt đầu ở giữa phiên rồi suy rằng key/bootstrap bị bỏ. Login dùng lại socket boot trong bản đã đo; cần xác minh lại nếu bản mới mở socket khác, reconnect hoặc redirect.

## 4. Khoanh vùng thay đổi

| Hiện tượng | Bằng chứng cần lấy lại |
|---|---|
| Không có seed/TCP đóng | Endpoint, trạng thái server, syscall, UI; chưa kết luận sai credential |
| Không ghép được frame | Int32 length, offset body và buffering stream; so cả TX/RX |
| Gói đầu đúng, gói sau sai | Vùng byte XOR, thứ tự tiêu thụ counter, key setup và wrap qua nhiều frame |
| Encoded opcode không khớp | Gọi lại native mapping và inverse bằng giá trị giả; kiểm tra miền truy vấn |
| Opcode còn đúng nhưng đọc string/int lỗi | Getter/writer và cursor trước từng lời gọi, byte length, nhánh/status |
| Gói mới hoặc ACK khác | Handler và hành vi UI; giữ raw và tên trung tính tới khi hiểu nghĩa |
| Chỉ HP/khu vực/toạ độ/body lớn thay đổi | So kiểu/length/nhánh trước; các giá trị này vốn động |
| Push đổi layout | Ghi full body và kiểu getter; chưa coi nhãn gameplay suy luận là schema chắc chắn |
| Thông báo account đang online nơi khác | Ghi gói 0/text và UI; tách khỏi lỗi password/timeout |

Kiểm tra framing trước key/XOR, rồi mapping, kiểu field và flow nghiệp vụ. Kích thước 16/64 byte hoặc một lệnh XOR/AES trong thư viện chưa chứng minh thuật toán của cả socket.

## 5. Xác minh thuật toán và field mới

Gọi native bằng challenge/password/username giả để tạo vector proof/hash, không lưu credential thật. Đối chiếu nhiều vector với byte thực của app. Thử int/string/array có độ dài biên và string nhiều byte để xác định serializer. Với getter string/array, int32 đọc lồng để lấy length không phải một field bổ sung.

Với field gameplay, giữ offset/kiểu/giá trị gốc rồi đối chiếu UI qua nhiều mẫu. Tách tên chắc chắn với nhãn suy luận; phần chưa hiểu vẫn để opaque. Một lần login thành công chưa xác minh mọi lỗi xác thực, tạo nhân vật hay toàn bộ gameplay.

## 6. Ghi kết quả để tra lại

Cập nhật nhận diện build ở [artifact](artifact.md), điểm quan sát/cách thu ở [investigation](investigation.md), quy tắc byte ở [protocol](protocol.md), cặp mapping ở [opcode map](opcode-map.md) và schema theo từng [event](events/README.md). Mỗi thay đổi ghi nguồn, nhánh đã kích hoạt, mẫu byte và giới hạn. Giữ mốc build cũ rõ ràng để không trộn quan sát giữa hai bản.

Sau khi đã chuyển thông tin cần tra cứu vào tài liệu, dọn bản giải nén, trace nhạy cảm và script hook tạm; dừng đúng tiến trình Frida server do mình khởi động. APK đầu vào và cấu hình cá nhân nằm ngoài phần dọn công cụ tạm.
