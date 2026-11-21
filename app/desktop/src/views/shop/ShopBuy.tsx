import { useEffect, useId, useState } from "react";
import { api } from "@/api";
import { cn } from "@/utils/cn";
import { Button } from "@/components/Button";
import { FilterChip } from "@/components/FilterChip";
import { Hint } from "@/components/Hint";
import { Stepper } from "@/components/Stepper";
import { num } from "@/utils/format";
import { itemIcon } from "@/game/itemIcons";
import { recalled, remember } from "@/utils/remember";
import { CATEGORIES, MONEY, shopKind, type Category, type Gender, type Money } from "@/game/shops";
import { selectedLog, useStore } from "@/store";
import type { ShopLine } from "@/api/types";
import { SHOP, type ShopContext } from "./ShopModal";

/** The lines Bot::buy and the server leave in the log for a purchase. */
const RESULT = /^(Đã mua|Chưa mua|Lái Buôn không trả lời|Bà Tư Hạnh không trả lời)/;
const TIERS = [1, 21, 51] as const;

/**
 * Mua (15-shops.md): a category of the 14 shops, with its money (Xu or Xu khóa) and, for Nón and Giáp, men's or women's;
 * the shop opens on its own (c2s/13, c2s/57 down its menus) and lists its lines with the stat gear rolls, its tier and
 * price. Mua buys the line picked in the count chosen (c2s/1190), asked once more with the total; the result is the
 * bot's line in the log.
 */
export function ShopBuy({ account, why, ask, item }: ShopContext & { item?: number }) {
  const c = account.character!;
  // Mua búa opens on Dược phẩm with the hammer picked.
  const [category, setCategory] = useState<Category>(() => (item != null ? "potion" : ((recalled("shop.category") as Category) ?? "potion")));
  const [money, setMoney] = useState<Money>(() => (recalled("shop.money") === "0" ? 0 : 1));
  const [gender, setGender] = useState<Gender>(() => (recalled("shop.gender") === "nu" ? "nu" : "nam"));
  const [tier, setTier] = useState<number | null>(null);
  const cat = CATEGORIES.find((x) => x.key === category) ?? CATEGORIES[4];
  const kind = shopKind(cat.key, money, gender);
  const shop = c.shop?.kind === kind ? c.shop : null;

  // The shop of the choice opens once the character can use it, again when the choice changes, and again when another
  // shop came in its place (a chip pressed while the last one was still opening, which the bot refused). Mở lại
  // (`tries`) opens it after a refusal or a timeout.
  const open = c.shop?.kind;
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (!why && open !== kind) api.openShopKind(account.id, kind);
  }, [account.id, kind, why, open, tries]);
  const hint = useId();

  const [picked, setPicked] = useState<number | null>(null);
  const [quantity, setQuantity] = useState(1);
  const lines = (shop?.items ?? []).filter((l) => tier == null || l.level == null || l.level === tier);
  const wallet = (l: ShopLine) => (c.currencies ? [c.currencies.xu, c.currencies.xuKhoa, c.currencies.luong][l.currency] : null);
  // The item asked for (Mua búa), in Xu khóa when it pays, else in Xu, until another line is picked.
  const wanted = item == null || picked != null ? [] : lines.filter((l) => l.itemId === item);
  const pays = (l: ShopLine) => (wallet(l) ?? 0) >= l.price;
  const line = lines.find((l) => l.shopId === picked) ?? wanted.find((l) => l.currency === 1 && pays(l)) ?? wanted.find(pays) ?? wanted[0] ?? null;
  // The count is of the line it was chosen for: another line, of this shop or another (category, money, gender, tier), or
  // none while a shop opens, starts again at 1, so 50 potions never become 50 Đá cấp 11.
  const lineKey = line ? `${kind}:${line.shopId}` : null;
  const [countOf, setCountOf] = useState(lineKey);
  if (countOf !== lineKey) {
    setCountOf(lineKey);
    setQuantity(1);
  }
  const cost = line ? line.price * quantity : 0;
  const have = line ? wallet(line) : null;
  const short = line != null && have != null && cost > have;
  const owned = (itemId: number) => c.bag?.items.filter((i) => i.id === itemId).reduce((n, i) => n + i.quantity, 0) ?? 0;
  // A full bag still takes what joins a stack of the same item and lock with room for the count (Kim Đan Dược onto its
  // stack); anything else needs a free slot ("Rương đã đầy").
  const joins =
    line != null && line.stack > 1 && (c.bag?.items ?? []).some((i) => i.id === line.itemId && i.locked === line.locks && i.quantity + quantity <= line.stack);
  const full = c.bag != null && c.bag.items.length >= c.bag.capacity && !joins;

  const log = useStore(selectedLog);
  const [mark, setMark] = useState<number | null>(null);
  const result = mark == null ? undefined : log.find((l) => l.seq > mark && RESULT.test(l.text));
  const waiting = mark != null && !result;
  // Asked once more, as every spend of Tiện ích: the line, count and total as they are now go in the box and are what
  // Mua sends, whatever is picked behind it.
  const buy = () => {
    if (!line) return;
    const { shopId, name, price, currency, locks } = line;
    const count = quantity;
    const total = price * count;
    const money = MONEY[currency];
    ask({
      title: `Mua ở ${cat.npc}`,
      message: (
        <>
          Mua <b>{num(count)} {name}</b> với giá <b>{num(total)} {money}</b>
          {count > 1 && ` (${num(price)} ${money} một món)`}?
          {have != null && ` Còn ${num(have - total)} ${money} sau khi mua.`}
          {locks && " Món mua bằng Xu khóa bị khoá giao dịch."}
        </>
      ),
      confirm: `Mua ${num(total)} ${money}`,
      icon: "cart",
      run: async () => {
        // The result is the first line after the confirm.
        const logged = selectedLog(useStore.getState());
        setMark(logged.length ? logged[logged.length - 1].seq : 0);
        await api.buy(account.id, shopId, count);
      },
    });
  };

  return (
    // Rows of chips, the lines of the shop, the line picked.
    <div className={SHOP.tab}>
      <div className={SHOP.chips} role="group" aria-label="Cửa hàng">
        {CATEGORIES.map((x) => (
          <FilterChip
            key={x.key}
            on={x.key === category}
            onClick={() => {
              setCategory(x.key);
              remember("shop.category", x.key);
              setPicked(null);
              setTier(null);
            }}
          >
            {x.label}
          </FilterChip>
        ))}
      </div>
      {cat.gear && (
        <div className={SHOP.chips} role="group" aria-label="Loại tiền, nam nữ, bậc">
          {([0, 1] as Money[]).map((m) => (
            <FilterChip
              key={m}
              on={money === m}
              tone={m ? "var(--coin)" : undefined}
              onClick={() => {
                setMoney(m);
                remember("shop.money", String(m));
                setPicked(null);
              }}
            >
              {MONEY[m]}
            </FilterChip>
          ))}
          {cat.gender &&
            (["nam", "nu"] as Gender[]).map((g) => (
              <FilterChip
                key={g}
                on={gender === g}
                onClick={() => {
                  setGender(g);
                  remember("shop.gender", g);
                  setPicked(null);
                }}
              >
                {g === "nam" ? "Nam" : "Nữ"}
              </FilterChip>
            ))}
          <Hint label="Xu hay Xu khóa?" id={`${hint}-money`}>
            Mỗi cửa hàng trang bị có hai bản: trả bằng Xu hoặc bằng Xu khóa. Món mua bằng Xu khóa bị khoá giao dịch (không bán,
            không đưa người khác được); mua bằng Xu hay Lượng thì không khoá. Xu khóa còn dùng trả phí nâng cấp và gộp đá.
          </Hint>
          <span className="w-0.5 h-[18px] bg-line" aria-hidden="true" />
          {TIERS.map((t) => (
            <FilterChip key={t} on={tier === t} onClick={() => setTier(tier === t ? null : t)}>
              {`Cấp ${t}`}
            </FilterChip>
          ))}
          <Hint label="Cấp 1, 21, 51 là gì?" id={`${hint}-tier`}>
            Cấp nhân vật cần để mặc món (bậc của món). Bậc càng cao thì chỉ số gốc càng mạnh và nâng cấp được càng cao: bậc 1
            tới +4, bậc 21 tới +8, bậc 51 tới +12. Bấm lại chip đang chọn để xem mọi bậc.
          </Hint>
        </div>
      )}
      {/* The line over the shop's list with its "?" and Mở lại. */}
      <div className="flex flex-wrap items-center gap-1.5">
        <p className={SHOP.note}>
          {cat.npc} · {shop ? `${shop.items.length} món` : why ? "mở được khi ở Làng Thanh Khê và nick rảnh" : "đang mở…"}
          {cat.gear && money === 1 && " · đồ mua bằng Xu khóa bị khoá giao dịch"}
          {cat.gear && " · đồ cửa hàng luôn đúng hệ của nhân vật"}
        </p>
        {cat.gear && (
          <Hint label="Chỉ số của món mua là gì?" id={`${hint}-stats`}>
            Mỗi dòng ghi khoảng chỉ số chính, ví dụ sức tấn công 5–9: món mua về rơi ngẫu nhiên một số trong khoảng đó, đôi khi có
            thêm một chỉ số phụ. Đồ cửa hàng luôn đúng hệ của nhân vật.
          </Hint>
        )}
        {category === "luong" && (
          <Hint label="Cửa hàng [Lượng] bán gì?" id={`${hint}-luong`}>
            Đá cấp 6 tới 11, Bùa bảo vệ, vật phẩm Chuyển hoá và vài món khác, trả bằng Lượng. Món mua bằng Lượng không khoá.
            Đá cấp 7 (7 Lượng) rẻ hơn mua 4 Đá cấp 6 rồi gộp; từ cấp 8 giá gần bằng 4 viên cấp dưới.
          </Hint>
        )}
        {!shop && !why && (
          <Button kind="ghost" small icon="refresh" onClick={() => setTries((t) => t + 1)}>
            Mở lại
          </Button>
        )}
      </div>
      {shop && (
        <div className={SHOP.list} role="radiogroup" aria-label="Món bán">
          {lines.map((l) => {
            const on = l.shopId === line?.shopId;
            const icon = itemIcon(l.icon);
            return (
              <button
                key={l.shopId}
                type="button"
                role="radio"
                aria-checked={on}
                className={cn(SHOP.line, on && SHOP.lineOn)}
                onClick={() => setPicked(l.shopId)}
              >
                <span className={SHOP.lineIcon}>{icon && <img className={SHOP.lineImg} src={icon} alt="" />}</span>
                <span className={SHOP.lineName}>
                  <b className={SHOP.lineTitle}>{l.name}</b>
                  <small className={SHOP.lineSub}>
                    {l.level != null && `Cấp ${l.level} · `}
                    {l.ranges.length ? l.ranges.join(", ") : l.desc || `Trong túi: ${owned(l.itemId)}`}
                  </small>
                </span>
                <span className={SHOP.linePrice}>
                  <b className={cn("px", SHOP.linePriceFig, l.currency === 1 && "text-coin", l.currency === 2 && "text-accent")}>{num(l.price)}</b> {MONEY[l.currency]}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {line && (
        <div className={SHOP.buy}>
          <span className={SHOP.buyWhat}>
            {line.name} · trong túi {owned(line.itemId)}
            {line.locks && " · sẽ bị khoá"}
          </span>
          <Stepper value={quantity} onChange={setQuantity} min={1} max={Math.max(1, line.stack)} label="số lượng" />
          <span className={short ? SHOP.costShort : undefined}>
            = <b className={SHOP.costFig}>{num(cost)}</b> {MONEY[line.currency]}
            {short && ` · thiếu ${num(cost - (have ?? 0))}`}
          </span>
          <Button kind="primary" icon="cart" disabled={!!why || short || full || waiting} onClick={buy}>
            {waiting ? "Đang mua…" : "Mua"}
          </Button>
        </div>
      )}
      {full && <p className={SHOP.why}>Túi đã đầy: server không bán thêm ("Rương đã đầy").</p>}
      {result && (
        <p className={cn(SHOP.why, result.text.startsWith("Đã mua") && "text-s-online")} role="status">
          {result.text}
        </p>
      )}
    </div>
  );
}
