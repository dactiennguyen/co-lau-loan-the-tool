//! Nhiệm vụ hàng ngày (docs/app/events/14-npc.md#nhiệm-vụ-hàng-ngày): the quest held as s2c/1195 says it, at login,
//! when one is taken, dropped or done, and when its progress moves (Snapshot.daily). Nhận, Hủy and Hoàn thành at Hương
//! Lão are SmithTask::Daily (smith.rs).
use super::*;
use crate::mail::{daily_after, Daily};

impl Bot {
    /// s2c/1195: the quest held, a quest done (kind 2) or the progress (kind 3); the answer of SmithTask::Daily too.
    pub(super) fn daily_update(&mut self, d: Daily, now: Instant, out: &mut Vec<Out>) {
        let s = &mut self.snap.daily;
        let before = s.quest.take();
        s.quest = daily_after(before.as_ref(), &d);
        if !matches!(d, Daily::Progress { .. }) {
            s.known = true;
        }
        if let Daily::Done { name, rewards } = &d {
            s.done = Some(DailyDone {
                name: name.clone(),
                rewards: rewards.clone(),
                at: epoch_ms(),
            });
        }
        // Once, when the progress reaches the target: where to hand it in.
        if let (Some(b), Some(q)) = (&before, &s.quest) {
            if b.id == q.id && !b.finished() && q.finished() {
                out.push(Out::Log(
                    LogKind::Quest,
                    format!(
                        "Nhiệm vụ ngày {} đã đủ {}/{}: về Hương Lão (Làng Thanh Khê) chọn Hoàn thành nhiệm vụ",
                        q.name, q.progress, q.target
                    ),
                ));
            }
        }
        self.smith_daily(&d, now, out);
    }
}
