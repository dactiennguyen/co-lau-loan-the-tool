# Node.js kết nối trực tiếp và lấy user

Đường chạy: `src/connect.ts` → `runClient()` → `net.createConnection()` → `play.colauloanthe.vn:1688`. Code chạy bằng Node.js ≥22.6, không có dependency npm ngoài. Lệnh trong tài liệu chạy từ thư mục gốc dự án.

| Cần tra | Tài liệu |
|---|---|
| Nhận dữ liệu qua API và đọc `result.user` | [Lấy dữ liệu user](user-data.md) |
| Checker APK/capture, log, diagnostic và cập nhật code | [Chẩn đoán tích hợp](diagnostics.md) |
| Kết quả login/world đã kiểm chứng trực tiếp | [Live check](live-check.md) |
| Binary, phương pháp và schema byte của game | [Điều tra app](../../app/README.md) |

## Chạy với tài khoản của bạn

```bash
cp .env.example .env
# Điền CLLT_USERNAME, CLLT_PASSWORD trong .env.
npm start
```

CLI tự đọc `.env`; giá trị đã có trong môi trường shell được ưu tiên. Mặc định host `play.colauloanthe.vn`, port `1688`, serverId `24` (lấy từ phiên app đã đo). Có credential thì lệnh mặc định chạy đến world; chưa có thì chỉ bootstrap.

```bash
npm run login
# Hoặc lấy thêm bản đồ và đồng bộ thế giới:
npm run world
# Chỉ kiểm tra mạng, không gửi credential dù .env đã có tài khoản:
npm run connect -- --bootstrap
```

`login` ngắt sau response nhân vật `9`; `world` ngắt sau entities `43` và players snapshot `1263`. Đây là client lấy dữ liệu khởi tạo; chưa giữ một phiên gameplay vô hạn. Client dùng credential bạn điền vào `.env` và không tự retry.

## Dùng bằng code

```typescript
// Entry point đặt ở thư mục gốc dự án.
import { runClient } from './src/client.ts';

const result = await runClient({
  host: 'play.colauloanthe.vn',
  port: 1688,
  serverId: 24,
  username: process.env.CLLT_USERNAME,
  password: process.env.CLLT_PASSWORD,
  mode: 'world',
  log: packet => console.log(JSON.stringify(packet)),
});

if (result.ok) {
  console.log(result.user.character?.name);
  console.log(result.user.character?.level);
  console.log(result.user.character?.hp);
  console.log(result.user.location?.mapId);
  console.log(result.user.map?.name);
} else {
  console.error(result.state, result.diagnostic);
}
```

API `runClient()` không tự đọc `.env`; CLI làm bước đó. Nếu tự viết entry point, dùng `node --env-file=.env --experimental-strip-types your-file.ts` hoặc `process.loadEnvFile('.env')` trước khi gọi API. `result.user.account` là account từ input chuẩn hoá chữ thường; dữ liệu character/map chỉ có sau các response tương ứng.

## Log event thực tế

Packet được nhận diện bằng hướng/opcode, không bằng tên string phỏng đoán:

| Field | Nghĩa |
|---|---|
| `kind` | `send`, `receive`, `derived`, `lifecycle` hoặc `summary` |
| `event` trên packet | `c2s/9`, `s2c/9`…; nếu chưa giải opcode: `s2c/encoded:<int>` |
| `opcode` | Mã nghiệp vụ sau inverse mapping |
| `encodedOpcode` | Giá trị int32 trong giao thức trước lớp XOR |
| `label`, `labelSource` | Nhãn mô tả do phân tích đặt; `labelSource=analyst` |
| `protocolEventName` | `null`: chưa có tên event string gốc được khôi phục |
| `fields`, `parsedBytes`, `opaqueBytes` | Giá trị đã đọc, số byte đã giải và phần chưa biết |
| `payloadBytes`, `payloadHex`, `hexTruncated` | Độ dài gốc, prefix tối đa 128 byte; credential `4` không in proof/hex |
| `state`, `elapsedMs` | Bước đang chạy và thời gian kể từ connect |

Các record `user_info`, `user_location`, `user_map` có `kind=derived` và `sourceEvent` trỏ tới `s2c/9`, `s2c/29`, `s2c/11`. Đây là dữ liệu tổng hợp của client, không phải tên event gốc trên dây. Record `client_result` là kết quả cuối để đọc `user` và diagnostic.

[Cách lấy user](user-data.md) chỉ rõ từng field của API lấy từ response nào. Byte offset/getter và giới hạn schema nằm trong [tài liệu app](../../app/user-data.md). Các tên như `getUserInfo` hoặc Socket.IO event chưa được xác minh trong giao thức này.

## File code chính

| File | Vai trò |
|---|---|
| [connect.ts](../../../src/connect.ts) | Entry point trực tiếp; nạp env, chọn mode, in kết quả |
| [client.ts](../../../src/client.ts) | Socket thật, state machine, log event, `result.user`, heartbeat và deadline |
| [events.ts](../../../src/events.ts) | Dựng request/đọc response theo opcode; nhãn mô tả và schema |
| [protocol.ts](../../../src/protocol.ts) | Serialize, seed/key/proof, frame và RX/TX XOR |
| [config.ts](../../../src/config.ts) | Baseline build, host/client info và opcode map |
| [check-apk.ts](../../../src/check-apk.ts) | So build APK/DEX/native bằng Node.js |
| [check-capture.ts](../../../src/check-capture.ts) | So log/capture, opcode, schema và bước đang thiếu |

Code live không import `test/` và không đọc JSON cấu hình/dữ liệu mẫu. Mapping opcode, host, version và build identity là hằng TypeScript trong [src/config.ts](../../../src/config.ts). Bản copy chỉ có `src/` đã đăng nhập server thật và nhận đủ user/map; xem [live-check](live-check.md). Dữ liệu regression chỉ còn một module `test/fixtures.ts`.

Các option của `runClient()` gồm host/port/serverId, username/password, mode, callback log và timeout. Mặc định API chọn bootstrap, timeout mỗi bước 8000 ms, tổng 30000 ms, heartbeat 2000 ms, settle 0 ms. CLI tự chọn mode theo credential như trên; `responseTimeoutMs`, `overallTimeoutMs`, `heartbeatMs`, `settleMs` là option API.

## Kiểm chứng và kiểm thử

```bash
npm test
npm run check:apk -- colauloanthe.1.0.3.apk
```

Server giả chỉ nằm trong `test/support/` làm TCP peer cho regression. `npm run test:scenario -- --quiet` là kiểm thử offline tùy chọn; không cần chạy trước `npm start`, không có tiến trình gateway được dùng lại sau test.

[Chẩn đoán tích hợp](diagnostics.md) giải thích exit code, checker, phần log bị cắt và cách cập nhật code khi có bằng chứng từ build mới.

Đã kiểm chứng Node.js login/world trực tiếp với server thật bằng account `manina2`: nhận character `9`, map location `29`, map `11`, entities `43`, snapshot `1263`. Kết quả và byte count nằm trong [live-check](live-check.md); mật khẩu không lưu trong repo. Nếu server gửi `s2c/0`, client báo `SERVER_MESSAGE` cùng text thật; đã gặp thông báo account đang đăng nhập nơi khác và phải đóng app điện thoại trước khi thử lại. Gate/ACK/status ngoài nhánh đã đo vẫn báo chưa hỗ trợ; lỗi mạng không được coi là sai mật khẩu. Các phần `opaqueBytes` chưa có schema đầy đủ.
