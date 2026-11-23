//! Hòm thư (14-npc.md#hòm-thư) against src/protocol/mail.ts (`npm run export:rust`, vectors.json "mail"): what the TS
//! decoders read in the packets of G1, the bytes of c2s/1216, c2s/1217 and c2s/1219, the bag slots a mail needs, and
//! Bot::mail driven by those packets. c2s/1221 (Xóa hết) never goes out.
use cllt_core::atlas::Atlas;
use cllt_core::bot::{Bot, BotOptions, ItemAct, MailDraft, MailDraftItem, MailTask, Out};
use cllt_core::items::book;
use cllt_core::mail;
use cllt_core::protocol::Writer;
use cllt_core::requests::{build, Ctx};
use std::sync::Arc;
use std::time::{Duration, Instant};

mod common;
use common::{hex, tohex, v};

/// The captured packet of G1 under that key of test/fixtures-g1.ts ("s2c/1215 bốn thư mới").
fn g1(key: &str) -> Vec<u8> {
    let all = v();
    let case = all["mail"]["decoders"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["key"] == key)
        .unwrap_or_else(|| panic!("no G1 packet {key}"))
        .clone();
    hex(case["hex"].as_str().unwrap())
}
fn lines(out: &[Out]) -> Vec<&str> {
    out.iter()
        .filter_map(|o| match o {
            Out::Log(_, t) => Some(t.as_str()),
            _ => None,
        })
        .collect()
}
/// The requests sent, as (opcode, hex). None is ever c2s/1221.
fn sent(out: &[Out]) -> Vec<(i32, String)> {
    let all: Vec<(i32, String)> = out
        .iter()
        .filter_map(|o| match o {
            Out::Send(op, p) => Some((*op, tohex(p))),
            _ => None,
        })
        .collect();
    assert!(all.iter().all(|s| s.0 != mail::DELETE_ALL), "Xóa hết sent");
    all
}
fn id(n: i64) -> String {
    tohex(&Writer::new().i64(n).build())
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
fn money(xu: i64, xu_khoa: i64, luong: i64) -> Vec<u8> {
    Writer::new()
        .string("update Xu")
        .i64(xu)
        .i64(xu_khoa)
        .i64(luong)
        .build()
}
fn notice(text: &str) -> Vec<u8> {
    Writer::new().u8(1).string(text).build()
}
/// Ttuananh in G1: a bag of 42 with 18 items (Búa, Hoàn Linh, Kim Đan locked among them), the money before Nhận 6280.
fn bot() -> (Bot, Vec<Out>, Instant) {
    let mut b = Bot::new(BotOptions::default(), Arc::new(Atlas::default()));
    let now = Instant::now();
    let mut out = vec![];
    let mut items = vec![(2, 93, 0), (0, 3, 0), (1, 2, 0)];
    items.extend((0..15).map(|_| (412, 1, 0)));
    b.on_packet(1187, &bag(42, &items), now, &mut out).unwrap();
    b.on_packet(46, &money(3_600, 26_138, 0), now, &mut out)
        .unwrap();
    (b, vec![], now)
}
/// The bot with the list of G1 under `key`.
fn listed(key: &str) -> (Bot, Vec<Out>, Instant) {
    let (mut b, mut out, now) = bot();
    b.mail(MailTask::List, now, &mut out);
    b.on_packet(1215, &g1(key), now, &mut out).unwrap();
    (b, vec![], now)
}

#[test]
fn the_g1_packets_read_as_the_ts_side_reads_them_and_the_requests_are_the_phones() {
    let all = v();
    let cases = all["mail"]["decoders"].as_array().unwrap();
    assert_eq!(cases.len(), 11);
    for case in cases {
        let p = hex(case["hex"].as_str().unwrap());
        let key = case["key"].as_str().unwrap();
        let got = match case["fn"].as_str().unwrap() {
            "mailList" => serde_json::to_value(mail::mail_list(&p).unwrap()),
            "mailBody" => serde_json::to_value(mail::mail_body(&p).unwrap()),
            "mailAck" if key.starts_with("s2c/1217") => {
                serde_json::to_value(mail::mail_ack(&p, 1217).unwrap())
            }
            "mailAck" => serde_json::to_value(mail::mail_ack(&p, 1219).unwrap()),
            other => panic!("no Rust decoder for {other}"),
        }
        .unwrap();
        assert_eq!(got, case["expected"], "{key}");
    }
    for case in all["mail"]["requests"].as_array().unwrap() {
        let ctx = Ctx {
            mail_id: case["id"].as_i64(),
            ..Ctx::default()
        };
        for op in [1216, 1217, 1219] {
            assert_eq!(tohex(&build(op, &ctx).unwrap()), case["hex"], "{op}");
        }
    }
    assert!(build(1215, &Ctx::default()).unwrap().is_empty());
    assert!(build(1218, &Ctx::default()).unwrap().is_empty());
    assert!(build(1217, &Ctx::default()).is_err(), "no mail id");
    assert!(build(mail::DELETE_ALL, &Ctx::default()).is_err(), "Xóa hết");
    let stack = |id| book().get(id).map_or(1, |d| d.stack);
    for case in all["mail"]["slots"].as_array().unwrap() {
        let body = mail::mail_body(&g1(case["key"].as_str().unwrap())).unwrap();
        let bag: Vec<(i32, u8)> = case["bag"]
            .as_array()
            .unwrap()
            .iter()
            .map(|b| (b[0].as_i64().unwrap() as i32, b[1].as_u64().unwrap() as u8))
            .collect();
        let items = body.items.iter().map(|i| (i.item_id, i.field1));
        assert_eq!(
            mail::slots_needed(items, &bag, stack),
            case["slots"].as_u64().unwrap() as u32,
            "{} {:?}",
            case["key"],
            bag
        );
    }
    for case in all["mail"]["claimed"].as_array().unwrap() {
        let text = case["text"].as_str().unwrap();
        assert_eq!(mail::claimed_count(text) as u64, case["count"], "{text}");
        assert_eq!(mail::is_full(text), text.contains("đầy"), "{text}");
    }
}

#[test]
fn the_list_then_a_mail_opened_which_the_server_marks_read() {
    let (mut b, mut out, now) = bot();
    b.mail(MailTask::List, now, &mut out);
    assert_eq!(sent(&out), [(1215, String::new())]);
    assert_eq!(b.snap.mailbox.doing.as_deref(), Some("Đang xem hòm thư…"));
    assert_eq!(b.deadline(), Some(now + Duration::from_secs(8)));
    out.clear();
    b.on_packet(1215, &g1("s2c/1215 bốn thư mới"), now, &mut out)
        .unwrap();
    assert_eq!(lines(&out), ["Hòm thư: 4 thư, 4 thư còn quà chưa nhận"]);
    let m = &b.snap.mailbox;
    assert_eq!(
        m.mails
            .as_ref()
            .unwrap()
            .iter()
            .map(|m| m.id)
            .collect::<Vec<_>>(),
        [6280, 6278, 6273, 5118]
    );
    assert_eq!((m.doing.as_deref(), m.last.as_deref()), (None, None));

    out.clear();
    b.mail(MailTask::Open(6273), now, &mut out);
    assert_eq!(sent(&out), [(1216, id(6273))], "c2s/1216 of G1");
    assert_eq!(b.snap.mailbox.busy_with, Some(6273));
    out.clear();
    b.on_packet(1216, &g1("s2c/1216 6273 Ngày 1"), now, &mut out)
        .unwrap();
    b.on_packet(1220, &[1], now, &mut out).unwrap();
    assert!(lines(&out).is_empty(), "opening is not logged");
    let m = &b.snap.mailbox;
    assert_eq!(m.opened.len(), 1);
    assert_eq!(m.opened[0].items.len(), 8);
    assert!(m.mails.as_ref().unwrap()[2].read);
    assert_eq!((m.unread, m.busy_with), (Some(true), None));
    // The red mark follows the list, also without s2c/1220: on while one is not read, off once all are.
    let (mut b, mut out, now) = listed("s2c/1215 ba thư đã nhận");
    assert_eq!(b.snap.mailbox.unread, Some(false));
    b.on_packet(1222, &new_mail(9001), now, &mut out).unwrap();
    assert_eq!(b.snap.mailbox.unread, Some(true));
    b.mail(MailTask::Open(9001), now, &mut out);
    let body = Writer::new()
        .i64(9001)
        .string("Quà thử")
        .string("")
        .string("Hệ Thống")
        .u8(0)
        .i32(0)
        .build();
    b.on_packet(1216, &body, now, &mut out).unwrap();
    assert_eq!(b.snap.mailbox.unread, Some(false));
    assert!(b.snap.mailbox.opened[0].items.is_empty());
    // 6273 fits: Búa, Hoàn Linh and Kim Đan join their stacks, Tăng Kinh Nghiệm and 3 Đá cấp 5 take 2 of the 24 free
    // (Đá cấp stacks to 999 since table 29, 14/11; one slot each under table 18).
    let bag = b.snap.bag.as_ref().unwrap();
    assert_eq!(mail::slots_for(&m.opened[0].items, &bag.items), 2);

    out.clear();
    b.mail(MailTask::Open(1), now, &mut out);
    assert_eq!(lines(&out), ["Chưa mở thư: hòm thư không có thư 1"]);
    assert!(sent(&out).is_empty());
}

#[test]
fn nhan_opens_the_mail_first_checks_the_room_then_takes_its_gift() {
    let (mut b, mut out, now) = listed("s2c/1215 bốn thư mới");
    b.mail(MailTask::Claim(6280), now, &mut out);
    assert_eq!(sent(&out), [(1216, id(6280))]);
    out.clear();
    b.on_packet(1216, &g1("s2c/1216 6280 Đền bù"), now, &mut out)
        .unwrap();
    assert_eq!(sent(&out), [(1217, id(6280))], "money needs no slot");
    assert_eq!(
        b.snap.mailbox.doing.as_deref(),
        Some("Đang nhận thư \"Quà Đền bù AlphaTest\"…")
    );
    out.clear();
    b.on_packet(46, &g1_money(), now, &mut out).unwrap();
    b.on_packet(1217, &g1("s2c/1217 6280 được"), now, &mut out)
        .unwrap();
    assert_eq!(
        lines(&out),
        ["Xong nhận thư \"Quà Đền bù AlphaTest\": 5.000.000 Xu, 10.000 Lượng, 5.000.000 Xu khóa"]
    );
    let m = &b.snap.mailbox;
    assert!(m.mails.as_ref().unwrap()[0].taken && m.opened[0].taken);
    assert_eq!(m.last.as_deref(), lines(&out).first().copied());
    assert_eq!(b.snap.currencies.as_ref().unwrap().luong, 10_000);
    assert_eq!(b.deadline(), None);

    // Taken: not again. Opened already: Nhận goes at once.
    out.clear();
    b.mail(MailTask::Claim(6280), now, &mut out);
    assert_eq!(
        lines(&out),
        ["Chưa nhận thư: thư \"Quà Đền bù AlphaTest\" đã nhận quà rồi"]
    );
    b.on_packet(1216, &g1("s2c/1216 6273 Ngày 1"), now, &mut out)
        .unwrap();
    out.clear();
    b.mail(MailTask::Claim(6273), now, &mut out);
    assert_eq!(sent(&out), [(1217, id(6273))]);
}

/// s2c/46 after Nhận 6280 in G1: Xu 3.600 → 5.003.600, Xu khóa 26.138 → 5.026.138, Lượng 0 → 10.000.
fn g1_money() -> Vec<u8> {
    money(5_003_600, 5_026_138, 10_000)
}

#[test]
fn nhan_checks_the_room_and_a_full_bag_on_the_server_side_says_why() {
    // 42 of 42: 6278 needs 8 slots, nothing goes out.
    let (mut b, mut out, now) = listed("s2c/1215 bốn thư mới");
    let full: Vec<(i32, i32, u8)> = (0..42).map(|_| (411, 1, 0)).collect();
    b.on_packet(1187, &bag(42, &full), now, &mut out).unwrap();
    b.mail(MailTask::Claim(6278), now, &mut out);
    out.clear();
    b.on_packet(1216, &g1("s2c/1216 6278 Alpha Test"), now, &mut out)
        .unwrap();
    assert_eq!(
        lines(&out),
        ["Chưa nhận thư \"Quà Alpha Test\": cần 8 ô trống, túi còn 0: dọn túi trước, hay bấm Nhận hết (server bỏ qua thư thiếu chỗ)"]
    );
    assert!(sent(&out).is_empty());
    assert_eq!(b.snap.mailbox.doing, None);

    // The bot found room, the server did not: "Rương đã đầy" and ok 0, nothing lost.
    b.on_packet(1187, &bag(60, &full), now, &mut out).unwrap();
    out.clear();
    b.mail(MailTask::Claim(6278), now, &mut out);
    assert_eq!(sent(&out), [(1217, id(6278))]);
    out.clear();
    let full_text = "Rương đã đầy. Vui lòng bỏ bớt đồ ra hoặc mua thêm ngăn chứa";
    b.on_packet(1256, &notice(full_text), now, &mut out)
        .unwrap();
    b.on_packet(1217, &g1("s2c/1217 6278 không được"), now, &mut out)
        .unwrap();
    assert_eq!(
        lines(&out),
        [
            full_text.to_string(),
            format!("Chưa nhận được thư \"Quà Alpha Test\": server từ chối ({full_text})")
        ]
    );
    assert!(!b.snap.mailbox.mails.as_ref().unwrap()[1].taken);
}

#[test]
fn nhan_het_sends_one_packet_and_says_what_came() {
    let (mut b, mut out, now) = listed("s2c/1215 ba thư chưa nhận");
    b.on_packet(46, &money(5_003_600, 6_025_929, 10_000), now, &mut out)
        .unwrap();
    b.mail(MailTask::ClaimAll, now, &mut out);
    assert_eq!(sent(&out), [(1218, String::new())]);
    assert_eq!(
        b.snap.mailbox.doing.as_deref(),
        Some("Đang nhận hết 3 thư quà…")
    );
    out.clear();
    b.on_packet(46, &money(15_003_600, 16_030_279, 30_000), now, &mut out)
        .unwrap();
    let mut items = vec![(2, 93, 0), (0, 3, 0), (1, 2, 0)];
    items.extend((0..28).map(|_| (412, 1, 0)));
    b.on_packet(1187, &bag(42, &items), now, &mut out).unwrap();
    b.on_packet(1256, &notice("Đã nhận quà của 2 thư"), now, &mut out)
        .unwrap();
    // Another notice before the list does not take the place of the answer.
    b.on_packet(1256, &notice("Sự kiện mới đã mở"), now, &mut out)
        .unwrap();
    b.on_packet(1215, &g1("s2c/1215 ba thư đã nhận"), now, &mut out)
        .unwrap();
    assert_eq!(
        lines(&out),
        [
            "Đã nhận quà của 2 thư",
            "Sự kiện mới đã mở",
            "Xong nhận hết: Đã nhận quà của 2 thư (Xu +10.000.000; Xu khóa +10.004.350; Lượng +20.000; túi 18 → 31 món)"
        ]
    );
    assert_eq!(b.deadline(), None);
    out.clear();
    b.mail(MailTask::ClaimAll, now, &mut out);
    assert_eq!(
        lines(&out),
        ["Chưa nhận hết: không có thư quà nào chưa nhận"]
    );
    assert!(sent(&out).is_empty());
}

#[test]
fn nhan_het_that_takes_nothing_says_the_servers_words() {
    let (mut b, mut out, now) = listed("s2c/1215 bốn thư mới");
    b.mail(MailTask::ClaimAll, now, &mut out);
    out.clear();
    let full_text = "Rương đã đầy. Vui lòng bỏ bớt đồ ra hoặc mua thêm ngăn chứa";
    b.on_packet(1256, &notice(full_text), now, &mut out)
        .unwrap();
    b.on_packet(1215, &g1("s2c/1215 bốn thư mới"), now, &mut out)
        .unwrap();
    assert_eq!(
        lines(&out)[1],
        format!("Chưa nhận được thư nào: {full_text}")
    );
}

#[test]
fn xoa_only_mails_whose_gift_is_taken_one_by_one_and_dung_stops_after_the_one_sent() {
    let (mut b, mut out, now) = listed("s2c/1215 sau Nhận hết khi đầy");
    // 6278 still holds its gift: nothing goes, not even 6280.
    b.mail(MailTask::Delete(vec![6280, 6278]), now, &mut out);
    assert_eq!(
        lines(&out),
        ["Chưa xoá thư: thư \"Quà Alpha Test\" còn quà chưa nhận, xoá đi là mất quà: nhận trước rồi mới xoá"]
    );
    assert!(sent(&out).is_empty());
    out.clear();
    b.mail(MailTask::Delete(vec![6280]), now, &mut out);
    assert_eq!(sent(&out), [(1219, id(6280))]);
    out.clear();
    b.on_packet(1219, &g1("s2c/1219 6280 đã xoá"), now, &mut out)
        .unwrap();
    assert_eq!(lines(&out), ["Xong xoá thư \"Quà Đền bù AlphaTest\""]);
    let ids: Vec<i64> = b
        .snap
        .mailbox
        .mails
        .as_ref()
        .unwrap()
        .iter()
        .map(|m| m.id)
        .collect();
    assert_eq!(ids, [6278, 6273, 5118]);

    // Three mails taken: the second goes after the answer to the first; Dừng then keeps the third.
    let (mut b, mut out, now) = listed("s2c/1215 ba thư đã nhận");
    let ids: Vec<i64> = b
        .snap
        .mailbox
        .mails
        .as_ref()
        .unwrap()
        .iter()
        .map(|m| m.id)
        .collect();
    b.mail(MailTask::Delete(ids.clone()), now, &mut out);
    assert_eq!(sent(&out), [(1219, id(ids[0]))]);
    out.clear();
    let ack = |i: i64| Writer::new().i64(i).u8(1).build();
    b.on_packet(1219, &ack(ids[0]), now, &mut out).unwrap();
    assert_eq!(sent(&out), [(1219, id(ids[1]))]);
    b.stop(false, now, &mut out);
    out.clear();
    b.on_packet(1219, &ack(ids[1]), now, &mut out).unwrap();
    assert_eq!(lines(&out), ["Xong xoá 2 thư; đã dừng, còn 1 thư chưa xoá"]);
    assert!(sent(&out).is_empty());
    assert_eq!(b.snap.mailbox.mails.as_ref().unwrap().len(), 1);
}

#[test]
fn one_task_at_a_time_and_nothing_else_while_it_waits() {
    let (mut b, mut out, now) = listed("s2c/1215 bốn thư mới");
    b.mail(MailTask::Claim(6280), now, &mut out);
    assert!(
        b.snapshot().mailbox.changing,
        "the UI counts the character busy"
    );
    out.clear();
    b.mail(MailTask::List, now, &mut out);
    b.fight("Sói Xám", 1, 1, now, &mut out);
    b.quest(1, None, now, &mut out);
    b.item(ItemAct::Sort, now, &mut out);
    b.redeem(&["A1".to_string()], now, &mut out);
    assert_eq!(
        lines(&out),
        [
            "Chưa xem hòm thư: hòm thư đang đợi server trả lời việc trước",
            "Đang nhận, gửi hay xoá thư: đợi xong rồi mới đánh quái",
            "Đang nhận, gửi hay xoá thư: đợi xong rồi mới làm nhiệm vụ",
            "Chưa sắp xếp túi đồ: đang nhận hay xoá thư",
            "Chưa nhập mã: đang nhận hay xoá thư, đợi server trả lời",
        ]
    );
    assert!(sent(&out).is_empty());

    // Silence: the task ends after 8 s.
    out.clear();
    b.on_timer(now + Duration::from_secs(8), &mut out);
    assert_eq!(
        lines(&out),
        ["Hòm thư không trả lời sau 8 s: thôi mở thư \"Quà Đền bù AlphaTest\" để đếm ô túi cần"]
    );
    assert_eq!((b.deadline(), b.snap.mailbox.doing.as_ref()), (None, None));

    // Reading the list keeps nothing else waiting: Sắp xếp goes.
    out.clear();
    b.mail(MailTask::List, now, &mut out);
    b.item(ItemAct::Sort, now, &mut out);
    assert_eq!(sent(&out), [(1215, String::new()), (1257, String::new())]);
    b.on_packet(1215, &g1("s2c/1215 bốn thư mới"), now, &mut out)
        .unwrap();
    // The sorted bag answers Sắp xếp.
    b.on_packet(1187, &bag(42, &[(2, 93, 0)]), now, &mut out)
        .unwrap();
    assert!(lines(&out).contains(&"Đã sắp xếp túi đồ (1 món)"));

    // While codes go out, the list may be read, its gifts not taken.
    out.clear();
    b.redeem(&["A1".to_string()], now, &mut out);
    out.clear();
    b.mail(MailTask::ClaimAll, now, &mut out);
    b.mail(MailTask::Open(6278), now, &mut out);
    assert_eq!(
        lines(&out),
        ["Chưa nhận hết: đang nhập mã quà tặng, bấm Dừng trước"]
    );
    assert_eq!(sent(&out), [(1216, id(6278))]);
}

#[test]
fn a_new_mail_goes_on_top_of_the_list() {
    let (mut b, mut out, now) = bot();
    // Not listed yet: the list stays unknown.
    b.on_packet(1222, &new_mail(9001), now, &mut out).unwrap();
    assert_eq!(b.snap.mailbox.mails, None);
    let (mut b, mut out, now) = listed("s2c/1215 ba thư đã nhận");
    b.on_packet(1222, &new_mail(9001), now, &mut out).unwrap();
    let mails = b.snap.mailbox.mails.as_ref().unwrap();
    let top: Vec<(i64, bool, bool)> = mails.iter().map(|m| (m.id, m.gift, m.taken)).collect();
    assert_eq!(top[0], (9001, true, false));
    assert_eq!(top.len(), 4);
    // The same mail again is not listed twice; s2c/1222 of G1 (6273) is listed already.
    b.on_packet(1222, &new_mail(9001), now, &mut out).unwrap();
    let all = v();
    let g1_mail = &all["gift"]["decoders"]
        .as_array()
        .unwrap()
        .iter()
        .find(|c| c["key"] == "s2c/1222 6273")
        .unwrap()["hex"];
    b.on_packet(1222, &hex(g1_mail.as_str().unwrap()), now, &mut out)
        .unwrap();
    assert_eq!(b.snap.mailbox.mails.as_ref().unwrap().len(), 4);
}

/// s2c/1222: a gift mail `id` not read yet, as the one of G1.
fn new_mail(id: i64) -> Vec<u8> {
    Writer::new()
        .i64(id)
        .u8(1)
        .string("Quà thử")
        .string("Hệ Thống")
        .u8(0)
        .u8(1)
        .u8(0)
        .i64(1_761_955_200_000)
        .i64(0)
        .build()
}

// ML1 (23/11, game 1.1.1): tiheo1 sent 5 Tăng Kinh Nghiệm from bag slot 35 to mania4; the phone's bytes (test/mail.test.ts).
const ML1_SEND: &str = "000000066d616e6961340000000847756920e1babd700000000001000000230000002462396434653036302d363037622d343463632d616662312d39353335376137346565393500000005";
const ML1_SENT: &str = "000000001ac490c3a32067e1bbad69207468c6b02063686f206d616e696134";
const ML1_LIST: &str = "000000020000000000001049000000066d616e6961340000000847756920e1babd7000000000000001a20797e7bf0000000001ff000000070000002431383338653338352d313832372d346534342d396633342d64303763633536323136613400000000ffffffff0000000501ff0000000000000000000000000000000f3100000006486868686868000000014100000000000001a2062835e30200000001ff0000025e0000002464636465666231302d333335632d346266302d393063342d34366632353634643833363100000000ffffffff000001b401ff000000000000000000";

#[test]
fn gui_thu_dung_byte_cua_dien_thoai_va_doc_het_cau_tra_loi() {
    let items = [mail::SendItem {
        slot: 35,
        uuid: "b9d4e060-607b-44cc-afb1-95357a74ee95".into(),
        quantity: 5,
    }];
    assert_eq!(
        tohex(&mail::send_request("mania4", "Gui ẽp", "", &items)),
        ML1_SEND
    );
    let a = mail::send_result(&hex(ML1_SENT)).unwrap();
    assert_eq!((a.code, a.text.as_str()), (0, "Đã gửi thư cho mania4"));
    let list = mail::sent_list(&hex(ML1_LIST)).unwrap();
    let got: Vec<_> = list
        .iter()
        .map(|m| {
            (
                m.id,
                m.to.as_str(),
                m.taken(),
                m.items
                    .iter()
                    .map(|i| (i.item_id, i.quantity))
                    .collect::<Vec<_>>(),
            )
        })
        .collect();
    assert_eq!(
        got,
        [
            (4169, "mania4", false, vec![(7, 5)]),
            (3889, "Hhhhhh", true, vec![(606, 436)])
        ]
    );
}

/// A bag of Tăng Kinh Nghiệm ×5 not locked (slot 0) and a locked Búa sửa chữa (slot 1), with `xu` Xu.
fn sender(xu: i64) -> (Bot, Vec<Out>, Instant) {
    let mut b = Bot::new(BotOptions::default(), Arc::new(Atlas::default()));
    let now = Instant::now();
    let mut out = vec![];
    b.on_packet(1187, &bag(42, &[(7, 5, 1), (2, 3, 0)]), now, &mut out)
        .unwrap();
    b.on_packet(46, &money(xu, 0, 0), now, &mut out).unwrap();
    (b, vec![], now)
}
fn draft(to: &str, items: &[(i32, i32)]) -> MailTask {
    MailTask::Send(MailDraft {
        to: to.into(),
        subject: "Gui exp".into(),
        body: String::new(),
        items: items
            .iter()
            .map(|&(slot, quantity)| MailDraftItem { slot, quantity })
            .collect(),
    })
}

#[test]
fn gui_thu_kem_do_khong_khoa_roi_server_tra_loi() {
    let (mut b, mut out, now) = sender(5_000);
    b.mail(draft("mania4", &[(0, 3)]), now, &mut out);
    let want = tohex(&mail::send_request(
        "mania4",
        "Gui exp",
        "",
        &[mail::SendItem {
            slot: 0,
            uuid: "u0".into(),
            quantity: 3,
        }],
    ));
    assert_eq!(sent(&out), [(1280, want)]);
    assert!(
        b.snapshot().mailbox.changing,
        "the character counts as busy"
    );
    out.clear();
    b.on_packet(46, &money(4_000, 0, 0), now, &mut out).unwrap();
    b.on_packet(1280, &hex(ML1_SENT), now, &mut out).unwrap();
    assert_eq!(
        lines(&out),
        ["Xong gửi thư cho mania4: Tăng Kinh Nghiệm ×3, phí 1.000 Xu (Đã gửi thư cho mania4)"]
    );
    assert!(b.snapshot().mailbox.doing.is_none());
    out.clear();
    b.mail(MailTask::Sent, now, &mut out);
    assert_eq!(sent(&out), [(1281, String::new())]);
    b.on_packet(1281, &hex(ML1_LIST), now, &mut out).unwrap();
    assert_eq!(b.snapshot().mailbox.sent.as_ref().map(|s| s.len()), Some(2));
}

#[test]
fn gui_thu_bi_chan_khi_do_khoa_qua_so_luong_thieu_xu_hay_thieu_ten() {
    let refused = |task: MailTask, xu: i64| {
        let (mut b, mut out, now) = sender(xu);
        b.mail(task, now, &mut out);
        assert!(sent(&out).is_empty(), "{out:?}");
        lines(&out).join(" | ")
    };
    assert!(refused(draft("mania4", &[(1, 1)]), 5_000).contains("đã khóa giao dịch"));
    assert!(refused(draft("mania4", &[(0, 6)]), 5_000).contains("số lượng từ 1 tới 5"));
    assert!(refused(draft("mania4", &[(0, 1), (0, 1)]), 5_000).contains("hai lần"));
    assert!(refused(draft("mania4", &[(5, 1)]), 5_000).contains("túi trống"));
    assert!(refused(draft("mania4", &[(0, 1)]), 999).contains("cần 1.000 Xu"));
    assert!(refused(draft("  ", &[(0, 1)]), 5_000).contains("tên nhân vật nhận"));
    let seven: Vec<(i32, i32)> = (0..7).map(|s| (s, 1)).collect();
    assert!(refused(draft("mania4", &seven), 5_000).contains("tối đa 6"));
}

#[test]
fn gui_thu_loi_la_khong_bao_xong_cung_khong_bao_tu_choi() {
    let (mut b, mut out, now) = sender(5_000);
    b.mail(draft("mania4", &[(0, 1)]), now, &mut out);
    out.clear();
    let odd = Writer::new().u8(0).string("Nhân vật không tồn tại").build();
    b.on_packet(1280, &odd, now, &mut out).unwrap();
    assert_eq!(
        lines(&out),
        ["Gửi thư cho mania4: server trả lời \"Nhân vật không tồn tại\"; chưa rõ đã gửi chưa, xem Thư đã gửi"]
    );
    out.clear();
    b.mail(draft("mania4", &[(0, 1)]), now, &mut out);
    out.clear();
    let refused = Writer::new().u8(1).string("Không đủ xu").build();
    b.on_packet(1280, &refused, now, &mut out).unwrap();
    assert_eq!(lines(&out), ["Chưa gửi được thư cho mania4: Không đủ xu"]);
}
