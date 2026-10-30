import { runClient } from './client.ts';
import { MapScanner } from './map-scan.ts';
import { loadAtlas, saveAtlas } from './atlas.ts';
import { envConnection } from './env.ts';

// Logs in directly (CLLT_USERNAME/CLLT_PASSWORD from .env), visits every map the character may enter and updates the
// atlas (default data/maps.json, --atlas=path). The account must not be online on another device.
const arg = (name: string) => process.argv.find(a => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const path = arg('atlas') ?? 'data/maps.json', atlas = loadAtlas(path);
const show = (e: Record<string, unknown>) => console.log(JSON.stringify(e));
const scanner = new MapScanner({ atlas, log: show, save: () => saveAtlas(path, atlas) });
const result = await runClient({ ...envConnection(), mode: 'world', session: scanner, log: e => { if (e.event === 'failed') show(e); } });
await scanner.finished;
show({ kind: 'summary', event: 'map_scan_result', ok: result.ok, state: result.state, diagnostic: result.diagnostic, maps: [...scanner.visited], atlas: path });
if (!result.ok) process.exitCode = 1;
