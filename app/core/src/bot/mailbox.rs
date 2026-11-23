//! Hòm thư (14-npc.md#hòm-thư) ← MailBot of src/bot/mail.ts: c2s/1215 for the list, c2s/1216 to open a mail, c2s/1217
//! Nhận, c2s/1218 Nhận hết, c2s/1219 Xóa, from anywhere in the world (G1). Never c2s/1221 (Xóa hết): it deletes the
//! gifts not taken too (mail::DELETE_ALL), so MailTask has no such task and requests::build no arm for it. Gửi thư
//! (ML1): c2s/1280 with items of the bag, 1.000 Xu; c2s/1281 the mails sent.
use super::*;
use crate::mail::{self, MailAck, SendAnswer, SendItem, SentMail};

/// How long a step waits for the server (its answers took tens of ms in G1).
const MAIL_WAIT: Duration = Duration::from_secs(8);

/// What the mailbox waits for.
#[derive(Debug, Clone)]
enum MailStep {
    /// s2c/1215.
    List,
    /// s2c/1216 of `id`; with `claim`, Nhận follows once the room in the bag is checked.
    Open { id: i64, claim: bool },
    /// s2c/1217 of `id`. The money (s2c/46) and the bag (s2c/1187) come before it, and "Rương đã đầy" (s2c/1256) before
    /// an ok 0.
    Claim { id: i64 },
    /// s2c/1215, the last packet of Nhận hết, after the notice that says how many mails came; the money and the number
    /// of bag items before, to say what came.
    ClaimAll {
        money: Option<Currencies>,
        bag: usize,
    },
    /// s2c/1219 of `id`, then the next of `rest`; `done` mails deleted so far.
    Delete { id: i64, rest: Vec<i64>, done: u32 },
    /// s2c/1280 of c2s/1280 to `to`: Xu −1.000 (s2c/46) and the bag (s2c/1187) come before it. `what` is the items in
    /// words ("Tăng Kinh Nghiệm ×5").
    Send {
        to: String,
        subject: String,
        body: String,
        items: Vec<SendItem>,
        what: String,
    },
    /// s2c/1281.
    Sent,
}

/// The task under way: its step, until when it waits, what it is in words ("nhận thư "Quà Alpha Test""), the last
/// s2c/1256 since it went out, and whether Dừng was pressed while Xóa goes on.
pub(super) struct MailWait {
    step: MailStep,
    pub(super) until: Instant,
    task: String,
    notice: Option<String>,
    stopping: bool,
}

/// "5.000.000 Xu, 10.000 Lượng, Đá cấp 5 ×3": the money of a mail, then its items, the records of one item together.
fn contents(body: &MailBody) -> String {
    match body.items.is_empty() {
        true => "thư không có vật phẩm".into(),
        false => welfare::gift_list(&body.items),
    }
}

impl Bot {
    /// A task of the Hòm thư tab. Refused, with the reason in the log ("Chưa …: …") and nothing sent, in a battle and
    /// while another task of the mailbox waits; Nhận, Nhận hết and Xóa also while the character is busy (busy()) or
    /// something else waits for its own s2c/1256, whose answers theirs would look like. Then by what the list says: a
    /// mail not in it, Nhận of a mail without a gift or taken already or that does not fit in the bag, Xóa of a mail whose
    /// gift is not taken.
    pub fn mail(&mut self, task: MailTask, now: Instant, out: &mut Vec<Out>) {
        let what = match task {
            MailTask::List => "Chưa xem hòm thư",
            MailTask::Open(_) => "Chưa mở thư",
            MailTask::Claim(_) => "Chưa nhận thư",
            MailTask::ClaimAll => "Chưa nhận hết",
            MailTask::Delete(_) => "Chưa xoá thư",
            MailTask::Send(_) => "Chưa gửi thư",
            MailTask::Sent => "Chưa xem thư đã gửi",
        };
        let change = !matches!(task, MailTask::List | MailTask::Open(_) | MailTask::Sent);
        let planned = match self.mail_refusal(change, now) {
            Some(why) => Err(why),
            None => self.mail_plan(task),
        };
        match planned {
            Ok((step, words)) => self.mail_go(step, words, now, out),
            Err(why) => self.mail_said(format!("{what}: {why}"), out),
        }
    }

    /// The reason a task of the mailbox may not go now (Bot::mail).
    fn mail_refusal(&self, change: bool, now: Instant) -> Option<String> {
        if self.battle.is_some() {
            return Some("đang đánh, đợi hết trận".into());
        }
        if self.mail.is_some() {
            return Some("hòm thư đang đợi server trả lời việc trước".into());
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

    /// A task that changes the mailbox waits: Nhận (and the opening before it), Nhận hết, Xóa. The character counts as
    /// busy then (busy()), since their answers are notices too; the list and a mail opened only to read do not.
    pub(super) fn mail_changing(&self) -> bool {
        self.mail.as_ref().is_some_and(|w| {
            !matches!(
                w.step,
                MailStep::List | MailStep::Open { claim: false, .. } | MailStep::Sent
            )
        })
    }

    fn mail_header(&self, id: i64) -> Result<&MailHeader, String> {
        let Some(mails) = &self.snap.mailbox.mails else {
            return Err("chưa xem hòm thư".into());
        };
        mails
            .iter()
            .find(|m| m.id == id)
            .ok_or_else(|| format!("hòm thư không có thư {id}"))
    }

    /// The title of mail `id` as the log writes it ("Quà Alpha Test" with its quotes), its id when it is not listed.
    fn mail_title(&self, id: i64) -> String {
        self.snap
            .mailbox
            .mails
            .iter()
            .flatten()
            .find(|m| m.id == id)
            .map_or_else(|| format!("{id}"), |m| format!("\"{}\"", m.title))
    }

    /// The bag has room for the gift of opened mail `id` (mail::slots_for), or why not.
    fn mail_room(&self, id: i64) -> Result<(), String> {
        let body = self.snap.mailbox.opened.iter().find(|o| o.id == id);
        let (Some(body), Some(bag)) = (body, &self.snap.bag) else {
            return Err("chưa đọc được túi đồ".into());
        };
        let need = mail::slots_for(&body.items, &bag.items);
        let free = (bag.capacity - bag.items.len() as i32).max(0);
        match need as i32 > free {
            true => Err(format!(
                "cần {need} ô trống, túi còn {free}: dọn túi trước, hay bấm Nhận hết (server bỏ qua thư thiếu chỗ)"
            )),
            false => Ok(()),
        }
    }

    /// The first step of a task and what it is in words, or why it may not go by what the mailbox says.
    fn mail_plan(&self, task: MailTask) -> Result<(MailStep, String), String> {
        Ok(match task {
            MailTask::List => (MailStep::List, "xem hòm thư".into()),
            MailTask::Open(id) => {
                self.mail_header(id)?;
                let words = format!("mở thư {}", self.mail_title(id));
                (MailStep::Open { id, claim: false }, words)
            }
            MailTask::Claim(id) => {
                let m = self.mail_header(id)?;
                let title = self.mail_title(id);
                if !m.gift {
                    return Err(format!("thư {title} không có quà"));
                }
                if m.taken {
                    return Err(format!("thư {title} đã nhận quà rồi"));
                }
                // The items, for the room they need: opened first when they are not known yet (which marks it read).
                match self.snap.mailbox.opened.iter().any(|o| o.id == id) {
                    true => {
                        self.mail_room(id)
                            .map_err(|why| format!("{title}: {why}"))?;
                        (MailStep::Claim { id }, format!("nhận thư {title}"))
                    }
                    false => (
                        MailStep::Open { id, claim: true },
                        format!("mở thư {title} để đếm ô túi cần"),
                    ),
                }
            }
            MailTask::ClaimAll => {
                let Some(mails) = &self.snap.mailbox.mails else {
                    return Err("chưa xem hòm thư".into());
                };
                let gifts = mails.iter().filter(|m| m.gift && !m.taken).count();
                if gifts == 0 {
                    return Err("không có thư quà nào chưa nhận".into());
                }
                let step = MailStep::ClaimAll {
                    money: self.snap.currencies.clone(),
                    bag: self.snap.bag.as_ref().map_or(0, |b| b.items.len()),
                };
                (step, format!("nhận hết {gifts} thư quà"))
            }
            MailTask::Delete(ids) => {
                let mut list: Vec<i64> = vec![];
                for id in ids {
                    let m = self.mail_header(id)?;
                    if m.gift && !m.taken {
                        let title = self.mail_title(id);
                        return Err(format!(
                            "thư {title} còn quà chưa nhận, xoá đi là mất quà: nhận trước rồi mới xoá"
                        ));
                    }
                    if !list.contains(&id) {
                        list.push(id);
                    }
                }
                if list.is_empty() {
                    return Err("chưa chọn thư nào".into());
                }
                let id = list.remove(0);
                let words = match list.len() {
                    0 => format!("xoá thư {}", self.mail_title(id)),
                    n => format!("xoá {} thư", n + 1),
                };
                let step = MailStep::Delete {
                    id,
                    rest: list,
                    done: 0,
                };
                (step, words)
            }
            MailTask::Send(d) => self.mail_send_plan(d)?,
            MailTask::Sent => (MailStep::Sent, "xem thư đã gửi".into()),
        })
    }

    /// Gửi thư: the window's checks (a name, a subject, the lengths, at most 6 items), then by the bag and the money:
    /// each slot holds an item not trade-locked (field1 0 is locked: bought for Xu khóa, worn or upgraded; the game marks
    /// it with a padlock) and at least the quantity, no slot twice, 1.000 Xu for the fee; never to the character itself.
    fn mail_send_plan(&self, d: MailDraft) -> Result<(MailStep, String), String> {
        let (to, subject) = (d.to.trim().to_string(), d.subject.trim().to_string());
        if to.is_empty() {
            return Err("chưa có tên nhân vật nhận".into());
        }
        if to.eq_ignore_ascii_case(self.snap.name.trim()) {
            return Err("không gửi thư cho chính mình".into());
        }
        if subject.is_empty() {
            return Err("chưa có chủ đề".into());
        }
        if to.chars().count() > mail::TO_MAX
            || subject.chars().count() > mail::SUBJECT_MAX
            || d.body.chars().count() > mail::BODY_MAX
        {
            return Err(format!(
                "tên tối đa {} ký tự, chủ đề {}, nội dung {}",
                mail::TO_MAX,
                mail::SUBJECT_MAX,
                mail::BODY_MAX
            ));
        }
        if d.items.len() > mail::SEND_ITEMS {
            return Err(format!("một thư kèm tối đa {} món", mail::SEND_ITEMS));
        }
        let Some(bag) = &self.snap.bag else {
            return Err("chưa đọc được túi đồ".into());
        };
        let (mut items, mut shown) = (vec![], vec![]);
        for x in &d.items {
            if d.items.iter().filter(|y| y.slot == x.slot).count() > 1 {
                return Err(format!("ô {} được chọn hai lần", x.slot + 1));
            }
            let Some(it) = bag.items.iter().find(|i| i.slot as i32 == x.slot) else {
                return Err(format!("ô {} của túi trống", x.slot + 1));
            };
            let name = book()
                .get(it.item_id)
                .map_or_else(|| format!("#{}", it.item_id), |b| b.name.clone());
            if it.field1 == 0 {
                return Err(format!("{name} đã khóa giao dịch, không gửi được"));
            }
            if x.quantity < 1 || x.quantity > it.quantity {
                return Err(format!("{name}: số lượng từ 1 tới {}", it.quantity));
            }
            items.push(SendItem {
                slot: x.slot,
                uuid: it.uuid.clone(),
                quantity: x.quantity,
            });
            shown.push(ItemRecord {
                quantity: x.quantity,
                ..it.clone()
            });
        }
        if let Some(c) = &self.snap.currencies {
            if c.xu < mail::SEND_FEE {
                return Err(format!(
                    "cần {} Xu phí gửi, còn {}",
                    smith::grouped(mail::SEND_FEE),
                    smith::grouped(c.xu)
                ));
            }
        }
        let what = match shown.is_empty() {
            true => "không kèm vật phẩm".to_string(),
            false => welfare::gift_list(&shown),
        };
        let words = format!("gửi thư cho {to} ({what})");
        let step = MailStep::Send {
            to,
            subject,
            body: d.body,
            items,
            what,
        };
        Ok((step, words))
    }

    /// Sends the packet of `step` and waits MAIL_WAIT for its answer.
    fn mail_go(&mut self, step: MailStep, task: String, now: Instant, out: &mut Vec<Out>) {
        let (opcode, id) = match &step {
            MailStep::List => (1215, None),
            MailStep::Open { id, .. } => (1216, Some(*id)),
            MailStep::Claim { id } => (1217, Some(*id)),
            MailStep::ClaimAll { .. } => (1218, None),
            MailStep::Delete { id, .. } => (1219, Some(*id)),
            MailStep::Send { .. } => (1280, None),
            MailStep::Sent => (1281, None),
        };
        let payload = match &step {
            MailStep::Send {
                to,
                subject,
                body,
                items,
                ..
            } => Some(mail::send_request(to, subject, body, items)),
            _ => None,
        };
        let b = &mut self.snap.mailbox;
        (b.doing, b.busy_with) = (Some(format!("Đang {task}…")), id);
        self.mail = Some(MailWait {
            step,
            until: now + MAIL_WAIT,
            task,
            notice: None,
            stopping: false,
        });
        match payload {
            Some(p) => out.push(Out::Send(opcode, p)),
            None => Self::send(
                out,
                opcode,
                Ctx {
                    mail_id: id,
                    ..Ctx::default()
                },
            ),
        }
    }

    /// s2c/1280: the answer to Gửi thư; the fee (s2c/46) and the bag without the items (s2c/1187) came just before. The
    /// list of mails sent is asked again when next shown.
    pub(super) fn mail_send_answered(&mut self, a: SendAnswer, out: &mut Vec<Out>) {
        let Some(MailWait {
            step: MailStep::Send { to, what, .. },
            notice,
            ..
        }) = self
            .mail
            .take_if(|w| matches!(w.step, MailStep::Send { .. }))
        else {
            return;
        };
        // Only "Đã gửi thư cho mania4" with code 0 is measured (ML1): another text with code 0 is said as it is, neither
        // done nor refused, so a mail that did go is not sent twice.
        if a.code == 0 {
            self.snap.mailbox.sent = None;
        }
        let line = match a.code {
            0 if a.text.starts_with("Đã gửi") => format!(
                "Xong gửi thư cho {to}: {what}, phí {} Xu ({})",
                smith::grouped(mail::SEND_FEE),
                a.text
            ),
            0 => format!(
                "Gửi thư cho {to}: server trả lời \"{}\"; chưa rõ đã gửi chưa, xem Thư đã gửi",
                a.text
            ),
            _ => format!(
                "Chưa gửi được thư cho {to}: {}",
                match a.text.is_empty() {
                    true => notice.unwrap_or_else(|| format!("server trả mã {}", a.code)),
                    false => a.text,
                }
            ),
        };
        self.mail_end(Some(line), out);
    }

    /// s2c/1281: the mails sent, asked for (Thư đã gửi).
    pub(super) fn mail_sent_listed(&mut self, mails: Vec<SentMail>, out: &mut Vec<Out>) {
        let n = mails.len();
        self.snap.mailbox.sent = Some(mails);
        if matches!(self.mail.as_ref().map(|w| &w.step), Some(MailStep::Sent)) {
            self.mail_end(None, out);
            out.push(Out::Log(LogKind::Item, format!("Thư đã gửi: {n} thư")));
        }
    }

    /// The task ends, with `line` in the log and on the tab (`last`); without one it ends quietly (a mail opened).
    fn mail_end(&mut self, line: Option<String>, out: &mut Vec<Out>) {
        self.mail = None;
        let b = &mut self.snap.mailbox;
        (b.doing, b.busy_with) = (None, None);
        if let Some(line) = line {
            self.mail_said(line, out);
        }
    }

    fn mail_said(&mut self, line: String, out: &mut Vec<Out>) {
        self.snap.mailbox.last = Some(line.clone());
        out.push(Out::Log(LogKind::Item, line));
    }

    /// s2c/1215: the list, asked for or at the end of Nhận hết. Opened mails no longer listed are dropped, and the others
    /// follow the list on whether their gift is taken.
    pub(super) fn mail_listed(&mut self, mails: Vec<MailHeader>, out: &mut Vec<Out>) {
        let b = &mut self.snap.mailbox;
        b.opened.retain(|o| mails.iter().any(|m| m.id == o.id));
        for o in &mut b.opened {
            o.taken = mails.iter().any(|m| m.id == o.id && m.taken);
        }
        let (n, gifts) = (
            mails.len(),
            mails.iter().filter(|m| m.gift && !m.taken).count(),
        );
        b.unread = Some(mails.iter().any(|m| !m.read));
        b.mails = Some(mails);
        match self.mail.as_ref().map(|w| &w.step) {
            Some(MailStep::List) => {
                let line = match (n, gifts) {
                    (0, _) => "Hòm thư trống".to_string(),
                    (n, 0) => format!("Hòm thư: {n} thư, không còn quà chưa nhận"),
                    (n, g) => format!("Hòm thư: {n} thư, {g} thư còn quà chưa nhận"),
                };
                // The list is on the tab already: the line goes to the log only, not to `last`.
                self.mail_end(None, out);
                out.push(Out::Log(LogKind::Item, line));
            }
            Some(MailStep::ClaimAll { .. }) => self.mail_claimed_all(out),
            _ => {}
        }
    }

    /// The end of Nhận hết: the notice says how many mails came ("Đã nhận quà của 2 thư", "…, rương đã đầy", "Không có
    /// quà nào để nhận", "Rương đã đầy…"), s2c/46 and s2c/1187 what.
    fn mail_claimed_all(&mut self, out: &mut Vec<Out>) {
        let Some(MailWait {
            step: MailStep::ClaimAll { money, bag },
            notice,
            ..
        }) = self.mail.take()
        else {
            return;
        };
        let text = notice.unwrap_or_default();
        let mut parts: Vec<String> = vec![];
        if let (Some(before), Some(now)) = (&money, &self.snap.currencies) {
            for (was, is, name) in [
                (before.xu, now.xu, "Xu"),
                (before.xu_khoa, now.xu_khoa, "Xu khóa"),
                (before.luong, now.luong, "Lượng"),
            ] {
                if is != was {
                    parts.push(format!("{name} +{}", smith::grouped(is - was)));
                }
            }
        }
        let items = self.snap.bag.as_ref().map_or(0, |b| b.items.len());
        if items != bag {
            parts.push(format!("túi {bag} → {items} món"));
        }
        let left = self
            .snap
            .mailbox
            .mails
            .iter()
            .flatten()
            .filter(|m| m.gift && !m.taken)
            .count();
        if left > 0 {
            parts.push(format!("còn {left} thư quà chưa nhận"));
        }
        let line = match (mail::claimed_count(&text), text.is_empty()) {
            (0, true) => "Chưa nhận được thư nào: server không báo gì".to_string(),
            (0, false) => format!("Chưa nhận được thư nào: {text}"),
            _ if parts.is_empty() => format!("Xong nhận hết: {text}"),
            _ => format!("Xong nhận hết: {text} ({})", parts.join("; ")),
        };
        self.mail_end(Some(line), out);
    }

    /// s2c/1216: a mail opened, which the server marks read. Nhận of a mail not opened before goes on from here once the
    /// bag has the room.
    pub(super) fn mail_opened(&mut self, body: MailBody, now: Instant, out: &mut Vec<Out>) {
        let id = body.id;
        let b = &mut self.snap.mailbox;
        if let Some(m) = b.mails.iter_mut().flatten().find(|m| m.id == id) {
            m.read = true;
        }
        // s2c/1220 follows and says the same (G1); without it the mark would stay on after the last unread is opened.
        if let Some(mails) = &b.mails {
            b.unread = Some(mails.iter().any(|m| !m.read));
        }
        match b.opened.iter_mut().find(|o| o.id == id) {
            Some(o) => *o = body,
            None => b.opened.push(body),
        }
        let claim = match self.mail.as_ref().map(|w| &w.step) {
            Some(MailStep::Open { id: at, claim }) if *at == id => *claim,
            _ => return,
        };
        if !claim {
            return self.mail_end(None, out);
        }
        let title = self.mail_title(id);
        match self.mail_room(id) {
            Ok(()) => self.mail_go(
                MailStep::Claim { id },
                format!("nhận thư {title}"),
                now,
                out,
            ),
            Err(why) => self.mail_end(Some(format!("Chưa nhận thư {title}: {why}")), out),
        }
    }

    /// s2c/1217: Nhận of a mail. Its money (s2c/46) and items (s2c/1187) came just before; an ok 0 after "Rương đã đầy".
    pub(super) fn mail_claimed(&mut self, a: MailAck, out: &mut Vec<Out>) {
        let b = &mut self.snap.mailbox;
        if a.ok {
            if let Some(m) = b.mails.iter_mut().flatten().find(|m| m.id == a.id) {
                m.taken = true;
            }
            if let Some(o) = b.opened.iter_mut().find(|o| o.id == a.id) {
                o.taken = true;
            }
        }
        let Some(notice) = self
            .mail
            .as_ref()
            .filter(|w| matches!(w.step, MailStep::Claim { id } if id == a.id))
            .map(|w| w.notice.clone())
        else {
            return;
        };
        let title = self.mail_title(a.id);
        let line = match a.ok {
            true => {
                let body = self.snap.mailbox.opened.iter().find(|o| o.id == a.id);
                format!(
                    "Xong nhận thư {title}: {}",
                    body.map_or_else(String::new, contents)
                )
            }
            false => format!(
                "Chưa nhận được thư {title}: server từ chối{}",
                notice.map_or_else(String::new, |n| format!(" ({n})"))
            ),
        };
        self.mail_end(Some(line), out);
    }

    /// s2c/1219: Xóa of a mail; the next one goes, or the task ends.
    pub(super) fn mail_deleted(&mut self, a: MailAck, now: Instant, out: &mut Vec<Out>) {
        let title = self.mail_title(a.id);
        if a.ok {
            let b = &mut self.snap.mailbox;
            if let Some(mails) = b.mails.as_mut() {
                mails.retain(|m| m.id != a.id);
            }
            b.opened.retain(|o| o.id != a.id);
        }
        let Some(MailWait {
            step: MailStep::Delete { rest, done, .. },
            stopping,
            ..
        }) = self
            .mail
            .take_if(|w| matches!(w.step, MailStep::Delete { id, .. } if id == a.id))
        else {
            return;
        };
        let done = done + a.ok as u32;
        let so_far = match done {
            0 => String::new(),
            n => format!(" (đã xoá {n} thư)"),
        };
        if !a.ok {
            let line = format!("Chưa xoá được thư {title}: server từ chối{so_far}");
            return self.mail_end(Some(line), out);
        }
        if rest.is_empty() || stopping {
            let line = match (done, rest.len()) {
                (1, 0) => format!("Xong xoá thư {title}"),
                (n, 0) => format!("Xong xoá {n} thư"),
                (n, left) => format!("Xong xoá {n} thư; đã dừng, còn {left} thư chưa xoá"),
            };
            return self.mail_end(Some(line), out);
        }
        let (id, rest) = (rest[0], rest[1..].to_vec());
        let task = format!(
            "xoá thư {} ({} còn lại)",
            self.mail_title(id),
            rest.len() + 1
        );
        self.mail_go(MailStep::Delete { id, rest, done }, task, now, out);
    }

    /// s2c/1256 while Nhận or Nhận hết waits, kept when it is their answer: "Rương đã đầy…" for Nhận; "Đã nhận quà của 2
    /// thư", "…, rương đã đầy", "Không có quà nào để nhận", "Rương đã đầy…" for Nhận hết. Another notice that comes
    /// meanwhile does not take its place.
    pub(super) fn mail_notice(&mut self, text: &str) {
        let Some(w) = self.mail.as_mut() else {
            return;
        };
        let answer = match w.step {
            MailStep::Claim { .. } => mail::is_full(text),
            MailStep::ClaimAll { .. } => {
                mail::claimed_count(text) > 0
                    || mail::is_full(text)
                    || text.contains("Không có quà")
            }
            // How the server refuses a mail (a name that is no character, too little Xu) is not measured: any notice
            // that comes meanwhile is kept, and said if s2c/1280 does not come.
            MailStep::Send { .. } => true,
            _ => false,
        };
        if answer {
            w.notice = Some(text.to_string());
        }
    }

    /// s2c/1222: a mail just come (the gift of a code, money from the market) goes on top of the list, not read yet.
    pub(super) fn mail_arrived(&mut self, m: &MailHeader) {
        if !m.read {
            self.snap.mailbox.unread = Some(true);
        }
        if let Some(mails) = self.snap.mailbox.mails.as_mut() {
            if !mails.iter().any(|x| x.id == m.id) {
                mails.insert(0, m.clone());
            }
        }
    }

    /// The task waited MAIL_WAIT without its answer.
    pub(super) fn mail_timer(&mut self, now: Instant, out: &mut Vec<Out>) {
        let Some((task, notice, send)) = self.mail.as_ref().filter(|w| w.until <= now).map(|w| {
            (
                w.task.clone(),
                w.notice.clone(),
                matches!(w.step, MailStep::Send { .. }),
            )
        }) else {
            return;
        };
        let line = match (send, notice) {
            (true, Some(n)) => format!("Chưa gửi được thư: {n}"),
            _ => format!(
                "Hòm thư không trả lời sau {} s: thôi {task}",
                MAIL_WAIT.as_secs()
            ),
        };
        self.mail_end(Some(line), out);
    }

    /// Dừng: Xóa ends after the mail sent; the other tasks are one packet and end with its answer.
    pub(super) fn mail_stop(&mut self) {
        if let Some(w) = self
            .mail
            .as_mut()
            .filter(|w| matches!(w.step, MailStep::Delete { .. }))
        {
            w.stopping = true;
        }
    }
}
