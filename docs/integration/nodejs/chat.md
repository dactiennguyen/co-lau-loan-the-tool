# Nói trong khu bằng Node.js

`npm run chat` làm việc của nút bong bóng ở góc trên bên phải game: gửi một câu và nghe người khác nói. Gói đo ở CH1 ([nói trong khu](../../app/events/09-players-chat.md#c2s-1174)):

| Gói | Bố cục | Nghĩa |
|---|---|---|
| `c2s/1174` | `string chữ` | Bấm OK trong hộp Chat |
| `s2c/1174` | `i32 idNgườiNói; string chữ` | Server trả lại cho cả khu. Từ cấm đã bị che bằng `*`. Game hiện chữ này thành bong bóng trên đầu người nói khoảng 3 s |
| `s2c/1205` | `i32 idNgườiGửi; string tên; string chữ` | Một tin chat Thế giới. Bot chỉ nghe, không gửi |

Code nằm ở các file sau:

- gói: `playerSay`, `worldChat` trong [world.ts](../../../src/protocol/world.ts); `buildRequest(1174, { text })` trong [events.ts](../../../src/protocol/events.ts);
- luồng: [src/bot/chat.ts](../../../src/bot/chat.ts);
- CLI: [src/cli/chat-run.ts](../../../src/cli/chat-run.ts);
- test: [test/chat.test.ts](../../../test/chat.test.ts), dùng lại hai gói thật của CH1.

## Chạy

```bash
npm run chat -- --account=tiheo2 --say="chao ca nha"              # chạy thử: in câu sẽ nói, không đăng nhập
npm run chat -- --account=tiheo2 --say="chao ca nha" --confirm    # nói thật: người trong khu thấy khoảng 3 s
npm run chat -- --account=tiheo2 --listen=60                      # nghe 60 s: người trong khu và kênh Thế giới
npm run chat -- --account=tiheo2 --say="chao" --confirm --listen=30   # nói rồi nghe tiếp 30 s
```

- **Không có `--confirm` thì không gửi gì.** Câu nói là công khai với mọi người trong khu, nên bot bắt xác nhận như các lệnh khác. Chạy thử chỉ có `--say` thì không đăng nhập, nên không đá game trên điện thoại.
- Nói trong khu **không tốn gì**: ở CH1, sau hai tin không có `s2c/46`. Chat Thế giới tốn 5 Lượng mỗi tin, và gói gửi của nó chưa bắt. Vì vậy bot không gửi chat Thế giới, và `--world` bị từ chối.
- `--account=<tên>` lấy tài khoản trong `app/accounts.json`; không có thì lấy từ `.env`. **Tắt game trên điện thoại trước** nếu máy đang đăng nhập cùng nick, vì đăng nhập ở một nơi sẽ đá nơi kia ra.
- Câu nói được bỏ khoảng trắng ở hai đầu. Bot dừng **trước khi gửi** khi câu rỗng (game cũng báo "Chưa nhập nội dung chat."), có nhiều dòng, hoặc dài quá 100 ký tự. Giới hạn 100 ký tự là của bot: độ dài tối đa game nhận chưa đo.
- `--listen` nhận từ 1 tới 600 giây.

## Bot làm gì

1. Đăng nhập, in dòng `character` kèm `id`: đó là `numericId` của `s2c/9`, cũng là id của mình trong `s2c/1174`.
2. Với `--say`, bot in `plan` (câu sẽ nói). Có `--confirm` thì bot gửi `c2s/1174` và chờ `s2c/1174` **mang id của mình**. Nếu tin của người khác đến trước, bot ghi nó vào `heard` và vẫn chờ tin của mình. Server trả lại thì bot in `said`:
   - `text`: câu bot đã gửi;
   - `shown`: chữ server trả về, tức chữ người khác thấy;
   - `censored`: `true` khi hai chữ khác nhau, tức có từ bị che;
   - `ms`: thời gian chờ server trả.
3. Bot dừng khi trong 8 s không có `s2c/1174` của mình. Nếu server trả về một thông báo (`s2c/1256`) hay hộp thoại (`s2c/0`) thay cho `s2c/1174`, bot coi đó là bị từ chối và in câu server nói. Thông báo "Bạn chat quá nhanh" có trong game, nhưng chưa biết nó do server hay do máy tự báo.
4. Với `--listen`, bot giữ kết nối và in:
   - `heard`: câu của người khác trong khu, gồm `playerId`, chữ, và tên nếu biết;
   - `world_chat`: tin kênh Thế giới;
   - `notice`: thông báo.

   Sau đó bot đăng xuất. Dòng `summary` cuối có `shown` (chữ của mình server trả về) và `heard` (số câu nghe được của người khác).

**Tên người nói** lấy từ danh sách người trong khu. Bot chỉ biết các gói đến sau khi vào thế giới: `s2c/1167` khi có người vào khu, `s2c/1263` sau một trận. Danh sách đầy đủ lúc đăng nhập đã được client đọc trước khi bot bắt đầu, nên câu của người đã ở sẵn trong khu chỉ có `playerId`.

## Chưa rõ

- Người khác có nhận `s2c/1174` của mình không. Rất có thể có, vì gói mang id người nói. Cách thử: một nick chạy `--listen=60`, nick thứ hai cùng map, cùng khu chạy `--say=… --confirm`.
- Khoảng cách tối thiểu giữa hai câu, và "Bạn chat quá nhanh" do server hay do máy báo. Bot chỉ nói một câu mỗi lần chạy.
- Độ dài tối đa game nhận, và chữ có dấu. Các gói khác gửi chữ có dấu dạng UTF-8, nên bot gửi được, nhưng chưa thử với chat.
- Gói gửi chat Thế giới (bảng Tin nhắn, 5 Lượng).
