import { useEffect, useId, useState, type FormEvent } from "react";
import { api } from "@/api";
import { Button } from "@/components/Button";
import { cn } from "@/utils/cn";
import { DIALOG, Dialog } from "@/components/Dialog";
import { Icon } from "@/components/Icon";
import { SETTING_FACT, SettingRow } from "@/components/SettingRow";
import { TabPanel, Tabs, type Tab } from "@/components/Tabs";
import { TextField } from "@/components/TextField";
import { num, size } from "@/utils/format";
import { inGame, useStore } from "@/store";
import type { Exported, OnClose, Settings, SettingsView } from "@/api/types";
import { FaultsPage } from "./FaultsPage";

type Page = "server" | "data" | "notify" | "faults" | "window";
const PAGES: Tab<Page>[] = [
  { key: "server", label: "Server game", icon: "server" },
  { key: "data", label: "Dữ liệu trận", icon: "chart" },
  { key: "notify", label: "Thông báo", icon: "bell" },
  { key: "faults", label: "Log lỗi", icon: "bug" },
  { key: "window", label: "Cửa sổ", icon: "tray" },
];

/** What the close button of the window can do (tray.rs), as the radio rows of the Cửa sổ tab. */
const ON_CLOSE: { value: OnClose; title: string; text: string }[] = [
  { value: "ask", title: "Hỏi mỗi lần", text: "Hiện hộp Đóng cửa sổ để chọn Thu nhỏ vào khay hay Thoát ứng dụng." },
  { value: "tray", title: "Thu nhỏ vào khay", text: "Ẩn cửa sổ, các nick vẫn chơi tiếp. Mở lại bằng icon ở khay, hoặc chọn Thoát ở menu của icon để đóng hẳn." },
  { value: "quit", title: "Thoát ứng dụng", text: "Đóng hẳn ứng dụng, mọi nick đang trong game bị đăng xuất." },
];

/** What Xuất or Xoá dữ liệu trận did, beside their buttons. */
type Export =
  | { state: "idle" }
  | { state: "working" }
  | { state: "done"; file: Exported }
  | { state: "cleared"; count: number }
  | { state: "fail"; text: string };

const message = (err: unknown) => String(err instanceof Error ? err.message : err);
const sameServer = (a: Settings, b: Settings) => a.server.host.trim() === b.server.host && a.server.port === b.server.port;
const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

/** One page of the tabs. Both pages sit in the same grid cell, the hidden one invisible, so the dialog is as tall as the
 * taller page and does not jump when the tab changes. */
const PAGE = "[grid-area:1/1] grid gap-2.5 [align-content:start] min-w-0 inert:invisible";
/** What the export does or what it wrote, beside its button. */
const EXPORT_TEXT = "flex-[1_1_220px] m-0 text-[11.5px] text-fg-2 wrap-anywhere";

/**
 * Cài đặt of the app, behind the button beside the name Co Lau Tool, in five tabs. Server game: the address the next logins
 * connect to; Mặc định puts back plays1.colauloanthe.vn:1688. Dữ liệu trận: Lưu
 * dữ liệu trận for every account, Xuất dữ liệu trận, which at once writes every saved battle to one file in
 * Downloads, and Xoá dữ liệu trận, which asks once more (as Xoá log lỗi does), then deletes them all at once. Thông báo: a notification
 * when a job or quest run ends by itself, and when it ends for losses (notify.rs), with Gửi thử. Log lỗi (FaultsPage): the faults kept, read when the dialog opens, and Xuất and Xoá log lỗi, at once too.
 * Cửa sổ: what the close button of the window does. The tabs stay in the form, the hidden ones inert, so the dialog keeps
 * the height of the tallest and Lưu saves them all to settings.json.
 */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [view, setView] = useState<SettingsView | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [exported, setExported] = useState<Export>({ state: "idle" });
  const [confirmClear, setConfirmClear] = useState(false);
  const [tried, setTried] = useState<{ state: "idle" | "working" | "sent" } | { state: "fail"; text: string }>({ state: "idle" });
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

  const clearBattles = () => {
    setConfirmClear(false);
    setExported({ state: "working" });
    api.clearBattles().then(
      (count) => {
        setExported({ state: "cleared", count });
        setView((v) => v && { ...v, battleData: v.battleData && { battles: 0, bytes: 0 } });
      },
      (err) => setExported({ state: "fail", text: message(err) }),
    );
  };

  const tryNotification = () => {
    setTried({ state: "working" });
    api.testNotification().then(
      () => setTried({ state: "sent" }),
      (err) => setTried({ state: "fail", text: message(err) }),
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
    <Dialog title="Cài đặt" subtitle="Dùng chung cho mọi nick" onSubmit={submit} onClose={onClose} className="w-[min(620px,94vw)]">
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
                      Mặc định của game: <b className="text-fg-2 font-bold select-text">{`${defaults.server.host}:${defaults.server.port}`}</b>
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
                    {exported.state === "working" ? "Đang làm…" : "Xuất dữ liệu trận"}
                  </Button>
                  {confirmClear ? (
                    <>
                      <Button kind="danger" small icon="trash" onClick={clearBattles}>
                        Xoá {num(data?.battles ?? 0)} trận
                      </Button>
                      <Button kind="ghost" small onClick={() => setConfirmClear(false)}>
                        Thôi
                      </Button>
                    </>
                  ) : (
                    <Button kind="ghost" small icon="trash" disabled={!data?.battles || exported.state === "working"} onClick={() => setConfirmClear(true)}>
                      Xoá dữ liệu trận
                    </Button>
                  )}
                  {confirmClear ? (
                    <p className={cn(EXPORT_TEXT, "text-danger")} role="alert">
                      Xoá hẳn mọi trận đã lưu của mọi nick, không lấy lại được. Muốn giữ thì Xuất trước.
                    </p>
                  ) : exported.state === "done" ? (
                    <>
                      <p className={cn(EXPORT_TEXT, "text-good")} role="status">
                        Đã xuất {num(exported.file.battles)} trận ({size(exported.file.bytes)}) vào{" "}
                        <b className="text-fg font-bold select-text">{fileName(exported.file.path)}</b> trong Downloads.
                      </p>
                      <Button kind="ghost" small icon="folder" onClick={() => api.revealExport(exported.file.path).catch((err) => setExported({ state: "fail", text: message(err) }))}>
                        Mở thư mục
                      </Button>
                    </>
                  ) : exported.state === "cleared" ? (
                    <p className={EXPORT_TEXT} role="status">
                      Đã xoá {num(exported.count)} trận. Lịch sử trận và nhật ký của các nick vẫn giữ.
                    </p>
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

              <div className={PAGE} inert={page !== "notify"}>
                <SettingRow
                  id={`${id}notify-done`}
                  on={form.notifyDone}
                  disabled={saving}
                  onChange={(notifyDone) => set({ notifyDone })}
                  icon="flag"
                  title="Báo khi xong việc"
                  hint="Đánh quái đủ số trận, hay Tự làm nhiệm vụ kết thúc (xong bước đang làm, hoặc bot dừng vì không đi tiếp được), máy hiện thông báo kèm lý do, số trận thắng thua và EXP. Tự bấm Dừng thì không báo."
                />
                <SettingRow
                  id={`${id}notify-lost`}
                  on={form.notifyLost}
                  disabled={saving}
                  onChange={(notifyLost) => set({ notifyLost })}
                  icon="sword"
                  title="Báo khi thua hết lượt"
                  hint="Đánh quái hay làm nhiệm vụ dừng vì đã thua đủ số trận Thua tối đa, máy hiện thông báo để vào xem nhân vật."
                />
                {/* Gửi thử, then what it did or how the systems ask, on a dark plate. */}
                <div className="flex flex-wrap items-center gap-y-1.5 gap-x-2.5 px-3 py-2.5 bg-ink">
                  <Button kind="outline" small icon="bell" disabled={tried.state === "working"} onClick={tryNotification}>
                    Gửi thử
                  </Button>
                  {tried.state === "fail" ? (
                    <p className={cn(EXPORT_TEXT, "text-danger")} role="alert">
                      {tried.text}
                    </p>
                  ) : (
                    <p className={cn(EXPORT_TEXT, tried.state === "sent" && "text-good")} role="status">
                      {tried.state === "sent"
                        ? "Đã gửi. Không thấy thì xem Windows: Cài đặt → Hệ thống → Thông báo; macOS: Cài đặt hệ thống → Thông báo → colautool."
                        : "Windows và Linux hiện thông báo ngay. macOS hỏi Cho phép ở lần đầu tiên, bấm Cho phép một lần là xong."}
                    </p>
                  )}
                </div>
              </div>

              <div className={PAGE} inert={page !== "faults"}>
                <FaultsPage />
              </div>

              <div className={PAGE} inert={page !== "window"}>
                <p className="m-0 text-11 text-fg-2">Khi bấm nút đóng cửa sổ:</p>
                <div className="grid gap-1.5" role="radiogroup" aria-label="Khi bấm nút đóng cửa sổ">
                  {ON_CLOSE.map((o) => (
                    // The chosen one on a lighter plate with a gold stripe, as Tự cộng điểm tiềm năng.
                    <label
                      key={o.value}
                      className={cn(
                        "flex items-start gap-2.5 px-2.5 py-2 bg-ink shadow-[inset_3px_0_0_transparent] cursor-pointer hover:bg-bg-2",
                        form.onClose === o.value && "shadow-[inset_3px_0_0_var(--primary)] bg-bg-2",
                      )}
                    >
                      <input
                        type="radio"
                        name={`${id}on-close`}
                        value={o.value}
                        checked={form.onClose === o.value}
                        disabled={saving}
                        onChange={() => set({ onClose: o.value })}
                        className="mt-0.5 mx-0 mb-0 accent-primary focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
                      />
                      <span className="grid gap-0.5">
                        <b className="text-[12.5px] text-fg">{o.title}</b>
                        <span className="text-11 leading-[1.45] text-fg-2">{o.text}</span>
                      </span>
                    </label>
                  ))}
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
