//! Túi đồ: the item buttons, Tự sửa đồ, Tự nhặt đồ and the wear of the gear.
use super::*;

/// Item types worn in a gear slot: 0–7, and Giày (8), Dây chuyền (9) since the game 1.1.0 (20/11: s2c/9 and s2c/37 carry
/// 10 gear slots, the slot is the type).
fn is_gear(kind: u8) -> bool {
    kind <= 9
}

/// Item actions of the Túi đồ tab (12-skills-items.md#c2s-1186): c2s/1186 to wear, take off or throw away, c2s/84 to
/// use, c2s/48 to repair, c2s/1257 to sort the bag. The server answers with s2c/37 and s2c/42 (gear and bag), s2c/1186,
/// s2c/48, s2c/83 (what is left in a bag slot), s2c/1187 (the bag sorted), or a notice.
impl Bot {
    /// One button of the item detail, or Sắp xếp. Refused, with the reason in the log and nothing sent, in a battle,
    /// while the last action waits for its answer (5 s), or when the item cannot take it: a potion outside a battle, a
    /// repair without a hammer, an item taken off into a full bag.
    pub fn item(&mut self, act: ItemAct, now: Instant, out: &mut Vec<Out>) {
        let busy = if self.battle.is_some() {
            Some("đang đánh, đợi hết trận")
        } else if self.item_pending(now) {
            Some("đang đợi server trả lời lần trước")
        } else if self.smith.is_some() {
            Some("đang làm việc ở Pháp sư hay Hương Lão")
        } else if self.gift.is_some() {
            Some("đang nhập mã quà tặng")
        } else if self.mail_changing() {
            Some("đang nhận hay xoá thư")
        } else if self.market_changing() {
            Some("đang mua bán ở Chợ trời")
        } else if self.eggs.is_some() {
            Some("đang đập trứng, bấm Dừng trước")
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
        // Gear of the other gender: the server would only say "Trang bị không phù hợp".
        let wrong = match act {
            ItemAct::Equip(_) => def.and_then(|d| crate::items::misfit(d.gender, self.snap.gender)),
            _ => None,
        };
        let refused = busy.map(str::to_string).or(wrong).or_else(|| match act {
            ItemAct::Equip(_) if kind.is_some_and(|k| !is_gear(k)) => {
                Some("không phải trang bị".into())
            }
            ItemAct::Unequip(_) if full => Some("túi đồ đã đầy".into()),
            ItemAct::Use(_) if kind == Some(POTION) => Some("bình chỉ dùng được trong trận".into()),
            ItemAct::Use(_) if kind.is_some_and(is_gear) => Some("là trang bị, hãy mặc".into()),
            ItemAct::Repair(_) if item.durability < 0 => Some("món này không có độ bền".into()),
            ItemAct::Repair(_) if item.durability >= most => Some("độ bền còn đầy".into()),
            ItemAct::Repair(_) if !hammer => Some("cần 1 Búa sửa chữa trong túi".into()),
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
    pub fn set_fight(&mut self, settings: FightSettings, now: Instant, out: &mut Vec<Out>) {
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
        if settings.pickup_other_gender != self.fight.pickup_other_gender {
            out.push(Out::Log(
                LogKind::Item,
                match settings.pickup_other_gender {
                    true => "Bật nhặt cả đồ khác giới tính: tự nhặt đồ nhặt cả trang bị nhân vật không mặc được",
                    false => "Tắt nhặt đồ khác giới tính: trang bị nhân vật không mặc được sẽ để lại dưới đất",
                }
                .into(),
            ));
        }
        if settings.pickup_others != self.fight.pickup_others {
            out.push(Out::Log(
                LogKind::Item,
                match settings.pickup_others {
                    true => "Bật nhặt cả đồ người khác: sau mỗi trận thắng, tự nhặt đồ nhặt thêm đồ người khác bỏ lại trong khu từ 18 giây tuổi, khi túi còn chỗ",
                    false => "Tắt nhặt đồ người khác: chỉ nhặt đồ của mình",
                }
                .into(),
            ));
        }
        if settings.pickup_own_element != self.fight.pickup_own_element {
            out.push(Out::Log(
                LogKind::Item,
                match settings.pickup_own_element {
                    true => "Bật chỉ nhặt trang bị đúng hệ: trang bị khác hệ nhân vật sẽ để lại dưới đất",
                    false => "Tắt chỉ nhặt trang bị đúng hệ: nhặt trang bị mọi hệ",
                }
                .into(),
            ));
        }
        if settings.qualities() != self.fight.qualities() {
            let ticked: Vec<&str> = (crate::items::QUALITY_NAMES.iter())
                .zip(settings.qualities())
                .filter_map(|(name, on)| on.then_some(*name))
                .collect();
            out.push(Out::Log(
                LogKind::Item,
                match ticked.len() {
                    0 => "Phẩm chất trang bị nhặt: không chọn phẩm chất nào, mọi trang bị sẽ để lại dưới đất".into(),
                    4 => "Phẩm chất trang bị nhặt: nhặt trang bị mọi phẩm chất".into(),
                    _ => format!(
                        "Phẩm chất trang bị nhặt: chỉ nhặt trang bị {}",
                        ticked.join(", ")
                    ),
                },
            ));
        }
        for (id, kind, name, when) in [
            (0, "máu", "Hoàn Linh Dược", "uống khi sắp chết"),
            (1, "mana", "Kim Đan Dược", "uống khi kỹ năng cần nội lực"),
        ] {
            let rule = settings.potion_rule(id);
            if rule == self.fight.potion_rule(id) {
                continue;
            }
            out.push(Out::Log(
                LogKind::Battle,
                match rule {
                    Some((max, keep)) => format!(
                        "Dùng bình {kind}: tối đa {max} {name} mỗi trận, {when}; giữ lại {keep} trong túi, không tự mua"
                    ),
                    None => format!("Tắt dùng bình {kind}"),
                },
            ));
            self.potions_kept[id as usize] = false;
            // Off from now on, also in the battle under way; a new max or keep counts from the next battle.
            if rule.is_none() {
                if let Some(r) = self.battle.as_mut() {
                    r.drop_potions(id);
                }
            }
        }
        let merge = |f: &FightSettings| (f.auto_merge, f.merge_level(), f.merge_minutes());
        if merge(&settings) != merge(&self.fight) && (settings.auto_merge || self.fight.auto_merge)
        {
            let level = settings.merge_level_text();
            out.push(Out::Log(
                LogKind::Item,
                match settings.auto_merge {
                    true => format!(
                        "Tự gộp đá khi túi đầy: gộp đá khoá tới {level} chỉ bằng Xu khóa, mỗi lần sang Làng Thanh Khê cách nhau ít nhất {} phút",
                        settings.merge_minutes()
                    ),
                    false => "Tắt tự gộp đá khi túi đầy".into(),
                },
            ));
            self.merge_said = None;
        }
        self.pace_changed(&settings, now, out);
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
    /// that window is refused for its first 16 s ("Không thể nhặt vật phẩm của người khác"), which costs nothing. Then,
    /// with Nhặt cả đồ người khác, what others left on the ground (loot_others).
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
        if self.fight.pickup_others {
            self.loot_others(now, out);
        }
    }
    /// Nhặt cả đồ người khác: the items of the zone's ground that fell OTHERS_AGE ago or more, oldest first, at most
    /// OTHERS_PER_WIN, after the own drops. Money goes to the wallet; anything else only while the bag has a free slot
    /// for it, counting the own drops asked for (an item that would stack is not counted on: not measured).
    fn loot_others(&mut self, now: Instant, out: &mut Vec<Out>) {
        let wallet = |f: &Fallen| crate::mail::money_item(f.item.item_id).is_some();
        let free = self
            .snap
            .bag
            .as_ref()
            .map_or(0, |b| (b.capacity - b.items.len() as i32).max(0) as usize);
        // The own drops asked for: those still queued, and the one already sent.
        let own = (self.to_pick.iter().chain(&self.unanswered))
            .filter(|f| !wallet(f))
            .count();
        let mut room = free.saturating_sub(own);
        let mut ready: Vec<Fallen> = (self.ground.iter())
            .filter(|g| now.saturating_duration_since(g.at) >= OTHERS_AGE)
            .filter(|g| {
                !self.asked.contains(&g.uuid) && !self.to_pick.iter().any(|p| p.uuid == g.uuid)
            })
            .cloned()
            .collect();
        ready.sort_by_key(|g| g.at);
        let mut queued = 0;
        for g in ready {
            if queued == OTHERS_PER_WIN {
                break;
            }
            let money = wallet(&g);
            if !money && room == 0 {
                continue;
            }
            if self.pick(g, now, out) {
                queued += 1;
                room -= usize::from(!money);
            }
        }
    }
    /// Queues an item for c2s/1188, once; one goes out every PICK_GAP. True when it was queued. Gear the character cannot
    /// wear stays on the ground when Nhặt cả đồ khác giới tính is off, gear of another element with Chỉ nhặt trang bị
    /// đúng hệ, and gear of a quality not ticked in Phẩm chất trang bị nhặt, said once (another's is not looked at
    /// again).
    pub(super) fn pick(&mut self, fallen: Fallen, now: Instant, out: &mut Vec<Out>) -> bool {
        if self.asked.contains(&fallen.uuid) || self.to_pick.iter().any(|p| p.uuid == fallen.uuid) {
            return false;
        }
        let def = book().get(fallen.item.item_id);
        let gender = (!self.fight.pickup_other_gender)
            .then(|| def.and_then(|d| crate::items::misfit(d.gender, self.snap.gender)))
            .flatten();
        let element = (self.fight.pickup_own_element)
            .then(|| crate::items::off_element(fallen.element, self.snap.element))
            .flatten();
        let quality = (fallen.element != crate::items::NOT_GEAR
            && !self.fight.picks_quality(fallen.quality))
        .then(|| {
            let name = crate::items::quality_name(fallen.quality).unwrap_or("?");
            format!("trang bị {name}, phẩm chất này không được chọn nhặt")
        });
        if let Some(why) = gender.or(element).or(quality) {
            self.asked.insert(fallen.uuid.clone());
            self.ground.retain(|g| g.uuid != fallen.uuid);
            out.push(Out::Log(
                LogKind::Item,
                format!("Bỏ qua {}: {why}", fallen.item.label()),
            ));
            return false;
        }
        self.to_pick.push_back(fallen);
        if self.pick_at.is_none() {
            self.pick_next(now, out);
        }
        true
    }
    pub(super) fn pick_next(&mut self, now: Instant, out: &mut Vec<Out>) {
        // Another's item waits for the next won battle while one is played: picking up in a battle is not measured.
        if self.battle.is_some() {
            self.to_pick.retain(|f| !f.other);
        }
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
    pub(super) fn pick_answer(&mut self, text: String, now: Instant, out: &mut Vec<Out>) {
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
            // Another's item asked too early (its age guessed from the ground of a zone entered) waits OTHERS_AGE again;
            // one refused otherwise is not asked for again in this zone.
            if fallen.other {
                let early = text.contains("người khác");
                match self.ground.iter_mut().find(|g| g.uuid == fallen.uuid) {
                    Some(g) if early => g.at = now,
                    _ => self.ground.retain(|g| g.uuid != fallen.uuid),
                }
            }
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
        // Not this battle's drop: a line of its own, kept out of the drops of the mob (Thống kê).
        if fallen.other {
            return out.push(Out::Log(
                LogKind::Item,
                format!("Nhặt được đồ người khác bỏ lại: {}", item.label()),
            ));
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
    /// answer: that one may be the same repair. True while the repair waits for its answer. A repair given up leaves no
    /// item action waiting either: Pháp sư (smith_begin) would take it for one still waiting.
    pub(super) fn auto_repair(&mut self, now: Instant, out: &mut Vec<Out>) -> bool {
        if let Some((slot, name)) = self.repairing.take() {
            self.item_wait.take_if(|w| w.act == ItemAct::Repair(slot));
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

impl Bot {
    /// Bot::item for the one item the window showed, by its uuid. The bag can change while the user reads the question
    /// (Tự gộp đá, Tự nhặt đồ, a potion stack used up): when the slot holds another item by now, nothing is done, so the
    /// item that came in its place is not used or thrown away. Sắp xếp has no item.
    pub fn item_of(&mut self, act: ItemAct, uuid: &str, now: Instant, out: &mut Vec<Out>) {
        let (slot, worn) = match act {
            ItemAct::Sort => return self.item(act, now, out),
            ItemAct::Equip(s) | ItemAct::Use(s) | ItemAct::Discard(s) => (s, false),
            ItemAct::Unequip(s) | ItemAct::Repair(s) => (s, true),
        };
        let item = match worn {
            true => self.snap.gear.get(slot as usize).and_then(Option::as_ref),
            false => self
                .snap
                .bag
                .as_ref()
                .and_then(|b| b.items.iter().find(|i| i.slot == slot)),
        };
        if item.is_some_and(|i| i.uuid != uuid) {
            let place = match worn {
                true => format!("ô trang bị {slot}"),
                false => format!("ô túi {}", slot as u32 + 1),
            };
            return out.push(Out::Log(
                LogKind::Item,
                format!("Không làm: {place} giờ là món khác, không phải món đã chọn"),
            ));
        }
        self.item(act, now, out)
    }

    /// Xóa nhiều (the Túi đồ tab): throws away the bag items `items` (slot and uuid, as the window showed them), gear only
    /// (types 0–9: weapons, clothes, rings, wings, pets, titles, shoes, necklaces), one Vứt bỏ (c2s/1186 action 2) after
    /// the s2c/83 of the one before. An item that is not gear, or whose slot holds another item by now, is left alone and
    /// said in the log; a refusal of the server (s2c/1256) stops the rest.
    pub fn discard_many(&mut self, items: Vec<(u8, String)>, now: Instant, out: &mut Vec<Out>) {
        let bag = self.snap.bag.as_ref();
        let mut keep = VecDeque::new();
        for (slot, uuid) in items {
            let item = bag.and_then(|b| b.items.iter().find(|i| i.slot == slot));
            let why = match item {
                None => Some("ô trống".to_string()),
                Some(i) if i.uuid != uuid => Some("giờ là món khác, không phải món đã chọn".into()),
                Some(i) => match book().get(i.item_id) {
                    Some(d) if is_gear(d.kind) => None,
                    Some(d) => Some(format!("{} không phải trang bị", d.name)),
                    None => Some(format!("không biết món #{}", i.item_id)),
                },
            };
            match why {
                Some(why) => out.push(Out::Log(
                    LogKind::Item,
                    format!("Bỏ qua ô túi {}: {why}", slot as u32 + 1),
                )),
                None if !keep.iter().any(|(s, _)| *s == slot) => keep.push_back((slot, uuid)),
                None => {}
            }
        }
        if keep.is_empty() {
            return out.push(Out::Log(
                LogKind::Item,
                "Xóa nhiều: không có trang bị nào để vứt".into(),
            ));
        }
        out.push(Out::Log(
            LogKind::Item,
            format!("Xóa nhiều: vứt bỏ {} trang bị", keep.len()),
        ));
        self.discard_count = (keep.len(), 0);
        self.discards = keep;
        self.discard_next(now, out);
    }

    /// The next item of Xóa nhiều, after the s2c/83 of the one before; the end line once none is left.
    pub(super) fn discard_next(&mut self, now: Instant, out: &mut Vec<Out>) {
        while let Some((slot, uuid)) = self.discards.pop_front() {
            let same = self
                .snap
                .bag
                .as_ref()
                .is_some_and(|b| b.items.iter().any(|i| i.slot == slot && i.uuid == uuid));
            if !same {
                out.push(Out::Log(
                    LogKind::Item,
                    format!(
                        "Bỏ qua ô túi {}: giờ là món khác, không phải món đã chọn",
                        slot as u32 + 1
                    ),
                ));
                continue;
            }
            self.item(ItemAct::Discard(slot), now, out);
            if self
                .item_wait
                .as_ref()
                .is_some_and(|w| w.act == ItemAct::Discard(slot))
            {
                return;
            }
            // Refused before anything was sent (a battle, Pháp sư, the last action not answered): the reason is in the
            // log, the rest is left.
            return self.discard_stop("chưa vứt được món tiếp theo", out);
        }
        let (asked, thrown) = self.discard_count;
        if asked > 0 {
            out.push(Out::Log(
                LogKind::Item,
                format!("Xong xóa nhiều: đã vứt {thrown}/{asked} trang bị"),
            ));
            self.discard_count = (0, 0);
        }
    }

    /// Ends Xóa nhiều before its last item.
    pub(super) fn discard_stop(&mut self, why: &str, out: &mut Vec<Out>) {
        let (asked, thrown) = self.discard_count;
        if asked == 0 {
            return;
        }
        self.discards.clear();
        self.discard_count = (0, 0);
        out.push(Out::Log(
            LogKind::Item,
            format!("Dừng xóa nhiều: {why}; đã vứt {thrown}/{asked} trang bị"),
        ));
    }
}
