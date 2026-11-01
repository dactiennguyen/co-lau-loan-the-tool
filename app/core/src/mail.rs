//! Mã quà tặng and Hòm thư (G1, 01/11/2026; docs/app/events/14-npc.md#mã-quà-tặng, #hòm-thư) ← src/protocol/mail.ts.
//! c2s/1223 (string code) → s2c/1223 (u8 ok; string text); a good code then s2c/1222 (the gift's mail) and s2c/1220, a
//! refused one s2c/1256 with the same text. The mailbox: c2s/1215 list, c2s/1216 open, c2s/1217 Nhận, c2s/1218 Nhận
//! hết, c2s/1219 Xóa. All of them work from anywhere once in the world: no NPC, no window. c2s/1221 (Xóa hết) deletes
//! every mail, gifts not taken too: requests::build has no arm for it, on purpose (DELETE_ALL).
use crate::items::{book, item_record, ItemRecord};
use crate::protocol::{Reader, Result};
use serde::Serialize;
use std::time::Duration;

/// The longest code the client's box takes (setMaxLength(32) in com.g.m.sqcc).
pub const CODE_MAX: usize = 32;
/// The server's lock: after this many codes refused in a row, every code (a good one too) is refused for LOCK.
pub const WRONG_IN_A_ROW: u32 = 10;
pub const LOCK: Duration = Duration::from_secs(5 * 60);

/// A code as the client sends it: spaces cut at both ends, upper case (G1: "  denbu  " went out as "DENBU").
pub fn normalize_code(code: &str) -> std::result::Result<String, String> {
    let c = code.trim().to_uppercase();
    if c.is_empty() {
        return Err("mã trống".into());
    }
    if c.chars().count() > CODE_MAX {
        return Err(format!("mã \"{c}\" dài hơn {CODE_MAX} ký tự"));
    }
    Ok(c)
}

/// The words of s2c/1223 when the server blocks every code for LOCK ("Bạn nhập mã quá nhanh, vui lòng thử lại sau").
pub fn is_locked(text: &str) -> bool {
    text.contains("nhập mã quá nhanh")
}

/// s2c/1223: whether the code was taken, and the server's words ("Nhập mã thành công, phần thưởng đã được gửi vào hộp
/// thư", "Mã không tồn tại", "Nhân vật này đã dùng mã rồi").
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct GiftAnswer {
    pub ok: bool,
    pub text: String,
}
pub fn gift_code_result(p: &[u8]) -> Result<GiftAnswer> {
    let mut r = Reader::new(p);
    let ok = r.u8()? == 1;
    let text = r.string()?;
    r.finish(GiftAnswer { ok, text }, "s2c/1223")
}

/// One mail of s2c/1215, and s2c/1222 (a new one) ← mailHeader. `kind` was 1 for every gift; `sent_at` is ms, server
/// time; `last` was 0 [Chưa rõ].
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MailHeader {
    pub id: i64,
    pub kind: u8,
    pub title: String,
    pub sender: String,
    pub read: bool,
    pub gift: bool,
    pub taken: bool,
    pub sent_at: i64,
    pub last: i64,
}
fn mail_header(r: &mut Reader) -> Result<MailHeader> {
    Ok(MailHeader {
        id: r.i64()?,
        kind: r.u8()?,
        title: r.string()?,
        sender: r.string()?,
        read: r.u8()? == 1,
        gift: r.u8()? == 1,
        taken: r.u8()? == 1,
        sent_at: r.i64()?,
        last: r.i64()?,
    })
}
/// s2c/1222: a mail just come, the gift of a code.
pub fn new_mail(p: &[u8]) -> Result<MailHeader> {
    let mut r = Reader::new(p);
    let m = mail_header(&mut r)?;
    r.finish(m, "s2c/1222")
}

/// s2c/1215: the mailbox, after c2s/1215 and after Nhận hết; the newest mail first (G1).
pub fn mail_list(p: &[u8]) -> Result<Vec<MailHeader>> {
    let mut r = Reader::new(p);
    let n = r.i32()?.max(0);
    let mails = (0..n)
        .map(|_| mail_header(&mut r))
        .collect::<Result<Vec<_>>>()?;
    r.finish(mails, "s2c/1215")
}

/// s2c/1216: a mail opened (which marks it read) ← mailBody. Items as in the bag, slot 0xff; money is items too
/// (money_item), the sum in `quantity`; `field1` 0 is locked, as in the bag.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MailBody {
    pub id: i64,
    pub title: String,
    pub body: String,
    pub sender: String,
    pub taken: bool,
    pub items: Vec<ItemRecord>,
}
pub fn mail_body(p: &[u8]) -> Result<MailBody> {
    let mut r = Reader::new(p);
    let (id, title, body, sender) = (r.i64()?, r.string()?, r.string()?, r.string()?);
    let taken = r.u8()? == 1;
    let n = r.i32()?.max(0);
    let items = (0..n)
        .map(|_| item_record(&mut r))
        .collect::<Result<Vec<_>>>()?;
    let m = MailBody {
        id,
        title,
        body,
        sender,
        taken,
        items,
    };
    r.finish(m, "s2c/1216")
}

/// s2c/1217 (Nhận) and s2c/1219 (Xóa): the mail and whether it was done ← mailAck.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct MailAck {
    pub id: i64,
    pub ok: bool,
}
pub fn mail_ack(p: &[u8], opcode: i32) -> Result<MailAck> {
    let mut r = Reader::new(p);
    let (id, ok) = (r.i64()?, r.u8()? == 1);
    r.finish(MailAck { id, ok }, &format!("s2c/{opcode}"))
}

/// Xóa hết: never sent. The server deletes every mail with it, gifts not taken too, and they are gone (manina2, G1).
pub const DELETE_ALL: i32 = 1221;

/// The money a mail item can be (MONEY_ITEMS): Xu #40, Xu khóa #41, Lượng #42.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Money {
    Xu,
    XuKhoa,
    Luong,
}
impl Money {
    pub fn name(self) -> &'static str {
        match self {
            Money::Xu => "Xu",
            Money::XuKhoa => "Xu khóa",
            Money::Luong => "Lượng",
        }
    }
}
/// The money a mail item is, None for any other item.
pub fn money_item(item_id: i32) -> Option<Money> {
    match item_id {
        40 => Some(Money::Xu),
        41 => Some(Money::XuKhoa),
        42 => Some(Money::Luong),
        _ => None,
    }
}

/// The notices of Nhận hết: "Đã nhận quà của 2 thư", "Đã nhận quà của 1 thư, rương đã đầy" → 2, 1; "Không có quà nào
/// để nhận" and anything else → 0 (claimedCount).
pub fn claimed_count(text: &str) -> u32 {
    text.split_once("Đã nhận quà của ")
        .and_then(|(_, rest)| rest.split_once(" thư"))
        .and_then(|(n, _)| n.trim().parse().ok())
        .unwrap_or(0)
}

/// The notice before s2c/1217 ok 0, and the end of Nhận hết when nothing fitted: "Rương đã đầy. Vui lòng bỏ bớt đồ ra
/// hoặc mua thêm ngăn chứa"; also in "Đã nhận quà của 1 thư, rương đã đầy".
pub fn is_full(text: &str) -> bool {
    text.to_lowercase().contains("rương đã đầy")
}

/// The bag slots a mail needs (slotsNeeded, G1): none for money; none for an item that stacks and is in the bag already
/// with the same lock (it joins that stack; two locks in one stack is untried); one for each other record (stones do
/// not stack, and three Đá cấp 5 came as three records). A stack that would pass its size (999 for most items) is not
/// counted: what the server does then is not measured, and it refuses Nhận itself when the bag has no room. Items are (item id, field1); `stack_of` gives an item's stack
/// size (it1 of data/items.json).
pub fn slots_needed(
    mail: impl IntoIterator<Item = (i32, u8)>,
    bag: &[(i32, u8)],
    stack_of: impl Fn(i32) -> i32,
) -> u32 {
    let mut joined: Vec<(i32, u8)> = vec![];
    let mut slots = 0;
    for key in mail {
        if money_item(key.0).is_some() {
            continue;
        }
        let stacks = stack_of(key.0) > 1;
        if stacks && (joined.contains(&key) || bag.contains(&key)) {
            continue;
        }
        slots += 1;
        if stacks {
            joined.push(key);
        }
    }
    slots
}

/// slots_needed of a mail's items against a bag, with the stack sizes of the item table.
pub fn slots_for(items: &[ItemRecord], bag: &[ItemRecord]) -> u32 {
    let bag: Vec<(i32, u8)> = bag.iter().map(|i| (i.item_id, i.field1)).collect();
    slots_needed(items.iter().map(|i| (i.item_id, i.field1)), &bag, |id| {
        book().get(id).map_or(1, |d| d.stack)
    })
}
