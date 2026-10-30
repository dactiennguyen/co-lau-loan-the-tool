import { statusTone } from "../format";
import type { Status } from "../types";
import "./Pill.css";

/** Status chip: a dot (pulsing while connecting or fighting) and the status text. */
export function Pill({ id, status, text }: { id?: string; status: Status; text: string }) {
  return (
    <span id={id} className={`pill${status === 1 || status === 3 ? " pill--live" : ""}`} style={{ color: statusTone(status) }}>
      <i className="pill__dot" />
      {text}
    </span>
  );
}
