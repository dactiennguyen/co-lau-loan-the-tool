// What Đăng xuất tất cả of the sidebar would cut short, said in its confirm box. Without React, like sync.ts; the root
// tests run this file under Node, which cannot resolve @/: only types are imported through it.
import type { Account } from "@/api/types";

/** The sessions of the accounts: connecting, in the game, and of those in a battle, running Tự đánh or a quest run. */
export interface Sessions {
  connecting: number;
  inGame: number;
  battles: number;
  jobs: number;
  quests: number;
}

export function sessions(accounts: Account[]): Sessions {
  const s: Sessions = { connecting: 0, inGame: 0, battles: 0, jobs: 0, quests: 0 };
  for (const a of accounts) {
    if (a.status === 1) s.connecting++;
    if (a.status !== 2 && a.status !== 3) continue;
    s.inGame++;
    const c = a.character;
    if (c?.battle) s.battles++;
    if (c?.job && c.job.done == null) s.jobs++;
    if (c?.questRun && c.questRun.done == null) s.quests++;
  }
  return s;
}

/** "a", "a và b", "a, b và c". */
const and = (parts: string[]) => (parts.length > 1 ? `${parts.slice(0, -1).join(", ")} và ${parts[parts.length - 1]}` : parts.join(""));

/** The question of the confirm box; null when no account has a session, so there is nothing to ask about. */
export function logoutAllText(s: Sessions): string | null {
  if (!s.inGame && !s.connecting) return null;
  const leave = [s.inGame && `${s.inGame} nick đang trong game sẽ thoát`, s.connecting && `${s.connecting} nick đang kết nối sẽ dừng`];
  const work = [s.jobs && `${s.jobs} nick đang tự đánh quái`, s.quests && `${s.quests} nick đang tự làm nhiệm vụ`];
  const left = (xs: (string | 0)[]) => xs.filter((x): x is string => !!x);
  let text = `Đăng xuất mọi nick? ${and(left(leave))}.`;
  if (left(work).length) text += ` ${and(left(work))} sẽ dừng giữa chừng${s.battles ? ", trận đang đánh bị bỏ dở" : ""}.`;
  else if (s.battles) text += ` ${s.battles} nick đang trong trận: trận bị bỏ dở.`;
  return text;
}
