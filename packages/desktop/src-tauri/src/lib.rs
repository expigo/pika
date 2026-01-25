// Pika! Desktop Application

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use once_cell::sync::Lazy;
use std::path::PathBuf;

#[derive(Debug, Deserialize)]
#[serde(rename = "VirtualDJ_Database")]
struct VirtualDJDatabase {
    #[serde(rename = "@Version", default)]
    version: Option<String>,
    #[serde(rename = "Song", default)]
    songs: Vec<VirtualDJSong>,
}

#[derive(Debug, Deserialize, Clone)]
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
    pois: Vec<VirtualDJPoi>,
}

#[derive(Debug, Deserialize, Default, Clone)]
struct VirtualDJPoi {
    #[serde(rename = "@Name", default)]
    name: Option<String>,
    #[serde(rename = "@Pos", default)]
    pos: Option<String>,
    #[serde(rename = "@Type", default)]
    _type: Option<String>,
}

#[derive(Debug, Deserialize, Default, Clone)]
struct VirtualDJInfos {
    #[serde(rename = "@SongLength", default)]
    song_length: Option<String>,
    #[serde(rename = "@FirstSeen", default)]
    first_seen: Option<String>,
    #[serde(rename = "@PlayCount", default)]
    play_count: Option<String>,
}

#[derive(Debug, Deserialize, Default, Clone)]
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

#[derive(Debug, Deserialize, Default, Clone)]
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

/// Global cache for the VirtualDJ database to avoid repeated disk I/O and parsing
struct VdjCache {
    /// Original file path of the database
    path: PathBuf,
    /// Last modified time to detect changes
    last_modified: std::time::SystemTime,
    /// Cached songs indexed by file path for O(1) lookups
    songs: HashMap<String, VirtualDJSong>,
}

static VDJ_CACHE: Lazy<tokio::sync::RwLock<Option<VdjCache>>> = Lazy::new(|| tokio::sync::RwLock::new(None));

/// Internal helper to load and parse the VDJ database with caching
async fn get_cached_database(custom_path: Option<PathBuf>) -> Result<HashMap<String, VirtualDJSong>, String> {
    let db_path = if let Some(path) = custom_path {
        path
    } else {
        find_vdj_database_path()
            .ok_or_else(|| "VirtualDJ database.xml not found".to_string())?
    };
    
    let metadata = std::fs::metadata(&db_path)
        .map_err(|e| format!("Failed to get database metadata: {}", e))?;
    let current_modified = metadata.modified()
        .map_err(|e| format!("Failed to get modification time: {}", e))?;

    // Check if we have a valid cache hit
    {
        let cache = VDJ_CACHE.read().await;
        if let Some(ref c) = *cache {
            if c.path == db_path && c.last_modified == current_modified {
                return Ok(c.songs.clone());
            }
        }
    }

    // Cache miss - Load and parse (Lock for writing)
    let mut cache = VDJ_CACHE.write().await;
    
    println!("[VDJ] Cache miss or stale. Loading database from: {:?}", db_path);
    
    let content = tokio::fs::read_to_string(&db_path)
        .await
        .map_err(|e| format!("Failed to read database.xml: {}", e))?;
    
    let database: VirtualDJDatabase = quick_xml::de::from_str(&content)
        .map_err(|e| format!("XML parsing error: {}", e))?;
    
    let mut song_map = HashMap::with_capacity(database.songs.len());
    for song in database.songs {
        song_map.insert(song.file_path.clone(), song);
    }

    *cache = Some(VdjCache {
        path: db_path,
        last_modified: current_modified,
        songs: song_map.clone(),
    });

    println!("[VDJ] Database indexed: {} tracks", song_map.len());
    Ok(song_map)
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
        // Fallback to Poi realEnd if SongLength is missing or 0
        let mut duration_secs = song.infos.as_ref()
            .and_then(|i| i.song_length.as_ref())
            .and_then(|s| s.parse::<f64>().ok())
            .unwrap_or(0.0);
            
        if duration_secs <= 0.0 {
            // Secondary fallback: check Pois for 'realEnd' or the last point
            if let Some(poi) = song.pois.iter().find(|p| p.name.as_deref() == Some("realEnd")) {
                duration_secs = poi.pos.as_ref().and_then(|p| p.parse::<f64>().ok()).unwrap_or(0.0);
            } else if let Some(last_poi) = song.pois.last() {
                // Last ditch effort: use the position of the last POI
                 duration_secs = last_poi.pos.as_ref().and_then(|p| p.parse::<f64>().ok()).unwrap_or(0.0);
            }
        }
        
        let duration = if duration_secs > 0.1 { Some(duration_secs.round() as i32) } else { None };
        
        if duration.is_none() {
            println!("[VDJ] Warning: No duration found for track: {}", song.file_path);
        }

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
async fn import_virtualdj_library(xml_path: String) -> Result<Vec<VirtualDJTrack>, String> {
    let path = PathBuf::from(xml_path);
    let song_map = get_cached_database(Some(path)).await?;
    
    // Convert VirtualDJSong to VirtualDJTrack
    let tracks: Vec<VirtualDJTrack> = song_map.into_values().map(|s| s.into()).collect();
    
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
fn read_virtualdj_history(custom_path: Option<String>) -> Result<Option<HistoryTrack>, String> {
    // If custom path is provided and not "auto", use it directly
    let history_path = if let Some(ref path_str) = custom_path {
        if path_str != "auto" && !path_str.is_empty() {
            let custom = std::path::PathBuf::from(path_str);
            if custom.exists() {
                println!("[VDJ] Using custom history path: {:?}", custom);
                custom
            } else {
                println!("[VDJ] Custom path not found, falling back to auto-detect: {:?}", custom);
                find_latest_history_file()?
            }
        } else {
            find_latest_history_file()?
        }
    } else {
        find_latest_history_file()?
    };
    
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

/// Find the latest VDJ history file using auto-detection
fn find_latest_history_file() -> Result<std::path::PathBuf, String> {
    // Determine home directory securely across OS
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .map_err(|_| "Could not determine home directory".to_string())?;

    let path = std::path::PathBuf::from(&home);

    // Potential history locations (Priority order)
    let candidates = vec![
        // 1. Standard Documents location (Windows & macOS Modern)
        path.join("Documents").join("VirtualDJ").join("History"),
        
        // 2. macOS Legacy / Root location
        path.join("Library").join("Application Support").join("VirtualDJ").join("History"),
    ];

    // Find first existing directory
    let history_dir = candidates.into_iter()
        .find(|p| p.exists())
        .ok_or_else(|| "VirtualDJ History folder not found".to_string())?;

    println!("[VDJ] Reading history from: {:?}", history_dir);
    
    // Find the most recently modified .m3u file
    let history_path = std::fs::read_dir(&history_dir)
        .map_err(|e| format!("Failed to read history directory: {}", e))?
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.is_file() && path.extension().map_or(false, |ext| ext == "m3u"))
        .max_by_key(|path| std::fs::metadata(path).and_then(|m| m.modified()).ok())
        .ok_or_else(|| "No history files found".to_string())?;
    
    Ok(history_path)
}

/// Metadata returned from VDJ database lookup (for ghost tracks)
#[derive(Debug, Serialize)]
pub struct VdjTrackMetadata {
    bpm: Option<f64>,
    key: Option<String>,
    volume: Option<f64>,
}

/// Find VirtualDJ database.xml location
fn find_vdj_database_path() -> Option<std::path::PathBuf> {
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .ok()?;
    
    let path = std::path::PathBuf::from(&home);
    
    let candidates = vec![
        // 1. Standard Documents location (Windows & macOS Modern)
        path.join("Documents").join("VirtualDJ").join("database.xml"),
        // 2. macOS Legacy location
        path.join("Library").join("Application Support").join("VirtualDJ").join("database.xml"),
        // 3. Windows AppData
        path.join("AppData").join("Local").join("VirtualDJ").join("database.xml"),
    ];
    
    candidates.into_iter().find(|p| p.exists())
}

/// Lookup track metadata from VDJ database.xml by file path
/// Used to get BPM/key for tracks not imported into Pika! library
#[tauri::command]
async fn lookup_vdj_track_metadata(file_path: String) -> Result<Option<VdjTrackMetadata>, String> {
    let song_map = get_cached_database(None).await?;
    
    // Find matching song by file path (case-insensitive on Windows)
    let song = if cfg!(target_os = "windows") {
        // Linear search for case-insensitivity on Windows if map lookup fails
        // In practice, VirtualDJ usually keeps consistent casing in its own DB,
        // but it's safer to have a fallback or normalization.
        song_map.get(&file_path).cloned().or_else(|| {
            song_map.values().find(|s| s.file_path.eq_ignore_ascii_case(&file_path)).cloned()
        })
    } else {
        song_map.get(&file_path).cloned()
    };
    
    match song {
        Some(s) => {
            let bpm = s.scan.as_ref()
                .and_then(|scan| scan.bpm.as_ref())
                .and_then(|b| b.parse::<f64>().ok())
                .map(|beat_period| if beat_period > 0.0 { 60.0 / beat_period } else { 0.0 });
            
            let key = s.scan.as_ref()
                .and_then(|scan| scan.key.clone());
            
            let volume = s.scan.as_ref()
                .and_then(|scan| scan.volume.as_ref())
                .and_then(|v| v.parse::<f64>().ok());
            
            println!("[VDJ] Found metadata: bpm={:?}, key={:?}, volume={:?}", bpm, key, volume);
            
            Ok(Some(VdjTrackMetadata { bpm, key, volume }))
        }
        None => {
            println!("[VDJ] Track not found in database: {}", file_path);
            Ok(None)
        }
    }
}

/// Get the local network IP address for LAN sharing
/// Returns the first non-loopback IPv4 address found
#[tauri::command]
fn get_local_ip() -> Option<String> {
    local_ip_address::local_ip().ok().map(|ip| ip.to_string())
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
        .invoke_handler(tauri::generate_handler![
            import_virtualdj_library, 
            read_virtualdj_history, 
            lookup_vdj_track_metadata, 
            get_local_ip
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_convert_virtualdj_bpm() {
        // VDJ stores 60 / BPM
        assert_eq!(convert_virtualdj_bpm("0.5"), Some("120.0".to_string()));
        assert_eq!(convert_virtualdj_bpm("1.0"), Some("60.0".to_string()));
        // 60 / 0.479 = 125.26... -> 125.3
        assert_eq!(convert_virtualdj_bpm("0.479"), Some("125.3".to_string()));
    }
}

