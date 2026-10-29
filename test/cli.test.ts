import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { startSimulator } from './support/game-server.ts';

for (const mode of ['auto-world', 'bootstrap']) {
  test(`live CLI loads .env and connects directly to configured TCP peer: ${mode}`, { timeout: 10000 }, async t => {
    const requests: number[] = [];
    const peer = await startSimulator({ log: e => { if (e.event === 'sim_receive') requests.push(Number(e.opcode)); } });
    const folder = mkdtempSync(join(tmpdir(), 'cllt-cli-test-'));
    t.after(async () => { await peer.close(); rmSync(folder, { recursive: true, force: true }); });
    writeFileSync(join(folder, '.env'), `CLLT_HOST=127.0.0.1\nCLLT_PORT=${peer.port}\nCLLT_USERNAME=probe_user\nCLLT_PASSWORD=abc\n`);
    const env = { ...process.env };
    for (const name of Object.keys(env)) if (name.startsWith('CLLT_')) delete env[name];
    const child = spawn(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('../src/connect.ts', import.meta.url)), ...(mode === 'bootstrap' ? ['--bootstrap'] : [])], { cwd: folder, env });
    t.after(() => child.kill());
    let stdout = '', stderr = '';
    child.stdout.on('data', b => { stdout += b; }); child.stderr.on('data', b => { stderr += b; });
    const [code] = await once(child, 'exit'); assert.equal(code, 0, stdout + stderr);
    const rows = stdout.trim().split('\n').map(x => JSON.parse(x));
    assert.equal(rows.find(x => x.event === 'tcp_connected').port, peer.port);
    assert.ok(rows.some(x => x.event === 's2c/1207' && x.kind === 'receive'));
    const result = rows.find(x => x.event === 'client_result'); assert.equal(result.ok, true);
    if (mode === 'bootstrap') assert.deepEqual(requests, [-1, 1206, 5]);
    else {
      assert.ok(requests.includes(4));
      assert.ok(rows.some(x => x.event === 's2c/9' && x.fields.hp === 120));
      assert.equal(result.user.account, 'probe_user'); assert.equal(result.user.character.level, 3);
      assert.equal(result.user.location.mapId, 'M1'); assert.equal(result.user.map.name, 'Làng Thanh Khê');
    }
  });
}
