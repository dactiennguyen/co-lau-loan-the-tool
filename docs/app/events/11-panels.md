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
| Bảng xếp hạng | `c2s/1254 00` → `s2c/1254` tab, rồi danh sách tab 0; đổi tab: `c2s/1254 01 <tab>` (RK1) | Xem dưới |
| Bảo Điển (tab Bảo Điển, Nhiệm vụ) | `c2s/1240` → `s2c/1240` `00`; `c2s/1241` → `s2c/1241` `00` | "Hiện chưa có mùa Bảo Điển nào" |
| Sứ quân | `c2s/1265 00` → 16 byte 0 (chưa vào sứ quân); `c2s/1265 01 000000000000` → danh sách | Thiên Tôn 11/20, WATER7 20/20, CỜ LAU 16/20, ALIBABA 3/20 |
| Tin nhắn (Thế giới, Sứ quân) | không | Lịch sử là các tin `s2c/1205` từ lúc đăng nhập; ô nhập "Nhập để chat (5 lượng)" |
| Cẩm nang | không | Luật trận đấu, xem [05-battle](05-battle.md#bàn-chơi) |
| Cộng đồng | không | Link Fanpage, nhóm Facebook, Zalo từ `s2c/1271` |
| Chợ trời | `c2s/1192 (0, mục, 1)` thẳng, không qua Ngọc Nga | Như cửa sổ của Ngọc Nga ([Chợ trời](14-npc.md#cửa-sổ-chợ-trời), CT1) |
| Tích lũy, Sự kiện, Lôi đài, Nạp đầu, Tài khoản | chưa kiểm | Game tắt giữa lượt U1 (dưới); Lôi đài, Nạp đầu, Tài khoản cố ý bỏ qua |

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

**Khi khai `0.0.7`** (bot TS, tiheo2, 20/11):

- Kiểu 0 có **7 tab**: 0 Cao thủ (Cấp độ), 1 Sứ quân (Cấp), 2 12 châu (Cấp), 3 Cường hoá (Tổng cấp), 4 Hỏa, 5 Lôi, 6 Thủy (Cấp độ). Bố cục không đổi.
- Kiểu 1 thêm, sau ba số của mình, **`n × i64`** (mỗi dòng một mốc thời gian, ms tính từ 1970) rồi **`i64`** của mình (0 khi chưa xếp hạng). Có lẽ là lúc đạt cấp, dùng để xếp những người cùng cấp [Suy luận]. Cao thủ: 100 dòng, 3562 byte, akaito hạng 800 cấp 5. Sứ quân khi chưa vào sứ quân: `01 01 00000000 ffffffff 00000000 00000000` + 8 byte 0.
- `c2s/1254 (tab, 1)` mở được tab 1. Tab 2–6 gửi cách 1,5 s đều bị trả `s2c/1256` "Không thể thực hiện" [Chưa rõ: sai cách gửi hay tab chưa mở].

**RK1** (23/11, game 1.1.1, bot TS và điện thoại có Frida, một nhân vật cấp 99 người dùng cho mượn) [Đo]:

- **Gói đổi tab là `01` rồi số tab**, không phải số tab rồi `01`: client gửi `0100` … `0106` khi chạm 7 tab, và cả 7 tab đều có dữ liệu. Bot cũ gửi `tab 01`, nên `01 01` chạy được chỉ vì trùng (byte đầu 1 là "xem tab", byte sau 1 là Sứ quân); `02 01` … `06 01` bị "Không thể thực hiện", đó là lý do các tab 2–6 bị từ chối ngày 20/11. `00` (một byte) vẫn trả danh sách tab rồi danh sách tab 0; `00 01` cũng vậy.
- Tab 0 Cao thủ: 100 dòng xếp theo cấp, mỗi dòng có mốc "Đạt lúc" (i64 ms); dòng của mình có hạng (27) và cấp. Tab 3 Cường hoá xếp theo tổng cấp nâng cấp của đồ ("Tổng cấp"); tab 4–6 là top cấp độ của từng hệ (Hỏa, Lôi, Thủy).
- Tab 2 **12 châu**: 12 dòng, mỗi dòng là một châu ("Hồng Giang: chưa có chủ", id 0, cấp 0) và **không có** mốc thời gian, nên gói theo bố cục cũ dù khai 0.0.7. Dòng của mình -1.
- Cửa sổ trên máy: tab Cao thủ, Sứ quân, 12 châu, Cường hoá, Hỏa, Lôi, Thủy; cột Hạng (top 3 có huy hiệu cánh), Tên nhân vật với "Đạt lúc 23/11/2026 18:53" bên dưới, cột số (Cấp độ, Cấp, Tổng cấp); dòng của mình ghim ở cuối, tô vàng, hay "Bạn chưa có tên trong bảng".

`ranking` của bot TS đọc được cả hai bố cục, `rankingRequest` dựng gói như client. App Rust: `world::ranking`, `world::ranking_request`, `Bot::ranking` (`core/src/bot/ranking.rs`), nút cúp cạnh Xung quanh ở thẻ Vị trí.

## Game tắt giữa U1

Lượt bắt U1 hết hạn 20 phút và script Frida tự gỡ ra lúc 06:48:08. Khoảng 5 s sau, cửa sổ game đóng và tiến trình biến mất. Logcat không có crash hay tombstone, nên nguyên nhân [Chưa rõ]. Hai lần gỡ script trước đó game vẫn chạy bình thường.

## Chưa rõ

- Từng trường của danh sách sứ quân trong `s2c/1265`.
- Gói của Tích lũy, Sự kiện (chưa mở được vì game tắt giữa U1). Chợ trời đã đo ở CT1 ([Ngọc Nga](14-npc.md#ngọc-nga)).
- Nguyên nhân game tắt sau khi gỡ script Frida.
