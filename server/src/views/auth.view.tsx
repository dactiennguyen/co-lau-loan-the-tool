// Đăng nhập and Đổi mật khẩu.
import { MIN_PASSWORD } from '../config/constants.ts';
import { Layout, Message } from './layout.tsx';

export function LoginView({ nonce, error }: { nonce: string; error?: string }) {
  return (
    <Layout title="Đăng nhập" nonce={nonce}>
      <div class="card narrow">
        <h1>Đăng nhập</h1>
        <p class="sub">Trang quản trị nick của CLLT Tool.</p>
        <Message kind="error" text={error} />
        <form method="post" action="/admin/login">
          <label for="u">Tên đăng nhập</label>
          <input id="u" name="username" type="text" autocomplete="username" required autofocus />
          <label for="p">Mật khẩu</label>
          <input id="p" name="password" type="password" autocomplete="current-password" required />
          <p>
            <button class="primary" type="submit">
              Đăng nhập
            </button>
          </p>
        </form>
      </div>
    </Layout>
  );
}

type PasswordProps = { nonce: string; mustChange: boolean; error?: string | null; ok?: string | null };

export function PasswordView({ nonce, mustChange, error, ok }: PasswordProps) {
  const warn = mustChange
    ? 'Đang dùng mật khẩu mặc định "admin". Đổi mật khẩu trước, sau đó mới dùng được các trang khác: trang này hiện mật khẩu game của mọi nick.'
    : null;
  return (
    <Layout title="Đổi mật khẩu" nonce={nonce} nav="password">
      <div class="card narrow top">
        <h1>Đổi mật khẩu</h1>
        <p class="sub">Tài khoản quản trị: admin.</p>
        <Message kind="warn" text={warn} />
        <Message kind="error" text={error} />
        <Message kind="ok" text={ok} />
        <form method="post" action="/admin/password">
          <label for="c">Mật khẩu hiện tại</label>
          <input id="c" name="current" type="password" autocomplete="current-password" required />
          <label for="n">Mật khẩu mới (ít nhất {MIN_PASSWORD} ký tự)</label>
          <input id="n" name="next" type="password" autocomplete="new-password" minlength={MIN_PASSWORD} required />
          <label for="r">Nhập lại mật khẩu mới</label>
          <input id="r" name="confirm" type="password" autocomplete="new-password" minlength={MIN_PASSWORD} required />
          <p>
            <button class="primary" type="submit">
              Đổi mật khẩu
            </button>
          </p>
        </form>
      </div>
    </Layout>
  );
}
