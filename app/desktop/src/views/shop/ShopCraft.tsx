import { useId, useState } from "react";
import { api } from "@/api";
import { cn } from "@/utils/cn";
import { Button } from "@/components/Button";
import { FilterChip } from "@/components/FilterChip";
import { Hint } from "@/components/Hint";
import { num } from "@/utils/format";
import { recalled, remember } from "@/utils/remember";
import { CRAFT_KINDS, ICE, roman } from "@/game/shops";
import type { Recipe } from "@/api/types";
import { SHOP, type ShopContext } from "./ShopModal";

/** The item kind of Chế tạo trang bị shown last. */
const KIND_KEY = "shop.craftKind";
/** A row of a recipe: the tier and level, the materials, the Xu, the button. */
const ROW = "grid grid-cols-[110px_minmax(0,1fr)_auto_auto] items-center gap-2.5 px-2 py-1.5 bg-bg-2 border-2 border-line text-12";
/** One of Chế tạo trang bị, Đổi Băng Tâm. */
const PART = "grid [align-content:start] gap-2 px-2.5 py-2 bg-bg-2/40 border-2 border-line";

/** "21:04". */
const clock = (ms: number) => new Date(ms).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

/**
 * Chế tạo of Pháp sư (16-upgrade.md#chế-tạo, O1). Chế tạo trang bị: the recipes of an item kind are read from Pháp sư's
 * menu first (Xem công thức, free), then a tier is made with its materials and Xu (SmithTask::Craft); the bot puts each
 * material with its whole stack, as the phone, and the server takes the count. Đổi Băng Tâm lấy bình rỗng: 8 Băng Tâm
 * for a Bình Huyết Linh (Rỗng), exchanged as soon as its line is picked. Every spend asks once more.
 */
export function ShopCraft({ account, why, ask, track }: ShopContext) {
  const c = account.character!;
  // Nhẫn until another kind is picked: the one measured (O1).
  const [kind, setKind] = useState(() => {
    const k = Number(recalled(KIND_KEY) ?? 3);
    return k >= 0 && k <= 3 ? k : 3;
  });
  const pick = (k: number) => {
    setKind(k);
    remember(KIND_KEY, String(k));
  };
  const read = c.recipes.find((r) => r.kind === kind) ?? null;
  const items = c.bag?.items ?? [];
  // The largest stack of a material, which must hold the count (the client puts one stack).
  const stack = (name: string) => items.filter((i) => i.name === name).reduce((n, i) => Math.max(n, i.quantity), 0);
  const xu = c.currencies?.xu ?? 0;
  const free = c.bag ? c.bag.capacity - c.bag.items.length : 0;
  const problems = (r: Recipe) => [
    ...(c.level < r.level ? [`cần cấp ${r.level}`] : []),
    ...r.materials.filter((m) => stack(m.name) < m.count).map((m) => `thiếu ${m.name}`),
    ...(xu < r.xu ? ["thiếu Xu"] : []),
    ...(free < 1 ? ["túi đầy"] : []),
  ];
  const ice = items.filter((i) => i.id === ICE.iceId).reduce((n, i) => n + i.quantity, 0);
  const bottles = items.filter((i) => i.id === ICE.bottleId).reduce((n, i) => n + i.quantity, 0);
  const all = Math.floor(ice / ICE.perBottle);
  const hint = useId();
  const name = CRAFT_KINDS[kind];

  return (
    <div className={SHOP.tab}>
      <div className={PART}>
        <div className={SHOP.lead}>
          <b className={SHOP.leadTitle}>Chế tạo trang bị</b>
          <Hint label="Chế tạo trang bị là gì?" id={`${hint}-what`}>
            Pháp sư làm một món Nón, Áo, Vũ khí hay Nhẫn theo bậc, từ nguyên liệu (Quặng, Linh Thạch) và Xu. Mỗi bậc cần cấp nhân
            vật riêng. Bấm Xem công thức để Pháp sư báo nguyên liệu từng bậc (miễn phí, không đặt gì). Bot đặt nguyên liệu như máy:
            cả chồng một lần, server chỉ lấy đủ số cần. O1 làm Nhẫn Bậc I (24 Quặng Bậc 1, 24 Linh Thạch Bậc 1, 2.400 Xu) ra Nhẫn
            Thái Cực.
          </Hint>
        </div>
        <div className={SHOP.chips} role="group" aria-label="Loại món">
          {CRAFT_KINDS.map((label, k) => (
            <FilterChip key={label} on={kind === k} onClick={() => pick(k)}>
              {label}
            </FilterChip>
          ))}
          <Button
            small
            kind="outline"
            icon="eye"
            disabled={!!why}
            onClick={() => {
              track();
              api.smithCraft(account.id, kind, null);
            }}
          >
            Xem công thức {name} (miễn phí)
          </Button>
        </div>
        {!read ? (
          <p className={SHOP.note}>Chưa xem công thức {name}. Pháp sư báo nguyên liệu và Xu từng bậc khi bấm Xem công thức.</p>
        ) : read.recipes.length === 0 ? (
          <p className={SHOP.note}>Menu {name} của Pháp sư không có công thức nào đọc được.</p>
        ) : (
          <div className="grid gap-1" role="list" aria-label={`Công thức ${name}`}>
            {read.recipes.map((r) => {
              const bad = problems(r);
              return (
                <div key={r.tier} className={ROW} role="listitem">
                  <span>
                    <b className="text-fg">Bậc {roman(r.tier)}</b>
                    <span className={cn("block text-11", c.level < r.level ? "text-danger" : "text-fg-3")}>cần cấp {r.level}</span>
                  </span>
                  <span className="grid text-11 text-fg-2">
                    {r.materials.map((m) => (
                      <span key={m.name} className={stack(m.name) < m.count ? "text-danger" : undefined}>
                        {m.name}: <b className="px text-11">{num(stack(m.name))}</b>/{m.count}
                      </span>
                    ))}
                  </span>
                  <span className={cn("whitespace-nowrap", xu < r.xu ? SHOP.costShort : "text-fg-2")}>
                    <b className={SHOP.costFig}>{num(r.xu)}</b> Xu
                  </span>
                  <Button
                    small
                    kind="primary"
                    icon="flame"
                    disabled={!!why || bad.length > 0}
                    title={bad.join(", ") || undefined}
                    onClick={() =>
                      ask({
                        title: `Chế tạo ${name} Bậc ${roman(r.tier)}`,
                        message: `Pháp sư lấy ${r.materials.map((m) => `${m.count} ${m.name}`).join(", ")} và ${num(r.xu)} Xu, cho 1 món ${name} bậc ${r.level}. Không lấy lại được nguyên liệu.`,
                        confirm: `Chế tạo, ${num(r.xu)} Xu`,
                        icon: "flame",
                        run: () => api.smithCraft(account.id, kind, r.tier),
                      })
                    }
                  >
                    Chế tạo
                  </Button>
                </div>
              );
            })}
            <span className="text-11 text-fg-3">Đọc lúc {clock(read.readAt)}. Túi còn {free} ô trống.</span>
          </div>
        )}
      </div>

      <div className={PART}>
        <div className={SHOP.lead}>
          <b className={SHOP.leadTitle}>Đổi Băng Tâm lấy bình rỗng</b>
          <Hint label="Đổi Băng Tâm là gì?" id={`${hint}-ice`}>
            8 Băng Tâm đổi 1 Bình Huyết Linh (Rỗng), bình mang theo khi đánh Bạch Hổ Thống Lĩnh. Pháp sư đổi ngay khi chọn dòng, không
            hỏi lại, nên app hỏi trước. Xong, bot nói chuyện lại với Pháp sư để menu đổi không còn là menu server nhớ (một lần bấm
            nhầm sau đó sẽ đổi thêm).
          </Hint>
        </div>
        <p className={SHOP.note}>
          Có <b className="px text-fg">{num(ice)}</b> Băng Tâm, <b className="px text-fg">{num(bottles)}</b> Bình Huyết Linh (Rỗng).
        </p>
        <div className={SHOP.chips}>
          {[
            { option: 0, label: "Đổi 1 bình", bottles: 1 },
            { option: 1, label: "Đổi 5 bình", bottles: 5 },
            { option: 2, label: `Đổi hết (${all} bình)`, bottles: all },
          ].map((o) => (
            <Button
              key={o.option}
              small
              kind="outline"
              icon="drop"
              disabled={!!why || o.bottles < 1 || ice < o.bottles * ICE.perBottle}
              onClick={() =>
                ask({
                  title: "Đổi Băng Tâm",
                  message: `Đổi ${num(o.bottles * ICE.perBottle)} Băng Tâm lấy ${o.bottles} Bình Huyết Linh (Rỗng). Pháp sư đổi ngay, không đổi ngược được.`,
                  confirm: o.label,
                  icon: "drop",
                  run: () => api.smithIce(account.id, o.option),
                })
              }
            >
              {o.label}
            </Button>
          ))}
        </div>
      </div>
      <p className="mt-1.5 mb-0 px-2 py-1.5 text-[11.5px] text-fg-3 bg-bg-2 border-l-3 border-l-line-strong">
        Chưa làm: Chế tạo cánh và Chế Băng Kiếm (chưa đo).
      </p>
    </div>
  );
}
