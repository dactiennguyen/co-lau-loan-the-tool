import { Avatar } from "../components/Avatar";
import { Badge } from "../components/Badge";
import { Card } from "../components/Card";
import type { Character } from "../types";
import "./PlayersCard.css";

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
          <span className="count px" title={c.playersKnown ? `${players.length + 1} người trong khu, tính cả bạn` : "Chưa đọc được danh sách (s2c/1263)"}>
            {c.playersKnown ? players.length : "?"}
          </span>
        )
      }
      className="players-card"
    >
      {c && !c.playersKnown && (
        <p className="players__empty">Không đọc được danh sách người chơi của khu (s2c/1263); dưới đây chỉ có người vào sau.</p>
      )}
      {c?.playersKnown && players.length === 0 && <p className="players__empty">Chỉ có bạn ở khu này.</p>}
      <ul className="players scroll">
        {players.map((p) => (
          <li key={p.id}>
            <Avatar name={p.name} size={22} />
            <span className="players__name selectable">{p.name}</span>
            <Badge tone={levelTone(p.level, c!.level)}>LV {p.level}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
