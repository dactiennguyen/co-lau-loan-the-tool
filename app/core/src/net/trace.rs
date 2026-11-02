//! Log lỗi: the last packets and commands of a session, so that a fault it sees (a packet the decoders do not read, a
//! server or NPC that does not answer, the connection lost) or a Báo lỗi of the user carries what went in and out just
//! before it. Heartbeats are left out, and the payload of c2s/4, the login proof made from the password, is never kept.
use super::Command;
use crate::bot::LogKind;
use serde::Serialize;
use std::collections::VecDeque;
use std::fmt::Write as _;
use std::time::{Duration, Instant};

/// Packets kept, and bytes of their payloads at most (a s2c/9 is ~11 KB).
const PACKETS: usize = 150;
const BYTES: usize = 256 * 1024;
/// A longer payload is kept up to there; `len` says how long it was.
const PAYLOAD: usize = 16 * 1024;
/// Commands of the app kept.
const COMMANDS: usize = 20;
/// The same fault again within that time is not reported again: a decoder that fails on every turn of a battle.
const AGAIN: Duration = Duration::from_secs(60);
/// c2s/1 and s2c/1, every 2 s.
const HEARTBEAT: i32 = 1;
/// c2s/4: the username and the proof made of the password and the server's challenge.
const SECRET: i32 = 4;

/// A packet of the trace.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Traced {
    /// ms since 1970.
    pub at: u64,
    /// "c2s" or "s2c".
    pub dir: &'static str,
    pub op: i32,
    /// Bytes of the payload.
    pub len: usize,
    /// The payload in hex, its first PAYLOAD bytes; empty for c2s/4.
    pub hex: String,
}

/// What Log lỗi keeps of a fault or of a Báo lỗi: what happened, and the commands and packets before it, oldest first.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Fault {
    /// The log line of the fault ("Không đọc được túi đồ (s2c/1187): …", "Lỗi: Server đã đóng kết nối"), or the note
    /// of Báo lỗi.
    pub text: String,
    pub kind: LogKind,
    /// Báo lỗi of the user, not a fault the session saw.
    pub reported: bool,
    /// (ms since 1970, the command as the app sent it).
    pub commands: Vec<(u64, String)>,
    pub packets: Vec<Traced>,
}
impl Fault {
    /// Báo lỗi without a session that runs: nothing went in or out.
    pub fn note(text: &str) -> Self {
        Self {
            text: text.into(),
            kind: LogKind::Connection,
            reported: true,
            commands: vec![],
            packets: vec![],
        }
    }
}

/// Lines of the bot that say the app got something wrong or could not finish it, saved in Log lỗi with the packets
/// before them. The game saying no ("Không nhặt được …", "Vật phẩm không đủ số lượng") is not one: Báo lỗi is there for
/// those. "Bàn cờ lệch …" is the board of the bot no longer matching the server's (runner::desync_line): the packets
/// before it hold the result it got wrong.
pub fn is_fault(text: &str) -> bool {
    text.starts_with("Không đọc được")
        || text.contains("không trả lời")
        || text.starts_with("Server không ")
        || text.contains("chưa biết làm")
        || text.starts_with("Bàn cờ lệch")
}

/// The last packets and commands of a session, and the last fault it reported.
#[derive(Default)]
pub struct Trace {
    packets: VecDeque<Traced>,
    bytes: usize,
    commands: VecDeque<(u64, String)>,
    /// Packets taken so far, kept or not.
    seen: u64,
    /// The last fault reported: its text, when, and `seen` then.
    last: Option<(String, Instant, u64)>,
}
impl Trace {
    /// A packet the session sent (`out`) or read: its decrypted payload, without the opcode.
    pub fn packet(&mut self, out: bool, op: i32, payload: &[u8]) {
        if op == HEARTBEAT {
            return;
        }
        let kept = if out && op == SECRET {
            &[][..]
        } else {
            &payload[..payload.len().min(PAYLOAD)]
        };
        let mut hex = String::with_capacity(kept.len() * 2);
        for b in kept {
            let _ = write!(hex, "{b:02x}");
        }
        self.bytes += kept.len();
        self.seen += 1;
        self.packets.push_back(Traced {
            at: epoch_ms(),
            dir: if out { "c2s" } else { "s2c" },
            op,
            len: payload.len(),
            hex,
        });
        while self.packets.len() > PACKETS || self.bytes > BYTES {
            let Some(old) = self.packets.pop_front() else {
                break;
            };
            self.bytes -= old.hex.len() / 2;
        }
    }

    /// A command of the app, as the session took it.
    pub fn command(&mut self, command: &Command) {
        self.commands
            .push_back((epoch_ms(), format!("{command:?}")));
        if self.commands.len() > COMMANDS {
            self.commands.pop_front();
        }
    }

    /// The fault of log line `text` with what came before it. None when the same line was reported less than AGAIN
    /// before `now`, or when no packet came since the last fault, whose report holds the same packets already (the
    /// decoders of one s2c/9 failing one after another).
    pub fn fault(&mut self, kind: LogKind, text: &str, now: Instant) -> Option<Fault> {
        if let Some((last, at, seen)) = &self.last {
            if *seen == self.seen || last == text && now.duration_since(*at) < AGAIN {
                return None;
            }
        }
        self.last = Some((text.to_string(), now, self.seen));
        Some(self.take(kind, text, false))
    }

    /// Báo lỗi with the note of the user, always.
    pub fn report(&self, note: &str) -> Fault {
        self.take(LogKind::Connection, note, true)
    }

    /// The error that ended the session ("Lỗi: Server đã đóng kết nối"), always.
    pub fn ended(&self, text: &str) -> Fault {
        self.take(LogKind::Connection, text, false)
    }

    fn take(&self, kind: LogKind, text: &str, reported: bool) -> Fault {
        Fault {
            text: text.into(),
            kind,
            reported,
            commands: self.commands.iter().cloned().collect(),
            packets: self.packets.iter().cloned().collect(),
        }
    }
}

fn epoch_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| d.as_millis() as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_trace_keeps_the_last_packets_without_heartbeats_or_the_login_proof() {
        let mut t = Trace::default();
        t.packet(true, 1, &[1]);
        t.packet(false, 1, &[2]);
        t.packet(true, 4, b"username and proof");
        t.packet(false, 1187, &[0, 1, 0xab]);
        let f = t.report("mở trứng không được");
        assert!(f.reported);
        assert_eq!(
            f.packets
                .iter()
                .map(|p| (p.dir, p.op, p.len, p.hex.as_str()))
                .collect::<Vec<_>>(),
            [("c2s", 4, 18, ""), ("s2c", 1187, 3, "0001ab")]
        );

        // Bounded by count and by bytes, the oldest leaving first; a long payload is cut but keeps its length.
        for i in 0..PACKETS + 10 {
            t.packet(false, 1000 + i as i32, &[0; 10]);
        }
        assert_eq!(t.packets.len(), PACKETS);
        assert_eq!(t.packets.front().unwrap().op, 1010);
        t.packet(false, 9, &vec![7; PAYLOAD + 5]);
        let last = t.packets.back().unwrap();
        assert_eq!((last.len, last.hex.len()), (PAYLOAD + 5, PAYLOAD * 2));
        for _ in 0..40 {
            t.packet(false, 9, &vec![7; PAYLOAD]);
        }
        assert!(t.bytes <= BYTES);
        assert_eq!(
            t.bytes,
            t.packets.iter().map(|p| p.hex.len() / 2).sum::<usize>()
        );
    }

    #[test]
    fn a_fault_is_reported_once_a_minute_and_carries_the_commands() {
        let mut t = Trace::default();
        t.command(&Command::Item(crate::bot::ItemAct::Use(8)));
        let now = Instant::now();
        let text = "Không đọc được túi đồ (s2c/1187): PAYLOAD_SCHEMA: Invalid field length 4 at 5";
        let f = t.fault(LogKind::Item, text, now).unwrap();
        assert_eq!((f.kind, f.reported), (LogKind::Item, false));
        assert_eq!(f.commands.len(), 1);
        assert_eq!(f.commands[0].1, "Item(Use(8))");
        // No packet since: the report has them already.
        assert!(t
            .fault(LogKind::Item, "Không đọc được s2c/20: …", now)
            .is_none());
        t.packet(false, 1187, &[0]);
        assert!(t
            .fault(LogKind::Item, text, now + Duration::from_secs(30))
            .is_none());
        assert!(t
            .fault(
                LogKind::Item,
                "Server không mở trận với Cóc Tía sau 8 s",
                now
            )
            .is_some());
        t.packet(false, 1187, &[0]);
        assert!(t.fault(LogKind::Item, text, now + AGAIN).is_some());
    }

    #[test]
    fn faults_are_what_the_app_got_wrong_not_the_game_saying_no() {
        for line in [
            "Không đọc được túi đồ (s2c/1187): PAYLOAD_SCHEMA: Invalid field length 4 at 5",
            "Không đọc được s2c/20: PAYLOAD_SCHEMA: Invalid field length 16777215 at 57",
            "Server không mở trận với Võ Quan Đinh Mộc sau 8 s",
            "Kết thúc tự làm nhiệm vụ: NPC không trả lời (2 thắng, 1 thua)",
            "Chợ trời không trả lời sau 8 s: thôi mua",
            "Bot chưa biết làm bước \"Đến Cửu Phong\" (thamSố 9, cần 1, npcId -1)",
            "Bàn cờ lệch với server ở lượt 7, sau kỹ năng 1001 của mình",
        ] {
            assert!(is_fault(line), "{line}");
        }
        for line in [
            "Không nhặt được Đá cấp 3: Rương đồ không đủ ô trống",
            "Vật phẩm không đủ số lượng",
            "Tiêu diệt Cóc Tía: không ở M2, qua cổng Rìa Hồng Giang (2/6)",
            "Không có người chơi nào khác trong khu (server không gửi s2c/1263)",
            "Chưa mua Búa Sửa Chữa: chưa biết số Xu",
            "Thua boss: không mất EXP, vẫn đánh tiếp",
        ] {
            assert!(!is_fault(line), "{line}");
        }
    }
}
