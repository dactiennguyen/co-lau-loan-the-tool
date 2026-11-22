import { useEffect, useId, useState } from "react";
import { api } from "@/api";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { DIALOG, Dialog } from "@/components/Dialog";
import { DetailsToggle } from "@/components/DetailsToggle";
import { TabPanel, Tabs, type Tab } from "@/components/Tabs";
import { cn } from "@/utils/cn";
import type { Account, Character, MapChoice, Zone } from "@/api/types";

interface Props {
  account: Account;
  onClose: () => void;
}

/** Why the character cannot move now; Bot::change_zone and Bot::go_to refuse the same. */
function busy(c: Character) {
  if (c.battle) return "Đang đánh: đợi hết trận rồi mới đổi chỗ.";
  if (c.job && !c.job.done) return "Đang tự đánh quái: bấm Dừng trước.";
  if (c.questRun && !c.questRun.done) return "Đang tự làm nhiệm vụ: bấm Dừng trước.";
  if (c.moving) return `${c.moving}…`;
  return null;
}

/** A part of the dialog: its head (a title, a sum at the right, a button), then its content. */
const SEC = "grid gap-1.5 min-w-0";
const HEAD = "flex items-center gap-1.5";
const H3 = "text-12 font-extrabold tracking-[0.06em] uppercase text-fg-2";
const NOTE = "text-11 text-fg-3";

/** Cổng Luyện Ngục, its six floors and Hang Bạch Hổ behind its gate 1006 (19-luyen-nguc.md, 17-bach-ho.md): the tab at
 * the right; every other map is under Map thường. */
const LUYEN_NGUC = new Set(["M15", "M18", "M19", "M20", "M21", "M22", "M23", "M24"]);
type MapTab = "maps" | "luyen";
const MAP_TABS: Tab<MapTab>[] = [
  { key: "maps", label: "Map thường", icon: "pin" },
  { key: "luyen", label: "Luyện Ngục", icon: "flame" },
];

function zoneTitle(z: Zone, here: boolean) {
  if (here) return `Khu ${z.zone}: đang ở đây, ${z.players}/${z.capacity} người`;
  if (z.players >= z.capacity) return `Khu ${z.zone} đã đầy`;
  return `Sang khu ${z.zone}: ${z.players}/${z.capacity} người`;
}

/**
 * Đổi khu / map of the Vị trí card. The zones of the map with their players, asked again on open and on Làm mới
 * (c2s/1172), each zone with mobs of its own; then the maps of the atlas, with the portals the bot walks through. A pick
 * starts the move and closes the dialog; the log and the Vị trí card tell how it goes.
 */
export function PlaceDialog({ account, onClose }: Props) {
  const c = account.character;
  const ids = useId();
  // The zones fold away until Chi tiết opens them; they are asked then (once per open, not on every update of the
  // account), and again on Làm mới.
  const [zonesOpen, setZonesOpen] = useState(false);
  useEffect(() => {
    if (c && zonesOpen) api.listZones(account.id);
  }, [account.id, zonesOpen]);
  const [tab, setTab] = useState<MapTab>(() => (c && LUYEN_NGUC.has(c.mapId) ? "luyen" : "maps"));
  const why = c ? busy(c) : "Nick chưa vào game.";
  const shownMaps = c ? c.maps.filter((m) => LUYEN_NGUC.has(m.mapId) === (tab === "luyen")) : [];
  const zone = (z: number) => {
    api.changeZone(account.id, z);
    onClose();
  };
  const go = (mapId: string) => {
    api.goToMap(account.id, mapId);
    onClose();
  };
  return (
    <Dialog
      title="Đổi khu / map"
      subtitle={c ? `${account.label} · ${c.mapName}, khu ${c.zone}` : account.label}
      className="w-[520px]"
      onClose={onClose}
      onSubmit={(e) => e.preventDefault()}
    >
      {why && <p className={cn(DIALOG.note, "text-fg")}>{why}</p>}
      {c && (
        <>
          {/* The zones of the map as the game's Khu vực panel (number, players of 20, red when crowded), scrolling within
              the dialog; then one row per map with the portals to take. */}
          <section className={SEC} aria-labelledby="place-zones">
            <div className={HEAD}>
              <h3 id="place-zones" className={H3}>
                Khu của {c.mapName}
              </h3>
              <span className="text-11 text-fg-2 whitespace-nowrap">· đang ở khu {c.zone}</span>
              <DetailsToggle open={zonesOpen} onToggle={() => setZonesOpen((o) => !o)} controls={`${ids}-zones`} />
            </div>
            {/* Folded until Chi tiết: the zones are asked only then. */}
            <div id={`${ids}-zones`} className="grid gap-1.5" hidden={!zonesOpen}>
              <div className={HEAD}>
                <span className="text-11 text-fg-3">
                  {c.zones
                    ? `${c.zones.reduce((n, z) => n + z.players, 0)} người, ${c.zones.filter((z) => !z.players).length} khu trống`
                    : "Đang lấy số người của từng khu…"}
                </span>
                <Button kind="ghost" small icon="refresh" className="ml-auto" aria-label="Làm mới số người" onClick={() => api.listZones(account.id)} />
              </div>
              {c.zones ? (
                <div className="grid grid-cols-10 gap-1 max-h-[200px] overflow-auto p-0.5">
                  {c.zones.map((z) => {
                    const here = z.zone === c.zone;
                    const load = Math.min(z.load, 2);
                    return (
                      <button
                        key={z.zone}
                        type="button"
                        className={cn(
                          "grid justify-items-center gap-px pt-1 px-0 pb-[3px] bg-ink border border-line text-fg-2 cursor-pointer",
                          "enabled:hover:border-primary focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-1",
                          "disabled:cursor-default disabled:opacity-55",
                          here && "opacity-100 disabled:opacity-100 border-primary bg-bg-2",
                        )}
                        disabled={!!why || here || z.players >= z.capacity}
                        title={zoneTitle(z, here)}
                        aria-label={zoneTitle(z, here)}
                        onClick={() => zone(z.zone)}
                      >
                        <b className="px text-12 text-fg">{z.zone}</b>
                        <small className={cn("text-9 tabular-nums", load === 1 && "text-coin", load === 2 && "text-danger")}>
                          {z.players}/{z.capacity}
                        </small>
                      </button>
                    );
                  })}
                </div>
              ) : null}
              <p className={NOTE}>Mỗi khu có quái và boss riêng. Đăng nhập lại thì server tự xếp khu.</p>
            </div>
          </section>

          <section className={SEC} aria-label="Map khác">
            <Tabs<MapTab> id={`${ids}-maps`} label="Loại map" value={tab} onChange={setTab} tabs={MAP_TABS} />
            <TabPanel id={`${ids}-maps`} value={tab}>
              {shownMaps.length ? (
                <ul className="grid gap-1 m-0 p-0 list-none">
                  {shownMaps.map((m) => (
                    <MapRow key={m.mapId} m={m} own={c.level} disabled={!!why} onGo={() => go(m.mapId)} />
                  ))}
                </ul>
              ) : (
                <p className={NOTE}>{tab === "luyen" ? "Atlas chưa có map Luyện Ngục nào." : "Atlas chưa có map nào khác."}</p>
              )}
            </TabPanel>
          </section>
        </>
      )}
      <footer className={DIALOG.footer}>
        <Button onClick={onClose}>
          Đóng
        </Button>
      </footer>
    </Dialog>
  );
}

/** The level a map asks, against the own level: too high to go (Cần cấp) red, above but let in gold, the rest green. */
const mapTone = (m: MapChoice, own: number) =>
  m.need != null ? "var(--danger)" : (m.level ?? 0) > own ? "var(--coin)" : "var(--s-online)";

/** One map of the atlas: its name and id, how the bot gets there (portals, Bản đồ thế giới), its level as a large tag in
 * colour at the right, and Đi tới. */
function MapRow({ m, own, disabled, onGo }: { m: MapChoice; own: number; disabled: boolean; onGo: () => void }) {
  return (
    <li className={cn("flex items-center gap-2.5 px-2 py-1.5 bg-ink", m.hops === 0 && "outline-1 outline-primary -outline-offset-1")}>
      <div className="grid gap-px min-w-0 mr-auto">
        <b className="text-13 text-fg">{m.name}</b>
        <small className="text-11 text-fg-3">{m.mapId}</small>
      </div>
      <span className="text-11 text-fg-2 whitespace-nowrap">
        {m.hops === 0
          ? "Đang ở đây"
          : m.need != null
            ? "Chưa đủ cấp"
            : m.hops == null
              ? "Chưa có đường"
              : m.warp
                ? `Bản đồ thế giới${m.hops > 1 ? ` + ${m.hops - 1} cổng` : ""}`
                : `${m.hops} cổng`}
      </span>
      {m.level != null && (
        <span title={m.need != null ? `Cần cấp ${m.need}` : `Map cấp ${m.level}`}>
          <Badge tone={mapTone(m, own)} className="h-6 min-w-[36px] justify-center px-1.5 text-14">
            {m.need ?? m.level}
          </Badge>
        </span>
      )}
      <Button kind="tonal" small disabled={disabled || !m.hops || m.need != null} onClick={onGo}>
        Đi tới
      </Button>
    </li>
  );
}
