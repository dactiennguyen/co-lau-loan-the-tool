// The mob icons of data/icons/mobs (npm run mobs cuts them from the game's sprite sheets): <type>.webp, bundled by Vite
// with the app, and names.json, the type of each mob name of the atlas (docs/app/events/06-map-mobs.md#ảnh-quái).
import names from "../../../../data/icons/mobs/names.json";

const files = import.meta.glob<string>("../../../../data/icons/mobs/*.webp", { eager: true, query: "?url", import: "default" });
const byType = new Map(Object.entries(files).map(([path, url]) => [Number(/(\d+)\.webp$/.exec(path)?.[1]), url]));
const types: Record<string, number> = names.types;

/** The URL of the picture of a mob or boss by its name, undefined when its type or its picture is not known (the bosses
 * and Chỉ Huy Sơn Tặc: their sheets are not on the phone). */
export const mobIcon = (name: string) => {
  const type = types[name];
  return type == null ? undefined : byType.get(type);
};
