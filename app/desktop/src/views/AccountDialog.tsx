import { useEffect, useState, type FormEvent } from "react";
import { api } from "../api";
import { Button } from "../components/Button";
import { DIALOG, Dialog } from "../components/Dialog";
import { PasswordField } from "../components/PasswordField";
import { TextField } from "../components/TextField";
import { isConnected } from "../format";
import type { Account, AccountForm, ProxyForm, ProxyInfo } from "../types";
import { ProxyFields, defaultPort } from "./ProxyFields";

interface Props {
  /** The account to edit; a new one when absent. */
  account?: Account;
  onSave: (form: AccountForm) => Promise<void>;
  onClose: () => void;
}

const proxyForm = (p: ProxyInfo | null | undefined): ProxyForm =>
  p
    ? { enabled: p.enabled, kind: p.kind, host: p.host, port: p.port, username: p.username, password: "" }
    : { enabled: false, kind: "socks5", host: "", port: defaultPort("socks5"), username: "", password: "" };

/** Lưu tests the proxy first when it is on and new, was off, or changed (needs_check of app.rs); `savedPassword` is
 * the proxy password the form was filled with. */
function testsProxy(p: ProxyForm, saved: ProxyInfo | null | undefined, savedPassword: string) {
  if (!p.enabled) return false;
  if (!saved || !saved.enabled) return true;
  const password = p.password !== "" && p.password !== savedPassword;
  return saved.kind !== p.kind || saved.host !== p.host.trim() || saved.port !== p.port || saved.username !== p.username.trim() || password;
}

/**
 * Add or edit an account: username, password, label, server id, and its proxy (ProxyFields). Editing starts from what
 * is saved, passwords too (asked with accountSecrets when the dialog opens), hidden until their eye button shows them.
 * An empty password still keeps the saved one. Errors show above the buttons; a proxy turned on is tested before the
 * account is saved, and nothing is saved when it fails.
 */
export function AccountDialog({ account, onSave, onClose }: Props) {
  const [form, setForm] = useState<AccountForm>(
    account
      ? { username: account.username, password: "", serverId: account.serverId, label: account.ownLabel, proxy: proxyForm(account.proxy) }
      : { username: "", password: "", serverId: 24, label: "", proxy: proxyForm(null) },
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedProxyPassword, setSavedProxyPassword] = useState("");
  const testing = testsProxy(form.proxy, account?.proxy, savedProxyPassword);
  const id = account?.id;

  // What was typed before the passwords arrive stays.
  useEffect(() => {
    if (id == null) return;
    let live = true;
    api.accountSecrets(id).then(
      (s) => {
        if (!live) return;
        setSavedProxyPassword(s.proxyPassword);
        setForm((f) => ({ ...f, password: f.password || s.password, proxy: { ...f.proxy, password: f.proxy.password || s.proxyPassword } }));
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [id]);

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
      <PasswordField
        label="Mật khẩu"
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
      <ProxyFields value={form.proxy} onChange={(proxy) => setForm({ ...form, proxy })} saved={account?.proxy} accountId={account?.id} />
      {account && isConnected(account.status) && <p className={DIALOG.note}>Nick đang đăng nhập: thay đổi có hiệu lực từ lần đăng nhập sau.</p>}
      {error && (
        <p className={DIALOG.error} role="alert">
          {error}
        </p>
      )}
      <footer className={DIALOG.footer}>
        <Button kind="ghost" onClick={onClose}>
          Huỷ
        </Button>
        <Button
          kind="primary"
          type="submit"
          disabled={saving || !form.username.trim() || (!account && !form.password) || (form.proxy.enabled && (!form.proxy.host.trim() || !form.proxy.port))}
        >
          {saving && testing ? "Đang kiểm tra proxy…" : testing ? "Kiểm tra proxy và lưu" : account ? "Lưu thay đổi" : "Lưu nick"}
        </Button>
      </footer>
    </Dialog>
  );
}
