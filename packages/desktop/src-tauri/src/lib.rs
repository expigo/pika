// Pika! Desktop Application

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use once_cell::sync::Lazy;
use std::path::PathBuf;
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher, Event, EventKind};
use tauri::{AppHandle, Emitter};
use std::sync::Mutex;

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
    // 🛡️ Issue 43 Fix: IgnoredAny wastes deserialization. 
    // Removed _comment field entirely (Serde ignores unknown fields by default).
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

struct VdjWatcherState {
    watcher: Mutex<Option<RecommendedWatcher>>,
}

/// Internal helper to load and parse the VDJ database with caching
async fn get_cached_database(custom_path: Option<PathBuf>) -> Result<HashMap<String, VirtualDJSong>, String> {

    let db_path = if let Some(path) = custom_path {
        path
    } else {
        find_vdj_database_path(None)
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
    
    // println!("[VDJ] Cache miss or stale. Loading database from: {:?}", db_path);
    
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

    // println!("[VDJ] Database indexed: {} tracks", song_map.len());
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
/// Convert VirtualDJ BPM format to actual BPM
/// VirtualDJ stores BPM as beat period in seconds (seconds per beat)
/// Formula: actual_bpm = 60 / stored_value
fn convert_virtualdj_bpm(bpm_str: &str) -> Option<String> {
    let beat_period: f64 = bpm_str.parse().ok()?;
    convert_virtualdj_bpm_f64(beat_period)
}

/// 🛡️ Issue 44 Fix: Extracted common logic for f64 input
fn convert_virtualdj_bpm_f64(beat_period: f64) -> Option<String> {
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
    
    // Convert VirtualDJSong to VirtualDJTrack and filter non-audio
    let tracks: Vec<VirtualDJTrack> = song_map.into_values()
        .map(|s| s.into())
        .filter(|t: &VirtualDJTrack| {
            // Filter out common video formats
            let ext = std::path::Path::new(&t.file_path)
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.to_lowercase())
                .unwrap_or_default();
            !matches!(ext.as_str(), "mov" | "mp4" | "m4v" | "avi" | "mkv" | "mpg" | "mpeg" | "flv" | "webm")
        })
        .collect();
    
    Ok(tracks)
}

/// Read the VirtualDJ history file for the current day
#[derive(Debug, Serialize)]
pub struct HistoryTrack {
    artist: String,
    title: String,
    file_path: String,
    timestamp: u64,
    bpm: Option<f64>,
    key: Option<String>,
}

/// Read ALL entries from the VirtualDJ history file (not just the last one)
#[tauri::command]
async fn read_virtualdj_history_full(
    custom_path: Option<String>,
    max_entries: Option<usize>
) -> Result<Vec<HistoryTrack>, String> {
    let history_path = if let Some(ref path_str) = custom_path {
        if path_str != "auto" && !path_str.is_empty() {
            let custom = std::path::PathBuf::from(path_str);
            if custom.exists() {
                custom
            } else {
                find_latest_history_file()?
            }
        } else {
            find_latest_history_file()?
        }
    } else {
        find_latest_history_file()?
    };
    
    let content = std::fs::read_to_string(&history_path)
        .map_err(|e| format!("Failed to read history: {}", e))?;
    
    // Attempt to load VDJ database for metadata enrichment
    // We don't fail if DB is missing, we just skip enrichment
    let song_map = get_cached_database(None).await.ok();

    let mut tracks = Vec::new();
    let lines: Vec<&str> = content.lines().collect();
    
    // Process in reverse (most recent first), but pairs of lines
    let mut i = lines.len();
    while i >= 2 {
        i -= 2;
        let ext_line = lines[i];
        let file_path_line = lines[i + 1];
        
        if !ext_line.starts_with("#EXTVDJ:") {
            continue;
        }
        
        let extract_tag = |content: &str, start_tag: &str, end_tag: &str| -> Option<String> {
            let start_idx = content.find(start_tag)? + start_tag.len();
            let end_idx = content.find(end_tag)?;
            if start_idx >= end_idx { return None; }
            Some(content[start_idx..end_idx].to_string())
        };
        
        let artist = extract_tag(ext_line, "<artist>", "</artist>")
            .unwrap_or_else(|| "Unknown".to_string());
        let title = extract_tag(ext_line, "<title>", "</title>")
            .unwrap_or_else(|| "Unknown".to_string());
        let timestamp: u64 = extract_tag(ext_line, "<lastplaytime>", "</lastplaytime>")
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        
        // Metadata enrichment
        let mut bpm = None;
        let mut key = None;

        if let Some(ref map) = song_map {
            // Try explicit path first, then case-insensitive scan if needed (Windows)
            let file_path = file_path_line.to_string();
            let song = if cfg!(target_os = "windows") {
                map.get(&file_path).cloned().or_else(|| {
                    map.values().find(|s| s.file_path.eq_ignore_ascii_case(&file_path)).cloned()
                })
            } else {
                map.get(&file_path).cloned()
            };

            if let Some(s) = song {
               bpm = s.scan.as_ref()
                    .and_then(|scan| scan.bpm.as_ref())
                    .and_then(|b| convert_virtualdj_bpm(b))
                    .and_then(|b_str| b_str.parse::<f64>().ok());
               key = s.scan.as_ref().and_then(|scan| scan.key.clone());
            }
        }

        tracks.push(HistoryTrack {
            artist,
            title,
            file_path: file_path_line.to_string(),
            timestamp,
            bpm,
            key,
        });
        
        // Respect max_entries limit (default 100)
        if let Some(max) = max_entries {
            if tracks.len() >= max {
                break;
            }
        }
    }
    
    // Return in chronological order (oldest first)
    tracks.reverse();
    
    Ok(tracks)
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
    
    // Parse the last entry using reverse iterator to avoid collecting all lines
    // 🛡️ Issue 37 Fix: Use iterator methods instead of collecting lines
    let mut lines_iter = content.trim().lines().rev();
    
    let file_path_line = match lines_iter.next() {
        Some(l) => l,
        None => return Ok(None),
    };
    
    // Check if it looks like a file path (basic heuristic) or if we just have one line
    // VDJ history usually has 2 lines per entry: #EXTVDJ:... then the path
    let ext_line = match lines_iter.next() {
        Some(l) => l,
        None => return Ok(None),
    };
    
    if !ext_line.starts_with("#EXTVDJ:") {
        return Ok(None);
    }

    let file_path = file_path_line.to_string();
    
    // 🛡️ Issue 36 Fix: Avoid format! allocations for known tags
    let extract_tag = |content: &str, start_tag: &str, end_tag: &str| -> Option<String> {
        let start_idx = content.find(start_tag)? + start_tag.len();
        let end_idx = content.find(end_tag)?;
        if start_idx >= end_idx { return None; }
        Some(content[start_idx..end_idx].to_string())
    };
    
    let artist = extract_tag(ext_line, "<artist>", "</artist>").unwrap_or_else(|| "Unknown".to_string());
    let title = extract_tag(ext_line, "<title>", "</title>").unwrap_or_else(|| "Unknown".to_string());
    let timestamp: u64 = extract_tag(ext_line, "<lastplaytime>", "</lastplaytime>")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    
    Ok(Some(HistoryTrack {
        artist,
        title,
        file_path,
        timestamp,
        bpm: None,
        key: None,
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

        // 3. Windows AppData location
        path.join("AppData").join("Local").join("VirtualDJ").join("History"),
    ];

    // Find first existing directory
    let history_dir = candidates.into_iter()
        .find(|p| p.exists())
        .ok_or_else(|| "VirtualDJ History folder not found".to_string())?;

    // println!("[VDJ] Reading history from: {:?}", history_dir);
    
    // Find the most recently modified .m3u file
    // Find the most recently modified .m3u file
    // 🛡️ Issue 42 Fix: Use DirEntry::metadata() to avoid re-stating every file
    let history_path = std::fs::read_dir(&history_dir)
        .map_err(|e| format!("Failed to read history directory: {}", e))?
        .filter_map(|entry| entry.ok())
        .filter(|entry| {
            let path = entry.path();
            path.is_file() && path.extension().map_or(false, |ext| ext == "m3u")
        })
        .max_by_key(|entry| entry.metadata().and_then(|m| m.modified()).ok())
        .map(|entry| entry.path())
        .ok_or_else(|| "No history files found".to_string())?;
    
    Ok(history_path)
}

/// Helper to check if a file is from today
fn is_file_today(path: &std::path::Path) -> bool {
    // Check filename content (YYYY-MM-DD.m3u)
    if let Some(name) = path.file_stem() {
        if let Some(name_str) = name.to_str() {
            let today = chrono::Local::now().format("%Y-%m-%d").to_string();
            return name_str == today;
        }
    }
    // Fallback to checking modification time if name doesn't match standard
    if let Ok(metadata) = path.metadata() {
        if let Ok(modified) = metadata.modified() {
            let now = std::time::SystemTime::now();
            if let Ok(duration) = now.duration_since(modified) {
                return duration.as_secs() < 24 * 60 * 60;
            }
        }
    }
    false
}

/// Metadata returned from VDJ database lookup (for ghost tracks)
#[derive(Debug, Serialize)]
pub struct VdjTrackMetadata {
    bpm: Option<f64>,
    key: Option<String>,
    volume: Option<f64>,
    duration: Option<i32>,
}

/// Find VirtualDJ database.xml location
fn find_vdj_database_path(hint_path: Option<&std::path::Path>) -> Option<std::path::PathBuf> {
    // 0. Use hint path (e.g. History folder) to find parent database.xml
    if let Some(hist_path) = hint_path {
        // If hist_path is a file (e.g. .../History/2026-02-03.m3u)
        // Parent is .../History. Parent of that is .../VirtualDJ
        if hist_path.is_file() {
             if let Some(hist_dir) = hist_path.parent() {
                 if let Some(vdj_root) = hist_dir.parent() {
                     let db = vdj_root.join("database.xml");
                     if db.exists() { return Some(db); }
                 }
             }
        } else if hist_path.is_dir() {
            // If hist_path is the History directory
             if let Some(vdj_root) = hist_path.parent() {
                 let db = vdj_root.join("database.xml");
                 if db.exists() { return Some(db); }
             }
        }
    }

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
                .and_then(|bp| convert_virtualdj_bpm_f64(bp))
                .and_then(|bpm_str| bpm_str.parse::<f64>().ok());
            
            let key = s.scan.as_ref()
                .and_then(|scan| scan.key.clone());
            
            let volume = s.scan.as_ref()
                .and_then(|scan| scan.volume.as_ref())
                .and_then(|v| v.parse::<f64>().ok());

            // Track length (seconds) from Infos.SongLength — the immediate, accurate duration
            // signal for Spotify version-matching (B3). Same parse as the library import.
            let duration = s.infos.as_ref()
                .and_then(|i| i.song_length.as_ref())
                .and_then(|sl| sl.parse::<f64>().ok())
                .filter(|d| *d > 0.1)
                .map(|d| d.round() as i32);

            Ok(Some(VdjTrackMetadata { bpm, key, volume, duration }))
        }
        None => {
            // println!("[VDJ] Track not found in database: {}", file_path);
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
        .manage(VdjWatcherState { watcher: Mutex::new(None) })
        .invoke_handler(tauri::generate_handler![
            import_virtualdj_library, 
            read_virtualdj_history,
            read_virtualdj_history_full,
            lookup_vdj_track_metadata, 
            get_local_ip,
            get_virtualdj_status,
            start_vdj_watcher,
            stop_vdj_watcher
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

#[derive(Debug, Serialize)]
pub struct VdjStatus {
    database_status: String, // "connected", "not_found", "error"
    database_path: Option<String>,
    database_track_count: usize,
    history_status: String, // "active", "searching", "error", "stale"
    history_file_name: Option<String>,
    history_track_count: usize,
    is_today: bool,
    error_details: Option<String>,
}

#[tauri::command]
async fn get_virtualdj_status(custom_history_path: Option<String>) -> Result<VdjStatus, String> {
    // 1. Analyze History first to get a hint for database location
    let (hist_status, hist_name, hist_count, hist_path_found, is_today, hist_error) = match find_latest_history_file() {
        Ok(path) => {
            let name = path.file_name().map(|n| n.to_string_lossy().to_string());
            let is_today = is_file_today(&path);
            
            // Count actual played tracks in today's session
            let count = std::fs::read_to_string(&path)
                .map(|c| c.lines().filter(|l| l.starts_with("#EXTVDJ:")).count())
                .unwrap_or(0);
            
            // If custom path is set in Settings (passed here via args?), we should rely on it.
            // But here we rely on auto-detection logic within find_latest which handles "auto" vs custom internally?
            // Wait, get_virtualdj_status receives custom_history_path.
            // If that is set, we should use it.
            
            // Actually, find_latest_history_file() as written doesn't take arguments, it just scans default dirs.
            // Ideally we pass the custom path logic here.
            
            // Refined Check Logic:
            let status = if is_today { "active" } else { "stale" };
            
            (status.to_string(), name, count, Some(path), is_today, None)
        },
        Err(e) => ("searching".to_string(), None, 0, None, false, Some(e))
    };

    // 1b. If custom history path is provided, override the auto-detected one for DB hint purposes
    let db_hint_path = if let Some(ref custom) = custom_history_path {
        if custom != "auto" {
             Some(PathBuf::from(custom))
        } else {
             hist_path_found.as_ref().map(|p| p.to_path_buf())
        }
    } else {
         hist_path_found.as_ref().map(|p| p.to_path_buf())
    };

    // 2. Analyze Database (The Library Source) using Hint
    // Note: get_cached_database expects "custom_path" to be the XML file itself, not a hint.
    // We need to resolve the generic "database.xml" path using our new finder.
    
    // We can't easily pass 'hint' to get_cached_database broadly without changing its signature everywhere.
    // Instead, let's resolve it here.
    let resolved_db_path = find_vdj_database_path(db_hint_path.as_deref());
    
    // We pass the resolved path as "custom_path" to get_cached_database to force it to use it.
    let (db_status, db_path, db_count, db_error) = match get_cached_database(resolved_db_path.clone()).await {
        Ok(map) => (
            "connected".to_string(), 
            Some(VDJ_CACHE.read().await.as_ref().map(|c| c.path.to_string_lossy().to_string()).unwrap_or_default()), 
            // Filter videos from count to match user expectation
            map.values().filter(|s| {
                 let ext = std::path::Path::new(&s.file_path)
                    .extension()
                    .and_then(|e| e.to_str())
                    .map(|e| e.to_lowercase())
                    .unwrap_or_default();
                !matches!(ext.as_str(), "mov" | "mp4" | "m4v" | "avi" | "mkv" | "mpg" | "mpeg" | "flv" | "webm")
            }).count(),
            None
        ),
        Err(e) => {
             if let Some(path) = resolved_db_path {
                ("error".to_string(), Some(path.to_string_lossy().to_string()), 0, Some(e))
             } else {
                 ("not_found".to_string(), None, 0, Some(e))
             }
        }
    };

    // Combine errors (prefer specific database error if connecting, or history error if searching failed)
    let error_details = db_error.or(hist_error);

    Ok(VdjStatus {
        database_status: db_status,
        database_path: db_path,
        database_track_count: db_count,
        history_status: hist_status,
        history_file_name: hist_name,
        history_track_count: hist_count,
        is_today,
        error_details,
    })
}

#[tauri::command]
async fn start_vdj_watcher(
    app: AppHandle,
    state: tauri::State<'_, VdjWatcherState>,
    custom_path: Option<String>,
) -> Result<String, String> {
    // 1. Resolve History Path
    let history_path = if let Some(ref path_str) = custom_path {
        if path_str != "auto" && !path_str.is_empty() {
             let custom = std::path::PathBuf::from(path_str);
             // If the user points to a specific file, watch its parent directory
             if custom.is_file() {
                 custom.parent().ok_or("Invalid file path")?.to_path_buf()
             } else {
                 custom
             }
        } else {
             // For auto, we find the DIRECTORY, not the file
             let file = find_latest_history_file()?;
             file.parent().ok_or("Invalid history path")?.to_path_buf()
        }
    } else {
        let file = find_latest_history_file()?;
        file.parent().ok_or("Invalid history path")?.to_path_buf()
    };

    if !history_path.exists() {
        return Err(format!("History directory not found: {:?}", history_path));
    }

    println!("[VDJ Watcher] Starting native watcher on: {:?}", history_path);

    // 2. Setup Watcher
    let app_handle = app.clone();

    let event_handler = move |res: Result<Event, notify::Error>| {
        match res {
            Ok(event) => {
                // We are interested in Modify or Create events on .m3u files
                let interesting = matches!(event.kind, EventKind::Modify(_) | EventKind::Create(_));
                if interesting {
                     for path in event.paths {
                         if let Some(ext) = path.extension() {
                             if ext == "m3u" {
                                 // Debounce/Logic handled by finding the *latest* file and reading it
                                 // We simply signal that "something changed in history"
                                 // The payload uses the standard logic to find the LATEST entry
                                 // 🛡️ Debounce/Race Condition Fix: Wait 100ms before reading
                                 // This ensures VDJ file flush is complete and avoids event storms
                                 let app_handle_clone = app_handle.clone();
                                 let path_clone = path.clone();
                                 
                                 tauri::async_runtime::spawn(async move {
                                     tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
                                     match read_virtualdj_history_internal(&path_clone) {
                                         Ok(Some(track)) => {
                                             let _ = app_handle_clone.emit("vdj-history-update", &track);
                                         },
                                         Ok(None) => {}, // Not a valid track line yet
                                         Err(e) => println!("[VDJ Watcher] Read error: {}", e),
                                     }
                                 });
                             }
                         }
                     }
                }
            },
            Err(e) => println!("[VDJ Watcher] Watch error: {:?}", e),
        }
    };

    let mut watcher = RecommendedWatcher::new(event_handler, Config::default())
        .map_err(|e| format!("Failed to create watcher: {}", e))?;

    watcher.watch(&history_path, RecursiveMode::NonRecursive)
        .map_err(|e| format!("Failed to watch directory: {}", e))?;

    // 3. Store watcher in state
    let mut state_val = state.watcher.lock().map_err(|_| "Failed to lock watcher mutex")?;
    *state_val = Some(watcher);

    Ok(format!("Watching {:?}", history_path))
}

#[tauri::command]
fn stop_vdj_watcher(state: tauri::State<'_, VdjWatcherState>) -> Result<(), String> {
    let mut state_val = state.watcher.lock().map_err(|_| "Failed to lock watcher mutex")?;
    if state_val.is_some() {
        *state_val = None; // Dropping the watcher stops it
        println!("[VDJ Watcher] Native watcher stopped");
    }
    Ok(())
}

/// Internal shared logic to read specific file
fn read_virtualdj_history_internal(path: &std::path::Path) -> Result<Option<HistoryTrack>, String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| e.to_string())?;
    
    let mut lines_iter = content.trim().lines().rev();
    
    let file_path_line = match lines_iter.next() {
        Some(l) => l,
        None => return Ok(None),
    };
    
    let ext_line = match lines_iter.next() {
        Some(l) => l,
        None => return Ok(None),
    };
    
    if !ext_line.starts_with("#EXTVDJ:") {
        return Ok(None);
    }

    let file_path = file_path_line.to_string();
    
    let extract_tag = |content: &str, start_tag: &str, end_tag: &str| -> Option<String> {
        let start_idx = content.find(start_tag)? + start_tag.len();
        let end_idx = content.find(end_tag)?;
        if start_idx >= end_idx { return None; }
        Some(content[start_idx..end_idx].to_string())
    };
    
    let artist = extract_tag(ext_line, "<artist>", "</artist>").unwrap_or_else(|| "Unknown".to_string());
    let title = extract_tag(ext_line, "<title>", "</title>").unwrap_or_else(|| "Unknown".to_string());
    let timestamp: u64 = extract_tag(ext_line, "<lastplaytime>", "</lastplaytime>")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0);
    
    Ok(Some(HistoryTrack {
        artist,
        title,
        file_path,
        timestamp,
        bpm: None,
        key: None,
    }))
}

