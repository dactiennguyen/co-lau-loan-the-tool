// The mob icons of data/icons/mobs (npm run mobs cuts them from the game's sprite sheets): <n>.webp for the sheet
// 100000 + 10 n, bundled by Vite with the app, and names.json, the picture of each mob name of the atlas
// (docs/app/events/06-map-mobs.md#ảnh-quái).
import names from "../../../../data/icons/mobs/names.json";

const files = import.meta.glob<string>("../../../../data/icons/mobs/*.webp", { eager: true, query: "?url", import: "default" });
const byNumber = new Map(Object.entries(files).map(([path, url]) => [Number(/(\d+)\.webp$/.exec(path)?.[1]), url]));
const pictures: Record<string, number> = names.icons;

/** The URL of the picture of a mob or boss by its name. Undefined for a boss no bot has fought yet: its sheet is known
 * only from the s2c/22 of a battle (06-map-mobs.md#tấm-ảnh-của-quái). */
export const mobIcon = (name: string) => {
  const n = pictures[name];
  return n == null ? undefined : byNumber.get(n);
};

/** The picture of sprite sheet `sprite` (100000 + 10 n, the sheet s2c/22 names: Battle window), undefined without one. */
export const sheetIcon = (sprite: number | null | undefined) =>
  sprite == null ? undefined : byNumber.get((sprite - 100000) / 10);
