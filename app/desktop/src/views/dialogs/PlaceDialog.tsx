import { useEffect } from "react";
import { api } from "@/api";
import { Button } from "@/components/Button";
import { DIALOG, Dialog } from "@/components/Dialog";
import { cn } from "@/utils/cn";
import type { Account, Character, Zone } from "@/api/types";

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
  useEffect(() => {
    if (c) api.listZones(account.id);
    // Asked once on open (not again on every update of the account); Làm mới asks again.
  }, [account.id]);
  const why = c ? busy(c) : "Nick chưa vào game.";
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
              <h3 id="place-zones" className={H3}>Khu của {c.mapName}</h3>
              {c.zones && (
                <span className="ml-auto text-11 text-fg-3">
                  {c.zones.reduce((n, z) => n + z.players, 0)} người, {c.zones.filter((z) => !z.players).length} khu trống
                </span>
              )}
              <Button kind="ghost" small icon="refresh" className={c.zones ? undefined : "ml-auto"} aria-label="Làm mới số người" onClick={() => api.listZones(account.id)} />
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
            ) : (
              <p className={NOTE}>Đang lấy số người của từng khu…</p>
            )}
            <p className={NOTE}>Mỗi khu có quái và boss riêng. Đăng nhập lại thì server tự xếp khu.</p>
          </section>

          <section className={SEC} aria-labelledby="place-maps">
            <div className={HEAD}>
              <h3 id="place-maps" className={H3}>Map khác</h3>
            </div>
            <ul className="grid gap-1">
              {c.maps.map((m) => (
                <li
                  key={m.mapId}
                  className={cn("flex items-center gap-2.5 px-2 py-1.5 bg-ink", m.hops === 0 && "outline-1 outline-primary -outline-offset-1")}
                >
                  <div className="grid gap-px min-w-0 mr-auto">
                    <b className="text-13 text-fg">{m.name}</b>
                    <small className="text-11 text-fg-3">
                      {m.mapId}
                      {m.level != null && ` · cấp ${m.level}`}
                    </small>
                  </div>
                  <span className="text-11 text-fg-2 whitespace-nowrap">
                    {m.hops === 0 ? "Đang ở đây" : m.need != null ? `Cần cấp ${m.need}` : m.hops == null ? "Chưa có đường" : `${m.hops} cổng`}
                  </span>
                  <Button kind="tonal" small disabled={!!why || !m.hops || m.need != null} onClick={() => go(m.mapId)}>
                    Đi tới
                  </Button>
                </li>
              ))}
            </ul>
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
