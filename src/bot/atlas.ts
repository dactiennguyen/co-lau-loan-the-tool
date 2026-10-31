// What the bots learned about each map, kept in data/maps.json across runs (docs/app/events/06-map-mobs.md#atlas): NPCs
// and portals of s2c/11, mob ids per zone of s2c/43, bosses of s2c/1177, where a portal led (s2c/13) or the level it
// asked for (s2c/1256), and the world map of c2s/11 "M99". Only what the server sent is stored.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Mob, Place } from '../protocol/world.ts';

export interface MapRecord {
  mapId: string; name: string;
  /** NPCs (type 2) and portals (type 0) with their box in server units. */
  places: Pick<Place, 'id' | 'name' | 'type' | 'x' | 'y' | 'w' | 'h'>[];
  /** Mob kinds in s2c/43 order, with the ids of each zone seen (ids change with the zone, the kinds do not). */
  mobs: { name: string; level: number; ids: Record<string, string[]> }[];
  /** Bosses of s2c/1177: id of each zone seen, and the last tile (column, row; tiles of 32) with its zone. */
  bosses: { name: string; level: number; ids: Record<string, string>; tile?: { zone: number; at: [number, number] } }[];
  /** Day of the last visit, YYYY-MM-DD. */
  seen: string;
}
export interface Atlas {
  /** c2s/11 "M99": the level each map asks for, and whether the world map shows it locked for this character. */
  world: { mapId: string; level: number; locked: boolean }[];
  maps: Record<string, MapRecord>;
  /** By portal id; a portal id names its destination in every map (1013 is Lạc Cốc from M1 and from M2). mapId: where it
   * led. level: the level it asked for. refused: any other refusal ("Bạn cần hoàn thành nhiệm vụ trước khi tới đây"). */
  portals: Record<string, { name: string; mapId?: string; level?: number; refused?: string }>;
}

export const emptyAtlas = (): Atlas => ({ world: [], maps: {}, portals: {} });
export const loadAtlas = (path?: string): Atlas => path && existsSync(path) ? { ...emptyAtlas(), ...JSON.parse(readFileSync(path, 'utf8')) } : emptyAtlas();
/** Indented JSON with every innermost array or object on one line (a place, the ids of a zone). */
export const atlasJson = (atlas: Atlas) => JSON.stringify(atlas, null, 1).replace(/[[{][^[\]{}]*[\]}]/g, s => s.replace(/\s*\n\s*/g, ' ')) + '\n';
export function saveAtlas(path: string, atlas: Atlas) { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, atlasJson(atlas)); }

const today = () => new Date().toISOString().slice(0, 10);
const entry = (atlas: Atlas, mapId: string) => atlas.maps[mapId] ??= { mapId, name: '', places: [], mobs: [], bosses: [], seen: today() };

export function recordWorld(atlas: Atlas, maps: { mapId: string; levelRequired: number; locked: boolean }[]) {
  atlas.world = maps.map(m => ({ mapId: m.mapId, level: m.levelRequired, locked: m.locked }));
}
export function recordMap(atlas: Atlas, map: { mapId: string; name: string; places: Place[] }) {
  const m = entry(atlas, map.mapId);
  m.name = map.name; m.seen = today();
  m.places = map.places.map(({ id, name, type, x, y, w, h }) => ({ id, name, type, x, y, w, h }));
}
export function recordMobs(atlas: Atlas, mapId: string, zone: number, mobs: Mob[]) {
  const m = entry(atlas, mapId), ids = new Map<string, string[]>();
  for (const mob of mobs) {
    const key = `${mob.name}|${mob.level}`;
    if (!m.mobs.some(k => `${k.name}|${k.level}` === key)) m.mobs.push({ name: mob.name, level: mob.level, ids: {} });
    ids.set(key, [...(ids.get(key) ?? []), mob.id]);
  }
  for (const k of m.mobs) { const seen = ids.get(`${k.name}|${k.level}`); if (seen) k.ids[zone] = seen; }
}
export function recordBoss(atlas: Atlas, mapId: string, zone: number, mob: Mob, tile: [number, number]) {
  const m = entry(atlas, mapId);
  let b = m.bosses.find(b => b.name === mob.name);
  if (!b) m.bosses.push(b = { name: mob.name, level: mob.level, ids: {} });
  b.level = mob.level; b.ids[zone] = mob.id; b.tile = { zone, at: tile };
}
/** A portal that let the character through drops its earlier refusal. */
export function recordPortal(atlas: Atlas, id: number, fields: Atlas['portals'][string]) {
  const before = { ...atlas.portals[id] };
  if (fields.mapId) { delete before.level; delete before.refused; }
  atlas.portals[id] = { ...before, ...fields };
}
/** Records the answer s2c/1256 to c2s/13 through a portal; returns the level it asked for, if any. */
export function recordRefusal(atlas: Atlas, p: Pick<Place, 'id' | 'name'>, text: string) {
  const lock = portalRefusal(text);
  recordPortal(atlas, p.id, { name: p.name, ...(lock ? { level: lock.level } : { refused: text }) });
  return lock?.level;
}

/** s2c/1256 after c2s/13 through a portal the character may not enter: "Bạn phải đạt cấp 40 mới vào được Lạc Cốc". */
export function portalRefusal(text: string) {
  const m = /phải đạt cấp (\d+) mới vào được (.+)$/.exec(text);
  return m ? { level: Number(m[1]), name: m[2] } : undefined;
}
/** Map a portal of map `from` leads to: as taken before, else another seen map named like the portal, exactly first, then
 * containing it ("Vân Sơn" → "Trại Vân Sơn"; "Hồng Giang" in M25 "Rìa Hồng Giang" is not M25 itself). */
export function destination(atlas: Atlas, p: Pick<Place, 'id' | 'name'>, from: string) {
  const others = Object.values(atlas.maps).filter(m => m.mapId !== from);
  return atlas.portals[p.id]?.mapId ?? (others.find(m => m.name === p.name) ?? others.find(m => m.name.includes(p.name)))?.mapId;
}
/** Portals of a map the character may try: not the "Bản đồ" button, not one that asked for a higher level, not `skip`. */
export const portalsOf = (atlas: Atlas, mapId: string, level: number, skip: ReadonlySet<number> = new Set()) =>
  (atlas.maps[mapId]?.places ?? []).filter(p => p.type === 0 && p.name !== 'Bản đồ' && !((atlas.portals[p.id]?.level ?? 0) > level) && !skip.has(p.id));

/** First portal on the shortest known way from `from` to another map where `wanted` holds; undefined when none is known. */
export function route(atlas: Atlas, from: string, wanted: (m: MapRecord) => boolean, level: number, skip?: ReadonlySet<number>) {
  const first = new Map<string, Pick<Place, 'id' | 'name'>>([[from, { id: -1, name: '' }]]), queue = [from];
  for (let mapId; (mapId = queue.shift()) !== undefined;) {
    if (mapId !== from && wanted(atlas.maps[mapId])) return first.get(mapId);
    for (const p of portalsOf(atlas, mapId, level, skip)) {
      const to = destination(atlas, p, mapId);
      if (to && atlas.maps[to] && !first.has(to)) { first.set(to, mapId === from ? p : first.get(mapId)!); queue.push(to); }
    }
  }
}
