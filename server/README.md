# CLLT Server

Server riêng để giữ danh sách nick và key của app CLLT Tool trên Cloudflare, chạy tại **https://colau.olachat.net** (trang quản trị: `/admin`). Gồm:
- một **Worker** (TypeScript, `src/`, chia lớp route/controller/service, xem [Mã nguồn](#mã-nguồn)), định tuyến bằng [Hono](https://hono.dev), đọc ghi database bằng [Drizzle ORM](https://orm.drizzle.team);
- một database **D1** (SQLite của Cloudflare, `migrations/`);
- **API** để gửi nick lên và tải nick về, và để app kiểm tra key và đồng bộ nick ([Key](#key));
- **trang quản trị** có đăng nhập.

Gói miễn phí của Cloudflare (Workers và D1) là đủ.

App desktop gọi `POST /api/license/verify` (kiểm tra key) và `POST /api/license/sync` (gửi nick lên). Ngoài ra dùng API bằng `curl`, hay tải JSON từ trang quản trị rồi Nhập JSON vào app.

## Có gì

| Phần | Đường dẫn | Cần gì |
|---|---|---|
| Trang quản trị | `/admin` | Đăng nhập. Lần đầu là `admin` / `admin` |
| Danh sách nick (xem, hiện mật khẩu, xoá, Tải JSON, lọc theo key) | `/admin` | Đăng nhập |
| Key (tạo, khoá, mở khoá, gỡ thiết bị, sửa, xoá) | `/admin/licenses` | Đăng nhập |
| Tạo và thu hồi API token | `/admin/tokens` | Đăng nhập |
| Đổi mật khẩu quản trị | `/admin/password` | Đăng nhập |
| App kiểm tra key | `POST /api/license/verify` | Key |
| App gửi nick lên | `POST /api/license/sync` | Key đã kích hoạt trên máy đó |
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

## Key

Mỗi người dùng app cần một **key** dạng `CLLT-XXXX-XXXX-XXXX-XXXX` (16 ký tự base32 của Crockford, không có I, L, O, U). Admin tạo key trên trang **Key** (`/admin/licenses`) rồi gửi cho người dùng; app hỏi key ở lần mở đầu, lưu lại, rồi kiểm tra khi mở và mỗi giờ một lần ([features.md](../docs/integration/rust/features.md)).

**Tạo key**:
- **Ghi chú** (key của ai) và **số nick tối đa**, mặc định 100;
- **hạn**:
  - **tính từ lúc kích hoạt**, mặc định 10 năm: đếm từ lần đầu một máy nhập key (cộng theo lịch: 10 năm từ 04/11/2026 là 04/11/2036, cùng giờ);
  - **ngày cố định**: key dùng tới hết ngày đó theo giờ Việt Nam.

Tạo xong, trang quay về danh sách và hiện key mới để chép (tải lại trang không tạo thêm key).

**Một key, một máy:**
- Máy đầu tiên nhập key **giữ key** đó. Server ghi tên máy, hệ điều hành, bản app, IP, số nick trong app, lúc kích hoạt và lần kiểm tra cuối.
- Máy khác nhập cùng key bị từ chối ("Key đã được kích hoạt trên máy khác").
- **Gỡ thiết bị** chuyển key sang máy khác:
  - Máy cũ bị từ chối ngay ở lần kiểm tra tới ("Key đã được gỡ khỏi máy này, liên hệ admin"). Nó cũng không kích hoạt lại được, dù app của nó kiểm tra lại mỗi giờ và key đang trống.
  - Máy khác nhập key là kích hoạt được; từ đó máy cũ chỉ còn là "máy khác".
  - Hạn giữ nguyên như đã tính ở lần kích hoạt đầu.

**Thao tác khác trên trang Key:**
- **Khoá** kèm lý do (app hiện lý do), **Mở khoá**.
- **Sửa** ghi chú, số nick tối đa, và ngày hết hạn (key chưa kích hoạt thì sửa thời hạn). Chọn một ngày đã qua là cho key hết hạn ngay. Key được kích hoạt trong lúc đang sửa thời hạn thì không lưu gì, và trang báo lý do.
- **Xoá** key: app dùng key đó bị khoá; các nick key đó đã đồng bộ vẫn giữ.

Hết hạn, bị khoá hay bị xoá thì app khoá ở lần kiểm tra tới, tức tối đa 1 giờ nếu app đang mở.

**Kiểm tra key**: `POST /api/license/verify`, không cần token:

```json
{"key": "cllt 26wm py7q trp8 k2ne", "id": "<64 ký tự hex>", "hostname": "MAY-NHA", "os": "windows x86_64", "version": "1.1.8", "accounts": 12}
```

- `key` viết sao cũng được: hoa thường, dấu cách, dấu gạch, có hay không có `CLLT` đầu, O thay cho 0, I/L thay cho 1.
- `id` là SHA-256 của mã máy do hệ điều hành giữ (`MachineGuid` trên Windows, `IOPlatformUUID` trên macOS, `/etc/machine-id` trên Linux). Gỡ app rồi cài lại vẫn là một máy.
- `accounts` là số nick trong app.
- Trả lời luôn là 200, để app phân biệt câu trả lời của server với lỗi mạng:
  - key dùng được: `{"ok": true, "maxAccounts": 100, "expiresAt": <ms>, "activatedAt": <ms>}`;
  - key không dùng được: `{"ok": false, "code": "…", "error": "<câu cho người dùng>"}`, `code` là:

    | `code` | Câu báo |
    |---|---|
    | `unknown` | "Key không đúng" |
    | `revoked` | "Key đã bị khoá: <lý do>" |
    | `taken` | "Key đã được kích hoạt trên máy khác" |
    | `expired` | "Key đã hết hạn ngày dd/mm/yyyy", kèm `expiresAt` |

- JSON sai thì trả 400, quá 4 KB thì 413.
- Mỗi lần kiểm tra là 2 truy vấn D1. Các lần ghi có điều kiện:
  - Lần kích hoạt chỉ ghi khi key còn chưa máy nào giữ, nên hai máy nhập cùng lúc thì chỉ một máy giữ được.
  - Key đã hết hạn thì không được kích hoạt.
  - Lần ghi của máy đang giữ key chỉ đi khi máy đó còn giữ key và key chưa bị khoá. Admin khoá hay gỡ đúng lúc máy đang kiểm tra thì máy đó không bao giờ nhận `ok: true`.

**Giới hạn:** mã máy do app tự báo. Người rành máy tính có thể đổi `MachineGuid` (cần quyền admin) hay sửa app để gửi mã khác. Key chặn người dùng thường dùng chung key, không chặn người cố tình.

## Đồng bộ nick

Chỉ một chiều, **từ app lên server**: server giữ bản sao để xem trên trang **Nick** và Tải JSON, app không tải gì về.

**Khi nào app gửi:** khi key của app dùng được trên máy đó, app gửi `POST /api/license/sync` với key và các nick đã đổi kể từ lần gửi trước. Mỗi nick gửi nguyên vẹn: mật khẩu, proxy, Cài đặt đánh, kỹ năng, chỉ số. Cài đặt của app cũng gửi kèm khi đổi:

```json
{"key": "CLLT-26WM-PY7Q-TRP8-K2NE", "id": "<64 ký tự hex>", "settings": {"server": …, "record": true, "onClose": "ask"},
 "accounts": [{"account": {"username": "tiheo1", "password": "…", "serverId": 24, "fight": {…}},
               "changed": {"password": 1762059000000, "fight": 0, "label": 0}}]}
```

**Server chỉ nhận khi** key có thật, không bị khoá, chưa hết hạn, và đang được đúng máy `id` đó giữ. Không thì trả 403 `{"error": "…", "code": "…"}`, với `code` là `unknown`, `revoked`, `taken`, `expired`, hay `inactive` (key chưa kích hoạt trên máy nào). Biết key mà không ở đúng máy thì không ghi được nick nào.

**Nick của ai thì key đó giữ.** Server xét từng nick:
- Nick key đó đã gửi thì luôn được cập nhật.
- Nick **key khác đang giữ** thì không ghi gì và không chiếm được. Mật khẩu hay proxy của nick đó giữ nguyên. Nick này đếm trong `taken` và `refused`.
- Nick chưa key nào giữ (mới, hay do token gửi, hay key cũ đã bị xoá) chỉ được nhận khi key còn dưới **số nick tối đa**. Phần còn lại không ghi, đếm trong `refused`.
- Mỗi nick nhận được ghi lại key đã gửi nó (cột `license_id`). Trang Nick có cột **Key** và ô lọc theo key; trang Key hiện số nick đã đồng bộ (bấm để xem) và lần đồng bộ cuối. Rê chuột lên đó để xem Cài đặt của app.

**Gộp từng mục:** mỗi nick (cùng server game, tài khoản không phân biệt hoa thường) là **một dòng**. Lần gửi của key đang giữ nick, hay của token, gộp vào đó **từng mục**:
- `changed` ghi lúc app thấy từng mục đổi. Server giữ cho mỗi mục giá trị của lần sửa **sau cùng** (cột `changed` của bảng `accounts`).
- Gửi lại y như cũ: không đổi gì. Lần này sửa mật khẩu, lần sau bật Tự sửa đồ: giữ cả hai. Cùng sửa một mục: lần sửa sau thắng.
- App còn bản cũ gửi lại thì không đè lần sửa mới hơn (trả về `kept`). Lần đồng bộ đầu tính mọi mục là "từ trước" (thời điểm 0), nên app vào sau không đè dữ liệu đã có.
- Tên hiển thị hay mật khẩu để trống không xoá cái đã có. Thời điểm vượt giờ server tính bằng giờ server.
- **Nhập JSON** trên app thì các nick vừa nhập tính là "từ trước" (thời điểm 0). Sửa tay sau đó mới tính là sửa lúc đó.
- Hai lần gửi cùng lúc cho cùng một nick: server chỉ ghi khi dòng còn y như lúc đọc (cả key đang giữ nó). Dòng đã bị lần gửi kia đổi thì đọc lại và gộp lại, thử tối đa 3 lần. Quá nữa thì trả 503 để app gửi lại sau.
- Gửi bằng API token (`POST /api/accounts`) thì mọi mục tính là sửa lúc gửi, và nick giữ key cũ của nó.
- Xoá nick trên app không xoá trên server; xoá ở trang Nick.

**Kết quả:** server trả `{"added", "updated", "unchanged", "kept", "repeated", "refused", "taken"}`. JSON sai thì 400, quá 1 MB thì 413.

**Giới hạn D1:** mỗi lần gửi chỉ đọc bảng nick một lần và ghi chung một batch, vì gói Workers Free chỉ cho 50 truy vấn D1 mỗi lần gọi.

**Bỏ quản lý thiết bị:** trang Thiết bị, `POST /api/devices/hello` và `/api/devices/sync` đã bỏ. [0006_licenses_sync.sql](migrations/0006_licenses_sync.sql) xoá bảng `devices` cùng mọi thiết bị trong đó. Key thay cho việc duyệt từng máy.

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
| `src/models/` | Kiểu dữ liệu: dòng của từng bảng (suy ra từ schema), nick theo JSON của app, kiểm tra key và đồng bộ của app |
| `src/types/app.ts` | Kiểu của app Hono: binding `DB`, biến của request (`db`, `form`, `me`, `source`) |
| `src/routes/` | `api.routes.ts` (`/api`, CORS) và `admin.routes.ts` (`/admin`): đường dẫn nào, qua middleware nào, tới controller nào |
| `src/middlewares/` | `context` (Drizzle, header bảo mật), `admin` (form cùng nguồn, bắt đăng nhập, bắt đổi mật khẩu mặc định), `api` (API token) |
| `src/controllers/` | Nhận request, gọi service, trả JSON hay trang (`<AccountsView … />`): `auth`, `account`, `license`, `token` (`.tsx`) |
| `src/services/` | Nghiệp vụ và truy vấn: `auth` (admin, phiên, đăng nhập sai), `token`, `account` (thêm/thay như Nhập JSON, gộp từng mục khi đồng bộ), `license` (key: tạo, kiểm tra, kích hoạt) |
| `src/validators/` | Kiểm dữ liệu bằng [Zod](https://zod.dev): nick (giống `backup::parse` của app), kiểm tra key và đồng bộ của app, các form admin (đăng nhập, đổi mật khẩu, tạo token, tạo và sửa key, khoá key). `form.ts`: `check` trả dữ liệu hoặc lỗi theo từng ô, để trang hiện lỗi ngay dưới ô đó |
| `src/views/` | Trang quản trị bằng JSX của Hono (`hono/jsx`, viết như component React, render ra HTML ở server): mọi giá trị chèn vào đều được escape. `layout.tsx` (khung trang và các component dùng chung `Icon`, `Field`, `Message`, `Chip`, `Table`), `styles.ts` (token màu Material 3, sáng và tối), `icons.ts` (sinh tự động), và một file `*.view.tsx` mỗi trang |
| `client/admin.ts` | Script chạy trên trình duyệt: nạp các component [Material Web](https://github.com/material-components/material-web) (`md-filled-button`, `md-outlined-text-field`, `md-icon-button`, `md-dialog`, `md-radio`, `md-outlined-select`…), Hiện/Ẩn và Chép mật khẩu, hộp xác nhận, ô tìm, hai cách tính hạn của Tạo key, ô lọc theo key. `scripts/build-client.mjs` gói bằng esbuild vào `public/assets/admin.js` (khoảng 145 KB, nén gzip còn 32 KB); Wrangler tự chạy trước `dev` và `deploy` (`[build]`), Cloudflare phục vụ file đó trực tiếp (`[assets]`) |
| `scripts/icons.mjs` | Sinh `src/views/icons.ts` từ [Material Symbols](https://fonts.google.com/icons) (`@material-symbols/svg-400`, kiểu outlined): icon vẽ thẳng bằng SVG, không tải font, không gọi Google. Thêm icon: thêm tên vào `NAMES` rồi `yarn icons` |
| `src/utils/` | `crypto` (PBKDF2, SHA-256), `http` (IP, cookie, body có giới hạn), `render` (trang kèm nonce của CSP), `format` (giờ Việt Nam) |
| `scripts/d1-id.mjs` | Tìm hay tạo D1 `cllt` trên Cloudflare, ghi id vào `wrangler.toml` (`yarn d1:id`; workflow deploy dùng) |
| `migrations/0001_init.sql` … `0006_licenses_sync.sql` | Các bảng: `admins`, `sessions`, `login_failures`, `tokens`, `accounts` (0001); `devices` (0002–0004, bỏ ở 0006); cột `changed` của `accounts` (0003); `licenses` (0005); cột `license_id` của `accounts` (0006) |
| `test/server.test.ts` | Test cả Worker trên D1 giả (`test/d1.ts`, chạy bằng `node:sqlite`, có đủ các hàm của D1 mà Drizzle dùng) |
| `test/d1-id.test.ts` | Test `scripts/d1-id.mjs`: đọc `wrangler d1 list --json`, ghi `database_id` |

**Giao diện:** Material Design 3 bằng Material Web, bộ component chính chủ của Google: server render thẻ `md-*` bằng JSX của Hono, script `/assets/admin.js` định nghĩa chúng trên trình duyệt. Các ô `md-outlined-text-field` vẫn là ô của form, nên form gửi như HTML thường. Màu theo cài đặt sáng hay tối của máy. Thẻ script và style mang nonce của CSP, nên CSP vẫn giữ `default-src 'none'`. JSX của Hono có cú pháp như React (component, props, `{list.map(…)}`), nhưng chỉ render ra HTML ở server: không tải React về trình duyệt. Không dùng EJS vì EJS biên dịch template bằng `new Function`, mà Cloudflare Workers cấm. Wrangler tự dịch JSX khi deploy (`jsx`, `jsxImportSource` trong `tsconfig.json`); test chạy trên Node qua `tsx` (`node --import tsx --test`).

Kiểm tra: `yarn test` (chạy `tsc` rồi test). Bản đã chạy thật trong `wrangler dev` (workerd): đăng nhập `admin`/`admin`, bị chuyển sang đổi mật khẩu, tạo token, gửi một nick lên, tải về có mật khẩu, trang Nick hiện nick đó, header CSP có nonce.
