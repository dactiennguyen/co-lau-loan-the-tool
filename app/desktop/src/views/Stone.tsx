import { stoneIcon } from "../shops";

interface ChipProps {
  /** The picture, from itemIcon or stoneIcon. */
  url: string | undefined;
  name: string;
  /** "×4" in place of the name, which stays the picture's alt text; the name shows when there is no picture. */
  count?: number;
  /** Hover text. */
  title?: string;
}

/** An item with its picture: "Chuyển hoá trang bị sơ cấp", or the picture and "×4" alone. */
export function ItemChip({ url, name, count, title }: ChipProps) {
  const short = count != null && !!url;
  return (
    <span className="stone" title={title}>
      {url && <img src={url} alt={short ? name : ""} draggable={false} />}
      {short ? <b className="px">×{count}</b> : <span>{count != null ? `${count} ${name}` : name}</span>}
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
}

/** A stone of Pháp sư with its picture: "Đá cấp 6", "4 Đá cấp 6 (khoá)", or the picture and "×4" alone. */
export function Stone({ level, count, locked, short }: Props) {
  const name = `Đá cấp ${level}${locked ? " (khoá)" : ""}`;
  const url = stoneIcon(level);
  if (short) return <ItemChip url={url} name={name} count={count ?? 1} title={`${count ?? 1} ${name}`} />;
  return <ItemChip url={url} name={count != null ? `${count} ${name}` : name} />;
}
