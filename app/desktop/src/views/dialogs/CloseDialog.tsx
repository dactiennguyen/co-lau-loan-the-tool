import { useState } from "react";
import { api } from "@/api";
import { Button } from "@/components/Button";
import { CheckRow } from "@/components/CheckRow";
import { DIALOG, Dialog } from "@/components/Dialog";
import { Icon, type IconName } from "@/components/Icon";
import { cn } from "@/utils/cn";
import { inGame, useStore } from "@/store";
import type { OnClose } from "@/api/types";

/**
 * Đóng cửa sổ, when the close button of the window is pressed and Cài đặt says to ask (tray.rs): Thu nhỏ vào khay hides
 * the window with every account still playing, Thoát ứng dụng logs them out and closes the app. Ghi nhớ keeps the choice
 * in Cài đặt → Cửa sổ, where it can be changed back. Huỷ, Escape or the X leave the window open.
 */
export function CloseDialog({ onClose }: { onClose: () => void }) {
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const playing = useStore(inGame);
  const choose = (action: Exclude<OnClose, "ask">) => {
    setBusy(true);
    setError("");
    api.closeWindow(action, remember).then(onClose, (err) => {
      setError(String(err instanceof Error ? err.message : err));
      setBusy(false);
    });
  };
  // One choice: a pixel box with its icon, the name and what it does, on a dark plate.
  const option = (action: Exclude<OnClose, "ask">, icon: IconName, title: string, text: string, tone: string) => (
    <button
      type="button"
      disabled={busy}
      onClick={() => choose(action)}
      className={cn(
        "flex items-center gap-3 w-full px-3 py-2.5 text-left bg-ink border-2 border-transparent cursor-pointer",
        "hover:bg-bg-2 hover:border-line-strong focus-visible:outline-2 focus-visible:outline-ring focus-visible:-outline-offset-2",
        "disabled:opacity-60 disabled:cursor-default",
      )}
    >
      <span className={cn("grid place-items-center flex-none size-10 text-ink bevel-sm", tone)}>
        <Icon name={icon} size={20} />
      </span>
      <span className="grid gap-0.5 min-w-0">
        <b className="text-13 text-fg">{title}</b>
        <span className="text-11 leading-[1.45] text-fg-2">{text}</span>
      </span>
    </button>
  );
  return (
    <Dialog title="Đóng cửa sổ" subtitle="Chọn việc khi đóng cửa sổ" onClose={onClose} onSubmit={(e) => e.preventDefault()} className="w-[440px]">
      <div className="grid gap-1.5">
        {option(
          "tray",
          "tray",
          "Thu nhỏ vào khay",
          playing > 0 ? `${playing} nick đang trong game vẫn chơi tiếp. Mở lại bằng icon ở khay.` : "Ứng dụng vẫn chạy nền. Mở lại bằng icon ở khay.",
          "bg-primary",
        )}
        {option(
          "quit",
          "logout",
          "Thoát ứng dụng",
          playing > 0 ? `Đóng hẳn ứng dụng; ${playing} nick đang trong game bị đăng xuất.` : "Đóng hẳn ứng dụng.",
          "bg-danger",
        )}
      </div>
      <CheckRow checked={remember} onChange={setRemember}>
        Ghi nhớ lựa chọn của tôi và không hỏi lại
      </CheckRow>
      {remember && <p className="-mt-1.5 m-0 text-11 text-fg-3">Đổi lại trong Cài đặt → Cửa sổ.</p>}
      {error && (
        <p className={DIALOG.error} role="alert">
          {error}
        </p>
      )}
      <footer className={DIALOG.footer}>
        <Button kind="ghost" onClick={onClose}>
          Huỷ
        </Button>
      </footer>
    </Dialog>
  );
}
