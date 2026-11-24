import { useEffect, useId, useRef, useState } from "react";
import jsQR from "jsqr";
import QRCode from "qrcode";
import { api } from "@/api";
import { Button } from "@/components/Button";
import { CheckRow } from "@/components/CheckRow";
import { DIALOG, Dialog } from "@/components/Dialog";
import { Icon } from "@/components/Icon";
import { TabPanel, Tabs, type Tab } from "@/components/Tabs";
import { useStore } from "@/store";
import { isAndroid } from "@/utils/platform";
import { decodeQr, encodeQr, QR_MAX, QR_PREFIX, QR_TAB, tabOwner, type QrContent } from "@/utils/qrPayload";
import { remember } from "@/utils/remember";
import { keptTabOf } from "../AccountPage";
import { AccountTicks } from "./AccountTicks";
import { ImportAccountsPage } from "./ImportAccountsPage";

type Page = "share" | "scan";
const PAGES: Tab<Page>[] = [
  { key: "share", label: "Chia sẻ", icon: "qr" },
  { key: "scan", label: "Quét", icon: "download" },
];
const SUBTITLE: Record<Page, string> = {
  share: "Nick, mật khẩu, cài đặt đánh và tab đang mở trong một QR",
  scan: isAndroid() ? "Quét QR nick bằng camera, hoặc chọn ảnh QR" : "Chọn ảnh QR nick, hoặc dán ảnh vào đây",
};
/** One page of the tabs, as in Nhập / Xuất JSON: both in one grid cell, the hidden one inert. */
const PAGE = "[grid-area:1/1] flex flex-col gap-3 min-w-0 inert:invisible";

const message = (err: unknown) => String(err instanceof Error ? err.message : err);
const fileName = (path: string) => path.split(/[\\/]/).pop() ?? path;

/**
 * QR nick, behind the QR button at the left of Thêm nick: the accounts ticked, their passwords, proxies and Cài đặt đánh
 * (Số trận, Thua tối đa, the target of each map…), the tab each has open and the Cài đặt of the app, in one QR read by
 * another copy of the app without the network (utils/qrPayload.ts); or a QR of that kind scanned, then Nhập as for a
 * JSON. It opens on Chia sẻ when there are accounts, else on Quét.
 */
export function QrAccountsDialog({ onClose }: { onClose: () => void }) {
  const any = useStore((s) => s.order.length > 0);
  const [page, setPage] = useState<Page>(any ? "share" : "scan");
  const id = useId();
  return (
    <Dialog title="QR nick" subtitle={SUBTITLE[page]} onSubmit={(e) => e.preventDefault()} onClose={onClose} className="w-[min(520px,92vw)]">
      <Tabs id={`${id}tabs`} tabs={PAGES} value={page} onChange={setPage} label="Chia sẻ hay quét" />
      <TabPanel id={`${id}tabs`} value={page}>
        <div className="grid min-w-0">
          <div className={PAGE} inert={page !== "share"}>
            <SharePage active={page === "share"} onClose={onClose} />
          </div>
          <div className={PAGE} inert={page !== "scan"}>
            <ScanPage active={page === "scan"} onClose={onClose} />
          </div>
        </div>
      </TabPanel>
    </Dialog>
  );
}

type Done = { state: "idle" } | { state: "working" } | { state: "saved"; path: string } | { state: "shared" } | { state: "fail"; text: string };

/** Chia sẻ: the QR of the accounts ticked, drawn black on white (scanners want the light around it), with Chia sẻ (the
 * share sheet of Android) or Lưu ảnh (a PNG in Downloads). Made again whenever the ticks change. */
function SharePage({ active, onClose }: { active: boolean; onClose: () => void }) {
  const order = useStore((s) => s.order);
  const byId = useStore((s) => s.byId);
  const [unticked, setUnticked] = useState<number[]>([]);
  const [withSettings, setWithSettings] = useState(true);
  const [qr, setQr] = useState<{ url: string; share: number } | null>(null);
  const [error, setError] = useState("");
  const [done, setDone] = useState<Done>({ state: "idle" });
  const ids = order.filter((id) => !unticked.includes(id));

  useEffect(() => {
    let live = true;
    setQr(null);
    setError("");
    if (!active || !ids.length) return;
    api
      .exportAccounts(ids, withSettings)
      .then(async (json) => {
        const tabs: Record<string, string> = {};
        for (const id of ids) {
          const a = byId[id], tab = keptTabOf(id);
          if (a && tab) tabs[tabOwner(a.username, a.serverId)] = tab;
        }
        const text = encodeQr({ json, tabs });
        if (text.length > QR_MAX) {
          throw new Error(`${ids.length} nick không vừa một QR (cần ${Math.round((100 * text.length) / QR_MAX)}% sức chứa): bỏ chọn bớt, khoảng 35 nick một QR.`);
        }
        const url = await QRCode.toDataURL([{ data: text, mode: "alphanumeric" }], { errorCorrectionLevel: "L", margin: 4, scale: 8, color: { dark: "#000000", light: "#ffffff" } });
        if (live) setQr({ url, share: text.length / QR_MAX });
      })
      .catch((err) => live && setError(message(err)));
    return () => {
      live = false;
    };
    // ids is a new array on every render: its contents are what count.
  }, [active, ids.join(","), withSettings]);

  const save = () => {
    if (!qr) return;
    setDone({ state: "working" });
    const png = Array.from(atob(qr.url.slice(qr.url.indexOf(",") + 1)), (c) => c.charCodeAt(0));
    api.saveQr(png).then(
      (path) => setDone(path ? { state: "saved", path } : { state: "shared" }),
      (err) => setDone({ state: "fail", text: message(err) }),
    );
  };

  return (
    <>
      <AccountTicks unticked={unticked} onChange={(u) => { setUnticked(u); setDone({ state: "idle" }); }} what="chia sẻ" />
      <CheckRow checked={withSettings} onChange={(on) => { setWithSettings(on); setDone({ state: "idle" }); }}>
        Kèm cài đặt của app (server game, lưu dữ liệu trận)
      </CheckRow>
      <div className="grid justify-items-center gap-1.5">
        {qr ? (
          <img src={qr.url} alt={`QR của ${ids.length} nick`} className="block w-full max-w-[300px] aspect-square [image-rendering:pixelated] bg-white" />
        ) : (
          <div className="grid place-items-center w-full max-w-[300px] aspect-square bg-ink text-12 text-fg-3 text-center px-4">
            {error ? "Chưa tạo được QR" : ids.length ? "Đang tạo QR…" : "Chọn ít nhất một nick"}
          </div>
        )}
        {qr && (
          <span className="text-11 text-fg-3">
            {ids.length} nick · dùng {Math.round(qr.share * 100)}% sức chứa của QR
          </span>
        )}
      </div>
      <p className={`${DIALOG.note} m-0 flex gap-2 items-start`}>
        <Icon name="eye" size={14} className="flex-none mt-px text-coin" />
        <span>
          QR có <b className="text-fg">mật khẩu</b> của các nick đã chọn. Chỉ gửi cho chính bạn; ai quét được là đăng nhập được.
        </span>
      </p>
      {error && (
        <p className={DIALOG.error} role="alert">
          {error}
        </p>
      )}
      {done.state === "saved" && (
        <div className="flex flex-wrap items-center gap-1.5 text-11 text-good">
          <span className="wrap-anywhere">
            Đã lưu ảnh QR vào <b>{fileName(done.path)}</b> trong Downloads.
          </span>
          <Button kind="ghost" small icon="folder" onClick={() => api.revealExport(done.path).catch((err) => setDone({ state: "fail", text: message(err) }))}>
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
        <Button kind="primary" icon={isAndroid() ? "upload" : "download"} disabled={!qr || done.state === "working"} onClick={save}>
          {done.state === "working" ? "Đang mở…" : isAndroid() ? "Chia sẻ" : "Lưu ảnh"}
        </Button>
      </footer>
    </>
  );
}

/** The text of the QR in a picture (a photo of a screen, a screenshot, a picture sent by Zalo); an error when none is
 * found. A large picture is made at most 2400 px on its longer side first. */
async function readQrImage(blob: Blob): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const k = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * k), h = Math.round(bitmap.height * k);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(bitmap, 0, 0, w, h);
  const code = jsQR(g.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "attemptBoth" });
  if (!code) throw new Error("Không thấy QR trong ảnh: chụp rõ hơn, đủ sáng, thấy cả bốn góc của QR.");
  return code.data;
}

/** Quét: the camera on Android (barcode-scanner), a picture picked, or on the desktop a picture (or the text of a QR)
 * pasted; then Nhập with what the QR holds, its accounts and Cài đặt ticked. The tabs of the QR wait for each account's
 * page (QR_TAB). */
function ScanPage({ active, onClose }: { active: boolean; onClose: () => void }) {
  const [content, setContent] = useState<QrContent | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const take = (text: string) => {
    try {
      setContent(decodeQr(text));
      setError("");
    } catch (err) {
      setError(message(err));
    }
  };
  const fromImage = (blob: Blob) => {
    setBusy(true);
    setError("");
    readQrImage(blob).then(take, (err) => setError(message(err))).finally(() => setBusy(false));
  };
  const camera = async () => {
    setError("");
    try {
      const scanner = await import("@tauri-apps/plugin-barcode-scanner");
      let allowed = await scanner.checkPermissions();
      if (allowed !== "granted") allowed = await scanner.requestPermissions();
      if (allowed !== "granted") throw new Error("App chưa được dùng camera: bật quyền Camera của colautool trong Cài đặt của Android.");
      take((await scanner.scan({ formats: [scanner.Format.QRCode], windowed: false })).content);
    } catch (err) {
      setError(message(err));
    }
  };

  useEffect(() => {
    if (!active || content) return;
    const onPaste = (e: ClipboardEvent) => {
      const image = [...(e.clipboardData?.items ?? [])].find((i) => i.type.startsWith("image/"))?.getAsFile();
      const text = e.clipboardData?.getData("text") ?? "";
      if (image) {
        e.preventDefault();
        fromImage(image);
      } else if (text.trim().startsWith(QR_PREFIX)) {
        e.preventDefault();
        take(text);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [active, content]);

  if (content) {
    const tabs = content.tabs;
    return (
      <ImportAccountsPage
        scanned={content.json}
        onImported={() => Object.entries(tabs).forEach(([owner, tab]) => remember(QR_TAB + owner, tab))}
        onAgain={() => setContent(null)}
        onClose={onClose}
      />
    );
  }
  return (
    <>
      <div className="grid gap-2 justify-items-center py-4 px-3 bg-ink text-center">
        <Icon name="qr" size={40} className="text-fg-3" />
        <p className="m-0 text-12 text-fg-2">
          {isAndroid()
            ? "Quét QR nick hiện trên máy khác, hoặc chọn ảnh QR đã được gửi."
            : "Chọn ảnh QR nick (ảnh chụp màn hình, ảnh gửi qua Zalo…), hoặc dán ảnh vào đây bằng Ctrl+V / ⌘V."}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          {isAndroid() && (
            <Button kind="primary" icon="qr" onClick={() => void camera()}>
              Quét bằng camera
            </Button>
          )}
          <Button kind={isAndroid() ? "outline" : "primary"} icon="folder" disabled={busy} onClick={() => file.current?.click()}>
            {busy ? "Đang đọc ảnh…" : "Chọn ảnh QR…"}
          </Button>
          <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) fromImage(f); e.target.value = ""; }} />
        </div>
      </div>
      {error && (
        <p className={DIALOG.error} role="alert">
          {error}
        </p>
      )}
      <footer className={`${DIALOG.footer} mt-auto`}>
        <Button kind="ghost" onClick={onClose}>
          Đóng
        </Button>
      </footer>
    </>
  );
}
