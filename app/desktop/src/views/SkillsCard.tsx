import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { ELEMENT_ICON, ELEMENT_NAME } from "../components/ElementTag";
import { Icon } from "../components/Icon";
import { num } from "../format";
import { skillIcon, TREE } from "../skillIcons";
import type { Account, Skill, SkillLevel } from "../types";
import "./SkillsCard.css";

/** Nội lực of one "thành" (12-skills-items.md#bảng-kỹ-năng). */
const THANH = 25;
/** A Nâng cấp the server has not answered in this long is let go, and the button comes back. */
const ANSWER_MS = 8000;
/** The narrowest the detail panel gets beside the tree, and the gap between them (SkillsCard.css). */
const PANEL_MIN = 240;
const GAP = 16;

const mana = (l: SkillLevel) => `Tiêu hao ${(l.mana / THANH).toLocaleString("vi-VN")} thành nội lực`;

/**
 * Kỹ năng tab, as the game's Bản thân → Kỹ năng: the 9 skills of the element on the tree background (s2c/30), colour
 * once learned, grey before, with the level; the picked one on the right with its current and next level, what the next
 * one needs, and Nâng cấp (c2s/1191, one level a click). The skill that can take a level first is shown at the start.
 */
export function SkillsCard({ account, onUpgrade }: { account: Account; onUpgrade: (skill: number) => void }) {
  const c = account.character;
  const [picked, setPicked] = useState<number | null>(null);
  // The skill and level of the last Nâng cấp, until s2c/10 kind 32 changes that level or ANSWER_MS goes by.
  const [sent, setSent] = useState<{ id: number; level: number } | null>(null);
  useEffect(() => {
    if (!sent) return;
    const t = setTimeout(() => setSent(null), ANSWER_MS);
    return () => clearTimeout(t);
  }, [sent]);
  // The tree shrinks (0.6 to 1) to stay as tall as the card and leave PANEL_MIN beside it.
  const body = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const drawn = !!c?.skills.length;
  useLayoutEffect(() => {
    const box = body.current?.parentElement; // the card body, which scrolls
    if (!box) return;
    const fit = () => {
      const s = getComputedStyle(box), px = (v: string) => parseFloat(v) || 0;
      const h = box.clientHeight - px(s.paddingTop) - px(s.paddingBottom);
      const w = box.clientWidth - px(s.paddingLeft) - px(s.paddingRight);
      setZoom(Math.max(0.6, Math.min(1, h / TREE.height, (w - PANEL_MIN - GAP) / TREE.width)));
    };
    const watch = new ResizeObserver(fit);
    watch.observe(box);
    return () => watch.disconnect();
  }, [drawn]);

  if (!c || !c.skills.length) {
    return (
      <Card title="Kỹ năng" icon="bolt" className="sk">
        <p className="sk__none">
          {c ? "Server chưa gửi cây kỹ năng (s2c/30)." : "Đăng nhập để xem kỹ năng: server chỉ gửi cây kỹ năng lúc vào game."}
        </p>
      </Card>
    );
  }
  const skills = c.skills;
  const shown = skills.find((k) => k.id === picked) ?? skills.find((k) => !k.blockers.length) ?? skills[0];
  const learned = skills.filter((k) => k.level > 0).length;
  const element = c.element != null ? ELEMENT_NAME[c.element] : undefined;
  const waiting = !!sent && skills.find((k) => k.id === sent.id)?.level === sent.level;
  return (
    <Card
      title="Kỹ năng"
      icon="bolt"
      className="sk"
      subtitle={`${element ? `Hệ ${element} · ` : ""}${num(c.skillPoints ?? 0)} điểm kỹ năng`}
      aside={<span className="sk__count">{learned}/{skills.length} đã học</span>}
    >
      <div className="sk__body" ref={body}>
        <div
          className="sk__tree"
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
    </Card>
  );
}

/** One box of the tree: the icon, the level in the corner, a green mark when Nâng cấp can take a level now. */
function SkillBox({ skill: k, active, onPick }: { skill: Skill; active: boolean; onPick: () => void }) {
  const can = !k.blockers.length;
  const state = k.level > 0 ? `cấp ${k.level}/${k.maxLevel}` : "chưa học";
  const icon = skillIcon(k.id, k.level > 0);
  return (
    <button
      type="button"
      className={`sk__box${active ? " sk__box--on" : ""}${k.level > 0 ? "" : " sk__box--grey"}`}
      style={{ left: k.place!.x, top: k.place!.y, width: TREE.box, height: TREE.box }}
      aria-pressed={active}
      aria-label={`${k.name}, ${state}${can ? ", nâng cấp được" : ""}`}
      title={k.panel.join("\n")}
      onClick={onPick}
    >
      {icon ? <img src={icon} alt="" /> : <span className="sk__noicon">{k.name.slice(0, 1)}</span>}
      {k.level > 0 && <span className="sk__lv px">{k.level}</span>}
      {can && (
        <span className="sk__can" aria-hidden="true">
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
    <section className="sk__panel" aria-label={`Chi tiết ${k.name}`}>
      <header className="sk__head">
        <span className="sk__icon">{icon && <img src={icon} alt="" />}</span>
        <div>
          <b className={k.level > 0 ? "" : "sk__off"}>{k.name}</b>
          <span className="sk__facts">
            {k.level > 0 ? `Cấp ${k.level}/${k.maxLevel}` : `Chưa học · tối đa ${k.maxLevel}`}
            {elementIcon && <Icon name={elementIcon} size={11} />}
          </span>
        </div>
      </header>

      {k.current && (
        <div className="sk__lvl">
          <span className="sk__tag sk__tag--now">Cấp hiện tại: {k.current.level}</span>
          <p>{k.current.description}</p>
          <span className="sk__mana">{mana(k.current)}</span>
        </div>
      )}
      {next ? (
        <>
          <div className="sk__lvl">
            <span className="sk__tag">{k.current ? `Cấp kế tiếp: ${next.level}` : "Chưa học: cấp 1"}</span>
            <p>{next.description}</p>
            <span className="sk__mana">{mana(next)}</span>
          </div>
          <ul className="sk__needs" aria-label="Điều kiện để học">
            {needs.map((n) => (
              <li key={n.text} className={n.ok ? "sk__need--ok" : "sk__need--no"}>
                <Icon name={n.ok ? "check" : "close"} size={11} />
                {n.text} <small>({n.have})</small>
              </li>
            ))}
          </ul>
          <div className="sk__act">
            <Button kind="primary" small icon="plus" disabled={!!why} onClick={onUpgrade}>
              {k.level > 0 ? `Nâng lên cấp ${next.level}` : "Học kỹ năng"}
            </Button>
            <span className={why ? "sk__why" : "sk__hint"} role="status">
              {why ?? `Mỗi lần bấm nâng 1 cấp, tốn ${next.cost} điểm kỹ năng, không lấy lại được`}
            </span>
          </div>
        </>
      ) : (
        <p className="sk__top">
          <Icon name="check" size={12} /> Đã tối đa cấp {k.maxLevel}
        </p>
      )}
    </section>
  );
}
