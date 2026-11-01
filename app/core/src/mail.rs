//! Mã quà tặng and the mail it brings (G1, 01/11/2026; docs/app/events/14-npc.md#mã-quà-tặng) ← src/protocol/mail.ts.
//! c2s/1223 (string code) → s2c/1223 (u8 ok; string text); a good code then s2c/1222 (the gift's mail) and s2c/1220, a
//! refused one s2c/1256 with the same text. Both work from anywhere once in the world: no NPC, no window.
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
