# Giao thức nhị phân của game

Mốc phân tích: APK trong file 1.0.3, nhận diện bằng [hash và cấu trúc artifact](artifact.md). Phần này mô tả byte và hành vi quan sát được của game. [Phương pháp điều tra](investigation.md), [luồng và event](events/README.md).

## Kiểu dữ liệu

Mọi int32 dưới đây là **big-endian, signed 32 bit**. String = `int32(số byte UTF-8) + UTF-8`, bytearray = `int32(số byte) + bytes`. Một byte ghi giá trị thấp 8 bit; `-1` thành `ff`; bool là `00/01`. Ví dụ `Việt😀` chiếm 10 byte UTF-8; số UTF-16 code unit không phải độ dài byte để ghi string.

API packet đã xác minh: `sqi.c(int)` ghi int32; `sqi.b(int)` chỉ ghi một byte; `sqi.a(String)` ghi string; `sqi.a(byte[])` có tiền tố độ dài; `sqi.b(byte[])` ghi raw bytes. Getter `a()` đọc byte, `c()` đọc int32, `f()` đọc string, `g()` đọc bytearray.

## Khung Client → Server

| Offset | Độ dài | Nội dung |
|---|---:|---|
| 0 | 4 | `payloadLength + 13`, không tính chính field 4 byte này |
| 4 | 1 | `01`, byte loại khung; không phải opcode nghiệp vụ |
| 5 | 4 | ASCII `PT01` = `50 54 30 31` |
| 9 | 4 | `payloadLength`, **không tính 4 byte encoded opcode** |
| 13 | 4 | Encoded opcode int32BE, qua XOR nếu đã có khoá |
| 17 | N | Payload, qua cùng stream XOR với opcode |

Tổng frame là `N+17` byte. Header đầu 13 byte giữ nguyên. Gói mở đầu nghiệp vụ `-1` trước khi có khoá:

```text
0000000d 01 50543031 00000000 df9e3358
```

Sau khi có khoá, một request `1206` của phiên mẫu là:

```text
00000025 01 50543031 00000018
1d32de2ec997f363c118f0459109e0c031dec0d9e7a7dd56a0769437
```

Payload sau giải XOR dài 24 byte:

```text
00000007 616e64726f6964 00000005 302e302e32 00000000
string("android")       string("0.0.2")       int32(0)
```

## Khung Server → Client

| Offset | Độ dài | Nội dung |
|---|---:|---|
| 0 | 2 | Flags, giữ raw; ý nghĩa từng bit chưa xác định |
| 2 | 4 | Tổng độ dài frame, **bao gồm 14 byte header** |
| 6 | 8 | Opcode xen byte phụ; XOR cả 8 byte theo thứ tự offset tăng dần |
| 14 | N | Payload; `N = totalLength - 14` |

Sau khi giải XOR vùng 6..13, lấy encoded opcode bằng bốn byte theo thứ tự **`[10, 6, 12, 8]`** của frame, ghép big-endian rồi tra bảng inverse. Các byte phụ ở 7,9,11,13 chưa xác định vai trò; vẫn phải tiêu thụ XOR cho chúng. Flags `0000` cũng có ở heartbeat đã XOR; không dùng flags để quyết định bật/tắt XOR.

Ví dụ header của response `1207` trong cùng phiên mẫu:

```text
wire:          0001 00000038 c75a02f5ef10c931
8 byte đã XOR:               f684c71c26873a55
encoded op:                 26 f6 3a c7 = 653671111 → 1207
body length:   0x38 - 14 = 42
```

**TCP là stream:** một `recv` có thể chứa nửa frame, một frame hoặc nhiều frame. Phải tích luỹ ít nhất 14 byte, đọc tổng độ dài, đợi đủ thân gói rồi mới tăng counter/dispatch. Đặc biệt nếu `-1` và frame kế tiếp nằm trong cùng chunk, phải thiết lập key sau `-1` trước khi giải frame kế tiếp.

## Seed, trao đổi khoá và XOR

[Đo] Server gửi seed `0001579f` trước. Client trả 21 byte:

```text
00000011 01 01010101 00000004 3b9c50a0 0002afb9
```

Bốn byte cuối là `int32(seed*2+123)` với tràn số 32 bit. Đây là handshake riêng; tag `01010101`, không phải `PT01`.

Response `-1` trước khi có khoá:

```text
header: 0011 0000001f 9ec1589adf9f3349
body:   10 c1f0ef1b2c205e6497c4d6e2a3c99ee4
```

`10` là độ dài khoá 16. Với masked bytes `m` còn lại:

```text
key[0] = m[0]
key[i] = m[i] XOR key[i-1]  (i=1..15)
key = c131dec5e9c997f364a0769437fe6084
```

Đây là khoá của phiên mẫu đã đóng, không phải hằng dùng cho lần kết nối sau. Counter RX và TX tách biệt, ban đầu đều bằng 0. Hàm cho từng byte:

```text
n = counter + 1
outputByte = inputByte XOR key[n AND 15] XOR (n >> 4)
counter = n MOD keyLength
```

Với key dài 16 đã quan sát, mask lần lượt là `key[1]..key[15], key[0]^1`, rồi lặp lại. Client áp dụng cho `encodedOpcode4 + payload`. Server áp dụng cho `header[6..13] + payload`. Không reset counter mỗi packet; không tăng counter cho header cleartext. Trạng thái gửi và nhận có hai counter riêng, ban đầu đều bằng 0. Dùng lại key/counter cũ sau reconnect sẽ làm sai mọi gói.

Đối chiếu wire với packet native qua nhiều frame và lần wrap counter đã xác minh thứ tự tiêu thụ byte. Cách chia chunk của syscall không làm thay đổi ranh giới frame nghiệp vụ.

## Đổi opcode nghiệp vụ sang encoded opcode

| Nghiệp vụ | Encoded int32 | Hex BE trước XOR |
|---:|---:|---|
| -1 | -543280296 | `df9e3358` |
| 1 | 1263670068 | `4b521334` |
| 2 | 392681060 | `1767d664` |
| 3 | 651823382 | `26da0916` |
| 4 | 75656514 | `04826d42` |
| 5 | -2140791346 | `80661dce` |
| 9 | -1110470219 | `bdcf91b5` |
| 11 | -1128995230 | `bcb4e662` |
| 29 | -1835475628 | `9298dd54` |
| 30 | -2010351736 | `882c7788` |
| 42 | -770666585 | `d2108fa7` |
| 43 | -544730497 | `df88127f` |
| 1206 | 753671111 | `2cec1bc7` |
| 1207 | 653671111 | `26f63ac7` |
| 1209 | 453671111 | `1b0a78c7` |

[Bảng opcode](opcode-map.md) ghi 188 cặp đã xác minh bằng roundtrip native b(a(op))==op trong miền -1..2048. Đây là miền đã truy vấn, không chứng minh không có opcode ngoài miền.

## Luật vận hành

- Socket đã mở ở boot, login dùng lại socket đó trong phiên đã đo. Không mở socket mới sau từng event.
- Đọc đủ frame rồi tăng RX counter. Opcode chưa biết vẫn phải tiêu thụ toàn bộ frame; ghi encodedOpcode để tra sau.
- Heartbeat và push có thể xen giữa response. Dispatch theo opcode và state, không lấy “packet kế tiếp” làm response mặc định.
- Credential proof dùng challenge `3`, XOR socket dùng key `-1`; xem [event login](events/02-login.md).
- IP, key phiên, khu vực, danh sách người chơi và HP là dữ liệu động. Không so chúng với baseline bằng nguyên byte equality.
- Timeout/lỗi mạng không chứng minh sai mật khẩu. [Điều tra lại bản mới](reinvestigation.md) mô tả bằng chứng cần lấy lại ở từng lớp.
