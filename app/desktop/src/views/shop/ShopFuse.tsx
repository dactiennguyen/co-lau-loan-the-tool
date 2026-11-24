import { useId, useState } from "react";
import { api } from "@/api";
import type { Item } from "@/api/types";
import { Button } from "@/components/Button";
import { FilterChip } from "@/components/FilterChip";
import { Hint } from "@/components/Hint";
import { Icon } from "@/components/Icon";
import { Stepper } from "@/components/Stepper";
import { FUSE, fixedPick, fuseQuote, fuseRounds, fuseSuggest, fuseWhy, stoneIcon, stoneLevel, stoneValue, type FuseQuote } from "@/game/shops";
import { cn } from "@/utils/cn";
import { num } from "@/utils/format";
import { recalled, remember } from "@/utils/remember";
import { SHOP, type ShopContext } from "./ShopModal";
import { Stone } from "./Stone";

const ONLY_UNLOCKED = "shop.fuseUnlocked";
const TARGET = "shop.fuseTarget";
const RATE = "shop.fuseRate";
const LOOK = "shop.fuseLook";
const LOOP_MODE = "shop.fuseLoopMode";
const LOOP_TIMES = "shop.fuseLoopTimes";
const LOOP_WINS = "shop.fuseLoopWins";
/** The most presses and successes Luyện liên tục is asked for. */
const LOOP_MOST = 999;
const CELL = "px-2 py-1 text-left border-b border-b-line";
const COL = cn(CELL, "text-11 font-semibold text-fg-3");
const NUM = cn("px", CELL, "text-11 text-fg-2");

/** One stone of the bag: a stack stands once per stone, `key` telling them apart ("slot#k"). */
interface StoneOne {
  key: string;
  slot: number;
  level: number;
  locked: boolean;
}

/** The bag's stones, one entry per stone, by level: locked first (they can never be traded anyway), then by slot; only
 * the unlocked ones with `onlyUnlocked`. */
function stonesOf(items: Item[], onlyUnlocked: boolean) {
  const by: StoneOne[][] = Array.from({ length: 13 }, () => []);
  const held = items
    .filter((i) => stoneLevel(i.id) && (!onlyUnlocked || !i.locked))
    .sort((a, b) => Number(b.locked) - Number(a.locked) || a.slot - b.slot);
  for (const i of held) {
    const level = stoneLevel(i.id);
    for (let k = 0; k < Math.max(1, i.quantity); k++) by[level].push({ key: `${i.slot}#${k}`, slot: i.slot, level, locked: i.locked });
  }
  return { by, stacks: held };
}

/** The colour of odds: refused (40% and under), risky, likely. */
const tone = (rate: number) => (rate < FUSE.rate ? "var(--danger)" : rate < 70 ? "var(--coin)" : "var(--good)");

/** The lines the game's window shows for the stones put in (s2c/92, J2): what it makes, the fee, the odds. */
function gameLines(q: FuseQuote, locked: boolean) {
  if (q.count < FUSE.min) return ["Cần chọn đá số lượng 2 đến 24"];
  if (q.target > 12) return ["Tổng vượt quá Đá cấp 12"];
  return [
    `Luyện thành Đá cấp ${q.target}${locked ? " Khóa" : ""}`,
    locked ? `Cần: ${num(q.fee)} Xu khóa (không đủ sẽ sử dụng cả Xu)` : `Cần: ${num(q.fee)} Xu`,
    `Tỉ lệ thành công: ${q.rate}%`,
  ];
}

/** The gold corners of a square picked, as the game draws them. */
function Corners() {
  const c = "absolute size-2 border-primary";
  return (
    <>
      <span className={cn(c, "-top-0.5 -left-0.5 border-t-2 border-l-2")} aria-hidden="true" />
      <span className={cn(c, "-top-0.5 -right-0.5 border-t-2 border-r-2")} aria-hidden="true" />
      <span className={cn(c, "-bottom-0.5 -left-0.5 border-b-2 border-l-2")} aria-hidden="true" />
      <span className={cn(c, "-bottom-0.5 -right-0.5 border-b-2 border-r-2")} aria-hidden="true" />
    </>
  );
}

/** A square of the game's grids: a stone with its lock and count, or empty. */
function Square({
  level,
  locked,
  count,
  picked,
  label,
  onClick,
}: {
  level?: number;
  locked?: boolean;
  count?: number;
  picked?: boolean;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "relative grid place-items-center size-11 p-0 border-2 border-line bg-ink",
        level ? "cursor-pointer hover:border-line-strong" : "cursor-default",
        !!level && count === 0 && "opacity-40",
        "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1",
      )}
      aria-label={label}
      title={label}
      disabled={!onClick}
      onClick={onClick}
    >
      {level ? <img className="size-8" src={stoneIcon(level)} alt="" draggable={false} /> : null}
      {level && locked ? <Icon name="lock" size={10} className="absolute top-0.5 left-0.5 text-primary" /> : null}
      {level && count != null ? (
        <span className="absolute bottom-0 right-0 px px-0.5 bg-[rgb(15_17_21/0.75)] text-10 leading-[1.3] text-fg">{count}</span>
      ) : null}
      {picked && <Corners />}
    </button>
  );
}

/**
 * Luyện tự chọn (16-upgrade.md#luyện-đá): any 2–24 stones of any levels in Luyện đá, with the odds worked out as they are
 * picked (fuseQuote, the J2 rule): the stones' value, the stone the server aims at (the lowest worth at least as much),
 * the odds, the fee, whether the stone made is locked. Two looks on the same stones: **Như game**, the game's window
 * (24 squares, its lines of text, Hành trang under it with Chọn, Chọn nhiều and Bỏ ra, as seen on the phone 23/11), and
 * **Bảng**, a count per level. Gợi ý picks few stones held that give a level at the odds asked. Nothing is sent before
 * Kết hợp, which asks once more: a failure has never been seen and may take every stone put in. The bot checks the level
 * and odds the window says against these before pressing (SmithTask::Fuse).
 */
export function ShopFuse({ account, why, ask }: ShopContext) {
  const c = account.character!;
  const hint = useId();
  const [look, setLook] = useState(() => (recalled(LOOK) === "table" ? "table" : "game"));
  const [onlyUnlocked, setOnlyUnlocked] = useState(() => recalled(ONLY_UNLOCKED) === "1");
  const [target, setTarget] = useState(() => Number(recalled(TARGET)) || 8);
  // A rate kept from before is brought within what the Stepper and the bot take (41–100).
  const [rate, setRate] = useState(() => Math.min(100, Math.max(FUSE.rate, Number(recalled(RATE)) || 50)));
  // The stones put in, in order, by key.
  const [keys, setKeys] = useState<string[]>([]);
  const [suggested, setSuggested] = useState<string | null>(null);
  // Hành trang: the stack whose box is open (Chọn, Chọn nhiều), and how many Chọn nhiều puts; the grid: the stone open.
  const [open, setOpen] = useState<{ stack: number; many: number | null } | { placed: string } | null>(null);

  const { by, stacks } = stonesOf(c.bag?.items ?? [], onlyUnlocked);
  const all = new Map(by.flat().map((s) => [s.key, s]));
  const placed = keys.map((k) => all.get(k)).filter((s): s is StoneOne => !!s);
  const used = new Set(placed.map((s) => s.key));
  const counts = by.map((_, l) => placed.filter((s) => s.level === l).length);
  const levels = by.map((s, level) => ({ level, held: s.length })).filter((r) => r.level && r.held);
  const q = fuseQuote(placed.map((s) => s.level));
  const refused = fuseWhy(q);
  const locked = placed.some((s) => s.locked);
  const money = c.currencies;
  const payIn = locked ? "Xu khóa" : "Xu";
  const short = !!money && (locked ? q.fee > money.xuKhoa + money.xu : q.fee > money.xu);
  const what = counts
    .map((n, l) => (n ? `${n} Đá cấp ${l}` : null))
    .filter(Boolean)
    .reverse()
    .join(", ");
  // The stones are worth more than one of the level under the target: the server aims a level higher.
  const over = q.count > 0 && q.target >= 3 && q.target <= 12 && q.rate < 100 && q.value > stoneValue(q.target - 1);
  const room = FUSE.max - placed.length;

  const reset = (next: string[]) => {
    setSuggested(null);
    setOpen(null);
    setKeys(next);
  };
  /** Up to `n` more stones of a level (Bảng) or of a stack (Hành trang), the next ones not put in yet. */
  const add = (from: StoneOne[], n: number) =>
    reset([
      ...placed.map((s) => s.key),
      ...from
        .filter((s) => !used.has(s.key))
        .slice(0, Math.max(0, Math.min(n, room)))
        .map((s) => s.key),
    ]);
  /** The count of a level of Bảng: more from the bag, or the last ones of that level out. */
  const setLevel = (level: number, n: number) => {
    const have = counts[level];
    if (n > have) return add(by[level], n - have);
    let drop = have - n;
    const kept = [...placed].reverse().filter((s) => !(s.level === level && drop-- > 0));
    reset(kept.reverse().map((s) => s.key));
  };
  const suggest = () => {
    const take = fuseSuggest(
      by.map((s) => s.length),
      target,
      rate,
    );
    if (!take) {
      setSuggested(`Đá trong túi không đủ để ra Đá cấp ${target} với ${rate}% (tối đa ${FUSE.max} viên).`);
      return;
    }
    reset(take.flatMap((n, l) => by[l].slice(0, n).map((s) => s.key)).reverse());
  };
  const fuse = () =>
    ask({
      title: "Luyện tự chọn",
      message:
        `Bỏ ${what} (${q.count} viên) vào Luyện đá [${payIn}]: ra Đá cấp ${q.target}${locked ? " khoá" : " chưa khoá"}, tỉ lệ ${q.rate}%, phí ${num(q.fee)} ${payIn}. ` +
        `Chưa từng thấy luyện thất bại nên chưa biết mất gì: có thể mất hết ${q.count} viên đá.`,
      confirm: `Luyện, ${q.rate}%`,
      icon: "gem",
      run: () =>
        api.smithFuse(
          account.id,
          placed.map((s) => s.slot),
        ),
    });
  const button = (
    <Button kind="primary" icon="gem" disabled={!!why || !!refused || short} title={why ?? refused ?? undefined} onClick={fuse}>
      {refused || q.count === 0 ? "Kết hợp" : `Kết hợp, ${q.rate}%`}
    </Button>
  );

  // The box of a stack of Hành trang or of a stone of the grid, as the game's: the picture, the name, its use, the buttons.
  const box = (() => {
    if (!open) return null;
    const stone = "placed" in open ? all.get(open.placed) : undefined;
    const stack = "stack" in open ? stacks.find((i) => i.slot === open.stack) : undefined;
    const level = stone?.level ?? (stack ? stoneLevel(stack.id) : 0);
    if (!level) return null;
    const free = stack ? by[level].filter((s) => s.slot === stack.slot && !used.has(s.key)) : [];
    return (
      <div className="grid gap-2 px-3 py-2.5 bg-card-2 border-2 border-line-strong text-12" role="group" aria-label={`Đá cấp ${level}`}>
        <div className="flex items-center gap-2.5">
          <img className="size-8" src={stoneIcon(level)} alt="" draggable={false} />
          <span className="grid">
            <b className="text-fg">Đá cấp {level}</b>
            <span className="text-fg-3">Yêu cầu cấp: 1 · Nguyên liệu nâng cấp vật phẩm</span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {stone && (
            <Button small icon="close" onClick={() => reset(placed.filter((s) => s.key !== stone.key).map((s) => s.key))}>
              Bỏ ra
            </Button>
          )}
          {stack && "stack" in open && open.many == null && (
            <>
              <Button small icon="plus" disabled={!free.length || room <= 0} onClick={() => add(free, 1)}>
                Chọn
              </Button>
              <Button
                small
                disabled={free.length < 2 || room < 2}
                onClick={() => setOpen({ stack: stack.slot, many: Math.min(free.length, room) })}
              >
                Chọn nhiều
              </Button>
            </>
          )}
          {stack && "stack" in open && open.many != null && (
            <>
              <span className="text-fg-2">Đặt Đá cấp {level} vào lưới</span>
              <Stepper
                value={open.many}
                onChange={(v) => setOpen({ stack: stack.slot, many: v })}
                min={1}
                max={Math.max(1, Math.min(free.length, room))}
                label={`số Đá cấp ${level} đặt vào lưới`}
              />
              <Button small kind="primary" onClick={() => add(free, open.many ?? 1)}>
                Đặt
              </Button>
            </>
          )}
          <Button small onClick={() => setOpen(null)}>
            Huỷ
          </Button>
        </div>
      </div>
    );
  })();

  return (
    <div className="grid gap-2.5">
      <div className={SHOP.lead}>
        <b className={SHOP.leadTitle}>Luyện tự chọn</b>
        <Hint label="Luyện tự chọn là gì?" id={`${hint}-what`}>
          Như cửa sổ Luyện đá của game: bỏ 2 đến 24 viên, cấp nào cũng được. Mỗi viên Đá cấp k bằng 4^(k−1) Đá cấp 1. Game cộng
          giá trị các viên, nhắm viên thấp nhất không nhỏ hơn tổng đó, tỉ lệ = tổng ÷ giá trị viên đó, và chỉ cho bấm khi trên
          40%. Đá bỏ vào mất hết khi thành công; thất bại thì chưa đo được mất gì.
        </Hint>
        <span className="ml-auto flex gap-1.5">
          {(
            [
              ["game", "Như game"],
              ["table", "Bảng"],
            ] as const
          ).map(([k, label]) => (
            <FilterChip
              key={k}
              on={look === k}
              onClick={() => {
                setLook(k);
                remember(LOOK, k);
              }}
            >
              {label}
            </FilterChip>
          ))}
        </span>
      </div>
      <div className={SHOP.opts}>
        <label className={SHOP.opt}>
          Muốn ra Đá cấp
          <Stepper
            value={target}
            onChange={(v) => {
              setTarget(v);
              remember(TARGET, String(v));
            }}
            min={2}
            max={12}
            label="cấp đá muốn ra"
          />
        </label>
        <label className={SHOP.opt}>
          tỉ lệ ít nhất
          <Stepper
            value={rate}
            onChange={(v) => {
              setRate(v);
              remember(RATE, String(v));
            }}
            min={FUSE.rate}
            max={100}
            label="tỉ lệ ít nhất (%)"
          />
          %
        </label>
        <Button small icon="star" onClick={suggest}>
          Gợi ý
        </Button>
        <Button small icon="eraser" disabled={q.count === 0} onClick={() => reset([])}>
          Bỏ hết
        </Button>
        <label className={SHOP.check}>
          <input
            className={SHOP.checkInput}
            type="checkbox"
            checked={onlyUnlocked}
            onChange={(e) => {
              setOnlyUnlocked(e.target.checked);
              remember(ONLY_UNLOCKED, e.target.checked ? "1" : "0");
            }}
          />
          <span className={SHOP.checkBox} aria-hidden="true">
            <Icon name="check" size={11} />
          </span>
          Chỉ dùng đá chưa khoá
        </label>
      </div>
      {suggested && <p className={SHOP.why}>{suggested}</p>}

      {look === "game" ? (
        // The game's window: its title, the 24 squares and the lines of text side by side, the money, Kết hợp; Hành trang
        // under it, the stones of the bag.
        <div className="grid gap-2 max-w-[640px] p-2.5 bg-bg-2 border-2 border-line-strong">
          <b className="justify-self-center font-display text-13 text-fg">Luyện đá [{locked || q.count === 0 ? "Xu khóa" : "Xu"}]</b>
          <div className="grid gap-2 @min-[560px]:grid-cols-[auto_1fr]">
            <div className="grid grid-cols-6 gap-1 justify-self-start p-1.5 bg-muted border-2 border-line" role="list" aria-label="Lưới đá">
              {Array.from({ length: FUSE.max }, (_, i) => {
                const s = placed[i];
                return (
                  <span key={i} role="listitem">
                    <Square
                      level={s?.level}
                      locked={s?.locked}
                      count={s ? 1 : undefined}
                      picked={!!s && !!open && "placed" in open && open.placed === s.key}
                      label={s ? `Đá cấp ${s.level}${s.locked ? " (khoá)" : ""}: bấm để bỏ ra` : `Ô ${i + 1} trống`}
                      onClick={s ? () => setOpen({ placed: s.key }) : undefined}
                    />
                  </span>
                );
              })}
            </div>
            <div className="grid content-start gap-1.5 p-2.5 min-h-[120px] bg-muted border-2 border-line text-12" role="status" aria-live="polite">
              {gameLines(q, locked).map((line, i) => (
                <span key={i} className={cn("text-fg", i === 2 && "font-semibold")} style={i === 2 ? { color: tone(q.rate) } : undefined}>
                  {line}
                </span>
              ))}
              {q.count >= FUSE.min && q.target <= 12 && (
                <span className="text-fg-3">
                  Giá trị {num(q.value)} / {num(stoneValue(q.target))}
                  {over ? ` · vượt 1 Đá cấp ${q.target - 1} nên nhắm Đá cấp ${q.target}` : ""}
                </span>
              )}
              {refused && q.count >= FUSE.min && <span className={SHOP.why}>{refused}</span>}
              {short && <span className={SHOP.why}>Không đủ {payIn}</span>}
            </div>
          </div>
          {box}
          <div className="flex flex-wrap items-center gap-2 text-12">
            {money && (
              <>
                <span className="px-2 py-1 bg-muted border border-line text-fg-2">{num(money.xu)} Xu</span>
                <span className="px-2 py-1 bg-muted border border-line text-coin">{num(money.xuKhoa)} Xu khóa</span>
                <span className="px-2 py-1 bg-muted border border-line text-fg-2">{num(money.luong)} Lượng</span>
              </>
            )}
            <span className="ml-auto">{button}</span>
          </div>
          <b className="text-12 text-fg-2">Hành trang</b>
          {stacks.length === 0 ? (
            <p className={SHOP.note}>Túi không có đá nâng cấp{onlyUnlocked ? " chưa khoá" : ""}.</p>
          ) : (
            <div className="flex flex-wrap gap-1" role="list" aria-label="Đá trong Hành trang">
              {stacks.map((i) => {
                const level = stoneLevel(i.id);
                const taken = placed.filter((s) => s.slot === i.slot).length;
                return (
                  <span key={i.slot} role="listitem">
                    <Square
                      level={level}
                      locked={i.locked}
                      count={Math.max(1, i.quantity) - taken}
                      picked={taken > 0}
                      label={`Đá cấp ${level}${i.locked ? " (khoá)" : ""}, ô túi ${i.slot + 1}: còn ${Math.max(1, i.quantity) - taken}`}
                      onClick={() => setOpen({ stack: i.slot, many: null })}
                    />
                  </span>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          {levels.length === 0 ? (
            <p className={SHOP.note}>Túi không có đá nâng cấp{onlyUnlocked ? " chưa khoá" : ""}.</p>
          ) : (
            <table className="w-full max-w-[560px] border-collapse text-12">
              <thead>
                <tr>
                  <th className={COL} scope="col">Đá</th>
                  <th className={COL} scope="col">Có</th>
                  <th className={COL} scope="col">Giá trị</th>
                  <th className={cn(COL, "text-right")} scope="col">Bỏ vào</th>
                </tr>
              </thead>
              <tbody>
                {levels.map((r) => (
                  <tr key={r.level} className={cn(counts[r.level] > 0 && "bg-bg-2")}>
                    <th className={cn(CELL, "font-medium text-fg")} scope="row">
                      <Stone level={r.level} />
                    </th>
                    <td className={NUM}>{r.held}</td>
                    <td className={NUM}>{num(stoneValue(r.level))}</td>
                    <td className={cn(CELL, "py-0.5")}>
                      <span className="flex justify-end">
                        <Stepper
                          value={counts[r.level]}
                          onChange={(v) => setLevel(r.level, v)}
                          min={0}
                          max={Math.min(r.held, counts[r.level] + room)}
                          label={`số Đá cấp ${r.level} bỏ vào`}
                        />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div
            className="grid gap-2 max-w-[560px] px-3 py-2.5 text-12 text-fg bg-bg-2 border-2 border-line"
            role="status"
            aria-live="polite"
          >
            {q.count === 0 ? (
              <span className="text-fg-2">Chọn số đá mỗi cấp ở bảng trên, hoặc bấm Gợi ý: tỉ lệ hiện ở đây.</span>
            ) : (
              <>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-pixel text-[26px] leading-none" style={{ color: tone(q.rate) }}>
                    {q.target > 12 ? "—" : `${q.rate}%`}
                  </span>
                  <span className="text-fg-2">
                    {q.count} viên → {q.target > 12 ? "vượt Đá cấp 12" : <Stone level={q.target} locked={locked} />}
                  </span>
                </div>
                {/* The odds as a bar, with the 40% under which the game refuses. */}
                <div className="relative h-2.5 bg-ink border border-line" aria-hidden="true">
                  <div className="h-full" style={{ width: `${Math.min(100, q.rate)}%`, background: tone(q.rate) }} />
                  <div className="absolute inset-y-[-3px] left-[40%] w-0.5 bg-fg-3" title="40%" />
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-fg-2">
                  <dt>Bỏ vào</dt>
                  <dd className="text-fg">{what}</dd>
                  <dt>Giá trị</dt>
                  <dd>
                    {num(q.value)} trên {num(stoneValue(Math.min(q.target, 12)))} của 1 Đá cấp {Math.min(q.target, 12)}
                  </dd>
                  <dt>Phí</dt>
                  <dd className={cn("px text-11 text-coin", short && "text-danger")}>
                    {num(q.fee)} {payIn}
                    {short ? " (không đủ)" : ""}
                  </dd>
                </dl>
                {over && (
                  <p className="text-fg-2">
                    Tổng vượt 1 Đá cấp {q.target - 1} ({num(stoneValue(q.target - 1))}) nên game nhắm Đá cấp {q.target}.
                  </p>
                )}
                {refused && <p className={SHOP.why}>{refused}</p>}
              </>
            )}
          </div>
          {button}
        </>
      )}
      <FuseLoopPanel
        account={account}
        why={why}
        ask={ask}
        locked={by.map((st) => st.filter((x) => x.locked).length)}
        free={by.map((st) => st.filter((x) => !x.locked).length)}
        counts={counts}
        target={target}
        rate={rate}
        onlyUnlocked={onlyUnlocked}
      />
      <p className={SHOP.note}>
        App chỉ đặt đá vào lò của game lúc bấm Kết hợp, rồi so cấp đá và tỉ lệ game báo với số ở trên: lệch thì dừng, không bấm.
        Chưa từng thấy luyện thất bại: có thể mất hết đá đã bỏ vào.
      </p>
    </div>
  );
}

/** "2 Đá cấp 6 + 6 Đá cấp 5": stones by level (index 1–12), the highest first. */
const countsText = (counts: number[]) =>
  counts
    .map((n, l) => (n > 0 ? `${n} Đá cấp ${l}` : null))
    .filter(Boolean)
    .reverse()
    .join(" + ");
const levelsOf = (counts: number[]) => counts.flatMap((n, l) => Array<number>(Math.max(0, n)).fill(l));

/**
 * Luyện liên tục (SmithTask::FuseLoop): Luyện tự chọn again and again, the bot picking the stones of each press from the
 * bag as it is then. **Theo mục tiêu**: the stones Gợi ý would pick for Đá cấp `target` from `rate` % (the boxes above).
 * **Công thức cố định**: the stones put in the window above, by level, every press. It ends after Tối đa presses, after
 * Dừng khi thành công successes, when the stones or the money run out, or on Dừng; how many presses the stones last for
 * is shown, as if every press used up its stones.
 */
function FuseLoopPanel({
  account,
  why,
  ask,
  locked,
  free: freeHeld,
  counts,
  target,
  rate,
  onlyUnlocked,
}: Pick<ShopContext, "account" | "why" | "ask"> & {
  /** The stones of the bag by level: locked, and not locked (the unlocked ones only with `onlyUnlocked`). */
  locked: number[];
  free: number[];
  counts: number[];
  target: number;
  rate: number;
  onlyUnlocked: boolean;
}) {
  const hint = useId();
  const [mode, setMode] = useState<"target" | "fixed">(() => (recalled(LOOP_MODE) === "fixed" ? "fixed" : "target"));
  const kept = (key: string, fallback: number) => {
    const n = Number(recalled(key) ?? fallback);
    return Number.isInteger(n) && n >= 0 && n <= LOOP_MOST ? n : fallback;
  };
  const [times, setTimes] = useState(() => kept(LOOP_TIMES, 10));
  const [wins, setWins] = useState(() => kept(LOOP_WINS, 0));
  const pick = mode === "target" ? (left: number[]) => fuseSuggest(left, target, rate) : fixedPick(counts);
  // A press takes locked stones only or unlocked ones only, as the bot does (fuse_round): locked first, then unlocked.
  const pools = onlyUnlocked ? [freeHeld] : [locked, freeHeld];
  const first = mode === "target" ? (pools.map(pick).find((c) => c) ?? null) : counts.some((n) => n > 0) ? counts : null;
  const q = first ? fuseQuote(levelsOf(first)) : null;
  const refused = mode === "fixed" ? (!first ? "Đặt đá vào lò ở trên để làm công thức, ví dụ 2 Đá cấp 6 + 6 Đá cấp 5." : fuseWhy(q!)) : null;
  const rounds = first && !refused ? pools.reduce((n, pool) => n + fuseRounds(pool, pick), 0) : 0;
  const presses = times > 0 ? Math.min(times, rounds) : rounds;
  const free = onlyUnlocked ? " chưa khoá" : "";
  const blocked =
    why ??
    refused ??
    (rounds === 0
      ? mode === "target"
        ? `Đá${free} trong túi không đủ để ra Đá cấp ${target} với ${rate}%.`
        : `Túi không đủ ${countsText(counts)}${free}.`
      : null);
  const what = mode === "target" ? `ra Đá cấp ${target} với tỉ lệ từ ${rate}%` : `${countsText(counts)} mỗi lần`;
  const start = () =>
    ask({
      title: "Luyện liên tục",
      message:
        `Luyện liên tục: ${what}, ${times > 0 ? `tối đa ${times} lần` : "tới khi hết đá"}${wins > 0 ? `, dừng khi thành công ${wins} lần` : ""}. ` +
        `Đá${free} hiện có đủ cho khoảng ${rounds} lần; phí khoảng ${num(q!.fee)} mỗi lần (đá khoá trả Xu khóa, hết Xu khóa thì dừng; đá chưa khoá trả Xu), ` +
        `tổng khoảng ${num(q!.fee * presses)}. Chưa biết luyện thất bại mất gì: có thể mất hết đá của lần đó. Bấm Dừng ở trên để dừng bất cứ lúc nào.`,
      confirm: "Luyện liên tục",
      icon: "gem",
      run: () =>
        api.smithFuseLoop(account.id, target, rate, mode === "fixed" ? counts : null, times, wins, onlyUnlocked),
    });

  return (
    <section className="grid gap-2 max-w-[640px] p-2.5 bg-bg-2 border-2 border-line" aria-labelledby={`${hint}-head`}>
      <div className={SHOP.lead}>
        <Icon name="refresh" size={13} className="text-primary" />
        <b id={`${hint}-head`} className={SHOP.leadTitle}>
          Luyện liên tục
        </b>
        <Hint label="Luyện liên tục là gì?" id={`${hint}-what`}>
          Bot luyện hết lần này tới lần khác, mỗi lần tự chọn đá trong túi rồi bấm Kết hợp, kiểm tra tỉ lệ game báo trước khi bấm như
          Kết hợp. Theo mục tiêu: mỗi lần chọn đá như nút Gợi ý theo hai ô Muốn ra Đá cấp và tỉ lệ ít nhất ở trên; đá vừa luyện ra
          không bị bỏ vào lại. Công thức cố định: đúng số đá mỗi cấp đang đặt trong lò ở trên, mỗi lần. Mỗi lần chỉ dùng toàn đá khoá
          hoặc toàn đá chưa khoá, không trộn (trộn thì đá ra bị khoá): đá khoá trước, trả Xu khóa và dừng khi hết Xu khóa, không
          trả sang Xu; hết đá khoá thì sang đá chưa khoá, trả Xu. Tích Chỉ dùng đá chưa khoá để chỉ dùng đá chưa khoá. Dừng khi đủ
          số lần, đủ số lần thành công, hết đá, hết tiền, hoặc bấm Dừng.
        </Hint>
        <span className="ml-auto flex gap-1.5">
          {(
            [
              ["target", "Theo mục tiêu"],
              ["fixed", "Công thức cố định"],
            ] as const
          ).map(([k, label]) => (
            <FilterChip
              key={k}
              on={mode === k}
              onClick={() => {
                setMode(k);
                remember(LOOP_MODE, k);
              }}
            >
              {label}
            </FilterChip>
          ))}
        </span>
      </div>
      <p className="text-12 text-fg-2">
        {mode === "target" ? (
          <>
            Mỗi lần chọn đá như Gợi ý để ra <b className="text-fg">Đá cấp {target}</b> với tỉ lệ từ <b className="text-fg">{rate}%</b>
            {first && q && (
              <>
                ; lần đầu: {countsText(first)} ({q.rate}%, phí {num(q.fee)})
              </>
            )}
            .
          </>
        ) : first && q && !refused ? (
          <>
            Công thức: <b className="text-fg">{countsText(counts)}</b> → Đá cấp {q.target}, tỉ lệ {q.rate}%, phí {num(q.fee)} mỗi lần.
          </>
        ) : null}
        {rounds > 0 && (
          <>
            {" "}
            Đá{free} hiện có đủ cho <b className="px text-fg">{rounds}</b> lần.
          </>
        )}
      </p>
      <div className={SHOP.opts}>
        <label className={SHOP.opt}>
          Tối đa
          <Stepper
            value={times}
            min={0}
            max={LOOP_MOST}
            label="số lần luyện tối đa (0 là tới khi hết đá)"
            onChange={(v) => {
              setTimes(v);
              remember(LOOP_TIMES, String(v));
            }}
          />
          lần{times === 0 && " (tới khi hết đá)"}
        </label>
        <label className={SHOP.opt}>
          Dừng khi thành công
          <Stepper
            value={wins}
            min={0}
            max={LOOP_MOST}
            label="dừng khi thành công số lần này (0 là không)"
            onChange={(v) => {
              setWins(v);
              remember(LOOP_WINS, String(v));
            }}
          />
          lần{wins === 0 && " (không)"}
        </label>
        <span className="ml-auto">
          <Button kind="primary" icon="refresh" disabled={!!blocked} title={blocked ?? undefined} onClick={start}>
            Luyện liên tục{presses > 0 ? ` · ${presses} lần` : ""}
          </Button>
        </span>
      </div>
      {blocked && blocked !== why && <p className={SHOP.why}>{blocked}</p>}
    </section>
  );
}
