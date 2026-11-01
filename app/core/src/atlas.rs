//! data/maps.json (src/bot/atlas.ts): NPCs and portals of each map, mob kinds by zone, bosses, where a portal led or why it
//! was refused. The app reads the file at start; each session works on its own copy and records what it sees, as
//! QuestBot does, so the quest bot finds the way to the NPC or mob of a step. The app does not write the file back; the
//! TS bots and `npm run scan` do.
use crate::world::{Mob, Place};
use indexmap::IndexMap;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, HashMap, HashSet, VecDeque};
use std::path::{Path, PathBuf};

/// A mob kind of a map, with its ids by zone (ids change with the zone, the kinds do not).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Kind {
    pub name: String,
    pub level: i32,
    #[serde(default)]
    pub ids: BTreeMap<String, Vec<String>>,
}
/// Last tile (column, row; tiles of 32) a boss was seen on, and in which zone.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Seen {
    pub zone: i32,
    pub at: [i32; 2],
}
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Boss {
    pub name: String,
    pub level: i32,
    #[serde(default)]
    pub ids: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub tile: Option<Seen>,
}
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MapRecord {
    #[serde(default)]
    pub map_id: String,
    pub name: String,
    /// NPCs (type 2) and portals (type 0) with their box in server units.
    #[serde(default)]
    pub places: Vec<Place>,
    #[serde(default)]
    pub mobs: Vec<Kind>,
    #[serde(default)]
    pub bosses: Vec<Boss>,
    /// Day of the last visit, YYYY-MM-DD; left as read.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub seen: String,
}
/// Where a portal led, the level it asked for, or another refusal ("Bạn cần hoàn thành nhiệm vụ trước khi tới đây").
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Portal {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub map_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub level: Option<i32>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub refused: Option<String>,
}
/// c2s/11 "M99": the level each map asks for, and whether the world map shows it locked.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorldMap {
    pub map_id: String,
    pub level: i32,
    pub locked: bool,
}
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Atlas {
    #[serde(default)]
    pub world: Vec<WorldMap>,
    /// In file order, which `destination` searches.
    #[serde(default)]
    pub maps: IndexMap<String, MapRecord>,
    /// By portal id; a portal id names its destination in every map (1013 is Lạc Cốc from M1 and from M2).
    #[serde(default)]
    pub portals: IndexMap<String, Portal>,
}

/// s2c/1256 after c2s/13 through a portal the character may not enter: "Bạn phải đạt cấp 40 mới vào được Lạc Cốc" →
/// (40, "Lạc Cốc").
pub fn portal_refusal(text: &str) -> Option<(i32, String)> {
    let (_, rest) = text.split_once("phải đạt cấp ")?;
    let (level, name) = rest.split_once(" mới vào được ")?;
    let level = (!level.is_empty() && level.bytes().all(|b| b.is_ascii_digit()))
        .then(|| level.parse().ok())
        .flatten()?;
    (!name.is_empty()).then(|| (level, name.to_string()))
}

impl Atlas {
    /// The file at `path`; empty when it is missing or unreadable.
    pub fn load(path: &Path) -> Self {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }
    pub fn bosses(&self, map_id: &str) -> &[Boss] {
        self.maps.get(map_id).map_or(&[], |m| &m.bosses)
    }

    fn entry(&mut self, map_id: &str) -> &mut MapRecord {
        self.maps
            .entry(map_id.to_string())
            .or_insert_with(|| MapRecord {
                map_id: map_id.to_string(),
                ..MapRecord::default()
            })
    }
    /// s2c/11: name and places of a map.
    pub fn record_map(&mut self, map_id: &str, name: &str, places: &[Place]) {
        let m = self.entry(map_id);
        m.name = name.to_string();
        m.places = places.to_vec();
    }
    /// s2c/43: the mob kinds of a map in order, with the ids of this zone.
    pub fn record_mobs(&mut self, map_id: &str, zone: i32, mobs: &[Mob]) {
        let m = self.entry(map_id);
        let mut ids: HashMap<(String, i32), Vec<String>> = HashMap::new();
        for mob in mobs {
            if !m
                .mobs
                .iter()
                .any(|k| k.name == mob.name && k.level == mob.level)
            {
                m.mobs.push(Kind {
                    name: mob.name.clone(),
                    level: mob.level,
                    ids: BTreeMap::new(),
                });
            }
            ids.entry((mob.name.clone(), mob.level))
                .or_default()
                .push(mob.id.clone());
        }
        for k in &mut m.mobs {
            if let Some(seen) = ids.remove(&(k.name.clone(), k.level)) {
                k.ids.insert(zone.to_string(), seen);
            }
        }
    }
    /// s2c/1177: a boss of a map, its id in this zone and the tile it stands on.
    pub fn record_boss(&mut self, map_id: &str, zone: i32, mob: &Mob, tile: [i32; 2]) {
        let m = self.entry(map_id);
        let i = match m.bosses.iter().position(|b| b.name == mob.name) {
            Some(i) => i,
            None => {
                m.bosses.push(Boss {
                    name: mob.name.clone(),
                    level: mob.level,
                    ids: BTreeMap::new(),
                    tile: None,
                });
                m.bosses.len() - 1
            }
        };
        let b = &mut m.bosses[i];
        b.level = mob.level;
        b.ids.insert(zone.to_string(), mob.id.clone());
        b.tile = Some(Seen { zone, at: tile });
    }
    /// What a portal answered. One that let the character through drops a quest refusal but keeps the level it asked for:
    /// the server asks that level of every character, and the atlas is shared (the scan S2 by a level 42 had dropped the
    /// 40 of Lạc Cốc).
    pub fn record_portal(&mut self, id: i32, fields: Portal) {
        let p = self.portals.entry(id.to_string()).or_default();
        if fields.map_id.is_some() {
            p.refused = None;
        }
        p.name = fields.name;
        p.map_id = fields.map_id.or(p.map_id.take());
        p.level = fields.level.or(p.level);
        p.refused = fields.refused.or(p.refused.take());
    }
    /// The answer s2c/1256 to c2s/13 through a portal; returns the level it asked for, if any.
    pub fn record_refusal(&mut self, id: i32, name: &str, text: &str) -> Option<i32> {
        let lock = portal_refusal(text).map(|l| l.0);
        self.record_portal(
            id,
            Portal {
                name: name.to_string(),
                level: lock,
                refused: lock.is_none().then(|| text.to_string()),
                ..Portal::default()
            },
        );
        lock
    }

    /// Map a portal of map `from` leads to: as taken before, else another map named like the portal, exactly first, then
    /// containing it ("Vân Sơn" → "Trại Vân Sơn").
    pub fn destination(&self, id: i32, name: &str, from: &str) -> Option<String> {
        if let Some(to) = self
            .portals
            .get(&id.to_string())
            .and_then(|p| p.map_id.clone())
        {
            return Some(to);
        }
        let others = || self.maps.values().filter(|m| m.map_id != from);
        others()
            .find(|m| m.name == name)
            .or_else(|| others().find(|m| m.name.contains(name)))
            .map(|m| m.map_id.clone())
    }
    /// The level the world map (c2s/11 "M99") shows for a map.
    pub fn world_level(&self, map_id: &str) -> Option<i32> {
        self.world
            .iter()
            .find(|w| w.map_id == map_id)
            .map(|w| w.level)
    }
    /// The level the world map shows for `map_id` when it is more than one above `level`. One level less still gets in:
    /// M25 is shown 20 and let a level 19 in (S1); Lạc Cốc, shown 40, refused a level 19 with "phải đạt cấp 40". Level 0
    /// is a level not known yet (it comes with s2c/10) and leaves no map out.
    pub fn above_level(&self, map_id: &str, level: i32) -> Option<i32> {
        self.world_level(map_id)
            .filter(|&w| level > 0 && w - 1 > level)
    }
    /// The level a character of `level` lacks to enter `map_id`, for "Đổi map": the one its portal asked for (a portal id
    /// names its map), else the world map's (above_level).
    pub fn needs_level(&self, map_id: &str, level: i32) -> Option<i32> {
        self.portals
            .values()
            .filter(|p| p.map_id.as_deref() == Some(map_id))
            .filter_map(|p| p.level)
            .filter(|&l| l > level)
            .max()
            .or_else(|| self.above_level(map_id, level))
    }
    /// Portals of a map the character may try: not the "Bản đồ" button, not one that asked for a higher level, not one to a
    /// map above the character's level (above_level), not in `skip`.
    pub fn portals_of(&self, map_id: &str, level: i32, skip: &HashSet<i32>) -> Vec<&Place> {
        self.maps.get(map_id).map_or(vec![], |m| {
            m.places
                .iter()
                .filter(|p| {
                    p.kind == 0
                        && p.name != "Bản đồ"
                        && self
                            .portals
                            .get(&p.id.to_string())
                            .and_then(|r| r.level)
                            .unwrap_or(0)
                            <= level
                        && self
                            .destination(p.id, &p.name, map_id)
                            .is_none_or(|to| self.above_level(&to, level).is_none())
                        && !skip.contains(&p.id)
                })
                .collect()
        })
    }
    /// Every map of the atlas the character can reach from `from` through portals, with the number of portals on the
    /// shortest known way (0 for `from`).
    pub fn hops(&self, from: &str, level: i32, skip: &HashSet<i32>) -> HashMap<String, u32> {
        let mut out = HashMap::from([(from.to_string(), 0)]);
        let mut queue = VecDeque::from([from.to_string()]);
        while let Some(map_id) = queue.pop_front() {
            let n = out[&map_id];
            for p in self.portals_of(&map_id, level, skip) {
                let Some(to) = self.destination(p.id, &p.name, &map_id) else {
                    continue;
                };
                if self.maps.contains_key(&to) && !out.contains_key(&to) {
                    out.insert(to.clone(), n + 1);
                    queue.push_back(to);
                }
            }
        }
        out
    }
    /// First portal on the shortest known way from `from` to another map where `wanted` holds.
    pub fn route(
        &self,
        from: &str,
        wanted: &dyn Fn(&MapRecord) -> bool,
        level: i32,
        skip: &HashSet<i32>,
    ) -> Option<Place> {
        let mut first: HashMap<String, Option<Place>> = HashMap::from([(from.to_string(), None)]);
        let mut queue = VecDeque::from([from.to_string()]);
        while let Some(map_id) = queue.pop_front() {
            if map_id != from && self.maps.get(&map_id).is_some_and(wanted) {
                return first.remove(&map_id).flatten();
            }
            for p in self.portals_of(&map_id, level, skip) {
                let Some(to) = self.destination(p.id, &p.name, &map_id) else {
                    continue;
                };
                if self.maps.contains_key(&to) && !first.contains_key(&to) {
                    let via = if map_id == from {
                        Some(p.clone())
                    } else {
                        first[&map_id].clone()
                    };
                    first.insert(to.clone(), via);
                    queue.push_back(to);
                }
            }
        }
        None
    }
}

/// `relative` in the current directory or the nearest parent that has it (data/maps.json from app/ or app/desktop/).
pub fn find_upwards(relative: &str) -> Option<PathBuf> {
    let mut dir = std::env::current_dir().ok()?;
    loop {
        let p = dir.join(relative);
        if p.exists() {
            return Some(p);
        }
        if !dir.pop() {
            return None;
        }
    }
}
