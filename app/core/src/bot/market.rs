//! Chợ trời (14-npc.md#ngọc-nga) ← MarketBot of src/bot/market.ts, as the window of the phone's toolbar button opens it,
//! from anywhere once in the world (CT1, NP1): c2s/116 for the tabs, c2s/1192 for a page (read only); c2s/115 Mua,
//! c2s/112 Đăng bán (kind 1) and Gia hạn (kind 2), c2s/113 Thu hồi.
use super::*;
use crate::market::{self as m, MarketDone, MarketListed, MarketListing, MARKET_MINE_TAB};

/// How long a step waits for the server (its answers took about 60 ms in CT1).
const MARKET_WAIT: Duration = Duration::from_secs(8);
/// The most pages Gợi ý giá reads (CT1: 33 pages for the 9 tabs, 592 listings).
const PRICE_PAGES: u32 = 40;

/// What the market waits for.
#[derive(Debug, Clone)]
enum MarketStep {
    /// s2c/116, then the page `then` (tab, page) if any.
    Tabs { then: Option<(i32, i32)> },
    /// s2c/1192 of a tab or of Đang bán.
    Page,
    /// s2c/115 with the uuid: bought (s2c/46 before it, s2c/1187 after). A notice instead is a refusal.
    Buy {
        uuid: String,
        name: String,
        price: i32,
    },
    /// s2c/112: listed (s2c/46 the fee before it, "Rao bán vật phẩm thành công" after).
    Sell { name: String, price: i64 },
    /// s2c/1192 kind 1 of page `page` of `tab` for Gợi ý giá of `item_id`; the tabs after it in `rest`. The page is not
    /// kept as the page shown.
    Prices {
        item_id: i32,
        tab: i32,
        page: i32,
        rest: Vec<i32>,
    },
    /// s2c/113 with the uuid: back in the bag (s2c/1187 before it, "Đã nhận lại vật phẩm …" after).
    Withdraw { uuid: String, name: String },
    /// s2c/1192 kind 2 with the listing 24 h later than `before` (s2c/46 the fee before it, "Gia hạn vật phẩm thành
    /// công" after).
    Extend {
        uuid: String,
        name: String,
        before: i64,
    },
}

/// The task under way: its step, until when it waits, and what it is in words ("mua Thú cưng Slime").
pub(super) struct MarketWait {
    step: MarketStep,
    pub(super) until: Instant,
    task: String,
}

/// "Thú cưng Slime", "Đá cấp 2 ×99".
fn listing_name(l: &MarketListing) -> String {
    Picked::of(l.item_id, l.quantity as i64).label()
}

impl Bot {
    /// A task of the Chợ trời tab. Refused, with the reason in the log ("Chưa …: …") and nothing sent, in a battle and
    /// while another task of the market waits; Mua, Đăng bán, Thu hồi and Gia hạn also while the character is busy
    /// (busy()) or something else waits for its own s2c/1256, which their refusals are. Then by what the market and the
    /// bag say: Mua of a listing not on the page last read or at another price, without the Xu or a free bag slot; Đăng
    /// bán of an empty or locked slot, a price out of range, without the fee; Thu hồi and Gia hạn of a listing not in
    /// Đang bán, Gia hạn without the fee.
    pub fn market(&mut self, task: MarketTask, now: Instant, out: &mut Vec<Out>) {
        let what = match task {
            MarketTask::Open { .. } => "Chưa mở Chợ trời",
            MarketTask::Page { .. } => "Chưa xem trang chợ",
            MarketTask::Buy { .. } => "Chưa mua",
            MarketTask::Sell { .. } => "Chưa đăng bán",
            MarketTask::Prices { .. } => "Chưa xem giá trên chợ",
            MarketTask::Withdraw(_) => "Chưa thu hồi",
            MarketTask::Extend(_) => "Chưa gia hạn",
        };
        let change = !matches!(
            task,
            MarketTask::Open { .. } | MarketTask::Page { .. } | MarketTask::Prices { .. }
        );
        let planned = match self.market_refusal(change, now) {
            Some(why) => Err(why),
            None => self.market_plan(task),
        };
        match planned {
            Ok((step, ctx, words, about)) => {
                // Gợi ý giá starts again from nothing, for this item.
                if let MarketStep::Prices { item_id, .. } = step {
                    self.snap.market.prices = Some(MarketPrices {
                        item_id,
                        name: Picked::of(item_id, 1).name,
                        ..MarketPrices::default()
                    });
                }
                self.market_go(step, ctx, words, about, now, out)
            }
            Err(why) => self.market_said(format!("{what}: {why}"), out),
        }
    }

    /// Mua, Đăng bán, Thu hồi or Gia hạn waits for the server: the character counts as busy (busy()).
    pub(super) fn market_changing(&self) -> bool {
        self.market.as_ref().is_some_and(|w| {
            !matches!(
                w.step,
                MarketStep::Tabs { .. } | MarketStep::Page | MarketStep::Prices { .. }
            )
        })
    }

    fn market_refusal(&self, change: bool, now: Instant) -> Option<String> {
        if self.battle.is_some() {
            return Some("đang đánh, đợi hết trận".into());
        }
        if self.market.is_some() {
            return Some("chợ đang đợi server trả lời việc trước".into());
        }
        if !change {
            return None;
        }
        if let Some(why) = self.busy() {
            return Some(why.into());
        }
        self.notice_awaited(now)
            .then(|| "đang đợi server trả lời việc khác, thử lại sau ít giây".into())
    }

    /// Xu as the last s2c/46 says, or why it is not known.
    fn market_xu(&self) -> Result<i64, String> {
        self.snap
            .currencies
            .as_ref()
            .map(|c| c.xu)
            .ok_or_else(|| "chưa biết số Xu".to_string())
    }

    /// The listing `uuid` of Đang bán as last read.
    fn mine_listing(&self, uuid: &str) -> Result<&MarketListing, String> {
        self.snap
            .market
            .mine
            .iter()
            .flat_map(|p| &p.listings)
            .find(|l| l.uuid == uuid)
            .ok_or_else(|| "Đang bán không có món này: đã bán, hết hạn hay đã thu hồi".to_string())
    }

    /// The first step of a task, the fields of its request, what it is in words and the uuid it is about; or why it may
    /// not go by what the market and the bag say.
    #[allow(clippy::type_complexity)]
    fn market_plan(
        &self,
        task: MarketTask,
    ) -> Result<(MarketStep, MarketCtx, String, Option<String>), String> {
        let fee = self.snap.market.tabs.as_ref().map(|t| t.fee as i64);
        Ok(match task {
            MarketTask::Open { tab, page } => (
                MarketStep::Tabs {
                    then: Some((tab, page)),
                },
                MarketCtx::Op(116),
                "mở Chợ trời".into(),
                None,
            ),
            MarketTask::Page { tab, page } => (
                MarketStep::Page,
                MarketCtx::Page(tab, page.max(1)),
                match tab {
                    MARKET_MINE_TAB => "xem Đang bán".into(),
                    _ => format!("xem mục {tab} trang {page}"),
                },
                None,
            ),
            MarketTask::Buy { uuid, price } => {
                let l = self
                    .snap
                    .market
                    .page
                    .iter()
                    .flat_map(|p| &p.listings)
                    .find(|l| l.uuid == uuid)
                    .ok_or(
                        "trang chợ đang xem không có món này: đã bán hay hết hạn, bấm Làm mới",
                    )?;
                let name = listing_name(l);
                if l.price != price {
                    return Err(format!(
                        "{name} giờ giá {} Xu, không phải {} Xu",
                        smith::grouped(l.price as i64),
                        smith::grouped(price as i64)
                    ));
                }
                if l.currency != 0 {
                    return Err(format!("{name} bán bằng loại tiền {} chưa gặp", l.currency));
                }
                let xu = self.market_xu()?;
                if xu < l.price as i64 {
                    return Err(format!(
                        "thiếu Xu: cần {}, có {}",
                        smith::grouped(l.price as i64),
                        smith::grouped(xu)
                    ));
                }
                let free = self
                    .snap
                    .bag
                    .as_ref()
                    .map(|b| b.capacity - b.items.len() as i32)
                    .ok_or("chưa đọc được túi đồ")?;
                if free < 1 {
                    return Err("túi không còn ô trống: server sẽ trả \"Rương đã đầy\"".into());
                }
                let words = format!("mua {name} ({} Xu)", smith::grouped(price as i64));
                let step = MarketStep::Buy {
                    uuid: uuid.clone(),
                    name,
                    price,
                };
                (step, MarketCtx::Uuid(115, uuid.clone()), words, Some(uuid))
            }
            MarketTask::Prices { item_id } => {
                let def = crate::items::book()
                    .get(item_id)
                    .ok_or_else(|| format!("vật phẩm {item_id} không có trong bảng vật phẩm"))?;
                let mut tabs = m::tabs_of(def.kind, def.gender);
                let tab = tabs.remove(0);
                let name = def.name.clone();
                let step = MarketStep::Prices {
                    item_id,
                    tab,
                    page: 1,
                    rest: tabs,
                };
                let words = format!("xem giá {name} trên chợ");
                (step, MarketCtx::Page(tab, 1), words, None)
            }
            MarketTask::Sell {
                slot,
                quantity,
                price,
                uuid,
            } => {
                let tabs = self.snap.market.tabs.as_ref().ok_or("chưa mở Chợ trời")?;
                let item = self
                    .snap
                    .bag
                    .as_ref()
                    .and_then(|b| b.items.iter().find(|i| i.slot == slot))
                    .ok_or_else(|| format!("ô túi {} trống", slot as u32 + 1))?;
                let has = item.quantity.max(1);
                let name = Picked::of(item.item_id, 1).name;
                if uuid.as_ref().is_some_and(|u| *u != item.uuid) {
                    return Err(format!(
                        "ô túi {} giờ là {name}, không phải món đã chọn",
                        slot as u32 + 1
                    ));
                }
                if item.field1 == 0 {
                    return Err(format!("{name} đã khoá, không rao bán được"));
                }
                if !(1..=has).contains(&quantity) {
                    return Err(format!(
                        "số lượng phải từ 1 tới {} (ô túi có {})",
                        smith::grouped(has as i64),
                        smith::grouped(has as i64)
                    ));
                }
                let name = Picked::of(item.item_id, quantity as i64).label();
                let max = tabs.max_price as i64;
                if !(m::MIN_PRICE..=max).contains(&price) {
                    return Err(format!(
                        "giá phải từ {} tới {} Xu",
                        smith::grouped(m::MIN_PRICE),
                        smith::grouped(max)
                    ));
                }
                let (fee, xu) = (tabs.fee as i64, self.market_xu()?);
                if xu < fee {
                    return Err(format!(
                        "thiếu Xu cho phí đăng bán: cần {}, có {}",
                        smith::grouped(fee),
                        smith::grouped(xu)
                    ));
                }
                let words = format!("đăng bán {name} giá {} Xu", smith::grouped(price));
                let uuid = item.uuid.clone();
                let step = MarketStep::Sell { name, price };
                (
                    step,
                    MarketCtx::Sell(slot, quantity, price),
                    words,
                    Some(uuid),
                )
            }
            MarketTask::Withdraw(uuid) => {
                let name = listing_name(self.mine_listing(&uuid)?);
                let words = format!("thu hồi {name}");
                let step = MarketStep::Withdraw {
                    uuid: uuid.clone(),
                    name,
                };
                (step, MarketCtx::Uuid(113, uuid.clone()), words, Some(uuid))
            }
            MarketTask::Extend(uuid) => {
                let l = self.mine_listing(&uuid)?;
                let (name, before) = (listing_name(l), l.expires_at);
                let fee = fee.ok_or("chưa mở Chợ trời")?;
                let xu = self.market_xu()?;
                if xu < fee {
                    return Err(format!(
                        "thiếu Xu cho phí gia hạn: cần {}, có {}",
                        smith::grouped(fee),
                        smith::grouped(xu)
                    ));
                }
                let words = format!("gia hạn {name}");
                let step = MarketStep::Extend {
                    uuid: uuid.clone(),
                    name,
                    before,
                };
                (step, MarketCtx::Uuid(112, uuid.clone()), words, Some(uuid))
            }
        })
    }

    /// Sends the request of a step and waits MARKET_WAIT for its answer.
    fn market_go(
        &mut self,
        step: MarketStep,
        ctx: MarketCtx,
        task: String,
        about: Option<String>,
        now: Instant,
        out: &mut Vec<Out>,
    ) {
        let s = &mut self.snap.market;
        (s.doing, s.busy_with) = (Some(format!("Đang {task}…")), about);
        self.market = Some(MarketWait {
            step,
            until: now + MARKET_WAIT,
            task,
        });
        let (op, c) = match &ctx {
            MarketCtx::Op(op) => (*op, Ctx::default()),
            MarketCtx::Page(tab, page) => (
                1192,
                Ctx {
                    tab: Some(*tab),
                    page: Some(*page),
                    ..Ctx::default()
                },
            ),
            MarketCtx::Uuid(op, uuid) => (
                *op,
                Ctx {
                    uuid: Some(uuid.as_str()),
                    ..Ctx::default()
                },
            ),
            MarketCtx::Sell(slot, quantity, price) => (
                112,
                Ctx {
                    slot: Some(*slot as i32),
                    quantity: Some(*quantity),
                    price: Some(*price),
                    ..Ctx::default()
                },
            ),
        };
        Self::send(out, op, c);
    }

    /// The task ends, with `line` in the log and on the tab (`last`); without one it ends quietly (a page read).
    fn market_end(&mut self, line: Option<String>, out: &mut Vec<Out>) {
        self.market = None;
        let s = &mut self.snap.market;
        (s.doing, s.busy_with) = (None, None);
        if let Some(line) = line {
            self.market_said(line, out);
        }
    }

    fn market_said(&mut self, line: String, out: &mut Vec<Out>) {
        self.snap.market.last = Some(line.clone());
        out.push(Out::Log(LogKind::Item, line));
    }

    /// s2c/116: the tabs; the page asked with them goes next.
    pub(super) fn market_tabs(&mut self, tabs: m::MarketTabs, now: Instant, out: &mut Vec<Out>) {
        self.snap.market.tabs = Some(tabs);
        let Some(MarketStep::Tabs { then }) = self.market.as_ref().map(|w| &w.step) else {
            return;
        };
        match *then {
            Some((tab, page)) => {
                let task = match tab {
                    MARKET_MINE_TAB => "xem Đang bán".into(),
                    _ => format!("xem mục {tab} trang {page}"),
                };
                self.market_go(
                    MarketStep::Page,
                    MarketCtx::Page(tab, page.max(1)),
                    task,
                    None,
                    now,
                    out,
                );
            }
            None => self.market_end(None, out),
        }
    }

    /// s2c/1192: a page of a tab or of Đang bán (also the answer to Gia hạn), or the rules. A page Gợi ý giá asked goes
    /// to it instead of the page shown.
    pub(super) fn market_page(&mut self, market: m::Market, now: Instant, out: &mut Vec<Out>) {
        let m::Market::Page(page) = market else {
            return;
        };
        if let Some(MarketStep::Prices { .. }) = self.market.as_ref().map(|w| &w.step) {
            if !page.mine() {
                return self.market_prices_page(page, now, out);
            }
        }
        let mine = page.mine();
        match mine {
            true => self.snap.market.mine = Some(page),
            false => self.snap.market.page = Some(page),
        }
        let Some(step) = self.market.as_ref().map(|w| w.step.clone()) else {
            return;
        };
        match step {
            MarketStep::Page => self.market_end(None, out),
            MarketStep::Extend { uuid, name, before } if mine => {
                let after = self
                    .snap
                    .market
                    .mine
                    .iter()
                    .flat_map(|p| &p.listings)
                    .find(|l| l.uuid == uuid)
                    .map(|l| l.expires_at);
                let line = match after {
                    Some(after) => format!(
                        "Xong gia hạn {name}: thêm {} giờ, còn {}",
                        (after - before) / 3_600_000,
                        duration_text(Duration::from_millis(
                            (after - epoch_ms() as i64).max(0) as u64
                        ))
                    ),
                    None => format!("Xong gia hạn {name}"),
                };
                self.market_end(Some(line), out);
            }
            _ => {}
        }
    }

    /// A page for Gợi ý giá: the listings of the item by others go into MarketState::prices; then the next page of the
    /// tab, the first of the next tab, or the end, with the prices in the log.
    fn market_prices_page(&mut self, page: m::MarketPage, now: Instant, out: &mut Vec<Out>) {
        let Some(MarketStep::Prices {
            item_id,
            tab,
            page: at,
            mut rest,
        }) = self.market.as_ref().map(|w| w.step.clone())
        else {
            return;
        };
        let me = self.snap.name.clone();
        let p = self.snap.market.prices.get_or_insert_with(Default::default);
        p.pages += 1;
        for l in page
            .listings
            .iter()
            .filter(|l| l.item_id == item_id && l.currency == 0 && l.quantity > 0 && l.seller != me)
        {
            let seen = PriceSeen {
                unit: l.price as i64 / l.quantity as i64,
                price: l.price,
                quantity: l.quantity,
                seller: l.seller.clone(),
            };
            p.listings += 1;
            p.quantity += l.quantity as i64;
            if p.cheapest.as_ref().is_none_or(|c| seen.unit < c.unit) {
                p.cheapest = Some(seen.clone());
            }
            if p.dearest.as_ref().is_none_or(|c| seen.unit > c.unit) {
                p.dearest = Some(seen);
            }
        }
        let (pages_read, name) = (p.pages, p.name.clone());
        let next = if page.page < page.pages && page.tab == tab {
            Some((tab, at + 1))
        } else if !rest.is_empty() {
            Some((rest.remove(0), 1))
        } else {
            None
        };
        match next.filter(|_| pages_read < PRICE_PAGES) {
            Some((tab, page)) => {
                let task = format!("xem giá {name} trên chợ (trang {})", pages_read + 1);
                self.market = None;
                self.market_go(
                    MarketStep::Prices {
                        item_id,
                        tab,
                        page,
                        rest,
                    },
                    MarketCtx::Page(tab, page),
                    task,
                    None,
                    now,
                    out,
                );
            }
            None => {
                let p = self.snap.market.prices.get_or_insert_with(Default::default);
                p.done = next.is_none();
                p.at_ms = epoch_ms();
                let seen = |s: &PriceSeen| {
                    format!(
                        "{} Xu/cái ({}, {} Xu cho {})",
                        smith::grouped(s.unit),
                        s.seller,
                        smith::grouped(s.price as i64),
                        smith::grouped(s.quantity as i64)
                    )
                };
                let line = match (&p.cheapest, &p.dearest) {
                    (Some(lo), Some(hi)) => format!(
                        "Giá {name} trên chợ: {} tin, {} cái; rẻ nhất {}, đắt nhất {}",
                        p.listings,
                        smith::grouped(p.quantity),
                        seen(lo),
                        seen(hi)
                    ),
                    _ => format!("Giá {name} trên chợ: không ai đang bán"),
                };
                let line = match p.done {
                    true => line,
                    false => format!("{line} (mới đọc {pages_read} trang đầu)"),
                };
                self.market_end(Some(line), out);
            }
        }
    }

    /// s2c/115: Mua went through; the listing leaves the page. The bag comes next (s2c/1187).
    pub(super) fn market_bought(&mut self, d: MarketDone, out: &mut Vec<Out>) {
        let Some(MarketStep::Buy { uuid, name, price }) =
            self.market.as_ref().map(|w| w.step.clone())
        else {
            return;
        };
        if uuid != d.uuid {
            return;
        }
        if let Some(p) = self.snap.market.page.as_mut() {
            p.listings.retain(|l| l.uuid != uuid);
        }
        let line = format!("Xong mua {name} ({} Xu)", smith::grouped(price as i64));
        self.market_end(Some(line), out);
    }

    /// s2c/112: the listing went up. No bag packet comes with it, so the item leaves the bag here, as the client does; then
    /// Đang bán is read again to show it.
    pub(super) fn market_listed(&mut self, l: MarketListed, now: Instant, out: &mut Vec<Out>) {
        if let Some(b) = self.snap.bag.as_mut() {
            if let Some(i) = b.items.iter_mut().find(|i| i.slot as i32 == l.slot) {
                i.quantity -= l.quantity;
            }
            b.items
                .retain(|i| i.slot as i32 != l.slot || i.quantity > 0);
        }
        let Some(MarketStep::Sell { name, price }) = self.market.as_ref().map(|w| w.step.clone())
        else {
            return;
        };
        let tabs = self.snap.market.tabs.as_ref();
        let (fee, hours) = tabs.map_or((0, 0), |t| (t.fee as i64, t.hours));
        let cut = price * m::CUT_PERCENT / 100;
        let line = format!(
            "Xong đăng bán {name} giá {} Xu: phí {} Xu, bán trong {hours} giờ; bán được thì {} Xu về hòm thư (trừ {}% phí chợ)",
            smith::grouped(price),
            smith::grouped(fee),
            smith::grouped(price - cut),
            m::CUT_PERCENT
        );
        self.market_end(Some(line), out);
        self.market_go(
            MarketStep::Page,
            MarketCtx::Page(MARKET_MINE_TAB, 1),
            "xem Đang bán".into(),
            None,
            now,
            out,
        );
    }

    /// s2c/113: Thu hồi went through; the listing leaves Đang bán, the item is in the bag (s2c/1187 came before).
    pub(super) fn market_withdrawn(&mut self, d: MarketDone, out: &mut Vec<Out>) {
        let Some(MarketStep::Withdraw { uuid, name }) =
            self.market.as_ref().map(|w| w.step.clone())
        else {
            return;
        };
        if uuid != d.uuid {
            return;
        }
        if let Some(p) = self.snap.market.mine.as_mut() {
            p.listings.retain(|l| l.uuid != uuid);
        }
        self.market_end(Some(format!("Xong thu hồi {name} về túi")), out);
    }

    /// s2c/1256 while Mua, Đăng bán, Thu hồi or Gia hạn waits: their answers come before any notice, so a notice now is
    /// the server's refusal ("Rương đã đầy…", "Không đủ Xu…").
    pub(super) fn market_notice(&mut self, text: &str, out: &mut Vec<Out>) {
        if !self.market_changing() {
            return;
        }
        let Some(step) = self.market.as_ref().map(|w| w.step.clone()) else {
            return;
        };
        let line = match step {
            MarketStep::Buy { name, .. } => {
                format!("Chưa mua được {name}: server từ chối ({text})")
            }
            MarketStep::Sell { name, .. } => {
                format!("Chưa đăng bán được {name}: server từ chối ({text})")
            }
            MarketStep::Withdraw { name, .. } => {
                format!("Chưa thu hồi được {name}: server từ chối ({text})")
            }
            MarketStep::Extend { name, .. } => {
                format!("Chưa gia hạn được {name}: server từ chối ({text})")
            }
            MarketStep::Tabs { .. } | MarketStep::Page | MarketStep::Prices { .. } => return,
        };
        self.market_end(Some(line), out);
    }

    /// The task waited MARKET_WAIT without its answer.
    pub(super) fn market_timer(&mut self, now: Instant, out: &mut Vec<Out>) {
        let Some(task) = self
            .market
            .as_ref()
            .filter(|w| w.until <= now)
            .map(|w| w.task.clone())
        else {
            return;
        };
        // Gợi ý giá cut short keeps what it read, with the time.
        if let Some(p) = self.snap.market.prices.as_mut().filter(|p| p.at_ms == 0) {
            p.at_ms = epoch_ms();
        }
        let line = format!(
            "Chợ trời không trả lời sau {} s: thôi {task}",
            MARKET_WAIT.as_secs()
        );
        self.market_end(Some(line), out);
    }
}

/// The request of a step: an empty one, a page (tab, page), one with a uuid (opcode, uuid), Đăng bán (bag slot,
/// quantity, price).
enum MarketCtx {
    Op(i32),
    Page(i32, i32),
    Uuid(i32, String),
    Sell(u8, i32, i64),
}
