// Human pace (docs/app/events/02-login.md#nhịp-như-người-chơi): the gaps the real game 1.1.1 leaves between a packet of
// the server and its own answer, measured with Frida on 22/11 (captures/v111-2026-11-22, bh2, mp1, vg1). Every wait the
// client, the quest bot and the battle runner add to look like the game comes from here, so tests swap the whole pace
// for ZERO_PACE (no wait, same packets) or OFF (as before these waits: nothing delayed, no reload after a battle).

/** A wait in ms, from the first to the second number. */
export type Range = readonly [number, number];

export const HUMAN = {
  /** c2s/1: every 2 s until s2c/4, then the first ~25 s after s2c/4 and every 30 s in the world, battles included
   * (30.00–30.8 s measured). */
  heartbeat: { login: 2000, firstInWorld: 25_000, inWorld: 30_000 },
  /** s2c/1209 → c2s/5. */
  noticeAfterFlag: [400, 700] as Range,
  /** c2s/5 → c2s/2 (counted from c2s/5, whose answer comes in ~30 ms). */
  gateAfterNotice: [1300, 2500] as Range,
  /** s2c/30 → c2s/42. */
  profileAfterSkills: [100, 350] as Range,
  /** s2c/29 → c2s/11 at login. */
  mapAfterLocation: [300, 400] as Range,
  /** s2c/11 → c2s/43 on every map entry: login, portal, zone change. */
  entitiesAfterMap: [400, 1200] as Range,
  /** s2c/13 → c2s/11 after a portal or a zone change. */
  mapAfterPortal: [300, 400] as Range,
  /** From the arrival in a map to the next portal of a trip. */
  portalAfterArrival: [2000, 4000] as Range,
  /** The end of a normal battle (s2c/1214) → c2s/11 that reloads the map. */
  reloadAfterBattle: [2400, 4700] as Range,
  /** s2c/11 of that reload → c2s/43. */
  entitiesAfterReload: [300, 800] as Range,
  /** s2c/1214 after Đầu hàng → c2s/43 (~0.6 s). */
  entitiesAfterSurrender: [500, 700] as Range,
  /** s2c/22 → c2s/18. */
  joinAfterSetup: [1100, 1600] as Range,
  /** The mob's turn (s2c/24) → c2s/14 while the board still falls from our move's cascades. */
  stepAfterCascade: [1000, 2000] as Range,
  /** The mob's turn → c2s/14 otherwise, as after a turn ended by the clock. */
  stepAfterTimeout: [10, 40] as Range,
  /** An own move never goes sooner than this after its turn came. */
  ownMoveMin: 1200,
  /** s2c/24 of an own turn → the own move, spread as a player's (game: bh2 median 2.6 s, 1.15 s at the quickest; by hand
   * 4.6–5.9 s); the user's Chờ trước mỗi lượt đi when longer. */
  ownMove: [1200, 2600] as Range,
  /** s2c/18 of a battle the player opens (timed 1, every challenge with c2s/15 flag 1 in 1.1.1) → the first own move:
   * the player looks at the board first (game: 22 s by hand, Bạch Hổ 1.15 s at the quickest). */
  firstMove: [1200, 2600] as Range,
  /** The mobs of the map known (s2c/43 at login, after a portal, a zone change or the reload after a battle) → c2s/15:
   * the walk to the mob (game: a burst of c2s/1169, the next battle 4–26 s after c2s/43). */
  challengeAfterEntities: [1500, 4000] as Range,
  /** s2c/18 of timed 1 → the first s2c/24 of a turn battle comes ~0.7 s after the first move's s2c/19; until then a
   * battle that may still be timed (Sơn Tặc, Bạch Hổ: never an s2c/24) waits at least this for its second swap. */
  turnOrTimed: 2500,
  /** s2c/57 (an NPC's dialog) → c2s/57 (game 4–23 s; shorter so quests do not drag). */
  npcReply: [1500, 4000] as Range,
} as const;

export interface Human {
  /** False: none of these waits, and no map reload after a battle (the bot as before 22/11). */
  readonly on: boolean;
  /** A wait of `range`, in ms. */
  ms(range: Range): number;
}

/** Waits spread over their range by `random` (Math.random unless a test seeds one). */
export function humanPace(random: () => number = Math.random): Human {
  return { on: true, ms: ([lo, hi]) => Math.round(lo + (hi - lo) * random()) };
}
/** The same numbers for the same seed (mulberry32), for tests. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** The game's order of packets, without the waits. */
export const ZERO_PACE: Human = { on: true, ms: () => 0 };
/** As before the human pace. */
export const OFF: Human = { on: false, ms: () => 0 };

/** When the next c2s/1 goes, after the one just sent (or the key exchange): every `login` ms until s2c/4, the first in
 * the world `firstInWorld` after s2c/4, then every `inWorld`. */
export function heartbeatDelay(inWorld: boolean, first: boolean, h: { login: number; firstInWorld: number; inWorld: number } = HUMAN.heartbeat) {
  return !inWorld ? h.login : first ? h.firstInWorld : h.inWorld;
}
