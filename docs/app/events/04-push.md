# Các gói server push

[Mục lục event](README.md). Nhãn mô tả/tên field bên dưới là nhãn phân tích, không phải tên string gốc của giao thức. Nguồn A1/A2/V1 và cách thu được giải thích trong [phương pháp điều tra](../investigation.md).

Push có thể xen giữa mọi response đang chờ. Không suy rằng mỗi push đòi một ACK; capture chỉ xác nhận các request và response đã liệt kê.

<a id="s2c-1259"></a>

## s2c/1259

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | config_1259 |
| Xuất hiện khi | Sau c2s/4, trước s2c/4 |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | 5 byte cấu hình, opaque |
| Độ chắc chắn | Byte đã đo; ý nghĩa nghiệp vụ/schema một phần là suy luận; phần chưa biết giữ opaque |
| Độ dài payload mẫu | 5 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
0305040000
```

Nguồn: A2: packet đọc từ native reader, record 89.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {},
  "bytesInterpreted": 0,
  "bytesUnknown": 5
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-1265"></a>

## s2c/1265

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | config_1265 |
| Xuất hiện khi | Sau c2s/4 |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | 30 byte cấu hình, opaque |
| Độ chắc chắn | Byte đã đo; ý nghĩa nghiệp vụ/schema một phần là suy luận; phần chưa biết giữ opaque |
| Độ dài payload mẫu | 30 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
640000000000010108000001f4001e000a000003e8000000c832040e0096
```

Nguồn: A2: packet đọc từ native reader, record 90.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {},
  "bytesInterpreted": 0,
  "bytesUnknown": 30
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-1269"></a>

## s2c/1269

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | config_1269 |
| Xuất hiện khi | Sau c2s/4 |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | 30 byte cấu hình, opaque |
| Độ chắc chắn | Byte đã đo; ý nghĩa nghiệp vụ/schema một phần là suy luận; phần chưa biết giữ opaque |
| Độ dài payload mẫu | 30 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
640000000000010101f4012c000a001e00320064000f0005001401e00028
```

Nguồn: A2: packet đọc từ native reader, record 91.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {},
  "bytesInterpreted": 0,
  "bytesUnknown": 30
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-1271"></a>

## s2c/1271

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | social_links |
| Xuất hiện khi | Sau c2s/4 |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | 140 byte; có URL Facebook, chưa giải cấu trúc danh sách |
| Độ chắc chắn | Byte đã đo; ý nghĩa nghiệp vụ/schema một phần là suy luận; phần chưa biết giữ opaque |
| Độ dài payload mẫu | 140 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
0301000000000000002568747470733a2f2f7777772e66616365626f6f6b2e636f6d2f636f6c61756c6f616e74686502000000000000002c68747470733a2f2f7777772e66616365626f6f6b2e636f6d2f67726f7570732f636f6c61756c6f616e74686503000000000000001f68747470733a2f2f636f6c61756c6f616e7468
```

Hiển thị 128/140 byte đầu. Các giá trị đã đọc được ghi bên dưới; phần chưa rõ không được điền thêm byte hoặc coi là schema đã hiểu.

Nguồn: A2: packet đọc từ native reader, record 92.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {},
  "bytesInterpreted": 0,
  "bytesUnknown": 140
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-1272"></a>

## s2c/1272

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | config_1272 |
| Xuất hiện khi | Sau c2s/4 |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | 47 byte tham số, opaque |
| Độ chắc chắn | Byte đã đo; ý nghĩa nghiệp vụ/schema một phần là suy luận; phần chưa biết giữ opaque |
| Độ dài payload mẫu | 47 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
000500000003000001f40000000004000007d0000000000500001388010000000600003a98010000000c000088b801
```

Nguồn: A2: packet đọc từ native reader, record 93.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {},
  "bytesInterpreted": 0,
  "bytesUnknown": 47
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-46"></a>

## s2c/46

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | currency_notice |
| Xuất hiện khi | Sau s2c/9 |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | Prefix string update Xu; opaque tail |
| Độ chắc chắn | Byte đã đo; ý nghĩa nghiệp vụ/schema một phần là suy luận; phần chưa biết giữ opaque |
| Độ dài payload mẫu | 37 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
00000009757064617465205875000000000000000000000000000004ec0000000000000000
```

Nguồn: A2: packet đọc từ native reader, record 145.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "label": "update Xu"
  },
  "bytesInterpreted": 13,
  "bytesUnknown": 24
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-39"></a>

## s2c/39

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | quest_data |
| Xuất hiện khi | Sau s2c/9 |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | Prefix i32, string title, string description; opaque tail |
| Độ chắc chắn | Byte đã đo; ý nghĩa nghiệp vụ/schema một phần là suy luận; phần chưa biết giữ opaque |
| Độ dài payload mẫu | 575 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
000000030000001b4e68e1bbaf6e67205669e1bb876320c490e1baa775205469c3aa6e000000d74de1bb997420636869e1babf6e2062696e68206b68c3b46e67207468e1bb83207472c6b0e1bb9f6e67207468c3a06e68206ee1babf75206368c6b061207472e1baa36920717561207468e1bbad207468c3a1636820c491e1ba
```

Hiển thị 128/575 byte đầu. Các giá trị đã đọc được ghi bên dưới; phần chưa rõ không được điền thêm byte hoặc coi là schema đã hiểu.

Nguồn: A2: packet đọc từ native reader, record 147.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "field0": 3,
    "title": "Những Việc Đầu Tiên",
    "description": "Một chiến binh không thể trưởng thành nếu chưa trải qua thử thách đầu tiên. Hãy giúp dân làng xử lý những rắc rối nhỏ và học cách sử dụng sức mạnh của bản thân."
  },
  "bytesInterpreted": 254,
  "bytesUnknown": 321
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-1195"></a>

## s2c/1195

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | flag_1195 |
| Xuất hiện khi | Trong đồng bộ nhân vật |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | u8 field |
| Độ chắc chắn | Byte đã đo; ý nghĩa nghiệp vụ/schema một phần là suy luận; phần chưa biết giữ opaque |
| Độ dài payload mẫu | 1 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
00
```

Nguồn: A2: packet đọc từ native reader, record 148.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "flag": 0
  },
  "bytesInterpreted": 1,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-1220"></a>

## s2c/1220

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | flag_1220 |
| Xuất hiện khi | Trong đồng bộ nhân vật |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | u8 field |
| Độ chắc chắn | Byte đã đo; ý nghĩa nghiệp vụ/schema một phần là suy luận; phần chưa biết giữ opaque |
| Độ dài payload mẫu | 1 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
00
```

Nguồn: A2: packet đọc từ native reader, record 149.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "flag": 0
  },
  "bytesInterpreted": 1,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-1177"></a>

## s2c/1177

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | map_special_entity |
| Xuất hiện khi | Sau c2s/43 |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | Prefix string mapId; có tên Thủ Lĩnh Sơn Tặc; opaque tail |
| Độ chắc chắn | Byte đã đo; ý nghĩa nghiệp vụ/schema một phần là suy luận; phần chưa biết giữ opaque |
| Độ dài payload mẫu | 71 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
000000024d31000000000b6d6f623836313030353031000000165468e1bba7204cc4a96e682053c6a16e2054e1bab7630000000b00000000090000000101010000001800000005
```

Nguồn: A2: packet đọc từ native reader, record 196.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "mapId": "M1"
  },
  "bytesInterpreted": 6,
  "bytesUnknown": 65
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-1263"></a>

## s2c/1263

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | players_snapshot |
| Xuất hiện khi | Sau c2s/43 trong mẫu |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | Prefix u16 field0, u8 field2, string firstName; opaque tail |
| Độ chắc chắn | Byte đã đo; ý nghĩa nghiệp vụ/schema một phần là suy luận; phần chưa biết giữ opaque |
| Độ dài payload mẫu | 5059 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
00130200000006786f616932350000032000000006786f61693235020000000010000000c3000000d10000000000000064000000000b47000002a000016058000111d400013f88ffffffff0000000000000000000000030000c3b4000000000100000024ff525252ffbfbfbfffffffffffa8a8a8ffbdc3ffff3a3b59ff262640
```

Hiển thị 128/5059 byte đầu. Các giá trị đã đọc được ghi bên dưới; phần chưa rõ không được điền thêm byte hoặc coi là schema đã hiểu.

Nguồn: A2: packet đọc từ native reader, record 197.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "field0": 19,
    "field2": 2,
    "firstName": "xoai25"
  },
  "bytesInterpreted": 13,
  "bytesUnknown": 5046
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-1262"></a>

## s2c/1262

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | entity_updates |
| Xuất hiện khi | Push thường xuyên khi ở bản đồ |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | Giả thuyết: u16 field0; u16 count; count * 16 byte (i32 n1,n2,n3; u8 b1,b2; u16 n4) |
| Độ chắc chắn | Byte đã đo; ý nghĩa nghiệp vụ/schema một phần là suy luận; phần chưa biết giữ opaque |
| Độ dài payload mẫu | 52 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
006400030000046a00000a0f0000028f010800600000007d000006d50000025c050900320000032000000ae8000002a0010a000f
```

Nguồn: A2: packet đọc từ native reader, record 174.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "interpretation": "inferred-layout",
    "field0": 100,
    "count": 3,
    "records": [
      {
        "n1": 1130,
        "n2": 2575,
        "n3": 655,
        "b1": 1,
        "b2": 8,
        "n4": 96
      },
      {
        "n1": 125,
        "n2": 1749,
        "n3": 604,
        "b1": 5,
        "b2": 9,
        "n4": 50
      },
      {
        "n1": 800,
        "n2": 2792,
        "n3": 672,
        "b1": 1,
        "b2": 10,
        "n4": 15
      }
    ]
  },
  "bytesInterpreted": 52,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-1253"></a>

## s2c/1253

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | update_1253 |
| Xuất hiện khi | Push thế giới |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | 17 byte trong mẫu, opaque |
| Độ chắc chắn | Byte đã đo; ý nghĩa nghiệp vụ/schema một phần là suy luận; phần chưa biết giữ opaque |
| Độ dài payload mẫu | 17 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
0000044800000009000000320000004800
```

Nguồn: A1: packet đọc từ native reader, record 158.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {},
  "bytesInterpreted": 0,
  "bytesUnknown": 17
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-1184"></a>

## s2c/1184

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | update_1184 |
| Xuất hiện khi | Push thế giới |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | 108 byte trong mẫu, opaque |
| Độ chắc chắn | Byte đã đo; ý nghĩa nghiệp vụ/schema một phần là suy luận; phần chưa biết giữ opaque |
| Độ dài payload mẫu | 108 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
000000024d3100000001fe000000360000002464336339326330332d643365392d346466382d623839632d636437356334303334653532000000000000003c00000001000200000000000102000000060000000300000009000000460000083700000260000001a1883c1c36
```

Nguồn: A1: packet đọc từ native reader, record 175.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {},
  "bytesInterpreted": 0,
  "bytesUnknown": 108
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-1182"></a>

## s2c/1182

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | entity_1182 |
| Xuất hiện khi | Push thế giới |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | Prefix string mapId; phần còn lại opaque |
| Độ chắc chắn | Byte đã đo; ý nghĩa nghiệp vụ/schema một phần là suy luận; phần chưa biết giữ opaque |
| Độ dài payload mẫu | 88 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
000000024d31fe000000290000002433396563666461342d643764352d343238612d613734352d62353663373464626265346400000000ffffffff0000008500ff000000000000000000075700000260000001a1883c498c
```

Nguồn: A1: packet đọc từ native reader, record 189.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "mapId": "M1"
  },
  "bytesInterpreted": 6,
  "bytesUnknown": 82
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-1183"></a>

## s2c/1183

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | entity_1183 |
| Xuất hiện khi | Push thế giới |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | string mapId; string entityKey; phần còn lại opaque |
| Độ chắc chắn | Byte đã đo; ý nghĩa nghiệp vụ/schema một phần là suy luận; phần chưa biết giữ opaque |
| Độ dài payload mẫu | 46 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
000000024d310000002464336339326330332d643365392d346466382d623839632d636437356334303334653532
```

Nguồn: A1: packet đọc từ native reader, record 219.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "mapId": "M1",
    "entityKey": "d3c92c03-d3e9-4df8-b89c-cd75c4034e52"
  },
  "bytesInterpreted": 46,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-1170"></a>

## s2c/1170

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | update_1170 |
| Xuất hiện khi | Push thế giới |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | i32 field; ý nghĩa chưa rõ |
| Độ chắc chắn | Byte đã đo; ý nghĩa nghiệp vụ/schema một phần là suy luận; phần chưa biết giữ opaque |
| Độ dài payload mẫu | 4 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
0000007d
```

Nguồn: A2: packet đọc từ native reader, record 217.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "field": 125
  },
  "bytesInterpreted": 4,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-1167"></a>

## s2c/1167

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | entity_1167 |
| Xuất hiện khi | Push thế giới |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | u8 field; string name; i32 numericId; opaque tail |
| Độ chắc chắn | Byte đã đo; ý nghĩa nghiệp vụ/schema một phần là suy luận; phần chưa biết giữ opaque |
| Độ dài payload mẫu | 260 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
02000000054e656f78770000036d000000054e656f787702000000000400000034000000340000000000000064000000000232000001a0000000000000000000000000000000000000000000000000000000030000c3b4000000000900000024ff525252ffbfbfbfffffffffffa8a8a8ffbdc3ffff3a3b59ff262640ff56566c
```

Hiển thị 128/260 byte đầu. Các giá trị đã đọc được ghi bên dưới; phần chưa rõ không được điền thêm byte hoặc coi là schema đã hiểu.

Nguồn: A2: packet đọc từ native reader, record 241.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "field": 2,
    "name": "Neoxw",
    "numericId": 877
  },
  "bytesInterpreted": 14,
  "bytesUnknown": 246
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-1166"></a>

## s2c/1166

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | update_1166 |
| Xuất hiện khi | Push thế giới |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | 28 byte trong mẫu, opaque |
| Độ chắc chắn | Byte đã đo; ý nghĩa nghiệp vụ/schema một phần là suy luận; phần chưa biết giữ opaque |
| Độ dài payload mẫu | 28 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
0000035300016058000111d400013948ffffffff0000000000000000
```

Nguồn: A1: packet đọc từ native reader, record 671.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {},
  "bytesInterpreted": 0,
  "bytesUnknown": 28
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).
