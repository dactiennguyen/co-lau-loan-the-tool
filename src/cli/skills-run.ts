import { writeFileSync } from 'node:fs';
import { runClient } from '../net/client.ts';
import { envConnection } from '../net/env.ts';
import { characterProfile, characterSkills } from '../protocol/protocol.ts';
import { skillTable, type Skill } from '../protocol/world.ts';
import { buildRequest } from '../protocol/events.ts';
import { skillLine, skillPanel, skillTree } from '../protocol/skills.ts';

// Read-only: logs in (CLLT_USERNAME/CLLT_PASSWORD from .env), prints the Kỹ năng tab (the tree of s2c/30 with the levels
// and skill points of s2c/9), then closes. Both arrive during the login of client.ts; only --trees sends anything more.
//   --panel        also print the detail panel of every skill, as the game writes it; --panel=1003 only that skill
//   --trees        then ask c2s/30 for the trees of the three elements (1 Hỏa, 2 Lôi, 4 Thủy) and write data/skills.json
//                  (--trees=<path>); the server answers the tree asked for, whatever the character's element (12-skills-items.md)
// The account must not be online on another device: the server then answers s2c/0 and refuses the login.
const panelArg = process.argv.find(a => a === '--panel' || a.startsWith('--panel='));
const panel = panelArg === '--panel' ? 'all' : panelArg?.slice('--panel='.length);
const treesArg = process.argv.find(a => a === '--trees' || a.startsWith('--trees='));
const treesPath = treesArg === '--trees' ? 'data/skills.json' : treesArg?.slice('--trees='.length);
const show = (e: Record<string, unknown>) => console.log(JSON.stringify(e));
const asked = [1, 2, 4], trees: Record<number, Skill[]> = {};
let ready = false, session: { send(opcode: number, payload: Uint8Array): void; close(): void } | undefined, timer: ReturnType<typeof setTimeout> | undefined;
/** Asks the next tree of `asked`, or writes the file once every answer is in. */
function next() {
  clearTimeout(timer);
  if (!asked.length) {
    writeFileSync(treesPath!, skillsJson(trees));
    show({ kind: 'summary', event: 'skill_trees_written', path: treesPath, trees: Object.fromEntries(Object.entries(trees).map(([e, t]) => [e, t.map(k => `${k.id} ${k.name}`)])) });
    return session?.close();
  }
  session?.send(30, buildRequest(30, { element: asked[0] }));
  timer = setTimeout(() => { show({ event: 'stop', reason: `no s2c/30 for element ${asked[0]}` }); session?.close(); }, 8000);
}
/** One skill per line, so a new version of a tree reads as a short diff. */
function skillsJson(t: Record<number, Skill[]>) {
  const head = { source: `s2c/30 answering c2s/30 (1, 2, 4), ${new Date().toISOString().slice(0, 10)}; docs/app/events/12-skills-items.md#bảng-kỹ-năng`, elements: { 1: 'Hỏa', 2: 'Lôi', 4: 'Thủy' } };
  const trees = Object.entries(t).map(([e, skills]) => `  "${e}": [\n${skills.map(k => `   ${JSON.stringify(k)}`).join(',\n')}\n  ]`).join(',\n');
  return `${JSON.stringify(head, null, 1).slice(0, -2)},\n "trees": {\n${trees}\n }\n}\n`;
}
let profile: ReturnType<typeof characterProfile> | undefined, levels = new Map<number, number>(), skills: Skill[] = [];

const result = await runClient({
  ...envConnection(), mode: 'world',
  log: e => { if (e.event === 'failed') show({ ...e, payloadHex: undefined }); },
  session: {
    onPacket(opcode, payload) {
      if (opcode === 9) { profile = characterProfile(payload); levels = new Map(characterSkills(payload).map(k => [k.id, k.level])); }
      if (opcode === 30 && !ready) skills = skillTable(payload).skills;
      else if (opcode === 30 && treesPath) { trees[asked.shift()!] = skillTable(payload).skills; next(); }
    },
    onReady(api) {
      const tree = skillTree(skills, levels, { level: profile?.level ?? 0, skillPoints: profile?.skillPoints ?? 0 });
      show({ event: 'character', name: profile?.name, level: profile?.level, element: tree[0]?.element, skillPoints: profile?.skillPoints });
      show({ event: 'skills', skills: tree.map(skillLine) });
      for (const node of tree) if (panel === 'all' || panel === String(node.id)) show({ event: 'skill_panel', id: node.id, icon: node.icon, lines: skillPanel(node) });
      ready = true; session = api;
      if (treesPath) next(); else api.close();
    },
  },
});
show({ kind: 'summary', event: 'skills_run_result', ok: result.ok, state: result.state, diagnostic: result.diagnostic });
if (!result.ok) process.exitCode = 1;
