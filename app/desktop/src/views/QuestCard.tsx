import { useEffect, useRef, useState } from "react";
import type { QuestStepRef } from "../api";
import { Bar } from "../components/Bar";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Icon } from "../components/Icon";
import { Stepper } from "../components/Stepper";
import { num } from "../format";
import type { Account, Quest } from "../types";
import "./QuestCard.css";

interface Props {
  account: Account;
  /** "Tự làm nhiệm vụ" without `step`; ▶ on that step with it. */
  onStart: (maxLosses: number, step?: QuestStepRef) => void;
  onStop: () => void;
}

type State = "done" | "current" | "todo";

/** Each step with its position, state and count: kills or boss damage for steps that ask for more than one. */
function steps(q: Quest) {
  return q.steps.map((s, i) => {
    const state: State = i < q.current ? "done" : i === q.current ? "current" : "todo";
    const have = state === "done" ? s.required : state === "current" ? Math.min(q.progress, s.required) : 0;
    return { ...s, at: i, state, count: s.required > 1 ? `${num(have)}/${num(s.required)}` : "", part: have / Math.max(1, s.required) };
  });
}

/**
 * The current main quest (s2c/39): its steps, each with ▶ to play that step alone, and "Tự làm nhiệm vụ" for all of them;
 * then what the bot does. The server counts only the current step, so only its ▶ is live.
 */
export function QuestCard({ account, onStart, onStop }: Props) {
  const c = account.character;
  const q = c?.quest;
  const run = c?.questRun;
  const running = !!run && run.done == null;
  // The step whose ▶ turned into a stop button.
  const playing = running ? run.step : null;
  const [losses, setLosses] = useState(1);
  // Online and no fight job: one task at a time, so the job is stopped first (Bot::quest refuses too).
  const fighting = !!c?.job && c.job.done == null;
  const idle = account.status === 2 && !fighting;
  const stepList = q ? steps(q) : [];
  // The one step that spends something the player chose: a potential point (by the stat plan, else into Cường lực).
  const spendsPoint = stepList.some((s) => s.state !== "done" && s.text.startsWith("Nâng điểm tiềm năng"));
  // Keeps the step being played in view, with the one before it, when the list is shorter than the quest.
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const reveal = () => {
      const current = el.querySelector<HTMLElement>('[aria-current="step"]');
      if (current) el.scrollTop = Math.max(0, current.offsetTop - current.offsetHeight - 4);
    };
    reveal();
    // The list gets its height only after the fonts load and the cards around it settle, so scroll again then.
    const watch = new ResizeObserver(reveal);
    watch.observe(el);
    document.fonts.ready.then(reveal);
    return () => watch.disconnect();
  }, [q?.id, q?.current]);
  return (
    <Card
      title={q?.title ?? "Nhiệm vụ"}
      icon="scroll"
      tone="var(--primary)"
      subtitle={q ? <>Nhiệm vụ chính <span className="px">#{q.id}</span></> : c ? "Server chưa gửi nhiệm vụ nào" : "Đăng nhập để xem nhiệm vụ"}
      aside={q && <span className="quest__step px">{Math.min(q.current + 1, q.steps.length)}/{q.steps.length}</span>}
      className="quest"
    >
      {q && (
        <ol ref={list} className="quest__steps scroll">
          {stepList.map((s) => (
            <li key={s.index} className={`step step--${s.state}`} aria-current={s.state === "current" ? "step" : undefined}>
              <span className="step__mark" aria-hidden="true">
                {s.state === "done" && <Icon name="check" size={11} />}
              </span>
              <div className="step__body">
                <div className="step__line">
                  <span className="step__text">{s.text}</span>
                  {s.count && <span className="step__count px">{s.count}</span>}
                </div>
                {s.state === "current" && s.required > 1 && <Bar value={s.part} fill="var(--primary)" thin />}
              </div>
              <span className="step__slot">
                {s.state === "done" ? null : playing === s.at ? (
                  <Button kind="danger" small icon="stop" className="step__play" aria-label={`Dừng bước "${s.text}"`} onClick={onStop} />
                ) : (
                  <Button
                    kind={s.state === "current" ? "primary" : "tonal"}
                    small
                    icon="play"
                    className="step__play"
                    aria-label={`Làm bước "${s.text}"`}
                    // Button's own title repeats the label; a later step says why it cannot be played instead.
                    {...(s.state === "todo" && { title: "Làm xong các bước trước đã" })}
                    disabled={s.state !== "current" || !idle || running}
                    onClick={() => onStart(losses, [q.id, s.at])}
                  />
                )}
              </span>
            </li>
          ))}
        </ol>
      )}

      {run && (
        <div className={`quest__run${running ? " quest__run--live" : ""}`} role="status">
          <span className="quest__doing">{running ? run.doing || "Đang chọn việc…" : run.done}</span>
          <span className="quest__score">
            <b className="win">{run.wins} thắng</b> · <b className="loss">{run.losses} thua</b> · +{num(run.exp)} EXP · +{num(run.coin)} xu
            {run.completed > 0 && <> · xong {run.completed} nhiệm vụ</>}
          </span>
        </div>
      )}

      <div className="quest__controls">
        <Button
          kind="tonal"
          icon="play"
          disabled={!idle || !q || running}
          title="Bot nói chuyện với NPC, đánh quái và boss của bước, tự qua cổng khi NPC ở map khác, và dừng ở bước chưa biết làm"
          onClick={() => onStart(losses)}
        >
          Tự làm nhiệm vụ
        </Button>
        {/* Also live for a battle played out after an earlier Dừng, so it can still be surrendered. */}
        <Button kind="danger" icon="stop" disabled={!running && !c?.battle} onClick={onStop}>
          Dừng
        </Button>
        <span className="quest__losses">
          <span>Thua tối đa</span>
          <Stepper label="số trận thua" max={99} value={losses} onChange={setLosses} />
        </span>
      </div>
      {fighting && <p className="quest__hint quest__hint--busy">Đang đánh quái: bấm Dừng ở tab Đánh quái rồi mới làm nhiệm vụ.</p>}
      {spendsPoint && (
        <p className="quest__hint">
          Bước "Nâng điểm tiềm năng" sẽ cộng 1 điểm {account.statPlan ? "theo Tự cộng ở khung Chỉ số" : "vào Cường lực"}.
        </p>
      )}
    </Card>
  );
}
