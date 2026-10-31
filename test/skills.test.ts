import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fixtures } from './fixtures.ts';
import { characterProfile, characterSkills } from '../src/protocol.ts';
import { skillTable } from '../src/world.ts';
import { SKILL_TREE, skillLine, skillPanel, skillTree } from '../src/skills.ts';

// The Hỏa tree of s2c/30 (A2) and manina's s2c/9 at level 21: Hỏa Cầu Thuật level 1 and 19 skill points, the state of the
// Kỹ năng tab in the E1 screenshots (12-skills-items.md#tab-kỹ-năng).
const table = skillTable(Buffer.from(fixtures.scenario.stages[7].responses.find((r: any) => r.opcode === 30).hex, 'hex')).skills;
const s2c9 = Buffer.from(fixtures.profile['s2c/9 level 21'], 'hex'), profile = characterProfile(s2c9);
const levels = new Map(characterSkills(s2c9).map(k => [k.id, k.level]));
const tree = skillTree(table, levels, { level: profile.level, skillPoints: profile.skillPoints });
const node = (id: number) => tree.find(n => n.id === id)!;

test('skill tree: each skill in its box of the tab, with what Nâng cấp needs', () => {
  assert.deepEqual(tree.map(skillLine), [
    '1000 Hỏa Cầu Thuật 1/20 (gốc): lên cấp 2 được, 1 điểm',
    '1001 Hỏa Kiếm Thuật 0/20 (giữa 1): học được, 2 điểm',
    '1002 Đại Lực Công 0/20 (giữa 2): cần cấp 32, phải học Hỏa Kiếm Thuật',
    '1003 Liệt Hỏa Chi Kiếm 0/20 (trái 1): học được, 2 điểm',
    '1004 Phích Lịch Hỏa Sư 0/20 (trái 2): cần cấp 32, phải học Liệt Hỏa Chi Kiếm',
    '1005 Hỏa Long Chưởng 0/20 (trái 3): cần cấp 60, phải học Phích Lịch Hỏa Sư',
    '1006 Thiên Hỏa Kích 0/20 (phải 1): học được, 2 điểm',
    '1007 Dung Nham Địa Ngục 0/20 (phải 2): cần cấp 32, phải học Thiên Hỏa Kích',
    '1008 Hỏa Phụng Liêu Nguyên 0/20 (phải 3): cần cấp 60, phải học Dung Nham Địa Ngục',
  ]);
  assert.deepEqual(tree.map(n => n.icon.replace('data/icons/skills/', '')), ['1000.webp', ...[1, 2, 3, 4, 5, 6, 7, 8].map(i => `${1000 + i}-grey.webp`)]);
  // The background draws an arrow from each box down to the next of its branch: the prerequisite sits right above.
  for (const n of tree.slice(1)) {
    const pre = node(n.prerequisite!.id).box!;
    assert.ok(n.box!.depth === 1 ? pre.branch === 'gốc' : pre.branch === n.box!.branch && pre.depth === n.box!.depth - 1, n.name);
    assert.ok(pre.y < n.box!.y);
  }
  assert.deepEqual(SKILL_TREE.boxes.map(b => [b.x, b.y]), [[114, 0], [114, 155], [114, 243], [0, 111], [0, 199], [0, 287], [227, 111], [227, 199], [227, 287]]);
});

test('detail panel: the lines of the phone (E1) for a learned skill and two not learned', () => {
  assert.deepEqual(skillPanel(node(1000)), ['Hỏa Cầu Thuật', 'Cấp tối đa: 20',
    'Cấp hiện tại: 1', 'Tấn công và gây 11 sát thương cho đối phương, đồng thời phá hủy từ 1 đến 2 vùng 2x2 các quân cờ.', '- Tiêu hao nội lực: 1 thành nội lực',
    'Cấp kế tiếp: 2', 'Tấn công và gây 19 sát thương cho đối phương, đồng thời phá hủy từ 1 đến 2 vùng 2x2 các quân cờ.', '- Tiêu hao nội lực: 1 thành nội lực',
    'Điều kiện để học', '+ Nhân vật đạt cấp: 7', '+ Tiêu hao: 1 điểm kỹ năng']);
  assert.deepEqual(skillPanel(node(1004)), ['Phích Lịch Hỏa Sư', 'Cấp tối đa: 20', 'Chưa học', 'Tấn công và gây 73 sát thương cho đối phương.',
    '- Tiêu hao nội lực: 3 thành nội lực', 'Điều kiện để học', '+ Nhân vật đạt cấp: 32', '+ Phải học: Liệt Hỏa Chi Kiếm', '+ Tiêu hao: 3 điểm kỹ năng']);
  assert.deepEqual(skillPanel(node(1001)), ['Hỏa Kiếm Thuật', 'Cấp tối đa: 20', 'Chưa học', 'Biến từ 5 đến 7 quân cờ thành kiếm lửa, và có 51% cơ hội đi tiếp 1 lượt.',
    '- Tiêu hao nội lực: 2 thành nội lực', 'Điều kiện để học', '+ Nhân vật đạt cấp: 10', '+ Phải học: Hỏa Cầu Thuật', '+ Tiêu hao: 2 điểm kỹ năng']);
});

test('no skill point left, and a skill at its top level', () => {
  const [root] = skillTree(table, new Map([[1000, 4]]), { level: 21, skillPoints: 0 });
  assert.deepEqual(root.blockers, ['cần cấp 22', 'thiếu điểm kỹ năng (cần 1, còn 0)']);
  const [top] = skillTree(table, new Map([[1000, 20]]), { level: 150, skillPoints: 9 });
  assert.deepEqual([top.blockers, top.next, skillPanel(top).at(-3)], [['đã tối đa'], undefined, 'Cấp hiện tại: 20']);
  assert.equal(skillPanel(top).length, 5);
});

test('data/icons/skills: a colour and a grey icon for every skill of the three trees, and the background', () => {
  const missing = [1, 2, 4].flatMap(e => Array.from({ length: 9 }, (_, i) => e * 1000 + i)).flatMap(id => [`${id}`, `${id}-grey`])
    .concat('tree').filter(n => { const p = `data/icons/skills/${n}.webp`; return !existsSync(p) || readFileSync(p).subarray(8, 12).toString() !== 'WEBP'; });
  assert.deepEqual(missing, []);
});

test('data/skills.json: the three trees of c2s/30 (1, 2, 4), the same layout, and Hỏa as in the A2 capture', () => {
  const book = JSON.parse(readFileSync('data/skills.json', 'utf8'));
  assert.deepEqual(Object.keys(book.trees), ['1', '2', '4']);
  for (const [element, skills] of Object.entries(book.trees) as [string, typeof table][]) {
    assert.deepEqual(skills.map(k => k.id), Array.from({ length: 9 }, (_, i) => Number(element) * 1000 + i));
    assert.deepEqual(skills.map(k => k.prerequisite < 0 ? -1 : k.prerequisite % 1000), [-1, 0, 1, 0, 3, 4, 0, 6, 7]);
    assert.ok(skills.every(k => k.levels.length === 20));
  }
  assert.deepEqual(book.trees['1'], table);
  assert.deepEqual([book.trees['2'][0].name, book.trees['4'][1].levels[0].description], ['Xích Lôi Công', 'Phục hồi 11% sinh lực cho bản thân.']);
});
