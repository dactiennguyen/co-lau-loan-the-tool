//! Port of the world packets of src/protocol/world.ts the app reads: mobs (s2c/43), map and places (s2c/11), map change (s2c/13),
//! bosses (s2c/1177), notices (s2c/1256), character stats (s2c/10), the other players of the zone (s2c/1263, 1167, 1170,
//! 1253).
use crate::protocol::{err, Reader, Result};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Mob {
    pub id: String,
    pub name: String,
    pub level: i32,
    pub a: u8,
    pub b: i32,
    pub c: i32,
    pub d: u8,
}
fn mob_record(r: &mut Reader) -> Result<Mob> {
    Ok(Mob {
        id: r.string()?,
        name: r.string()?,
        level: r.i32()?,
        a: r.u8()?,
        b: r.i32()?,
        c: r.i32()?,
        d: r.u8()?,
    })
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapEntities {
    pub map_id: String,
    pub field: u8,
    pub mobs: Vec<Mob>,
}
/// s2c/43: the mobs of the current map and zone.
pub fn map_entities(p: &[u8]) -> Result<MapEntities> {
    let mut r = Reader::new(p);
    let (map_id, field) = (r.string()?, r.u8()?);
    let mut mobs = vec![];
    while r.remaining() > 0 {
        mobs.push(mob_record(&mut r)?);
    }
    Ok(MapEntities {
        map_id,
        field,
        mobs,
    })
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Place {
    pub id: i32,
    pub name: String,
    /// 2: NPC, 0: portal
    #[serde(rename = "type")]
    pub kind: u8,
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapData {
    pub map_id: String,
    pub name: String,
    pub area: u8,
    pub x: i32,
    pub y: i32,
    pub places: Vec<Place>,
}
/// s2c/11 flag 1: map head, three grids, three ints, the places, three ints.
pub fn map_data(p: &[u8]) -> Result<MapData> {
    let mut r = Reader::new(p);
    let flag = r.u8()?;
    if flag != 1 {
        return err("UNSUPPORTED_BRANCH", format!("Unobserved map flag {flag}"));
    }
    let (map_id, name, area, x, y) = (r.string()?, r.string()?, r.u8()?, r.i32()?, r.i32()?);
    for _ in 0..3 {
        r.i32()?;
    }
    for _ in 0..3 {
        r.bytes()?;
    }
    for _ in 0..3 {
        r.i32()?;
    }
    let mut places = vec![];
    for _ in 0..r.i32()?.max(0) {
        let (id, name, kind, x, y, w, h) = (
            r.i32()?,
            r.string()?,
            r.u8()?,
            r.i32()?,
            r.i32()?,
            r.i32()?,
            r.i32()?,
        );
        r.u8()?;
        r.i32()?;
        r.i32()?;
        places.push(Place {
            id,
            name,
            kind,
            x,
            y,
            w,
            h,
        });
    }
    for _ in 0..3 {
        r.i32()?;
    }
    r.finish(
        MapData {
            map_id,
            name,
            area,
            x,
            y,
            places,
        },
        "s2c/11",
    )
}

/// The three grids of s2c/11 (mapGrid of src/protocol/world.ts): `rows` × `cols` bytes each, row by row from the top, one byte per
/// tile of 32 server units, so x / 32 and y / 32 of the character and of the places index them.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct MapGrid {
    pub rows: usize,
    pub cols: usize,
    /// What is drawn; 0: nothing.
    pub tiles: Vec<u8>,
    #[serde(skip)]
    pub decoration: Vec<u8>,
    /// 0 and 2 mark platform runs; the meaning of each value is not known yet.
    pub collision: Vec<u8>,
}
pub fn map_grid(p: &[u8]) -> Result<MapGrid> {
    let mut r = Reader::new(p);
    if r.u8()? != 1 {
        return err("UNSUPPORTED_BRANCH", "map flag");
    }
    r.string()?;
    r.string()?;
    r.u8()?;
    for _ in 0..3 {
        r.i32()?;
    }
    let (rows, cols) = (r.i32()?.max(0) as usize, r.i32()?.max(0) as usize);
    let (tiles, decoration, collision) = (
        r.bytes()?.to_vec(),
        r.bytes()?.to_vec(),
        r.bytes()?.to_vec(),
    );
    if [tiles.len(), decoration.len(), collision.len()]
        .iter()
        .any(|&n| n != rows * cols)
    {
        return err(
            "PAYLOAD_SCHEMA",
            format!("s2c/11 grids are not {rows} × {cols}"),
        );
    }
    Ok(MapGrid {
        rows,
        cols,
        tiles,
        decoration,
        collision,
    })
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapChange {
    pub map_id: String,
    /// After a zone change (c2s/1173): the new zone.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub zone: Option<i32>,
    /// Index in the world map, in the long form; after a portal the zone comes with the next s2c/11.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub map_index: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra: Option<[u8; 2]>,
}
/// s2c/13
pub fn map_change(p: &[u8]) -> Result<MapChange> {
    let mut r = Reader::new(p);
    let (map_id, value) = (r.string()?, r.i32()?);
    if r.remaining() == 0 {
        return Ok(MapChange {
            map_id,
            zone: Some(value),
            map_index: None,
            extra: None,
        });
    }
    // The last byte is 0xff after a portal and the new zone after c2s/1173 (Z1: M2, 1, 0, 4); B2 had the short form.
    let extra = [r.u8()?, r.u8()?];
    r.finish(
        MapChange {
            map_id,
            zone: (extra[1] != 0xff).then_some(extra[1] as i32),
            map_index: Some(value),
            extra: Some(extra),
        },
        "s2c/13",
    )
}

/// One zone of s2c/1172: `load` 0, 1, 2 as the panel colours it (2 red), players of `capacity` (20).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Zone {
    pub zone: i32,
    pub load: i32,
    pub players: i32,
    pub capacity: i32,
}
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ZoneList {
    pub zones: Vec<Zone>,
}
/// s2c/1172 answering c2s/1172: the zones of the current map (100 in M1 and M2) and their players
/// (08-server-map-zone.md#zone-list).
pub fn zone_list(p: &[u8]) -> Result<ZoneList> {
    let mut r = Reader::new(p);
    let mut zones = vec![];
    for _ in 0..r.u8()? {
        zones.push(Zone {
            zone: r.u8()? as i32,
            load: r.u8()? as i32,
            players: r.u8()? as i32,
            capacity: r.u8()? as i32,
        });
    }
    r.finish(ZoneList { zones }, "s2c/1172")
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BossPush {
    pub map_id: String,
    pub field: u8,
    /// field 1: the boss left its tile (~13 s until the next field 0).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gone: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mob: Option<Mob>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<u8>,
    /// Tile column and row (tiles of 32).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tile: Option<[i32; 2]>,
}
/// s2c/1177
pub fn map_boss(p: &[u8]) -> Result<BossPush> {
    let mut r = Reader::new(p);
    let (map_id, field) = (r.string()?, r.u8()?);
    if field == 1 {
        let gone = r.string()?;
        return r.finish(
            BossPush {
                map_id,
                field,
                gone: Some(gone),
                mob: None,
                state: None,
                tile: None,
            },
            "s2c/1177",
        );
    }
    let mob = mob_record(&mut r)?;
    let (state, tile) = (r.u8()?, [r.i32()?, r.i32()?]);
    r.finish(
        BossPush {
            map_id,
            field,
            gone: None,
            mob: Some(mob),
            state: Some(state),
            tile: Some(tile),
        },
        "s2c/1177",
    )
}

/// A step of s2c/39. `param` is the level for "Đạt cấp độ", the NPC for talk steps, the mob kind for kill steps.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestStep {
    pub index: i32,
    pub text: String,
    pub param: i32,
    pub required: i32,
    pub npc_id: i32,
}
/// s2c/39: the current main quest, the only one the server sends (docs/app/events/10-quests.md#s2c-39).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Quest {
    pub id: i32,
    pub title: String,
    pub description: String,
    #[serde(rename = "type")]
    pub kind: String,
    /// Position in `steps` of the step being played.
    pub current: i32,
    /// Kills, or boss damage, of the current step.
    pub progress: i32,
    pub steps: Vec<QuestStep>,
}
pub fn quest_data(p: &[u8]) -> Result<Quest> {
    let mut r = Reader::new(p);
    let (id, title, description, kind) = (r.i32()?, r.string()?, r.string()?, r.string()?);
    let (current, progress, n) = (r.i32()?, r.i32()?, r.i32()?);
    let mut steps = vec![];
    for _ in 0..n.max(0) {
        steps.push(QuestStep {
            index: r.i32()?,
            text: r.string()?,
            param: r.i32()?,
            required: r.i32()?,
            npc_id: r.i32()?,
        });
    }
    Ok(Quest {
        id,
        title,
        description,
        kind,
        current,
        progress,
        steps,
    })
}
/// s2c/34: NPC dialogue or progress of a quest; also sent, with no text, when a new quest is taken.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestProgress {
    pub field: i32,
    pub label: String,
    pub quest_id: i32,
    pub text: String,
}
pub fn quest_progress(p: &[u8]) -> Result<QuestProgress> {
    let mut r = Reader::new(p);
    Ok(QuestProgress {
        field: r.i32()?,
        label: r.string()?,
        quest_id: r.i32()?,
        text: r.string()?,
    })
}
/// s2c/35: quest handed in, with the reward lines shown to the player.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestComplete {
    pub quest_id: i32,
    pub title: String,
    pub rewards: Vec<String>,
    pub text: String,
}
pub fn quest_complete(p: &[u8]) -> Result<QuestComplete> {
    let mut r = Reader::new(p);
    let (quest_id, title, n) = (r.i32()?, r.string()?, r.i32()?);
    let rewards = (0..n.max(0)).map(|_| r.string()).collect::<Result<_>>()?;
    Ok(QuestComplete {
        quest_id,
        title,
        rewards,
        text: r.string()?,
    })
}

/// s2c/1256: a notice line ("Thua trận, mất 16 kinh nghiệm", a portal refusal).
pub fn notice(p: &[u8]) -> Result<String> {
    let mut r = Reader::new(p);
    r.u8()?;
    let text = r.string()?;
    r.finish(text, "s2c/1256")
}

/// s2c/57 after c2s/13 to an NPC with a menu (Lái Buôn, P5): its name, its line, and the choices (code, label) that
/// c2s/57 picks from. ← npcMenu of src/protocol/world.ts.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct NpcMenu {
    pub npc: String,
    pub text: String,
    pub options: Vec<(u8, String)>,
}
/// s2c/1180 after Đồng ý (c2s/57) in a duel's dialog (N2, N3: "Tỷ thí với Võ Quan Đinh Mộc"): the NPC's map and id, the
/// mob the duel is fought against (mob880 "Võ Quan Đinh Mộc" cấp 20, a mob record as in s2c/43), then `u8 a; i32 b`. The
/// game challenges that mob at once with c2s/1181 (N3). ← duelInvite of src/protocol/world.ts.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuelInvite {
    pub map_id: String,
    pub npc_id: i32,
    pub mob: Mob,
    pub a: u8,
    pub b: i32,
}
pub fn duel_invite(p: &[u8]) -> Result<DuelInvite> {
    let mut r = Reader::new(p);
    let (map_id, npc_id) = (r.string()?, r.i32()?);
    let mob = mob_record(&mut r)?;
    let (a, b) = (r.u8()?, r.i32()?);
    r.finish(
        DuelInvite {
            map_id,
            npc_id,
            mob,
            a,
            b,
        },
        "s2c/1180",
    )
}
pub fn npc_menu(p: &[u8]) -> Result<NpcMenu> {
    let mut r = Reader::new(p);
    let n = r.i32()?;
    let (npc, text) = (r.string()?, r.string()?);
    let mut options = vec![];
    for _ in 0..n.max(0) {
        options.push((r.u8()?, r.string()?));
    }
    r.finish(NpcMenu { npc, text, options }, "s2c/57")
}

/// One line of a shop: `shop_id` is what c2s/1190 buys, not the item id, since the same item is sold for Xu
/// (`currency` 0), Xu khóa (1) or Lượng (2) in lines of their own. `flag` is the trade lock of the item bought (1
/// tradeable, 0 locked: the Xu khóa lines). Gear has its main stat as a range it rolls in (15-shops.md#bản-ghi).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShopItem {
    pub shop_id: i32,
    pub item_id: i32,
    pub currency: u8,
    pub price: i32,
    pub durability: i32,
    pub quantity: i32,
    pub flag: u8,
    pub element: u8,
    pub ranges: Vec<StatRange>,
}
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct StatRange {
    pub stat: i32,
    pub min: i32,
    pub max: i32,
}

/// s2c/1190 after c2s/57 opens one of the 14 shops (npc::SHOPS; kind 6 Dược phẩm of Lái Buôn: "Vật Phẩm", 8 lines of 33
/// bytes, P5; gear lines are 49 bytes, J1). ← shopList of src/protocol/world.ts.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShopList {
    pub kind: u8,
    pub title: String,
    pub items: Vec<ShopItem>,
}
pub fn shop_list(p: &[u8]) -> Result<ShopList> {
    let mut r = Reader::new(p);
    let (kind, title) = (r.u8()?, r.string()?);
    let mut items = vec![];
    for _ in 0..r.i32()?.max(0) {
        items.push(ShopItem {
            shop_id: r.i32()?,
            item_id: r.i32()?,
            currency: r.u8()?,
            price: r.i32()?,
            durability: r.i32()?,
            quantity: r.i32()?,
            flag: r.u8()?,
            element: r.u8()?,
            ranges: {
                // field2, field3, field4 (1 on gear) of the item record, then the stat ranges.
                r.take(6)?;
                let mut ranges = vec![];
                for _ in 0..r.i32()?.max(0) {
                    ranges.push(StatRange {
                        stat: r.i32()?,
                        min: r.i32()?,
                        max: r.i32()?,
                    });
                    // 01 01 01 01, or 01 01 02 01 on weapons of tier 51: not understood.
                    r.take(4)?;
                }
                ranges
            },
        });
    }
    r.finish(ShopList { kind, title, items }, "s2c/1190")
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Stats {
    pub kind: i32,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub level: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stats: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub hp: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_hp: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub exp: Option<i32>,
    /// EXP range of the current level.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub level_exp: Option<[i32; 2]>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub coin: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stat_points: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fields: Option<Vec<i32>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub labels: Option<[String; 2]>,
    /// Kind 32, after c2s/1191: the level of every skill of the character's tree.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skills: Option<Vec<SkillRank>>,
}
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct SkillRank {
    pub id: i32,
    pub level: i32,
}
/// s2c/10: kind 2 level and stats, kind 4 HP/EXP/coins (also after every battle), kind 8 stat points, kind 32 the skill
/// levels (12-skills-items.md#c2s-1191).
pub fn character_stats(p: &[u8]) -> Result<Stats> {
    let mut r = Reader::new(p);
    let (kind, name) = (r.i32()?, r.string()?);
    fn ints(r: &mut Reader, n: usize) -> Result<Vec<i32>> {
        (0..n).map(|_| r.i32()).collect()
    }
    let mut s = Stats {
        kind,
        name,
        ..Default::default()
    };
    match kind {
        2 => {
            s.level = Some(r.i32()?);
            s.stats = Some(ints(&mut r, 10)?);
        }
        4 => {
            s.hp = Some(r.i32()?);
            s.max_hp = Some(r.i32()?);
            s.exp = Some(r.i32()?);
            s.level_exp = Some([r.i32()?, r.i32()?]);
            s.coin = Some(r.i32()?);
            s.extra = Some(ints(&mut r, 6)?);
        }
        8 => {
            s.stat_points = Some(r.i32()?);
            s.fields = Some(ints(&mut r, 3)?);
            s.labels = Some([r.string()?, r.string()?]);
        }
        32 => {
            s.skills = Some(
                (0..r.i32()?.max(0))
                    .map(|_| {
                        Ok(SkillRank {
                            id: r.i32()?,
                            level: r.i32()?,
                        })
                    })
                    .collect::<Result<_>>()?,
            );
        }
        _ => {}
    }
    Ok(s)
}

/// Another player of the zone, from its record in s2c/1167 or s2c/1263.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Player {
    pub id: i32,
    pub name: String,
    pub level: i32,
    pub x: i32,
    pub y: i32,
}
/// Player record of s2c/1167 and of each s2c/1263 entry; the appearance block is read past, as in src/protocol/world.ts.
pub fn player_record(r: &mut Reader) -> Result<Player> {
    r.u8()?;
    let (name, id) = (r.string()?, r.i32()?);
    r.string()?;
    r.take(2)?;
    let level = r.i32()?;
    r.take(16)?; // hp, max hp, s1, s1 max
    r.u16()?;
    let (x, y) = (r.i32()?, r.i32()?);
    r.take(24)?; // gear[6]
    appearance(r)?;
    r.i32()?;
    r.string()?; // faction ("sứ quân")
    r.take(2)?;
    Ok(Player {
        id,
        name,
        level,
        x,
        y,
    })
}
/// The appearance block of a player record and of the s2c/9 tail, read past as in src/protocol/world.ts; its length.
pub(crate) fn appearance(r: &mut Reader) -> Result<usize> {
    let start = r.offset;
    r.take(12)?; // three ints
    r.u8()?;
    r.bytes()?;
    r.i32()?;
    r.bytes()?; // palette layers (ARGB)
    r.i32()?;
    r.u8()?;
    r.take(40)?; // two groups of five ints
    let marker = r.i32()?;
    if marker != 99000 {
        return err(
            "PAYLOAD_SCHEMA",
            format!("Unobserved appearance marker {marker}"),
        );
    }
    for _ in 0..r.u8()? {
        r.i32()?;
        r.bytes()?;
    }
    Ok(r.offset - start)
}

/// s2c/1212, also appended to every s2c/1263 entry: effects, read past.
fn player_status(r: &mut Reader) -> Result<()> {
    r.i32()?;
    if r.u8()? == 2 {
        let n = r.u8()? as usize;
        r.take(n * 6 + 1)?;
    } else {
        r.take(6)?;
    }
    Ok(())
}
/// s2c/1263: every other player of the zone.
pub fn players_snapshot(p: &[u8]) -> Result<Vec<Player>> {
    let mut r = Reader::new(p);
    let mut players = vec![];
    for _ in 0..r.u16()? {
        players.push(player_record(&mut r)?);
        player_status(&mut r)?;
    }
    r.finish(players, "s2c/1263")
}

/// A player of the zone as the app lists it.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Nearby {
    pub id: i32,
    pub name: String,
    pub level: i32,
}
impl From<Player> for Nearby {
    fn from(p: Player) -> Self {
        Self {
            id: p.id,
            name: p.name,
            level: p.level,
        }
    }
}
/// The other players of the zone; port of ZonePlayers of src/protocol/world.ts. s2c/1263 replaces the list (after c2s/43 and
/// after a battle), s2c/1167 adds or refreshes one, s2c/1170 removes one, s2c/1253 updates a level. The own character
/// is never in it.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct ZonePlayers {
    players: std::collections::HashMap<i32, Nearby>,
}
impl ZonePlayers {
    /// True when the packet changed the list.
    pub fn on(&mut self, opcode: i32, p: &[u8]) -> Result<bool> {
        match opcode {
            1263 => {
                self.players = players_snapshot(p)?
                    .into_iter()
                    .map(|pl| (pl.id, pl.into()))
                    .collect();
                Ok(true)
            }
            1167 => {
                let pl = player_record(&mut Reader::new(p))?;
                self.players.insert(pl.id, pl.into());
                Ok(true)
            }
            1170 => Ok(self.players.remove(&Reader::new(p).i32()?).is_some()),
            1253 => {
                let mut r = Reader::new(p);
                let (id, level) = (r.i32()?, r.i32()?);
                Ok(self.players.get_mut(&id).map(|n| n.level = level).is_some())
            }
            _ => Ok(false),
        }
    }
    pub fn len(&self) -> usize {
        self.players.len()
    }
    pub fn is_empty(&self) -> bool {
        self.players.is_empty()
    }
    pub fn clear(&mut self) {
        self.players.clear();
    }
    /// Highest level first, then by lower-case name, then id.
    pub fn list(&self) -> Vec<Nearby> {
        let mut out: Vec<Nearby> = self.players.values().cloned().collect();
        out.sort_by(|a, b| {
            b.level
                .cmp(&a.level)
                .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
                .then(a.id.cmp(&b.id))
        });
        out
    }
}

#[cfg(test)]
mod tests {
    use super::{Nearby, ZonePlayers};

    #[test]
    fn zone_list_orders_names_by_code_point_like_the_ts_list() {
        let mut zone = ZonePlayers::default();
        for (id, name, level) in [
            (1, "\u{1F600}x", 5),
            (2, "\u{FF21}y", 5),
            (3, "b", 5),
            (4, "A", 5),
            (5, "z", 9),
        ] {
            let name = name.to_string();
            zone.players.insert(id, Nearby { id, name, level });
        }
        let ids: Vec<i32> = zone.list().iter().map(|n| n.id).collect();
        assert_eq!(ids, [5, 4, 3, 2, 1]);
    }
}
