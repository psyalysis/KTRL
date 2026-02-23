use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::str::FromStr;
use std::sync::Once;
use tauri::Manager;
use tauri::Emitter;
use tauri::path::BaseDirectory;
use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};

#[cfg(windows)]
fn hide_windows_border_impl(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        use raw_window_handle::{HasWindowHandle, RawWindowHandle};
        if let Ok(handle) = window.window_handle() {
            let raw: RawWindowHandle = handle.as_raw();
            if let RawWindowHandle::Win32(win) = raw {
                let hwnd = win.hwnd.get();
                use windows_sys::Win32::Foundation::COLORREF;
                use windows_sys::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_BORDER_COLOR};
                const DWMWA_COLOR_NONE: COLORREF = 0x00FF_FFFE; // suppress border
                let mut color = DWMWA_COLOR_NONE;
                unsafe {
                    DwmSetWindowAttribute(
                        hwnd as _,
                        DWMWA_BORDER_COLOR as u32,
                        &mut color as *mut _ as *const _,
                        std::mem::size_of::<COLORREF>() as u32,
                    );
                }
            }
        }
    }
}

#[cfg(not(windows))]
fn hide_windows_border_impl(_app: &tauri::AppHandle) {}

#[tauri::command]
fn hide_windows_border(app: tauri::AppHandle) {
    static ONCE: Once = Once::new();
    ONCE.call_once(|| hide_windows_border_impl(&app));
}

/// Open a path (file or folder) with the system default application (like double-click in Explorer).
#[tauri::command]
fn open_path_with_default(path: String) -> Result<(), String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("path is empty".to_string());
    }
    open::that(path).map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize, Serialize)]
struct MenuItem {
    action: Option<String>,
    name: Option<String>,
    label: Option<String>,
    icon: Option<String>,
    /// Single key: URL or path; frontend splits into url/path
    open: Option<String>,
    url: Option<String>,
    path: Option<String>,
    #[serde(rename = "isClose")]
    is_close: Option<bool>,
    children: Option<Vec<MenuItem>>,
    #[serde(rename = "type")]
    item_type: Option<String>,
    options: Option<Vec<String>>,
    default: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Serialize)]
struct MenuRoot {
    root: Option<Vec<MenuItem>>,
}

fn menu_path(handle: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    if let Ok(p) = handle.path().resolve("menu.yaml", BaseDirectory::Resource) {
        if p.exists() {
            return Ok(p);
        }
    }
    let dev_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("resources").join("menu.yaml");
    if dev_path.exists() {
        return Ok(dev_path);
    }
    Err("menu.yaml not found (no resource dir in dev or missing file)".to_string())
}

fn shortcuts_path(handle: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = handle.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("shortcuts.yaml"))
}

fn hidden_shortcuts_path(handle: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = handle.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("hidden_shortcuts.yaml"))
}

#[derive(Debug, Default, Deserialize, Serialize)]
struct UserShortcut {
    name: Option<String>,
    open: String,
}

#[tauri::command]
fn add_user_shortcut(handle: tauri::AppHandle, name: Option<String>, open_value: String) -> Result<(), String> {
    let path = shortcuts_path(&handle)?;
    let open_value = open_value.trim().to_string();
    if open_value.is_empty() {
        return Err("open (URL or path) is required".to_string());
    }
    let mut list: Vec<UserShortcut> = if path.exists() {
        let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_yaml::from_str(&raw).unwrap_or_default()
    } else {
        Vec::new()
    };
    let label = name
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| {
            if open_value.starts_with("http://") || open_value.starts_with("https://") {
                open_value.clone()
            } else {
                std::path::Path::new(&open_value)
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Shortcut")
                    .to_string()
            }
        });
    list.push(UserShortcut { name: Some(label), open: open_value });
    let raw = serde_yaml::to_string(&list).map_err(|e| e.to_string())?;
    std::fs::write(&path, raw).map_err(|e| e.to_string())?;
    Ok(())
}

fn shortcut_icon(open: &str) -> &'static str {
    let open = open.trim();
    if open.starts_with("http://") || open.starts_with("https://") {
        return "link";
    }
    let ext = std::path::Path::new(open)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();
    const AUDIO: &[&str] = &["mp3", "wav", "ogg", "flac", "aac", "m4a", "wma", "opus", "webm"];
    const VIDEO: &[&str] = &["mp4", "mkv", "avi", "mov", "wmv", "webm", "flv", "m4v", "mpeg", "mpg"];
    const IMAGE: &[&str] = &["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "ico", "tiff", "tif", "heic", "avif"];
    if AUDIO.contains(&ext.as_str()) {
        return "music-note";
    }
    if VIDEO.contains(&ext.as_str()) {
        return "video";
    }
    if IMAGE.contains(&ext.as_str()) {
        return "camera";
    }
    "doc"
}

fn normalize_open_for_compare(s: &str) -> String {
    let s = s.trim();
    #[cfg(windows)]
    {
        s.replace('/', std::path::MAIN_SEPARATOR_STR)
    }
    #[cfg(not(windows))]
    {
        s.to_string()
    }
}

#[tauri::command]
fn remove_user_shortcut(handle: tauri::AppHandle, open_value: String) -> Result<(), String> {
    let path = shortcuts_path(&handle)?;
    let open_value = open_value.trim();
    if open_value.is_empty() {
        return Err("open value is required".to_string());
    }
    let open_normalized = normalize_open_for_compare(open_value);
    let mut list: Vec<UserShortcut> = if path.exists() {
        let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_yaml::from_str(&raw).unwrap_or_default()
    } else {
        return Ok(());
    };
    let before = list.len();
    list.retain(|u| normalize_open_for_compare(u.open.as_str()) != open_normalized);
    if list.len() < before {
        let raw = serde_yaml::to_string(&list).map_err(|e| e.to_string())?;
        std::fs::write(&path, raw).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn remove_default_shortcut(handle: tauri::AppHandle, action: String) -> Result<(), String> {
    let path = hidden_shortcuts_path(&handle)?;
    let action = action.trim().to_string();
    if action.is_empty() {
        return Err("action is required".to_string());
    }
    let mut list: Vec<String> = if path.exists() {
        let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        serde_yaml::from_str(&raw).unwrap_or_default()
    } else {
        Vec::new()
    };
    if !list.contains(&action) {
        list.push(action);
        let raw = serde_yaml::to_string(&list).map_err(|e| e.to_string())?;
        std::fs::write(&path, raw).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_menu(handle: tauri::AppHandle) -> Result<serde_json::Value, String> {
    let path = menu_path(&handle)?;
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let menu: MenuRoot = serde_yaml::from_str(&raw).map_err(|e| e.to_string())?;
    let mut value = serde_json::to_value(menu).map_err(|e| e.to_string())?;

    let user_list: Vec<UserShortcut> = match shortcuts_path(&handle) {
        Ok(p) if p.exists() => {
            let raw = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
            serde_yaml::from_str(&raw).unwrap_or_default()
        }
        _ => Vec::new(),
    };

    let hidden: Vec<String> = match hidden_shortcuts_path(&handle) {
        Ok(p) if p.exists() => {
            let raw = std::fs::read_to_string(&p).map_err(|e| e.to_string())?;
            serde_yaml::from_str(&raw).unwrap_or_default()
        }
        _ => Vec::new(),
    };

    let root = value.get_mut("root").and_then(|r| r.as_array_mut());
    if let Some(root) = root {
        for item in root.iter_mut() {
            if item.get("action").and_then(|a| a.as_str()) != Some("shortcuts") {
                continue;
            }
            let Some(children) = item.get_mut("children").and_then(|c| c.as_array_mut()) else {
                break;
            };
            children.retain(|c| {
                let a = c.get("action").and_then(|a| a.as_str()).unwrap_or("");
                !hidden.iter().any(|h| h.as_str() == a)
            });
            let inject: Vec<serde_json::Value> = user_list
                    .iter()
                    .enumerate()
                    .map(|(i, u)| {
                        serde_json::json!({
                            "action": format!("user-{}", i),
                            "name": u.name.as_deref().unwrap_or("Shortcut"),
                            "icon": shortcut_icon(&u.open),
                            "open": u.open
                        })
                    })
                    .collect();
            for (idx, child) in children.iter().enumerate() {
                if child.get("action").and_then(|a| a.as_str()) == Some("edit-shortcuts") {
                    for entry in inject.into_iter().rev() {
                        children.insert(idx, entry);
                    }
                    break;
                }
            }
            break;
        }
    }

    Ok(value)
}

fn icon_path(handle: &tauri::AppHandle, id: &str) -> Option<std::path::PathBuf> {
    let p = handle
        .path()
        .resolve(format!("assets/icons/{}.svg", id), BaseDirectory::Resource)
        .ok()
        .filter(|p| p.exists());
    if p.is_some() {
        return p;
    }
    let dev_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("resources")
        .join("assets")
        .join("icons")
        .join(format!("{}.svg", id));
    if dev_path.exists() {
        Some(dev_path)
    } else {
        None
    }
}

#[tauri::command]
fn get_icon(handle: tauri::AppHandle, id: String) -> Result<Option<String>, String> {
    let path = match icon_path(&handle, &id) {
        Some(p) => p,
        None => return Ok(None),
    };
    let mut svg = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    if let Some(end) = svg.find("?>") {
        svg = svg[end + 2..].trim_start().to_string();
    }
    Ok(Some(svg))
}

const SHORTCUTS: &[(&str, &str)] = &[
    ("F1", "KnL"),
    ("F2", "KnC"),
    ("F3", "KnR"),
    ("F4", "K1"),
    ("F5", "K2"),
    ("F6", "K3"),
];

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let shortcut_ids: HashMap<u32, String> = SHORTCUTS
        .iter()
        .map(|(accel, id)| (Shortcut::from_str(accel).unwrap().id(), (*id).to_string()))
        .collect();

    let shortcut_strs: Vec<&str> = SHORTCUTS.iter().map(|(a, _)| *a).collect();
    let global_shortcut_plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_shortcuts(shortcut_strs)
        .expect("parse shortcuts")
        .with_handler(move |app, shortcut, event| {
            if event.state == ShortcutState::Pressed {
                if let Some(id) = shortcut_ids.get(&shortcut.id()) {
                    let payload = serde_json::json!({ "id": id, "state": "down" });
                    if let Some(w) = app.get_webview_window("main") {
                        let _ = w.set_focus();
                        let _ = w.emit("ktrl-key", payload);
                    }
                }
            }
        })
        .build();

    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            let _ = app.run_on_main_thread(move || {
                #[cfg(windows)]
                hide_windows_border_impl(&handle);
            });
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.set_focus();
            }
        }))
        .plugin(global_shortcut_plugin)
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![get_menu, get_icon, add_user_shortcut, remove_user_shortcut, remove_default_shortcut, hide_windows_border, open_path_with_default])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
