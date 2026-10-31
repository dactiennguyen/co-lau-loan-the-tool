// The kinds of log line (LogKind of cllt-core's bot.rs) as the Nhật ký filters name them. A new kind goes here, in
// bot.rs and in the table of docs/integration/rust/README.md#nhật-ký-và-thống-kê; the root tests check the three agree.
import type { LogKind } from "./types";

/** In the order of the filter row; `tone` colours the chip and the tag of each line. */
export const LOG_KINDS: { kind: LogKind; label: string; tone: string }[] = [
  { kind: "connection", label: "Kết nối", tone: "var(--fg-3)" },
  { kind: "battle", label: "Trận", tone: "var(--piece-sword)" },
  { kind: "quest", label: "Nhiệm vụ", tone: "var(--coin)" },
  { kind: "travel", label: "Di chuyển", tone: "var(--exp)" },
  { kind: "character", label: "Nhân vật", tone: "var(--piece-yinyang)" },
  { kind: "item", label: "Vật phẩm", tone: "var(--piece-peach)" },
  { kind: "server", label: "Server", tone: "var(--piece-drop)" },
];

export const kindOf = (kind: LogKind) => LOG_KINDS.find((k) => k.kind === kind) ?? { kind, label: kind, tone: "var(--fg-3)" };
