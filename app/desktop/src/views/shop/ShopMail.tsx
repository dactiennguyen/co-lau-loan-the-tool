import { useEffect, useId, useMemo, useRef, useState } from "react";
import { api } from "@/api";
import type { Account, Item, MailBody, MailHeader, SentMail } from "@/api/types";
import { Button } from "@/components/Button";
import { FilterChip } from "@/components/FilterChip";
import { ItemSlot } from "@/components/ItemSlot";
import { Stepper } from "@/components/Stepper";
import { FIELD } from "@/components/TextField";
import { useStore } from "@/store";
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

type MailView = "inbox" | "sent" | "send";
/** The three parts of the game's Hòm thư, in its order. */
const VIEWS: { key: MailView; label: string }[] = [
  { key: "inbox", label: "Danh sách thư" },
  { key: "sent", label: "Thư đã gửi" },
  { key: "send", label: "Gửi thư" },
];

/** What the mailbox does now, else the line its last task ended with. */
function Status({ doing, last }: { doing: string | null; last: string | null }) {
  if (doing)
    return (
      <p className="flex items-center gap-1.5 text-12 text-fg-2" role="status">
        <Icon name="refresh" size={13} className="text-primary animate-spin motion-reduce:animate-none" />
        {doing}
      </p>
    );
  return last ? (
    <p className={cn("text-12", tone(last))} role="status">
      {last}
    </p>
  ) : null;
}

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
  const [view, setView] = useState<MailView>("inbox");
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
        Chức năng → Thư của game. Xem, nhận và gửi được từ bất kỳ đâu, không cần về Làng Thanh Khê. Bấm vào thư là mở thư, và thư
        thành đã đọc như trong game.
      </p>
      <div className={SHOP.chips} role="group" aria-label="Phần của hòm thư">
        {VIEWS.map((v) => (
          <FilterChip key={v.key} on={view === v.key} onClick={() => setView(v.key)}>
            {v.label}
          </FilterChip>
        ))}
      </div>
      {view === "sent" && <SentMails account={account} readWhy={readWhy} now={now} />}
      {view === "send" && <SendMail account={account} why={why} busy={busy} ask={ask} />}
      {view !== "inbox" && <Status doing={box.doing} last={box.last} />}
      {view === "inbox" && <>
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
      <Status doing={box.doing} last={box.last} />
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
      </>}
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

/** An item of a mail sent or to send: its picture, name and how many. */
function ItemLine({ item, quantity }: { item: Item; quantity: number }) {
  const url = itemIcon(item.icon);
  return (
    <span className="grid grid-cols-[26px_minmax(0,1fr)] items-center gap-2 text-12">
      <span className="grid place-items-center size-[26px] bg-ink">
        {url ? <img className="size-[22px] [image-rendering:pixelated]" src={url} alt="" /> : <Icon name="gem" size={13} />}
      </span>
      <span className="min-w-0 truncate text-fg">
        {item.name}
        {(item.stacks || quantity > 1) && <span className="px text-11 text-fg-2"> ×{num(quantity)}</span>}
      </span>
    </span>
  );
}

/** Thư đã gửi (c2s/1281): the mails this character sent, whether each was taken, what each held. Asked when shown. */
function SentMails({ account, readWhy, now }: { account: Account; readWhy: string | null; now: number }) {
  const sent = account.character!.mailbox.sent;
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || readWhy || sent != null) return;
    asked.current = true;
    void api.mailSent(account.id);
  }, [account.id, readWhy, sent]);
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-2.5 px-3 py-2 text-12 text-fg-2 bg-bg-2 border-2 border-line">
        <span className="flex-[1_1_220px] min-w-0">
          {sent == null ? (
            "Chưa xem thư đã gửi."
          ) : (
            <>
              <b className="px text-12 text-fg">{sent.length}</b> thư đã gửi
            </>
          )}
        </span>
        <Button small icon="refresh" disabled={!!readWhy} onClick={() => void api.mailSent(account.id)}>
          Làm mới
        </Button>
      </div>
      {sent?.length === 0 && <p className={SHOP.note}>Chưa gửi thư nào.</p>}
      {sent && sent.length > 0 && (
        <ul className="grid gap-1 m-0 p-0 list-none @min-[760px]:grid-cols-2" aria-label="Thư đã gửi">
          {sent.map((m) => (
            <SentRow key={m.id} mail={m} now={now} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SentRow({ mail, now }: { mail: SentMail; now: number }) {
  return (
    <li className="grid gap-1.5 px-3 py-2 bg-bg-2 border-2 border-line">
      <div className="flex items-start gap-2">
        <span className="grid flex-1 min-w-0">
          <b className="truncate text-[12.5px] text-fg">{mail.subject}</b>
          <span className="text-11 text-fg-3">
            Gửi: {mail.to} · {ago(mail.sentAt, now)}
          </span>
        </span>
        {mail.taken ? (
          <span className={cn(TAG, "border-line text-fg-3")}>
            <Icon name="check" size={11} /> Đã nhận
          </span>
        ) : (
          <span className={cn(TAG, "border-coin text-coin")}>Chưa nhận</span>
        )}
      </div>
      {mail.body && <p className="m-0 text-12 text-fg-2 whitespace-pre-line">{mail.body}</p>}
      {mail.items.length > 0 && (
        <div className="grid gap-1">
          {mail.items.map((i, k) => (
            <ItemLine key={`${i.id}-${k}`} item={i} quantity={i.quantity} />
          ))}
        </div>
      )}
    </li>
  );
}

/** The limits of the game's window (com.g.g.squ) and its fee: mail.rs SEND_FEE, TO_MAX, SUBJECT_MAX, BODY_MAX. */
const SEND = { fee: 1000, items: 6, to: 32, subject: 64, body: 512 } as const;

/**
 * Gửi thư (c2s/1280, 18-players-checkin.md#chuyển-đồ-gửi-thư): to a character by its name (the other accounts of the app
 * one click away), a subject, words if wanted, and up to 6 items of the bag, each with how many. Trade-locked items (a
 * padlock in the game: bought for Xu khóa, worn, upgraded) cannot go and are dimmed. 1.000 Xu a mail, asked before.
 */
function SendMail({
  account,
  why,
  busy,
  ask,
}: {
  account: Account;
  why: string | null;
  busy: string | null;
  ask: ShopContext["ask"];
}) {
  const c = account.character!;
  const field = useId();
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  // Picked items by bag slot, with the uuid they had (a slot whose item changed drops out) and how many.
  const [picks, setPicks] = useState<Map<number, { uuid: string; quantity: number }>>(new Map());
  const order = useStore((s) => s.order);
  const byId = useStore((s) => s.byId);
  const others = useMemo(
    () =>
      order
        .map((id) => byId[id]?.character?.name)
        .filter((n): n is string => !!n && n !== c.name)
        .filter((n, i, all) => all.indexOf(n) === i),
    [order, byId, c.name],
  );
  const items = useMemo(() => [...(c.bag?.items ?? [])].sort((a, b) => a.slot - b.slot), [c.bag]);
  const picked = items.flatMap((i) => {
    const p = picks.get(i.slot);
    return p && p.uuid === i.uuid ? [{ item: i, quantity: Math.min(p.quantity, i.quantity) }] : [];
  });
  // A mail gone out: its items leave the form; the name stays for the next one.
  const seen = useRef(c.mailbox.last);
  useEffect(() => {
    const last = c.mailbox.last;
    if (last === seen.current) return;
    seen.current = last;
    if (last?.startsWith("Xong gửi thư")) {
      setPicks(new Map());
      setBody("");
    }
  }, [c.mailbox.last]);

  const xu = c.currencies?.xu ?? null;
  const name = to.trim();
  const formWhy = !name
    ? "Nhập tên nhân vật nhận."
    : name === c.name
      ? "Không gửi thư cho chính mình."
      : !subject.trim()
        ? "Nhập chủ đề."
        : xu != null && xu < SEND.fee
          ? `Cần ${num(SEND.fee)} Xu phí gửi, còn ${num(xu)}.`
          : null;
  const sendWhy = why ?? formWhy;
  const toggle = (i: Item) => {
    if (i.locked) return;
    setPicks((m) => {
      const next = new Map(m);
      if (next.get(i.slot)?.uuid === i.uuid) next.delete(i.slot);
      else if (picked.length < SEND.items) next.set(i.slot, { uuid: i.uuid, quantity: i.quantity });
      return next;
    });
  };
  const setQuantity = (i: Item, quantity: number) => setPicks((m) => new Map(m).set(i.slot, { uuid: i.uuid, quantity }));
  const send = () =>
    ask({
      title: "Gửi thư",
      message: (
        <>
          Gửi thư cho <b>{name}</b> kèm {picked.length} món, phí {num(SEND.fee)} Xu?
          {picked.length > 0 && (
            <span className="grid gap-1 mt-2">
              {picked.map((p) => (
                <ItemLine key={p.item.slot} item={p.item} quantity={p.quantity} />
              ))}
            </span>
          )}
          <span className="block mt-2 text-11 text-fg-3">
            Tên phải đúng tên nhân vật trong game. Thư đã gửi không lấy lại được.
          </span>
        </>
      ),
      confirm: "Gửi thư",
      icon: "mail",
      run: () =>
        api.mailSend(account.id, {
          to: name,
          subject: subject.trim(),
          body,
          items: picked.map((p) => ({
            slot: p.item.slot,
            quantity: p.quantity,
          })),
        }),
    });

  return (
    <div className="grid gap-2.5 items-start @min-[760px]:grid-cols-[minmax(260px,400px)_minmax(0,1fr)]">
      <div className="grid gap-2.5">
        <div className={FIELD.root}>
          <label htmlFor={`${field}-to`} className={FIELD.label}>
            Tên người nhận
          </label>
          <input
            id={`${field}-to`}
            className={FIELD.input}
            spellCheck={false}
            autoComplete="off"
            maxLength={SEND.to}
            placeholder="Tên nhân vật"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
          {others.length > 0 && (
            <div className={SHOP.chips} role="group" aria-label="Nhân vật của các nick khác">
              {others.map((n) => (
                <FilterChip key={n} on={name === n} onClick={() => setTo(n)}>
                  {n}
                </FilterChip>
              ))}
            </div>
          )}
        </div>
        <div className={FIELD.root}>
          <label htmlFor={`${field}-subject`} className={FIELD.label}>
            Chủ đề
          </label>
          <input
            id={`${field}-subject`}
            className={FIELD.input}
            spellCheck={false}
            autoComplete="off"
            maxLength={SEND.subject}
            placeholder="Chủ đề thư"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>
        <div className={FIELD.root}>
          <label htmlFor={`${field}-body`} className={FIELD.label}>
            Nội dung
          </label>
          <textarea
            id={`${field}-body`}
            rows={3}
            maxLength={SEND.body}
            spellCheck={false}
            placeholder="Lời nhắn (không bắt buộc)"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className={cn(FIELD.input, "h-auto min-h-[70px] py-2 leading-[1.45] resize-y")}
          />
        </div>
        <section className="grid gap-1.5" aria-label="Vật phẩm đính kèm">
          <span className={FIELD.label}>
            Đính kèm {picked.length}/{SEND.items}
          </span>
          {picked.length === 0 ? (
            <p className={SHOP.note}>Bấm vào món trong túi bên cạnh để đính kèm (tối đa {SEND.items} món).</p>
          ) : (
            <ul className="grid gap-1 m-0 p-0 list-none">
              {picked.map(({ item, quantity }) => (
                <li
                  key={item.slot}
                  className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 px-2 py-1 bg-bg-2 border-2 border-line"
                >
                  <ItemLine item={item} quantity={quantity} />
                  {item.quantity > 1 ? (
                    <Stepper
                      value={quantity}
                      min={1}
                      max={item.quantity}
                      onChange={(v) => setQuantity(item, v)}
                      label={`Số ${item.name}`}
                    />
                  ) : (
                    <span />
                  )}
                  <Button small icon="close" onClick={() => toggle(item)} title={`Bỏ ${item.name}`}>
                    Bỏ
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <div className="flex flex-wrap items-center gap-2.5 text-12">
          <span className="flex-[1_1_160px] min-w-0 text-fg-2">
            Phí gửi thư: <b className={cn(SHOP.costFig, xu != null && xu < SEND.fee && SHOP.costShort)}>{num(SEND.fee)}</b> Xu
            {xu != null && <span className="text-fg-3"> · đang có {num(xu)}</span>}
          </span>
          <Button kind="primary" icon="mail" disabled={!!sendWhy} onClick={send}>
            Gửi thư
          </Button>
        </div>
        {/* The modal says `busy` already, above the tabs. */}
        {sendWhy && sendWhy !== busy && <p className={SHOP.why}>{sendWhy}</p>}
      </div>
      <section className="grid gap-1.5" aria-label="Túi đồ">
        <span className={FIELD.label}>Túi đồ · món có khóa không gửi được</span>
        {items.length === 0 ? (
          <p className={SHOP.note}>{c.bag ? "Túi trống." : "Chưa đọc được túi đồ."}</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {items.map((i) => (
              <ItemSlot
                key={i.slot}
                item={i}
                label={i.name}
                selected={picks.get(i.slot)?.uuid === i.uuid}
                locked={i.locked ? "Đã khóa giao dịch: không gửi được" : null}
                onShow={() => {}}
                onPick={() => toggle(i)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
