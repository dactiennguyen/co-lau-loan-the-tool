# CLLT Server

Server riêng để giữ danh sách nick của app CLLT Tool trên Cloudflare, chạy tại **https://colau.olachat.net** (trang quản trị: `/admin`). Gồm:
- một **Worker** (TypeScript, `src/`);
- một database **D1** (SQLite của Cloudflare, `migrations/`);
- **API** để gửi nick lên và tải nick về;
- **trang quản trị** có đăng nhập.

Gói miễn phí của Cloudflare (Workers và D1) là đủ.

App desktop **chưa** gọi API này: phần đồng bộ trong app làm sau. Bây giờ dùng API bằng `curl`, hay tải JSON từ trang quản trị rồi Nhập JSON vào app.

## Có gì

| Phần | Đường dẫn | Cần gì |
|---|---|---|
| Trang quản trị | `/admin` | Đăng nhập. Lần đầu là `admin` / `admin` |
| Danh sách nick (xem, hiện mật khẩu, xoá, Tải JSON) | `/admin` | Đăng nhập |
| Tạo và thu hồi API token | `/admin/tokens` | Đăng nhập |
| Đổi mật khẩu quản trị | `/admin/password` | Đăng nhập |
| Kiểm tra server sống | `GET /api/health` | Không cần gì |
| Tải mọi nick về | `GET /api/accounts` | API token |
| Gửi nick lên | `POST /api/accounts` | API token |

## Cài lên Cloudflare

Cần Node.js ≥22.6 và một tài khoản Cloudflare. Mọi lệnh chạy trong thư mục `server/`.

1. Cài và đăng nhập Cloudflare (mở trình duyệt để cho phép):
   ```sh
   npm install
   npx wrangler login
   ```
2. Tìm hay tạo database `cllt` và ghi id của nó vào `database_id` của `wrangler.toml` (chạy được cả trên Windows):
   ```sh
   npm run d1:id
   ```
   Đừng commit id này: repo giữ chuỗi `00000000-…`, CI tự điền khi deploy.
3. Tạo các bảng, rồi đưa Worker lên:
   ```sh
   npm run db:migrate
   npm run deploy
   ```
   Lệnh deploy in ra địa chỉ: tên miền trong `routes` của `wrangler.toml` (`colau.olachat.net`; Cloudflare tự tạo bản ghi DNS và chứng chỉ, vì zone `olachat.net` nằm cùng tài khoản). Địa chỉ `workers.dev` đã tắt (`workers_dev = false`); muốn bật lại thì đặt `true`.
4. Mở `<địa chỉ>/admin` và đăng nhập `admin` / `admin`.
   - Trang buộc **đổi mật khẩu** trước (ít nhất 8 ký tự, khác `admin`). Đổi xong mới mở được các trang khác, vì trang Nick hiện mật khẩu game.
5. Vào **API token**, đặt tên (ví dụ "Máy nhà") rồi **Tạo token**.
   - Chép token ngay: server chỉ giữ dấu băm của token, nên không hiện lại được.
   - Mỗi máy nên có một token riêng, để thu hồi riêng.

Sửa code xong thì chỉ cần `npm run deploy` lại. Thêm file mới trong `migrations/` thì chạy `npm run db:migrate` trước.

## Tự deploy bằng GitHub Actions

Workflow [`.github/workflows/server-deploy.yml`](../.github/workflows/server-deploy.yml) tự chạy mỗi khi có commit trên `main` đổi gì trong `server/`. Cũng chạy được bằng tay: tab **Actions → Deploy Server → Run workflow**. Mỗi lần chạy:
1. Chạy `npm test`. Test lỗi thì dừng, không deploy.
2. Tìm database D1 `cllt` trên Cloudflare, chưa có thì tạo (`npm run d1:id`, file `scripts/d1-id.mjs`). Id của nó chỉ được ghi vào `wrangler.toml` trên máy chạy CI, nên không cần sửa `database_id` trong repo.
3. Tạo hay cập nhật bảng (`wrangler d1 migrations apply --remote`).
4. Deploy (`wrangler deploy`). Phần tóm tắt của lần chạy ghi địa chỉ trang quản trị.

Cần làm một lần trước:
1. **API token Cloudflare.** Vào My Profile → API Tokens → Create Token → Custom token, cấp hai quyền:
   - Account › **Workers Scripts** › Edit;
   - Account › **D1** › Edit;
   - Zone › **Workers Routes** › Edit và Zone › **DNS** › Edit, cho tên miền `colau.olachat.net` trong `routes` của `wrangler.toml`.

   Ở Account Resources chọn tài khoản của bạn; ở Zone Resources chọn zone `olachat.net`.
2. **Account ID.** Lấy ở cột phải trang Workers & Pages của dashboard, hay bằng `npx wrangler whoami`.
3. **Mở Workers & Pages trên dashboard một lần**, để tài khoản có tên miền `workers.dev`. Deploy từ CI không tự chọn tên miền này được.
4. **Thêm secret vào repo.** GitHub → repo → Settings → Secrets and variables → Actions → New repository secret, thêm hai secret:
   - `CLOUDFLARE_API_TOKEN`;
   - `CLOUDFLARE_ACCOUNT_ID`.

   Chưa có hai secret này thì workflow vẫn chạy test, rồi ghi cảnh báo và không deploy.

**Ngay sau lần deploy đầu, đăng nhập `admin` / `admin` và đổi mật khẩu.** Cho tới lúc đó, ai mở `/admin` trước cũng đăng nhập được và đổi mất mật khẩu.

## Chạy thử trên máy

Chạy trên máy dùng database riêng trên máy, không đụng tới bản trên Cloudflare.

```sh
npm install
npm run db:migrate:local
npm run dev        # http://localhost:8787/admin
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

| File | Làm gì |
|---|---|
| `src/index.ts` | Nhận request, chia đường dẫn, gắn header bảo mật |
| `src/auth.ts` | Tài khoản quản trị, đăng nhập, phiên, đổi mật khẩu, API token |
| `src/accounts.ts` | Đọc JSON (giống `backup::parse` của app), thêm/thay nick, xuất JSON |
| `src/pages.ts` | HTML của trang quản trị |
| `scripts/d1-id.mjs` | Tìm hay tạo D1 `cllt` trên Cloudflare, ghi id vào `wrangler.toml` (`npm run d1:id`; workflow deploy dùng) |
| `migrations/0001_init.sql` | Các bảng: `admins`, `sessions`, `login_failures`, `tokens`, `accounts` |
| `test/server.test.ts` | Test cả Worker trên D1 giả (`test/d1.ts`, chạy bằng `node:sqlite`) |
| `test/d1-id.test.ts` | Test `scripts/d1-id.mjs`: đọc `wrangler d1 list --json`, ghi `database_id` |

Kiểm tra: `npm test` (chạy `tsc` rồi test). Bản đã chạy thật trong `wrangler dev` (workerd): đăng nhập `admin`/`admin`, bị chuyển sang đổi mật khẩu, tạo token, gửi một nick lên, tải về có mật khẩu, trang Nick hiện nick đó, header CSP có nonce.
