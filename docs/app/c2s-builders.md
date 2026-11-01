# Hàm dựng gói gửi đi (`com.mh.sqlq`)

Mốc: APK 1.0.3, `lib/arm64-v8a/libgdx-flashds.so`, phân tích tĩnh ngày 31/10/2026 (phiên T1, [phương pháp](investigation.md#nguồn-dữ-liệu)).

Phần Java của game được biên dịch sang native. Mỗi gói client gửi đi được dựng trong một hàm native của lớp `com.mh.sqlq`, tên export dạng `__ngen_com_mh_sqlq_282…__ngen_native_<tên><số thứ tự>`. Bảng dưới liệt kê 125 hàm có hằng opcode. Với mỗi hàm có: opcode, tham số Java, và các trường được ghi lên gói theo đúng thứ tự gọi.

## Cách đọc ra

- **Tham số Java:** lấy từ tên mangled của export, ví dụ `…native_c47EP7JNIEnv_P8_jobjectii` là `c47(int, int)`. `Object` thường là `String`. [Đo]
- **Opcode:** là số nguyên truyền vào constructor của gói (`com.mh.n.sqi.<init>(I)V`), nạp bằng `mov w4, #opcode` ngay trước `CallNonvirtualVoidMethod`. Mọi opcode đã biết đều khớp: `a67` → 15, `b65` → 13, `b121` → 1178, `d50` → 10. [Đo]
- **Trường ghi lên gói:** method ID của các hàm ghi được lưu sẵn trong biến toàn cục, mỗi biến được gán đúng một lần bằng `GetMethodID(lớp, tên, chữ ký)`. Tên và chữ ký lấy từ bảng chuỗi chung của thư viện, bắt đầu ở offset file `0x2e395d0`. Các hàm ghi của `sqi`:

| Hàm của `sqi` | Ghi lên dây | Kiểm chứng |
|---|---|---|
| `a(String)` | `string` (i32 độ dài + UTF-8) | `c2s/13` = `string; i32` |
| `b(B)`, `b(I)` | `u8` | `c2s/11` = `string; u8; i32`; `c2s/48` bắt được 5 byte cho `c47(0, 0)` |
| `c(I)` | `i32` | `c2s/10` = `i32; i32` (L1) |
| `a(J)` | `i64` | |
| `a(Z)` | `bool` (1 byte) | |
| `a([B)` | `bytes` (i32 độ dài + byte) | `c2s/4` |

Sau các lệnh ghi, hàm gọi `sqlq.c(sqi)` hoặc `sqlq.a(sqi, boolean)` để xếp gói vào hàng đợi gửi.

**Giới hạn.** Thứ tự là thứ tự lệnh ghi trong code, không phải thứ tự tham số. Ví dụ `a74`/`f75` ghi `seq` trước dù `seq` là tham số cuối ([05-battle](events/05-battle.md#c2s-20)). "string (trường e)" nghĩa là chuỗi lấy từ field `e` của đối tượng (ở các gói trận là uuid trận), không phải từ tham số. Dấu "…" nghĩa là còn lời gọi khác chen giữa mà script chưa đọc được (vòng lặp, getter), nên phần sau có thể thiếu. Ý nghĩa từng trường chưa có ở đây, trừ các gói đã đo; xem cột "Đã thấy trên dây".

Script tái tạo bảng không lưu trong repo. Cách làm: đọc bảng symbol bằng `objdump -T`, disassemble từng hàm, theo dõi thanh ghi giữa `adrp`/`ldr` (bảng chuỗi) và `add` (offset chuỗi), rồi ghép các cặp `GetMethodID`.

## Bảng

| Opcode | Hàm | Tham số Java | Trường ghi lên gói, theo thứ tự | Đã thấy trên dây |
|---:|---|---|---|---|
| 1 | j33 | () | rỗng | có |
| 2 | a38 | (Object, Object, int) | rỗng | có |
| 3 | a36 | (Object) | chưa đọc được | có |
| 4 | a37 | (Object, mảng) | string; bytes; string; string; i32; i32 … | có |
| 5 | a41 | (int, int, boolean) | chưa đọc được | có |
| 6 | a40 | (int, int) | i32; i32 |  |
| 6 | d39 | (int) | i32; i32 |  |
| 7 | b102 | (boolean) | u8; u8 |  |
| 8 | a42 | (Object, int, int, Object, Object, Object) | u8; u8; string; i32; i32; i32; i32; i32; i32 … |  |
| 9 | a48 | (Object, byte) | string; u8; i32 | có |
| 10 | d50 | (int, int) | i32; i32 | có |
| 11 | a63 | (Object, int) | string; u8; i32 | có |
| 13 | b65 | (Object, int) | string; i32 | có |
| 14 | h73 | (int) | string (trường e); i32 | có |
| 15 | a67 | (Object, boolean) | string; u8 | có |
| 16 | a68 | (Object, Object, boolean, long, boolean, boolean) | string; string; i64; bool; bool; bool |  |
| 17 | a69 | (boolean, Object, Object) | bool; string; string | Trả lời lời mời của người chơi khác (`s2c/17`): CT1 thấy `(false, uuid lời mời, "")` khi hộp mời đóng lại [Suy luận] |
| 18 | y104 | () | string (trường e) | có |
| 19 | a74 | (int, int, int, int, int) | chưa đọc được | có |
| 20 | f75 | (int, int) | string (trường e); i32; i32 | có |
| 23 | z105 | () | string (trường e) |  |
| 25 | k99 | static (Object) | string |  |
| 27 | a51 | (mảng) | i32; i32 |  |
| 29 | d64 | (Object) | string | có |
| 30 | e49 | (int) | u8 | có |
| 31 | x95 | () | rỗng |  |
| 32 | k96 | (int) | i32 |  |
| 33 | m98 | (int) | i32 |  |
| 40 | s77 | () | string (trường e) | có |
| 41 | l97 | (int) | i32 |  |
| 42 | b43 | (Object) | string | có |
| 43 | e66 | (Object) | string | có |
| 44 | g76 | (int, int) | string (trường e); i32; i32 | có |
| 47 | b78 | (int, int, int) | string (trường e); i32; i32; i32 |  |
| 48 | a46 | (int, int, int) | u8; i32; i32 | có |
| 48 | c47 | (int, int) | u8; i32 | có |
| 49 | f71 | (Object) | string; u8 |  |
| 49 | r72 | () | string (trường c); u8 |  |
| 51 | j85 | (int) | i32 |  |
| 52 | f57 | (int) | u8 |  |
| 55 | a90 | (boolean) | u8; string; u8 … |  |
| 55 | a91 | (boolean, Object) | u8; string; u8 |  |
| 55 | a92 | (long, Object) | u8; string (trường f); i64; i32; i32; i32 … |  |
| 55 | j89 | (Object) | u8; string |  |
| 55 | v93 | () | u8; string (trường f) |  |
| 55 | w94 | () | u8; string (trường f) |  |
| 56 | u86 | () | u8 |  |
| 57 | a103 | (int, Object, int) | u8; string; i32 | có |
| 58 | p113 | (Object) | string |  |
| 59 | Z174 | () | u8 … |  |
| 84 | i79 | (int) | i32 | có |
| 86 | A106 | () | rỗng |  |
| 91 | m109 | (Object) | string |  |
| 95 | o111 | (Object) | rỗng |  |
| 96 | n110 | (Object) | string |  |
| 97 | a107 | (Object, byte, int) | string; u8; i32; i32; i32 |  |
| 97 | a108 | (Object, byte, int, int) | chưa đọc được |  |
| 112 | a81 | (int, int, long) | chưa đọc được | Đăng bán ở Chợ trời: trên dây `u8 1; i32 ôTúi; i32 sốLượng; i64 giá` (CT1, [Đăng bán](events/14-npc.md#đăng-bán)) |
| 112 | g80 | (Object) | u8; string | Cùng opcode với Đăng bán, theo uuid; có lẽ là Gia hạn [Suy luận] |
| 113 | h82 | (Object) | string | Thu hồi món đang bán: uuid trong Đang bán (CT1, [Thu hồi](events/14-npc.md#thu-hồi)) |
| 115 | i84 | (Object) | string | Mua ở Chợ trời: uuid của món (CT1, [Mua](events/14-npc.md#mua)) |
| 116 | t83 | () | rỗng | Cửa sổ Chợ trời mở ra, xin danh sách mục (CT1) |
| 126 | q70 | () | rỗng |  |
| 131 | a101 | (Object, Object, Object, Object, Object) | string; string; string; string; string |  |
| 1169 | a115 | (int, mảng) | i32; i32; i32; u8; u8; u8; u8; u8 … | có |
| 1169 | B116 | () | i32; i32; i32; u8; u8; u8; u8; u8 … | có |
| 1172 | D118 | () | rỗng | có |
| 1173 | b119 | (byte) | u8 | có |
| 1174 | q120 | (Object) | string | Nói trong khu: chữ của hộp Chat (nút bong bóng góc trên bên phải), server trả `s2c/1174` ([09](events/09-players-chat.md#c2s-1174), CH1) |
| 1178 | b121 | (Object, boolean) | string; i32 | có |
| 1181 | a122 | (Object, int, boolean) | string; i32; i32 | Thách đấu quái tỷ thí của `s2c/1180`: `string mobId; i32 0; i32 npcId`, client tự gửi từ hàm chạm `sqhz.a17` ([10](events/10-quests.md#s2c-1180), N3) |
| 1186 | b45 | (int, int) | u8; i32 | có |
| 1188 | c44 | (Object) | string | có |
| 1189 | j123 | (int, int) | u8; i32 |  |
| 1190 | h87 | static (int, int) | u8; i32; i32 | có |
| 1191 | e52 | (int, int) | i32; i32 | có |
| 1192 | m144 | (int, int) | u8; i32; i32 | Một trang Chợ trời: `0; mục; trang`, mục -1 là Đang bán (CT1) |
| 1193 | k124 | (int, int) | i32; u8 |  |
| 1194 | E125 | () | rỗng |  |
| 1196 | F126 | () | rỗng | có |
| 1197 | o127 | (int) | i32 |  |
| 1198 | p128 | (int) | i32 |  |
| 1199 | b129 | (int, Object) | i32; string |  |
| 1202 | r130 | (Object) | string |  |
| 1203 | s131 | (Object) | string |  |
| 1205 | t132 | (Object) | string |  |
| 1206 | G133 | () | string; string; i32 … | có |
| 1210 | H134 | () | u8 |  |
| 1213 | a137 | (Object, Object) | u8; string; string |  |
| 1213 | l135 | (int, int) | u8; i32; i32 |  |
| 1213 | u136 | (Object) | u8; string |  |
| 1215 | K145 | () | rỗng | có |
| 1216 | a146 | (long) | i64 |  |
| 1217 | b147 | (long) | i64 |  |
| 1218 | L148 | () | rỗng |  |
| 1219 | c149 | (long) | i64 |  |
| 1221 | M150 | () | rỗng |  |
| 1223 | w151 | (Object) | string |  |
| 1226 | r167 | (int) | i32 |  |
| 1228 | W168 | () | rỗng |  |
| 1229 | s169 | (int) | i32 |  |
| 1230 | X170 | () | rỗng |  |
| 1232 | a171 | (long, long) | i64; i64 |  |
| 1233 | f172 | (long) | i64 |  |
| 1234 | N152 | () | rỗng |  |
| 1235 | O153 | () | rỗng |  |
| 1236 | x154 | (Object) | string |  |
| 1237 | P155 | () | rỗng |  |
| 1238 | Q156 | () | rỗng |  |
| 1239 | y157 | (Object) | string |  |
| 1240 | R158 | () | rỗng | có |
| 1241 | S159 | () | rỗng | có |
| 1242 | T160 | () | rỗng |  |
| 1243 | U161 | () | rỗng |  |
| 1244 | a162 | (int, long) | i32; i64 |  |
| 1245 | V163 | () | rỗng |  |
| 1246 | d164 | (long) | i64 |  |
| 1247 | q165 | (int) | i32 |  |
| 1248 | e166 | (long) | i64 |  |
| 1252 | Y173 | () | rỗng |  |
| 1254 | a59 | (byte) | u8; u8 | có |
| 1254 | p58 | () | u8 | có |
| 1255 | g62 | (int) | i32 |  |
| 1257 | l53 | static () | rỗng | Sắp xếp túi: server dồn ô và trả `s2c/1187`, `s2c/1111` ([12](events/12-skills-items.md#sắp-xếp), I1) |
| 1268 | n55 | static () | u8 |  |

Ghi chú:
- Kỹ năng và vật phẩm dùng các gói `1191` (nâng kỹ năng), `30` (cây kỹ năng theo hệ), `1186` (mặc, cởi), `84` (dùng), `48` (sửa), `44` (dùng trong trận), `57` và `1190` (mua ở NPC) ([12-skills-items](events/12-skills-items.md)); đo trên máy ở K1, P4, P5.
- Đồ thị gọi JNI (T2) gán thêm nghĩa cho ba gói lúc đó chưa thấy trên dây ([13-drops-items](events/13-drops-items.md#c2s-1188)) [Đo tĩnh]:
  - `1188` (`c44`) là nhặt đồ trên đất (`string uuid`), gửi từ nút "Nhặt" của lớp bản đồ. P3 đã bắt được trên máy ([13-drops-items](events/13-drops-items.md#p3)).
  - `1174` (`q120`) gửi chữ người chơi gõ trong một hộp nhập. CH1 đã bắt được trên máy: đó là hộp Chat của nút bong bóng, chữ hiện thành bong bóng trên đầu nhân vật ([09-players-chat](events/09-players-chat.md#c2s-1174)).
  - `1181` (`a122`) là gói chạm vào một loại thực thể bản đồ, cùng chỗ với `c2s/15` và `c2s/1178`. N3 đã bắt được trên máy: đó là thách đấu quái tỷ thí của `s2c/1180` ([10-quests](events/10-quests.md#s2c-1180)).
- Lời gọi hàm dựng đi qua JNI: method ID nằm trong mảng `cmethods` của lớp gọi, được tạo lần đầu bằng `GetMethodID`. Không có lệnh `BL` trực tiếp. Muốn biết ai gọi hàm dựng nào thì phải ghép call site với khối `GetMethodID` đã điền ô đó (T2).
- `c2s/1265` (Sứ quân) có trên dây nhưng không có hàm dựng trong `sqlq`: được dựng ở lớp khác. [Đo]
- Opcode của bảng mã mà không có hàm nào ở đây có thể là gói chỉ chạy chiều server → client, hoặc được dựng ngoài `sqlq`. [Suy luận]
