// Pika! Desktop Application

use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename = "VirtualDJ_Database")]
struct VirtualDJDatabase {
    #[serde(rename = "@Version", default)]
    version: Option<String>,
    #[serde(rename = "Song", default)]
    songs: Vec<VirtualDJSong>,
}

#[derive(Debug, Deserialize)]
struct VirtualDJSong {
    #[serde(rename = "@FilePath")]
    file_path: String,
    #[serde(rename = "@FileSize", default)]
    file_size: Option<String>,
    #[serde(rename = "Tags", default)]
    tags: Option<VirtualDJTags>,
    #[serde(rename = "Scan", default)]
    scan: Option<VirtualDJScan>,
    // Ignore other elements by not parsing them
    #[serde(rename = "Infos", default)]
    _infos: Option<serde::de::IgnoredAny>,
    #[serde(rename = "Comment", default)]
    _comment: Option<serde::de::IgnoredAny>,
    #[serde(rename = "Poi", default)]
    _poi: Vec<serde::de::IgnoredAny>,
}

#[derive(Debug, Deserialize, Default)]
struct VirtualDJTags {
    #[serde(rename = "@Author", default)]
    author: Option<String>,
    #[serde(rename = "@Title", default)]
    title: Option<String>,
    #[serde(rename = "@Genre", default)]
    genre: Option<String>,
    #[serde(rename = "@Album", default)]
    album: Option<String>,
    #[serde(rename = "@TrackNumber", default)]
    track_number: Option<String>,
    #[serde(rename = "@Year", default)]
    year: Option<String>,
    #[serde(rename = "@Flag", default)]
    flag: Option<String>,
}

#[derive(Debug, Deserialize, Default)]
struct VirtualDJScan {
    #[serde(rename = "@Version", default)]
    version: Option<String>,
    #[serde(rename = "@Bpm", default)]
    bpm: Option<String>,
    #[serde(rename = "@AltBpm", default)]
    alt_bpm: Option<String>,
    #[serde(rename = "@Volume", default)]
    volume: Option<String>,
    #[serde(rename = "@Key", default)]
    key: Option<String>,
    #[serde(rename = "@AudioSig", default)]
    audio_sig: Option<String>,
    #[serde(rename = "@Flag", default)]
    flag: Option<String>,
}

// Output type that matches what the frontend expects
#[derive(Debug, Serialize)]
pub struct VirtualDJTrack {
    file_path: String,
    artist: Option<String>,
    title: Option<String>,
    bpm: Option<String>,
    key: Option<String>,
}

/// Convert VirtualDJ BPM format to actual BPM
/// VirtualDJ stores BPM as beat period in seconds (seconds per beat)
/// Formula: actual_bpm = 60 / stored_value
fn convert_virtualdj_bpm(bpm_str: &str) -> Option<String> {
    let beat_period: f64 = bpm_str.parse().ok()?;
    if beat_period <= 0.0 {
        return None;
    }
    let actual_bpm = 60.0 / beat_period;
    // Round to 1 decimal place
    Some(format!("{:.1}", actual_bpm))
}

impl From<VirtualDJSong> for VirtualDJTrack {
    fn from(song: VirtualDJSong) -> Self {
        // Convert BPM from VirtualDJ format
        let bpm = song.scan.as_ref()
            .and_then(|s| s.bpm.as_ref())
            .and_then(|b| convert_virtualdj_bpm(b));
        
        VirtualDJTrack {
            file_path: song.file_path,
            artist: song.tags.as_ref().and_then(|t| t.author.clone()),
            title: song.tags.as_ref().and_then(|t| t.title.clone()),
            bpm,
            key: song.scan.as_ref().and_then(|s| s.key.clone()),
        }
    }
}

#[tauri::command]
fn import_virtualdj_library(xml_path: String) -> Result<Vec<VirtualDJTrack>, String> {
    let content = std::fs::read_to_string(&xml_path).map_err(|e| e.to_string())?;
    
    let database: VirtualDJDatabase = quick_xml::de::from_str(&content).map_err(|e| {
        format!("XML parsing error: {}", e)
    })?;
    
    // Convert VirtualDJSong to VirtualDJTrack
    let tracks: Vec<VirtualDJTrack> = database.songs.into_iter().map(|s| s.into()).collect();
    
    Ok(tracks)
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
