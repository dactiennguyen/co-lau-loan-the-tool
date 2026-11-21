//! NPC services of Làng Thanh Khê (M1): the 14 shops, Đổi lượng of Hương Lão, and the windows of Pháp sư (Nâng cấp
//! [Thường] and [Cẩn thận], Chuyển hoá, Tách đá, Luyện đá). ← src/protocol/npc.ts; docs/app/events/15-shops.md and
//! 16-upgrade.md. Each window answers every item put in (c2s/97) with the price and the odds; c2s/91 is Bắt đầu in all.
use crate::items::{item_record, ItemRecord};
use crate::protocol::{Reader, Result, Writer};
use serde::Serialize;

/// Lái Buôn, Bà Tư Hạnh, Hương Lão and Pháp sư stand in Làng Thanh Khê; the server answers c2s/13 to them from anywhere
/// on that map, and "Không thể thực hiện" from another (B1).
pub const NPC_MAP: &str = "M1";
pub const MERCHANT: i32 = 106;
pub const TAILOR: i32 = 103;
pub const ELDER: i32 = 102;
pub const SMITH: i32 = 161;
/// The name of one of these NPCs, for the log.
pub fn npc_name(id: i32) -> &'static str {
    match id {
        MERCHANT => "Lái Buôn",
        TAILOR => "Bà Tư Hạnh",
        ELDER => "Hương Lão",
        SMITH => "Pháp sư",
        _ => "NPC",
    }
}

/// One of the 14 shops (15-shops.md#mở-cửa-hàng): `kind` is the first byte of its s2c/1190, `path` the lines to pick from
/// the NPC's first menu, `money` 0 Xu, 1 Xu khóa, 2 Lượng (-1: both, the Dược phẩm).
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShopDef {
    pub kind: u8,
    pub npc_id: i32,
    pub path: &'static [u8],
    pub name: &'static str,
    pub money: i8,
}
const fn shop(
    kind: u8,
    npc_id: i32,
    path: &'static [u8],
    name: &'static str,
    money: i8,
) -> ShopDef {
    ShopDef {
        kind,
        npc_id,
        path,
        name,
        money,
    }
}
pub const SHOPS: [ShopDef; 14] = [
    shop(0, MERCHANT, &[0, 0], "Vũ khí", 0),
    shop(7, MERCHANT, &[0, 1], "Vũ khí", 1),
    shop(6, MERCHANT, &[1], "Dược phẩm", -1),
    shop(8, MERCHANT, &[2], "Cửa hàng [Lượng]", 2),
    shop(1, TAILOR, &[0, 0], "Nón Nam", 0),
    shop(9, TAILOR, &[0, 2], "Nón Nam", 1),
    shop(2, TAILOR, &[0, 1], "Nón Nữ", 0),
    shop(10, TAILOR, &[0, 3], "Nón Nữ", 1),
    shop(3, TAILOR, &[1, 0], "Giáp Nam", 0),
    shop(11, TAILOR, &[1, 2], "Giáp Nam", 1),
    shop(4, TAILOR, &[1, 1], "Giáp Nữ", 0),
    shop(12, TAILOR, &[1, 3], "Giáp Nữ", 1),
    shop(5, TAILOR, &[2, 0], "Nhẫn", 0),
    shop(13, TAILOR, &[2, 1], "Nhẫn", 1),
];
pub fn shop_of(kind: u8) -> Option<&'static ShopDef> {
    SHOPS.iter().find(|s| s.kind == kind)
}

/// Pháp sư's windows (16-upgrade.md#cửa-sổ): s2c/96 for the first four, s2c/99 for Luyện đá.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum WindowKind {
    Upgrade,
    Careful,
    Transmute,
    Separate,
    MergeXuKhoa,
    MergeXu,
}
impl WindowKind {
    /// The lines of Pháp sư's menus that open it.
    pub fn path(self) -> &'static [u8] {
        match self {
            WindowKind::Upgrade => &[0, 0],
            WindowKind::Careful => &[0, 1],
            WindowKind::Transmute => &[0, 2],
            WindowKind::Separate => &[2],
            WindowKind::MergeXuKhoa => &[1, 0],
            WindowKind::MergeXu => &[1, 1],
        }
    }
    /// Its name in Pháp sư's menu, for the log.
    pub fn label(self) -> &'static str {
        match self {
            WindowKind::Upgrade => "Nâng cấp [Thường]",
            WindowKind::Careful => "Nâng cấp [Cẩn thận]",
            WindowKind::Transmute => "Chuyển hoá trang bị",
            WindowKind::Separate => "Tách đá",
            WindowKind::MergeXuKhoa => "Luyện đá [Xu khóa]",
            WindowKind::MergeXu => "Luyện đá [Xu]",
        }
    }
    /// Luyện đá opens with s2c/99 and answers c2s/97 with s2c/92 and c2s/91 with s2c/93; the others s2c/96, s2c/90, s2c/91.
    pub fn merge(self) -> bool {
        matches!(self, WindowKind::MergeXu | WindowKind::MergeXuKhoa)
    }
}

/// Đổi lượng of Hương Lão (15-shops.md#đổi-lượng): line 1 of his menu, then 0 for 50.000 Xu or 1 for 55.000 Xu khóa, 50
/// Lượng each. The server exchanges at once, without asking again (J3).
pub const EXCHANGE_PATH: u8 = 1;
pub const EXCHANGE_LUONG: i64 = 50;
/// What one exchange gives: (Xu, Xu khóa) for line 0 and 1.
pub const EXCHANGE_GIVES: [(i64, i64); 2] = [(50_000, 0), (0, 55_000)];

// ---------------------------------------------------------------------------------------------------------------------
// The packets of Pháp sư's windows (16-upgrade.md#gói).

/// s2c/96: the window of Nâng cấp, Chuyển hoá ("TRANSMUTE") or Tách đá (no stone slots).
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ServiceWindow {
    pub name: String,
    pub key: String,
    pub prompt: String,
    pub title: String,
    pub slots: i32,
}
pub fn service_window(p: &[u8]) -> Result<ServiceWindow> {
    let mut r = Reader::new(p);
    let w = ServiceWindow {
        name: r.string()?,
        key: r.string()?,
        prompt: r.string()?,
        title: r.string()?,
        slots: r.i32()?,
    };
    r.finish(w, "s2c/96")
}

/// s2c/99: the window of Luyện đá ("abcd1002" Xu khóa, "abcd1003" Xu, 24 stones), Chế tạo cánh, Chế Băng Kiếm.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CraftWindow {
    pub key: String,
    pub prompt: String,
    pub title: String,
    pub slots: i32,
}
pub fn craft_window(p: &[u8]) -> Result<CraftWindow> {
    let mut r = Reader::new(p);
    let w = CraftWindow {
        key: r.string()?,
        prompt: r.string()?,
        title: r.string()?,
        slots: r.i32()?,
    };
    r.finish(w, "s2c/99")
}

/// s2c/90, the answer to c2s/97 in an s2c/96 window: the item put (`gear` for the item slot), the price and odds once
/// enough is in (`text`, see quote), and whether Bắt đầu may be pressed.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ServiceSlot {
    pub name: String,
    pub gear: bool,
    pub slot: i32,
    pub quantity: i32,
    pub text: String,
    pub ready: bool,
}
pub fn service_slot(p: &[u8]) -> Result<ServiceSlot> {
    let mut r = Reader::new(p);
    let name = r.string()?;
    r.u8()?;
    let (gear, slot, quantity) = (r.u8()? == 1, r.i32()?, r.i32()?);
    r.i32()?;
    r.i32()?;
    let (text, ready) = (r.string()?, r.u8()? == 1);
    r.finish(
        ServiceSlot {
            name,
            gear,
            slot,
            quantity,
            text,
            ready,
        },
        "s2c/90",
    )
}

/// s2c/92, the answer to c2s/97 in Luyện đá: the stone put, then what it makes, the fee and the odds.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct StoneSlot {
    pub name: String,
    pub slot: i32,
    pub text: String,
    pub ready: bool,
}
pub fn stone_slot(p: &[u8]) -> Result<StoneSlot> {
    let mut r = Reader::new(p);
    let name = r.string()?;
    r.u8()?;
    let slot = r.i32()?;
    r.i32()?;
    r.i32()?;
    let (text, ready) = (r.string()?, r.u8()? == 1);
    r.finish(
        StoneSlot {
            name,
            slot,
            text,
            ready,
        },
        "s2c/92",
    )
}

/// s2c/92 in Chế tạo trang bị: as stone_slot, with the fee in Xu once both materials are in (O1: 2.400 for Bậc I, 26.500
/// Bậc II, 90.000 Bậc III; 0 before that, and 0 in Luyện đá, whose fee is in the text). ← craftSlot.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct CraftSlot {
    pub name: String,
    pub slot: i32,
    pub fee: i32,
    pub text: String,
    pub ready: bool,
}
pub fn craft_slot(p: &[u8]) -> Result<CraftSlot> {
    let mut r = Reader::new(p);
    let name = r.string()?;
    r.u8()?;
    let slot = r.i32()?;
    r.i32()?;
    let fee = r.i32()?;
    let (text, ready) = (r.string()?, r.u8()? == 1);
    r.finish(
        CraftSlot {
            name,
            slot,
            fee,
            text,
            ready,
        },
        "s2c/92",
    )
}

/// s2c/1258 after the gear of Nâng cấp is put, and after Bắt đầu: the item one level up, for the result slot.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ServicePreview {
    pub uuid: String,
    pub level: i32,
    pub item: ItemRecord,
}
pub fn service_preview(p: &[u8]) -> Result<ServicePreview> {
    crate::items::item_layouts(|| {
        let mut r = Reader::new(p);
        r.u8()?;
        let (uuid, level) = (r.string()?, r.i32()?);
        let item = item_record(&mut r)?;
        r.finish(ServicePreview { uuid, level, item }, "s2c/1258")
    })
}

/// s2c/1260, the answer to c2s/97 in Chuyển hoá when the item put is a +0 one: it is the target.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct TransmuteTarget {
    pub slot: i32,
    pub text: String,
    pub ready: bool,
}
pub fn transmute_target(p: &[u8]) -> Result<TransmuteTarget> {
    let mut r = Reader::new(p);
    r.u8()?;
    let (slot, text, ready) = (r.i32()?, r.string()?, r.u8()? == 1);
    r.finish(TransmuteTarget { slot, text, ready }, "s2c/1260")
}

/// s2c/91 after Bắt đầu in an s2c/96 window: success or not, the item after it (Nâng cấp; the +0 item of Tách đá; the +0
/// source of Chuyển hoá), the items received (the stones of Tách đá), and for Chuyển hoá the target at its new level.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct ServiceResult {
    pub name: String,
    pub ok: bool,
    pub item: ItemRecord,
    pub received: Vec<ItemRecord>,
    pub target: Option<ItemRecord>,
}
pub fn service_result(p: &[u8]) -> Result<ServiceResult> {
    crate::items::item_layouts(|| {
        let mut r = Reader::new(p);
        let (name, ok) = (r.string()?, r.u8()? == 1);
        let item = item_record(&mut r)?;
        let received = (0..r.i32()?.max(0))
            .map(|_| item_record(&mut r))
            .collect::<Result<Vec<_>>>()?;
        let target = match r.remaining() {
            0 => None,
            _ => Some(item_record(&mut r)?),
        };
        r.finish(
            ServiceResult {
                name,
                ok,
                item,
                received,
                target,
            },
            "s2c/91",
        )
    })
}

/// s2c/93 after Bắt đầu in Luyện đá: success or not, and the stone made.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct StoneResult {
    pub name: String,
    pub ok: bool,
    pub items: Vec<ItemRecord>,
}
pub fn stone_result(p: &[u8]) -> Result<StoneResult> {
    crate::items::item_layouts(|| {
        let mut r = Reader::new(p);
        let (name, ok) = (r.string()?, r.u8()? == 1);
        let items = (0..r.i32()?.max(0))
            .map(|_| item_record(&mut r))
            .collect::<Result<Vec<_>>>()?;
        r.finish(StoneResult { name, ok, items }, "s2c/93")
    })
}

/// The third field of c2s/97 (16-upgrade.md#gói): 0 for gear, stones and Chuyển hoá items; 1 for Bùa bảo vệ and the
/// materials of Chế tạo trang bị, which go in with the whole stack (O1). With 0 a charm is "Vật phẩm không phù hợp".
pub const PUT_ITEM: i32 = 0;
pub const PUT_STACK: i32 = 1;
/// c2s/97: puts `quantity` of the item of a bag slot in the open window, as `kind` (PUT_ITEM, PUT_STACK). Free; the window
/// answers. ← putRequest.
pub fn put_request(slot: i32, quantity: i32, kind: i32) -> Vec<u8> {
    Writer::new()
        .string("")
        .u8(0)
        .i32(kind)
        .i32(slot)
        .i32(quantity)
        .build()
}
/// c2s/91: Bắt đầu, the same in every window.
pub fn start_request() -> Vec<u8> {
    Writer::new().string("").build()
}

// ---------------------------------------------------------------------------------------------------------------------
// What the windows say: "Cần: 33 Xu khóa (không đủ sẽ sử dụng cả Xu)\nCần: 0 Lượng\nTỉ lệ thành công: 75%",
// "Luyện thành Đá cấp 6 Khóa\nCần: 410 Xu khóa …", "Nhận được: 2 Đá cấp 1, ".

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Money {
    Xu,
    XuKhoa,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Fee {
    pub amount: i64,
    pub money: Money,
}
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct StoneMade {
    pub level: i32,
    pub locked: bool,
}
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Gain {
    pub quantity: i32,
    pub name: String,
}
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
pub struct Quote {
    /// The fee and its money: Xu khóa (Xu when short), or Xu in Luyện đá [Xu] with unlocked stones.
    pub fee: Option<Fee>,
    /// Lượng of Nâng cấp [Cẩn thận]; 0 otherwise.
    pub luong: i64,
    /// Tỉ lệ thành công in %.
    pub rate: Option<i32>,
    /// The stone Luyện đá makes, and whether it will be trade-locked.
    pub stone: Option<StoneMade>,
    /// What Tách đá gives back.
    pub gain: Vec<Gain>,
}

/// The digits at the start of `s` and what follows them; None without any.
fn digits(s: &str) -> Option<(i64, &str)> {
    let end = s.find(|c: char| !c.is_ascii_digit()).unwrap_or(s.len());
    s[..end].parse().ok().map(|n| (n, &s[end..]))
}

pub fn quote(text: &str) -> Quote {
    let mut q = Quote::default();
    for line in text.split('\n') {
        if let Some(rest) = line.strip_prefix("Cần: ") {
            let end = rest
                .find(|c: char| !c.is_ascii_digit() && c != '.')
                .unwrap_or(rest.len());
            let (num, after) = (&rest[..end], &rest[end..]);
            let amount: Option<i64> = num.replace('.', "").parse().ok();
            match (amount, after.strip_prefix(' ')) {
                (Some(n), Some(m)) if !num.is_empty() => {
                    if m.starts_with("Xu khóa") {
                        q.fee = Some(Fee {
                            amount: n,
                            money: Money::XuKhoa,
                        })
                    } else if m.starts_with("Lượng") {
                        q.luong = n
                    } else if m.starts_with("Xu") {
                        q.fee = Some(Fee {
                            amount: n,
                            money: Money::Xu,
                        })
                    }
                }
                _ => {}
            }
        } else if let Some(rest) = line.strip_prefix("Tỉ lệ thành công: ") {
            if let Some((n, _)) = digits(rest).filter(|(_, a)| a.starts_with('%')) {
                q.rate = Some(n as i32);
            }
        } else if let Some(rest) = line.strip_prefix("Luyện thành Đá cấp ") {
            if let Some((n, after)) = digits(rest) {
                q.stone = Some(StoneMade {
                    level: n as i32,
                    locked: after.starts_with(" Khóa"),
                });
            }
        } else if let Some(rest) = line.strip_prefix("Nhận được: ") {
            q.gain = rest
                .split(',')
                .map(str::trim)
                .filter(|x| !x.is_empty())
                .map(|x| match digits(x) {
                    Some((n, after)) if after.len() > 1 && after.starts_with(' ') => Gain {
                        quantity: n as i32,
                        name: after[1..].to_string(),
                    },
                    _ => Gain {
                        quantity: 1,
                        name: x.to_string(),
                    },
                })
                .collect();
        }
    }
    q
}

// ---------------------------------------------------------------------------------------------------------------------
// Stones (16-upgrade.md#các-loại-đá): Đá cấp 1–12 are items 411–422; one of level k is worth 4^(k−1) of level 1.

pub const STONE_ID: i32 = 410;
pub fn stone_level(item_id: i32) -> i32 {
    if item_id > STONE_ID && item_id <= STONE_ID + 12 {
        item_id - STONE_ID
    } else {
        0
    }
}
pub fn stone_value(level: i32) -> i64 {
    4i64.pow(level.max(1) as u32 - 1)
}
/// The fee of Luyện đá for a stone of level `target`: ⌈0,4 × 4^(target−1)⌉ (measured for 2, 4, 5, 6, 7).
pub fn merge_fee(target: i32) -> i64 {
    (2 * stone_value(target) + 4) / 5
}
/// Trần cường hoá of the Cẩm nang by wear level: tier 1 to +4, 21 to +8, 51 to +12, 101 and up to +16.
pub fn upgrade_cap(wear_level: i32) -> i32 {
    match wear_level {
        101.. => 16,
        51.. => 12,
        21.. => 8,
        _ => 4,
    }
}
/// Below +4 a failed Nâng cấp keeps the level (Cẩm nang).
pub const SAFE_LEVEL: i32 = 4;
/// Chuyển hoá trang bị sơ, trung, cao cấp and the level each moves up to.
pub const TRANSMUTE_ITEMS: [(i32, i32); 3] = [(616, 10), (617, 13), (618, 16)];

/// The fields of a bag item the plans read (ItemRecord, or {slot, itemId, field0, field1} of the vectors).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BagItem {
    pub slot: i32,
    pub item_id: i32,
    pub field0: i32,
    pub field1: u8,
    /// The stack (materials of Chế tạo); 0 in the vectors that leave it out.
    #[serde(default)]
    pub quantity: i32,
}
impl From<&ItemRecord> for BagItem {
    fn from(i: &ItemRecord) -> Self {
        Self {
            slot: i.slot as i32,
            item_id: i.item_id,
            field0: i.field0,
            field1: i.field1,
            quantity: i.quantity,
        }
    }
}
impl BagItem {
    /// field1 0: trade-locked (15-shops.md#khoá).
    pub fn locked(&self) -> bool {
        self.field1 == 0
    }
    /// How many the slot holds: the stack, 1 where the vectors leave it out (0).
    pub fn count(&self) -> i32 {
        self.quantity.max(1)
    }
}

/// How many stones one stack holds at most: Đá cấp 1–12 stack to 999 since the item table of 16/11 (ST1).
pub const STONE_STACK: i32 = 999;
/// Stones a Nâng cấp window holds (s2c/96); upgrade_stones gives no more of one stack.
pub const UPGRADE_SLOTS: usize = 18;

/// One Luyện đá: four stones of one level and lock, made into one of the next level at 100%.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MergeSet {
    pub level: i32,
    pub slots: Vec<i32>,
    pub locked: bool,
    pub window: WindowKind,
    pub fee: i64,
}

/// Options of Gộp đá ← MergeOptions of src/protocol/npc.ts. `up_to` is the highest level made (12 at most); `unlocked`
/// false leaves unlocked stones be. `level` merges only the stones of that level (into the next, not further up) and
/// `locked` only the locked (true) or unlocked (false) ones: the Gộp button of a row of the stones' table. `sets` is the
/// most merges of the run. `xu_khoa_only` pays the locked sets with Xu khóa alone, never with Xu as the server would when
/// Xu khóa runs short: the run ends at the first set the Xu khóa left does not pay for (Tự gộp đá khi túi đầy).
#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MergeOptions {
    pub up_to: i32,
    pub unlocked: bool,
    pub level: Option<i32>,
    pub locked: Option<bool>,
    pub sets: Option<i64>,
    pub xu_khoa_only: bool,
}
impl Default for MergeOptions {
    fn default() -> Self {
        Self {
            up_to: 12,
            unlocked: true,
            level: None,
            locked: None,
            sets: None,
            xu_khoa_only: false,
        }
    }
}
impl MergeOptions {
    /// The levels and locks a merge may take, lowest level first, unlocked before locked.
    fn kinds(&self) -> Vec<(i32, bool)> {
        let levels = match self.level {
            None => 1..self.up_to.min(12),
            Some(l) if (1..12).contains(&l) => l..l + 1,
            Some(_) => 0..0,
        };
        levels
            .flat_map(|level| {
                [false, true]
                    .into_iter()
                    .filter(|&lock| {
                        (lock || self.unlocked) && self.locked.is_none_or(|want| want == lock)
                    })
                    .map(move |lock| (level, lock))
            })
            .collect()
    }
}

/// Gộp đá: the sets of 4 stones of a level that Luyện đá makes into one of the next at 100%, lowest level first. Unlocked
/// stones go together in Luyện đá [Xu], paid in Xu, so the stone made stays tradeable; locked ones in [Xu khóa]. A
/// level's 1–3 stones left over stay. The stones made are not in this plan: plan again on the new bag to go on up.
/// `sets` is not applied here: the bot counts its merges. Stones stack (ST1): a slot stands in `slots` once per stone it
/// holds, so a set may be four of one slot, put in with c2s/97 quantity 4.
pub fn merge_plan(bag: &[BagItem], o: MergeOptions) -> Vec<MergeSet> {
    let mut sets = vec![];
    for (level, lock) in o.kinds() {
        let mut held: Vec<&BagItem> = bag
            .iter()
            .filter(|i| stone_level(i.item_id) == level && i.locked() == lock)
            .collect();
        held.sort_by_key(|i| i.slot);
        let slots: Vec<i32> = held
            .iter()
            .flat_map(|i| std::iter::repeat_n(i.slot, i.count() as usize))
            .collect();
        for four in slots.chunks_exact(4) {
            sets.push(MergeSet {
                level,
                slots: four.to_vec(),
                locked: lock,
                window: if lock {
                    WindowKind::MergeXuKhoa
                } else {
                    WindowKind::MergeXu
                },
                fee: merge_fee(level + 1),
            });
        }
    }
    sets
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Made {
    pub level: i32,
    pub locked: bool,
    pub count: i64,
}
/// What Gộp đá does in all, going on up with the stones it makes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MergeForecast {
    pub merges: i64,
    pub xu: i64,
    pub xu_khoa: i64,
    pub freed: i64,
    pub made: Vec<Made>,
}
/// What Gộp đá does in all, at most `sets` merges.
pub fn merge_forecast(bag: &[BagItem], o: MergeOptions) -> MergeForecast {
    merge_forecast_paid(bag, o, i64::MAX)
}

/// merge_forecast of what `xu_khoa` pays for, the locked sets in the order Gộp đá takes them (lowest level first, then
/// on the stones made), up to the first set whose fee is more than the Xu khóa left: what a run with `xu_khoa_only` does
/// (Tự gộp đá khi túi đầy, planned before the trip to Pháp sư). Unlocked sets, paid in Xu, are counted as merge_forecast
/// counts them.
pub fn merge_forecast_paid(bag: &[BagItem], o: MergeOptions, xu_khoa: i64) -> MergeForecast {
    // The stacks of each level and lock in slot order, as Gộp đá takes them (merge_plan): four stones from the first
    // ones, and the stone made onto the first stack of its kind with room, else into a slot of its own (ST1).
    let mut stacks: Vec<Vec<Vec<i64>>> = vec![vec![vec![]; 2]; 14];
    let mut held: Vec<&BagItem> = bag.iter().filter(|i| stone_level(i.item_id) > 0).collect();
    held.sort_by_key(|i| i.slot);
    for i in &held {
        stacks[stone_level(i.item_id) as usize][i.locked() as usize].push(i.count() as i64);
    }
    let mut made = [[0i64; 2]; 14];
    let (mut merges, mut xu, mut paid) = (0, 0, 0i64);
    let most = o.sets.unwrap_or(i64::MAX);
    'kinds: for (level, lock) in o.kinds() {
        let fee = merge_fee(level + 1);
        while stacks[level as usize][lock as usize].iter().sum::<i64>() >= 4 && merges < most {
            if lock && paid.saturating_add(fee) > xu_khoa {
                break 'kinds;
            }
            let from = &mut stacks[level as usize][lock as usize];
            let mut take = 4;
            for n in from.iter_mut() {
                let k = take.min(*n);
                (*n, take) = (*n - k, take - k);
            }
            from.retain(|&n| n > 0);
            let to = &mut stacks[level as usize + 1][lock as usize];
            match to.iter_mut().find(|n| **n < STONE_STACK as i64) {
                Some(n) => *n += 1,
                None => to.push(1),
            }
            made[level as usize + 1][lock as usize] += 1;
            merges += 1;
            match lock {
                true => paid += fee,
                false => xu += fee,
            }
        }
    }
    let mut list = vec![];
    for (level, m) in made.iter().enumerate() {
        for lock in [false, true] {
            if m[lock as usize] > 0 {
                list.push(Made {
                    level: level as i32,
                    locked: lock,
                    count: m[lock as usize],
                });
            }
        }
    }
    let after: usize = stacks.iter().flatten().map(Vec::len).sum();
    MergeForecast {
        merges,
        xu,
        xu_khoa: paid,
        freed: held.len() as i64 - after as i64,
        made: list,
    }
}

/// The stones Nâng cấp may use, in the order to put them: lowest value first, and within a level the locked ones before
/// the unlocked ones, which stay tradeable longer. `unlocked` false leaves unlocked stones out. The server takes every
/// stone put in (J3), so the bot puts them one by one and stops as soon as the odds are reached. A stack stands once per
/// stone, at most UPGRADE_SLOTS of it (a window's worth): c2s/97 of the same slot again adds one more stone (ST1).
pub fn upgrade_stones(bag: &[BagItem], unlocked: bool) -> Vec<BagItem> {
    let mut v: Vec<BagItem> = bag
        .iter()
        .filter(|i| stone_level(i.item_id) > 0 && (unlocked || i.locked()))
        .copied()
        .collect();
    v.sort_by(|a, b| {
        stone_level(a.item_id)
            .cmp(&stone_level(b.item_id))
            .then(b.locked().cmp(&a.locked()))
            .then(a.slot.cmp(&b.slot))
    });
    v.into_iter()
        .flat_map(|i| std::iter::repeat_n(i, (i.count() as usize).min(UPGRADE_SLOTS)))
        .collect()
}

/// The bag items Chuyển hoá may move `source`'s level to (16-upgrade.md#chuyển-hoá): another item of the same type, at
/// +0, of a tier (wear level) at least the source's, and able to reach that level. `def` gives an item's type and level.
pub fn transmute_targets(
    bag: &[BagItem],
    source: &BagItem,
    def: impl Fn(i32) -> Option<(u8, i32)>,
) -> Vec<BagItem> {
    let Some((kind, level)) = def(source.item_id).filter(|_| source.field0 >= 1) else {
        return vec![];
    };
    bag.iter()
        .filter(|i| {
            i.slot != source.slot
                && i.field0 == 0
                && def(i.item_id).is_some_and(|(k, l)| {
                    k == kind && l >= level && upgrade_cap(l) >= source.field0
                })
        })
        .copied()
        .collect()
}

/// The cheapest Chuyển hoá item of the bag that moves a +`level` item, if any.
pub fn transmute_item(bag: &[BagItem], level: i32) -> Option<BagItem> {
    TRANSMUTE_ITEMS
        .iter()
        .filter(|(_, up_to)| *up_to >= level)
        .find_map(|(id, _)| bag.iter().find(|i| i.item_id == *id).copied())
}

// ---------------------------------------------------------------------------------------------------------------------
// Bùa bảo vệ, Chế tạo trang bị and Đổi Băng Tâm (O1, 16-upgrade.md#thất-bại-và-bùa, #chế-tạo); Điểm năng động of Hương
// Lão (14-npc.md#điểm-năng-động). ← the same part of src/protocol/npc.ts and pointsText of src/protocol/shops.ts.

/// Bùa bảo vệ sơ, trung, cao, siêu cấp and the highest level of the upgrade each protects ("từ cấp 1 đến cấp 8 / 12 / 14
/// / 16"). They stack, and go in with c2s/97 PUT_STACK, quantity 1.
pub const CHARMS: [(i32, i32); 4] = [(35, 8), (36, 12), (37, 14), (38, 16)];
/// The levels a failed Nâng cấp falls back to (Cẩm nang; +7 → +4 measured in O1). Below +4 it keeps its level.
pub const FALLBACK_LEVELS: [i32; 4] = [4, 8, 12, 14];
/// The level of an item +`level` after a failed Nâng cấp without a charm.
pub fn fail_level(level: i32) -> i32 {
    FALLBACK_LEVELS
        .iter()
        .copied()
        .rfind(|&m| m <= level)
        .unwrap_or(level)
}
/// Whether a failed Nâng cấp from +`level` loses levels (+5 to +7, +9 to +11, +13, +15), so a charm is worth it.
pub fn charm_useful(level: i32) -> bool {
    fail_level(level) < level
}
/// The lowest charm of the bag that protects the upgrade from +`level` to the next.
pub fn charm_for(bag: &[BagItem], level: i32) -> Option<BagItem> {
    CHARMS
        .iter()
        .filter(|(_, up_to)| *up_to > level)
        .find_map(|(id, _)| bag.iter().find(|i| i.item_id == *id).copied())
}
/// Trần cường hoá of an item from its it1 type and wear level: wings (type 4) go to +16 whatever their level.
pub fn item_cap(kind: u8, wear_level: i32) -> i32 {
    match kind {
        4 => 16,
        _ => upgrade_cap(wear_level),
    }
}

/// Chế tạo trang bị: Pháp sư → 3 Chế tạo → 1 Chế tạo trang bị → the kind (0 Nón, 1 Áo, 2 Vũ khí, 3 Nhẫn), whose s2c/57
/// gives the recipes; a tier line opens the window s2c/99 "abcd1001".
pub const CRAFT_PATH: [u8; 2] = [3, 1];
pub const CRAFT_LABELS: [&str; 4] = ["Nón", "Áo", "Vũ khí", "Nhẫn"];
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Material {
    pub name: String,
    pub count: i32,
}
/// A tier of an item kind: its line in the menu, the character level it needs, the materials and the Xu.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Recipe {
    pub tier: i32,
    pub option: u8,
    pub level: i32,
    pub materials: Vec<Material>,
    pub xu: i64,
}
/// "2.400" → 2400.
fn amount(s: &str) -> Option<i64> {
    let d: String = s.chars().filter(|c| *c != '.').collect();
    (!d.is_empty() && d.bytes().all(|b| b.is_ascii_digit()))
        .then(|| d.parse().ok())
        .flatten()
}
fn roman(s: &str) -> Option<i32> {
    ["I", "II", "III", "IV", "V", "VI"]
        .iter()
        .position(|r| *r == s)
        .map(|i| i as i32 + 1)
}
/// The recipes of an item kind from its s2c/57: the text gives "Bậc I: Quặng Bậc 1 x24, Linh Thạch Bậc 1 x24, 2.400 Xu"
/// for each tier, the lines "Bậc II (Lv 51)" the character level each needs (O1). ← recipes.
pub fn recipes(text: &str, options: &[(u8, String)]) -> Vec<Recipe> {
    let mut out = vec![];
    for line in text.split('\n') {
        let Some((head, rest)) = line
            .trim()
            .strip_prefix("Bậc ")
            .and_then(|l| l.split_once(": "))
        else {
            continue;
        };
        if !head.chars().all(|c| c == 'I' || c == 'V') || rest.is_empty() {
            continue;
        }
        let Some(tier) = roman(head) else { continue };
        let parts: Vec<&str> = rest.split(',').map(str::trim).collect();
        let xu = parts
            .last()
            .and_then(|p| p.strip_suffix(" Xu"))
            .and_then(amount);
        let materials: Vec<Material> = parts[..parts.len() - 1]
            .iter()
            .filter_map(|p| {
                let (name, count) = p.rsplit_once(" x")?;
                let count = count
                    .parse()
                    .ok()
                    .filter(|_| count.bytes().all(|b| b.is_ascii_digit()))?;
                (!name.is_empty()).then(|| Material {
                    name: name.into(),
                    count,
                })
            })
            .collect();
        let prefix = format!("Bậc {head} (Lv ");
        let label = options.iter().find_map(|(o, l)| {
            let lv = l.strip_prefix(&prefix)?;
            let end = lv.find(|c: char| !c.is_ascii_digit())?;
            (end > 0 && lv[end..].starts_with(')')).then(|| (*o, lv[..end].parse::<i32>().ok()))
        });
        let (Some(xu), Some((option, Some(level)))) = (xu, label) else {
            continue;
        };
        if materials.len() != parts.len() - 1 {
            continue;
        }
        out.push(Recipe {
            tier,
            option,
            level,
            materials,
            xu,
        });
    }
    out
}
/// A material of a recipe and the bag stack to put for it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct MaterialPut {
    pub name: String,
    pub count: i32,
    pub item: BagItem,
}
/// The bag slot to put for each material of a recipe: the largest stack of that item, which must hold the count (the
/// client puts one stack, the whole of it; the server takes the count), and what is missing ("Quặng Bậc 1 10/24").
/// `id_of` maps a material name to its item id. ← craftMaterials.
pub fn craft_materials(
    bag: &[BagItem],
    recipe: &Recipe,
    id_of: impl Fn(&str) -> Option<i32>,
) -> (Vec<MaterialPut>, Vec<String>) {
    let (mut puts, mut missing) = (vec![], vec![]);
    for m in &recipe.materials {
        let id = id_of(&m.name);
        // The largest stack; the first of equal ones, as the stable sort of the TS side.
        let best = bag
            .iter()
            .filter(|i| Some(i.item_id) == id)
            .fold(None::<&BagItem>, |b, i| match b {
                Some(b) if b.quantity >= i.quantity => Some(b),
                _ => Some(i),
            });
        match best {
            Some(b) if b.quantity >= m.count => puts.push(MaterialPut {
                name: m.name.clone(),
                count: m.count,
                item: *b,
            }),
            _ => missing.push(format!(
                "{} {}/{}",
                m.name,
                best.map_or(0, |b| b.quantity),
                m.count
            )),
        }
    }
    (puts, missing)
}

/// Đổi Băng Tâm lấy bình rỗng: Pháp sư → 3 Chế tạo → 3, then 0 one bottle, 1 five, 2 all. 8 Băng Tâm (item 21) make one
/// Bình Huyết Linh (Rỗng) (item 16). The server exchanges as soon as the line is picked, without asking again (O1).
pub const ICE_PATH: [u8; 2] = [3, 3];
pub const ICE_PER_BOTTLE: i64 = 8;
pub const ICE_ID: i32 = 21;
pub const BOTTLE_ID: i32 = 16;
/// What follows each `pat` in `text`, first to last (a regex tries every place).
fn after_each<'a>(text: &'a str, pat: &'a str) -> impl Iterator<Item = &'a str> {
    text.match_indices(pat)
        .map(move |(i, _)| &text[i + pat.len()..])
}
/// `[\d.]+` at the start of `s` as a number ("7.000" → 7000) and what follows; None without a digit.
fn dotted(s: &str) -> Option<(i64, &str)> {
    let end = s
        .find(|c: char| !(c.is_ascii_digit() || c == '.'))
        .unwrap_or(s.len());
    amount(&s[..end]).map(|n| (n, &s[end..]))
}

/// "Đổi 8 Băng Tâm lấy 1 Bình Huyết Linh (Rỗng). Bạn đang có 8 Băng Tâm." → 8. ← iceHeld.
pub fn ice_held(text: &str) -> Option<i64> {
    after_each(text, "Bạn đang có ").find_map(|r| {
        let (n, r) = dotted(r)?;
        r.starts_with(" Băng Tâm").then_some(n)
    })
}

/// Điểm năng động of Hương Lão: line 3 of his menu, whose s2c/57 says the points of the week and the exchange limit; its
/// line 1 Cách tính điểm answers with s2c/0. Its line 0 Đổi Xu (at 100 points, for Xu khóa) is not measured and line 2
/// Đóng leaves the phone's client stuck (G1): the bot sends neither.
pub const POINTS_PATH: u8 = 3;
pub const POINTS_RULES: u8 = 1;
/// "Điểm năng động tuần này: 54/100\nHạn mức đổi (cấp 79): 7.000 Xu, cần 7.700 Xu khóa\nTuần này còn 500/500 suất. …"
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityPoints {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub points: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub need: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub level: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub xu: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub xu_khoa: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub slots_left: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub slots: Option<i64>,
}
/// ← pointsText.
pub fn points_text(text: &str) -> ActivityPoints {
    let mut p = ActivityPoints::default();
    let points = after_each(text, "tuần này: ").find_map(|r| {
        let (a, r) = digits(r)?;
        let (b, _) = digits(r.strip_prefix('/')?)?;
        Some((a, b))
    });
    if let Some((a, b)) = points {
        (p.points, p.need) = (Some(a), Some(b));
    }
    let limit = after_each(text, "Hạn mức đổi (cấp ").find_map(|r| {
        let (level, r) = digits(r)?;
        let (xu, r) = dotted(r.strip_prefix("): ")?)?;
        let (khoa, r) = dotted(r.strip_prefix(" Xu, cần ")?)?;
        r.starts_with(" Xu khóa").then_some((level, xu, khoa))
    });
    if let Some((level, xu, khoa)) = limit {
        (p.level, p.xu, p.xu_khoa) = (Some(level), Some(xu), Some(khoa));
    }
    let slots = after_each(text, "còn ").find_map(|r| {
        let (a, r) = dotted(r)?;
        let (b, r) = dotted(r.strip_prefix('/')?)?;
        r.starts_with(" suất").then_some((a, b))
    });
    if let Some((a, b)) = slots {
        (p.slots_left, p.slots) = (Some(a), Some(b));
    }
    p
}
