import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { api } from "@/api";
import type { Account } from "@/api/types";
import { Button } from "@/components/Button";
import { Dialog, DIALOG } from "@/components/Dialog";
import { useStore } from "@/store";

/** The size of the server's picture, the frame of the points (CAPTCHA_SIZE of cllt-core). */
const W = 640;
const H = 400;
/** The most points an answer carries (CAPTCHA_POINTS of cllt-core). */
const MAX_POINTS = 6;

/**
 * Xác nhận người chơi (docs/app/events/02-login.md#captcha): the server asks a captcha right after login, and no battle
 * gives anything until it is passed. The first account with one waiting (the selected account first) gets this window,
 * as the game shows it: the picture with the request drawn in it, touched in order (each point numbered), Làm lại, Gửi,
 * the seconds left. The points go out in pixels of the 640 × 400 picture (c2s/1283); the server's verdict closes the
 * window or says why not. Để sau hides it for that captcha; the job waits all the same (bot/captcha.rs).
 */
export function CaptchaGate() {
  const order = useStore((s) => s.order);
  const byId = useStore((s) => s.byId);
  const accounts = order.map((id) => byId[id]);
  const selected = useStore((s) => s.chosen);
  const [later, setLater] = useState<number[]>([]);
  const waiting = accounts.filter((a): a is Account & { captcha: NonNullable<Account["captcha"]> } => !!a?.captcha && !later.includes(a.captcha.id));
  const account = waiting.find((a) => a.id === selected) ?? waiting[0];
  if (!account) return null;
  return <CaptchaDialog key={account.captcha.id} account={account} more={waiting.length - 1} onLater={() => setLater((l) => [...l, account.captcha.id])} />;
}

function CaptchaDialog({ account, more, onLater }: { account: Account & { captcha: NonNullable<Account["captcha"]> }; more: number; onLater: () => void }) {
  const c = account.captcha;
  const [url, setUrl] = useState<string>();
  const [points, setPoints] = useState<[number, number][]>([]);
  const [sent, setSent] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    let gone = false;
    let made: string | undefined;
    void api.captchaImage(account.id, c.id).then((bytes) => {
      if (gone || !bytes) return;
      made = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
      setUrl(made);
    });
    return () => {
      gone = true;
      if (made) URL.revokeObjectURL(made);
    };
  }, [account.id, c.id]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, []);
  // A refusal (even with the same text as the last) lets the user touch again, from no point.
  useEffect(() => {
    setSent(false);
    setPoints([]);
  }, [c.refused]);
  const left = Math.max(0, Math.ceil((c.expiresAt - now) / 1000));
  const touch = (e: MouseEvent<HTMLButtonElement>) => {
    if (sent || points.length >= MAX_POINTS) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.min(W - 1, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * W)));
    const y = Math.min(H - 1, Math.max(0, Math.round(((e.clientY - r.top) / r.height) * H)));
    setPoints((p) => [...p, [x, y]]);
  };
  const send = async () => {
    setSent(true);
    try {
      await api.answerCaptcha(account.id, c.id, points);
    } catch (e) {
      setSent(false);
      useStore.getState().toast({ tone: "warn", title: "Captcha", text: String(e instanceof Error ? e.message : e) });
    }
  };
  const marks = useMemo(() => points.map(([x, y], i) => ({ i, left: `${(x / W) * 100}%`, top: `${(y / H) * 100}%` })), [points]);
  return (
    <Dialog
      title="Xác nhận người chơi"
      subtitle={
        <>
          <b>{account.label}</b>: server đòi xác nhận, chưa xác nhận thì đánh không có thưởng{more > 0 ? ` · còn ${more} nick khác chờ` : ""}
        </>
      }
      onSubmit={(e) => {
        e.preventDefault();
        if (points.length && !sent) void send();
      }}
      onClose={onLater}
      className="w-[680px] max-w-[calc(100vw-32px)]"
    >
      <p className={`m-0 ${DIALOG.text}`}>Làm theo yêu cầu trong ảnh: chạm vào ảnh theo đúng thứ tự, rồi bấm Gửi.</p>
      <button
        type="button"
        onClick={touch}
        aria-label="Ảnh captcha: chạm để chọn điểm"
        className="relative block w-full aspect-[640/400] p-0 border-0 bg-ink cursor-crosshair select-none"
      >
        {url ? <img src={url} alt="" draggable={false} className="block w-full h-full pointer-events-none" /> : <span className="text-12 text-fg-3">Đang tải ảnh…</span>}
        {marks.map((m) => (
          <span
            key={m.i}
            aria-hidden="true"
            style={{ left: m.left, top: m.top }}
            className="absolute -translate-x-1/2 -translate-y-1/2 grid place-items-center size-7 rounded-full bg-primary text-ink text-13 font-extrabold border-2 border-ink pointer-events-none"
          >
            {m.i + 1}
          </span>
        ))}
      </button>
      <p className="m-0 text-12 text-fg-2" role="status" aria-live="polite">
        {left > 0 ? (
          <>
            Còn <b className="px text-fg">{left}</b> giây · {c.tries} lần thử · đã chạm <b className="px text-fg">{points.length}</b>/{MAX_POINTS}
          </>
        ) : (
          "Hết giờ"
        )}
      </p>
      {c.error && <p className={`m-0 ${DIALOG.error}`}>{c.error}</p>}
      <footer className={DIALOG.footer}>
        <Button kind="ghost" onClick={onLater}>
          Để sau
        </Button>
        <Button kind="tonal" icon="refresh" disabled={!points.length || sent} onClick={() => setPoints([])}>
          Làm lại
        </Button>
        <Button kind="primary" type="submit" disabled={!points.length || sent || left === 0}>
          {sent ? "Đang gửi…" : "Gửi"}
        </Button>
      </footer>
    </Dialog>
  );
}
