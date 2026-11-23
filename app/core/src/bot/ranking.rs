//! Bảng xếp hạng (docs/app/events/11-panels.md#s2c-1254, RK1 23/11): reading only, at any map. c2s/1254 00 opens it
//! (the tab list, then tab 0), 01 and a tab shows that tab, as the client sends it; the answers are kept in
//! Snapshot.ranking for the button beside Vị trí.
use super::*;
use crate::world::{self, Ranking};

impl Bot {
    /// Bảng xếp hạng: tab `tab` (0 Cao thủ … 6 Thủy). The first time c2s/1254 00, which brings the tabs and tab 0, then
    /// 01 tab for another tab; after that 01 tab. Not before the character is in the world.
    pub fn ranking(&mut self, tab: u8, out: &mut Vec<Out>) {
        if self.snap.map_id.is_empty() {
            out.push(Out::Log(
                LogKind::Connection,
                "Chưa xem bảng xếp hạng: nhân vật chưa vào game".into(),
            ));
            return;
        }
        let r = &mut self.snap.ranking;
        (r.asked, r.asked_at) = (Some(tab), Some(epoch_ms()));
        if r.tabs.is_empty() {
            out.push(Out::Send(1254, world::ranking_request(None)));
            if tab == 0 {
                return;
            }
        }
        out.push(Out::Send(1254, world::ranking_request(Some(tab))));
    }

    /// s2c/1254: the tabs, or one tab's list (the tab asked is answered when it is that one).
    pub(super) fn ranking_read(&mut self, ranking: Ranking) {
        let r = &mut self.snap.ranking;
        match ranking {
            Ranking::Tabs { tabs, .. } => r.tabs = tabs,
            Ranking::List { tab, rows, own, .. } => {
                let list = RankList {
                    tab,
                    rows,
                    own,
                    read_at: epoch_ms(),
                };
                match r.lists.iter_mut().find(|l| l.tab == tab) {
                    Some(l) => *l = list,
                    None => r.lists.push(list),
                }
                if r.asked == Some(tab) {
                    (r.asked, r.asked_at) = (None, None);
                }
            }
        }
    }
}
