//! Helpers shared by the test files (each file under tests/ is its own crate and takes what it uses with
//! `mod common;` and a `use common::{…}`).
#![allow(dead_code)]
use cllt_core::battle::{Board, N};
use cllt_core::bot::Out;
use serde_json::Value;
use std::sync::OnceLock;

/// vectors.json, the TS side's vectors (npm run export:rust), read once per test binary.
pub fn v() -> &'static Value {
    static V: OnceLock<Value> = OnceLock::new();
    V.get_or_init(|| serde_json::from_str(include_str!("../vectors.json")).unwrap())
}

pub fn hex(s: &str) -> Vec<u8> {
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
        .collect()
}

pub fn tohex(b: &[u8]) -> String {
    b.iter().map(|x| format!("{x:02x}")).collect()
}

/// Whether a log line starts with `text`.
pub fn logged(out: &[Out], text: &str) -> bool {
    out.iter()
        .any(|o| matches!(o, Out::Log(_, t) if t.starts_with(text)))
}

/// A board of the TS vectors (a flat array of N·N pieces).
pub fn board(v: &Value) -> Board {
    let mut b = [0i16; N * N];
    for (i, x) in v.as_array().unwrap().iter().enumerate() {
        b[i] = x.as_i64().unwrap() as i16;
    }
    b
}
