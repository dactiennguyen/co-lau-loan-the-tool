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
| Nhãn phân tích | faction |
| Xuất hiện khi | Sau c2s/4 (lệnh 100, 30 byte) và khi mở Sứ quân |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | u8 lệnh; 100: cấu hình; 0: sứ quân của mình (16 byte 0 khi chưa vào); 1: danh sách (tên, cấp, số người/20, kiểu duyệt) |
| Độ chắc chắn | Lệnh đọc được; từng trường danh sách chưa giải |
| Độ dài payload mẫu | 30 byte |

Bố cục và giải thích: [11-panels](11-panels.md).

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
640000000000010108000001f4001e000a000003e8000000c832040e0096
```

Nguồn: A2: packet đọc từ native reader, record 90.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "command": 100
  },
  "bytesInterpreted": 1,
  "bytesUnknown": 29
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
| Xuất hiện khi | Sau s2c/9 và khi nhận nhiệm vụ mới |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | i32 questId; string title; string description; string type; i32 current; i32 progress; i32 n; n * {i32 index; string text; i32 param; i32 required; i32 npcId} |
| Độ chắc chắn | Đọc hết byte 3 mẫu; current khớp bước tô xanh trên bảng Nhiệm vụ |
| Độ dài payload mẫu | 575 byte |

Bố cục và giải thích: [10-quests](10-quests.md#s2c-39).

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
    "id": 3,
    "title": "Những Việc Đầu Tiên",
    "description": "Một chiến binh không thể trưởng thành nếu chưa trải qua thử thách đầu tiên. Hãy giúp dân làng xử lý những rắc rối nhỏ và học cách sử dụng sức mạnh của bản thân.",
    "type": "main",
    "current": 4,
    "progress": 0,
    "steps": [
      {
        "index": 0,
        "text": "Đạt cấp độ 2",
        "param": 2,
        "required": 1,
        "npcId": -1
      },
      {
        "index": 1,
        "text": "Nói chuyện với Hương Lão Trần Bá",
        "param": 102,
        "required": 1,
        "npcId": 102
      },
      {
        "index": 2,
        "text": "Nâng điểm tiềm năng",
        "param": 0,
        "required": 1,
        "npcId": -1
      },
      {
        "index": 3,
        "text": "Sử dụng điểm kỹ năng",
        "param": 0,
        "required": 1,
        "npcId": -1
      },
      {
        "index": 4,
        "text": "Tiêu diệt Gà Điên",
        "param": 0,
        "required": 1,
        "npcId": -1
      },
      {
        "index": 5,
        "text": "Báo cáo với Hương Lão Trần Bá",
        "param": 102,
        "required": 1,
        "npcId": 102
      }
    ]
  },
  "bytesInterpreted": 575,
  "bytesUnknown": 0
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
| Xuất hiện khi | Sau c2s/43: boss của map |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | string mapId; u8 field; {string mobId; string name; i32 level; u8 a; i32 b; i32 c; u8 d}; u8; i32; i32 |
| Độ chắc chắn | Đọc hết byte (Q9, 71 byte): Thủ Lĩnh Sơn Tặc mob86100101 cấp 11 ở khu 1; ba trường cuối chưa rõ |
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
| Xuất hiện khi | Sau c2s/43: mọi người chơi khác trong khu |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | u16 n; n * {player record; status như s2c/1212} |
| Độ chắc chắn | Đọc hết byte; số bản ghi + mình = "Dân số" của khu trong s2c/1172 |
| Độ dài payload mẫu | 5059 byte |

Bố cục đã kiểm trên mọi payload và giải thích: [09-players-chat](09-players-chat.md#s2c-1263).

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
    "count": 19,
    "players": [
      "xoai25 #800 cấp 16 hp 195/209 (2887,672)",
      "Konichioa #484 cấp 7 hp 17/64 (590,544)",
      "ZzLuffyzZ #1011 cấp 6 hp 8/112 (623,640)",
      "tieuyeu #1002 cấp 14 hp 312/312 (679,160) hiệu ứng 9301",
      "Mrboyyy #953 cấp 10 hp 188/188 (3161,608)",
      "TyCan #623 cấp 25 hp 170/170 (684,608)",
      "LinhCun98 #68 cấp 21 hp 281/281 (720,608) hiệu ứng 9300",
      "o0oTuyeto0o #180 cấp 16 hp 100/316 (566,416) hiệu ứng 9301",
      "Baron #841 cấp 6 hp 52/60 (963,256)",
      "duongly #1130 cấp 6 hp 127/136 (2624,672)",
      "Trumpk #1192 cấp 3 hp 32/72 (1391,640)",
      "KsXSMax #551 cấp 10 hp 161/181 (1543,640)",
      "Kienspm06 #424 cấp 14 hp 176/188 (1798,640)",
      "Zala88 #894 cấp 5 hp 70/70 (1015,256)",
      "S1514 #653 cấp 21 hp 103/136 (661,597) hiệu ứng 9301",
      "killer #1204 cấp 2 hp 40/44 (90,640)",
      "senyn #1181 cấp 4 hp 151/151 (1480,640)",
      "ThanhNhu #125 cấp 16 hp 235/235 (1931,533)",
      "THANGTOCXOAN #951 cấp 6 hp 245/245 (1767,288)"
    ]
  },
  "bytesInterpreted": 5059,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-1262"></a>

## s2c/1262

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | player_positions |
| Xuất hiện khi | Mỗi 100 ms khi có người đổi vị trí |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | u16 tickMs=100; u16 n; n * {i32 id; i32 x; i32 y; u8 state; u8 flags; u16 field14} |
| Độ chắc chắn | Đo: bản ghi id của mình lặp đúng x/y/state của c2s/1169; flags = bitmask flags[0..3] của 1169; field14 chưa rõ |
| Độ dài payload mẫu | 52 byte |

Bố cục đã kiểm trên mọi payload và giải thích: [09-players-chat](09-players-chat.md#s2c-1262).

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
    "tickMs": 100,
    "players": [
      {
        "id": 1130,
        "x": 2575,
        "y": 655,
        "state": 1,
        "flags": 8,
        "field14": 96
      },
      {
        "id": 125,
        "x": 1749,
        "y": 604,
        "state": 5,
        "flags": 9,
        "field14": 50
      },
      {
        "id": 800,
        "x": 2792,
        "y": 672,
        "state": 1,
        "flags": 10,
        "field14": 15
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
| Nhãn phân tích | player_hp |
| Xuất hiện khi | Người chơi khác đổi HP/cấp/trang bị |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | i32 id; i32 level; i32 hp; i32 maxHp; u8 field |
| Độ chắc chắn | Đo: maxHp giảm theo từng món tháo ở s2c/1166, cấp tăng khi lên cấp |
| Độ dài payload mẫu | 17 byte |

Bố cục đã kiểm trên mọi payload và giải thích: [09-players-chat](09-players-chat.md#s2c-1166).

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
0000044800000009000000320000004800
```

Nguồn: A1: packet đọc từ native reader, record 158.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "id": 1096,
    "level": 9,
    "hp": 50,
    "maxHp": 72,
    "field": 0
  },
  "bytesInterpreted": 17,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-1184"></a>

## s2c/1184

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | ground_items |
| Xuất hiện khi | Vào map: vật phẩm đang nằm trên đất |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | string mapId; i32 n; n * item record (như s2c/1182) |
| Độ chắc chắn | Đọc hết byte; vai trò vật phẩm rơi là suy luận |
| Độ dài payload mẫu | 108 byte |

Bố cục đã kiểm trên mọi payload và giải thích: [09-players-chat](09-players-chat.md#ground-items).

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
000000024d3100000001fe000000360000002464336339326330332d643365392d346466382d623839632d636437356334303334653532000000000000003c00000001000200000000000102000000060000000300000009000000460000083700000260000001a1883c1c36
```

Nguồn: A1: packet đọc từ native reader, record 175.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "mapId": "M1",
    "items": [
      {
        "flag": 254,
        "itemId": 54,
        "uuid": "d3c92c03-d3e9-4df8-b89c-cd75c4034e52",
        "field0": 0,
        "durability": 60,
        "quantity": 1,
        "field1": 0,
        "grade": 2,
        "field2": 0,
        "field3": 0,
        "field4": 1,
        "stats": [
          {
            "stat": 6,
            "value": 3
          },
          {
            "stat": 9,
            "value": 70
          }
        ],
        "x": 2103,
        "y": 608,
        "expiresAt": 1793287003190
      }
    ]
  },
  "bytesInterpreted": 108,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-1182"></a>

## s2c/1182

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | ground_item_add |
| Xuất hiện khi | Có vật phẩm rơi xuống đất |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | string mapId; item record: u8 0xfe; i32 itemId; string uuid; i32; i32 durability; i32 quantity; u8; u8 grade; i32; u8; u8; u8 n; n * {i32 stat; i32 value}; i32 x; i32 y; i64 expiresAt |
| Độ chắc chắn | Đọc hết byte; rơi theo nhóm cách 32 đơn vị, hạn 600 s; tên "vật phẩm rơi" là suy luận |
| Độ dài payload mẫu | 88 byte |

Bố cục đã kiểm trên mọi payload và giải thích: [09-players-chat](09-players-chat.md#ground-items).

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
    "mapId": "M1",
    "flag": 254,
    "itemId": 41,
    "uuid": "39ecfda4-d7d5-428a-a745-b56c74dbbe4d",
    "field0": 0,
    "durability": -1,
    "quantity": 133,
    "field1": 0,
    "grade": 255,
    "field2": 0,
    "field3": 0,
    "field4": 0,
    "stats": [],
    "x": 1879,
    "y": 608,
    "expiresAt": 1793287014796
  },
  "bytesInterpreted": 88,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-1183"></a>

## s2c/1183

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | ground_item_remove |
| Xuất hiện khi | Vật phẩm bị nhặt hoặc hết hạn |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | string mapId; string uuid |
| Độ chắc chắn | uuid khớp s2c/1182 trước đó |
| Độ dài payload mẫu | 46 byte |

Bố cục đã kiểm trên mọi payload và giải thích: [09-players-chat](09-players-chat.md#ground-items).

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
    "uuid": "d3c92c03-d3e9-4df8-b89c-cd75c4034e52"
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
| Nhãn phân tích | player_leave |
| Xuất hiện khi | Người chơi rời khu; cặp 1170→1167 cùng mili giây là xuất hiện lại |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | i32 id |
| Độ chắc chắn | Byte đã đo; ý nghĩa nghiệp vụ/schema một phần là suy luận; phần chưa biết giữ opaque |
| Độ dài payload mẫu | 4 byte |

Bố cục đã kiểm trên mọi payload và giải thích: [09-players-chat](09-players-chat.md#s2c-1167).

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
    "id": 125
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
| Nhãn phân tích | player_enter |
| Xuất hiện khi | Người chơi vào khu hoặc xuất hiện lại |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | player record: u8 kind; string name; i32 id; string displayName; u8; u8; i32 level,hp,maxHp,s1,s1Max; u16; i32 x,y; i32 gear[6]; appearance; i32; string faction; u8; u8 |
| Độ chắc chắn | Đọc hết byte 60 mẫu; khối appearance (bảng màu) chưa đặt tên |
| Độ dài payload mẫu | 260 byte |

Bố cục đã kiểm trên mọi payload và giải thích: [09-players-chat](09-players-chat.md#player-record).

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
    "kind": 2,
    "name": "Neoxw",
    "id": 877,
    "displayName": "Neoxw",
    "flag1": 2,
    "flag2": 0,
    "level": 4,
    "hp": 52,
    "maxHp": 52,
    "s1": 0,
    "s1Max": 100,
    "field": 0,
    "x": 562,
    "y": 416,
    "gear": [
      0,
      0,
      0,
      0,
      0,
      0
    ],
    "appearanceBytes": 171,
    "factionField": 0,
    "faction": "",
    "factionFlags": [
      0,
      0
    ]
  },
  "bytesInterpreted": 260,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-1166"></a>

## s2c/1166

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | player_gear |
| Xuất hiện khi | Người chơi khác đổi trang bị |
| Sau đó | Không có ACK riêng trong capture; tiếp tục đọc stream |
| Bố cục payload | i32 id; i32 gear[6] |
| Độ chắc chắn | Đo: 6 số trùng gear trong player record; tháo đồ thì về 0 |
| Độ dài payload mẫu | 28 byte |

Bố cục đã kiểm trên mọi payload và giải thích: [09-players-chat](09-players-chat.md#s2c-1166).

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
0000035300016058000111d400013948ffffffff0000000000000000
```

Nguồn: A1: packet đọc từ native reader, record 671.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "id": 851,
    "gear": [
      90200,
      70100,
      80200,
      -1,
      0,
      0
    ]
  },
  "bytesInterpreted": 28,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).
