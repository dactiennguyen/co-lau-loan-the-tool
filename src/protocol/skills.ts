import type { Skill } from './world.ts';
import { ITEM_ELEMENTS } from './items.ts';

// The Kỹ năng tab (Bản thân → Kỹ năng) as the game draws it, from the skill tree of s2c/30, the skill levels of the s2c/9
// tail (then s2c/10 kind 32) and the skill points (s2c/9, then s2c/1191). docs/app/events/12-skills-items.md#tab-kỹ-năng.

type Branch = 'gốc' | 'trái' | 'giữa' | 'phải';
/** The tree background `assets/x1/skill/tree-skill` (288 × 347) has 9 boxes of 60 × 60; box i holds skill
 * 1000 × element + i. Screenshot of E1: the root on top, 3 → 4 → 5 down the left, 1 → 2 down the middle (lower, between
 * the rows of the sides), 6 → 7 → 8 down the right. x, y are the top left corner of the box in the background. */
export const SKILL_TREE: { width: number; height: number; box: number; boxes: { x: number; y: number; branch: Branch; depth: number }[] } = {
  width: 288, height: 347, box: 60,
  boxes: [
    { x: 114, y: 0, branch: 'gốc', depth: 0 },
    { x: 114, y: 155, branch: 'giữa', depth: 1 }, { x: 114, y: 243, branch: 'giữa', depth: 2 },
    { x: 0, y: 111, branch: 'trái', depth: 1 }, { x: 0, y: 199, branch: 'trái', depth: 2 }, { x: 0, y: 287, branch: 'trái', depth: 3 },
    { x: 227, y: 111, branch: 'phải', depth: 1 }, { x: 227, y: 199, branch: 'phải', depth: 2 }, { x: 227, y: 287, branch: 'phải', depth: 3 },
  ],
};

/** Nội lực of one "thành": the panel shows a skill that uses 25 as "1 thành nội lực". */
export const THANH = 25;

export interface SkillNode {
  id: number; name: string; element: string; index: number;
  /** Box of SKILL_TREE; undefined for an index the background has no box for. */
  box?: (typeof SKILL_TREE.boxes)[number];
  level: number; maxLevel: number;
  /** The icon the tab draws: data/icons/skills/<id>.webp once learned, <id>-grey.webp before (npm run items). */
  icon: string;
  prerequisite?: { id: number; name: string; learned: boolean };
  /** The level the character has, and the one Nâng cấp would give (undefined at the top level). */
  current?: Skill['levels'][number]; next?: Skill['levels'][number];
  /** Why Nâng cấp cannot take the next level now; empty when it can. */
  blockers: string[];
  skill: Skill;
}

/** One node per skill of the tree, in the order of s2c/30 (the root first). */
export function skillTree(skills: Skill[], levels: ReadonlyMap<number, number>, character: { level: number; skillPoints: number }): SkillNode[] {
  const level = (id: number) => levels.get(id) ?? 0, byId = new Map(skills.map(k => [k.id, k]));
  return skills.map(skill => {
    const { id, name } = skill, index = id % 1000, have = level(id), next = skill.levels[have];
    const pre = skill.prerequisite >= 0 ? { id: skill.prerequisite, name: byId.get(skill.prerequisite)?.name ?? `#${skill.prerequisite}`, learned: level(skill.prerequisite) > 0 } : undefined;
    const blockers = !next ? ['đã tối đa'] : [
      ...next.requiredLevel > character.level ? [`cần cấp ${next.requiredLevel}`] : [],
      ...pre && !pre.learned ? [`phải học ${pre.name}`] : [],
      ...next.cost > character.skillPoints ? [`thiếu điểm kỹ năng (cần ${next.cost}, còn ${character.skillPoints})`] : [],
    ];
    return {
      id, name, element: ITEM_ELEMENTS[Math.floor(id / 1000)] ?? String(Math.floor(id / 1000)), index, box: SKILL_TREE.boxes[index],
      level: have, maxLevel: skill.levels.length, icon: `data/icons/skills/${id}${have > 0 ? '' : '-grey'}.webp`,
      prerequisite: pre, current: have > 0 ? skill.levels[have - 1] : undefined, next, blockers, skill,
    };
  });
}

/** The detail panel on the right of the tab, line by line as the game writes it. */
export function skillPanel(node: SkillNode): string[] {
  const mana = (l: Skill['levels'][number]) => `- Tiêu hao nội lực: ${l.mana / THANH} thành nội lực`;
  const lines = [node.name, `Cấp tối đa: ${node.maxLevel}`];
  if (node.current) lines.push(`Cấp hiện tại: ${node.current.level}`, node.current.description, mana(node.current));
  if (!node.next) return lines;
  if (node.current) lines.push(`Cấp kế tiếp: ${node.next.level}`); else lines.push('Chưa học');
  lines.push(node.next.description, mana(node.next), 'Điều kiện để học', `+ Nhân vật đạt cấp: ${node.next.requiredLevel}`);
  if (node.prerequisite) lines.push(`+ Phải học: ${node.prerequisite.name}`);
  lines.push(`+ Tiêu hao: ${node.next.cost} điểm kỹ năng`);
  return lines;
}

/** "1003 Liệt Hỏa Chi Kiếm 0/20 (trái 1): học được, 2 điểm" or "… (trái 2): cần cấp 32, phải học Liệt Hỏa Chi Kiếm". */
export function skillLine(node: SkillNode) {
  const where = node.box ? (node.box.depth ? `${node.box.branch} ${node.box.depth}` : node.box.branch) : `ô ${node.index}`;
  const state = node.blockers.length ? node.blockers.join(', ') : `${node.level ? `lên cấp ${node.level + 1}` : 'học'} được, ${node.next!.cost} điểm`;
  return `${node.id} ${node.name} ${node.level}/${node.maxLevel} (${where}): ${state}`;
}
