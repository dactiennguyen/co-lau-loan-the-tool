import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/api";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Icon } from "@/components/Icon";
import { CheckRow } from "@/components/CheckRow";
import { Hint } from "@/components/Hint";
import { SETTING_FACT, SETTING_FACT_BAD, SettingRow } from "@/components/SettingRow";
import { Stepper } from "@/components/Stepper";
import { FilterChip } from "@/components/FilterChip";
import { cn } from "@/utils/cn";
import { num } from "@/utils/format";
import { useStore } from "@/store";
import { GENDER_ICON, GENDER_WORD, misfit } from "@/game/gender";
import { ELEMENTS } from "@/game/potentials";
import { stoneCounts } from "@/game/shops";
import type { Account, FightSettings, Item } from "@/api/types";

/** Item id of the Búa Sửa Chữa. */
const HAMMER = 2;

/**
 * Cài đặt tab: what the bot does on its own around the battles it plays (FightSettings of cllt-core), per account. A
 * change is saved to accounts.json and reaches a session at once; it shows as chosen while it saves. Beside Tự sửa đồ,
 * once in the game: the hammers of the bag and the worn items that are broken, with Mua búa when none is left (the bot
 * never buys one itself). Tự nhặt đồ is on unless turned off, and so are Nhặt cả đồ người khác (what others left, once
 * anyone may have it) and Nhặt cả đồ khác giới tính under it; Chỉ nhặt trang bị đúng hệ is off unless turned on, and
 * Phẩm chất trang bị nhặt has its four boxes ticked unless unticked. Dùng bình trong trận holds Bình máu and Bình mana
 * under its ▾, both off unless ticked, each with Tối đa/trận and Giữ lại (1 and 30, 2 and 30), and Mua bình once the bag
 * holds no more than it keeps (the bot never buys one). Tự gộp đá khi túi đầy is off unless turned on, with Gộp tới (Đá
 * cấp 2–12, Max by default) and the minutes between two trips (5) under its ▾. Lưu dữ liệu trận is not here: it is the same for every account,
 * in the Cài đặt of the app (SettingsDialog).
 */
/** Whether the settings under Tự nhặt đồ are shown, the same for every account; kept in localStorage. */
const PICKUP_OPEN = "pickupOptionsOpen";

/** The boxes of Phẩm chất trang bị nhặt, Thường to Sử Thi (items::QUALITY_NAMES of cllt-core: field4 of the item record
 * 0–3), each name in the colour the phone gives it where it is known (Hiếm green, Sử Thi purple, as in Chợ trời). */
const QUALITIES = [
  { key: "pickupCommon", name: "Thường", className: "" },
  { key: "pickupRare", name: "Hiếm", className: "text-good" },
  { key: "pickupPrecious", name: "Quý", className: "" },
  { key: "pickupEpic", name: "Sử Thi", className: "text-piece-yinyang" },
] as const;

/** Whether the potions under Dùng bình trong trận are shown, the same for every account; kept in localStorage. */
const POTIONS_OPEN = "potionOptionsOpen";
/** Likewise the numbers under Tự gộp đá khi túi đầy. */
const MERGE_OPEN = "mergeOptionsOpen";
/** Gộp tới at its Max: Đá cấp 12, the highest stone. */
const MERGE_MAX = 12;
/** The most of Mỗi lần sang cách nhau ít nhất, in minutes (MERGE_EVERY_MAX of cllt-core). */
const MERGE_EVERY_MAX = 120;
/** The most potions a battle (POTION_MAX of cllt-core). */
const POTION_MAX = 10;

/** The two potions of Dùng bình trong trận (Bot::battle_potions of cllt-core): the item id and name, its three settings,
 * its word, icon and colour (máu red as the HP bar, mana blue as the drop piece; `factTone` over the grey icons of
 * SETTING_FACT), and when the bot drinks it. */
const POTION_ROWS = [
  {
    item: 0,
    on: "hpPotion",
    max: "hpPotionMax",
    keep: "hpPotionKeep",
    icon: "heart",
    word: "Máu",
    tone: "text-hp",
    factTone: "text-hp!",
    name: "Hoàn Linh Dược",
    when: "khi sắp chết",
  },
  {
    item: 1,
    on: "mpPotion",
    max: "mpPotionMax",
    keep: "mpPotionKeep",
    icon: "drop",
    word: "Mana",
    tone: "text-piece-drop",
    factTone: "text-piece-drop!",
    name: "Kim Đan Dược",
    when: "khi kỹ năng cần nội lực",
  },
] as const;

/** How long after the last change a number of the potion rows is saved (as useFightSetting): a typed number changes on
 * every key, and each save is a line of the log. */
const QUIET = 500;

/** The numbers set_fight of src-tauri keeps within bounds. The copy shown while saving is bounded the same way, or a
 * number out of range in accounts.json (a hand-edited or imported file) would never match the account that comes back,
 * and the card would keep its copy. */
const BOUNDS = [
  ["hpPotionMax", 1, POTION_MAX],
  ["mpPotionMax", 1, POTION_MAX],
  ["mergeUpTo", 2, MERGE_MAX],
  ["mergeEvery", 1, MERGE_EVERY_MAX],
] as const;
const bounded = (s: FightSettings): FightSettings => {
  const next = { ...s };
  for (const [key, min, max] of BOUNDS) next[key] = Math.min(max, Math.max(min, next[key]));
  return next;
};

/** The settings this card changes: the box shows the one being saved until the account comes back with it. */
const KEYS = [
  "repair",
  "pickup",
  "pickupOthers",
  "pickupOtherGender",
  "pickupOwnElement",
  ...QUALITIES.map((q) => q.key),
  ...POTION_ROWS.flatMap((r) => [r.on, r.max, r.keep]),
  "autoMerge",
  "mergeUpTo",
  "mergeEvery",
] as const;
export function FightSettingsCard({ account }: { account: Account }) {
  const c = account.character;
  const saved = account.fightSettings;
  const open = useStore((s) => s.open);
  const id = useId();
  const [saving, setSaving] = useState<FightSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The settings of Tự nhặt đồ fold under it, closed until opened once.
  const [pickupOpen, setPickupOpen] = useState(() => localStorage.getItem(PICKUP_OPEN) === "1");
  const togglePickup = () =>
    setPickupOpen((was) => {
      localStorage.setItem(PICKUP_OPEN, was ? "0" : "1");
      return !was;
    });
  // Likewise the numbers of Tự gộp đá khi túi đầy.
  const [mergeOpen, setMergeOpen] = useState(() => localStorage.getItem(MERGE_OPEN) === "1");
  const toggleMerge = () =>
    setMergeOpen((was) => {
      localStorage.setItem(MERGE_OPEN, was ? "0" : "1");
      return !was;
    });
  // Likewise the two potions under Dùng bình trong trận.
  const [potionsOpen, setPotionsOpen] = useState(() => localStorage.getItem(POTIONS_OPEN) === "1");
  const togglePotions = () =>
    setPotionsOpen((was) => {
      localStorage.setItem(POTIONS_OPEN, was ? "0" : "1");
      return !was;
    });
  // Kept until the account comes back with it, so the box does not flick back between the answer and the update. The
  // other boxes stay usable meanwhile: a save sends only what changed (with the numbers still waiting), src-tauri lays it
  // over the settings as they are then, one save after another, so none is lost, and nothing on the card dims at each
  // click.
  useEffect(() => {
    if (saving && KEYS.every((k) => saving[k] === saved[k])) {
      setSaving(null);
    }
  }, [saving, saved]);
  const settings = saving ?? saved;
  // A number is saved QUIET ms after its last change (`quiet`), a box at once with any number still waiting, and a
  // number still waiting when the card closes.
  const pending = useRef<{ id: number; patch: Partial<FightSettings> } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const send = (patch: Partial<FightSettings>) => {
    window.clearTimeout(timer.current);
    pending.current = null;
    api.setFight(account.id, patch).catch((err) => {
      setSaving(null);
      setError(String(err?.message ?? err));
    });
  };
  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      const p = pending.current;
      if (p) api.setFight(p.id, p.patch).catch(() => {});
    },
    [account.id],
  );
  const save = (raw: FightSettings, quiet = false) => {
    const next = bounded(raw);
    // What this click or number changed against the card as shown, with the numbers still waiting to go.
    const patch: Partial<FightSettings> = { ...(pending.current?.id === account.id ? pending.current.patch : {}) };
    for (const k of KEYS) if (next[k] !== settings[k]) Object.assign(patch, { [k]: next[k] });
    setSaving(next);
    setError(null);
    if (!quiet) return send(patch);
    pending.current = { id: account.id, patch };
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => send(patch), QUIET);
  };
  const hammers = c?.bag?.items.filter((i) => i.id === HAMMER).reduce((n, i) => n + Math.max(1, i.quantity), 0) ?? 0;
  const broken = (c?.gear ?? []).filter((g): g is Item & { durability: [number, number] } => g?.durability?.[0] === 0);
  const unwearable = c?.bag?.items.filter((i) => misfit(i, c.gender)).length ?? 0;
  const element = c?.element != null ? ELEMENTS[c.element] : undefined;
  const offElement = c?.bag?.items.filter((i) => i.element != null && i.element !== c.element).length ?? 0;
  const ticked = QUALITIES.filter((q) => settings[q.key]).length;
  const held = (item: number) => c?.bag?.items.filter((i) => i.id === item).reduce((n, i) => n + i.quantity, 0);
  const bag = c?.bag;
  const bagFull = !!bag && bag.items.length >= bag.capacity;
  const lockedStones = bag ? stoneCounts(bag.items).reduce((n, [locked]) => n + locked, 0) : 0;
  return (
    <Card title="Cài đặt đánh" icon="settings" tone="var(--primary)" subtitle="Bot làm theo khi tự đánh quái và tự làm nhiệm vụ">
      <SettingRow
        id={`${id}repair`}
        on={settings.repair}
        onChange={(repair) => save({ ...settings, repair })}
        icon="hammer"
        title="Tự sửa đồ"
        hint="Trước mỗi trận, món đang mặc bị hỏng (độ bền 0) được sửa bằng Búa Sửa Chữa trong túi, mỗi lần 1 búa. Hết búa thì vẫn đánh tiếp, bot không tự mua búa."
      >
        {c && (
          <>
            <span className={SETTING_FACT}>
              <Icon name="hammer" size={12} />
              Búa trong túi <b className="px">{num(hammers)}</b>
            </span>
            <span className={cn(SETTING_FACT, broken.length > 0 && SETTING_FACT_BAD)}>
              <Icon name={broken.length ? "close" : "check"} size={12} />
              {broken.length ? `Đang hỏng: ${broken.map((g) => `${g.name} 0/${g.durability[1]}`).join(", ")}` : "Không có món nào hỏng"}
            </span>
            {hammers === 0 && (
              <Button kind="outline" small icon="cart" onClick={() => open({ kind: "shop", id: account.id, item: HAMMER })}>
                Mua búa
              </Button>
            )}
          </>
        )}
      </SettingRow>
      {/* Both potions under one row: its box-less head lights while either is on; folded, what each does. */}
      <SettingRow
        id={`${id}potions`}
        on={POTION_ROWS.some((r) => settings[r.on])}
        icon="heart"
        title="Dùng bình trong trận"
        hint="Bot tự uống bình trong túi khi đánh (mỗi bình mất một lượt), không tự mua. Bình máu (Hoàn Linh Dược, hồi 25% máu tối đa): uống khi sắp chết, lúc nước tiếp của quái có thể kết thúc trận, thường khi còn khoảng 15–20% máu. Bình mana (Kim Đan Dược, +25 nội lực): uống khi kỹ năng đã học cần nội lực hơn là đổi viên, có kỹ năng gây sát thương thì gần như trận nào cũng uống đủ số tối đa. Mỗi loại có số bình tối đa mỗi trận và số bình giữ lại trong túi: túi chỉ còn bằng số giữ lại thì không uống loại đó nữa. Trận tính giờ không dùng bình. Mặc định tắt cả hai; bấm ▾ để chọn."
        expand={{ open: potionsOpen, onToggle: togglePotions, controls: `${id}potions-options` }}
      >
        {!potionsOpen &&
          POTION_ROWS.map((r) => {
            const have = held(r.item);
            const out = settings[r.on] && have !== undefined && have <= settings[r.keep];
            return (
              <span key={r.item} className={cn(SETTING_FACT, out && SETTING_FACT_BAD, out && "[&_b]:text-danger")}>
                <Icon name={r.icon} size={12} className={cn(settings[r.on] && !out && r.factTone)} />
                {r.word}
                {settings[r.on] ? (
                  <>
                    {" "}
                    <b className="px">{settings[r.max]}</b>/trận · giữ <b className="px">{num(settings[r.keep])}</b>
                    {out && " · hết bình để dùng"}
                  </>
                ) : (
                  " tắt"
                )}
              </span>
            );
          })}
      </SettingRow>
      {/* One block per potion, indented under it, folded until its ▾ opens them: its box and what the bag holds, then its
          two numbers. The numbers can be set while it is off. */}
      <div id={`${id}potions-options`} className="ml-6 grid gap-1" hidden={!potionsOpen} role="group" aria-labelledby={`${id}potions-title`}>
        {POTION_ROWS.map((r) => {
          const on = settings[r.on];
          const have = held(r.item);
          // On, and the bag holds no more than it keeps: the bot drinks none of it until more are bought.
          const out = on && have !== undefined && have <= settings[r.keep];
          return (
            <div key={r.item} className={cn("@container grid gap-1.5 px-3 py-2 bg-ink", on && "shadow-[inset_3px_0_0_var(--good)]")}>
              {/* Its box, icon, name and when it is drunk; at the right, what the bag holds of it. */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <CheckRow checked={on} onChange={(v) => save({ ...settings, [r.on]: v })} className="gap-2.5">
                  <span className={cn("grid place-items-center size-[22px] bg-card", r.tone)} aria-hidden="true">
                    <Icon name={r.icon} size={13} />
                  </span>
                  <span className="text-13 font-extrabold text-fg">Bình {r.word.toLowerCase()}</span>
                  <span className="text-[11.5px] text-fg-3">{r.when}</span>
                </CheckRow>
                {have !== undefined && (
                  <span className="ml-auto flex flex-wrap items-center justify-end gap-x-2.5 gap-y-1 text-[11.5px]">
                    <span className={cn(SETTING_FACT, out && SETTING_FACT_BAD, out && "[&_b]:text-danger")}>
                      {r.name} trong túi <b className="px">{num(have)}</b>
                      {out && " · đã tới số giữ lại"}
                    </span>
                    {out && (
                      <Button kind="outline" small icon="cart" onClick={() => open({ kind: "shop", id: account.id, item: r.item })}>
                        Mua bình
                      </Button>
                    )}
                  </span>
                )}
              </div>
              {/* Its two numbers under its name, side by side; one above the other, in one column, when the card is narrow. */}
              <div className="grid grid-cols-[repeat(2,auto_auto)] justify-start items-center gap-x-2 gap-y-1.5 pl-[58px] text-12 text-fg-2 [@container(max-width:520px)]:grid-cols-[auto_auto]">
                <span>Tối đa mỗi trận</span>
                <Stepper value={settings[r.max]} min={1} max={POTION_MAX} label={`số ${r.name} tối đa mỗi trận`} onChange={(v) => save({ ...settings, [r.max]: v }, true)} />
                <span className="pl-5 [@container(max-width:520px)]:pl-0">Giữ lại trong túi</span>
                <Stepper value={settings[r.keep]} min={0} max={9999} label={`số ${r.name} giữ lại trong túi`} onChange={(v) => save({ ...settings, [r.keep]: v }, true)} />
              </div>
            </div>
          );
        })}
      </div>
      <SettingRow
        id={`${id}pickup`}
        on={settings.pickup}
        onChange={(pickup) => save({ ...settings, pickup })}
        icon="gem"
        title="Tự nhặt đồ"
        hint="Sau mỗi trận thắng, bot nhặt ngay đồ của mình vừa rơi (Xu khóa, đá, trang bị…) từ chỗ đang đứng, không cần đi tới hòm. Đồ nhặt được ghi ở Nhật ký, loại Vật phẩm. Bấm ▾ cạnh tên để xem các tuỳ chọn của nó."
        expand={{ open: pickupOpen, onToggle: togglePickup, controls: `${id}pickup-options` }}
      >
        {/* Folded, how many of its three settings are on, and how many qualities are ticked. */}
        {!pickupOpen && (
          <span className={SETTING_FACT}>
            <Icon name="list" size={12} />
            <b className="px">{[settings.pickupOthers, settings.pickupOtherGender, settings.pickupOwnElement].filter(Boolean).length}</b>/3 tuỳ chọn bật ·
            phẩm chất <b className="px">{ticked}</b>/4
          </span>
        )}
      </SettingRow>
      {/* Part of Tự nhặt đồ: indented under it, greyed while it is off, folded until its ▾ opens it. */}
      <div id={`${id}pickup-options`} className="ml-6" hidden={!pickupOpen}>
        <SettingRow
          id={`${id}others`}
          on={settings.pickupOthers}
          disabled={!settings.pickup}
          onChange={(pickupOthers) => save({ ...settings, pickupOthers })}
          icon="users"
          title="Nhặt cả đồ người khác"
          hint="Server giữ đồ rơi cho người làm rơi khoảng 16–17 giây, sau đó ai cũng nhặt được. Bật: sau mỗi trận thắng, nhặt xong đồ của mình thì bot nhặt thêm đồ người khác bỏ lại trong khu đang đứng, món nằm từ 18 giây trở lên, cũ trước, tối đa 8 món mỗi trận. Xu khóa luôn nhặt; món khác chỉ khi túi còn ô trống. Nhật ký ghi Nhặt được đồ người khác bỏ lại; các món này không tính vào đồ rơi của quái ở Thống kê."
        />
        <SettingRow
          id={`${id}gender`}
          on={settings.pickupOtherGender}
          disabled={!settings.pickup}
          onChange={(pickupOtherGender) => save({ ...settings, pickupOtherGender })}
          icon={c?.gender != null && GENDER_ICON[c.gender] ? GENDER_ICON[1 - c.gender] : "swap"}
          title="Nhặt cả đồ khác giới tính"
          hint="Nhiều trang bị có hai bản cùng tên, một cho nhân vật nam, một cho nữ; đồ rơi có thể là bản kia, nhân vật không mặc được (game báo Trang bị không phù hợp). Bật: vẫn nhặt để bán ở Chợ trời. Tắt: bỏ lại dưới đất, Nhật ký ghi Bỏ qua. Vũ khí, nhẫn và đồ không phải trang bị luôn được nhặt."
        >
          {c?.gender != null && GENDER_WORD[c.gender] && (
            <span className={SETTING_FACT}>
              <Icon name={GENDER_ICON[c.gender]} size={12} />
              Nhân vật {GENDER_WORD[c.gender]}
              {unwearable > 0 && (
                <>
                  {" "}
                  · trong túi <b className="px">{num(unwearable)}</b> món không mặc được
                </>
              )}
            </span>
          )}
        </SettingRow>
        <SettingRow
          id={`${id}element`}
          on={settings.pickupOwnElement}
          disabled={!settings.pickup}
          onChange={(pickupOwnElement) => save({ ...settings, pickupOwnElement })}
          icon="yinyang"
          title="Chỉ nhặt trang bị đúng hệ"
          hint="Trang bị rơi có hệ Hỏa, Lôi hoặc Thủy, cùng một món có thể ra nhiều hệ; đúng hệ nhân vật thì thêm chỉ số. Bật: trang bị khác hệ để lại dưới đất, Nhật ký ghi Bỏ qua. Tắt: nhặt trang bị mọi hệ (để bán ở Chợ trời). Đồ không phải trang bị (Xu khóa, đá, nguyên liệu…) luôn được nhặt."
        >
          {element && (
            <span className={SETTING_FACT}>
              <Icon name="yinyang" size={12} />
              Nhân vật hệ {element}
              {offElement > 0 && (
                <>
                  {" "}
                  · trong túi <b className="px">{num(offElement)}</b> trang bị khác hệ
                </>
              )}
            </span>
          )}
        </SettingRow>
        {/* Four boxes on one row, not Bật/Tắt, its icon at the left edge (no box of its own): green while any is ticked. */}
        <div className={cn("@container grid bg-ink", ticked > 0 && "shadow-[inset_3px_0_0_var(--good)]")}>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 px-3 py-1.5">
            <span className="flex items-center gap-2.5 py-1">
              <span className={cn("grid place-items-center size-[26px] text-fg-2 bg-card", ticked > 0 && "text-ink bg-good bevel-sm")} aria-hidden="true">
                <Icon name="star" size={14} />
              </span>
              <span id={`${id}quality`} className="text-13 font-extrabold text-fg">
                Phẩm chất trang bị nhặt
              </span>
            </span>
            <Hint label="Phẩm chất trang bị nhặt là gì?" id={`${id}quality-hint`}>
              Trang bị rơi có một trong bốn phẩm chất: Thường, Hiếm, Quý, Sử Thi (chạm vào hòm trong game sẽ thấy). Bot chỉ nhặt trang bị có phẩm chất được tích, mặc định tích cả bốn. Bỏ tích một phẩm chất thì trang bị phẩm chất đó để lại dưới đất, Nhật ký ghi Bỏ qua. Đồ không phải trang bị (Xu khóa, đá, nguyên liệu…) luôn được nhặt.
            </Hint>
            <span
              role="group"
              aria-labelledby={`${id}quality`}
              aria-describedby={`${id}quality-hint`}
              className="flex-1 flex flex-wrap items-center justify-end gap-x-4 gap-y-1 py-1"
            >
              {QUALITIES.map((q) => (
                <CheckRow key={q.key} checked={settings[q.key]} disabled={!settings.pickup} onChange={(on) => save({ ...settings, [q.key]: on })}>
                  <span className={cn("font-bold", q.className)}>{q.name}</span>
                </CheckRow>
              ))}
            </span>
          </div>
        </div>
      </div>
      <SettingRow
        id={`${id}merge`}
        on={settings.autoMerge}
        onChange={(autoMerge) => save({ ...settings, autoMerge })}
        icon="grid"
        title="Tự gộp đá khi túi đầy"
        hint="Khi đang Tự đánh quái mà túi đầy hẳn (không còn ô trống), trước trận kế tiếp bot sang Làng Thanh Khê nhờ Pháp sư gộp đá: mỗi 4 viên đá khoá cùng cấp thành 1 viên cấp trên (tỉ lệ 100%, giữ nguyên giá trị khi nâng cấp), túi trống thêm 3 ô; đá vừa ra được gộp tiếp tới cấp đã chọn. Bot tính phí trước và chỉ trả bằng Xu khóa, không bao giờ dùng Xu: Xu khóa không đủ cho bộ nào thì không sang, đủ một phần thì gộp các bộ rẻ (cấp thấp) trước. Đá chưa khoá (mua bằng Lượng, bán được) giữ nguyên. Gộp xong bot quay về đúng map và khu cũ đánh tiếp. Hai lần sang cách nhau ít nhất số phút đã chọn; trong lúc đó túi đầy thì bot vẫn đánh, đồ rơi (trừ Xu khóa) để lại dưới đất. Mặc định tắt; bấm ▾ để chọn cấp và số phút."
        expand={{ open: mergeOpen, onToggle: toggleMerge, controls: `${id}merge-options` }}
      >
        {bag && (
          <span className={cn(SETTING_FACT, bagFull && SETTING_FACT_BAD, bagFull && "[&_b]:text-danger")}>
            <Icon name="gem" size={12} />
            Túi <b className="px">{bag.items.length}</b>/{bag.capacity} · <b className="px">{num(lockedStones)}</b> đá khoá
          </span>
        )}
        {!mergeOpen && (
          <span className={SETTING_FACT}>
            <Icon name="list" size={12} />
            tới Đá <b className="px">{Math.min(settings.mergeUpTo, MERGE_MAX)}</b>
            {settings.mergeUpTo >= MERGE_MAX && " (Max)"} · <b className="px">{settings.mergeEvery}</b> phút
          </span>
        )}
      </SettingRow>
      {/* Its two numbers, indented under it, folded until its ▾ opens them; they can be set while it is off. */}
      <div id={`${id}merge-options`} className="ml-6" hidden={!mergeOpen}>
        <div className={cn("grid grid-cols-[auto_auto_auto] justify-start items-center gap-x-2 gap-y-1.5 px-3 py-2 bg-ink text-12 text-fg-2", settings.autoMerge && "shadow-[inset_3px_0_0_var(--good)]")}>
          <span>Gộp tới Đá cấp</span>
          <Stepper value={settings.mergeUpTo} min={2} max={MERGE_MAX} label="cấp đá cao nhất được gộp ra" onChange={(v) => save({ ...settings, mergeUpTo: v }, true)} />
          <FilterChip on={settings.mergeUpTo >= MERGE_MAX} onClick={() => save({ ...settings, mergeUpTo: MERGE_MAX })}>
            Max
          </FilterChip>
          <span>Mỗi lần sang cách nhau ít nhất</span>
          <Stepper value={settings.mergeEvery} min={1} max={MERGE_EVERY_MAX} label="số phút giữa hai lần sang gộp đá" onChange={(v) => save({ ...settings, mergeEvery: v }, true)} />
          <span>phút</span>
        </div>
      </div>
      {error && (
        <p className="text-[11.5px] text-danger select-text" role="alert">
          Chưa lưu được: {error}
        </p>
      )}
    </Card>
  );
}
