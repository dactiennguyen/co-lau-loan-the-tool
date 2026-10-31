import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { Icon } from "../components/Icon";
import { Stepper } from "../components/Stepper";
import { num } from "../format";
import { itemIcon } from "../itemIcons";
import { selectedLog, useStore } from "../store";
import type { Account, Character, ShopLine } from "../types";
import "./ShopDialog.css";

/** Lái Buôn stands in Làng Thanh Khê; the server opens his shop only on that map (B1). */
const SELLER_MAP = "M1";
const MONEY = ["Xu", "Xu khóa"] as const;
/** The lines Bot::buy and the server leave in the log for a purchase. */
const RESULT = /^(Đã mua|Chưa mua|Lái Buôn không trả lời)/;
/** "Mua xong quay về chỗ cũ" is on until turned off, then kept off on this machine. */
const BACK = "shop.back";
function backKept() {
  try {
    return localStorage.getItem(BACK) !== "0";
  } catch {
    return true;
  }
}
function keepBack(on: boolean) {
  try {
    localStorage.setItem(BACK, on ? "1" : "0");
  } catch {
    // Not kept: the box is on again next time.
  }
}

interface Props {
  account: Account;
  /** The item to pick first (Mua búa: 2). */
  item?: number;
  onClose: () => void;
}

/** Why the shop cannot be used now; Bot::open_shop and Bot::buy refuse the same. */
function busy(c: Character) {
  if (c.battle) return "Đang đánh: đợi hết trận rồi mới mua.";
  if (c.job && !c.job.done) return "Đang tự đánh quái: bấm Dừng trước.";
  if (c.questRun && !c.questRun.done) return "Đang tự làm nhiệm vụ: bấm Dừng trước.";
  if (c.moving) return `${c.moving}…`;
  return null;
}

/**
 * Cửa hàng of Lái Buôn (Dược phẩm, 12-skills-items.md#c2s-1190). Away from Làng Thanh Khê it offers the trip there; on
 * M1 it opens the shop each time (c2s/13, c2s/57), lists its lines with their price and money, and buys the line picked
 * (c2s/1190) in the count chosen. The money it has comes from s2c/46; the result is the bot's line in the log.
 */
export function ShopDialog({ account, item, onClose }: Props) {
  const c = account.character;
  const shop = c?.shop ?? null;
  const here = c?.mapId === SELLER_MAP;
  const why = c ? busy(c) : "Nick chưa vào game.";
  const money = c?.currencies ? [c.currencies.xu, c.currencies.xuKhoa] : null;
  const have = (l: ShopLine) => money?.[l.currency] ?? null;

  // Opened again each time the dialog opens on M1, or when the trip there ends: both purchases of B1 came right after
  // the shop opened, and a list kept from earlier may be stale. The kept list shows in the meantime.
  const asked = useRef(false);
  useEffect(() => {
    if (here && !why && !asked.current) {
      asked.current = true;
      api.openShop(account.id);
    }
  }, [account.id, here, why]);

  // "Mua xong quay về chỗ cũ": the trip keeps where it started (Bot::go_to_shop); closing the dialog, however it closes,
  // sends the bot back there (Bot::shop_closed).
  const [back, setBack] = useState(backKept);
  const close = () => {
    api.shopClosed(account.id);
    onClose();
  };

  const [picked, setPicked] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  // The item asked for, in Xu khóa when it pays (Xu trades at the Chợ trời, Xu khóa does not), else in Xu.
  const affordable = (l: ShopLine) => (have(l) ?? 0) >= l.price;
  const wanted = shop?.items.filter((l) => l.itemId === item) ?? [];
  const first =
    wanted.find((l) => l.currency === 1 && affordable(l)) ?? wanted.find(affordable) ?? wanted[0] ?? shop?.items[0];
  const line = shop?.items.find((l) => l.shopId === picked) ?? first;
  const cost = line ? line.price * quantity : 0;
  const wallet = line ? have(line) : null;
  const short = line != null && wallet != null && cost > wallet;
  // The line picked first may sit below the fold of the list.
  const list = useRef<HTMLDivElement>(null);
  const opened = !!shop;
  useEffect(() => {
    if (opened) list.current?.querySelector(".shop__line--on")?.scrollIntoView({ block: "nearest" });
  }, [opened]);
  const owned = (id: number) => c?.bag?.items.filter((i) => i.id === id).reduce((n, i) => n + i.quantity, 0) ?? 0;

  // The answer to Mua: the first line of the log about it after the click.
  const log = useStore(selectedLog);
  const [mark, setMark] = useState<number | null>(null);
  const result = mark == null ? undefined : log.find((l) => l.seq > mark && RESULT.test(l.text));
  const waiting = mark != null && !result;
  const buy = () => {
    if (!line) return;
    setMark(log.length ? log[log.length - 1].seq : 0);
    api.buy(account.id, line.shopId, quantity);
  };

  return (
    <Dialog
      title="Cửa hàng Lái Buôn"
      subtitle={`${account.label} · Dược phẩm, Làng Thanh Khê (M1)`}
      className="shop"
      onClose={close}
      onSubmit={(e) => {
        e.preventDefault();
        buy();
      }}
    >
      {money && (
        <p className="shop__money">
          Đang có <b className="px">{num(money[0])}</b> Xu · <b className="px">{num(money[1])}</b> Xu khóa
        </p>
      )}
      {why && <p className="dialog__note">{why}</p>}
      {c && !here && !c.moving && (
        <div className="shop__away">
          <p>
            Lái Buôn đứng ở Làng Thanh Khê, server chỉ mở cửa hàng khi nhân vật ở map đó. {account.label} đang ở {c.mapName}:
            bấm <b>Đi tới Làng Thanh Khê</b>, tới nơi thì danh sách món hiện ra.
          </p>
          <label className="shop__back">
            <input
              type="checkbox"
              checked={back}
              onChange={(e) => {
                setBack(e.target.checked);
                keepBack(e.target.checked);
              }}
            />
            <span className="shop__back-box" aria-hidden="true">
              <Icon name="check" size={11} />
            </span>
            Mua xong quay về chỗ cũ ({c.mapName} khu {c.zone})
          </label>
        </div>
      )}
      {c && here && !shop && (
        <div className="shop__away">
          <p>{why ? "Cửa hàng mở được khi nick rảnh." : "Đang mở cửa hàng…"}</p>
          <Button kind="ghost" small icon="refresh" disabled={!!why} onClick={() => api.openShop(account.id)}>
            Mở lại
          </Button>
        </div>
      )}
      {shop && (
        <>
          <div ref={list} className="shop__list scroll" role="radiogroup" aria-label="Món bán">
            {shop.items.map((l) => {
              const on = l.shopId === line?.shopId;
              const icon = itemIcon(l.icon);
              return (
                <button
                  key={l.shopId}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  className={on ? "shop__line shop__line--on" : "shop__line"}
                  onClick={() => setPicked(l.shopId)}
                >
                  <span className="shop__icon">{icon && <img src={icon} alt="" />}</span>
                  <span className="shop__name">
                    <b>{l.name}</b>
                    <small>{l.desc || `Trong túi: ${owned(l.itemId)}`}</small>
                  </span>
                  <span className={l.currency ? "shop__price shop__price--locked" : "shop__price"}>
                    <b className="px">{num(l.price)}</b> {MONEY[l.currency]}
                  </span>
                </button>
              );
            })}
          </div>
          {line && (
            <div className="shop__buy">
              <span className="shop__what">
                {line.name} · trong túi {owned(line.itemId)}
              </span>
              <Stepper value={quantity} onChange={setQuantity} min={1} label="số lượng" />
              <span className={short ? "shop__cost shop__cost--short" : "shop__cost"}>
                = <b className="px">{num(cost)}</b> {MONEY[line.currency]}
                {short && ` · thiếu ${num(cost - (wallet ?? 0))}`}
              </span>
            </div>
          )}
        </>
      )}
      {result && (
        <p className={result.text.startsWith("Đã mua") ? "shop__result shop__result--ok" : "shop__result"} role="status">
          {result.text}
        </p>
      )}
      {c?.backTo && (
        <p className="shop__back-note" role="status">
          Mua xong bấm Quay lại để {account.label} về {c.backTo}; đóng hộp bằng ✕ hay Esc cũng về.
        </p>
      )}
      <footer>
        {/* After a trip with "Mua xong quay về chỗ cũ", closing walks back (Bot::shop_closed): the button says so. */}
        <Button kind="ghost" icon={c?.backTo ? "swap" : undefined} onClick={close}>
          {c?.backTo ? `Quay lại ${c.backTo}` : "Đóng"}
        </Button>
        {/* Two steps away from M1: this button walks there first, then the list shows and it buys. */}
        {c && !here ? (
          <Button kind="primary" icon="swap" disabled={!!why} onClick={() => api.shopTrip(account.id, back)}>
            {c.moving ? "Đang đi…" : "Đi tới Làng Thanh Khê"}
          </Button>
        ) : (
          <Button kind="primary" type="submit" icon="cart" disabled={!line || short || !!why || waiting}>
            {waiting ? "Đang mua…" : "Mua"}
          </Button>
        )}
      </footer>
    </Dialog>
  );
}
