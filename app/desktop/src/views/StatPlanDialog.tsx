import { useState } from "react";
import { api } from "../api";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import { Stepper } from "../components/Stepper";
import { num } from "../format";
import { autoText, mainStat, POTENTIALS } from "../potentials";
import type { Account, StatPlan } from "../types";
import "./StatPlanDialog.css";

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
  const option = (value: Mode, title: string, text: string) => (
    <label className={`plan-opt${mode === value ? " plan-opt--on" : ""}`}>
      <input type="radio" name="stat-plan" value={value} checked={mode === value} onChange={() => setMode(value)} />
      <span className="plan-opt__body">
        <b>{title}</b>
        <span>{text}</span>
      </span>
    </label>
  );
  return (
    <Dialog
      title="Tự cộng điểm tiềm năng"
      subtitle={account.label}
      onClose={onClose}
      onSubmit={(e) => {
        e.preventDefault();
        api.setStats(account.id, next).then(onClose, (err) => setError(String(err?.message ?? err)));
      }}
    >
      <div className="plan-opts" role="radiogroup" aria-label="Cách tự cộng">
        {option("off", "Tắt", 'Chỉ cộng khi bấm + ở từng chỉ số. Bước "Nâng điểm tiềm năng" cộng vào Cường lực.')}
        {option("auto", "Theo hệ", `Dồn hết vào chỉ số tăng tấn công (${autoText(c?.element)}).`)}
        {option("weights", "Tỉ lệ", "Chia điểm theo tỉ lệ dưới đây, chỉ số đang thiếu so với tỉ lệ được cộng trước.")}
      </div>
      {mode === "weights" && (
        <ul className="plan-weights">
          {POTENTIALS.map((p) => (
            <li key={p.index}>
              <span>{p.name}</span>
              <Stepper label={`tỉ lệ ${p.name}`} min={0} max={9} value={weights[p.index]} onChange={(w) => setWeight(p.index, w)} />
            </li>
          ))}
        </ul>
      )}
      {next && (
        <p className="dialog__note">
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
      {error && <p className="dialog__error">{error}</p>}
      <footer>
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
