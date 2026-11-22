// Map scanner over a live world session (docs/app/events/06-map-mobs.md#atlas). It asks the world map (c2s/11 "M99"),
// then walks depth first through every portal the character may enter, records each map in the atlas, and walks back to
// the map it started in. It sends only c2s/11, c2s/13 and c2s/43: no battle, no chat, no purchase. A portal refused for a
// quest is tried again on the next run; one refused for the level only once the character has it.
// The server answers c2s/11 and c2s/43 only for the map the character stands in ("Không thể chuyển khu vực"), so a map
// can only be read by entering it.
import { Writer } from '../protocol/protocol.ts';
import { buildRequest } from '../protocol/events.ts';
import type { SessionApi, WorldSession } from '../net/client.ts';
import { MapLoads, mapData, mapChange, mapEntities, mapBoss, notice, worldMap, groundItems, type Place } from '../protocol/world.ts';
import type { Items } from '../protocol/items.ts';
import { type Atlas, recordWorld, recordMap, recordMobs, recordBoss, recordPortal, recordRefusal, destination, portalsOf } from './atlas.ts';

export interface MapScanOptions {
  atlas: Atlas; log: (event: Record<string, unknown>) => void;
  /** Called after each map and each refused portal, to keep what was found if the run stops early. */
  save?: () => void;
  /** Wait after s2c/43 for the bosses (s2c/1177), and for an answer to each request (defaults 1500 and 6000 ms). */
  settleMs?: number; answerMs?: number;
  /** Item names for the ground items of each map (s2c/1184); map-scan-run loads data/items.json. */
  items?: Items;
}
type Answer = { opcode: number; payload: Buffer } | undefined;

export class MapScanner implements WorldSession {
  api?: SessionApi; mapId = ''; zone = 0; level = 0; visited = new Set<string>(); finished?: Promise<void>;
  private waiting?: { opcodes: number[]; resolve: (answer: Answer) => void };
  /** The maps loaded in this session, for the index of c2s/11 (06-map-mobs.md#c2s-11). */
  private maps = new MapLoads();
  options: MapScanOptions;
  constructor(options: MapScanOptions) { this.options = options; }
  private log(event: string, fields: Record<string, unknown> = {}) { this.options.log({ kind: 'scan', event, at: Date.now(), ...fields }); }

  onPacket(opcode: number, payload: Buffer) {
    try { this.maps.on(opcode, payload); this.record(opcode, payload); }
    catch (error) { this.log('parse_error', { opcode, reason: (error as Error).message }); }
    if (this.waiting?.opcodes.includes(opcode)) this.waiting.resolve({ opcode, payload });
  }

  onReady(api: SessionApi) {
    this.api = api; this.level = api.user.character?.level ?? 0;
    this.finished = this.run()
      .catch(error => this.log('stop', { reason: (error as Error).message, mapId: this.mapId }))
      .finally(() => { this.options.save?.(); api.close(); });
  }

  private record(opcode: number, payload: Buffer) {
    const atlas = this.options.atlas;
    switch (opcode) {
      case 11: {
        if (payload[0] === 0) { recordWorld(atlas, worldMap(payload).maps); break; }
        const d = mapData(payload); this.mapId = d.mapId; this.zone = d.area; recordMap(atlas, d); break;
      }
      case 43: { const d = mapEntities(payload); recordMobs(atlas, d.mapId, this.zone, d.mobs); break; }
      case 1177: { const b = mapBoss(payload); if ('mob' in b) recordBoss(atlas, b.mapId, this.zone, b.mob, b.tile); break; }
      // Items lying on the ground, sent on entering each map (docs/app/events/13-drops-items.md).
      case 1184: {
        const g = groundItems(payload);
        if (g.items.length) this.log('ground_items', { mapId: g.mapId, zone: this.zone, items: g.items.map(i => `${this.options.items?.describe(i) ?? `#${i.itemId} ×${i.quantity}`} @${i.x},${i.y}`) });
        break;
      }
    }
  }

  private async run() {
    const start = this.mapId;
    await this.ask(11, new Writer().string('M99').u8(0).i32(-1).build(), [11]);
    this.visited.add(start); this.summary(start);
    await this.explore(start);
    this.log('done', { maps: [...this.visited], mapId: this.mapId, back: this.mapId === start });
  }

  /** Every portal of `from` towards a map not visited in this run; after each map, back to `from`. */
  private async explore(from: string) {
    for (const p of portalsOf(this.options.atlas, from, this.level)) {
      const to = destination(this.options.atlas, p, from);
      if (to && this.visited.has(to)) continue;
      const reached = await this.through(p);
      if (!reached) continue;
      if (!this.visited.has(reached)) { this.visited.add(reached); this.summary(reached); await this.explore(reached); }
      const back = portalsOf(this.options.atlas, reached, this.level).find(q => destination(this.options.atlas, q, reached) === from);
      if (!back || await this.through(back) !== from) throw new Error(`no way back from ${reached} to ${from}`);
    }
  }

  /** c2s/13 through a portal. s2c/1256 refuses it (level); s2c/13 moves the character, and like the client (B5) the
   * scanner then asks the map (c2s/11) and its mobs (c2s/43). Returns the map reached. */
  private async through(p: Pick<Place, 'id' | 'name'>) {
    const atlas = this.options.atlas, from = this.mapId;
    const answer = await this.ask(13, buildRequest(13, { mapId: from, npcId: p.id }), [13, 1256]);
    if (answer?.opcode !== 13) {
      const text = answer && notice(answer.payload).text;
      if (text) recordRefusal(atlas, p, text);
      this.log('portal_refused', { from, portal: p.id, name: p.name, text: text ?? 'no answer' });
      this.options.save?.();
      return;
    }
    const { mapId } = mapChange(answer.payload);
    recordPortal(atlas, p.id, { name: p.name, mapId });
    await this.ask(11, buildRequest(11, this.maps.request(mapId)), [11]);
    this.log('portal', { from, portal: p.id, name: p.name, mapId, zone: this.zone });
    await this.ask(43, buildRequest(43, { mapId }), [43]);
    await new Promise(resolve => setTimeout(resolve, this.options.settleMs ?? 1500));
    this.options.save?.();
    return mapId;
  }

  private summary(mapId: string) {
    const m = this.options.atlas.maps[mapId];
    this.log('map', { mapId, name: m?.name, zone: this.zone, npcs: m?.places.filter(p => p.type === 2).map(p => `${p.id} ${p.name}`),
      portals: m?.places.filter(p => p.type === 0).map(p => `${p.id} ${p.name}`), mobs: m?.mobs.map(k => `${k.name} ${k.level}`), bosses: m?.bosses.map(b => `${b.name} ${b.level}`) });
  }

  /** Sends a request and waits for the first of `opcodes` (undefined after answerMs). */
  private ask(opcode: number, payload: Uint8Array, opcodes: number[]) {
    return new Promise<Answer>(resolve => {
      const timer = setTimeout(() => { this.waiting = undefined; resolve(undefined); }, this.options.answerMs ?? 6000);
      this.waiting = { opcodes, resolve: answer => { clearTimeout(timer); this.waiting = undefined; resolve(answer); } };
      this.api!.send(opcode, payload);
    });
  }
}
