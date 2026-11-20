import { useEffect, useState } from "react";
import { Avatar } from "@/components/Avatar";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ElementTag } from "@/components/ElementTag";
import type { IconName } from "@/components/Icon";
import { GenderTag } from "@/components/GenderTag";
import { levelsShort, misfit, offElement } from "@/game/gender";
import { FLAG_GLOW, ItemSlot, type SlotFlag } from "@/components/ItemSlot";
import { Menu, type MenuItem } from "@/components/Menu";
import { num } from "@/utils/format";
import { cn } from "@/utils/cn";
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
/** Xóa nhiều: the two lit kinds of gear, in the legend and the quick picks. */
const FLAGS: { flag: SlotFlag; label: string; pick: string }[] = [
  { flag: "gender", label: "Khác giới tính", pick: "đồ khác giới" },
  { flag: "element", label: "Khác hệ", pick: "đồ khác hệ" },
];
/** A square of the legend, as a lit bag square. */
const SWATCH = "inline-block size-[11px] border-2";

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
  // The game 1.1.0 (20/11) sends 10 slots: Giày and Dây chuyền are slots 8 and 9, as their item types.
  8: { label: "Giày", icon: "boot" },
  9: { label: "Dây chuyền", icon: "necklace" },
};
const LEFT = [0, 1, 8, 6, 7];
const RIGHT = [2, 3, 9, 4, 5];
/** Item types worn in a gear slot: 0–7, and Giày (8), Dây chuyền (9) since the game 1.1.0. */
const isGear = (kind: number) => kind <= 9;
type Key = `gear-${number}` | `bag-${number}`;
/** Item types of data/items.json a bag item is used by (Sử dụng): Bình 20, which the server refuses outside a battle
 * (P4), Tăng Kinh Nghiệm 23, Tẩy điểm 24, Trứng 29. Gear is 0–9 (isGear). */
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
export function InventoryCard({
  account,
  onAction,
  onDiscardMany,
}: {
  account: Account;
  onAction: (action: ItemAction, slot: number, uuid?: string) => void;
  /** Xóa nhiều: the bag items picked (gear only), thrown away one after the other by the bot (Bot::discard_many). */
  onDiscardMany: (items: { slot: number; uuid: string }[]) => void;
}) {
  const c = account.character;
  const [pinned, setPinned] = useState<Key | null>(null);
  const [hover, setHover] = useState<Key | null>(null);
  // The question is about the item it showed (uuid), not its slot: the bag changes under it (Tự gộp đá, Tự nhặt đồ).
  const [ask, setAsk] = useState<{ key: Key; action: ItemAction; uuid: string } | null>(null);
  const [menu, setMenu] = useState<{ key: Key; x: number; y: number } | null>(null);
  // Xóa nhiều: on, the bag items picked (slot → the uuid when picked), and whether the last question is up.
  const [picking, setPicking] = useState(false);
  const [chosen, setChosen] = useState<Map<number, string>>(new Map());
  const [askMany, setAskMany] = useState(false);
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
  // Xóa nhiều picks gear of the bag only; another item, or a worn one, cannot be picked.
  const pickable = (k: Key, item: Item | null) => picking && !!item && k.startsWith("bag-");
  const lockedWhy = (item: Item) => (item.kind != null && isGear(item.kind) ? null : "không phải trang bị, không xóa");
  // Xóa nhiều lights up the gear worth throwing away: of the other gender first (it cannot be worn), else of another element.
  const flagOf = (item: Item): SlotFlag | null =>
    lockedWhy(item) ? null : misfit(item, c.gender) ? "gender" : offElement(item, c.element) ? "element" : null;
  const toggle = (item: Item) =>
    setChosen((m) => {
      const next = new Map(m);
      if (next.get(item.slot) === item.uuid) next.delete(item.slot);
      else next.set(item.slot, item.uuid);
      return next;
    });
  const slot = (k: Key, item: Item | null, label: string, placeholder?: IconName, wear?: boolean) => (
    <ItemSlot
      key={k}
      item={item}
      label={label}
      placeholder={placeholder}
      wear={wear}
      misfit={item && !wear ? misfit(item, c.gender) : null}
      charLevel={wear ? null : c.level}
      className={k.startsWith("gear-") ? "[--size:46px]" : undefined}
      active={shownKey === k}
      selected={pickable(k, item) && !!item && chosen.get(item.slot) === item.uuid}
      locked={pickable(k, item) && item ? lockedWhy(item) : null}
      flag={pickable(k, item) && item ? flagOf(item) : null}
      onShow={(on) => setHover((h) => (on ? k : h === k ? null : h))}
      onPick={() => {
        if (pickable(k, item) && item) {
          setAskMany(false);
          if (!lockedWhy(item)) toggle(item);
          return;
        }
        setPinned((p) => (p === k ? null : k));
      }}
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
    // Gear above the character's level: the button says how many levels it lacks.
    if (item.kind != null && isGear(item.kind)) {
      const short = levelsShort(item, c.level);
      const why = misfit(item, c.gender) ?? (short ? `cần cấp ${item.level}, thiếu ${short} cấp` : null);
      return [{ action: "equip", label: "Mặc", icon: "login", why }, discard];
    }
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
    onAction(action, item.slot, item.uuid);
    // Worn, the item sits in the gear slot of its type; taken off, in a bag slot the server picks.
    if (action === "equip" && item.kind != null) setPinned(`gear-${item.kind}`);
    if (action === "unequip" || action === "discard") setPinned(null);
  };
  // The items still picked: in their slot with the uuid they had when picked (the bag changes under the window).
  const picked = [...chosen].flatMap(([slot, uuid]) => {
    const item = bySlot.get(slot);
    return item && item.uuid === uuid && !lockedWhy(item) ? [item] : [];
  });
  const gearInBag = (bag?.items ?? []).filter((i) => !lockedWhy(i));
  const flagged = (f: SlotFlag) => gearInBag.filter((i) => flagOf(i) === f);
  /** Chọn đồ khác giới / khác hệ: those added to the picks, or taken out when all of them are picked already. */
  const pickFlagged = (items: Item[]) =>
    setChosen((m) => {
      const next = new Map(m);
      const all = items.every((i) => next.get(i.slot) === i.uuid);
      for (const i of items) {
        if (all) next.delete(i.slot);
        else next.set(i.slot, i.uuid);
      }
      return next;
    });
  const stopPicking = () => {
    setPicking(false);
    setChosen(new Map());
    setAskMany(false);
  };
  const discardMany = () => {
    setSent(sig);
    setPinned(null);
    onDiscardMany(picked.map((i) => ({ slot: i.slot, uuid: i.uuid })));
    stopPicking();
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
      onSelect: () => (a.confirm ? setAsk({ key: k, action: a.action, uuid: item.uuid }) : run(a.action, item)),
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
    // Another item in the slot by now: the question is gone with the item it was about.
    const asking = ask?.key === shownKey && ask.uuid === shown.uuid ? list.find((a) => a.action === ask.action) : undefined;
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
              onClick={() => (a.confirm ? setAsk({ key: shownKey, action: a.action, uuid: shown.uuid }) : run(a.action, shown))}
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
        <div className={BUTTONS}>
          <Button
            kind={picking ? "primary" : "ghost"}
            small
            icon="trash"
            disabled={!bag}
            title={picking ? "Thôi chọn" : "Chọn nhiều trang bị trong túi rồi vứt bỏ một lượt; vật phẩm khác không chọn được"}
            onClick={() => (picking ? stopPicking() : (setPicking(true), setMenu(null), setAsk(null)))}
          >
            {picking ? "Xong" : "Xóa nhiều"}
          </Button>
          <Button
            kind="tonal"
            small
            icon="list"
            disabled={!bag || !!busy || picking}
            title={picking ? "Đang chọn để xóa nhiều" : busy ?? "Dồn các món lên lấp ô trống, như nút Sắp xếp của game"}
            onClick={sort}
          >
            Sắp xếp
          </Button>
        </div>
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

      {picking && (
        <div className="flex flex-wrap items-center justify-between gap-2 py-2 px-2.5 border-2 border-danger bg-bg-2" role="region" aria-label="Xóa nhiều">
          {askMany ? (
            <>
              <span className="text-12 text-fg">
                Vứt bỏ {picked.length} trang bị: {picked.map((i) => i.name).join(", ")}? Mất hẳn, không lấy lại được.
              </span>
              <div className={BUTTONS}>
                <Button kind="danger" small icon="trash" disabled={!!busy || !picked.length} title={busy ?? undefined} onClick={discardMany}>
                  Vứt {picked.length} món
                </Button>
                <Button kind="ghost" small onClick={() => setAskMany(false)}>
                  Huỷ
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-1">
                <span className="text-12 text-fg-2">
                  Bấm vào trang bị trong túi để chọn ({picked.length}/{gearInBag.length} đã chọn). Vật phẩm, đá, bình không chọn được.
                </span>
                <span className="flex flex-wrap gap-x-3 gap-y-1 text-11 text-fg-2">
                  {FLAGS.map(({ flag, label }) => (
                    <span key={flag} className="inline-flex items-center gap-1">
                      <i className={cn(SWATCH, FLAG_GLOW[flag], "border-(--glow) shadow-[0_0_6px_1px_var(--glow)]")} />
                      {label} ({flagged(flag).length})
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-1">
                    <i className={cn(SWATCH, "border-danger bg-danger/25")} />
                    Đã chọn ({picked.length})
                  </span>
                </span>
              </div>
              <div className={cn(BUTTONS, "flex-wrap")}>
                {FLAGS.map(({ flag, pick }) => {
                  const items = flagged(flag);
                  const all = items.length > 0 && items.every((i) => chosen.get(i.slot) === i.uuid);
                  return (
                    <Button key={flag} kind="ghost" small disabled={!items.length} onClick={() => pickFlagged(items)}>
                      {all ? "Bỏ chọn" : "Chọn"} {pick} ({items.length})
                    </Button>
                  );
                })}
                <Button
                  kind="ghost"
                  small
                  disabled={!gearInBag.length}
                  onClick={() => setChosen(picked.length === gearInBag.length ? new Map() : new Map(gearInBag.map((i) => [i.slot, i.uuid])))}
                >
                  {picked.length === gearInBag.length && gearInBag.length > 0 ? "Bỏ chọn hết" : "Chọn hết trang bị"}
                </Button>
                <Button kind="danger" small icon="trash" disabled={!picked.length || !!busy} title={busy ?? undefined} onClick={() => setAskMany(true)}>
                  Xóa {picked.length} món…
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      <ItemDetail item={shown} where={where} element={c.element} gender={c.gender} level={c.level} actions={actions} />
      {menu && menuItem && (
        <Menu x={menu.x} y={menu.y} label={`Món ${menuItem.name}`} items={menuItems(menu.key, menuItem)} onClose={() => setMenu(null)} />
      )}
    </Card>
  );
}
