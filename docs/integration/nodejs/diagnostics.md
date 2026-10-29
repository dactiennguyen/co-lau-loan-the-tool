# Kiểm tra và cập nhật tích hợp Node.js

Trang này hướng dẫn dùng các checker, log và test của dự án. Nếu cần tìm lại schema/thuật toán từ APK mới, dùng quy trình [điều tra app](../../app/reinvestigation.md); sau khi có bằng chứng mới cập nhật code tích hợp.

## Kiểm tra code và build đang dùng

Chạy từ thư mục gốc:

```bash
npm test
npm run check:apk -- colauloanthe.1.0.3.apk
```

Baseline được khai báo trong [config.ts](../../../src/config.ts); dữ liệu regression nằm trong [test/fixtures.ts](../../../test/fixtures.ts). Các lệnh này không đăng nhập server. `check:apk` trả exit code 0 nếu byte APK trùng baseline, 1 nếu khác build, 2 nếu không đọc được đầu vào/định dạng ZIP không hỗ trợ. APK khác chưa đồng nghĩa giao thức hỏng.

| Finding | Nghĩa / bước tiếp |
|---|---|
| `APK_CHANGED` | Hash toàn file khác; xem các member và điều tra bản mới |
| `DEX_CHANGED` | Chữ ký Java/field/version/flow có thể đổi |
| `NATIVE_CHANGED` | Cần xác minh lại writer/reader/key/proof/mapping/schema |
| `MEMBER_MISSING` | Không còn member/ABI ở vị trí baseline |
| `HOOK_MARKER_MISSING` | Không thấy byte-string marker của bản cũ; tìm lại điểm quan sát |

Marker là phép tìm chuỗi trong binary, không phải resolve ELF export hay xác minh hành vi runtime. `sameBuild=true` chỉ nhận diện artifact baseline, chưa chứng minh trạng thái server hôm nay.

## Ghi log kết nối trực tiếp

```bash
mkdir -p captures
node --experimental-strip-types src/connect.ts --bootstrap > captures/bootstrap-NEW.jsonl
# Sau khi điền credential trong .env:
node --experimental-strip-types src/connect.ts --world > captures/world-NEW.jsonl
```

Dùng `node` trực tiếp khi redirect để không lẫn banner npm. CLI nạp `.env`, mở TCP tới host/port đã cấu hình và ghi JSONL. Log packet có hướng/opcode, encoded opcode, state, fields và số byte chưa giải; [chi tiết log](README.md#log-event-thực-tế).

Log giữ prefix tối đa 128 byte, không in proof/hex của request credential 4. Vì vậy log client đủ để xem bước dừng nhưng có thể thiếu body để checker tự xác minh schema. Dữ liệu thu từ app cần được ghi đúng độ dài/hex thực, không điền byte còn thiếu.

## So log hoặc capture

```bash
npm run check:capture -- captures/world-NEW.jsonl --mode world
```

Mode `bootstrap` dừng ở thông báo boot; `login` cần response nhân vật; `world` cần map/entities/snapshot. Checker nhận log client hoặc record native JSONL dạng:

```json
{"type":"send","payload":{"kind":"receive","op":9,"len":551,"hex":"..."}}
```

`hex` trong ví dụ là chỗ điền payload thật đã giải XOR. Metadata tùy chọn: `{"kind":"capture_metadata","apkSha256":"..."}`; hash phải lấy từ APK thật đang cài. Cách thu packet từ app ở [phương pháp điều tra](../../app/investigation.md).

| Kết quả | Cách hiểu |
|---|---|
| `ok=true` | Không gặp lỗi cứng trong phần đã kiểm tra; chưa xác minh toàn bộ app |
| `completed=true` | Checker đọc được payload cần thiết cho đích đã chọn |
| `completionReported=true` | Log client báo hoàn tất, chưa chắc checker có đủ body |
| `payloadValidationComplete=false` | Có body cắt/thiếu; cần capture đủ trước khi kết luận schema đổi |
| `state`, `eventSizes`, `findings` | Bước đã tới, kích thước gói và chẩn đoán theo index/hướng/opcode |

Index bắt đầu từ 0 trong danh sách record đã normalize. Lỗi parse có offset/requestedBytes/remainingBytes. Checker so kiểu/prefix/hằng client/thứ tự request; HP, vị trí, key phiên và số lượng thực thể được phép thay đổi. Phần opaque chưa có schema vẫn nằm ngoài kết luận kiểm tra.

## Đọc diagnostic theo bước dừng

| Diagnostic | Nơi kiểm tra |
|---|---|
| `DNS_ERROR`, `TCP_ERROR` | Host/port/env, mạng và trạng thái endpoint |
| `SEED_TIMEOUT` | Chưa nhận đủ 4 byte seed; đối chiếu endpoint/handshake mới |
| `FRAME_LENGTH` | [protocol.ts](../../../src/protocol.ts): length/offset/buffering frame |
| `KEY_LAYOUT` | `sessionKey()` và handler -1 của app |
| `OPCODE_MAPPING_OR_CATALOG`, `OPCODE_NEW` | Mapping trong config và danh mục [events.ts](../../../src/events.ts); unknown frame vẫn phải tiêu thụ XOR |
| `CLIENT_INFO_CHANGED` | Platform/protocol version gửi ở request 1206 |
| `PAYLOAD_SCHEMA`, `SCHEMA_CHANGED`, `UNEXPECTED_TAIL`, `PAYLOAD_OR_BRANCH` | Opcode/offset và getter native; cập nhật parser khi đã có schema |
| `PUSH_SCHEMA` | Schema push đang suy luận; giữ raw/opaque tới khi xác minh |
| `UNSUPPORTED_BRANCH` | Gate/ACK/status ngoài nhánh đã đo; quan sát UI app |
| `SERVER_NOTIFICATION` | Text thông báo trả ngoài bước bootstrap |
| `SERVER_MESSAGE` | Gói 0/text thật; đã gặp account đang đăng nhập nơi khác |
| `RESPONSE_TIMEOUT`, `MISSING_RESPONSE` | State và `expectedReceiveOpcodes`; có thể thiếu thời gian capture |
| `REQUEST_ORDER_CHANGED`, `MISSING_REQUEST`, `PREVIOUS_RESPONSE_MISSING`, `MISSING_REQUIRED_EVENT` | So flow từ boot; phân biệt capture bắt đầu muộn với flow mới |
| `CAPTURE_TRUNCATED`, `PAYLOAD_MISSING` | Thiếu bằng chứng, cần body đủ |
| `NATIVE_HOOK_MISSING`, `NATIVE_HOOK_ERROR`, `NO_PACKETS` | Instrumentation/ABI/package/export trước khi sửa giao thức |
| `APK_CHANGED`, `IDENTITY_UNKNOWN` | Chưa nhận diện đúng build để áp dụng baseline |
| `SERVER_CLOSED`, `OVERALL_TIMEOUT` | Gói cuối, state, pending bytes và counter |

Client kèm `lastReceiveOpcode`, expected response, số byte pending và RX/TX counter khi fail. Heartbeat không reset deadline chờ response nghiệp vụ. Lỗi mạng không được coi là sai mật khẩu; client không tự retry credential. Với thông báo account đang online nơi khác, kết thúc phiên app của chính account trước khi kiểm chứng lại.

## Regression offline

```bash
npm run test:scenario -- --quiet
npm run test:scenario -- --quiet --fault bad-key
npm run test:scenario -- --quiet --fault bad-frame
npm run test:scenario -- --quiet --fault bad-map
npm run test:scenario -- --quiet --fault stall-map
npm run test:scenario -- --quiet --fault new-opcode
```

Peer TCP nằm trong `test/support/`, không được import trong luồng kết nối thật. Các fault là dữ liệu lỗi nhân tạo để kiểm tra diagnostic; bad-key/frame/map và stall-map cố tình exit 1. `new-opcode` vẫn hoàn tất sau cảnh báo để kiểm tra việc tiêu thụ XOR không làm lệch frame sau.

Ví dụ bad-map dừng ở state `map`, chờ opcode 11 và báo `PAYLOAD_SCHEMA` kèm vị trí đọc thiếu byte. Đây chưa phải một lỗi từng quan sát từ server thật. [Nguồn dữ liệu test](../../../test/README.md).

## Cập nhật code sau khi điều tra bản mới

1. Ghi nhận artifact, wire/schema/flow và nguồn bằng chứng mới trong `docs/app/` trước; giữ rõ mốc build cũ/mới.
2. Cập nhật [config.ts](../../../src/config.ts) nếu build identity/endpoint/client info/opcode map đổi; [protocol.ts](../../../src/protocol.ts) nếu serializer/framing/key/proof đổi; [events.ts](../../../src/events.ts) nếu schema đổi; [client.ts](../../../src/client.ts) nếu thứ tự/state/cause đổi.
3. Giữ vector cũ hữu ích và bổ sung capture/native vector vào module fixture dành cho test; không dùng response mẫu làm kết quả của client thật.
4. Chạy regression thích hợp. Khi kiểm chứng server thật, ghi build, thời điểm, mode và kết quả; chỉ ghi phạm vi thực sự đã chạy.
5. Cập nhật các trang app và tích hợp tương ứng bằng Markdown. Tài liệu hiện là file tĩnh; không còn script sinh docs/hook tạm trong repo.
