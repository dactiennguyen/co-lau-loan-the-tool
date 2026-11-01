# Kiến trúc app Rust

Quy trình đưa một tính năng từ điều tra Android vào app, và cấu trúc thư mục `app/`. Tổng quan cả repo (TypeScript, Rust, giao diện, dữ liệu, test) ở [Kiến trúc](../../architecture.md).

## Quy trình: Android → docs → TypeScript → Rust

| Bước | Làm gì | Ở đâu |
|---|---|---|
| 1. Điều tra | Đọc APK, bắt gói trên điện thoại (Frida, REA), đo byte và hành vi | Ghi ngay vào [docs/app](../../app/README.md): bằng chứng, bố cục byte, độ chắc chắn |
| 2. Mô phỏng bằng TS | Viết decoder, bot, mô phỏng trong `src/`; gói thật làm fixture trong `test/`; chạy thật bằng `npm run …` | Ghi kết quả chạy vào [docs/integration/nodejs](../nodejs/README.md) và các mục event |
| 3. Port sang Rust | Chỉ khi bản TS đã qua test và đã chạy thật: chuyển sang `app/core`, chạy `npm run export:rust`, rồi `cargo test` phải khớp | [App Rust](README.md): [Hướng dẫn dùng app](features.md), [Đã kiểm chứng](status.md) |
| 4. Giao diện | `app/desktop` (Tauri) chỉ gọi `app/core`, không tự giải gói. Rust gửi dữ liệu đã giải, TypeScript chỉ hiển thị | [Hướng dẫn dùng app](features.md) |

- Hai bên dùng chung **một nguồn dữ liệu**:
  - `npm run export:rust` ([src/cli/export-rust.ts](../../../src/cli/export-rust.ts)) sinh `app/core/src/opcodes.rs` từ [src/protocol/config.ts](../../../src/protocol/config.ts).
  - Lệnh đó cũng sinh `app/core/tests/vectors.json` từ [test/fixtures.ts](../../../test/fixtures.ts) và từ kết quả các hàm TS chạy trên gói thật.
  - Không sửa hai file sinh ra này bằng tay.
- `npm test` có [test/rust-export.test.ts](../../../test/rust-export.test.ts), báo lỗi khi TS đã đổi mà chưa xuất lại. Khi đã xuất lại, `cargo test` báo lỗi cho tới khi Rust làm theo.
- Mọi tính năng mới đi theo thứ tự trên. Ví dụ, "đánh boss N lần" được viết trước thành `npm run quest -- --farm=<boss>` ([quest-bot](../nodejs/quest-bot.md#chạy)), sau đó mới port vào `app/core/src/bot/`.

## Cấu trúc

```text
app/
  Cargo.toml              workspace: core, desktop/src-tauri (Rust 1.90); profile release của template Tauri
  accounts.example.json   mẫu; app/accounts.json là file thật, đã gitignore
  core/                   cllt-core: không có UI, test được không cần màn hình
    src/opcodes.rs          sinh từ src/protocol/config.ts
    src/protocol.rs         ← src/protocol/protocol.ts: frame, XOR, handshake, proof mật khẩu, s2c/9 (cả phần đuôi), 29, 11
    src/requests.rs         ← buildRequest của src/protocol/events.ts
    src/world.rs            ← src/protocol/world.ts: s2c/43, 11, 13, 1177, 1256, 10; người chơi trong khu (1263, 1167, 1170, 1253);
                            nhiệm vụ (39, 34, 35)
    src/battle.rs           ← src/battle/battle.ts: bàn 8×8, cascade, bestMove, gói trận, khối quái của s2c/22 (mob_block)
    src/battle_record.rs    ← src/bot/battle-record.ts: Lưu dữ liệu trận, các dòng của một trận nén gzip (BattleData)
    src/runner.rs           v1: một trận như app chơi trước v3 (`kill`), giữ lại để so (`cllt --algo=v1`)
    src/runner_v3.rs        ← src/battle/battle-runner.ts: một trận với v3, học và nhớ thông số hai bên; Runner, Algorithm
    src/battle_actions.rs   ← src/battle/battle-actions.ts: chọn hành động mỗi lượt trong số đổi viên, kỹ năng, bình (v3)
    src/quest.rs            ← stepAction của src/bot/quest.ts: bước nhiệm vụ đòi làm gì
    src/items.rs            vật phẩm: bản ghi món, túi, trang bị, độ bền (s2c/36), đồ rơi trên đất (1182, 1183, 51)
    src/skills.rs           ← src/protocol/skills.ts: cây kỹ năng, kỹ năng nhân vật
    src/potentials.rs       điểm tiềm năng: chỉ số chính theo hệ, tự cộng theo tỉ lệ
    src/proxy.rs            SOCKS5 và HTTP CONNECT
    src/bot/                ← QuestBot của src/bot/quest.ts, không I/O: nhận gói, lệnh, giờ; trả gói cần gửi và dòng nhật ký
      mod.rs                  struct Bot, hằng số, hẹn giờ (deadline, on_timer), snapshot cho giao diện
      types.rs                Out, LogKind, BattleRecord, BotOptions, FightSettings (Cài đặt đánh), Snapshot
      packets.rs              gói server theo opcode (on_packet)
      fight.rs                việc "đánh X N lần" (--farm), thách đấu, s2c/22, cuối mỗi trận
      quest.rs                "Tự làm nhiệm vụ": các bước, đi qua cổng tới NPC hay quái của bước
      stats.rs                tự cộng điểm tiềm năng, "Cộng +1", nâng kỹ năng
      items.rs                nút của tab Túi đồ, Tự sửa đồ, Tự nhặt đồ, độ bền sau trận
      record.rs               Lưu dữ liệu trận: dòng đầu, gói hai chiều (record_sent), kết quả, Out::BattleData
      shop.rs                 cửa hàng Lái Buôn
      travel.rs               đổi khu, đổi map
    src/net/                ← FLOW của src/net/client.ts, trên tokio
      mod.rs                  Command, ConnState, Event
      session.rs              phiên một nick: các bước đăng nhập, heartbeat, rồi gói, lệnh và hẹn giờ của Bot
      connect.rs              kết nối TCP tới server game, thẳng hay qua proxy; Kiểm tra proxy
      manager.rs              Manager: mỗi nick một phiên trên runtime chung
      tests.rs                phiên thật với server TCP cục bộ, cả qua SOCKS5
    src/atlas.rs            ← src/bot/atlas.ts: data/maps.json, những gì phiên thấy thêm, đường qua cổng (không ghi file)
    src/accounts.rs         accounts.json, .env
    src/bin/cllt.rs         CLI không giao diện: status, fight, quest
    tests/parity.rs         so với vectors.json
    tests/battle_v3.rs      thuật toán v2 và v3 so với phần battleV3 của vectors.json
    tests/vectors.json      sinh từ TS
  desktop/                project Tauri 2 (cấu trúc của create-tauri-app, template react-ts)
    package.json            dev, build (tsc && vite build), tauri, app, sample
    index.html, vite.config.ts, tsconfig.json
    app-icon.png            nguồn icon mẫu số 4 (xanh rêu, bông lau giấy màu kem), dùng chung cho logo giao diện;
                            `npm run tauri icon app-icon.png` sinh bộ icon nền tảng trong src-tauri/icons
    src/                    giao diện React + TypeScript; @/ là src/ (paths của tsconfig.json, Vite đọc theo):
                            file khác thư mục import bằng @/store, @/components/Button, cùng thư mục bằng ./X
      main.tsx, App.tsx       gốc: thanh bên, trang nick, hộp thoại đang mở
      api/                    nói chuyện với src-tauri: index.ts gọi lệnh Tauri và nghe sự kiện "accounts", "log" (ngoài
                              Tauri thì đọc public/sample.json); types.ts là kiểu dữ liệu Rust gửi sang (bản sao của
                              src-tauri/src/view.rs)
      store/                  index.ts: store zustand (nick theo id và thứ tự, nick đang chọn, hộp thoại đang mở, nhật
                              ký) và các selector selectedAccount, selectedLog, inGame; sync.ts: hàm thuần nghe trước
                              rồi mới lấy state, gộp cập nhật theo revision, nối nhật ký theo số dòng; toasts.ts: toast
                              sinh ra từ một lần cập nhật nick
      hooks/                  useSync (đổ sự kiện Tauri vào store, gắn một lần ở App), useFightSetting (một số của Cài
                              đặt đánh, lưu sau khi thôi gõ)
      utils/                  cn.ts (gộp class Tailwind bằng tailwind-merge, class sau thắng class trước cùng loại),
                              format.ts (số kiểu Việt 14.238, màu trạng thái, tiến độ cấp), remember.ts (lựa chọn giữ
                              trong localStorage), proxyText.ts (đọc chuỗi proxy dán vào)
      game/                   điều app biết về game, hằng số đi cùng luật: shops.ts (cửa hàng, đá, trần cường hoá),
                              potentials.ts (tiềm năng, chỉ số chính theo hệ), logKinds.ts (tên và màu các loại nhật
                              ký), itemIcons.ts, skillIcons.ts và mobIcons.ts (icon của data/icons, Vite gom vào
                              bản build)
      styles/                 tailwind.css (Tailwind CSS v4: thứ tự layer, theme lấy từ tokens.css, tiện ích notch/bevel,
                              preflight và mặc định của trang, px/scroll), tokens.css (màu, khung pixel, nhịp chuyển
                              động, @font-face)
      components/             thành phần dùng chung, không biết gì về game, mỗi cái một .tsx, style bằng class Tailwind;
                              nhận className (gộp bằng cn()) để màn hình chỉnh từ ngoài:
                              Button, Icon, Badge, Pill, Bar, Avatar, Card, Stepper (ô số gõ được), StatTile, Tabs, TextField, Hint (dấu ? có lời giải thích),
                              ItemSlot (một ô túi đồ), Dialog (khung hộp thoại), Menu (menu chuột phải),
                              SettingRow (một dòng bật/tắt có dấu ?)
      views/                  các phần của app, style bằng class Tailwind ngay trong .tsx: Sidebar, AccountCard,
                              AccountPage, HeroCard, MetricRow, StatsCard, PlayersCard, QuestCard, FightCard,
                              FightSettingsCard (Cài đặt đánh), InventoryCard và ItemDetail (Túi đồ), SkillsModal (Kỹ năng),
                              StatsModal (Thống kê), LogCard, EmptyState
        shop/                 modal Tiện ích: ShopModal và các trang ShopBuy, ShopMerge, ShopUpgrade, ShopExchange, Stone
        dialogs/              hộp thoại: AccountDialog (thêm và sửa nick) với ProxyFields, ConfirmDialog (hỏi trước khi
                              xoá), StopDialog, PlaceDialog, SettingsDialog (Cài đặt của app), StatPlanDialog,
                              UpdateDialog, CloseDialog (Đóng cửa sổ: thu nhỏ vào khay hay thoát)
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
      src/settings.rs         Cài đặt của app (settings.json): server game, Lưu dữ liệu trận, khi đóng cửa sổ;
                              tên file và Mở thư mục của Xuất dữ liệu trận
      src/tray.rs             icon ở khay (Mở cửa sổ, Thoát), nút đóng cửa sổ, App Nap trên macOS; xem
                              Thu nhỏ vào khay
      src/sample.rs           dữ liệu mẫu cho --sample, --dump-sample
      src/update.rs           tự cập nhật từ GitHub Releases (tauri-plugin-updater), xem Tự cập nhật
      src/store.rs            cllt.db (SQLite): nhật ký, lịch sử trận và đồ nhặt, phiên bản bảng (user_version)
```
