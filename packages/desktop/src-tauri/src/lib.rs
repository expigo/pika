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
    #[serde(rename = "Infos", default)]
    infos: Option<VirtualDJInfos>,
    #[serde(rename = "Comment", default)]
    _comment: Option<serde::de::IgnoredAny>,
    #[serde(rename = "Poi", default)]
    _poi: Vec<serde::de::IgnoredAny>,
}

#[derive(Debug, Deserialize, Default)]
struct VirtualDJInfos {
    #[serde(rename = "@SongLength", default)]
    song_length: Option<String>,
    #[serde(rename = "@FirstSeen", default)]
    first_seen: Option<String>,
    #[serde(rename = "@PlayCount", default)]
    play_count: Option<String>,
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
    duration: Option<i32>,
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
        
        // Parse duration from Infos.SongLength (stored as float seconds)
        let duration = song.infos.as_ref()
            .and_then(|i| i.song_length.as_ref())
            .and_then(|s| s.parse::<f64>().ok())
            .map(|d| d.round() as i32);
        
        VirtualDJTrack {
            file_path: song.file_path,
            artist: song.tags.as_ref().and_then(|t| t.author.clone()),
            title: song.tags.as_ref().and_then(|t| t.title.clone()),
            bpm,
            key: song.scan.as_ref().and_then(|s| s.key.clone()),
            duration,
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

/// Read the VirtualDJ history file for the current day
#[derive(Debug, Serialize)]
pub struct HistoryTrack {
    artist: String,
    title: String,
    file_path: String,
    timestamp: u64,
}

#[tauri::command]
fn read_virtualdj_history() -> Result<Option<HistoryTrack>, String> {
    // Get home directory
    let home = std::env::var("HOME").map_err(|e| e.to_string())?;
    
    let history_dir = std::path::PathBuf::from(&home)
        .join("Library")
        .join("Application Support")
        .join("VirtualDJ")
        .join("History");
    
    // Find the most recently modified .m3u file
    // This handles the "midnight crossover" where VDJ might keep writing to yesterday's file,
    // or conversely, if the system date changes but we want the *actual* active file.
    let history_path = std::fs::read_dir(&history_dir)
        .map_err(|e| format!("Failed to read history directory: {}", e))?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.is_file() && path.extension().map_or(false, |ext| ext == "m3u"))
        .max_by_key(|path| std::fs::metadata(path).and_then(|m| m.modified()).ok())
        .ok_or_else(|| "No history files found".to_string())?;
    
    // Read the file
    let content = match std::fs::read_to_string(&history_path) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[VDJ History] Failed to read {}: {}", history_path.display(), e);
            return Ok(None);
        }
    };
    
    // Parse the last entry
    let lines: Vec<&str> = content.trim().lines().collect();
    if lines.len() < 2 {
        return Ok(None);
    }
    
    let file_path = lines[lines.len() - 1].to_string();
    let ext_line = lines[lines.len() - 2];
    
    if !ext_line.starts_with("#EXTVDJ:") {
        return Ok(None);
    }
    
    // Parse the EXTVDJ line - extract artist, title, lastplaytime
    let extract_tag = |content: &str, tag: &str| -> Option<String> {
        let start = format!("<{}>", tag);
        let end = format!("</{}>", tag);
        let start_idx = content.find(&start)? + start.len();
        let end_idx = content.find(&end)?;
        Some(content[start_idx..end_idx].to_string())
    };
    
    let artist = extract_tag(ext_line, "artist").unwrap_or_else(|| "Unknown".to_string());
    let title = extract_tag(ext_line, "title").unwrap_or_else(|| "Unknown".to_string());
    let timestamp: u64 = extract_tag(ext_line, "lastplaytime")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    
    Ok(Some(HistoryTrack {
        artist,
        title,
        file_path,
        timestamp,
    }))
}

/// Get the local network IP address for LAN sharing
/// Returns the first non-loopback IPv4 address found
#[tauri::command]
fn get_local_ip() -> Option<String> {
    use std::net::UdpSocket;
    
    // This is a common trick to find the local IP:
    // We create a UDP socket and "connect" to an external address
    // Then we get the local address of this socket
    // The connection doesn't actually send any data
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let addr = socket.local_addr().ok()?;
    Some(addr.ip().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![import_virtualdj_library, read_virtualdj_history, get_local_ip])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

