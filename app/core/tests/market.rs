//! Chợ trời (14-npc.md#ngọc-nga) against src/protocol/market.ts (`npm run export:rust`, vectors.json "market"): what the
//! TS decoders read in the packets of CT1 and in Đang bán around Gia hạn of NP1, the bytes of c2s/1192, c2s/115, c2s/112
//! (kind 1 and 2) and c2s/113 as on the wire, and Bot::market driven by those packets.
use cllt_core::atlas::Atlas;
use cllt_core::bot::{Bot, BotOptions, ItemAct, MailTask, MarketTask, Out, Picked};
use cllt_core::market::{self, Market, MarketListing, MarketPage};
use cllt_core::protocol::Writer;
use cllt_core::requests::{build, Ctx};
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::{Duration, Instant};

mod common;
use common::{hex, tohex, v};

/// The captured packet under that key of test/fixtures-ct1.ts ("s2c/116 chín mục") or, for Đang bán around Gia hạn,
/// test/fixtures-np1.ts.
fn ct1(key: &str) -> Vec<u8> {
    let all = v();
    let case = all["market"]["decoders"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["key"] == key)
        .unwrap_or_else(|| panic!("no CT1 packet {key}"))
        .clone();
    hex(case["hex"].as_str().unwrap())
}
/// The uuid of request `op` of the vectors (c2s/115 Mua, c2s/113 Thu hồi of CT1).
fn request_uuid(op: i64) -> String {
    let all = v();
    all["market"]["requests"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["op"] == op)
        .unwrap()["uuid"]
        .as_str()
        .unwrap()
        .to_string()
}
fn lines(out: &[Out]) -> Vec<&str> {
    out.iter()
        .filter_map(|o| match o {
            Out::Log(_, t) => Some(t.as_str()),
            _ => None,
        })
        .collect()
}
fn sent(out: &[Out]) -> Vec<(i32, String)> {
    out.iter()
        .filter_map(|o| match o {
            Out::Send(op, p) => Some((*op, tohex(p))),
            _ => None,
        })
        .collect()
}
fn page_request(tab: i32, page: i32) -> String {
    tohex(&Writer::new().u8(0).i32(tab).i32(page).build())
}
fn uuid_request(uuid: &str) -> String {
    tohex(&Writer::new().string(uuid).build())
}
/// s2c/1187 with `capacity` slots and these (item id, quantity, field1), one per slot from 0.
fn bag(capacity: i32, items: &[(i32, i32, u8)]) -> Vec<u8> {
    let mut w = Writer::new().u8(1).i32(capacity).i32(items.len() as i32);
    for (slot, &(item, quantity, field1)) in items.iter().enumerate() {
        w = w
            .u8(slot as u8)
            .i32(item)
            .string(&format!("u{slot}"))
            .i32(0)
            .i32(-1)
            .i32(quantity)
            .u8(field1)
            .u8(0xff)
            .i32(0)
            .u8(0)
            .u8(0)
            .u8(0);
    }
    w.build()
}
fn money(xu: i64) -> Vec<u8> {
    Writer::new()
        .string("update Xu")
        .i64(xu)
        .i64(26_138)
        .i64(10_000)
        .build()
}
fn notice(text: &str) -> Vec<u8> {
    Writer::new().u8(1).string(text).build()
}
/// s2c/1192 kind 2 (Đang bán) with these listings, one page.
fn mine_page(listings: &[MarketListing]) -> Vec<u8> {
    let mut w = Writer::new().u8(2).i32(1).i32(1).i32(listings.len() as i32);
    for l in listings {
        w = w
            .i32(l.item_id)
            .i32(l.item_id2)
            .string(&l.uuid)
            .string(&l.seller)
            .i32(l.durability)
            .i32(l.field0)
            .i32(l.quality)
            .i64(l.expires_at)
            .u8(l.currency)
            .i32(l.price)
            .i32(l.field2)
            .i32(l.quantity)
            .u8(l.field1)
            .i32(l.stats.len() as i32);
        for s in &l.stats {
            w = w.i32(s.stat).i32(s.value).i32(s.value2);
        }
    }
    w.build()
}
/// Slime (item 1059 in CT1: Thú cưng Slime) is item 2 of a bag of 42 with 20 items, the money 5.053.600 Xu.
const SLIME_SLOT: u8 = 2;
fn bot(slime_lock: u8) -> (Bot, Vec<Out>, Instant) {
    let mut b = Bot::new(BotOptions::default(), Arc::new(Atlas::default()));
    let now = Instant::now();
    let mut out = vec![];
    let mut items = vec![(2, 93, 0), (0, 3, 0), (slime_item(), 1, slime_lock)];
    items.extend((0..17).map(|_| (412, 1, 0)));
    b.on_packet(1187, &bag(42, &items), now, &mut out).unwrap();
    b.on_packet(46, &money(5_053_600), now, &mut out).unwrap();
    (b, vec![], now)
}
/// The item id of the Slime CT1 bought: the listing of c2s/115 on Vật Phẩm Khác page 4.
fn slime_item() -> i32 {
    slime().item_id
}
fn slime() -> MarketListing {
    let Market::Page(p) = market::market(&ct1("s2c/1192 Vật Phẩm Khác trang 4")).unwrap()
    else {
        panic!("a page")
    };
    let uuid = request_uuid(115);
    p.listings.into_iter().find(|l| l.uuid == uuid).unwrap()
}
/// The bot with the market open at Vật Phẩm Khác page 4.
fn opened(slime_lock: u8) -> (Bot, Vec<Out>, Instant) {
    let (mut b, mut out, now) = bot(slime_lock);
    b.market(MarketTask::Open { tab: 6, page: 4 }, now, &mut out);
    b.on_packet(116, &ct1("s2c/116 chín mục"), now, &mut out)
        .unwrap();
    b.on_packet(1192, &ct1("s2c/1192 Vật Phẩm Khác trang 4"), now, &mut out)
        .unwrap();
    (b, vec![], now)
}

/// A page as src/protocol/market.ts returns it.
fn ts_page(m: &Market) -> Value {
    match m {
        Market::Help(text) => json!({ "kind": 0, "text": text }),
        Market::Page(p) if p.mine() => {
            json!({ "kind": 2, "pages": p.pages, "page": p.page, "listings": p.listings })
        }
        Market::Page(p) => json!({
            "kind": 1, "tabs": p.tabs, "tab": p.tab, "tabName": p.tab_name, "pages": p.pages, "page": p.page,
            "listings": p.listings,
        }),
    }
}

#[test]
fn the_packets_read_as_the_ts_side_reads_them_and_the_requests_are_as_on_the_wire() {
    let all = v();
    let cases = all["market"]["decoders"].as_array().unwrap();
    assert_eq!(cases.len(), 13); // with the two pages of protocol 0.0.7
    for case in cases {
        let p = hex(case["hex"].as_str().unwrap());
        let key = case["key"].as_str().unwrap();
        let got = match case["fn"].as_str().unwrap() {
            "market" => ts_page(&market::market(&p).unwrap()),
            "marketTabs" => serde_json::to_value(market::market_tabs(&p).unwrap()).unwrap(),
            "marketListed" => serde_json::to_value(market::market_listed(&p).unwrap()).unwrap(),
            "marketDone" => {
                let op = if key.starts_with("s2c/113") { 113 } else { 115 };
                serde_json::to_value(market::market_done(&p, op).unwrap()).unwrap()
            }
            other => panic!("no Rust decoder for {other}"),
        };
        assert_eq!(got, case["expected"], "{key}");
    }
    for r in all["market"]["requests"].as_array().unwrap() {
        let uuid = r["uuid"].as_str();
        let ctx = Ctx {
            tab: r["tab"].as_i64().map(|x| x as i32),
            page: r["page"].as_i64().map(|x| x as i32),
            uuid,
            slot: r["slot"].as_i64().map(|x| x as i32),
            quantity: r["quantity"].as_i64().map(|x| x as i32),
            price: r["price"].as_i64(),
            ..Ctx::default()
        };
        let op = r["op"].as_i64().unwrap() as i32;
        let got = tohex(&build(op, &ctx).unwrap());
        assert_eq!(got, r["hex"], "{r}");
        assert_eq!(got, r["wire"], "{r}");
    }
    assert!(build(116, &Ctx::default()).unwrap().is_empty());
    assert_eq!(market::quality_name(3), Some("Sử Thi"));
}

#[test]
fn the_window_opens_with_the_tabs_then_the_page_asked_for() {
    let (mut b, mut out, now) = bot(1);
    b.market(MarketTask::Open { tab: 6, page: 4 }, now, &mut out);
    assert_eq!(sent(&out), [(116, String::new())]);
    assert_eq!(b.snap.market.doing.as_deref(), Some("Đang mở Chợ trời…"));
    out.clear();
    b.on_packet(116, &ct1("s2c/116 chín mục"), now, &mut out)
        .unwrap();
    assert_eq!(sent(&out), [(1192, page_request(6, 4))]);
    let tabs = b.snap.market.tabs.as_ref().unwrap();
    assert_eq!(
        (tabs.tabs.len(), tabs.fee, tabs.hours, tabs.max_price),
        (9, 1000, 24, 100_000_000)
    );
    out.clear();
    b.on_packet(1192, &ct1("s2c/1192 Vật Phẩm Khác trang 4"), now, &mut out)
        .unwrap();
    assert!(lines(&out).is_empty(), "reading is not logged");
    let p: &MarketPage = b.snap.market.page.as_ref().unwrap();
    assert_eq!(
        (p.tab, p.tab_name.as_str(), p.page),
        (6, "Vật Phẩm Khác", 4)
    );
    assert_eq!((b.snap.market.doing.as_ref(), b.deadline()), (None, None));

    // Đang bán goes to its own place.
    b.market(
        MarketTask::Page {
            tab: market::MARKET_MINE_TAB,
            page: 1,
        },
        now,
        &mut out,
    );
    assert_eq!(sent(&out), [(1192, page_request(-1, 1))]);
    b.on_packet(1192, &ct1("s2c/1192 Đang bán"), now, &mut out)
        .unwrap();
    let mine = b.snap.market.mine.as_ref().unwrap();
    assert!(mine.mine() && mine.listings.is_empty());
    assert_eq!(b.snap.market.page.as_ref().unwrap().page, 4);
}

#[test]
fn mua_checks_the_price_the_xu_and_the_bag_then_sends_the_uuid() {
    let (mut b, mut out, now) = opened(1);
    let s = slime();
    assert_eq!(s.price, 1000);
    // Another price than the one shown: nothing goes.
    b.market(
        MarketTask::Buy {
            uuid: s.uuid.clone(),
            price: 900,
        },
        now,
        &mut out,
    );
    assert_eq!(
        lines(&out),
        ["Chưa mua: Thú cưng Slime giờ giá 1.000 Xu, không phải 900 Xu"]
    );
    assert!(sent(&out).is_empty());
    out.clear();
    b.market(
        MarketTask::Buy {
            uuid: s.uuid.clone(),
            price: 1000,
        },
        now,
        &mut out,
    );
    assert_eq!(sent(&out), [(115, uuid_request(&s.uuid))], "c2s/115 of CT1");
    assert!(b.snapshot().market.changing);
    out.clear();
    b.on_packet(46, &money(5_052_600), now, &mut out).unwrap();
    b.on_packet(115, &ct1("s2c/115 mua được"), now, &mut out)
        .unwrap();
    assert_eq!(lines(&out), ["Xong mua Thú cưng Slime (1.000 Xu)"]);
    let page = b.snap.market.page.as_ref().unwrap();
    assert!(!page.listings.iter().any(|l| l.uuid == s.uuid));
    assert_eq!(b.snap.market.last.as_deref(), lines(&out).first().copied());
    assert_eq!(b.deadline(), None);

    // Gone from the page: not again.
    out.clear();
    b.market(
        MarketTask::Buy {
            uuid: s.uuid.clone(),
            price: 1000,
        },
        now,
        &mut out,
    );
    assert!(lines(&out)[0].starts_with("Chưa mua: trang chợ đang xem không có món này"));
}

#[test]
fn mua_refused_by_a_full_bag_before_and_by_the_server() {
    let (mut b, mut out, now) = opened(1);
    let s = slime();
    let full: Vec<(i32, i32, u8)> = (0..42).map(|_| (411, 1, 0)).collect();
    b.on_packet(1187, &bag(42, &full), now, &mut out).unwrap();
    let buy = || MarketTask::Buy {
        uuid: s.uuid.clone(),
        price: 1000,
    };
    b.market(buy(), now, &mut out);
    assert_eq!(
        lines(&out),
        ["Chưa mua: túi không còn ô trống: server sẽ trả \"Rương đã đầy\""]
    );
    // The bot saw room, the server did not: its notice is the refusal, no Xu taken.
    b.on_packet(1187, &bag(60, &full), now, &mut out).unwrap();
    out.clear();
    b.market(buy(), now, &mut out);
    out.clear();
    let full_text = "Rương đã đầy. Vui lòng bỏ bớt đồ ra hoặc mua thêm ngăn chứa";
    b.on_packet(1256, &notice(full_text), now, &mut out)
        .unwrap();
    assert_eq!(
        lines(&out),
        [
            full_text.to_string(),
            format!("Chưa mua được Thú cưng Slime: server từ chối ({full_text})")
        ]
    );
    assert!(!b.snapshot().market.changing);
    // Not enough Xu.
    b.on_packet(46, &money(999), now, &mut out).unwrap();
    out.clear();
    b.market(buy(), now, &mut out);
    assert_eq!(lines(&out), ["Chưa mua: thiếu Xu: cần 1.000, có 999"]);
}

#[test]
fn dang_ban_only_an_unlocked_item_at_a_price_in_range_then_dang_ban_is_read_again() {
    let (mut b, mut out, now) = opened(0);
    b.market(
        MarketTask::Sell {
            slot: SLIME_SLOT,
            price: 1_000_000,
            uuid: None,
        },
        now,
        &mut out,
    );
    assert_eq!(
        lines(&out),
        ["Chưa đăng bán: Thú cưng Slime đã khoá, không rao bán được"]
    );
    let (mut b, mut out, now) = opened(1);
    for price in [999, 100_000_001] {
        b.market(
            MarketTask::Sell {
                slot: SLIME_SLOT,
                price,
                uuid: None,
            },
            now,
            &mut out,
        );
    }
    b.market(
        MarketTask::Sell {
            slot: 41,
            price: 1000,
            uuid: None,
        },
        now,
        &mut out,
    );
    assert_eq!(
        lines(&out),
        [
            "Chưa đăng bán: giá phải từ 1.000 tới 100.000.000 Xu",
            "Chưa đăng bán: giá phải từ 1.000 tới 100.000.000 Xu",
            "Chưa đăng bán: ô túi 41 trống",
        ]
    );
    assert!(sent(&out).is_empty());

    // The window showed another item in that slot (the bag changed under its question): neither sold nor thrown away.
    out.clear();
    let slime = b
        .snapshot()
        .bag
        .unwrap()
        .items
        .into_iter()
        .find(|i| i.slot == SLIME_SLOT)
        .unwrap()
        .uuid;
    b.market(
        MarketTask::Sell {
            slot: SLIME_SLOT,
            price: 1_000_000,
            uuid: Some("món khác".into()),
        },
        now,
        &mut out,
    );
    b.item_of(ItemAct::Discard(SLIME_SLOT), "món khác", now, &mut out);
    assert_eq!(
        lines(&out),
        [
            format!(
                "Chưa đăng bán: ô túi {} giờ là Thú cưng Slime, không phải món đã chọn",
                SLIME_SLOT as u32 + 1
            ),
            format!(
                "Không làm: ô túi {} giờ là món khác, không phải món đã chọn",
                SLIME_SLOT as u32 + 1
            ),
        ]
    );
    assert!(sent(&out).is_empty());
    b.item_of(ItemAct::Discard(SLIME_SLOT), &slime, now, &mut out);
    assert_eq!(sent(&out).len(), 1, "the item shown is thrown away");
    let (mut b, mut out, now) = opened(1);

    out.clear();
    b.market(
        MarketTask::Sell {
            slot: SLIME_SLOT,
            price: 1_000_000,
            uuid: None,
        },
        now,
        &mut out,
    );
    let phone = v()["market"]["requests"]
        .as_array()
        .unwrap()
        .iter()
        .find(|r| r["op"] == 112 && r["slot"].is_number())
        .unwrap()["wire"]
        .as_str()
        .unwrap()
        .to_string();
    assert_eq!(sent(&out), [(112, phone)], "c2s/112 of CT1");
    out.clear();
    b.on_packet(46, &money(5_052_600), now, &mut out).unwrap();
    b.on_packet(112, &ct1("s2c/112"), now, &mut out).unwrap();
    assert_eq!(
        lines(&out),
        ["Xong đăng bán Thú cưng Slime giá 1.000.000 Xu: phí 1.000 Xu, bán trong 24 giờ; bán được thì 950.000 Xu về hòm thư (trừ 5% phí chợ)"]
    );
    // No bag packet comes: the Slime leaves slot 2 here. Then Đang bán is read again.
    let bag = b.snap.bag.as_ref().unwrap();
    assert!(!bag.items.iter().any(|i| i.slot == SLIME_SLOT));
    assert_eq!(sent(&out), [(1192, page_request(-1, 1))]);
    out.clear();
    b.on_packet(1256, &notice("Rao bán vật phẩm thành công"), now, &mut out)
        .unwrap();
    b.on_packet(1192, &ct1("s2c/1192 Đang bán một món"), now, &mut out)
        .unwrap();
    assert_eq!(lines(&out), ["Rao bán vật phẩm thành công"]);
    assert_eq!(b.snap.market.mine.as_ref().unwrap().listings.len(), 1);
    assert_eq!(b.deadline(), None);
}

#[test]
fn thu_hoi_and_gia_han_take_a_listing_of_dang_ban() {
    let (mut b, mut out, now) = opened(1);
    b.market(
        MarketTask::Page {
            tab: market::MARKET_MINE_TAB,
            page: 1,
        },
        now,
        &mut out,
    );
    b.on_packet(1192, &ct1("s2c/1192 Đang bán một món"), now, &mut out)
        .unwrap();
    let listed = b.snap.market.mine.as_ref().unwrap().listings[0].clone();
    assert_eq!(listed.uuid, request_uuid(113));

    // Gia hạn: c2s/112 kind 2, the fee, Đang bán again with the listing 24 h later.
    out.clear();
    b.market(MarketTask::Extend(listed.uuid.clone()), now, &mut out);
    assert_eq!(
        sent(&out),
        [(112, format!("02{}", uuid_request(&listed.uuid)))]
    );
    out.clear();
    b.on_packet(46, &money(5_050_600), now, &mut out).unwrap();
    let later = MarketListing {
        expires_at: listed.expires_at + 24 * 3_600_000,
        ..listed.clone()
    };
    b.on_packet(1192, &mine_page(&[later]), now, &mut out)
        .unwrap();
    assert!(
        lines(&out)[0].starts_with("Xong gia hạn Thú cưng Slime: thêm 24 giờ, còn "),
        "{:?}",
        lines(&out)
    );
    // Refused by the server: its notice before Đang bán.
    out.clear();
    b.market(MarketTask::Extend(listed.uuid.clone()), now, &mut out);
    b.on_packet(1256, &notice("Không đủ Xu"), now, &mut out)
        .unwrap();
    assert_eq!(
        lines(&out)[1],
        "Chưa gia hạn được Thú cưng Slime: server từ chối (Không đủ Xu)"
    );

    // Thu hồi: c2s/113 of CT1; the listing leaves Đang bán.
    out.clear();
    b.market(MarketTask::Withdraw(listed.uuid.clone()), now, &mut out);
    assert_eq!(sent(&out), [(113, uuid_request(&listed.uuid))]);
    out.clear();
    b.on_packet(113, &ct1("s2c/113"), now, &mut out).unwrap();
    assert_eq!(lines(&out), ["Xong thu hồi Thú cưng Slime về túi"]);
    assert!(b.snap.market.mine.as_ref().unwrap().listings.is_empty());
    out.clear();
    b.market(MarketTask::Withdraw(listed.uuid.clone()), now, &mut out);
    assert_eq!(
        lines(&out),
        ["Chưa thu hồi: Đang bán không có món này: đã bán, hết hạn hay đã thu hồi"]
    );
}

/// The packets of NP1's Gia hạn under that key ("s2c/46 sau Gia hạn"), in the order the server sent them.
fn np1_extend() -> Vec<(String, Vec<u8>)> {
    v()["market"]["extend"]
        .as_array()
        .unwrap()
        .iter()
        .map(|p| {
            let key = p["key"].as_str().unwrap().to_string();
            (key, hex(p["hex"].as_str().unwrap()))
        })
        .collect()
}

#[test]
fn gia_han_as_np1_sent_it_and_the_server_answered() {
    let (mut b, mut out, now) = opened(1);
    let packets = np1_extend();
    let find = |k: &str| packets.iter().find(|(key, _)| key == k).unwrap().1.clone();
    b.market(
        MarketTask::Page {
            tab: market::MARKET_MINE_TAB,
            page: 1,
        },
        now,
        &mut out,
    );
    b.on_packet(
        1192,
        &find("s2c/1192 Đang bán trước Gia hạn"),
        now,
        &mut out,
    )
    .unwrap();
    let listed = b.snap.market.mine.as_ref().unwrap().listings[0].clone();
    out.clear();
    b.market(MarketTask::Extend(listed.uuid.clone()), now, &mut out);
    assert_eq!(sent(&out), [(112, tohex(&find("c2s/112 Gia hạn")))]);
    assert!(b.snapshot().market.changing);
    out.clear();
    b.on_packet(46, &find("s2c/46 sau Gia hạn"), now, &mut out)
        .unwrap();
    assert_eq!(b.snap.currencies.as_ref().unwrap().xu, 5_049_600);
    b.on_packet(1192, &find("s2c/1192 Đang bán sau Gia hạn"), now, &mut out)
        .unwrap();
    let name = Picked::of(listed.item_id, listed.quantity as i64).label();
    let line = format!("Xong gia hạn {name}: thêm 24 giờ, còn ");
    assert!(lines(&out)[0].starts_with(&line), "{:?}", lines(&out));
    let after = &b.snap.market.mine.as_ref().unwrap().listings[0];
    assert_eq!(after.expires_at - listed.expires_at, 24 * 3_600_000);
    // The notice after it is only logged: the task ended with Đang bán.
    out.clear();
    b.on_packet(1256, &find("s2c/1256 gia hạn"), now, &mut out)
        .unwrap();
    assert_eq!(lines(&out), ["Gia hạn vật phẩm thành công"]);
    assert_eq!(b.deadline(), None);
    assert!(!b.snapshot().market.changing);
}

#[test]
fn one_task_at_a_time_and_nothing_else_while_mua_waits() {
    let (mut b, mut out, now) = opened(1);
    let s = slime();
    b.market(
        MarketTask::Buy {
            uuid: s.uuid.clone(),
            price: 1000,
        },
        now,
        &mut out,
    );
    out.clear();
    b.market(MarketTask::Page { tab: 0, page: 1 }, now, &mut out);
    b.fight("Sói Xám", 1, 1, now, &mut out);
    b.quest(1, None, now, &mut out);
    b.mail(MailTask::ClaimAll, now, &mut out);
    b.mail(MailTask::List, now, &mut out);
    b.redeem(&["A1".to_string()], now, &mut out);
    assert_eq!(
        lines(&out),
        [
            "Chưa xem trang chợ: chợ đang đợi server trả lời việc trước",
            "Đang mua bán ở Chợ trời: đợi xong rồi mới đánh quái",
            "Đang mua bán ở Chợ trời: đợi xong rồi mới làm nhiệm vụ",
            "Chưa nhận hết: đang mua bán ở Chợ trời, đợi server trả lời",
            "Chưa nhập mã: đang mua bán ở Chợ trời, đợi server trả lời",
        ]
    );
    // Reading the mailbox is not held up.
    assert_eq!(sent(&out), [(1215, String::new())]);
    b.on_packet(1215, &[0, 0, 0, 0], now, &mut out).unwrap();
    out.clear();
    b.on_timer(now + Duration::from_secs(8), &mut out);
    assert_eq!(
        lines(&out),
        ["Chợ trời không trả lời sau 8 s: thôi mua Thú cưng Slime (1.000 Xu)"]
    );

    // While codes go out, pages may be read, nothing bought.
    let (mut b, mut out, now) = opened(1);
    b.redeem(&["A1".to_string()], now, &mut out);
    out.clear();
    b.market(
        MarketTask::Buy {
            uuid: s.uuid.clone(),
            price: 1000,
        },
        now,
        &mut out,
    );
    b.market(MarketTask::Page { tab: 6, page: 4 }, now, &mut out);
    assert_eq!(
        lines(&out),
        ["Chưa mua: đang nhập mã quà tặng, bấm Dừng trước"]
    );
    assert_eq!(sent(&out), [(1192, page_request(6, 4))]);
}
