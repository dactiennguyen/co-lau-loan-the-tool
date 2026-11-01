//! Túi đồ: the item buttons, Tự sửa đồ, Tự nhặt đồ and the wear of the gear.
use super::*;

/// Item actions of the Túi đồ tab (12-skills-items.md#c2s-1186): c2s/1186 to wear, take off or throw away, c2s/84 to
/// use, c2s/48 to repair, c2s/1257 to sort the bag. The server answers with s2c/37 and s2c/42 (gear and bag), s2c/1186,
/// s2c/48, s2c/83 (what is left in a bag slot), s2c/1187 (the bag sorted), or a notice.
impl Bot {
    /// One button of the item detail, or Sắp xếp. Refused, with the reason in the log and nothing sent, in a battle,
    /// while the last action waits for its answer (5 s), or when the item cannot take it: a potion outside a battle, a
    /// repair without a hammer, an item taken off into a full bag.
    pub fn item(&mut self, act: ItemAct, now: Instant, out: &mut Vec<Out>) {
        let pending = self
            .item_wait
            .as_ref()
            .is_some_and(|w| now < w.at + Duration::from_secs(5));
        let busy = if self.battle.is_some() {
            Some("đang đánh, đợi hết trận")
        } else if pending {
            Some("đang đợi server trả lời lần trước")
        } else if self.smith.is_some() {
            Some("đang làm việc ở Pháp sư hay Hương Lão")
        } else if self.gift.is_some() {
            Some("đang nhập mã quà tặng")
        } else {
            None
        };
        let (slot, worn) = match act {
            ItemAct::Sort => return self.sort_bag(busy, now, out),
            ItemAct::Equip(s) | ItemAct::Use(s) | ItemAct::Discard(s) => (s, false),
            ItemAct::Unequip(s) | ItemAct::Repair(s) => (s, true),
        };
        let bag = self.snap.bag.as_ref();
        let item = match worn {
            true => self.snap.gear.get(slot as usize).and_then(Option::as_ref),
            false => bag.and_then(|b| b.items.iter().find(|i| i.slot == slot)),
        };
        let place = match worn {
            true => format!("ô trang bị {slot}"),
            false => format!("ô túi {}", slot as u32 + 1),
        };
        let Some(item) = item else {
            return out.push(Out::Log(
                LogKind::Item,
                format!("Không có món nào ở {place}"),
            ));
        };
        let def = book().get(item.item_id);
        let name = def.map_or_else(|| format!("#{}", item.item_id), |d| d.name.clone());
        let kind = def.map(|d| d.kind);
        let most = def.map_or(0, |d| d.durability);
        let full = bag.is_some_and(|b| b.items.len() as i32 >= b.capacity);
        let hammer = bag.is_some_and(|b| b.items.iter().any(|i| i.item_id == HAMMER));
        let refused = busy.or_else(|| match act {
            ItemAct::Equip(_) if kind.is_some_and(|k| k > 7) => Some("không phải trang bị"),
            ItemAct::Unequip(_) if full => Some("túi đồ đã đầy"),
            ItemAct::Use(_) if kind == Some(POTION) => Some("bình chỉ dùng được trong trận"),
            ItemAct::Use(_) if kind.is_some_and(|k| k <= 7) => Some("là trang bị, hãy mặc"),
            ItemAct::Repair(_) if item.durability < 0 => Some("món này không có độ bền"),
            ItemAct::Repair(_) if item.durability >= most => Some("độ bền còn đầy"),
            ItemAct::Repair(_) if !hammer => Some("cần 1 Búa sửa chữa trong túi"),
            _ => None,
        });
        let verb = match act {
            ItemAct::Equip(_) => "Mặc",
            ItemAct::Unequip(_) => "Cởi",
            ItemAct::Use(_) => "Dùng",
            ItemAct::Repair(_) => "Sửa",
            ItemAct::Discard(_) => "Vứt",
            ItemAct::Sort => unreachable!("sort_bag"),
        };
        let name = match item.quantity {
            q if q > 1 && act == ItemAct::Discard(slot) => format!("{name} ×{q}"),
            _ => name,
        };
        if let Some(why) = refused {
            return out.push(Out::Log(
                LogKind::Item,
                format!("Chưa {} {name}: {why}", verb.to_lowercase()),
            ));
        }
        out.push(Out::Log(LogKind::Item, format!("{verb} {name} ({place})")));
        let place = Ctx {
            slot: Some(slot as i32),
            place: Some(0),
            ..Ctx::default()
        };
        match act {
            ItemAct::Equip(_) => Self::gear_action(out, 0, slot as i32),
            ItemAct::Unequip(_) => Self::gear_action(out, 1, slot as i32),
            ItemAct::Discard(_) => Self::gear_action(out, 2, slot as i32),
            ItemAct::Use(_) => Self::send(out, 84, place),
            _ => Self::send(out, 48, place),
        }
        self.item_wait = Some(ItemWait { act, name, at: now });
    }

    /// c2s/1186: `action` 0 wears the item of bag slot `slot`, 1 takes off the one of gear slot `slot`, 2 throws the
    /// item of bag slot `slot` away (12-skills-items.md#c2s-1186).
    pub(super) fn gear_action(out: &mut Vec<Out>, action: i32, slot: i32) {
        Self::send(
            out,
            1186,
            Ctx {
                action: Some(action),
                slot: Some(slot),
                ..Ctx::default()
            },
        );
    }

    /// Sắp xếp (I1): c2s/1257, and the server sends the whole bag again (s2c/1187), its items moved up over the empty
    /// slots in the same order, so every bag slot number may change. Refused like an item button.
    fn sort_bag(&mut self, busy: Option<&str>, now: Instant, out: &mut Vec<Out>) {
        if let Some(why) = busy {
            return out.push(Out::Log(
                LogKind::Item,
                format!("Chưa sắp xếp túi đồ: {why}"),
            ));
        }
        out.push(Out::Log(LogKind::Item, "Sắp xếp túi đồ".into()));
        Self::send(out, 1257, Ctx::default());
        self.item_wait = Some(ItemWait {
            act: ItemAct::Sort,
            name: String::new(),
            at: now,
        });
    }

    /// Cài đặt đánh, from the UI (accounts.json keeps it). It counts from the next battle of a run.
    pub fn set_fight(&mut self, settings: FightSettings, out: &mut Vec<Out>) {
        if settings == self.fight {
            return;
        }
        if settings.repair != self.fight.repair {
            out.push(Out::Log(
                LogKind::Item,
                match settings.repair {
                    true => "Bật tự sửa đồ: món đang mặc bị hỏng sẽ được sửa bằng búa trong túi trước trận sau",
                    false => "Tắt tự sửa đồ",
                }
                .into(),
            ));
            (self.repair_failed, self.repair_warned) = (HashSet::new(), false);
        }
        if settings.pickup != self.fight.pickup {
            out.push(Out::Log(
                LogKind::Item,
                match settings.pickup {
                    true => "Bật tự nhặt đồ: đồ của mình rơi sau mỗi trận thắng sẽ được nhặt",
                    false => "Tắt tự nhặt đồ",
                }
                .into(),
            ));
        }
        if settings.auto_skills != self.fight.auto_skills {
            out.push(Out::Log(
                LogKind::Character,
                match settings.auto_skills {
                    true => "Bật tự cộng kỹ năng: điểm kỹ năng vào kỹ năng cấp thấp nhất nâng được, chưa học trước",
                    false => "Tắt tự cộng kỹ năng",
                }
                .into(),
            ));
            self.skills_failed = false;
        }
        self.fight = settings;
    }

    /// Tự nhặt đồ, at the end of the won battle `won` (13-drops-items.md#g2): its own drops came just before the end, in
    /// the same read, and a few may come just after, so every item fallen within LOOT of it, before or after, is picked
    /// up with c2s/1188 from where the character stands; the server does not check the distance. A stranger's item in
    /// that window is refused for its first 16 s ("Không thể nhặt vật phẩm của người khác"), which costs nothing.
    pub(super) fn loot(&mut self, won: &BattleRecord, now: Instant, out: &mut Vec<Out>) {
        self.loot_until = Some(now + LOOT);
        self.loot_from = Some(LootFrom {
            battle_at: won.ended_at,
            map_name: won.map_name.clone(),
            mob_name: won.mob_name.clone(),
            source: won.source,
        });
        self.asked.clear();
        self.unanswered.clear();
        let own: Vec<Fallen> = self
            .drops
            .iter()
            .filter(|d| now.saturating_duration_since(d.at) <= LOOT)
            .cloned()
            .collect();
        for fallen in own {
            self.pick(fallen, now, out);
        }
    }
    /// Queues an item for c2s/1188, once; one goes out every PICK_GAP.
    pub(super) fn pick(&mut self, fallen: Fallen, now: Instant, out: &mut Vec<Out>) {
        if self.asked.contains(&fallen.uuid) || self.to_pick.iter().any(|p| p.uuid == fallen.uuid) {
            return;
        }
        self.to_pick.push_back(fallen);
        if self.pick_at.is_none() {
            self.pick_next(now, out);
        }
    }
    pub(super) fn pick_next(&mut self, now: Instant, out: &mut Vec<Out>) {
        let Some(fallen) = self.to_pick.pop_front() else {
            self.pick_at = None;
            return;
        };
        Self::send(
            out,
            1188,
            Ctx {
                uuid: Some(&fallen.uuid),
                ..Ctx::default()
            },
        );
        self.asked.insert(fallen.uuid.clone());
        self.unanswered.push_back(fallen);
        (self.picked_at, self.pick_at) = (Some(now), Some(now + PICK_GAP));
    }
    /// The server's answer to a c2s/1188: "Bạn vừa nhận được 137 Xu khóa", or a refusal ("Không thể nhặt vật phẩm của
    /// người khác"). It answers the oldest request not answered yet; a pickup, the one whose item it names, with that
    /// quantity if one does. A refusal is a Vật phẩm line. What was picked up is not: it counts in the fight job or quest
    /// run its battle was played for, and goes out as Out::Pickup, which the app shows under the line of that battle and
    /// keeps for Thống kê.
    pub(super) fn pick_answer(&mut self, text: String, out: &mut Vec<Out>) {
        let got = text.contains("nhận được");
        let find = |says: &dyn Fn(&Picked) -> String| {
            self.unanswered
                .iter()
                .position(|f| got && text.contains(&says(&f.item)))
        };
        let at = find(&|i| format!("{} {}", i.quantity, i.name))
            .or_else(|| find(&|i| i.name.clone()))
            .or((!self.unanswered.is_empty()).then_some(0));
        let (Some(fallen), Some(from)) = (
            at.and_then(|i| self.unanswered.remove(i)),
            self.loot_from.clone(),
        ) else {
            // Every request answered already: the line as the server says it.
            return out.push(Out::Log(
                LogKind::Item,
                match got {
                    true => text,
                    false => format!("Không nhặt được: {text}"),
                },
            ));
        };
        let item = fallen.item;
        if !got {
            return out.push(Out::Log(
                LogKind::Item,
                format!("Không nhặt được {}: {text}", item.label()),
            ));
        }
        let run = match from.source {
            BattleSource::Fight => self.snap.job.as_mut().map(|j| &mut j.picked),
            BattleSource::Quest => self.snap.quest_run.as_mut().map(|r| &mut r.picked),
            BattleSource::Other => None,
        };
        if let Some(list) = run {
            add_picked(list, &item);
        }
        out.push(Out::Pickup(Box::new(PickupRecord {
            character: self.snap.name.clone(),
            at: epoch_ms(),
            battle_at: from.battle_at,
            map_name: from.map_name,
            mob_name: from.mob_name,
            source: from.source,
            item,
        })));
    }

    /// s2c/36 after a battle: the durability of each worn item. One that just reached 0 is said in the log, as it adds
    /// nothing until it is repaired (10-quests.md#kết-quả-q3-q4).
    pub(super) fn wear(&mut self, slots: &[Option<i32>], out: &mut Vec<Out>) {
        for (slot, durability) in slots.iter().enumerate() {
            let (Some(d), Some(Some(item))) = (*durability, self.snap.gear.get_mut(slot)) else {
                continue;
            };
            if d == 0 && item.durability > 0 {
                let def = book().get(item.item_id);
                let name = def.map_or_else(|| format!("#{}", item.item_id), |d| d.name.clone());
                let most = def.map_or(0, |d| d.durability);
                out.push(Out::Log(
                    LogKind::Item,
                    format!("{name} đã hỏng (độ bền 0/{most})"),
                ));
            }
            item.durability = d;
        }
    }

    /// Tự sửa đồ (FightSettings::repair), from next() between the battles of a fight job or quest run: the first worn
    /// item at durability 0 is repaired with a Búa Sửa Chữa of the bag (c2s/48), and the run goes on once s2c/48 answers,
    /// or REPAIR_WAIT later. An item the server did not repair is left for the rest of the run; without a hammer the run
    /// goes on with the item broken, said once per run. Nothing goes out while a button of the Túi đồ tab waits for its
    /// answer: that one may be the same repair. True while the repair waits for its answer.
    pub(super) fn auto_repair(&mut self, now: Instant, out: &mut Vec<Out>) -> bool {
        if let Some((slot, name)) = self.repairing.take() {
            self.repair_failed.insert(slot);
            out.push(Out::Log(
                LogKind::Item,
                format!(
                    "Server không trả lời khi sửa {name} sau {} s; đánh tiếp với món hỏng",
                    REPAIR_WAIT.as_secs()
                ),
            ));
        }
        if self
            .item_wait
            .as_ref()
            .is_some_and(|w| now < w.at + Duration::from_secs(5))
        {
            return false;
        }
        let broken = self.snap.gear.iter().enumerate().find_map(|(slot, g)| {
            let item = g.as_ref()?;
            let def = book().get(item.item_id)?;
            (item.durability == 0
                && def.durability > 0
                && !self.repair_failed.contains(&(slot as u8)))
            .then(|| (slot as u8, def.name.clone(), def.durability))
        });
        let Some((slot, name, most)) = broken.filter(|_| self.fight.repair) else {
            return false;
        };
        let hammers: i32 = self.snap.bag.as_ref().map_or(0, |b| {
            b.items
                .iter()
                .filter(|i| i.item_id == HAMMER)
                .map(|i| i.quantity.max(1))
                .sum()
        });
        if hammers == 0 {
            if !self.repair_warned {
                self.repair_warned = true;
                out.push(Out::Log(
                    LogKind::Item,
                    format!("{name} đang hỏng (độ bền 0/{most}) nhưng túi hết Búa Sửa Chữa: đánh tiếp với món hỏng"),
                ));
            }
            return false;
        }
        out.push(Out::Log(
            LogKind::Item,
            format!(
                "Tự sửa {name} (độ bền 0/{most}, ô trang bị {slot}); còn {} búa sau lần này",
                hammers - 1
            ),
        ));
        let ctx = Ctx {
            slot: Some(slot as i32),
            place: Some(0),
            ..Ctx::default()
        };
        Self::send(out, 48, ctx);
        self.item_wait = Some(ItemWait {
            act: ItemAct::Repair(slot),
            name: name.clone(),
            at: now,
        });
        self.repairing = Some((slot, name));
        self.timer = Some((now + REPAIR_WAIT, Wake::Next));
        true
    }
}
