import { useEffect, useState } from "react";
import { api } from "@/api";
import { Button } from "@/components/Button";
import { Icon } from "@/components/Icon";
import { SETTING_FACT } from "@/components/SettingRow";
import { cn } from "@/utils/cn";
import { num, size } from "@/utils/format";
import type { ExportedFaults, FaultList, FaultSource } from "@/api/types";

/** Where a Log lỗi comes from, in words. */
const SOURCE: Record<FaultSource, string> = { bot: "Bot", connection: "Kết nối", report: "Báo lỗi", ui: "Giao diện" };
/** What the export or the clearing did, beside its buttons. */
const NOTE = "flex-[1_1_220px] m-0 text-[11.5px] text-fg-2 wrap-anywhere";

type Done = { state: "idle" } | { state: "working" } | { state: "exported"; file: ExportedFaults } | { state: "cleared"; count: number } | { state: "fail"; text: string };

const message = (err: unknown) => String(err instanceof Error ? err.message : err);
const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;
/** "01/11 21:22", as the Nhật ký writes another day. */
function when(ms: number) {
  const d = new Date(ms);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(d.getDate())}/${two(d.getMonth() + 1)} ${two(d.getHours())}:${two(d.getMinutes())}`;
}

/**
 * The Log lỗi tab of Cài đặt: the faults the app kept (a packet the bot could not read, a server or NPC that did not
 * answer, a session that ended in an error, an error of the UI) and each Báo lỗi, newest first; Xuất log lỗi writes them
 * all at once to one .json file in Downloads, to send to whoever fixes the app; Xoá log lỗi asks once more.
 */
export function FaultsPage() {
  const [list, setList] = useState<FaultList | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Done>({ state: "idle" });
  const [confirm, setConfirm] = useState(false);

  const load = () =>
    api.faults().then(
      (l) => {
        setList(l);
        setError("");
      },
      (err) => setError(message(err)),
    );
  useEffect(() => {
    load();
  }, []);

  const exportAll = () => {
    setDone({ state: "working" });
    api.exportFaults().then(
      (file) => setDone({ state: "exported", file }),
      (err) => setDone({ state: "fail", text: message(err) }),
    );
  };
  const clear = () => {
    setConfirm(false);
    setDone({ state: "working" });
    api.clearFaults().then(
      (count) => {
        setDone({ state: "cleared", count });
        load();
      },
      (err) => setDone({ state: "fail", text: message(err) }),
    );
  };
  const count = list?.count ?? 0;

  return (
    <>
      <p className="m-0 text-11 leading-[1.5] text-fg-2">
        App tự lưu lỗi khi bot không đọc được gói tin, server hay NPC không trả lời, nick bị ngắt vì lỗi, hay giao diện lỗi; bấm{" "}
        <b className="text-fg">Báo lỗi</b> ở Nhật ký để lưu lỗi bạn thấy. Mỗi lỗi kèm nhật ký, lệnh và gói tin ngay trước đó, không có mật
        khẩu hay proxy. Giữ 500 lỗi gần nhất.
      </p>
      {list && (
        <span className={SETTING_FACT}>
          <Icon name="bug" size={12} />
          Đã lưu <b className="px">{num(count)}</b> lỗi · {size(list.bytes)}
        </span>
      )}
      {error && (
        <p className="m-0 text-11 text-danger" role="alert">
          {error}
        </p>
      )}
      {list && list.recent.length > 0 && (
        <ol className="grid m-0 p-0 list-none max-h-[188px] overflow-auto scroll bg-ink" aria-label="Lỗi gần nhất">
          {list.recent.map((f) => (
            <li key={f.id} className="grid grid-cols-[76px_64px_minmax(0,1fr)] gap-2 px-2.5 py-1.5 text-11 leading-[1.45] border-b border-line last:border-b-0">
              <span className="text-fg-3 whitespace-nowrap">{when(f.at)}</span>
              <span className={cn("whitespace-nowrap", f.source === "report" ? "text-primary" : "text-danger")}>{SOURCE[f.source]}</span>
              <span className="min-w-0 text-fg-2 line-clamp-2 select-text" title={f.text}>
                {f.username && <b className="text-fg font-bold">{f.username}: </b>}
                {f.text}
              </span>
            </li>
          ))}
        </ol>
      )}
      {/* The export and the clearing: their buttons, then what they did, on a dark plate. */}
      <div className="flex flex-wrap items-center gap-y-1.5 gap-x-2.5 px-3 py-2.5 bg-ink">
        <Button kind="outline" small icon="download" disabled={!count || done.state === "working"} onClick={exportAll}>
          {done.state === "working" ? "Đang làm…" : "Xuất log lỗi"}
        </Button>
        {confirm ? (
          <>
            <Button kind="danger" small icon="trash" onClick={clear}>
              Xoá {num(count)} lỗi
            </Button>
            <Button kind="ghost" small onClick={() => setConfirm(false)}>
              Thôi
            </Button>
          </>
        ) : (
          <Button kind="ghost" small icon="trash" disabled={!count || done.state === "working"} onClick={() => setConfirm(true)}>
            Xoá log lỗi
          </Button>
        )}
        {done.state === "exported" ? (
          <>
            <p className={cn(NOTE, "text-good")} role="status">
              Đã xuất {num(done.file.faults)} lỗi ({size(done.file.bytes)}) vào{" "}
              <b className="text-fg font-bold select-text">{fileName(done.file.path)}</b> trong Downloads.
            </p>
            <Button kind="ghost" small icon="folder" onClick={() => api.revealExport(done.file.path).catch((err) => setDone({ state: "fail", text: message(err) }))}>
              Mở thư mục
            </Button>
          </>
        ) : done.state === "cleared" ? (
          <p className={NOTE} role="status">
            Đã xoá {num(done.count)} lỗi.
          </p>
        ) : done.state === "fail" ? (
          <p className={cn(NOTE, "text-danger")} role="alert">
            {done.text}
          </p>
        ) : (
          <p className={NOTE}>{count ? "Mọi lỗi đã lưu vào một file .json trong Downloads, để gửi đi sửa lỗi." : "Chưa có lỗi nào được lưu."}</p>
        )}
      </div>
    </>
  );
}
