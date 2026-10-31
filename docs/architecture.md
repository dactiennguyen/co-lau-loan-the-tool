# Kiến trúc

Repo biến những gì điều tra được về game Android thành một app desktop chạy bot cho nhiều nick. Mỗi lớp chỉ dựa vào lớp ngay trước nó:

```text
APK, điện thoại (Frida, REA)      điều tra: byte giao thức, hành vi
        ↓
docs/app                          ghi ngay: bằng chứng, bố cục byte, độ chắc chắn
        ↓
src/ (TypeScript, Node.js)        thử trước: giải mã gói, kết nối, thuật toán đánh, bot, lệnh npm run
        ↓  npm run export:rust    bảng opcode và vector kiểm thử sinh từ TypeScript
app/core (Rust, cllt-core)        lõi của app: cùng giải mã, cùng bot, nhiều nick trên tokio
        ↓
app/desktop/src-tauri (Rust)      app Tauri: danh sách nick, accounts.json, cllt.db, lệnh cho giao diện
        ↓  sự kiện "accounts", "log"
app/desktop/src (React)           giao diện: chỉ hiển thị dữ liệu Rust đã giải
```

Một tính năng mới đi đúng thứ tự trên ([Quy trình](integration/rust/architecture.md#quy-trình-android--docs--typescript--rust)). Không viết thẳng vào Rust một tính năng chưa có bên TypeScript.

## Thư mục

| Thư mục | Chứa gì |
|---|---|
| `docs/app` | Kết quả điều tra: artifact, phương pháp, giao thức, từng event và gói ([Điều tra app](app/README.md)) |
| `docs/integration` | Cách chạy và kết quả chạy thật: `nodejs/` cho bản TypeScript, `rust/` cho app ([App Rust](integration/rust/README.md)) |
| `src/` | Bản TypeScript, chia theo vai trò, xem [TypeScript](#typescript) |
| `test/` | Test của bản TypeScript, fixture là gói thật ([test](../test/README.md)); kiểm cả link trong docs và bảng loại nhật ký |
| `data/` | Dữ liệu game dùng chung cho TS và Rust: `maps.json` (map, NPC, cổng, quái bot đã thấy), `items.json`, `skills.json`, `icons/` |
| `app/` | App Rust: `core/` (lõi), `desktop/` (Tauri + React) |
| `.github/` | CI: test và build bốn hệ cho mỗi lần push; phát hành khi có tag `v*` ([Phát hành](integration/rust/release.md)) |

## TypeScript

`src/` là nơi thử trước. Node chạy thẳng file `.ts` (`--experimental-strip-types`), còn `npm test` kiểm kiểu bằng `tsc --noEmit` trước khi chạy test.

| Thư mục | Vai trò | File |
|---|---|---|
| `src/protocol/` | Giải mã gói: frame, XOR, handshake, bảng opcode, danh mục event với bộ giải và bộ dựng gói, gói thế giới, dữ liệu vật phẩm và kỹ năng | `protocol.ts`, `config.ts`, `events.ts`, `world.ts`, `items.ts`, `skills.ts` |
| `src/net/` | Kết nối: các bước đăng nhập (FLOW), proxy SOCKS5 và HTTP, tài khoản trong `.env` | `client.ts`, `proxy.ts`, `env.ts` |
| `src/battle/` | Thuật toán đánh: bàn 8×8, chọn nước và hành động trong lượt, một trận trên phiên thật | `battle.ts`, `battle-actions.ts`, `battle-runner.ts` |
| `src/bot/` | Bot: làm nhiệm vụ và đánh quái (`QuestBot`), bản đồ đã học, quét map | `quest.ts`, `atlas.ts`, `map-scan.ts` |
| `src/cli/` | Lệnh `npm run …`: mỗi file một lệnh, chỉ đọc tham số rồi gọi các thư mục trên | `connect.ts`, `quest-run.ts`, `map-scan-run.ts`, `items-run.ts`, `bag-run.ts`, `skills-run.ts`, `zone-run.ts`, `buy-run.ts`, `check-apk.ts`, `check-capture.ts`, `export-rust.ts` |

Phụ thuộc đi một chiều: `cli` → `bot` → `battle` và `net` → `protocol`; `battle` và `net` không dùng nhau. Ngoại lệ duy nhất: các bộ giải gói trận (`battleSetup`, `turnState`, `battleResult`…) nằm trong `battle/battle.ts` cạnh luật bàn cờ, và `protocol/events.ts` dùng chúng cho danh mục event.

## Rust

`app/core` (crate `cllt-core`) không có giao diện, test được không cần màn hình. Chi tiết từng file ở [Cấu trúc](integration/rust/architecture.md#cấu-trúc).

- **Giải mã gói:** `protocol.rs`, `opcodes.rs` (sinh từ TS), `requests.rs`, `world.rs`, `items.rs`, `skills.rs`, `battle.rs`. Mỗi bộ giải có vector từ TS trong `tests/vectors.json`, và `tests/parity.rs` kiểm từng byte.
- **Bot, không I/O:** `bot/` nhận gói (`on_packet`), lệnh và giờ (`on_timer`, `deadline`), rồi trả danh sách `Out`: gói cần gửi, dòng nhật ký, trận đã xong. Nhờ vậy test chạy cả việc đánh quái và làm nhiệm vụ mà không cần socket. Mỗi việc một file: `fight.rs`, `quest.rs`, `items.rs`, `shop.rs`, `stats.rs`, `travel.rs`; `packets.rs` chia gói theo opcode, `types.rs` giữ các kiểu gửi ra ngoài.
- **Một trận:** `runner.rs` chơi một trận trên bàn của `battle.rs`.
- **Phiên mạng:** `net/` chạy mỗi nick một phiên trên runtime tokio chung: `session.rs` (đăng nhập, heartbeat, vòng gói và lệnh), `connect.rs` (TCP, proxy), `manager.rs`.
- **Khác:** `accounts.rs` (`accounts.json`), `atlas.rs` (`data/maps.json`), `potentials.rs`, `proxy.rs`, `bin/cllt.rs` (CLI không giao diện để thử với server thật).

`app/desktop/src-tauri` (crate `cllt-desktop`) nối lõi với giao diện:

- `app.rs` giữ danh sách nick và nhận `Event` của các phiên. Một luồng gửi sang giao diện những nick vừa đổi (sự kiện `accounts`) và dòng nhật ký mới (`log`).
- `commands.rs` là các lệnh giao diện gọi được; `view.rs` đổi `Snapshot` của bot thành dữ liệu giao diện nhận.
- `store.rs` giữ `cllt.db` (SQLite): nhật ký 30 ngày, trận 90 ngày, phiên bản bảng bằng `user_version` ([Nhật ký và thống kê](integration/rust/features.md#nhật-ký-và-thống-kê)).
- `update.rs` tự cập nhật từ GitHub Releases.

## Giao diện

`app/desktop/src` là React + TypeScript (Vite). `api.ts` gọi lệnh Tauri và nghe sự kiện, `store.ts` (zustand) giữ nick, nhật ký và hộp thoại đang mở. `views/` là các phần của app, `components/` là thành phần dùng chung không biết gì về game. Kiểu dữ liệu trong `types.ts` là bản sao viết tay của `view.rs` và `bot/types.rs`: đổi một bên thì đổi bên kia.

## Kiểm thử

| Lệnh | Kiểm gì |
|---|---|
| `npm test` (thư mục gốc) | `tsc --noEmit`, rồi bộ giải, bot trên server giả, link và anchor của docs, bảng loại nhật ký, và việc `export:rust` đã chạy lại sau khi TS đổi |
| `cargo test` (trong `app/`) | `tests/parity.rs`: bộ giải so với vector của TS, và bot qua từng tình huống (đánh quái, nhiệm vụ, Tự sửa đồ, Tự nhặt đồ…); `net/tests.rs` (server TCP cục bộ, SOCKS5); test của `store.rs`, `app.rs` |
| `npm run build` (trong `app/desktop`) | Kiểm kiểu giao diện và build Vite |

CI chạy cả ba, cùng `cargo fmt` và `cargo clippy -D warnings`, cho mỗi lần push lên `main` ([CI/CD](integration/rust/release.md#cicd-và-phát-hành)).

## Thêm một tính năng

1. Điều tra và ghi vào `docs/app` trước.
2. Viết bên TypeScript vào đúng thư mục: bộ giải vào `src/protocol`, cách đánh vào `src/battle`, việc bot làm vào `src/bot`, lệnh mới vào `src/cli` và `package.json`. Test bằng gói thật, chạy thật với server, ghi kết quả vào docs.
3. `npm run export:rust` nếu đổi bộ giải hay bảng opcode; viết bên Rust vào file cùng vai trò (`bot/<việc>.rs`, `world.rs`…) cho tới khi `cargo test` khớp.
4. Giao diện chỉ hiển thị: thêm trường vào `view.rs` và `types.ts`, rồi `views/`.
5. Một loại dòng nhật ký mới, một bảng SQLite mới: theo quy tắc ở [Loại dòng nhật ký](integration/rust/features.md#loại-dòng-nhật-ký) và [Nhật ký và thống kê](integration/rust/features.md#nhật-ký-và-thống-kê) (bảng đổi thì thêm một bước vào `MIGRATIONS`).
