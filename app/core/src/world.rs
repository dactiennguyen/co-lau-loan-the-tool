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
    /// The 9 bytes a client that says protocol 0.0.7 gets after `d` (VG1, 20/11): a u8 and an i32 that go up with the
    /// kind of mob, then the tile column and row the mob stands on. None for 0.0.2.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub e: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub f: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tile: Option<[i16; 2]>,
}
impl Mob {
    /// The element of the mob from `a`, numbered as the character's (s2c/9) and the items': 0 is Hỏa (1), 2 Lôi, 4 Thủy.
    /// It matched the element of the mob block of s2c/22 for 25 kinds in about 1.800 battles (06-map-mobs.md#hệ-của-quái).
    pub fn element(&self) -> Option<i32> {
        match self.a {
            0 => Some(1),
            2 => Some(2),
            4 => Some(4),
            _ => None,
        }
    }
}

fn mob_record(r: &mut Reader, extended: bool) -> Result<Mob> {
    let mut mob = Mob {
        id: r.string()?,
        name: r.string()?,
        level: r.i32()?,
        a: r.u8()?,
        b: r.i32()?,
        c: r.i32()?,
        d: r.u8()?,
        e: None,
        f: None,
        tile: None,
    };
    if extended {
        mob.e = Some(r.u8()?);
        mob.f = Some(r.i32()?);
        mob.tile = Some([i16_be(r)?, i16_be(r)?]);
    }
    Ok(mob)
}
fn i16_be(r: &mut Reader) -> Result<i16> {
    let b = r.take(2)?;
    Ok(i16::from_be_bytes([b[0], b[1]]))
}
/// Reads with the layout of protocol 0.0.7 first, then of 0.0.2: the one that reads the payload to its last byte.
pub(crate) fn either_layout<T>(read: impl Fn(bool) -> Result<T>) -> Result<T> {
    read(true).or_else(|_| read(false))
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
    either_layout(|extended| {
        let mut r = Reader::new(p);
        let (map_id, field) = (r.string()?, r.u8()?);
        let mut mobs = vec![];
        while r.remaining() > 0 {
            mobs.push(mob_record(&mut r, extended)?);
        }
        Ok(MapEntities {
            map_id,
            field,
            mobs,
        })
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

/// What the i32 of c2s/11 says (06-map-mobs.md#c2s-11, game 1.1.1 on 22/11): the map's index (the i32 of s2c/29 and of
/// the long s2c/13: M1 0, M11 10, M12 11, M15 14) when the client loaded that map earlier in this session, -1 the first
/// time. Fed every packet of the session from the login on, as MapLoads of src/protocol/world.ts.
#[derive(Debug, Clone, Default)]
pub struct MapLoads {
    loaded: std::collections::HashSet<String>,
    index: std::collections::HashMap<String, i32>,
}
impl MapLoads {
    /// s2c/29, s2c/13 (the map's index) and s2c/11 flag 1 (the map loaded); what does not read is left alone.
    pub fn on(&mut self, opcode: i32, payload: &[u8]) {
        match opcode {
            29 => {
                if let Ok(l) = crate::protocol::character_location(payload) {
                    self.locate(&l.map_id, Some(l.field));
                }
            }
            13 => {
                if let Ok(c) = map_change(payload) {
                    self.locate(&c.map_id, c.map_index);
                }
            }
            11 if payload.first() == Some(&1) => {
                let mut r = Reader::new(payload);
                if let Ok(id) = r.u8().and_then(|_| r.string()) {
                    self.loaded.insert(id);
                }
            }
            _ => {}
        }
    }
    fn locate(&mut self, map_id: &str, index: Option<i32>) {
        if let Some(i) = index.filter(|&i| i >= 0) {
            self.index.insert(map_id.to_string(), i);
        }
    }
    /// The i32 of c2s/11 for `map_id` now.
    pub fn map_index(&self, map_id: &str) -> i32 {
        match self.loaded.contains(map_id) {
            true => self.index.get(map_id).copied().unwrap_or(-1),
            false => -1,
        }
    }
}

/// One zone of s2c/1172:`load` 0, 1, 2 as the panel colours it (2 red), players of `capacity` (20).
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
    either_layout(|extended| {
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
        // 0.0.7 (the bot, 20/11): the u8 and i32 of the mob come after the tile here, with no tile of their own.
        let mut mob = mob_record(&mut r, false)?;
        let (state, tile) = (r.u8()?, [r.i32()?, r.i32()?]);
        if extended {
            (mob.e, mob.f) = (Some(r.u8()?), Some(r.i32()?));
        }
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
    })
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
    /// The bytes a client that says protocol 0.0.7 gets after every step (VG1, 20/11), in hex: `u8 kind; i32 target;
    /// i16 n; n × i32` (kind 0 none, 1 talk to the NPC `target`, 2 kill).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub extra: Option<String>,
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
    either_layout(|extended| quest_layout(p, extended))
}
/// The bytes of protocol 0.0.7 after a step of s2c/39, as hex: `u8 kind; i32 target; i16 n; n × i32` (questData of
/// src/protocol/world.ts).
fn step_extra(r: &mut Reader) -> Result<String> {
    let start = r.offset;
    r.u8()?;
    r.i32()?;
    for _ in 0..i16_be(r)?.max(0) {
        r.i32()?;
    }
    Ok(r.data[start..r.offset]
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect())
}
fn quest_layout(p: &[u8], extended: bool) -> Result<Quest> {
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
            extra: match extended {
                true => Some(step_extra(&mut r)?),
                false => None,
            },
        });
    }
    let quest = Quest {
        id,
        title,
        description,
        kind,
        current,
        progress,
        steps,
    };
    match extended {
        true => r.finish(quest, "s2c/39"),
        false => Ok(quest),
    }
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

/// s2c/1283, Xác nhận người chơi (02-login.md#captcha, LG1 25/11): the server's captcha right after login, then its
/// verdict once the player answered with c2s/1283 (the points touched on the picture). The app does not answer it.
#[derive(Debug, Clone, PartialEq)]
pub enum Captcha {
    /// Type 0: a challenge, `seconds` to answer in `tries` tries, its picture (a PNG of 640 × 400).
    Challenge {
        id: i32,
        seconds: u16,
        tries: u8,
        png: Vec<u8>,
    },
    /// Type 1: the verdict (0 = passed in the one seen) and the server's words ("Xác nhận thành công").
    Verdict { id: i32, result: u8, text: String },
}

/// s2c/1283: u8 type; i32 id; type 0: u16 seconds; u8 tries; bytes PNG. Type 1: u8 result; u8; string text.
pub fn captcha(p: &[u8]) -> Result<Captcha> {
    let mut r = Reader::new(p);
    let kind = r.u8()?;
    let id = r.i32()?;
    let c = if kind == 0 {
        Captcha::Challenge {
            id,
            seconds: r.u16()?,
            tries: r.u8()?,
            png: r.bytes()?.to_vec(),
        }
    } else {
        let result = r.u8()?;
        r.u8()?;
        Captcha::Verdict {
            id,
            result,
            text: r.string()?,
        }
    };
    r.finish(c, "s2c/1283")
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
/// mob the duel is fought against (mob880 "Võ Quan Đinh Mộc" cấp 20, a mob record of protocol 0.0.2 under both protocols),
/// then `u8 a; i32 b`. Protocol 0.0.7 adds `u8 c` at the end (105 in all five of 20/11, D7). The game challenges that mob
/// at once with c2s/1181 (N3). ← duelInvite of src/protocol/world.ts.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DuelInvite {
    pub map_id: String,
    pub npc_id: i32,
    pub mob: Mob,
    pub a: u8,
    pub b: i32,
    /// Protocol 0.0.7 only.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub c: Option<u8>,
}
pub fn duel_invite(p: &[u8]) -> Result<DuelInvite> {
    let mut r = Reader::new(p);
    let (map_id, npc_id) = (r.string()?, r.i32()?);
    let mob = mob_record(&mut r, false)?;
    let (a, b) = (r.u8()?, r.i32()?);
    let c = if r.remaining() == 1 {
        Some(r.u8()?)
    } else {
        None
    };
    r.finish(
        DuelInvite {
            map_id,
            npc_id,
            mob,
            a,
            b,
            c,
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
    either_layout(|extended| shop_lines(p, extended))
}
/// One layout of s2c/1190: with protocol 0.0.7 each line has 2 more bytes after field4 (an i16, 1 in every line of Vũ
/// khí [Xu] on 20/11), as the item record has `field5` there.
fn shop_lines(p: &[u8], extended: bool) -> Result<ShopList> {
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
                // field2, field3, field4 (1 on gear) of the item record (and field5 on 0.0.7), then the stat ranges.
                r.take(if extended { 8 } else { 6 })?;
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
                 // APK 1.1.0 (20/11) puts two bytes before the appearance block (0, then the element of the weapon or 255); records of
                 // 1.0.3 have none, so the old layout is read when the new one does not (src/protocol/world.ts playerRecord).
    let at = r.offset;
    if r.take(2).and_then(|_| appearance(r)).is_err() {
        r.offset = at;
        appearance(r)?;
    }
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

/// s2c/1212, also appended to every s2c/1263 entry: effects, read past. Mode 2 is `u8 n; n × {u8; i32 effect; u8};
/// u8 more`, and `more` 1 brings an i32 after it (game 1.1.1: 9288 for a player of Phong Nguyên, 22/11; before, the
/// four bytes were read as the next record and the whole list was refused).
fn player_status(r: &mut Reader) -> Result<()> {
    r.i32()?;
    if r.u8()? == 2 {
        let n = r.u8()? as usize;
        r.take(n * 6)?;
        if r.u8()? == 1 {
            r.i32()?;
        }
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

// Bảng xếp hạng (11-panels.md#s2c-1254, RK1 23/11): c2s/1254 00 opens it (the tab list, then tab 0); 01 and a tab shows
// that tab alone, as the client sends it. Tab 0 Cao thủ (Cấp độ), 1 Sứ quân, 2 12 châu, 3 Cường hoá (Tổng cấp), 4 Hỏa, 5
// Lôi, 6 Thủy (Cấp độ). ← ranking and rankingRequest of src/protocol/world.ts.

/// A tab of Bảng xếp hạng: its number, its title and the name of its figure column.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct RankTab {
    pub tab: u8,
    pub title: String,
    pub column: String,
}
/// A row: rank, character id (0 for a 12 châu without a lord), name, a field always 0, the figure (level, total upgrade
/// levels), and since protocol 0.0.7 when it was reached (ms since 1970; none in 12 châu).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RankRow {
    pub rank: i32,
    pub id: i32,
    pub name: String,
    pub field: i32,
    pub level: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reached_at: Option<i64>,
}
/// The character's own row: rank -1 when not in the tab.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RankOwn {
    pub rank: i32,
    pub field: i32,
    pub level: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reached_at: Option<i64>,
}
/// s2c/1254: kind 0 the tabs, kind 1 one tab.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(untagged)]
pub enum Ranking {
    Tabs {
        kind: u8,
        tabs: Vec<RankTab>,
    },
    List {
        kind: u8,
        tab: u8,
        rows: Vec<RankRow>,
        own: RankOwn,
    },
}
/// s2c/1254 (either layout: 0.0.7 has an i64 per row after the own row, then the own one).
pub fn ranking(p: &[u8]) -> Result<Ranking> {
    let mut r = Reader::new(p);
    if r.u8()? == 0 {
        let mut tabs = vec![];
        for _ in 0..r.u8()? {
            tabs.push(RankTab {
                tab: r.u8()?,
                title: r.string()?,
                column: r.string()?,
            });
        }
        r.u8()?;
        return r.finish(Ranking::Tabs { kind: 0, tabs }, "s2c/1254");
    }
    either_layout(|extended| {
        let mut r = Reader::new(p);
        r.u8()?;
        let tab = r.u8()?;
        let mut rows = vec![];
        for _ in 0..r.i32()?.max(0) {
            rows.push(RankRow {
                rank: r.i32()?,
                id: r.i32()?,
                name: r.string()?,
                field: r.i32()?,
                level: r.i32()?,
                reached_at: None,
            });
        }
        let mut own = RankOwn {
            rank: r.i32()?,
            field: r.i32()?,
            level: r.i32()?,
            reached_at: None,
        };
        if extended {
            for row in rows.iter_mut() {
                row.reached_at = Some(r.i64()?);
            }
            own.reached_at = Some(r.i64()?);
        }
        r.finish(
            Ranking::List {
                kind: 1,
                tab,
                rows,
                own,
            },
            "s2c/1254",
        )
    })
}
/// c2s/1254: None opens Bảng xếp hạng (00), a tab shows that tab (01 tab).
pub fn ranking_request(tab: Option<u8>) -> Vec<u8> {
    match tab {
        None => vec![0],
        Some(t) => vec![1, t],
    }
}

#[cfg(test)]
mod tests {
    use super::{
        captcha, map_boss, map_entities, players_snapshot, quest_data, Captcha, Nearby, ZonePlayers,
    };
    use crate::protocol::Writer;

    /// A player record as test/world.test.ts record110: APK 1.1.0 puts two bytes (0, weapon element) before the appearance.
    fn record(name: &str, weapon_bytes: bool) -> Vec<u8> {
        let mut w = Writer::new()
            .u8(4)
            .string(name)
            .i32(22)
            .string(name)
            .u8(4)
            .u8(0);
        for v in [5, 207, 214, 2, 100] {
            w = w.i32(v);
        }
        w = w.u8(0).u8(0).i32(1407).i32(640);
        for v in [90200, 70100, 82500, 0, 0, 0] {
            w = w.i32(v);
        }
        if weapon_bytes {
            w = w.u8(0).u8(4);
        }
        w = w
            .i32(3)
            .i32(50400)
            .i32(0)
            .u8(8)
            .bytes(&[0; 36])
            .i32(0)
            .bytes(&[])
            .i32(0)
            .u8(0);
        for _ in 0..10 {
            w = w.i32(0);
        }
        w.i32(99000)
            .u8(0)
            .i32(0)
            .string("")
            .u8(0)
            .u8(0)
            .i32(22)
            .u8(1)
            .u8(0)
            .i32(0)
            .u8(0)
            .build()
    }

    #[test]
    fn players_of_apk_1_1_0_and_of_1_0_3_both_read() {
        let mut p = vec![0, 2];
        p.extend(record("Moi", true));
        p.extend(record("Cu", false));
        let names: Vec<_> = players_snapshot(&p)
            .unwrap()
            .into_iter()
            .map(|p| (p.name, p.x))
            .collect();
        assert_eq!(names, [("Moi".to_string(), 1407), ("Cu".to_string(), 1407)]);
    }

    #[test]
    fn a_status_of_mode_2_with_its_more_flag_brings_an_i32_after_it() {
        // record() ends with a status of the short form (11 bytes): mode 2 instead, without effects and with the i32 of
        // game 1.1.1 after the flag, then one with an effect and the flag 0.
        let status = |more: bool| {
            let w = Writer::new().i32(22).u8(2);
            match more {
                true => w.u8(0).u8(1).i32(9288).build(),
                false => w.u8(1).u8(1).i32(9301).u8(1).u8(0).build(),
            }
        };
        let mut p = vec![0, 2];
        for (name, more) in [("Moi", true), ("Cu", false)] {
            let mut r = record(name, true);
            r.truncate(r.len() - 11);
            r.extend(status(more));
            p.extend(r);
        }
        let names: Vec<_> = players_snapshot(&p)
            .unwrap()
            .into_iter()
            .map(|p| p.name)
            .collect();
        assert_eq!(names, ["Moi", "Cu"]);
    }

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

    /// A mob of s2c/43 for a client of protocol 0.0.2, or of 0.0.7 with its 9 more bytes (VG1, 20/11).
    fn mob(w: Writer, id: &str, extended: bool) -> Writer {
        let w = w
            .string(id)
            .string("Heo Mọi")
            .i32(7)
            .u8(2)
            .i32(3)
            .i32(1)
            .u8(0);
        match extended {
            true => w.u8(1).i32(1).u8(0).u8(42).u8(0).u8(20),
            false => w,
        }
    }

    #[test]
    fn s2c_43_1177_and_39_read_the_layouts_of_protocol_0_0_7_and_0_0_2() {
        for extended in [false, true] {
            let w = mob(
                mob(Writer::new().string("M1").u8(3), "mob2814", extended),
                "mob2914",
                extended,
            );
            let e = map_entities(&w.build()).unwrap();
            let tile = extended.then_some([42, 20]);
            assert_eq!(
                e.mobs
                    .iter()
                    .map(|m| (m.id.as_str(), m.tile))
                    .collect::<Vec<_>>(),
                [("mob2814", tile), ("mob2914", tile)]
            );
            let b = mob(Writer::new().string("M1").u8(0), "mob1", false)
                .u8(1)
                .i32(38)
                .i32(6);
            let b = match extended {
                true => b.u8(7).i32(85),
                false => b,
            }
            .build();
            let boss = map_boss(&b).unwrap();
            assert_eq!(
                (boss.mob.unwrap().id, boss.tile),
                ("mob1".to_string(), Some([38, 6]))
            );
            let mut q = Writer::new()
                .i32(2)
                .string("Trở Về Thanh Khê")
                .string("")
                .string("main")
                .i32(0)
                .i32(0)
                .i32(2);
            // A kind 0 step (7 bytes) and a talk (11 bytes), as quest 3 of the bot's 0.0.7 login (20/11).
            let extras: [&[u8]; 2] = [
                &[0, 0xff, 0xff, 0xff, 0xff, 0, 0],
                &[1, 0, 0, 0, 0x66, 0, 1, 0, 0, 0, 0],
            ];
            for (i, npc) in [(0, -1), (1, 102)] {
                q = q.i32(i).string("Bước").i32(npc).i32(1).i32(npc);
                if extended {
                    for &b in extras[i as usize] {
                        q = q.u8(b);
                    }
                }
            }
            let quest = quest_data(&q.build()).unwrap();
            let hex = |i: usize| {
                extended.then(|| {
                    extras[i]
                        .iter()
                        .map(|b| format!("{b:02x}"))
                        .collect::<String>()
                })
            };
            assert_eq!(
                quest
                    .steps
                    .iter()
                    .map(|s| (s.npc_id, s.extra.clone()))
                    .collect::<Vec<_>>(),
                [(-1, hex(0)), (102, hex(1))]
            );
        }
    }

    /// The captcha of LG1 (25/11): a challenge of 60 s and 3 tries with its PNG, then the verdict, byte for byte.
    #[test]
    fn captcha_challenge_and_verdict() {
        let png = [0x89, b'P', b'N', b'G', 13, 10, 26, 10];
        let challenge: Vec<u8> = [0u8, 0x90, 0x7a, 0x33, 0x2a, 0x00, 0x3c, 0x03]
            .into_iter()
            .chain(Writer::new().bytes(&png).build())
            .collect();
        assert_eq!(
            captcha(&challenge).unwrap(),
            Captcha::Challenge {
                id: 0x907a332a_u32 as i32,
                seconds: 60,
                tries: 3,
                png: png.to_vec()
            }
        );
        let verdict = hex("01907a332a00000000001858c3a163206e68e1baad6e207468c3a06e682063c3b46e67");
        assert_eq!(
            captcha(&verdict).unwrap(),
            Captcha::Verdict {
                id: 0x907a332a_u32 as i32,
                result: 0,
                text: "Xác nhận thành công".into()
            }
        );
        assert!(captcha(&challenge[..challenge.len() - 1]).is_err());
    }

    fn hex(s: &str) -> Vec<u8> {
        (0..s.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
            .collect()
    }
}
