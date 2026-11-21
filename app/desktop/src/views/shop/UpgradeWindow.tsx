import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/api";
import { cn } from "@/utils/cn";
import { Button } from "@/components/Button";
import { Hint } from "@/components/Hint";
import { Icon } from "@/components/Icon";
import { num } from "@/utils/format";
import { itemIcon } from "@/game/itemIcons";
import { CHARMS, charmUseful, failLevel, stoneIcon, stoneLevel } from "@/game/shops";
import type { Item, SmithRun } from "@/api/types";
import { SHOP, type ShopContext } from "./ShopModal";

/** Stones the window of Nâng cấp holds (s2c/96 says 18), a Bùa bảo vệ taking one of them. */
const SLOTS = 18;
/** How long after the last stone added or taken out the odds are asked again (Hỏi giá presses nothing). */
const QUOTE_DELAY = 700;
/** How long Hỏi giá waits for the bot to start before it is taken as refused. */
const QUIET = 4000;

/** A square of the window, as the bag's: a dark well with the icon. */
const CELL =
  "relative grid place-items-center size-11 p-0 border-2 border-line bg-ink text-fg-3 " +
  "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1";
/** A figure in a corner of a square. */
const CORNER = "absolute px px-0.5 bg-[rgb(15_17_21/0.75)] text-10 leading-[1.3]";

interface Props extends Pick<ShopContext, "account" | "why" | "ask" | "track"> {
  item: Item;
  /** `item.slot` is a gear slot: the bot takes it off, upgrades it and wears it again. */
  worn: boolean;
  /** Why it cannot run although the NPC is free (the bag too full to take the worn item off). */
  wornWhy: string | null;
  careful: boolean;
  charm: boolean;
  cap: number;
}

/**
 * Nâng cấp as the game's window (16-upgrade.md#trên-máy): the item, an arrow, the item one level up (s2c/1258); the 18
 * stone slots; the fee, Lượng and odds Pháp sư says; Bắt đầu. Under it the stones of Hành trang: a click puts one in, a
 * click on a slot of the window takes it out. Each change asks the odds again (Hỏi giá: the bot opens the window and puts
 * exactly these stones in, presses nothing), and the odds after each stone show which ones raised nothing: the server
 * takes every stone put in, so those are lost. Bắt đầu tries one level with exactly these stones (SmithTask::Upgrade
 * `stones`), after the confirm box.
 */
export function UpgradeWindow({ account, why, ask, track, item, worn, wornWhy, careful, charm, cap }: Props) {
  const c = account.character!;
  const run: SmithRun | null = c.smith;
  const bagItems = c.bag?.items ?? [];
  // The bag's stones, cheapest first, the locked ones before the others of a level.
  const stones = bagItems
    .filter((i) => stoneLevel(i.id))
    .sort((a, b) => stoneLevel(a.id) - stoneLevel(b.id) || Number(b.locked) - Number(a.locked) || a.slot - b.slot);
  const [picks, setPicks] = useState<number[]>([]);
  const held = (slot: number) => {
    const s = stones.find((i) => i.slot === slot);
    return s ? Math.max(1, s.quantity) : 0;
  };
  const used = (slot: number, upTo = picks.length) => picks.slice(0, upTo).filter((s) => s === slot).length;
  // Stones gone from the bag (a press, a merge) leave the window, as in the game.
  const bagKey = stones.map((s) => `${s.slot}:${s.id}:${s.quantity}`).join(",");
  useEffect(() => {
    setPicks((p) => {
      const kept = p.filter((s, n) => p.slice(0, n + 1).filter((x) => x === s).length <= held(s));
      return kept.length === p.length ? p : kept;
    });
  }, [bagKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const protect = charmUseful(item.plus);
  const charmHeld = protect ? CHARMS.find((ch) => ch.upTo > item.plus && bagItems.some((i) => i.id === ch.id)) : undefined;
  const withCharm = charm && !!charmHeld;
  const room = SLOTS - Number(withCharm);
  const full = picks.length >= room;
  // Checked on the picks as they are now, so quick clicks never put in more stones than the slot holds.
  const add = (slot: number) => setPicks((p) => (p.length < room && p.filter((s) => s === slot).length < held(slot) ? [...p, slot] : p));
  const removeAt = (n: number) => setPicks((p) => p.filter((_, k) => k !== n));

  // What was asked last: the window as it was then, and the run it came before. The answer counts only for that window.
  const key = `${item.uuid}|${item.plus}|${careful}|${withCharm}|${picks.join(",")}`;
  // `silent`: no run came for it (the bot refused, the reason in the modal's line), so it stops waiting.
  const [asked, setAsked] = useState<{ key: string; after: number; silent?: boolean } | null>(null);
  const lastRun = useRef(run?.id ?? 0);
  lastRun.current = run?.id ?? 0;
  const quote = (() => {
    if (!asked || asked.key !== key || !run || run.id <= asked.after || run.kind !== "quote") return null;
    return run;
  })();
  const asking = !!asked && asked.key === key && !asked.silent && (!run || run.id <= asked.after || run.done == null);
  useEffect(() => {
    if (!asked || asked.silent || (run && run.id > asked.after)) return;
    const t = window.setTimeout(() => setAsked((a) => (a === asked ? { ...a, silent: true } : a)), QUIET);
    return () => window.clearTimeout(t);
  }, [asked, run?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const blocked = why ?? wornWhy ?? (item.plus >= cap ? `${item.name} đã tới trần +${cap}.` : null);
  // Dùng Bùa bảo vệ on, a level a failure drops, no charm for it: the bot refuses the press (Hỏi giá still goes).
  const noCharm = protect && charm && !charmHeld;
  const startWhy =
    blocked ??
    (noCharm ? `Túi không có Bùa bảo vệ cho lần nâng +${item.plus}: mua bùa, hoặc bỏ chọn Dùng Bùa bảo vệ để nâng không bùa.` : null);
  const askQuote = () => {
    if (blocked || !picks.length) return;
    setAsked({ key, after: lastRun.current });
    track();
    api.smithUpgrade(account.id, item.slot, careful, 1, item.plus + 1, false, true, worn, charm, picks);
  };
  // Every change asks again once the stones rest a moment, the NPC free.
  useEffect(() => {
    if (blocked || !picks.length || asked?.key === key) return;
    const t = window.setTimeout(askQuote, QUOTE_DELAY);
    return () => window.clearTimeout(t);
  }, [key, blocked]); // eslint-disable-line react-hooks/exhaustive-deps

  // A press done: its stones are gone, the window starts empty again.
  const pressed = useRef<number | null>(null);
  useEffect(() => {
    if (pressed.current != null && run && run.id > pressed.current && run.done != null) {
      pressed.current = null;
      setPicks([]);
      setAsked(null);
    }
  }, [run?.id, run?.done]); // eslint-disable-line react-hooks/exhaustive-deps

  // The odds after each stone (charm apart), and the stones that raised nothing.
  const rates = quote?.rates.length === picks.length ? quote.rates : null;
  const wasted = (n: number) => !!rates && n > 0 && rates[n - 1] > 0 && rates[n] <= rates[n - 1];
  const waste = rates ? picks.filter((_, n) => wasted(n)).length : 0;
  const rate = quote?.quote?.rate ?? null;
  const fee = quote?.quote?.fee;
  const luong = quote?.quote?.luong ?? 0;
  const preview = quote?.preview && quote.preview.plus === item.plus + 1 ? quote.preview : null;
  const pickedNames = Object.entries(
    picks.reduce<Record<string, number>>((m, s) => {
      const st = stones.find((i) => i.slot === s);
      const name = st ? `Đá cấp ${stoneLevel(st.id)}${st.locked ? "" : " (chưa khoá)"}` : `ô ${s + 1}`;
      m[name] = (m[name] ?? 0) + 1;
      return m;
    }, {}),
  )
    .map(([name, n]) => `${n} ${name}`)
    .join(", ");
  const icon = itemIcon(item.icon);
  const hint = useId();

  return (
    <div className="grid gap-2.5">
      <div
        className="grid gap-3 p-2.5 bg-bg-2 border-2 border-line @min-[620px]:grid-cols-[auto_minmax(0,1fr)]"
        role="group"
        aria-label={`Nâng cấp ${careful ? "[cẩn thận]" : "[thường]"}`}
      >
        <div className="grid gap-2.5 justify-items-start">
          {/* The item, an arrow, the item one level up. */}
          <div className="flex items-center gap-2">
            <span className={cn(CELL, "size-[52px] border-primary")} title={`${item.name} +${item.plus}`}>
              {icon && <img src={icon} alt="" className="size-[44px]" draggable={false} />}
              {item.plus > 0 && <b className={cn(CORNER, "top-0 right-px text-primary")}>+{item.plus}</b>}
            </span>
            <Icon name="chevron" size={16} className="-rotate-90 text-fg-3" />
            <span className={cn(CELL, "size-[52px]", preview && "border-good-shade")} title={`${item.name} +${item.plus + 1}`}>
              {icon && (
                <img src={icon} alt="" className={cn("size-[44px]", !preview && "opacity-35 [filter:grayscale(1)]")} draggable={false} />
              )}
              <b className={cn(CORNER, "top-0 right-px", preview ? "text-good" : "text-fg-3")}>+{item.plus + 1}</b>
            </span>
            <span className="grid gap-0.5 min-w-0 text-11 text-fg-3">
              <b className="text-12 text-fg">
                {item.name} +{item.plus} → +{item.plus + 1}
              </b>
              {preview ? (
                <span className="text-good">{preview.stats.join(", ")}</span>
              ) : (
                <span>Chỉ số ở +{item.plus + 1} hiện khi Pháp sư báo giá.</span>
              )}
            </span>
          </div>
          {/* The 18 slots: the stones in the order they go in, the charm last, the empty ones. */}
          <div className="grid grid-cols-[repeat(6,44px)] gap-1" role="list" aria-label={`Đá đã đặt: ${picks.length}/${room}`}>
            {Array.from({ length: SLOTS }, (_, n) => {
              if (withCharm && n === SLOTS - 1) {
                const ch = bagItems.find((i) => i.id === charmHeld!.id);
                const url = ch ? itemIcon(ch.icon) : undefined;
                return (
                  <span
                    key="charm"
                    role="listitem"
                    className={cn(CELL, "border-good-shade")}
                    title={`Bùa bảo vệ ${charmHeld!.name}: bot tự đặt`}
                  >
                    {url ? <img src={url} alt={`Bùa bảo vệ ${charmHeld!.name}`} className="size-9" /> : <Icon name="shield" size={16} />}
                  </span>
                );
              }
              const s = picks[n];
              if (s == null)
                return <span key={`e${n}`} role="listitem" className={cn(CELL, "opacity-60")} aria-label={`Ô đá ${n + 1}: trống`} />;
              const st = stones.find((i) => i.slot === s);
              const level = st ? stoneLevel(st.id) : 0;
              const lost = wasted(n);
              return (
                <button
                  key={`p${n}`}
                  type="button"
                  role="listitem"
                  className={cn(
                    CELL,
                    "cursor-pointer hover:border-line-strong hover:bg-bg-2",
                    lost && "border-danger shadow-[0_0_0_1px_var(--danger)]",
                  )}
                  aria-label={`Ô đá ${n + 1}: Đá cấp ${level}${rates ? `, tỉ lệ ${rates[n]}%` : ""}${lost ? ", không tăng tỉ lệ (sẽ mất phí đá)" : ""}. Bấm để bỏ ra`}
                  title={lost ? "Viên này không làm tỉ lệ tăng: đặt vào vẫn mất. Bấm để bỏ ra." : "Bấm để bỏ ra"}
                  onClick={() => removeAt(n)}
                >
                  <img src={stoneIcon(level)} alt="" className="size-9" draggable={false} />
                  {st && !st.locked && <Icon name="coin" size={9} className="absolute top-0.5 left-0.5 text-coin" />}
                  {rates && <b className={cn(CORNER, "bottom-0 right-px", lost ? "text-danger" : "text-fg")}>{rates[n]}%</b>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Pháp sư's answer and Bắt đầu, as the panel on the right of the game's window. */}
        <div className="grid [align-content:start] gap-2 min-w-0">
          <div className="grid gap-1 px-2.5 py-2 bg-ink border-l-3 border-l-primary text-12 text-fg-2" aria-live="polite">
            {!picks.length ? (
              <span>Cần chọn đá{protect ? " (có thể thêm bùa bảo vệ)" : ""}: bấm đá ở Hành trang bên dưới.</span>
            ) : asking && !quote ? (
              <span className="inline-flex items-center gap-1.5">
                <Icon name="refresh" size={12} className="animate-spin" /> Đang hỏi Pháp sư tỉ lệ…
              </span>
            ) : quote ? (
              <>
                <span>
                  Cần: <b className="text-coin">{fee ? `${num(fee.amount)} ${fee.money === "xu" ? "Xu" : "Xu khóa"}` : "0 Xu khóa"}</b>
                </span>
                <span>
                  Cần: <b className={luong > 0 ? "text-coin" : "text-fg"}>{luong} Lượng</b>
                </span>
                <span className="text-13">
                  Tỉ lệ thành công:{" "}
                  <b
                    className={cn(
                      "text-16 px",
                      rate != null && rate >= 75 ? "text-good" : rate != null && rate >= 40 ? "text-coin" : "text-danger",
                    )}
                  >
                    {rate ?? "?"}%
                  </b>
                </span>
                {quote.done && !quote.done.startsWith("Nâng") && rate == null && <span className="text-danger">{quote.done}</span>}
              </>
            ) : (
              <span>
                {blocked ??
                  (asked?.key === key && asked.silent
                    ? "Bot chưa hỏi được giá (xem dòng báo ở trên); bấm Hỏi lại tỉ lệ."
                    : "Đá đã đổi: đợi một chút để hỏi lại tỉ lệ.")}
              </span>
            )}
          </div>
          {waste > 0 && (
            <p className={SHOP.why}>{waste} viên không làm tỉ lệ tăng (viền đỏ): server lấy hết đá đã đặt, bỏ chúng ra cho khỏi mất.</p>
          )}
          {protect && !charm && (
            <p className={cn(SHOP.note, "text-danger")}>
              Không dùng bùa: thất bại sẽ tụt từ +{item.plus} về +{failLevel(item.plus)}.
            </p>
          )}
          {withCharm && (
            <p className={SHOP.note}>Bot tự đặt 1 Bùa bảo vệ {charmHeld!.name} vào ô cuối: thất bại giữ cấp, bùa mất cả khi thành công.</p>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <Button kind="outline" small icon="eye" disabled={!!blocked || !picks.length || (asking && !quote)} onClick={askQuote}>
              Hỏi lại tỉ lệ
            </Button>
            <Button kind="ghost" small icon="trash" disabled={!picks.length} onClick={() => setPicks([])}>
              Bỏ hết đá
            </Button>
            <Button
              kind="primary"
              icon="hammer"
              disabled={!!startWhy || !picks.length}
              title={startWhy ?? undefined}
              onClick={() =>
                ask({
                  title: `Nâng cấp ${item.name}`,
                  message: `Nâng ${item.name} từ +${item.plus} lên +${item.plus + 1}${careful ? " ở chế độ Cẩn thận (thêm 5 Lượng)" : ""} với ${pickedNames}${withCharm ? ` và 1 Bùa bảo vệ ${charmHeld!.name}` : ""}. ${
                    rate != null ? `Pháp sư báo tỉ lệ ${rate}%` : "Chưa có tỉ lệ Pháp sư báo"
                  }${fee ? `, phí ${num(fee.amount)} ${fee.money === "xu" ? "Xu" : "Xu khóa"}` : ""}. Đá đặt vào đều mất, thành công hay thất bại; thành công thì món bị khoá giao dịch.${
                    protect && !withCharm
                      ? ` Thất bại sẽ tụt về +${failLevel(item.plus)}.`
                      : item.plus < 4
                        ? " Dưới +4 thất bại không tụt cấp."
                        : ""
                  }${waste ? ` ${waste} viên không làm tỉ lệ tăng vẫn mất.` : ""}${worn ? " Món đang mặc: bot cởi ra túi, nâng, rồi mặc lại." : ""}`,
                  confirm: "Bắt đầu",
                  icon: "hammer",
                  run: () => {
                    pressed.current = lastRun.current;
                    return api.smithUpgrade(account.id, item.slot, careful, 1, item.plus + 1, false, false, worn, charm, picks);
                  },
                })
              }
            >
              Bắt đầu
            </Button>
            <Hint label="Tự chọn đá hoạt động thế nào?" id={`${hint}-how`}>
              Như cửa sổ Nâng cấp trong game: bấm đá ở Hành trang để đặt vào (mỗi lần 1 viên), bấm ô đá để bỏ ra. Mỗi lần đổi đá, app nhờ
              bot hỏi Pháp sư phí và tỉ lệ (mở cửa sổ, đặt đúng các viên này, không bấm nên không tốn gì). Số nhỏ dưới mỗi viên là tỉ lệ sau
              khi đặt viên đó; viên viền đỏ không làm tỉ lệ tăng mà vẫn bị lấy. Bắt đầu nâng đúng 1 cấp với đúng các viên đã chọn.
            </Hint>
          </div>
          {startWhy && picks.length > 0 && !asking && <p className={SHOP.why}>{startWhy}</p>}
        </div>
      </div>

      {/* Hành trang: the stones of the bag, a click puts one in. */}
      <div className="grid gap-1.5">
        <div className={SHOP.lead}>
          <b className={SHOP.leadTitle}>Hành trang: đá nâng cấp</b>
          <span className="text-11 text-fg-3">
            · bấm để đặt 1 viên · {picks.length}/{room} ô
          </span>
        </div>
        {stones.length === 0 ? (
          <p className={SHOP.note}>Túi không có đá nâng cấp nào.</p>
        ) : (
          <div className="flex flex-wrap gap-1" role="list" aria-label="Đá trong túi">
            {stones.map((s) => {
              const level = stoneLevel(s.id);
              const left = held(s.slot) - used(s.slot);
              return (
                <button
                  key={s.slot}
                  type="button"
                  role="listitem"
                  className={cn(
                    CELL,
                    "cursor-pointer hover:border-line-strong hover:bg-bg-2 disabled:cursor-not-allowed disabled:opacity-35",
                  )}
                  disabled={left <= 0 || full}
                  aria-label={`Đá cấp ${level}${s.locked ? "" : " chưa khoá"}, còn ${left} viên${full ? ", cửa sổ đã đầy" : ""}`}
                  title={`Đá cấp ${level}${s.locked ? " (khoá)" : " (chưa khoá, bán được)"}: còn ${left}`}
                  onClick={() => add(s.slot)}
                >
                  <img src={stoneIcon(level)} alt="" className="size-9" draggable={false} />
                  {!s.locked && <Icon name="coin" size={9} className="absolute top-0.5 left-0.5 text-coin" />}
                  <b className={cn(CORNER, "bottom-0 right-px text-fg")}>{left}</b>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
