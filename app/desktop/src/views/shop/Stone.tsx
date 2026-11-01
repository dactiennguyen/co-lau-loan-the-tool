import { cn } from "@/utils/cn";
import { stoneIcon } from "@/game/shops";

/** A row of stones (or of the Chuyển hoá item) as chips: each one given `chip`. */
export const STONES = "flex flex-wrap items-center gap-1.5";

interface ChipProps {
  /** The picture, from itemIcon or stoneIcon. */
  url: string | undefined;
  name: string;
  /** "×4" in place of the name, which stays the picture's alt text; the name shows when there is no picture. */
  count?: number;
  /** Hover text. */
  title?: string;
  /** In a row of chips (STONES): framed on a dark plate, the text smaller. */
  chip?: boolean;
}

/** An item with its picture: "Chuyển hoá trang bị sơ cấp", or the picture and "×4" alone. */
export function ItemChip({ url, name, count, title, chip }: ChipProps) {
  const short = count != null && !!url;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap align-middle",
        chip && "py-0.5 pr-2 pl-[3px] text-[11.5px] text-fg-2 bg-bg-2 border-2 border-line",
      )}
      title={title}
    >
      {url && <img className="flex-none size-[26px] [image-rendering:auto]" src={url} alt={short ? name : ""} draggable={false} />}
      {short ? <b className={cn("px", chip && "text-11 text-fg")}>×{count}</b> : <span>{count != null ? `${count} ${name}` : name}</span>}
    </span>
  );
}

interface Props {
  level: number;
  /** "4 Đá cấp 6", or "×4" when short. */
  count?: number;
  /** "(khoá)" after the name. */
  locked?: boolean;
  /** Only the picture (named by its alt text) and "×count". */
  short?: boolean;
  /** In a row of chips (STONES). */
  chip?: boolean;
}

/** A stone of Pháp sư with its picture: "Đá cấp 6", "4 Đá cấp 6 (khoá)", or the picture and "×4" alone. */
export function Stone({ level, count, locked, short, chip }: Props) {
  const name = `Đá cấp ${level}${locked ? " (khoá)" : ""}`;
  const url = stoneIcon(level);
  if (short) return <ItemChip url={url} name={name} count={count ?? 1} title={`${count ?? 1} ${name}`} chip={chip} />;
  return <ItemChip url={url} name={count != null ? `${count} ${name}` : name} chip={chip} />;
}
