// cllt.db beside accounts.json: every log line, every battle and every item picked up, by account username (lower case),
// for the filters of the Nhật ký card and the Thống kê tab (docs/integration/rust/features.md#nhật-ký-và-thống-kê). One connection behind a
// mutex: in WAL mode with synchronous=NORMAL a write does not wait for the disk. PRAGMA user_version is the number of
// MIGRATIONS applied; a change of the tables is a new entry at the end, never an edit of an old one.
use cllt_core::battle_record::BattleData;
use cllt_core::bot::{BattleRecord, BattleResult, BattleSource, LogKind, Picked, PickupRecord};
use rusqlite::types::Value;
use rusqlite::{params, params_from_iter, Connection, Row};
use serde::Serialize;
use std::path::Path;
use std::sync::{Mutex, MutexGuard};

/// Log lines, and battles with the items picked up after them, older than this many days are deleted when the app starts
/// (Store::prune).
pub const LOG_DAYS: u64 = 30;
pub const BATTLE_DAYS: u64 = 90;
pub const DAY_MS: u64 = 86_400_000;

/// The tables, version by version: MIGRATIONS[i] takes a database from user_version i to i + 1. The first one is the
/// schema of 0.4.0 and before, all IF NOT EXISTS, so a cllt.db of those versions (user_version 0, tables there) goes
/// through it unchanged.
const MIGRATIONS: &[&str] = &[
    "
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
",
    // For the BATTLE_DAYS cut of prune.
    "CREATE INDEX IF NOT EXISTS battles_by_time ON battles (ended_at);",
    // Tự nhặt đồ: each item picked up, and the battle it fell from (battle_at is its ended_at).
    "
CREATE TABLE IF NOT EXISTS pickups (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL,
    character TEXT NOT NULL,
    at INTEGER NOT NULL,
    battle_at INTEGER NOT NULL,
    map_name TEXT NOT NULL,
    mob_name TEXT NOT NULL,
    source TEXT NOT NULL,
    item_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    quantity INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pickups_by_account ON pickups (username, battle_at);
CREATE INDEX IF NOT EXISTS pickups_by_time ON pickups (at);
",
    // The line of a won battle ("Trận 3: thắng …") keeps that battle's ended_at, so the items picked up after it come back
    // under it (Store::link_battle, Store::logs).
    "ALTER TABLE logs ADD COLUMN battle_at INTEGER;",
    // Lưu dữ liệu trận (battle_record.rs): each battle's packets and header, the gzip of a battle file of the TS bot.
    // Store::prune leaves it alone: it is kept for the training of the battle algorithm.
    "
CREATE TABLE IF NOT EXISTS battle_data (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    uuid TEXT NOT NULL,
    format INTEGER NOT NULL,
    header TEXT NOT NULL,
    packets BLOB NOT NULL
);
CREATE INDEX IF NOT EXISTS battle_data_by_account ON battle_data (username, started_at);
",
];

/// A log line as cllt.db keeps it; the line of a won battle with the items picked up after it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct StoredLog {
    pub id: i64,
    /// ms since 1970.
    pub at: u64,
    pub kind: LogKind,
    pub tone: u8,
    pub text: String,
    pub picked: Vec<Picked>,
}

/// A battle of the history, with its row id (the cursor for the next page) and what was picked up after it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct StoredBattle {
    pub id: i64,
    #[serde(flatten)]
    pub record: BattleRecord,
    pub picked: Vec<PickedItem>,
}

/// An item picked up after some battles: the quantities summed, and how many times.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickedItem {
    #[serde(flatten)]
    pub item: Picked,
    pub times: u32,
}

/// SUMS of the pickups of a group, from column `at`: item_id, name, times, quantity.
const SUMS: &str = "item_id, MAX(name), COUNT(*), SUM(quantity)";
/// The items picked up after the battles of `username` that ended from `first` to `last` (ms since 1970), summed by
/// battle and item: (battle_at, item), first picked first.
fn picked_by_battle(
    db: &Connection,
    username: &str,
    first: i64,
    last: i64,
) -> rusqlite::Result<Vec<(u64, PickedItem)>> {
    let mut q = db.prepare(&format!(
        "SELECT battle_at, {SUMS} FROM pickups WHERE username = ?1 AND battle_at BETWEEN ?2 AND ?3 \
         GROUP BY battle_at, item_id ORDER BY MIN(id)"
    ))?;
    let rows = q.query_map(params![username, first, last], |r| {
        Ok((r.get::<_, i64>(0)? as u64, picked_item(r, 1)?))
    })?;
    rows.collect()
}

fn picked_item(row: &Row, at: usize) -> rusqlite::Result<PickedItem> {
    let item_id: i32 = row.get(at)?;
    Ok(PickedItem {
        item: Picked {
            name: row.get(at + 1)?,
            ..Picked::of(item_id, row.get(at + 3)?)
        },
        times: row.get(at + 2)?,
    })
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

/// The Thống kê tab: the totals, then each mob, most battles first, then each item picked up, most times first.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BattleStats {
    #[serde(flatten)]
    pub totals: Totals,
    pub mobs: Vec<MobTotals>,
    pub picked: Vec<PickedItem>,
}

/// Which battles a query takes, or the items picked up after them: of one account, ended since a time, played for one
/// source.
#[derive(Debug, Clone, Copy)]
pub struct BattleFilter<'a> {
    pub username: &'a str,
    pub since: Option<u64>,
    pub source: Option<BattleSource>,
}
impl BattleFilter<'_> {
    /// The WHERE of the battles table, or with `ended` "battle_at" of the pickups table.
    fn sql(&self, ended: &str) -> (String, Vec<Value>) {
        let mut sql = "username = ?".to_string();
        let mut args = vec![Value::from(self.username.to_string())];
        if let Some(t) = self.since {
            sql.push_str(&format!(" AND {ended} >= ?"));
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
        picked: vec![],
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
    fn init(mut db: Connection) -> rusqlite::Result<Self> {
        db.pragma_update_and_check(None, "journal_mode", "WAL", |_| Ok(()))?;
        db.pragma_update(None, "synchronous", "NORMAL")?;
        migrate(&mut db)?;
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

    /// Line `id` is the one of the won battle that ended at `battle_at`: the items picked up after it come with it.
    pub fn link_battle(&self, id: i64, battle_at: u64) -> rusqlite::Result<()> {
        self.db().execute(
            "UPDATE logs SET battle_at = ?1 WHERE id = ?2",
            params![battle_at as i64, id],
        )?;
        Ok(())
    }

    /// Newest first: lines of `username` before row `before`, of `kinds` (all when empty), of `tone` only when given; the
    /// line of a won battle with what was picked up after it.
    pub fn logs(
        &self,
        username: &str,
        before: Option<i64>,
        kinds: &[LogKind],
        tone: Option<u8>,
        limit: u32,
    ) -> rusqlite::Result<Vec<StoredLog>> {
        let mut sql =
            "SELECT id, at, kind, tone, text, battle_at FROM logs WHERE username = ?".to_string();
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
            let line = StoredLog {
                id: r.get(0)?,
                at: r.get::<_, i64>(1)? as u64,
                kind: LogKind::from_key(&r.get::<_, String>(2)?).unwrap_or(LogKind::Server),
                tone: r.get(3)?,
                text: r.get(4)?,
                picked: vec![],
            };
            Ok((line, r.get::<_, Option<i64>>(5)?))
        })?;
        let mut lines: Vec<(StoredLog, Option<i64>)> = rows.collect::<rusqlite::Result<_>>()?;
        let ends = lines.iter().filter_map(|l| l.1);
        if let (Some(first), Some(last)) = (ends.clone().min(), ends.max()) {
            for (at, item) in picked_by_battle(&db, username, first, last)? {
                if let Some(l) = lines.iter_mut().find(|l| l.1 == Some(at as i64)) {
                    l.0.picked.push(item.item);
                }
            }
        }
        Ok(lines.into_iter().map(|l| l.0).collect())
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

    pub fn add_battle_data(&self, username: &str, d: &BattleData) -> rusqlite::Result<()> {
        self.db().execute(
            "INSERT INTO battle_data (username, started_at, uuid, format, header, packets) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![username, d.started_at as i64, d.uuid, d.format, d.header, d.packets],
        )?;
        Ok(())
    }

    pub fn add_pickup(&self, username: &str, p: &PickupRecord) -> rusqlite::Result<()> {
        self.db().execute(
            "INSERT INTO pickups (username, character, at, battle_at, map_name, mob_name, source, item_id, name, \
             quantity) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                username,
                p.character,
                p.at as i64,
                p.battle_at as i64,
                p.map_name,
                p.mob_name,
                p.source.key(),
                p.item.item_id,
                p.item.name,
                p.item.quantity
            ],
        )?;
        Ok(())
    }

    /// Newest first: the battles of `f` before row `before`, each with the items picked up after it.
    pub fn battles(
        &self,
        f: BattleFilter,
        before: Option<i64>,
        limit: u32,
    ) -> rusqlite::Result<Vec<StoredBattle>> {
        let (mut sql, mut args) = f.sql("ended_at");
        if let Some(b) = before {
            sql.push_str(" AND id < ?");
            args.push(Value::from(b));
        }
        args.push(Value::from(limit as i64));
        let db = self.db();
        let mut q = db.prepare(&format!(
            "SELECT {BATTLE} FROM battles WHERE {sql} ORDER BY id DESC LIMIT ?"
        ))?;
        let mut page: Vec<StoredBattle> = q
            .query_map(params_from_iter(args), battle)?
            .collect::<rusqlite::Result<_>>()?;
        let ends = page.iter().map(|b| b.record.ended_at as i64);
        let (Some(first), Some(last)) = (ends.clone().min(), ends.max()) else {
            return Ok(page);
        };
        for (at, item) in picked_by_battle(&db, f.username, first, last)? {
            if let Some(b) = page.iter_mut().find(|b| b.record.ended_at == at) {
                b.picked.push(item);
            }
        }
        Ok(page)
    }

    /// The totals of the battles of `f`, then by mob and map, most battles first, then the items picked up after them,
    /// most times first.
    pub fn stats(&self, f: BattleFilter) -> rusqlite::Result<BattleStats> {
        let (sql, args) = f.sql("ended_at");
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
        let (sql, args) = f.sql("battle_at");
        let mut q = db.prepare(&format!(
            "SELECT {SUMS} FROM pickups WHERE {sql} GROUP BY item_id ORDER BY COUNT(*) DESC, SUM(quantity) DESC"
        ))?;
        let picked = q
            .query_map(params_from_iter(args), |r| picked_item(r, 0))?
            .collect::<rusqlite::Result<_>>()?;
        Ok(BattleStats {
            totals: totals_of,
            mobs,
            picked,
        })
    }

    /// Deletes the log lines older than LOG_DAYS, and the battles that ended more than BATTLE_DAYS before `now` with the
    /// items picked up after them; the numbers deleted (lines, battles, pickups).
    pub fn prune(&self, now: u64) -> rusqlite::Result<(usize, usize, usize)> {
        let cut = |days: u64| now.saturating_sub(days * DAY_MS) as i64;
        let db = self.db();
        let logs = db.execute("DELETE FROM logs WHERE at < ?1", params![cut(LOG_DAYS)])?;
        let battles = db.execute(
            "DELETE FROM battles WHERE ended_at < ?1",
            params![cut(BATTLE_DAYS)],
        )?;
        let pickups = db.execute(
            "DELETE FROM pickups WHERE battle_at < ?1",
            params![cut(BATTLE_DAYS)],
        )?;
        Ok((logs, battles, pickups))
    }
}

/// Brings the tables up to the last of MIGRATIONS, each step in its own transaction with the user_version it reaches. A
/// database from a newer app (a user_version past them) is not opened, so this one cannot spoil it: the app then runs
/// without history.
fn migrate(db: &mut Connection) -> rusqlite::Result<()> {
    let at = db
        .pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))?
        .max(0) as usize;
    if at > MIGRATIONS.len() {
        return Err(rusqlite::Error::SqliteFailure(
            rusqlite::ffi::Error::new(rusqlite::ffi::SQLITE_CANTOPEN),
            Some(format!(
                "cllt.db của bản app mới hơn (phiên bản {at}, bản này đọc tới {})",
                MIGRATIONS.len()
            )),
        ));
    }
    for (i, step) in MIGRATIONS.iter().enumerate().skip(at) {
        let tx = db.transaction()?;
        tx.execute_batch(step)?;
        tx.pragma_update(None, "user_version", (i + 1) as i64)?;
        tx.commit()?;
    }
    Ok(())
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

    fn pickup(battle: &BattleRecord, item_id: i32, name: &str, quantity: i64) -> PickupRecord {
        PickupRecord {
            character: battle.character.clone(),
            at: battle.ended_at + 30,
            battle_at: battle.ended_at,
            map_name: battle.map_name.clone(),
            mob_name: battle.mob_name.clone(),
            source: battle.source,
            item: Picked {
                name: name.into(),
                ..Picked::of(item_id, quantity)
            },
        }
    }

    #[test]
    fn pickups_sum_by_item_in_the_stats_and_come_with_their_battle_in_the_history() {
        let s = Store::memory().unwrap();
        let day = 1_793_400_000_000;
        use BattleResult::*;
        use BattleSource::*;
        let fight = record("Cóc Xanh", 13, Won, Fight, day);
        let quest = record("Sói Xám", 11, Won, Quest, day + 60_000);
        let lost = record("Sói Xám", 11, Lost, Quest, day + 120_000);
        let old = record("Cóc Xanh", 13, Won, Fight, day - DAY_MS);
        for b in [&old, &fight, &quest, &lost] {
            s.add_battle("manina2", b).unwrap();
        }
        for (b, id, name, qty) in [
            (&fight, 41, "Xu khóa", 230),
            (&fight, 412, "Đá cấp 2", 1),
            (&fight, 412, "Đá cấp 2", 1),
            (&quest, 41, "Xu khóa", 212),
            (&old, 41, "Xu khóa", 207),
        ] {
            s.add_pickup("manina2", &pickup(b, id, name, qty)).unwrap();
        }
        s.add_pickup("tiheo2", &pickup(&fight, 3, "Trứng Gà", 1))
            .unwrap();
        let all = BattleFilter {
            username: "manina2",
            since: None,
            source: None,
        };
        let sums = |st: BattleStats| -> Vec<(String, u32, i64, Option<i32>)> {
            st.picked
                .into_iter()
                .map(|p| (p.item.name, p.times, p.item.quantity, p.item.icon))
                .collect()
        };
        assert_eq!(
            sums(s.stats(all).unwrap()),
            [
                ("Xu khóa".into(), 3, 649, Some(190)),
                ("Đá cấp 2".into(), 2, 2, Some(168))
            ]
        );
        // Of the battles of the range and the source, as the battles are.
        let today = BattleFilter {
            since: Some(day),
            ..all
        };
        assert_eq!(
            sums(
                s.stats(BattleFilter {
                    source: Some(Quest),
                    ..today
                })
                .unwrap()
            ),
            [("Xu khóa".into(), 1, 212, Some(190))]
        );
        let page = s.battles(today, None, 10).unwrap();
        let picked: Vec<Vec<(String, u32, i64)>> = page
            .iter()
            .map(|b| {
                b.picked
                    .iter()
                    .map(|p| (p.item.name.clone(), p.times, p.item.quantity))
                    .collect()
            })
            .collect();
        assert_eq!(
            picked,
            [
                vec![],
                vec![("Xu khóa".into(), 1, 212)],
                vec![("Xu khóa".into(), 1, 230), ("Đá cấp 2".into(), 2, 2)],
            ]
        );
    }

    #[test]
    fn a_log_line_linked_to_its_battle_comes_back_with_the_items_picked_up_after_it() {
        let s = Store::memory().unwrap();
        let day = 1_793_400_000_000;
        let won = record("Cóc Xanh", 13, BattleResult::Won, BattleSource::Fight, day);
        s.add_battle("manina2", &won).unwrap();
        let open = s
            .add_log(
                "manina2",
                day - 30_000,
                LogKind::Battle,
                0,
                "Trận 1: thách đấu Cóc Xanh",
            )
            .unwrap();
        let line = s
            .add_log("manina2", day + 5, LogKind::Battle, 1, "Trận 1: thắng")
            .unwrap();
        s.link_battle(line, won.ended_at).unwrap();
        for (id, name, qty) in [
            (41, "Xu khóa", 230),
            (412, "Đá cấp 2", 1),
            (412, "Đá cấp 2", 1),
        ] {
            s.add_pickup("manina2", &pickup(&won, id, name, qty))
                .unwrap();
        }
        // Another account's item after a battle that ended at the same time is not this line's.
        s.add_pickup("tiheo2", &pickup(&won, 3, "Trứng Gà", 1))
            .unwrap();
        let lines = s.logs("manina2", None, &[], None, 10).unwrap();
        assert_eq!(lines.iter().map(|l| l.id).collect::<Vec<_>>(), [line, open]);
        let picked: Vec<(&str, i64)> = lines[0]
            .picked
            .iter()
            .map(|p| (p.name.as_str(), p.quantity))
            .collect();
        assert_eq!(picked, [("Xu khóa", 230), ("Đá cấp 2", 2)]);
        assert!(lines[1].picked.is_empty());
    }

    #[test]
    fn prune_drops_log_lines_and_battles_older_than_the_kept_days() {
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
        // A battle past BATTLE_DAYS goes with its pickups; one past LOG_DAYS only stays, as the 30 ngày of Thống kê needs
        // it.
        for (mob, days) in [("Cóc Xanh", BATTLE_DAYS + 1), ("Heo Mọi", LOG_DAYS + 1)] {
            let ended = now - days * DAY_MS;
            let b = record(mob, 13, BattleResult::Won, BattleSource::Fight, ended);
            s.add_battle("manina2", &b).unwrap();
            s.add_pickup("manina2", &pickup(&b, 41, "Xu khóa", 140))
                .unwrap();
        }
        assert_eq!(s.prune(now).unwrap(), (1, 1, 1));
        let left: Vec<_> = s
            .logs("manina2", None, &[], None, 10)
            .unwrap()
            .into_iter()
            .map(|l| l.text)
            .collect();
        assert_eq!(left, ["mới"]);
        let all = BattleFilter {
            username: "manina2",
            since: None,
            source: None,
        };
        let kept: Vec<_> = s
            .battles(all, None, 10)
            .unwrap()
            .into_iter()
            .map(|b| b.record.mob_name)
            .collect();
        assert_eq!(kept, ["Heo Mọi"]);
        assert_eq!(s.stats(all).unwrap().picked[0].times, 1);
    }

    fn version(db: &Connection) -> usize {
        db.pragma_query_value(None, "user_version", |r| r.get::<_, i64>(0))
            .unwrap() as usize
    }

    #[test]
    fn battle_data_is_kept_whole_and_prune_leaves_it() {
        let s = Store::memory().unwrap();
        let d = BattleData {
            uuid: "3f1c2a9e".into(),
            started_at: 1_000,
            format: 1,
            header: r#"{"kind":"header","format":1}"#.into(),
            packets: vec![0x1f, 0x8b, 8, 0, 0xff],
        };
        s.add_battle_data("manina2", &d).unwrap();
        s.prune(1_000 + (BATTLE_DAYS + 5) * DAY_MS).unwrap();
        let row: (String, i64, String, i64, String, Vec<u8>) = s
            .db()
            .query_row(
                "SELECT username, started_at, uuid, format, header, packets FROM battle_data",
                [],
                |r| {
                    Ok((
                        r.get(0)?,
                        r.get(1)?,
                        r.get(2)?,
                        r.get(3)?,
                        r.get(4)?,
                        r.get(5)?,
                    ))
                },
            )
            .unwrap();
        assert_eq!(
            row,
            ("manina2".into(), 1_000, d.uuid, 1, d.header, d.packets)
        );
    }

    #[test]
    fn a_new_database_is_at_the_last_migration() {
        let s = Store::memory().unwrap();
        assert_eq!(version(&s.db()), MIGRATIONS.len());
    }

    #[test]
    fn a_database_of_0_4_0_keeps_its_rows_through_the_migrations() {
        // cllt.db as 0.4.0 left it: the tables of the first migration, user_version 0.
        let db = Connection::open_in_memory().unwrap();
        db.execute_batch(MIGRATIONS[0]).unwrap();
        db.execute(
            "INSERT INTO logs (username, at, kind, tone, text) VALUES ('manina2', 1, 'battle', 0, 'Trận 1: thắng')",
            [],
        )
        .unwrap();
        assert_eq!(version(&db), 0);
        let s = Store::init(db).unwrap();
        assert_eq!(version(&s.db()), MIGRATIONS.len());
        let texts: Vec<_> = s
            .logs("manina2", None, &[], None, 10)
            .unwrap()
            .into_iter()
            .map(|l| l.text)
            .collect();
        assert_eq!(texts, ["Trận 1: thắng"]);
        let index: i64 = s
            .db()
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type = 'index' AND name = 'battles_by_time'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(index, 1);
        assert!(s
            .stats(BattleFilter {
                username: "manina2",
                since: None,
                source: None
            })
            .unwrap()
            .picked
            .is_empty());
        // Opened again, nothing more to do.
        let again = Store::init(s.db.into_inner().unwrap()).unwrap();
        assert_eq!(version(&again.db()), MIGRATIONS.len());
    }

    #[test]
    fn a_database_of_a_newer_app_is_not_opened() {
        let db = Connection::open_in_memory().unwrap();
        db.pragma_update(None, "user_version", MIGRATIONS.len() as i64 + 1)
            .unwrap();
        let e = Store::init(db).err().unwrap().to_string();
        assert!(e.contains("bản app mới hơn"), "{e}");
    }
}
