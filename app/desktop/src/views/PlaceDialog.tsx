import { useEffect } from "react";
import { api } from "../api";
import { Button } from "../components/Button";
import { Dialog } from "../components/Dialog";
import type { Account, Character, Zone } from "../types";
import "./PlaceDialog.css";

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
      className="place"
      onClose={onClose}
      onSubmit={(e) => e.preventDefault()}
    >
      {why && <p className="dialog__note place__why">{why}</p>}
      {c && (
        <>
          <section className="place__sec" aria-labelledby="place-zones">
            <div className="place__head">
              <h3 id="place-zones">Khu của {c.mapName}</h3>
              {c.zones && (
                <span className="place__sum">
                  {c.zones.reduce((n, z) => n + z.players, 0)} người, {c.zones.filter((z) => !z.players).length} khu trống
                </span>
              )}
              <Button kind="ghost" small icon="refresh" aria-label="Làm mới số người" onClick={() => api.listZones(account.id)} />
            </div>
            {c.zones ? (
              <div className="place__zones">
                {c.zones.map((z) => {
                  const here = z.zone === c.zone;
                  return (
                    <button
                      key={z.zone}
                      type="button"
                      className={`place__zone place__zone--l${Math.min(z.load, 2)}${here ? " place__zone--here" : ""}`}
                      disabled={!!why || here || z.players >= z.capacity}
                      title={zoneTitle(z, here)}
                      aria-label={zoneTitle(z, here)}
                      onClick={() => zone(z.zone)}
                    >
                      <b className="px">{z.zone}</b>
                      <small>{z.players}/{z.capacity}</small>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="place__wait">Đang lấy số người của từng khu…</p>
            )}
            <p className="place__hint">Mỗi khu có quái và boss riêng. Đăng nhập lại thì server tự xếp khu.</p>
          </section>

          <section className="place__sec" aria-labelledby="place-maps">
            <div className="place__head">
              <h3 id="place-maps">Map khác</h3>
            </div>
            <ul className="place__maps">
              {c.maps.map((m) => (
                <li key={m.mapId} className={m.hops === 0 ? "place__map--here" : undefined}>
                  <div className="place__name">
                    <b>{m.name}</b>
                    <small>
                      {m.mapId}
                      {m.level != null && ` · cấp ${m.level}`}
                    </small>
                  </div>
                  <span className="place__way">
                    {m.hops === 0 ? "Đang ở đây" : m.hops == null ? "Chưa có đường" : `${m.hops} cổng`}
                  </span>
                  <Button kind="tonal" small disabled={!!why || !m.hops} onClick={() => go(m.mapId)}>
                    Đi tới
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
      <footer>
        <Button kind="ghost" onClick={onClose}>
          Đóng
        </Button>
      </footer>
    </Dialog>
  );
}
