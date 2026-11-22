//! What the character waits for, in one list: busy() and busy_but() (what refuses a new task the user would have to
//! Stop first), notice_awaited() (what a refusal notice could be taken for), and owns_next_notice() (the s2c/1256
//! arbitration of packets.rs). A new task that waits for the server is added to Wait and to waits(), and nowhere else.
use super::*;

/// One thing the character waits for, in the order busy() says them.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Wait {
    Battle,
    Job,
    Quest,
    /// A trip through portals (trip).
    Trip,
    /// c2s/13 sent, its new map awaited (travelling).
    Portal,
    /// c2s/1173 sent (zoning).
    Zone,
    Smith,
    Gift,
    /// The mailbox waits for the server; `changing` for Nhận, Nhận hết or Xóa (mail_changing).
    Mail {
        changing: bool,
    },
    /// Chợ trời waits for the server; `changing` for Mua, Đăng bán, Thu hồi or Gia hạn (market_changing).
    Market {
        changing: bool,
    },
    /// A step of a shop (shopping).
    Shop,
    /// A button of the Túi đồ tab, for ITEM_WAIT at most (item_pending).
    Item,
    /// Tự sửa đồ's c2s/48 (repairing).
    Repair,
    /// The PICK_ANSWER after a c2s/1188.
    Pickup,
    /// Đập hết (bot/eggs.rs).
    Eggs,
    /// Bạch Hổ (bot/bachho.rs).
    BachHo,
    /// The map reloaded after a battle (bot/reload.rs).
    Reload,
}

/// How long a button of the Túi đồ tab waits for its answer (Bot::item, item_pending).
pub(super) const ITEM_WAIT: Duration = Duration::from_secs(5);

impl Wait {
    /// The reason busy() gives, for what refuses a move or a task the user would have to Stop first.
    fn busy(self) -> Option<&'static str> {
        Some(match self {
            Wait::Battle => "đang đánh, đợi hết trận",
            Wait::Job => "đang tự đánh quái, bấm Dừng trước",
            Wait::Quest => "đang tự làm nhiệm vụ, bấm Dừng trước",
            Wait::Trip | Wait::Portal | Wait::Zone => "đang đổi chỗ",
            Wait::Smith => "đang làm việc với Pháp sư hay Hương Lão, bấm Dừng trước",
            Wait::Gift => "đang nhập mã quà tặng, bấm Dừng trước",
            Wait::Mail { changing: true } => "đang nhận hay xoá thư, đợi server trả lời",
            Wait::Market { changing: true } => "đang mua bán ở Chợ trời, đợi server trả lời",
            Wait::Eggs => "đang đập trứng, bấm Dừng trước",
            Wait::BachHo => "đang đi Bạch Hổ, bấm Dừng trước",
            Wait::Reload => "đang tải lại map sau trận, đợi chút",
            _ => return None,
        })
    }

    /// Whether its answer may come as a s2c/1256 notice, which says nothing of what it answers.
    fn answered_by_notice(self) -> bool {
        matches!(
            self,
            Wait::Portal
                | Wait::Zone
                | Wait::Smith
                | Wait::Gift
                | Wait::Mail { .. }
                | Wait::Market { .. }
                | Wait::Shop
                | Wait::Item
                | Wait::Repair
                | Wait::Pickup
                | Wait::Eggs
        )
    }
}

impl Bot {
    /// Everything the character waits for, in the order of Wait; without `now` not Item nor Pickup, which last a while.
    fn waits(&self, now: Option<Instant>) -> impl Iterator<Item = Wait> {
        let mail = self.mail.is_some().then(|| Wait::Mail {
            changing: self.mail_changing(),
        });
        let market = self.market.is_some().then(|| Wait::Market {
            changing: self.market_changing(),
        });
        [
            self.battle.is_some().then_some(Wait::Battle),
            self.job_running().then_some(Wait::Job),
            self.quest_running().then_some(Wait::Quest),
            (self.trip.is_some() || self.warp.is_some()).then_some(Wait::Trip),
            self.travelling.is_some().then_some(Wait::Portal),
            self.zoning.is_some().then_some(Wait::Zone),
            self.smith.is_some().then_some(Wait::Smith),
            self.gift.is_some().then_some(Wait::Gift),
            mail,
            market,
            self.shopping.is_some().then_some(Wait::Shop),
            now.filter(|&now| self.item_pending(now))
                .map(|_| Wait::Item),
            self.repairing.is_some().then_some(Wait::Repair),
            now.filter(|&now| self.picked_at.is_some_and(|t| now < t + PICK_ANSWER))
                .map(|_| Wait::Pickup),
            self.eggs.is_some().then_some(Wait::Eggs),
            self.bach_ho.is_some().then_some(Wait::BachHo),
            self.reload.is_some().then_some(Wait::Reload),
        ]
        .into_iter()
        .flatten()
    }

    /// Why the character cannot move now: a battle, a job, a quest run, a move under way, a task at an NPC, a gift code,
    /// a change of the mailbox or of Chợ trời.
    pub(super) fn busy(&self) -> Option<&'static str> {
        self.busy_but(false)
    }

    /// busy(), a fight job or a quest run left aside with `job`: the trip of Tự gộp đá khi túi đầy is the job's own
    /// (bot/merge.rs), the zone change of a quest step the run's own (quest_zone). None of what busy() says depends on
    /// the clock.
    pub(super) fn busy_but(&self, job: bool) -> Option<&'static str> {
        self.waits(None)
            .filter(|&w| !(job && matches!(w, Wait::Job | Wait::Quest)))
            .find_map(Wait::busy)
    }

    /// Something busy() does not count waits for its own s2c/1256: a purchase, a button of the Túi đồ tab (ITEM_WAIT at
    /// most), Tự sửa đồ, the PICK_ANSWER after a pickup.
    pub(super) fn notice_awaited(&self, now: Instant) -> bool {
        self.waits(Some(now))
            .any(|w| matches!(w, Wait::Shop | Wait::Item | Wait::Repair | Wait::Pickup))
    }

    /// notice_awaited() but the pickup's: what Tự gộp đá khi túi đầy does not set off with (a pickup's answer is waited
    /// for at M1 instead, merge_step).
    pub(super) fn notice_awaited_but_pickup(&self, now: Instant) -> bool {
        self.waits(Some(now))
            .any(|w| matches!(w, Wait::Shop | Wait::Item | Wait::Repair))
    }

    /// Whether a s2c/1256 that does not speak of a pickup is another task's answer rather than the pickup's: something
    /// other than the pickup waits for a notice.
    pub(super) fn owns_next_notice(&self, now: Instant) -> bool {
        self.waits(Some(now))
            .any(|w| w != Wait::Pickup && w.answered_by_notice())
    }

    /// A button of the Túi đồ tab (or a repair of Tự sửa đồ) waits for its answer: for ITEM_WAIT at most, so one never
    /// answered (a Sắp xếp answered late, a repair given up) does not hold the next task for good.
    pub(super) fn item_pending(&self, now: Instant) -> bool {
        (self.item_wait.as_ref()).is_some_and(|w| now < w.at + ITEM_WAIT)
    }
}
