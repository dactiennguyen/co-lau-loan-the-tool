//! Port of buildRequest() of src/events.ts: the payload of every request the app sends.
use crate::battle::Move;
use crate::opcodes::{PLATFORM, PROTOCOL_VERSION, SERVER_ID};
use crate::protocol::{err, login_payload, password_proof, Result, Writer};

/// Fields a request may need, as RequestContext of src/events.ts.
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
        -1 | 1 | 2 | 3 | 1172 => w.build(),
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
        30 => w.u8(1).build(),
        42 | 29 => w
            .string(required(c.character_name, "characterName")?)
            .build(),
        11 => w
            .string(required(c.map_id, "mapId")?)
            .u8(0xff)
            .i32(-1)
            .build(),
        43 => w.string(required(c.map_id, "mapId")?).build(),
        13 => w
            .string(required(c.map_id, "mapId")?)
            .i32(required(c.npc_id, "npcId")?)
            .build(),
        15 => w.string(required(c.mob_id, "mobId")?).u8(0).build(),
        1178 => w.string(required(c.mob_id, "mobId")?).i32(0).build(),
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
