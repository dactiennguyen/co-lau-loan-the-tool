//! Port of src/protocol/protocol.ts (docs/app/protocol.md): frames, XOR stream, handshake, session key, password proof, login
//! payload, and the prefixes of s2c/9, s2c/29, s2c/11 that the login flow reads.
use crate::opcodes::{OPCODES, PLATFORM, PROTOCOL_VERSION};
use std::collections::HashMap;
use std::sync::OnceLock;

pub const MAX_FRAME: usize = 16 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq)]
pub struct ProtocolError {
    pub code: &'static str,
    pub message: String,
}
impl std::fmt::Display for ProtocolError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}
impl std::error::Error for ProtocolError {}
pub type Result<T> = std::result::Result<T, ProtocolError>;
pub fn err<T>(code: &'static str, message: impl Into<String>) -> Result<T> {
    Err(ProtocolError {
        code,
        message: message.into(),
    })
}

/// (opcode → int32 on the wire, int32 on the wire → opcode)
fn tables() -> &'static (HashMap<i32, i32>, HashMap<i32, i32>) {
    static T: OnceLock<(HashMap<i32, i32>, HashMap<i32, i32>)> = OnceLock::new();
    T.get_or_init(|| {
        (
            OPCODES.iter().copied().collect(),
            OPCODES.iter().map(|&(o, e)| (e, o)).collect(),
        )
    })
}

/// The int32 on the wire of `opcode`; one table serves both directions.
pub fn wire_opcode(opcode: i32) -> Option<i32> {
    tables().0.get(&opcode).copied()
}
/// The opcode of an int32 on the wire.
pub fn opcode_of(wire: i32) -> Option<i32> {
    tables().1.get(&wire).copied()
}

#[derive(Default)]
pub struct Writer(Vec<u8>);
impl Writer {
    pub fn new() -> Self {
        Self::default()
    }
    pub fn i32(mut self, v: i32) -> Self {
        self.0.extend_from_slice(&v.to_be_bytes());
        self
    }
    pub fn u8(mut self, v: u8) -> Self {
        self.0.push(v);
        self
    }
    pub fn i64(mut self, v: i64) -> Self {
        self.0.extend_from_slice(&v.to_be_bytes());
        self
    }
    pub fn bytes(self, v: &[u8]) -> Self {
        let mut w = self.i32(v.len() as i32);
        w.0.extend_from_slice(v);
        w
    }
    pub fn string(self, v: &str) -> Self {
        self.bytes(v.as_bytes())
    }
    pub fn build(self) -> Vec<u8> {
        self.0
    }
}

pub struct Reader<'a> {
    pub data: &'a [u8],
    pub offset: usize,
}
impl<'a> Reader<'a> {
    pub fn new(data: &'a [u8]) -> Self {
        Self { data, offset: 0 }
    }
    pub fn remaining(&self) -> usize {
        self.data.len() - self.offset
    }
    pub fn take(&mut self, n: usize) -> Result<&'a [u8]> {
        if n > self.remaining() {
            return err(
                "PAYLOAD_SCHEMA",
                format!("Invalid field length {n} at {}", self.offset),
            );
        }
        let b = &self.data[self.offset..self.offset + n];
        self.offset += n;
        Ok(b)
    }
    pub fn u8(&mut self) -> Result<u8> {
        Ok(self.take(1)?[0])
    }
    pub fn u16(&mut self) -> Result<u16> {
        Ok(u16::from_be_bytes(self.take(2)?.try_into().unwrap()))
    }
    pub fn i32(&mut self) -> Result<i32> {
        Ok(i32::from_be_bytes(self.take(4)?.try_into().unwrap()))
    }
    pub fn i64(&mut self) -> Result<i64> {
        Ok(i64::from_be_bytes(self.take(8)?.try_into().unwrap()))
    }
    pub fn bytes(&mut self) -> Result<&'a [u8]> {
        let n = self.i32()?;
        if n < 0 {
            return err(
                "PAYLOAD_SCHEMA",
                format!("Invalid field length {n} at {}", self.offset - 4),
            );
        }
        self.take(n as usize)
    }
    pub fn string(&mut self) -> Result<String> {
        Ok(String::from_utf8_lossy(self.bytes()?).into_owned())
    }
    /// Fails unless every byte was read, like finish() in src/protocol/world.ts.
    pub fn finish<T>(&self, value: T, what: &str) -> Result<T> {
        if self.remaining() != 0 {
            return err(
                "PAYLOAD_SCHEMA",
                format!("{what}: {} unread bytes", self.remaining()),
            );
        }
        Ok(value)
    }
}

/// XOR stream of both directions: byte n of the stream is xored with key[n & 15] ^ (n >> 4), n counting from 1 mod 16.
#[derive(Clone)]
pub struct XorStream {
    key: [u8; 16],
    counter: usize,
}
impl XorStream {
    pub fn new(key: [u8; 16]) -> Self {
        Self { key, counter: 0 }
    }
    pub fn apply(&mut self, data: &mut [u8]) {
        for b in data {
            let n = self.counter + 1;
            *b ^= self.key[n & 15] ^ (n >> 4) as u8;
            self.counter = n % 16;
        }
    }
}

pub fn handshake(seed: i32) -> Vec<u8> {
    let mut b = vec![
        0, 0, 0, 0x11, 1, 1, 1, 1, 1, 0, 0, 0, 4, 0x3b, 0x9c, 0x50, 0xa0, 0, 0, 0, 0,
    ];
    b[17..21].copy_from_slice(&seed.wrapping_mul(2).wrapping_add(123).to_be_bytes());
    b
}
pub fn session_key(p: &[u8]) -> Result<[u8; 16]> {
    if p.first() != Some(&16) || p.len() != 17 {
        return err("KEY_LAYOUT", "Unexpected key-exchange body");
    }
    let mut out = [0u8; 16];
    out[0] = p[1];
    for i in 1..16 {
        out[i] = p[i + 1] ^ out[i - 1];
    }
    Ok(out)
}
pub fn username_hash(name: &str) -> i32 {
    name.encode_utf16()
        .fold(17i32, |h, c| h.wrapping_mul(31).wrapping_add(c as i32))
}
pub fn password_proof(challenge: &[u8], password: &str) -> Result<Vec<u8>> {
    let pass = password.as_bytes();
    if challenge.is_empty() || pass.len() > 255 {
        return err("PASSWORD", "Empty challenge or password over 255 bytes");
    }
    let start = challenge[0] as i8 as i32 + 1;
    if start < 0 {
        return err("PASSWORD", "Negative challenge offset");
    }
    let start = start as usize;
    let mut out = vec![0x11u8; challenge.len().max(start + pass.len())];
    out[..challenge.len()].copy_from_slice(challenge);
    for (i, p) in pass.iter().enumerate() {
        out[start + i] ^= p;
    }
    out[0] = pass.len() as u8;
    Ok(out)
}
pub fn login_payload(username: &str, proof: &[u8], server_id: i32) -> Vec<u8> {
    let name = username.to_lowercase();
    Writer::new()
        .string(&name)
        .bytes(proof)
        .string(PLATFORM)
        .string(PROTOCOL_VERSION)
        .i32(server_id)
        .i32(username_hash(&name))
        .build()
}

#[derive(Debug, Clone)]
pub struct Packet {
    pub opcode: Option<i32>,
    pub encoded: i32,
    pub payload: Vec<u8>,
}

/// Frame codec of one connection: 13-byte header, then the encoded opcode (bytes reordered) and the payload, XORed once
/// the session key is known.
#[derive(Default)]
pub struct Protocol {
    pub pending: Vec<u8>,
    rx: Option<XorStream>,
    tx: Option<XorStream>,
}
impl Protocol {
    pub fn enable_key(&mut self, key: [u8; 16]) {
        self.rx = Some(XorStream::new(key));
        self.tx = Some(XorStream::new(key));
    }
    pub fn encode(&mut self, opcode: i32, payload: &[u8]) -> Result<Vec<u8>> {
        let Some(&enc) = tables().0.get(&opcode) else {
            return err("OPCODE", format!("Opcode {opcode} unknown"));
        };
        let mut f = ((payload.len() + 13) as i32).to_be_bytes().to_vec();
        f.push(1);
        f.extend_from_slice(b"PT01");
        f.extend_from_slice(&(payload.len() as i32).to_be_bytes());
        let mut body = enc.to_be_bytes().to_vec();
        body.extend_from_slice(payload);
        if let Some(tx) = &mut self.tx {
            tx.apply(&mut body);
        }
        f.extend_from_slice(&body);
        Ok(f)
    }
    pub fn push(&mut self, chunk: &[u8]) {
        self.pending.extend_from_slice(chunk);
    }
    pub fn next_packet(&mut self) -> Result<Option<Packet>> {
        if self.pending.len() < 14 {
            return Ok(None);
        }
        let n = i32::from_be_bytes(self.pending[2..6].try_into().unwrap());
        if n < 14 || n as usize > MAX_FRAME {
            return err("FRAME_LENGTH", format!("Invalid server frame size {n}"));
        }
        if self.pending.len() < n as usize {
            return Ok(None);
        }
        let mut frame: Vec<u8> = self.pending.drain(..n as usize).collect();
        if let Some(rx) = &mut self.rx {
            rx.apply(&mut frame[6..]);
        }
        let op = &frame[6..14];
        let encoded = i32::from_be_bytes([op[4], op[0], op[6], op[2]]);
        Ok(Some(Packet {
            opcode: tables().1.get(&encoded).copied(),
            encoded,
            payload: frame[14..].to_vec(),
        }))
    }
}

/// s2c/9 after the prefix, up to where the character stands; port of characterProfile of src/protocol/protocol.ts. The numbers
/// are those s2c/10 kinds 2, 4 and 8 send later; x, y are those of the s2c/11 that follows (docs/app/user-data.md).
#[derive(Debug, Clone, Default, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub name: String,
    pub level: i32,
    pub hp: i32,
    pub max_hp: i32,
    pub s1: i32,
    pub s1_max: i32,
    /// Potential stats; [0] is Cường lực, the one c2s/10 stat 0 raises.
    pub stats: Vec<i32>,
    /// extra[1..5] of s2c/10 kind 4: attack, defence, then probably accuracy, dodge, critical.
    pub combat: [i32; 5],
    pub exp: i32,
    pub coin: i32,
    pub stat_points: i32,
    pub skill_points: i32,
    pub level_exp: [i32; 2],
    pub x: i32,
    pub y: i32,
}
pub fn character_profile(p: &[u8]) -> Result<Profile> {
    profile(&mut Reader::new(p))
}
/// Where the skill list of the s2c/9 tail starts, right after x, y (profileBytes of src/protocol/protocol.ts).
pub fn character_profile_end(p: &[u8]) -> Result<usize> {
    let mut r = Reader::new(p);
    profile(&mut r)?;
    Ok(r.offset)
}
fn profile(r: &mut Reader) -> Result<Profile> {
    let c = prefix(r)?;
    let mut ints = |n: usize| (0..n).map(|_| r.i32()).collect::<Result<Vec<i32>>>();
    let (s1, s1_max) = (ints(1)?[0], ints(1)?[0]);
    let stats = ints(10)?;
    let combat: [i32; 5] = ints(5)?.try_into().expect("5 ints");
    let [exp, coin, _field, stat_points, skill_points, lo, hi] = ints(7)?[..] else {
        unreachable!()
    };
    r.string()?;
    r.string()?;
    r.take(6)?;
    Ok(Profile {
        name: c.name,
        level: c.level,
        hp: c.hp,
        max_hp: c.max_hp,
        s1,
        s1_max,
        stats,
        combat,
        exp,
        coin,
        stat_points,
        skill_points,
        level_exp: [lo, hi],
        x: r.i32()?,
        y: r.i32()?,
    })
}

/// s2c/9 up to max HP (docs/app/user-data.md).
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Character {
    /// The element: 1 Hỏa (manina), 4 Thủy (the second account); its skills are 1000 × element + 0…8. Not in the TS
    /// vectors of characterPrefix.
    #[serde(skip)]
    pub field01: u8,
    pub name: String,
    pub numeric_id: i32,
    pub display_name: String,
    pub level: i32,
    pub hp: i32,
    pub max_hp: i32,
}
pub fn character_prefix(p: &[u8]) -> Result<Character> {
    prefix(&mut Reader::new(p))
}
fn prefix(r: &mut Reader) -> Result<Character> {
    let status = r.u8()?;
    // field01 is no count of characters but the element: 1 for manina, 4 for a second account, equal to flag1 both
    // times, the same layout after it (characterPrefix of src/protocol/protocol.ts).
    let field01 = r.u8()?;
    if status != 1 {
        return err(
            "UNSUPPORTED_BRANCH",
            format!("Unobserved character response: status={status}"),
        );
    }
    let (name, numeric_id, display_name) = (r.string()?, r.i32()?, r.string()?);
    r.take(2)?;
    Ok(Character {
        field01,
        name,
        numeric_id,
        display_name,
        level: r.i32()?,
        hp: r.i32()?,
        max_hp: r.i32()?,
    })
}

/// s2c/29
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Location {
    pub character_name: String,
    pub map_id: String,
    pub field: i32,
}
pub fn character_location(p: &[u8]) -> Result<Location> {
    let mut r = Reader::new(p);
    Ok(Location {
        character_name: r.string()?,
        map_id: r.string()?,
        field: r.i32()?,
    })
}

/// s2c/11 flag 1 up to the position; `area` is the zone.
#[derive(Debug, Clone, PartialEq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MapHead {
    pub map_id: String,
    pub name: String,
    pub area: u8,
    pub x: i32,
    pub y: i32,
}
pub fn map_prefix(p: &[u8]) -> Result<MapHead> {
    let mut r = Reader::new(p);
    let flag = r.u8()?;
    if flag != 1 {
        return err("UNSUPPORTED_BRANCH", format!("Unobserved map flag {flag}"));
    }
    Ok(MapHead {
        map_id: r.string()?,
        name: r.string()?,
        area: r.u8()?,
        x: r.i32()?,
        y: r.i32()?,
    })
}
