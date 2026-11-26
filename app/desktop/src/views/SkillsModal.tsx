import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { api } from "@/api";
import { cn } from "@/utils/cn";
import { Button } from "@/components/Button";
import { DIALOG, Dialog } from "@/components/Dialog";
import { ELEMENT_ICON, ELEMENT_NAME } from "@/components/ElementTag";
import { Hint } from "@/components/Hint";
import { Icon } from "@/components/Icon";
import { num } from "@/utils/format";
import { skillIcon, TREE } from "@/game/skillIcons";
import type { Account, FightSettings, Skill, SkillLevel } from "@/api/types";

/** Nội lực of one "thành" (12-skills-items.md#bảng-kỹ-năng). */
const THANH = 25;
/** A Nâng cấp the server has not answered in this long is let go, and the button comes back. */
const ANSWER_MS = 8000;
/** The narrowest the detail panel gets beside the tree, and the gap between them (minmax(240px,1fr) and gap-4 of the body). */
const PANEL_MIN = 240;
const GAP = 16;

/** A level in the panel: its label ("Cấp hiện tại" green), its text. */
const TAG = "text-11 font-extrabold tracking-[0.04em] uppercase text-fg-3";
const TEXT = "text-12 leading-[1.45] text-fg-2";

const mana = (l: SkillLevel) => `Tiêu hao ${(l.mana / THANH).toLocaleString("vi-VN")} thành nội lực`;

/**
 * Kỹ năng, a modal opened from the Chỉ số card, as the game's Bản thân → Kỹ năng: the 9 skills of the element on the tree
 * background (s2c/30), colour once learned, grey before, with the level; the picked one on the right with its current
 * and next level, what the next one needs, and Nâng cấp (c2s/1191, one level a click). The skill that can take a level
 * first is shown at the start. Over the tree, how many are learnt and Tự cộng (FightSettings.autoSkills, off unless
 * turned on): the bot spends the points itself, the skill the battle casts most first (Bot::auto_skill, auto_rank).
 */
export function SkillsModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const c = account.character;
  const onUpgrade = (skill: number) => api.upgradeSkill(account.id, skill);
  const hint = useId();
  // Tự cộng: shown at once, saved to accounts.json; kept until the account comes back with it.
  const saved = account.fightSettings;
  const [saving, setSaving] = useState<FightSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (saving && saving.autoSkills === saved.autoSkills) setSaving(null);
  }, [saving, saved]);
  const settings = saving ?? saved;
  const setAuto = (autoSkills: boolean) => {
    const next = { ...settings, autoSkills };
    setSaving(next);
    setError(null);
    api.setFight(account.id, { autoSkills }).catch((err) => {
      setSaving(null);
      setError(String(err?.message ?? err));
    });
  };
  const [picked, setPicked] = useState<number | null>(null);
  // The skill and level of the last Nâng cấp, until s2c/10 kind 32 changes that level or ANSWER_MS goes by.
  const [sent, setSent] = useState<{ id: number; level: number } | null>(null);
  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(() => setSent(null), ANSWER_MS);
    return () => clearTimeout(t);
  }, [sent]);
  // The modal is as tall as what it holds, up to the form's max-height (formClassName). The tree shrinks (0.6 to 1) to
  // fit the room the form leaves its body, and to leave PANEL_MIN beside it. The room is the max-height less the rest
  // of the form (title, bar, footer), so it does not follow the tree's own size and grows back with the window.
  const frame = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const drawn = !!c?.skills.length;
  useLayoutEffect(() => {
    const box = frame.current; // the modal's body, which scrolls past the max-height
    const form = box?.parentElement;
    if (!box || !form) return;
    const fit = () => {
      const s = getComputedStyle(box), px = (v: string) => parseFloat(v) || 0;
      const most = px(getComputedStyle(form).maxHeight) || Math.min(720, innerHeight * 0.92);
      const h = most - (form.offsetHeight - box.offsetHeight) - px(s.paddingTop) - px(s.paddingBottom);
      const w = box.clientWidth - px(s.paddingLeft) - px(s.paddingRight);
      setZoom(Math.max(0.6, Math.min(1, h / TREE.height, (w - PANEL_MIN - GAP) / TREE.width)));
    };
    const watch = new ResizeObserver(fit);
    watch.observe(form);
    addEventListener("resize", fit);
    return () => {
      watch.disconnect();
      removeEventListener("resize", fit);
    };
  }, [drawn]);

  const skills = c?.skills ?? [];
  const shown = skills.find((k) => k.id === picked) ?? skills.find((k) => !k.blockers.length) ?? skills[0];
  const learned = skills.filter((k) => k.level > 0).length;
  const element = c?.element != null ? ELEMENT_NAME[c.element] : undefined;
  const waiting = !!sent && skills.find((k) => k.id === sent.id)?.level === sent.level;
  return (
    <Dialog
      title="Kỹ năng"
      subtitle={`${account.label}${element ? ` · Hệ ${element}` : ""}${c ? ` · ${num(c.skillPoints ?? 0)} điểm kỹ năng` : ""}`}
      className="w-[min(860px,94vw)] max-w-none max-h-none"
      formClassName="max-h-[min(720px,92vh)] box-border grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-2.5 px-5 py-4"
      onClose={onClose}
      onSubmit={(e) => e.preventDefault()}
    >
      {/* The bar (learnt, Tự cộng) over the tree (the game's background, 288 × 347, with the icons in its boxes; shrunk
          when the window is short) beside the detail panel, at least 240 px wide. The form stops at its max-height and
          the body scrolls; a narrow window puts the panel under the tree. */}
      <div className="flex flex-wrap items-center gap-y-1.5 gap-x-2.5">
        {skills.length > 0 && (
          <span className="py-px px-1.5 border border-line text-10 font-bold tracking-[0.04em] uppercase text-fg-3">
            {learned}/{skills.length} đã học
          </span>
        )}
        {/* Tự cộng: a pixel check box, green when on, as the setting rows. */}
        <label className="relative inline-flex items-center gap-1.5 text-12 font-semibold text-fg-2 cursor-pointer hover:text-fg has-[input:disabled]:opacity-60 has-[input:disabled]:cursor-wait">
          <input
            className="peer absolute opacity-0 w-px h-px"
            type="checkbox"
            checked={settings.autoSkills}
            disabled={!!saving}
            onChange={(e) => setAuto(e.target.checked)}
          />
          <span
            className={
              "grid place-items-center flex-none size-4 text-transparent bg-bg-2 shadow-[inset_0_0_0_2px_var(--line-strong)] " +
              "peer-checked:text-ink peer-checked:bg-good peer-checked:shadow-[inset_-2px_-2px_0_var(--good-shade)] " +
              "peer-focus-visible:outline-2 peer-focus-visible:outline-ring peer-focus-visible:outline-offset-2"
            }
            aria-hidden="true"
          >
            <Icon name="check" size={11} />
          </span>
          Tự cộng
        </label>
        <Hint label="Tự cộng kỹ năng là gì?" id={`${hint}-auto`}>
          Bật thì bot tự cộng điểm kỹ năng ngay khi cộng được, mỗi lần 1 cấp, vào chưởng bot dùng nhiều nhất trong trận còn nâng
          được lúc đó: chưởng gốc (25 nội lực), rồi chưởng phá vùng/hàng (Thiên Hỏa Kích, Bách Lôi Uy Vũ, Tuyết Sơn Áp Đỉnh),
          Hỏa Kiếm Thuật (hệ Hỏa), nhánh sau của chưởng phá vùng, chưởng sát thương 75–100 nội lực, sau cùng là chưởng sát thương
          50 nội lực và chưởng tăng chỉ số, hồi máu (gần như không dùng). Mỗi cấp chưởng còn cần đủ cấp nhân vật, nên chưởng
          trước chưa nâng được thì điểm sang chưởng sau, cho tới khi hết điểm hay không còn kỹ năng nào đủ điều kiện. Bot
          cộng giữa các trận và khi nick rảnh, không cộng lúc đang đánh, và chừa điểm cho bước nhiệm vụ
          "Sử dụng điểm kỹ năng". Mặc định tắt; lưu theo nick.
        </Hint>
        {error && <span className="text-11 text-danger">{error}</span>}
      </div>
      <div className="@container min-h-0 scroll" ref={frame}>
        {!c || !shown ? (
          <p className="text-12 text-fg-3">
            {c ? "Server chưa gửi cây kỹ năng (s2c/30)." : "Đăng nhập để xem kỹ năng: server chỉ gửi cây kỹ năng lúc vào game."}
          </p>
        ) : (
          // With 420 px of room or less, the panel goes under the tree, which stays in the middle.
          <div className="grid grid-cols-[auto_minmax(240px,1fr)] gap-4 [align-items:start] [@container(max-width:420px)]:grid-cols-[minmax(0,1fr)]">
            <div
              className="relative flex-none bg-no-repeat bg-position-[0_0] bg-size-[100%_100%] [@container(max-width:420px)]:justify-self-center"
              role="group"
              aria-label={`Cây kỹ năng${element ? ` hệ ${element}` : ""}`}
              style={{ width: TREE.width, height: TREE.height, zoom, backgroundImage: TREE.url ? `url(${TREE.url})` : undefined }}
            >
              {skills.map((k) => k.place && <SkillBox key={k.id} skill={k} active={k.id === shown.id} onPick={() => setPicked(k.id)} />)}
            </div>
            <SkillPanel
              skill={shown}
              level={c.level}
              points={c.skillPoints ?? 0}
              busy={c.battle ? "đang đánh, đợi hết trận" : waiting ? "đang đợi server trả lời" : null}
              onUpgrade={() => {
                // Kept on the panel: the skill shown by default may not be the first that can take a level once upgraded.
                setPicked(shown.id);
                setSent({ id: shown.id, level: shown.level });
                onUpgrade(shown.id);
              }}
            />
          </div>
        )}
      </div>
      <footer className={DIALOG.footer}>
        <Button onClick={onClose}>
          Đóng
        </Button>
      </footer>
    </Dialog>
  );
}

/** One box of the tree: the icon, the level in the corner, a green mark when Nâng cấp can take a level now. */
function SkillBox({ skill: k, active, onPick }: { skill: Skill; active: boolean; onPick: () => void }) {
  const can = !k.blockers.length;
  const state = k.level > 0 ? `cấp ${k.level}/${k.maxLevel}` : "chưa học";
  const icon = skillIcon(k.id, k.level > 0);
  return (
    // The icon inside the background's frame; the picked one gets the game's orange frame (the focus ring wins over it).
    <button
      type="button"
      className={cn(
        "group/box absolute grid place-items-center p-0 bg-transparent bg-none [border:0] cursor-pointer",
        "focus-visible:outline-3 focus-visible:outline-ring focus-visible:outline-offset-1",
        active && "outline-3 outline-primary -outline-offset-1",
      )}
      style={{ left: k.place!.x, top: k.place!.y, width: TREE.box, height: TREE.box }}
      aria-pressed={active}
      aria-label={`${k.name}, ${state}${can ? ", nâng cấp được" : ""}`}
      title={k.panel.join("\n")}
      onClick={onPick}
    >
      {icon ? (
        <img className={cn("size-[50px] group-hover/box:brightness-115", k.level <= 0 && "opacity-85")} src={icon} alt="" />
      ) : (
        <span className="text-20 font-extrabold text-fg-3">{k.name.slice(0, 1)}</span>
      )}
      {k.level > 0 && (
        <span className="px absolute right-1 bottom-1 min-w-4 py-px px-[3px] bg-ink text-10 leading-[1.1] text-center text-primary">{k.level}</span>
      )}
      {can && (
        <span className="absolute top-[3px] right-[3px] grid place-items-center size-3.5 bg-good text-ink bevel-sm" aria-hidden="true">
          <Icon name="plus" size={9} />
        </span>
      )}
    </button>
  );
}

interface PanelProps {
  skill: Skill;
  level: number;
  points: number;
  /** Why Nâng cấp waits, beside what the skill needs. */
  busy: string | null;
  onUpgrade: () => void;
}

/** The detail panel: the game's lines, with what the next level needs marked met or not. */
function SkillPanel({ skill: k, level, points, busy, onUpgrade }: PanelProps) {
  const next = k.next;
  const icon = skillIcon(k.id, k.level > 0);
  const elementIcon = ELEMENT_ICON[Math.floor(k.id / 1000)];
  const needs = next
    ? [
        { ok: level >= next.requiredLevel, text: `Nhân vật đạt cấp ${next.requiredLevel}`, have: `bạn cấp ${level}` },
        ...(k.prerequisite ? [{ ok: k.prerequisite.learned, text: `Phải học ${k.prerequisite.name}`, have: k.prerequisite.learned ? "đã học" : "chưa học" }] : []),
        { ok: points >= next.cost, text: `Tiêu hao ${next.cost} điểm kỹ năng`, have: `còn ${points}` },
      ]
    : [];
  const why = busy ?? (k.blockers.length ? k.blockers.join(", ") : null);
  return (
    // The game's text, the met conditions green, the others red, Nâng cấp at the end.
    <section className="grid gap-2.5 min-w-0 px-3 py-2.5 bg-ink" aria-label={`Chi tiết ${k.name}`}>
      <header className="flex items-center gap-2.5">
        <span className="grid flex-none place-items-center size-[46px] bg-bg-2">{icon && <img className="size-[42px]" src={icon} alt="" />}</span>
        <div className="grid gap-[3px] min-w-0">
          <b className={cn("text-14 text-fg", k.level <= 0 && "text-danger")}>{k.name}</b>
          <span className="inline-flex items-center gap-1.5 text-11 text-fg-3">
            {k.level > 0 ? `Cấp ${k.level}/${k.maxLevel}` : `Chưa học · tối đa ${k.maxLevel}`}
            {elementIcon && <Icon name={elementIcon} size={11} />}
          </span>
        </div>
      </header>

      {k.current && (
        <div className="grid gap-[3px]">
          <span className={cn(TAG, "text-good")}>Cấp hiện tại: {k.current.level}</span>
          <p className={TEXT}>{k.current.description}</p>
          <span className="text-11 text-exp">{mana(k.current)}</span>
        </div>
      )}
      {next ? (
        <>
          <div className="grid gap-[3px]">
            <span className={TAG}>{k.current ? `Cấp kế tiếp: ${next.level}` : "Chưa học: cấp 1"}</span>
            <p className={TEXT}>{next.description}</p>
            <span className="text-11 text-exp">{mana(next)}</span>
          </div>
          <ul className="grid gap-[3px] pt-2 [border-top:1px_dashed_var(--line)]" aria-label="Điều kiện để học">
            {needs.map((n) => (
              <li key={n.text} className={cn("flex items-center gap-1.5 text-12", n.ok ? "text-good" : "text-danger")}>
                <Icon name={n.ok ? "check" : "close"} size={11} />
                {n.text} <small className="text-11 text-fg-3">({n.have})</small>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-y-1.5 gap-x-2.5">
            <Button kind="primary" small icon="plus" disabled={!!why} onClick={onUpgrade}>
              {k.level > 0 ? `Nâng lên cấp ${next.level}` : "Học kỹ năng"}
            </Button>
            <span className={cn("text-11 text-fg-3", why && "text-danger")} role="status">
              {why ?? `Mỗi lần bấm nâng 1 cấp, tốn ${next.cost} điểm kỹ năng, không lấy lại được`}
            </span>
          </div>
        </>
      ) : (
        <p className="flex items-center gap-1.5 m-0 text-12 text-good">
          <Icon name="check" size={12} /> Đã tối đa cấp {k.maxLevel}
        </p>
      )}
    </section>
  );
}
