// The item icons of data/icons (npm run items decodes them from the game's files): i<icon>.webp, bundled by Vite with
// the app. ItemView.icon names the file.
const files = import.meta.glob<string>("../../../../data/icons/i*.webp", { eager: true, query: "?url", import: "default" });
const byIcon = new Map(Object.entries(files).map(([path, url]) => [Number(/i(\d+)\.webp$/.exec(path)?.[1]), url]));

/** The URL of an icon, undefined when there is none. */
export const itemIcon = (icon: number | null | undefined) => (icon == null ? undefined : byIcon.get(icon));
