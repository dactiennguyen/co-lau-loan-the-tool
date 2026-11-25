import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { api } from "@/api";
import type { Account } from "@/api/types";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { useStore } from "@/store";
import { cn } from "@/utils/cn";
import { pngDataUrl } from "@/utils/dataUrl";
import { isConnected } from "@/utils/format";

/** The size of the server's picture, the frame of the points (CAPTCHA_SIZE of cllt-core). */
const W = 640;
const H = 400;
/** The most points an answer carries (CAPTCHA_POINTS of cllt-core). */
const MAX_POINTS = 6;
/** After the logout of Đăng nhập lại, the wait before the login: the server refuses a login of a nick it still holds. */
const RELOGIN_GAP_MS = 3000;

type Waiting = Account & { captcha: NonNullable<Account["captcha"]> };

/** Seconds left until `at` (ms since 1970), counted down every half second; 0 once it has passed. */
function useSecondsLeft(at: number | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (at == null) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [at]);
  return at == null ? 0 : Math.max(0, Math.ceil((at - now) / 1000));
}

/** Đăng nhập lại: logout, then login once the account is out of the game, so the server asks a new captcha. */
function relogin(id: number) {
  void api.logout(id);
  const stop = useStore.subscribe((s) => {
    const a = s.byId[id];
    if (!a || isConnected(a.status)) return;
    stop();
    window.setTimeout(() => void api.login(id), RELOGIN_GAP_MS);
  });
}

/**
 * The captcha state of an account in the sidebar, beside its status: "Captcha 45s" while one waits for the user, "Chưa
 * xác nhận" once its time went by unanswered (battles give nothing until a new login passes one). Nothing otherwise.
 */
export function CaptchaTag({ account }: { account: Account }) {
  const left = useSecondsLeft(account.captcha?.expiresAt);
  if (account.captcha && left > 0)
    return (
      <span
        className="justify-self-start inline-flex items-center gap-1 h-[18px] px-1.5 bg-ink text-[10.5px] font-bold whitespace-nowrap text-s-connecting animate-blink motion-reduce:animate-none"
        title="Server đòi xác nhận người chơi: mở nick này để chạm vào ảnh captcha"
      >
        <Icon name="shield" size={10} />
        Captcha {left}s
      </span>
    );
  if (!account.unverified || !isConnected(account.status)) return null;
  return (
    <span
      className="justify-self-start inline-flex items-center gap-1 h-[18px] px-1.5 bg-ink text-[10.5px] font-bold whitespace-nowrap text-danger"
      title="Chưa xác nhận người chơi: đánh không có thưởng; mở nick này, bấm Đăng nhập lại để có captcha mới"
    >
      <Icon name="shield" size={10} />
      Chưa xác nhận
    </span>
  );
}

/** Whether CaptchaPanel shows anything for `account`: a captcha waiting, or one whose time went by in this session. */
export const captchaShown = (account: Account) => !!account.captcha || (account.unverified && isConnected(account.status));

/**
 * Xác nhận người chơi (docs/app/events/02-login.md#captcha) on the page of its account, not over the whole window: the
 * server's picture with the request drawn in it, touched in order (each point numbered), Làm lại, Gửi, the seconds left.
 * The points go out in pixels of the 640 × 400 picture (c2s/1283); the server's verdict closes it or says why not. Its
 * time over unanswered, the card says the battles give nothing and offers Đăng nhập lại for a new captcha. The job waits
 * meanwhile (bot/captcha.rs).
 */
export function CaptchaPanel({ account }: { account: Account }) {
  if (account.captcha) return <CaptchaTask key={account.captcha.id} account={account as Waiting} />;
  if (!captchaShown(account)) return null;
  return (
    <Card
      title="Chưa xác nhận người chơi"
      icon="shield"
      tone="var(--danger)"
      className="[--frame:var(--danger)]"
      aside={
        <Button kind="primary" small icon="refresh" onClick={() => relogin(account.id)}>
          Đăng nhập lại
        </Button>
      }
    >
      <p className="m-0 text-12 text-fg-2">
        Captcha đã hết giờ mà chưa giải: trận đánh của nick này <b className="text-fg">không có thưởng</b>. Bấm Đăng nhập lại để server gửi captcha mới.
      </p>
    </Card>
  );
}

function CaptchaTask({ account }: { account: Waiting }) {
  const c = account.captcha;
  const [url, setUrl] = useState<string>();
  const [points, setPoints] = useState<[number, number][]>([]);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    let gone = false;
    void api.captchaImage(account.id, c.id).then((bytes) => {
      if (!gone && bytes) setUrl(pngDataUrl(bytes));
    });
    return () => {
      gone = true;
    };
  }, [account.id, c.id]);
  // A refusal (even with the same text as the last) lets the user touch again, from no point.
  useEffect(() => {
    setSent(false);
    setPoints([]);
  }, [c.refused]);
  const left = useSecondsLeft(c.expiresAt);
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
    <Card
      title="Xác nhận người chơi"
      icon="shield"
      tone="var(--s-connecting)"
      className="[--frame:var(--s-connecting)]"
      subtitle="Server đòi xác nhận: chạm vào ảnh theo đúng yêu cầu trong ảnh, rồi bấm Gửi. Chưa xác nhận thì đánh không có thưởng."
      aside={
        <span className={cn("text-12 font-bold whitespace-nowrap", left > 10 ? "text-fg" : "text-danger")} role="timer" aria-live="off">
          {left > 0 ? `${left}s` : "Hết giờ"}
        </span>
      }
    >
      <div className="grid grid-cols-[minmax(0,560px)] justify-center gap-2">
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
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="m-0 flex-1 min-w-[160px] text-12 text-fg-2" role="status" aria-live="polite">
            {c.tries} lần thử · đã chạm <b className="text-fg">{points.length}</b>/{MAX_POINTS}
          </p>
          <Button kind="tonal" small icon="refresh" disabled={!points.length || sent} onClick={() => setPoints([])}>
            Làm lại
          </Button>
          <Button kind="primary" small icon="check" disabled={!points.length || sent || left === 0} onClick={() => void send()}>
            {sent ? "Đang gửi…" : "Gửi"}
          </Button>
        </div>
        {c.error && <p className="m-0 text-11 text-danger">{c.error}</p>}
      </div>
    </Card>
  );
}
