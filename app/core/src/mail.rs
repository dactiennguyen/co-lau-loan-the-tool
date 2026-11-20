//! Mã quà tặng, Hòm thư and Nhiệm vụ hàng ngày (G1, NP1, 01/11/2026; docs/app/events/14-npc.md#mã-quà-tặng, #hòm-thư,
//! #nhiệm-vụ-hàng-ngày) ← src/protocol/mail.ts.
//! c2s/1223 (string code) → s2c/1223 (u8 ok; string text); a good code then s2c/1222 (the gift's mail) and s2c/1220, a
//! refused one s2c/1256 with the same text. The mailbox: c2s/1215 list, c2s/1216 open, c2s/1217 Nhận, c2s/1218 Nhận
//! hết, c2s/1219 Xóa. All of them work from anywhere once in the world: no NPC, no window. c2s/1221 (Xóa hết) deletes
//! every mail, gifts not taken too: requests::build has no arm for it, on purpose (DELETE_ALL).
use crate::items::{book, item_record, ItemRecord};
use crate::protocol::{err, Reader, Result};
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
    crate::items::item_layouts(|| {
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
    })
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

// ---------------------------------------------------------------------------------------------------------------------
// Nhiệm vụ hàng ngày at Hương Lão (NPC 102 of M1): line 2 of his menu says "Hôm nay con đã nhận N/3 nhiệm vụ hàng ngày."
// with one line 0, Nhận nhiệm vụ, or Hủy nhiệm vụ hiện tại while one is held; once the quest held is done, two lines: 0
// Hoàn thành nhiệm vụ, 1 Hủy nhiệm vụ hiện tại (NP1). Each is done at once, without asking (DAILY of mail.ts).

/// Line 2 of Hương Lão's menu.
pub const DAILY_PATH: u8 = 2;
/// "Nhận nhiệm vụ", line 0 while no quest is held.
pub fn is_daily_accept(label: &str) -> bool {
    label == "Nhận nhiệm vụ"
}
/// "Hủy nhiệm vụ hiện tại".
pub fn is_daily_cancel(label: &str) -> bool {
    label.starts_with("Hủy nhiệm vụ")
}
/// "Hoàn thành nhiệm vụ", line 0 once the quest held is done (NP1).
pub fn is_daily_complete(label: &str) -> bool {
    label.contains("Hoàn thành")
}
/// The notice of Nhận, before its s2c/1195: "Nhận nhiệm vụ hàng ngày thành công." (G1).
pub fn is_daily_accepted(text: &str) -> bool {
    text.starts_with("Nhận nhiệm vụ hàng ngày thành công")
}

/// A daily quest of s2c/1195 kind 1: `template` has %d where the progress goes ("Thu thập %d xu khóa từ đánh quái").
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DailyQuest {
    pub id: i32,
    pub name: String,
    pub template: String,
    pub progress: i32,
    pub target: i32,
}
impl DailyQuest {
    /// "Thu thập 218/2100 xu khóa từ đánh quái", as the Phụ tab of the game draws it (dailyText).
    pub fn text(&self) -> String {
        self.template
            .replacen("%d", &format!("{}/{}", self.progress, self.target), 1)
    }
    pub fn finished(&self) -> bool {
        self.progress >= self.target
    }
}

/// s2c/1195, the daily quest held (dailyQuest): at login, when one is taken or dropped, after Hoàn thành, and when its
/// progress moves (right after a pickup of Xu khóa for Nhặt xu, NP1).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Daily {
    /// Kind 0: none held.
    None,
    /// Kind 1: the quest held.
    Quest(DailyQuest),
    /// Kind 2: done after Hoàn thành nhiệm vụ, its rewards ("727 kinh nghiệm", "590 xu khóa") already given by s2c/10 and
    /// s2c/46 before it; none is held then.
    Done { name: String, rewards: Vec<String> },
    /// Kind 3: the progress of the quest held.
    Progress { progress: i32, target: i32 },
}
pub fn daily_quest(p: &[u8]) -> Result<Daily> {
    let mut r = Reader::new(p);
    let d = match r.u8()? {
        0 => Daily::None,
        1 => Daily::Quest(DailyQuest {
            id: r.i32()?,
            name: r.string()?,
            template: r.string()?,
            progress: r.i32()?,
            target: r.i32()?,
        }),
        2 => {
            let name = r.string()?;
            let n = r.i32()?;
            let rewards = (0..n.max(0))
                .map(|_| r.string())
                .collect::<Result<Vec<_>>>()?;
            Daily::Done { name, rewards }
        }
        3 => Daily::Progress {
            progress: r.i32()?,
            target: r.i32()?,
        },
        kind => {
            return err(
                "PAYLOAD_SCHEMA",
                format!("s2c/1195: kind {kind} not seen yet"),
            )
        }
    };
    r.finish(d, "s2c/1195")
}
/// The quest held after a s2c/1195 (dailyAfter): the new one, none, or `held` with the progress of kind 3.
pub fn daily_after(held: Option<&DailyQuest>, d: &Daily) -> Option<DailyQuest> {
    match d {
        Daily::None | Daily::Done { .. } => None,
        Daily::Quest(q) => Some(q.clone()),
        Daily::Progress { progress, target } => held.map(|q| DailyQuest {
            progress: *progress,
            target: *target,
            ..q.clone()
        }),
    }
}
/// "Hôm nay con đã nhận 1/3 nhiệm vụ hàng ngày." → (1, 3) (dailyTaken).
pub fn daily_taken(text: &str) -> Option<(i32, i32)> {
    // The digits at the start of `s` as a number, and where they end.
    let digits = |s: &str| -> Option<(i32, usize)> {
        let end = s.find(|c: char| !c.is_ascii_digit()).unwrap_or(s.len());
        s[..end].parse().ok().map(|n| (n, end))
    };
    text.match_indices("đã nhận ").find_map(|(i, pat)| {
        let rest = &text[i + pat.len()..];
        let (taken, end) = digits(rest)?;
        let (max, _) = digits(rest[end..].strip_prefix('/')?)?;
        Some((taken, max))
    })
}
