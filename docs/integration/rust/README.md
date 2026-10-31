# App Rust: nhiều nick, Tauri + TypeScript

`app/` là app desktop thật: `colautool.app` trên macOS, mở bằng cách bấm đúp. Code cũng chạy được trên Windows và Linux, xem [Windows và Linux](#windows-và-linux). Bản cài cho cả ba hệ được build trên GitHub Actions, xem [CI/CD và phát hành](#cicd-và-phát-hành). Lõi giao thức và bot viết bằng Rust. Giao diện là project Tauri 2 chuẩn: React + TypeScript + Vite trong `app/desktop`, phần Rust trong `app/desktop/src-tauri`. Cách dùng:
1. Thêm nhiều nick.
2. Bấm đăng nhập: từng nick, hoặc tất cả cùng lúc.
3. Khi vào được game, app hiện:
   - cấp, HP, EXP của cấp, xu;
   - chỉ số chiến đấu và điểm tiềm năng, có ngay lúc đăng nhập;
   - map và khu đang đứng (dạng chữ);
   - số người khác trong khu, kèm tên và cấp từng người.
4. Xem nhiệm vụ chính đang làm: các bước, bước đang làm, tiến độ. Bấm **▶** ở cuối dòng bước đang làm để bot chỉ làm bước đó rồi dừng, hoặc **Tự làm nhiệm vụ** để làm hết các bước: bot tự nói chuyện với NPC, đánh quái và boss của từng bước, và tự qua cổng khi NPC ở map khác. Toast ở góc dưới phải báo lúc bắt đầu và lúc xong hay dừng.
5. Hoặc chọn quái hoặc boss của khu đó, chọn số trận, và app tự đánh.

Code TypeScript trong `src/` vẫn được giữ song song: đó là nơi thử trước, còn Rust chỉ nhận những phần đã chạy được bên TS.

![Cửa sổ app với dữ liệu mẫu](app.png)

*Ảnh chụp app đã đóng gói chạy với `--sample` (dữ liệu mẫu, không kết nối, xem [Chạy](#chạy)), cửa sổ 1280 × 860. Chỉ số của nick đầu là số `s2c/9` trả về ở lần đăng nhập ngày 30/10/2026. Nhiệm vụ 9 và tiến độ Cóc Xanh 14/15 là chỗ nick thật đang dừng ([10-quests](../../app/events/10-quests.md)). Kết quả bot, tên người chơi xung quanh và trận đấu là dữ liệu bịa.*

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
    src/world.rs            ← src/world.ts: s2c/43, 11, 13, 1177, 1256, 10; người chơi trong khu (1263, 1167, 1170, 1253);
                            nhiệm vụ (39, 34, 35)
    src/battle.rs           ← src/battle.ts: bàn 8×8, cascade, bestMove, gói trận
    src/runner.rs           ← src/battle-runner.ts: một trận, học thông số hai bên
    src/quest.rs            ← stepAction của src/quest.ts: bước nhiệm vụ đòi làm gì
    src/bot.rs              ← QuestBot của src/quest.ts: trạng thái nhân vật, việc "đánh X N lần" (--farm),
                            "Tự làm nhiệm vụ"
    src/net.rs              ← FLOW của src/client.ts: đăng nhập, heartbeat, Manager nhiều nick (tokio)
    src/atlas.rs            ← src/atlas.ts: data/maps.json, những gì phiên thấy thêm, đường qua cổng (không ghi file)
    src/accounts.rs         accounts.json, .env
    src/bin/cllt.rs         CLI không giao diện: status, fight, quest
    tests/parity.rs         so với vectors.json
    tests/vectors.json      sinh từ TS
  desktop/                project Tauri 2 (cấu trúc của create-tauri-app, template react-ts)
    package.json            dev, build (tsc && vite build), tauri, app, sample
    index.html, vite.config.ts, tsconfig.json
    app-icon.png            nguồn icon mẫu số 4 (xanh rêu, bông lau giấy màu kem), dùng chung cho logo giao diện;
                            `npm run tauri icon app-icon.png` sinh bộ icon nền tảng trong src-tauri/icons
    src/                    giao diện React + TypeScript
      main.tsx, App.tsx       gốc: thanh bên, trang nick, hộp thêm nick
      types.ts                kiểu dữ liệu Rust gửi sang (bản sao của src-tauri/src/view.rs)
      api.ts                  gọi lệnh Tauri và nghe sự kiện "accounts", "log"; ngoài Tauri thì đọc public/sample.json
      store.ts                store zustand: nick theo id và thứ tự, nick đang chọn, hộp thoại đang mở, nhật ký;
                              các selector selectedAccount, selectedLog, inGame
      hooks.ts                useSync: đổ sự kiện Tauri vào store (mọi nick, rồi nhật ký của nick đang chọn)
      updates.ts              hàm thuần cho store: nghe trước rồi mới lấy state, gộp cập nhật theo revision, nối nhật ký
                              theo số dòng
      format.ts               số kiểu Việt (14.238), màu trạng thái, tiến độ cấp
      styles/                 tokens.css (màu, font, bo góc), base.css
      components/             thành phần dùng chung, không biết gì về game, mỗi cái một .tsx + .css:
                              Button, Icon, Badge, Pill, Bar, Avatar, Card, Chip, Stepper, StatTile, Tabs, TextField,
                              Dialog (khung hộp thoại), Menu (menu chuột phải)
      views/                  các phần của app: Sidebar, AccountCard, AccountPage, HeroCard, MetricRow, StatsCard,
                              PlayersCard, QuestCard, FightCard, LogCard, AccountDialog (thêm và sửa nick),
                              ConfirmDialog (hỏi trước khi xoá), EmptyState
      assets/fonts/           Silkscreen (chữ pixel cho số) và Be Vietnam Pro (chữ tiếng Việt), cả hai OFL
    src-tauri/              crate cllt-desktop
      tauri.conf.json         cửa sổ, CSP, bundle (mọi định dạng của hệ đang build)
      tauri.macos.conf.json   riêng macOS: chỉ đóng gói .app (ký ad-hoc)
      capabilities/           quyền của cửa sổ: sự kiện, kéo cửa sổ
      icons/                  sinh bằng `tauri icon`
      src/main.rs, lib.rs     điểm vào; lib.rs dựng app Tauri và đọc cờ dòng lệnh
      src/commands.rs         lệnh giao diện gọi được: state, logs, login, logout, login_all, logout_all, fight, stop,
                              add_account, update_account, remove_account
      src/app.rs              danh sách nick và session; luồng flusher gửi giao diện những nick vừa đổi ("accounts")
                              và dòng nhật ký mới ("log"); ghi accounts.json ngoài khoá chung
      src/view.rs             Snapshot → AccountView mà giao diện nhận
      src/paths.rs            accounts.json, data/maps.json
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
cargo run -p cllt-core --bin cllt -- quest [--account=TÊN] [--max-losses=1]   # tự làm nhiệm vụ tới khi dừng, rồi thoát
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

- Thêm, sửa, xoá nick trong app đều ghi vào file này; mở app lên là danh sách nạp lại đúng như đã lưu, đúng thứ tự.
- Sửa nick mà để trống mật khẩu thì giữ mật khẩu cũ (giao diện không bao giờ nhận mật khẩu). Nick đang đăng nhập chỉ dùng thông tin mới từ lần đăng nhập sau.
- Không thêm được một nick hai lần trên cùng máy chủ (tên đăng nhập không phân biệt hoa thường), vì hai phiên của một nick sẽ đá nhau.
- Biến `CLLT_ACCOUNTS` đổi đường dẫn file.
- Chưa có file thì app bắt đầu với danh sách trống. App không đọc `.env` nữa; chỉ CLI `cllt` còn dùng `CLLT_USERNAME`/`CLLT_PASSWORD` trong `.env` khi chưa có file.
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

Style **Pixel RPG** (kiểu "Pixel Art" của skill `ui-ux-pro-max`), chọn từ 4 mockup (Sơn mài, Giấy dó, Tối giản, Pixel RPG):
- **Màu:** bảng màu dịu, độ bão hoà 30–55 %, nền `#16181D`. Mỗi con số có một màu riêng: HP đỏ, EXP xanh dương, xu vàng, điểm tiềm năng xanh lá. Nút chính màu vàng chữ tối. Mọi cặp chữ/nền đạt tương phản từ 4,5:1 trở lên.
- **Khối:** viền 2–3 px cắt góc theo pixel (`clip-path`), bóng đổ bậc ở góc dưới phải, không bo tròn, không gradient. Thanh HP/EXP chia đốt 6 px. Hiệu ứng nhảy theo bước (`steps()`), tắt khi hệ thống bật giảm chuyển động.
- **Cỡ:** chữ thường 13 px, chú thích 11 px, nhãn viết hoa 10 px; nút cao 32 px (nút nhỏ 26 px); thanh bên rộng 252 px.
- **Font:** Silkscreen (chữ pixel) chỉ cho số và nhãn ASCII (`LV 21`, `14/15`, giờ trong nhật ký), vì nó không có dấu tiếng Việt. Mọi chữ còn lại dùng Be Vietnam Pro. Cả hai đóng gói trong app, CSP không cho tải font ngoài.
- **Icon:** SVG nét 2 px, không dùng emoji.
- **Cách viết:** màu, khung và font chỉ khai báo trong `src/styles/tokens.css` (`--notch`, `--bevel`, `--font-pixel`…); component dùng biến CSS, không ghi mã màu rời. Thành phần bị cắt góc vẽ viền focus vào trong (`outline-offset` âm), vì `clip-path` che mất viền vẽ ra ngoài.
- **Bàn phím, trình đọc màn hình:** không lồng control trong control. Trên thẻ nick, tên nick là nút chọn (kèm mô tả vị trí và trạng thái), nút đăng nhập/thoát nằm cạnh; bấm chuột vào chỗ khác trên thẻ cũng chọn. Tab Nhiệm vụ / Đánh quái theo mẫu tabs của WAI-ARIA: `tabpanel` có `aria-labelledby`, mũi tên trái phải, Home, End để đổi tab.

| Vùng | Nội dung |
|---|---|
| Thanh bên | Logo, số nick và số nick đang trong game, "Thêm nick". Mỗi nick là một thẻ: avatar màu theo tên và chấm trạng thái, tên, cấp, map và khu (hoặc lời báo lỗi), chip trạng thái, thanh HP, số người trong khu, nút đăng nhập/thoát riêng. **Chuột phải** (hoặc phím Menu, Shift+F10) mở menu của nick: Đăng nhập, Đăng xuất hoặc Huỷ đăng nhập tuỳ trạng thái; Sửa nick; Xoá nick (chỉ khi đã thoát, có hỏi lại). Dưới cùng: "Đăng nhập tất cả", thoát tất cả |
| Thẻ nhân vật | Tên, cấp, trạng thái (Ngoại tuyến / Đang kết nối / Trực tuyến / Đang đánh / Làm nhiệm vụ / Lỗi), giờ vào game. **Vị trí** dạng chữ: tên map, mã map, khu, x/y. **Xung quanh**: số người khác trong khu. Nút Đăng nhập/Đăng xuất, Xoá nick (có hỏi lại) |
| 3 ô | HP; kinh nghiệm (EXP / mốc cấp, %, còn bao nhiêu lên cấp); xu |
| Chỉ số | Tấn công, Phòng thủ, Chính xác, Né tránh, Chí mạng; số điểm tiềm năng chưa cộng, 4 tiềm năng Cường lực, Thân pháp, Nội lực, Thể lực (thứ tự đo ở P1, [user-data](../../app/user-data.md#đuôi-s2c9)), rồi số điểm kỹ năng chưa dùng. Chưa cộng điểm được từ app: `c2s/10` mới đo mã của Cường lực (0) và Thân pháp (2), còn Nội lực (1) và Thể lực (3) là suy luận ([12-skills-items](../../app/events/12-skills-items.md#điểm-tiềm-năng)) |
| Xung quanh | Người chơi khác trong khu, cấp cao xếp trước. Cấp cao hơn mình tô đỏ, bằng tô vàng, thấp hơn tô xanh. Khi `s2c/1263` có bản ghi người chơi chưa đọc được, số người hiện `?` thay vì một con số sai |
| Tab Nhiệm vụ | Tên và số nhiệm vụ chính, bước đang làm trên tổng số bước. Từng bước: xong (ô xanh có dấu tích, số con đủ như 15/15), đang làm (ô vàng, viền vàng, thanh tiến độ khi bước cần nhiều con hoặc nhiều sát thương), chưa làm (ô trống). Cuối dòng của mỗi bước chưa xong có nút ▶: vàng ở bước đang làm, mờ ở các bước sau vì server chỉ tính bước đang làm. Khi bước đang chạy, ▶ của nó thành ■ để dừng. Dòng việc bot đang làm, thắng/thua, EXP/xu, số nhiệm vụ đã xong; lý do dừng khi đã dừng. Tự làm nhiệm vụ, Dừng, số trận thua cho phép (dùng cho cả ▶). Cảnh báo cộng điểm tiềm năng chỉ hiện khi nhiệm vụ còn bước đó. Danh sách bước tự cuộn tới bước đang làm khi cửa sổ thấp |
| Tab Đánh quái | Quái và boss của khu, boss xếp trước, có huy hiệu BOSS; số trận (ô − + và nút nhanh 5/10/20/50); số trận thua cho phép; Bắt đầu, Dừng; tiến độ, thắng/thua, EXP/xu đã nhận; HP hai bên trong trận |
| Nhật ký | Từng trận, từng bước nhiệm vụ và thông báo server theo giờ: thắng và trả nhiệm vụ xanh, thua/lỗi đỏ, bắt đầu/kết thúc/nhận nhiệm vụ vàng; giữ 500 dòng mỗi nick |
| Toast | Góc dưới phải, của mọi nick (tên nick ở dòng đầu): bắt đầu làm bước hay tự làm nhiệm vụ (xanh lam), xong bước (xanh lá), dừng vì lý do khác (đỏ, kèm lý do). Tự ẩn sau 3,5 / 4,5 / 6 s, dừng đếm khi rê chuột lên, có nút đóng; tối đa 4 cái. Vùng chứa là `aria-live="polite"` nên trình đọc màn hình đọc từng toast mà không lấy focus |

- **Đăng nhập:**
  - Mỗi nick có một kết nối TCP riêng trên tokio (`Manager` của core).
  - `s2c/9`, `29`, `11`, `43` phải đọc được thì phiên mới sang Trực tuyến; gói nào hỏng thì phiên báo Lỗi, ghi rõ opcode. Riêng `s2c/1263` chỉ là danh sách người chơi khác: đọc hỏng thì vẫn vào game, nhưng số người xung quanh hiện `?`. Cả hai cách làm giống client TS (`src/client.ts`).
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
- **Trận mở muộn:** mỗi `s2c/22` được gắn với thách đấu nó trả lời, theo mob ID có trong gói (thách đấu chưa có trả lời được giữ 60 s).
  - Trận của thách đấu gửi trước khi bấm Dừng, trước khi đổi việc, hay đã quá 8 s vẫn được đánh tới hết. Server đã mở trận đó và không rời được; bỏ mặc thì mỗi lượt tự hết sau 34 s trong khi quái vẫn đánh, tới khi thua ([05-battle](../../app/events/05-battle.md)). Trận đó tính cho việc đã gửi thách đấu, không tính cho việc hiện tại.
  - `s2c/22` không ứng với thách đấu nào của phiên thì bỏ qua. `s2c/22` thứ hai đến khi đang đánh cũng bỏ qua, không thay trận đang đánh.
- **Mỗi lượt:** bot chọn nước bằng `bestMove` (chiến lược `kill`), và trong trận học sát thương mỗi viên của cả hai bên, như bot TS ([07-auto-battle](../../app/events/07-auto-battle.md#thuật-toán-của-bot)).

## Tự làm nhiệm vụ

`bot.rs` chơi các bước của `s2c/39` theo đúng `QuestBot` bên TS ([Bot làm nhiệm vụ](../nodejs/quest-bot.md#bot-làm-gì-với-từng-bước)). Server chỉ gửi **nhiệm vụ chính đang làm**; tab Phụ, Hằng ngày, Bảo Điển hiện đều trống ([10-quests](../../app/events/10-quests.md#trả-lời-nhanh)), nên app chỉ hiện được nhiệm vụ đó.

| Bước | Bot làm gì |
|---|---|
| "Nói chuyện với X", "Báo cáo với X", "Gặp X", "Bàn bạc với X" | `c2s/13 (mapId, npcId)`; `s2c/34` trả lời thì sang bước sau. Không trả lời trong 8 s thì dừng |
| "Tiêu diệt X", "Đánh bại X" | `c2s/15` lần lượt từng con tên X. Mỗi trận thắng tính 1, rồi số của server (`s2c/1201`) thay số tự đếm |
| "Gây N sát thương lên X" | Boss X (`s2c/1177`) bằng `c2s/1178`; thắng hay thua đều cộng sát thương; thua boss không làm bot dừng |
| "Đạt cấp độ N" | Chưa đủ cấp: đánh loại quái mạnh nhất không quá cấp mình, không chọn boss |
| "Nâng điểm tiềm năng" | `c2s/10 (0, 1)`: cộng 1 điểm vào Cường lực |
| NPC hoặc quái ở map khác | Qua cổng: `c2s/13 (mapId, id cổng)` → `s2c/13` → `c2s/11` → `c2s/43`. Cổng đầu tiên trên đường ngắn nhất theo `data/maps.json` cộng những gì phiên đã thấy, nếu không thì cổng tên nhiệm vụ nhắc tới, nếu không thì cổng tới map chưa đi; tối đa 6 cổng một bước. Cổng bị từ chối (`s2c/1256`) bị bỏ qua |
| Quái của bước có ở map này nhưng chưa thấy (boss đang đổi chỗ) | Đợi 5 s, tối đa 6 lần |
| Bước khác (vd. "Sử dụng điểm kỹ năng") | Dừng, ghi rõ bước nào. Bot TS đã làm được bước này (`c2s/1191`, [12-skills-items](../../app/events/12-skills-items.md#c2s-1191)); app Rust chưa port. `vectors.json` đã có phần cần cho việc port: `skillTable`, `characterSkills`, `characterStats` kiểu 32, `c2s/1191` và `c2s/30` theo hệ, kịch bản "skill step". Bốn test parity sẽ đỏ cho tới khi port xong |

- **Trả nhiệm vụ:** server gửi `s2c/35` (phần thưởng, ghi vào nhật ký), rồi `s2c/39` của nhiệm vụ mới; bot làm tiếp nhiệm vụ mới.
- **Dừng khi:** bấm Dừng (đang có trận thì chọn đánh nốt hay đầu hàng, xem [Dừng giữa trận](#dừng-giữa-trận)), thua đủ số trận cho phép (không tính trận thua boss), gặp bước chưa biết, không còn quái của bước ở khu, NPC hay cổng không trả lời trong 8 s, đã đủ cấp mà server không sang bước sau, hoặc không đọc được NPC và cổng của map vừa tới (`s2c/11`; khi đó bản đồ trong atlas giữ nguyên, không bị ghi thành map rỗng).
- **Chuyển việc:** bắt đầu đánh quái thì việc làm nhiệm vụ dừng, và ngược lại.
- **Bản đồ:** mỗi phiên chép `data/maps.json` lúc mở app, rồi ghi thêm map, quái, boss, cổng đã qua hay bị từ chối vào bản chép đó. App không ghi lại file; `npm run scan` và bot TS mới ghi.

### Làm một bước

Nút ▶ trên một bước gửi `Command::Quest { step: Some((id nhiệm vụ, i)) }`, port từ `QuestBot` với `--once` ([Bot làm nhiệm vụ](../nodejs/quest-bot.md#chạy)). Bot làm bước `i` như bảng trên. Khi nhiệm vụ đã qua bước đó, hoặc có nhiệm vụ mới sau khi báo cáo, bot dừng với "Xong bước \"…\"" (`QuestRun.stepDone`). Nhiệm vụ qua bước khi NPC trả lời, có `s2c/39` mới, hoặc đủ số con hay đủ sát thương. Bước đủ số con từ trước thì dừng luôn, không gửi gói nào. Bot không đi tiếp sang bước sau. Nếu nhiệm vụ lùi về bước trước (chưa từng thấy) thì bot dừng với "Nhiệm vụ không còn ở bước \"…\"", không tính là xong. Các lý do dừng khác vẫn như trên.

Server chỉ tính tiến độ cho bước đang làm, nên chỉ ▶ của bước đó bấm được. Nếu UI chậm một nhịp và gửi một bước không còn là bước đang làm của nhiệm vụ đó, hoặc bước của một nhiệm vụ đã trả, bot từ chối ("Bước đó không còn là bước đang làm") và không gửi gói nào. Bắt đầu một lần chạy khi lần trước chưa xong thì lần trước kết thúc với "Đã bắt đầu lần chạy mới". Mỗi lần chạy có `QuestRun.id` riêng, nhờ đó UI biết một lần chạy mới bắt đầu hay vừa kết thúc để hiện toast. Nick rời game giữa chừng (thoát, mất kết nối, lỗi) cũng có toast "Bot dừng: …".

### Dừng giữa trận

Bấm Dừng (hay ■ trên bước) lúc không có trận thì việc dừng ngay. Lúc đang có trận, app hỏi (focus ở Huỷ, Enter không làm mất EXP):

| Chọn | Bot làm gì |
|---|---|
| **Đợi xong trận** | Việc dừng ngay, trận được đánh nốt và vẫn tính (thắng cộng EXP và tiến độ, thua mất EXP). Trong lúc đó nút Dừng vẫn bấm được để đổi ý đầu hàng |
| **Đầu hàng** | `Command::Stop { surrender: true }`: gửi `c2s/11` (map) rồi `c2s/40` (uuid trận) như nút "Đầu hàng" của game ([06-map-mobs](../../app/events/06-map-mobs.md#đầu-hàng)), rồi không đi nước nào nữa; hộp thoại hiện "Đang chờ server nhận đầu hàng". `s2c/11` trả lời `c2s/11` thì gửi `c2s/43` như game. Trận xong khi có `s2c/1214` (có ở mọi lần đo) hoặc `s2c/36`, kể cả khi đến muộn. Không có trong 8 s thì đánh tiếp, bắt đầu bằng lượt đã đến trong lúc chờ. Server trừ EXP ("Rời trận, mất 29 kinh nghiệm" ở B3) và trang bị mòn thêm |
| Huỷ | Không dừng gì |

Cách khác để bỏ trận mà không mất EXP là Đăng xuất: trận dở không được tính, HP giữ mức lúc rời ([10-quests](../../app/events/10-quests.md#boss)). Port từ `--surrender-after` của bot TS ([Bot làm nhiệm vụ](../nodejs/quest-bot.md#chạy)); **chưa thử với server thật**.

## Đã kiểm chứng

| Phần | Cách kiểm |
|---|---|
| Giao thức | Seed, handshake, frame gửi/nhận khi gói bị cắt nhỏ tuỳ ý, 16 vector mật khẩu, 5 payload đăng nhập: khớp từng byte |
| Request | 17 request so byte với `buildRequest`, có `c2s/10` (cộng điểm tiềm năng) |
| Giải mã | 32 gói thật hoặc dựng theo bố cục TS, có 4 gói nhiệm vụ thật (`s2c/39` nhiệm vụ 3 và 4, `s2c/34`, `s2c/35`), trong đó có ba `s2c/9` đủ phần đuôi (A2 cấp 3, 30/10 cấp 21, nick thứ hai 31/10 với `field01` = 4), `s2c/1263` (18 người) và `s2c/1167`: kết quả JSON giống hệt bản TS |
| Người trong khu | `ZonePlayers` nhận lần lượt `1263`, `1170`, `1170`, `1167`, `1253` thật: danh sách sau mỗi gói (id, tên, cấp, thứ tự) giống bản TS |
| Bàn cờ | 3 trận bắt được, 52 bước: bàn, số viên ăn, số đợt, lượt thêm sau mỗi bước giống bản TS |
| `bestMove` | 55 thế cờ, đổi HP, nội lực, sức mạnh và chiến lược: cùng nước, cùng điểm tới bit cuối |
| Trận, bot | Vào trận → lượt quái → nước của mình → kết thúc; học thông số; boss `c2s/1178`, đợi boss đổi chỗ; dừng khi thua đủ. Trận mở muộn: tính cho việc đã gửi thách đấu chứ không cho việc mới; sau Dừng vẫn đánh hết; `s2c/22` không do app mở hay đến khi đang đánh thì bỏ qua. Map đọc hỏng thì dừng tự làm nhiệm vụ và không ghi map rỗng vào atlas |
| Bước nhiệm vụ, đường qua cổng | `stepAction` của 11 câu bước; `route`, `destination`, `portalsOf` trên bản đồ 3 map (M1, M2, M25) với cả ba kiểu trả lời của cổng: cùng kết quả bản TS |
| Bot nhiệm vụ | 14 kịch bản TS chạy `QuestBot` với gói thật hoặc dựng theo bố cục: nói chuyện → `s2c/34` → đánh; boss; đợi boss đổi chỗ; qua cổng tên nhiệm vụ nhắc tới; cổng bị từ chối; đường đã biết qua 2 map; đủ số con thì sang bước báo cáo; cày cấp không chọn boss; cộng điểm tiềm năng; bước lạ thì dừng; trả nhiệm vụ rồi làm nhiệm vụ mới; một bước (`--once`): NPC trả lời thì dừng trước bước đánh quái; một bước đã đủ số con thì dừng trước bước báo cáo. Bản Rust gửi đúng từng gói sau mỗi bước, và bảng cổng cuối cùng giống hệt. Thêm 3 test Rust: thắng một trận Cóc Xanh thì tiến độ 14 → 15 rồi sang báo cáo; thua thì không tính và dừng; ▶ trên Cóc Xanh 14/15 thắng một trận thì dừng ở "Xong bước", còn ▶ trên bước đã qua thì bị từ chối, không gửi gói nào |
| Lưới bản đồ | `mapGrid` của M2 (35 × 90 ô, lớp hình và lớp va chạm) giống bản TS từng byte |
| Server thật (30/10/2026) | Bot TS đăng nhập chỉ đọc: đuôi `s2c/9` cho EXP 14238 trong mốc 13841–15882, xu 2664, x/y trùng `s2c/11`; `s2c/1263` có 8 người, không có mình. `cllt status`: manina cấp 21, HP 180/180, M2 khu 0, 8 mục tiêu (2 boss). `cllt fight --target="Heo Mọi" --count=1`: thắng sau 21 lượt, gây 234 sát thương, +92 EXP, +12 xu, HP tối đa của Heo Mọi học được là 146 |
| Đăng nhập, server giả | 5 test trong `net.rs` chạy phiên thật với một server TCP cục bộ trả lời từng bước đăng nhập: đủ gói thì Trực tuyến; `s2c/11` hay `s2c/43` hỏng thì Lỗi có ghi opcode; `s2c/1263` hỏng thì vẫn Trực tuyến với `players_unread`; Đăng xuất khi đang chờ seed hoặc khi server im ở bước bản đồ thì phiên dừng ngay, không đợi hết giờ 8 s. Đã thử bỏ việc đọc `s2c/11` và đường Đăng xuất lúc chờ seed: 2 test tương ứng báo lỗi |
| Nick | Test Rust: `accounts.json` ghi xong mới thêm, sửa hay xoá nick; sửa mà để trống mật khẩu thì giữ mật khẩu cũ; thêm trùng nick thì báo lỗi; file đọc lỗi thì không ghi đè, và xoá thất bại thì báo lỗi ngay trong hộp hỏi lại (hộp không đóng, nick còn nguyên). Ảnh chụp bản xem thử: menu chuột phải của nick đang chơi (Đăng xuất, Sửa, Xoá bị khoá) và của nick lỗi (Đăng nhập, Sửa, Xoá), hộp Sửa nick, hộp hỏi lại khi xoá |
| Cập nhật giao diện | Test Rust: một lần gửi chỉ gồm nick đã đổi, mang đúng revision, có thứ tự nick khi xoá; `accounts.json` ghi xong mới thêm hoặc xoá nick, file đọc lỗi thì không ghi. [desktop-updates.test.ts](../../../test/desktop-updates.test.ts): sự kiện Trực tuyến đến trước phản hồi `state` cũ hơn thì giao diện vẫn hiện Trực tuyến; gộp cập nhật giữ nguyên object của nick không đổi và mảng thứ tự. Bản xem thử chạy store thật: chọn nick, cập nhật một nick (thẻ khác giữ nguyên), bỏ cập nhật cũ, xoá nick khỏi thứ tự, menu chuột phải không tự đóng khi trang tự cuộn |
| Giao diện Tauri, server thật | Mở `Cờ Lau Loạn Thế.app` đã đóng gói với `--login-all`, chụp cửa sổ sau 9 s: "Trực tuyến", cấp 21, HP 180/180, EXP 14.238 / 15.882 (19,5%), xu 2.664, 68 điểm tiềm năng, 19 điểm kỹ năng, 5 chỉ số chiến đấu, Trại Vân Sơn · M2 · Khu 1 · x 2784 · y 864, 13 người xung quanh có tên và cấp, 2 boss và các loại quái trong danh sách đánh. Không đánh trận nào |
| Giao diện, cỡ cửa sổ | Ảnh chụp với dữ liệu mẫu ở 1280 × 860 (vừa khít, thẻ cuối tự cuộn bên trong) và 1080 × 720 (cỡ nhỏ nhất; bố cục hẹp, trang cuộn). `--sample` trên app thật: dữ liệu đi qua lệnh Tauri, CSP không chặn gì |

## Giới hạn

- **Boss qua `c2s/1178`:** cả TS lẫn Rust mới chạy với gói thật bắt từ điện thoại (B4) và với test, **chưa đánh boss thật**. Đứng xa boss có thách đấu được không thì vẫn chưa rõ ([10-quests](../../app/events/10-quests.md#boss)).
- **Nhiều nick cùng một IP:** chưa thử, cần thêm nick thứ hai. Phía app, mỗi nick đã là một kết nối độc lập.
- **Nhãn chỉ số:** "Tấn công" và "Phòng thủ" khớp số đo. "Chính xác", "Né tránh", "Chí mạng" và thứ tự Cường lực / Thân pháp / Nội lực / Thể lực của `stats` đã đo ở P1 ([user-data](../../app/user-data.md#đuôi-s2c9)). Số của `c2s/10` theo thứ tự khác: 0 Cường lực, 1 Nội lực, 2 Thân pháp, 3 Thể lực.
- **Vị trí:** là x/y lúc vào map. App không cho nhân vật đi lại, nên vị trí chỉ đổi khi sang map khác.
- **Trang bị:** app không sửa trang bị có độ bền 0. Gói sửa là `c2s/48` và mỗi lần tốn 1 Búa sửa chữa ([12-skills-items](../../app/events/12-skills-items.md#c2s-48)); chưa cài.
- **Windows và Linux:** mới kiểm tra `cargo check` chéo của `cllt-core` cho `x86_64-pc-windows-msvc` và `x86_64-unknown-linux-gnu`. Phần Tauri chưa chạy thử trên hai hệ này; [build-matrix.yml](#cicd-và-phát-hành) sẽ là lần build đầu tiên.
- **Nhiệm vụ:**
  - Bot dừng ở bước "Sử dụng điểm kỹ năng". Bot TS đã làm được bước này, phía Rust chưa port.
  - `requests.rs` vẫn ghi `c2s/30` là 1, nên nhân vật hệ Thủy nhận nhầm cây Hỏa. Phải gửi `field01` của `s2c/9`, như client TS.
  - Điểm tiềm năng luôn cộng vào Cường lực. Bot TS có `--stats` để cộng hết điểm theo hệ hoặc theo tỉ lệ; `vectors.json` có hai kịch bản "stats …" cho việc port.
  - Server chưa gửi nhiệm vụ phụ hay hằng ngày. Nhiệm vụ hằng ngày phải tự nhận ở Hương Lão Trần Bá (Cẩm nang), gói chưa bắt.
  - HP chỉ hồi đầy sau một trận thua; bot chưa dùng Hoàn Linh Dược (gói chưa biết) và chưa sửa đồ.
- **Chưa port:** app không mua bán, không chat, không tự đổi map ngoài lúc làm nhiệm vụ. Quét map và ghi `data/maps.json` vẫn chỉ có bên TS.
