import { runClient, type SessionApi } from '../net/client.ts';
import { envConnection } from '../net/env.ts';
import { buildRequest, decodeEvent } from '../protocol/events.ts';
import { mapPrefix } from '../protocol/protocol.ts';
import { mapChange, mapEntities, playersSnapshot, zoneList, type Mob } from '../protocol/world.ts';

// Logs in (CLLT_USERNAME/CLLT_PASSWORD from .env), asks the zones of the current map (c2s/1172) and prints them; with
// --zone=N then moves to zone N as the game's Khu vực panel does (06-map-mobs.md#đổi-khu-vực-trong-cùng-map):
//   c2s/1173 (N) → s2c/13 (mapId, N) → c2s/11 (mapId, N, 0) → s2c/11 → c2s/43 → s2c/43 and s2c/1263
// prints the mobs and the players of the new zone, and logs out. Nothing is spent. A zone past the list, the zone the
// character is in, or a full one is refused before anything is sent.
// The account must not be online on another device: the server then answers s2c/0 and refuses the login.
const zoneArg = process.argv.find(a => a.startsWith('--zone='));
const wanted = zoneArg === undefined ? undefined : Number(zoneArg.slice('--zone='.length));
const show = (e: Record<string, unknown>) => console.log(JSON.stringify(e));
/** "Cóc Xanh 13 ×4", one entry per kind, as the Đánh quái tab lists them. */
const kinds = (mobs: Mob[]) => [...Map.groupBy(mobs, m => `${m.name} ${m.level}`)].map(([k, v]) => `${k} ×${v.length}`);

let api: SessionApi | undefined, timer: ReturnType<typeof setTimeout> | undefined, sentAt = 0;
let phase: 'list' | 'move' | 'map' | 'players' | 'done' = 'list';
function stop(reason?: string) {
  clearTimeout(timer);
  if (reason) show({ event: 'stop', reason });
  phase = 'done';
  api?.close();
}
function expect(what: string, ms = 8000) {
  clearTimeout(timer);
  timer = setTimeout(() => stop(`no ${what} in ${ms / 1000} s`), ms);
}

const result = await runClient({
  ...envConnection(), mode: 'world',
  log: e => { if (e.event === 'failed') show({ ...e, payloadHex: undefined }); },
  session: {
    onPacket(opcode, payload) {
      if (!api || phase === 'done') return;
      if (opcode === 1256) return show({ event: 'notice', ...decodeEvent('s2c', 1256, payload).fields });
      if (opcode === 1172 && phase === 'list') {
        const { zones } = zoneList(payload), here = api.user.map?.area ?? -1;
        show({ event: 'zones', mapId: api.user.map?.mapId, count: zones.length, players: zones.reduce((n, z) => n + z.players, 0),
          here: zones.find(z => z.zone === here), busiest: zones.filter(z => z.players).sort((a, b) => b.players - a.players).slice(0, 8).map(z => `khu ${z.zone}: ${z.players}/${z.capacity}`),
          empty: zones.filter(z => !z.players).length });
        if (wanted === undefined) return stop();
        const z = zones.find(z => z.zone === wanted);
        if (!Number.isInteger(wanted) || !z) return stop(`khu ${zoneArg!.slice(7)} không có (0–${zones.length - 1})`);
        if (wanted === here) return stop(`đang ở khu ${wanted}`);
        if (z.players >= z.capacity) return stop(`khu ${wanted} đã đầy (${z.players}/${z.capacity})`);
        phase = 'move'; sentAt = Date.now();
        api.send(1173, buildRequest(1173, { zone: wanted }));
        return expect('s2c/13');
      }
      if (opcode === 13 && phase === 'move') {
        const c = mapChange(payload);
        show({ event: 'zone_changed', ...c, ms: Date.now() - sentAt });
        if (!('zone' in c)) return stop('s2c/13 without a zone');
        phase = 'map';
        api.send(11, buildRequest(11, { mapId: c.mapId, zone: c.zone }));
        return expect('s2c/11');
      }
      if (opcode === 11 && phase === 'map' && payload[0] === 1) {
        const m = mapPrefix(payload);
        show({ event: 'map', mapId: m.mapId, name: m.name, zone: m.area, x: m.x, y: m.y });
        api.send(43, buildRequest(43, { mapId: m.mapId }));
        return expect('s2c/43');
      }
      if (opcode === 43 && phase === 'map') {
        const d = mapEntities(payload);
        show({ event: 'mobs', mapId: d.mapId, count: d.mobs.length, kinds: kinds(d.mobs), ms: Date.now() - sentAt });
        phase = 'players';
        // Alone in the zone, the server sends no s2c/1263 (client.ts).
        clearTimeout(timer);
        timer = setTimeout(() => { show({ event: 'players', count: 0 }); stop(); }, 1500);
        return;
      }
      if (opcode === 1263 && phase === 'players') {
        const { players } = playersSnapshot(payload);
        show({ event: 'players', count: players.length, names: players.map(p => `${p.name} ${p.level}`) });
        return stop();
      }
    },
    onReady(a) {
      api = a;
      const c = a.user.character, m = a.user.map;
      show({ event: 'character', name: c?.name, level: c?.level, mapId: m?.mapId, map: m?.name, zone: m?.area });
      a.send(1172, buildRequest(1172));
      expect('s2c/1172');
    },
  },
});
show({ kind: 'summary', event: 'zone_run_result', ok: result.ok, state: result.state, diagnostic: result.diagnostic });
if (!result.ok) process.exitCode = 1;
