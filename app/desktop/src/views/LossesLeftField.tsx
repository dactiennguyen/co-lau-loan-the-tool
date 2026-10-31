import { useEffect, useRef, useState } from "react";
import { api } from "../api";
import { Stepper } from "../components/Stepper";

/** How many more losses end a run that allows `max` and has lost `losses` (Bot: a loss that brings the losses to `max`
 * ends it); at least one, as a loss to a boss counts but never ends it. */
export const lossesLeft = (max: number, losses: number) => Math.max(1, max - losses);

/** How long after the last change the number goes to the bot: a typed number changes on every key. */
const QUIET = 400;

/** What the name of the field says when pointed at. */
export const LOSSES_LEFT_HINT =
  "Thua thêm chừng ấy trận nữa thì bot dừng; thua boss có tính nhưng không làm bot dừng. Đổi số là áp dụng ngay cho lần chạy này, Thua tối đa đã lưu vẫn giữ cho lần sau.";

/**
 * "Thua còn lại" of a fight job or quest run going on, in place of its Thua tối đa field: changed with − + or typed, it
 * goes to the bot, which ends the run after that many more losses (Bot::set_losses_left). The number shown is the one
 * chosen until the run comes back with it, or with a new loss.
 */
export function LossesLeftField({ id, max, losses }: { id: number; max: number; losses: number }) {
  const [draft, setDraft] = useState<number | null>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => setDraft(null), [max, losses]);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const change = (left: number) => {
    setDraft(left);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => api.setLossesLeft(id, left).catch(() => setDraft(null)), QUIET);
  };
  return <Stepper label="số lượt thua còn lại" value={draft ?? lossesLeft(max, losses)} onChange={change} />;
}
