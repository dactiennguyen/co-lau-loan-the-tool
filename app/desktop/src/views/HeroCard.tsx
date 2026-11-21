import { Avatar } from "@/components/Avatar";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { ElementTag } from "@/components/ElementTag";
import { GenderTag } from "@/components/GenderTag";
import { Icon } from "@/components/Icon";
import { Pill } from "@/components/Pill";
import { isConnected } from "@/utils/format";
import type { Account } from "@/api/types";
import { AppStatus } from "./AppStatus";
import { BoostTag } from "./BoostTag";
import { NearbyButton } from "./NearbyButton";
import { ProxyButton } from "./ProxyButton";

/** The block of where the character is (Vị trí), a line on its left; its label, and the line under the map name. */
const BLOCK = "grid gap-0.5 min-w-0 pl-4 border-l-2 border-l-line";
const LABEL = "inline-flex items-center gap-1 text-10 font-extrabold tracking-[0.08em] uppercase text-fg-3";
const SUB = "text-11 text-fg-2 truncate tabular-nums";

interface Props {
  account: Account;
  onLogin: () => void;
  onLogout: () => void;
  onRemove: () => void;
  /** Đổi khu / map. */
  onPlace: () => void;
  /** Thống kê (StatsModal). */
  onStats: () => void;
}

/** The selected account: who (name, level, element, gender, timed effects such as x2 EXP, status, and Thống kê at the end of the
 * status line, which opens the battle history in a modal) and where (map, zone, coordinates as text, and the icon
 * button after the map name that moves to another zone or map, then Xung quanh, the other players of the zone). Its
 * money is in the tiles under it (MetricRow). At its right: the key and the version of the app (AppStatus), then Đăng xuất. */
export function HeroCard({ account: a, onLogin, onLogout, onRemove, onPlace, onStats }: Props) {
  const c = a.character;
  const connected = isConnected(a.status);
  return (
    <section className="relative grid grid-cols-[minmax(200px,1.6fr)_minmax(0,1.4fr)_auto] items-center gap-4 py-2.5 px-4 bg-card border-[length:var(--px)] border-line-strong notch bevel">
      <div className="flex items-center gap-3 min-w-0">
        <Avatar name={a.username} status={a.status} size={46} dotClassName="border-card" />
        <div className="flex-1 min-w-0 grid gap-1">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="font-display font-extrabold text-20 leading-[1.1] text-fg truncate">{c?.name ?? a.label}</h1>
            {c && <Badge className="h-5 text-12 px-1.5">LV {c.level}</Badge>}
            {c && <ElementTag element={c.element} iconOnly className="h-5 px-1 border border-current" />}
            {c && <GenderTag gender={c.gender} iconOnly className="h-5 px-1 border border-current" />}
            {c?.boosts.map((b) => <BoostTag key={b.key} boost={b} />)}
            {a.proxy?.enabled && <ProxyButton proxy={a.proxy} className="h-5 w-5 border border-good-shade" />}
          </div>
          <div className="flex items-center gap-2 min-w-0 text-11 text-fg-2">
            <Pill status={a.status} text={a.statusText} />
            {/* The span after the status: cut with an ellipsis when the line is too short. */}
            {a.status === 4 ? (
              <span className="inline-flex items-center gap-1 min-w-0 truncate text-danger" title={a.error}>
                {a.error}
              </span>
            ) : a.since ? (
              <span className="inline-flex items-center gap-1 min-w-0 truncate" title={`Vào game lúc ${a.since}`}>
                <Icon name="clock" size={12} /> {a.since}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 min-w-0 truncate">{a.username}</span>
            )}
            {/* Thống kê at the end of the status line, under the name: the bottom right of who the account is. */}
            <Button kind="outline" small icon="chart" className="flex-none ml-auto" onClick={onStats}>
              Thống kê
            </Button>
          </div>
        </div>
      </div>

      {c ? (
        <>
          <div className={BLOCK}>
            <span className={LABEL}>
              <Icon name="pin" size={12} /> Vị trí
            </span>
            {/* Đổi khu / map as an icon after the map name, no taller than the name. */}
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="font-display font-extrabold text-16 leading-[1.25] text-fg truncate" title={c.mapName}>
                {c.mapName}
              </span>
              <Button kind="outline" small icon="swap" className="flex-none w-[22px] h-[22px]" aria-label="Đổi khu / map" disabled={!!c.moving} onClick={onPlace} />
              {/* Xung quanh: the others of the zone, a list that opens under the button. */}
              <NearbyButton character={c} />
            </div>
            <span className={SUB}>
              {c.moving ? (
                <span className="text-primary">{c.moving}…</span>
              ) : (
                <>
                  {c.mapId} · Khu {c.zone} · x {c.x} · y {c.y}
                </>
              )}
            </span>
          </div>
        </>
      ) : (
        <div className={BLOCK}>
          <span className={LABEL}>
            <Icon name="pin" size={12} /> Vị trí
          </span>
          <span className={SUB}>{a.status === 1 ? "Đang vào game…" : "Đăng nhập để xem nhân vật đang ở đâu"}</span>
        </div>
      )}

      {/* The key and the version of the app (the same on every account) beside Đăng xuất. */}
      <div className="flex items-center gap-3">
        <AppStatus />
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
