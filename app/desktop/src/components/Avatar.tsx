import { cn } from "../cn";
import { hue, initial, statusTone } from "../format";
import type { Status } from "../types";

/** The tile colours, by hue(name). */
const TILE = ["bg-tile-0", "bg-tile-1", "bg-tile-2", "bg-tile-3", "bg-tile-4", "bg-tile-5"];

/** Initial on a tile coloured after the name; a status light at the lower right when `status` is given (its border the
 * colour around the avatar: `dotClassName`). */
export function Avatar({ name, status, size = 32, dotClassName }: { name: string; status?: Status; size?: number; dotClassName?: string }) {
  return (
    <span
      className={cn("relative flex-none inline-grid place-items-center text-ink font-pixel font-bold leading-none bevel-sm", TILE[hue(name)])}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial(name)}
      {status !== undefined && (
        <i
          className={cn("absolute -right-[3px] -bottom-[3px] w-[30%] h-[30%] min-w-2 min-h-2 border-2 border-ink", dotClassName)}
          style={{ background: statusTone(status) }}
        />
      )}
    </span>
  );
}
