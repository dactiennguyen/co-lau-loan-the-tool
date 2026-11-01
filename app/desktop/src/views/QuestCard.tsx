import { useEffect, useRef } from "react";
import type { QuestStepRef } from "../api";
import { Bar } from "../components/Bar";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { DetailsToggle } from "../components/DetailsToggle";
import { Elapsed } from "../components/Elapsed";
import { Icon } from "../components/Icon";
import { Stepper } from "../components/Stepper";
import { cn } from "../cn";
import { num } from "../format";
import { useStore } from "../store";
import type { Account, Quest } from "../types";
import { useFightSetting } from "../useFightSetting";
import { BattlePanel } from "./BattlePanel";
import { LootRow } from "./LootRow";
import { LOSSES_LEFT_HINT, LossesLeftField } from "./LossesLeftField";

interface Props {
  account: Account;
  /** "Tự làm nhiệm vụ" without `step`; ▶ on that step with it. */
  onStart: (maxLosses: number, step?: QuestStepRef) => void;
  onStop: () => void;
}

type State = "done" | "current" | "todo";

/** What each state adds to a step: its row, its mark (done and current have no frame), its text and its count. */
const STEP: Record<State, { row: string; mark: string; text: string; count: string }> = {
  done: { row: "", mark: "bg-good text-ink", text: "text-fg-2", count: "" },
  current: {
    row: "bg-card-2 shadow-[inset_0_0_0_2px_var(--primary)]",
    mark: "bg-primary shadow-[inset_-3px_-3px_0_var(--primary-shade)]",
    text: "text-fg font-extrabold",
    count: "text-primary",
  },
  todo: { row: "", mark: "border-2 border-line", text: "", count: "" },
};
/** One line: what the bot does on the left, the score on the right. */
const RUN = "flex items-center gap-2.5 py-[5px] px-2.5 bg-ink text-[11.5px] whitespace-nowrap";
/** What the bot does: gold, blue while the run goes on. */
const DOING = "min-w-0 overflow-hidden text-ellipsis font-extrabold text-coin";
const HINT = "text-[10.5px] text-fg-3";

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
  const details = useStore((s) => s.battleDetails);
  const toggle = useStore((s) => s.toggleBattleDetails);
  const q = c?.quest;
  const run = c?.questRun;
  const running = !!run && run.done == null;
  // The step whose ▶ turned into a stop button.
  const playing = running ? run.step : null;
  const [losses, setLosses] = useFightSetting(account, "questLosses");
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
      aside={q && <span className="text-13 text-primary px">{Math.min(q.current + 1, q.steps.length)}/{q.steps.length}</span>}
      className="[--frame:var(--primary)]"
    >
      {/* The steps take what the card has left and scroll when the window is short. */}
      {q && (
        <ol ref={list} className="relative flex-1 min-h-24 grid [align-content:start] gap-1 scroll">
          {stepList.map((s) => (
            <li
              key={s.index}
              className={cn("flex items-center gap-2.5 py-1 pr-[5px] pl-2 bg-bg-2", STEP[s.state].row)}
              aria-current={s.state === "current" ? "step" : undefined}
            >
              <span className={cn("flex-none grid place-items-center w-4 h-4", STEP[s.state].mark)} aria-hidden="true">
                {s.state === "done" && <Icon name="check" size={11} />}
              </span>
              <div className="flex-1 min-w-0 grid gap-1">
                <div className="flex justify-between gap-2.5">
                  <span className={cn("text-12 font-semibold text-fg-3", STEP[s.state].text)}>{s.text}</span>
                  {s.count && <span className={cn("flex-none text-12 text-fg-3 px", STEP[s.state].count)}>{s.count}</span>}
                </div>
                {s.state === "current" && s.required > 1 && <Bar value={s.part} fill="var(--primary)" thin />}
              </div>
              {/* ▶ at the end of a step to do (■ while that step plays); empty on steps done, so the counts line up. */}
              <span className="flex-none grid place-items-center w-6 h-6">
                {s.state === "done" ? null : playing === s.at ? (
                  <Button kind="danger" small icon="stop" className="w-6 h-6" aria-label={`Dừng bước "${s.text}"`} onClick={onStop} />
                ) : (
                  <Button
                    kind={s.state === "current" ? "primary" : "tonal"}
                    small
                    icon="play"
                    className="w-6 h-6"
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
        <div className={RUN} role="status">
          <span className={cn(DOING, running && "text-s-fighting")}>{running ? run.doing || "Đang chọn việc…" : run.done}</span>
          {c?.battle && <DetailsToggle open={details} onToggle={toggle} controls="quest-battle" />}
          <span className="ml-auto text-fg-2">
            <b className="text-s-online">{run.wins} thắng</b> · <b className="text-danger">{run.losses} thua</b> · +{num(run.exp)} EXP · +{num(run.coin)} xu
            {run.completed > 0 && <> · xong {run.completed} nhiệm vụ</>} · <Elapsed from={run.startedAt} to={run.endedAt} />
          </span>
        </div>
      )}
      {/* Đã nhặt of the run, as a second line of the row above. */}
      {run && run.picked.length > 0 && (
        <div className="-mt-2.5 pt-0 px-2.5 pb-[5px] bg-ink">
          <LootRow items={run.picked} />
        </div>
      )}
      {/* The battle on, as the fight job shows it, under Chi tiết: a step's fights ("Đánh bại Kẻ Gây Rối"), one played out
          after Dừng, or the fight job's (then with a row of its own). */}
      {c?.battle && !run && (
        <div className={RUN} role="status">
          <span className={cn(DOING, "text-s-fighting")}>Đang đánh {c.battle.mobName}</span>
          <DetailsToggle open={details} onToggle={toggle} controls="quest-battle" />
        </div>
      )}
      {c?.battle && details && (
        <div className="p-2.5 bg-ink" id="quest-battle">
          <BattlePanel battle={c.battle} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-y-1.5 gap-x-2.5">
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
        <span className="inline-flex items-center gap-1.5 ml-auto text-11 font-bold text-fg-2">
          {/* While the run goes on, the losses it may still take, changed in place; after Dừng Thua tối đa again, as saved. */}
          {running ? (
            <>
              <span title={LOSSES_LEFT_HINT}>Thua còn lại</span>
              <LossesLeftField id={account.id} max={run.maxLosses} losses={run.losses} />
            </>
          ) : (
            <>
              <span>Thua tối đa</span>
              <Stepper label="số trận thua" value={losses} onChange={setLosses} />
            </>
          )}
        </span>
      </div>
      {fighting && <p className={cn(HINT, "text-primary")}>Đang đánh quái: bấm Dừng ở tab Đánh quái rồi mới làm nhiệm vụ.</p>}
      {spendsPoint && (
        <p className={HINT}>
          Bước "Nâng điểm tiềm năng" sẽ cộng 1 điểm {account.statPlan ? "theo Tự cộng ở khung Chỉ số" : "vào Cường lực"}.
        </p>
      )}
    </Card>
  );
}
