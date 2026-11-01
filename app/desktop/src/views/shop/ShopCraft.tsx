import { useId } from "react";
import { api } from "@/api";
import { cn } from "@/utils/cn";
import { Button } from "@/components/Button";
import { Hint } from "@/components/Hint";
import { num, timeOfDay } from "@/utils/format";
import { CRAFT_KINDS, ICE, knownRecipes, materialHeld, materialIcon, roman } from "@/game/shops";
import type { Character, Item, Recipe } from "@/api/types";
import { SHOP, type ShopContext } from "./ShopModal";

/** One of Chế tạo trang bị, Đổi Băng Tâm. */
const PART = "grid [align-content:start] gap-2 px-2.5 py-2 bg-bg-2/40 border-2 border-line";
/** The table of Chế tạo trang bị: a column for the kind, one for each tier; one cell after another when narrow. */
const GRID = "grid gap-1.5 @min-[860px]:grid-cols-[170px_repeat(3,minmax(0,1fr))]";
/** A recipe: its materials, its Xu, and Chế tạo. Framed in green once everything is there. */
const CELL = "grid [align-content:start] gap-1 px-2 py-1.5 bg-bg-2 border-2 border-line text-11";

/** What a recipe lacks, from the bag, the money, the level and the room (the bot checks the same on the menu). Below
 * its level only that is said: the numbers in red show the rest. */
function lacks(c: Character, r: Recipe) {
  const items = c.bag?.items ?? [];
  const free = c.bag ? c.bag.capacity - c.bag.items.length : 0;
  const materials = r.materials.map((m) => ({ ...m, ...materialHeld(items, m.name, m.count) }));
  if (c.level < r.level) return { materials, why: [`cần cấp ${r.level}, nhân vật cấp ${c.level}`] };
  const why = [
    ...materials
      .filter((m) => !m.enough)
      .map((m) =>
        m.split ? `${m.name} chia ${m.stacks} chồng, chồng lớn nhất ${m.largest}/${m.count}` : `thiếu ${m.count - m.total} ${m.name}`,
      ),
    ...((c.currencies?.xu ?? 0) < r.xu ? [`thiếu ${num(r.xu - (c.currencies?.xu ?? 0))} Xu`] : []),
    ...(free < 1 ? ["túi đầy, cần 1 ô cho món mới"] : []),
  ];
  return { materials, why };
}

/**
 * Chế tạo of Pháp sư (16-upgrade.md#chế-tạo, J3, O1). Chế tạo trang bị as a table at once: Nón, Áo, Vũ khí, Nhẫn by
 * Bậc I, II, III, each with its two materials (held / needed), its Xu and its level, framed in green when it can be made,
 * and what it lacks said in words; the recipes are those Pháp sư's menus said (knownRecipes) until Xem ở Pháp sư reads
 * them again. Chế tạo makes one (SmithTask::Craft), the bot reading the menu and checking again first; it puts each
 * material with its whole stack, as the phone, and the server takes the count. Đổi Băng Tâm lấy bình rỗng: 8 Băng Tâm
 * for a Bình Huyết Linh (Rỗng), exchanged as soon as its line is picked. Every spend asks once more.
 */
export function ShopCraft({ account, why, ask, track }: ShopContext) {
  const c = account.character!;
  const items = c.bag?.items ?? [];
  const xu = c.currencies?.xu ?? 0;
  const free = c.bag ? c.bag.capacity - c.bag.items.length : 0;
  const rows = CRAFT_KINDS.map((name, kind) => {
    const read = c.recipes.find((r) => r.kind === kind && r.recipes.length > 0) ?? null;
    const recipes = (read?.recipes ?? knownRecipes(kind)).map((r) => ({ ...r, ...lacks(c, r) }));
    const worn = c.gear.find((g): g is Item => g?.kind === kind) ?? null;
    return { name, kind, read, recipes, worn };
  });
  const ready = rows.flatMap((row) => row.recipes.filter((r) => r.why.length === 0).map((r) => `${row.name} Bậc ${roman(r.tier)}`));
  const tiers = rows[0].recipes;
  const ice = items.filter((i) => i.id === ICE.iceId).reduce((n, i) => n + i.quantity, 0);
  const bottles = items.filter((i) => i.id === ICE.bottleId).reduce((n, i) => n + i.quantity, 0);
  const all = Math.floor(ice / ICE.perBottle);
  const hint = useId();

  return (
    <div className={SHOP.tab}>
      <div className={PART}>
        <div className={SHOP.lead}>
          <b className={SHOP.leadTitle}>Chế tạo trang bị</b>
          <Hint label="Chế tạo trang bị là gì?" id={`${hint}-what`}>
            Pháp sư làm một món Nón, Áo, Vũ khí hay Nhẫn từ hai loại nguyên liệu (24 viên mỗi loại, cùng bậc với món) và Xu. Bậc
            I cần nhân vật cấp 21 và ra đồ bậc 21 (nâng tới +8), Bậc II cấp 51 ra bậc 51 (+12), Bậc III cấp 101 ra bậc 101 (+16);
            cửa hàng không bán đồ bậc 101. Món ra có hệ và phẩm chất ngẫu nhiên, đúng hệ nhân vật thì thêm chỉ số. Nguyên liệu (Da,
            Quặng, Gỗ, Linh Thạch) rơi từ quái, bot nhặt khi Tự đánh hay Tự làm nhiệm vụ. Chế tạo không thất bại; nguyên liệu và Xu
            không lấy lại được.
          </Hint>
          <span className="ml-auto text-11 text-fg-3">
            Cấp {c.level} · {num(xu)} Xu · túi trống {free} ô
          </span>
        </div>
        <p className={cn(SHOP.note, ready.length > 0 && "text-good")} role="status">
          {ready.length > 0
            ? `Có thể chế ngay: ${ready.join(", ")}.`
            : "Chưa đủ để chế món nào: mỗi ô dưới ghi còn thiếu gì. Nguyên liệu rơi từ quái (ví dụ ở M10)."}
        </p>

        <div className={GRID} role="table" aria-label="Công thức chế tạo">
          {/* The tiers, as column heads when wide. */}
          <div className="hidden @min-[860px]:contents" role="row">
            {/* In the flow of the grid (the first column); only its words are for screen readers. */}
            <span role="columnheader">
              <span className="sr-only">Loại món</span>
            </span>
            {tiers.map((t) => (
              <span key={t.tier} role="columnheader" className={cn("px-2 text-11 font-bold", c.level < t.level ? "text-fg-3" : "text-fg-2")}>
                BẬC {roman(t.tier)} · cấp {t.level}
                {c.level < t.level ? " ✗" : " ✓"}
              </span>
            ))}
          </div>
          {rows.map((row) => (
            <div key={row.kind} className="contents" role="row">
              <div role="rowheader" className="grid [align-content:start] gap-1 px-2 py-1.5 text-11 text-fg-3">
                <b className="text-13 text-fg">{row.name}</b>
                <span>{row.worn ? `Đang mặc ${row.worn.name} +${row.worn.plus} (bậc ${row.worn.level ?? "?"})` : "Chưa mặc món nào"}</span>
                <span>{row.read ? `Pháp sư báo lúc ${timeOfDay(row.read.readAt)}` : "Theo bảng đã đo"}</span>
                <Button
                  small
                  kind="ghost"
                  icon="eye"
                  className="justify-self-start"
                  disabled={!!why}
                  title={`Hỏi Pháp sư công thức ${row.name} (miễn phí, không đặt gì)`}
                  onClick={() => {
                    track();
                    api.smithCraft(account.id, row.kind, null);
                  }}
                >
                  Xem ở Pháp sư
                </Button>
              </div>
              {row.recipes.map((r) => {
                const ok = r.why.length === 0;
                const low = c.level < r.level;
                return (
                  <div key={r.tier} role="cell" className={cn(CELL, ok && "border-good", low && "opacity-60")}>
                    <b className="text-12 text-fg @min-[860px]:hidden">
                      {row.name} Bậc {roman(r.tier)} · cấp {r.level}
                    </b>
                    {r.materials.map((m) => (
                      <span key={m.name} className="flex items-center gap-1.5">
                        {materialIcon(m.name) && (
                          <img className="flex-none size-5 [image-rendering:auto]" src={materialIcon(m.name)} alt="" draggable={false} />
                        )}
                        <span className="flex-1 min-w-0 truncate text-fg-2">{m.name}</span>
                        <b className={cn("px text-11", m.enough ? "text-good" : m.split ? "text-coin" : "text-danger")}>
                          {num(m.split ? m.largest : m.total)}/{m.count}
                        </b>
                      </span>
                    ))}
                    <span className="flex items-center gap-1.5">
                      <span className="flex-1 text-fg-2">Xu</span>
                      <b className={cn(SHOP.costFig, xu < r.xu && SHOP.costShort)}>{num(r.xu)}</b>
                    </span>
                    {!ok && <span className={cn("leading-[1.4]", low ? "text-fg-3" : "text-danger")}>{r.why.join("; ")}</span>}
                    <Button
                      small
                      kind={ok ? "primary" : "outline"}
                      icon="flame"
                      className="justify-self-start mt-0.5"
                      disabled={!!why || !ok}
                      title={why ?? (r.why.join("; ") || undefined)}
                      onClick={() =>
                        ask({
                          title: `Chế tạo ${row.name} Bậc ${roman(r.tier)}`,
                          message: `Pháp sư lấy ${r.materials.map((m) => `${m.count} ${m.name}`).join(", ")} và ${num(r.xu)} Xu, cho 1 ${row.name} bậc ${r.level} có hệ và phẩm chất ngẫu nhiên. Không lấy lại được nguyên liệu. Bot hỏi lại Pháp sư công thức trước khi đặt.`,
                          confirm: `Chế tạo, ${num(r.xu)} Xu`,
                          icon: "flame",
                          run: () => api.smithCraft(account.id, row.kind, r.tier),
                        })
                      }
                    >
                      Chế tạo
                    </Button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <p className="m-0 text-11 text-fg-3">
          Số xanh là đủ, đỏ là thiếu, vàng là đủ nhưng nằm ở nhiều chồng: đồ khoá và chưa khoá không gộp chồng, mà game chỉ nhận
          một chồng cho mỗi nguyên liệu.
        </p>
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
