import { Avatar } from "../components/Avatar";
import { Badge } from "../components/Badge";
import { Card } from "../components/Card";
import type { Character } from "../types";
import "./PlayersCard.css";

/** Level badge colour against the own level: stronger players warm, weaker cool. */
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
      aside={c && <span className="count">{players.length}</span>}
      className="players-card"
    >
      {c && players.length === 0 && <p className="players__empty">Chỉ có bạn ở khu này.</p>}
      <ul className="players scroll">
        {players.map((p) => (
          <li key={p.id}>
            <Avatar name={p.name} size={26} />
            <span className="players__name selectable">{p.name}</span>
            <Badge tone={levelTone(p.level, c!.level)}>Cấp {p.level}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
