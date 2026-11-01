import { useState } from "react";
import { api } from "../api";
import { Button } from "../components/Button";
import { cn } from "../cn";
import { DIALOG, Dialog } from "../components/Dialog";
import { Stepper } from "../components/Stepper";
import { num } from "../format";
import { autoText, MAIN_TEXT, mainStat, POTENTIALS } from "../potentials";
import type { Account, StatPlan } from "../types";

type Mode = "off" | "auto" | "weights";
type Weights = [number, number, number, number];

interface Props {
  account: Account;
  onClose: () => void;
}

/**
 * "Tự cộng điểm tiềm năng": off, the main stat of the element, or weights. Saved to accounts.json on Lưu, and the session
 * spends what it can at once (Bot::set_stats): so the weights are chosen here, not sent with each click.
 */
export function StatPlanDialog({ account, onClose }: Props) {
  const c = account.character;
  const plan = account.statPlan;
  const [mode, setMode] = useState<Mode>(plan == null ? "off" : plan === "auto" ? "auto" : "weights");
  const [weights, setWeights] = useState<Weights>(() => {
    if (plan && plan !== "auto") return [...plan.weights];
    const main = mainStat(c?.element) ?? 0;
    return [0, 1, 2, 3].map((i) => (i === main ? 1 : 0)) as Weights;
  });
  const [error, setError] = useState("");
  const next: StatPlan | null = mode === "off" ? null : mode === "auto" ? "auto" : { weights };
  const points = c?.statPoints ?? 0;
  const setWeight = (index: number, w: number) => setWeights((ws) => ws.map((v, i) => (i === index ? w : v)) as Weights);
  // The three ways to spend potential points, as radio rows: a dark plate each, the chosen one with a gold stripe.
  const option = (value: Mode, title: string, text: string) => (
    <label
      className={cn(
        "flex items-start gap-2.5 px-2.5 py-2 bg-ink shadow-[inset_3px_0_0_transparent] cursor-pointer hover:bg-bg-2",
        mode === value && "shadow-[inset_3px_0_0_var(--primary)] bg-bg-2",
      )}
    >
      <input
        type="radio"
        name="stat-plan"
        value={value}
        checked={mode === value}
        onChange={() => setMode(value)}
        className="mt-0.5 mx-0 mb-0 accent-primary focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2"
      />
      <span className="grid gap-0.5">
        <b className="text-[12.5px] text-fg">{title}</b>
        <span className="text-11 leading-[1.45] text-fg-2">{text}</span>
      </span>
    </label>
  );
  return (
    <Dialog
      className="w-[440px]"
      title="Tự cộng điểm tiềm năng"
      subtitle={account.label}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        api.setStats(account.id, next).then(onClose, (err) => setError(String(err?.message ?? err)));
      }}
    >
      <div className="grid gap-1.5" role="radiogroup" aria-label="Cách tự cộng">
        {option("off", "Tắt", 'Chỉ cộng khi bấm + ở từng chỉ số. Bước "Nâng điểm tiềm năng" cộng vào Cường lực.')}
        {option("auto", "Theo hệ", `Dồn hết vào chỉ số tăng tấn công: ${MAIN_TEXT}. Nick này ${autoText(c?.element)}.`)}
        {option("weights", "Tỉ lệ", "Chia điểm theo tỉ lệ dưới đây, chỉ số đang thiếu so với tỉ lệ được cộng trước.")}
      </div>
      {mode === "weights" && (
        // Wide enough for each name on one line beside the wider number field of a Stepper.
        <ul className="list-none m-0 p-0 grid grid-cols-[1fr_1fr] gap-y-1.5 gap-x-3.5">
          {POTENTIALS.map((p) => (
            <li key={p.index} className="flex items-center justify-between gap-1.5">
              <span className="text-12 font-semibold text-fg-2 whitespace-nowrap">{p.name}</span>
              <Stepper label={`tỉ lệ ${p.name}`} min={0} value={weights[p.index]} onChange={(w) => setWeight(p.index, w)} />
            </li>
          ))}
        </ul>
      )}
      {next && (
        <p className={DIALOG.note}>
          {points > 0 ? (
            <>
              Còn <b>{num(points)}</b> điểm chưa cộng: bot cộng ngay khi rảnh,{" "}
            </>
          ) : (
            "Bot cộng khi rảnh, "
          )}
          còn khi đang đánh quái hay làm nhiệm vụ thì cộng giữa các trận. Bot chừa điểm cho các bước "Nâng điểm tiềm năng" của
          nhiệm vụ. Điểm đã cộng không lấy lại được (trừ khi dùng Tẩy Tủy Đan).
        </p>
      )}
      {error && <p className={DIALOG.error}>{error}</p>}
      <footer className={DIALOG.footer}>
        <Button kind="ghost" onClick={onClose}>
          Huỷ
        </Button>
        <Button kind="primary" type="submit" icon="check" disabled={mode === "weights" && weights.every((w) => w === 0)}>
          Lưu
        </Button>
      </footer>
    </Dialog>
  );
}
