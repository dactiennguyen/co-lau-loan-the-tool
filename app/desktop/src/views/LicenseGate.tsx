import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "@/api";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { TextField } from "@/components/TextField";
import { useStore } from "@/store";

/**
 * Key (license.rs): until CLLT Server said yes to a key of this device, this covers the whole window with no way to
 * close it, and no account logs in. Missing: type the key and Kích hoạt. Checking: the key kept is being asked about
 * (each start). Refused (wrong, khoá, on another machine, hết hạn) or Unreachable (no network at the start): the reason,
 * Thử lại, and another key can be typed.
 */
export function LicenseGate() {
  const license = useStore((s) => s.license);
  // A mandatory update needs no key: while UpdateGate covers the window this waits under it (the top layer is in the
  // order of showModal, so it must not open later above it).
  const updating = useStore((s) => s.update?.state === "downloading" || s.update?.state === "ready" || s.update?.state === "installing");
  const dialog = useRef<HTMLDialogElement>(null);
  // The check of the key kept at each start does not flash the box (a login meanwhile does nothing, and the sidebar says
  // "Đang kiểm tra key…"); Thử lại keeps it.
  const shown = useRef(false);
  const on =
    !!license &&
    license.state !== "valid" &&
    license.state !== "off" &&
    !updating &&
    (license.state !== "checking" || shown.current);
  shown.current = on;
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (on && !dialog.current?.open) {
      // A new showing: nothing typed and no error of the last one.
      setKey("");
      setError(null);
      dialog.current?.showModal();
    }
    if (!on && dialog.current?.open) dialog.current.close();
  }, [on]);
  if (!on) return null;

  const activate = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    api
      .activateLicense(key)
      .then(() => setKey(""))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(false));
  };
  const said =
    license.state === "refused" || license.state === "unreachable" ? license.message : license.state === "checking" ? "Đang kiểm tra key…" : null;
  return (
    <dialog
      ref={dialog}
      className="w-[440px] m-auto p-0 border-[length:var(--px)] border-primary bg-card text-fg notch bevel backdrop:bg-[rgb(15_17_21/0.95)]"
      aria-labelledby="license-title"
      aria-describedby="license-text"
      // Escape does not close it.
      onCancel={(e) => e.preventDefault()}
    >
      <form className="grid gap-3 p-5" onSubmit={activate}>
        <header className="flex items-center gap-2">
          <Icon name="key" size={18} className="flex-none text-primary" />
          <h2 id="license-title" className="font-display font-extrabold text-16 leading-[1.2] uppercase tracking-[0.04em]">
            {license.state === "missing" ? "Nhập key để dùng app" : "Key chưa dùng được"}
          </h2>
        </header>
        <p id="license-text" className="m-0 text-12 text-fg-2">
          Mỗi key dùng cho một máy. Nhập key admin gửi rồi bấm Kích hoạt; app nhớ key cho các lần mở sau. Chưa có key hợp lệ
          thì không đăng nhập được nick.
        </p>
        {said && (
          <p
            role={license.state === "checking" ? "status" : "alert"}
            className={`m-0 px-2.5 py-2 bg-ink text-11 select-text ${license.state === "checking" ? "text-fg-2" : "text-danger"}`}
          >
            {license.key && (
              <>
                <b className="text-fg">Key {license.key}:</b>{" "}
              </>
            )}
            {said}
          </p>
        )}
        <TextField
          label={license.key ? "Nhập key khác" : "Key"}
          placeholder="CLLT-XXXX-XXXX-XXXX-XXXX"
          autoFocus
          value={key}
          onChange={(e) => setKey(e.target.value)}
          inputClassName="font-mono uppercase"
        />
        {error && (
          <p role="alert" className="m-0 text-11 text-danger select-text">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          {license.key && license.state !== "checking" && (
            <Button kind="ghost" icon="refresh" disabled={busy} onClick={() => void api.recheckLicense()}>
              Thử lại
            </Button>
          )}
          <Button kind="primary" type="submit" icon="key" disabled={busy || !key.trim()}>
            {busy ? "Đang kiểm tra…" : "Kích hoạt"}
          </Button>
        </div>
      </form>
    </dialog>
  );
}
