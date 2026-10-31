import { useState } from "react";
import { api } from "../api";
import { Bar } from "../components/Bar";
import { Button } from "../components/Button";
import { Icon } from "../components/Icon";
import { paragraphs } from "../format";
import { inGame, useStore } from "../store";
import "./UpdateBox.css";

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
      <section className={`upd${u.state === "ready" ? " upd--ready" : ""}`} aria-label="Cập nhật app" aria-live="polite">
        <div className="upd__head">
          <Icon name="download" size={14} />
          <b>
            {u.state === "ready" ? `Bản ${u.version} đã sẵn sàng` : u.state === "installing" ? `Đang cài bản ${u.version}…` : `Đang tải bản ${u.version}`}
          </b>
        </div>
        {u.state === "downloading" && (
          <>
            <Bar value={part ?? 0} fill="var(--exp)" thin label={`Tải bản ${u.version}`} />
            <small className="upd__sub">
              {part != null ? `${Math.round(part * 100)}% · ${mb(u.got)}/${mb(u.total!)} MB` : `${mb(u.got)} MB`}
            </small>
          </>
        )}
        {u.state === "ready" && (
          <>
            <small className="upd__sub">
              Đang dùng {u.current}. Bấm để cài ngay, hoặc bản mới tự cài khi tắt app.
            </small>
            {u.notes.trim() && (
              <>
                <button type="button" className="upd__toggle" aria-expanded={notes} aria-controls="upd-notes" onClick={() => setNotes((n) => !n)}>
                  Có gì mới
                  <Icon name="chevron" size={12} className={notes ? "upd__chev upd__chev--open" : "upd__chev"} />
                </button>
                {notes && (
                  <div id="upd-notes" className="upd__notes scroll selectable">
                    {paragraphs(u.notes).map((p, i) => (
                      <p key={i}>{p}</p>
                    ))}
                  </div>
                )}
              </>
            )}
            <Button kind="primary" small block icon="refresh" onClick={restart}>
              Khởi động lại để cập nhật
            </Button>
            {error && (
              <small className="upd__error" role="alert">
                {error}
              </small>
            )}
          </>
        )}
      </section>
    );
  }

  return (
    <div className="upd-line">
      <span className="upd-line__text">
        <span className="px">v{u.current}</span>
        {u.state === "off" && <span title={u.reason}> · không tự cập nhật</span>}
        {u.state === "checking" && " · đang kiểm tra…"}
        {u.state === "latest" && <span title={`Kiểm tra lúc ${clock(u.checkedAt)}`}> · bản mới nhất</span>}
        {u.state === "failed" && (
          <span className="upd-line__bad" title={u.message}>
            {" "}
            · không kiểm tra được
          </span>
        )}
      </span>
      {(u.state === "idle" || u.state === "latest" || u.state === "failed") && check}
      {u.state === "failed" && <small className="upd-line__why">{u.message}</small>}
    </div>
  );
}
