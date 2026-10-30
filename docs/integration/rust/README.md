# App Rust: nhiều nick, Tauri + TypeScript

`app/` là app desktop thật: `colautool.app` trên macOS, mở bằng cách bấm đúp. Code cũng chạy được trên Windows và Linux, xem [Windows và Linux](#windows-và-linux). Bản cài cho cả ba hệ được build trên GitHub Actions, xem [CI/CD và phát hành](#cicd-và-phát-hành). Lõi giao thức và bot viết bằng Rust. Giao diện là project Tauri 2 chuẩn: React + TypeScript + Vite trong `app/desktop`, phần Rust trong `app/desktop/src-tauri`. Cách dùng:
1. Thêm nhiều nick.
2. Bấm đăng nhập: từng nick, hoặc tất cả cùng lúc.
3. Khi vào được game, app hiện:
   - cấp, HP, EXP của cấp, xu;
   - chỉ số chiến đấu và điểm tiềm năng, có ngay lúc đăng nhập;
   - map và khu đang đứng (dạng chữ);
   - số người khác trong khu, kèm tên và cấp từng người.
4. Chọn quái hoặc boss của khu đó, chọn số trận, và app tự đánh.

Code TypeScript trong `src/` vẫn được giữ song song: đó là nơi thử trước, còn Rust chỉ nhận những phần đã chạy được bên TS.

![Cửa sổ app với dữ liệu mẫu](app.png)

*Ảnh chụp giao diện với dữ liệu mẫu (`--dump-sample`, xem [Chạy](#chạy)). Chỉ số của nick đầu là số `s2c/9` trả về ở lần đăng nhập ngày 30/10/2026. Tên người chơi xung quanh và trận đấu là dữ liệu bịa.*

## Quy trình: Android → docs → TypeScript → Rust

| Bước | Làm gì | Ở đâu |
|---|---|---|
| 1. Điều tra | Đọc APK, bắt gói trên điện thoại (Frida, REA), đo byte và hành vi | Ghi ngay vào [docs/app](../../app/README.md): bằng chứng, bố cục byte, độ chắc chắn |
| 2. Mô phỏng bằng TS | Viết decoder, bot, mô phỏng trong `src/`; gói thật làm fixture trong `test/`; chạy thật bằng `npm run …` | Ghi kết quả chạy vào [docs/integration/nodejs](../nodejs/README.md) và các mục event |
| 3. Port sang Rust | Chỉ khi bản TS đã qua test và đã chạy thật: chuyển sang `app/core`, chạy `npm run export:rust`, rồi `cargo test` phải khớp | Tài liệu này |
| 4. Giao diện | `app/desktop` (Tauri) chỉ gọi `app/core`, không tự giải gói. Rust gửi dữ liệu đã giải, TypeScript chỉ hiển thị | Tài liệu này |

- Hai bên dùng chung **một nguồn dữ liệu**:
  - `npm run export:rust` ([src/export-rust.ts](../../../src/export-rust.ts)) sinh `app/core/src/opcodes.rs` từ [src/config.ts](../../../src/config.ts).
  - Lệnh đó cũng sinh `app/core/tests/vectors.json` từ [test/fixtures.ts](../../../test/fixtures.ts) và từ kết quả các hàm TS chạy trên gói thật.
  - Không sửa hai file sinh ra này bằng tay.
- `npm test` có [test/rust-export.test.ts](../../../test/rust-export.test.ts), báo lỗi khi TS đã đổi mà chưa xuất lại. Khi đã xuất lại, `cargo test` báo lỗi cho tới khi Rust làm theo.
- Mọi tính năng mới đi theo thứ tự trên. Ví dụ, "đánh boss N lần" được viết trước thành `npm run quest -- --farm=<boss>` ([quest-bot](../nodejs/quest-bot.md#chạy)), sau đó mới port thành `bot.rs`.

## Cấu trúc

```text
app/
  Cargo.toml              workspace: core, desktop/src-tauri (Rust 1.90); profile release của template Tauri
  accounts.example.json   mẫu; app/accounts.json là file thật, đã gitignore
  core/                   cllt-core: không có UI, test được không cần màn hình
    src/opcodes.rs          sinh từ src/config.ts
    src/protocol.rs         ← src/protocol.ts: frame, XOR, handshake, proof mật khẩu, s2c/9 (cả phần đuôi), 29, 11
    src/requests.rs         ← buildRequest của src/events.ts
    src/world.rs            ← src/world.ts: s2c/43, 11, 13, 1177, 1256, 10; người chơi trong khu (1263, 1167, 1170, 1253)
    src/battle.rs           ← src/battle.ts: bàn 8×8, cascade, bestMove, gói trận
    src/runner.rs           ← src/battle-runner.ts: một trận, học thông số hai bên
    src/bot.rs              ← QuestBot --farm của src/quest.ts: trạng thái nhân vật, việc "đánh X N lần"
    src/net.rs              ← FLOW của src/client.ts: đăng nhập, heartbeat, Manager nhiều nick (tokio)
    src/atlas.rs            đọc data/maps.json (bot TS ghi, app chỉ đọc)
    src/accounts.rs         accounts.json, .env
    src/bin/cllt.rs         CLI không giao diện: status, fight
    tests/parity.rs         so với vectors.json
    tests/vectors.json      sinh từ TS
  desktop/                project Tauri 2 (cấu trúc của create-tauri-app, template react-ts)
    package.json            dev, build (tsc && vite build), tauri, app, sample
    index.html, vite.config.ts, tsconfig.json
    app-icon.png/.svg       nguồn icon; `npm run tauri icon app-icon.png` sinh src-tauri/icons
    src/                    giao diện React + TypeScript
      main.tsx, App.tsx       gốc: thanh bên, trang nick, hộp thêm nick
      types.ts                kiểu dữ liệu Rust gửi sang (bản sao của src-tauri/src/view.rs)
      api.ts                  gọi lệnh Tauri và nghe sự kiện "accounts", "log"; ngoài Tauri thì đọc public/sample.json
      hooks.ts                useAppState, useLog
      format.ts               số kiểu Việt (14.238), màu trạng thái, tiến độ cấp
      styles/                 tokens.css (màu, font, bo góc), base.css
      components/             thành phần dùng chung, không biết gì về game, mỗi cái một .tsx + .css:
                              Button, Icon, Badge, Pill, Bar, Avatar, Card, Chip, Stepper, StatTile, TextField
      views/                  các phần của app: Sidebar, AccountCard, AccountPage, HeroCard, MetricRow, StatsCard,
                              PlayersCard, FightCard, LogCard, AddAccountDialog, EmptyState
      assets/fonts/           Chakra Petch (OFL), font tiêu đề và con số
    src-tauri/              crate cllt-desktop
      tauri.conf.json         cửa sổ, CSP, bundle (mọi định dạng của hệ đang build)
      tauri.macos.conf.json   riêng macOS: chỉ đóng gói .app (ký ad-hoc)
      capabilities/           quyền của cửa sổ: sự kiện, kéo cửa sổ
      icons/                  sinh bằng `tauri icon`
      src/main.rs, lib.rs     điểm vào; lib.rs dựng app Tauri và đọc cờ dòng lệnh
      src/commands.rs         lệnh giao diện gọi được: state, logs, login, logout, login_all, logout_all, fight, stop,
                              add_account, remove_account
      src/app.rs              danh sách nick và session; mỗi thay đổi gửi sự kiện "accounts" (và "log")
      src/view.rs             Snapshot → AccountView mà giao diện nhận
      src/paths.rs            accounts.json, .env, data/maps.json
      src/sample.rs           dữ liệu mẫu cho --sample, --dump-sample
```

## Chạy

Cần Rust 1.90 trở lên và Node 20 trở lên. App dùng Tauri 2.12, bản ổn định mới nhất. Tauri 3 vẫn là alpha và đòi Rust 1.95. Các lệnh dưới chạy trong `app/desktop`:

```bash
npm install                                  # lần đầu
npm run app                                  # đóng gói vào app/target/release/bundle (macOS: macos/colautool.app); về sau bấm đúp
npm run tauri dev                            # cửa sổ app với Vite dev server: sửa src/ là thấy ngay
npm run tauri dev -- -- --login-all          # mở và đăng nhập mọi nick luôn (cờ sau `-- --` đi vào app)
npm run tauri dev -- -- --sample             # dữ liệu mẫu, không kết nối
npm run sample && npm run dev                # xem giao diện trong trình duyệt (http://localhost:1420) với dữ liệu mẫu
npm run build                                # tsc && vite build: kiểm kiểu TypeScript
```

Trong `app/`:

```bash
cargo test                                   # so với vector TS
cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings   # chuẩn code Rust
cargo run -p cllt-core --bin cllt -- status  # CLI không giao diện, để kiểm tra: đăng nhập, in trạng thái, thoát
cargo run -p cllt-core --bin cllt -- fight --target="Heo Mọi" --count=3 [--account=TÊN] [--max-losses=1]
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
| `username`, `password` | có | Tài khoản game. Mật khẩu chỉ nằm trong file này, không bao giờ được in hay ghi log |
| `serverId` | không | Mặc định 24 (Thanh Khê) |
| `skill` | không | `{ "id": 1000, "cost": 25 }`: dùng kỹ năng khi nội lực đủ, như `--skill` của bot TS |

- Thêm nick bằng nút "Thêm nick" thì nick được ghi vào file này.
- Biến `CLLT_ACCOUNTS` đổi đường dẫn file.
- Chưa có file thì app và CLI dùng tài khoản `CLLT_USERNAME`/`CLLT_PASSWORD` trong `.env` ở gốc repo. Tài khoản này không được chép sang `accounts.json`.
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

## CI/CD và phát hành

Có hai workflow trong `.github/workflows`, làm theo cách của [cockpit-tools](https://github.com/jlcodes99/cockpit-tools), nhưng chưa ký số và chưa có tự cập nhật:

| Workflow | Chạy khi | Làm gì |
|---|---|---|
| [build-matrix.yml](../../../.github/workflows/build-matrix.yml) | push lên `main`, mở pull request, hoặc bấm tay (Run workflow) | `npm test`; `cargo fmt`, `cargo clippy -D warnings`, `cargo test` trên Ubuntu; qua hết mới build app trên 4 máy song song. File build nằm 14 ngày trong mục Artifacts của lần chạy |
| [release.yml](../../../.github/workflows/release.yml) | đẩy tag `v*` | Kiểm tra tag khớp version, gọi build-matrix.yml, rồi tạo GitHub Release gồm mọi file, `SHA256SUMS.txt` và [ghi chú cài đặt](../../../.github/release-notes.md) |

| Máy build | Target | File |
|---|---|---|
| `macos-latest` | `aarch64-apple-darwin` | `colautool_<version>_macos_aarch64.dmg` và `.app.zip` |
| `macos-latest` (build chéo) | `x86_64-apple-darwin` | `colautool_<version>_macos_x64.dmg` và `.app.zip` |
| `windows-latest` | `x86_64-pc-windows-msvc` | `colautool_<version>_windows_x64-setup.exe`, `.msi`, `_portable.exe` (chạy không cần cài) |
| `ubuntu-22.04` | `x86_64-unknown-linux-gnu` | `colautool_<version>_linux_x64.deb`, `.rpm`, `.AppImage` |

[stage-bundles.mjs](../../../.github/scripts/stage-bundles.mjs) đổi tên file Tauri sinh ra theo một mẫu chung, vì tên gốc lẫn lộn `x64`, `amd64`, `x86_64` và `en-US`.

Phát hành một bản mới, ví dụ 0.1.1:
1. Đặt `version` thành `0.1.1` ở cả ba chỗ: [app/Cargo.toml](../../../app/Cargo.toml), [app/desktop/package.json](../../../app/desktop/package.json), [tauri.conf.json](../../../app/desktop/src-tauri/tauri.conf.json). Nếu tag lệch với bất kỳ chỗ nào, release dừng ngay.
2. Commit, rồi chạy `git tag v0.1.1 && git push origin main v0.1.1`.
3. Release hiện ra sau khi 4 bản build và bước publish xong. Bản đã publish không bao giờ bị ghi đè. Bản nháp do một lần chạy lỗi để lại thì bị thay.

Lưu ý:
- **Tên app là `colautool`** (`productName`), không dấu. Tên có dấu làm hỏng hai loại bộ cài:
  - WiX (`.msi`) chỉ nhận ký tự có trong code page 1252. "ờ", "ạ", "ế" không có trong 1252, và cũng không có trong 1258.
  - `.deb`/`.rpm` lấy tên gói là `productName` viết kebab-case, mà dpkg chỉ nhận a–z, 0–9, `+`, `-`, `.`.

  Tiêu đề cửa sổ vẫn là "Cờ Lau Loạn Thế". Identifier vẫn là `vn.colauloanthe.desktop`, nên thư mục chứa `accounts.json` không đổi.
- **Chưa ký số:** macOS dùng chữ ký ad-hoc (`signingIdentity: "-"`), nên lần đầu người dùng phải chạy `xattr -cr /Applications/colautool.app`. Windows hiện cảnh báo SmartScreen. Muốn ký như cockpit-tools thì cần chứng chỉ Apple Developer ID và 6 secret `APPLE_*`.
- **Rust 1.90 cố định** trong CI, để một lint clippy mới của bản stable sau không tự làm hỏng build.
- **Đã thử trên máy (30/10/2026):** build macOS Apple Silicon bằng đúng lệnh của CI ra `colautool.app` 4,8 MB và `.dmg` 2,6 MB. Script gom file và bước kiểm tra tag chạy đúng. Bản Intel, Windows và Ubuntu chỉ build trên GitHub Actions và chưa có lần chạy nào.

## Giao diện

Thiết kế theo skill `ui-ux-pro-max`:
- **Màu:** bảng màu "Gaming": tím neon `#7C3AED` và hồng `#F43F5E` trên nền chàm `#0F0F23`. Mỗi con số có một màu riêng: HP hồng, EXP tím, xu vàng, điểm tiềm năng xanh lơ.
- **Bố cục:** kiểu "data-dense dashboard": hàng thẻ chỉ số, padding gọn, chữ 12–14 px.
- **Font:** Chakra Petch (có đủ dấu tiếng Việt) cho tiêu đề và con số; chữ thường dùng font hệ thống.
- **Icon:** SVG nét 2 px, không dùng emoji.
- **Cách viết:** màu, bo góc và font chỉ khai báo trong `src/styles/tokens.css`; component dùng biến CSS, không ghi mã màu rời.

| Vùng | Nội dung |
|---|---|
| Thanh bên | Logo, số nick và số nick đang trong game, "Thêm nick". Mỗi nick là một thẻ: avatar màu theo tên và chấm trạng thái, tên, cấp, map và khu (hoặc lời báo lỗi), chip trạng thái, thanh HP, số người trong khu, nút đăng nhập/thoát riêng. Dưới cùng: "Đăng nhập tất cả", thoát tất cả |
| Thẻ nhân vật | Tên, cấp, trạng thái (Ngoại tuyến / Đang kết nối / Trực tuyến / Đang đánh / Lỗi), giờ vào game. **Vị trí** dạng chữ: tên map, mã map, khu, x/y. **Xung quanh**: số người khác trong khu. Nút Đăng nhập/Đăng xuất, Xoá nick |
| 4 ô | HP; kinh nghiệm (EXP / mốc cấp, %, còn bao nhiêu lên cấp); xu; điểm tiềm năng và điểm kỹ năng chưa dùng |
| Chỉ số | Tấn công, Phòng thủ, Chính xác, Né tránh, Chí mạng; 4 tiềm năng Cường lực, Thân pháp, Nội lực, Thể lực ([nhãn nào là suy luận](../../app/user-data.md#đuôi-s2c9)) |
| Xung quanh | Người chơi khác trong khu, cấp cao xếp trước. Cấp cao hơn mình tô hồng, bằng tô vàng, thấp hơn tô xanh |
| Tự đánh | Quái và boss của khu, boss xếp trước, có huy hiệu BOSS; số trận (ô − + và nút nhanh 5/10/20/50); số trận thua cho phép; Bắt đầu, Dừng; tiến độ, thắng/thua, EXP/xu đã nhận; HP hai bên trong trận |
| Nhật ký | Từng trận và thông báo server theo giờ: thắng xanh, thua/lỗi đỏ, bắt đầu/kết thúc tím; giữ 500 dòng mỗi nick |

- **Luồng dữ liệu:**
  - Mỗi nick có một kết nối TCP riêng trên tokio (`Manager` của core).
  - Mỗi sự kiện của session cập nhật danh sách trong `app.rs`, rồi gửi sự kiện `accounts` (toàn bộ danh sách) và `log` (dòng mới) sang webview.
  - Giao diện chỉ gọi lệnh, không giữ trạng thái game.
- **An toàn:**
  - Tên người chơi, tên quái và lời server đều là chữ do server gửi. React luôn escape chúng, app không dùng `dangerouslySetInnerHTML`.
  - CSP trong `tauri.conf.json` chỉ cho chạy script của chính app.
  - Mật khẩu không bao giờ được gửi ngược lên giao diện.
- **Chuẩn code:**
  - Rust qua `cargo fmt` (cấu hình mặc định) và `cargo clippy -D warnings` trên mọi target, kể cả test. `core/src/opcodes.rs` do TS sinh ra nên được đánh dấu `#[rustfmt::skip]`.
  - TypeScript `strict`, `noUnusedLocals`, `noUnusedParameters` (tsconfig của template), kiểm bằng `npm run build`.
  - Mỗi component một file `.tsx` kèm một file `.css` cùng tên, có một dòng chú thích nói nó làm gì.

## Việc "đánh X N lần"

`bot.rs` đánh theo đúng luật của `--farm` bên TS. Test TS: [quest.test.ts](../../../test/quest.test.ts). Test Rust: `fight_job_*` trong `tests/parity.rs`.

- **Thách đấu:** quái thường dùng `c2s/15`, boss (đã thấy qua `s2c/1177`, hoặc `data/maps.json` ghi có ở map này) dùng `c2s/1178`. Nếu có nhiều con cùng tên, bot đánh lần lượt từng con.
- **Chờ trận:** server phải mở trận (`s2c/22`) trong 8 s. Không có thì bot ghi log và thách đấu tiếp.
- **Boss đang đổi chỗ** (`s2c/1177` field 1): bot đợi 5 s, tối đa 6 lần, rồi mới báo không thấy.
- **Nghỉ giữa các trận:** 3 s.
- **Thua trận:**
  - Thua quái thường mất EXP nhưng được hồi đầy HP. Thua đủ số trận cho phép thì bot dừng.
  - Thua boss không mất EXP, và HP boss được giữ giữa các trận. Vì vậy thua boss không làm bot dừng.
- **Bấm Dừng:** trận đang đánh vẫn tiếp tục tới hết, vì không có cách rời trận. Sau trận đó bot không thách đấu nữa.
- **Mỗi lượt:** bot chọn nước bằng `bestMove` (chiến lược `kill`), và trong trận học sát thương mỗi viên của cả hai bên, như bot TS ([07-auto-battle](../../app/events/07-auto-battle.md#thuật-toán-của-bot)).

## Đã kiểm chứng

| Phần | Cách kiểm |
|---|---|
| Giao thức | Seed, handshake, frame gửi/nhận khi gói bị cắt nhỏ tuỳ ý, 16 vector mật khẩu, 5 payload đăng nhập: khớp từng byte |
| Request | 16 request so byte với `buildRequest` |
| Giải mã | 27 gói thật hoặc dựng theo bố cục TS, trong đó có hai `s2c/9` đủ phần đuôi (A2 cấp 3, 30/10 cấp 21), `s2c/1263` (18 người) và `s2c/1167`: kết quả JSON giống hệt bản TS |
| Người trong khu | `ZonePlayers` nhận lần lượt `1263`, `1170`, `1170`, `1167`, `1253` thật: danh sách sau mỗi gói (id, tên, cấp, thứ tự) giống bản TS |
| Bàn cờ | 3 trận bắt được, 52 bước: bàn, số viên ăn, số đợt, lượt thêm sau mỗi bước giống bản TS |
| `bestMove` | 55 thế cờ, đổi HP, nội lực, sức mạnh và chiến lược: cùng nước, cùng điểm tới bit cuối |
| Trận, bot | Vào trận → lượt quái → nước của mình → kết thúc; học thông số; boss `c2s/1178`, đợi boss đổi chỗ; dừng khi thua đủ |
| Lưới bản đồ | `mapGrid` của M2 (35 × 90 ô, lớp hình và lớp va chạm) giống bản TS từng byte |
| Server thật (30/10/2026) | Bot TS đăng nhập chỉ đọc: đuôi `s2c/9` cho EXP 14238 trong mốc 13841–15882, xu 2664, x/y trùng `s2c/11`; `s2c/1263` có 8 người, không có mình. `cllt status`: manina cấp 21, HP 180/180, M2 khu 0, 8 mục tiêu (2 boss). `cllt fight --target="Heo Mọi" --count=1`: thắng sau 21 lượt, gây 234 sát thương, +92 EXP, +12 xu, HP tối đa của Heo Mọi học được là 146 |
| Giao diện Tauri, server thật | Mở `Cờ Lau Loạn Thế.app` đã đóng gói với `--login-all`, chụp cửa sổ sau 9 s: "Trực tuyến", cấp 21, HP 180/180, EXP 14.238 / 15.882 (19,5%), xu 2.664, 68 điểm tiềm năng, 19 điểm kỹ năng, 5 chỉ số chiến đấu, Trại Vân Sơn · M2 · Khu 1 · x 2784 · y 864, 13 người xung quanh có tên và cấp, 2 boss và các loại quái trong danh sách đánh. Không đánh trận nào |
| Giao diện, cỡ cửa sổ | Ảnh chụp với dữ liệu mẫu ở 1280 × 860 (vừa khít, thẻ cuối tự cuộn bên trong) và 1080 × 720 (cỡ nhỏ nhất; bố cục hẹp, trang cuộn). `--sample` trên app thật: dữ liệu đi qua lệnh Tauri, CSP không chặn gì |

## Giới hạn

- **Boss qua `c2s/1178`:** cả TS lẫn Rust mới chạy với gói thật bắt từ điện thoại (B4) và với test, **chưa đánh boss thật**. Đứng xa boss có thách đấu được không thì vẫn chưa rõ ([10-quests](../../app/events/10-quests.md#boss)).
- **Nhiều nick cùng một IP:** chưa thử, cần thêm nick thứ hai. Phía app, mỗi nick đã là một kết nối độc lập.
- **Nhãn chỉ số:** "Tấn công" và "Phòng thủ" khớp số đo. "Chính xác", "Né tránh", "Chí mạng" và thứ tự Thân pháp / Nội lực / Thể lực là suy luận từ chuỗi giao diện của game ([user-data](../../app/user-data.md#đuôi-s2c9)).
- **Vị trí:** là x/y lúc vào map. App không cho nhân vật đi lại, nên vị trí chỉ đổi khi sang map khác.
- **Trang bị:** app không sửa trang bị có độ bền 0, vì chưa tìm ra gói sửa.
- **Windows và Linux:** mới kiểm tra `cargo check` chéo của `cllt-core` cho `x86_64-pc-windows-msvc` và `x86_64-unknown-linux-gnu`. Phần Tauri chưa chạy thử trên hai hệ này; [build-matrix.yml](#cicd-và-phát-hành) sẽ là lần build đầu tiên.
- **Chưa port:** app không mua bán, không chat, không đổi map, không làm nhiệm vụ. Bot nhiệm vụ, quét map và ghi `data/maps.json` vẫn chỉ có bên TS và sẽ được port theo quy trình trên.
