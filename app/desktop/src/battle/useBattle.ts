// The battle window's state (docs/integration/rust/features.md#cửa-sổ-trận): the messages of src-tauri's
// battle_window.rs played one after the other as the game draws them. A move: the swap, the skill's cells (or Kiếm lửa),
// then each wave: the cleared pieces burst, the others fall, new ones drop in from above; then the HP, the numbers that
// float up, "Thêm lượt". The bot plays a move a second while a long cascade takes seconds to draw, so the later a message
// is drawn the faster its steps go, and one more than LATE behind is drawn at once: the window never runs far behind.
import { useEffect, useRef, useState } from "react";
import { api } from "@/api";
import { listenThenLoad, unseen } from "@/store/sync";
import type { BattleEnd, BattleMsg, BattleOpen, BattleState, Gauge, Picked, Turn } from "@/api/types";

/** One piece on the board: its own id, so React moves it rather than redraws it; `lift` rows above its cell while it
 * waits to drop in. */
export interface Piece {
  id: number;
  v: number;
  cell: number;
  phase: "idle" | "pop" | "flash" | "enter";
  lift: number;
}
export interface Floater {
  id: number;
  side: "me" | "mob";
  text: string;
  tone: "damage" | "heal";
}
export interface Banner {
  id: number;
  text: string;
  /** A skill's icon (skillIcon). */
  skill?: number;
}
export interface View {
  open: BattleOpen | null;
  pieces: Piece[];
  me: Gauge;
  mob: Gauge;
  /** Whose turn since when (ms), for the countdown; a timed battle has none. */
  turn: { mine: boolean; timed: boolean; at: number } | null;
  last: Turn | null;
  /** The two cells of the swap being drawn. */
  swap: [number, number] | null;
  banner: Banner | null;
  floaters: Floater[];
  end: BattleEnd | null;
  picked: Picked[];
  /** ms of the step being drawn: the CSS transitions of the board take it. */
  dur: number;
}

/** Kiếm lửa (battle.rs FIRE): Hỏa Kiếm Thuật turns cells into it. */
export const FIRE = 10;
const N = 8;
const EMPTY_GAUGE: Gauge = { hp: null, maxHp: null, s1: 0, s2: 0 };
const EMPTY: View = {
  open: null,
  pieces: [],
  me: EMPTY_GAUGE,
  mob: EMPTY_GAUGE,
  turn: null,
  last: null,
  swap: null,
  banner: null,
  floaters: [],
  end: null,
  picked: [],
  dur: 0,
};

/** Base times of the steps (ms), multiplied by the pace. */
const STEP = { swap: 170, flash: 230, pop: 180, fall: 210, settle: 60 };
/** The pace of a message drawn `late` ms after it came: 1, faster as it gets later, 0 (no motion) past LATE. */
const LATE = 4000;
const pace = (late: number) => (late < 800 ? 1 : late < 2000 ? 0.6 : late < LATE ? 0.35 : 0);

let ids = 0;
const fromBoard = (board: number[]): Piece[] => board.map((v, cell) => ({ id: ++ids, v, cell, phase: "idle", lift: 0 }));
const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
const frame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));

export function useBattle(id: number) {
  const [view, setView] = useState<View>(EMPTY);
  const now = useRef<View>(EMPTY);
  const queue = useRef<{ msg: BattleMsg; at: number }[]>([]);
  const running = useRef(false);

  useEffect(() => {
    let live = true;
    const set = (patch: Partial<View>) => {
      if (!live) return;
      now.current = { ...now.current, ...patch };
      setView(now.current);
    };
    const float = (side: Floater["side"], text: string, tone: Floater["tone"]) => {
      const f = { id: ++ids, side, text, tone };
      set({ floaters: [...now.current.floaters, f] });
      window.setTimeout(() => set({ floaters: now.current.floaters.filter((x) => x.id !== f.id) }), 1300);
    };
    const banner = (text: string, skill?: number) => {
      const b = { id: ++ids, text, skill };
      set({ banner: b });
      window.setTimeout(() => now.current.banner?.id === b.id && set({ banner: null }), 1100);
    };

    /** One move: each step waits `k` × its time; k 0 draws the board after it at once. */
    const move = async (f: Extract<BattleMsg, { kind: "move" }>, k: number) => {
      const wait = (ms: number) => (k > 0 ? sleep(ms * k) : Promise.resolve());
      let pieces = now.current.pieces.length === 64 ? now.current.pieces : fromBoard(f.before);
      const at = (cell: number) => pieces.find((p) => p.cell === cell);
      if (k > 0) {
        set({ dur: STEP.swap * k });
        if (f.swap) {
          const [a, b] = f.swap;
          pieces = pieces.map((p) => (p.cell === a ? { ...p, cell: b } : p.cell === b ? { ...p, cell: a } : p));
          set({ pieces, swap: f.swap });
          await wait(STEP.swap);
        }
        if (f.turn.skill != null) banner(f.turn.mine ? "Kỹ năng" : "Quái dùng kỹ năng", f.turn.skill);
        if (f.cells.length) {
          const hit = new Set(f.cells);
          pieces = pieces.map((p) => (hit.has(p.cell) ? { ...p, phase: "flash", v: f.fire ? FIRE : p.v } : p));
          set({ pieces, dur: STEP.flash * k });
          await wait(STEP.flash);
          if (f.fire) pieces = pieces.map((p) => (p.phase === "flash" ? { ...p, phase: "idle" } : p));
        }
        for (const w of f.waves) {
          const gone = new Set(w.cleared);
          pieces = pieces.map((p) => (gone.has(p.cell) ? { ...p, phase: "pop" } : p));
          set({ pieces, swap: null, dur: STEP.pop * k });
          await wait(STEP.pop);
          pieces = pieces.filter((p) => !gone.has(p.cell));
          // Falls in order: within a column the lowest first, so none lands on a piece still to move.
          for (const [from, to] of w.falls) {
            const p = at(from);
            if (p) pieces = pieces.map((x) => (x === p ? { ...x, cell: to } : x));
          }
          const perColumn = new Map<number, number>();
          for (const [cell] of w.filled) perColumn.set(cell % N, (perColumn.get(cell % N) ?? 0) + 1);
          const added: Piece[] = w.filled.map(([cell, v]) => ({ id: ++ids, v, cell, phase: "enter", lift: perColumn.get(cell % N) ?? 0 }));
          pieces = [...pieces, ...added];
          set({ pieces, dur: STEP.fall * k });
          await frame();
          pieces = pieces.map((p) => (p.phase === "enter" ? { ...p, phase: "idle", lift: 0 } : p));
          set({ pieces });
          await wait(STEP.fall + STEP.settle);
        }
      }
      // The board the bot keeps wins: a reshuffle, or a step this window missed.
      const byCell = new Map(pieces.map((p) => [p.cell, p]));
      const fixed = f.board.every((v, cell) => byCell.get(cell)?.v === v);
      if (f.reshuffled || !fixed || pieces.length !== 64) pieces = fromBoard(f.board);
      if (f.reshuffled && k > 0) banner("Xáo bàn");
      set({ pieces: pieces.map((p) => ({ ...p, phase: "idle", lift: 0 })), swap: null, me: f.me, mob: f.mob, last: f.turn });
      if (f.turn.damage > 0) float(f.turn.mine ? "mob" : "me", `−${f.turn.damage}`, "damage");
      if (f.turn.heal > 0) float(f.turn.mine ? "me" : "mob", `+${f.turn.heal}`, "heal");
      if (f.turn.extraTurn && !f.turn.end && k > 0) banner("Thêm lượt");
    };

    const step = async (msg: BattleMsg, k: number) => {
      switch (msg.kind) {
        case "open":
          set({ ...EMPTY, open: msg, pieces: fromBoard(msg.board), me: msg.me.gauge, mob: msg.mob.gauge });
          if (k > 0) {
            banner("Vào trận");
            await sleep(500 * k);
          }
          break;
        case "turn":
          set({ turn: { mine: msg.mine, timed: msg.timed, at: Date.now() } });
          break;
        case "move":
          await move(msg, k);
          break;
        case "end":
          set({ end: { result: msg.result, exp: msg.exp, coin: msg.coin }, turn: null });
          break;
        case "picked":
          set({ picked: msg.picked });
          break;
      }
    };

    const run = async () => {
      if (running.current) return;
      running.current = true;
      while (live && queue.current.length) {
        const { msg, at } = queue.current.shift()!;
        await step(msg, pace(performance.now() - at));
      }
      running.current = false;
    };
    // Set by the load: what it holds already is not drawn again.
    let fresh = unseen(0);
    const push = (msg: BattleMsg) => {
      if (!fresh(msg)) return;
      queue.current.push({ msg, at: performance.now() });
      void run();
    };
    /** A window opened in the middle of a battle starts from where it is, without motion. */
    const load = (s: BattleState | null) => {
      if (!s?.open) return;
      set({
        ...EMPTY,
        open: s.open,
        pieces: fromBoard(s.board.length === 64 ? s.board : s.open.board),
        me: s.me,
        mob: s.mob,
        last: s.last,
        end: s.end,
        picked: s.picked,
        turn: s.turn && !s.end ? { mine: s.turn[1], timed: s.turn[2], at: Date.now() } : null,
      });
    };
    const stop = listenThenLoad<BattleMsg, BattleState | null>(
      api.onBattle,
      () => api.battleState(id),
      (loaded, early) => {
        fresh = unseen(loaded?.rev ?? 0);
        load(loaded);
        early.forEach(push);
      },
      push,
    );
    return () => {
      live = false;
      queue.current = [];
      stop();
    };
  }, [id]);

  return view;
}
