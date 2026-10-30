//! Read side of data/maps.json (src/atlas.ts): which mobs and bosses each map has, so a boss changing tiles stays in the
//! target list. The TS bots write the file; the app only reads it.
use serde::Deserialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Deserialize)]
pub struct Kind {
    pub name: String,
    pub level: i32,
}
#[derive(Debug, Clone, Deserialize)]
pub struct MapRecord {
    pub name: String,
    #[serde(default)]
    pub mobs: Vec<Kind>,
    #[serde(default)]
    pub bosses: Vec<Kind>,
}
#[derive(Debug, Clone, Default, Deserialize)]
pub struct Atlas {
    #[serde(default)]
    pub maps: HashMap<String, MapRecord>,
}
impl Atlas {
    /// The file at `path`; empty when it is missing or unreadable.
    pub fn load(path: &Path) -> Self {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }
    pub fn bosses(&self, map_id: &str) -> &[Kind] {
        self.maps.get(map_id).map_or(&[], |m| &m.bosses)
    }
}

/// `relative` in the current directory or the nearest parent that has it (data/maps.json from app/ or app/desktop/).
pub fn find_upwards(relative: &str) -> Option<PathBuf> {
    let mut dir = std::env::current_dir().ok()?;
    loop {
        let p = dir.join(relative);
        if p.exists() {
            return Some(p);
        }
        if !dir.pop() {
            return None;
        }
    }
}
