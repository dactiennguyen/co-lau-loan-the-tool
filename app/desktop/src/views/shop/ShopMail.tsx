import { useEffect, useId, useRef, useState } from "react";
import { api } from "@/api";
import type { Item, MailBody, MailHeader } from "@/api/types";
import { Button } from "@/components/Button";
import { Hint } from "@/components/Hint";
import { Icon } from "@/components/Icon";
import { itemIcon } from "@/game/itemIcons";
import { isGear } from "@/game/shops";
import { cn } from "@/utils/cn";
import { num } from "@/utils/format";
import { SHOP, type ShopContext } from "./ShopModal";

/** "vừa xong", "7 phút trước", "3 giờ trước", "2 ngày trước", as the game's list says it. */
function ago(at: number, now: number) {
  const m = Math.floor(Math.max(0, now - at) / 60_000);
  if (m < 1) return "vừa xong";
  if (m < 60) return `${m} phút trước`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} giờ trước` : `${Math.floor(h / 24)} ngày trước`;
}

/** The items of a mail with the records of one plain item together (three Đá cấp 5 come as three records), the lock
 * apart. Gear, and anything with stats of its own, stays one record a line. */
function together(items: Item[]): Item[] {
  const out: Item[] = [];
  const plain = (i: Item) => !isGear(i) && i.stats.length === 0;
  for (const i of items) {
    const same = plain(i) && out.find((o) => plain(o) && o.id === i.id && o.locked === i.locked);
    if (same) same.quantity += i.quantity;
    else out.push({ ...i });
  }
  return out;
}

/** The colour of a result line, by its first words as the log writes them. */
const tone = (line: string) =>
  line.startsWith("Xong") ? "text-s-online" : /^(Chưa|Hòm thư không)|từ chối/.test(line) ? "text-danger" : "text-fg-2";

/** A small tag beside a mail: its gift, or that the gift was taken. In the text face: the pixel one has no marks. */
const TAG = "inline-flex items-center gap-1 h-[18px] px-1.5 text-11 whitespace-nowrap border-2";

/**
 * Hòm thư (14-npc.md#hòm-thư): the game's Chức năng → Thư, from wherever the character stands (G1). The list on the left
 * (unread mails with a red mark, gifts not taken yet with their tag), the mail picked on the right with what it holds and
 * the bag slots it needs; Nhận, Nhận hết, and Xóa of mails whose gift is taken. There is no Xóa hết: the game's deletes
 * the gifts not taken too, and they are gone. Picking a mail opens it, which the server marks read, as in the game.
 */
export function ShopMail({ account, busy, ask }: ShopContext) {
  const c = account.character!;
  const id = account.id;
  const box = c.mailbox;
  const mails = box.mails;
  const [pick, setPick] = useState<number | null>(null);
  const hint = useId();
  const fight = !!c.battle;
  const waiting = box.doing != null;
  // The list once the tab opens (again with Làm mới), after the battle or the task under way if one is on.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || fight || waiting) return;
    asked.current = true;
    void api.mailList(id);
  }, [id, fight, waiting]);

  const now = Date.now();
  // Reading waits for the battle and the task before; taking and deleting also for the character to be free.
  const readWhy = fight ? "Đang đánh: đợi hết trận." : waiting ? "Hòm thư đang đợi server trả lời." : null;
  const why = busy ?? readWhy;
  const picked = mails?.find((m) => m.id === pick) ?? null;
  const body = picked ? (box.opened.find((o) => o.id === picked.id) ?? null) : null;
  const gifts = mails?.filter((m) => m.gift && !m.taken) ?? [];
  const done = mails?.filter((m) => m.taken || !m.gift) ?? [];
  const free = c.bag ? Math.max(0, c.bag.capacity - c.bag.items.length) : null;

  const open = (m: MailHeader) => {
    setPick(m.id);
    if (!box.opened.some((o) => o.id === m.id) && !readWhy) void api.mailOpen(id, m.id);
  };
  const remove = (list: MailHeader[]) =>
    ask({
      title: list.length > 1 ? `Xóa ${list.length} thư đã nhận` : "Xóa thư",
      message:
        list.length > 1 ? (
          <>
            Xóa {list.length} thư đã nhận quà (hay không có quà). Thư còn quà chưa nhận được giữ lại. Thư đã xóa không lấy lại được.
          </>
        ) : (
          <>
            Xóa thư <b>{list[0].title}</b>? {list[0].gift ? "Quà của thư đã nhận rồi." : "Thư không có quà."} Thư đã xóa không lấy
            lại được.
          </>
        ),
      confirm: "Xóa",
      icon: "trash",
      run: () => api.mailDelete(id, list.map((m) => m.id)),
    });

  return (
    <div className={SHOP.tab}>
      <p className={SHOP.note}>
        Chức năng → Thư của game. Xem và nhận được từ bất kỳ đâu, không cần về Làng Thanh Khê. Bấm vào thư là mở thư, và thư thành
        đã đọc như trong game.
      </p>
      <div className="flex flex-wrap items-center gap-y-1.5 gap-x-2.5 px-3 py-2 text-12 text-fg-2 bg-bg-2 border-2 border-line">
        <span className="flex-[1_1_220px] min-w-0">
          {mails == null ? (
            "Chưa xem hòm thư."
          ) : (
            <>
              <b className="px text-12 text-fg">{mails.length}</b> thư · <b className="px text-12 text-coin">{gifts.length}</b> thư
              quà chưa nhận
              {free != null && (
                <>
                  {" "}
                  · túi còn <b className="px text-12 text-fg">{free}</b> ô
                </>
              )}
            </>
          )}
        </span>
        <Button small icon="refresh" disabled={!!readWhy} onClick={() => void api.mailList(id)}>
          Làm mới
        </Button>
        <Button kind="primary" small icon="download" disabled={!!why || !gifts.length} onClick={() => void api.mailClaimAll(id)}>
          Nhận hết{gifts.length > 0 && ` (${gifts.length})`}
        </Button>
        <Button small icon="trash" disabled={!!why || !done.length} onClick={() => remove(done)}>
          Xóa thư đã nhận{done.length > 0 && ` (${done.length})`}
        </Button>
        <Hint label="Sao không có Xóa hết?" id={`${hint}-all`}>
          Nút Xóa hết của game xóa mọi thư, kể cả thư còn quà chưa nhận, và quà mất hẳn (đã xảy ra với manina2). App chỉ xóa thư
          đã nhận quà hay không có quà, từng thư một. Nhận hết nhận mọi thư còn đủ chỗ trong túi; thư thiếu chỗ được bỏ qua, không
          mất.
        </Hint>
      </div>
      {/* The modal says `busy` already, above the tabs. */}
      {why && why !== busy && <p className={SHOP.why}>{why}</p>}
      {box.doing ? (
        <p className="flex items-center gap-1.5 text-12 text-fg-2" role="status">
          <Icon name="refresh" size={13} className="text-primary animate-spin motion-reduce:animate-none" />
          {box.doing}
        </p>
      ) : (
        box.last && (
          <p className={cn("text-12", tone(box.last))} role="status">
            {box.last}
          </p>
        )
      )}
      {mails != null &&
        (mails.length === 0 ? (
          <p className={SHOP.note}>Hòm thư trống.</p>
        ) : (
          <div className="grid gap-2.5 items-start @min-[760px]:grid-cols-[minmax(260px,380px)_minmax(0,1fr)]">
            <ul className="grid gap-1 m-0 p-0 list-none" aria-label="Thư">
              {mails.map((m) => (
                <li key={m.id}>
                  <MailRow mail={m} now={now} on={m.id === pick} loading={box.busyWith === m.id} onPick={() => open(m)} />
                </li>
              ))}
            </ul>
            <div className="@min-[760px]:sticky @min-[760px]:top-0">
              {picked ? (
                <MailDetail
                  mail={picked}
                  body={body}
                  now={now}
                  free={free}
                  why={why}
                  loading={box.busyWith === picked.id || (!body && waiting)}
                  onClaim={() => void api.mailClaim(id, picked.id)}
                  onOpen={() => void api.mailOpen(id, picked.id)}
                  onDelete={() => remove([picked])}
                  canOpen={!readWhy}
                />
              ) : (
                <p className="m-0 px-3 py-6 text-center text-12 text-fg-3 bg-bg-2 border-2 border-line">Chọn thư để xem nội dung.</p>
              )}
            </div>
          </div>
        ))}
    </div>
  );
}

/** A mail of the list: the red mark of an unread one, its title over who sent it and when, its gift's tag. */
function MailRow({ mail, now, on, loading, onPick }: { mail: MailHeader; now: number; on: boolean; loading: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      className={cn(
        SHOP.line,
        "grid-cols-[10px_minmax(0,1fr)_auto] w-full",
        on && SHOP.lineOn,
        mail.read && !on && "text-fg-2",
      )}
      aria-pressed={on}
      onClick={onPick}
    >
      <span className="grid place-items-center">
        {!mail.read && <i className="size-2 bg-danger" role="img" aria-label="chưa đọc" />}
      </span>
      <span className={SHOP.lineName}>
        <span className={cn(SHOP.lineTitle, "truncate", !mail.read && "font-bold")}>{mail.title}</span>
        <span className={SHOP.lineSub}>
          {mail.sender} · {ago(mail.sentAt, now)}
        </span>
      </span>
      <span className="flex items-center gap-1.5">
        {loading && <Icon name="refresh" size={12} className="text-primary animate-spin motion-reduce:animate-none" />}
        <GiftTag mail={mail} />
      </span>
    </button>
  );
}

function GiftTag({ mail }: { mail: MailHeader }) {
  if (!mail.gift) return null;
  return mail.taken ? (
    <span className={cn(TAG, "border-line text-fg-3")}>
      <Icon name="check" size={11} /> Đã nhận
    </span>
  ) : (
    <span className={cn(TAG, "border-coin text-coin")}>
      <Icon name="gift" size={11} /> Quà
    </span>
  );
}

interface DetailProps {
  mail: MailHeader;
  body: MailBody | null;
  now: number;
  free: number | null;
  why: string | null;
  loading: boolean;
  canOpen: boolean;
  onOpen: () => void;
  onClaim: () => void;
  onDelete: () => void;
}

/** The mail picked: its words, its money and items, the room its gift needs, Nhận and Xóa. */
function MailDetail({ mail, body, now, free, why, loading, canOpen, onOpen, onClaim, onDelete }: DetailProps) {
  const open = mail.gift && !mail.taken;
  const short = !!body && free != null && open && body.slots > free;
  // Not opened yet: Nhận opens it first and checks the room (Bot::mail).
  const claimWhy = short ? `Cần ${body.slots} ô trống, túi còn ${free}.` : null;
  const money = body
    ? [
        { n: body.xu, name: "Xu", icon: "coin" as const, cls: "text-fg" },
        { n: body.xuKhoa, name: "Xu khóa", icon: "coin" as const, cls: "text-coin" },
        { n: body.luong, name: "Lượng", icon: "gem" as const, cls: "text-accent" },
      ].filter((x) => x.n > 0)
    : [];
  return (
    <section className="grid gap-2 px-3 py-2.5 bg-bg-2 border-2 border-line" aria-label={mail.title}>
      <header className="grid gap-0.5">
        <div className="flex items-start gap-2">
          <b className="flex-1 min-w-0 text-[13px] text-fg">{mail.title}</b>
          <GiftTag mail={mail} />
        </div>
        <span className="text-11 text-fg-3">
          {mail.sender} · {ago(mail.sentAt, now)}
        </span>
      </header>
      {!body ? (
        <div className="flex flex-wrap items-center gap-2.5 text-12 text-fg-3">
          {loading ? (
            <>
              <Icon name="refresh" size={13} className="text-primary animate-spin motion-reduce:animate-none" /> Đang tải nội dung…
            </>
          ) : (
            <>
              Chưa mở thư này.
              <Button small icon="eye" disabled={!canOpen} onClick={onOpen}>
                Mở thư
              </Button>
            </>
          )}
        </div>
      ) : (
        <>
          <p className="m-0 text-12 text-fg-2 leading-[1.5] whitespace-pre-line">{body.body}</p>
          {money.length === 0 && body.items.length === 0 ? (
            <p className={SHOP.note}>(Không có vật phẩm)</p>
          ) : (
            <div className="grid gap-1.5">
              {money.length > 0 && (
                <p className="flex flex-wrap gap-x-3.5 gap-y-1 m-0 text-12 text-fg-2">
                  {money.map((x) => (
                    <span key={x.name} className={cn("inline-flex items-center gap-[5px]", x.cls)}>
                      <Icon name={x.icon} size={13} /> <b className={cn("px text-12", x.cls)}>{num(x.n)}</b> {x.name}
                    </span>
                  ))}
                </p>
              )}
              {body.items.length > 0 && (
                <ul className="grid gap-1 m-0 p-0 list-none @min-[520px]:grid-cols-2" aria-label="Vật phẩm trong thư">
                  {together(body.items).map((i, k) => {
                    const url = itemIcon(i.icon);
                    return (
                      <li key={`${i.id}-${k}`} className="grid grid-cols-[30px_minmax(0,1fr)] items-center gap-2 text-12">
                        <span className="grid place-items-center size-[30px] bg-ink">
                          {url ? <img className="size-6 [image-rendering:pixelated]" src={url} alt="" /> : <Icon name="gem" size={14} />}
                        </span>
                        <span className="min-w-0 truncate text-fg">
                          {i.name}
                          {(i.stacks || i.quantity > 1) && <span className="px text-11 text-fg-2"> ×{num(i.quantity)}</span>}
                          {i.locked && <span className="text-11 text-fg-3"> · khóa</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          {open && (
            <p className={cn("m-0 text-11", short ? "text-danger" : "text-fg-3")}>
              Cần {body.slots} ô trống{free != null && ` · túi còn ${free}`}. Tiền không cần ô; món đã có trong túi cộng vào chồng.
            </p>
          )}
        </>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {mail.gift && (
          <Button kind="primary" small icon="download" disabled={!open || !!why || !!claimWhy} onClick={onClaim}>
            {mail.taken ? "Đã nhận" : "Nhận"}
          </Button>
        )}
        <Button small icon="trash" disabled={open || !!why} onClick={onDelete} title={open ? "Nhận quà trước rồi mới xóa" : undefined}>
          Xóa
        </Button>
        {claimWhy && <span className={SHOP.why}>{claimWhy}</span>}
        {open && <span className="text-11 text-fg-3">Thư còn quà chưa nhận thì không xóa được.</span>}
      </div>
    </section>
  );
}
