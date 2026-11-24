import { useEffect, useState } from "react";
import { api } from "@/api";
import { Button } from "@/components/Button";
import { CheckRow } from "@/components/CheckRow";
import { AccountTicks } from "./AccountTicks";
import { DIALOG } from "@/components/Dialog";
import { Icon } from "@/components/Icon";
import { useStore } from "@/store";
import type { SavedAccounts } from "@/api/types";

type Done = { state: "idle" } | { state: "working" } | { state: "copied"; count: number } | { state: "saved"; file: SavedAccounts } | { state: "fail"; text: string };

const message = (err: unknown) => String(err instanceof Error ? err.message : err);
const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

/**
 * The Xuất tab of Nhập / Xuất JSON (backup.rs of src-tauri): the accounts ticked, always with their passwords, and the Cài
 * đặt of the app when ticked. Every account is ticked but those unticked here, so one Nhập adds is ticked too. The JSON is
 * asked again whenever the ticks change while the tab shows, so Sao chép JSON writes it to the clipboard within the click
 * (WebKit refuses a write that comes after a wait); on the other tab it is dropped. Lưu file writes
 * cllt-accounts-<time>.json to Downloads, readable by its owner only, and Mở thư mục shows it. The JSON itself is never
 * shown: it holds passwords.
 */
export function ExportAccountsPage({ active, onClose }: { active: boolean; onClose: () => void }) {
  const order = useStore((s) => s.order);
  const [unticked, setUnticked] = useState<number[]>([]);
  const [withSettings, setWithSettings] = useState(true);
  const [json, setJson] = useState<string | null>(null);
  const [done, setDone] = useState<Done>({ state: "idle" });
  const ids = order.filter((id) => !unticked.includes(id));

  useEffect(() => {
    let live = true;
    setJson(null);
    if (!active || !ids.length) return;
    api.exportAccounts(ids, withSettings).then(
      (text) => live && setJson(text),
      (err) => live && setDone({ state: "fail", text: message(err) }),
    );
    return () => {
      live = false;
    };
    // ids is a new array on every render: its contents are what count.
  }, [active, ids.join(","), withSettings]);

  const copy = () => {
    if (!json) return;
    navigator.clipboard.writeText(json).then(
      () => setDone({ state: "copied", count: ids.length }),
      (err) => setDone({ state: "fail", text: `Chưa sao chép được: ${message(err)}. Dùng Lưu file.` }),
    );
  };
  const save = () => {
    setDone({ state: "working" });
    api.saveAccounts(ids, withSettings).then(
      (file) => setDone({ state: "saved", file }),
      (err) => setDone({ state: "fail", text: message(err) }),
    );
  };

  return (
    <>
      <AccountTicks unticked={unticked} onChange={(u) => { setUnticked(u); setDone({ state: "idle" }); }} what="xuất" />
      <CheckRow checked={withSettings} onChange={(on) => { setWithSettings(on); setDone({ state: "idle" }); }}>
        Kèm cài đặt của app (server game, lưu dữ liệu trận, đóng cửa sổ)
      </CheckRow>
      <p className={`${DIALOG.note} m-0 flex gap-2 items-start`}>
        <Icon name="eye" size={14} className="flex-none mt-px text-coin" />
        <span>
          JSON có <b className="text-fg">mật khẩu</b> của các nick đã chọn (cả mật khẩu proxy). Chỉ dán hoặc gửi cho chính bạn; ai có nó là đăng nhập được.
        </span>
      </p>
      {done.state === "copied" && <p className="m-0 text-11 text-good">Đã sao chép JSON của {done.count} nick. Dán vào tab Nhập ở máy kia.</p>}
      {done.state === "saved" && (
        <div className="flex flex-wrap items-center gap-1.5 text-11 text-good">
          <span className="wrap-anywhere">
            Đã lưu {done.file.accounts} nick vào <b>{fileName(done.file.path)}</b> trong Downloads.
          </span>
          <Button kind="ghost" small icon="folder" onClick={() => api.revealExport(done.file.path).catch((err) => setDone({ state: "fail", text: message(err) }))}>
            Mở thư mục
          </Button>
        </div>
      )}
      {done.state === "fail" && (
        <p className={DIALOG.error} role="alert">
          {done.text}
        </p>
      )}
      <footer className={`${DIALOG.footer} mt-auto`}>
        <Button kind="ghost" onClick={onClose}>
          Đóng
        </Button>
        <Button kind="outline" icon="download" disabled={!ids.length || done.state === "working"} onClick={save}>
          {done.state === "working" ? "Đang lưu…" : "Lưu file"}
        </Button>
        <Button kind="primary" icon="copy" disabled={!json} onClick={copy}>
          Sao chép JSON
        </Button>
      </footer>
    </>
  );
}
