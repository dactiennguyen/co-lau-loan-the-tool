import { useState } from "react";
import { api } from "../api";
import { Bar } from "../components/Bar";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { cn } from "../cn";
import { paragraphs } from "../format";
import { inGame, useStore } from "../store";

const MB = 1_048_576;
const mb = (n: number) => (n / MB).toFixed(1).replace(".", ",");
const clock = (at: number) => new Date(at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

/**
 * Tự cập nhật, above the buttons of the sidebar: the version running and a check button; while a newer version comes,
 * its download; once it is ready, what is new and Khởi động lại (asking first while accounts play). The app installs it
 * on its own when it quits.
 */
export function UpdateBox() {
  const u = useStore((s) => s.update);
  const playing = useStore(inGame);
  const [notes, setNotes] = useState(false);
  const [error, setError] = useState("");
  if (!u) return null;

  const check = (
    <Button kind="ghost" small icon="refresh" aria-label="Kiểm tra cập nhật" onClick={() => void api.checkUpdate()} />
  );
  const restart = async () => {
    setError("");
    if (playing) return useStore.getState().open({ kind: "update" });
    try {
      await api.installUpdate();
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    }
  };

  if (u.state === "downloading" || u.state === "ready" || u.state === "installing") {
    const part = u.state === "downloading" && u.total ? u.got / u.total : null;
    return (
      // A newer version on its way or ready: a framed block, gold once it can be installed.
      <section
        className={cn("grid gap-1.5 p-2.5 bg-ink border-2 border-line notch-sm", u.state === "ready" && "border-primary")}
        aria-label="Cập nhật app"
        aria-live="polite"
      >
        <div className="flex items-center gap-1.5 text-12 text-fg">
          <Icon name="download" size={14} className={cn("flex-none text-exp", u.state === "ready" && "text-primary")} />
          <b>
            {u.state === "ready" ? `Bản ${u.version} đã sẵn sàng` : u.state === "installing" ? `Đang cài bản ${u.version}…` : `Đang tải bản ${u.version}`}
          </b>
        </div>
        {u.state === "downloading" && (
          <>
            <Bar value={part ?? 0} fill="var(--exp)" thin label={`Tải bản ${u.version}`} />
            <small className="text-fg-3 text-11 leading-[1.4]">
              {part != null ? `${Math.round(part * 100)}% · ${mb(u.got)}/${mb(u.total!)} MB` : `${mb(u.got)} MB`}
            </small>
          </>
        )}
        {u.state === "ready" && (
          <>
            <small className="text-fg-3 text-11 leading-[1.4]">
              Đang dùng {u.current}. Bấm để cài ngay, hoặc bản mới tự cài khi tắt app.
            </small>
            {u.notes.trim() && (
              <>
                <button
                  type="button"
                  className={
                    "[justify-self:start] inline-flex items-center gap-1 p-0 bg-transparent border-0 font-ui font-bold text-11 leading-[1.4] text-exp cursor-pointer " +
                    "hover:text-fg focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                  }
                  aria-expanded={notes}
                  aria-controls="upd-notes"
                  onClick={() => setNotes((n) => !n)}
                >
                  Có gì mới
                  <Icon
                    name="chevron"
                    size={12}
                    className={cn("transition-[transform] duration-(--fast) ease-step", notes && "[transform:rotate(180deg)]")}
                  />
                </button>
                {notes && (
                  <div id="upd-notes" className="max-h-[150px] pr-1 text-11 leading-[1.45] text-fg-2 scroll selectable">
                    {paragraphs(u.notes).map((p, i) => (
                      <p key={i} className="mx-0 mt-0 mb-1">{p}</p>
                    ))}
                  </div>
                )}
              </>
            )}
            <Button kind="primary" small block icon="refresh" onClick={restart}>
              Khởi động lại để cập nhật
            </Button>
            {error && (
              <small className="text-danger text-11 wrap-anywhere" role="alert">
                {error}
              </small>
            )}
          </>
        )}
      </section>
    );
  }

  return (
    // The version and its check button: one quiet line, the reason of a failed check under it.
    <div className="flex flex-wrap items-center gap-y-0 gap-x-1 min-h-[26px] text-11 text-fg-3">
      <span className="flex-1 min-w-0">
        <span className="px text-10">v{u.current}</span>
        {u.state === "off" && <span title={u.reason}> · không tự cập nhật</span>}
        {u.state === "checking" && " · đang kiểm tra…"}
        {u.state === "latest" && <span title={`Kiểm tra lúc ${clock(u.checkedAt)}`}> · bản mới nhất</span>}
        {u.state === "failed" && (
          <span className="text-danger" title={u.message}>
            {" "}
            · không kiểm tra được
          </span>
        )}
      </span>
      {(u.state === "idle" || u.state === "latest" || u.state === "failed") && check}
      {u.state === "failed" && <small className="basis-full wrap-anywhere text-fg-3 text-[10.5px] leading-[1.4]">{u.message}</small>}
    </div>
  );
}
