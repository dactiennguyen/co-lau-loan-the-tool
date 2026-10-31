//! Bag, gear and money (docs/app/events/12-skills-items.md#túi-đồ, 04-push.md#s2c-46): the item record of src/world.ts
//! with the bag of s2c/42 and s2c/1187, the 8 gear slots at the end of s2c/9 and the currencies of s2c/46; and the
//! game's item table of data/items.json (src/items.ts), built into the binary, for names, icons and stat texts.
use crate::protocol::{character_profile_end, Reader, Result};
use crate::skills::skill_list;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::OnceLock;

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ItemStat {
    pub stat: i32,
    pub value: i32,
}

/// One item of the bag, a gear slot or the ground (itemRecord of src/world.ts). `durability` is -1 for items without
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
    let (kind, capacity) = (r.u8()?, r.i32()?);
    let n = r.i32()?.max(0);
    let items = (0..n).map(|_| item_record(r)).collect::<Result<_>>()?;
    Ok(Bag {
        kind,
        capacity,
        items,
    })
}
/// s2c/1187, whenever the bag changes (rewards, repair): the whole bag again.
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
    (0..r.i32()?.max(0))
        .map(|_| {
            if r.data.get(r.offset) == Some(&0xff) {
                r.u8()?;
                Ok(None)
            } else {
                item_record(&mut r).map(Some)
            }
        })
        .collect()
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

/// One item of the game's table `it1` (ItemDef of src/items.ts): `kind` the type (0 hat … 29 egg), `icon` the file
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
    pub stack: i32,
    pub durability: i32,
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
