# CLLT Server

Server riêng để giữ danh sách nick và quản lý thiết bị của app CLLT Tool trên Cloudflare, chạy tại **https://colau.olachat.net** (trang quản trị: `/admin`). Gồm:
- một **Worker** (TypeScript, `src/`, chia lớp route/controller/service, xem [Mã nguồn](#mã-nguồn)), định tuyến bằng [Hono](https://hono.dev), đọc ghi database bằng [Drizzle ORM](https://orm.drizzle.team);
- một database **D1** (SQLite của Cloudflare, `migrations/`);
- **API** để gửi nick lên và tải nick về, và để app báo thiết bị ([Thiết bị](#thiết-bị));
- **trang quản trị** có đăng nhập.

Gói miễn phí của Cloudflare (Workers và D1) là đủ.

App desktop chỉ gọi `POST /api/devices/hello`; phần đồng bộ nick trong app làm sau. Bây giờ dùng API bằng `curl`, hay tải JSON từ trang quản trị rồi Nhập JSON vào app.

## Có gì

| Phần | Đường dẫn | Cần gì |
|---|---|---|
| Trang quản trị | `/admin` | Đăng nhập. Lần đầu là `admin` / `admin` |
| Danh sách nick (xem, hiện mật khẩu, xoá, Tải JSON) | `/admin` | Đăng nhập |
| Tạo và thu hồi API token | `/admin/tokens` | Đăng nhập |
| Đổi mật khẩu quản trị | `/admin/password` | Đăng nhập |
| Thiết bị (xem, chặn, bỏ chặn, đặt tên, xoá khỏi danh sách) | `/admin/devices` | Đăng nhập |
| App báo thiết bị | `POST /api/devices/hello` | Không cần gì |
| Kiểm tra server sống | `GET /api/health` | Không cần gì |
| Tải mọi nick về | `GET /api/accounts` | API token |
| Gửi nick lên | `POST /api/accounts` | API token |

## Cài lên Cloudflare

Cần Node.js ≥22.6 (có corepack, nên có Yarn 4 mà `package.json` ghim) và một tài khoản Cloudflare. Mọi lệnh chạy trong thư mục `server/`.

1. Cài và đăng nhập Cloudflare (mở trình duyệt để cho phép):
   ```sh
   corepack enable   # một lần: Node có sẵn Yarn qua corepack
   yarn install
   yarn wrangler login
   ```
2. Tìm hay tạo database `cllt` và ghi id của nó vào `database_id` của `wrangler.toml` (chạy được cả trên Windows):
   ```sh
   yarn d1:id
   ```
   Đừng commit id này: repo giữ chuỗi `00000000-…`, CI tự điền khi deploy.
3. Tạo các bảng, rồi đưa Worker lên:
   ```sh
   yarn db:migrate
   yarn deploy
   ```
   Lệnh deploy in ra địa chỉ: tên miền trong `routes` của `wrangler.toml` (`colau.olachat.net`; Cloudflare tự tạo bản ghi DNS và chứng chỉ, vì zone `olachat.net` nằm cùng tài khoản). Địa chỉ `workers.dev` đã tắt (`workers_dev = false`); muốn bật lại thì đặt `true`.
4. Mở `<địa chỉ>/admin` và đăng nhập `admin` / `admin`.
   - Trang buộc **đổi mật khẩu** trước (ít nhất 8 ký tự, khác `admin`). Đổi xong mới mở được các trang khác, vì trang Nick hiện mật khẩu game.
5. Vào **API token**, đặt tên (ví dụ "Máy nhà") rồi **Tạo token**.
   - Chép token ngay: server chỉ giữ dấu băm của token, nên không hiện lại được.
   - Mỗi máy nên có một token riêng, để thu hồi riêng.

Sửa code xong thì chỉ cần `yarn deploy` lại. Thêm file mới trong `migrations/` thì chạy `yarn db:migrate` trước.

## Tự deploy bằng GitHub Actions

Workflow [`.github/workflows/server-deploy.yml`](../.github/workflows/server-deploy.yml) tự chạy mỗi khi có commit trên `main` đổi gì trong `server/`. Cũng chạy được bằng tay: tab **Actions → Deploy Server → Run workflow**. Mỗi lần chạy:
1. Chạy `yarn test`. Test lỗi thì dừng, không deploy.
2. Tìm database D1 `cllt` trên Cloudflare, chưa có thì tạo (`yarn d1:id`, file `scripts/d1-id.mjs`). Id của nó chỉ được ghi vào `wrangler.toml` trên máy chạy CI, nên không cần sửa `database_id` trong repo.
3. Tạo hay cập nhật bảng (`wrangler d1 migrations apply --remote`).
4. Deploy (`wrangler deploy`). Phần tóm tắt của lần chạy ghi địa chỉ trang quản trị.

Cần làm một lần trước:
1. **API token Cloudflare.** Vào My Profile → API Tokens → Create Token → Custom token, cấp hai quyền:
   - Account › **Workers Scripts** › Edit;
   - Account › **D1** › Edit;
   - Zone › **Workers Routes** › Edit và Zone › **DNS** › Edit, cho tên miền `colau.olachat.net` trong `routes` của `wrangler.toml`.

   Ở Account Resources chọn tài khoản của bạn; ở Zone Resources chọn zone `olachat.net`.
2. **Account ID.** Lấy ở cột phải trang Workers & Pages của dashboard, hay bằng `yarn wrangler whoami`.
3. **Mở Workers & Pages trên dashboard một lần**, để tài khoản có tên miền `workers.dev`. Deploy từ CI không tự chọn tên miền này được.
4. **Thêm secret vào repo.** GitHub → repo → Settings → Secrets and variables → Actions → New repository secret, thêm hai secret:
   - `CLOUDFLARE_API_TOKEN`;
   - `CLOUDFLARE_ACCOUNT_ID`.

   Chưa có hai secret này thì workflow vẫn chạy test, rồi ghi cảnh báo và không deploy.

**Ngay sau lần deploy đầu, đăng nhập `admin` / `admin` và đổi mật khẩu.** Cho tới lúc đó, ai mở `/admin` trước cũng đăng nhập được và đổi mất mật khẩu.

## Chạy thử trên máy

Chạy trên máy dùng database riêng trên máy, không đụng tới bản trên Cloudflare.

```sh
corepack enable
yarn install
yarn db:migrate:local
yarn dev            # http://localhost:8787/admin
```

## API

Mọi lệnh `/api/accounts` cần header `Authorization: Bearer <token>`; thiếu hay sai token thì trả 401. JSON dùng đúng dạng **Xuất JSON** của app ([Nhập / Xuất JSON](../docs/integration/rust/features.md#nhập-xuất-json)):

```json
{"app": "CLLT Tool", "format": 1, "exportedAt": "…",
 "accounts": [{"label": "Nick chính", "username": "manina", "password": "…", "serverId": 24, "fight": {…}, "proxy": {…}}]}
```

**Gửi nick lên**: `POST /api/accounts`, thân là JSON tối đa 1 MB.
- Nhận cùng các dạng như Nhập JSON của app: file Xuất JSON, một `accounts.json`, một danh sách nick, hay một nick lẻ có `username`. `"settings"` của app (nếu có) được bỏ qua.
- Mỗi nick xác định bằng server game (`serverId`, thiếu thì là 24) và tài khoản, không phân biệt hoa thường. Nick chưa có thì thêm; đã có thì thay bằng bản gửi lên.
- Giống Ghi đè của app: tên hiển thị, mật khẩu, hay mật khẩu proxy (cùng tên đăng nhập proxy) **để trống thì giữ cái cũ**.
- Nick lặp lại trong cùng một JSON chỉ tính lần đầu.
- Mọi khoá khác của nick (`fight`, `stats`, `skill`, `fightTargets`, `proxy`) được giữ nguyên văn.

```sh
curl -X POST https://cllt-server.<tên-bạn>.workers.dev/api/accounts \
  -H "Authorization: Bearer $CLLT_TOKEN" -H "Content-Type: application/json" \
  --data-binary @cllt-accounts-20261102-101500.json
# {"added":2,"updated":1,"unchanged":3,"repeated":0,"total":6}
```

JSON sai thì trả 400 kèm lý do, cùng lời như app: `{"error": "Nick thứ 2: thiếu tài khoản (username)"}`.

**Tải nick về**: `GET /api/accounts` trả mọi nick, có mật khẩu, theo thứ tự thêm vào. File này Nhập JSON vào app được ngay.

```sh
curl -H "Authorization: Bearer $CLLT_TOKEN" https://cllt-server.<tên-bạn>.workers.dev/api/accounts > nick.json
```

**Kiểm tra server**: `GET /api/health` trả `{"ok": true, "app": "cllt-server"}`, không cần token.

API cho mọi nguồn gọi (CORS `*`), vì nó không dùng cookie mà chỉ dùng token.

## Thiết bị

Mỗi máy mở app báo về `POST /api/devices/hello` ngay khi mở, rồi 15 phút một lần ([features.md#thiết-bị](../docs/integration/rust/features.md#thiết-bị)):

```json
{"id": "<64 ký tự hex>", "hostname": "MAY-NHA", "os": "windows x86_64", "version": "1.1.2",
 "accounts": [{"username": "manina", "serverId": 24}]}
```

- `id` là SHA-256 của mã máy do hệ điều hành giữ (`MachineGuid` trên Windows, `IOPlatformUUID` trên macOS, `/etc/machine-id` trên Linux). Gỡ app rồi cài lại vẫn là một thiết bị. Cài lại Windows hay Linux thì thành thiết bị mới.
- Server trả `{"allowed": true}`, hay `{"allowed": false, "reason": "…"}` với máy bị chặn. Máy chưa từng thấy được thêm vào và **được dùng ngay**.
- `accounts` chỉ có tài khoản và server game, **không có mật khẩu**. Server lưu IP, lần đầu và lần cuối thấy máy.
- Không cần token: app không giữ được bí mật. Ai cũng gửi được hello, nên danh sách có thể có máy lạ; chặn máy đó, hay xoá khỏi danh sách.
- Trang **Thiết bị** (`/admin/devices`): tìm theo tên máy, nick hay IP; **Chặn** kèm lý do (app hiện lý do cho người dùng), **Bỏ chặn**, **Đặt tên**, **Xoá khỏi danh sách** (máy đó hiện lại ở lần mở app tới, vẫn được dùng; muốn ngăn thì Chặn).
- Máy bị chặn thì khoá ở lần báo tiếp theo, tức tối đa 15 phút nếu app đang mở. App nhớ trạng thái, nên mất mạng vẫn khoá.
- **Giới hạn:** mã máy do app tự báo. Người rành máy tính có thể đổi `MachineGuid` (cần quyền admin) hay sửa app để gửi mã khác. Cách này chặn người dùng thường, không chặn người cố tình.

## Đồng bộ nick

Chỉ một chiều, **từ app lên server**: server giữ bản sao để xem trên trang **Nick** và Tải JSON, app không tải gì về. Máy mới phải được admin bấm **Cho đồng bộ** trên trang Thiết bị (bấm **Tắt đồng bộ** để thôi; nick đã gửi vẫn giữ). Sau mỗi lần báo danh được phép (lúc mở app, rồi 15 phút một lần), app gửi `POST /api/devices/sync` với các nick đã đổi kể từ lần gửi trước. Mỗi nick gửi nguyên vẹn: mật khẩu, proxy, Cài đặt đánh, kỹ năng, chỉ số. Cài đặt của app cũng gửi kèm khi đổi (`src-tauri/src/sync.rs`):

```json
{"id": "<64 ký tự hex>", "settings": {"server": …, "record": true, "onClose": "ask"},
 "accounts": [{"account": {"username": "tiheo1", "password": "…", "serverId": 24, "fight": {…}},
               "changed": {"password": 1762059000000, "fight": 0, "label": 0}}]}
```

**Hai máy cùng một nick** (cùng server game, tài khoản không phân biệt hoa thường) thì server gộp thành **một dòng**, gộp **từng mục**:

- `changed` ghi lúc app thấy từng mục đổi. Server giữ cho mỗi mục giá trị của lần sửa **sau cùng** (cột `changed` của bảng `accounts`).
- Hai máy gửi giống nhau: không đổi gì. Máy A sửa mật khẩu, máy B bật Tự sửa đồ: giữ cả hai. Cùng sửa một mục: lần sửa sau thắng.
- Máy còn bản cũ gửi lại thì không đè lần sửa mới hơn (trả về `kept`). Lần đồng bộ đầu của một máy tính mọi mục là "từ trước" (thời điểm 0), nên máy vào sau không đè dữ liệu đã có.
- Tên hiển thị hay mật khẩu để trống không xoá cái đã có. Thời điểm vượt giờ server tính bằng giờ server.
- **Nhập JSON** trên app thì các nick vừa nhập tính là "từ trước" (thời điểm 0): nick server chưa có thì được thêm, nhưng không đè lần sửa mới hơn của máy khác. Sửa tay sau đó mới tính là sửa lúc đó.
- Hai lần gửi cùng lúc cho cùng một nick: server chỉ ghi khi dòng còn y như lúc đọc. Dòng đã bị lần gửi kia đổi thì đọc lại và gộp lại, thử tối đa 3 lần, quá nữa thì trả 503 để app gửi lại sau.
- Gửi bằng API token (`POST /api/accounts`) thì mọi mục tính là sửa lúc gửi.
- Xoá nick trên app không xoá trên server; xoá ở trang Nick.

Server trả `{"added", "updated", "unchanged", "kept", "repeated"}`. Máy chưa báo danh bị từ chối (404); máy bị chặn hay chưa được cho đồng bộ cũng vậy (403). Mỗi lần gửi chỉ đọc bảng nick một lần và ghi chung một batch, vì gói Workers Free chỉ cho 50 truy vấn D1 mỗi lần gọi. Trang Thiết bị hiện lần đồng bộ cuối, rê chuột lên đó để xem Cài đặt của máy.

**Vì sao phải duyệt:** app không giữ được bí mật nên máy chỉ được nhận ra bằng mã máy. Ai biết API cũng báo danh được một mã mới, nhưng chưa được Cho đồng bộ thì không ghi được nick nào. Mã của máy đã duyệt là SHA-256 của mã máy, không đoán được; trang admin chỉ hiện 12 ký tự đầu.

## Bảo mật

- **Mật khẩu game và mật khẩu proxy lưu nguyên văn** trong D1, không mã hoá. Đây là lựa chọn của người dùng, để trang quản trị xem được. Ai có token hay đăng nhập được trang quản trị là đọc được mọi mật khẩu. Vì vậy:
  - giữ token như mật khẩu;
  - thu hồi ngay token của máy bị mất;
  - đặt mật khẩu quản trị mạnh.
- **Mật khẩu quản trị**:
  - băm bằng PBKDF2-SHA256, 100.000 vòng (mức cao nhất Workers cho phép), muối ngẫu nhiên;
  - đổi mật khẩu thì mọi phiên đăng nhập khác bị đăng xuất;
  - một IP nhập sai 10 lần trong 15 phút thì phải đợi hết 15 phút đó, kể cả khi sau đó nhập đúng.
- **Phiên đăng nhập**:
  - cookie `cllt_admin` (HttpOnly, SameSite=Strict, Secure trên HTTPS), sống 7 ngày;
  - database chỉ giữ SHA-256 của cookie;
  - form gửi từ trang khác (Origin khác) bị từ chối.
- **API token**: dạng `cllt_` + 43 ký tự ngẫu nhiên; database chỉ giữ SHA-256 và 10 ký tự đầu để nhận ra.
- **Trang quản trị**:
  - chặn script lạ bằng Content-Security-Policy có nonce;
  - mọi chữ lấy từ database (tên nick, tài khoản) đều được escape trước khi hiện;
  - không cho nhúng trong khung (`frame-ancestors 'none'`), không cache.

## Mã nguồn

Chia lớp như một backend thường gặp: request đi `routes/` → `middlewares/` → `controllers/` → `services/` (dữ liệu gửi lên được `validators/` đọc và kiểm) → `db/`; `views/` dựng HTML của trang quản trị.

| Thư mục / file | Làm gì |
|---|---|
| `src/index.ts` | Entry của Worker (`main` trong `wrangler.toml`) |
| `src/app.ts` | Tạo app [Hono](https://hono.dev): middleware chung, gắn `/api` và `/admin`, trả lời đường dẫn lạ và lỗi |
| `src/config/constants.ts` | Mọi con số và tên cố định: thời hạn phiên, giới hạn đăng nhập sai, độ dài tối đa, header bảo mật, CSP |
| `src/config/messages.ts` | Mọi câu chữ server nói: thông báo, lỗi của trang quản trị và API |
| `src/db/schema.ts` | Model: 6 bảng cho [Drizzle ORM](https://orm.drizzle.team). `migrations/*.sql` vẫn là thứ tạo bảng (`yarn db:migrate`); mỗi bảng ở đây khớp từng cột với `CREATE TABLE` bên đó, nên sửa bảng thì sửa cả hai |
| `src/db/client.ts` | Kết nối Drizzle với D1 |
| `src/models/` | Kiểu dữ liệu: dòng của từng bảng (suy ra từ schema), nick theo JSON của app, `hello` của thiết bị |
| `src/types/app.ts` | Kiểu của app Hono: binding `DB`, biến của request (`db`, `form`, `me`, `source`) |
| `src/routes/` | `api.routes.ts` (`/api`, CORS) và `admin.routes.ts` (`/admin`): đường dẫn nào, qua middleware nào, tới controller nào |
| `src/middlewares/` | `context` (Drizzle, header bảo mật), `admin` (form cùng nguồn, bắt đăng nhập, bắt đổi mật khẩu mặc định), `api` (API token) |
| `src/controllers/` | Nhận request, gọi service, trả JSON hay trang (`<AccountsView … />`): `auth`, `account`, `device`, `token` (`.tsx`) |
| `src/services/` | Nghiệp vụ và truy vấn: `auth` (admin, phiên, đăng nhập sai), `token`, `account` (thêm/thay như Nhập JSON), `device` |
| `src/validators/` | Kiểm dữ liệu bằng [Zod](https://zod.dev): nick (giống `backup::parse` của app), `hello` và `sync` của thiết bị, các form admin (đăng nhập, đổi mật khẩu, tạo token, chặn, đặt tên). `form.ts`: `check` trả dữ liệu hoặc lỗi theo từng ô, để trang hiện lỗi ngay dưới ô đó |
| `src/views/` | Trang quản trị bằng JSX của Hono (`hono/jsx`, viết như component React, render ra HTML ở server): mọi giá trị chèn vào đều được escape. `layout.tsx` (khung trang và các component dùng chung `Icon`, `Field`, `Message`, `Chip`, `Table`), `styles.ts` (token màu Material 3, sáng và tối), `icons.ts` (sinh tự động), và một file `*.view.tsx` mỗi trang |
| `client/admin.ts` | Script chạy trên trình duyệt: nạp các component [Material Web](https://github.com/material-components/material-web) (`md-filled-button`, `md-outlined-text-field`, `md-icon-button`, `md-dialog`…), Hiện/Ẩn và Chép mật khẩu, hộp xác nhận, ô tìm. `scripts/build-client.mjs` gói bằng esbuild vào `public/assets/admin.js` (khoảng 145 KB, nén gzip còn 32 KB); Wrangler tự chạy trước `dev` và `deploy` (`[build]`), Cloudflare phục vụ file đó trực tiếp (`[assets]`) |
| `scripts/icons.mjs` | Sinh `src/views/icons.ts` từ [Material Symbols](https://fonts.google.com/icons) (`@material-symbols/svg-400`, kiểu outlined): icon vẽ thẳng bằng SVG, không tải font, không gọi Google. Thêm icon: thêm tên vào `NAMES` rồi `yarn icons` |
| `src/utils/` | `crypto` (PBKDF2, SHA-256), `http` (IP, cookie, body có giới hạn), `render` (trang kèm nonce của CSP), `format` (giờ Việt Nam) |
| `scripts/d1-id.mjs` | Tìm hay tạo D1 `cllt` trên Cloudflare, ghi id vào `wrangler.toml` (`yarn d1:id`; workflow deploy dùng) |
| `migrations/0001_init.sql`, `0002_devices.sql`, `0003_sync.sql` | Các bảng: `admins`, `sessions`, `login_failures`, `tokens`, `accounts`; `devices`; cột `changed` của `accounts`, `settings` và `synced_at` của `devices` |
| `test/server.test.ts` | Test cả Worker trên D1 giả (`test/d1.ts`, chạy bằng `node:sqlite`, có đủ các hàm của D1 mà Drizzle dùng) |
| `test/d1-id.test.ts` | Test `scripts/d1-id.mjs`: đọc `wrangler d1 list --json`, ghi `database_id` |

**Giao diện:** Material Design 3 bằng Material Web, bộ component chính chủ của Google: server render thẻ `md-*` bằng JSX của Hono, script `/assets/admin.js` định nghĩa chúng trên trình duyệt. Các ô `md-outlined-text-field` vẫn là ô của form, nên form gửi như HTML thường. Màu theo cài đặt sáng hay tối của máy. Thẻ script và style mang nonce của CSP, nên CSP vẫn giữ `default-src 'none'`. JSX của Hono có cú pháp như React (component, props, `{list.map(…)}`), nhưng chỉ render ra HTML ở server: không tải React về trình duyệt. Không dùng EJS vì EJS biên dịch template bằng `new Function`, mà Cloudflare Workers cấm. Wrangler tự dịch JSX khi deploy (`jsx`, `jsxImportSource` trong `tsconfig.json`); test chạy trên Node qua `tsx` (`node --import tsx --test`).

Kiểm tra: `yarn test` (chạy `tsc` rồi test). Bản đã chạy thật trong `wrangler dev` (workerd): đăng nhập `admin`/`admin`, bị chuyển sang đổi mật khẩu, tạo token, gửi một nick lên, tải về có mật khẩu, trang Nick hiện nick đó, header CSP có nonce.
