import { Avatar } from "../components/Avatar";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import { ElementTag } from "../components/ElementTag";
import { Icon } from "../components/Icon";
import { Pill } from "../components/Pill";
import { isConnected } from "../format";
import type { Account } from "../types";
import { BoostTag } from "./BoostTag";
import "./HeroCard.css";

interface Props {
  account: Account;
  onLogin: () => void;
  onLogout: () => void;
  onRemove: () => void;
  /** Đổi khu / map. */
  onPlace: () => void;
}

/** The selected account: who (name, level, element, timed effects such as x2 EXP, status) and where (map, zone, coordinates as text, and the icon
 * button after the map name that moves to another zone or map). Its money is in the tiles under it (MetricRow), the other players of the zone in their
 * card. */
export function HeroCard({ account: a, onLogin, onLogout, onRemove, onPlace }: Props) {
  const c = a.character;
  const connected = isConnected(a.status);
  return (
    <section className="hero">
      <div className="hero__who">
        <Avatar name={a.username} status={a.status} size={46} />
        <div className="hero__id">
          <div className="hero__name">
            <h1>{c?.name ?? a.label}</h1>
            {c && <Badge>LV {c.level}</Badge>}
            {c && <ElementTag element={c.element} />}
            {c?.boosts.map((b) => <BoostTag key={b.key} boost={b} />)}
            {a.proxy?.enabled && (
              <span className="hero__proxy" title={`Kết nối qua proxy ${a.proxy.label}`}>
                <Icon name="shield" size={11} /> Proxy
              </span>
            )}
          </div>
          <div className="hero__meta">
            <Pill status={a.status} text={a.statusText} />
            {a.status === 4 ? (
              <span className="hero__error" title={a.error}>
                {a.error}
              </span>
            ) : a.since ? (
              <span title={`Vào game lúc ${a.since}`}>
                <Icon name="clock" size={12} /> {a.since}
              </span>
            ) : (
              <span>{a.username}</span>
            )}
          </div>
        </div>
      </div>

      {c ? (
        <>
          <div className="hero__block hero__where">
            <span className="hero__label">
              <Icon name="pin" size={12} /> Vị trí
            </span>
            <div className="hero__map">
              <span className="hero__big" title={c.mapName}>
                {c.mapName}
              </span>
              <Button kind="outline" small icon="swap" aria-label="Đổi khu / map" disabled={!!c.moving} onClick={onPlace} />
            </div>
            <span className="hero__sub">
              {c.moving ? (
                <span className="hero__moving">{c.moving}…</span>
              ) : (
                <>
                  {c.mapId} · Khu {c.zone} · x {c.x} · y {c.y}
                </>
              )}
            </span>
          </div>
        </>
      ) : (
        <div className="hero__block hero__where hero__placeholder">
          <span className="hero__label">
            <Icon name="pin" size={12} /> Vị trí
          </span>
          <span className="hero__sub">{a.status === 1 ? "Đang vào game…" : "Đăng nhập để xem nhân vật đang ở đâu"}</span>
        </div>
      )}

      <div className="hero__actions">
        {!connected && (
          <Button kind="glass" icon="trash" aria-label="Xoá nick" onClick={onRemove} />
        )}
        <Button
          kind={connected ? "glass" : "primary"}
          icon={connected ? "logout" : "login"}
          disabled={a.status === 1}
          onClick={connected ? onLogout : onLogin}
        >
          {a.status === 1 ? "Đang kết nối…" : connected ? "Đăng xuất" : "Đăng nhập"}
        </Button>
      </div>
    </section>
  );
}
