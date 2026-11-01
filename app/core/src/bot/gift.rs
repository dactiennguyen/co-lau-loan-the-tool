//! Mã quà tặng (14-npc.md#mã-quà-tặng) ← GiftBot of src/bot/mail.ts: c2s/1223 for each code, s2c/1223 for the answer,
//! s2c/1222 for the mail a good code brings. From anywhere in the world, without Hương Lão or the Phúc lợi window (G1).
use super::*;
use crate::mail::{self, GiftAnswer, MailHeader};
use std::sync::MutexGuard;

/// Codes refused in a row after which the bot sends no more: half of the server's lock (10 in a row,
/// mail::WRONG_IN_A_ROW), as `--max-wrong` of `npm run gift`. The count outlives the session (GiftMemory); codes typed
/// on the phone are not in it, and nothing says how many tries are left (G1).
pub const GIFT_MAX_WRONG: u32 = 5;
/// How long a code waits for s2c/1223 (it took 27–85 ms in G1), how long a good one waits for its mail (s2c/1222), and
/// the pause between two codes (`--gap-ms` of `npm run gift`).
const GIFT_WAIT: Duration = Duration::from_secs(8);
const GIFT_SETTLE: Duration = Duration::from_millis(500);
const GIFT_GAP: Duration = Duration::from_millis(1500);
/// The server sends a refusal twice, in s2c/1223 and in a s2c/1256 with the same words: the notice within this long is
/// not logged again.
const GIFT_ECHO: Duration = Duration::from_secs(2);

/// What the code sent last waits for: its answer, the mail of a good code, or the pause before the next code.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum GiftStage {
    Answer,
    Mail,
    Gap,
}

/// The run under way: the code of Snapshot.gift it is on (`at`: the one sent, or in the pause the next one), what it
/// waits for and until when, and whether Dừng was pressed while it waited.
pub(super) struct Gift {
    at: usize,
    stage: GiftStage,
    pub(super) until: Instant,
    stopping: bool,
}

/// The GiftMemory of the account, also when a thread that held it panicked.
fn memory(m: &Mutex<GiftMemory>) -> MutexGuard<'_, GiftMemory> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

impl Bot {
    /// Snapshot::gift_limits: the count and the lock of GiftMemory, the lock only while it lasts.
    pub(super) fn gift_limits(&self) -> GiftLimits {
        let m = *memory(&self.options.gift);
        GiftLimits {
            wrong: m.wrong,
            max_wrong: GIFT_MAX_WRONG,
            locked_until: m.locked.map(|l| l.1).filter(|&until| until > epoch_ms()),
        }
    }

    /// Why no code may go now: busy (busy() counts a run of codes too), something else waiting for its own s2c/1256
    /// (whose answer a refusal would look like), the server's lock, or GIFT_MAX_WRONG refused in a row.
    fn gift_refusal(&self, now: Instant) -> Option<String> {
        if let Some(why) = self.busy() {
            return Some(why.into());
        }
        let waiting = self.shopping.is_some()
            || self.item_wait.is_some()
            || self.repairing.is_some()
            || self.picked_at.is_some_and(|t| now < t + PICK_ANSWER);
        if waiting {
            return Some("đang đợi server trả lời việc khác, thử lại sau ít giây".into());
        }
        let m = *memory(&self.options.gift);
        if let Some((until, _)) = m.locked.filter(|l| now < l.0) {
            return Some(format!(
                "server đang chặn nhập mã, còn {}",
                duration_text(until - now)
            ));
        }
        (m.wrong >= GIFT_MAX_WRONG).then(|| {
            format!(
                "đã có {} mã bị từ chối liền nhau. Server chặn mọi mã 5 phút khi sai {} lần liền, nên app dừng ở {}; \
                 muốn thử tiếp thì bấm Đếm lại từ 0",
                m.wrong,
                mail::WRONG_IN_A_ROW,
                GIFT_MAX_WRONG
            )
        })
    }

    /// Mã quà tặng: `codes` as typed (any case, spaces at the ends) go out one by one, trimmed and upper-cased as the
    /// client sends them, each once. Refused, with the reason in the log and nothing sent, when none is left once the
    /// empty ones are dropped, when one is longer than mail::CODE_MAX, and for gift_refusal. Rewards go to the mailbox.
    pub fn redeem(&mut self, codes: &[String], now: Instant, out: &mut Vec<Out>) {
        let mut list: Vec<String> = vec![];
        for c in codes.iter().filter(|c| !c.trim().is_empty()) {
            match mail::normalize_code(c) {
                Ok(c) if !list.contains(&c) => list.push(c),
                Ok(_) => {}
                Err(e) => {
                    return out.push(Out::Log(LogKind::Item, format!("Chưa nhập mã: {e}")));
                }
            }
        }
        let why = match list.is_empty() {
            true => Some("chưa có mã nào".to_string()),
            false => self.gift_refusal(now),
        };
        if let Some(why) = why {
            return out.push(Out::Log(LogKind::Item, format!("Chưa nhập mã: {why}")));
        }
        self.gift_runs += 1;
        out.push(Out::Log(
            LogKind::Item,
            format!(
                "Bắt đầu nhập {} mã quà tặng: {}",
                list.len(),
                list.join(", ")
            ),
        ));
        self.snap.gift = Some(GiftRun {
            id: self.gift_runs,
            codes: list
                .into_iter()
                .map(|code| GiftCode {
                    code,
                    ok: None,
                    text: String::new(),
                    mail: None,
                })
                .collect(),
            sending: None,
            doing: String::new(),
            done: None,
            started_at: epoch_ms(),
            ended_at: None,
        });
        self.gift = Some(Gift {
            at: 0,
            stage: GiftStage::Gap,
            until: now,
            stopping: false,
        });
        self.gift_send(now, out);
    }

    /// Đếm lại từ 0: forgets the codes refused in a row, as `--reset-wrong` of `npm run gift`, for when the user knows
    /// the count is stale (a good code typed on the phone). The server's lock stays. Refused while a run is on.
    pub fn gift_reset(&mut self, out: &mut Vec<Out>) {
        if self.gift.is_some() {
            return out.push(Out::Log(
                LogKind::Item,
                "Chưa đếm lại: đang nhập mã quà tặng, bấm Dừng trước".into(),
            ));
        }
        let before = std::mem::take(&mut memory(&self.options.gift).wrong);
        out.push(Out::Log(
            LogKind::Item,
            format!("Đếm lại số mã bị từ chối liền nhau từ 0 (trước đó {before})"),
        ));
    }

    /// c2s/1223 for the code the run is on.
    fn gift_send(&mut self, now: Instant, out: &mut Vec<Out>) {
        let (Some(g), Some(r)) = (self.gift.as_mut(), self.snap.gift.as_mut()) else {
            return;
        };
        let code = r.codes[g.at].code.clone();
        (r.doing, r.sending) = (format!("Gửi mã {code}"), Some(g.at));
        (g.stage, g.until) = (GiftStage::Answer, now + GIFT_WAIT);
        // The refusal of the code before had its s2c/1256 by now: a later notice with its words is another's.
        self.gift_echo = None;
        Self::send(
            out,
            1223,
            Ctx {
                code: Some(&code),
                ..Ctx::default()
            },
        );
    }

    /// The codes of the run from index `from` on: "; chưa gửi: A, B", or nothing.
    fn gift_unsent(&self, from: usize) -> String {
        let left: Vec<&str> = self.snap.gift.as_ref().map_or(vec![], |r| {
            r.codes.iter().skip(from).map(|c| c.code.as_str()).collect()
        });
        match left.is_empty() {
            true => String::new(),
            false => format!("; chưa gửi: {}", left.join(", ")),
        }
    }

    /// An answer in GiftMemory, also one that came after its code stopped waiting: a good code starts the count again,
    /// a refused one adds to it and keeps its words for its s2c/1256, and the server's lock is kept for mail::LOCK (the
    /// count taken as back to 0 after it, as GiftBot does [Chưa rõ]). True for the lock.
    fn gift_count(&mut self, a: &GiftAnswer, now: Instant) -> bool {
        let mut m = memory(&self.options.gift);
        if a.ok {
            m.wrong = 0;
            return false;
        }
        m.wrong += 1;
        self.gift_echo = Some((a.text.clone(), now));
        if !mail::is_locked(&a.text) {
            return false;
        }
        let until = epoch_ms() + mail::LOCK.as_millis() as u64;
        (m.locked, m.wrong) = (Some((now + mail::LOCK, until)), 0);
        true
    }

    /// s2c/1223: the answer to the code sent last. A good code waits GIFT_SETTLE for its mail; a refused one counts
    /// towards GIFT_MAX_WRONG, and the server's lock ends the run at once. One that comes when no code waits (after
    /// GIFT_WAIT) is logged and counted only.
    pub(super) fn gift_answer(&mut self, a: GiftAnswer, now: Instant, out: &mut Vec<Out>) {
        let locked = self.gift_count(&a, now);
        let Some(at) = self
            .gift
            .as_ref()
            .filter(|g| g.stage == GiftStage::Answer)
            .map(|g| g.at)
        else {
            return out.push(Out::Log(
                LogKind::Server,
                format!("Mã quà tặng: {}", a.text),
            ));
        };
        let Some(r) = self.snap.gift.as_mut() else {
            return;
        };
        let c = &mut r.codes[at];
        (c.ok, c.text) = (Some(a.ok), a.text.clone());
        let code = c.code.clone();
        r.sending = None;
        if a.ok {
            r.doing = format!("Mã {code} được, đợi thư quà");
            out.push(Out::Log(
                LogKind::Item,
                format!("Xong mã {code}: {}", a.text),
            ));
            if let Some(g) = self.gift.as_mut() {
                (g.stage, g.until) = (GiftStage::Mail, now + GIFT_SETTLE);
            }
            return;
        }
        out.push(Out::Log(
            LogKind::Item,
            format!("Mã {code} bị từ chối: {}", a.text),
        ));
        let unsent = self.gift_unsent(at + 1);
        if locked {
            let line = format!("server đang chặn nhập mã 5 phút, kể cả mã đúng{unsent}");
            return self.gift_end(line, out);
        }
        let wrong = memory(&self.options.gift).wrong;
        let stopping = self.gift.as_ref().is_some_and(|g| g.stopping);
        if wrong >= GIFT_MAX_WRONG && !unsent.is_empty() && !stopping {
            let line = format!(
                "{wrong} mã bị từ chối liền nhau, dừng trước khi bị chặn (sai {} lần liền thì server chặn 5 phút){unsent}",
                mail::WRONG_IN_A_ROW
            );
            return self.gift_end(line, out);
        }
        self.gift_next(now, out);
    }

    /// s2c/1222: a new mail, as the client says "Bạn có thư mới: …". While a good code waits for it, it is that
    /// code's, and the next code goes after GIFT_GAP.
    pub(super) fn gift_mail(&mut self, m: MailHeader, now: Instant, out: &mut Vec<Out>) {
        out.push(Out::Log(
            LogKind::Item,
            format!("Thư mới: {} (từ {})", m.title, m.sender),
        ));
        let Some(at) = self
            .gift
            .as_ref()
            .filter(|g| g.stage == GiftStage::Mail)
            .map(|g| g.at)
        else {
            return;
        };
        if let Some(r) = self.snap.gift.as_mut() {
            r.codes[at].mail = Some(m.title);
        }
        self.gift_next(now, out);
    }

    /// After an answer (and the mail of a good code): the next code after GIFT_GAP, else the end of the run.
    fn gift_next(&mut self, now: Instant, out: &mut Vec<Out>) {
        let Some((at, stopping)) = self.gift.as_ref().map(|g| (g.at, g.stopping)) else {
            return;
        };
        if stopping {
            let line = format!("Đã dừng{}", self.gift_unsent(at + 1));
            return self.gift_end(line, out);
        }
        let Some(r) = self.snap.gift.as_mut() else {
            return;
        };
        if at + 1 >= r.codes.len() {
            let ok = r.codes.iter().filter(|c| c.ok == Some(true)).count();
            let refused = r.codes.iter().filter(|c| c.ok == Some(false)).count();
            let line = match refused {
                0 => format!("đã gửi hết, {ok} mã được"),
                _ => format!("đã gửi hết, {ok} mã được, {refused} mã bị từ chối"),
            };
            return self.gift_end(line, out);
        }
        r.doing = format!("Đợi rồi gửi mã {}", r.codes[at + 1].code);
        if let Some(g) = self.gift.as_mut() {
            (g.at, g.stage, g.until) = (at + 1, GiftStage::Gap, now + GIFT_GAP);
        }
    }

    /// Ends the run with the reason in the log and on the tab.
    fn gift_end(&mut self, reason: String, out: &mut Vec<Out>) {
        self.gift = None;
        if let Some(r) = self.snap.gift.as_mut() {
            (r.doing, r.done, r.sending) = (reason.clone(), Some(reason.clone()), None);
            r.ended_at = Some(epoch_ms());
        }
        out.push(Out::Log(
            LogKind::Item,
            format!("Kết thúc nhập mã: {reason}"),
        ));
    }

    /// A s2c/1256 with the words of the refusal just logged: true when it is that one again, so it is not logged twice.
    pub(super) fn gift_echo(&mut self, text: &str, now: Instant) -> bool {
        let echo = self
            .gift_echo
            .as_ref()
            .is_some_and(|(t, at)| t == text && now < *at + GIFT_ECHO);
        if echo {
            self.gift_echo = None;
        }
        echo
    }

    /// The code waited past its deadline: no answer ends the run, no mail lets the next code go anyway, and the pause
    /// sends it.
    pub(super) fn gift_timer(&mut self, now: Instant, out: &mut Vec<Out>) {
        let Some((stage, at)) = self
            .gift
            .as_ref()
            .filter(|g| g.until <= now)
            .map(|g| (g.stage, g.at))
        else {
            return;
        };
        match stage {
            GiftStage::Answer => {
                let code = self
                    .snap
                    .gift
                    .as_ref()
                    .map_or_else(String::new, |r| r.codes[at].code.clone());
                let line = format!(
                    "server không trả lời mã {code} sau {} s{}",
                    GIFT_WAIT.as_secs(),
                    self.gift_unsent(at + 1)
                );
                self.gift_end(line, out);
            }
            GiftStage::Mail => self.gift_next(now, out),
            GiftStage::Gap => self.gift_send(now, out),
        }
    }

    /// Dừng: the run ends now in the pause between two codes (the next one is not sent), else once the code sent gets
    /// its answer (and its mail).
    pub(super) fn gift_stop(&mut self, out: &mut Vec<Out>) {
        let Some(g) = self.gift.as_mut() else {
            return;
        };
        if g.stage != GiftStage::Gap {
            g.stopping = true;
            return;
        }
        let at = g.at;
        let line = format!("Đã dừng{}", self.gift_unsent(at));
        self.gift_end(line, out);
    }
}
