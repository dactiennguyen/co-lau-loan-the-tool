// The four potential stats as the Chỉ số card shows them, in the order of `stats` (s2c/9), each with its c2s/10 index:
// the index "Cộng +1" sends and the weights of a stat plan go by (potentials.rs of cllt-core). The two orders differ
// (docs/app/events/12-skills-items.md#điểm-tiềm-năng). Without React, like toasts.ts.
import type { StatPlan } from "./types";

export const POTENTIALS = [
  { name: "Cường lực", index: 0 },
  { name: "Thân pháp", index: 2 },
  { name: "Nội lực", index: 1 },
  { name: "Thể lực", index: 3 },
] as const;

const BY_INDEX = ["Cường lực", "Nội lực", "Thân pháp", "Thể lực"];
const ELEMENTS: Record<number, string> = { 1: "Hỏa", 4: "Thủy" };

/** The c2s/10 index of the stat that raises attack for an element (field01): Hỏa Cường lực, Thủy Nội lực. */
export const mainStat = (element: number | null | undefined) => (element === 1 ? 0 : element === 4 ? 1 : null);

/** Where "auto" puts the points: "hệ Hỏa: Cường lực", or why it cannot tell. */
export function autoText(element: number | null | undefined) {
  const main = mainStat(element);
  if (element == null) return "biết hệ khi vào game";
  return main == null ? "chưa biết chỉ số chính của hệ này, nên không cộng" : `hệ ${ELEMENTS[element]}: ${BY_INDEX[main]}`;
}

/** A plan in words: "Tắt", "Theo hệ Hỏa: Cường lực", "Cường lực 3, Thân pháp 1" (in the card's order). */
export function planText(plan: StatPlan | null, element: number | null | undefined) {
  if (!plan) return "Tắt";
  if (plan === "auto") return element == null ? "Theo hệ" : `Theo ${autoText(element)}`;
  return POTENTIALS.filter((p) => plan.weights[p.index] > 0)
    .map((p) => `${p.name} ${plan.weights[p.index]}`)
    .join(", ");
}
