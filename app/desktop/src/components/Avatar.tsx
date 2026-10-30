import { hue, initial, statusTone } from "../format";
import type { Status } from "../types";
import "./Avatar.css";

/** Initial on a gradient picked from the name; a status dot when `status` is given. */
export function Avatar({ name, status, size = 40 }: { name: string; status?: Status; size?: number }) {
  return (
    <span className={`avatar avatar--h${hue(name)}`} style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {initial(name)}
      {status !== undefined && <i className="avatar__dot" style={{ background: statusTone(status) }} />}
    </span>
  );
}
