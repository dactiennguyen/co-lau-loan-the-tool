import { useEffect, useId, useState } from "react";
import { api } from "@/api";
import type { GiftCode, GiftLimits, GiftRun } from "@/api/types";
import { Button } from "@/components/Button";
import { FIELD } from "@/components/TextField";
import { Hint } from "@/components/Hint";
import { Icon } from "@/components/Icon";
import { cn } from "@/utils/cn";
import { SHOP, type ShopContext } from "./ShopModal";

/** The longest code the game's box takes (mail::CODE_MAX of the Rust core, which refuses longer ones too), and the
 * codes refused in a row at which the server blocks every code for 5 minutes (mail::WRONG_IN_A_ROW, G1). */
const CODE_MAX = 32;
const SERVER_LOCK_AT = 10;

/** The codes of the box as they go out: split on commas, spaces and lines, upper case, each once. */
export function parseCodes(text: string): string[] {
  return [...new Set(text.split(/[\s,;]+/).map((c) => c.trim().toUpperCase()).filter(Boolean))];
}

const time = (at: number) => new Date(at).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

/** Date.now() at each render, and one more render once `until` is past, so a lock that ends shows as ended without
 * anything else changing. */
function useNow(until: number | null) {
  const [, tick] = useState(0);
  useEffect(() => {
    const left = until == null ? 0 : until - Date.now();
    if (left <= 0) return;
    const t = window.setTimeout(() => tick((n) => n + 1), left + 50);
    return () => window.clearTimeout(t);
  }, [until]);
  return Date.now();
}

/**
 * Mã quà tặng (14-npc.md#mã-quà-tặng): the box of Hương Lão's Phúc lợi window, for several codes at once. Codes go out
 * from wherever the character stands (G1), one by one; each gets the server's words, a good one its mail. Rewards go to
 * the mailbox, which the app does not open yet.
 */
export function ShopGift({ account, busy, ask, track }: ShopContext) {
  const c = account.character!;
  const run = c.gift;
  const limits = c.giftLimits;
  const [text, setText] = useState("");
  // The run the box was sent over: once a newer one starts, the codes are in its list and the box is cleared.
  const [sentOver, setSentOver] = useState<number | null>(null);
  useEffect(() => {
    if (sentOver != null && run && run.id > sentOver) {
      setText("");
      setSentOver(null);
    }
  }, [run, sentOver]);
  const now = useNow(limits.lockedUntil);
  const hint = useId();
  const codes = parseCodes(text);
  const long = codes.filter((x) => [...x].length > CODE_MAX);
  const locked = limits.lockedUntil != null && limits.lockedUntil > now;
  const capped = limits.wrong >= limits.maxWrong;
  const running = !!run && run.done == null;
  const why = running
    ? null
    : (busy ??
      (locked
        ? `Server đang chặn nhập mã tới ${time(limits.lockedUntil!)}.`
        : capped
          ? `Đã có ${limits.wrong} mã bị từ chối liền nhau: app dừng ở ${limits.maxWrong} để không chạm mức chặn ${SERVER_LOCK_AT} lần của server.`
          : long.length
            ? `Mã dài hơn ${CODE_MAX} ký tự: ${long.join(", ")}.`
            : null));
  const send = () => {
    if (why || running || !codes.length) return;
    track();
    setSentOver(run?.id ?? 0);
    void api.redeemCodes(account.id, codes);
  };
  const reset = () =>
    ask({
      title: "Đếm lại từ 0",
      message: (
        <>
          App quên {limits.wrong} mã bị từ chối liền nhau và cho nhập tiếp. Server không báo nó đã đếm bao nhiêu: nếu tính cả
          các mã này, sai thêm {SERVER_LOCK_AT - limits.wrong} mã liền nữa là bị chặn mọi mã 5 phút. Chỉ nên đếm lại khi vừa nhập đúng một
          mã trên điện thoại, hoặc đã đợi lâu.
        </>
      ),
      confirm: "Đếm lại",
      icon: "refresh",
      run: () => api.resetGiftCount(account.id),
    });

  return (
    <div className={SHOP.tab}>
      <p className={SHOP.note}>
        Hương Lão Trần Bá → Mã quà tặng. Mã gửi được từ bất kỳ đâu, không cần về Làng Thanh Khê. Phần thưởng vào{" "}
        <b className="text-fg">Hòm thư</b>: app chưa mở Hòm thư, nên nhận quà trong game.
      </p>
      <div className="grid gap-[5px]">
        <div className={SHOP.lead}>
          <label htmlFor={`${hint}-box`} className={FIELD.label}>
            Mã quà tặng
          </label>
          <Hint label="Nhập sai thì sao?" id={`${hint}-lock`}>
            Server không báo còn mấy lần sai. Sai {SERVER_LOCK_AT} mã liền thì server chặn mọi mã trong 5 phút, kể cả mã đúng ("Bạn nhập
            mã quá nhanh"). App dừng sau {limits.maxWrong} mã bị từ chối liền nhau và nhớ số này cả khi đăng nhập lại; mã nhập
            trên điện thoại không được đếm. Mã đã dùng ("Nhân vật này đã dùng mã rồi") cũng tính là bị từ chối. Mỗi mã chỉ
            dùng được một lần cho mỗi nhân vật.
          </Hint>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <input
            id={`${hint}-box`}
            // The codes in the pixel font, upper case as they go out; the placeholder in the text font.
            className={cn(FIELD.input, "flex-[1_1_260px] min-w-0", text && "px uppercase tracking-[0.04em]")}
            spellCheck={false}
            autoComplete="off"
            placeholder="Nhập mã tại đây, nhiều mã thì cách nhau bằng dấu phẩy"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                send();
              }
            }}
            aria-describedby={`${hint}-will`}
          />
          <Button kind="primary" icon="gift" disabled={!!why || running || !codes.length} onClick={send}>
            {running ? "Đang nhập…" : codes.length > 1 ? `Nhập ${codes.length} mã` : "Nhập quà"}
          </Button>
        </div>
        <small id={`${hint}-will`} className={FIELD.hint}>
          {codes.length
            ? `Sẽ gửi: ${codes.join(" · ")}. Chữ thường thành chữ hoa, mã trùng chỉ gửi một lần, như game.`
            : "Chữ thường được đổi thành chữ hoa và bỏ dấu cách hai đầu, như game."}
        </small>
      </div>
      {why && (
        <div className="flex flex-wrap items-center gap-2.5">
          <p className={SHOP.why}>{why}</p>
          {capped && !locked && !busy && (
            <Button small icon="refresh" onClick={reset}>
              Đếm lại từ 0
            </Button>
          )}
        </div>
      )}
      {run && <GiftStatus run={run} limits={limits} locked={locked} onStop={() => api.stop(account.id)} />}
    </div>
  );
}

/** The run under way or last done: what it does, each code with the server's words and its mail, Dừng while it runs. */
function GiftStatus({ run, limits, locked, onStop }: { run: GiftRun; limits: GiftLimits; locked: boolean; onStop: () => void }) {
  const running = run.done == null;
  const ok = run.codes.filter((x) => x.ok === true).length;
  const refused = run.codes.filter((x) => x.ok === false).length;
  return (
    // A lit frame while it runs, as the work of Pháp sư.
    <div className={cn("grid gap-1.5 px-2.5 py-2 bg-card-2 border-2 border-line", running && "border-primary")} role="status">
      <div className="flex items-center gap-1.5 text-[12.5px] text-fg">
        <Icon
          name={running ? "refresh" : "gift"}
          size={13}
          className={running ? "text-primary animate-spin motion-reduce:animate-none" : undefined}
        />
        <b className="flex-1 min-w-0 truncate">
          {run.codes.length} mã quà tặng
          {!running && (
            <span className="font-normal text-fg-2">
              {" "}
              · <span className="text-s-online">{ok} được</span>
              {refused > 0 && <span className="text-danger"> · {refused} bị từ chối</span>}
            </span>
          )}
        </b>
        {running && (
          <Button kind="danger" small icon="stop" onClick={onStop}>
            Dừng
          </Button>
        )}
      </div>
      <p className="text-12 text-fg-2">{running ? run.doing || "…" : run.done}</p>
      <ul className="grid gap-1 m-0 p-0 list-none" aria-label="Kết quả từng mã">
        {run.codes.map((x, i) => (
          <CodeRow key={x.code} code={x} waiting={run.sending === i} />
        ))}
      </ul>
      <p className="text-11 text-fg-3">
        Bị từ chối liền nhau:{" "}
        <b className={cn("px text-11", limits.wrong ? "text-danger" : "text-fg-2")}>{limits.wrong}</b>/{limits.maxWrong}
        {locked && limits.lockedUntil != null && (
          <span className="text-danger"> · server chặn nhập mã tới {time(limits.lockedUntil)}</span>
        )}
      </p>
    </div>
  );
}

/** One code: a mark (taken, refused, waiting, not sent yet), the code, the server's words and the mail it brought. */
function CodeRow({ code, waiting }: { code: GiftCode; waiting: boolean }) {
  const mark =
    code.ok === true ? (
      <Icon name="check" size={13} className="text-s-online" />
    ) : code.ok === false ? (
      <Icon name="close" size={13} className="text-danger" />
    ) : waiting ? (
      <Icon name="refresh" size={13} className="text-primary animate-spin motion-reduce:animate-none" />
    ) : (
      <Icon name="clock" size={13} className="text-fg-3" />
    );
  const state = code.ok === true ? "được" : code.ok === false ? "bị từ chối" : waiting ? "đang gửi" : "chưa gửi";
  return (
    <li className="grid grid-cols-[16px_minmax(90px,auto)_minmax(0,1fr)] items-center gap-2 px-2 py-1 bg-bg-2 border-2 border-line text-12">
      <span className="grid place-items-center" title={state}>
        {mark}
        <span className="sr-only">{state}</span>
      </span>
      <b className="px text-11 text-fg">{code.code}</b>
      <span className={cn("min-w-0", code.ok === false ? "text-danger" : "text-fg-2")}>
        {code.text || (waiting ? "Đang đợi server…" : "Chưa gửi")}
        {code.mail && <span className="text-coin"> · Thư: {code.mail}</span>}
      </span>
    </li>
  );
}
