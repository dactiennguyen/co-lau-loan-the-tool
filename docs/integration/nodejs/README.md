# Node.js kết nối trực tiếp và lấy user

Đường chạy: `src/connect.ts` → `runClient()` → `net.createConnection()` → `play.colauloanthe.vn:1688`. Code chạy bằng Node.js ≥22.6, không có dependency npm ngoài. Lệnh trong tài liệu chạy từ thư mục gốc dự án.

| Cần tra | Tài liệu |
|---|---|
| Nhận dữ liệu qua API và đọc `result.user` | [Lấy dữ liệu user](user-data.md) |
| Checker APK/capture, log, diagnostic và cập nhật code | [Chẩn đoán tích hợp](diagnostics.md) |
| Kết quả login/world đã kiểm chứng trực tiếp | [Live check](live-check.md) |
| Giữ kết nối sau khi vào thế giới, bot tự làm nhiệm vụ và đánh quái | [Bot làm nhiệm vụ](quest-bot.md) |
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

`login` ngắt sau response nhân vật `9`; `world` ngắt sau entities `43` và players snapshot `1263`. Khu không có người chơi nào khác thì server không gửi `1263` (M25, 31/10): client đợi 1,5 s sau `43` (`snapshotWaitMs`) rồi coi như xong, với `playersSnapshotReceived: false`. Muốn giữ kết nối để chơi tiếp, truyền option `session` (xem [bot làm nhiệm vụ](quest-bot.md)); `npm run quest` dùng cách này. Client dùng credential bạn điền vào `.env` và không tự retry.

## Proxy

Đặt `CLLT_PROXY` trong `.env` (hay option `proxy` của `runClient()`) thì mọi lệnh (`npm start`, `npm run quest`, `npm run scan`…) đi qua proxy đó:

```bash
CLLT_PROXY=socks5://user:pass@1.2.3.4:1080    # socks5h:// và socks:// cũng được
CLLT_PROXY=http://user:pass@1.2.3.4:8080      # proxy HTTP có CONNECT
```

- Chỉ kết nối TCP đi qua proxy; giao thức game bên trong không đổi. Client nối tới proxy, mở đường tới `CLLT_HOST:CLLT_PORT` (SOCKS5 gửi tên host để proxy tự phân giải), rồi mới nhận seed.
- Thêm một bước `proxy` trước `seed`. Log có `tcp_connected` (kèm `proxy`) và `proxy_connected` (kèm `target`); chỉ ghi loại và địa chỉ proxy, không bao giờ ghi tài khoản/mật khẩu.
- Ký tự đặc biệt trong tài khoản/mật khẩu phải mã hoá kiểu URL (`@` → `%40`, `:` → `%3A`). Chưa hỗ trợ SOCKS4 và proxy HTTPS (TLS tới proxy).
- Proxy hỏng thì client dừng ở bước `proxy` với mã riêng: `PROXY_UNREACHABLE`, `PROXY_AUTH`, `PROXY_REFUSED`, `PROXY_PROTOCOL`, `PROXY_TIMEOUT`, `PROXY_CLOSED` ([chẩn đoán](diagnostics.md#đọc-diagnostic-theo-bước-dừng)).
- Đã thử thật ngày 31/10/2026 qua một proxy HTTP có tài khoản: `npm run connect -- --bootstrap` mở được đường tới `play.colauloanthe.vn:1688` sau khoảng 1 s, nhận seed, danh sách server và thông báo, xong sau 3,3 s. Chưa thử đăng nhập nick qua proxy.

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
| [connect.ts](../../../src/connect.ts) | Entry point trực tiếp; chọn mode, in kết quả |
| [env.ts](../../../src/env.ts) | Nạp `.env` và dựng option kết nối cho các CLI |
| [proxy.ts](../../../src/proxy.ts) | Đọc `CLLT_PROXY`; bắt tay SOCKS5/HTTP CONNECT không I/O (`ProxyTunnel`) mà `client.ts` chạy trước seed ([proxy](#proxy)) |
| [client.ts](../../../src/client.ts) | Socket thật, luồng đăng nhập `FLOW`, log event, `result.user`, heartbeat, deadline, `session` |
| [events.ts](../../../src/events.ts) | Catalog 91 gói (nhãn, thời điểm, schema); `buildRequest()` cho gói gửi, `decodeEvent()` cho gói nhận |
| [protocol.ts](../../../src/protocol.ts) | Serialize, seed/key/proof, frame và RX/TX XOR; đọc gói nhân vật/vị trí/map |
| [world.ts](../../../src/world.ts) | Đọc gói thế giới: quái của map, khu, người chơi, chat, vật phẩm, chỉ số, nhiệm vụ, xếp hạng |
| [battle.ts](../../../src/battle.ts), [battle-runner.ts](../../../src/battle-runner.ts) | Mô hình bàn 8×8 và gói trận; chạy một trận không giao diện |
| [quest.ts](../../../src/quest.ts), [quest-run.ts](../../../src/quest-run.ts) | Bot làm nhiệm vụ và lệnh `npm run quest` |
| [items.ts](../../../src/items.ts), [items-run.ts](../../../src/items-run.ts) | Bảng vật phẩm (`data/items.json`), tên đồ cho bot, giải mã icon; lệnh `npm run items` ([13-drops-items](../../app/events/13-drops-items.md#cách-lấy-lại-dữ-liệu)) |
| [bag-run.ts](../../../src/bag-run.ts) | Lệnh `npm run bag`: đăng nhập, in trang bị đang mặc và túi đồ theo tên, rồi ngắt; chỉ đọc ([cách lấy túi đồ](../../app/events/12-skills-items.md#cách-lấy-túi-đồ)) |
| [atlas.ts](../../../src/atlas.ts), [map-scan.ts](../../../src/map-scan.ts), [map-scan-run.ts](../../../src/map-scan-run.ts) | Bản đồ đã biết (`data/maps.json`) và lệnh `npm run scan` ([quét map](quest-bot.md#quét-map)) |
| [config.ts](../../../src/config.ts) | Baseline build, host/client info và opcode map |
| [check-apk.ts](../../../src/check-apk.ts) | So build APK/DEX/native bằng Node.js |
| [check-capture.ts](../../../src/check-capture.ts) | So log/capture, opcode, schema và bước đang thiếu |

Code live không import `test/` và không đọc JSON cấu hình/dữ liệu mẫu. Có hai file dữ liệu. [data/maps.json](../../../data/maps.json): bot và lệnh quét tự ghi vào đó những gì server đã gửi về từng map. [data/items.json](../../../data/items.json): bảng vật phẩm chép từ file của game trên máy, dựng lại bằng `npm run items`. Mapping opcode, host, version và build identity là hằng TypeScript trong [src/config.ts](../../../src/config.ts). Bản copy chỉ có `src/` đã đăng nhập server thật và nhận đủ user/map; xem [live-check](live-check.md). Dữ liệu regression chỉ còn một module `test/fixtures.ts`.

Các option của `runClient()` gồm host/port/serverId, username/password, `proxy`, mode, callback log và timeout. Mặc định API chọn bootstrap, timeout mỗi bước 8000 ms, tổng 30000 ms, heartbeat 2000 ms, settle 0 ms. CLI tự chọn mode theo credential như trên; `responseTimeoutMs`, `overallTimeoutMs`, `heartbeatMs`, `settleMs` là option API.

## Kiểm chứng và kiểm thử

```bash
npm test
npm run check:apk -- colauloanthe.1.0.3.apk
```

Server giả chỉ nằm trong `test/support/` làm TCP peer cho regression. `npm run test:scenario -- --quiet` là kiểm thử offline tùy chọn; không cần chạy trước `npm start`, không có tiến trình gateway được dùng lại sau test.

[Chẩn đoán tích hợp](diagnostics.md) giải thích exit code, checker, phần log bị cắt và cách cập nhật code khi có bằng chứng từ build mới.

Đã kiểm chứng Node.js login/world trực tiếp với server thật bằng account `manina2`: nhận character `9`, map location `29`, map `11`, entities `43`, snapshot `1263`. Kết quả và byte count nằm trong [live-check](live-check.md); mật khẩu không lưu trong repo. Nếu server gửi `s2c/0`, client báo `SERVER_MESSAGE` cùng text thật; đã gặp thông báo account đang đăng nhập nơi khác và phải đóng app điện thoại trước khi thử lại. Gate/ACK/status ngoài nhánh đã đo vẫn báo chưa hỗ trợ; lỗi mạng không được coi là sai mật khẩu. Các phần `opaqueBytes` chưa có schema đầy đủ.
