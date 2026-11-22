//! Port of buildRequest() of src/protocol/events.ts: the payload of every request the app sends.
use crate::battle::Move;
use crate::opcodes::{PLATFORM, SERVER_ID};
use crate::protocol::{err, login_payload, password_proof, protocol_version, Result, Writer};

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
    /// The u8 after the mob of c2s/15: 1 as the game 1.1.1 sends it for every challenge by the attack button (22/11),
    /// Bạch Hổ Thống Lĩnh too (BH2, 17-bach-ho.md); 0 was a mob touched in the game 1.0.3 (B1). None is 1.
    pub challenge_flag: Option<u8>,
    pub battle_uuid: Option<&'a str>,
    pub seq: Option<i32>,
    pub skill: Option<i32>,
    pub mv: Option<Move>,
    pub stat: Option<i32>,
    pub amount: Option<i32>,
    /// The character's element, field01 of s2c/9 (1 Hỏa, 2 Lôi, 4 Thủy): c2s/30 asks for the skill tree of that element.
    pub element: Option<i32>,
    /// The zone of c2s/1173, and of c2s/11: the new one after a zone change, the one stood in after a battle or Đầu hàng;
    /// None (0xff) after a portal and at login.
    pub zone: Option<i32>,
    /// The i32 of c2s/11: the map's index (s2c/29, s2c/13) once that map was loaded in this session (world::MapLoads);
    /// None is -1, the first load.
    pub map_index: Option<i32>,
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
    /// A gift code of c2s/1223, already as the client sends it (mail::normalize_code).
    pub code: Option<&'a str>,
    /// The mail of c2s/1216 (open), c2s/1217 (Nhận), c2s/1219 (Xóa): its id in s2c/1215.
    pub mail_id: Option<i64>,
    /// Chợ trời: the tab (0–8 of s2c/116, -1 for Đang bán) and page (from 1) of c2s/1192; the price of Đăng bán (c2s/112
    /// kind 1, with `slot` and `quantity`). Mua (c2s/115), Thu hồi (c2s/113) and Gia hạn (c2s/112 kind 2) take `uuid`.
    pub tab: Option<i32>,
    pub page: Option<i32>,
    pub price: Option<i64>,
    /// The third field of c2s/97: npc::PUT_ITEM (gear, stones) or npc::PUT_STACK (Bùa bảo vệ, materials of Chế tạo).
    pub put_kind: Option<i32>,
    /// Phúc lợi (welfare.rs): the key of c2s/1236 and c2s/1239; the event of c2s/1232 and c2s/1233, and the milestone of
    /// c2s/1232 (0 for Điểm danh).
    pub key: Option<&'a str>,
    pub event: Option<i64>,
    pub milestone: Option<i64>,
}

fn required<T>(v: Option<T>, name: &str) -> Result<T> {
    match v {
        Some(v) => Ok(v),
        None => err("REQUEST", format!("Missing request field: {name}")),
    }
}

/// The log line of a request that could not be built (a field missing: a bug of the bot, not of the server). The bot
/// skips that request and goes on rather than lose the session; the line is a fault (net/trace.rs is_fault), so Log lỗi
/// keeps the packets around it.
pub fn unbuilt(opcode: i32, why: &impl std::fmt::Display) -> String {
    format!("Lỗi của bot: không dựng được gói c2s/{opcode} ({why}), bỏ qua gói này")
}

pub fn build(opcode: i32, c: &Ctx) -> Result<Vec<u8>> {
    let w = Writer::new();
    Ok(match opcode {
        // c2s/1215 asks for the mailbox, c2s/1218 is Nhận hết. c2s/1221 (Xóa hết) has no arm: it deletes the gifts not
        // taken too (mail::DELETE_ALL).
        // 1275: Kết quả Bạch Hổ (17-bach-ho.md#đọc-tĩnh-110).
        -1 | 1 | 2 | 3 | 1172 | 1257 | 1215 | 1218 | 116 | 1275 => w.build(),
        1206 => w.string(PLATFORM).string(protocol_version()).i32(0).build(),
        // A clean phone: no adb (USB or Wi-Fi), developer options off, no accessibility service (02-login.md#c2s-1282).
        1282 => w.u8(0).u8(0).u8(0).build(),
        // Command 0 of c2s/1284: the chat block list, asked for right before c2s/9 as the game does (VG1).
        1284 => w.u8(0).build(),
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
        // Bản đồ thế giới: "M99" with (0, -1) (08-server-map-zone.md#c2s11-m99--s2c11; LN1).
        11 if c.map_id == Some("M99") => w.string("M99").u8(0).i32(-1).build(),
        // The zone: 0xff after a portal and at login, the new zone after a zone change, the zone stood in after a battle or
        // Đầu hàng; the map's index once loaded in this session, -1 the first time (06-map-mobs.md#c2s-11, game 1.1.1).
        11 => w
            .string(required(c.map_id, "mapId")?)
            .u8(c.zone.map_or(0xff, |z| z as u8))
            .i32(c.map_index.unwrap_or(-1))
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
            .i32(c.put_kind.unwrap_or(0))
            .i32(required(c.slot, "slot")?)
            .i32(c.quantity.unwrap_or(1))
            .build(),
        91 => w.string("").build(),
        48 => w
            .u8(c.place.unwrap_or(0) as u8)
            .i32(required(c.slot, "slot")?)
            .build(),
        15 => w
            .string(required(c.mob_id, "mobId")?)
            .u8(c.challenge_flag.unwrap_or(1))
            .build(),
        1188 => w.string(required(c.uuid, "uuid")?).build(),
        // Mã quà tặng (G1): the code alone, from anywhere in the world.
        1223 => w.string(required(c.code, "code")?).build(),
        // Hòm thư (G1): open, Nhận and Xóa of one mail.
        1216 | 1217 | 1219 => w.i64(required(c.mail_id, "mailId")?).build(),
        // Phúc lợi (PL1): an event's definition and progress by its key, Điểm danh (or a milestone of the month), and
        // every milestone reached of Quà online or Quà thăng cấp.
        1236 | 1239 => w.string(required(c.key, "key")?).build(),
        1232 => w
            .i64(required(c.event, "event")?)
            .i64(c.milestone.unwrap_or(0))
            .build(),
        1233 => w.i64(required(c.event, "event")?).build(),
        // Chợ trời (CT1, NP1): a page, Mua and Thu hồi by the listing's uuid; c2s/112 is Gia hạn (kind 2) with a uuid,
        // else Đăng bán (kind 1) of a bag slot.
        1192 => w
            .u8(0)
            .i32(required(c.tab, "tab")?)
            .i32(c.page.unwrap_or(1))
            .build(),
        115 | 113 => w.string(required(c.uuid, "uuid")?).build(),
        112 => match c.uuid {
            Some(uuid) => w.u8(2).string(uuid).build(),
            None => w
                .u8(1)
                .i32(required(c.slot, "slot")?)
                .i32(c.quantity.unwrap_or(1))
                .i64(required(c.price, "price")?)
                .build(),
        },
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_request_missing_a_field_is_a_fault_line_not_a_panic() {
        let e = build(57, &Ctx::default()).unwrap_err();
        let line = unbuilt(57, &e);
        assert!(
            line.starts_with("Lỗi của bot: không dựng được gói c2s/57 ("),
            "{line}"
        );
        assert!(line.ends_with("), bỏ qua gói này"), "{line}");
        assert!(crate::net::is_fault(&line));
    }
}
