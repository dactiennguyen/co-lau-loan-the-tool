import { Avatar } from "../components/Avatar";
import { Badge } from "../components/Badge";
import { Card } from "../components/Card";
import type { Character } from "../types";

/** Level tag colour against the own level: stronger players red, the same gold, weaker green. */
const levelTone = (level: number, own: number) =>
  level > own ? "var(--accent)" : level === own ? "var(--coin)" : "var(--s-online)";

/** The other players of the zone (s2c/1263, kept current by 1167/1170/1253), highest level first. */
export function PlayersCard({ character: c }: { character: Character | null }) {
  const players = c?.players ?? [];
  return (
    <Card
      title="Xung quanh"
      icon="users"
      tone="var(--points)"
      subtitle={c ? `${c.mapName} · Khu ${c.zone}` : "Đăng nhập để xem ai cùng khu"}
      aside={
        c && (
          <span
            className="px grid place-items-center min-w-[26px] h-[22px] px-1.5 py-0 bg-points text-ink text-12 bevel-sm"
            title={c.playersKnown ? `${players.length + 1} người trong khu, tính cả bạn` : "Chưa đọc được danh sách (s2c/1263)"}
          >
            {c.playersKnown ? players.length : "?"}
          </span>
        )
      }
    >
      {c && !c.playersKnown && (
        <p className="m-0 text-fg-3 text-12">Không đọc được danh sách người chơi của khu (s2c/1263); dưới đây chỉ có người vào sau.</p>
      )}
      {c?.playersKnown && players.length === 0 && <p className="m-0 text-fg-3 text-12">Chỉ có bạn ở khu này.</p>}
      <ul className="scroll list-none m-0 p-0 flex-1 min-h-0 grid [align-content:start] gap-1">
        {players.map((p) => (
          <li key={p.id} className="flex items-center gap-2 py-[3px] pr-1.5 pl-[3px] bg-bg-2 hover:bg-card-2">
            <Avatar name={p.name} size={22} />
            <span className="selectable flex-1 min-w-0 truncate text-12 font-semibold">{p.name}</span>
            <Badge tone={levelTone(p.level, c!.level)}>LV {p.level}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
