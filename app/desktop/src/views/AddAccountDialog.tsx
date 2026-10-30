import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import type { NewAccount } from "../types";
import "./AddAccountDialog.css";

interface Props {
  accountsPath: string;
  onSave: (account: NewAccount) => Promise<void>;
  onClose: () => void;
}

/** Modal form: username, password (hidden), label, server id. Escape closes it; errors show above the buttons. */
export function AddAccountDialog({ accountsPath, onSave, onClose }: Props) {
  const [form, setForm] = useState<NewAccount>({ username: "", password: "", serverId: 24, label: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

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
    <dialog ref={dialog} className="dialog" onClose={onClose} onCancel={onClose}>
      <form onSubmit={submit}>
        <header>
          <h2>Thêm nick</h2>
          <p>Đăng nhập bằng tài khoản game của bạn</p>
        </header>
        <TextField label="Tên đăng nhập" placeholder="vd. manina" autoFocus value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <TextField label="Mật khẩu" type="password" placeholder="••••••••" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <TextField label="Tên gợi nhớ (tuỳ chọn)" placeholder="vd. Nick chính" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
        <TextField
          label="Máy chủ (serverId)"
          type="number"
          min={1}
          hint="24 là Thanh Khê."
          value={form.serverId}
          onChange={(e) => setForm({ ...form, serverId: Number(e.target.value) })}
        />
        <p className="dialog__note">Lưu tại {accountsPath || "accounts.json"}, chỉ trên máy này.</p>
        {error && (
          <p className="dialog__error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <Button kind="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button kind="primary" type="submit" disabled={saving || !form.username.trim() || !form.password}>
            Lưu nick
          </Button>
        </footer>
      </form>
    </dialog>
  );
}
