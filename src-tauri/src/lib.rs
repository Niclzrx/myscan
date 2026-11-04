mod classify;
mod commands;
mod insights;
mod model;
mod scanner;
mod tree;
mod util;

use commands::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::quick_locations,
            commands::scan_folder,
            commands::cancel_scan,
            commands::scan_status,
            commands::folder_tree,
            commands::query_files,
            commands::trash_items,
        ])
        .run(tauri::generate_context!())
        .expect("erro ao iniciar o myscan");
}
