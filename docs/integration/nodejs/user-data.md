# Lấy dữ liệu user bằng Node.js

`runClient()` tổng hợp `result.user` từ các response của lần kết nối hiện tại. [Cách chạy và nạp môi trường](README.md); schema byte, getter native và mức độ chắc chắn được mô tả riêng trong [dữ liệu nhân vật của app](../../app/user-data.md).

## Chọn dữ liệu cần lấy

| Cách chạy | Khi hoàn tất | Dữ liệu trong `result.user` |
|---|---|---|
| `npm run connect -- --bootstrap` | Server list và thông báo boot | `account` từ input, chưa lấy nhân vật |
| `npm run login` | Nhận response `9` | `account`, `character` |
| `npm run world` | Nhận entities `43` và players snapshot `1263` | `account`, `character`, `location`, `map` |

`npm start` tự chọn world khi có đủ username/password, bootstrap khi chưa có. API `runClient()` mặc định là bootstrap, vì vậy khi tích hợp bằng code phải truyền `mode` mong muốn.

## Dùng API

Ví dụ entry point đặt tại thư mục gốc dự án; nạp biến môi trường trước khi gọi:

```typescript
import { runClient } from './src/net/client.ts';

const result = await runClient({
  username: process.env.CLLT_USERNAME,
  password: process.env.CLLT_PASSWORD,
  mode: 'world',
  log: record => {
    if (record.event === 'user_info') console.log('Nhân vật:', record.user);
    if (record.event === 'user_location') console.log('Vị trí map:', record.location);
    if (record.event === 'user_map') console.log('Bản đồ:', record.map);
  },
});

if (!result.ok) {
  console.error(result.state, result.diagnostic);
  process.exitCode = 1;
} else {
  console.log(result.user);
}
```

Chạy bằng `node --env-file=.env --experimental-strip-types your-file.ts`. API không tự đọc `.env`; CLI của dự án làm bước đó.

## Nguồn của từng object

| Object/field | Nguồn | Giới hạn |
|---|---|---|
| `account` | `options.username.toLowerCase()` | Giá trị đầu vào chuẩn hoá; riêng field này chưa chứng minh login thành công |
| `character` | Prefix `s2c/9` | `status`, `count`, `name`, `numericId`, `displayName`, `flag1/2`, `level`, `hp`, `maxHp`, `prefixBytes` |
| `location` | `s2c/29` | `characterName`, `mapId`, `field` |
| `map` | Prefix `s2c/11` | `flag`, `mapId`, `name`, `area`, `x`, `y`, `field36`, `dimension1/2`, `tileBytes`, `prefixBytes` |

`count` là alias của byte ở offset 1 trong response 9; chưa chốt nghĩa số nhân vật. `numericId` chưa được xác minh là ID account/database; `x/y` và hai dimension của map có nghĩa suy luận. `prefixBytes` là số byte parser đã đi qua, không phải field trên dây. `tileBytes` là độ dài bytearray, không phải toàn bộ tile data trả trong object.

Khi kết nối lỗi giữa chừng, `result.user` có thể đã có một phần dữ liệu. Luôn xét `result.ok`, `state` và diagnostic trước khi coi lần đồng bộ hoàn tất. Mode world thu cả entities/snapshot để xác định đích, nhưng hiện chưa trả chúng thành hai object có schema đầy đủ trong `user`.

Client lấy tên nhân vật từ response 9 cho request 29/42, và map ID từ response 29 cho request 11/43. Không truyền account thay cho tên nhân vật.

## Log dữ liệu

Packet nhận có `kind=receive`, ví dụ `event=s2c/9`, `fields`, `parsedBytes` và `opaqueBytes`. Record tổng hợp có `kind=derived`:

| Event của client | Nguồn |
|---|---|
| `user_info` | `sourceEvent=s2c/9`, object `user` |
| `user_location` | `sourceEvent=s2c/29`, object `location` |
| `user_map` | `sourceEvent=s2c/11`, object `map` |

Các tên này do client đặt, không phải tên event string gốc của game. Log CLI kết thúc bằng `kind=summary`, `event=client_result`; đọc `user` ở record đó để lấy kết quả cuối.

Lần [kiểm chứng trực tiếp](live-check.md) nhận nhân vật `manina`, cấp 3, HP 130/130 và map `M1 — Làng Thanh Khê`. HP/khu vực/vị trí khác mẫu app cũ là bình thường; client không lấy các giá trị mẫu làm kết quả đăng nhập.

Chưa có API tích hợp đã xác minh cho email, số điện thoại, tổng tiền hoặc profile account đầy đủ. Field chưa hiểu tiếp tục được báo là opaque trong log.
