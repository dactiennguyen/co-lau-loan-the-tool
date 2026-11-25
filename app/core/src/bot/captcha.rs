//! Xác nhận người chơi (docs/app/events/02-login.md#captcha): the server's captcha s2c/1283 right after login. Unanswered,
//! no battle gives anything ("Chưa xác nhận người chơi, trận này không có thưởng", LG1 25/11), so the app shows the
//! picture to the user (Out::Captcha), who touches it there; the points go out as the game sends them (c2s/1283). The bot
//! never answers by itself. Meanwhile the job and the quest run hold their next battle; the time of the captcha over, or
//! the server saying the player is not verified, they end.
use super::*;

/// The most points an answer carries (com.mh.o.sqc of the game keeps 6).
pub const CAPTCHA_POINTS: usize = 6;
/// The size of the picture, the frame of the points.
pub const CAPTCHA_SIZE: (i16, i16) = (640, 400);

/// A captcha shown and not passed yet: its id, until when it may be answered, and whether the hold was said.
#[derive(Debug, Clone)]
pub(super) struct CaptchaWait {
    pub id: i32,
    pub until: Instant,
    pub said: bool,
}

impl Bot {
    /// s2c/1283: a challenge goes to the app with its picture; a verdict closes it (passed) or says why not.
    pub(super) fn captcha_packet(
        &mut self,
        c: crate::world::Captcha,
        now: Instant,
        out: &mut Vec<Out>,
    ) {
        match c {
            crate::world::Captcha::Challenge {
                id,
                seconds,
                tries,
                png,
            } => {
                out.push(Out::Log(
                    LogKind::Server,
                    format!("Server đòi xác nhận người chơi (captcha: {seconds} giây, {tries} lần thử): chạm vào ảnh trong app rồi bấm Gửi; chưa xác nhận thì đánh không có thưởng"),
                ));
                self.captcha = Some(CaptchaWait {
                    id,
                    until: now + Duration::from_secs(u64::from(seconds)),
                    said: false,
                });
                self.unverified = true;
                out.push(Out::Captcha(CaptchaUi::Show(Box::new(CaptchaPrompt {
                    id,
                    png,
                    seconds,
                    tries,
                }))));
            }
            crate::world::Captcha::Verdict { result, text, .. } => {
                let passed = result == 0;
                out.push(Out::Log(
                    LogKind::Server,
                    match passed {
                        true => format!("Captcha: {text}"),
                        false => format!("Captcha chưa đúng: {text} (kết quả {result})"),
                    },
                ));
                out.push(Out::Captcha(CaptchaUi::Verdict { passed, text }));
                if passed {
                    self.captcha = None;
                    self.unverified = false;
                    if self.job_running() || self.quest_running() {
                        self.next(now, out);
                    }
                }
            }
            // The server closes a captcha left unanswered: as its time over, the job or quest run ends.
            crate::world::Captcha::Closed { id } => {
                self.unverified = true;
                if self.captcha.as_ref().is_none_or(|w| w.id != id) {
                    return out.push(Out::Log(
                        LogKind::Server,
                        "Server đóng captcha đã hết giờ".into(),
                    ));
                }
                self.captcha = None;
                out.push(Out::Captcha(CaptchaUi::Close));
                out.push(Out::Log(
                    LogKind::Server,
                    "Server đóng captcha chưa giải: trận đánh không có thưởng tới khi xác nhận; đăng nhập lại để vào lại".into(),
                ));
                self.unverified_stop(out);
            }
        }
    }

    /// Why a fight job or quest run may not start: a captcha of this session left unpassed (no battle gives anything
    /// until a new login). A captcha still waiting does not refuse it: the job holds until it is passed.
    pub(super) fn unverified_refusal(&self) -> Option<&'static str> {
        (self.unverified && self.captcha.is_none()).then_some(
            "Chưa xác nhận người chơi: trận đánh không có thưởng; bấm Đăng nhập lại (trong khung Chưa xác nhận người chơi) rồi giải captcha",
        )
    }

    /// Gửi of the captcha window: the points touched, in order, in pixels of the picture (640 × 400), as c2s/1283
    /// writes them: u8 0; i32 id; u8 n; n × (i16 x; i16 y).
    pub fn captcha_answer(&mut self, id: i32, points: &[(i16, i16)], out: &mut Vec<Out>) {
        if self.captcha.as_ref().is_none_or(|w| w.id != id) {
            return out.push(Out::Log(
                LogKind::Server,
                "Không gửi captcha: captcha này đã hết hạn hay đã xong".into(),
            ));
        }
        let (w, h) = CAPTCHA_SIZE;
        if points.is_empty()
            || points.len() > CAPTCHA_POINTS
            || points
                .iter()
                .any(|&(x, y)| !(0..w).contains(&x) || !(0..h).contains(&y))
        {
            return out.push(Out::Log(
                LogKind::Server,
                format!("Không gửi captcha: cần 1–{CAPTCHA_POINTS} điểm chạm trong ảnh"),
            ));
        }
        let mut payload = crate::protocol::Writer::new()
            .u8(0)
            .i32(id)
            .u8(points.len() as u8)
            .build();
        for &(x, y) in points {
            payload.extend_from_slice(&x.to_be_bytes());
            payload.extend_from_slice(&y.to_be_bytes());
        }
        out.push(Out::Send(1283, payload));
        out.push(Out::Log(
            LogKind::Server,
            format!("Đã gửi captcha: {} điểm chạm", points.len()),
        ));
    }

    /// True while a captcha waits: the next battle of the job or quest run waits for it, said once.
    pub(super) fn captcha_holds(&mut self, out: &mut Vec<Out>) -> bool {
        let Some(w) = self.captcha.as_mut() else {
            return false;
        };
        if !w.said {
            w.said = true;
            out.push(Out::Log(
                LogKind::Battle,
                "Đợi xác nhận người chơi (captcha trong app) rồi mới đánh tiếp".into(),
            ));
        }
        true
    }

    pub(super) fn captcha_deadline(&self) -> Option<Instant> {
        self.captcha.as_ref().map(|w| w.until)
    }

    /// The time of the captcha is over: the window closes and the job or quest run ends, as no battle would give
    /// anything.
    pub(super) fn captcha_overdue(&mut self, now: Instant, out: &mut Vec<Out>) {
        if self.captcha.as_ref().is_none_or(|w| w.until > now) {
            return;
        }
        self.captcha = None;
        out.push(Out::Captcha(CaptchaUi::Close));
        out.push(Out::Log(
            LogKind::Server,
            "Hết giờ xác nhận người chơi: trận đánh sẽ không có thưởng tới khi xác nhận; đăng xuất rồi đăng nhập lại để có captcha mới".into(),
        ));
        self.unverified_stop(out);
    }

    /// s2c/1256 "Chưa xác nhận người chơi, trận này không có thưởng": the job or quest run ends (unless a captcha still
    /// waits for the user, who may pass it). True when it was that notice.
    pub(super) fn captcha_notice(&mut self, text: &str, out: &mut Vec<Out>) -> bool {
        if !text.starts_with("Chưa xác nhận người chơi") {
            return false;
        }
        if self.captcha.is_none() {
            self.unverified = true;
            self.unverified_stop(out);
        }
        true
    }

    fn unverified_stop(&mut self, out: &mut Vec<Out>) {
        let reason = "Chưa xác nhận người chơi: trận đánh không có thưởng; đăng xuất rồi đăng nhập lại, giải captcha trong app";
        if self.job_running() {
            self.timer = None;
            self.finish(reason, out);
        }
        if self.quest_running() {
            self.finish_quest(reason, out);
        }
    }
}
