import { useEffect, useRef, useState } from "react";
import { api } from "@/api";
import { Button } from "@/components/Button";
import { CheckRow } from "@/components/CheckRow";
import { DIALOG } from "@/components/Dialog";
import { FIELD } from "@/components/TextField";
import { cn } from "@/utils/cn";
import type { Imported, ImportPreview, PreviewAccount } from "@/api/types";

const message = (err: unknown) => String(err instanceof Error ? err.message : err);

/** What becomes of an account of the JSON, as Shared::import decides it. */
function fate(a: PreviewAccount, replace: boolean): { text: string; tone: string; counts: boolean } {
  if (a.repeated) return { text: "Trùng trong JSON, bỏ qua", tone: "text-fg-3", counts: false };
  if (a.existing != null) return replace ? { text: "Đã có, ghi đè", tone: "text-coin", counts: true } : { text: "Đã có, bỏ qua", tone: "text-fg-3", counts: false };
  return { text: "Thêm mới", tone: "text-good", counts: true };
}

/**
 * The Nhập tab of Nhập / Xuất JSON (backup.rs of src-tauri): JSON pasted in the box or read from a file picked, from Xuất
 * of this app, a plain accounts.json, a list of accounts or one account. It is read again 300 ms after the last change
 * and each account shows what Nhập will do with it: Thêm mới, or for an account the list has (same username on the same
 * server) skipped unless Ghi đè is ticked; one the JSON repeats counts once. The Cài đặt of the JSON are applied only when
 * ticked. Proxies are not tested. What Nhập did takes the place of the box, until Nhập JSON khác.
 * QR nick gives the JSON of a QR scanned (`scanned`): the box is not shown (it holds passwords), `onImported` follows a
 * Nhập done and `onAgain` takes the place of Nhập JSON khác (Quét QR khác).
 */
export function ImportAccountsPage({ onClose, scanned, onImported, onAgain }: { onClose: () => void; scanned?: string; onImported?: () => void; onAgain?: () => void }) {
  const [text, setText] = useState(scanned ?? "");
  useEffect(() => setText(scanned ?? ""), [scanned]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState("");
  // A QR nick is shared to be taken whole: its accounts and its Cài đặt ticked at first.
  const [replace, setReplace] = useState(scanned !== undefined);
  const [withSettings, setWithSettings] = useState(scanned !== undefined);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Imported | null>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPreview(null);
    setError("");
    if (!text.trim()) return;
    let live = true;
    const timer = setTimeout(() => {
      api.previewImport(text).then(
        (p) => live && setPreview(p),
        (err) => live && setError(message(err)),
      );
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [text]);

  const pick = (f: File | undefined) => {
    if (!f) return;
    f.text().then(setText, (err) => setError(`Không đọc được file: ${message(err)}`));
  };
  const submit = () => {
    if (!preview || busy) return;
    setBusy(true);
    setError("");
    api.importAccounts(text, replace, withSettings && preview.settings).then(
      (result) => {
        setDone(result);
        setBusy(false);
        onImported?.();
      },
      (err) => {
        setError(message(err));
        setBusy(false);
      },
    );
  };
  const again = () => {
    if (onAgain) return onAgain();
    setDone(null);
    setText("");
    setReplace(false);
    setWithSettings(false);
  };

  if (done) {
    return (
      <>
        <p className={cn(DIALOG.text, "m-0")}>
          Đã thêm <b>{done.added}</b> nick, ghi đè <b>{done.replaced}</b>, bỏ qua <b>{done.skipped}</b>.
          {done.settings && " Cài đặt của app đã được áp dụng."}
        </p>
        <footer className={`${DIALOG.footer} mt-auto`}>
          <Button kind="ghost" onClick={again}>
            {onAgain ? "Quét QR khác" : "Nhập JSON khác"}
          </Button>
          <Button kind="primary" onClick={onClose}>
            Xong
          </Button>
        </footer>
      </>
    );
  }

  const rows = preview?.accounts ?? [];
  const count = rows.filter((a) => fate(a, replace).counts).length;
  const existing = rows.some((a) => a.existing != null && !a.repeated);
  const noPassword = rows.filter((a) => !a.password && fate(a, replace).counts).length;

  return (
    <>
      {scanned === undefined && <div className={FIELD.root}>
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="import-json" className={FIELD.label}>
            JSON
          </label>
          <Button kind="ghost" small icon="folder" onClick={() => file.current?.click()}>
            Chọn file…
          </Button>
          <input ref={file} type="file" accept=".json,application/json,text/plain" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        </div>
        <textarea
          id="import-json"
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          placeholder='{"accounts": [{"username": "…", "password": "…"}]}'
          className={cn(FIELD.input, "h-auto min-h-[120px] max-h-[220px] py-2 font-mono text-11 leading-normal resize-y select-text")}
        />
      </div>}
      {error && (
        <p className={DIALOG.error} role="alert">
          {error}
        </p>
      )}
      {preview && (
        <div className="grid gap-1.5">
          <span className="text-11 font-bold text-fg-2">
            {rows.length} nick trong {scanned === undefined ? "JSON" : "QR"}
          </span>
          <ul className="m-0 p-0 list-none grid gap-1 max-h-[200px] px-2.5 py-2 bg-ink scroll">
            {rows.map((a, i) => {
              const f = fate(a, replace);
              return (
                <li key={i} className="flex items-center gap-2 min-w-0 text-12">
                  <b className="text-fg truncate">{a.label || a.username}</b>
                  {a.label && a.label !== a.username && <span className="text-fg-3 truncate">{a.username}</span>}
                  <span className="ml-auto flex-none flex gap-1.5 text-11">
                    {!a.password && <span className="text-danger">thiếu mật khẩu</span>}
                    {a.proxy && <span className="text-fg-3">proxy</span>}
                    <span className={f.tone}>{f.text}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          {existing && (
            <CheckRow checked={replace} onChange={setReplace}>
              Ghi đè nick đã có (cùng tài khoản, cùng server): lấy cài đặt và mật khẩu trong JSON
            </CheckRow>
          )}
          {preview.settings && (
            <CheckRow checked={withSettings} onChange={setWithSettings}>
              Áp dụng cài đặt của app trong JSON (server game, lưu dữ liệu trận, đóng cửa sổ)
            </CheckRow>
          )}
          {noPassword > 0 && <p className={cn(DIALOG.note, "m-0")}>{noPassword} nick không có mật khẩu: nhập xong thì điền mật khẩu bằng Sửa nick.</p>}
        </div>
      )}
      <footer className={`${DIALOG.footer} mt-auto`}>
        <Button kind="ghost" onClick={onClose}>
          Huỷ
        </Button>
        <Button kind="primary" icon="download" disabled={!preview || busy || (count === 0 && !(withSettings && preview.settings))} onClick={submit}>
          {busy ? "Đang nhập…" : count ? `Nhập ${count} nick` : "Nhập"}
        </Button>
      </footer>
    </>
  );
}
