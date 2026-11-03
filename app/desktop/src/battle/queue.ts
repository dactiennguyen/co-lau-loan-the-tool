// The queue of the battle window (useBattle.ts), kept short while the window cannot draw (minimized or hidden, it draws
// no frames and its timers slow down): of the messages that will be drawn at once, without motion, those whose result
// a later one draws over are taken out. Without React, like store/sync.ts; the root tests run this file under Node,
// which cannot resolve @/: only types are imported through it.
import type { BattleMsg } from "@/api/types";

/** Past this many messages waiting, the queue is compacted. */
export const LONG = 16;

/**
 * `queue` (oldest first, `at` rising) without the messages that came at or before `stale` and that drawing it at once
 * would not show:
 * - those before the last "open": an open draws the whole view anew;
 * - in each run of "turn" and "move" between the others, all but the last turn and the last move: a move drawn at once
 *   ends on its own board, gauges and turn (the board the bot keeps wins), and a turn only says whose turn it is.
 * The "open", "end" and "picked" after that open stay, in order. The messages after `stale` are left as they are, and
 * the last stale move is kept, so a later move that is drawn with motion starts from its board.
 * The same array when nothing is taken out.
 */
export function compact<T extends { msg: { kind: BattleMsg["kind"] }; at: number }>(queue: T[], stale: number): T[] {
  let n = 0;
  while (n < queue.length && queue[n].at <= stale) n++;
  let start = 0;
  for (let i = n - 1; i > 0; i--) {
    if (queue[i].msg.kind === "open") {
      start = i;
      break;
    }
  }
  // Backwards: the first turn and the first move met in a run are its last ones.
  const kept: T[] = [];
  let turn = false;
  let move = false;
  for (let i = n - 1; i >= start; i--) {
    const kind = queue[i].msg.kind;
    if (kind === "turn") {
      if (turn) continue;
      turn = true;
    } else if (kind === "move") {
      if (move) continue;
      move = true;
    } else {
      turn = move = false;
    }
    kept.push(queue[i]);
  }
  if (kept.length === n) return queue;
  kept.reverse();
  return [...kept, ...queue.slice(n)];
}
