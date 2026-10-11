#[tauri::command]
async fn generate_puzzle(seed: u32, difficulty: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || cross_math_core::generate_json(seed, &difficulty))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
fn check_board(puzzle: String, values: String) -> Result<String, String> {
    cross_math_core::check_json(&puzzle, &values)
}

#[tauri::command]
async fn get_hint(puzzle: String, values: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || cross_math_core::hint_json(&puzzle, &values))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            generate_puzzle,
            check_board,
            get_hint
        ])
        .run(tauri::generate_context!())
        .expect("could not start Cross Math");
}
