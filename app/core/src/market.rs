//! Chợ trời of Ngọc Nga (NPC 104 of M1; docs/app/events/14-npc.md#ngọc-nga) ← src/protocol/market.ts. The window of the
//! phone's toolbar button: c2s/116 → s2c/116 the tabs, c2s/1192 → s2c/1192 a page of a tab or Đang bán, from anywhere once
//! in the world (CT1, NP1). Mua is c2s/115 (uuid), Đăng bán c2s/112 kind 1 (bag slot, quantity, price), Gia hạn c2s/112
//! kind 2 (uuid), Thu hồi c2s/113 (uuid of the listing).
use crate::protocol::{err, Reader, Result};
use serde::Serialize;

/// The kinds of s2c/1192: the rules (Bán vật phẩm), a page of a tab, a page of Đang bán.
pub const MARKET_HELP: u8 = 0;
pub const MARKET_LIST: u8 = 1;
pub const MARKET_MINE: u8 = 2;
/// The tab of c2s/1192 that is Đang bán: the character's own listings.
pub const MARKET_MINE_TAB: i32 = -1;
/// The lowest price as far as known: one of the two 1000 of s2c/116 is likely it, and no listing was cheaper (CT1).
pub const MIN_PRICE: i64 = 1000;
/// The cut the market takes when a listing sells, in percent (the rules of Bán vật phẩm, the mail of NP1).
pub const CUT_PERCENT: i64 = 5;

/// The quality of gear in a listing as the item popup of the phone names it (items::quality_name): 1 Hiếm, 2 Quý, 3 Sử
/// Thi; None for 0, what is not gear.
pub fn quality_name(quality: i32) -> Option<&'static str> {
    u8::try_from(quality)
        .ok()
        .filter(|&q| q > 0)
        .and_then(crate::items::quality_name)
}

/// A stat of a listing, with the second value every listing seen had equal to the first.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct MarketStat {
    pub stat: i32,
    pub value: i32,
    pub value2: i32,
}

/// One item on sale ← marketListing: the fields of the bag's item record in another order. Durability -1 for items
/// without one; quality 1–3 for gear, 0 for the rest; `expires_at` in ms since 1970; `currency` 0 is Xu.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketListing {
    pub item_id: i32,
    pub item_id2: i32,
    pub uuid: String,
    pub seller: String,
    pub durability: i32,
    pub field0: i32,
    pub quality: i32,
    pub expires_at: i64,
    pub currency: u8,
    pub price: i32,
    pub field2: i32,
    pub quantity: i32,
    pub field1: u8,
    pub stats: Vec<MarketStat>,
}
fn listing(r: &mut Reader) -> Result<MarketListing> {
    let (item_id, item_id2, uuid, seller) = (r.i32()?, r.i32()?, r.string()?, r.string()?);
    let (durability, field0, quality, expires_at) = (r.i32()?, r.i32()?, r.i32()?, r.i64()?);
    let (currency, price, field2, quantity, field1) =
        (r.u8()?, r.i32()?, r.i32()?, r.i32()?, r.u8()?);
    let n = r.i32()?.max(0);
    let stats = (0..n)
        .map(|_| {
            Ok(MarketStat {
                stat: r.i32()?,
                value: r.i32()?,
                value2: r.i32()?,
            })
        })
        .collect::<Result<Vec<_>>>()?;
    Ok(MarketListing {
        item_id,
        item_id2,
        uuid,
        seller,
        durability,
        field0,
        quality,
        expires_at,
        currency,
        price,
        field2,
        quantity,
        field1,
        stats,
    })
}

/// A page of s2c/1192: of tab `tab` of `tabs` named `tab_name` (kind 1), or of Đang bán (kind 2: tab MARKET_MINE_TAB, no
/// name, `tabs` 0). Pages from 1; newest listing first.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketPage {
    pub tabs: u8,
    pub tab: i32,
    pub tab_name: String,
    pub pages: i32,
    pub page: i32,
    pub listings: Vec<MarketListing>,
}
impl MarketPage {
    pub fn mine(&self) -> bool {
        self.tab == MARKET_MINE_TAB
    }
}

/// s2c/1192 ← market: the rules (kind 0), a page of a tab (kind 1), a page of Đang bán (kind 2).
#[derive(Debug, Clone, PartialEq)]
pub enum Market {
    Help(String),
    Page(MarketPage),
}
pub fn market(p: &[u8]) -> Result<Market> {
    let mut r = Reader::new(p);
    let kind = r.u8()?;
    let m = match kind {
        MARKET_HELP => Market::Help(r.string()?),
        MARKET_LIST | MARKET_MINE => {
            let (tabs, tab, tab_name) = match kind {
                MARKET_LIST => (r.u8()?, r.u8()? as i32, r.string()?),
                _ => (0, MARKET_MINE_TAB, String::new()),
            };
            let (pages, page) = (r.i32()?, r.i32()?);
            let n = r.i32()?.max(0);
            let listings = (0..n)
                .map(|_| listing(&mut r))
                .collect::<Result<Vec<_>>>()?;
            Market::Page(MarketPage {
                tabs,
                tab,
                tab_name,
                pages,
                page,
                listings,
            })
        }
        _ => {
            return err(
                "PAYLOAD_SCHEMA",
                format!("s2c/1192: kind {kind} not seen yet"),
            )
        }
    };
    r.finish(m, "s2c/1192")
}

/// A tab of s2c/116 and how many listings it has.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct MarketTab {
    pub tab: i32,
    pub name: String,
    pub listings: i32,
}
/// s2c/116 ← marketTabs, the answer to c2s/116 (empty) that the window sends when it opens: the tabs, the rules, the fee
/// to list (1000 Xu), `a` (1000), the hours on sale (24), `b` (1000) and the highest price (100.000.000).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarketTabs {
    pub tabs: Vec<MarketTab>,
    pub rules: String,
    pub fee: i32,
    pub a: i32,
    pub hours: i32,
    pub b: i32,
    pub max_price: i32,
}
pub fn market_tabs(p: &[u8]) -> Result<MarketTabs> {
    let mut r = Reader::new(p);
    let n = r.i32()?.max(0);
    let tabs = (0..n)
        .map(|_| {
            Ok(MarketTab {
                tab: r.i32()?,
                name: r.string()?,
                listings: r.i32()?,
            })
        })
        .collect::<Result<Vec<_>>>()?;
    let rules = r.string()?;
    let (fee, a, hours, b, max_price) = (r.i32()?, r.i32()?, r.i32()?, r.i32()?, r.i32()?);
    r.finish(
        MarketTabs {
            tabs,
            rules,
            fee,
            a,
            hours,
            b,
            max_price,
        },
        "s2c/116",
    )
}

/// s2c/112 after a listing went up ← marketListed: `a` (1), the bag slot and the quantity that left the bag. No bag packet
/// comes with it: the client takes the item out itself.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct MarketListed {
    pub a: i32,
    pub slot: i32,
    pub quantity: i32,
}
pub fn market_listed(p: &[u8]) -> Result<MarketListed> {
    let mut r = Reader::new(p);
    let l = MarketListed {
        a: r.i32()?,
        slot: r.i32()?,
        quantity: r.i32()?,
    };
    r.finish(l, "s2c/112")
}

/// s2c/113 (Thu hồi) and s2c/115 (Mua) ← marketDone: the uuid of the request, back when it went through.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MarketDone {
    pub uuid: String,
}
pub fn market_done(p: &[u8], opcode: i32) -> Result<MarketDone> {
    let mut r = Reader::new(p);
    let uuid = r.string()?;
    r.finish(MarketDone { uuid }, &format!("s2c/{opcode}"))
}
