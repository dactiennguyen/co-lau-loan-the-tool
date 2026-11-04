// What the server says to people, in one place: the admin page's notices and errors, and the API's errors.
import { FAIL_LIMIT, MAX_LICENSE_ACCOUNTS, MIN_PASSWORD } from './constants.ts';

/** The fixed lines a redirect may ask a page to show (?done=…): never text from the URL itself. */
export const FLASH: Record<string, string> = {
  deleted: 'Đã xoá nick khỏi server.',
  password: 'Đã đổi mật khẩu.',
  revoked: 'Đã khoá key: app dùng key đó bị khoá ở lần kiểm tra tiếp theo (tối đa 1 giờ).',
  restored: 'Đã mở khoá key.',
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
  lockedOut: (minutes: number) => `Đăng nhập sai ${FAIL_LIMIT} lần liền: thử lại sau ${minutes} phút`,
  wrongCurrent: 'Mật khẩu hiện tại không đúng',
  noCurrent: 'Nhập mật khẩu hiện tại',
  tooShort: `Mật khẩu mới cần ít nhất ${MIN_PASSWORD} ký tự`,
  sameAsOld: 'Mật khẩu mới phải khác mật khẩu cũ và khác "admin"',
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
  maxAccounts: `Số nick tối đa là số nguyên từ 1 tới ${MAX_LICENSE_ACCOUNTS.toLocaleString('vi-VN')}`,
  duration: 'Thời hạn là số nguyên từ 1, tối đa 100 năm',
  date: 'Chọn ngày hết hạn',
  pastDate: 'Ngày hết hạn phải từ hôm nay trở đi',
  mode: 'Chọn cách tính hạn',
};
