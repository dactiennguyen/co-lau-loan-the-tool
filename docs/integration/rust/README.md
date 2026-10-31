# App Rust: nhiều nick, Tauri + TypeScript

`app/` là app desktop thật: `colautool.app` trên macOS, mở bằng cách bấm đúp. Code cũng chạy được trên Windows và Linux, xem [Windows và Linux](#windows-và-linux). Bản cài cho cả ba hệ được build trên GitHub Actions, xem [CI/CD và phát hành](#cicd-và-phát-hành). Lõi giao thức và bot viết bằng Rust. Giao diện là project Tauri 2 chuẩn: React + TypeScript + Vite trong `app/desktop`, phần Rust trong `app/desktop/src-tauri`. Cách dùng:
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
                              Button, Icon, Badge, Pill, Bar, Avatar, Card, Stepper (ô số gõ được), StatTile, Tabs, TextField, Hint (dấu ? có lời giải thích),
                              ItemSlot (một ô túi đồ), Dialog (khung hộp thoại), Menu (menu chuột phải)
      views/                  các phần của app: Sidebar, AccountCard, AccountPage, HeroCard, MetricRow, StatsCard,
                              PlayersCard, QuestCard, FightCard, FightSettingsCard (Cài đặt), InventoryCard và ItemDetail
                              (Túi đồ), SkillsCard (Kỹ năng), LogCard, AccountDialog (thêm và sửa nick), ConfirmDialog (hỏi trước khi
                              xoá), EmptyState
      itemIcons.ts, skillIcons.ts  icon vật phẩm và kỹ năng của data/icons, Vite gom vào bản build
      assets/fonts/           Silkscreen (chữ pixel cho số) và Be Vietnam Pro (chữ tiếng Việt), cả hai OFL
    src-tauri/              crate cllt-desktop
      tauri.conf.json         cửa sổ, CSP, bundle (mọi định dạng của hệ đang build), khoá công khai và địa chỉ của
                              updater
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
      src/update.rs           tự cập nhật từ GitHub Releases (tauri-plugin-updater), xem Tự cập nhật
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
cargo run -p cllt-core --bin cllt -- skill [--account=TÊN] [--id=1001]  # in cây kỹ năng; có --id thì Nâng cấp 1 lần (tốn điểm)
cargo run -p cllt-core --bin cllt -- item [--account=TÊN] [--equip=Ô | --unequip=Ô | --use=Ô | --repair=Ô]
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
| `proxy` | không | `{ "enabled": true, "kind": "socks5", "host": "1.2.3.4", "port": 1080, "username": "…", "password": "…" }` (`kind` là `socks5` hoặc `http`). Tắt (`enabled: false`) thì vẫn giữ để bật lại; xem [Proxy](#proxy) |

- Thêm, sửa, xoá nick trong app đều ghi vào file này; mở app lên là danh sách nạp lại đúng như đã lưu, đúng thứ tự.
- Mở Sửa nick thì mật khẩu game và mật khẩu proxy đã điền sẵn, ẩn dưới dấu chấm; nút con mắt ở cuối ô bật/tắt hiển thị. Hộp hỏi chúng bằng lệnh `account_secrets` lúc mở; sự kiện `accounts` và nhật ký không bao giờ mang mật khẩu. Xoá trống ô mật khẩu thì vẫn giữ mật khẩu cũ (mật khẩu proxy cũng vậy, khi tài khoản proxy giữ nguyên). Nick đang đăng nhập chỉ dùng thông tin mới từ lần đăng nhập sau.
- Không thêm được một nick hai lần trên cùng máy chủ (tên đăng nhập không phân biệt hoa thường), vì hai phiên của một nick sẽ đá nhau.
- Biến `CLLT_ACCOUNTS` đổi đường dẫn file.
- Chưa có file thì app bắt đầu với danh sách trống. App không đọc `.env` nữa; chỉ CLI `cllt` còn dùng `CLLT_USERNAME`/`CLLT_PASSWORD` trong `.env` khi chưa có file, hoặc khi `--account` gọi đúng nick của `.env` mà file không có.
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

Có hai workflow trong `.github/workflows`, làm theo cách của [cockpit-tools](https://github.com/jlcodes99/cockpit-tools). Có tự cập nhật ([Tự cập nhật](#tự-cập-nhật)), nhưng chưa ký số Apple hay Windows:

| Workflow | Chạy khi | Làm gì |
|---|---|---|
| [build-matrix.yml](../../../.github/workflows/build-matrix.yml) | push lên `main`, mở pull request, hoặc bấm tay (Run workflow) | `npm test`; `cargo fmt`, `cargo clippy -D warnings`, `cargo test` trên Ubuntu; qua hết mới build app trên 4 máy song song. Có khoá updater trong Secrets thì mỗi bản build có thêm file cập nhật và `.sig`; pull request từ fork không có Secrets nên build không ký. File build nằm 14 ngày trong mục Artifacts của lần chạy |
| [release.yml](../../../.github/workflows/release.yml) | đẩy tag `v*` | Kiểm tra tag khớp version, gọi build-matrix.yml (chuyển Secrets sang), rồi tạo GitHub Release gồm mọi file, `.sig`, `SHA256SUMS.txt`, `latest.json` cho updater và [ghi chú cài đặt](../../../.github/release-notes.md). Thiếu chữ ký của một nền tảng nào thì dừng, không phát hành |

| Máy build | Target | File |
|---|---|---|
| `macos-latest` | `aarch64-apple-darwin` | `colautool_<version>_macos_aarch64.dmg`, `.app.zip`, và `.app.tar.gz` (file updater tải) |
| `macos-latest` (build chéo) | `x86_64-apple-darwin` | `colautool_<version>_macos_x64.dmg`, `.app.zip`, `.app.tar.gz` |
| `windows-latest` | `x86_64-pc-windows-msvc` | `colautool_<version>_windows_x64-setup.exe`, `.msi`, `_portable.exe` (chạy không cần cài) |
| `ubuntu-22.04` | `x86_64-unknown-linux-gnu` | `colautool_<version>_linux_x64.deb`, `.rpm`, `.AppImage` |

[stage-bundles.mjs](../../../.github/scripts/stage-bundles.mjs) đổi tên file Tauri sinh ra theo một mẫu chung, vì tên gốc lẫn lộn `x64`, `amd64`, `x86_64` và `en-US`. File `.sig` đi theo file của nó, cùng tên thêm `.sig`. [latest-json.mjs](../../../.github/scripts/latest-json.mjs) đọc các file đó để viết `latest.json`.

Phát hành một bản mới, ví dụ 0.1.1:
1. Đặt `version` thành `0.1.1` ở cả ba chỗ: [app/Cargo.toml](../../../app/Cargo.toml), [app/desktop/package.json](../../../app/desktop/package.json), [tauri.conf.json](../../../app/desktop/src-tauri/tauri.conf.json). Nếu tag lệch với bất kỳ chỗ nào, release dừng ngay.
2. Commit với tiêu đề "Release 0.1.1", phần thân ghi những gì đã đổi: phần thân này thành mục **Có gì mới** trong app của người dùng (`notes` của `latest.json`; đoạn cuối chỉ gồm các dòng `Co-Authored-By:`, `Signed-off-by:` thì bị bỏ). Rồi chạy `git tag v0.1.1 && git push origin main v0.1.1`.
3. Release hiện ra sau khi 4 bản build và bước publish xong. Bản đã publish không bao giờ bị ghi đè. Bản nháp do một lần chạy lỗi để lại thì bị thay.

Lưu ý:
- **Tên app là `colautool`** (`productName`), không dấu. Tên có dấu làm hỏng hai loại bộ cài:
  - WiX (`.msi`) chỉ nhận ký tự có trong code page 1252. "ờ", "ạ", "ế" không có trong 1252, và cũng không có trong 1258.
  - `.deb`/`.rpm` lấy tên gói là `productName` viết kebab-case, mà dpkg chỉ nhận a–z, 0–9, `+`, `-`, `.`.

  Tiêu đề cửa sổ vẫn là "Cờ Lau Loạn Thế". Identifier vẫn là `vn.colauloanthe.desktop`, nên thư mục chứa `accounts.json` không đổi.
- **Chưa ký số Apple, Windows:** macOS dùng chữ ký ad-hoc (`signingIdentity: "-"`), nên lần đầu người dùng phải chạy `xattr -cr /Applications/colautool.app`. Windows hiện cảnh báo SmartScreen. Muốn ký như cockpit-tools thì cần chứng chỉ Apple Developer ID và 6 secret `APPLE_*`. Chữ ký của updater (minisign, [Tự cập nhật](#tự-cập-nhật)) là chuyện khác: nó chỉ để app biết bản tải về đúng là của mình.
- **Rust 1.90 cố định** trong CI, để một lint clippy mới của bản stable sau không tự làm hỏng build.
- **Đã thử trên máy (30/10/2026):** build macOS Apple Silicon bằng đúng lệnh của CI ra `colautool.app` 4,8 MB và `.dmg` 2,6 MB. Script gom file và bước kiểm tra tag chạy đúng. Bản Intel, Windows và Ubuntu chỉ build trên GitHub Actions và chưa có lần chạy nào.

## Tự cập nhật

Bản cài của app tự tìm, tải và cài bản mới từ [GitHub Releases](https://github.com/dactiennguyen/co-lau-loan-the-tool/releases), giống [cockpit-tools](https://github.com/jlcodes99/cockpit-tools). Code ở `desktop/src-tauri/src/update.rs`, dùng [`tauri-plugin-updater`](https://v2.tauri.app/plugin/updater/) 2.14. Giao diện chỉ gọi 3 lệnh của app (`update_status`, `check_update`, `install_update`) và nghe sự kiện `update`; không mở quyền của plugin cho giao diện.

**Cách chạy:**
1. 20 giây sau khi mở app, rồi cứ 6 giờ một lần, hoặc khi bấm ⟳, app tải `https://github.com/dactiennguyen/co-lau-loan-the-tool/releases/latest/download/latest.json` (địa chỉ trong `plugins.updater.endpoints` của `tauri.conf.json`). Repo công khai nên không cần token.
2. `latest.json` có `version` mới hơn bản đang chạy thì app tải ngay file của đúng máy và đúng loại bộ cài, kèm thanh tiến độ. Tải xong, app kiểm chữ ký minisign của file với khoá công khai trong `tauri.conf.json` (`plugins.updater.pubkey`). Sai chữ ký thì không cài, báo "chữ ký của bản tải về không khớp". `requireSignedVersion` cũng bật: chữ ký phải ghi đúng phiên bản mà `latest.json` công bố. Nhờ vậy, kẻ sửa được `latest.json` cũng không ép được app cài lùi về một bản cũ, dù bản cũ đó vẫn mang chữ ký thật.
3. Bản đã kiểm được giữ trong bộ nhớ, rồi cài theo một trong hai cách:
   - **Khởi động lại để cập nhật:** app cho mọi nick đăng xuất, cài, rồi mở bản mới. Trên Windows bộ cài NSIS hay MSI chạy ở chế độ `passive` (chỉ có thanh tiến độ), app thoát và bộ cài mở lại app.
   - **Khi tắt app:** app cài trước khi thoát hẳn, lần sau mở là bản mới. Bước này chạy trong luồng riêng, chờ tối đa 30 giây. Trên macOS, app nằm ở thư mục người dùng không ghi được sẽ cần hỏi mật khẩu admin; lúc tắt app thì không hỏi được nữa, nên bản đó để lần sau, app không bị treo. Trên Windows bộ cài chạy rồi không mở lại app. Trên Linux, bản `.deb` và `.rpm` cài bằng `pkexec`, nên hệ thống hỏi mật khẩu (cả khi bấm Khởi động lại lẫn khi tắt app). Bản AppImage thì không hỏi.
4. `accounts.json` và `cllt.db` nằm trong thư mục dữ liệu của app nên cập nhật không đụng tới.

**Bản nào không tự cập nhật:** chỉ bản cài mới tự cập nhật (`.app`, bộ cài NSIS hay MSI, AppImage, `.deb`, `.rpm`). Bộ đóng gói ghi loại bộ cài vào file chạy, và app đọc nó qua `tauri::utils::platform::bundle_type()`. `tauri dev`, `cargo run` và `_portable.exe` không có loại bộ cài, nên tắt hẳn, dòng ở thanh bên ghi "không tự cập nhật". Nếu không tắt, bản portable sẽ cài bộ NSIS đè lên. `--sample` cũng tắt.

**`latest.json`** do [latest-json.mjs](../../../.github/scripts/latest-json.mjs) viết khi phát hành:
```json
{
  "version": "0.3.0",
  "notes": "phần thân của commit Release 0.3.0",
  "pub_date": "2026-11-01T02:00:00.000Z",
  "platforms": {
    "darwin-aarch64-app": { "signature": "<nội dung .sig>", "url": "https://github.com/…/releases/download/v0.3.0/colautool_0.3.0_macos_aarch64.app.tar.gz" },
    "windows-x86_64-nsis": { "…": "…" }
  }
}
```
Updater tìm `{hệ}-{kiến trúc}-{bộ cài}` trước (cài từ `.msi` thì lấy bản `.msi`, cài từ `.deb` thì lấy `.deb`), rồi mới tới `{hệ}-{kiến trúc}`. Có 7 file: `darwin-aarch64-app`, `darwin-x86_64-app`, `windows-x86_64-nsis`, `windows-x86_64-msi`, `linux-x86_64-appimage`, `linux-x86_64-deb`, `linux-x86_64-rpm`. Thêm vào đó là `darwin-aarch64`, `darwin-x86_64`, `windows-x86_64` (NSIS) và `linux-x86_64` (AppImage).

**Khoá ký:**
- Tạo ngày 31/10/2026 bằng `npm run tauri signer generate`. Khoá riêng nằm ở `~/.tauri/colautool.key` trên máy phát triển, mật khẩu ở `~/.tauri/colautool.key.password` (cả hai quyền 600, không bao giờ đưa vào repo). Khoá công khai nằm trong `tauri.conf.json`.
- CI cần hai secret của repo (GitHub → Settings → Secrets and variables → Actions → New repository secret):
  - `TAURI_SIGNING_PRIVATE_KEY`: toàn bộ nội dung file `colautool.key`.
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`: nội dung file `colautool.key.password`.
- Có hai secret đó, build-matrix.yml bật `createUpdaterArtifacts` bằng `--config`, nên Tauri sinh và ký file cập nhật. `tauri.conf.json` không bật sẵn, để `npm run app` trên máy không có khoá vẫn build được.
- **Mất khoá riêng thì các bản đã cài không bao giờ tự cập nhật được nữa:** người dùng phải tải và cài tay một bản có khoá công khai mới. Giữ một bản sao của hai file ở chỗ an toàn (trình quản lý mật khẩu).

**Lưu ý:**
- Bản đầu tiên có tính năng này phải cài tay. Từ bản sau đó, app mới tự cập nhật.
- Khởi động lại thì các nick phải đăng nhập lại, vì server không giữ phiên.
- Bản phát hành không đánh dấu pre-release, vì `releases/latest` bỏ qua bản pre-release.

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
| Tab Thống kê | Lịch sử trận của nick theo **username**, từ `cllt.db`: chọn Hôm nay / 7 ngày / 30 ngày / Tất cả và Mọi trận / Đánh quái / Nhiệm vụ. Sáu ô: số trận (thắng, thua, rời), tỉ lệ thắng, EXP và Xu (cả trung bình mỗi trận), thời gian trong trận, EXP mỗi giờ. Bảng theo từng quái và map: số trận, thắng, tỉ lệ thắng, lượt và thời gian trung bình, EXP mỗi trận. Danh sách trận gần nhất (giờ, quái, map và khu, kết quả, số lượt, thời gian, EXP, xu), **Xem thêm** lấy tiếp 30 trận. Tự hỏi lại khi một trận của nick kết thúc |
| Cập nhật | Ở thanh bên, ngay trên "Đăng nhập tất cả". Bình thường là một dòng nhỏ: phiên bản đang chạy (`v0.2.0`) và nút ⟳ **Kiểm tra cập nhật**; sau khi kiểm tra thì thêm "bản mới nhất" (rê chuột: giờ kiểm tra), hay "không kiểm tra được" màu đỏ kèm lý do bên dưới. Bản chạy từ mã nguồn (`tauri dev`), bản portable và `--sample` ghi "không tự cập nhật" (rê chuột: lý do). Khi có bản mới: khung "Đang tải bản 0.3.0" có thanh tiến độ, %, MB; tải xong thì khung viền vàng "Bản 0.3.0 đã sẵn sàng", "Đang dùng 0.2.0…", **Có gì mới ⌄** (ghi chú của bản, cuộn được) và nút **Khởi động lại để cập nhật**. Đang có nick trong game thì bấm nút sẽ hỏi lại trước: số nick sẽ bị thoát, trận đang đánh bị bỏ dở, và không vội thì bản mới tự cài khi tắt app. Xem [Tự cập nhật](#tự-cập-nhật) |
| Thêm/Sửa nick | Tên đăng nhập, mật khẩu (Sửa nick điền sẵn; nút con mắt hiện/ẩn), tên gợi nhớ, máy chủ, rồi **Kết nối qua proxy** (công tắc Bật/Tắt, lưu cả khi tắt). Bật thì có ô **Dán proxy**, loại SOCKS5/HTTP, địa chỉ, cổng, tài khoản, mật khẩu và nút **Kiểm tra**; xem [Proxy](#proxy). Thẻ nhân vật có nhãn PROXY khi nick đi qua proxy |
| Toast | Góc dưới phải, của mọi nick (tên nick ở dòng đầu): bắt đầu làm bước hay tự làm nhiệm vụ (xanh lam), xong bước (xanh lá), dừng vì lý do khác (đỏ, kèm lý do), nick bị Lỗi (đỏ, kèm lý do: đăng nhập bị từ chối, proxy hỏng, mất kết nối); bản cập nhật vừa tải xong (xanh lá, dòng đầu "Cập nhật"). Tự ẩn sau 3,5 / 4,5 / 6 s, dừng đếm khi rê chuột lên, có nút đóng; tối đa 4 cái. Vùng chứa là `aria-live="polite"` nên trình đọc màn hình đọc từng toast mà không lấy focus |

- **Đăng nhập:**
  - Mỗi nick có một kết nối TCP riêng trên tokio (`Manager` của core).
  - `s2c/9`, `29`, `11`, `43` phải đọc được thì phiên mới sang Trực tuyến; gói nào hỏng thì phiên báo Lỗi, ghi rõ opcode. Riêng `s2c/1263` chỉ là danh sách người chơi khác: đọc hỏng thì vẫn vào game, nhưng số người xung quanh hiện `?`. Khu không có ai khác (M25, 31/10) thì server không gửi `s2c/1263`: sau `s2c/43` đợi 1,5 s rồi vào game với 0 người, có ghi nhật ký. Các cách làm này giống client TS (`src/client.ts`, `snapshotWaitMs`).
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

Port của `src/skills.ts` và bước kỹ năng của `QuestBot`. Cây và cấp kỹ năng đến lúc đăng nhập, không có gói xin riêng ([12-skills-items](../../app/events/12-skills-items.md#tab-kỹ-năng)):

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

- Mọi thứ gắn với **username** viết thường của nick, không gắn với số thứ tự nick trong app: xoá nick rồi thêm lại, hay đổi tên gợi nhớ, lịch sử vẫn còn.
- Bảng `logs`: username, thời điểm (ms), loại, màu, nội dung. Dòng cũ hơn 30 ngày bị xoá mỗi lần mở app.
- Bảng `battles`, mỗi trận một dòng, giữ mãi (khoảng 150 byte một trận): tên và cấp nhân vật, giờ mở trận (`s2c/22`) và giờ xong, map, khu, quái (mã, tên, cấp, boss), nguồn (`fight` việc Đánh quái, `quest` Tự làm nhiệm vụ, `other` trận của thách đấu trước đánh nốt), kết quả (`won`, `lost`, `left` khi Đầu hàng), số lượt của mình, sát thương gây ra, máu lúc mở và lúc xong, EXP, xu. Bot gửi `Out::Battle` (`BattleRecord` trong `core/src/bot.rs`) lúc mỗi trận kết thúc, kể cả trận đầu hàng.
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

**Thêm loại mới, hay thêm một kiểu dòng mới, thì cập nhật bảng trên trong cùng thay đổi.** Một loại mới phải có ở ba nơi: `LogKind` (cả `key` và `label`) trong `core/src/bot.rs`, `LOG_KINDS` trong `desktop/src/logKinds.ts`, và một hàng của bảng này. Test `test/log-kinds.test.ts` (chạy trong `npm test`) báo lỗi khi ba nơi không khớp.

## Proxy

Mỗi nick có thể đi qua một proxy riêng, SOCKS5 hoặc HTTP (CONNECT), có hoặc không có tài khoản. `core/src/proxy.rs` làm giống `src/proxy.ts` ([proxy của bot TS](../nodejs/README.md#proxy)): nối tới proxy, mở đường tới `play.colauloanthe.vn:1688`, rồi giao thức game chạy bên trong như khi không có proxy. Proxy trả lời dính liền với vài byte đầu của seed thì các byte đó vẫn được dùng.

| Lúc | App làm gì |
|---|---|
| Dán proxy | Ô **Dán proxy** đọc các dạng nhà bán proxy hay đưa: `http://user:pass@host:port`, `socks5://user:pass@host:port`, `host:port:user:pass`, `user:pass@host:port`, `user:pass:host:port`, `host:port@user:pass`, `host:port`, hoặc bốn phần cách nhau bằng dấu cách/tab (`app/desktop/src/proxyText.ts`). Dán là điền ngay; gõ tay thì bấm Điền hoặc Enter. Chuỗi không có `http://`/`socks5://` thì giữ loại đang chọn và nhắc đổi nếu sai. SOCKS4 thì báo chưa hỗ trợ |
| Kiểm tra | `net::check_proxy`: nối tới proxy, mở đường tới server game, chờ 4 byte seed rồi đóng, không đăng nhập. Hiện thời gian, hoặc lý do lỗi |
| Lưu | Proxy đang bật mà mới, vừa bật lại hay vừa đổi thì kiểm tra như trên trước. Không qua thì **không lưu gì**, hộp báo "Chưa lưu: kiểm tra proxy không qua. …". Tắt proxy hay chỉ đổi tên gợi nhớ thì không kiểm tra |
| Đăng nhập | Proxy bật: nhật ký ghi "Kết nối qua proxy socks5 1.2.3.4:1080" rồi "… đã mở đường tới server game". Mỗi bước có 8 s. Hỏng thì nick sang Lỗi với lý do (không nối được proxy, proxy không trả lời, proxy cần/từ chối tài khoản, proxy không nối được tới server game) và có toast đỏ |

Proxy phải cho nối tới cổng 1688; có proxy chỉ cho 80/443. Chưa hỗ trợ SOCKS4 và proxy HTTPS (TLS tới proxy).

## Việc "đánh X N lần"

`bot.rs` đánh theo đúng luật của `--farm` bên TS. Test TS: [quest.test.ts](../../../test/quest.test.ts). Test Rust: `fight_job_*` trong `tests/parity.rs`.

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

`bot.rs` chơi các bước của `s2c/39` theo đúng `QuestBot` bên TS ([Bot làm nhiệm vụ](../nodejs/quest-bot.md#bot-làm-gì-với-từng-bước)). Server chỉ gửi **nhiệm vụ chính đang làm**; tab Phụ, Hằng ngày, Bảo Điển hiện đều trống ([10-quests](../../app/events/10-quests.md#trả-lời-nhanh)), nên app chỉ hiện được nhiệm vụ đó.

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

## Đã kiểm chứng

| Phần | Cách kiểm |
|---|---|
| Giao thức | Seed, handshake, frame gửi/nhận khi gói bị cắt nhỏ tuỳ ý, 16 vector mật khẩu, 5 payload đăng nhập: khớp từng byte |
| Request | 27 request so byte với `buildRequest`, có `c2s/10` (cộng điểm tiềm năng), `c2s/1172`, `c2s/1173` và `c2s/11` của một khu |
| Giải mã | 46 gói thật hoặc dựng theo bố cục TS, có 4 gói nhiệm vụ thật (`s2c/39` nhiệm vụ 3 và 4, `s2c/34`, `s2c/35`), trong đó có ba `s2c/9` đủ phần đuôi (A2 cấp 3, 30/10 cấp 21, nick thứ hai 31/10 với `field01` = 4), `s2c/1263` (18 người) và `s2c/1167`: kết quả JSON giống hệt bản TS |
| Người trong khu | `ZonePlayers` nhận lần lượt `1263`, `1170`, `1170`, `1167`, `1253` thật: danh sách sau mỗi gói (id, tên, cấp, thứ tự) giống bản TS |
| Bàn cờ | 3 trận bắt được, 52 bước: bàn, số viên ăn, số đợt, lượt thêm sau mỗi bước giống bản TS |
| `bestMove` | 55 thế cờ, đổi HP, nội lực, sức mạnh và chiến lược: cùng nước, cùng điểm tới bit cuối |
| Trận, bot | Vào trận → lượt quái → nước của mình → kết thúc; học thông số; boss `c2s/1178`, đợi boss đổi chỗ; dừng khi thua đủ. Trận mở muộn: tính cho việc đã gửi thách đấu chứ không cho việc mới; sau Dừng vẫn đánh hết; `s2c/22` không do app mở hay đến khi đang đánh thì bỏ qua. Map đọc hỏng thì dừng tự làm nhiệm vụ và không ghi map rỗng vào atlas |
| Bước nhiệm vụ, đường qua cổng | `stepAction` của 11 câu bước; `route`, `destination`, `portalsOf` trên bản đồ 3 map (M1, M2, M25) với cả ba kiểu trả lời của cổng: cùng kết quả bản TS |
| Bot nhiệm vụ | 18 kịch bản TS chạy `QuestBot` với gói thật hoặc dựng theo bố cục, bản Rust qua cả 18 (test chạy hết các kịch bản rồi mới báo cái nào hỏng): nói chuyện → `s2c/34` → đánh; boss; đợi boss đổi chỗ; qua cổng tên nhiệm vụ nhắc tới; cổng bị từ chối; đường đã biết qua 2 map; đủ số con thì sang bước báo cáo; cày cấp không chọn boss; cộng điểm tiềm năng; nâng kỹ năng đầu tiên nâng được rồi đợi lời NPC; không kỹ năng nào nâng được thì dừng, không gửi gì; tự cộng theo hệ (chừa 1 điểm cho bước còn lại) và theo tỉ lệ; bước lạ thì dừng; trả nhiệm vụ rồi làm nhiệm vụ mới; một bước (`--once`): NPC trả lời thì dừng trước bước đánh quái; một bước đã đủ số con thì dừng trước bước báo cáo. Bản Rust gửi đúng từng gói sau mỗi bước, và bảng cổng cuối cùng giống hệt. Thêm 3 test Rust: thắng một trận Cóc Xanh thì tiến độ 14 → 15 rồi sang báo cáo; thua thì không tính và dừng; ▶ trên Cóc Xanh 14/15 thắng một trận thì dừng ở "Xong bước", còn ▶ trên bước đã qua thì bị từ chối, không gửi gói nào. Test tự cộng của app: chọn khi rảnh thì cộng ngay; điểm lên cấp giữa việc đánh quái đợi hết trận, nút + cũng vậy; server im 8 s thì thôi cộng và dừng việc; Theo hệ khi chưa biết hệ thì không gửi gì. Đang làm nhiệm vụ thì đánh quái bị từ chối, và ngược lại |
| Lưới bản đồ | `mapGrid` của M2 (35 × 90 ô, lớp hình và lớp va chạm) giống bản TS từng byte |
| Server thật (30/10/2026) | Bot TS đăng nhập chỉ đọc: đuôi `s2c/9` cho EXP 14238 trong mốc 13841–15882, xu 2664, x/y trùng `s2c/11`; `s2c/1263` có 8 người, không có mình. `cllt status`: manina cấp 21, HP 180/180, M2 khu 0, 8 mục tiêu (2 boss). `cllt fight --target="Heo Mọi" --count=1`: thắng sau 21 lượt, gây 234 sát thương, +92 EXP, +12 xu, HP tối đa của Heo Mọi học được là 146 |
| Đăng nhập, server giả | 6 test trong `net.rs` (thêm 3 test proxy, xem dòng Proxy) chạy phiên thật với một server TCP cục bộ trả lời từng bước đăng nhập: đủ gói thì Trực tuyến; `s2c/11` hay `s2c/43` hỏng thì Lỗi có ghi opcode; `s2c/1263` hỏng thì vẫn Trực tuyến với `players_unread`; không có `s2c/1263` (một mình trong khu) thì Trực tuyến sau 1,5 s với 0 người (đổi thời gian chờ thành 60 s thì test báo lỗi); Đăng xuất khi đang chờ seed hoặc khi server im ở bước bản đồ thì phiên dừng ngay, không đợi hết giờ 8 s. Đã thử bỏ việc đọc `s2c/11` và đường Đăng xuất lúc chờ seed: 2 test tương ứng báo lỗi |
| Túi đồ, trang bị, tiền | Test parity `bag_gear_and_money_read_what_the_ts_decoders_read`: `s2c/42` và `s2c/1187` thật của E1, E2, đuôi `s2c/9` của manina (nón ô 0, rìu ô 2) và của nick mới (8 ô trống), `s2c/46` của E1: JSON giống hệt bản TS. Bot nhận lần lượt `s2c/9`, `42`, `1187`, `46` thì snapshot có đúng 2 món đang mặc, túi 8 món rồi 7 món (búa đã dùng), 500 / 7370 / 0; túi hỏng thì ghi nhật ký và giữ túi cũ. `ItemView` đặt tên, icon, hệ, độ bền 55/60, chỉ số theo bảng; món lạ hiện `#9999`. Ảnh chụp bản xem thử ở 1280 × 860 (trang bị cạnh túi, dải chi tiết vừa trong thẻ) và 1080 × 720 (túi xuống dưới trang bị). **Server thật, 31/10**: app trên máy người dùng, một nick cấp 15, ô Tiền hiện Xu 0, Xu khoá 2.630, Lượng 0 |
| Nút của Túi đồ | Test parity: `c2s/1186`, `c2s/84`, `c2s/48` giống từng byte gói điện thoại gửi ở P4 (cởi thú cưng `01 00000005`, mặc lại `00 00000027`, dùng bình `00000003`, sửa vũ khí `00 00000002`); `s2c/37` cả hai mẫu P4 đọc giống bản TS. Test `item_buttons_send_what_the_phone_sent_and_refuse_what_cannot_be_done` trên túi và trang bị thật của manina: Hoàn Linh Dược và Đá cấp 2 bị từ chối, không gửi gì; Cởi ra nón gửi `01 00000000`, bấm nút khác trước khi có trả lời thì không gửi; `s2c/1186` ghi "Đã cởi Nón Âu Lạc"; Sửa rìu có búa gửi `00 00000002`, `s2c/48` ghi "Đã sửa Rìu Âu Lạc" và rìu hiện độ bền 60; túi hết búa thì Sửa bị từ chối; Mặc Nón Lá gửi `00` cùng ô túi của nó. Ảnh chụp bản xem thử: nút Cởi ra và Sửa (mờ, thiếu búa), Mặc, Dùng (mờ, bình), bước hỏi lại của Sửa. **Server thật (31/10/2026):** `cllt item --account=manina2 --equip=2` mặc Áo Hào Kiệt (ô túi 2): server trả `s2c/10` kiểu 4, `s2c/37`, `s2c/42`, `s2c/1186`; áo sang ô trang bị 1 (độ bền 60), túi 7 → 6 món, chỉ số chiến đấu [32, 9, 33, 22, 6] → [32, 19, 48, 32, 7] (phòng thủ +10, chính xác +15, né tránh +10, chí mạng +1). Đăng nhập lại ngay sau lần trước bị từ chối "Vui lòng chờ 2 giây". Cởi ra, Dùng, Sửa chưa bấm thật |
| Kỹ năng | Test parity: `skillTable` đọc hết cây Hỏa 23.442 byte của A2; `characterSkills` của 3 gói `s2c/9` (manina, nick mới, nick hệ Thủy); `s2c/10` kiểu 32; `c2s/30` gửi 4 cho hệ Thủy; `c2s/1191`: JSON và byte giống hệt bản TS. Test `the_snapshot_holds_the_skills_and_nang_cap_sends_c2s_1191_when_it_can`: snapshot có 9 kỹ năng, Hỏa Cầu Thuật cấp 1, 19 điểm; Nâng cấp Đại Lực Công bị từ chối (cần cấp 32, phải học Hỏa Kiếm Thuật), Hỏa Cầu Thuật gửi `000003e8 00000001`, bấm lần hai trước khi có trả lời thì không gửi, `s2c/10` kiểu 32 và `s2c/1191` đưa lên cấp 2, còn 18 điểm. Test `skills.rs`: lý do chưa nâng được và bảng chi tiết từng dòng, cả lúc chưa học và lúc đã tối đa. Ảnh chụp bản xem thử ở 1280 × 860 và 1080 × 720 (cây thu nhỏ còn khoảng 0,8, vẫn nằm cạnh bảng chi tiết), cây Hỏa của manina và cây Thủy của nick thứ hai. **Server thật (31/10/2026):** `cllt skill --account=manina2 --id=1001` in cây (cấp 21, 16 điểm, Hỏa Cầu Thuật 4/20 "cần cấp 22", Hỏa Kiếm Thuật, Liệt Hỏa Chi Kiếm, Thiên Hỏa Kích "học được, 2 điểm"), gửi `c2s/1191 (1001, 1)`; server trả `s2c/10` kiểu 32 và `s2c/1191`: Hỏa Kiếm Thuật 0 → 1, điểm kỹ năng 16 → 14, Đại Lực Công còn "cần cấp 32" |
| Cửa hàng | Test parity `lai_buon_s_menu_and_shop_read_as_the_ts_decoders_read_them`: `s2c/57` và `s2c/1190` thật của P5 đọc giống `npcMenu`, `shopList` của bản TS (3 dòng hộp thoại, 8 món với đúng ô, mã, loại tiền, giá); `c2s/57` `01 000000024d31 0000006a` và `c2s/1190` `00 00000000 00000001`, `00 00000004 00000001` giống `buildRequest`. Test `the_shop_opens_on_m1_and_buys_a_line_the_money_pays_for`: từ M2 bị từ chối, không gửi gì; trên M1 với tiền của B1, `c2s/13` → `s2c/57` → `c2s/57` → `s2c/1190` mở cửa hàng; ô không có, số lượng 0, thiếu Xu đều bị từ chối; mua ô 6 gửi `00 00000006 00000001`, bấm lần hai trước khi có trả lời thì không gửi; "Bạn vừa mua thành công!" ra "Đã mua 1 Búa Sửa Chữa (80 Xu khóa)", "Không đủ Xu" ra "Chưa mua được …"; im lặng 8 s và "Không thể thực hiện" đều có lý do; rời M1 thì danh sách mất. Ảnh chụp bản xem thử: hộp khi ở map khác, cửa hàng với dòng Búa 80 Xu khóa chọn sẵn, ô Xu ×7 báo thiếu 11 Xu và khoá nút Mua, nút Mua búa cạnh Sửa của chiếc Rìu hỏng. **Server thật (31/10/2026), manina ở M1:** `cllt buy --account=manina2` in đủ 8 món đúng giá; thêm `--confirm` thì mua 1 Búa Sửa Chữa: "Bạn vừa mua thành công! 1 Búa Sửa Chữa", Xu khóa 8.437 → 8.357, túi có 2 búa cộng dồn ở ô túi 3 |
| Tự sửa đồ | Test TS `s2c/36 is the durability of the 8 gear slots…` và test parity `s2c_36_reads_the_durability_of_the_8_gear_slots_as_gear_durability_does`: B1, sau Đầu hàng, Q2 và G2 (24 byte: 55, 60, 0) đọc vừa hết byte, gói ngắn báo lỗi. Test parity `tu_sua_do_repairs_broken_gear_with_the_hammers_of_the_bag_before_the_next_battle`: tắt thì thách đấu ngay; bật thì với nón và rìu cùng 0/60 và 1 búa, bot gửi `c2s/48 00 00000000` trước, chưa thách đấu, nút Sửa phải chờ; `s2c/48` cho nón 60/60 và chạy tiếp sau 0,5 s; hết búa thì nói một lần rồi thách đấu; `s2c/36` sau trận đưa nón về 0 thì ghi "đã hỏng"; lần chạy sau, "Không thể thực hiện" và im lặng 5 s đều bỏ qua món đó và vẫn thách đấu; tắt thì ghi "Tắt tự sửa đồ". Test App: `set_fight` ghi vào `accounts.json` và Sửa nick giữ nguyên. Ảnh chụp bản xem thử: tab Cài đặt tắt, bật, hết búa (nút Mua búa), ở 1280 và 1080 px. **Chưa sửa thật lần nào bằng app** (mỗi lần tốn 1 búa) |
| Tự nhặt đồ | Vector TS mới (`npm run export:rust`): `s2c/1182` Xu khóa và nhẫn, `s2c/1183`, `s2c/51` của K3 đọc giống `decodeEvent`; `c2s/1188` giống `buildRequest`. Test parity `tu_nhat_do_picks_up_the_own_drops_of_a_won_battle_one_every_200_ms`: món người khác rơi 1 s trước không nhặt; Xu khóa đến cùng lúc gói thắng thì `c2s/1188` đi ngay; nhẫn đến 100 ms sau đi sau 200 ms; món 400 ms sau không nhặt; câu "Bạn vừa nhận được …" và "Không thể nhặt …" thành dòng Vật phẩm, 3 s sau câu báo lại là của Server; `s2c/51` đặt Đá cấp 2 vào ô túi 6; thua, hay đã tắt, thì không nhặt. Test `accounts.rs`: nick cũ không có `pickup` đọc ra bật. Ảnh chụp bản xem thử: tab Cài đặt với Tự nhặt đồ bật và lời giải thích. **Chưa chạy app với server thật** (bot TS đã nhặt thật ở G2) |
| Đổi khu, đổi map | Test parity: `zoneList` đọc 100 khu của `s2c/1172` (L1) giống bản TS; `s2c/13` dạng dài có khu (Z1) và dạng của cổng; `c2s/1173` `14`, `c2s/11` của khu 20 `000000024d31 14 00000000` như gói điện thoại B2. Test `khu_vuc_lists_the_zones_and_c2s_1173_follows_s2c_13_to_the_map_and_mobs_of_that_zone`: từ chối khu đang đứng, khu không có, khu đầy; sang khu 4 gửi `04`, Đánh quái bị từ chối trong lúc đổi, `s2c/13` → `c2s/11` khu 4 → `c2s/43` → "Đã sang khu 4…"; không có trả lời thì thôi sau 8 s. Test `doi_map_walks_the_portals_of_the_atlas_and_ends_on_the_map_or_when_no_way_is_left` trên `data/maps.json`: từ M2 thì M1, M25 cách 1 cổng, Cửu Phong chưa có đường; M2 → M1 qua cổng 1014; M1 → M25 bị từ chối ở cổng Vân Sơn thì "không còn đường". Ảnh chụp bản xem thử ở 1280 × 800 và 1080 × 760. **Server thật (31/10/2026):** bot TS `npm run zone -- --zone=4` rồi `cllt zone --account=manina2 --zone=4`: M2 có 100 khu, manina từ khu 0 (15 người khác) sang khu 4 (không ai), `s2c/13` sau 26 ms, đủ 31 con quái 6 loại. `cllt goto --map=M1` rồi `--map=M2`: qua cổng Làng Thanh Khê sang M1 (server xếp khu 1), qua cổng Vân Sơn về M2 khu 0; nhiệm vụ không đổi, không tốn gì. Đăng nhập lại 8 s sau lần trước có lúc vẫn bị "Vui lòng chờ 1 giây" |
| Nhật ký, thống kê | Test `store.rs` trên SQLite trong bộ nhớ: lùi trang theo id dòng, lọc theo loại và theo màu đỏ, chỉ dòng của đúng username; tổng số trận, thắng, thua, rời, EXP, thời gian; theo quái; lọc từ một thời điểm và theo nguồn; lịch sử từng trang; xoá dòng quá 30 ngày. Test App: dòng log và trận vào `cllt.db` theo username viết thường, lần mở sau dòng cũ hiện trước dòng mới. Test parity `every_battle_that_ends_leaves_a_record_for_the_history_of_the_account`: trận thắng của việc Đánh quái cho đúng một bản ghi (Cóc Xanh cấp 13, M2, máu lúc mở), dòng kết quả là loại Trận; trận của bước nhiệm vụ đầu hàng thì nguồn `quest`, kết quả `left`, 0 EXP. `test/log-kinds.test.ts`: 7 loại khớp giữa `bot.rs`, `logKinds.ts` và bảng ở trên. Ảnh chụp bản xem thử với 60 trận mẫu |
| Tự cập nhật | Test Rust: `UpdateView` gửi giao diện phẳng, camelCase, `state` làm nhãn. [latest-json.test.ts](../../../test/latest-json.test.ts): 7 bộ cài ra 11 khoá nền tảng với đúng URL và chữ ký; thiếu `.sig` của một bộ cài nào thì báo lỗi, gọi tên nó và hai secret; release.yml viết `latest.json` và chuyển Secrets; `tauri.conf.json` trỏ tới `releases/latest/download/latest.json` và không bật sẵn `createUpdaterArtifacts`. Ảnh chụp bản xem thử: dòng phiên bản (chưa kiểm tra, bản mới nhất, không kiểm tra được kèm lý do), khung đang tải 46 %, khung sẵn sàng với Có gì mới, hộp hỏi lại khi 2 nick đang trong game, toast tải xong. **Thử trọn vòng trên máy (macOS Apple Silicon, 31/10/2026)**, với khoá thật và một server trên máy thay cho GitHub: build bản 0.2.0 (`requireSignedVersion`, địa chỉ updater là server đó); build bản 0.2.1 có ký bằng đúng lệnh của CI, rồi `stage-bundles.mjs` ra `colautool_…_macos_aarch64.app.tar.gz` và `.sig` (chữ ký ghi `version:0.2.1`), `latest-json.mjs` viết `latest.json`. Mở bản 0.2.0: app tải `latest.json`, rồi `.app.tar.gz` (9,4 MB), không báo lỗi; tắt app thì 1 giây sau `colautool.app` đã là 0.2.1 và `codesign -v` vẫn hợp lệ. Bản 0.2.1 hỏi GitHub thật, nhận 404 vì chưa có bản nào có `latest.json`, báo "chưa có bản nào trên GitHub Releases có latest.json". Một `latest.json` ghi 0.2.5 nhưng đưa file của 0.2.1 thì bị từ chối ("signed for version 0.2.1 but the update endpoint announced version 0.2.5"), tắt app vẫn là 0.2.0. Chưa thử: nút Khởi động lại bấm thật, bản cài Windows, Linux, macOS Intel. Cỡ bản build: `.app` 13,7 MB (file chạy 12 MB, trong đó có 4,6 MB giao diện), `.dmg` 11,4 MB |
| Proxy | Test Rust (`proxy.rs`, `net.rs`, `app.rs`): bắt tay SOCKS5 có/không tài khoản và HTTP CONNECT từng byte; trả lời bị cắt từng byte và dính với seed; từ chối tài khoản, proxy không nối được tới server game, không phải proxy: báo đúng lý do; phiên qua một proxy SOCKS5 cục bộ (có mật khẩu) vào được game; proxy sai mật khẩu hay cổng chết thì Lỗi có tên proxy và không có mật khẩu; proxy tắt thì kết nối thẳng; `check_proxy` chờ seed; Lưu proxy bật mà kiểm tra không qua thì file không đổi; để trống mật khẩu proxy thì giữ mật khẩu cũ khi tài khoản proxy giữ nguyên; `account_secrets` trả cả hai mật khẩu còn JSON danh sách nick không có cái nào. Test TS: [desktop-proxy.test.ts](../../../test/desktop-proxy.test.ts) cho các dạng dán và toast khi nick bị Lỗi. **Server thật, 31/10/2026**, một proxy HTTP có tài khoản: `check_proxy` tới được server game sau 1,6 s; cùng proxy với mật khẩu sai báo "proxy từ chối tài khoản hoặc mật khẩu". Chưa đăng nhập nick qua proxy. Ảnh chụp bản xem thử: hộp Sửa nick có proxy, hộp Thêm nick sau khi dán `host:port:user:pass`, chuỗi SOCKS4 bị từ chối kèm các dạng đọc được, toast lỗi proxy, nhãn PROXY; hộp Sửa nick điền sẵn hai mật khẩu, bấm con mắt thì hiện chữ (nút đổi nhãn "Ẩn mật khẩu", `aria-pressed`), và vì mật khẩu proxy không đổi nên nút vẫn là "Lưu thay đổi", không kiểm tra lại |
| Nick | Test Rust: `accounts.json` ghi xong mới thêm, sửa hay xoá nick; sửa mà để trống mật khẩu thì giữ mật khẩu cũ; thêm trùng nick thì báo lỗi; file đọc lỗi thì không ghi đè, và xoá thất bại thì báo lỗi ngay trong hộp hỏi lại (hộp không đóng, nick còn nguyên). Ảnh chụp bản xem thử: menu chuột phải của nick đang chơi (Đăng xuất, Sửa, Xoá bị khoá) và của nick lỗi (Đăng nhập, Sửa, Xoá), hộp Sửa nick, hộp hỏi lại khi xoá |
| Cập nhật giao diện | Test Rust: một lần gửi chỉ gồm nick đã đổi, mang đúng revision, có thứ tự nick khi xoá; `accounts.json` ghi xong mới thêm hoặc xoá nick, file đọc lỗi thì không ghi. [desktop-updates.test.ts](../../../test/desktop-updates.test.ts): sự kiện Trực tuyến đến trước phản hồi `state` cũ hơn thì giao diện vẫn hiện Trực tuyến; gộp cập nhật giữ nguyên object của nick không đổi và mảng thứ tự. Bản xem thử chạy store thật: chọn nick, cập nhật một nick (thẻ khác giữ nguyên), bỏ cập nhật cũ, xoá nick khỏi thứ tự, menu chuột phải không tự đóng khi trang tự cuộn |
| Giao diện Tauri, server thật | Mở `Cờ Lau Loạn Thế.app` đã đóng gói với `--login-all`, chụp cửa sổ sau 9 s: "Trực tuyến", cấp 21, HP 180/180, EXP 14.238 / 15.882 (19,5%), xu 2.664, 68 điểm tiềm năng, 19 điểm kỹ năng, 5 chỉ số chiến đấu, Trại Vân Sơn · M2 · Khu 1 · x 2784 · y 864, 13 người xung quanh có tên và cấp, 2 boss và các loại quái trong danh sách đánh. Không đánh trận nào |
| Giao diện, cỡ cửa sổ | Ảnh chụp với dữ liệu mẫu ở 1280 × 860 (vừa khít, thẻ cuối tự cuộn bên trong) và 1080 × 720 (cỡ nhỏ nhất; bố cục hẹp, trang cuộn). `--sample` trên app thật: dữ liệu đi qua lệnh Tauri, CSP không chặn gì |

## Giới hạn

- **Boss qua `c2s/1178`:** cả TS lẫn Rust mới chạy với gói thật bắt từ điện thoại (B4) và với test, **chưa đánh boss thật**. Đứng xa boss có thách đấu được không thì vẫn chưa rõ ([10-quests](../../app/events/10-quests.md#boss)).
- **Nhiều nick cùng một IP:** chưa thử, cần thêm nick thứ hai. Phía app, mỗi nick đã là một kết nối độc lập, và có thể đi qua proxy riêng ([Proxy](#proxy)). Chưa đăng nhập nick nào qua proxy với server thật, mới kiểm tra tới seed.
- **Nhãn chỉ số:** "Tấn công" và "Phòng thủ" khớp số đo. "Chính xác", "Né tránh", "Chí mạng" và thứ tự Cường lực / Thân pháp / Nội lực / Thể lực của `stats` đã đo ở P1 ([user-data](../../app/user-data.md#đuôi-s2c9)). Số của `c2s/10` theo thứ tự khác: 0 Cường lực, 1 Nội lực, 2 Thân pháp, 3 Thể lực.
- **Vị trí:** là x/y lúc vào map. App không cho nhân vật đi lại trong map (gói `c2s/1169`), nên x/y chỉ đổi khi sang map hay khu khác. Đổi map chỉ đi qua những cổng atlas đã biết; map chưa ai vào (chưa có trong `data/maps.json`) thì chưa có đường.
- **Túi đồ:** chưa có Vứt bỏ (chưa thử trên máy vì làm mất đồ). Dùng vật phẩm mới đo một lần (bình, bị từ chối); món dùng được ngoài trận (Tăng Kinh Nghiệm, trứng) chưa thử. Mặc đã bấm thật; Cởi ra, Dùng, Sửa của app chưa. Ô trang bị đặt theo loại vật phẩm: đã đo ô 0, 1, 2, 3, 5 (manina và symap); ô 4 (cánh), 6, 7 (danh hiệu) là suy luận. Phẩm chất (Thường, Hiếm, Quý, Sử Thi) chưa biết nằm ở trường nào nên chưa hiện. Không vẽ hình nhân vật mặc đồ: cần giải mã sprite của từng món và cách ghép lớp, chưa điều tra.
- **Tự nhặt đồ:** app chưa chạy với server thật (bot TS đã nhặt thật 4/4 món ở G2). Túi đầy thì server trả gì chưa biết. Không nhặt đồ người khác làm rơi.
- **Trang bị:** Tự sửa đồ chỉ chạy giữa các trận của Tự đánh và Tự làm nhiệm vụ, và chưa sửa thật lần nào bằng app; ngoài lúc đó chỉ sửa khi bấm Sửa, mỗi lần tốn 1 Búa sửa chữa ([Tự sửa đồ](#tự-sửa-đồ)). Độ bền không giảm đều: G2 đánh 6 trận không mòn, Q2 mòn gần như mỗi trận ([05-battle](../../app/events/05-battle.md#s2c-36)).
- **Windows và Linux:** mới kiểm tra `cargo check` chéo của `cllt-core` cho `x86_64-pc-windows-msvc` và `x86_64-unknown-linux-gnu`. Phần Tauri chưa chạy thử trên hai hệ này; [build-matrix.yml](#cicd-và-phát-hành) sẽ là lần build đầu tiên.
- **Kỹ năng:** bảng chi tiết của kỹ năng đã tối đa là suy luận; game chưa chụp được. Hệ Lôi số 2 cũng là suy luận, vì chưa có nhân vật Lôi để đo ([12-skills-items](../../app/events/12-skills-items.md#chưa-rõ)).
- **Nhiệm vụ:**
  - Server chưa gửi nhiệm vụ phụ hay hằng ngày. Nhiệm vụ hằng ngày phải tự nhận ở Hương Lão Trần Bá (Cẩm nang), gói chưa bắt.
  - HP chỉ hồi đầy sau một trận thua; bot chưa dùng Hoàn Linh Dược (gói chưa biết). Đồ hỏng được sửa nếu bật [Tự sửa đồ](#tự-sửa-đồ).
- **Tự cập nhật:** mới thử trọn vòng trên macOS Apple Silicon với một server trên máy (xem [Đã kiểm chứng](#đã-kiểm-chứng)). Bản cài Windows, Linux, macOS Intel và lần chạy thật với GitHub Releases chỉ có khi phát hành bản kế tiếp có tính năng này.
- **Chưa port:** app chỉ mua ở dòng Dược phẩm của Lái Buôn ([Cửa hàng](#cửa-hàng)); không bán, không chat. Quét map và ghi `data/maps.json` vẫn chỉ có bên TS.
