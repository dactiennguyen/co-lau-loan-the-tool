import { useEffect, useState } from "react";
import { Avatar } from "../components/Avatar";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ElementTag } from "../components/ElementTag";
import type { IconName } from "../components/Icon";
import { ItemSlot } from "../components/ItemSlot";
import { num } from "../format";
import type { Account, Item, ItemAction } from "../types";
import { ItemDetail } from "./ItemDetail";
import "./InventoryCard.css";

/** The 8 gear slots around the character, as the Bản thân panel lays them out: 0, 1, 2, 3 and 5 are measured (manina,
 * symap), 4 and 7 follow the item types (12-skills-items.md#ô-trang-bị). */
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
type Key = `gear-${number}` | `bag-${number}`;
/** Item types of data/items.json a bag item is used by (Sử dụng): Bình 20, which the server refuses outside a battle
 * (P4), Tăng Kinh Nghiệm 23, Tẩy điểm 24, Trứng 29. Gear is 0–7. */
const POTION = 20;
const USABLE = new Set([POTION, 23, 24, 29]);
/** Búa Sửa Chữa: each repair takes one. */
const HAMMER = 2;
/** An action the server has not answered in this long is let go, and the buttons come back. */
const ANSWER_MS = 5000;

/** A button of the item popup; Dùng and Sửa ask once more, as they use up the item or a hammer. */
interface Act {
  action: ItemAction;
  label: string;
  icon: IconName;
  why: string | null;
  confirm?: string;
}

/**
 * Túi đồ tab: the 8 gear slots (s2c/9, then s2c/37) around the character, the bag (s2c/42, s2c/1187) by slot, and the
 * item shown under them with the game's buttons for the item clicked: Mặc and Dùng in the bag, Cởi ra and Sửa on the
 * gear (12-skills-items.md#c2s-1186). Vứt bỏ is left out. The money is in the metric row.
 */
export function InventoryCard({ account, onAction }: { account: Account; onAction: (action: ItemAction, slot: number) => void }) {
  const c = account.character;
  const [pinned, setPinned] = useState<Key | null>(null);
  const [hover, setHover] = useState<Key | null>(null);
  const [ask, setAsk] = useState<{ key: Key; action: ItemAction } | null>(null);
  // The gear and bag when the last action went out: the buttons wait until they change, or ANSWER_MS.
  const sig = c ? JSON.stringify([c.gear.map((g) => g && [g.id, g.durability?.[0]]), c.bag?.items.map((i) => [i.slot, i.id, i.quantity])]) : "";
  const [sent, setSent] = useState<string | null>(null);
  useEffect(() => {
    if (sent === null) return;
    const t = setTimeout(() => setSent(null), ANSWER_MS);
    return () => clearTimeout(t);
  }, [sent]);
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

  // The same checks as Bot::item, so a button the bot would refuse is greyed with the reason.
  const busy = c.battle ? "đang đánh, đợi hết trận" : sent !== null && sent === sig ? "đang đợi server trả lời" : null;
  const full = !!bag && bag.items.length >= bag.capacity;
  const hammer = !!bag?.items.some((i) => i.id === HAMMER);
  const acts = (item: Item, isWorn: boolean): Act[] => {
    if (isWorn) {
      const d = item.durability;
      const repair: Act[] = d
        ? [{ action: "repair", label: "Sửa", icon: "pencil", why: d[0] >= d[1] ? "độ bền còn đầy" : hammer ? null : "cần 1 Búa sửa chữa trong túi", confirm: `Sửa ${item.name}? Tốn 1 Búa sửa chữa.` }]
        : [];
      return [{ action: "unequip", label: "Cởi ra", icon: "logout", why: full ? "túi đồ đã đầy" : null }, ...repair];
    }
    if (item.kind != null && item.kind <= 7) return [{ action: "equip", label: "Mặc", icon: "login", why: null }];
    if (item.kind != null && USABLE.has(item.kind)) {
      const why = item.kind === POTION ? "bình chỉ dùng được trong trận" : null;
      return [{ action: "use", label: "Dùng", icon: "play", why, confirm: `Dùng 1 ${item.name}? Không lấy lại được.` }];
    }
    return [];
  };
  const run = (action: ItemAction, item: Item) => {
    setAsk(null);
    setSent(sig);
    onAction(action, item.slot);
    // Worn, the item sits in the gear slot of its type; taken off, in a bag slot the server picks.
    if (action === "equip" && item.kind != null) setPinned(`gear-${item.kind}`);
    if (action === "unequip") setPinned(null);
  };
  const actions = (() => {
    if (!shown || !shownKey) return undefined;
    const list = acts(shown, shownKey.startsWith("gear"));
    if (!list.length) return undefined;
    // Only the item clicked has buttons: a hovered one changes as the mouse moves to them.
    if (shownKey !== pinned) return <span className="inv__hint">Bấm vào món để {list.map((a) => a.label.toLowerCase()).join(", ")}</span>;
    const asking = ask?.key === shownKey ? list.find((a) => a.action === ask.action) : undefined;
    if (asking) {
      return (
        <div className="inv__act">
          <span className="inv__ask">{asking.confirm}</span>
          <div className="inv__btns">
            <Button kind="primary" small onClick={() => run(asking.action, shown)}>
              Đồng ý
            </Button>
            <Button kind="ghost" small onClick={() => setAsk(null)}>
              Huỷ
            </Button>
          </div>
        </div>
      );
    }
    const why = busy ?? list.find((a) => a.why)?.why;
    return (
      <div className="inv__act">
        <div className="inv__btns">
          {list.map((a) => (
            <Button
              key={a.action}
              kind={a.confirm ? "tonal" : "primary"}
              small
              icon={a.icon}
              disabled={!!(busy ?? a.why)}
              title={busy ?? a.why ?? undefined}
              onClick={() => (a.confirm ? setAsk({ key: shownKey, action: a.action }) : run(a.action, shown))}
            >
              {a.label}
            </Button>
          ))}
        </div>
        {why && <span className="inv__why">{why}</span>}
      </div>
    );
  })();
  return (
    <Card
      title="Túi đồ"
      icon="gem"
      className="inv"
      subtitle={bag ? `${num(bag.items.length)}/${num(bag.capacity)} ô · ${worn} món đang mặc` : "Chưa nhận túi đồ"}
    >
      <div className="inv__body">
        <section className="inv__gear" aria-label="Trang bị đang mặc">
          <div className="inv__col">{LEFT.map(gearSlot)}</div>
          <div className="inv__me">
            <Avatar name={account.username} size={44} />
            <b>{c.name}</b>
            <span className="px">LV {c.level}</span>
            <ElementTag element={c.element} />
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

      <ItemDetail item={shown} where={where} element={c.element} actions={actions} />
    </Card>
  );
}
