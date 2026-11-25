// Thông báo (Cài đặt → Thông báo): a notification of the system (tauri-plugin-notification) when the fight job or quest
// run of an account ends on its own. Xong việc: it played its battles, the quest moved on, or the bot stopped where it
// cannot go on (the reason says why). Thua hết lượt: it lost as many battles as Thua tối đa allows. Stopped by hand
// (Dừng) it says nothing. Báo khi có captcha: the moment the server asks an account a captcha (captcha()). Windows and
// Linux show it at once; macOS asks the user once, the first time one is shown; Android shows it while the app runs in
// the background too (its keepalive service), once the notification permission is granted.
use cllt_core::bot::Snapshot;
use tauri::{AppHandle, Runtime};
use tauri_plugin_notification::NotificationExt;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    /// Xong việc: ended by itself, but not for losses.
    Done,
    /// Thua hết lượt: ended because Thua tối đa was reached ("Thua N trận").
    Lost,
    /// Báo khi có captcha: the server asks the account to confirm the player (s2c/1283), `seconds` to answer.
    Captcha,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Notice {
    pub kind: Kind,
    pub title: String,
    pub body: String,
}

/// The kind of an end by its reason; None for a stop by hand (Bot::stop: "Đã dừng…").
pub fn kind_of(reason: &str) -> Option<Kind> {
    if reason.starts_with("Đã dừng") {
        None
    } else if reason.starts_with("Thua ") {
        Some(Kind::Lost)
    } else {
        Some(Kind::Done)
    }
}

fn title(kind: Kind, who: &str, what: &str) -> String {
    match kind {
        Kind::Done => format!("{who}: {what} kết thúc"),
        Kind::Lost => format!("{who}: thua hết lượt, dừng {what}"),
        Kind::Captcha => format!("{who}: cần xác nhận người chơi"),
    }
}

/// What ended between two snapshots of the account `who`: the job or run that has a reason in `after` and had none in
/// `before` (or was another one).
pub fn ended(who: &str, before: &Snapshot, after: &Snapshot) -> Vec<Notice> {
    let mut out = Vec::new();
    if let Some(j) = &after.job {
        let was = before.job.as_ref().filter(|b| b.started_at == j.started_at);
        if let (Some(reason), None) = (&j.done, was.and_then(|b| b.done.as_ref())) {
            if let Some(kind) = kind_of(reason) {
                out.push(Notice {
                    kind,
                    title: title(kind, who, "đánh quái"),
                    body: format!(
                        "{reason}. {}: {} thắng, {} thua, +{} EXP",
                        j.target, j.wins, j.losses, j.exp
                    ),
                });
            }
        }
    }
    if let Some(r) = &after.quest_run {
        let was = before.quest_run.as_ref().filter(|b| b.id == r.id);
        if let (Some(reason), None) = (&r.done, was.and_then(|b| b.done.as_ref())) {
            if let Some(kind) = kind_of(reason) {
                out.push(Notice {
                    kind,
                    title: title(kind, who, "làm nhiệm vụ"),
                    body: format!(
                        "{reason}. {} nhiệm vụ xong, {} thắng, {} thua, +{} EXP",
                        r.completed, r.wins, r.losses, r.exp
                    ),
                });
            }
        }
    }
    out
}

/// The server asks `who` a captcha, `seconds` to answer it in the app.
pub fn captcha(who: &str, seconds: u16) -> Notice {
    Notice {
        kind: Kind::Captcha,
        title: title(Kind::Captcha, who, ""),
        body: format!(
            "Server đòi captcha, còn {seconds} giây. Mở app, bấm vào nick này rồi chạm vào ảnh; chưa xác nhận thì đánh không có thưởng."
        ),
    }
}

/// Shows it; the error says why not.
pub fn show<R: Runtime>(app: &AppHandle<R>, n: &Notice) -> Result<(), String> {
    app.notification()
        .builder()
        .title(&n.title)
        .body(&n.body)
        .show()
        .map_err(|e| format!("Không gửi được thông báo: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use cllt_core::bot::{Job, QuestRun};

    /// Báo khi có captcha names the account and the seconds left.
    #[test]
    fn a_captcha_says_whose_and_how_long() {
        let n = captcha("kakami", 60);
        assert_eq!(n.kind, Kind::Captcha);
        assert_eq!(n.title, "kakami: cần xác nhận người chơi");
        assert!(
            n.body.starts_with("Server đòi captcha, còn 60 giây."),
            "{}",
            n.body
        );
    }

    fn job(done: Option<&str>) -> Snapshot {
        Snapshot {
            job: Some(Job {
                target: "Sói Xám".into(),
                wins: 9,
                losses: 1,
                exp: 1200,
                done: done.map(Into::into),
                started_at: 5,
                ..Default::default()
            }),
            ..Default::default()
        }
    }

    #[test]
    fn a_job_that_ends_by_itself_or_for_losses_is_told_once_and_a_stop_by_hand_not() {
        let running = job(None);
        let done = ended("manina2", &running, &job(Some("Đã đánh đủ 10 trận")));
        assert_eq!(done.len(), 1);
        assert_eq!(done[0].kind, Kind::Done);
        assert_eq!(done[0].title, "manina2: đánh quái kết thúc");
        assert!(done[0]
            .body
            .starts_with("Đã đánh đủ 10 trận. Sói Xám: 9 thắng, 1 thua, +1200 EXP"));

        let lost = ended("manina2", &running, &job(Some("Thua 3 trận")));
        assert_eq!(lost[0].kind, Kind::Lost);
        assert_eq!(lost[0].title, "manina2: thua hết lượt, dừng đánh quái");

        assert!(ended("manina2", &running, &job(Some("Đã dừng"))).is_empty());
        // Already ended before: not again.
        let after = job(Some("Thua 3 trận"));
        assert!(ended("manina2", &after, &after).is_empty());
    }

    #[test]
    fn a_quest_run_is_told_by_its_id() {
        let run = |id, done: Option<&str>| Snapshot {
            quest_run: Some(QuestRun {
                id,
                completed: 2,
                done: done.map(Into::into),
                ..Default::default()
            }),
            ..Default::default()
        };
        let n = ended(
            "tiheo1",
            &run(1, None),
            &run(1, Some("Không biết đường tới Lam Lĩnh")),
        );
        assert_eq!(n[0].kind, Kind::Done);
        assert_eq!(n[0].title, "tiheo1: làm nhiệm vụ kết thúc");
        assert!(n[0]
            .body
            .contains("Không biết đường tới Lam Lĩnh. 2 nhiệm vụ xong"));
        // A new run that ended at once, after one that had ended.
        assert_eq!(
            ended(
                "tiheo1",
                &run(1, Some("Thua 1 trận")),
                &run(2, Some("Thua 2 trận"))
            )
            .len(),
            1
        );
    }
}
