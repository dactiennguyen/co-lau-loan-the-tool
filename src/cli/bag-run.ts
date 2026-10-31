import { runClient } from '../net/client.ts';
import { envConnection } from '../net/env.ts';
import { characterProfile } from '../protocol/protocol.ts';
import { characterExtra, characterGear, type itemRecord } from '../protocol/world.ts';
import { Items, ITEM_ELEMENTS } from '../protocol/items.ts';

// Read-only: logs in (CLLT_USERNAME/CLLT_PASSWORD from .env), prints the gear worn (tail of s2c/9) and the bag (s2c/42),
// then closes. Both arrive during the login of client.ts; nothing else is sent (12-skills-items.md#cách-lấy-túi-đồ).
// The account must not be online on another device: the server then answers s2c/0 and refuses the login.
const items = Items.load();
const show = (e: Record<string, unknown>) => console.log(JSON.stringify(e));

/** "2: Áo Hào Kiệt (+7 phòng thủ, +5 thân pháp), hệ Hỏa, độ bền 60/60"; element and durability only where the item has them. */
function line(i: ReturnType<typeof itemRecord>) {
  const max = items.get(i.itemId)?.durability, element = ITEM_ELEMENTS[i.element];
  return [`${i.slot}: ${items.describe(i)}`, element && `hệ ${element}`, i.durability >= 0 && `độ bền ${i.durability}${max ? `/${max}` : ''}`].filter(Boolean).join(', ');
}

const result = await runClient({
  ...envConnection(), mode: 'world',
  log: e => { if (e.event === 'failed') show({ ...e, payloadHex: undefined }); },
  session: {
    onPacket(opcode, payload) {
      if (opcode === 9) {
        const p = characterProfile(payload);
        show({ event: 'character', name: p.name, level: p.level });
        show({ event: 'gear', gear: characterGear(payload).map((g, slot) => g ? line(g) : `${slot}: trống`) });
      }
      if (opcode === 42) { const b = characterExtra(payload); show({ event: 'bag', capacity: b.capacity, items: b.items.map(line) }); }
    },
    onReady: api => api.close(),
  },
});
show({ kind: 'summary', event: 'bag_run_result', ok: result.ok, state: result.state, diagnostic: result.diagnostic });
if (!result.ok) process.exitCode = 1;
