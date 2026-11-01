import { useId, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";
import { Button } from "../components/Button";
import { DIALOG, Dialog } from "../components/Dialog";
import { Hint } from "../components/Hint";
import { Icon, type IconName } from "../components/Icon";
import { TabPanel, Tabs } from "../components/Tabs";
import { num } from "../format";
import { recalled, remember } from "../remember";
import { busyReason, NPC_MAP } from "../shops";
import { selectedLog, useStore } from "../store";
import type { Account, SmithRun } from "../types";
import { ConfirmDialog } from "./ConfirmDialog";
import { ShopBuy } from "./ShopBuy";
import { ShopExchange } from "./ShopExchange";
import { ShopMerge } from "./ShopMerge";
import { ShopUpgrade } from "./ShopUpgrade";
import "./ShopModal.css";

export type ShopSub = "buy" | "merge" | "upgrade" | "exchange";
const SUBS: { key: ShopSub; label: string; icon: IconName }[] = [
  { key: "buy", label: "Mua", icon: "cart" },
  { key: "merge", label: "Gộp đá", icon: "gem" },
  { key: "upgrade", label: "Nâng cấp", icon: "hammer" },
  { key: "exchange", label: "Đổi lượng", icon: "coin" },
];
const SUB_KEY = "shop.sub";
/** Bot::smith refused the task: "Chưa <title>: <why>", the title as Bot::smith_title writes it. */
const REFUSED = /^Chưa (Gộp đá|Hỏi giá|Nâng cấp|Tách đá|Chuyển hoá|Đổi )/;
/** "Xong việc quay về chỗ cũ" is on until turned off. */
const BACK = "shop.back";

/** A spend to confirm: what it does and costs, and the command that does it. */
export interface Ask {
  title: string;
  message: ReactNode;
  confirm: string;
  icon?: IconName;
  run: () => Promise<void>;
}

/** What the sub-tabs share: the account, why nothing can be done now (null when it can), the confirm box, and `track`
 * to call before a task sent without it (Hỏi giá), so the modal shows the bot's refusal of it. */
export interface ShopContext {
  account: Account;
  why: string | null;
  ask: (a: Ask) => void;
  track: () => void;
}

interface Props {
  account: Account;
  /** Mua búa: the item to pick first in Dược phẩm (2). */
  item?: number;
  onClose: () => void;
}

/**
 * Tiện ích (16-upgrade.md#tính-năng), a large modal: the money and the bag's room, where the character stands (the NPCs
 * serve only in Làng Thanh Khê, with the trip there and back), the work of Pháp sư or Hương Lão under way, and four
 * sub-tabs: Mua at the 14 shops, Gộp đá, Nâng cấp (with Tách đá and Chuyển hoá), Đổi lượng. Every spend asks once more.
 * Closing it, however it closes, walks the character back after a trip with "Xong việc quay về chỗ cũ" (Bot::shop_closed).
 */
export function ShopModal({ account, item, onClose }: Props) {
  const c = account.character;
  const id = account.id;
  const [sub, setSub] = useState<ShopSub>(() =>
    item != null ? "buy" : (SUBS.find((s) => s.key === recalled(SUB_KEY))?.key ?? "buy"),
  );
  const pick = (s: ShopSub) => {
    setSub(s);
    remember(SUB_KEY, s);
  };
  const [ask, setAsk] = useState<Ask | null>(null);
  // The bot's refusal of the last task sent from here, shown under the money until another is sent.
  const log = useStore(selectedLog);
  const [mark, setMark] = useState<number | null>(null);
  const track = () => setMark(log.length ? log[log.length - 1].seq : 0);
  const refused = mark == null ? undefined : log.find((l) => l.seq > mark && REFUSED.test(l.text));
  const [back, setBack] = useState(() => recalled(BACK) !== "0");
  const tabs = useId();
  const close = () => {
    api.shopClosed(id);
    onClose();
  };
  const here = c?.mapId === NPC_MAP;
  const busy = c ? busyReason(c) : "Nick chưa vào game.";
  const why = busy ?? (here ? null : "Các NPC này ở Làng Thanh Khê (M1): đi tới đó trước.");
  const money = c?.currencies;
  const bag = c?.bag;
  const ctx: ShopContext = {
    account,
    why,
    ask: (a) =>
      setAsk({
        ...a,
        run: () => {
          track();
          return a.run();
        },
      }),
    track,
  };

  return (
    <Dialog
      title="Tiện ích"
      subtitle={`${account.label} · Lái Buôn, Bà Tư Hạnh, Pháp sư, Hương Lão · Làng Thanh Khê`}
      className="w-[min(1180px,96vw)] h-[min(880px,94vh)] max-w-none max-h-none"
      formClassName="h-full box-border grid-rows-[auto_auto_auto_minmax(0,1fr)_auto] gap-2.5 px-5 py-4"
      onClose={close}
      onSubmit={(e) => e.preventDefault()}
    >
      <div className="shopmodal__top">
        <div className="shopmodal__wallet" aria-label="Tiền và túi">
          <span title="Xu">
            <Icon name="coin" size={13} /> <b className="px">{num(money?.xu)}</b> Xu
          </span>
          <span title="Xu khóa" className="shopmodal__locked">
            <Icon name="coin" size={13} /> <b className="px">{num(money?.xuKhoa)}</b> Xu khóa
          </span>
          <span title="Lượng" className="shopmodal__luong">
            <Icon name="gem" size={13} /> <b className="px">{num(money?.luong)}</b> Lượng
          </span>
          <span title="Ô túi đã dùng">
            <Icon name="wallet" size={13} /> Túi <b className="px">{bag ? `${bag.items.length}/${bag.capacity}` : "—"}</b>
          </span>
          <span className="shopmodal__where">
            <Icon name="pin" size={13} /> {c ? `${c.mapName} · khu ${c.zone}` : "—"}
          </span>
        </div>
        {c && !here && (
          <div className="shoptab__away">
            <p>
              {account.label} đang ở {c.mapName}. Lái Buôn, Bà Tư Hạnh, Pháp sư và Hương Lão chỉ làm việc ở Làng Thanh Khê.
            </p>
            <label className="shoptab__check">
              <input
                type="checkbox"
                checked={back}
                onChange={(e) => {
                  setBack(e.target.checked);
                  remember(BACK, e.target.checked ? "1" : "0");
                }}
              />
              <span className="shoptab__box" aria-hidden="true">
                <Icon name="check" size={11} />
              </span>
              Xong việc quay về chỗ cũ ({c.mapName} khu {c.zone})
            </label>
            <Hint label="Xong việc quay về chỗ cũ là gì?" id={`${tabs}-back`}>
              Bật thì khi đóng cửa hàng (nút Quay lại, ✕ hay Esc), nhân vật tự đi về đúng map và khu lúc bắt đầu chuyến đi.
              Tắt thì nhân vật đứng lại ở Làng Thanh Khê.
            </Hint>
            <Button kind="primary" small icon="swap" disabled={!!busy} onClick={() => api.shopTrip(id, back)}>
              {c.moving ? "Đang đi…" : "Đi tới Làng Thanh Khê"}
            </Button>
          </div>
        )}
        {busy && <p className="shoptab__why">{busy}</p>}
        {refused && (
          <p className="shoptab__why" role="status">
            {refused.text}
          </p>
        )}
        {c?.backTo && (
          <p className="shoptab__note">
            Đóng cửa hàng (nút Quay lại, ✕ hay Esc) thì {account.label} về {c.backTo}.
          </p>
        )}
        {c?.smith && <SmithStatus run={c.smith} onStop={() => api.stop(id)} />}
      </div>
      <Tabs<ShopSub> id={tabs} label="Việc ở cửa hàng" value={sub} onChange={pick} tabs={SUBS} />
      <div className="shopmodal__body scroll">
        <TabPanel id={tabs} value={sub} className="block">
          {!c ? (
            <p className="shoptab__note">Nick chưa vào game.</p>
          ) : sub === "buy" ? (
            <ShopBuy {...ctx} item={item} />
          ) : sub === "merge" ? (
            <ShopMerge {...ctx} />
          ) : sub === "upgrade" ? (
            <ShopUpgrade {...ctx} />
          ) : (
            <ShopExchange {...ctx} />
          )}
        </TabPanel>
      </div>
      <footer className={DIALOG.footer}>
        <Button icon={c?.backTo ? "swap" : undefined} onClick={close}>
          {c?.backTo ? `Quay lại ${c.backTo}` : "Đóng"}
        </Button>
      </footer>
      {/* The confirm box is a dialog of its own: outside this one's form, on top of it. */}
      {ask &&
        createPortal(
          <ConfirmDialog
            title={ask.title}
            message={ask.message}
            confirm={ask.confirm}
            icon={ask.icon ?? "check"}
            onConfirm={ask.run}
            onClose={() => setAsk(null)}
          />,
          document.body,
        )}
    </Dialog>
  );
}

/** The work of Pháp sư or Hương Lão: what it does now, the presses so far, what they cost, and Dừng while it runs. */
function SmithStatus({ run, onStop }: { run: SmithRun; onStop: () => void }) {
  const running = run.done == null;
  const spent = [
    run.spentXuKhoa ? `${num(run.spentXuKhoa)} Xu khóa` : null,
    run.spentXu ? `${num(run.spentXu)} Xu` : null,
    run.spentLuong ? `${num(run.spentLuong)} Lượng` : null,
  ].filter(Boolean);
  const q = run.quote;
  return (
    <div className={running ? "smith smith--on" : "smith"} role="status">
      <div className="smith__head">
        <Icon name={running ? "refresh" : "check"} size={13} />
        <b>{run.title}</b>
        {running && (
          <Button kind="danger" small icon="stop" onClick={onStop}>
            Dừng
          </Button>
        )}
      </div>
      <p className="smith__doing">{running ? run.doing || "…" : run.done}</p>
      <p className="smith__tally">
        {run.steps > 0 && (
          <>
            {run.steps} lần · <span className="smith__ok">{run.ok} được</span>
            {run.failed > 0 && <span className="smith__bad"> · {run.failed} trượt</span>}
          </>
        )}
        {spent.length > 0 && <> · tốn {spent.join(", ")}</>}
        {q && (q.fee || q.rate != null) && (
          <>
            {" "}
            · Pháp sư báo: {q.fee ? `${num(q.fee.amount)} ${q.fee.money === "xu" ? "Xu" : "Xu khóa"}` : "miễn phí"}
            {q.luong > 0 && ` + ${q.luong} Lượng`}
            {q.rate != null && `, tỉ lệ ${q.rate}%`}
          </>
        )}
      </p>
    </div>
  );
}
