import { cn } from "../cn";
import { statusTone } from "../format";
import type { Status } from "../types";

/** Status chip: a square light (blinking while connecting or fighting) and the status text, in the status colour on a dark plate. */
export function Pill({ id, status, text }: { id?: string; status: Status; text: string }) {
  return (
    <span
      id={id}
      className="inline-flex items-center gap-[5px] h-[18px] pr-1.5 pl-[5px] bg-ink text-[10.5px] font-bold whitespace-nowrap"
      style={{ color: statusTone(status) }}
    >
      <i className={cn("size-1.5 bg-current", (status === 1 || status === 3) && "animate-blink")} />
      {text}
    </span>
  );
}
