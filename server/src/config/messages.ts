// What the server says to people, in one place: the admin page's notices and errors, and the API's errors.
import { FAIL_LIMIT, MAX_TOKEN_NAME, MIN_PASSWORD } from './constants.ts';

/** The fixed lines a redirect may ask a page to show (?done=…): never text from the URL itself. */
export const FLASH: Record<string, string> = {
  deleted: 'Đã xoá nick khỏi server.',
  password: 'Đã đổi mật khẩu.',
  blocked: 'Đã chặn thiết bị: app trên máy đó bị khoá ở lần báo tiếp theo (tối đa 15 phút).',
  unblocked: 'Đã bỏ chặn thiết bị.',
  renamed: 'Đã đặt tên thiết bị.',
  forgotten: 'Đã xoá thiết bị khỏi danh sách. Lần mở app tới nó sẽ hiện lại, vẫn được dùng; muốn ngăn thì Chặn.',
};

export const AUTH = {
  wrongLogin: 'Sai tên đăng nhập hoặc mật khẩu',
  lockedOut: (minutes: number) => `Đăng nhập sai ${FAIL_LIMIT} lần liền: thử lại sau ${minutes} phút`,
  wrongCurrent: 'Mật khẩu hiện tại không đúng',
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
  tokenName: `Đặt tên token từ 1 tới ${MAX_TOKEN_NAME} ký tự`,
};
