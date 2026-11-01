import { useEffect, useId, useState, type FormEvent } from "react";
import { api } from "../api";
import { Button } from "../components/Button";
import { cn } from "../cn";
import { DIALOG, Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { SETTING_FACT, SettingRow } from "../components/SettingRow";
import { TabPanel, Tabs, type Tab } from "../components/Tabs";
import { TextField } from "../components/TextField";
import { num, size } from "../format";
import { inGame, useStore } from "../store";
import type { Exported, Settings, SettingsView } from "../types";

type Page = "server" | "data";
const PAGES: Tab<Page>[] = [
  { key: "server", label: "Server game", icon: "server" },
  { key: "data", label: "Dữ liệu trận", icon: "chart" },
];

type Export = { state: "idle" } | { state: "working" } | { state: "done"; file: Exported } | { state: "fail"; text: string };

const message = (err: unknown) => String(err instanceof Error ? err.message : err);
const sameServer = (a: Settings, b: Settings) => a.server.host.trim() === b.server.host && a.server.port === b.server.port;
const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

/** One page of the tabs. Both pages sit in the same grid cell, the hidden one invisible, so the dialog is as tall as the
 * taller page and does not jump when the tab changes. */
const PAGE = "[grid-area:1/1] grid gap-2.5 [align-content:start] min-w-0 inert:invisible";
/** What the export does or what it wrote, beside its button. */
const EXPORT_TEXT = "flex-[1_1_220px] m-0 text-[11.5px] text-fg-2 wrap-anywhere";

/**
 * Cài đặt of the app, behind the button beside colautool, in two tabs. Server game: the address the next logins connect
 * to; Mặc định puts back play.colauloanthe.vn:1688. Dữ liệu trận: Lưu
 * dữ liệu trận for every account, and Xuất dữ liệu trận, which at once writes every saved battle to one file in
 * Downloads. Both tabs stay in the form, the hidden one inert, so the dialog keeps the height of the taller and Lưu saves
 * both to settings.json.
 */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<SettingsView | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [exported, setExported] = useState<Export>({ state: "idle" });
  const [page, setPage] = useState<Page>("server");
  const playing = useStore(inGame);
  const id = useId();

  useEffect(() => {
    let live = true;
    api.settings().then(
      (v) => {
        if (!live) return;
        setView(v);
        setForm(v.settings);
      },
      (err) => live && setError(message(err)),
    );
    return () => {
      live = false;
    };
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setError("");
    try {
      await api.setSettings(form);
      onClose();
    } catch (err) {
      setError(message(err));
      setSaving(false);
    }
  };
  const exportBattles = () => {
    setExported({ state: "working" });
    api.exportBattles().then(
      (file) => setExported({ state: "done", file }),
      (err) => setExported({ state: "fail", text: message(err) }),
    );
  };

  const set = (patch: Partial<Settings>) => form && setForm({ ...form, ...patch });
  const saved = view?.settings;
  const defaults = view?.defaults;
  const atDefault = !!form && !!defaults && sameServer(form, defaults);
  const port = form?.server.port ?? 0;
  const valid = !!form && !!form.server.host.trim() && Number.isInteger(port) && port >= 1 && port <= 65535;
  const data = view?.battleData;

  return (
    <Dialog title="Cài đặt" subtitle="Dùng chung cho mọi nick" onSubmit={submit} onClose={onClose} className="w-[min(560px,92vw)]">
      {!form ? (
        <p className={DIALOG.text}>{error ? "" : "Đang đọc cài đặt…"}</p>
      ) : (
        <>
          <Tabs id={`${id}tabs`} tabs={PAGES} value={page} onChange={setPage} label="Mục cài đặt" />
          <TabPanel id={`${id}tabs`} value={page}>
            <div className="grid min-w-0">
              <div className={PAGE} inert={page !== "server"}>
                {/* Address and port on one line; the inputs shrink with their column. */}
                <div className="grid grid-cols-[minmax(0,1fr)_96px] gap-2.5">
                  <TextField className="min-w-0" inputClassName="w-full min-w-0"
                    label="Địa chỉ"
                    placeholder={defaults?.server.host}
                    value={form.server.host}
                    onChange={(e) => set({ server: { ...form.server, host: e.target.value } })}
                  />
                  <TextField className="min-w-0" inputClassName="w-full min-w-0"
                    label="Cổng"
                    type="number"
                    min={1}
                    max={65535}
                    value={form.server.port || ""}
                    onChange={(e) => set({ server: { ...form.server, port: Number(e.target.value) } })}
                  />
                </div>
                {defaults && (
                  <div className="flex flex-wrap items-center justify-between gap-1.5 min-h-[26px] text-11 text-fg-3">
                    <span>
                      Mặc định của game: <b className="text-fg-2 font-bold selectable">{`${defaults.server.host}:${defaults.server.port}`}</b>
                    </span>
                    {!atDefault && (
                      <Button kind="ghost" small icon="refresh" onClick={() => set({ server: defaults.server })}>
                        Dùng mặc định
                      </Button>
                    )}
                  </div>
                )}
                {saved && !sameServer(form, saved) && playing > 0 && (
                  <p className={DIALOG.note}>
                    {playing} nick đang trong game giữ kết nối cũ; địa chỉ mới dùng từ lần đăng nhập sau.
                  </p>
                )}
              </div>

              <div className={PAGE} inert={page !== "data"}>
                <SettingRow
                  id={`${id}record`}
                  on={form.record}
                  disabled={saving}
                  onChange={(record) => set({ record })}
                  icon="chart"
                  title="Lưu dữ liệu trận"
                  hint="Mỗi trận của mọi nick được lưu vào cllt.db: chỉ số, hệ, kỹ năng, đồ của nhân vật, quái và hệ của quái, mọi gói tin của trận và kết quả, khoảng 4–5 KB một trận. Dùng để học thuật toán đánh. Không lưu mật khẩu, chat hay người chơi khác; không bị xoá sau 90 ngày như lịch sử trận. Bật/tắt có hiệu lực ngay từ trận sau khi bấm Lưu."
                >
                  {data && (
                    <span className={SETTING_FACT}>
                      <Icon name="list" size={12} />
                      Đã lưu <b className="px">{num(data.battles)}</b> trận · {size(data.bytes)}
                    </span>
                  )}
                </SettingRow>
                {/* The export: its button, then what it does or what it wrote, on a dark plate. */}
                <div className="flex flex-wrap items-center gap-y-1.5 gap-x-2.5 px-3 py-2.5 bg-ink">
                  <Button kind="outline" small icon="download" disabled={!data?.battles || exported.state === "working"} onClick={exportBattles}>
                    {exported.state === "working" ? "Đang xuất…" : "Xuất dữ liệu trận"}
                  </Button>
                  {exported.state === "done" ? (
                    <>
                      <p className={cn(EXPORT_TEXT, "text-good")} role="status">
                        Đã xuất {num(exported.file.battles)} trận ({size(exported.file.bytes)}) vào{" "}
                        <b className="text-fg font-bold selectable">{fileName(exported.file.path)}</b> trong Downloads.
                      </p>
                      <Button kind="ghost" small icon="folder" onClick={() => api.revealExport(exported.file.path).catch((err) => setExported({ state: "fail", text: message(err) }))}>
                        Mở thư mục
                      </Button>
                    </>
                  ) : exported.state === "fail" ? (
                    <p className={cn(EXPORT_TEXT, "text-danger")} role="alert">
                      {exported.text}
                    </p>
                  ) : (
                    <p className={EXPORT_TEXT}>
                      {data?.battles
                        ? "Mọi trận đã lưu của mọi nick vào một file .db trong Downloads, để gửi đi học thuật toán đánh."
                        : "Chưa có trận nào được lưu."}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </TabPanel>
        </>
      )}
      {error && (
        <p className={DIALOG.error} role="alert">
          {error}
        </p>
      )}
      <footer className={DIALOG.footer}>
        <Button kind="ghost" onClick={onClose}>
          Huỷ
        </Button>
        <Button kind="primary" type="submit" disabled={saving || !valid}>
          {saving ? "Đang lưu…" : "Lưu"}
        </Button>
      </footer>
    </Dialog>
  );
}
