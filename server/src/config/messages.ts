// What the server says to people, in one place: the admin page's notices and errors, and the API's errors.
import { FAIL_LIMIT, LOG_WINDOW_MS, MAX_LICENSE_ACCOUNTS, MAX_LICENSE_BATCH, MAX_SYNC_EVENTS, MIN_PASSWORD } from './constants.ts';

/** The fixed lines a redirect may ask a page to show (?done=…): never text from the URL itself. */
export const FLASH: Record<string, string> = {
  deleted: 'Đã xoá nick khỏi server.',
  password: 'Đã đổi mật khẩu.',
  revoked: 'Đã khoá key: app dùng key đó bị khoá ở lần kiểm tra tiếp theo (tối đa 1 giờ).',
  restored: 'Đã mở khoá key.',
  bachHoOn: 'Đã bật Bạch Hổ cho key: app dùng key đó chạy được Bạch Hổ từ lần kiểm tra tiếp theo (tối đa 1 giờ, hoặc khi mở app hay mở cửa sổ Bạch Hổ).',
  bachHoOff: 'Đã tắt Bạch Hổ cho key: app dùng key đó dừng Bạch Hổ ở lần kiểm tra tiếp theo (tối đa 1 giờ, hoặc khi mở app hay mở cửa sổ Bạch Hổ).',
  released: 'Đã gỡ thiết bị khỏi key: máy đó không dùng key này được nữa, máy khác nhập key này là kích hoạt được, hạn vẫn giữ.',
  saved: 'Đã lưu key.',
  removed: 'Đã xoá key: app dùng key đó bị khoá ở lần kiểm tra tiếp theo. Nick key đó đã đồng bộ vẫn giữ.',
};

/** The fixed errors a redirect may ask a page to show (?error=…), as FLASH. */
export const FLASH_ERROR: Record<string, string> = {
  activated: 'Chưa lưu gì: key vừa được kích hoạt nên đã có ngày hết hạn, không còn sửa thời hạn được. Xem lại rồi sửa theo ngày.',
  gone: 'Chưa lưu gì: key không còn nữa (đã bị xoá).',
};

export const AUTH = {
  wrongLogin: 'Sai tên đăng nhập hoặc mật khẩu',
  noAdmin: 'Server chưa có mật khẩu quản trị: đặt secret ADMIN_PASSWORD (npx wrangler secret put ADMIN_PASSWORD) rồi đăng nhập lại',
  lockedOut: (minutes: number) => `Đăng nhập sai ${FAIL_LIMIT} lần liền: thử lại sau ${minutes} phút`,
  wrongCurrent: 'Mật khẩu hiện tại không đúng',
  noCurrent: 'Nhập mật khẩu hiện tại',
  tooShort: `Mật khẩu mới cần ít nhất ${MIN_PASSWORD} ký tự`,
  sameAsOld: 'Mật khẩu mới phải khác mật khẩu cũ',
  mismatch: 'Nhập lại mật khẩu mới không khớp',
};

export const HTTP = {
  wrongOrigin: 'Sai nguồn gửi',
  notAForm: 'Cần gửi bằng form',
  noPage: 'Không có trang này',
  noApi: 'Không có API này',
  serverError: 'Lỗi server, xem log của Worker (yarn wrangler tail)',
  onlyPost: 'Chỉ có POST',
  accountsTooLarge: 'JSON quá lớn (tối đa 1 MB)',
  tooLarge: 'JSON quá lớn',
  tooManyRequests: 'Gửi quá nhiều, thử lại sau một phút',
};

/** What is wrong with the accounts of a JSON (validators/account.validator.ts), in the words of Nhập JSON of the app. */
export const ACCOUNT = {
  nth: (n: number, why: string) => `Nick thứ ${n}: ${why}`,
  notObject: 'không phải một object',
  noUsername: 'thiếu tài khoản (username)',
  passwordText: '"password" phải là chuỗi',
  labelText: '"label" phải là chuỗi',
  serverIdInt: '"serverId" phải là số nguyên',
};

/** What POST /api/license/verify and /api/license/sync tell the app when a key does not work, what is wrong with what
 * the app sent, and with a form of the Key page (validators/license.validator.ts). */
export const LICENSE = {
  unknown: 'Key không đúng',
  revoked: (reason: string) => (reason ? `Key đã bị khoá: ${reason}` : 'Key đã bị khoá'),
  taken: 'Key đã được kích hoạt trên máy khác',
  released: 'Key đã được gỡ khỏi máy này, liên hệ admin',
  expired: (day: string) => `Key đã hết hạn ngày ${day}`,
  inactive: 'Key chưa được kích hoạt trên máy này: mở app để kiểm tra key trước',
  badKey: '"key" phải là chuỗi',
  badJson: 'JSON không đọc được',
  notObject: 'Cần một object JSON',
  badId: 'id phải là 64 ký tự hex (SHA-256)',
  notList: '"accounts" phải là một danh sách',
  tooMany: (n: number) => `Tối đa ${n} nick một lần`,
  notEvents: '"events" phải là một danh sách',
  tooManyEvents: `Tối đa ${MAX_SYNC_EVENTS} việc (events) một lần`,
  tooSoon: (s: number) => `Đồng bộ quá dày: cách lần trước ít nhất ${s} giây`,
  maxAccounts: `Số nick tối đa là số nguyên từ 1 tới ${MAX_LICENSE_ACCOUNTS.toLocaleString('vi-VN')}`,
  count: `Số lượng là số nguyên từ 1 tới ${MAX_LICENSE_BATCH}`,
  duration: 'Thời hạn là số nguyên từ 1, tối đa 100 năm',
  date: 'Chọn ngày hết hạn',
  pastDate: 'Ngày hết hạn phải từ hôm nay trở đi',
  mode: 'Chọn cách tính hạn',
};

const WINDOW = `${LOG_WINDOW_MS / 60_000} phút`;
const host = (hostname: string) => hostname || 'không tên';
const nick = (username: string, serverId: number | null) => `${username}${serverId === null ? '' : ` (S${serverId})`}`;

/** The lines of the Log page (services/log.service.ts): each row says what happened in one line. */
export const LOG = {
  activated: (key: string, hostname: string) => `Kích hoạt key ${key} trên máy ${host(hostname)}`,
  /** A refusal of POST /api/license/verify, by why: the key as typed (unknown) or its name. */
  refused: {
    unknown: (typed: string, hostname: string) => `Nhập key sai "${typed || '(trống)'}" trên máy ${host(hostname)}`,
    revoked: (key: string, hostname: string) => `Key ${key} đã bị khoá: máy ${host(hostname)} bị từ chối`,
    taken: (key: string, hostname: string) => `Key ${key} đang ở máy khác: máy ${host(hostname)} bị từ chối`,
    released: (key: string, hostname: string) => `Key ${key} đã gỡ khỏi máy ${host(hostname)}: máy đó bị từ chối`,
    expired: (key: string, hostname: string, day: string) => `Key ${key} hết hạn ngày ${day}: máy ${host(hostname)} bị từ chối`,
  },
  /** A row of a key not known or of failed logins counted LOG_DANGER_COUNT times or more: what the IP did, how many
   * times (`n`, filled in by the database). */
  burst: {
    unknown: (ip: string, n: string) => `IP ${ip} nhập key sai ${n} lần trong ${WINDOW}`,
    login: (ip: string, n: string) => `IP ${ip} đăng nhập sai ${n} lần trong ${WINDOW}`,
  },
  /** What the app of a key did to an account. */
  app: {
    add: (username: string, serverId: number) => `Thêm nick ${nick(username, serverId)}`,
    remove: (username: string, serverId: number) => `Xoá nick ${nick(username, serverId)} trên máy`,
    edit: (username: string, serverId: number) => `Sửa nick ${nick(username, serverId)}`,
    import: (username: string, serverId: number) => `Nhập nick ${nick(username, serverId)} từ JSON`,
  },
  /** What a sync took, from its parts ("thêm 3 nick", …). */
  synced: (parts: string[]) => `Đồng bộ: ${parts.join(', ')}`,
  added: (n: number) => `thêm ${n} nick`,
  updated: (n: number) => `cập nhật ${n} nick`,
  overMax: (n: number) => `${n} nick vượt số nick tối đa`,
  ofOther: (n: number) => `${n} nick của key khác`,
  login: 'Đăng nhập trang quản trị',
  loginFail: (username: string) => `Đăng nhập sai (tên "${username}")`,
  logout: 'Đăng xuất',
  password: 'Đổi mật khẩu quản trị',
  created: (n: number, name: string) => (n === 1 ? `Tạo key ${name}` : `Tạo ${n} key${name ? `: ${name}` : ''}`),
  revoked: (key: string, reason: string) => `Khoá key ${key}${reason ? `: ${reason}` : ''}`,
  restored: (key: string) => `Mở khoá key ${key}`,
  bachHoOn: (key: string) => `Bật Bạch Hổ cho key ${key}`,
  bachHoOff: (key: string) => `Tắt Bạch Hổ cho key ${key}`,
  released: (key: string, hostname: string) => `Gỡ máy ${host(hostname)} khỏi key ${key}`,
  edited: (key: string, changes: string[]) => `Sửa key ${key}: ${changes.join(', ')}`,
  deleted: (key: string, full: string) => `Xoá key ${key} (${full})`,
  accountDeleted: (username: string, serverId: number) => `Xoá nick ${nick(username, serverId)} khỏi server`,
  /** The changes Sửa made. */
  note: (from: string, to: string) => `ghi chú "${from}" → "${to}"`,
  maxAccounts: (from: number, to: number) => `số nick ${from} → ${to}`,
  ends: (from: string, to: string) => `hạn ${from} → ${to}`,
  bachHo: (on: boolean) => (on ? 'bật Bạch Hổ' : 'tắt Bạch Hổ'),
};
