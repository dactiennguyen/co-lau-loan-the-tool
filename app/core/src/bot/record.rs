//! Lưu dữ liệu trận (BotOptions::record): each battle the bot plays, its packets both ways between s2c/22 and the
//! s2c/1214 after its end, with what both sides were as it opened, goes out as Out::BattleData (battle_record.rs,
//! docs/app/events/07-auto-battle.md#ghi-trận). The session hands the packets it sends to record_sent.
use super::*;
use serde_json::{json, Value};

/// How the last battle of the session ended, for the `before` of the next one's header.
#[derive(Debug, Clone)]
pub(super) struct LastBattle {
    ended_at: u64,
    won: bool,
    hp: i32,
    max_hp: i32,
    mob_id: String,
}

impl Bot {
    /// Keeps how `r` ended, for the header of the next battle (`before`).
    pub(super) fn remember_battle(&mut self, r: &BattleRecord) {
        self.last_battle = Some(LastBattle {
            ended_at: r.ended_at,
            won: r.result == BattleResult::Won,
            hp: r.hp_after,
            max_hp: r.max_hp,
            mob_id: r.mob_id.clone(),
        });
    }

    /// Lưu dữ liệu trận, from the app's Cài đặt (Manager::set_record). It counts from the next battle; the one being
    /// recorded is kept.
    pub fn set_record(&mut self, on: bool, out: &mut Vec<Out>) {
        if on == self.options.record {
            return;
        }
        self.options.record = on;
        out.push(Out::Log(
            LogKind::Battle,
            match on {
                true => "Bật lưu dữ liệu trận: gói tin của mỗi trận được lưu vào cllt.db",
                false => "Tắt lưu dữ liệu trận",
            }
            .into(),
        ));
    }

    /// A packet the session sent, kept when it belongs to the battle being recorded.
    pub fn record_sent(&mut self, opcode: i32, payload: &[u8], now: Instant) {
        if let Some(r) = &mut self.recorder {
            r.packet(true, opcode, payload, now);
        }
    }

    /// A packet received; the s2c/1214 after the end sends the data out. Without it, the first packet past END_WAIT
    /// after the end does (s2c/1 answers the heartbeat every few seconds), and is not part of the battle.
    pub(super) fn record_received(
        &mut self,
        opcode: i32,
        payload: &[u8],
        now: Instant,
        out: &mut Vec<Out>,
    ) {
        self.record_overdue(now, out);
        if self
            .recorder
            .as_mut()
            .is_some_and(|r| r.packet(false, opcode, payload, now))
        {
            self.flush_record(out);
        }
    }

    /// Sends the data of a battle ended more than END_WAIT ago (on_timer, record_received).
    pub(super) fn record_overdue(&mut self, now: Instant, out: &mut Vec<Out>) {
        if self
            .recorder
            .as_ref()
            .and_then(|r| r.ending)
            .is_some_and(|e| e <= now)
        {
            self.flush_record(out);
        }
    }

    /// Opens the data of the battle s2c/22 just opened: the header, then the s2c/22 itself. A battle still open (its
    /// s2c/1214 not come yet) goes out first.
    pub(super) fn record_start(
        &mut self,
        payload: &[u8],
        uuid: &str,
        mob_id: &str,
        now: Instant,
        out: &mut Vec<Out>,
    ) {
        if self.recorder.is_some() {
            self.flush_record(out);
        }
        if !self.options.record {
            return;
        }
        let mut r = Recorder::start(
            uuid,
            self.record_header(payload, mob_id),
            self.battle_at,
            now,
        );
        r.packet(false, 22, payload, now);
        self.recorder = Some(r);
    }

    /// The result line: `result` is an object (won, exp…, or cancelled, left).
    pub(super) fn record_end(&mut self, result: Value, now: Instant) {
        if let Some(r) = &mut self.recorder {
            r.end(result, now);
        }
    }

    pub(super) fn flush_record(&mut self, out: &mut Vec<Out>) {
        if let Some(r) = self.recorder.take() {
            out.push(Out::BattleData(Box::new(r.finish())));
        }
    }

    /// The first line of the battle data, as recordHeader of src/bot/quest.ts: the character (element as code and name: 1
    /// Hỏa, 2 Lôi, 4 Thủy), its stats, skills, gear and potions, the mob of the s2c/22 block, the map, and how the bot
    /// plays (algorithm, strategy; for v3 the potion cost and `memory`, what the session learnt, as the TS bot).
    fn record_header(&self, payload: &[u8], mob_id: &str) -> Value {
        let s = &self.snap;
        let element = |e: Option<i32>| {
            e.and_then(|e| book().element_name(e as u8))
                .map(str::to_string)
        };
        let mob = mob_block(payload, mob_id);
        let known = self.mobs.iter().find(|m| m.id == mob_id);
        let setup = battle_setup(payload).ok();
        let potions: Vec<Value> = s
            .bag
            .iter()
            .flat_map(|b| &b.items)
            .filter(|i| book().get(i.item_id).is_some_and(|d| d.kind == POTION) && i.quantity > 0)
            .map(|i| json!({ "slot": i.slot, "itemId": i.item_id, "quantity": i.quantity }))
            .collect();
        let gear: Vec<Value> = s
            .gear
            .iter()
            .flatten()
            .map(|g| {
                let stats: Vec<Value> = g.stats.iter().map(|x| json!({ "stat": x.stat, "value": x.value })).collect();
                json!({ "slot": g.slot, "itemId": g.item_id, "plus": g.field0, "element": g.element, "durability": g.durability, "stats": stats })
            })
            .collect();
        let name = mob
            .as_ref()
            .map(|m| m.name.clone())
            .or_else(|| known.map(|m| m.name.clone()));
        // What the battle plays (on_setup): v1 the account's search, v3 `win` with what the session learnt.
        let algorithm = self.options.algorithm;
        let strategy = match algorithm {
            Algorithm::V1 => self.options.strategy.clone(),
            Algorithm::V3 => Strategy::win(),
        };
        let memory: Option<serde_json::Map<String, Value>> =
            (algorithm == Algorithm::V3).then(|| {
                let m = self.battle_memory.lock().unwrap_or_else(|e| e.into_inner());
                m.iter()
                    .map(|(k, &(sum, n))| (k.clone(), json!([sum, n])))
                    .collect()
            });
        json!({
            "bot": "app",
            "version": env!("CARGO_PKG_VERSION"),
            "character": setup.as_ref().map_or(s.name.clone(), |x| x.me.clone()),
            "level": s.level,
            "element": s.element,
            "elementName": element(s.element),
            "hp": setup.as_ref().map(|x| x.hp),
            "maxHp": setup.as_ref().map(|x| x.max_hp),
            "combat": s.combat,
            "potentials": s.stats,
            "skills": s.skill_levels.iter().filter(|(_, &l)| l > 0).map(|(&id, &l)| json!([id, l])).collect::<Vec<_>>(),
            "gear": gear,
            "potions": potions,
            "mob": {
                "id": mob_id,
                "name": name,
                "level": mob.as_ref().map(|m| m.level).or(known.map(|m| m.level)),
                "element": mob.as_ref().map(|m| m.element),
                "elementName": element(mob.as_ref().map(|m| m.element as i32)),
                "hp": mob.as_ref().map(|m| m.hp),
                "maxHp": mob.as_ref().map(|m| m.max_hp),
                "boss": self.bosses.contains(mob_id) || name.as_deref().is_some_and(|n| self.is_boss(n)),
            },
            "map": s.map_id,
            "zone": s.zone,
            "play": {
                "algorithm": algorithm.key(),
                "strategy": {
                    "extraTurn": strategy.extra_turn,
                    "reply": strategy.reply,
                    "bonus": strategy.bonus,
                    "mobModel": format!("{:?}", strategy.mob_model).to_lowercase(),
                    "lookahead": strategy.lookahead,
                },
                "skill": self.options.skill.map(|k| json!({ "id": k.id, "cost": k.cost })),
                "potionCost": self.options.potion_cost.filter(|_| algorithm == Algorithm::V3),
                "source": self.battle_source.key(),
            },
            "memory": memory,
            // What came just before (07-auto-battle.md#ghi-trận): the battle's number in the session, the rest since the
            // last one and how that one ended, for learning when to rest or heal.
            "before": {
                "session": self.battles_started,
                "restMs": self.last_battle.as_ref().map(|l| self.battle_at.saturating_sub(l.ended_at)),
                "last": self.last_battle.as_ref().map(|l| json!({ "won": l.won, "hp": l.hp, "maxHp": l.max_hp, "mob": l.mob_id })),
            },
        })
    }
}
