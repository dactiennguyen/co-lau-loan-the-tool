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
        if let Some(b) = &mut self.battle {
            let mut acts = vec![];
            if b.on_packet(opcode, payload, now, &mut acts)? {
                self.apply(acts, now, out);
                return Ok(());
            }
        }
        let s = &mut self.snap;
        match opcode {
            9 => {
                let c = character_prefix(payload)?;
                (s.name, s.level, s.hp, s.max_hp) = (c.name, c.level, c.hp, c.max_hp);
                s.element = Some(c.field01 as i32);
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
            }
            30 => match skill_table(payload) {
                Ok(t) => s.skills = Arc::new(t.skills),
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
            }
            // The bag and the money are shown, never acted on: one that does not read is logged and left as it was.
            42 => match character_extra(payload) {
                Ok(x) => s.bag = Some(x.bag),
                Err(e) => out.push(Out::Log(
                    LogKind::Item,
                    format!("Không đọc được túi đồ (s2c/42): {e}"),
                )),
            },
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
            // An item fell in the map, anyone's: kept a moment, as a won battle's own drops come just before its end.
            1182 => {
                let g = ground_item_add(payload)?;
                let def = book().get(g.item.item_id);
                let name = def.map_or_else(|| format!("#{}", g.item.item_id), |d| d.name.clone());
                let name = match g.item.quantity {
                    q if q > 1 => format!("{name} ×{q}"),
                    _ => name,
                };
                self.drops
                    .retain(|d| now.saturating_duration_since(d.2) < DROPS_KEPT);
                self.drops.push((g.item.uuid.clone(), name.clone(), now));
                if self.loot_until.is_some_and(|t| now < t) {
                    self.pick(g.item.uuid, name, now, out);
                }
            }
            // An item left the ground (picked up, or expired): it is not asked for again.
            1183 => {
                let (_, uuid) = ground_item_remove(payload)?;
                self.drops.retain(|d| d.0 != uuid);
            }
            1187 => match inventory(payload) {
                Ok(b) => s.bag = Some(b),
                Err(e) => out.push(Out::Log(
                    LogKind::Item,
                    format!("Không đọc được túi đồ (s2c/1187): {e}"),
                )),
            },
            // The gear after Trang bị or Cởi ra; s2c/42 brings the bag, s2c/1186 the action.
            37 => match gear_update(payload) {
                Ok(g) => s.gear = g.gear,
                Err(e) => out.push(Out::Log(
                    LogKind::Item,
                    format!("Không đọc được trang bị (s2c/37): {e}"),
                )),
            },
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
                // Through a portal the client asks for the mobs of the new map next (B5), and after Đầu hàng for those of
                // the map it asked with c2s/40 (06-map-mobs). That map answers our c2s/11: it does not end the battle.
                let reload = std::mem::take(&mut self.reload_map);
                if self.travelling.is_some() || self.zoning.is_some() || reload {
                    let map_id = self.snap.map_id.clone();
                    Self::send(
                        out,
                        43,
                        Ctx {
                            map_id: Some(&map_id),
                            ..Ctx::default()
                        },
                    );
                }
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
                if let (None, Some(z)) = (&self.travelling, self.zoning) {
                    // The answer to c2s/1173: ask the map of that zone as the app does (B2, Z1).
                    let zone = c.zone.unwrap_or(z);
                    Self::send(
                        out,
                        11,
                        Ctx {
                            map_id: Some(&c.map_id),
                            zone: Some(zone),
                            ..Ctx::default()
                        },
                    );
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
                    Self::send(
                        out,
                        11,
                        Ctx {
                            map_id: Some(&c.map_id),
                            ..Ctx::default()
                        },
                    );
                }
            }
            43 => {
                let d = map_entities(payload)?;
                self.atlas.record_mobs(&d.map_id, self.snap.zone, &d.mobs);
                self.mobs = d.mobs;
                if let Some((_, via)) = self.travelling.take() {
                    out.push(Out::Log(
                        LogKind::Travel,
                        format!("Đã tới {} qua cổng {via}", self.snap.map_name),
                    ));
                    self.move_until = None;
                    self.timer = Some((now + Duration::from_secs(2), Wake::Next));
                }
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
                        self.seen_bosses
                            .push((b.map_id.clone(), mob.name.clone(), mob.level));
                    }
                    if !self.mobs.iter().any(|m| m.id == mob.id) {
                        self.mobs.push(mob);
                    }
                }
            }
            10 => {
                let st = character_stats(payload)?;
                if let Some(l) = st.level {
                    if l != s.level && s.level != 0 {
                        out.push(Out::Log(LogKind::Character, format!("Lên cấp {l}")));
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
                    self.points_changed(now);
                }
            }
            1172 => self.snap.zones = Some(zone_list(payload)?.zones),
            // Lái Buôn's menu after c2s/13 (open_shop): Dược phẩm opens the shop.
            57 => {
                let menu = npc_menu(payload)?;
                if matches!(self.shopping, Some((Shopping::Talk, _))) {
                    match menu.options.iter().find(|o| o.1 == SELLER_MENU) {
                        Some(&(option, _)) => {
                            Self::send(
                                out,
                                57,
                                Ctx {
                                    option: Some(option as i32),
                                    map_id: Some(SELLER.0),
                                    npc_id: Some(SELLER.1),
                                    ..Ctx::default()
                                },
                            );
                            self.shopping = Some((Shopping::Menu, now + SHOP_WAIT));
                        }
                        None => {
                            self.shopping = None;
                            out.push(Out::Log(
                                LogKind::Item,
                                format!("{} không có dòng {SELLER_MENU}", menu.npc),
                            ));
                        }
                    }
                }
            }
            1190 => {
                let shop = shop_list(payload)?;
                if matches!(self.shopping, Some((Shopping::Menu, _))) {
                    self.shopping = None;
                    out.push(Out::Log(
                        LogKind::Item,
                        format!("Cửa hàng Lái Buôn: {} món", shop.items.len()),
                    ));
                }
                self.snap.shop = Some(shop);
            }
            1256 => {
                let text = notice(payload)?;
                // The answer to c2s/1188 ("Bạn vừa nhận được 137 Xu khóa", "Không thể nhặt vật phẩm của người khác"),
                // also when it comes during a portal trip: it is not that portal's refusal (13-drops-items.md#g2). While
                // something else waits for its own s2c/1256 (a portal, a purchase, an item action such as Tự sửa đồ, a
                // zone), only a line about the pickup is taken for its answer.
                let picking = self.picked_at.is_some_and(|t| now < t + PICK_ANSWER);
                let about = text.contains("nhặt") || text.contains("nhận được");
                let waiting = self.travelling.is_some()
                    || self.shopping.is_some()
                    || self.item_wait.is_some()
                    || self.zoning.is_some();
                if picking && (about || !waiting) {
                    out.push(Out::Log(
                        LogKind::Item,
                        match text.contains("nhận được") {
                            true => text,
                            false => format!("Không nhặt được: {text}"),
                        },
                    ));
                    return Ok(());
                }
                out.push(Out::Log(LogKind::Server, text.clone()));
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
                    Some(_) => out.push(Out::Log(
                        LogKind::Item,
                        format!("Không mở được cửa hàng Lái Buôn: {text}"),
                    )),
                    None => {}
                }
                // The answer to Sử dụng ("Vật phẩm không thể sử dụng!") or a refusal of another item action.
                self.item_wait = None;
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
                        q.current + 1,
                        q.steps.len()
                    ),
                ));
                let changed = before != Some((q.id, q.current));
                self.snap.quest = Some(q);
                self.awaiting_reply = false;
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
                }
            }
            // Gear durability, after every battle; inside a battle it means the server ended it.
            36 => {
                if self.left(36, now, out) {
                } else if self.battle.take().is_some() {
                    out.push(Out::Log(LogKind::Battle, "Server đã huỷ trận".into()));
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
            _ => {}
        }
        Ok(())
    }
}
