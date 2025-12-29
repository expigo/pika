// Pika! Desktop Application

use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename = "VirtualDJ_Database")]
struct VirtualDJDatabase {
    #[serde(rename = "Song", default)]
    songs: Vec<VirtualDJTrack>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct VirtualDJTrack {
    #[serde(rename = "@FilePath")]
    file_path: String,
    #[serde(rename = "@Artist", default)]
    artist: Option<String>,
    #[serde(rename = "@Title", default)]
    title: Option<String>,
    #[serde(rename = "@Bpm", default)]
    bpm: Option<String>, // Parsing as string first to be safe, then can convert if needed, or leave as string
    #[serde(rename = "@Key", default)]
    key: Option<String>,
}

#[tauri::command]
fn import_virtualdj_library(xml_path: String) -> Result<Vec<VirtualDJTrack>, String> {
    let content = std::fs::read_to_string(&xml_path).map_err(|e| e.to_string())?;
    
    let database: VirtualDJDatabase = quick_xml::de::from_str(&content).map_err(|e| e.to_string())?;
    
    Ok(database.songs)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![import_virtualdj_library])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
