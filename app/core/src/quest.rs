//! What a quest step asks for: stepAction of src/bot/quest.ts (docs/app/events/10-quests.md#s2c-39). The fields of s2c/39
//! decide first: a step with an npcId is played at that NPC whatever its words ("Nói chuyện với", "Tỷ thí với", "Đánh bại
//! Tiên phong Hồng Giang" of quest 17, Q17); only the steps without one are read from their text. The bot plays the step
//! in bot/quest.rs.
use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum StepAction {
    /// "Tiêu diệt Heo Mọi", "Tiêu diệt 1 Sói Xám", "Đánh bại Kẻ Gây Rối": each won battle counts 1.
    Kill {
        mob: String,
    },
    /// "Gây 500 sát thương lên Thủ Lĩnh Sơn Tặc": damage to a boss of s2c/1177, won or lost.
    Damage {
        mob: String,
        amount: i32,
    },
    /// "Đạt cấp độ 8"
    Level {
        level: i32,
    },
    /// "Nâng điểm tiềm năng"
    Stat,
    /// "Sử dụng điểm kỹ năng": a level of a skill (c2s/1191).
    Skill,
    /// "Trinh sát Thành Hồng Giang" (param 3): walk into map M4, the param + 1; the s2c/34 as it is entered moves the step
    /// on (N5).
    Visit {
        place: String,
        #[serde(rename = "mapId")]
        map_id: String,
    },
    /// Any step with an npcId: talk, report, or fight the NPC through its dialog (Đồng ý, then the duel of s2c/1180).
    Talk {
        #[serde(rename = "npcId")]
        npc_id: i32,
    },
    Unknown,
}

impl StepAction {
    /// The mob of a kill or damage step.
    pub fn mob(&self) -> Option<&str> {
        match self {
            Self::Kill { mob } | Self::Damage { mob, .. } => Some(mob),
            _ => None,
        }
    }
}

/// `text` without a leading run of digits and the space after it ("15 Cóc Xanh" → "Cóc Xanh"), if there is one.
fn skip_count(text: &str) -> &str {
    let digits = text.len() - text.trim_start_matches(|c: char| c.is_ascii_digit()).len();
    match text[digits..].strip_prefix(' ') {
        Some(rest) if digits > 0 && !rest.is_empty() => rest,
        _ => text,
    }
}

/// A whole number of ASCII digits.
fn number(text: &str) -> Option<i32> {
    (!text.is_empty() && text.bytes().all(|b| b.is_ascii_digit()))
        .then(|| text.parse().ok())
        .flatten()
}

pub fn step_action(text: &str, npc_id: i32, param: i32) -> StepAction {
    if npc_id >= 0 {
        return StepAction::Talk { npc_id };
    }
    for verb in ["Tiêu diệt ", "Đánh bại "] {
        if let Some(rest) = text.strip_prefix(verb).filter(|r| !r.is_empty()) {
            return StepAction::Kill {
                mob: skip_count(rest).into(),
            };
        }
    }
    if let Some((amount, mob)) = text
        .strip_prefix("Gây ")
        .and_then(|r| r.split_once(" sát thương lên "))
    {
        if let (Some(amount), false) = (number(amount), mob.is_empty()) {
            return StepAction::Damage {
                mob: mob.into(),
                amount,
            };
        }
    }
    if let Some(level) = text.strip_prefix("Đạt cấp độ ").and_then(number) {
        return StepAction::Level { level };
    }
    if text.starts_with("Nâng điểm tiềm năng") {
        return StepAction::Stat;
    }
    if text.starts_with("Sử dụng điểm kỹ năng") {
        return StepAction::Skill;
    }
    if let Some(rest) = text.strip_prefix("Trinh sát ") {
        let place = rest
            .strip_prefix("Thành ")
            .filter(|p| !p.is_empty())
            .unwrap_or(rest);
        if !place.is_empty() && param >= 0 {
            return StepAction::Visit {
                place: place.into(),
                map_id: format!("M{}", param + 1),
            };
        }
    }
    StepAction::Unknown
}
