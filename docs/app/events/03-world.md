# Dữ liệu nhân vật và bản đồ

[Mục lục event](README.md). Nhãn mô tả/tên field bên dưới là nhãn phân tích, không phải tên string gốc của giao thức. Nguồn A1/A2/V1 và cách thu được giải thích trong [phương pháp điều tra](../investigation.md).

<a id="c2s-9"></a>

## c2s/9

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Client → Server |
| Nhãn phân tích | character_request |
| Xuất hiện khi | Đã nhận authentication_ack rỗng |
| Sau đó | s2c/9 |
| Bố cục payload | string accountLower; u8 flag=2; i32 field=-1 |
| Độ chắc chắn | Đã đo kiểu/byte; tên field chưa rõ được giữ trung tính |
| Độ dài payload mẫu | 16 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
000000076d616e696e613202ffffffff
```

Nguồn: A2: packet gửi của app, thu ở native writer.

Điểm quan sát: Quan sát tại com.mh.sqje.a(sqi), trước khi ghi DataOutputStream. Đọc opcode a, buffer b và độ dài d của sqi.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "account": "manina2",
    "flag": 2,
    "field": -1
  },
  "bytesInterpreted": 16,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-9"></a>

## s2c/9

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | character_data |
| Xuất hiện khi | Trả character_request |
| Sau đó | c2s/30 |
| Bố cục payload | u8 status; u8 field01; string name; i32 numericId; string displayName; u8 flag1,flag2; i32 level,hp,maxHp; i32 s1,s1Max; i32 stats[10]; i32 combat[5]; i32 exp,coin,field; i32 statPoints,skillPoints; i32 levelExp[2]; string labels[2]; u8[6]; i32 x,y; i32 n; n × kỹ năng {i32 mã; i32 cấp; i32; u8}; i32 8; 8 × (0xff | vật phẩm); i32; khối ngoại hình; i32 n; n × hiệu ứng {string khoá; i32 tỉLệ; i32; i32 msCònLại}; i32; string sứ quân; u8; u8 |
| Độ chắc chắn | Prefix: getter native, level/HP khớp UI; field01 không phải số nhân vật: bằng flag1 ở cả ba mẫu (1, 1, 4), là hệ nhân vật (1 Hỏa, 4 Thủy; K1). Đuôi: ba mẫu (A2 cấp 3, 30/10 cấp 21, nick thứ hai 31/10 cấp 2) cùng bố cục; hai mẫu đầu khớp s2c/10 và x/y của s2c/11; statPoints khớp bảng Chỉ số (68 ở E2), skillPoints = cấp − 1 − số điểm đã dùng ở cả ba mẫu; đuôi sau x/y đọc hết byte ở symap (P4: hiệu ứng x2 EXP "ef7", sứ quân "Thiên Tôn") và manina |
| Độ dài payload mẫu | 551 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
0101000000066d616e696e610000009b000000066d616e696e6101000000000300000078000000820000000000000064000000160000000a0000000a0000000c00000000000000000000000000000000000000000000000000000016000000090000001e0000001400000006000000b000000000000027100000000600000001
```

Hiển thị 128/551 byte đầu. JSON và bảng getter dưới đây là bản ghi gốc của A2, khi mới đọc được 40 byte prefix. Phần đuôi (EXP, chỉ số, x/y, kỹ năng, trang bị, hiệu ứng như x2 EXP, sứ quân) giải sau, xem [dữ liệu nhân vật](../user-data.md#đuôi-s2c9).

Nguồn: A2: packet đọc từ native reader, record 100.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "status": 1,
    "field01": 1,
    "name": "manina",
    "numericId": 155,
    "displayName": "manina",
    "flag1": 1,
    "flag2": 0,
    "level": 3,
    "hp": 120,
    "maxHp": 130
  },
  "bytesInterpreted": 40,
  "bytesUnknown": 511
}
```

**Getter native và offset trước lời gọi:** c7 lồng trong f10/g11 là length, không phải field mới.

| Offset | Kiểu | Giá trị |
|---:|---|---|
| 0 | byte | 1 |
| 1 | byte | 1 |
| 2 | string | "manina" |
| 12 | int | 155 |
| 16 | string | "manina" |
| 26 | byte | 1 |
| 27 | byte | 0 |
| 28 | int | 3 |
| 32 | int | 120 |
| 36 | int | 130 |
| 40 | int | 0 |
| 44 | int | 100 |
| 48 | int | 22 |
| 52 | int | 10 |
| 56 | int | 10 |
| 60 | int | 12 |
| 64 | int | 0 |
| 68 | int | 0 |
| 72 | int | 0 |
| 76 | int | 0 |
| 80 | int | 0 |
| 84 | int | 0 |
| 88 | int | 22 |
| 92 | int | 9 |
| 96 | int | 30 |
| 100 | int | 20 |
| 104 | int | 6 |
| 108 | int | 176 |
| 112 | int | 0 |
| 116 | int | 10000 |
| 120 | int | 6 |
| 124 | int | 1 |
| 128 | int | 150 |
| 132 | int | 300 |
| 136 | string | "780" |
| 143 | string | "125" |
| 150 | int | 0 |
| 154 | byte | 0 |
| 155 | byte | 0 |
| 156 | int | 932 |

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="c2s-30"></a>

## c2s/30

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Client → Server |
| Nhãn phân tích | skills_request |
| Xuất hiện khi | Đã lấy nhân vật |
| Sau đó | s2c/30 |
| Bố cục payload | u8 element (field01 của s2c/9: 1 Hỏa, 4 Thủy) |
| Độ chắc chắn | Đo: app gửi 1 cho manina (Hỏa); K1: gửi 4 cho nick thứ hai (field01 4) thì nhận cây Thủy 4000–4008, gửi 1 thì nhận cây Hỏa |
| Độ dài payload mẫu | 1 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
01
```

Nguồn: A2: packet gửi của app, thu ở native writer.

Điểm quan sát: Quan sát tại com.mh.sqje.a(sqi), trước khi ghi DataOutputStream. Đọc opcode a, buffer b và độ dài d của sqi.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "flag": 1
  },
  "bytesInterpreted": 1,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-30"></a>

## s2c/30

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | skills_data |
| Xuất hiện khi | Trả skills_request; có push khác xen giữa |
| Sau đó | c2s/42 |
| Bố cục payload | i32 n; n * {i32 skillId; string name; i32 prerequisiteId (-1 = không); i32 maxLevel; maxLevel * {i32 level; string description; i32 skillPointCost; i32 requiredLevel; i32 manaCost}} |
| Độ chắc chắn | Đọc hết 23442 byte mẫu A2: 9 kỹ năng hệ Hỏa (1000–1008); điều kiện từng cấp khớp chi tiết kỹ năng trên máy (E1); K1: cây Thủy 4000–4008 cùng bố cục |
| Độ dài payload mẫu | 23442 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
00000009000003e80000001348e1bb8f612043e1baa77520546875e1baad74ffffffff00000014000000010000007f54e1baa56e2063c3b46e672076c3a02067c3a2792031312073c3a174207468c6b0c6a16e672063686f20c491e1bb9169207068c6b0c6a16e672c20c491e1bb936e67207468e1bb9d69207068c3a12068e1
```

Hiển thị 128/23442 byte đầu. JSON dưới đây là bản ghi gốc của A2, khi mới đọc được prefix. Bố cục đầy đủ và bảng 9 kỹ năng đã giải sau, xem [bảng kỹ năng](12-skills-items.md#bảng-kỹ-năng).

Nguồn: A2: packet đọc từ native reader, record 150.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "field0": 9,
    "firstId": 1000,
    "firstLabel": "Hỏa Cầu Thuật"
  },
  "bytesInterpreted": 31,
  "bytesUnknown": 23411
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="c2s-42"></a>

## c2s/42

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Client → Server |
| Nhãn phân tích | character_extra_request |
| Xuất hiện khi | Đã nhận skills_data |
| Sau đó | s2c/42 |
| Bố cục payload | string characterName |
| Độ chắc chắn | Đã đo kiểu/byte; tên field chưa rõ được giữ trung tính |
| Độ dài payload mẫu | 10 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
000000066d616e696e61
```

Nguồn: A2: packet gửi của app, thu ở native writer.

Điểm quan sát: Quan sát tại com.mh.sqje.a(sqi), trước khi ghi DataOutputStream. Đọc opcode a, buffer b và độ dài d của sqi.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "characterName": "manina"
  },
  "bytesInterpreted": 10,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-42"></a>

## s2c/42

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | character_extra |
| Xuất hiện khi | Trả character_extra_request |
| Sau đó | c2s/29 |
| Bố cục payload | string label ("test dong 1"); i32 42; i32 3; túi đồ: u8 2; i32 capacity; i32 n; n * item record (như s2c/1187) |
| Độ chắc chắn | Đọc hết 608 byte (E1): 8 món khớp túi trên máy; i32 42, i32 3 sau label chưa rõ |
| Độ dài payload mẫu | 246 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
0000000b7465737420646f6e6720310000002a00000003020000002a0000000300000000000000002464336435316134312d326335372d346633302d626630632d33656363643262353532646500000000ffffffff0000000300ff00000000000000010000019c0000002438623065656336332d303631352d343962382d3931
```

Hiển thị 128/246 byte đầu. JSON dưới đây là bản ghi gốc của A2, khi mới đọc được chuỗi đầu. Phần sau là túi đồ, đã giải sau, xem [túi đồ](12-skills-items.md#túi-đồ).

Nguồn: A2: packet đọc từ native reader, record 152.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "firstLabel": "test dong 1"
  },
  "bytesInterpreted": 15,
  "bytesUnknown": 231
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="c2s-29"></a>

## c2s/29

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Client → Server |
| Nhãn phân tích | location_request |
| Xuất hiện khi | Đã nhận character_extra |
| Sau đó | s2c/29 |
| Bố cục payload | string characterName |
| Độ chắc chắn | Đã đo kiểu/byte; tên field chưa rõ được giữ trung tính |
| Độ dài payload mẫu | 10 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
000000066d616e696e61
```

Nguồn: A2: packet gửi của app, thu ở native writer.

Điểm quan sát: Quan sát tại com.mh.sqje.a(sqi), trước khi ghi DataOutputStream. Đọc opcode a, buffer b và độ dài d của sqi.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "characterName": "manina"
  },
  "bytesInterpreted": 10,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-29"></a>

## s2c/29

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | character_location |
| Xuất hiện khi | Trả location_request |
| Sau đó | c2s/11 |
| Bố cục payload | string characterName; string mapId; i32 field |
| Độ chắc chắn | Đã đo kiểu/byte; tên field chưa rõ được giữ trung tính |
| Độ dài payload mẫu | 20 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
000000066d616e696e61000000024d3100000000
```

Nguồn: A2: packet đọc từ native reader, record 154.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "characterName": "manina",
    "mapId": "M1",
    "field": 0
  },
  "bytesInterpreted": 20,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="c2s-11"></a>

## c2s/11

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Client → Server |
| Nhãn phân tích | map_request |
| Xuất hiện khi | Đã có mapId; mapId "M99" khi mở Bản đồ thế giới |
| Sau đó | s2c/11 |
| Bố cục payload | string mapId; u8 area=-1 (ff; 00 với "M99"); i32 field=-1 |
| Độ chắc chắn | Đã đo kiểu/byte; tên field chưa rõ được giữ trung tính |
| Độ dài payload mẫu | 11 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
000000024d31ffffffffff
```

Nguồn: A2: packet gửi của app, thu ở native writer.

Điểm quan sát: Quan sát tại com.mh.sqje.a(sqi), trước khi ghi DataOutputStream. Đọc opcode a, buffer b và độ dài d của sqi.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "mapId": "M1",
    "area": 255,
    "field": -1
  },
  "bytesInterpreted": 11,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-11"></a>

## s2c/11

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | map_data |
| Xuất hiện khi | Trả map_request |
| Sau đó | c2s/43 |
| Bố cục payload | flag 1: u8 flag; string mapId,name; u8 area; i32 x,y,field36,dimension1,dimension2; bytes tiles; bytes lớp 2; bytes lớp 3; i32 ×3; i32 n; n * {i32 id; string tên; u8 loại (0 cổng, 2 NPC); i32 x,y,w,h; u8; i32 p,q}; i32 ×3. flag 0 ("M99"): string "M99"; i32 n; n * {i32 index; string mapId; 17 byte 0; u8 locked; 8 byte 0}; i32 n; n * {i32 index; i32 levelRequired} |
| Độ chắc chắn | Getter/offset đã đo; x/y và kích thước lưới là suy luận; nhánh M99 đọc hết 1132 byte, cấp yêu cầu khớp nhãn Lv. trên bản đồ; danh sách NPC/cổng đọc hết byte M1, M2 (B5) |
| Độ dài payload mẫu | 11379 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
01000000024d31000000104cc3a06e67205468616e68204b68c3aa05000003a40000022000000000000000170000009c00000e0400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000
```

Hiển thị 128/11379 byte đầu. Các giá trị đã đọc được ghi bên dưới; phần chưa rõ không được điền thêm byte hoặc coi là schema đã hiểu.

Nguồn: A2: packet đọc từ native reader, record 160.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "flag": 1,
    "mapId": "M1",
    "name": "Làng Thanh Khê",
    "area": 5,
    "x": 932,
    "y": 544,
    "field36": 0,
    "dimension1": 23,
    "dimension2": 156,
    "tileBytes": 3588
  },
  "bytesInterpreted": 3640,
  "bytesUnknown": 7739
}
```

**Getter native và offset trước lời gọi:** c7 lồng trong f10/g11 là length, không phải field mới.

| Offset | Kiểu | Giá trị |
|---:|---|---|
| 0 | byte | 1 |
| 1 | string | "M1" |
| 7 | string | "Làng Thanh Khê" |
| 27 | byte | 5 |
| 28 | int | 932 |
| 32 | int | 544 |
| 36 | int | 0 |
| 40 | int | 23 |
| 44 | int | 156 |
| 48 | bytes | 3588 byte |

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="c2s-43"></a>

## c2s/43

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Client → Server |
| Nhãn phân tích | entities_request |
| Xuất hiện khi | Đã nhận map_data |
| Sau đó | s2c/43 và snapshot 1263 |
| Bố cục payload | string mapId |
| Độ chắc chắn | Đã đo kiểu/byte; tên field chưa rõ được giữ trung tính |
| Độ dài payload mẫu | 6 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
000000024d31
```

Nguồn: A2: packet gửi của app, thu ở native writer.

Điểm quan sát: Quan sát tại com.mh.sqje.a(sqi), trước khi ghi DataOutputStream. Đọc opcode a, buffer b và độ dài d của sqi.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "mapId": "M1"
  },
  "bytesInterpreted": 6,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).

<a id="s2c-43"></a>

## s2c/43

| Thuộc tính | Điều tra được |
|---|---|
| Hướng | Server → Client |
| Nhãn phân tích | entities_data |
| Xuất hiện khi | Trả entities_request |
| Sau đó | Đồng bộ push thế giới; không gửi ACK nguyên gói |
| Bố cục payload | string mapId; u8 field; tới hết payload: {string mobId; string name; i32 level; u8 a; i32 b; i32 c; u8 d} |
| Độ chắc chắn | Đọc hết byte: M1 khu 0 (1398 byte), khu 1 (bot Q2); ý nghĩa field, a..d chưa chốt; không có toạ độ quái |
| Độ dài payload mẫu | 1406 byte |

**Payload mẫu sau giải XOR**, chưa gồm header và encoded opcode:

```text
000000024d3103000000066d6f623134300000000a47c3a020c49069c3aa6e0000000104000000010000000100000000066d6f623134310000000a47c3a020c49069c3aa6e0000000104000000010000000100000000066d6f623134320000000a47c3a020c49069c3aa6e0000000104000000010000000100000000066d6f62
```

Hiển thị 128/1406 byte đầu. Bảng quái theo tên và ý nghĩa từng cột ở [05-battle](05-battle.md#s2c43-danh-sách-quái-của-bản-đồ).

Nguồn: A2: packet đọc từ native reader, record 195.

Điểm quan sát: Quan sát giá trị sqi trả về từ com.mh.sqnw.e(), trước handler làm thay đổi cursor c.

**Diễn giải từ byte** (tên key là nhãn của tài liệu):

```json
{
  "values": {
    "mapId": "M1",
    "field": 3,
    "mobCount": 33,
    "mobs": {
      "Gà Điên": "mob140 (cấp 1) … mob147",
      "Heo Mọi": "mob2830 (cấp 7) … mob2835",
      "Kẻ Gây Rối": "mob31430 (cấp 7) … mob31435",
      "Sơn Tặc": "mob42030 (cấp 9) … mob42035",
      "Chỉ Huy Sơn Tặc": "mob872635 (cấp 10) … mob872641"
    }
  },
  "bytesInterpreted": 1406,
  "bytesUnknown": 0
}
```

**Nếu bản app mới khác:** tìm lại writer/reader/handler native, đối chiếu kiểu getter, cursor và byte gốc; phân biệt thay đổi nội dung động với đổi cấu trúc. Xem [điều tra lại](../reinvestigation.md).
