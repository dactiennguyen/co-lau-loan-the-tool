//! Bag, gear and money (docs/app/events/12-skills-items.md#túi-đồ, 04-push.md#s2c-46): the item record of src/protocol/world.ts
//! with the bag of s2c/42 and s2c/1187, the 8 gear slots at the end of s2c/9 and the currencies of s2c/46; and the
//! game's item table of data/items.json (src/protocol/items.ts), built into the binary, for names, icons and stat texts.
use crate::protocol::{character_profile_end, Reader, Result};
use crate::skills::skill_list;
use crate::world::appearance;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ItemStat {
    pub stat: i32,
    pub value: i32,
}

/// One item of the bag, a gear slot or the ground (itemRecord of src/protocol/world.ts). `durability` is -1 for items without
/// one; `element` 1 Hỏa, 2 Lôi, 4 Thủy, 0xff for plain items; the fields are not understood.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemRecord {
    pub slot: u8,
    pub item_id: i32,
    pub uuid: String,
    pub field0: i32,
    pub durability: i32,
    pub quantity: i32,
    pub field1: u8,
    pub element: u8,
    pub field2: i32,
    pub field3: u8,
    pub field4: u8,
    pub stats: Vec<ItemStat>,
}
pub fn item_record(r: &mut Reader) -> Result<ItemRecord> {
    let (slot, item_id, uuid) = (r.u8()?, r.i32()?, r.string()?);
    let (field0, durability, quantity) = (r.i32()?, r.i32()?, r.i32()?);
    let (field1, element, field2, field3, field4) = (r.u8()?, r.u8()?, r.i32()?, r.u8()?, r.u8()?);
    let stats = (0..r.u8()?)
        .map(|_| {
            Ok(ItemStat {
                stat: r.i32()?,
                value: r.i32()?,
            })
        })
        .collect::<Result<_>>()?;
    Ok(ItemRecord {
        slot,
        item_id,
        uuid,
        field0,
        durability,
        quantity,
        field1,
        element,
        field2,
        field3,
        field4,
        stats,
    })
}

/// The whole bag: `kind` 1 in s2c/1187, 2 in s2c/42; `capacity` the usable slots (42 of the 50 on the phone).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Bag {
    pub kind: u8,
    pub capacity: i32,
    pub items: Vec<ItemRecord>,
}
fn bag(r: &mut Reader) -> Result<Bag> {
    let kind = r.u8()?;
    // Kind 4 (O1, Chế tạo trang bị at Pháp sư): one item record, the item just added; the rest of the bag is unchanged.
    if kind == BAG_ADD {
        return Ok(Bag {
            kind,
            capacity: -1,
            items: vec![item_record(r)?],
        });
    }
    let capacity = r.i32()?;
    let n = r.i32()?.max(0);
    let items = (0..n).map(|_| item_record(r)).collect::<Result<_>>()?;
    Ok(Bag {
        kind,
        capacity,
        items,
    })
}
/// The first byte of s2c/1187 when it carries one item added to the bag, not the whole bag (12-skills-items.md#túi-đồ).
pub const BAG_ADD: u8 = 4;
/// `bag` after the s2c/1187 `update`: kind 4 puts its one item in its slot, the other kinds are the whole bag (bagAfter
/// of src/protocol/world.ts). Kind 4 before any bag is known leaves it unknown: the next whole bag brings it.
pub fn bag_after(bag: Option<Bag>, update: Bag) -> Option<Bag> {
    match (bag, update.kind) {
        (Some(mut b), BAG_ADD) => {
            for item in update.items {
                b.items.retain(|i| i.slot != item.slot);
                b.items.push(item);
            }
            Some(b)
        }
        (None, BAG_ADD) => None,
        (_, _) => Some(update),
    }
}
/// s2c/1187, whenever the bag changes (rewards, repair): the whole bag again; kind 4, the one item added.
pub fn inventory(p: &[u8]) -> Result<Bag> {
    let mut r = Reader::new(p);
    let b = bag(&mut r)?;
    r.finish(b, "s2c/1187")
}

/// s2c/42 answering c2s/42 at login: a label ("test dong 1"), two unknown ints (42, 3), then the bag.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CharacterExtra {
    pub label: String,
    pub fields: [i32; 2],
    #[serde(flatten)]
    pub bag: Bag,
}
pub fn character_extra(p: &[u8]) -> Result<CharacterExtra> {
    let mut r = Reader::new(p);
    let (label, fields) = (r.string()?, [r.i32()?, r.i32()?]);
    let bag = bag(&mut r)?;
    r.finish(CharacterExtra { label, fields, bag }, "s2c/42")
}

/// The 8 gear slots after the skill list of s2c/9: None for an empty slot (0xff), else the item, whose `slot` is the
/// slot index (0 hat and 2 weapon measured; the others follow the item type, 12-skills-items.md#ô-trang-bị).
pub fn character_gear(p: &[u8]) -> Result<Vec<Option<ItemRecord>>> {
    let mut r = Reader::new(p);
    r.take(character_profile_end(p)?)?;
    skill_list(&mut r)?;
    gear_slots(&mut r)
}
/// A timed effect of the s2c/9 tail. "ef7" at rate 200000 is the x2 EXP star of the item Tăng Kinh Nghiệm (7), the rate
/// in 1/100000; `remaining_ms` runs down offline too (12-skills-items.md#x2-exp).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Effect {
    pub key: String,
    pub rate: i32,
    pub field: i32,
    pub remaining_ms: i32,
}

/// What follows the 8 gear slots of s2c/9 (characterTail of src/protocol/world.ts): an int (1 for symap, 0 for manina),
/// the appearance block, the timed effects, then the faction ("sứ quân") as in a player record.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CharacterTail {
    pub field: i32,
    pub appearance_bytes: usize,
    pub effects: Vec<Effect>,
    pub faction_field: i32,
    pub faction: String,
    pub faction_flags: [u8; 2],
}
pub fn character_tail(p: &[u8]) -> Result<CharacterTail> {
    let mut r = Reader::new(p);
    r.take(character_profile_end(p)?)?;
    skill_list(&mut r)?;
    gear_slots(&mut r)?;
    let field = r.i32()?;
    let appearance_bytes = appearance(&mut r)?;
    let effects = (0..r.i32()?.max(0))
        .map(|_| {
            Ok(Effect {
                key: r.string()?,
                rate: r.i32()?,
                field: r.i32()?,
                remaining_ms: r.i32()?,
            })
        })
        .collect::<Result<_>>()?;
    let (faction_field, faction) = (r.i32()?, r.string()?);
    let faction_flags = [r.u8()?, r.u8()?];
    let tail = CharacterTail {
        field,
        appearance_bytes,
        effects,
        faction_field,
        faction,
        faction_flags,
    };
    r.finish(tail, "s2c/9")
}

/// `i32 n; n × (u8 0xff for an empty slot | item record)`, at the end of s2c/9 and in s2c/37.
fn gear_slots(r: &mut Reader) -> Result<Vec<Option<ItemRecord>>> {
    (0..r.i32()?.max(0))
        .map(|_| {
            if r.data.get(r.offset) == Some(&0xff) {
                r.u8()?;
                Ok(None)
            } else {
                item_record(r).map(Some)
            }
        })
        .collect()
}

/// s2c/37 after c2s/1186 (equip or unequip): the 8 gear slots again, as at the end of s2c/9.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct GearUpdate {
    pub field: i32,
    pub flag: u8,
    pub name: String,
    pub gear: Vec<Option<ItemRecord>>,
}
pub fn gear_update(p: &[u8]) -> Result<GearUpdate> {
    let mut r = Reader::new(p);
    let (field, flag, name) = (r.i32()?, r.u8()?, r.string()?);
    let gear = gear_slots(&mut r)?;
    r.finish(
        GearUpdate {
            field,
            flag,
            name,
            gear,
        },
        "s2c/37",
    )
}

/// s2c/36 at the end of every battle, and after Đầu hàng: the durability of the 8 gear slots in the order of s2c/9, None
/// for an empty slot (0xff), else after the slot byte (gearDurability of src/protocol/world.ts, 05-battle.md#s2c-36).
pub fn gear_durability(p: &[u8]) -> Result<Vec<Option<i32>>> {
    let mut r = Reader::new(p);
    let slots = (0..r.i32()?.max(0))
        .map(|_| match r.u8()? {
            0xff => Ok(None),
            _ => r.i32().map(Some),
        })
        .collect::<Result<_>>()?;
    r.finish(slots, "s2c/36")
}

/// s2c/1182: an item that fell on the ground of the map (13-drops-items.md#đồ-trên-đất), anyone's: the item record (slot
/// byte 0xfe), where it lies and when it expires (ms since 1970, about 600 s on). Own drops come with the end of a won
/// battle; c2s/1188 with its uuid picks it up from anywhere in the map.
#[derive(Debug, Clone, PartialEq)]
pub struct GroundItem {
    pub map_id: String,
    pub item: ItemRecord,
    pub x: i32,
    pub y: i32,
    pub expires_at: i64,
}
pub fn ground_item_add(p: &[u8]) -> Result<GroundItem> {
    let mut r = Reader::new(p);
    let (map_id, item) = (r.string()?, item_record(&mut r)?);
    let (x, y) = (r.i32()?, r.i32()?);
    let expires_at = i64::from_be_bytes(r.take(8)?.try_into().unwrap());
    r.finish(
        GroundItem {
            map_id,
            item,
            x,
            y,
            expires_at,
        },
        "s2c/1182",
    )
}
/// s2c/1183: an item left the ground of a map, picked up or expired: (map id, uuid).
pub fn ground_item_remove(p: &[u8]) -> Result<(String, String)> {
    let mut r = Reader::new(p);
    let gone = (r.string()?, r.string()?);
    r.finish(gone, "s2c/1183")
}
/// s2c/51 after an item picked up went to the bag (K3): i32 -1; i32 0; u8 1; the item record of the bag slot that holds it.
/// No s2c/1187 comes then.
pub fn bag_slot(p: &[u8]) -> Result<ItemRecord> {
    let mut r = Reader::new(p);
    r.take(9)?;
    let item = item_record(&mut r)?;
    r.finish(item, "s2c/51")
}

/// s2c/46 after s2c/9 and whenever money changes: Xu, Xu khoá and Lượng as on the Bản thân panel. Vàng is `coin` of
/// s2c/9 and s2c/10 kind 4.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Currencies {
    pub label: String,
    pub xu: i64,
    pub xu_khoa: i64,
    pub luong: i64,
}
pub fn currencies(p: &[u8]) -> Result<Currencies> {
    let mut r = Reader::new(p);
    let label = r.string()?;
    let mut i64 = || r.take(8).map(|b| i64::from_be_bytes(b.try_into().unwrap()));
    let (xu, xu_khoa, luong) = (i64()?, i64()?, i64()?);
    r.finish(
        Currencies {
            label,
            xu,
            xu_khoa,
            luong,
        },
        "s2c/46",
    )
}

/// One item of the game's table `it1` (ItemDef of src/protocol/items.ts): `kind` the type (0 hat … 29 egg), `icon` the file
/// data/icons/i<icon>.webp, `level` the level to wear it, `stack` how many fit in one slot, `durability` the most.
#[derive(Debug, Clone, Deserialize)]
pub struct ItemDef {
    pub id: i32,
    pub name: String,
    pub desc: String,
    #[serde(rename = "type")]
    pub kind: u8,
    pub icon: i32,
    pub level: u8,
    /// Who can wear it (GENDER_*): two items of one name often differ only here (Giáp Tiên Phong 149 nam, 200 nữ), and
    /// a drop may be the other one; the server refuses it with "Trang bị không phù hợp" (12-skills-items.md).
    #[serde(default = "both")]
    pub gender: u8,
    pub stack: i32,
    pub durability: i32,
}
fn both() -> u8 {
    GENDER_BOTH
}

/// `gender` of the item table, and of the character (flag2 of s2c/9): đồ nam, đồ nữ (Áo Thiếu Nữ, Mão Âu Cơ), and what
/// both wear (weapons, rings, everything that is no gear).
pub const GENDER_MALE: u8 = 0;
pub const GENDER_FEMALE: u8 = 1;
pub const GENDER_BOTH: u8 = 2;
/// "nam", "nữ".
pub fn gender_word(gender: u8) -> &'static str {
    match gender {
        GENDER_MALE => "nam",
        GENDER_FEMALE => "nữ",
        _ => "nam nữ",
    }
}
/// Why a character of `character` gender cannot wear an item of `item` gender ("đồ nữ, nhân vật là nam"); None when it
/// can, or when the character's gender is not known yet.
pub fn misfit(item: u8, character: Option<u8>) -> Option<String> {
    let c = character.filter(|&c| c != GENDER_BOTH)?;
    (item != GENDER_BOTH && item != c)
        .then(|| format!("đồ {}, nhân vật là {}", gender_word(item), gender_word(c)))
}

/// data/items.json: the item table, the stat templates of `it0` ("#" is the value), and names of types and elements.
#[derive(Debug, Deserialize)]
pub struct ItemBook {
    pub version: i32,
    pub types: HashMap<String, String>,
    pub elements: HashMap<String, String>,
    pub stats: HashMap<String, String>,
    items: Vec<ItemDef>,
    #[serde(skip)]
    by_id: HashMap<i32, usize>,
}
impl ItemBook {
    pub fn parse(json: &str) -> serde_json::Result<Self> {
        let mut book: Self = serde_json::from_str(json)?;
        book.by_id = book
            .items
            .iter()
            .enumerate()
            .map(|(i, d)| (d.id, i))
            .collect();
        Ok(book)
    }
    pub fn get(&self, id: i32) -> Option<&ItemDef> {
        self.by_id.get(&id).map(|&i| &self.items[i])
    }
    /// The id of the material (it1 type 22) named so, the last of that name as the TS side's Map keeps it (the materials
    /// of Chế tạo trang bị: "Quặng Bậc 1" is 598).
    pub fn material(&self, name: &str) -> Option<i32> {
        self.items
            .iter()
            .rev()
            .find(|d| d.kind == 22 && d.name == name)
            .map(|d| d.id)
    }
    /// "+4 phòng thủ", "+1% chí mạng"; "code: value" for a code the table has no text for.
    pub fn stat(&self, s: &ItemStat) -> String {
        match self
            .stats
            .get(&s.stat.to_string())
            .filter(|t| !t.is_empty())
        {
            Some(t) => format!("+{}", t.replacen('#', &s.value.to_string(), 1)),
            None => format!("{}: {}", s.stat, s.value),
        }
    }
    /// The name of a stat code without its value: "sức tấn công" for "# sức tấn công", "chí mạng" for "#% chí mạng".
    pub fn stat_name(&self, stat: i32) -> String {
        match self.stats.get(&stat.to_string()).filter(|t| !t.is_empty()) {
            Some(t) => t
                .trim_start_matches('#')
                .trim_start_matches('%')
                .trim()
                .to_string(),
            None => format!("chỉ số {stat}"),
        }
    }
    pub fn type_name(&self, kind: u8) -> Option<&str> {
        self.types.get(&kind.to_string()).map(String::as_str)
    }
    pub fn element_name(&self, element: u8) -> Option<&str> {
        self.elements.get(&element.to_string()).map(String::as_str)
    }
}

/// The table of data/items.json as built into the binary (`npm run items` rebuilds the file).
pub fn book() -> &'static ItemBook {
    static BOOK: OnceLock<ItemBook> = OnceLock::new();
    BOOK.get_or_init(|| {
        ItemBook::parse(include_str!("../../../data/items.json")).expect("data/items.json reads")
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_built_in_table_names_items_and_writes_stats_as_the_game() {
        let b = book();
        assert_eq!(b.items.len(), 646);
        let hat = b.get(54).unwrap();
        assert_eq!(
            (hat.name.as_str(), hat.kind, hat.icon, hat.durability),
            ("Nón Âu Lạc", 0, 48, 60)
        );
        assert_eq!(b.get(0).unwrap().name, "Hoàn Linh Dược");
        assert_eq!(b.stat(&ItemStat { stat: 6, value: 4 }), "+4 phòng thủ");
        assert_eq!(b.stat(&ItemStat { stat: 8, value: 1 }), "+1% chí mạng");
        assert_eq!(b.stat(&ItemStat { stat: 99, value: 3 }), "99: 3");
        assert_eq!(
            (b.type_name(2), b.element_name(2)),
            (Some("Vũ khí"), Some("Lôi"))
        );
        assert!(b.get(9999).is_none());
    }
}
