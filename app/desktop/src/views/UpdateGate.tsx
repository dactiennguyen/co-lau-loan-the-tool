import { useEffect, useRef, useState } from "react";
import { api } from "@/api";
import { Bar } from "@/components/Bar";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { paragraphs } from "@/utils/format";
import { isAndroid } from "@/utils/platform";
import { useStore } from "@/store";

const MB = 1_048_576;
const mb = (n: number) => (n / MB).toFixed(1).replace(".", ",");

/**
 * Every newer version is mandatory (update.rs): from the moment one is found until the app opens again on it, this
 * covers the whole window, above any other dialog, with no way to close it. A check that fails shows nothing, so the
 * app stays usable without network; so does an install that fails, which update.rs reports as `failed`. It opens above
 * LicenseGate: an update needs no key.
 * On Android the APK downloaded opens in the installer of Android, which the user confirms (update.rs): once ready it
 * shows Cài đặt, to open the installer again (cancelled, or the app had first to be let install apps), and Để sau, which
 * closes it until the app opens again (Cập nhật of AppStatus still installs it).
 */
export function UpdateGate() {
  const u = useStore((s) => s.update);
  const android = isAndroid();
  const [later, setLater] = useState(false);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState(false);
  const on = u?.state === "downloading" || (u?.state === "ready" && !(android && later)) || u?.state === "installing";
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (on && !dialog.current?.open) dialog.current?.showModal();
    if (!on && dialog.current?.open) dialog.current.close();
  }, [on]);
  if (!on) return null;
  const install = async () => {
    setOpening(true);
    setError("");
    try {
      await api.installUpdate();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setOpening(false);
    }
  };

  const part = u.state === "downloading" && u.total ? u.got / u.total : null;
  const notes = u.state === "installing" ? "" : u.notes;
  return (
    <dialog
      ref={dialog}
      className="w-[420px] max-w-[calc(100vw-32px)] m-auto p-0 border-[length:var(--px)] border-line-strong bg-card text-fg notch bevel backdrop:bg-[rgb(15_17_21/0.92)]"
      aria-labelledby="gate-title"
      aria-live="polite"
      // Escape does not close it.
      onCancel={(e) => e.preventDefault()}
    >
      <div className="grid gap-3 p-5">
        <header className="flex items-center gap-2">
          <Icon name="download" size={18} className="flex-none text-primary" />
          <h2 id="gate-title" className="font-display font-extrabold text-16 leading-[1.2] uppercase tracking-[0.04em]">
            Cập nhật bắt buộc
          </h2>
        </header>
        <p className="m-0 text-12 text-fg-2 [&_b]:text-fg">
          Có bản <b>{u.version}</b> (đang dùng {u.current}).{" "}
          {android
            ? "App tự tải file APK rồi mở trình cài của Android: bấm Cài đặt ở đó. Nick và cài đặt được giữ nguyên; nick đang chơi cần đăng nhập lại."
            : "App tự tải, cài rồi mở lại; các nick đang chơi được đăng xuất và cần đăng nhập lại."}
        </p>
        {u.state === "downloading" && (
          <div className="grid gap-1">
            <Bar value={part ?? 0} fill="var(--exp)" label={`Tải bản ${u.version}`} />
            <small className="text-fg-3 text-11">
              {part != null ? `Đang tải ${Math.round(part * 100)}% · ${mb(u.got)}/${mb(u.total!)} MB` : `Đang tải ${mb(u.got)} MB`}
            </small>
          </div>
        )}
        {u.state !== "downloading" && !android && <small className="text-primary text-11">Đang cài bản {u.version}…</small>}
        {u.state === "ready" && android && (
          <div className="grid gap-2">
            <small className="text-11 text-fg-3">
              Đã tải xong. Lần đầu Android hỏi cho phép Co Lau Tool cài ứng dụng: bật "Cho phép từ nguồn này", quay lại rồi bấm Cài
              đặt.
            </small>
            {error && (
              <p className="m-0 text-11 text-danger" role="alert">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              <Button kind="primary" icon="download" className="flex-1" disabled={opening} onClick={() => void install()}>
                Cài đặt {u.version}
              </Button>
              <Button kind="ghost" onClick={() => setLater(true)}>
                Để sau
              </Button>
            </div>
          </div>
        )}
        {notes.trim() && (
          <div className="max-h-[180px] pr-1 px-2.5 py-2 bg-ink text-11 leading-[1.45] text-fg-2 scroll select-text">
            <b className="block mb-1 text-fg">Có gì mới</b>
            {paragraphs(notes).map((p, i) => (
              <p key={i} className="mb-1">
                {p}
              </p>
            ))}
          </div>
        )}
      </div>
    </dialog>
  );
}
