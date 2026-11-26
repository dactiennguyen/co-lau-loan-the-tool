# Xác thực đăng nhập

[Mục lục event](README.md). Nhãn mô tả/tên field bên dưới là nhãn phân tích, không phải tên string gốc của giao thức. Nguồn A1/A2/V1 và cách thu được giải thích trong [phương pháp điều tra](../investigation.md).

Challenge của gói 3 khác key XOR của gói -1. Xem [cách xác minh proof/hash/serializer](../investigation.md) trước khi gán vai trò cho các khối byte.

<a id="s2c-0"></a>

## s2c/0

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | server_message |
| Xuất hiện khi | Server gửi hộp thông báo: lúc đăng nhập khi account online nơi khác; trong game là lời nhắc thường (Hương Lão → Cách tính điểm, Chế tạo thiếu nguyên liệu) |
| Sau đó | Lúc đăng nhập: đọc text và dừng phiên đang chờ, không coi là sai mật khẩu. Trong game: client ghi server_message, giao gói cho phiên và chạy tiếp |
| Bố cục payload | i8 flag; string text |
| Độ chắc chắn | Đã nhận trực tiếp từ server thật bằng kết nối kiểm chứng độc lập: flag=-1, thông báo account đang đăng nhập nơi khác. Trong game cũng flag=-1 (J1, G1, O1) |
| Độ dài payload mẫu | 65 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
ff0000003c54c3a069206b686fe1baa36e206869e1bb876e20c491616e6720c491c4836e67206e68e1baad7020e1bb9f206de1bb9974206ec6a169206b68c3a163
```

Nguồn: V1: response trực tiếp từ server trong phiên kiểm chứng độc lập, không phải capture từ APK.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "flag": -1,
    "text": "Tài khoản hiện đang đăng nhập ở một nơi khác"
  },
  "bytesInterpreted": 65,
  "bytesUnknown": 0
}
```

Một text khác cũng đến qua `s2c/0` ở cùng bước: **"Vui lòng chờ 0 giây"**, khi client Node đăng nhập vài giây sau lúc app trên điện thoại vừa bị tắt (Q13). Thử lại sau 10 s thì vào được. Server giữ phiên cũ một lúc ngắn sau khi nó đóng. Với bot TS cũng vậy (R3, 31/10): chạy hai lệnh liền nhau với cùng một nick thì lần sau nhận "Vui lòng chờ 9 giây", rồi "Vui lòng chờ 8 giây". Chờ 12 s giữa hai lần đăng nhập thì không bị chặn. [Đo 3 lần]

**Thông báo phạt lúc đăng nhập không phải lời từ chối** [Đo 26/11]: nick bị cấm nhận EXP nhận `s2c/0` (cờ `ff`, 392 byte) **sau** `s2c/4`, ngay sau `s2c/43` và trước `s2c/1263`: "Xử lý vi phạm lần 1, tài khoản của bạn đang bị cấm nhận kinh nghiệm (đánh quái). Lý do: Sử dụng phần mềm thứ 3 can thiệp trò chơi. Thời hạn: tới 13:14 03/12/2026 …" (nobita; 40six2 tới 12:59 03/12/2026). Game hiện hộp thông báo rồi vào map bình thường. Cờ giống hệt lời từ chối "Tài khoản hiện đang đăng nhập ở một nơi khác", nên chỉ phân biệt được bằng lúc đến: trước `s2c/4` là từ chối, từ `s2c/4` trở đi là hộp thông báo. App 2.2.27 coi mọi `s2c/0` trước khi vào game xong là từ chối: tuỳ thông báo tới trước hay sau `s2c/1263`, nick vào được (nobita) hoặc bị app tự ngắt với "Server từ chối: Xử lý vi phạm lần 1…" (40six2, Android). Sửa: [session.rs](../../../app/core/src/net/session.rs) (`step <= Step::Auth`), [client.ts](../../../src/net/client.ts) (`REFUSING`); test `a_message_box_after_s2c_4_is_logged_and_the_login_goes_on` và lỗi `ban-notice` của bộ giả lập, mẫu `ban-notice` ở [test/fixtures.ts](../../../test/fixtures.ts).

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="c2s-2"></a>

## c2s/2

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Client → Server |
| Nhãn phân tích | login_begin |
| Xuất hiện khi | Người dùng bấm Đăng nhập |
| Sau đó | s2c/2 |
| Bố cục payload | Rỗng |
| Độ chắc chắn | Đã đo kiểu/byte; tên field chưa rõ được giữ trung tính |
| Độ dài payload mẫu | 0 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
(rỗng)
```

Nguồn: A2: packet gửi của app, thu ở native writer.

Điểm quan sát: Quan sát tại com.mh.sqje.a(sqi), trước khi ghi DataOutputStream. Đọc opcode a, buffer b và độ dài d của sqi.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {},
  "bytesInterpreted": 0,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-2"></a>

## s2c/2

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | login_gate |
| Xuất hiện khi | Trả login_begin |
| Sau đó | String rỗng: c2s/3; khác: nhánh chưa quan sát |
| Bố cục payload | string gate |
| Độ chắc chắn | Đã đo kiểu/byte; tên field chưa rõ được giữ trung tính |
| Độ dài payload mẫu | 4 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
00000000
```

Nguồn: A2: packet đọc từ native reader, record 81.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "gate": ""
  },
  "bytesInterpreted": 4,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="c2s-3"></a>

## c2s/3

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Client → Server |
| Nhãn phân tích | challenge_request |
| Xuất hiện khi | Login gate rỗng |
| Sau đó | s2c/3 |
| Bố cục payload | Rỗng |
| Độ chắc chắn | Đã đo kiểu/byte; tên field chưa rõ được giữ trung tính |
| Độ dài payload mẫu | 0 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
(rỗng)
```

Nguồn: A2: packet gửi của app, thu ở native writer.

Điểm quan sát: Quan sát tại com.mh.sqje.a(sqi), trước khi ghi DataOutputStream. Đọc opcode a, buffer b và độ dài d của sqi.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {},
  "bytesInterpreted": 0,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-3"></a>

## s2c/3

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | password_challenge |
| Xuất hiện khi | Trả challenge_request |
| Sau đó | Tạo proof từ challenge và password; c2s/4 |
| Bố cục payload | bytes challenge (i32 length + raw) |
| Độ chắc chắn | Đã đo kiểu/byte; tên field chưa rõ được giữ trung tính |
| Độ dài payload mẫu | 8 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
00000004100c0001
```

Nguồn: A2: packet đọc từ native reader, record 85.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "challenge": "100c0001"
  },
  "bytesInterpreted": 8,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="c2s-4"></a>

## c2s/4

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Client → Server |
| Nhãn phân tích | credentials |
| Xuất hiện khi | Đã có password_challenge |
| Sau đó | Push cấu hình và s2c/4 |
| Bố cục payload | string usernameLower; bytes proof; string platform; string version; i32 serverId; i32 usernameHash |
| Độ chắc chắn | Đã đo kiểu/byte; tên field chưa rõ được giữ trung tính |
| Độ dài payload mẫu | 69 byte |

**Mẫu minh hoạ giả** probe_user/abc dài 66 byte. Packet credential thật chỉ giữ kích thước 69 byte; không dùng mẫu giả để khẳng định mật khẩu thật.

```text
0000000a70726f62655f7573657200000014030c00011111111111111111111111111170737200000007616e64726f696400000005302e302e3200000018c65b09cb
```

Nguồn: Vector giả đã đối chiếu hàm proof và builder native; không lưu credential thật.

Điểm quan sát: Builder credential com.mh.sqlq.a(String,byte[],byte[]) và các writer của sqi, chặn packet trước hàng đợi mạng. Mẫu giả xác minh byte/thứ tự serialize; không phải một lượt gửi credential giả lên server.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "username": "probe_user",
    "proofBytes": 20,
    "platform": "android",
    "protocolVersion": "0.0.2",
    "serverId": 24,
    "usernameHash": -967112245
  },
  "bytesInterpreted": 66,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-4"></a>

## s2c/4

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | authentication_ack |
| Xuất hiện khi | Server chấp nhận credential trong phiên đã đo |
| Sau đó | Body rỗng: c2s/9; khác: nhánh chưa quan sát |
| Bố cục payload | Rỗng trong nhánh thành công đã đo |
| Độ chắc chắn | Đã đo kiểu/byte; tên field chưa rõ được giữ trung tính |
| Độ dài payload mẫu | 0 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
(rỗng)
```

Nguồn: A2: packet đọc từ native reader, record 94.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {},
  "bytesInterpreted": 0,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-8"></a>

## s2c/8

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | character_create_options |
| Xuất hiện khi | Trả c2s/9 khi nick chưa có nhân vật (Open Beta 20/11 xoá nhân vật Alpha) |
| Sau đó | Game hiện màn tạo nhân vật; bot dừng với NO_CHARACTER |
| Bố cục payload | Chưa giải; 4.008 byte, có tên lựa chọn ngoại hình ("Khôi Ngô", "Ngố") và bảng màu ARGB |
| Độ chắc chắn | Đo 1 lần (tiheo2, 20/11 12:02) |
| Độ dài payload mẫu | 4.008 byte |

**128 byte đầu sau giải XOR** (đầy đủ chưa lưu):

```text
00000012000000c3b4000000054e67e1bb91000000006400000024ff525252ffbfbfbfffffffffffa8a8a8ffbdc3ffff3a3b59ff262640ff56566cff77778d00000004c490656e0000000f0000006400
```

Ở chỗ của `s2c/9`, server gửi gói này khi tài khoản chưa có nhân vật. Game thật lúc đó mở màn tạo nhân vật (Khuôn Mặt, Kiểu Tóc, Màu Tóc, Màu Da, ô "Nhập tên nhân vật"). Bot TS dừng với mã `NO_CHARACTER` ("Nick chưa có nhân vật: vào game tạo nhân vật trước"), app Rust báo cùng câu đó. Gói tạo nhân vật mà client gửi đi thì chưa bắt được. Xem [APK 1.1.0](../apk-1.1.0.md#đo-thật-sau-open-beta-1202-ngày-2011). [Đo]

<a id="nhịp-như-người-chơi"></a>

<a id="captcha"></a>

## Xác nhận người chơi: captcha 1283 (LG1, 25/11)

Đo ngày 25/11/2026 với game 1.1.1 trên điện thoại, nick `manina3` (nhân vật mania4, cấp 119, M7 Nguyệt Đàm), máy chủ Thanh Khê. Frida gắn ngay khi game mở, agent của game 1.1.1 ([apk-1.1.1](../apk-1.1.1.md)) ghi hàm gửi `sqfi.a` và hàm đọc `sqpr.e` kèm đủ byte. Hai lượt đăng nhập: lượt 1 không ai bấm captcha, lượt 2 người dùng tự giải. Gói và ảnh ở `captures/lg1-2026-11-25/` (`lg1-1.jsonl`, `lg1-2.jsonl`, `captcha-1.png`, `captcha-2.png`). [Đo]

Server **mới bật** captcha: VG1 (20/11) và lần đo game 1.1.1 (22/11) không có gói 1283, nhưng mã đọc và hộp thoại đã có sẵn trong APK 1.1.1 (`com.mh.o.sqa`: opcode 1283, đọc thành `com.mh.o.sqb`; hộp thoại `com.g.i.sqa`; ô ghi lần chạm `com.mh.o.sqc`, tối đa 6 điểm). Cả hai chiều cùng opcode 1283, byte đầu là loại gói. Hộp thoại "Xác nhận người chơi": "Làm theo yêu cầu trong ảnh rồi bấm Gửi", "Còn N giây, M lần thử", nút Làm lại và Gửi.

**Lúc nào đến:** cả hai lượt, ngay sau khi vào game, chưa vào bản đồ: `s2c/4` → `c2s/1282`, `c2s/1284`, `c2s/9` → `s2c/1284` → `s2c/9` → `c2s/30` → `s2c/46` → `s2c/39` → `s2c/1195` → `s2c/1220` → `s2c/1279` → `s2c/1284` → `s2c/1266` → **`s2c/1283`** (khoảng 0,7–0,9 s sau `s2c/4`) → `s2c/30` → … Trong lúc hộp thoại mở, game vẫn gửi `c2s/42`, `c2s/29`, `c2s/11`, `c2s/43` và vào bản đồ như thường. [Đo 2 lần]

<a id="s2c-1283"></a>

### s2c/1283 loại 0: đề

Lượt 2, 78.889 byte:

| Byte | Kiểu | Giá trị | Nghĩa |
|---:|---|---|---|
| 0 | u8 | `00` | loại: 0 = đề |
| 1–4 | i32 | `907a332a` | mã của đề, mỗi lần một số khác (lượt 1: `138f22fb`) |
| 5–6 | i16 | `003c` = 60 | số giây được làm |
| 7 | u8 | `03` | số lần thử |
| 8–11 | i32 | `0001341d` = 78.877 | độ dài ảnh |
| 12–78.888 | byte | `89504e47…` | ảnh PNG |

Đọc hết byte, không thừa byte nào (lượt 1: 101.289 = 12 + 101.277). [Đo 2 lần]

**Ảnh PNG** (cùng cấu trúc ở hai lượt): chữ ký PNG 8 byte; `IHDR` 640 × 400, 8 bit, RGB (màu loại 2, không có alpha), không xen dòng; ảnh nén zlib (đầu `78 5e`) chia thành các khối `IDAT` 32.768 byte, khối cuối ngắn hơn (lượt 2: 32.768 + 32.768 + 13.260); rồi `IEND`. CRC mọi khối đều đúng. **Không có khối chữ** (`tEXt`, `zTXt`, `iTXt`) hay khối nào khác: đáp án không nằm trong gói. Giải nén ra đúng 400 × (1 + 640 × 3) = 768.400 byte, cả 400 dòng đều dùng bộ lọc 0 (không lọc). [Đo]

Yêu cầu được vẽ ngay trong ảnh, ở góc trên bên trái, giữa vài hình (giọt nước, trái tim, thỏi vàng, kiếm, âm dương) trên nền có đường cong và chấm nhiễu:
- lượt 1: "Chạm vào thỏi vàng" (6 hình);
- lượt 2: "Chạm lần lượt 5, 1, 4" (5 hình có đánh số 1–5).

<a id="c2s-1283"></a>

### c2s/1283: trả lời

Gửi khi bấm Gửi. Lượt 2, 26,7 s sau khi nhận đề, 18 byte:

```text
00 907a332a 03 00c6 00a8 020c 00a3 0053 0155
```

| Byte | Kiểu | Giá trị | Nghĩa |
|---:|---|---|---|
| 0 | u8 | `00` | chưa rõ, có thể là loại gói như ở chiều về |
| 1–4 | i32 | `907a332a` | mã đề, chép lại từ `s2c/1283` |
| 5 | u8 | `03` | số lần chạm |
| 6– | 3 × (i16 x; i16 y) | (198, 168), (524, 163), (83, 341) | chỗ chạm, theo thứ tự chạm, **tính bằng pixel của ảnh 640 × 400** |

Đổi chỗ chạm trên màn hình ra pixel của ảnh thì ba điểm trùng trái tim số 5, số 1 và số 4. Client chỉ gửi chỗ chạm, server tự chấm. Hàm tạo gói là `com.mh.o.sqa.a(int, int[], int[], int)`. [Đo; kiểu từ code]

<a id="s2c-1283-result"></a>

### s2c/1283 loại 1: kết quả

28 ms sau khi trả lời, 35 byte:

```text
01 907a332a 00 00 00000018 58c3a1…  ("Xác nhận thành công")
```

| Byte | Kiểu | Giá trị | Nghĩa |
|---:|---|---|---|
| 0 | u8 | `01` | loại: 1 = kết quả |
| 1–4 | i32 | `907a332a` | mã đề |
| 5 | u8 | `00` | có lẽ là kết quả, 0 = đúng |
| 6 | u8 | `00` | chưa rõ (lần thử còn lại, hay cờ) |
| 7– | string | "Xác nhận thành công" | thông báo cho người chơi (i32 độ dài 24 + UTF-8) |

Hộp thoại đóng, game chạy tiếp. [Đo 1 lần]

**Không trả lời** (lượt 1): hết 60 giây, game tự đóng hộp thoại, **không gửi gói nào**, server không gửi kết quả. Trong khoảng 95 giây theo dõi tiếp, nick không bị đá, không có `s2c/0`. [Đo 1 lần]

**Không trả lời thì không có thưởng:** app Rust (kakami, 25/11 07:27, captcha bị lờ đi) đánh Hồng Xà cấp 114 bằng nhân vật cấp 115: 6 trận thắng đều `+0 EXP, +0 xu`, và sau mỗi trận server gửi `s2c/1256` "Chưa xác nhận người chơi, trận này không có thưởng" (cả sau trận thua, cùng "Thua trận, mất 391 kinh nghiệm"). Nick không bị đá. Cùng lúc bothuatien và kyolong99 (dưới cấp 100, không nhận captcha) đánh hơn 300 trận có EXP. Đây là dòng duy nhất có chữ này trong toàn bộ nhật ký của app tới sáng 25/11. [Đo]

**Quét các nick trên cấp 100 (CS1, 25/11 khoảng 08:30):** bot TS (`connect.ts --world`, qua proxy riêng của từng nick, cách nhau 15 s) vào game một lần rồi thoát, không trả lời captcha. 8/9 nick vào được nhận `s2c/1283` loại 0 (60 s, 3 lần thử, ảnh 78–105 KB), cùng chỗ: ngay sau `s2c/1284` lần hai, trước `s2c/30`: manina2 (117), kakami (115), monoko (113), wangpt (112), mimosa (111), susimi (110), sizuka (108), cộng manina3 (119) trên điện thoại. **minika (115) không nhận**, vào game như trước. tiheo1 và tiheo2 đang online nơi khác ("Tài khoản hiện đang đăng nhập ở một nơi khác"), không đo được. Server chọn nick theo tiêu chí gì thì chưa rõ (không phải chỉ theo cấp). [Đo]

**Mỗi lần vào game là một đề mới (CS2, 25/11 09:05):** 10 nick, mỗi nick vào game 2 lần cách vài phút (kakami cách 25 s): mỗi lần mã đề và ảnh đều khác. Có đề: kakami 115, manina2 117, wangpt 112, monoko 113, susimi 110, sizuka 108, mimosa 111, cả 2 lần. Không có: mokali 99, nobita 99, và minika 115. Có hai kiểu yêu cầu: "Chạm lần lượt 2, 5, 1" (3 điểm) và "Chạm vào hình khác loại" (1 điểm). Ảnh ở `captures/cs2-2026-11-25`. [Đo]

**Giải trong app (25/11 10:23–10:25, bản 2.2.24):** người dùng giải 8 đề, đúng cả 8 ngay lần đầu, mỗi đề mất 3–41 giây. Sau đó mọi trận thắng đều có EXP. [Đo]

**Đề giữa lúc chơi:** server hỏi lại khoảng 21–28 phút sau lần xác nhận hay lần vào game, ngay sau khi một trận vừa xong (cùng giây với kết quả trận), kể cả nick đã giải:

| Nick | Mốc | Đề giữa lúc chơi |
|---|---|---|
| mimosa | giải 10:25 | 10:46 (đã giải lại) |
| susimi | giải 10:24 | 10:49 |
| minika | vào game 10:23 | 10:50 |
| kakami | giải 10:23 | 10:51 |

[Đo]

### s2c/1283 loại 2: đóng đề

`02` + mã đề, đúng 5 byte, không có gì thêm: `02756948a4` (kakami 10:52:34), `02162613b2` (minika 10:53:16), `02997add83` (susimi 10:53:30). Mỗi gói mang đúng mã của đề giữa lúc chơi vừa bị bỏ, đến 40 giây tới 4 phút sau đề đó. Ở kakami gói đến trước khi hết 60 giây. Ba gói đến trong cùng khoảng một phút. App đọc là "server đóng đề chưa giải". [Đo 3 lần; nghĩa là suy ra]

**Vào lại sau khi bỏ đề giữa lúc chơi (10:56–10:57):** kakami, minika, susimi vào game lại, không bị hỏi, trận có EXP, server không gửi "Chưa xác nhận người chơi". Trước đó, lúc 10:21–10:25, các nick đã để đề hết giờ đều bị hỏi ngay khi vào game. Có vẻ server nhớ lần xác nhận theo nick một thời gian: kakami và susimi đã giải lúc 10:23–10:24. minika thì chưa giải trong app lần nào mà vẫn không bị hỏi lúc vào game; manina3 (giải trên điện thoại 07:33) và tiheo1 cũng vậy. [Đo; luật chưa rõ]

**Chưa đo:** bấm sai (kết quả khác 0 và thông báo khác), hết lần thử, server làm gì với nick không giải lâu, luật chọn nick hỏi lúc vào game. Bot TS đọc gói này (catalog); app Rust hiện ảnh cho người dùng chạm và gửi `c2s/1283` như game ([Xác nhận người chơi](../../integration/rust/features.md#xác-nhận-người-chơi-captcha)). [Chưa rõ]

## Nhịp như người chơi (game 1.1.1, 22/11)

Đo bằng Frida trên game 1.1.1 (`captures/v111-2026-11-22/game-1.1.1*.jsonl`, cùng `bh2-2026-11-21`, `mp1-2026-11-22`, `vg1-2026-11-20`; kịch bản đo ở hai lượt kiểm tra `audit-c2s`, `audit-seq`). Bot TS và app gửi đúng các gói này, nhưng trước 22/11 gửi ngay khi nhận gói trước, và heartbeat 2 giây suốt phiên. Từ 22/11 cả hai chờ như game, mọi khoảng chờ lấy từ một chỗ: `src/net/human.ts` (TS) và `app/core/src/human.rs` (Rust). [Đo]

**Bật hay tắt.** Trong app là nút **Nhịp như người chơi** của Cài đặt đánh (`FightSettings::human_pace`), **mặc định tắt** (người dùng chọn 22/11, bản 2.2.5): tắt thì không có khoảng chờ nào dưới đây và không xin lại map sau trận (`Human::Off`), đánh nhanh như trước. Heartbeat 30 s, cờ `c2s/15` = 1 và số map của `c2s/11` giữ như game dù bật hay tắt. Bật giữa chừng thì có hiệu lực từ trận sau; khoảng chờ lúc đăng nhập theo nút lúc đăng nhập. Bot TS (`runClient`, `quest-run`) vẫn bật sẵn (`humanPace()`).

**Heartbeat `c2s/1`.** Mỗi 2 giây từ lúc trao khoá tới `s2c/4` (màn đăng nhập). Vào game thì thưa hẳn: lần đầu khoảng 25 s sau `s2c/4`, sau đó mỗi 30 s (đo 30,00–30,8 s), cả trong trận. App coi kết nối là mất khi server im **70 s** (trước là 30 s, lúc heartbeat còn 2 s): đủ cho hai nhịp không được trả lời. Bot TS không có giới hạn im lặng riêng. [Đo]

**Khoảng chờ lúc đăng nhập và vào map:**

| Từ | Tới | Game chờ |
|---|---|---|
| `s2c/1209` | `c2s/5` | 0,4–0,7 s |
| `c2s/5` | `c2s/2` | 1,3–2,5 s (tính từ `c2s/5`; `s2c/5` về sau ~30 ms) |
| `s2c/30` | `c2s/42` | 0,1–0,35 s |
| `s2c/29` | `c2s/11` | 0,3–0,4 s |
| `s2c/11` | `c2s/43` | 0,4–1,2 s, mỗi lần vào map: đăng nhập, qua cổng, đổi khu |
| `s2c/13` | `c2s/11` | 0,3–0,4 s, sau cổng hay đổi khu |
| tới map | cổng kế tiếp | 2–4 s trước khi qua cổng tiếp theo (Đổi map, nhiệm vụ) |
| `s2c/57` | `c2s/57` | game 4–23 s; bot chờ 1,5–4 s để nhiệm vụ không quá chậm |
| `s2c/43` | `c2s/15` | đi bộ tới quái: game gửi loạt `c2s/1169` rồi `c2s/15`, trận sau 4–26 s sau `c2s/43`; bot chờ 1,5–4 s mỗi khi danh sách quái mới về (đăng nhập, qua cổng, đổi khu, tải lại map sau trận) |
| `s2c/18` (timed 1) | nước đầu | mình đi trước: bot chờ 1,2–2,6 s (game đánh tay 22 s, Bạch Hổ nhanh nhất 1,15 s) |
| `s2c/24` lượt mình | `c2s/19` | bot chờ 1,2–2,6 s, hoặc Chờ trước mỗi lượt đi nếu dài hơn (game: Bạch Hổ trung vị 2,6 s, đánh tay 4,6–5,9 s) |

Các gói khác của đăng nhập (`c2s/1206`, `3`, `4`, `1282`, `1284`, `9`, `30`, `29`) vẫn đi ngay như game. Hạn chờ server của từng bước (8 s) và hạn cả lượt đăng nhập vẫn tính như trước; trong lúc bot cố ý chờ thì không có câu trả lời nào được chờ. Sau trận và khi đầu hàng: [05-battle](05-battle.md#sau-trận). [Đo]

Trong code: `runClient` (TS) nhận `human` (mặc định `humanPace()`), `QuestBot` nhận `options.human` (`quest-run` truyền `humanPace()`); `BotOptions::human` của Rust, phiên (`session.rs`) đặt `Human::new()`. Bài test dùng `ZERO_PACE` / `Human::Zero` (đúng thứ tự, không chờ) hay `OFF` / `Human::Off` (như trước 22/11, mặc định của `BotOptions::default()`).

<a id="vg1"></a>

## Client vào game: mọi gói gửi lên (VG1)

Đo ngày 20/11/2026 với game bản 1.1.0 trên điện thoại, nick `tiheo2` (nhân vật akaito, M1), máy chủ Thanh Khê `plays1.colauloanthe.vn:1688`. Frida gắn vào tiến trình ngay khi game mở, trước gói đầu tiên; agent `captures/vg1-2026-11-20/agent.js` ghi hàm gửi `com.mh.sqkj.a(sqi)` và hàm đọc `com.mh.sqpq.e()`, kèm đủ byte của mọi gói. Ở `c2s/4`, proof (mật khẩu XOR challenge) được che. Người dùng không bấm gì ngoài đóng thông báo và bấm Đăng nhập. [Đo]

Trong 60 giây đầu, client gửi **33 gói thuộc 15 loại**: 19 heartbeat `c2s/1` (khoảng 2 giây một lần; 18 lần lúc chờ ở màn đăng nhập, lần thứ 19 ở giây 60,4, tức ~25 s sau `s2c/4`: trong game heartbeat thưa còn 30 s, [nhịp như người chơi](#nhịp-như-người-chơi)) và 14 gói khác. Thời điểm tính từ gói đầu tiên:

| Lúc (s) | Gói | Byte | Thân gói của game | Bot TS và app gửi |
|---:|---|---:|---|---|
| 0,000 | `c2s/-1` | 0 | rỗng (xin key) | giống |
| 0,035 | `c2s/1206` | 24 | `string "android"; string "0.0.7"; i32 0` | **khác:** `"0.0.2"` |
| 0,584 | `c2s/5` | 9 | `00000018 ffffffff 01`: i32 24 (máy chủ); i32 −1; u8 1 | giống |
| 1,3–33,8 | `c2s/1` ×18 | 0 | heartbeat trong lúc chờ ở màn đăng nhập | bot không chờ ở bước này |
| 34,894 | `c2s/2` | 0 | rỗng (người dùng bấm Đăng nhập) | giống |
| 34,919 | `c2s/3` | 0 | rỗng (xin challenge) | giống |
| 34,944 | `c2s/4` | 65 | `string "tiheo2"; bytes proof (23); string "android"; string "0.0.7"; i32 24; i32 0x4f348aa6` (hash của tên) | **khác:** `"0.0.2"`; các trường khác giống từng byte |
| 35,355 | `c2s/1282` | 3 | `01 00 00`: gỡ lỗi USB bật; chế độ nhà phát triển tắt; 0 dịch vụ trợ năng ([APK 1.1.0](../apk-1.1.0.md#c2s1282-trạng-thái-máy-chống-bot)) | từ 22/11 bot TS và app gửi `00 00 00` (máy sạch), cùng chỗ: ngay sau `s2c/4`, trước `c2s/1284` ([1.1.1](../apk-1.1.1.md)) |
| 35,356 | `c2s/1284` | 1 | `00`: lệnh 0, lấy danh sách chặn chat ([09-players-chat](09-players-chat.md#chặn-chat-và-báo-cáo)) | lúc đo chưa gửi; từ 20/11 bot TS và app gửi như game, ngay trước `c2s/9` |
| 35,357 | `c2s/9` | 15 | `string "tiheo2"; u8 2; i32 −1` | giống |
| 35,399 | `c2s/30` | 1 | `01` | giống |
| 35,687 | `c2s/42` | 10 | `string "akaito"` | giống |
| 35,714 | `c2s/29` | 10 | `string "akaito"` | giống |
| 36,096 | `c2s/11` | 11 | `string "M1"; u8 0xff; i32 −1` | giống |
| 37,407 | `c2s/43` | 6 | `string "M1"` | giống |

So với lần bot TS vào game của `tiheo2` lúc 12:10 cùng ngày: thứ tự các gói giống nhau, và 10 loại gói còn lại giống từng byte. Chỉ khác ba chỗ: chuỗi phiên bản trong `c2s/1206` và `c2s/4`, và hai gói `c2s/1282`, `c2s/1284` mà bot lúc đó không gửi. Sau đó bot gửi thêm `c2s/1284`; `c2s/1282` thì cố ý không gửi. Ba gói `c2s/1282`, `c2s/1284`, `c2s/9` đi liền nhau trong 2 ms, ngay khi nhận `s2c/4`. [Đo]

Server trả theo thứ tự: `s2c/-1` → `s2c/1207` → `s2c/1209` → `s2c/5`; sau `c2s/4`: `s2c/1259` → `s2c/1274` (884 byte, chưa giải) → `s2c/1265` → `s2c/1269` → `s2c/1271` → `s2c/1272` → `s2c/4`; rồi `s2c/1284` (trả `c2s/1284`) → `s2c/9` → `s2c/46` → `s2c/39` → `s2c/1195` → `s2c/1220` → `s2c/1279` → `s2c/1284` (lần hai) → `s2c/30` → `s2c/42` → `s2c/29` → `s2c/11` → `s2c/43` → `s2c/1263`, sau đó là các gói đẩy `s2c/1262`, `s2c/1167`, `s2c/1170`, `s2c/1253`, `s2c/1166`, `s2c/1182`, `s2c/1183`. Mọi gói đều có trong catalog. [Đo]

**Server trả hai gói theo phiên bản client khai báo.** Đọc hết byte của các gói trên bằng catalog thì chỉ hai gói không khớp. Cả hai dài hơn bản bot nhận được (bot khai `0.0.2`):

| Gói | Bot (`0.0.2`) | Game (`0.0.7`) |
|---|---|---|
| `s2c/43` quái của map | mỗi quái 14 byte sau tên: `i32 cấp; u8; i32; i32; u8` | thêm 9 byte: `u8; i32; i16 cột; i16 hàng`. Hai số cuối là ô đứng của quái (M1: cột 5–149, hàng 3–21, map 156 × 23 ô). u8 và i32 cùng tăng theo loại quái (Gà Điên 0, 0; Heo Mọi 1, 1; Kẻ Gây Rối 2, 2; Sơn Tặc 3, 3; Chỉ Huy Sơn Tặc 7, 86). 33 quái, đọc hết 1714 byte |
| `s2c/39` nhiệm vụ | mỗi bước: `i32 số thứ tự; string; i32; i32; i32 NPC` | thêm sau mỗi bước `u8 loại; i32 đích; i16 n; n × i32`: loại 1 (nói chuyện) là NPC và n = 1, ví dụ `01 00000066 0001 00000000` (11 byte). Nhiệm vụ 2 có 6 bước nói chuyện: 6 × 11 = 66 byte, đúng bằng 654 − 588 |

Bot khai `0.0.2` vì vậy nhận đúng bố cục cũ mà bộ đọc vẫn đọc. Các gói khác khi khai `0.0.7` ở mục dưới. [Đo]

<a id="v007"></a>

## Khai phiên bản 0.0.7 (bot TS, 20/11)

Đo bằng bot TS với `CLLT_PROTOCOL_VERSION=0.0.7`, nick `tiheo2` (akaito, cấp 2–4, M1), hai lượt cùng ngày: lượt đầu dừng ở hộp thoại Hương Lão, lượt hai làm nhiệm vụ 3 (cộng điểm, kỹ năng, Tiêu diệt Gà Điên, báo cáo) và nhiệm vụ 4 (Tiêu diệt Heo Mọi), thắng 3 trận, nhặt 1 món. 681 gói ở lượt hai, 73 loại, đều đọc hết byte bằng catalog (sau khi sửa các bộ đọc dưới đây). Server nhận phiên bản này và không ngắt kết nối. [Đo]

| Gói | Khác gì so với khi khai `0.0.2` |
|---|---|
| `s2c/43` quái của map | thêm 9 byte mỗi quái sau `d`: `u8 e; i32 f; i16 cột; i16 hàng` ([bảng trên](#vg1)) |
| `s2c/1177` boss | thêm `u8 e; i32 f` sau ô đứng của boss, không có ô thứ hai (Thủ Lĩnh Sơn Tặc 7, 85 ở ô 89, 13) |
| `s2c/39` nhiệm vụ | sau mỗi bước `u8 loại; i32 đích; i16 n; n × i32`. Loại 0 (Đạt cấp độ, Nâng điểm tiềm năng, Sử dụng điểm kỹ năng): `00 ffffffff 0000`, 7 byte. Loại 1 (nói chuyện): NPC, `n` 1. Loại 2 (Tiêu diệt): `02 ffffffff 0001 00000000` |
| Mọi bản ghi vật phẩm | thêm 2 byte (i16, 0 ở mọi mẫu) ngay trước số chỉ số: `s2c/42` và `s2c/1187` (túi), `s2c/1182` và `s2c/1184` (đồ trên đất), trang bị trong `s2c/9`, `s2c/37`, `s2c/51`, thư `s2c/1216`, Pháp sư `s2c/1258`, `s2c/91`, `s2c/93`. Mẫu: Đao Đại Hiệp (246), độ bền 60, hai chỉ số (5: +8, 8: +2) |
| `s2c/1166` trang bị người chơi khác | 30 byte thay vì 28: thêm `u8` (0) và hệ của vũ khí, như hai byte mới của bản ghi người chơi |
| `s2c/1192` Chợ trời | mỗi món thêm `u8 hệ` trước giờ hết hạn ([14-npc](14-npc.md#bố-cục-chợ-trời)) |
| `s2c/1190` cửa hàng NPC | mỗi dòng thêm `i16` sau `field4`, giá trị 1 ở Vũ khí [Xu] ([15-shops](15-shops.md#bản-ghi)) |
| `s2c/1254` bảng xếp hạng | 7 tab; danh sách thêm `n × i64` và `i64` của mình sau hạng của mình ([11-panels](11-panels.md#s2c-1254)) |
| `s2c/1180` tỷ thí | thêm `u8` ở cuối (105); bản ghi quái vẫn như `0.0.2` ([10-quests](10-quests.md#s2c-1180)) |

Không khác (ngoài bản ghi vật phẩm): `s2c/9` (trừ trang bị), `s2c/30`, `s2c/11`, `s2c/1263`, `s2c/37` mặc/cởi đồ (10 ô), `s2c/116` mục Chợ trời, `s2c/1215` hòm thư trống, `s2c/1258` báo giá Pháp sư, hộp thoại Hương Lão (Điểm năng động, nhiệm vụ ngày), các gói trận `s2c/22` (khối quái đọc được: Gà Điên hệ 4 cấp 1, Heo Mọi hệ 2 cấp 7), `s2c/19`, `s2c/20`, `s2c/24`, `s2c/34`, `s2c/35`, `s2c/1191`, `s2c/10`. Gói `s2c/19` cuối trận dài khoảng 2.130 byte vì có bảng EXP từng cấp sau phần thưởng; bảng này có từ trước, không phải của `0.0.7`. [Đo]

**Mặc định khai `0.0.7` (20/11, chưa commit):** bot TS và app Rust khai `0.0.7` như game 1.1.0 (`protocolVersion` trong `src/protocol/config.ts`, `PROTOCOL_VERSION` của `app/core/src/opcodes.rs`). Bộ đọc vẫn đọc được cả hai bố cục (thử `0.0.7` trước, không khớp tới byte cuối thì đọc bố cục cũ), nên các gói đã ghi từ trước vẫn đọc được. Có test bằng gói thật (`test/fixtures-v007.ts`) và vector đối chiếu TS↔Rust. `CLLT_PROTOCOL_VERSION` vẫn ghi đè được (bot TS; app Rust chỉ ở bản debug). `c2s/1282` vẫn cố ý không gửi ([bảng trên](#vg1)).

Chạy thật với mặc định mới (tiheo2, 20/11): bot TS làm nhiệm vụ 4, thắng 4/4 trận, 1.022 gói, đọc hết byte. App Rust (`cllt quest`, 8 phút) thắng 17/17 trận, xong nhiệm vụ 4 và 5, sang nhiệm vụ 6, lên cấp 11, nhặt đồ, tự cộng điểm, không có lỗi đọc gói. [Đo]

**Chưa đo ở `0.0.7`:** Bạch Hổ, thư có vật phẩm (`s2c/1216`; hòm thư đang trống), mua và thu hồi ở Chợ trời (`s2c/113`, `115`: không có bản ghi vật phẩm; đăng bán `s2c/112` đã đo 21/11, [Ngọc Nga](14-npc.md#ngọc-nga)), kết quả Pháp sư (`s2c/91`, `93`: tốn tiền), dùng bình trong trận, tab 2–6 của bảng xếp hạng. Nghĩa của `e`, `f`, `field5` và các số mới của `s2c/39` cũng chưa rõ. [Chưa rõ]
