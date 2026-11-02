// The battle window (docs/integration/rust/features.md#cửa-sổ-trận): index.html?battle=<id>, opened by "Cửa sổ trận"
// in Tự đánh and Nhiệm vụ (open_battle_window). It draws the battle of one account as it goes, for OBS to capture: the
// mob above, the board, the character below. Luôn trên cùng and Nền xanh (a chroma key green around the panels) are kept
// in localStorage; their strip shows only under the pointer, so a capture does not show it.
import { useEffect, useState, type CSSProperties } from "react";
import { cn } from "@/utils/cn";
import { api } from "@/api";
import { Avatar } from "@/components/Avatar";
import { Icon } from "@/components/Icon";
import { ELEMENT_ICON, ELEMENT_NAME, elementText } from "@/components/ElementTag";
import { mobIcon, sheetIcon } from "@/game/mobIcons";
import { skillIcon } from "@/game/skillIcons";
import { LootRow } from "@/views/LootRow";
import { num } from "@/utils/format";
import { recalled, remember } from "@/utils/remember";
import type { BattleSide, Gauge } from "@/api/types";
import { Board } from "./Board";
import { CHROMA, ON_TOP } from "./OpenBattleWindow";
import { useBattle, type Floater, type View } from "./useBattle";

/** A gauge of a side: a bar that runs to its value, the numbers at its right. */
function Meter({ label, value, max, fill, glow }: { label: string; value: number | null; max: number | null; fill: string; glow?: boolean }) {
  const ratio = value != null && max ? Math.max(0, Math.min(1, value / max)) : 0;
  return (
    <div className="grid grid-cols-[34px_minmax(0,1fr)_64px] items-center gap-1.5 text-10 leading-none">
      <span className="font-extrabold tracking-[0.06em] uppercase text-fg-3">{label}</span>
      <span className={cn("relative h-3 p-0.5 bg-ink", glow && "shadow-[0_0_8px_1px_var(--coin)]")}>
        <span
          className="block h-full bg-[image:repeating-linear-gradient(90deg,var(--fill)_0_6px,transparent_6px_8px)] transition-[width] duration-500 ease-out"
          style={{ width: `${ratio * 100}%`, "--fill": fill } as CSSProperties}
        />
      </span>
      <b className="px text-[10px] font-normal text-right text-fg-2">
        {value == null ? "?" : num(value)}
        {max != null && <span className="text-fg-3">/{num(max)}</span>}
      </b>
    </div>
  );
}

/** One side: picture, name, level, element, its turn; HP, nội lực and sức mạnh (×2 at 100); the numbers that float up. */
function SidePanel({ side, gauge, picture, mine, turn, floaters, boss }: {
  side: BattleSide;
  gauge: Gauge;
  picture?: string;
  mine: boolean;
  turn: boolean;
  floaters: Floater[];
  boss?: boolean;
}) {
  const full = gauge.s2 >= 100;
  return (
    <section className={cn("relative flex gap-2.5 p-2.5 bg-card notch transition-shadow duration-300", turn && "shadow-[inset_0_0_0_2px_var(--primary)]")}>
      <div className="relative flex-none size-16 grid place-items-center bg-ink bevel-sm">
        {picture ? (
          <img src={picture} alt="" draggable={false} className="max-w-[90%] max-h-[90%] object-contain [image-rendering:pixelated]" />
        ) : mine ? (
          <Avatar name={side.name} size={52} />
        ) : (
          <Icon name={boss ? "crown" : "sword"} size={30} className="text-fg-3" />
        )}
        {floaters.map((f) => (
          <span
            key={f.id}
            className={cn("absolute left-1/2 top-[38%] px text-[18px] leading-none whitespace-nowrap animate-float-up [text-shadow:2px_2px_0_var(--ink)]", f.tone === "damage" ? "text-hp" : "text-good")}
          >
            {f.text}
          </span>
        ))}
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          {side.element != null && ELEMENT_ICON[side.element] && (
            <span className={elementText(side.element)} title={`Hệ ${ELEMENT_NAME[side.element]}`}>
              <Icon name={ELEMENT_ICON[side.element]} size={13} />
            </span>
          )}
          <b className="truncate text-13 font-extrabold">{side.name}</b>
          {boss && <span className="px text-[9px] px-1 bg-accent text-ink">BOSS</span>}
          {full && <span className="px text-[10px] px-1 bg-coin text-ink animate-blink" title="Sức mạnh đầy: đòn kế tiếp gấp đôi">x2</span>}
          <span className="ml-auto px text-[11px] text-fg-2">LV {side.level}</span>
        </div>
        <Meter label="Máu" value={gauge.hp} max={gauge.maxHp} fill={mine ? "var(--good)" : "var(--hp)"} />
        <Meter label="N.lực" value={gauge.s1} max={100} fill="var(--exp)" />
        <Meter label="S.mạnh" value={gauge.s2} max={100} fill="var(--coin)" glow={full} />
      </div>
    </section>
  );
}

/** Whose turn and how long it has left; a timed battle has no turns. */
function TurnLine({ view }: { view: View }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => tick((n) => n + 1), 250);
    return () => window.clearInterval(t);
  }, []);
  const t = view.turn;
  if (!view.open || !t) return <div className="h-6" />;
  if (t.timed) return <div className="h-6 grid place-items-center text-11 font-bold text-fg-2">Trận tính giờ: đánh liên tục, quái đánh mỗi ~30 giây</div>;
  const total = view.open.turnSeconds || 30;
  const left = Math.max(0, total - Math.floor((Date.now() - t.at) / 1000));
  return (
    <div className="h-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-11 font-bold">
      <span className="h-1.5 bg-ink overflow-hidden">
        <span className={cn("block h-full transition-[width] duration-300 ease-linear", t.mine ? "bg-primary" : "bg-hp")} style={{ width: `${(left / total) * 100}%` }} />
      </span>
      <span className={t.mine ? "text-primary" : "text-hp"}>
        {t.mine ? "Lượt của bạn" : `Lượt của ${view.open.mob.name}`} · <span className="px">{left}s</span>
      </span>
    </div>
  );
}

const END_TEXT = { won: "Thắng", lost: "Thua", left: "Đã rời trận", cancelled: "Server huỷ trận" } as const;

/** Over the board: a banner (Vào trận, Thêm lượt, a skill), the end of the battle with what it gave and picked up, or
 * the wait for a battle. */
function Overlay({ view }: { view: View }) {
  if (!view.open)
    return (
      <div className="absolute inset-0 grid place-items-center text-center p-6">
        <p className="text-13 font-bold text-fg-2">Đang chờ trận…<br /><span className="text-11 font-normal text-fg-3">Bắt đầu tự đánh hay tự làm nhiệm vụ, trận sẽ hiện ở đây.</span></p>
      </div>
    );
  const e = view.end;
  if (e)
    return (
      <div className="absolute inset-0 grid place-items-center p-4 bg-[color-mix(in_srgb,var(--ink)_62%,transparent)]">
        <div className="flex flex-col items-center gap-2 p-4 bg-card notch animate-banner-in min-w-[60%]">
          <b className={cn("text-[28px] font-extrabold uppercase tracking-[0.04em]", e.result === "won" ? "text-coin" : e.result === "lost" ? "text-hp" : "text-fg-2")}>
            {END_TEXT[e.result]}
          </b>
          {(e.exp != null || e.coin != null) && (
            <span className="text-12 font-bold text-fg-2">
              +<span className="px text-good">{num(e.exp ?? 0)}</span> EXP · +<span className="px text-coin">{num(e.coin ?? 0)}</span> xu
            </span>
          )}
          <LootRow items={view.picked} className="justify-center" />
        </div>
      </div>
    );
  const b = view.banner;
  if (!b) return null;
  const icon = b.skill != null ? skillIcon(b.skill, true) : undefined;
  return (
    <div className="absolute inset-0 grid place-items-center pointer-events-none">
      <div key={b.id} className="flex items-center gap-2 px-4 py-2 bg-card notch animate-banner shadow-[0_0_0_2px_var(--primary)]">
        {icon && <img src={icon} alt="" className="size-8" draggable={false} />}
        <b className="text-[20px] font-extrabold uppercase tracking-[0.05em] text-primary">{b.text}</b>
      </div>
    </div>
  );
}

export function BattleWindow({ id }: { id: number }) {
  const view = useBattle(id);
  const [onTop, setOnTop] = useState(() => recalled(ON_TOP) === "1");
  const [chroma, setChroma] = useState(() => recalled(CHROMA) === "1");
  useEffect(() => {
    document.documentElement.toggleAttribute("data-chroma", chroma);
    remember(CHROMA, chroma ? "1" : "0");
  }, [chroma]);
  useEffect(() => {
    remember(ON_TOP, onTop ? "1" : "0");
    void api.setOnTop(onTop).catch(() => {});
  }, [onTop]);
  useEffect(() => {
    document.title = view.open ? `Trận đấu – ${view.open.me.name} đánh ${view.open.mob.name}` : "Trận đấu";
  }, [view.open]);

  const o = view.open;
  const mobPicture = o ? (sheetIcon(o.sprite) ?? mobIcon(o.mob.name)) : undefined;
  const turn = view.turn && !view.end ? view.turn : null;
  return (
    <main className="group h-dvh flex flex-col gap-2 p-2.5 overflow-hidden">
      {o ? (
        <SidePanel side={o.mob} gauge={view.mob} picture={mobPicture} mine={false} boss={o.boss} turn={!!turn && !turn.mine && !turn.timed} floaters={view.floaters.filter((f) => f.side === "mob")} />
      ) : (
        <section className="h-[92px] bg-card notch" />
      )}
      <div className="relative flex-1 min-h-0 grid place-items-center">
        <div className="relative h-full max-h-full aspect-square max-w-full">
          <Board pieces={view.pieces} dur={view.dur} swap={view.swap} dim={!o || !!view.end} />
          <Overlay view={view} />
        </div>
      </div>
      <TurnLine view={view} />
      {o ? (
        <SidePanel side={o.me} gauge={view.me} mine turn={!!turn && turn.mine && !turn.timed} floaters={view.floaters.filter((f) => f.side === "me")} />
      ) : (
        <section className="h-[92px] bg-card notch" />
      )}
      <div className="flex items-center justify-end gap-3 text-11 text-fg-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
        <label className="inline-flex items-center gap-1.5 cursor-pointer">
          <input type="checkbox" checked={onTop} onChange={(e) => setOnTop(e.target.checked)} /> Luôn trên cùng
        </label>
        <label className="inline-flex items-center gap-1.5 cursor-pointer" title="Nền xanh lá quanh khung trận: thêm bộ lọc Chroma Key trong OBS để bỏ nó đi">
          <input type="checkbox" checked={chroma} onChange={(e) => setChroma(e.target.checked)} /> Nền xanh (OBS)
        </label>
      </div>
    </main>
  );
}
