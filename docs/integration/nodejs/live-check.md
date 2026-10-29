# Kiểm thử Node.js với server thật

Thời điểm: 2026-10-29T16:19:12.490Z.
Account: manina2. Mật khẩu chỉ dùng trong bộ nhớ khi test, không lưu vào repo.
Đã copy riêng src/ và package metadata vào thư mục tạm; không có dữ liệu mẫu, file JSON phụ, test/ hay server giả.
TCP trực tiếp: play.colauloanthe.vn → 14.225.213.40:1688.

Kết quả: THÀNH CÔNG; state entities; nhận 25 packet.

## Dữ liệu nhận thật

```json
{
  "ok": true,
  "user": {
    "account": "manina2",
    "character": {
      "status": 1,
      "count": 1,
      "name": "manina",
      "numericId": 155,
      "displayName": "manina",
      "flag1": 1,
      "flag2": 0,
      "level": 3,
      "hp": 130,
      "maxHp": 130,
      "prefixBytes": 40
    },
    "location": {
      "characterName": "manina",
      "mapId": "M1",
      "field": 0
    },
    "map": {
      "flag": 1,
      "mapId": "M1",
      "name": "Làng Thanh Khê",
      "area": 1,
      "x": 224,
      "y": 320,
      "field36": 0,
      "dimension1": 23,
      "dimension2": 156,
      "tileBytes": 3588,
      "prefixBytes": 3640
    }
  },
  "diagnostic": null
}
```

## Packet thực tế

| Event | Byte payload |
|---|---:|
| c2s/-1 | 0 |
| s2c/-1 | 17 |
| c2s/1206 | 24 |
| s2c/1207 | 42 |
| s2c/1209 | 1 |
| c2s/5 | 9 |
| s2c/5 | 54 |
| c2s/2 | 0 |
| s2c/2 | 4 |
| c2s/3 | 0 |
| s2c/3 | 8 |
| c2s/4 | 69 |
| s2c/1259 | 5 |
| s2c/1265 | 30 |
| s2c/1269 | 30 |
| s2c/1271 | 140 |
| s2c/1272 | 47 |
| s2c/4 | 0 |
| c2s/9 | 16 |
| s2c/9 | 551 |
| c2s/30 | 1 |
| s2c/46 | 37 |
| s2c/39 | 575 |
| s2c/1195 | 1 |
| s2c/1220 | 1 |
| s2c/30 | 23442 |
| c2s/42 | 10 |
| s2c/42 | 246 |
| c2s/29 | 10 |
| s2c/29 | 20 |
| c2s/11 | 11 |
| s2c/11 | 11379 |
| c2s/43 | 6 |
| s2c/43 | 1404 |
| s2c/1177 | 71 |
| s2c/1263 | 5163 |
| s2c/1184 | 256 |

Đã gặp thông báo s2c/0: “Tài khoản hiện đang đăng nhập ở một nơi khác” khi app Android còn chạy. Đã đóng app trên điện thoại trước lượt kiểm tra này. Client hiện báo SERVER_MESSAGE và text thật, không gán thông báo này thành sai mật khẩu.

Không lưu outgoing proof hoặc mật khẩu. Parser chỉ xác minh prefix và giữ phần chưa biết là opaque; không khẳng định đã giải toàn bộ gameplay.
