# Hướng dẫn dùng app

Từng phần của app desktop và việc bot làm: giao diện, túi đồ, kỹ năng, đổi khu và map, cửa hàng, Tự sửa đồ, Tự nhặt đồ, nhật ký và thống kê, proxy, đánh quái, Tự làm nhiệm vụ. Cách chạy app ở [App Rust](README.md#chạy).

## Giao diện

Style **Pixel RPG** (kiểu "Pixel Art" của skill `ui-ux-pro-max`), chọn từ 4 mockup (Sơn mài, Giấy dó, Tối giản, Pixel RPG):
- **Màu:** bảng màu dịu, độ bão hoà 30–55 %, nền `#16181D`. Mỗi con số có một màu riêng: HP đỏ, EXP xanh dương, xu vàng, điểm tiềm năng xanh lá. Nút chính màu vàng chữ tối. Mọi cặp chữ/nền đạt tương phản từ 4,5:1 trở lên.
- **Khối:** viền 2–3 px cắt góc theo pixel (`clip-path`), bóng đổ bậc ở góc dưới phải, không bo tròn, không gradient. Thanh HP/EXP chia đốt 6 px. Hiệu ứng nhảy theo bước (`steps()`), tắt khi hệ thống bật giảm chuyển động.
- **Cỡ:** chữ thường 13 px, chú thích 11 px, nhãn viết hoa 10 px; nút cao 32 px (nút nhỏ 26 px); thanh bên rộng 252 px.
- **Font:** Silkscreen (chữ pixel) chỉ cho số và nhãn ASCII (`LV 21`, `14/15`, giờ trong nhật ký), vì nó không có dấu tiếng Việt. Mọi chữ còn lại dùng Be Vietnam Pro. Cả hai đóng gói trong app, CSP không cho tải font ngoài.
- **Icon:** SVG nét 2 px, không dùng emoji.
- **Cách viết:** màu, khung và font chỉ khai báo trong `src/styles/tokens.css` (`--notch`, `--bevel`, `--font-pixel`…); component dùng biến CSS, không ghi mã màu rời. Thành phần bị cắt góc vẽ viền focus vào trong (`outline-offset` âm), vì `clip-path` che mất viền vẽ ra ngoài.
- **Bàn phím, trình đọc màn hình:** không lồng control trong control. Trên thẻ nick, tên nick là nút chọn (kèm mô tả vị trí và trạng thái), nút đăng nhập/thoát nằm cạnh; bấm chuột vào chỗ khác trên thẻ cũng chọn. Tab Nhiệm vụ / Đánh quái theo mẫu tabs của WAI-ARIA: `tabpanel` có `aria-labelledby`, mũi tên trái phải, Home, End để đổi tab. Ô số (số trận, số trận thua, số lượng mua, tỉ lệ Tự cộng) gõ được: chỉ nhận chữ số, số ngoài giới hạn được kéo về khi rời ô, ↑ ↓ tăng giảm 1, Enter không gửi form.

| Vùng | Nội dung |
|---|---|
| Thanh bên | Logo, số nick và số nick đang trong game, "Thêm nick". Mỗi nick là một thẻ: avatar màu theo tên và chấm trạng thái, tên, cấp, map và khu (hoặc lời báo lỗi), chip trạng thái, thanh HP, số người trong khu, nút đăng nhập/thoát riêng. **Chuột phải** (hoặc phím Menu, Shift+F10) mở menu của nick: Đăng nhập, Đăng xuất hoặc Huỷ đăng nhập tuỳ trạng thái; Sửa nick; Xoá nick (chỉ khi đã thoát, có hỏi lại). Dưới cùng: "Đăng nhập tất cả", thoát tất cả |
| Thẻ nhân vật | Tên, cấp, trạng thái (Ngoại tuyến / Đang kết nối / Trực tuyến / Đang đánh / Làm nhiệm vụ / Lỗi), giờ vào game. **Vị trí**: tên map, mã map, khu, x/y; nút icon ⇄ **Đổi khu / map** đứng trước tên map (xem [Đổi khu và đổi map](#đổi-khu-và-đổi-map)); trong lúc đổi, dòng mã map thay bằng "Sang khu 4…" hay "Đi tới Làng Thanh Khê…". Tiền nằm ở ô Tiền bên dưới, số người trong khu ở thẻ Xung quanh. Luôn một hàng, kể cả cửa sổ hẹp. Nút Đăng nhập/Đăng xuất, Xoá nick (có hỏi lại) |
| 2 ô | **HP và EXP** chung một ô, ngăn bằng vạch đứt: HP, kinh nghiệm (EXP / mốc cấp, %, còn bao nhiêu lên cấp). **Tiền**: **Vàng** / 10.000 có thanh (vàng ăn trong trận, `coin` của `s2c/9` và `s2c/10` kiểu 4; đủ 10.000 thì game tự đổi thành Xu khoá, ghi ở góc ô; trước đây ghi nhầm là "Xu"), rồi Xu, Xu khoá, Lượng (`s2c/46`); rê chuột lên từng loại thì hiện nó dùng vào việc gì. Số tiền lớn ở cửa sổ hẹp thì xuống dòng chứ không bị cắt |
| Chỉ số | Tấn công, Phòng thủ, Chính xác, Né tránh, Chí mạng; số điểm tiềm năng chưa cộng ("68 điểm"), 4 tiềm năng Cường lực, Thân pháp, Nội lực, Thể lực (thứ tự đo ở P1, [user-data](../../app/user-data.md#đuôi-s2c9)), mỗi tiềm năng có nút **+** cộng 1 điểm (`c2s/10 (chỉ số, 1)` như nút "Cộng +1" của game; khoá khi đang đánh hay hết điểm); nút bánh răng bên phải chữ Tiềm năng mở hộp **Tự cộng** (Tắt / Theo hệ / Tỉ lệ; Theo hệ ghi rõ Hỏa → Cường lực, Thủy → Nội lực, Lôi → Thân pháp), sáng màu xanh lá khi đang bật; rê chuột lên nút thì thấy cách đang cộng, xem [Tự cộng điểm tiềm năng](#tự-cộng-điểm-tiềm-năng). Điểm kỹ năng nằm ở tab Kỹ năng |
| Xung quanh | Người chơi khác trong khu, cấp cao xếp trước. Cấp cao hơn mình tô đỏ, bằng tô vàng, thấp hơn tô xanh. Số ở góc là số người khác (rê chuột: số người trong khu, tính cả mình). Khi `s2c/1263` có bản ghi người chơi chưa đọc được, số người hiện `?` thay vì một con số sai |
| Tab Nhiệm vụ | Tên và số nhiệm vụ chính, bước đang làm trên tổng số bước. Từng bước: xong (ô xanh có dấu tích, số con đủ như 15/15), đang làm (ô vàng, viền vàng, thanh tiến độ khi bước cần nhiều con hoặc nhiều sát thương), chưa làm (ô trống). Cuối dòng của mỗi bước chưa xong có nút ▶: vàng ở bước đang làm, mờ ở các bước sau vì server chỉ tính bước đang làm. Khi bước đang chạy, ▶ của nó thành ■ để dừng. Dòng việc bot đang làm, thắng/thua, EXP/xu, số nhiệm vụ đã xong và tổng thời gian (đồng hồ chạy theo giây, đứng lại khi xong); lý do dừng khi đã dừng. Khi đang có trận (của bước nhiệm vụ như "Đánh bại Kẻ Gây Rối", của việc đánh quái, hay trận đánh nốt sau Dừng), cả hai tab đều có khung máu Bạn VS quái, mở bằng **Chi tiết ⌄** ở cuối dòng tổng kết (hay ở dòng "Đang đánh …" khi tab không có việc của trận đó). Đóng hay mở là chung cho hai tab và được nhớ lại lần sau. Tự làm nhiệm vụ, Dừng, số trận thua cho phép (dùng cho cả ▶). Cảnh báo cộng điểm tiềm năng chỉ hiện khi nhiệm vụ còn bước đó. Danh sách bước tự cuộn tới bước đang làm khi cửa sổ thấp |
| Tab Túi đồ | Bên trái 8 ô trang bị quanh nhân vật (tên, cấp, hệ), xếp như bảng Bản thân: Nón, Áo, ô 6, Danh hiệu ở cột trái; Vũ khí, Nhẫn, Cánh, Thú cưng ở cột phải. Bên phải túi đồ theo đúng số ô (42), mỗi món ở đúng ô của nó. Mỗi ô có icon thật, số lượng ở góc (món xếp chồng), dấu hệ (lửa Hỏa, sét Lôi, giọt nước Thủy), thanh độ bền dưới ô trang bị, tô đỏ khi hỏng. Rê chuột, đưa focus hay bấm vào món thì dải dưới cùng hiện: tên, hệ, "đúng hệ: +5% chỉ số" khi trùng hệ nhân vật, loại, cấp mặc, nơi để, độ bền (đỏ và "cần 1 Búa sửa chữa" khi hỏng), chỉ số, mô tả. Món đã bấm chọn có nút như popup của game: **Mặc** (trang bị trong túi), **Dùng** (vật phẩm dùng được), **Cởi ra** và **Sửa** (đồ đang mặc). Dùng và Sửa hỏi lại một lần vì làm mất vật phẩm hay búa. Nút nào bot sẽ từ chối thì mờ đi, kèm lý do ("bình chỉ dùng được trong trận", "cần 1 Búa sửa chữa trong túi", "túi đồ đã đầy", "đang đánh"). Không có Vứt bỏ. Góc thẻ có nút **Cửa hàng**; khi Sửa thiếu búa, cạnh nút Sửa có **Mua búa**, mở Cửa hàng với Búa Sửa Chữa chọn sẵn ([Cửa hàng](#cửa-hàng)). Xem [Túi đồ và trang bị](#túi-đồ-và-trang-bị) |
| Cửa hàng | Hộp "Cửa hàng Lái Buôn" (Dược phẩm), mở từ tab Túi đồ. Dòng đầu là số Xu và Xu khóa đang có. Nhân vật không ở Làng Thanh Khê thì hộp nói vậy và có nút **Đi tới Làng Thanh Khê** (Đổi map). Ở M1 thì mỗi lần mở hộp, app mở lại cửa hàng với server (danh sách cũ hiện trong lúc chờ), có nút Mở lại. 8 món, mỗi món có icon, tên, công dụng, giá; giá Xu khóa tô vàng. Chọn một món, chỉnh số lượng (1–99) và xem tổng tiền; thiếu tiền thì tổng đỏ kèm "thiếu N", nút **Mua** khoá. Mua búa chọn sẵn dòng Xu khóa nếu đủ tiền, không thì dòng Xu. Kết quả ("Đã mua 1 Búa Sửa Chữa (80 Xu khóa)" hay lý do không mua được) hiện ngay trong hộp, lấy từ Nhật ký; túi đồ và tiền tự đổi theo `s2c/42`, `s2c/46` |
| Tab Kỹ năng | Như Bản thân → Kỹ năng của game: cây 9 kỹ năng của hệ trên đúng ảnh nền của game, icon màu khi đã học, xám khi chưa học, cấp ở góc, dấu **+** xanh khi nâng được ngay. Cây tự thu nhỏ cho vừa thẻ. Bấm một ô thì bảng bên phải hiện cấp hiện tại và cấp kế (mô tả, nội lực theo thành), điều kiện để học (đủ thì xanh, thiếu thì đỏ, kèm số đang có) và nút **Nâng cấp** (`c2s/1191`, mỗi lần 1 cấp). Nút khoá khi chưa đủ điều kiện, khi đang đánh hay khi lần nâng trước chưa có trả lời, và ghi lý do. Lúc mở tab, ô được chọn là kỹ năng đầu tiên nâng được. Xem [Kỹ năng](#kỹ-năng) |
| Tab Đánh quái | Quái và boss của khu, boss xếp trước, có huy hiệu BOSS; số trận (gõ số vào ô, hoặc − +, 1–999); số trận thua cho phép (từ 1, không giới hạn trên, gõ được như số trận; cũng ở tab Nhiệm vụ); ô số rộng ra theo số chữ số; Bắt đầu, Dừng; tiến độ, thắng/thua, EXP/xu đã nhận, tổng thời gian; HP hai bên trong trận dưới **Chi tiết ⌄**, như tab Nhiệm vụ |
| Tab Cài đặt | Thẻ **Cài đặt đánh**: việc bot tự làm giữa các trận khi tự đánh quái và tự làm nhiệm vụ, lưu theo nick trong `accounts.json`. Mục đầu là **Tự sửa đồ** trên một hàng: ô tích, tên, dấu **?** (rê chuột hay Tab tới thì hiện lời giải thích), số Búa Sửa Chữa trong túi và món đang mặc bị hỏng ("Đang hỏng: Rìu Âu Lạc 0/60"), Bật/Tắt; hết búa thì có nút **Mua búa** mở Cửa hàng (bot không tự mua). Thẻ hẹp thì phần búa xuống dòng dưới. Mục thứ hai là **Tự nhặt đồ**, **mặc định bật**, cũng có dấu ?. Chưa đăng nhập thì chỉ có ô tích, vẫn bật tắt được, có hiệu lực từ lần đăng nhập sau. Mỗi nick một cài đặt riêng. Xem [Tự nhặt đồ](#tự-nhặt-đồ) Xem [Tự sửa đồ](#tự-sửa-đồ) |
| Nhật ký | Từng trận, từng bước nhiệm vụ và thông báo server theo giờ: thắng và trả nhiệm vụ xanh, thua/lỗi đỏ, bắt đầu/kết thúc/nhận nhiệm vụ vàng; giữ 500 dòng mỗi nick trong bộ nhớ, mọi dòng vào `cllt.db` (xem [Nhật ký và thống kê](#nhật-ký-và-thống-kê)). Mỗi dòng có giờ (ngày khác thì thêm ngày/tháng), **loại** (Kết nối, Trận, Nhiệm vụ…, mỗi loại một màu) và nội dung. Hàng chip trên cùng lọc theo loại (chọn được nhiều, không chọn là tất cả) và **Chỉ lỗi**; **Xem dòng cũ hơn** lấy tiếp 200 dòng cũ hơn của bộ lọc từ `cllt.db`. Mở lại app thì 200 dòng cuối của các phiên trước hiện lại. Nút **Xoá màn hình** ở góc phải chỉ ẩn các dòng đang hiện của nick đó, không xoá gì: nhật ký trong bộ nhớ và `cllt.db` vẫn giữ nguyên, dòng mới vẫn hiện tiếp bên dưới. Dòng **Đã xoá N dòng khỏi màn hình · Hiện lại** ở trên cùng đưa các dòng đó trở lại. Đổi sang nick khác rồi quay lại vẫn còn ẩn; mở lại app thì hiện lại hết. **Trạng thái trận:** dưới dòng mở trận ("Trận N: thách đấu…", hay dòng báo trận của thách đấu trước mới mở) có một dòng thay theo từng nước của trận: số nước (tính cả hai bên), ai đi, các viên đã ăn (kiếm, tim, âm dương, đào, giọt nước, sao, vàng), sát thương gây cho bên kia, máu hồi, nội lực và sức mạnh tăng giảm, thêm lượt; bên phải là thanh máu và máu/tối đa của mình (xanh) và của quái (đỏ, `?` tới khi một nước cho thấy máu quái). Chấm nhấp nháy khi trận đang đánh; hết trận thì dòng giữ nước cuối. Lấy từ `s2c/19`, `s2c/20`, `s2c/21` ([05-battle](../../app/events/05-battle.md)) |
| Tab Thống kê | Lịch sử trận của nick theo **username**, từ `cllt.db`: chọn Hôm nay / 7 ngày / 30 ngày / Tất cả (90 ngày gần nhất, xem [Nhật ký và thống kê](#nhật-ký-và-thống-kê)) và Mọi trận / Đánh quái / Nhiệm vụ. Sáu ô: số trận (thắng, thua, rời), tỉ lệ thắng, EXP và Xu (cả trung bình mỗi trận), thời gian trong trận, EXP mỗi giờ. Bảng theo từng quái và map: số trận, thắng, tỉ lệ thắng, lượt và thời gian trung bình, EXP mỗi trận. Danh sách trận gần nhất (giờ, quái, map và khu, kết quả, số lượt, thời gian, EXP, xu), **Xem thêm** lấy tiếp 30 trận. Tự hỏi lại khi một trận của nick kết thúc |
| Cập nhật | Ở thanh bên, ngay trên "Đăng nhập tất cả". Bình thường là một dòng nhỏ: phiên bản đang chạy (`v0.2.0`) và nút ⟳ **Kiểm tra cập nhật**; sau khi kiểm tra thì thêm "bản mới nhất" (rê chuột: giờ kiểm tra), hay "không kiểm tra được" màu đỏ kèm lý do bên dưới. Bản chạy từ mã nguồn (`tauri dev`), bản portable và `--sample` ghi "không tự cập nhật" (rê chuột: lý do). Khi có bản mới: khung "Đang tải bản 0.3.0" có thanh tiến độ, %, MB; tải xong thì khung viền vàng "Bản 0.3.0 đã sẵn sàng", "Đang dùng 0.2.0…", **Có gì mới ⌄** (ghi chú của bản, cuộn được) và nút **Khởi động lại để cập nhật**. Đang có nick trong game thì bấm nút sẽ hỏi lại trước: số nick sẽ bị thoát, trận đang đánh bị bỏ dở, và không vội thì bản mới tự cài khi tắt app. Xem [Tự cập nhật](release.md#tự-cập-nhật) |
| Thêm/Sửa nick | Tên đăng nhập, mật khẩu (Sửa nick điền sẵn; nút con mắt hiện/ẩn), tên gợi nhớ, máy chủ, rồi **Kết nối qua proxy** (công tắc Bật/Tắt, lưu cả khi tắt). Bật thì có ô **Dán proxy**, loại SOCKS5/HTTP, địa chỉ, cổng, tài khoản, mật khẩu và nút **Kiểm tra**; xem [Proxy](#proxy). Thẻ nhân vật có nhãn PROXY khi nick đi qua proxy |
| Toast | Góc dưới phải, của mọi nick (tên nick ở dòng đầu): bắt đầu làm bước hay tự làm nhiệm vụ (xanh lam), xong bước (xanh lá), dừng vì lý do khác (đỏ, kèm lý do), nick bị Lỗi (đỏ, kèm lý do: đăng nhập bị từ chối, proxy hỏng, mất kết nối); bản cập nhật vừa tải xong (xanh lá, dòng đầu "Cập nhật"). Tự ẩn sau 3,5 / 4,5 / 6 s, dừng đếm khi rê chuột lên, có nút đóng; tối đa 4 cái. Vùng chứa là `aria-live="polite"` nên trình đọc màn hình đọc từng toast mà không lấy focus |

- **Đăng nhập:**
  - Mỗi nick có một kết nối TCP riêng trên tokio (`Manager` của core).
  - `s2c/9`, `29`, `11`, `43` phải đọc được thì phiên mới sang Trực tuyến; gói nào hỏng thì phiên báo Lỗi, ghi rõ opcode. Riêng `s2c/1263` chỉ là danh sách người chơi khác: đọc hỏng thì vẫn vào game, nhưng số người xung quanh hiện `?`. Khu không có ai khác (M25, 31/10) thì server không gửi `s2c/1263`: sau `s2c/43` đợi 1,5 s rồi vào game với 0 người, có ghi nhật ký. Các cách làm này giống client TS (`src/net/client.ts`, `snapshotWaitMs`).
  - Đăng xuất dừng phiên ở mọi bước: lúc đang kết nối, chờ seed, hay giữa các bước đăng nhập. Lệnh đánh hay làm nhiệm vụ gửi trước khi vào game bị bỏ qua, có ghi nhật ký.
- **Luồng dữ liệu:**
  - Mỗi sự kiện của session cập nhật nick đó trong `app.rs`, đánh dấu nick đã đổi và tăng số revision.
  - Một luồng riêng (flusher) gom các thay đổi trong 50 ms, rồi gửi sự kiện `accounts` chỉ gồm những nick đã đổi (kèm revision, và thứ tự nick khi có thêm hay xoá), cùng sự kiện `log` gồm các dòng mới. Mỗi dòng nhật ký có số thứ tự riêng của nick.
  - Giao diện đăng ký nghe sự kiện trước rồi mới gọi `state`. Cập nhật có revision không mới hơn cái đang hiện bị bỏ, nên phản hồi `state` đến muộn không kéo giao diện về trạng thái cũ.
  - Trạng thái dùng chung nằm trong một store zustand (`src/store.ts`, zustand 5.0.15 ghim cố định): nick theo id và thứ tự, nick đang chọn, hộp thoại đang mở, nhật ký của nick đang chọn. Mỗi thành phần đọc đúng phần nó cần bằng selector: thẻ nick chỉ theo nick của nó, nên cập nhật một nick chỉ vẽ lại thẻ đó; thanh bên chỉ vẽ lại khi thứ tự nick hoặc số nick trong game đổi. Trạng thái tạm của một phần (tab đang mở, vị trí menu, ô nhập trong hộp thoại) vẫn để riêng ở phần đó.
  - Thêm và xoá nick là lệnh async: Tauri chạy chúng ngoài luồng chính. File `accounts.json` được ghi trên luồng blocking, không giữ khoá chung, và các lần ghi lần lượt từng lần một. Ghi xong mới thêm hoặc xoá nick khỏi danh sách.
  - Giao diện chỉ gọi lệnh, không giữ trạng thái game.
- **An toàn:**
  - Tên người chơi, tên quái và lời server đều là chữ do server gửi. React luôn escape chúng, app không dùng `dangerouslySetInnerHTML`.
  - CSP trong `tauri.conf.json` chỉ cho chạy script của chính app.
  - Mật khẩu game và mật khẩu proxy chỉ lên giao diện qua lệnh `account_secrets`, khi hộp Sửa nick mở, và hiện dưới dấu chấm tới khi bấm nút con mắt. Danh sách nick gửi lên (`AccountView`) không có mật khẩu; nhật ký và lỗi chỉ ghi loại và địa chỉ proxy.
- **Chuẩn code:**
  - Rust qua `cargo fmt` (cấu hình mặc định) và `cargo clippy -D warnings` trên mọi target, kể cả test. `core/src/opcodes.rs` do TS sinh ra nên được đánh dấu `#[rustfmt::skip]`.
  - TypeScript `strict`, `noUnusedLocals`, `noUnusedParameters` (tsconfig của template), kiểm bằng `npm run build`.
  - Mỗi component một file `.tsx` kèm một file `.css` cùng tên, có một dòng chú thích nói nó làm gì.

## Túi đồ và trang bị

Dữ liệu đến tự nhiên lúc đăng nhập và khi túi đổi ([12-skills-items](../../app/events/12-skills-items.md#cách-lấy-túi-đồ)):

| Gói | App đọc | Hàm (`core/src/items.rs`) |
|---|---|---|
| Cuối `s2c/9` | 8 ô trang bị, ô trống là `0xff` | `character_gear` |
| `s2c/37` (sau Mặc, Cởi ra) | 8 ô trang bị lại | `gear_update` |
| `s2c/42` (trả `c2s/42` lúc đăng nhập, và sau Mặc, Cởi ra) | Cả túi: sức chứa, từng món | `character_extra` |
| `s2c/1187` | Cả túi lại, mỗi khi túi đổi (nhận thưởng nhiệm vụ, sửa đồ) | `inventory` |
| `s2c/46` | Xu, Xu khoá, Lượng (ba số i64) | `currencies` |
| `s2c/36` (sau mỗi trận) | Độ bền 8 ô trang bị ([Tự sửa đồ](#tự-sửa-đồ)) | `gear_durability` |
| `s2c/51` (sau khi nhặt được món vào túi) | Ô túi vừa nhận món; không có `s2c/1187` lúc này ([Tự nhặt đồ](#tự-nhặt-đồ)) | `bag_slot` |
| `s2c/1182`, `s2c/1183` | Món vừa rơi trên đất (của bất kỳ ai), món rời khỏi đất | `ground_item_add`, `ground_item_remove` |

Các nút của popup vật phẩm, bắt trên điện thoại ở P4 ([12-skills-items](../../app/events/12-skills-items.md#c2s-1186)), gửi bằng `Bot::item` (`Command::Item`):

| Nút | Gói | Server trả | Bot từ chối khi |
|---|---|---|---|
| Mặc (món trong túi) | `c2s/1186 (0, ô túi)` | `s2c/10` kiểu 4, `s2c/37`, `s2c/42`, `s2c/1186` | không phải trang bị (loại > 7) |
| Cởi ra (món đang mặc) | `c2s/1186 (1, ô trang bị)` | như trên | túi đầy |
| Dùng (món trong túi) | `c2s/84 (ô túi)` | bình ngoài trận: `s2c/1256` "Vật phẩm không thể sử dụng!" | là bình (loại 20), là trang bị |
| Sửa (món đang mặc) | `c2s/48 (0, ô trang bị)` | `s2c/1187` (túi mất búa), `s2c/48` | không có độ bền, độ bền còn đầy, không có Búa Sửa Chữa (mã 2) trong túi |

- Mọi nút cũng bị từ chối khi đang đánh, hay khi lần trước chưa có trả lời (đợi tối đa 5 s). Bị từ chối thì không gửi gì và nhật ký ghi lý do, ví dụ "Chưa sửa Nón Âu Lạc: cần 1 Búa sửa chữa trong túi". Có trả lời thì nhật ký ghi "Đã mặc …", "Đã cởi …", "Đã sửa …".
- Cấp mặc không được kiểm ở app: server tự từ chối nếu chưa đủ cấp.

- Một gói không đọc được thì ghi nhật ký và giữ dữ liệu cũ, không làm phiên dừng.
- Tên món, loại, cấp mặc, độ bền tối đa và chữ chỉ số ("+4 phòng thủ") lấy từ `data/items.json`, được build vào binary (`items::book`); `view.rs` ghép sẵn rồi mới gửi lên giao diện (`ItemView`). Món bảng không có thì hiện `#mã`, không icon.
- Icon là `data/icons/i<icon>.webp`; Vite gom vào bản build (`src/itemIcons.ts`), không chép sang thư mục khác. `npm run items` dựng lại cả hai ([13-drops-items](../../app/events/13-drops-items.md#cách-lấy-lại-dữ-liệu)).
- Trang bị đến lúc đăng nhập và sau mỗi lần Mặc hay Cởi ra (`s2c/37`). Sửa đồ không gửi lại trang bị (chỉ `s2c/1187` và `s2c/48`); sửa là về đầy độ bền (P4: 0/60 → 60/60), nên khi `s2c/48` trả lời, bot tự đặt độ bền món đó về mức tối đa của bảng vật phẩm. Nhờ vậy món không còn hiện hỏng và nút Sửa không bật lại.

## Kỹ năng

Port của `src/protocol/skills.ts` và bước kỹ năng của `QuestBot`. Cây và cấp kỹ năng đến lúc đăng nhập, không có gói xin riêng ([12-skills-items](../../app/events/12-skills-items.md#tab-kỹ-năng)):

| Gói | App đọc hay gửi | Hàm |
|---|---|---|
| `c2s/30 (u8 hệ)` → `s2c/30` | Gửi `field01` của `s2c/9` (1 Hỏa, 2 Lôi, 4 Thủy), nhận cây 9 kỹ năng của hệ đó: tên, kỹ năng học trước, từng cấp (mô tả, điểm, cấp nhân vật, nội lực) | `requests.rs`, `skills::skill_table` |
| Đuôi `s2c/9` | Cấp từng kỹ năng; điểm kỹ năng | `skills::character_skills` |
| `c2s/1191 (mã, 1)` → `s2c/10` kiểu 32, `s2c/1191` | Nâng 1 cấp; server trả cấp mới của mọi kỹ năng, rồi điểm tiềm năng và điểm kỹ năng còn lại | `Bot::upgrade_skill`, `world::character_stats` |

- `skills::skill_tree` làm như `skillTree` bên TS: ô của từng kỹ năng trên ảnh nền, cấp đang có, cấp kế, và lý do chưa nâng được ("cần cấp 32", "phải học Liệt Hỏa Chi Kiếm", "thiếu điểm kỹ năng (cần 3, còn 1)"). `panel()` viết bảng chi tiết từng dòng như game. `view.rs` ghép sẵn mọi thứ (`SkillView`) rồi mới gửi lên giao diện.
- Nút Nâng cấp gửi `Command::UpgradeSkill`. Bot từ chối và ghi lý do vào nhật ký, không gửi gì, khi: đang đánh, lần nâng trước chưa có `s2c/1191` (đợi tối đa 8 s), hay kỹ năng chưa đủ điều kiện. Có trả lời thì nhật ký ghi "Đã nâng Hỏa Cầu Thuật lên cấp 2; còn 18 điểm kỹ năng".
- Bước nhiệm vụ "Sử dụng điểm kỹ năng" chọn kỹ năng đầu tiên trong cây nâng được ngay, như bot TS ([Tự làm nhiệm vụ](#tự-làm-nhiệm-vụ)).
- Icon `data/icons/skills/<mã>.webp` (đã học), `<mã>-grey.webp` (chưa học) và ảnh nền `tree.webp`, Vite gom vào bản build (`src/skillIcons.ts`).

## Đổi khu và đổi map

Mỗi khu của một map có quái và boss riêng, nên muốn đánh quái ở khu khác thì phải sang khu đó trước. Nút icon ⇄ trước tên map ở thẻ nhân vật (**Đổi khu / map**) mở hộp thoại gồm hai phần:

| Phần | App làm gì |
|---|---|
| Khu của map | Mở hộp là gửi `c2s/1172`; `s2c/1172` cho 100 khu, mỗi khu số người trên 20 và độ đông (chữ vàng, chữ đỏ như trong game). Khu đang đứng có viền; khu đầy bị mờ. Nút làm mới hỏi lại. Bấm một khu: `Command::ChangeZone` → `Bot::change_zone` gửi `c2s/1173 (khu)`, rồi theo đúng chuỗi đã đo ([06-map-mobs](../../app/events/06-map-mobs.md#bot-ts-đổi-khu-z1)): `s2c/13` có khu → `c2s/11 (map, khu, 0)` → `s2c/11` → `c2s/43` → `s2c/43`. Nhật ký ghi "Sang khu 4" rồi "Đã sang khu 4 của Trại Vân Sơn: 31 con quái"; tab Đánh quái và thẻ Xung quanh đổi theo khu mới |
| Map khác | Các map trong `data/maps.json` cộng những gì phiên thấy thêm, map gần trước, mỗi map kèm cấp yêu cầu và số cổng phải qua (`Atlas::hops`, theo cấp nhân vật). Bấm **Đi tới**: `Command::GoTo` → `Bot::go_to` đi qua từng cổng như lúc làm nhiệm vụ (`c2s/13` với id cổng, `Atlas::route`), tối đa 6 cổng, nghỉ 2 s sau mỗi map. Cổng bị server từ chối ("Bạn cần hoàn thành nhiệm vụ…") thì bỏ cổng đó và tìm đường khác; hết đường thì dừng. Nhật ký: "Bắt đầu: đi tới …", "Qua cổng … (1/6)", "Đã tới … qua cổng …", "Kết thúc: đã tới …" |

- Bot từ chối và ghi lý do vào nhật ký, không gửi gì, khi đang đánh, đang tự đánh quái hay tự làm nhiệm vụ (bấm Dừng trước), đang đổi chỗ, chọn đúng khu hay map đang đứng, khu không có trong danh sách hay đã đầy, map chưa có đường. Hộp thoại mờ các nút trong những lúc đó và ghi lý do ở đầu.
- Đang đổi chỗ thì Đánh quái và Tự làm nhiệm vụ cũng bị từ chối. Dừng bỏ chuyến đi map; cổng đã qua dở thì vẫn đi tới map của cổng đó.
- Server không trả lời trong 8 s thì thôi: "Server không trả lời khi sang khu 4 sau 8 s", hay "Kết thúc: cổng không trả lời sau 8 s".
- Server không nhớ khu: đăng nhập lại, hay qua cổng, là server tự xếp khu (Z1: M2 về khu 0, M1 khu 1).

## Cửa hàng

App mua được ở Lái Buôn (NPC 106, Làng Thanh Khê M1), dòng **Dược phẩm**: Hoàn Linh Dược, Kim Đan Dược, Búa Sửa Chữa (73 Xu hoặc 80 Xu khóa), Bình Huyết Linh (Rỗng), Băng Tâm. Giao thức ở [Mua ở Lái Buôn](../../app/events/12-skills-items.md#c2s-1190); bot TS thử trước bằng `npm run buy` ([B1](../../app/events/12-skills-items.md#mua-bằng-bot)).

- `Bot::open_shop` gửi `c2s/13 ("M1", 106)`. Khi `s2c/57` (hộp thoại của Lái Buôn) về, bot chọn dòng có nhãn "Dược phẩm" bằng `c2s/57`. `s2c/1190` về thì danh sách nằm trong `Snapshot.shop`. Không cần đứng gần NPC, nhưng **phải đang ở M1**: từ map khác server trả "Không thể thực hiện" (B1).
- `Bot::buy(ô, số lượng)` gửi `c2s/1190 (0, ô, số lượng)`. Ô lấy từ `s2c/1190`, không phải mã vật phẩm, vì mỗi món bán ở hai ô ứng với hai loại tiền. Server trả câu báo `s2c/1256`, rồi cả túi (`s2c/42`) và tiền (`s2c/46`); món đã có trong túi thì cộng dồn vào ô cũ (B1).
- Bot từ chối, ghi lý do vào nhật ký và không gửi gì khi: đang đánh, đang tự đánh quái, đang tự làm nhiệm vụ, đang đổi chỗ; đang đợi Lái Buôn trả lời; không ở M1; chưa mở cửa hàng; ô không có trong cửa hàng; số lượng ngoài 1–99; thiếu tiền theo `s2c/46` gần nhất ("không đủ Xu khóa (cần 7920, có 5000)").
- Mỗi bước chờ server tối đa 8 giây ("Lái Buôn không trả lời sau 8 s"). Rời M1 thì danh sách bị xoá.
- CLI: `cllt buy --account=NAME [--item=2] [--pay=khoa|xu] [--qty=1] [--confirm]` in cửa hàng, rồi chỉ mua khi có `--confirm`.
- Chưa có dòng Vũ khí và Cửa hàng [Lượng] của Lái Buôn (chưa đo), chưa bán đồ.

## Tự sửa đồ

Bật ở tab **Cài đặt** (mục Tự sửa đồ), lưu theo nick trong `accounts.json` (`"fight": {"repair": true}`); phiên đang chạy nhận ngay qua `Command::FightSettings`. Không cần TS chạy trước: gói sửa `c2s/48` đã bấm thật (E2, P4, [Sửa đồ](../../app/events/12-skills-items.md#c2s-48)); phần mới là đọc độ bền sau mỗi trận ([`s2c/36`](../../app/events/05-battle.md#s2c-36)), đã kiểm bằng `gearDurability` bên TS trên 6 trận thật (G2).

- **Độ bền:** `s2c/36` đến sau mỗi trận (và sau Đầu hàng) với độ bền của 8 ô trang bị. App cập nhật thanh độ bền ở tab Túi đồ theo gói này, không phải đợi đăng nhập lại. Món vừa về 0 thì ghi "Rìu Âu Lạc đã hỏng (độ bền 0/60)": món hỏng không còn cộng chỉ số.
- **Khi nào sửa:** chỉ khi đang tự đánh quái hoặc tự làm nhiệm vụ, trước mỗi trận (và trước mỗi bước nhiệm vụ). `Bot::next` gọi `auto_repair` trước khi thách đấu: món đang mặc đầu tiên có độ bền 0 (theo thứ tự ô) được sửa bằng `c2s/48 (0, ô)` như nút Sửa, ghi "Tự sửa Rìu Âu Lạc (độ bền 0/60, ô trang bị 2); còn 1 búa sau lần này". `s2c/48` về thì độ bền lên đầy và việc chạy tiếp sau 0,5 s; còn món hỏng khác và còn búa thì sửa tiếp. Lúc đứng yên không sửa gì.
- **Hết búa:** bot vẫn đánh với món hỏng, nói một lần mỗi lần chạy ("… đang hỏng (độ bền 0/60) nhưng túi hết Búa Sửa Chữa: đánh tiếp với món hỏng"). Bot **không tự mua búa**; tab Cài đặt có nút Mua búa để mua tay.
- **Server không sửa:** câu báo `s2c/1256` ("Không sửa được Nón Âu Lạc: …") hoặc im lặng 5 s ("Server không trả lời khi sửa … sau 5 s") thì món đó được bỏ qua tới hết lần chạy, và việc vẫn chạy tiếp. Bấm Bắt đầu lần sau thì thử lại.
- Nút Sửa ở tab Túi đồ chờ lần tự sửa có trả lời, như chờ một lần bấm của nó.
- CLI: thêm `--auto-repair` vào `cllt fight` hay `cllt quest` để bật Tự sửa đồ cho lần chạy đó (không ghi vào `accounts.json`).

## Tự nhặt đồ

Port `pick()` của bot TS ([G2](../../app/events/13-drops-items.md#g2), chạy thật 6 trận, nhặt 4/4 món). Mặc định **bật** cho mọi nick, cả nick lưu trong `accounts.json` từ trước khi có cài đặt này (`"fight": {"pickup": false}` khi tắt); tắt ở tab Cài đặt hoặc `--no-pickup` của `cllt fight`, `cllt quest`.

- Bot nhớ mọi `s2c/1182` (món rơi trên map, của bất kỳ ai) trong 2 s gần nhất. Đồ của mình đến **trước** gói kết thúc trận, trong cùng lần đọc, nên phải nhớ sẵn.
- Khi **thắng** một trận (của Đánh quái, Nhiệm vụ, hay trận đánh nốt sau Dừng), bot nhặt mọi món rơi trong khoảng 300 ms quanh gói kết thúc, trước hay sau nó: `c2s/1188 (uuid)`, mỗi món cách nhau 200 ms, mỗi uuid một lần. Thua thì không nhặt. Server không kiểm khoảng cách, nên bot nhặt từ chỗ đang đứng.
- Món của người khác rơi đúng khoảng đó (khoảng 5% trận) thì server từ chối, không mất gì.
- Trả lời trong 2 s sau `c2s/1188`: "Bạn vừa nhận được 137 Xu khóa" (ghi nguyên câu, loại Vật phẩm) hay "Không nhặt được: Không thể nhặt vật phẩm của người khác". Câu báo đến lúc đang qua cổng mà nói về nhặt đồ thì không bị coi là cổng từ chối. Ngược lại, lúc việc khác cũng đang đợi `s2c/1256` của nó (qua cổng, mua hàng, nút ở tab Túi đồ hay Tự sửa đồ, đổi khu) thì chỉ câu có "nhặt" hay "nhận được" mới là trả lời nhặt đồ; câu khác vẫn về đúng việc đó.
- Xu khóa vào ví (`s2c/46`); món vào túi đi kèm `s2c/51`, app đặt món vào đúng ô túi đó ([K3](../../app/events/13-drops-items.md#k3)).

## Nhật ký và thống kê

Mọi dòng nhật ký và mọi trận đều được lưu vào SQLite `cllt.db`, cạnh `accounts.json`: `app/cllt.db` khi chạy từ repo (không đưa lên git), thư mục dữ liệu của app với bản cài. Code ở `desktop/src-tauri/src/store.rs` (thư viện `rusqlite`, bản đóng gói sẵn SQLite nên không cần cài gì). File không chứa mật khẩu. Không mở được file thì app vẫn chạy như cũ, chỉ không có lịch sử.

- **Phiên bản bảng:** `PRAGMA user_version` là số bước trong `MIGRATIONS` (`store.rs`) đã chạy. Mỗi lần mở, app chạy các bước còn thiếu, mỗi bước trong một transaction cùng với `user_version` mới. Bước 1 là các bảng của bản 0.4.0 trở về trước, đều `IF NOT EXISTS`, nên file cũ (`user_version` 0) đi qua mà không đổi gì; bước 2 thêm chỉ mục `battles_by_time`. Đổi bảng thì thêm một bước ở cuối, không sửa bước cũ. File của bản app mới hơn (`user_version` lớn hơn số bước) thì không mở, để bản cũ không làm hỏng nó; app chạy không có lịch sử.

- Mọi thứ gắn với **username** viết thường của nick, không gắn với số thứ tự nick trong app: xoá nick rồi thêm lại, hay đổi tên gợi nhớ, lịch sử vẫn còn.
- Bảng `logs`: username, thời điểm (ms), loại, màu, nội dung. Dòng cũ hơn 30 ngày (`LOG_DAYS`) bị xoá mỗi lần mở app.
- Bảng `battles`, mỗi trận một dòng, giữ 90 ngày (`BATTLE_DAYS`, trận xong trước đó bị xoá mỗi lần mở app; khoảng 150 byte một trận), nên "Tất cả" ở tab Thống kê là 90 ngày gần nhất: tên và cấp nhân vật, giờ mở trận (`s2c/22`) và giờ xong, map, khu, quái (mã, tên, cấp, boss), nguồn (`fight` việc Đánh quái, `quest` Tự làm nhiệm vụ, `other` trận của thách đấu trước đánh nốt), kết quả (`won`, `lost`, `left` khi Đầu hàng), số lượt của mình, sát thương gây ra, máu lúc mở và lúc xong, EXP, xu. Bot gửi `Out::Battle` (`BattleRecord` trong `core/src/bot/types.rs`) lúc mỗi trận kết thúc, kể cả trận đầu hàng.
- Tỉ lệ thắng = trận thắng / mọi trận trong bộ lọc (trận rời tính là không thắng). EXP mỗi giờ tính trên tổng thời gian trong trận, không tính lúc nghỉ giữa các trận.
- Lịch sử chỉ có từ khi có tính năng này: log trước đó chỉ nằm trong bộ nhớ.

### Loại dòng nhật ký

Bot gắn loại cho từng dòng lúc ghi (`Out::Log(LogKind, …)`), không đoán theo chữ. Màu xanh, đỏ, vàng của dòng vẫn theo `LogTone`.

| Loại (khoá) | Dòng nào |
|---|---|
| Kết nối (`connection`) | Đang kết nối, Đã vào game, Đã thoát, Lỗi đăng nhập, proxy, "Nick chưa đăng nhập", không có người chơi khác trong khu lúc vào game |
| Trận (`battle`) | Bắt đầu và Kết thúc việc Đánh quái, "Trận N: thách đấu …", kết quả từng trận, boss đổi chỗ, đầu hàng, rời trận, trận của thách đấu trước, bàn cờ lệch, server huỷ trận, thua boss |
| Nhiệm vụ (`quest`) | Bắt đầu và Kết thúc Tự làm nhiệm vụ hay ▶ một bước, nhận và trả nhiệm vụ, bước đang làm, lời NPC, nói chuyện với NPC, tiến độ (Đã diệt, Sát thương lên boss), chờ quái của bước |
| Di chuyển (`travel`) | Qua cổng, Đã tới, đổi khu, đi tới map, cổng hay khu không trả lời, không đọc được NPC và cổng của map |
| Nhân vật (`character`) | Lên cấp, cộng và tự cộng điểm tiềm năng, nâng kỹ năng, không đọc được kỹ năng hay chỉ số |
| Vật phẩm (`item`) | Mặc, Cởi, Dùng, Sửa và kết quả, mở cửa hàng Lái Buôn và số món, mua và kết quả ("Đã mua 1 Búa Sửa Chữa (80 Xu khóa)", "Chưa mua …"), Lái Buôn không trả lời; món vừa hỏng ("Rìu Âu Lạc đã hỏng (độ bền 0/60)"), bật/tắt Tự sửa đồ, tự sửa và kết quả ("Tự sửa Rìu Âu Lạc (độ bền 0/60, ô trang bị 2); còn 1 búa sau lần này", "… nhưng túi hết Búa Sửa Chữa", "Không sửa được …"); bật/tắt Tự nhặt đồ và kết quả nhặt ("Bạn vừa nhận được 137 Xu khóa", "Không nhặt được: …"); không đọc được túi đồ, ô túi, trang bị, độ bền hay tiền |
| Server (`server`) | Thông báo của server (`s2c/1256`, và `s2c/0`, `s2c/5` lúc đang chơi), gói server không đọc được |

**Thêm loại mới, hay thêm một kiểu dòng mới, thì cập nhật bảng trên trong cùng thay đổi.** Một loại mới phải có ở ba nơi: `LogKind` (cả `key` và `label`) trong `core/src/bot/types.rs`, `LOG_KINDS` trong `desktop/src/logKinds.ts`, và một hàng của bảng này. Test `test/log-kinds.test.ts` (chạy trong `npm test`) báo lỗi khi ba nơi không khớp.

## Proxy

Mỗi nick có thể đi qua một proxy riêng, SOCKS5 hoặc HTTP (CONNECT), có hoặc không có tài khoản. `core/src/proxy.rs` làm giống `src/net/proxy.ts` ([proxy của bot TS](../nodejs/README.md#proxy)): nối tới proxy, mở đường tới `play.colauloanthe.vn:1688`, rồi giao thức game chạy bên trong như khi không có proxy. Proxy trả lời dính liền với vài byte đầu của seed thì các byte đó vẫn được dùng.

| Lúc | App làm gì |
|---|---|
| Dán proxy | Ô **Dán proxy** đọc các dạng nhà bán proxy hay đưa: `http://user:pass@host:port`, `socks5://user:pass@host:port`, `host:port:user:pass`, `user:pass@host:port`, `user:pass:host:port`, `host:port@user:pass`, `host:port`, hoặc bốn phần cách nhau bằng dấu cách/tab (`app/desktop/src/proxyText.ts`). Dán là điền ngay; gõ tay thì bấm Điền hoặc Enter. Chuỗi không có `http://`/`socks5://` thì giữ loại đang chọn và nhắc đổi nếu sai. SOCKS4 thì báo chưa hỗ trợ |
| Kiểm tra | `net::check_proxy`: nối tới proxy, mở đường tới server game, chờ 4 byte seed rồi đóng, không đăng nhập. Hiện thời gian, hoặc lý do lỗi |
| Lưu | Proxy đang bật mà mới, vừa bật lại hay vừa đổi thì kiểm tra như trên trước. Không qua thì **không lưu gì**, hộp báo "Chưa lưu: kiểm tra proxy không qua. …". Tắt proxy hay chỉ đổi tên gợi nhớ thì không kiểm tra |
| Đăng nhập | Proxy bật: nhật ký ghi "Kết nối qua proxy socks5 1.2.3.4:1080" rồi "… đã mở đường tới server game". Mỗi bước có 8 s. Hỏng thì nick sang Lỗi với lý do (không nối được proxy, proxy không trả lời, proxy cần/từ chối tài khoản, proxy không nối được tới server game) và có toast đỏ |

Proxy phải cho nối tới cổng 1688; có proxy chỉ cho 80/443. Chưa hỗ trợ SOCKS4 và proxy HTTPS (TLS tới proxy).

## Việc "đánh X N lần"

`bot/fight.rs` đánh theo đúng luật của `--farm` bên TS. Test TS: [quest.test.ts](../../../test/quest.test.ts). Test Rust: `fight_job_*` trong `tests/parity.rs`.

- **Thách đấu:** quái thường dùng `c2s/15`, boss (đã thấy qua `s2c/1177`, hoặc `data/maps.json` ghi có ở map này) dùng `c2s/1178`. Nếu có nhiều con cùng tên, bot đánh lần lượt từng con.
- **Chờ trận:** server phải mở trận (`s2c/22`) trong 8 s. Không có thì bot ghi log và thách đấu tiếp.
- **Boss đang đổi chỗ** (`s2c/1177` field 1): bot đợi 5 s, tối đa 6 lần, rồi mới báo không thấy.
- **Nghỉ giữa các trận:** 3 s.
- **Thời gian:** dòng kết quả mỗi trận ghi thời gian từ lúc trận mở (`s2c/22`) tới khi xong ("22 lượt trong 1 phút 05 giây"); dòng "Kết thúc" của việc đánh quái hay làm nhiệm vụ ghi tổng thời gian. `Job` và `QuestRun` mang giờ bắt đầu và kết thúc (ms từ 1970) cho đồng hồ trên giao diện.
- **Thua trận:**
  - Thua quái thường mất EXP nhưng được hồi đầy HP. Thua đủ số trận cho phép thì bot dừng.
  - Thua boss không mất EXP, và HP boss được giữ giữa các trận. Vì vậy thua boss không làm bot dừng.
- **Bấm Dừng:** trận đang đánh vẫn tiếp tục tới hết, vì không có cách rời trận. Sau trận đó bot không thách đấu nữa.
- **Trận mở muộn:** mỗi `s2c/22` được gắn với thách đấu nó trả lời, theo mob ID có trong gói (thách đấu chưa có trả lời được giữ 60 s).
  - Trận của thách đấu gửi trước khi bấm Dừng, trước khi đổi việc, hay đã quá 8 s vẫn được đánh tới hết. Server đã mở trận đó và không rời được; bỏ mặc thì mỗi lượt tự hết sau 34 s trong khi quái vẫn đánh, tới khi thua ([05-battle](../../app/events/05-battle.md)). Trận đó tính cho việc đã gửi thách đấu, không tính cho việc hiện tại.
  - `s2c/22` không ứng với thách đấu nào của phiên thì bỏ qua. `s2c/22` thứ hai đến khi đang đánh cũng bỏ qua, không thay trận đang đánh.
- **Mỗi lượt:** bot chọn nước bằng `bestMove` (chiến lược `kill`), và trong trận học sát thương mỗi viên của cả hai bên, như bot TS ([07-auto-battle](../../app/events/07-auto-battle.md#thuật-toán-của-bot)).

## Tự làm nhiệm vụ

`bot/quest.rs` chơi các bước của `s2c/39` theo đúng `QuestBot` bên TS ([Bot làm nhiệm vụ](../nodejs/quest-bot.md#bot-làm-gì-với-từng-bước)). Server chỉ gửi **nhiệm vụ chính đang làm**; tab Phụ, Hằng ngày, Bảo Điển hiện đều trống ([10-quests](../../app/events/10-quests.md#trả-lời-nhanh)), nên app chỉ hiện được nhiệm vụ đó.

| Bước | Bot làm gì |
|---|---|
| "Nói chuyện với X", "Báo cáo với X", "Gặp X", "Bàn bạc với X" | `c2s/13 (mapId, npcId)`; `s2c/34` trả lời thì sang bước sau. Không trả lời trong 8 s thì dừng |
| "Tiêu diệt X", "Đánh bại X" | `c2s/15` lần lượt từng con tên X. Mỗi trận thắng tính 1, rồi số của server (`s2c/1201`) thay số tự đếm |
| "Gây N sát thương lên X" | Boss X (`s2c/1177`) bằng `c2s/1178`; thắng hay thua đều cộng sát thương; thua boss không làm bot dừng |
| "Đạt cấp độ N" | Chưa đủ cấp: đánh loại quái mạnh nhất không quá cấp mình, không chọn boss |
| "Nâng điểm tiềm năng" | `c2s/10 (chỉ số, 1)`: 1 điểm theo [Tự cộng](#tự-cộng-điểm-tiềm-năng), Tắt thì vào Cường lực |
| NPC hoặc quái ở map khác | Qua cổng: `c2s/13 (mapId, id cổng)` → `s2c/13` → `c2s/11` → `c2s/43`. Cổng đầu tiên trên đường ngắn nhất theo `data/maps.json` cộng những gì phiên đã thấy, nếu không thì cổng tên nhiệm vụ nhắc tới, nếu không thì cổng tới map chưa đi; tối đa 6 cổng một bước. Cổng bị từ chối (`s2c/1256`) bị bỏ qua |
| Quái của bước có ở map này nhưng chưa thấy (boss đang đổi chỗ) | Đợi 5 s, tối đa 6 lần |
| "Sử dụng điểm kỹ năng" | `c2s/1191 (mã, 1)` cho kỹ năng đầu tiên trong cây `s2c/30` nâng được ngay (đã học kỹ năng trước, đủ cấp, đủ điểm); với nhân vật mới là kỹ năng gốc (Hỏa Cầu Thuật 1000, Băng Tiễn Thuật 4000). `s2c/34` hay `s2c/39` thì sang bước sau. Có `s2c/1191` mà 8 s không sang bước thì dừng, không tiêu thêm điểm. Không kỹ năng nào nâng được thì dừng, không gửi gì ([12-skills-items](../../app/events/12-skills-items.md#c2s-1191)) |
| Bước khác | Dừng, ghi rõ bước nào |

- **Trả nhiệm vụ:** server gửi `s2c/35` (phần thưởng, ghi vào nhật ký), rồi `s2c/39` của nhiệm vụ mới; bot làm tiếp nhiệm vụ mới.
- **Dừng khi:** bấm Dừng (đang có trận thì chọn đánh nốt hay đầu hàng, xem [Dừng giữa trận](#dừng-giữa-trận)), thua đủ số trận cho phép (không tính trận thua boss), gặp bước chưa biết, không còn quái của bước ở khu, NPC hay cổng không trả lời trong 8 s, đã đủ cấp mà server không sang bước sau, hoặc không đọc được NPC và cổng của map vừa tới (`s2c/11`; khi đó bản đồ trong atlas giữ nguyên, không bị ghi thành map rỗng).
- **Mỗi lúc một việc:** đang tự làm nhiệm vụ thì không bắt đầu đánh quái được, và ngược lại: nút Bắt đầu (hay Tự làm nhiệm vụ, ▶) mờ đi kèm một dòng nhắc bấm Dừng ở tab kia trước, và `Bot::fight` / `Bot::quest` cũng từ chối, chỉ ghi log.
- **Bản đồ:** mỗi phiên chép `data/maps.json` lúc mở app, rồi ghi thêm map, quái, boss, cổng đã qua hay bị từ chối vào bản chép đó. App không ghi lại file; `npm run scan` và bot TS mới ghi.

### Làm một bước

Nút ▶ trên một bước gửi `Command::Quest { step: Some((id nhiệm vụ, i)) }`, port từ `QuestBot` với `--once` ([Bot làm nhiệm vụ](../nodejs/quest-bot.md#chạy)). Bot làm bước `i` như bảng trên. Khi nhiệm vụ đã qua bước đó, hoặc có nhiệm vụ mới sau khi báo cáo, bot dừng với "Xong bước \"…\"" (`QuestRun.stepDone`). Nhiệm vụ qua bước khi NPC trả lời, có `s2c/39` mới, hoặc đủ số con hay đủ sát thương. Bước đủ số con từ trước thì dừng luôn, không gửi gói nào. Bot không đi tiếp sang bước sau. Nếu nhiệm vụ lùi về bước trước (chưa từng thấy) thì bot dừng với "Nhiệm vụ không còn ở bước \"…\"", không tính là xong. Các lý do dừng khác vẫn như trên.

Server chỉ tính tiến độ cho bước đang làm, nên chỉ ▶ của bước đó bấm được. Nếu UI chậm một nhịp và gửi một bước không còn là bước đang làm của nhiệm vụ đó, hoặc bước của một nhiệm vụ đã trả, bot từ chối ("Bước đó không còn là bước đang làm") và không gửi gói nào. Bắt đầu một lần chạy khi lần trước chưa xong thì lần trước kết thúc với "Đã bắt đầu lần chạy mới". Mỗi lần chạy có `QuestRun.id` riêng, nhờ đó UI biết một lần chạy mới bắt đầu hay vừa kết thúc để hiện toast. Nick rời game giữa chừng (thoát, mất kết nối, lỗi) cũng có toast "Bot dừng: …".

### Tự cộng điểm tiềm năng

Port `--stats` của bot TS ([12-skills-items](../../app/events/12-skills-items.md#điểm-tiềm-năng)). Chọn ở khung Chỉ số → Đổi, lưu theo nick trong `accounts.json` (`"stats": "auto"` hoặc `{"weights": [Cường lực, Nội lực, Thân pháp, Thể lực]}`), gửi cho phiên bằng `Command::Stats`.

| Chọn | Bot làm gì |
|---|---|
| Tắt | Không tự cộng. Bước "Nâng điểm tiềm năng" cộng vào Cường lực |
| Theo hệ | Dồn vào chỉ số chính của hệ (`field01` của `s2c/9`): Hỏa Cường lực, Lôi Thân pháp, Thủy Nội lực. Số 2 của Lôi chưa đọc từ nhân vật Lôi nào ([Điểm tiềm năng](../../app/events/12-skills-items.md#điểm-tiềm-năng)). Số hệ khác thì không cộng và ghi log một lần |
| Tỉ lệ | Mỗi điểm vào chỉ số đang thiếu nhiều nhất so với tỉ lệ (tính trên số điểm đã cộng từ lúc chọn), bằng nhau thì chỉ số có mã `c2s/10` nhỏ hơn |

- **Gửi:** từng `c2s/10 (chỉ số, 1)`; điểm sau đi 250 ms sau khi `s2c/10` kiểu 8 của điểm trước về. Log ghi một dòng lúc bắt đầu và một dòng tổng kết theo từng chỉ số.
- **Khi nào:** lúc vào game, ngay khi chọn (nếu nick đang rảnh), khi có điểm mới lúc rảnh (lên cấp), và giữa các trận khi đang đánh quái hay làm nhiệm vụ; không bao giờ trong trận.
- **Chừa điểm:** giữ đủ điểm cho các bước "Nâng điểm tiềm năng" còn lại của nhiệm vụ đang làm; ở các bước đó điểm cũng theo lựa chọn.
- **Server im 8 s:** thôi tự cộng tới khi chọn lại; việc đang chạy dừng với lý do đó.
- Hộp chọn chỉ gửi khi bấm Lưu, vì điểm đi ngay và không lấy lại được (trừ Tẩy Tủy Đan).
- `vectors.json` có hai kịch bản TS "stats auto" và "stats by weight": bản Rust gửi đúng từng gói. Mã của Nội lực (1) và Thể lực (3) vẫn là suy luận; **chưa cộng thử với server thật**.

### Dừng giữa trận

Bấm Dừng (hay ■ trên bước) lúc không có trận thì việc dừng ngay. Lúc đang có trận, app hỏi (focus ở Huỷ, Enter không làm mất EXP):

| Chọn | Bot làm gì |
|---|---|
| **Đợi xong trận** | Việc dừng ngay, trận được đánh nốt và vẫn tính (thắng cộng EXP và tiến độ, thua mất EXP). Trong lúc đó nút Dừng vẫn bấm được để đổi ý đầu hàng |
| **Đầu hàng** | `Command::Stop { surrender: true }`: gửi `c2s/11` (map) rồi `c2s/40` (uuid trận) như nút "Đầu hàng" của game ([06-map-mobs](../../app/events/06-map-mobs.md#đầu-hàng)), rồi không đi nước nào nữa; hộp thoại hiện "Đang chờ server nhận đầu hàng". `s2c/11` trả lời `c2s/11` thì gửi `c2s/43` như game. Trận xong khi có `s2c/1214` (có ở mọi lần đo) hoặc `s2c/36`, kể cả khi đến muộn. Không có trong 8 s thì đánh tiếp, bắt đầu bằng lượt đã đến trong lúc chờ. Server trừ EXP ("Rời trận, mất 29 kinh nghiệm" ở B3) và trang bị mòn thêm |
| Huỷ | Không dừng gì |

Cách khác để bỏ trận mà không mất EXP là Đăng xuất: trận dở không được tính, HP giữ mức lúc rời ([10-quests](../../app/events/10-quests.md#boss)). Port từ `--surrender-after` của bot TS ([Bot làm nhiệm vụ](../nodejs/quest-bot.md#chạy)); **chưa thử với server thật**.
