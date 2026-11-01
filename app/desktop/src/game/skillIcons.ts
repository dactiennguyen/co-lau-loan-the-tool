// The skill icons of data/icons/skills (npm run items cuts them from the game's skill<element>.dat): <id>.webp once
// learned, <id>-grey.webp before, and tree.webp, the background of the tree. Bundled by Vite with the app.
const files = import.meta.glob<string>("../../../../data/icons/skills/*.webp", { eager: true, query: "?url", import: "default" });
const byName = new Map(Object.entries(files).map(([path, url]) => [/([^/]+)\.webp$/.exec(path)?.[1], url]));

/** The icon of a skill, colour once learned, grey before; undefined when there is none. */
export const skillIcon = (id: number, learned: boolean) => byName.get(learned ? `${id}` : `${id}-grey`);

/** tree-skill of the APK: 288 × 347, 9 boxes of 60 × 60 joined by arrows (skills.rs BOXES). */
export const TREE = { url: byName.get("tree"), width: 288, height: 347, box: 60 };
