//! The world and battle packets of the server, by opcode (Bot::on_packet).
use super::*;

impl Bot {
    /// Every packet of the session goes through here, from the first one of the login on.
    pub fn on_packet(
        &mut self,
        opcode: i32,
        payload: &[u8],
        now: Instant,
        out: &mut Vec<Out>,
    ) -> crate::protocol::Result<()> {
        // The maps loaded in this session, for the index of c2s/11 (06-map-mobs.md#c2s-11).
        self.maps.on(opcode, payload);
        let done = self.packet(opcode, payload, now, out);
        // After every packet, those handled early too (an answer of Pháp sư, of a pickup, one that did not decode): the
        // trip of Tự gộp đá goes on from where the packet left it, with nothing else to wake it.
        self.merge_step(now, out);
        done
    }

    fn packet(
        &mut self,
        opcode: i32,
        payload: &[u8],
        now: Instant,
        out: &mut Vec<Out>,
    ) -> crate::protocol::Result<()> {
        // s2c/22 opens the battle data in on_setup and goes in after its header.
        if opcode != 22 {
            self.record_received(opcode, payload, now, out);
        }
        // The boss's clock hit in a battle of Bạch Hổ: its HP asked again (bachho.rs peek).
        if opcode == 21 && self.battle.is_some() && self.bach_ho_on() {
            self.bach_ho_peek(now, out);
        }
        if let Some(b) = &mut self.battle {
            let mut acts = vec![];
            if b.on_packet(opcode, payload, now, &mut acts)? {
                self.battle_heard = Some(now);
                out.extend(
                    b.take_views()
                        .into_iter()
                        .map(|v| Out::BattleEvent(Box::new(v))),
                );
                self.apply(acts, now, out);
                return Ok(());
            }
        }
        let s = &mut self.snap;
        match opcode {
            9 => {
                let c = character_prefix(payload)?;
                (s.name, s.level, s.hp, s.max_hp) = (c.name, c.level, c.hp, c.max_hp);
                (s.element, s.gender) = (Some(c.field01 as i32), Some(c.gender));
                // The tail layout comes from two captures; without it EXP and stats wait for s2c/10.
                match character_profile(payload) {
                    Ok(p) => {
                        (s.x, s.y) = (p.x, p.y);
                        (s.exp, s.level_exp, s.coin) =
                            (Some(p.exp), Some(p.level_exp), Some(p.coin));
                        (s.stats, s.combat) = (p.stats, Some(p.combat));
                        (s.stat_points, s.skill_points) =
                            (Some(p.stat_points), Some(p.skill_points));
                    }
                    Err(e) => out.push(Out::Log(
                        LogKind::Character,
                        format!("Không đọc được phần sau của s2c/9: {e}"),
                    )),
                }
                match character_gear(payload) {
                    Ok(g) => s.gear = g,
                    Err(e) => out.push(Out::Log(
                        LogKind::Item,
                        format!("Không đọc được trang bị trong s2c/9: {e}"),
                    )),
                }
                match character_skills(payload) {
                    Ok(k) => s.skill_levels = k.iter().map(|k| (k.id, k.level)).collect(),
                    Err(e) => out.push(Out::Log(
                        LogKind::Character,
                        format!("Không đọc được kỹ năng trong s2c/9: {e}"),
                    )),
                }
                // Timed effects, such as the x2 EXP of Tăng Kinh Nghiệm, with the time they have left.
                match character_tail(payload) {
                    Ok(t) => {
                        let at = epoch_ms();
                        s.boosts = t
                            .effects
                            .iter()
                            .filter(|e| e.remaining_ms > 0)
                            .map(|e| Boost {
                                key: e.key.clone(),
                                rate: e.rate,
                                until: at + e.remaining_ms as u64,
                            })
                            .collect();
                        for b in &s.boosts {
                            let left = duration_text(Duration::from_millis(b.until - at));
                            out.push(Out::Log(
                                LogKind::Character,
                                format!("Đang có {}, còn {left}", b.label()),
                            ));
                        }
                    }
                    Err(e) => out.push(Out::Log(
                        LogKind::Character,
                        format!("Không đọc được hiệu ứng trong s2c/9: {e}"),
                    )),
                }
            }
            // The tree comes at login, after the points: Tự cộng kỹ năng can only choose once it is in.
            30 => match skill_table(payload) {
                Ok(t) => {
                    s.skills = Arc::new(t.skills);
                    if self.fight.auto_skills && !self.skills_failed && self.idle() {
                        self.timer = Some((now + Duration::from_millis(250), Wake::Next));
                    }
                }
                Err(e) => out.push(Out::Log(
                    LogKind::Character,
                    format!("Không đọc được cây kỹ năng (s2c/30): {e}"),
                )),
            },
            // Answer to c2s/1191, after s2c/10 kind 32 (E1): the points left. The quest step moves on with s2c/34 or s2c/39
            // as for a stat point; without either the run stops rather than spend another point.
            1191 => {
                let mut r = Reader::new(payload);
                let (stat_points, skill_points) = (r.i32()?, r.i32()?);
                (s.stat_points, s.skill_points) = (Some(stat_points), Some(skill_points));
                if let Some(u) = self.upgrading.take() {
                    let level = s.skill_levels.get(&u.id).copied().unwrap_or(0);
                    out.push(Out::Log(
                        LogKind::Character,
                        format!(
                            "Đã nâng {} lên cấp {level}; còn {skill_points} điểm kỹ năng",
                            u.name
                        ),
                    ));
                    if u.step && self.awaiting_reply {
                        self.timer = Some((
                            now + Duration::from_secs(8),
                            Wake::Silence("Đã dùng điểm kỹ năng nhưng server chưa sang bước sau"),
                        ));
                    }
                }
                self.skill_answered(skill_points, now, out);
            }
            // The bag and the money are shown, never acted on: one that does not read is logged and left as it was.
            // Also the answer to the c2s/42 a task of Pháp sư sends after each press, and the bag after it took a worn
            // item off or put it on again (smith_bag).
            42 => {
                match character_extra(payload) {
                    Ok(x) => s.bag = Some(x.bag),
                    Err(e) => out.push(Out::Log(
                        LogKind::Item,
                        format!("Không đọc được túi đồ (s2c/42): {e}"),
                    )),
                }
                self.smith_bag(now, out);
            }
            // Pháp sư's windows (16-upgrade.md#gói): opened, an item put in, the item one level up, the result of Bắt đầu.
            96 => {
                service_window(payload)?;
                self.smith_window(now, out);
            }
            99 => {
                craft_window(payload)?;
                self.smith_window(now, out);
            }
            90 => {
                let a = service_slot(payload)?;
                self.smith_slot(&a.text, a.ready, !a.gear, None, now, out);
            }
            // Luyện đá and Chế tạo trang bị; the latter says its fee in a field (craft_slot, O1).
            92 => {
                let a = npc::craft_slot(payload)?;
                self.smith_slot(&a.text, a.ready, false, Some(a.fee as i64), now, out);
            }
            1260 => {
                let a = transmute_target(payload)?;
                self.smith_slot(&a.text, a.ready, false, None, now, out);
            }
            1258 => self.smith_preview(service_preview(payload)?.item),
            91 => {
                let r = service_result(payload)?;
                self.smith_result(r.ok, Some(r.item), r.received, r.target, now, out);
            }
            93 => {
                let r = stone_result(payload)?;
                self.smith_result(r.ok, None, r.items, None, now, out);
            }
            // An item picked up went to the bag (s2c/51, K3): that slot, without a whole new bag.
            51 => match bag_slot(payload) {
                Ok(item) => {
                    if let Some(b) = s.bag.as_mut() {
                        b.items.retain(|i| i.slot != item.slot);
                        b.items.push(item);
                        b.items.sort_by_key(|i| i.slot);
                    }
                }
                Err(e) => out.push(Out::Log(
                    LogKind::Item,
                    format!("Không đọc được ô túi vừa nhận đồ (s2c/51): {e}"),
                )),
            },
            // An item fell in the map, anyone's: kept a moment, as a won battle's own drops come just before its end, and
            // on the ground of the zone for Nhặt cả đồ người khác.
            1182 => {
                let g = ground_item_add(payload)?;
                let fallen = Fallen::of(&g.item, now, false);
                self.drops
                    .retain(|d| now.saturating_duration_since(d.at) < DROPS_KEPT);
                self.drops.push(fallen.clone());
                if g.map_id == self.snap.map_id {
                    self.ground.retain(|d| d.uuid != fallen.uuid);
                    self.ground.push(Fallen {
                        other: true,
                        ..fallen.clone()
                    });
                }
                if self.loot_until.is_some_and(|t| now < t) {
                    self.pick(fallen, now, out);
                }
            }
            // An item left the ground (picked up, or expired): it is not asked for again.
            1183 => {
                let (_, uuid) = ground_item_remove(payload)?;
                self.drops.retain(|d| d.uuid != uuid);
                self.ground.retain(|d| d.uuid != uuid);
            }
            // The ground of the zone just entered: when each item fell, from when it expires (GROUND_LIFE after).
            1184 => {
                let epoch = epoch_ms() as i64;
                self.ground = ground_items(payload)?
                    .iter()
                    .map(|g| {
                        let left =
                            Duration::from_millis(g.expires_at.saturating_sub(epoch).max(0) as u64);
                        let age = GROUND_LIFE.saturating_sub(left);
                        Fallen::of(&g.item, now.checked_sub(age).unwrap_or(now), true)
                    })
                    .collect();
            }
            // The whole bag, also after Sắp xếp: within 5 s of it, the bag sorted (it comes for rewards and repairs too).
            // Kind 4 is the one item just added (Chế tạo trang bị), kind 2 what is left in one slot (Đập Trứng Gà). A
            // kind not known yet does not read: the line keeps it in Log lỗi, and c2s/42 asks the whole bag again
            // (s2c/42, as at login and in J3), so the bag the app shows is never the one before.
            1187 => match inventory(payload) {
                Ok(b) => {
                    // A part of the bag is not the sorted bag: the wait stays for the whole bag.
                    let sorted = self.item_wait.take_if(|w| {
                        b.is_whole()
                            && w.act == ItemAct::Sort
                            && now < w.at + Duration::from_secs(5)
                    });
                    if sorted.is_some() {
                        out.push(Out::Log(
                            LogKind::Item,
                            format!("Đã sắp xếp túi đồ ({} món)", b.items.len()),
                        ));
                    }
                    s.bag = bag_after(s.bag.take(), b);
                }
                Err(e) => {
                    let kind = payload.first().copied().unwrap_or_default();
                    out.push(Out::Log(
                        LogKind::Item,
                        format!(
                            "Không đọc được túi đồ (s2c/1187 loại {kind}): {e}; hỏi lại cả túi"
                        ),
                    ));
                    let name = s.name.clone();
                    Self::send(
                        out,
                        42,
                        Ctx {
                            character_name: Some(&name),
                            ..Ctx::default()
                        },
                    );
                }
            },
            // Sử dụng went through for an item with a timed effect (Tăng Kinh Nghiệm, U2): what is left in its slot and
            // the effects the character has now. Nothing else comes, so this ends the wait of the button.
            84 => {
                let u = item_used(payload)?;
                if let (Some(b), Ok(at)) = (s.bag.as_mut(), u8::try_from(u.slot)) {
                    b.set_left(SlotLeft {
                        slot: at,
                        quantity: u.left,
                    });
                }
                let at = epoch_ms();
                for e in u.effects.iter().filter(|e| e.remaining_ms > 0) {
                    let boost = Boost {
                        key: e.key.clone(),
                        rate: e.rate,
                        until: at + e.remaining_ms as u64,
                    };
                    s.boosts.retain(|b| b.key != boost.key);
                    s.boosts.push(boost);
                }
                let boosts: Vec<String> = s
                    .boosts
                    .iter()
                    .map(|b| {
                        let left = duration_text(Duration::from_millis(b.until.saturating_sub(at)));
                        format!("{} còn {left}", b.label())
                    })
                    .collect();
                let used = self
                    .item_wait
                    .take_if(|w| matches!(w.act, ItemAct::Use(at) if at as i32 == u.slot));
                let name = used.map_or_else(|| format!("món ở ô túi {}", u.slot + 1), |w| w.name);
                let text = match boosts.is_empty() {
                    true => format!("Đã dùng {name}"),
                    false => format!("Đã dùng {name}: {}", boosts.join(", ")),
                };
                out.push(Out::Log(LogKind::Item, text));
            }
            // What is left in a bag slot (K3, P5): after Vứt bỏ (c2s/1186 action 2) and after a potion used in a battle
            // (c2s/44). 0 empties the slot.
            83 => {
                let mut r = Reader::new(payload);
                let (slot, left) = (r.i32()?, r.i32()?);
                if let (Some(b), Ok(at)) = (s.bag.as_mut(), u8::try_from(slot)) {
                    b.set_left(SlotLeft {
                        slot: at,
                        quantity: left,
                    });
                }
                let thrown = self.item_wait.take_if(|w| {
                    matches!(w.act, ItemAct::Discard(at) if at as i32 == slot)
                        && now < w.at + Duration::from_secs(5)
                });
                if let Some(w) = thrown {
                    let text = match left {
                        ..=0 => format!("Đã vứt {}", w.name),
                        _ => format!("Đã vứt {}, ô còn {left}", w.name),
                    };
                    out.push(Out::Log(LogKind::Item, text));
                    // Xóa nhiều: the next item, now that this one is answered.
                    if self.discard_count.0 > 0 {
                        self.discard_count.1 += 1;
                        self.discard_next(now, out);
                    }
                }
            }
            // The gear after Trang bị or Cởi ra; s2c/42 brings the bag, s2c/1186 the action.
            // A task of Pháp sư on a worn item reads it too (smith_worn).
            37 => {
                match gear_update(payload) {
                    Ok(g) => s.gear = g.gear,
                    Err(e) => out.push(Out::Log(
                        LogKind::Item,
                        format!("Không đọc được trang bị (s2c/37): {e}"),
                    )),
                }
                self.smith_worn(now, out);
            }
            1186 | 48 => {
                let done = match (opcode, self.item_wait.as_ref().map(|w| w.act)) {
                    (1186, Some(ItemAct::Equip(_))) => Some("Đã mặc"),
                    (1186, Some(ItemAct::Unequip(_))) => Some("Đã cởi"),
                    (48, Some(ItemAct::Repair(_))) => Some("Đã sửa"),
                    _ => None,
                };
                if let (Some(done), Some(w)) = (done, self.item_wait.take()) {
                    out.push(Out::Log(LogKind::Item, format!("{done} {}", w.name)));
                    // The server sends no gear after a repair; it brings the item to its full durability (P4: 0/60 →
                    // 60/60), so the gear shown is not left broken until the next login.
                    if let ItemAct::Repair(slot) = w.act {
                        if let Some(Some(i)) = s.gear.get_mut(slot as usize) {
                            if let Some(d) = book().get(i.item_id) {
                                i.durability = i.durability.max(d.durability);
                            }
                        }
                    }
                }
                // The repair of Tự sửa đồ: the run goes on.
                if opcode == 48 && self.repairing.take().is_some() {
                    self.timer = Some((now + Duration::from_millis(500), Wake::Next));
                }
                if opcode == 1186 {
                    self.smith_worn(now, out);
                }
            }
            46 => match currencies(payload) {
                Ok(c) => s.currencies = Some(c),
                Err(e) => out.push(Out::Log(
                    LogKind::Item,
                    format!("Không đọc được tiền (s2c/46): {e}"),
                )),
            },
            29 => s.map_id = character_location(payload)?.map_id,
            11 if payload.first() == Some(&1) => {
                let m = map_prefix(payload)?;
                (s.map_id, s.map_name, s.zone, s.x, s.y) =
                    (m.map_id, m.name, m.area as i32, m.x, m.y);
                s.zones = None;
                s.bosses.clear();
                self.zone.clear();
                self.ground.clear();
                // Đi lại như người chơi (wander.rs): the grid kept, the fall to the ground queued.
                self.wander_map_loaded(crate::world::map_grid(payload).ok(), now);
                // NPCs and portals. A map this decoder cannot read leaves them unknown, not an empty map in the atlas;
                // the quest run, which talks to NPCs and takes portals, stops there. A fight job needs only the mobs.
                match map_data(payload) {
                    Ok(d) => {
                        self.snap.places = d.places;
                        self.atlas.record_map(
                            &self.snap.map_id,
                            &self.snap.map_name,
                            &self.snap.places,
                        );
                    }
                    Err(e) => {
                        self.snap.places.clear();
                        out.push(Out::Log(
                            LogKind::Travel,
                            format!(
                                "Không đọc được NPC và cổng của {} (s2c/11): {e}",
                                self.snap.map_name
                            ),
                        ));
                        if self.quest_running() {
                            self.finish_quest("Không đọc được NPC và cổng của map này", out);
                        }
                    }
                }
                // Through a portal or into a zone the client asks for the mobs of the new map next (B5), ENTITIES_AFTER_MAP
                // later with the human pace; after Đầu hàng without it, or a jump of Bản đồ thế giới, for those of the map
                // asked with c2s/11 at once (06-map-mobs). That map answers our c2s/11: it does not end the battle. The
                // reload after a battle has its own c2s/43 (reload.rs).
                let reload = std::mem::take(&mut self.reload_map);
                if self.travelling.is_some() || self.zoning.is_some() || reload {
                    let map_id = self.snap.map_id.clone();
                    let gap = match reload {
                        true => Duration::ZERO,
                        false => self.human.pick(crate::human::ENTITIES_AFTER_MAP),
                    };
                    let ctx = Ctx {
                        map_id: Some(&map_id),
                        ..Ctx::default()
                    };
                    self.send_after(gap, 43, ctx, reload::Then::Nothing, now, out);
                } else {
                    self.reload_map_came(now, out);
                }
            }
            // Bản đồ thế giới (flag 0, "M99"): the jump of Bạch Hổ or Quay về chỗ cũ (bachho.rs).
            11 if payload.first() == Some(&0) => self.warp_opened(now, out),
            1275 => self.bach_ho_result_read(payload, now, out),
            // The line the server sends every player (bosses, Bạch Hổ): read for Bạch Hổ only.
            45 => {
                let text = crate::protocol::Reader::new(payload).string()?;
                self.bach_ho_notice(&text, now, out);
            }
            13 => {
                let c = map_change(payload)?;
                if c.map_id != s.map_id {
                    s.shop = None;
                }
                s.map_id = c.map_id.clone();
                if let Some(z) = c.zone {
                    s.zone = z;
                }
                if self.warp_landed(&c.map_id, now, out) {
                    return Ok(());
                }
                if let (None, Some(z)) = (&self.travelling, self.zoning) {
                    // The answer to c2s/1173: ask the map of that zone as the app does (B2, Z1), with the map's index
                    // ("M11" 01 0000000a, game 1.1.1).
                    let zone = c.zone.unwrap_or(z);
                    let ctx = Ctx {
                        map_id: Some(&c.map_id),
                        zone: Some(zone),
                        map_index: Some(self.maps.map_index(&c.map_id)),
                        ..Ctx::default()
                    };
                    let gap = self.human.pick(crate::human::MAP_AFTER_PORTAL);
                    self.send_after(gap, 11, ctx, reload::Then::Nothing, now, out);
                }
                if let Some((id, name)) = self.travelling.clone() {
                    self.timer = None;
                    out.push(Out::Log(
                        LogKind::Travel,
                        format!("Qua cổng {name}: sang {}", c.map_id),
                    ));
                    self.atlas.record_portal(
                        id,
                        Portal {
                            name,
                            map_id: Some(c.map_id.clone()),
                            ..Portal::default()
                        },
                    );
                    // (0xff, its index once loaded in this session, else -1).
                    let ctx = Ctx {
                        map_id: Some(&c.map_id),
                        map_index: Some(self.maps.map_index(&c.map_id)),
                        ..Ctx::default()
                    };
                    let gap = self.human.pick(crate::human::MAP_AFTER_PORTAL);
                    self.send_after(gap, 11, ctx, reload::Then::Nothing, now, out);
                }
            }
            43 => {
                let d = map_entities(payload)?;
                self.atlas.record_mobs(&d.map_id, self.snap.zone, &d.mobs);
                self.mobs = d.mobs;
                // The walk to a mob before its challenge (game 1.1.1: c2s/1169, then c2s/15 4–26 s after c2s/43).
                if self.human.on() && !self.bach_ho_on() {
                    let walk = self.human.pick(crate::human::CHALLENGE_AFTER_ENTITIES);
                    self.walk_until = Some(now + walk);
                }
                self.wander_step(now);
                self.bach_ho_mobs(&d.map_id, now, out);
                if let Some((_, via)) = self.travelling.take() {
                    out.push(Out::Log(
                        LogKind::Travel,
                        format!("Đã tới {} qua cổng {via}", self.snap.map_name),
                    ));
                    self.move_until = None;
                    let gap = self.arrival_gap();
                    self.timer = Some((now + gap, Wake::Next));
                }
                self.warp_arrived(now, out);
                if let Some(z) = self.zoning.take() {
                    (self.move_until, self.snap.moving) = (None, None);
                    out.push(Out::Log(
                        LogKind::Travel,
                        format!(
                            "Đã sang khu {z} của {}: {} con quái",
                            self.snap.map_name,
                            self.mobs.len()
                        ),
                    ));
                    // A quest step that changed zone for its mob (quest_zone) looks again once the zone's pushes
                    // (a boss's s2c/1177) are in.
                    if self.quest_running() {
                        self.timer = Some((now + Duration::from_secs(2), Wake::Next));
                    }
                }
            }
            1263 => {
                // Until a snapshot reads, the players of the zone are unknown rather than none.
                let read = self.zone.on(opcode, payload);
                self.snap.players_unread = read.is_err();
                read?;
            }
            1167 | 1170 | 1253 => {
                self.zone.on(opcode, payload)?;
            }
            1177 => {
                let b = map_boss(payload)?;
                if let Some(gone) = b.gone {
                    self.mobs.retain(|m| m.id != gone);
                    self.snap
                        .bosses
                        .iter_mut()
                        .filter(|t| t.id == gone)
                        .for_each(|t| t.moving = true);
                } else if let Some(mob) = b.mob {
                    let [col, row] = b.tile.unwrap_or_default();
                    self.atlas
                        .record_boss(&b.map_id, self.snap.zone, &mob, [col, row]);
                    let at = BossTile {
                        id: mob.id.clone(),
                        name: mob.name.clone(),
                        level: mob.level,
                        col,
                        row,
                        moving: false,
                    };
                    match self.snap.bosses.iter_mut().find(|t| t.id == mob.id) {
                        Some(t) => *t = at,
                        None => self.snap.bosses.push(at),
                    }
                    self.bosses.insert(mob.id.clone());
                    if !self
                        .seen_bosses
                        .iter()
                        .any(|s| s.0 == b.map_id && s.1 == mob.name)
                    {
                        self.seen_bosses.push((
                            b.map_id.clone(),
                            mob.name.clone(),
                            mob.level,
                            mob.element(),
                        ));
                    }
                    if !self.mobs.iter().any(|m| m.id == mob.id) {
                        self.mobs.push(mob);
                    }
                }
            }
            10 => {
                let st = character_stats(payload)?;
                let mut leveled = false;
                if let Some(l) = st.level {
                    if l != s.level && s.level != 0 {
                        out.push(Out::Log(LogKind::Character, format!("Lên cấp {l}")));
                        leveled = l > s.level;
                    }
                    s.level = l;
                }
                if let (Some(hp), Some(max)) = (st.hp, st.max_hp) {
                    (s.hp, s.max_hp) = (hp, max);
                }
                if st.exp.is_some() {
                    (s.exp, s.level_exp, s.coin) = (st.exp, st.level_exp, st.coin);
                }
                if let Some(extra) = st.extra.filter(|e| e.len() == 6) {
                    s.combat = extra[1..].try_into().ok();
                }
                if let Some(stats) = st.stats {
                    s.stats = stats;
                }
                if let Some(skills) = &st.skills {
                    s.skill_levels
                        .extend(skills.iter().map(|k| (k.id, k.level)));
                }
                if st.stat_points.is_some() {
                    s.stat_points = st.stat_points;
                    s.skill_points = st.fields.as_ref().and_then(|f| f.first().copied());
                    self.points_changed(now, out);
                }
                // Quà thăng cấp: a level that reaches a milestone (welfare_level).
                if leveled {
                    self.welfare_level(now);
                }
            }
            1172 => self.snap.zones = Some(zone_list(payload)?.zones),
            // The menus of a shop's NPC after c2s/13 (open_shop_kind): the next line of its path, until the last one opens the
            // shop. A talk step's c2s/13 may get a dialog instead of s2c/34, as "Tỷ thí" does (npc_dialog).
            57 => {
                let menu = npc_menu(payload)?;
                if let Some((Shopping::Talk { npc, left } | Shopping::Menu { npc, left }, _)) =
                    &self.shopping
                {
                    let (npc_id, mut left) = (*npc, left.clone());
                    match left.first().copied() {
                        Some(option) if menu.options.iter().any(|o| o.0 == option) => {
                            left.remove(0);
                            let gap = self.reply57(option, SELLER.0, npc_id, now, out);
                            self.shopping =
                                Some((Shopping::Menu { npc: npc_id, left }, now + gap + SHOP_WAIT));
                        }
                        // The last line went out: this menu is not the shop's (another NPC answered); nothing more is sent.
                        None => {}
                        Some(option) => {
                            self.shopping = None;
                            out.push(Out::Log(
                                LogKind::Item,
                                format!("{} không có dòng {option} trong menu", menu.npc),
                            ));
                        }
                    }
                } else if self.smith_menu(&menu, now, out) {
                } else if self.awaiting_reply && self.quest_running() {
                    self.npc_dialog(menu, now, out);
                }
            }
            // The mob of a duel, after Đồng ý in its dialog (npc_dialog).
            1180 => {
                let invite = duel_invite(payload)?;
                if self.awaiting_reply && self.quest_running() {
                    self.duel(invite, now, out);
                }
            }
            1190 => {
                let shop = shop_list(payload)?;
                if matches!(self.shopping, Some((Shopping::Menu { .. }, _))) {
                    let who = self.shop_npc();
                    self.shopping = None;
                    let name = npc::shop_of(shop.kind).map_or(shop.title.as_str(), |s| s.name);
                    let line = match shop.kind {
                        SELLER_KIND => format!("Cửa hàng {who}: {} món", shop.items.len()),
                        _ => format!("Cửa hàng {who} ({name}): {} món", shop.items.len()),
                    };
                    out.push(Out::Log(LogKind::Item, line));
                }
                self.snap.shop = Some(shop);
            }
            1256 => {
                let text = notice(payload)?;
                // A refused gift code comes twice: s2c/1223, then this with the same words (gift_answer logged it).
                if self.gift_echo(&text, now) {
                    return Ok(());
                }
                // Phúc lợi's notices ("Đã nhận 4 phần thưởng", "Không có phần thưởng nào để nhận", the echo of a refused
                // Điểm danh), before a pickup or a portal could take them for theirs (bot/welfare.rs).
                if self.welfare_notice(&text, now, out) {
                    return Ok(());
                }
                // The answer to c2s/1188 ("Bạn vừa nhận được 137 Xu khóa", "Không thể nhặt vật phẩm của người khác"),
                // also when it comes during a portal trip: it is not that portal's refusal (13-drops-items.md#g2). While
                // something else waits for its own s2c/1256 (a portal, a purchase, an item action such as Tự sửa đồ, a
                // zone), only a line about the pickup is taken for its answer.
                let picking = self.picked_at.is_some_and(|t| now < t + PICK_ANSWER);
                let about = text.contains("nhặt") || text.contains("nhận được");
                if picking && (about || !self.owns_next_notice(now)) {
                    self.pick_answer(text, now, out);
                    return Ok(());
                }
                out.push(Out::Log(LogKind::Server, text.clone()));
                // What an egg of Đập hết gave, its success or its refusal (egg_notice).
                if self.egg_notice(&text, now, out) {
                    return Ok(());
                }
                // The notice of Nhận ("Rương đã đầy…") or Nhận hết ("Đã nhận quà của 2 thư"), for its result line.
                self.mail_notice(&text);
                // A refusal of Mua, Đăng bán, Thu hồi or Gia hạn: their answers come before any notice.
                self.market_notice(&text, out);
                // The answer of Pháp sư or Hương Lão to a task (smith_notice).
                if self.smith_notice(&text, now, out) {
                    return Ok(());
                }
                // The purchase ("Bạn vừa mua thành công! 1 Búa Sửa Chữa", "Không đủ Xu để thực hiện"), or c2s/13 to Lái
                // Buôn refused ("Không thể thực hiện" from another map, B1).
                match self.shopping.take().map(|s| s.0) {
                    Some(Shopping::Buy {
                        name,
                        quantity,
                        cost,
                    }) => {
                        let line = match text.contains("thành công") {
                            true => format!("Đã mua {quantity} {name} ({cost})"),
                            false => format!("Chưa mua được {name}: {text}"),
                        };
                        out.push(Out::Log(LogKind::Item, line));
                    }
                    Some(Shopping::Talk { npc, .. } | Shopping::Menu { npc, .. }) => {
                        out.push(Out::Log(
                            LogKind::Item,
                            format!("Không mở được cửa hàng {}: {text}", npc::npc_name(npc)),
                        ))
                    }
                    None => {}
                }
                // The answer to Sử dụng ("Vật phẩm không thể sử dụng!") or a refusal of another item action; it ends
                // Xóa nhiều too.
                if self
                    .item_wait
                    .take()
                    .is_some_and(|w| matches!(w.act, ItemAct::Discard(_)))
                {
                    self.discard_stop(&format!("server từ chối ({text})"), out);
                }
                if let Some((slot, name)) = self.repairing.take() {
                    self.repair_failed.insert(slot);
                    out.push(Out::Log(
                        LogKind::Item,
                        format!("Không sửa được {name}: {text}; đánh tiếp với món hỏng"),
                    ));
                    self.timer = Some((now + Duration::from_secs(1), Wake::Next));
                }
                // A portal the character may not enter: "Bạn phải đạt cấp 40 mới vào được Lạc Cốc" (Q15) or "Bạn cần hoàn
                // thành nhiệm vụ trước khi tới đây" (S1); travel() then leaves it out.
                if let Some((id, name)) = self.travelling.take() {
                    self.atlas.record_refusal(id, &name, &text);
                    self.refused.insert(id);
                    self.move_until = None;
                    self.timer = Some((now + Duration::from_secs(1), Wake::Next));
                }
                if let Some(z) = self.zoning.take() {
                    (self.move_until, self.snap.moving) = (None, None);
                    out.push(Out::Log(LogKind::Travel, format!("Chưa sang khu {z}")));
                    if self.quest_running() {
                        self.timer = Some((now + Duration::from_secs(1), Wake::Next));
                    }
                }
            }
            39 => {
                let q = quest_data(payload)?;
                let before = self.snap.quest.as_ref().map(|q| (q.id, q.current));
                let step = q
                    .steps
                    .get(q.current.max(0) as usize)
                    .map_or("", |s| &s.text);
                out.push(Out::Log(
                    LogKind::Quest,
                    format!(
                        "Nhiệm vụ {}: {}; bước {}/{}: {step}",
                        q.id,
                        q.title,
                        q.current as i64 + 1,
                        q.steps.len()
                    ),
                ));
                let changed = before != Some((q.id, q.current));
                self.snap.quest = Some(q);
                (self.awaiting_reply, self.duels) = (false, 0);
                // A new quest or step from the server gets its own 6 portals and zones to try, as one advanced by the bot
                // (advance): the portals of a quest just reported were counted against the next one (tiheo1, 22/11:
                // 4 portals to report quest 42, then 2 left for quest 43, short of Tam Khê by one).
                if changed {
                    (self.hops, self.waits) = (0, 0);
                    (self.zone_tries, self.zone_list_asked) = (vec![], false);
                }
                if self.quest_running() && self.battle.is_none() && changed {
                    self.timer = Some((now + Duration::from_millis(1500), Wake::Next));
                }
            }
            34 => {
                let p = quest_progress(payload)?;
                if !p.text.is_empty() {
                    out.push(Out::Log(
                        LogKind::Quest,
                        format!("NPC: {}", p.text.chars().take(160).collect::<String>()),
                    ));
                }
                // A talk step is answered by s2c/34 alone (no new s2c/39), so the step is advanced here (L1 capture).
                if self.awaiting_reply
                    && self.snap.quest.as_ref().is_some_and(|q| q.id == p.quest_id)
                {
                    self.awaiting_reply = false;
                    self.advance("Server đã trả lời", out);
                } else if let Some(q) = self.snap.quest.as_mut().filter(|q| q.id == p.quest_id) {
                    // A kill or damage step can be done by s2c/34 alone, with no s2c/1201: "Đánh bại Tướng Thiết Kích" of
                    // quest 28 as the boss falls (B8). Its count is set to reached, so quest_next moves it on once,
                    // whether s2c/1201 came or not.
                    let reached = q.steps.get(q.current.max(0) as usize).and_then(|step| {
                        match step_action(&step.text, step.npc_id, step.param) {
                            StepAction::Kill { .. } => Some(step.required),
                            StepAction::Damage { amount, .. } => Some(amount),
                            _ => None,
                        }
                    });
                    if let Some(n) = reached {
                        q.progress = q.progress.max(n);
                    }
                }
                if self.quest_running() && self.battle.is_none() {
                    self.timer = Some((now + Duration::from_millis(1500), Wake::Next));
                }
            }
            // The server's count for the current step, right after each battle that counts (kills, or boss damage).
            1201 => {
                let progress = Reader::new(payload).i32()?;
                if let Some(q) = &mut self.snap.quest {
                    q.progress = progress;
                }
            }
            35 => {
                let c = quest_complete(payload)?;
                out.push(Out::Log(
                    LogKind::Quest,
                    format!("Xong nhiệm vụ {}: {}", c.title, c.rewards.join(", ")),
                ));
                if let Some(r) = self.snap.quest_run.as_mut().filter(|r| r.done.is_none()) {
                    r.completed += 1;
                }
            }
            // s2c/0: i8 flag; string text. s2c/5: u8 kind; i32 × 4; string text (empty in the boot notice).
            0 | 5 => {
                let mut r = Reader::new(payload);
                let text = r
                    .take(if opcode == 0 { 1 } else { 17 })
                    .and_then(|_| r.string())
                    .unwrap_or_default();
                if !text.is_empty() {
                    out.push(Out::Log(LogKind::Server, format!("Server: {text}")));
                    // Chế tạo cánh says what it lacks this way (J2): it ends a task of Pháp sư waiting for the answer to
                    // an item put in or to Bắt đầu. Another message box of the server leaves the task alone.
                    let stage = self.smith.as_ref().map(|s| s.stage);
                    let answers = matches!(
                        stage,
                        Some(smith::Stage::Put | smith::Stage::Start | smith::Stage::IceDone)
                    );
                    if opcode == 0 && stage == Some(smith::Stage::Rules) {
                        // Cách tính điểm of Điểm năng động.
                        self.smith_rules(&text, now, out);
                    } else if opcode == 0 && answers {
                        self.smith_notice(&text, now, out);
                    }
                }
            }
            // Gear durability, after every battle; inside a battle it means the server ended it.
            36 => {
                if self.left(36, now, out) {
                } else if self.battle.take().is_some() {
                    out.push(Out::Log(LogKind::Battle, "Server đã huỷ trận".into()));
                    Self::battle_end(EndKind::Cancelled, None, None, out);
                    self.record_end(serde_json::json!({ "cancelled": true }), now);
                    self.timer = Some((now + Duration::from_secs(2), Wake::Next));
                }
                match gear_durability(payload) {
                    Ok(slots) => self.wear(&slots, out),
                    Err(e) => out.push(Out::Log(
                        LogKind::Item,
                        format!("Không đọc được độ bền trang bị (s2c/36): {e}"),
                    )),
                }
            }
            // Empty, at the end of a battle and after c2s/40 (05-battle).
            1214 => {
                self.left(1214, now, out);
            }
            22 => self.on_setup(payload, now, out)?,
            // Mã quà tặng (gift.rs): the answer to c2s/1223, and the mail a good code brings.
            1223 => {
                let a = crate::mail::gift_code_result(payload)?;
                self.gift_answer(a, now, out);
            }
            1222 => {
                let m = crate::mail::new_mail(payload)?;
                self.mail_arrived(&m);
                self.gift_mail(m, now, out);
            }
            // Hòm thư (mailbox.rs): the list, a mail opened, Nhận, Xóa, and whether a mail is not read yet.
            1215 => {
                let mails = crate::mail::mail_list(payload)?;
                self.mail_listed(mails, out);
            }
            1216 => {
                let body = crate::mail::mail_body(payload)?;
                self.mail_opened(body, now, out);
            }
            1217 => {
                let a = crate::mail::mail_ack(payload, 1217)?;
                self.mail_claimed(a, out);
            }
            1219 => {
                let a = crate::mail::mail_ack(payload, 1219)?;
                self.mail_deleted(a, now, out);
            }
            1220 => self.snap.mailbox.unread = payload.first().map(|&b| b == 1),
            // Gửi thư (mailbox.rs, ML1): the answer to c2s/1280, and the mails sent.
            1280 => {
                let a = crate::mail::send_result(payload)?;
                self.mail_send_answered(a, out);
            }
            1281 => {
                let mails = crate::mail::sent_list(payload)?;
                self.mail_sent_listed(mails, out);
            }
            // Phúc lợi (bot/welfare.rs): an event's definition and progress, the answer to Điểm danh, the red dots.
            1236 => {
                let d = crate::welfare::event_definition(payload)?;
                self.welfare_definition(d, now, out);
            }
            1239 => {
                let p = crate::welfare::event_progress(payload)?;
                self.welfare_progress(p, now, out);
            }
            1232 => {
                let r = crate::welfare::checkin_result(payload)?;
                self.welfare_checkin(r, now, out);
            }
            1279 => self.welfare_dots(crate::welfare::welfare_dots(payload)?),
            // Nhiệm vụ hàng ngày (daily.rs): the quest held, done, or its progress; the answer to Nhận, Hủy, Hoàn thành.
            1195 => {
                let d = crate::mail::daily_quest(payload)?;
                self.daily_update(d, now, out);
            }
            // Chợ trời (bot/market.rs): the tabs, a page (also the answer to Gia hạn), Mua, Đăng bán, Thu hồi.
            116 => {
                let tabs = crate::market::market_tabs(payload)?;
                self.market_tabs(tabs, now, out);
            }
            1192 => {
                let page = crate::market::market(payload)?;
                self.market_page(page, now, out);
            }
            115 => {
                let d = crate::market::market_done(payload, 115)?;
                self.market_bought(d, out);
            }
            112 => {
                let l = crate::market::market_listed(payload)?;
                self.market_listed(l, now, out);
            }
            113 => {
                let d = crate::market::market_done(payload, 113)?;
                self.market_withdrawn(d, out);
            }
            _ => {}
        }
        self.walk_back(now, out);
        Ok(())
    }
}
