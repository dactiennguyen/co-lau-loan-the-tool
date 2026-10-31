// cllt.db beside accounts.json: every log line and every battle, by account username (lower case), for the filters of
// the Nhật ký card and the Thống kê tab (docs/integration/rust/README.md#nhật-ký-và-thống-kê). One connection behind a
// mutex: in WAL mode with synchronous=NORMAL a write does not wait for the disk.
use cllt_core::bot::{BattleRecord, BattleResult, BattleSource, LogKind};
use rusqlite::types::Value;
use rusqlite::{params, params_from_iter, Connection, Row};
use serde::Serialize;
use std::path::Path;
use std::sync::{Mutex, MutexGuard};

/// Log lines older than this many days are deleted when the app starts; battles are kept.
pub const LOG_DAYS: u64 = 30;
pub const DAY_MS: u64 = 86_400_000;

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL,
    at INTEGER NOT NULL,
    kind TEXT NOT NULL,
    tone INTEGER NOT NULL,
    text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS logs_by_account ON logs (username, id);
CREATE INDEX IF NOT EXISTS logs_by_kind ON logs (username, kind, id);
CREATE INDEX IF NOT EXISTS logs_by_time ON logs (at);
CREATE TABLE IF NOT EXISTS battles (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL,
    character TEXT NOT NULL,
    level INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER NOT NULL,
    map_id TEXT NOT NULL,
    map_name TEXT NOT NULL,
    zone INTEGER NOT NULL,
    mob_id TEXT NOT NULL,
    mob_name TEXT NOT NULL,
    mob_level INTEGER NOT NULL,
    boss INTEGER NOT NULL,
    source TEXT NOT NULL,
    result TEXT NOT NULL,
    turns INTEGER NOT NULL,
    damage INTEGER NOT NULL,
    hp_before INTEGER NOT NULL,
    hp_after INTEGER NOT NULL,
    max_hp INTEGER NOT NULL,
    exp INTEGER NOT NULL,
    coin INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS battles_by_account ON battles (username, ended_at);
";

/// A log line as cllt.db keeps it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct StoredLog {
    pub id: i64,
    /// ms since 1970.
    pub at: u64,
    pub kind: LogKind,
    pub tone: u8,
    pub text: String,
}

/// A battle of the history, with its row id (the cursor for the next page).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct StoredBattle {
    pub id: i64,
    #[serde(flatten)]
    pub record: BattleRecord,
}

/// Sums over some battles. `ms` is the time spent in them.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Totals {
    pub battles: u32,
    pub won: u32,
    pub lost: u32,
    pub left: u32,
    pub exp: i64,
    pub coin: i64,
    pub damage: i64,
    pub turns: i64,
    pub ms: i64,
}

/// The totals of one mob (name and level) on one map.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MobTotals {
    pub mob_name: String,
    pub mob_level: i32,
    pub boss: bool,
    pub map_name: String,
    #[serde(flatten)]
    pub totals: Totals,
}

/// The Thống kê tab: the totals, then each mob, most battles first.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BattleStats {
    #[serde(flatten)]
    pub totals: Totals,
    pub mobs: Vec<MobTotals>,
}

/// Which battles a query takes: of one account, ended since a time, played for one source.
#[derive(Debug, Clone, Copy)]
pub struct BattleFilter<'a> {
    pub username: &'a str,
    pub since: Option<u64>,
    pub source: Option<BattleSource>,
}
impl BattleFilter<'_> {
    fn sql(&self) -> (String, Vec<Value>) {
        let mut sql = "username = ?".to_string();
        let mut args = vec![Value::from(self.username.to_string())];
        if let Some(t) = self.since {
            sql.push_str(" AND ended_at >= ?");
            args.push(Value::from(t as i64));
        }
        if let Some(s) = self.source {
            sql.push_str(" AND source = ?");
            args.push(Value::from(s.key().to_string()));
        }
        (sql, args)
    }
}

const TOTALS: &str = "COUNT(*), COALESCE(SUM(result = 'won'), 0), COALESCE(SUM(result = 'lost'), 0), \
     COALESCE(SUM(result = 'left'), 0), COALESCE(SUM(exp), 0), COALESCE(SUM(coin), 0), COALESCE(SUM(damage), 0), \
     COALESCE(SUM(turns), 0), COALESCE(SUM(ended_at - started_at), 0)";

/// The TOTALS columns of `row`, from column `at`.
fn totals(row: &Row, at: usize) -> rusqlite::Result<Totals> {
    Ok(Totals {
        battles: row.get(at)?,
        won: row.get(at + 1)?,
        lost: row.get(at + 2)?,
        left: row.get(at + 3)?,
        exp: row.get(at + 4)?,
        coin: row.get(at + 5)?,
        damage: row.get(at + 6)?,
        turns: row.get(at + 7)?,
        ms: row.get(at + 8)?,
    })
}

const BATTLE: &str = "id, character, level, started_at, ended_at, map_id, map_name, zone, mob_id, mob_name, mob_level, \
     boss, source, result, turns, damage, hp_before, hp_after, max_hp, exp, coin";

fn battle(row: &Row) -> rusqlite::Result<StoredBattle> {
    let key = |i: usize| row.get::<_, String>(i);
    Ok(StoredBattle {
        id: row.get(0)?,
        record: BattleRecord {
            character: row.get(1)?,
            level: row.get(2)?,
            started_at: row.get::<_, i64>(3)? as u64,
            ended_at: row.get::<_, i64>(4)? as u64,
            map_id: row.get(5)?,
            map_name: row.get(6)?,
            zone: row.get(7)?,
            mob_id: row.get(8)?,
            mob_name: row.get(9)?,
            mob_level: row.get(10)?,
            boss: row.get(11)?,
            source: BattleSource::from_key(&key(12)?).unwrap_or(BattleSource::Other),
            result: BattleResult::from_key(&key(13)?).unwrap_or(BattleResult::Lost),
            turns: row.get(14)?,
            damage: row.get(15)?,
            hp_before: row.get(16)?,
            hp_after: row.get(17)?,
            max_hp: row.get(18)?,
            exp: row.get(19)?,
            coin: row.get(20)?,
        },
    })
}

pub struct Store {
    db: Mutex<Connection>,
}
impl Store {
    pub fn open(path: &Path) -> rusqlite::Result<Self> {
        Self::init(Connection::open(path)?)
    }
    /// For the tests and the sample.
    pub fn memory() -> rusqlite::Result<Self> {
        Self::init(Connection::open_in_memory()?)
    }
    fn init(db: Connection) -> rusqlite::Result<Self> {
        db.pragma_update_and_check(None, "journal_mode", "WAL", |_| Ok(()))?;
        db.pragma_update(None, "synchronous", "NORMAL")?;
        db.execute_batch(SCHEMA)?;
        Ok(Self { db: Mutex::new(db) })
    }
    fn db(&self) -> MutexGuard<'_, Connection> {
        self.db.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Keeps the line; its row id, the cursor of the Nhật ký for older lines.
    pub fn add_log(
        &self,
        username: &str,
        at: u64,
        kind: LogKind,
        tone: u8,
        text: &str,
    ) -> Option<i64> {
        let db = self.db();
        db.execute(
            "INSERT INTO logs (username, at, kind, tone, text) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![username, at as i64, kind.key(), tone, text],
        )
        .ok()?;
        Some(db.last_insert_rowid())
    }

    /// Newest first: lines of `username` before row `before`, of `kinds` (all when empty), of `tone` only when given.
    pub fn logs(
        &self,
        username: &str,
        before: Option<i64>,
        kinds: &[LogKind],
        tone: Option<u8>,
        limit: u32,
    ) -> rusqlite::Result<Vec<StoredLog>> {
        let mut sql = "SELECT id, at, kind, tone, text FROM logs WHERE username = ?".to_string();
        let mut args = vec![Value::from(username.to_string())];
        if let Some(b) = before {
            sql.push_str(" AND id < ?");
            args.push(Value::from(b));
        }
        if !kinds.is_empty() {
            sql.push_str(&format!(
                " AND kind IN ({})",
                vec!["?"; kinds.len()].join(", ")
            ));
            args.extend(kinds.iter().map(|k| Value::from(k.key().to_string())));
        }
        if let Some(t) = tone {
            sql.push_str(" AND tone = ?");
            args.push(Value::from(t as i64));
        }
        sql.push_str(" ORDER BY id DESC LIMIT ?");
        args.push(Value::from(limit as i64));
        let db = self.db();
        let mut q = db.prepare(&sql)?;
        let rows = q.query_map(params_from_iter(args), |r| {
            Ok(StoredLog {
                id: r.get(0)?,
                at: r.get::<_, i64>(1)? as u64,
                kind: LogKind::from_key(&r.get::<_, String>(2)?).unwrap_or(LogKind::Server),
                tone: r.get(3)?,
                text: r.get(4)?,
            })
        })?;
        rows.collect()
    }

    pub fn add_battle(&self, username: &str, b: &BattleRecord) -> rusqlite::Result<()> {
        self.db().execute(
            &format!(
                "INSERT INTO battles (username, {}) VALUES ({})",
                BATTLE.trim_start_matches("id, "),
                vec!["?"; 21].join(", ")
            ),
            params![
                username,
                b.character,
                b.level,
                b.started_at as i64,
                b.ended_at as i64,
                b.map_id,
                b.map_name,
                b.zone,
                b.mob_id,
                b.mob_name,
                b.mob_level,
                b.boss,
                b.source.key(),
                b.result.key(),
                b.turns,
                b.damage,
                b.hp_before,
                b.hp_after,
                b.max_hp,
                b.exp,
                b.coin
            ],
        )?;
        Ok(())
    }

    /// Newest first: the battles of `f` before row `before`.
    pub fn battles(
        &self,
        f: BattleFilter,
        before: Option<i64>,
        limit: u32,
    ) -> rusqlite::Result<Vec<StoredBattle>> {
        let (mut sql, mut args) = f.sql();
        if let Some(b) = before {
            sql.push_str(" AND id < ?");
            args.push(Value::from(b));
        }
        args.push(Value::from(limit as i64));
        let db = self.db();
        let mut q = db.prepare(&format!(
            "SELECT {BATTLE} FROM battles WHERE {sql} ORDER BY id DESC LIMIT ?"
        ))?;
        let rows = q.query_map(params_from_iter(args), battle)?;
        rows.collect()
    }

    /// The totals of the battles of `f`, then by mob and map, most battles first.
    pub fn stats(&self, f: BattleFilter) -> rusqlite::Result<BattleStats> {
        let (sql, args) = f.sql();
        let db = self.db();
        let totals_of = db.query_row(
            &format!("SELECT {TOTALS} FROM battles WHERE {sql}"),
            params_from_iter(args.clone()),
            |r| totals(r, 0),
        )?;
        let mut q = db.prepare(&format!(
            "SELECT mob_name, mob_level, MAX(boss), map_name, {TOTALS} FROM battles WHERE {sql} \
             GROUP BY mob_name, mob_level, map_name ORDER BY COUNT(*) DESC, mob_level DESC"
        ))?;
        let mobs = q
            .query_map(params_from_iter(args), |r| {
                Ok(MobTotals {
                    mob_name: r.get(0)?,
                    mob_level: r.get(1)?,
                    boss: r.get(2)?,
                    map_name: r.get(3)?,
                    totals: totals(r, 4)?,
                })
            })?
            .collect::<rusqlite::Result<_>>()?;
        Ok(BattleStats {
            totals: totals_of,
            mobs,
        })
    }

    /// Deletes the log lines older than LOG_DAYS before `now`; the number deleted.
    pub fn prune(&self, now: u64) -> rusqlite::Result<usize> {
        let cut = now.saturating_sub(LOG_DAYS * DAY_MS) as i64;
        self.db()
            .execute("DELETE FROM logs WHERE at < ?1", params![cut])
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn record(
        mob: &str,
        level: i32,
        result: BattleResult,
        source: BattleSource,
        ended_at: u64,
    ) -> BattleRecord {
        BattleRecord {
            character: "manina".into(),
            level: 21,
            started_at: ended_at - 30_000,
            ended_at,
            map_id: "M2".into(),
            map_name: "Trại Vân Sơn".into(),
            zone: 4,
            mob_id: "mob61000".into(),
            mob_name: mob.into(),
            mob_level: level,
            boss: false,
            source,
            result,
            turns: 10,
            damage: 249,
            hp_before: 238,
            hp_after: 200,
            max_hp: 238,
            exp: if result == BattleResult::Won { 52 } else { 0 },
            coin: if result == BattleResult::Won { 6 } else { 0 },
        }
    }

    #[test]
    fn logs_page_back_by_row_id_and_filter_by_kind_and_tone() {
        let s = Store::memory().unwrap();
        let at = 1_793_400_000_000;
        let a = s
            .add_log("manina2", at, LogKind::Connection, 0, "Đã vào game")
            .unwrap();
        let b = s
            .add_log("manina2", at, LogKind::Battle, 1, "Trận 1: thắng")
            .unwrap();
        s.add_log("tiheo2", at, LogKind::Battle, 1, "Trận 1: thắng")
            .unwrap();
        let c = s
            .add_log("manina2", at + 5, LogKind::Battle, 2, "Trận 2: thua")
            .unwrap();
        let ids = |v: Vec<StoredLog>| v.into_iter().map(|l| l.id).collect::<Vec<_>>();
        assert_eq!(
            ids(s.logs("manina2", None, &[], None, 10).unwrap()),
            [c, b, a]
        );
        assert_eq!(
            ids(s.logs("manina2", Some(c), &[], None, 10).unwrap()),
            [b, a]
        );
        assert_eq!(
            ids(s
                .logs("manina2", None, &[LogKind::Battle], None, 10)
                .unwrap()),
            [c, b]
        );
        assert_eq!(ids(s.logs("manina2", None, &[], Some(2), 10).unwrap()), [c]);
        assert_eq!(ids(s.logs("manina2", None, &[], None, 1).unwrap()), [c]);
        let line = &s.logs("manina2", Some(b), &[], None, 1).unwrap()[0];
        assert_eq!(
            (line.at, line.kind, line.text.as_str()),
            (at, LogKind::Connection, "Đã vào game")
        );
    }

    #[test]
    fn stats_count_wins_by_mob_since_a_time_and_by_source() {
        let s = Store::memory().unwrap();
        let day = 1_793_400_000_000;
        use BattleResult::*;
        use BattleSource::*;
        for (mob, level, result, source, at) in [
            ("Cóc Xanh", 13, Won, Fight, day),
            ("Cóc Xanh", 13, Won, Fight, day + 60_000),
            ("Cóc Xanh", 13, Lost, Quest, day + 120_000),
            ("Sói Xám", 11, Won, Quest, day + 180_000),
            ("Sói Xám", 11, Left, Fight, day - DAY_MS),
        ] {
            s.add_battle("manina2", &record(mob, level, result, source, at))
                .unwrap();
        }
        s.add_battle("tiheo2", &record("Heo Mọi", 7, Won, Fight, day))
            .unwrap();
        let all = BattleFilter {
            username: "manina2",
            since: None,
            source: None,
        };
        let st = s.stats(all).unwrap();
        assert_eq!(
            (
                st.totals.battles,
                st.totals.won,
                st.totals.lost,
                st.totals.left,
                st.totals.exp,
                st.totals.ms
            ),
            (5, 3, 1, 1, 156, 150_000)
        );
        let mobs: Vec<_> = st
            .mobs
            .iter()
            .map(|m| (m.mob_name.as_str(), m.totals.battles, m.totals.won))
            .collect();
        assert_eq!(mobs, [("Cóc Xanh", 3, 2), ("Sói Xám", 2, 1)]);
        let today = s
            .stats(BattleFilter {
                since: Some(day),
                ..all
            })
            .unwrap();
        assert_eq!((today.totals.battles, today.totals.left), (4, 0));
        let fights = s
            .stats(BattleFilter {
                source: Some(Fight),
                ..all
            })
            .unwrap();
        assert_eq!((fights.totals.battles, fights.totals.won), (3, 2));
        let none = s
            .stats(BattleFilter {
                username: "nobody",
                ..all
            })
            .unwrap();
        assert_eq!((none.totals, none.mobs.len()), (Totals::default(), 0));
        // The history, newest first, a page at a time.
        let page = s.battles(all, None, 2).unwrap();
        assert_eq!(
            page.iter()
                .map(|b| b.record.mob_name.as_str())
                .collect::<Vec<_>>(),
            ["Sói Xám", "Sói Xám"]
        );
        assert_eq!(
            page[0].record,
            record("Sói Xám", 11, Left, Fight, day - DAY_MS)
        );
        let next = s.battles(all, Some(page[1].id), 10).unwrap();
        assert_eq!(next.len(), 3);
    }

    #[test]
    fn prune_drops_log_lines_older_than_the_kept_days() {
        let s = Store::memory().unwrap();
        let now = 1_793_400_000_000;
        s.add_log(
            "manina2",
            now - (LOG_DAYS + 1) * DAY_MS,
            LogKind::Battle,
            0,
            "cũ",
        )
        .unwrap();
        s.add_log("manina2", now - DAY_MS, LogKind::Battle, 0, "mới")
            .unwrap();
        assert_eq!(s.prune(now).unwrap(), 1);
        let left: Vec<_> = s
            .logs("manina2", None, &[], None, 10)
            .unwrap()
            .into_iter()
            .map(|l| l.text)
            .collect();
        assert_eq!(left, ["mới"]);
    }
}
