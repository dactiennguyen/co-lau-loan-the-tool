// What the server says to people, in one place: the admin page's notices and errors, and the API's errors.
import { EXPORT_FORMAT, FAIL_LIMIT, MAX_TOKEN_NAME, MIN_PASSWORD } from './constants.ts';

/** The fixed lines a redirect may ask a page to show (?done=…): never text from the URL itself. */
export const FLASH: Record<string, string> = {
  deleted: 'Đã xoá nick khỏi server.',
  password: 'Đã đổi mật khẩu.',
  blocked: 'Đã chặn thiết bị: app trên máy đó bị khoá ở lần báo tiếp theo (tối đa 15 phút).',
  unblocked: 'Đã bỏ chặn thiết bị.',
  renamed: 'Đã đặt tên thiết bị.',
  forgotten: 'Đã xoá thiết bị khỏi danh sách. Lần mở app tới nó sẽ hiện lại, vẫn được dùng; muốn ngăn thì Chặn.',
  syncOn: 'Đã cho máy đồng bộ nick: nick của máy lên trang Nick ở lần báo tiếp theo (tối đa 15 phút).',
  syncOff: 'Đã tắt đồng bộ nick của máy. Nick máy đó đã gửi vẫn giữ trên trang Nick.',
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
  noToken: 'Thiếu hoặc sai API token (Authorization: Bearer …)',
  onlyGetPost: 'Chỉ có GET và POST',
  onlyPost: 'Chỉ có POST',
  accountsTooLarge: 'JSON quá lớn (tối đa 1 MB)',
  helloTooLarge: 'JSON quá lớn',
  unknownDevice: 'Thiết bị chưa báo danh (POST /api/devices/hello trước)',
  blockedDevice: 'Thiết bị đã bị khoá, vui lòng liên hệ admin',
  syncNotAllowed: 'Admin chưa cho máy này đồng bộ nick (Cho đồng bộ trên trang Thiết bị)',
  wrongDeviceKey: 'Khoá thiết bị không đúng: id này đã báo danh với khoá khác (Xoá khỏi danh sách trên trang Thiết bị để báo danh lại)',
  noDeviceKey: 'Máy này chưa có khoá thiết bị: cập nhật app lên bản mới để đồng bộ nick',
  tokenName: `Đặt tên token từ 1 tới ${MAX_TOKEN_NAME} ký tự`,
};

/** What is wrong with the accounts of a JSON (validators/account.validator.ts), in the words of Nhập JSON of the app. */
export const ACCOUNT = {
  empty: 'Chưa có JSON',
  badJson: 'JSON không hợp lệ: {reason}',
  newerFormat: (f: number) => `JSON của bản app mới hơn (format ${f} > ${EXPORT_FORMAT}): cập nhật server rồi gửi lại`,
  notList: '"accounts" phải là một danh sách',
  noAccounts: 'Không thấy nick nào: cần {"accounts": […]}, một danh sách nick, hoặc một nick có "username"',
  none: 'JSON không có nick nào',
  nth: (n: number, why: string) => `Nick thứ ${n}: ${why}`,
  notObject: 'không phải một object',
  noUsername: 'thiếu tài khoản (username)',
  passwordText: '"password" phải là chuỗi',
  labelText: '"label" phải là chuỗi',
  serverIdInt: '"serverId" phải là số nguyên',
};

/** What is wrong with a hello or a sync of a device (validators/device.validator.ts). */
export const DEVICE = {
  badJson: 'JSON không đọc được',
  notObject: 'Cần một object JSON',
  badId: 'id phải là 64 ký tự hex (SHA-256)',
  badKey: 'key phải là 64 ký tự hex',
  notList: '"accounts" phải là một danh sách',
  tooMany: (n: number) => `Tối đa ${n} nick một lần`,
};
