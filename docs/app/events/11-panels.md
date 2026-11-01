# Các bảng chức năng: thư, bạn bè, xếp hạng, Bảo Điển, sứ quân

Mốc: APK 1.0.3, ngày 30/10/2026, nhân vật `manina`. Nguồn **U1** ([các phiên bắt gói](../investigation.md#nguồn-dữ-liệu)): mở lần lượt các bảng chức năng trên điện thoại trong lúc bắt gói, chỉ mở rồi đóng, không mua bán. Bộ giải mã: [src/protocol/world.ts](../../../src/protocol/world.ts) (`ranking`), [src/protocol/events.ts](../../../src/protocol/events.ts). Test: [test/quest.test.ts](../../../test/quest.test.ts). Nhãn **[Đo]**, **[Suy luận]**, **[Chưa rõ]** như các file khác.

## Bảng nào gửi gói gì

Mở từ menu "Chức năng" và các biểu tượng góc phải. Bảng nào chỉ dùng dữ liệu đã nhận lúc đăng nhập thì không gửi gói.

| Bảng | Gói | Nội dung |
|---|---|---|
| Nhiệm vụ (tab Chính, Phụ) | không | Chính: dữ liệu `s2c/39`. Phụ: "Chưa có thông tin nhiệm vụ." |
| Bản thân (trang bị, chỉ số, kỹ năng) | không | Túi 4 món; 0 Xu, 2.060 Xu khoá, 0 Lượng |
| Hòm thư | `c2s/1215` (rỗng) → `s2c/1215` `i32 0` | Không có thư. Khi có thư (G1): bố cục từng thư, xem thư, Nhận, Nhận hết, Xóa, Xóa hết ở [Hòm thư](14-npc.md#hòm-thư) |
| Bạn bè | `c2s/1196` (rỗng) → `s2c/1196` `i32 0` | Chưa có bạn |
| Bảng xếp hạng | `c2s/1254 00` → `s2c/1254` tab, rồi danh sách; đổi tab: `c2s/1254 01 01` | Xem dưới |
| Bảo Điển (tab Bảo Điển, Nhiệm vụ) | `c2s/1240` → `s2c/1240` `00`; `c2s/1241` → `s2c/1241` `00` | "Hiện chưa có mùa Bảo Điển nào" |
| Sứ quân | `c2s/1265 00` → 16 byte 0 (chưa vào sứ quân); `c2s/1265 01 000000000000` → danh sách | Thiên Tôn 11/20, WATER7 20/20, CỜ LAU 16/20, ALIBABA 3/20 |
| Tin nhắn (Thế giới, Sứ quân) | không | Lịch sử là các tin `s2c/1205` từ lúc đăng nhập; ô nhập "Nhập để chat (5 lượng)" |
| Cẩm nang | không | Luật trận đấu, xem [05-battle](05-battle.md#bàn-chơi) |
| Cộng đồng | không | Link Fanpage, nhóm Facebook, Zalo từ `s2c/1271` |
| Tích lũy, Chợ trời, Sự kiện, Lôi đài, Nạp đầu, Tài khoản | chưa kiểm | Game tắt giữa lượt U1 (dưới); Lôi đài, Nạp đầu, Tài khoản cố ý bỏ qua |

Gói `s2c/1265` lúc đăng nhập (30 byte, byte đầu `0x64` = 100) trước đây ghi là "config_1265". Nó cùng opcode với gói sứ quân, byte đầu là lệnh con. Chữ `"WATER7"` trong bản ghi người chơi ([09](09-players-chat.md#player-record)) là **tên sứ quân**. [Đo]

<a id="s2c-1254"></a>

## s2c/1254: bảng xếp hạng

```text
kiểu 0: 00 02 {00 "Cao thủ" "Cấp độ"} {01 "Sứ quân" "Cấp"} 00
kiểu 1: 01 00 00000064 {00000001 00000014 "thuytoc" 00000000 00000076} … ×100
        00000446 00000000 00000004                          hạng của mình 1094, cấp 4
        01 01 00000004 {00000001 000000a5 "Thiên Tôn" 0 1} … ffffffff 00000000 00000000   (chưa có sứ quân)
```

`u8 kiểu; kiểu 0: u8 n; n × {u8 tab; string tên; string cột}; u8. Kiểu 1: u8 tab; i32 n; n × {i32 hạng; i32 id; string tên; i32 0; i32 cấp}; i32 hạngCủaMình; i32 0; i32 cấpCủaMình`. Đọc hết byte cả 3 mẫu. Hạng 1094 nghĩa là server có ít nhất 1094 nhân vật. [Đo]

## Game tắt giữa U1

Lượt bắt U1 hết hạn 20 phút và script Frida tự gỡ ra lúc 06:48:08. Khoảng 5 s sau, cửa sổ game đóng và tiến trình biến mất. Logcat không có crash hay tombstone, nên nguyên nhân [Chưa rõ]. Hai lần gỡ script trước đó game vẫn chạy bình thường.

## Chưa rõ

- Từng trường của danh sách sứ quân trong `s2c/1265`.
- Gói của Tích lũy, Chợ trời, Sự kiện (chưa mở được vì game tắt giữa U1).
- Nguyên nhân game tắt sau khi gỡ script Frida.
