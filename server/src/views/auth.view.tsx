// Đăng nhập and Đổi mật khẩu.
import { MIN_PASSWORD } from '../config/constants.ts';
import { Field, Icon, Layout, Message } from './layout.tsx';

export function LoginView({ nonce, error }: { nonce: string; error?: string }) {
  return (
    <Layout title="Đăng nhập" nonce={nonce}>
      <div class="card narrow">
        <h1>Đăng nhập</h1>
        <p class="sub">Trang quản trị nick của CLLT Tool.</p>
        <Message kind="error" text={error} />
        <form method="post" action="/admin/login" class="stack">
          <Field name="username" label="Tên đăng nhập" autocomplete="username" required autofocus icon="person" />
          <Field name="password" label="Mật khẩu" type="password" autocomplete="current-password" required icon="password" />
          <div class="actions">
            <md-filled-button type="submit">
              <Icon name="login" slot="icon" />
              Đăng nhập
            </md-filled-button>
          </div>
        </form>
      </div>
    </Layout>
  );
}

type PasswordProps = { nonce: string; mustChange: boolean; errors?: Record<string, string>; ok?: string | null };

export function PasswordView({ nonce, mustChange, errors = {}, ok }: PasswordProps) {
  const warn = mustChange
    ? 'Đang dùng mật khẩu mặc định "admin". Đổi mật khẩu trước, sau đó mới dùng được các trang khác: trang này hiện mật khẩu game của mọi nick.'
    : null;
  return (
    <Layout title="Đổi mật khẩu" nonce={nonce} nav="password">
      <div class="card narrow top-space">
        <h1>Đổi mật khẩu</h1>
        <p class="sub">Tài khoản quản trị: admin.</p>
        <Message kind="warn" text={warn} />
        <Message kind="ok" text={ok} />
        <form method="post" action="/admin/password" class="stack">
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
          <div class="actions">
            <md-filled-button type="submit">
              <Icon name="lock_reset" slot="icon" />
              Đổi mật khẩu
            </md-filled-button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
