//! Di chuyển: Khu vực and Đổi map of the Vị trí card.
use super::*;

/// Khu vực and Đổi map of the Vị trí card: c2s/1172 and c2s/1173 for the zones of the map
/// (06-map-mobs.md#đổi-khu-vực-trong-cùng-map), c2s/13 through the portals of the atlas for another map (10-quests.md#cổng).
impl Bot {
    /// A zone change or a trip under way.
    pub(super) fn moving(&self) -> bool {
        self.zoning.is_some() || self.trip.is_some()
    }

    /// The maps of the atlas, nearest first, then those no known way leads to.
    pub(super) fn maps(&self) -> Vec<MapChoice> {
        let hops = self
            .atlas
            .hops(&self.snap.map_id, self.snap.level, &self.refused);
        let mut out: Vec<MapChoice> = self
            .atlas
            .maps
            .iter()
            .map(|(id, m)| MapChoice {
                map_id: id.clone(),
                name: m.name.clone(),
                level: self
                    .atlas
                    .world
                    .iter()
                    .find(|w| &w.map_id == id)
                    .map(|w| w.level),
                hops: hops.get(id).copied(),
                need: self.atlas.needs_level(id, self.snap.level),
                mobs: (m.mobs.iter().map(|k| (&k.name, k.level, false)))
                    .chain(m.bosses.iter().map(|b| (&b.name, b.level, true)))
                    .map(|(name, level, boss)| MapMob {
                        name: name.clone(),
                        level,
                        boss,
                    })
                    .collect(),
            })
            .collect();
        out.sort_by_key(|m| m.hops.unwrap_or(u32::MAX));
        out
    }

    /// Asks the zones of the map and their players (c2s/1172); s2c/1172 fills `zones`.
    pub fn list_zones(&mut self, out: &mut Vec<Out>) {
        Self::send(out, 1172, Ctx::default());
    }

    /// Moves to another zone of the map as the Khu vực panel does: c2s/1173, s2c/13 with the zone, c2s/11 of that zone,
    /// s2c/11, c2s/43, s2c/43 (Z1). Refused, with the reason in the log and nothing sent, while busy, for the zone the
    /// character is in, and for a zone the last list does not have or shows full. The server puts the character back in
    /// zone 0 at the next login.
    pub fn change_zone(&mut self, zone: i32, now: Instant, out: &mut Vec<Out>) {
        self.zone_to(zone, false, now, out);
    }
    /// change_zone, a fight job left aside with `job` (busy_but). Returns whether c2s/1173 went.
    pub(super) fn zone_to(
        &mut self,
        zone: i32,
        job: bool,
        now: Instant,
        out: &mut Vec<Out>,
    ) -> bool {
        let listed = self.snap.zones.as_ref();
        let found = listed.and_then(|l| l.iter().find(|z| z.zone == zone));
        let why = self.busy_but(job).map(String::from).or_else(|| {
            if zone == self.snap.zone {
                Some(format!("đang ở khu {zone}"))
            } else if !(0..=255).contains(&zone) || (listed.is_some() && found.is_none()) {
                Some(format!("không có khu {zone}"))
            } else {
                found
                    .filter(|z| z.players >= z.capacity)
                    .map(|z| format!("khu đã đầy ({}/{})", z.players, z.capacity))
            }
        });
        if let Some(why) = why {
            out.push(Out::Log(
                LogKind::Travel,
                format!("Chưa sang khu {zone}: {why}"),
            ));
            return false;
        }
        out.push(Out::Log(LogKind::Travel, format!("Sang khu {zone}")));
        Self::send(
            out,
            1173,
            Ctx {
                zone: Some(zone),
                ..Ctx::default()
            },
        );
        self.zoning = Some(zone);
        self.snap.moving = Some(format!("Sang khu {zone}"));
        self.move_until = Some(now + Duration::from_secs(8));
        true
    }

    /// "Đổi map": walks through portals (c2s/13 with the portal id, B5) to the map by the shortest way the atlas knows,
    /// at most 6 portals, a portal the server refuses left out. Refused while busy, for the map the character is on, for
    /// one above the character's level (Atlas::needs_level), and for one no known way leads to.
    pub fn go_to(&mut self, map_id: &str, now: Instant, out: &mut Vec<Out>) {
        self.travel_to(map_id, false, now, out);
    }
    /// go_to, a fight job left aside with `job` (busy_but). Returns whether the trip set off.
    pub(super) fn travel_to(
        &mut self,
        map_id: &str,
        job: bool,
        now: Instant,
        out: &mut Vec<Out>,
    ) -> bool {
        let name = self
            .atlas
            .maps
            .get(map_id)
            .map_or_else(|| map_id.to_string(), |m| m.name.clone());
        let why = self.busy_but(job).map(String::from).or_else(|| {
            let ways = self
                .atlas
                .hops(&self.snap.map_id, self.snap.level, &HashSet::new());
            if map_id == self.snap.map_id {
                Some("đang ở map này".into())
            } else if let Some(level) = self.atlas.needs_level(map_id, self.snap.level) {
                Some(format!("cần cấp {level}"))
            } else if !ways.contains_key(map_id) {
                Some("chưa biết đường qua cổng tới đó".into())
            } else {
                None
            }
        });
        if let Some(why) = why {
            out.push(Out::Log(
                LogKind::Travel,
                format!("Chưa đi tới {name}: {why}"),
            ));
            return false;
        }
        out.push(Out::Log(
            LogKind::Travel,
            format!("Bắt đầu: đi tới {name} ({map_id})"),
        ));
        (self.trip, self.hops, self.zone_after) = (Some((map_id.to_string(), name)), 0, None);
        self.refused.clear();
        self.trip_next(now, out);
        true
    }

    /// The next portal of the trip, or its end: on the map, past 6 portals, or no known way left.
    pub(super) fn trip_next(&mut self, now: Instant, out: &mut Vec<Out>) {
        let Some((to, name)) = self.trip.clone() else {
            return;
        };
        let here = self.snap.map_id.clone();
        let portal = self.atlas.route(
            &here,
            &|m: &MapRecord| m.map_id == to,
            self.snap.level,
            &self.refused,
        );
        let end = if here == to {
            Some(format!("đã tới {name}"))
        } else if self.hops >= 6 {
            Some(format!("qua 6 cổng vẫn chưa tới {name}"))
        } else if portal.is_none() {
            Some(format!("không còn đường tới {name}"))
        } else {
            None
        };
        if let Some(end) = end {
            (self.trip, self.snap.moving, self.move_until) = (None, None, None);
            out.push(Out::Log(LogKind::Travel, format!("Kết thúc: {end}")));
            // Back from the shop or from Tự gộp đá (a job's own trip): the zone it started from, as the Khu vực panel
            // would.
            let zone = self.zone_after.take();
            if let Some(z) = zone.filter(|&z| here == to && z != self.snap.zone) {
                let job = self.merge_trip.is_some();
                self.zone_to(z, job, now, out);
            }
            return;
        }
        let portal = portal.unwrap();
        self.hops += 1;
        self.travelling = Some((portal.id, portal.name.clone()));
        self.snap.moving = Some(format!("Đi tới {name}"));
        out.push(Out::Log(
            LogKind::Travel,
            format!("Qua cổng {} ({}/6)", portal.name, self.hops),
        ));
        Self::send(
            out,
            13,
            Ctx {
                map_id: Some(&here),
                npc_id: Some(portal.id),
                ..Ctx::default()
            },
        );
        self.move_until = Some(now + Duration::from_secs(8));
    }
}
