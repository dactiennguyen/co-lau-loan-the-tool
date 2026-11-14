// Đăng nhập and Đổi mật khẩu: a card in the middle of the dark page, with the brand, the fields and their errors.
import { MIN_PASSWORD } from '../config/constants.ts';
import { Alert, Brand, Field, Icon, Layout } from './layout.tsx';

export function LoginView({ nonce, error }: { nonce: string; error?: string }) {
  return (
    <Layout title="Đăng nhập" nonce={nonce}>
      <div class="auth alone">
        <div class="card">
          <Brand />
          <h1>Đăng nhập</h1>
          <p class="sub">Trang quản trị nick và key của CLLT Tool.</p>
          <form method="post" action="/admin/login">
            <Alert kind="error" text={error} />
            <Field name="username" label="Tên đăng nhập" autocomplete="username" required autofocus icon="user" />
            <Field name="password" label="Mật khẩu" type="password" autocomplete="current-password" required icon="lock" />
            <button class="btn primary" type="submit">
              <Icon name="log-in" />
              Đăng nhập
            </button>
          </form>
        </div>
      </div>
    </Layout>
  );
}

type PasswordProps = { nonce: string; mustChange: boolean; errors?: Record<string, string>; ok?: string | null };

export function PasswordView({ nonce, mustChange, errors = {}, ok }: PasswordProps) {
  const warn = mustChange
    ? 'Đang dùng mật khẩu đầu tiên (secret ADMIN_PASSWORD). Đổi mật khẩu trước, sau đó mới dùng được các trang khác: trang Nick hiện mật khẩu game của mọi nick.'
    : null;
  return (
    <Layout title="Đổi mật khẩu" nonce={nonce} nav="password" toasts={[ok ? { kind: 'ok', text: ok } : null]}>
      <div class="auth">
        <div class="card">
          <h1>Đổi mật khẩu</h1>
          <p class="sub">Tài khoản quản trị: admin.</p>
          <form method="post" action="/admin/password">
            <Alert kind="warn" text={warn} />
            <Field name="current" label="Mật khẩu hiện tại" type="password" autocomplete="current-password" required error={errors.current} />
            <Field
              name="next"
              label="Mật khẩu mới"
              type="password"
              autocomplete="new-password"
              minlength={MIN_PASSWORD}
              required
              hint={`Ít nhất ${MIN_PASSWORD} ký tự`}
              error={errors.next}
            />
            <Field name="confirm" label="Nhập lại mật khẩu mới" type="password" autocomplete="new-password" required error={errors.confirm} />
            <button class="btn primary" type="submit">
              <Icon name="shield-check" />
              Đổi mật khẩu
            </button>
          </form>
        </div>
      </div>
    </Layout>
  );
}
