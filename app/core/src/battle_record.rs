//! Lưu dữ liệu trận: every battle kept for later study of the battle algorithm, in the format of src/bot/battle-record.ts
//! (docs/app/events/07-auto-battle.md#ghi-trận). The gzip of JSON lines:
//! - first `{"kind":"header","format":1,"at":…}`: both sides and the bot's settings as the battle opens (Bot::on_setup);
//! - then each packet of the battle as `[ms since s2c/22,"s2c/19","hex"]`, and between them the bot's notes as
//!   `{"ms":…,"note":"turn",…}`;
//! - last `{"kind":"end",…}`: the result. The data goes out once s2c/1214 follows the end (END_WAIT at most), so the s2c/10
//!   of the reward and the s2c/36 of the durability are in.
//!
//! Only the opcodes of BATTLE_OPCODES are kept: no login, no chat, no other players. The app keeps each battle as a row
//! of battle_data in cllt.db; `npm run battles` reads both.
use flate2::{write::GzEncoder, Compression};
use serde_json::{json, Value};
use std::fmt::Write as _;
use std::io::Write;
use std::time::{Duration, Instant};

pub const RECORD_FORMAT: u32 = 1;
/// After the end, how long s2c/1214 is waited for: the packets after an end came within 1 ms in H1.
pub const END_WAIT: Duration = Duration::from_millis(500);

/// The packets of a battle (05-battle.md), as (c2s, opcode): setup, join, turns, moves, skills, items, surrender, then
/// the reward (s2c/10), the kill count (s2c/1201), the durability (s2c/36) and the end (s2c/1214).
pub const BATTLE_OPCODES: [(bool, i32); 18] = [
    (false, 22),
    (true, 18),
    (false, 18),
    (true, 14),
    (false, 24),
    (true, 19),
    (false, 19),
    (false, 20),
    (false, 21),
    (true, 20),
    (true, 44),
    (false, 44),
    (true, 11),
    (true, 40),
    (false, 10),
    (false, 1201),
    (false, 36),
    (false, 1214),
];

/// A battle as kept: `packets` is the gzip of every line, the header included, so it reads as a battle file of the TS bot.
#[derive(Debug, Clone, PartialEq)]
pub struct BattleData {
    pub uuid: String,
    /// When s2c/22 opened it, in ms since 1970 (BattleRecord::started_at).
    pub started_at: u64,
    pub format: u32,
    /// The header line, also the first line of `packets`.
    pub header: String,
    pub packets: Vec<u8>,
}

/// The lines of the battle being played.
#[derive(Debug)]
pub struct Recorder {
    uuid: String,
    started_at: u64,
    started: Instant,
    header: String,
    lines: Vec<String>,
    /// Set by end(): the data goes out at s2c/1214, or with the first packet or timer from this instant on.
    pub ending: Option<Instant>,
}

impl Recorder {
    /// `header` is an object; kind, format and at come first.
    pub fn start(uuid: &str, header: Value, started_at: u64, now: Instant) -> Self {
        let header = line(
            &format!(
                r#""kind":"header","format":{RECORD_FORMAT},"at":"{}""#,
                iso(started_at)
            ),
            &header,
        );
        Self {
            uuid: uuid.to_string(),
            started_at,
            started: now,
            lines: vec![header.clone()],
            header,
            ending: None,
        }
    }

    fn ms(&self, now: Instant) -> u128 {
        now.saturating_duration_since(self.started).as_millis()
    }

    /// Keeps a packet of the battle; true when it is the s2c/1214 that follows the end, and the data should go out.
    pub fn packet(&mut self, c2s: bool, opcode: i32, payload: &[u8], now: Instant) -> bool {
        if !BATTLE_OPCODES.contains(&(c2s, opcode)) {
            return false;
        }
        let op = format!("{}/{opcode}", if c2s { "c2s" } else { "s2c" });
        let mut hex = String::with_capacity(payload.len() * 2);
        for b in payload {
            let _ = write!(hex, "{b:02x}");
        }
        self.lines
            .push(json!([self.ms(now) as u64, op, hex]).to_string());
        self.ending.is_some() && !c2s && opcode == 1214
    }

    pub fn note(&mut self, note: &str, fields: Value, now: Instant) {
        let head = format!(r#""ms":{},"note":{}"#, self.ms(now), json!(note));
        self.lines.push(line(&head, &fields));
    }

    /// The result line; a second end changes nothing.
    pub fn end(&mut self, result: Value, now: Instant) {
        if self.ending.is_some() {
            return;
        }
        let head = format!(r#""kind":"end","ms":{}"#, self.ms(now));
        self.lines.push(line(&head, &result));
        self.ending = Some(now + END_WAIT);
    }

    pub fn finish(self) -> BattleData {
        let mut gz = GzEncoder::new(Vec::new(), Compression::default());
        let mut text = self.lines.join("\n");
        text.push('\n');
        gz.write_all(text.as_bytes()).expect("gzip into memory");
        BattleData {
            uuid: self.uuid,
            started_at: self.started_at,
            format: RECORD_FORMAT,
            header: self.header,
            packets: gz.finish().expect("gzip into memory"),
        }
    }
}

/// A JSON object line: the fields of `head` first (kind, ms… as the TS bot writes them), then those of `fields`, an
/// object, whose keys serde_json keeps in alphabetical order.
fn line(head: &str, fields: &Value) -> String {
    match fields
        .to_string()
        .strip_prefix('{')
        .and_then(|s| s.strip_suffix('}'))
    {
        Some(rest) if !rest.is_empty() => format!("{{{head},{rest}}}"),
        _ => format!("{{{head}}}"),
    }
}

/// ms since 1970 as "2026-10-31T09:12:03.120Z" (UTC), as Date.toISOString of the TS bot.
fn iso(ms: u64) -> String {
    let (days, rest) = ((ms / 86_400_000) as i64, ms % 86_400_000);
    // Civil date from days since 1970 (Howard Hinnant's days_from_civil, inverted).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}.{:03}Z",
        rest / 3_600_000,
        rest / 60_000 % 60,
        rest / 1000 % 60,
        rest % 1000
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use flate2::read::GzDecoder;
    use std::io::Read;

    fn lines(d: &BattleData) -> Vec<Value> {
        let mut text = String::new();
        GzDecoder::new(&d.packets[..])
            .read_to_string(&mut text)
            .unwrap();
        text.lines()
            .map(|l| serde_json::from_str(l).unwrap())
            .collect()
    }

    #[test]
    fn iso_dates() {
        assert_eq!(iso(0), "1970-01-01T00:00:00.000Z");
        assert_eq!(iso(1_793_437_923_120), "2026-10-31T09:12:03.120Z");
        assert_eq!(iso(951_782_400_000), "2000-02-29T00:00:00.000Z");
    }

    #[test]
    fn header_packets_notes_end_as_the_ts_battle_files() {
        let t0 = Instant::now();
        let mut r = Recorder::start(
            "u-1",
            json!({ "character": "manina", "element": 1, "elementName": "Hỏa" }),
            1_793_437_923_120,
            t0,
        );
        assert!(!r.packet(false, 22, &[1, 2], t0));
        assert!(!r.packet(true, 18, &[0xaa], t0 + Duration::from_millis(1)));
        assert!(!r.packet(false, 1263, &[0xbb], t0)); // other players: left out
        assert!(!r.packet(true, 4, &[0xcc], t0)); // login: left out
        r.note(
            "turn",
            json!({ "seq": 1, "pick": "swap" }),
            t0 + Duration::from_millis(2),
        );
        assert!(
            !r.packet(false, 1214, &[], t0),
            "s2c/1214 before the end does not finish it"
        );
        r.end(
            json!({ "won": true, "exp": 312 }),
            t0 + Duration::from_millis(40),
        );
        r.end(json!({ "won": false }), t0 + Duration::from_millis(41));
        assert_eq!(r.ending, Some(t0 + Duration::from_millis(40) + END_WAIT));
        assert!(!r.packet(false, 36, &[0xee], t0 + Duration::from_millis(40)));
        assert!(r.packet(false, 1214, &[], t0 + Duration::from_millis(41)));
        let d = r.finish();
        assert_eq!(
            (d.uuid.as_str(), d.format, d.started_at),
            ("u-1", 1, 1_793_437_923_120)
        );
        let l = lines(&d);
        assert_eq!(l[0], serde_json::from_str::<Value>(&d.header).unwrap());
        assert_eq!(
            d.header,
            r#"{"kind":"header","format":1,"at":"2026-10-31T09:12:03.120Z","character":"manina","element":1,"elementName":"Hỏa"}"#
        );
        assert_eq!(line(r#""a":1"#, &json!({})), r#"{"a":1}"#);
        assert_eq!(l[1], json!([0, "s2c/22", "0102"]));
        assert_eq!(l[2], json!([1, "c2s/18", "aa"]));
        assert_eq!(
            l[3],
            json!({ "ms": 2, "note": "turn", "seq": 1, "pick": "swap" })
        );
        assert_eq!(l[4], json!([0, "s2c/1214", ""]));
        assert_eq!(
            l[5],
            json!({ "kind": "end", "ms": 40, "won": true, "exp": 312 })
        );
        assert_eq!(l.len(), 8);
    }
}
