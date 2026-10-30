import { useState, type FormEvent } from "react";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { TextField } from "../components/TextField";
import { isConnected } from "../format";
import type { Account, AccountForm } from "../types";

interface Props {
  /** The account to edit; a new one when absent. */
  account?: Account;
  onSave: (form: AccountForm) => Promise<void>;
  onClose: () => void;
}

/**
 * Add or edit an account: username, password (hidden), label, server id. Editing starts from what is saved, except the
 * password, which the UI is never sent: left empty, it stays as it was. Errors show above the buttons.
 */
export function AccountDialog({ account, onSave, onClose }: Props) {
  const [form, setForm] = useState<AccountForm>(
    account
      ? { username: account.username, password: "", serverId: account.serverId, label: account.ownLabel }
      : { username: "", password: "", serverId: 24, label: "" },
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      await onSave(form);
    } catch (err) {
      setError(String(err instanceof Error ? err.message : err));
      setSaving(false);
    }
  };

  return (
    <Dialog
      title={account ? "Sửa nick" : "Thêm nick"}
      subtitle={account ? account.label : "Đăng nhập bằng tài khoản game của bạn"}
      onSubmit={submit}
      onClose={onClose}
    >
      <TextField label="Tên đăng nhập" placeholder="vd. manina" autoFocus value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
      <TextField
        label="Mật khẩu"
        type="password"
        placeholder={account ? "Để trống nếu không đổi" : "••••••••"}
        value={form.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })}
      />
      <TextField label="Tên gợi nhớ (tuỳ chọn)" placeholder="vd. Nick chính" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
      <TextField
        label="Máy chủ (serverId)"
        type="number"
        min={1}
        hint="24 là Thanh Khê."
        value={form.serverId}
        onChange={(e) => setForm({ ...form, serverId: Number(e.target.value) })}
      />
      {account && isConnected(account.status) && <p className="dialog__note">Nick đang đăng nhập: thay đổi có hiệu lực từ lần đăng nhập sau.</p>}
      {error && (
        <p className="dialog__error" role="alert">
          {error}
        </p>
      )}
      <footer>
        <Button kind="ghost" onClick={onClose}>
          Huỷ
        </Button>
        <Button kind="primary" type="submit" disabled={saving || !form.username.trim() || (!account && !form.password)}>
          {account ? "Lưu thay đổi" : "Lưu nick"}
        </Button>
      </footer>
    </Dialog>
  );
}
