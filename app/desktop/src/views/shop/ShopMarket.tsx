import { useEffect, useId, useRef, useState } from "react";
import { QUALITY_TEXT } from "@/game/quality";
import { api } from "@/api";
import type { Item, Listing, Market, MarketPage } from "@/api/types";
import { Button } from "@/components/Button";
import { FilterChip } from "@/components/FilterChip";
import { Hint } from "@/components/Hint";
import { Icon } from "@/components/Icon";
import { FIELD } from "@/components/TextField";
import { itemIcon } from "@/game/itemIcons";
import { cn } from "@/utils/cn";
import { num } from "@/utils/format";
import { recalled, remember } from "@/utils/remember";
import { SHOP, type ShopContext } from "./ShopModal";

type View = "buy" | "sell" | "mine";
const VIEWS: { key: View; label: string }[] = [
  { key: "buy", label: "Mua" },
  { key: "sell", label: "Bán" },
  { key: "mine", label: "Đang bán" },
];
/** The view and the tab last shown, opened again next time. */
const VIEW_KEY = "market.view";
const TAB_KEY = "market.tab";
/** Đang bán in c2s/1192 (market::MARKET_MINE_TAB). */
const MINE = -1;
/** The lowest price known (market::MIN_PRICE) and the cut of a sale in percent (market::CUT_PERCENT). */
const MIN_PRICE = 1000;
const CUT = 5;

/** "còn 18 giờ 17 phút", "còn 9 phút", "đã hết hạn". */
function left(at: number, now: number) {
  const m = Math.floor((at - now) / 60_000);
  if (m <= 0) return "đã hết hạn";
  const h = Math.floor(m / 60);
  return h ? `còn ${h} giờ ${m % 60} phút` : `còn ${m} phút`;
}

/** The colour of the name by quality (game/quality.ts). */
const QUALITY = QUALITY_TEXT;

/** The colour of a result line, by its first words as the log writes them. */
const tone = (line: string) =>
  line.startsWith("Xong") ? "text-s-online" : /^(Chưa|Chợ trời không)|từ chối/.test(line) ? "text-danger" : "text-fg-2";

/** "Thú cưng Slime", "Đá cấp 2 ×99". */
const named = (i: Item) => (i.quantity > 1 ? `${i.name} ×${num(i.quantity)}` : i.name);

/**
 * Chợ trời of Ngọc Nga (14-npc.md#ngọc-nga), as the game's toolbar button opens it: from wherever the character stands
 * (CT1, NP1). Mua: the nine tabs with their pages, a listing picked and bought for Xu. Bán: an item of the bag not locked,
 * listed for a price (the fee at once, the cut when it sells, the money to Hòm thư). Đang bán: the character's own
 * listings, Gia hạn and Thu hồi. Each of those asks once more.
 */
export function ShopMarket({ account, busy, ask }: ShopContext) {
  const c = account.character!;
  const id = account.id;
  const m = c.market;
  const [view, setView] = useState<View>(() => VIEWS.find((v) => v.key === recalled(VIEW_KEY))?.key ?? "buy");
  const pickView = (v: View) => {
    setView(v);
    remember(VIEW_KEY, v);
  };
  const fight = !!c.battle;
  const waiting = m.doing != null;
  // The window once the tab opens, on the tab shown last; after the battle or the task under way if one is on.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || fight || waiting) return;
    asked.current = true;
    void api.marketOpen(id, Number(recalled(TAB_KEY) ?? 0) || 0, 1);
  }, [id, fight, waiting]);
  // Đang bán once it is shown, when not read yet.
  const minedFor = useRef(false);
  useEffect(() => {
    if (view !== "mine" || m.mine || minedFor.current || fight || waiting || !m.tabs) return;
    minedFor.current = true;
    void api.marketPage(id, MINE, 1);
  }, [view, m.mine, m.tabs, fight, waiting, id]);

  const readWhy = fight ? "Đang đánh: đợi hết trận." : waiting ? "Chợ đang đợi server trả lời." : null;
  const why = busy ?? readWhy;
  const go = (tab: number, page: number) => {
    if (tab !== MINE) remember(TAB_KEY, String(tab));
    void api.marketPage(id, tab, page);
  };
  const xu = c.currencies?.xu ?? null;
  const free = c.bag ? c.bag.capacity - c.bag.items.length : null;
  const ctx = { id, m, why, readWhy, ask, xu, free, go };

  return (
    <div className={SHOP.tab}>
      <p className={SHOP.note}>
        Chợ trời của Ngọc Nga, mở như nút Chợ trời của game: ở map nào cũng được. Mua bán bằng Xu. Đăng bán tốn phí{" "}
        {num(m.tabs?.fee ?? 1000)} Xu, bán trong {m.tabs?.hours ?? 24} giờ; bán được thì chợ lấy {CUT}%, tiền về Hòm thư.
      </p>
      <div className={SHOP.chips}>
        {VIEWS.map((v) => (
          <FilterChip key={v.key} on={view === v.key} onClick={() => pickView(v.key)}>
            {v.key === "mine" && m.mine ? `${v.label} (${m.mine.listings.length})` : v.label}
          </FilterChip>
        ))}
        <span className="inline-flex items-center gap-[5px] ml-auto text-12 text-fg-2">
          <Icon name="coin" size={13} /> <b className="px text-12 text-fg">{num(xu)}</b> Xu
          {free != null && (
            <>
              {" "}
              · túi còn <b className="px text-12 text-fg">{free}</b> ô
            </>
          )}
        </span>
      </div>
      {/* The modal says `busy` already, above the tabs. */}
      {why && why !== busy && <p className={SHOP.why}>{why}</p>}
      {m.doing ? (
        <p className="flex items-center gap-1.5 text-12 text-fg-2" role="status">
          <Icon name="refresh" size={13} className="text-primary animate-spin motion-reduce:animate-none" />
          {m.doing}
        </p>
      ) : (
        m.last && (
          <p className={cn("text-12", tone(m.last))} role="status">
            {m.last}
          </p>
        )
      )}
      {!m.tabs ? (
        <p className={SHOP.note}>{waiting ? "Đang mở chợ…" : "Chưa mở chợ."}</p>
      ) : view === "buy" ? (
        <BuyView {...ctx} />
      ) : view === "sell" ? (
        <SellView {...ctx} items={c.bag?.items ?? []} />
      ) : (
        <MineView {...ctx} />
      )}
    </div>
  );
}

interface ViewProps {
  id: number;
  m: Market;
  why: string | null;
  readWhy: string | null;
  ask: ShopContext["ask"];
  xu: number | null;
  free: number | null;
  go: (tab: number, page: number) => void;
}

/** The picture of an item in a dark square. */
function ItemPic({ item }: { item: Item }) {
  const url = itemIcon(item.icon);
  return (
    <span className={SHOP.lineIcon}>
      {url ? <img className={SHOP.lineImg} src={url} alt="" /> : <Icon name="gem" size={16} />}
    </span>
  );
}

/** A listing to pick: its picture, name (in its quality's colour) over its stats or seller and time left, the price. */
function ListingRow({ l, on, now, loading, onPick }: { l: Listing; on: boolean; now: number; loading: boolean; onPick: () => void }) {
  const sub = [l.qualityName, l.item.level ? `cấp ${l.item.level}` : null, ...l.item.stats].filter(Boolean).join(" · ");
  return (
    <button type="button" role="radio" aria-checked={on} className={cn(SHOP.line, on && SHOP.lineOn)} onClick={onPick}>
      <ItemPic item={l.item} />
      <span className={SHOP.lineName}>
        <span className={cn(SHOP.lineTitle, "truncate", QUALITY[l.quality])}>{named(l.item)}</span>
        <span className={SHOP.lineSub}>{sub || `${l.seller} · ${left(l.expiresAt, now)}`}</span>
      </span>
      <span className={cn(SHOP.linePrice, "flex items-center gap-1.5")}>
        {loading && <Icon name="refresh" size={12} className="text-primary animate-spin motion-reduce:animate-none" />}
        <b className={cn(SHOP.linePriceFig, "px")}>{num(l.price)}</b> Xu
      </span>
    </button>
  );
}

/** "‹ Trang 4/7 ›" and Làm mới for a page of a tab or of Đang bán. */
function Pager({ page, why, go }: { page: MarketPage; why: string | null; go: (tab: number, page: number) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-12 text-fg-2">
      <Button small aria-label="Trang trước" disabled={!!why || page.page <= 1} onClick={() => go(page.tab, page.page - 1)}>
        ‹
      </Button>
      <span>
        Trang <b className="px text-12 text-fg">{page.page}</b>/{Math.max(1, page.pages)}
      </span>
      <Button small aria-label="Trang sau" disabled={!!why || page.page >= page.pages} onClick={() => go(page.tab, page.page + 1)}>
        ›
      </Button>
      <Button small icon="refresh" disabled={!!why} onClick={() => go(page.tab, page.page)}>
        Làm mới
      </Button>
    </div>
  );
}

/** Mua: the nine tabs with their counts, a page of the tab picked, the listing picked with Mua. */
function BuyView({ id, m, why, readWhy, ask, xu, free, go }: ViewProps) {
  const [pick, setPick] = useState<string | null>(null);
  const page = m.page;
  const now = Date.now();
  const picked = page?.listings.find((l) => l.uuid === pick) ?? null;
  const buyWhy = !picked
    ? null
    : xu != null && xu < picked.price
      ? `Thiếu Xu: cần ${num(picked.price)}, có ${num(xu)}.`
      : free != null && free < 1
        ? "Túi không còn ô trống."
        : picked.currency !== 0
          ? "Món bán bằng loại tiền chưa gặp."
          : null;
  const buy = (l: Listing) =>
    ask({
      title: "Mua ở Chợ trời",
      message: (
        <>
          Mua <b>{named(l.item)}</b> của {l.seller} với giá <b>{num(l.price)} Xu</b>?
          {xu != null && ` Còn ${num(xu - l.price)} Xu sau khi mua.`} Món mua về chưa khoá, bán lại được.
        </>
      ),
      confirm: `Mua ${num(l.price)} Xu`,
      icon: "cart",
      run: () => api.marketBuy(id, l.uuid, l.price),
    });
  return (
    <>
      <div className={SHOP.chips} role="group" aria-label="Mục">
        {m.tabs!.tabs.map((t) => (
          <FilterChip key={t.tab} on={page?.tab === t.tab} onClick={() => !readWhy && go(t.tab, 1)}>
            {`${t.name} ${t.listings}`}
          </FilterChip>
        ))}
      </div>
      {page && <Pager page={page} why={readWhy} go={go} />}
      {!page ? null : page.listings.length === 0 ? (
        <p className={SHOP.note}>Mục này không có món nào.</p>
      ) : (
        <div className={SHOP.list} role="radiogroup" aria-label="Món đang bán">
          {page.listings.map((l) => (
            <ListingRow
              key={l.uuid}
              l={l}
              now={now}
              on={l.uuid === pick}
              loading={m.busyWith === l.uuid}
              onPick={() => setPick(l.uuid === pick ? null : l.uuid)}
            />
          ))}
        </div>
      )}
      {picked && (
        <div className={cn(SHOP.buy, "px-3 py-2 bg-bg-2 border-2 border-line")}>
          <span className={SHOP.buyWhat}>
            <b className={cn("text-fg", QUALITY[picked.quality])}>{named(picked.item)}</b>
            {picked.qualityName && ` · ${picked.qualityName}`} · {picked.seller} · {left(picked.expiresAt, now)}
            {picked.item.durability && ` · độ bền ${picked.item.durability[0]}/${picked.item.durability[1]}`}
            {picked.item.desc && <span className="block text-11 text-fg-3">{picked.item.desc}</span>}
          </span>
          <span className={SHOP.costFig}>
            {num(picked.price)} <span className="font-ui text-12 text-fg-2">Xu</span>
          </span>
          <Button kind="primary" small icon="cart" disabled={!!why || !!buyWhy} onClick={() => buy(picked)}>
            Mua
          </Button>
          {buyWhy && <span className={cn(SHOP.why, "basis-full")}>{buyWhy}</span>}
        </div>
      )}
    </>
  );
}

/** Bán: an item of the bag not locked, its price, Đăng bán. One at a time: the sale of a stack is not measured yet. */
function SellView({ id, m, why, ask, xu, items }: ViewProps & { items: Item[] }) {
  const field = useId();
  const [slot, setSlot] = useState<number | null>(null);
  const [text, setText] = useState("");
  const open = items.filter((i) => !i.locked);
  const picked = open.find((i) => i.slot === slot) ?? null;
  const price = Number(text.replace(/\D/g, "")) || 0;
  const tabs = m.tabs!;
  const cut = Math.floor((price * CUT) / 100);
  const sellWhy = !picked || !price
    ? null
    : price < MIN_PRICE || price > tabs.maxPrice
      ? `Giá phải từ ${num(MIN_PRICE)} tới ${num(tabs.maxPrice)} Xu.`
      : xu != null && xu < tabs.fee
        ? `Thiếu Xu cho phí đăng bán: cần ${num(tabs.fee)}, có ${num(xu)}.`
        : null;
  const sell = (i: Item) =>
    ask({
      title: "Đăng bán ở Chợ trời",
      message: (
        <>
          Đăng bán <b>{i.name}</b> (1 cái) với giá <b>{num(price)} Xu</b>? Phí đăng bán {num(tabs.fee)} Xu trừ ngay, không hoàn
          khi thu hồi. Bán trong {tabs.hours} giờ; bán được thì nhận {num(price - cut)} Xu (trừ {CUT}%) qua Hòm thư.
        </>
      ),
      confirm: `Đăng bán ${num(price)} Xu`,
      icon: "market",
      run: () => api.marketSell(id, i.slot, price, i.uuid),
    });
  return (
    <>
      <div className={SHOP.lead}>
        <span className={SHOP.leadTitle}>Món trong túi chưa khoá</span>
        <Hint label="Món nào bán được?" id={`${field}-lock`}>
          Chỉ món chưa khoá. Món mua bằng Xu khóa, đã mặc hay đã nâng cấp đều bị khoá (ổ khoá trong túi), game không cho rao
          bán. Món mua ở Chợ trời thì chưa khoá. Mỗi lần đăng một cái; đăng cả chồng thì chưa đo.
        </Hint>
      </div>
      {open.length === 0 ? (
        <p className={SHOP.note}>Túi không có món nào chưa khoá.</p>
      ) : (
        <div className={SHOP.list} role="radiogroup" aria-label="Món để bán">
          {open.map((i) => (
            <button
              key={i.uuid}
              type="button"
              role="radio"
              aria-checked={i.slot === slot}
              className={cn(SHOP.line, i.slot === slot && SHOP.lineOn)}
              onClick={() => setSlot(i.slot === slot ? null : i.slot)}
            >
              <ItemPic item={i} />
              <span className={SHOP.lineName}>
                <span className={cn(SHOP.lineTitle, "truncate")}>{named(i)}</span>
                <span className={SHOP.lineSub}>{[`ô ${i.slot + 1}`, ...i.stats].join(" · ")}</span>
              </span>
              <span className={SHOP.linePrice}>{i.kindName ?? ""}</span>
            </button>
          ))}
        </div>
      )}
      {picked && (
        <div className={cn(SHOP.buy, "px-3 py-2 bg-bg-2 border-2 border-line")}>
          <span className={SHOP.buyWhat}>
            <b className="text-fg">{picked.name}</b> (1 cái, ô {picked.slot + 1})
          </span>
          <label htmlFor={`${field}-price`} className={FIELD.label}>
            Giá (Xu)
          </label>
          <input
            id={`${field}-price`}
            // The price in the pixel face, right-aligned; the placeholder in the text face.
            className={cn(FIELD.input, "w-[150px]", text && "px text-right")}
            inputMode="numeric"
            autoComplete="off"
            placeholder="Nhập giá"
            value={text ? num(price) : ""}
            // Digits only: a letter typed is dropped, not read as 0.
            onChange={(e) => setText(e.target.value.replace(/\D/g, ""))}
          />
          <Button kind="primary" small icon="market" disabled={!!why || !!sellWhy || !price} onClick={() => sell(picked)}>
            Đăng bán
          </Button>
          <span className={cn("basis-full text-11", sellWhy ? "text-danger" : "text-fg-3")}>
            {sellWhy ??
              (price
                ? `Phí ${num(tabs.fee)} Xu ngay · bán được thì nhận ${num(price - cut)} Xu (trừ ${CUT}%) qua Hòm thư · bán trong ${tabs.hours} giờ`
                : `Giá từ ${num(MIN_PRICE)} tới ${num(tabs.maxPrice)} Xu.`)}
          </span>
        </div>
      )}
    </>
  );
}

/** Đang bán: the character's own listings with their time left, Gia hạn and Thu hồi. */
function MineView({ id, m, why, readWhy, ask, xu, go }: ViewProps) {
  const mine = m.mine;
  const now = Date.now();
  const fee = m.tabs!.fee;
  const withdraw = (l: Listing) =>
    ask({
      title: "Thu hồi",
      message: (
        <>
          Thu hồi <b>{named(l.item)}</b> về túi? Phí đăng bán đã trả không được hoàn.
        </>
      ),
      confirm: "Thu hồi",
      icon: "download",
      run: () => api.marketWithdraw(id, l.uuid),
    });
  const extend = (l: Listing) =>
    ask({
      title: "Gia hạn",
      message: (
        <>
          Gia hạn <b>{named(l.item)}</b> thêm {m.tabs!.hours} giờ, phí <b>{num(fee)} Xu</b>? Hạn mới tính từ hạn cũ ({left(l.expiresAt, now)}),
          không phải từ bây giờ.
        </>
      ),
      confirm: `Gia hạn ${num(fee)} Xu`,
      icon: "clock",
      run: () => api.marketExtend(id, l.uuid),
    });
  if (!mine) return <p className={SHOP.note}>{readWhy ? "Chưa đọc Đang bán." : "Đang đọc Đang bán…"}</p>;
  return (
    <>
      <Pager page={mine} why={readWhy} go={go} />
      {mine.listings.length === 0 ? (
        <p className={SHOP.note}>Chưa ký gửi vật phẩm nào.</p>
      ) : (
        <ul className="grid gap-1 m-0 p-0 list-none" aria-label="Món đang bán">
          {mine.listings.map((l) => (
            <li key={l.uuid} className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-2.5 px-2 py-1.5 bg-bg-2 border-2 border-line">
              <ItemPic item={l.item} />
              <span className={SHOP.lineName}>
                <span className={cn(SHOP.lineTitle, "truncate", QUALITY[l.quality])}>{named(l.item)}</span>
                <span className={SHOP.lineSub}>
                  <b className="px text-11 text-fg">{num(l.price)}</b> Xu · {left(l.expiresAt, now)}
                </span>
              </span>
              <span className="flex items-center gap-1.5">
                {m.busyWith === l.uuid && (
                  <Icon name="refresh" size={12} className="text-primary animate-spin motion-reduce:animate-none" />
                )}
                <Button small icon="clock" disabled={!!why || (xu != null && xu < fee)} onClick={() => extend(l)}>
                  Gia hạn
                </Button>
                <Button small icon="download" disabled={!!why} onClick={() => withdraw(l)}>
                  Thu hồi
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
