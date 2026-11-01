# Phương pháp và bằng chứng điều tra

## Nguồn dữ liệu

| Nguồn | Đã làm gì | Giới hạn |
|---|---|---|
| T0: APK | Đọc ZIP/manifest, decompile DEX, kiểm tra native exports/assembly | Thân hàm phần lớn là native; Java decompile không phải code nguồn gốc |
| A1: phiên app thứ nhất | Boot → login → thế giới; hook syscall và native packet | Một số body lớn giới hạn 8192 byte; không dùng bản cắt để khẳng định full schema |
| A2: phiên app thứ hai | Đọc packet bằng JNI, trace getter/writer và cursor; body tối đa 65536 byte | Chỉ một nhánh login thành công, một nhân vật và tập tính năng đã kích hoạt |
| V1: kết nối kiểm chứng độc lập | Đối chiếu lại framing/proof/login/world với server; đọc thêm gói 0 account online nơi khác | Là bằng chứng server, không gán thành capture gốc từ APK |
| B1: trận đấu đầu tiên (29/10) | Frida hook writer/reader; `manina` cấp 3 chạm Gà Điên và Chỉ Huy Sơn Tặc. [05-battle](events/05-battle.md) | Một trận đủ lượt, bot thắng |
| B2: bản đồ và quái (29/10) | Attach cùng tiến trình, khu 20; hook hàm dựng gói `sqlq`, đọc object quái qua JNI. [06-map-mobs](events/06-map-mobs.md) | Một map (M1) |
| run1–run4: bot trong game (30/10) | Frida gọi hàm dựng gói native để đánh quái; run4 thắng Gà Điên. [07-auto-battle](events/07-auto-battle.md) | run1 chết ngầm, run2 sai tham số, run3 lệch bàn |
| L1, W1: đăng nhập và ở lại thế giới (30/10) | L1 spawn app, ở 15 phút (người chơi tự trả nhiệm vụ, cộng điểm); W1 attach, khu 0. [08](events/08-server-map-zone.md), [09](events/09-players-chat.md) | Gói người chơi tự bấm chỉ thấy 1–10 lần |
| U1: các bảng chức năng (30/10) | Mở lần lượt từng bảng trên điện thoại, không mua bán. [11-panels](events/11-panels.md) | Game tắt giữa chừng, còn bảng chưa mở |
| B3: thử boss trên điện thoại (30/10) | Spawn app với hook writer/reader, ADB chạm màn hình để đi tìm Thủ Lĩnh Sơn Tặc; lạc vào trận Kẻ Gây Rối. [10-quests](events/10-quests.md#boss) | Chưa tìm thấy boss; trận bị client tự bỏ |
| B4: tìm gói đánh boss (30/10) | Agent Frida thay `sqhz.a17` (đi xuyên quái thường), hook 169 hàm dựng `sqlq`; nhân vật đứng sát boss nên app tự gửi `c2s/1178`; ADB vuốt để đánh 2 trận boss. [10-quests](events/10-quests.md#boss) | Trận boss thứ 3 bị tắt app giữa chừng |
| B5: tìm gói qua cổng (30/10) | Cùng agent; nhân vật đứng ở cổng Vân Sơn, bấm "Vào" → `c2s/13` với id cổng 1015, sang M2. [10-quests](events/10-quests.md#cổng) | Một cổng |
| Q1, Q2, Q3…: bot Node làm nhiệm vụ (30/10) | `npm run quest`, không cần điện thoại; log client với prefix hex 128 byte. [10-quests](events/10-quests.md) | Gói dài hơn 128 byte chỉ có prefix |
| E1, E2: kỹ năng, túi đồ, sửa đồ (31/10) | Điện thoại đang ở màn đăng nhập; Frida attach, hook writer/reader và 114 hàm dựng gói `com.mh.sqlq` (bỏ gói đăng nhập 1–8, `c2s/4` chỉ ghi độ dài); ADB chạm để mở các bảng, nâng cấp Hỏa Cầu Thuật và sửa nón. [12-skills-items](events/12-skills-items.md) | E1 lỗi agent nên không ghi gói gửi; người cầm máy cũng bấm trong lúc chạy |
| K1: bot TS dùng điểm kỹ năng (31/10) | Nick thứ hai (hệ Thủy, cấp 3): hai lần đăng nhập chỉ đọc; một lần gửi `c2s/30` với hệ 4 (nhận cây Thủy); rồi `npm run quest -- --once` làm bước "Sử dụng điểm kỹ năng". [12-skills-items](events/12-skills-items.md#c2s-1191) | Một bước, một nhân vật |
| P1: cộng điểm tiềm năng (31/10) | Frida attach vào game đang chạy (manina), chỉ hook writer/reader cho `c2s/10`, `s2c/10`, `s2c/1191` và hàm dựng `d50`, `e52`; ADB mở Bản thân → Chỉ số, bấm "+" rồi "Cộng +1" một lần cho Thân Pháp. [12-skills-items](events/12-skills-items.md#điểm-tiềm-năng) | Một điểm, một chỉ số; Nội Lực suy ra |
| D1: dữ liệu game trên máy (31/10) | Root trên điện thoại: chép `files/dyncache/it0`, `it1`, `itv`, `offline-a2/cam-nang.json` sang `/data/local/tmp` rồi `adb pull` (không dùng `exec-out su -c cat`, vì nó đổi `0a` thành `0d 0a`). [13-drops-items](events/13-drops-items.md#bảng-vật-phẩm) | Chỉ đọc; bảng nay ở `data/items.json` (T3) |
| K2, S2, P2: đồ rơi, nhặt đồ (31/10) | Bot TS đánh một trận Cóc Xanh (K2) và `npm run scan` (S2), cả hai có `CLLT_TRACE`; Frida ghi mọi gói trên máy (P2), ADB giữ cần điều khiển để đi tới đồ trên đất. [13-drops-items](events/13-drops-items.md) | Gói nhặt chưa bắt: đi bộ đụng quái, bàn cờ không nhận lệnh `adb shell input`, thua 1 trận (−39 EXP) |
| C1: Cẩm nang trong game (31/10) | Chụp các trang Chức năng → Cẩm nang (Trận đấu, Cơ bản, Nhân vật, Trang bị, Tính năng, Phúc lợi) | Chữ của game, không phải gói |
| Z1: đổi khu bằng bot TS (31/10) | manina ở M2, không dùng điện thoại: `npm run zone` (chỉ đọc `c2s/1172`), `npm run zone -- --zone=4`, rồi đăng nhập lại kiểm khu. [06-map-mobs](events/06-map-mobs.md#bot-ts-đổi-khu-z1) | Một map, một khu đích; không tốn gì |
| P5: mua và dùng bình trong trận (31/10) | Đăng nhập Tiheo2 trên máy (ADB gõ tài khoản), Frida attach (writer, reader, 114 hàm dựng). Đi tới Lái Buôn bằng cần điều khiển (nhảy lên bục), đổi sang khu 2 vì khu 0 đông người che NPC, mở Dược phẩm, mua thử ô giá Xu (thiếu Xu) rồi ô giá Xu khóa; chạm Sơn Tặc để vào trận, Túi đồ → Hoàn Linh Dược, rồi Đầu hàng. [Mua ở Lái Buôn](events/12-skills-items.md#c2s-1190), [Dùng trong trận](events/12-skills-items.md#c2s-44) | Bàn cờ không nhận ADB nên không đi quân; 1 lần mua, 1 lần dùng |
| K3: nhặt và vứt đồ bằng bot TS (31/10) | Tiheo2 (Ttuananh, hệ Thủy cấp 15, M1), không dùng điện thoại. Đăng nhập chỉ đọc (`npm run bag`, `skills`, `world`); script tạm gửi `c2s/1188` cho món ở xa, cho uuid đã mất, rồi 6 phút thử nhặt mọi món người khác làm rơi ở các mốc 5, 15, 30… s; `c2s/1186 (2, ô)` vứt viên Đá cấp 2 vừa nhặt; đăng nhập lại kiểm túi. Đọc tĩnh `sqbz.run1` (action 2) và `sqlm.g28` → `c2s/47`. [13-drops-items](events/13-drops-items.md#k3), [Vứt bỏ](events/12-skills-items.md#vứt-bỏ) | Một map, một khu; mốc thời gian lệch được ~1 s vì so đồng hồ máy với `hếtHạn` của server |
| P4: mặc, cởi, sửa, dùng vật phẩm và x2 EXP (31/10) | Đăng nhập Tiheo1 trên máy, Frida gắn trước khi đăng nhập (writer, reader, 114 hàm dựng). ADB chạm popup vật phẩm: cởi thú cưng, mặc lại, sửa Chiến Đao (1 búa), Sử dụng Hoàn Linh Dược. Đọc tĩnh `sqbr.g31` để biết nút nào gửi gói nào. Đối chiếu đuôi `s2c/9` của 3 nick. [12-skills-items](events/12-skills-items.md#c2s-1186), [x2 EXP](events/12-skills-items.md#x2-exp) | Chưa thử Vứt bỏ và dùng vật phẩm trong trận; bình máu bị từ chối ngoài trận |
| R3: chạy lại các bot (31/10) | Tắt game trên điện thoại rồi chạy `npm run bag`, `skills`, `world` (manina, Tiheo1, Tiheo2), `npm run quest -- --once --fights=0` (manina trả nhiệm vụ 9; symap dừng ở bước đạt cấp 43), `npm run scan` (manina: M2, M1, M25) và `npm run test:scenario`. [10-quests](events/10-quests.md#chuỗi-nhiệm-vụ-đã-thấy), [02-login](events/02-login.md) | Không đánh trận nào. Tiheo2 lúc đầu báo đang đăng nhập nơi khác |
| P3: nhặt đồ trên máy (31/10) | Đăng nhập Tiheo1 trong game trên điện thoại (ADB gõ tài khoản); Frida attach (writer, reader, 114 hàm dựng); bấm Nhặt ở hòm Xu khóa cạnh nhân vật (M10). [13-drops-items](events/13-drops-items.md#p3) | 1 lần nhặt được; chưa thử nhặt không được hay đứng xa |
| T4, R2: tab Kỹ năng (31/10) | Tìm `skill1/2/4.dat`, `skill*grey.dat` trong `offline-a2` và `assets/x1/skill/tree-skill.dat`, `assets/info/skilltree.dat` trong APK; giải mã, đo 9 khung của ảnh nền; đối chiếu ảnh chụp tab Kỹ năng của E1. Rồi `npm run skills` đăng nhập manina (chỉ đọc) và `npm run items -- --adb --apk` xuất icon. [12-skills-items](events/12-skills-items.md#tab-kỹ-năng) | Cây Thủy và Lôi chưa chụp trên máy (dữ liệu lấy bằng `npm run skills -- --trees`) |
| R1: đọc túi đồ bằng bot TS (31/10) | Tắt game trên điện thoại, rồi `npm run bag`: đăng nhập manina, in đuôi `s2c/9` (8 ô trang bị) và `s2c/42` (túi), ngắt khi vào thế giới. Lần trước nick đang online trên máy nên server trả `s2c/0`. [12-skills-items](events/12-skills-items.md#cách-lấy-túi-đồ) | Chỉ đọc; không gửi gì ngoài các gói đăng nhập |
| T3: giải mã asset (31/10) | Đồ thị JNI của T2 dẫn tới hàm nạp `sqo.b6` (đảo 63 byte đầu) và lớp AES `com.e.sqa`; khoá đọc từ các lệnh `bastore` trong hàm khởi tạo tĩnh. `npm run items -- --adb` chép `it0`, `it1`, `itv`, `offline-a2/i*.dat` (chỉ đọc), giải mã 246/246 icon ra PNG rồi WebP. [13-drops-items](events/13-drops-items.md#giải-mã-asset) | Mới giải mã icon; sprite và hiệu ứng (`.fx`, `.meta`) chưa thử hết |
| T2: đồ thị gọi JNI (31/10) | Đọc tĩnh cả `.text`: GOT từng lớp (`cstrings`, `cclasses`, `cmethods`, `cfields`) từ relocation, theo dõi thanh ghi tới `GetMethodID`/`GetFieldID`/`NewStringUTF`, gắn tên 38.827/39.299 call site `Call*Method`. Tìm ra gói nhặt `c2s/1188`. [13-drops-items](events/13-drops-items.md#c2s-1188) | Tĩnh, theo dõi tuyến tính bỏ qua nhánh; gói nhặt về sau P3 bắt được trên máy |
| T1: hàm dựng gói (31/10) | Disassemble 125 hàm `com.mh.sqlq` có hằng opcode, ghép `GetMethodID` với bảng chuỗi để lấy kiểu từng trường. [c2s-builders](c2s-builders.md) | Tĩnh: thứ tự lệnh ghi, không phải nghĩa của trường |
| S1: quét map bằng bot Node (30/10) | Thử `c2s/11`, `c2s/43` với map khác và từng cổng; `npm run scan` đi qua mọi cổng vào được, ghi [data/maps.json](../../data/maps.json). [06-map-mobs](events/06-map-mobs.md#atlas) | Cấp 19: chỉ M1, M2, M25 |
| F1: công thức và cách quái chọn nước (31/10) | Không đăng nhập. Phát lại 3041 nước của mọi trace bot (Q3–Q20, mA), fit công thức sát thương trên 128 lần dùng kỹ năng và mô hình chọn nước trên 1011 nước của quái; dựng mô phỏng với các số đo đó, đối chiếu với trận thật rồi so các cách chơi. [07-auto-battle](events/07-auto-battle.md#công-thức-sát-thương) | Chỉ có quái cấp 7–13 và manina; `W` theo Tấn công chưa đo; thuật toán v2 mới thử trên mô phỏng |
| A1: đo thuật toán trên máy với Tiheo2 (31/10) | Tiheo2 đăng nhập sẵn trên điện thoại. Agent Frida gọi hàm dựng gói của game; brain Node chạy `BattleRunner` của src/. Nâng 4001, 4000 (3 điểm), mua 4 Kim Đan và 2 Hoàn Linh Dược (720 Xu khóa, chạm ADB trên cửa hàng), đánh 7 trận theo kịch bản (bình, hồi máu, Băng Tiễn cấp 2). Log ở `captures/a1-2026-10-31/`. [07-auto-battle](events/07-auto-battle.md#đo-trên-máy-a1) | Một nhân vật thứ hai, quái cấp 1–10; Hoàn Linh Dược chỉ đo ở một mức HP tối đa |
| A2: chọn hành động v3 trên máy với Tiheo2 (31/10) | Như A1. Brain chạy `BattleRunner` với `bestAction` (kỹ năng 4000 cấp 2, 4001 cấp 1, bình giá 300). Hai lượt, 13 trận: b1 với bản không trừ giá nội lực, b2 với bản cuối. Thắng 13/13, không lệch bàn, gói khớp. Tiheo2 cấp 16 → 18, xong bước "Đánh bại Sơn Tặc". Log và mô phỏng (`sim2.ts`, `run2.ts`) ở `captures/a2-2026-10-31/`. [07-auto-battle](events/07-auto-battle.md#chọn-hành-động) | Quái M1 yếu: HP không xuống dưới 120, nên hồi máu và bình chưa được dùng thật; quái khó chỉ có trên mô phỏng |
| G1: tỉ lệ rơi đồ (31/10) | Đọc lại log 108 trận: 89 trận bot TS (manina, Q3–Q20) và 19 trận qua điện thoại (Tiheo2, A1, A2). Ghép `s2c/1182` với gói kết thúc trận theo thời gian. 59/93 trận thắng có đồ (63%); trận thua không có. Script ở `captures/a2-2026-10-31/drops/`. [13-drops-items](events/13-drops-items.md#tỉ-lệ-rơi) | Mỗi loại quái 7–40 trận; chỉ quái M1, M2 |
| G2: bot tự nhặt đồ (31/10) | Bot TS với manina, M1: `npm run quest -- --farm="Sơn Tặc" --fights=6` có `CLLT_TRACE`. 6/6 trận thắng, 4 trận rơi đồ. Bot nhặt đủ 4/4 món ngay khi trận kết thúc (405 Xu khóa, 1 Áo Âu Lạc); server trả trong 25 ms. [13-drops-items](events/13-drops-items.md#g2) | Chưa thử túi đầy; app Rust chưa nhặt |
| H1: v3 với quái gần cấp mình (31/10) | Bot TS v3 với manina cấp 22 ở M2: `npm run quest -- --farm="Kẻ Quấy Phá" --fights=20 --max-losses=20` có `CLLT_TRACE`, không bình. Thắng 6/20 (30%); đo HP, `W`, kỹ năng hai bên rồi mô phỏng các cách cộng 71 điểm tiềm năng và 15 điểm kỹ năng. [07-auto-battle](events/07-auto-battle.md#quái-mạnh-h1) | Chỉ 1 loại quái; `W` theo Tấn công cao chưa đo |
| X1: số 32 bit của kết quả nước đi (31/10) | Phát lại bàn của G2 và H1, so số đó với CRC32 và nhiều bộ sinh số ngẫu nhiên. Là CRC32 của bàn sau nước đi, 844/844. [05-battle](events/05-battle.md#bàn-chơi) | Viên rơi không đoán trước được |
| I1: túi đồ trên máy (31/10) | Điện thoại với Tiheo2, Frida ghi mọi gói, ADB chạm: bấm Sắp xếp, xem popup đồ, mở hộp Vứt bỏ rồi Hủy. Sắp xếp là `c2s/1257`; không có nút mặc đồ tốt nhất. [12-skills-items](events/12-skills-items.md#sắp-xếp) | Chưa thử túi lộn xộn hơn (chồng cùng loại) |
| R1: ghi trận, hệ của quái (31/10) | Bot TS ghi mỗi trận thành file (`captures/battles`); `npm run battles` đọc lại 20 trace cũ: 134 trận, 119 trận phát lại khớp server ở cả 4921 nước. Byte thứ ba của khối quái trong `s2c/22` là hệ (7 loại quái). [07-auto-battle](events/07-auto-battle.md#ghi-trận) | Chưa chạy thật với ghi trận (bot TS lẫn app) |
| N1: bước Tỷ thí trên máy (31/10) | Đăng nhập `wangpt` trên máy (ADB gõ tài khoản), Frida ghi mọi gói (agent-v3) cùng một agent thay `sqhz.a17` bằng hàm rỗng để đi xuyên quái mà không vào trận (bản đầu gọi lại hàm gốc với một thực thể không phải quái làm game tắt một lần, lúc đó không có trận nào). Cần điều khiển đi tới Võ Quan Đinh Mộc (M2, leo thang lên tầng có Trại Chủ), chạm biểu tượng trên đầu NPC: `c2s/13` → hộp thoại `s2c/57`; bấm Từ chối → `c2s/57` dòng 1 → `s2c/1111`. [Bước Tỷ thí](events/10-quests.md#tỷ-thí) | Không bấm Đồng ý (bàn cờ không nhận ADB, HP 37/184), nên chưa thấy trận tỷ thí |
| N2: Đồng ý của bước Tỷ thí bằng bot TS (31/10) | Sau khi app tỷ thí 3 lần không có trận, bot TS `npm run quest -- --once` với `wangpt` và `CLLT_TRACE` (bản đồ là bản chép, không ghi `data/maps.json`): `c2s/13` → `s2c/57` → `c2s/57 (0, "M2", 141)` → `s2c/1180` (`mob880` Võ Quan Đinh Mộc cấp 20), ba lần. [Bước Tỷ thí](events/10-quests.md#s2c-1180) | Bot lúc đó chưa thách đấu `mob880`, nên chưa có trận |
| N3: thách đấu `mob880` trên máy (31/10) | Đăng nhập `wangpt` trên máy, Frida ghi mọi gói và một agent chỉ theo dõi (hàm dựng `sqlq`, `sqhz.a17`, không thay hàm nào). Chạm NPC → `s2c/57`, ADB bấm Đồng ý → `s2c/1180` → game tự gọi `a17` và gửi `c2s/1181 ("mob880", 0, 141)` → `s2c/22` sau 2,1 s. [Đồng ý → s2c/1180](events/10-quests.md#s2c-1180) | Không ai đánh trận (bàn cờ không nhận ADB); sau 5 phút tắt game giữa trận, không mất EXP |
| N4: bot TS tỷ thí (31/10) | Bot TS có `s2c/1180` → `c2s/1181` chạy `--once` với `wangpt` và `CLLT_TRACE` (bản chép bản đồ, ghi trận vào scratchpad): thắng Võ Quan sau 13 lượt, +168 EXP; `s2c/34` sang bước báo cáo. [Bước Tỷ thí](events/10-quests.md#s2c-1180) | Một trận, thắng; chưa biết thua có mất EXP không |
| N5: bước Trinh sát bằng bot TS (31/10) | App dừng ở "Trinh sát Thành Hồng Giang" với cả wangpt và manina2. Một script TS nhỏ đăng nhập `wangpt` với `CLLT_TRACE` và đọc `s2c/39`. Script gửi `c2s/13 ("M25", 1016)`, rồi `c2s/11` và `c2s/43` như khi qua cổng: vào M4 thì có `s2c/34` sang bước báo cáo. Sau đó `npm run quest -- --once` (bản chép bản đồ) báo cáo với Tướng Quân và xong nhiệm vụ 14. Sau khi port, app Rust làm bước này với manina2 (từ M2, qua M25 vào M4) và xong nhiệm vụ 14. [Bước Trinh sát](events/10-quests.md#trinh-sát) | Một bước; `thamSố` là thứ tự map mới thấy một lần |
| J1: NPC, cửa hàng, nâng cấp (01/11) | Bot TS với symap (cấp 79) nói chuyện với 20 NPC của 6 map và mở từng dòng của hộp thoại, không chọn dòng nào làm thay đổi gì; đặt symap cạnh Pháp sư bằng `c2s/1169`. Trên máy, Frida ghi gói (writer, reader) và thay `sqhz.a17` để đi xuyên quái; mở Nâng cấp [thường], đặt trang bị và đá, bấm Bắt đầu một lần. Bot TS mua 1 Nhẫn Trơn. [14-npc](events/14-npc.md) | Game tắt (SIGSEGV trong bộ dọn rác của ART) sau khoảng 8 phút gắn agent; các dòng có thể đổi đồ ngay chưa mở |
| J2: cửa hàng, nâng cấp, luyện đá (01/11) | Bot TS với symap chạy 4 lượt: mở mọi cửa sổ của Pháp sư hơn 30 lần, đặt trang bị, đá và bùa bằng `c2s/97` rồi đọc giá, tỉ lệ (`s2c/90`, `s2c/92`, `s2c/1260`); mở lại Dược phẩm và menu Đổi lượng. **Không bấm Bắt đầu, không mua, không đổi.** Chép lại `cam-nang.json` từ máy (root). Trên máy chỉ đăng nhập rồi tắt vì đứng dưới bục, chạm bong bóng của Pháp sư không mở. [15-shops](events/15-shops.md), [16-upgrade](events/16-upgrade.md) | Gói Bắt đầu của Luyện đá, Tách đá, Chuyển hoá, kết quả khi thất bại và bùa cần tốn tiền nên chưa đo |
| J3: bấm thật ở Pháp sư, mua bằng Lượng (01/11) | Người dùng đồng ý tiêu. Bot TS với symap: 7 lần Luyện đá (1 bị từ chối), 3 lần Nâng cấp (1 thất bại), 2 lần Tách đá (lần đầu túi đầy), 1 Chuyển hoá, mua 2 món bằng Lượng, đổi 50 Lượng lấy Xu khóa; đọc công thức Chế tạo trang bị. Sau mỗi lần xin lại túi bằng `c2s/42`. Túi đầy lúc đầu nên ghi được cả lời từ chối. [16-upgrade](events/16-upgrade.md#j3), [15-shops](events/15-shops.md#lượng) | Tiêu 2 Xu, 87 Lượng, 1.800 Xu khóa, nhận 55.000 Xu khóa. Chưa thấy lần luyện đá thất bại; bùa và nâng từ +2 chưa đo |
| G1: mã quà tặng (01/11) | Người dùng đưa 3 mã và nhờ thử. Bot TS và `cllt goto` đưa Tiheo2 (Ttuananh) từ M4 về M1 rồi đặt cạnh Hương Lão bằng `c2s/1169`; trên điện thoại (Frida ghi gói) mở Mã quà tặng và thử 7 trường hợp: 3 mã đúng, mã đã dùng, ô trống, mã sai, mã có dấu cách. Rồi mở Hòm thư, xem 4 thư, Nhận từng thư, Nhận hết, Xóa một thư đã nhận. Với manina2 (người dùng đưa thêm): nhập lại 3 mã, Nhận hết, Xóa hết. Sau đó Tiheo2: bot TS gửi thẳng một mã sai (không qua NPC), `cllt smith --merge=5` gộp đá cho túi trống (209 Xu khóa, 42 → 18 ô), rồi trên điện thoại Nhận một thư có vật phẩm, Nhận hết hai thư còn lại, Nhận hết khi không còn quà. Cuối cùng (người dùng đồng ý cho Tiheo2 bị khoá nhập mã) nhập 10 mã sai liền để xem lúc bị chặn, và thử lại DENBU sau 3 và 6 phút. [Mã quà tặng](events/14-npc.md#mã-quà-tặng), [Hòm thư](events/14-npc.md#hòm-thư) | Không có chỗ nào báo số lần sai. 10 lần sai liền thì server chặn mọi mã 5 phút ("Bạn nhập mã quá nhanh…"), khớp Cẩm nang; dòng "quá 5 lần thì 24h" của cửa sổ là sai. Đếm theo lần đăng nhập hay bị mã đã dùng làm về 0 thì chưa rõ. manina2 chỉ nhận được thư chỉ có tiền (+5 triệu Xu, +5 triệu Xu khóa, +10.000 Lượng) vì túi đầy 42/42, rồi Xóa hết xoá cả 3 thư quà chưa nhận: mất quà. Tiheo2 nhận đủ 4 thư |
| G1: menu Hương Lão (01/11) | Người dùng nhờ điều tra Đổi lượng, Nhiệm vụ hàng ngày, Điểm năng động. Trên điện thoại (Tiheo2, Frida ghi gói): Điểm năng động → Đổi Xu khi chưa đủ điểm, rồi Đóng; Nhiệm vụ hàng ngày → Nhận, Hủy, Nhận lại; Đổi lượng dòng 0 một lần (−50 Lượng, +50.000 Xu). Gói ở `captures/g1-2026-11-01/huong-lao.jsonl`. [Hương Lão](events/14-npc.md#hương-lão) | `s2c/1195` là nhiệm vụ ngày (không phải cờ). Dòng Đóng của Điểm năng động làm client kẹt "Vui lòng chờ..." vì server không trả gì. Chưa đánh trận nên chưa đo Hoàn thành nhiệm vụ. Ở manina2, dòng 0 Đổi lượng chạy ngoài ý muốn trước khi gắn Frida (−50 Lượng) |
| O1: Pháp sư (01/11) | Người dùng nhờ thử hết tính năng của Pháp sư, chỉ cần gói. Bot TS với Tiheo2 (`captures/o1-2026-11-01/probe.ts`, bản chép client chịu được `s2c/0`) và điện thoại có Frida: chế Nhẫn Bậc I, thử Bậc II, III; nâng một nhẫn từ +0 tới +7 (thất bại tụt cấp, có bùa); thử đặt đồ đang mặc; Đổi Băng Tâm. [16-upgrade](events/16-upgrade.md#o1) | `c2s/97` có trường loại: 1 cho bùa và nguyên liệu Chế tạo (bắt trên máy). Chế tạo cần cấp nhân vật bằng bậc. Chưa đo: luyện đá thất bại, Chế Băng Kiếm, Chế tạo cánh (thiếu nguyên liệu). Một lần đổi lượng thừa ở Tiheo2 khi chuyển phiên máy → bot ([14-npc](events/14-npc.md#điểm-năng-động)) |
| B6: đánh boss thật (01/11) | Người dùng hỏi có dịch chuyển tới boss và đánh được không, nhờ thử với tiheo1 (mật khẩu chỉ qua biến môi trường). Bot TS (`captures/b6-2026-11-01/probe.ts`, QuestBot `--farm`) với symap cấp 79 đánh Thủ Lĩnh Sơn Tặc ở M1 khu 0 hai trận: trận 1 từ chỗ đang đứng, trận 2 sau một `c2s/1169` lên ô của boss. [Đánh boss](events/06-map-mobs.md#đánh-boss) | Cả hai cách đều mở trận sau 2,2–2,6 s. HP boss dùng chung (74/5000 lúc vào trận 1); hạ boss thì 13 s sau boss hiện lại ở ô khác, đầy HP. 0 EXP, 0 Xu vì symap hơn boss 68 cấp. Không tốn tiền |
| B8: bước "Đánh bại Tướng Thiết Kích" (02/11) | symap (Tiheo1) chạy Tự làm nhiệm vụ trên app 0.9.0 và kẹt ở bước 4 của nhiệm vụ 28, "Server không mở trận … sau 8 s". Đọc nhật ký và báo lỗi (`faults`, 150 gói) trong `cllt.db` của app: bot gửi `c2s/15` cho boss `mob101100007`. Sửa bot TS để thách đấu bằng `c2s/1178`, rồi chạy `npm run quest -- --once` với symap (cấp 86, M8): 6 trận thắng, mỗi trận hạ boss 80.000 HP; `s2c/34` chỉ đến sau trận đầu, không có `s2c/1201`. Sửa cả hai bot để `s2c/34` kết thúc bước diệt quái. [10-quests](events/10-quests.md#đánh-bại-boss) | Người dùng ngắt sau trận 7 (trận đang dở). Bước 5 (Báo cáo với Tướng Quân Lê Viễn) có hiện ở `s2c/39` lần đăng nhập sau không thì chưa xem |
| S3: quét map ở cấp 79 (01/11) | Người dùng nhờ quét thêm boss và quái mới với symap cấp 79 (tiheo1): `npm run scan` (CLLT_TRACE). [Bản đồ đã quét](events/06-map-mobs.md#atlas) | Vẫn 6 map: ba cổng khoá theo nhiệm vụ (Bạch Nham, Phong Nguyên, Tiên Cốc), Tam Khê cần cấp 80; không có quái, boss mới |
| CT1: Chợ trời của Ngọc Nga (01/11) | Người dùng nhờ học Ngọc Nga, chỉ bắt gói; cho mua món rẻ nhất, dọn túi và thử đăng bán. Tiheo2 bị người khác dùng nên đổi sang manina2. Bot TS (`captures/ct1-2026-11-01/probe.ts`, `scan.ts`, `CLLT_TRACE`) mở ba dòng của Ngọc Nga và đọc 33 trang của 9 mục (592 món); `npm run smith -- --merge --confirm` gộp đá 8 lần (708 Xu khóa) để túi có chỗ. Điện thoại có Frida (writer, reader): mở cửa sổ, đổi mục, lật trang, Làm mới, xem chi tiết, Mua Slime 1.000 Xu (lần đầu túi đầy bị từ chối, lần hai được), đăng bán lại giá 1.000.000 Xu (phí 1.000), Đang bán, Thu hồi, nút Chợ trời của thanh công cụ. Game tự tắt sau ~7 phút gắn Frida lần đầu; sau đó bỏ đọc payload các gói vị trí. [Ngọc Nga](events/14-npc.md#ngọc-nga) | Chưa đo Gia hạn, món bán được, món hết hạn |
| CH1: chat bằng nút bong bóng (01/11) | Người dùng nhờ thử nút chat góc trên bên phải. Điện thoại (manina2, Hồng Giang khu 0), agent Frida ghi hàm gửi và hàm đọc gói như G1, thêm một script ghi lời gọi 177 hàm dựng gói. Mở hộp Chat, gõ "chao moi nguoi" bằng adb; người dùng bấm OK một lần, adb chạm OK một lần, quay màn hình lúc gửi. Gói ở `captures/ch1-2026-11-01/`. [Nói trong khu](events/09-players-chat.md#c2s-1174) | Nút bong bóng là nói trong khu (`c2s/1174`), không phải chat Thế giới. Chưa thử chữ có dấu (adb không gõ được), chưa thấy tin của người khác, chưa đo giới hạn tốc độ |
| F2: công thức sát thương theo chỉ số (01/11) | Người dùng nhờ dựng công thức từ dữ liệu trận mới, chỉ tính trên máy, không đụng game. Đọc 1033 trận đã ghi (`npm run battles -- --export`, 847 trận app v3 của Ttuananh, manina, wangpt) bằng các script Python ở `captures/f2-2026-11-01/`; mô phỏng v2 chuyển sang `captures/f2-2026-11-01/sim/` (`model.ts`, `calib.ts`, `plan.ts`). [W theo chỉ số](events/07-auto-battle.md#công-thức-theo-chỉ-số), [chỉ số theo tiềm năng](events/12-skills-items.md#chỉ-số-theo-tiềm-năng), [cộng điểm](events/07-auto-battle.md#cộng-điểm) | Nguyên nhân của đòn cao hơn 2–3% chưa rõ; Né tránh, Chính xác của quái là số khớp, chưa đo trực tiếp; mất EXP khi thua không có trong bản ghi trận |

Giá trị HP, khu vực, danh sách thực thể và key có thể khác giữa các phiên. Nhãn field và nhãn event trong tài liệu là diễn giải, trừ khi đã chỉ rõ chữ ký/field thực của binary. Raw trace/script tạm đã xoá sau khi ghi lại các quan sát cần thiết.

## Công cụ thực sự đã dùng

| Công cụ | Mục đích / kết quả |
|---|---|
| unzip, SHA-256, aapt2 | Inventory, nhận diện artifact, đọc manifest binary |
| JDK 17 + JADX CLI 1.5.5 | Khôi phục Java signatures/fields; tạo 2283 file Java, báo một lỗi decompile |
| llvm-nm / llvm-objdump qua xcrun | Tìm export, disassemble ELF arm64 và các routine writer/reader/key/proof |
| ADB 35.0.2 | Chạy app, xem UID/TCP, chụp UI, điều khiển thao tác và kiểm tra package |
| Frida 17.23.3 + Java bridge | Hook syscall/native/JNI để so wire với packet và giá trị getter |
| REA và skill Android RE | Định hướng điều tra, kiểm tra thiết bị/artifact; provider Ghidra/Hopper và JADX MCP không sẵn có nên không dùng chúng để khẳng định đã decompile native |

Fingerprint script gặp cú pháp Bash mới không tương thích Bash 3 của macOS; quét HTTP gặp lỗi awk. Đã dùng công cụ sẵn có và `rg` thay thế. Các lỗi công cụ không phải lỗi app. Không có kết quả pseudocode Ghidra được xác minh trong đợt này.

## 1. Bắt đầu từ artifact, không đoán theo tên APK

Các lệnh đọc lại trên máy có bộ công cụ tương ứng:

```bash
shasum -a 256 colauloanthe.1.0.3.apk
unzip -l colauloanthe.1.0.3.apk
aapt2 dump badging colauloanthe.1.0.3.apk
aapt2 dump xmltree colauloanthe.1.0.3.apk --file AndroidManifest.xml
```

Ghi package, launcher, ABI, version manifest và hash của DEX/native. Đối chiếu chuỗi version UI với trường thực sự được gửi trên socket, không đồng nhất các version đó.

## 2. Lần từ launcher tới mạng

```bash
mkdir -p captures/research
unzip -p colauloanthe.1.0.3.apk classes.dex > captures/research/classes.dex
unzip -p colauloanthe.1.0.3.apk lib/arm64-v8a/libgdx-flashds.so > captures/research/libgdx-flashds.so
jadx --no-res -d captures/research/java captures/research/classes.dex
rg -n 'Socket|DataOutputStream|InputStream|socket-reader|native' captures/research/java/com/mh
xcrun llvm-nm -D --defined-only captures/research/libgdx-flashds.so
```

Launcher tạo MyGame2D. Từ chữ ký Socket/stream lần tới sqfa, sqje, sqnw và sqi. Lời gọi Loader/Hidden0 cùng export `__ngen_com_mh_*` nối lớp Java với native. JADX đổi tên field trùng thành f3140a…; field runtime vẫn là a,b,c,d, phải xác minh bằng reflection/JNI.

Ví dụ symbol writer đã dùng trong bản này:

```text
_ZN10native_jvm7classes22__ngen_com_mh_sqje_22416__ngen_native_a2EP7JNIEnv_P8_jobjectS5_
```

```bash
xcrun llvm-objdump -d --no-show-raw-insn --disassemble-symbols=_ZN10native_jvm7classes22__ngen_com_mh_sqje_22416__ngen_native_a2EP7JNIEnv_P8_jobjectS5_ captures/research/libgdx-flashds.so
```

Assembly được dùng để chọn điểm hook và kiểm tra thứ tự phép tính. Các bảng cmethods/cfields của native được đối chiếu với chữ ký Java/JNI; một lệnh XOR trong assembly đơn lẻ không chứng minh đầy đủ thuật toán.

## 3. Xác nhận endpoint và hành động UI

```bash
adb -s 192.168.2.3:5555 shell dumpsys package com.lotasoft.colauloanthe
adb -s 192.168.2.3:5555 shell cat /proc/net/tcp /proc/net/tcp6
adb -s 192.168.2.3:5555 exec-out screencap -p > captures/research/screen.png
```

Lọc socket theo UID app 10315 trong lần đo, ghép với peer từ getpeername(fd). Cổng 0698 hex là 1688; dạng IPv4-mapped trong tcp6 cũng phải xử lý đúng. Bảng TCP cho endpoint/state, không cho schema packet.

Tại màn login đã có socket ESTABLISHED và ping. Bấm Đăng nhập không tạo socket game mới; packet đi trên socket cũ. UI sau đăng nhập hiển thị nhân vật trong Làng Thanh Khê, là bằng chứng khác với việc chỉ thấy TCP connect thành công.

## 4. Thu wire và packet ở hai tầng

| Điểm quan sát | Thu gì | Đối chiếu được gì |
|---|---|---|
| libc sendto/recvfrom/read/write + getpeername | Buffer thật của socket cổng 1688, fd, chiều, số byte syscall trả về | Seed, header, ciphertext; phải ghép stream chứ không coi mỗi syscall là một packet |
| sqje.a(sqi), tại entry native | Opcode và payload trước serialize/XOR | Request nào do hành động nào tạo ra |
| sqnw.e(), tại return native | sqi đã được reader tạo, trước dispatcher | Opcode và payload sau giải XOR |
| sqi getter/writer | Kiểu, cursor/độ dài trước lời gọi và giá trị | Field offset và độ dài; phân biệt string với int32 raw |
| sqnw handler e(sqi) trao đổi key | Static sqlq.q/r/s sau setup | Key thật của phiên, counter receive/send |

JNI writer nhận env ở đối số 0, self ở 1, packet ở 2; reader e() trả packet. Packet runtime: a=opcode, b=byte[], c=read cursor, d=used length. Đọc b bằng GetByteArrayRegion hoặc java.lang.reflect.Array, chỉ lấy d byte.

Iterate Java array sai qua bridge từng cho dữ liệu zero/rỗng. Kết quả đó không chứng minh app “giải mã lười”. Phải kiểm tra cách truy cập array trước khi diễn giải byte.

Các marker native của bản đã phân tích:

```text
writer:      __ngen_com_mh_sqje_22416__ngen_native_a2E
reader:      __ngen_com_mh_sqnw_39916__ngen_native_e6E
key setup:   __ngen_com_mh_sqnw_39917__ngen_native_e10E
read int32:  __ngen_com_mh_n_sqi_51816__ngen_native_c7E
read string: __ngen_com_mh_n_sqi_51817__ngen_native_f10E
```

Marker/index có thể đổi ở build sau. Hook module-load chỉ chọn và gắn điểm quan sát; gọi lại JNI sâu ngay trong callback linker từng làm app abort. Việc lấy Java state được hoãn tới khi runtime/classloader sẵn sàng. Bridge phải tương thích Frida; lỗi bridge/hook không được quy thành protocol lỗi.

## 5. Từ byte tới framing, key và serializer

1. So wire send với opcode/payload tại writer: tìm prefix độ dài, byte loại, tag PT01 và vị trí encoded opcode.
2. So wire receive với packet tại return reader: xác định header 14 byte, tổng length ở offset 2, body bắt đầu 14.
3. Lấy gói -1 chưa XOR, so masked key với sqlq.q sau handler: xác minh cumulative XOR, key length 16.
4. Cho hàm XOR native xử lý chuỗi byte giả với key/counter biết trước; so từng byte, kể cả wrap. Đối chiếu bằng nhiều frame thật liên tiếp để chứng minh counter không reset theo packet.
5. Gọi sqq.a/b với opcode giả, giữ cặp inverse hợp lệ. Không gán trực tiếp encoded int thành opcode nghiệp vụ.
6. Gọi writer sqi với int/string/array giả, đọc buffer: c(int) là int32BE, b(int) chỉ là một byte, string/array có length int32BE.

Ví dụ A2 nhận: opcode 3, len 8, hex `00000004100c0001`. Getter c7 tại offset 0 trả 4, g11 cùng offset trả bytes `100c0001`. c7 là lời gọi lồng để đọc length, không phải một field bổ sung.

## 6. Xác minh proof, hash và dữ liệu nhân vật

Hàm sqni.a(byte[],String) được gọi bằng password/challenge giả. Challenge `100c0001` với password giả `abc` trả `030c000111111111111111111111111111707372`. Đây là XOR/padding riêng, không phải AES. Cách làm tổng quát:

```text
p = UTF8(password)
start = signedByte(challenge[0]) + 1
out = array(max(challenge.length, start + p.length), fill=0x11)
copy challenge vào đầu out
out[start+i] = out[start+i] XOR p[i]
out[0] = p.length AND 0xff
```

Builder credential trên service giả được chặn trước hàng đợi mạng. Nó xác nhận thứ tự username/proof/platform/version/serverId/hash, không xác nhận gửi mạng hay login thành công. Đối tượng chưa có hàng đợi có exception sau điểm thu; không lấy exception đó làm bằng chứng protocol bị sai.

Hash cuối username là int32: bắt đầu 17, lặp UTF-16 code unit `h=31*h+unit` có tràn số. Vector giả probe_user cho c65b09cb. So nhiều lần để loại giả thuyết nonce theo phiên.

Ở response 9, getter native xác nhận prefix tới cấp/HP; đối chiếu UI cấp 3, HP 120/130 trong capture cũ. Response 11 cho string M1/Làng Thanh Khê, khu vực, các số và bytearray 3588 byte; `23*156=3588` hỗ trợ suy luận lưới ô, không xác minh mọi field sau đó.

## 7. Phân biệt kết quả với giới hạn

- Kích thước 64 byte hoặc mẫu lặp 16 byte không đủ chứng minh AES. Socket đã xác minh XOR riêng; asset nằm ngoài kết luận này.
- Hook dispatch cấp hai a(int,sqi) từng cho số khác opcode của packet; dùng reader/writer gốc khi dựng bảng giao thức.
- ACK 4 rỗng là nhánh thành công đã đo; không suy mọi packet lạ thành sai password.
- Gói 0 có flag ff và string thông báo account đang online nơi khác, quan sát từ V1; không phải timeout và không được gán là sai mật khẩu.
- Dữ liệu kỹ năng, cấu hình, entity snapshot mới giải prefix; các trường chưa hiểu giữ opaque.
- Các con số/capture timestamp ở đây thuộc phiên đã đo; không dùng key, HP hay vị trí cũ như hằng của game.
