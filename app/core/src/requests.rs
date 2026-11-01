//! Port of buildRequest() of src/protocol/events.ts: the payload of every request the app sends.
use crate::battle::Move;
use crate::opcodes::{PLATFORM, PROTOCOL_VERSION, SERVER_ID};
use crate::protocol::{err, login_payload, password_proof, Result, Writer};

/// Fields a request may need, as RequestContext of src/protocol/events.ts.
#[derive(Default, Clone)]
pub struct Ctx<'a> {
    pub username: Option<&'a str>,
    pub password: Option<&'a str>,
    pub challenge: Option<&'a [u8]>,
    pub server_id: Option<i32>,
    pub character_name: Option<&'a str>,
    pub map_id: Option<&'a str>,
    pub npc_id: Option<i32>,
    pub mob_id: Option<&'a str>,
    pub battle_uuid: Option<&'a str>,
    pub seq: Option<i32>,
    pub skill: Option<i32>,
    pub mv: Option<Move>,
    pub stat: Option<i32>,
    pub amount: Option<i32>,
    /// The character's element, field01 of s2c/9 (1 Hỏa, 2 Lôi, 4 Thủy): c2s/30 asks for the skill tree of that element.
    pub element: Option<i32>,
    /// The zone of c2s/1173, and of c2s/11 after a zone change (s2c/13 with the zone).
    pub zone: Option<i32>,
    pub skill_id: Option<i32>,
    /// Bag or gear slot of c2s/1186, c2s/84, c2s/48; `action` 0 equip (a bag slot), 1 unequip (a gear slot); `place` is
    /// `where` of TS, 0 for the gear.
    pub slot: Option<i32>,
    pub action: Option<i32>,
    pub place: Option<i32>,
    /// The line of an NPC menu that c2s/57 picks (s2c/57).
    pub option: Option<i32>,
    /// The shop line of c2s/1190 (s2c/1190), and how many.
    pub shop_id: Option<i32>,
    pub quantity: Option<i32>,
    /// uuid of an item on the ground (s2c/1182, s2c/1184) for c2s/1188.
    pub uuid: Option<&'a str>,
}

fn required<T>(v: Option<T>, name: &str) -> Result<T> {
    match v {
        Some(v) => Ok(v),
        None => err("REQUEST", format!("Missing request field: {name}")),
    }
}

pub fn build(opcode: i32, c: &Ctx) -> Result<Vec<u8>> {
    let w = Writer::new();
    Ok(match opcode {
        -1 | 1 | 2 | 3 | 1172 | 1257 => w.build(),
        1206 => w.string(PLATFORM).string(PROTOCOL_VERSION).i32(0).build(),
        5 => w
            .i32(c.server_id.unwrap_or(SERVER_ID))
            .i32(-1)
            .u8(1)
            .build(),
        4 => login_payload(
            required(c.username, "username")?,
            &password_proof(
                required(c.challenge, "challenge")?,
                required(c.password, "password")?,
            )?,
            c.server_id.unwrap_or(SERVER_ID),
        ),
        9 => w
            .string(&required(c.username, "username")?.to_lowercase())
            .u8(2)
            .i32(-1)
            .build(),
        // The app sends the element of s2c/9 (sqlq.e49(1) for manina, Hỏa); with 4 the server sends the Thủy tree.
        30 => w.u8(c.element.unwrap_or(1) as u8).build(),
        42 | 29 => w
            .string(required(c.character_name, "characterName")?)
            .build(),
        // After a zone change the app asks the map of that zone: (zone, 0) instead of (-1, -1) (B2).
        11 => w
            .string(required(c.map_id, "mapId")?)
            .u8(c.zone.map_or(0xff, |z| z as u8))
            .i32(if c.zone.is_some() { 0 } else { -1 })
            .build(),
        1173 => w.u8(required(c.zone, "zone")? as u8).build(),
        43 => w.string(required(c.map_id, "mapId")?).build(),
        13 => w
            .string(required(c.map_id, "mapId")?)
            .i32(required(c.npc_id, "npcId")?)
            .build(),
        10 => w
            .i32(required(c.stat, "stat")?)
            .i32(required(c.amount, "amount")?)
            .build(),
        1191 => w
            .i32(required(c.skill_id, "skillId")?)
            .i32(required(c.amount, "amount")?)
            .build(),
        // Chi tiết vật phẩm (P4): Trang bị / Cởi ra sqlq.b45(action, slot), Sử dụng sqlq.i79(slot), Sửa chữa
        // sqlq.c47(where, slot).
        1186 => w
            .u8(required(c.action, "action")? as u8)
            .i32(required(c.slot, "slot")?)
            .build(),
        84 => w.i32(required(c.slot, "slot")?).build(),
        57 => w
            .u8(required(c.option, "option")? as u8)
            .string(required(c.map_id, "mapId")?)
            .i32(required(c.npc_id, "npcId")?)
            .build(),
        1190 => w
            .u8(0)
            .i32(required(c.shop_id, "shopId")?)
            .i32(c.quantity.unwrap_or(1))
            .build(),
        // Pháp sư (J1, J3): put the item of a bag slot in the open window, then Bắt đầu (npc::put_request, start_request).
        97 => w
            .string("")
            .u8(0)
            .i32(0)
            .i32(required(c.slot, "slot")?)
            .i32(c.quantity.unwrap_or(1))
            .build(),
        91 => w.string("").build(),
        48 => w
            .u8(c.place.unwrap_or(0) as u8)
            .i32(required(c.slot, "slot")?)
            .build(),
        15 => w.string(required(c.mob_id, "mobId")?).u8(0).build(),
        1188 => w.string(required(c.uuid, "uuid")?).build(),
        1178 => w.string(required(c.mob_id, "mobId")?).i32(0).build(),
        1181 => w
            .string(required(c.mob_id, "mobId")?)
            .i32(0)
            .i32(required(c.npc_id, "npcId")?)
            .build(),
        18 | 40 => w.string(required(c.battle_uuid, "battleUuid")?).build(),
        14 => w
            .string(required(c.battle_uuid, "battleUuid")?)
            .i32(required(c.seq, "seq")?)
            .build(),
        20 => w
            .string(required(c.battle_uuid, "battleUuid")?)
            .i32(required(c.seq, "seq")?)
            .i32(required(c.skill, "skill")?)
            .build(),
        // An item of the bag used in battle (P5): Túi đồ in the battle, then the item, sqlq.g76(slot, 0).
        44 => w
            .string(required(c.battle_uuid, "battleUuid")?)
            .i32(0)
            .i32(required(c.slot, "slot")?)
            .build(),
        19 => {
            let m = required(c.mv, "move")?;
            w.string(required(c.battle_uuid, "battleUuid")?)
                .i32(required(c.seq, "seq")?)
                .i32(m.from.0 + 2)
                .i32(m.from.1 + 2)
                .i32(m.to.0 + 2)
                .i32(m.to.1 + 2)
                .build()
        }
        _ => {
            return err(
                "REQUEST",
                format!("Outgoing event {opcode} is not implemented"),
            )
        }
    })
}
