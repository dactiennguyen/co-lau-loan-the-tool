import { useEffect, useId, useState } from "react";
import { api } from "../api";
import { Button } from "../components/Button";
import { FilterChip } from "../components/FilterChip";
import { Hint } from "../components/Hint";
import { Stepper } from "../components/Stepper";
import { num } from "../format";
import { itemIcon } from "../itemIcons";
import { recalled, remember } from "../remember";
import { CATEGORIES, MONEY, shopKind, type Category, type Gender, type Money } from "../shops";
import { selectedLog, useStore } from "../store";
import type { ShopLine } from "../types";
import type { ShopContext } from "./ShopModal";

/** The lines Bot::buy and the server leave in the log for a purchase. */
const RESULT = /^(Đã mua|Chưa mua|Lái Buôn không trả lời|Bà Tư Hạnh không trả lời)/;
const TIERS = [1, 21, 51] as const;

/**
 * Mua (15-shops.md): a category of the 14 shops, with its money (Xu or Xu khóa) and, for Nón and Giáp, men's or women's;
 * the shop opens on its own (c2s/13, c2s/57 down its menus) and lists its lines with the stat gear rolls, its tier and
 * price. Mua buys the line picked in the count chosen (c2s/1190); the result is the bot's line in the log.
 */
export function ShopBuy({ account, why, item }: ShopContext & { item?: number }) {
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
  const cost = line ? line.price * quantity : 0;
  const have = line ? wallet(line) : null;
  const short = line != null && have != null && cost > have;
  const owned = (itemId: number) => c.bag?.items.filter((i) => i.id === itemId).reduce((n, i) => n + i.quantity, 0) ?? 0;
  const full = c.bag != null && c.bag.items.length >= c.bag.capacity;

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
    <div className="sbuy">
      <div className="sbuy__filters" role="group" aria-label="Cửa hàng">
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
        <div className="sbuy__filters" role="group" aria-label="Loại tiền, nam nữ, bậc">
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
          <span className="sbuy__sep" aria-hidden="true" />
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
      <div className="sbuy__head">
        <p className="shoptab__note">
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
        <div className="sbuy__list" role="radiogroup" aria-label="Món bán">
          {lines.map((l) => {
            const on = l.shopId === line?.shopId;
            const icon = itemIcon(l.icon);
            return (
              <button
                key={l.shopId}
                type="button"
                role="radio"
                aria-checked={on}
                className={on ? "sline sline--on" : "sline"}
                onClick={() => setPicked(l.shopId)}
              >
                <span className="sline__icon">{icon && <img src={icon} alt="" />}</span>
                <span className="sline__name">
                  <b>{l.name}</b>
                  <small>
                    {l.level != null && `Cấp ${l.level} · `}
                    {l.ranges.length ? l.ranges.join(", ") : l.desc || `Trong túi: ${owned(l.itemId)}`}
                  </small>
                </span>
                <span className={`sline__price sline__price--${l.currency}`}>
                  <b className="px">{num(l.price)}</b> {MONEY[l.currency]}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {line && (
        <div className="sbuy__buy">
          <span className="sbuy__what">
            {line.name} · trong túi {owned(line.itemId)}
            {line.locks && " · sẽ bị khoá"}
          </span>
          <Stepper value={quantity} onChange={setQuantity} min={1} label="số lượng" />
          <span className={short ? "sbuy__cost sbuy__cost--short" : "sbuy__cost"}>
            = <b className="px">{num(cost)}</b> {MONEY[line.currency]}
            {short && ` · thiếu ${num(cost - (have ?? 0))}`}
          </span>
          <Button kind="primary" icon="cart" disabled={!!why || short || full || waiting} onClick={buy}>
            {waiting ? "Đang mua…" : "Mua"}
          </Button>
        </div>
      )}
      {full && <p className="shoptab__why">Túi đã đầy: server không bán thêm ("Rương đã đầy").</p>}
      {result && (
        <p className={result.text.startsWith("Đã mua") ? "shoptab__result shoptab__result--ok" : "shoptab__result"} role="status">
          {result.text}
        </p>
      )}
    </div>
  );
}
