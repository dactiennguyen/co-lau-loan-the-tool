# App Rust: nhiều nick, Tauri + TypeScript

`app/` là app desktop thật: `colautool.app` trên macOS, mở bằng cách bấm đúp. Code cũng chạy được trên Windows và Linux, xem [Windows và Linux](#windows-và-linux). Bản cài cho cả ba hệ được build trên GitHub Actions, xem [CI/CD và phát hành](release.md#cicd-và-phát-hành). Lõi giao thức và bot viết bằng Rust. Giao diện là project Tauri 2 chuẩn: React + TypeScript + Vite trong `app/desktop`, phần Rust trong `app/desktop/src-tauri`. Cách dùng:
1. Thêm nhiều nick.
2. Bấm đăng nhập: từng nick, hoặc tất cả cùng lúc.
3. Khi vào được game, app hiện:
   - cấp, HP, EXP của cấp, xu;
   - chỉ số chiến đấu và điểm tiềm năng, có ngay lúc đăng nhập;
   - map và khu đang đứng, với nút **Đổi khu / map**: sang khu khác của map (mỗi khu có quái và boss riêng) hoặc đi qua cổng sang map khác;
   - số người khác trong khu, kèm tên và cấp từng người.
4. Xem nhiệm vụ chính đang làm: các bước, bước đang làm, tiến độ. Bấm **▶** ở cuối dòng bước đang làm để bot chỉ làm bước đó rồi dừng, hoặc **Tự làm nhiệm vụ** để làm hết các bước: bot tự nói chuyện với NPC, đánh quái và boss của từng bước, và tự qua cổng khi NPC ở map khác. Toast ở góc dưới phải báo lúc bắt đầu và lúc xong hay dừng.
5. Hoặc chọn quái hoặc boss của khu đó, chọn số trận, và app tự đánh.

Code TypeScript trong `src/` vẫn được giữ song song: đó là nơi thử trước, còn Rust chỉ nhận những phần đã chạy được bên TS.

![Cửa sổ app với dữ liệu mẫu](app.png)

*Ảnh chụp app đã đóng gói chạy với `--sample` (dữ liệu mẫu, không kết nối, xem [Chạy](#chạy)), cửa sổ 1280 × 860. Chỉ số của nick đầu là số `s2c/9` trả về ở lần đăng nhập ngày 30/10/2026. Nhiệm vụ 9 và tiến độ Cóc Xanh 14/15 là chỗ nick thật đang dừng ([10-quests](../../app/events/10-quests.md)). Kết quả bot, tên người chơi xung quanh và trận đấu là dữ liệu bịa.*

## Tài liệu

| Nội dung | Tài liệu |
|---|---|
| Quy trình Android → docs → TypeScript → Rust, cấu trúc thư mục `app/` (module `core`, giao diện, `src-tauri`) | [Kiến trúc app Rust](architecture.md) |
| Từng phần của app và việc bot làm: giao diện, túi đồ, kỹ năng, đổi khu, cửa hàng, Tự sửa đồ, Tự nhặt đồ, nhật ký, proxy, đánh quái, nhiệm vụ | [Hướng dẫn dùng app](features.md) |
| CI/CD, phát hành một bản, tự cập nhật | [Phát hành và tự cập nhật](release.md) |
| Đã kiểm bằng test nào, đã chạy thật ra sao; giới hạn | [Đã kiểm chứng và giới hạn](status.md) |
| Tổng quan kiến trúc cả repo | [Kiến trúc](../../architecture.md) |

## Chạy

Cần Rust 1.90 trở lên và Node 20 trở lên. App dùng Tauri 2.12, bản ổn định mới nhất. Tauri 3 vẫn là alpha và đòi Rust 1.95. Các lệnh dưới chạy trong `app/desktop`:

```bash
npm install                                  # lần đầu
npm run app                                  # đóng gói vào app/target/release/bundle (macOS: macos/colautool.app); về sau bấm đúp
npm run tauri dev                            # cửa sổ app với Vite dev server: sửa src/ là thấy ngay; app tên Co Lau Tool DEV
npm run tauri dev -- -- --login-all          # mở và đăng nhập mọi nick luôn (cờ sau `-- --` đi vào app)
npm run tauri dev -- -- --sample             # dữ liệu mẫu, không kết nối; lưu vào thư mục tạm, không đụng accounts.json thật
npm run sample && npm run dev                # xem giao diện trong trình duyệt (http://localhost:1420) với dữ liệu mẫu
npm run build                                # tsc && vite build: kiểm kiểu TypeScript
npm run check:sample                         # kiểm dữ liệu mẫu src-tauri gửi có khớp kiểu src/api/types.ts (chạy khi đổi kiểu bên Rust)
npm run icon:dev                             # làm lại icon DEV từ app-icon.png (cần ImageMagick), sau khi đổi icon
```

**Bản dev chạy cạnh bản cài.** `npm run tauri dev` đi qua `scripts/tauri.mjs`, script này thêm `src-tauri/tauri.dev.conf.json` lên trên `tauri.conf.json`:
- định danh riêng `vn.colauloanthe.desktop.dev`;
- tên **Co Lau Tool DEV** ở tiêu đề cửa sổ, khay và thanh bên (có nhãn DEV đỏ);
- icon có nhãn DEV (`app-icon-dev.png`, `src-tauri/icons-dev/`) ở Dock và khay.

Cargo build ra tệp `cllt-tool-dev`, nên macOS hiện tên đó ở Dock, Cmd-Tab và thanh menu. Đặt `mainBinaryName` hay đổi tên tiến trình lúc chạy đều không đổi được tên này: macOS lấy theo tên tệp chạy (đo 01/11 bằng `lsappinfo`). `tauri build` đổi tệp về `cllt-desktop` trong gói, nên bản cài, bộ cài và bản cập nhật giữ nguyên tên tệp.

Bản dev vẫn đọc `app/accounts.json`, `app/cllt.db`, `app/settings.json` của repo. Bản cài từ GitHub đọc thư mục riêng trong Application Support (macOS), `%LOCALAPPDATA%` (Windows), `~/.local/share` (Linux), theo [paths.rs](../../../app/desktop/src-tauri/src/paths.rs). Hai bản có hai danh sách nick riêng. Server chỉ cho mỗi nick một phiên, nên đừng đăng nhập cùng một nick ở cả hai bản: bản đăng nhập sau đá bản trước.

Trong `app/`:

```bash
cargo test                                   # so với vector TS
cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings   # chuẩn code Rust
cargo run -p cllt-core --bin cllt -- status  # CLI không giao diện, để kiểm tra: đăng nhập, in trạng thái, thoát
cargo run -p cllt-core --bin cllt -- fight --target="Heo Mọi" --count=3 [--account=TÊN] [--max-losses=1]
cargo run -p cllt-core --bin cllt -- quest [--account=TÊN] [--max-losses=1]   # tự làm nhiệm vụ tới khi dừng, rồi thoát
cargo run -p cllt-core --bin cllt -- skill [--account=TÊN] [--id=1001]  # in cây kỹ năng; có --id thì Nâng cấp 1 lần (tốn điểm)
cargo run -p cllt-core --bin cllt -- item [--account=TÊN] [--equip=Ô | --unequip=Ô | --use=Ô | --repair=Ô | --discard=Ô | --sort]
cargo run -p cllt-core --bin cllt -- zone [--account=TÊN] [--zone=4]   # in số người từng khu; có --zone thì sang khu đó
cargo run -p cllt-core --bin cllt -- goto --map=M1 [--account=TÊN]     # đi qua cổng tới map đó
                                                  # in trang bị, túi, chỉ số; có nút thì bấm 1 lần rồi in lại
```

Có thể kéo file `.app` vào thư mục Applications. Khi chạy từ repo này, app đọc `app/accounts.json` và `data/maps.json` của repo. Nếu repo không còn ở chỗ cũ, app dùng bản `data/maps.json` đã đóng gói sẵn, và đọc `accounts.json` trong thư mục dữ liệu của app (Tauri `app_local_data_dir`, đặt tên theo identifier `vn.colauloanthe.desktop`):

| Hệ | `accounts.json` |
|---|---|
| macOS | `~/Library/Application Support/vn.colauloanthe.desktop/accounts.json` |
| Windows | `%LOCALAPPDATA%\vn.colauloanthe.desktop\accounts.json` |
| Linux | `~/.local/share/vn.colauloanthe.desktop/accounts.json` (hoặc `$XDG_DATA_HOME/…`) |

Biến `CLLT_ACCOUNTS` được ưu tiên hơn cả hai chỗ trên.

`accounts.json` có dạng sau:

| Khoá | Bắt buộc | Ý nghĩa |
|---|---|---|
| `label` | không | Tên hiện trong danh sách |
| `username`, `password` | có | Tài khoản game. Mật khẩu chỉ nằm trong file này và trong hộp Sửa nick, không bao giờ được in hay ghi log |
| `serverId` | không | Mặc định 24 (Thanh Khê) |
| `skill` | không | `{ "id": 1000, "cost": 25 }`: dùng kỹ năng khi nội lực đủ, như `--skill` của bot TS |
| `proxy` | không | `{ "enabled": true, "kind": "socks5", "host": "1.2.3.4", "port": 1080, "username": "…", "password": "…" }` (`kind` là `socks5` hoặc `http`). Tắt (`enabled: false`) thì vẫn giữ để bật lại; xem [Proxy](features.md#proxy) |

- Thêm, sửa, xoá nick trong app đều ghi vào file này; mở app lên là danh sách nạp lại đúng như đã lưu, đúng thứ tự.
- Mở Sửa nick thì mật khẩu game và mật khẩu proxy đã điền sẵn, ẩn dưới dấu chấm; nút con mắt ở cuối ô bật/tắt hiển thị. Hộp hỏi chúng bằng lệnh `account_secrets` lúc mở; sự kiện `accounts` và nhật ký không bao giờ mang mật khẩu. Xoá trống ô mật khẩu thì vẫn giữ mật khẩu cũ (mật khẩu proxy cũng vậy, khi tài khoản proxy giữ nguyên). Nick đang đăng nhập chỉ dùng thông tin mới từ lần đăng nhập sau.
- Không thêm được một nick hai lần trên cùng máy chủ (tên đăng nhập không phân biệt hoa thường), vì hai phiên của một nick sẽ đá nhau.
- Biến `CLLT_ACCOUNTS` đổi đường dẫn file.
- Chưa có file thì app bắt đầu với danh sách trống. App không đọc `.env` nữa; chỉ CLI `cllt` còn dùng `CLLT_USERNAME`/`CLLT_PASSWORD` trong `.env` khi chưa có file, hoặc khi `--account` gọi đúng nick của `.env` mà file không có. Hai biến này đặt trong môi trường của lệnh thì nick đó đứng đầu danh sách, trước các nick của file.
- Mỗi nick **không được online ở máy khác**. Khi đó server trả `s2c/0`, và app hiện lỗi "Server từ chối: …" trên nick đó.

### Windows và Linux

Tauri không đóng gói chéo, nên phải build trên đúng hệ đó (máy thật, máy ảo hoặc CI). Các lệnh vẫn như trên, chạy trong `app/desktop`:

| Hệ | Cần cài trước | `npm run app` cho ra |
|---|---|---|
| Windows 10/11 | Rust (MSVC), Visual Studio Build Tools có "Desktop development with C++", Node. WebView2 có sẵn trên Windows 10/11 | `bundle/nsis/*-setup.exe` và `bundle/msi/*.msi` |
| Linux (Debian/Ubuntu) | Rust, Node, `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev` | `bundle/deb/*.deb`, `bundle/rpm/*.rpm`, `bundle/appimage/*.AppImage` |

Khác biệt giữa các hệ đều đã xử lý trong code:
- **Đường dẫn:** `paths.rs` lấy thư mục dữ liệu từ Tauri, không tự ghép `~/Library/…`.
- **Quyền file:** `accounts.json` chỉ chủ file đọc được (0600) trên macOS và Linux. Trên Windows, thư mục `%LOCALAPPDATA%` vốn đã chỉ của người dùng đó.
- **Thanh tiêu đề:** macOS dùng thanh tiêu đề trong suốt (`titleBarStyle: Overlay`), nên phần trên của thanh bên chừa 44 px cho các nút cửa sổ và có dải kéo cửa sổ. Windows và Linux giữ thanh tiêu đề gốc; `main.tsx` đặt `data-os` để CSS bỏ khoảng chừa và dải kéo.
- **Cửa sổ console:** bản release trên Windows không mở thêm console (`windows_subsystem` trong `main.rs`).
