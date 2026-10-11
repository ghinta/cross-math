//! Deterministic, offline arithmetic engines; v1 remains readable for existing saves.
pub mod crossword;
pub mod legacy;
pub use crossword::{Puzzle, check, generate, hint, solve};
pub use legacy::{Op, evaluate};

pub fn generate_json(seed: u32, difficulty: &str) -> Result<String, String> {
    serde_json::to_string(&generate(seed, difficulty)?).map_err(|e| e.to_string())
}
fn version(puzzle: &str) -> Result<u64, String> {
    serde_json::from_str::<serde_json::Value>(puzzle)
        .map_err(|e| e.to_string())?
        .get("version")
        .and_then(|v| v.as_u64())
        .ok_or("Missing puzzle version".into())
}
pub fn check_json(puzzle: &str, values: &str) -> Result<String, String> {
    if version(puzzle)? == 1 {
        return legacy::check_json(puzzle, values);
    }
    let p: Puzzle = serde_json::from_str(puzzle).map_err(|e| e.to_string())?;
    p.validate()?;
    let board: Vec<Option<i32>> = serde_json::from_str(values).map_err(|e| e.to_string())?;
    serde_json::to_string(&check(&p, &board)).map_err(|e| e.to_string())
}
pub fn hint_json(puzzle: &str, values: &str) -> Result<String, String> {
    if version(puzzle)? == 1 {
        return legacy::hint_json(puzzle, values);
    }
    let p: Puzzle = serde_json::from_str(puzzle).map_err(|e| e.to_string())?;
    p.validate()?;
    let board: Vec<Option<i32>> = serde_json::from_str(values).map_err(|e| e.to_string())?;
    serde_json::to_string(&hint(&p, &board)?).map_err(|e| e.to_string())
}
pub fn verify_json(puzzle: &str) -> Result<String, String> {
    if version(puzzle)? == 1 {
        let p: legacy::Puzzle = serde_json::from_str(puzzle).map_err(|e| e.to_string())?;
        p.validate()?;
        if legacy::solve(&p, 2).len() != 1 {
            return Err("Puzzle is not uniquely solvable".into());
        }
    } else {
        let p: Puzzle = serde_json::from_str(puzzle).map_err(|e| e.to_string())?;
        if crossword::proof(&p).is_none() || solve(&p, 2).len() != 1 {
            return Err("Puzzle has no unique, verified deduction path".into());
        }
    }
    Ok("true".into())
}
#[cfg(target_arch = "wasm32")]
mod wasm {
    use wasm_bindgen::prelude::*;
    #[wasm_bindgen]
    pub fn generate(seed: u32, difficulty: &str) -> Result<String, JsValue> {
        super::generate_json(seed, difficulty).map_err(|e| JsValue::from_str(&e))
    }
    #[wasm_bindgen]
    pub fn check(puzzle: &str, values: &str) -> Result<String, JsValue> {
        super::check_json(puzzle, values).map_err(|e| JsValue::from_str(&e))
    }
    #[wasm_bindgen]
    pub fn hint(puzzle: &str, values: &str) -> Result<String, JsValue> {
        super::hint_json(puzzle, values).map_err(|e| JsValue::from_str(&e))
    }
    #[wasm_bindgen]
    pub fn verify(puzzle: &str) -> Result<String, JsValue> {
        super::verify_json(puzzle).map_err(|e| JsValue::from_str(&e))
    }
}
