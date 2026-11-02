import { useEffect, useRef } from "react";
import { Icon } from "@/components/Icon";
import { useStore } from "@/store";

/**
 * Quản lý thiết bị (device.rs): a device the admin blocked on CLLT Server shows this over the whole window, above any
 * other dialog, with no way to close it; its accounts are logged out and cannot log in. It holds offline too: the app
 * keeps the last answer. It goes away when the admin unblocks the device (the next answer, within 15 minutes).
 */
export function DeviceGate() {
  const d = useStore((s) => s.device);
  const on = d?.state === "blocked";
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (on && !dialog.current?.open) dialog.current?.showModal();
    if (!on && dialog.current?.open) dialog.current.close();
  }, [on]);
  if (!on) return null;
  return (
    <dialog
      ref={dialog}
      className="w-[420px] m-auto p-0 border-[length:var(--px)] border-danger bg-card text-fg notch bevel backdrop:bg-[rgb(15_17_21/0.95)]"
      aria-labelledby="device-title"
      aria-describedby="device-text"
      // Escape does not close it.
      onCancel={(e) => e.preventDefault()}
    >
      <div className="grid gap-3 p-5">
        <header className="flex items-center gap-2">
          <Icon name="shield" size={18} className="flex-none text-danger" />
          <h2 id="device-title" className="font-display font-extrabold text-16 leading-[1.2] uppercase tracking-[0.04em]">
            Thiết bị đã bị khoá
          </h2>
        </header>
        <p id="device-text" className="m-0 text-12 text-fg-2">
          Thiết bị này đã bị khoá, vui lòng liên hệ admin. Các nick đã được đăng xuất và không đăng nhập được cho tới khi
          admin mở khoá.
        </p>
        {d.reason.trim() && (
          <p className="m-0 px-2.5 py-2 bg-ink text-11 text-fg-2 select-text">
            <b className="text-fg">Lý do:</b> {d.reason}
          </p>
        )}
        <small className="text-fg-3 text-11 select-text">
          Mã thiết bị: <span className="font-mono text-fg-2">{d.id}</span> (gửi mã này cho admin)
        </small>
      </div>
    </dialog>
  );
}
