import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ElementTag } from "@/components/ElementTag";
import type { IconName } from "@/components/Icon";
import { GenderTag } from "@/components/GenderTag";
import { misfit } from "@/game/gender";
import { ItemSlot } from "@/components/ItemSlot";
import { Menu, type MenuItem } from "@/components/Menu";
import { num } from "@/utils/format";
import type { Account, Item, ItemAction } from "@/api/types";
import { ItemDetail } from "./ItemDetail";
import { useStore } from "@/store";

/** The body of the card: a column of parts that keep their height, scrolling inside; narrow ones a container. */
const BODY = "grid [align-content:start] gap-2.5 @container overflow-auto";
/** Said in place of the gear and the bag, or of the bag alone. */
const NONE = "text-12 text-fg-3";
/** A column of four gear slots, either side of the character. */
const COL = "grid gap-[5px] [align-content:start]";
/** The buttons of the item clicked, at the right end of the detail strip; the reason a button is greyed under them. */
const ACT = "grid justify-items-end gap-1 max-w-[230px]";
const BUTTONS = "flex gap-1.5";

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
const NO_HAMMER = "cần 1 Búa sửa chữa trong túi";
/** An action the server has not answered in this long is let go, and the buttons come back. */
const ANSWER_MS = 5000;

/** A button of the item popup; Dùng, Sửa and Vứt bỏ ask once more, as they use up the item or a hammer. */
interface Act {
  action: ItemAction;
  label: string;
  icon: IconName;
  why: string | null;
  confirm?: string;
  danger?: boolean;
}

/**
 * Túi đồ tab: the 8 gear slots (s2c/9, then s2c/37) around the character, the bag (s2c/42, s2c/1187) by slot, and the
 * item shown under them with the game's buttons for the item clicked: Mặc and Dùng in the bag, Cởi ra and Sửa on the
 * gear (12-skills-items.md#c2s-1186), and Vứt bỏ for every bag item, which asks once more as the game does. The money is
 * in the metric row. Sắp xếp moves the bag items up over the empty slots (c2s/1257); Mua búa, where Sửa lacks one, opens
 * Tiện ích at Mua with the hammer picked (the shops themselves are only in Tiện ích). A right click on an item picks it and opens a menu of
 * the same buttons, greyed with the same reasons; Dùng, Sửa and Vứt bỏ from it ask once more in the strip, as the buttons
 * do.
 */
export function InventoryCard({ account, onAction }: { account: Account; onAction: (action: ItemAction, slot: number) => void }) {
  const c = account.character;
  const [pinned, setPinned] = useState<Key | null>(null);
  const [hover, setHover] = useState<Key | null>(null);
  const [ask, setAsk] = useState<{ key: Key; action: ItemAction } | null>(null);
  const [menu, setMenu] = useState<{ key: Key; x: number; y: number } | null>(null);
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
      <Card title="Túi đồ" icon="gem" bodyClassName={BODY}>
        <p className={NONE}>Đăng nhập để xem trang bị và túi đồ: server chỉ gửi chúng lúc vào game.</p>
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
      misfit={item && !wear ? misfit(item, c.gender) : null}
      className={k.startsWith("gear-") ? "[--size:46px]" : undefined}
      active={shownKey === k}
      onShow={(on) => setHover((h) => (on ? k : h === k ? null : h))}
      onPick={() => setPinned((p) => (p === k ? null : k))}
      onMenu={
        item
          ? (x, y) => {
              setPinned(k);
              setAsk(null);
              setMenu({ key: k, x, y });
            }
          : undefined
      }
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
        ? [{ action: "repair", label: "Sửa", icon: "pencil", why: d[0] >= d[1] ? "độ bền còn đầy" : hammer ? null : NO_HAMMER, confirm: `Sửa ${item.name}? Tốn 1 Búa sửa chữa.` }]
        : [];
      return [{ action: "unequip", label: "Cởi ra", icon: "logout", why: full ? "túi đồ đã đầy" : null }, ...repair];
    }
    // Vứt bỏ, as the game asks it ("Bạn có chắc là muốn vứt bỏ Đá cấp 2 này không?", I1); a stack may go whole.
    const qty = item.stacks && item.quantity > 1 ? ` ×${item.quantity}` : "";
    const discard: Act = {
      action: "discard",
      label: "Vứt bỏ",
      icon: "trash",
      why: null,
      danger: true,
      confirm: `Vứt bỏ ${item.name}${qty}? Món mất hẳn, không lấy lại được.`,
    };
    // Gear of the other gender: Bot::item refuses it with the same words (the server would say "Trang bị không phù hợp").
    if (item.kind != null && item.kind <= 7) return [{ action: "equip", label: "Mặc", icon: "login", why: misfit(item, c.gender) }, discard];
    if (item.kind != null && USABLE.has(item.kind)) {
      const why = item.kind === POTION ? "bình chỉ dùng được trong trận" : null;
      return [{ action: "use", label: "Dùng", icon: "play", why, confirm: `Dùng 1 ${item.name}? Không lấy lại được.` }, discard];
    }
    return [discard];
  };
  /** Cửa hàng of Lái Buôn, with `item` picked first. */
  const shopFor = (item?: number) => useStore.getState().open({ kind: "shop", id: account.id, item });
  const run = (action: ItemAction, item: Item) => {
    setAsk(null);
    setSent(sig);
    onAction(action, item.slot);
    // Worn, the item sits in the gear slot of its type; taken off, in a bag slot the server picks.
    if (action === "equip" && item.kind != null) setPinned(`gear-${item.kind}`);
    if (action === "unequip" || action === "discard") setPinned(null);
  };
  // Sắp xếp numbers the bag slots anew, so no item stays picked.
  const sort = () => {
    setAsk(null);
    setPinned(null);
    setSent(sig);
    onAction("sort", 0);
  };
  /** The right-click menu of the item at `k`: its buttons, Mua búa where Sửa lacks a hammer, Mua thêm for what Lái
   * Buôn sells (potions, hammers). */
  const menuItems = (k: Key, item: Item): MenuItem[] => {
    const list = acts(item, k.startsWith("gear"));
    const items: MenuItem[] = list.map((a) => ({
      label: a.confirm ? `${a.label}…` : a.label,
      icon: a.icon,
      disabled: !!(busy ?? a.why),
      hint: busy ?? a.why ?? undefined,
      danger: a.danger,
      separated: a.danger,
      onSelect: () => (a.confirm ? setAsk({ key: k, action: a.action }) : run(a.action, item)),
    }));
    if (list.some((a) => a.why === NO_HAMMER)) items.push({ label: "Mua búa", icon: "cart", onSelect: () => shopFor(HAMMER) });
    if (item.kind === POTION || item.id === HAMMER) {
      items.push({ label: `Mua thêm ${item.name}`, icon: "cart", separated: items.length > 0, onSelect: () => shopFor(item.id) });
    }
    if (items.length === 0) items.push({ label: "Không có thao tác", icon: "gem", disabled: true, hint: "món này không mặc hay dùng được", onSelect: () => {} });
    return items;
  };
  const menuItem = menu ? find(menu.key) : null;
  const actions = (() => {
    if (!shown || !shownKey) return undefined;
    const list = acts(shown, shownKey.startsWith("gear"));
    if (!list.length) return undefined;
    // Only the item clicked has buttons: a hovered one changes as the mouse moves to them.
    if (shownKey !== pinned) {
      return <span className="max-w-[160px] text-11 text-fg-3 text-right">Bấm hoặc chuột phải vào món để {list.map((a) => a.label.toLowerCase()).join(", ")}</span>;
    }
    const asking = ask?.key === shownKey ? list.find((a) => a.action === ask.action) : undefined;
    if (asking) {
      return (
        <div className={ACT}>
          <span className="text-11 text-fg text-right">{asking.confirm}</span>
          <div className={BUTTONS}>
            <Button kind={asking.danger ? "danger" : "primary"} small onClick={() => run(asking.action, shown)}>
              {asking.danger ? asking.label : "Đồng ý"}
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
      <div className={ACT}>
        <div className={BUTTONS}>
          {list.map((a) => (
            <Button
              key={a.action}
              kind={a.danger ? "ghost" : a.confirm ? "tonal" : "primary"}
              small
              icon={a.icon}
              disabled={!!(busy ?? a.why)}
              title={busy ?? a.why ?? undefined}
              onClick={() => (a.confirm ? setAsk({ key: shownKey, action: a.action }) : run(a.action, shown))}
            >
              {a.label}
            </Button>
          ))}
          {why === NO_HAMMER && (
            <Button kind="tonal" small icon="cart" onClick={() => shopFor(HAMMER)}>
              Mua búa
            </Button>
          )}
        </div>
        {why && why !== NO_HAMMER && <span className="text-11 text-danger text-right">{why}</span>}
      </div>
    );
  })();
  return (
    <Card
      title="Túi đồ"
      icon="gem"
      bodyClassName={BODY}
      subtitle={bag ? `${num(bag.items.length)}/${num(bag.capacity)} ô · ${worn} món đang mặc` : "Chưa nhận túi đồ"}
      aside={
        <Button
          kind="tonal"
          small
          icon="list"
          disabled={!bag || !!busy}
          title={busy ?? "Dồn các món lên lấp ô trống, như nút Sắp xếp của game"}
          onClick={sort}
        >
          Sắp xếp
        </Button>
      }
    >
      {/* The gear (two columns of slots around the character) beside the bag grid, then the shown item. Narrow cards put the
          bag under the gear. */}
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 [align-items:start] [@container(max-width:560px)]:grid-cols-[minmax(0,1fr)]">
        <section className="grid grid-cols-[auto_minmax(96px,auto)_auto] gap-2 [@container(max-width:560px)]:[justify-content:start]" aria-label="Trang bị đang mặc">
          <div className={COL}>{LEFT.map(gearSlot)}</div>
          <div className="grid justify-items-center content-center gap-1 py-2 px-1.5 bg-bg-2 text-center">
            <Avatar name={account.username} size={44} />
            <b className="max-w-[110px] truncate text-13 text-fg">{c.name}</b>
            <span className="text-11 text-primary px">LV {c.level}</span>
            <ElementTag element={c.element} />
            <GenderTag gender={c.gender} />
          </div>
          <div className={COL}>{RIGHT.map(gearSlot)}</div>
        </section>

        <section aria-label="Túi đồ">
          {bag ? (
            <div className="grid grid-cols-[repeat(auto-fill,44px)] gap-1">
              {Array.from({ length: cells }, (_, n) => slot(`bag-${n}`, bySlot.get(n) ?? null, `Ô ${n + 1}`))}
            </div>
          ) : (
            <p className={NONE}>Server chưa gửi túi đồ (s2c/42).</p>
          )}
        </section>
      </div>

      <ItemDetail item={shown} where={where} element={c.element} gender={c.gender} actions={actions} />
      {menu && menuItem && (
        <Menu x={menu.x} y={menu.y} label={`Món ${menuItem.name}`} items={menuItems(menu.key, menuItem)} onClose={() => setMenu(null)} />
      )}
    </Card>
  );
}
