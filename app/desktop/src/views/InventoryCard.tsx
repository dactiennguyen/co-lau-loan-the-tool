import { useState } from "react";
import { Avatar } from "../components/Avatar";
import { Card } from "../components/Card";
import { Icon, type IconName } from "../components/Icon";
import { ELEMENT_ICON, ItemSlot } from "../components/ItemSlot";
import { num } from "../format";
import type { Account, Item } from "../types";
import { ItemDetail } from "./ItemDetail";
import "./InventoryCard.css";

/** The 8 gear slots around the character, as the Bản thân panel lays them out: 0 hat and 2 weapon are measured, the
 * others follow the item types (12-skills-items.md#ô-trang-bị). */
const GEAR: Record<number, { label: string; icon: IconName }> = {
  0: { label: "Nón", icon: "crown" },
  1: { label: "Áo", icon: "shield" },
  2: { label: "Vũ khí", icon: "sword" },
  3: { label: "Nhẫn", icon: "gem" },
  4: { label: "Cánh", icon: "wind" },
  5: { label: "Thú cưng", icon: "heart" },
  6: { label: "Ô 6", icon: "user" },
  7: { label: "Danh hiệu", icon: "star" },
};
const LEFT = [0, 1, 6, 7];
const RIGHT = [2, 3, 4, 5];
/** Character elements (field01 of s2c/9) and item elements number alike. */
const ELEMENTS: Record<number, string> = { 1: "Hỏa", 2: "Lôi", 4: "Thủy" };
type Key = `gear-${number}` | `bag-${number}`;

/**
 * Túi đồ tab: the 8 gear slots (s2c/9 at login) around the character, the bag (s2c/42, then every s2c/1187) by slot,
 * and the item shown under them. Read only: the packets to use, wear or drop an item are not known yet. The money is on
 * the hero card.
 */
export function InventoryCard({ account }: { account: Account }) {
  const c = account.character;
  const [pinned, setPinned] = useState<Key | null>(null);
  const [hover, setHover] = useState<Key | null>(null);
  if (!c) {
    return (
      <Card title="Túi đồ" icon="gem" className="inv">
        <p className="inv__none">Đăng nhập để xem trang bị và túi đồ: server chỉ gửi chúng lúc vào game.</p>
      </Card>
    );
  }
  const bag = c.bag;
  const bySlot = new Map((bag?.items ?? []).map((i) => [i.slot, i]));
  const cells = Math.max(bag?.capacity ?? 0, ...[...bySlot.keys()].map((s) => s + 1));
  const find = (k: Key | null): Item | null => {
    if (!k) return null;
    const [where, n] = k.split("-");
    return (where === "gear" ? c.gear[Number(n)] : bySlot.get(Number(n))) ?? null;
  };
  const shownKey = hover && find(hover) ? hover : pinned && find(pinned) ? pinned : null;
  const shown = find(shownKey);
  const where = shownKey?.startsWith("gear") ? `đang mặc, ô ${GEAR[shown?.slot ?? 0]?.label ?? shown?.slot}` : `túi đồ, ô ${(shown?.slot ?? 0) + 1}`;
  const slot = (k: Key, item: Item | null, label: string, placeholder?: IconName, wear?: boolean) => (
    <ItemSlot
      key={k}
      item={item}
      label={label}
      placeholder={placeholder}
      wear={wear}
      active={shownKey === k}
      onShow={(on) => setHover((h) => (on ? k : h === k ? null : h))}
      onPick={() => setPinned((p) => (p === k ? null : k))}
    />
  );
  const gearSlot = (n: number) => slot(`gear-${n}`, c.gear[n] ?? null, GEAR[n].label, GEAR[n].icon, true);
  const worn = c.gear.filter(Boolean).length;
  return (
    <Card
      title="Túi đồ"
      icon="gem"
      className="inv"
      subtitle={bag ? `${num(bag.items.length)}/${num(bag.capacity)} ô · ${worn} món đang mặc` : "Chưa nhận túi đồ"}
      aside={<span className="inv__read">chỉ xem</span>}
    >
      <div className="inv__body">
        <section className="inv__gear" aria-label="Trang bị đang mặc">
          <div className="inv__col">{LEFT.map(gearSlot)}</div>
          <div className="inv__me">
            <Avatar name={account.username} size={44} />
            <b>{c.name}</b>
            <span className="px">LV {c.level}</span>
            {c.element != null && ELEMENTS[c.element] && (
              <span className={`inv__el el el--${c.element}`}>
                {ELEMENT_ICON[c.element] && <Icon name={ELEMENT_ICON[c.element]} size={11} />} Hệ {ELEMENTS[c.element]}
              </span>
            )}
          </div>
          <div className="inv__col">{RIGHT.map(gearSlot)}</div>
        </section>

        <section className="inv__bag" aria-label="Túi đồ">
          {bag ? (
            <div className="inv__grid">
              {Array.from({ length: cells }, (_, n) => slot(`bag-${n}`, bySlot.get(n) ?? null, `Ô ${n + 1}`))}
            </div>
          ) : (
            <p className="inv__none">Server chưa gửi túi đồ (s2c/42).</p>
          )}
        </section>
      </div>

      <ItemDetail item={shown} where={where} element={c.element} />
    </Card>
  );
}
