use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Instant;

use serde::Deserialize;
use tauri::{Emitter, State};

use crate::model::*;
use crate::scanner::{self, ScanData};
use crate::util::now_ms;

#[derive(Clone, Default)]
pub struct AppState {
    pub scan: Arc<Mutex<Option<Arc<ScanData>>>>,
    pub cancel: Arc<AtomicBool>,
    pub scanning: Arc<AtomicBool>,
}

impl AppState {
    fn snapshot(&self) -> Option<Arc<ScanData>> {
        self.scan.lock().ok().and_then(|guard| guard.clone())
    }
}

struct ScanGuard(Arc<AtomicBool>);
impl Drop for ScanGuard {
    fn drop(&mut self) {
        self.0.store(false, Ordering::SeqCst);
    }
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct FileQuery {
    pub tag: Option<String>,
    pub category: Option<String>,
    pub ext: Option<String>,
    pub folder: Option<String>,
    pub min_size: Option<u64>,
    pub older_than_days: Option<u64>,
    pub query: Option<String>,
    pub sort: Option<String>,
    pub direction: Option<String>,
    pub offset: usize,
    pub limit: usize,
}

#[tauri::command]
pub fn quick_locations() -> Vec<QuickLocation> {
    let mut items: Vec<QuickLocation> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    let mut push = |label: &str, path: Option<PathBuf>, kind: &str, items: &mut Vec<QuickLocation>| {
        let Some(path) = path else { return };
        if !path.exists() {
            return;
        }
        let key = path.to_string_lossy().to_lowercase();
        if !seen.insert(key) {
            return;
        }
        items.push(QuickLocation {
            label: label.to_string(),
            path: path.to_string_lossy().to_string(),
            kind: kind.to_string(),
        });
    };

    push(
        "Pasta pessoal",
        dirs::home_dir(),
        "folder",
        &mut items,
    );
    push("Downloads", dirs::download_dir(), "folder", &mut items);
    push("Documentos", dirs::document_dir(), "folder", &mut items);
    push("Área de trabalho", dirs::desktop_dir(), "folder", &mut items);
    push("Imagens", dirs::picture_dir(), "folder", &mut items);
    push("Vídeos", dirs::video_dir(), "folder", &mut items);
    push("Música", dirs::audio_dir(), "folder", &mut items);
    push(
        "Arquivos temporários",
        Some(std::env::temp_dir()),
        "temp",
        &mut items,
    );

    for letter in b'A'..=b'Z' {
        let path = format!("{}:\\", letter as char);
        if Path::new(&path).exists() {
            let key = path.to_lowercase();
            if seen.insert(key) {
                items.push(QuickLocation {
                    label: format!("Disco {}:", letter as char),
                    path,
                    kind: "drive".to_string(),
                });
            }
        }
    }

    items
}

#[tauri::command]
pub async fn scan_folder(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<ScanSummary, String> {
    let st = state.inner().clone();
    if st.scanning.swap(true, Ordering::SeqCst) {
        return Err("Já existe uma varredura em andamento.".into());
    }
    let _guard = ScanGuard(st.scanning.clone());
    st.cancel.store(false, Ordering::SeqCst);

    let root = PathBuf::from(&path);
    if !root.is_dir() {
        return Err(format!("A pasta não existe ou não pode ser lida: {path}"));
    }

    let cancel = st.cancel.clone();
    let handle = app.clone();
    let emit_lock = Arc::new(Mutex::new(Instant::now() - std::time::Duration::from_secs(1)));

    let result = tauri::async_runtime::spawn_blocking(move || {
        let emit_lock = emit_lock.clone();
        let progress = move |phase: &str, files: usize, bytes: u64, current: &str| {
            let now = Instant::now();
            {
                let Ok(mut last) = emit_lock.lock() else { return };
                if now.duration_since(*last).as_millis() < 120 {
                    return;
                }
                *last = now;
            }
            let _ = handle.emit(
                "scan-progress",
                ScanProgress {
                    phase: phase.to_string(),
                    files,
                    bytes,
                    current: current.to_string(),
                },
            );
        };
        scanner::scan(&root, &cancel, &progress)
    })
    .await
    .map_err(|error| format!("Falha inesperada na varredura: {error}"))?;

    let data = match result {
        Ok(data) => data,
        Err(error) if error == "scan_cancelled" => return Err("Varredura cancelada.".into()),
        Err(error) => return Err(error),
    };

    let summary = data.summary.clone();
    {
        let mut guard = st
            .scan
            .lock()
            .map_err(|_| "O estado interno do myscan ficou inconsistente.".to_string())?;
        *guard = Some(Arc::new(data));
    }
    Ok(summary)
}

#[tauri::command]
pub fn cancel_scan(state: State<'_, AppState>) {
    state.cancel.store(true, Ordering::SeqCst);
}

#[tauri::command]
pub fn scan_status(state: State<'_, AppState>) -> bool {
    state.scanning.load(Ordering::SeqCst)
}

/// Árvore agregada de pastas (mapa de espaço), pronta para o treemap.
#[tauri::command]
pub fn folder_tree(state: State<'_, AppState>) -> Result<TreeDir, String> {
    let data = state
        .snapshot()
        .ok_or_else(|| "Nenhuma varredura disponível. Escaneie uma pasta primeiro.".to_string())?;
    Ok(data.tree.clone())
}

#[tauri::command]
pub fn query_files(state: State<'_, AppState>, query: FileQuery) -> Result<FilePage, String> {
    let data = state
        .snapshot()
        .ok_or_else(|| "Nenhuma varredura disponível. Escaneie uma pasta primeiro.".to_string())?;

    let now = now_ms();
    let search = query
        .query
        .as_ref()
        .map(|value| value.trim().to_lowercase())
        .filter(|value| !value.is_empty());

    let mut items: Vec<&FileEntry> = data
        .files
        .iter()
        .filter(|file| matches_query(file, &query, now, search.as_deref()))
        .collect();

    let sort = query.sort.as_deref().unwrap_or("size");
    items.sort_by(|a, b| match sort {
        "name" => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
        "modified" => a.modified.cmp(&b.modified),
        "category" => a.category.cmp(&b.category),
        _ => a.size.cmp(&b.size),
    });
    if query.direction.as_deref() != Some("asc") {
        items.reverse();
    }

    let total = items.len();
    let offset = query.offset.min(total);
    let limit = if query.limit == 0 { 100 } else { query.limit.min(500) };
    let end = (offset + limit).min(total);

    Ok(FilePage {
        total,
        offset,
        limit,
        items: items[offset..end].iter().map(|file| (*file).clone()).collect(),
    })
}

fn matches_query(file: &FileEntry, query: &FileQuery, now: u64, search: Option<&str>) -> bool {
    if let Some(tag) = &query.tag {
        if !file.tags.iter().any(|value| value == tag) {
            return false;
        }
    }
    if let Some(category) = &query.category {
        if &file.category != category {
            return false;
        }
    }
    if let Some(ext) = &query.ext {
        let current = if file.ext.is_empty() { "none" } else { file.ext.as_str() };
        if current != ext.as_str() {
            return false;
        }
    }
    if let Some(folder) = &query.folder {
        if !in_folder(&file.path, folder) {
            return false;
        }
    }
    if let Some(min_size) = query.min_size {
        if file.size < min_size {
            return false;
        }
    }
    if let Some(days) = query.older_than_days {
        if file.modified == 0 {
            return false;
        }
        let age_ms = now.saturating_sub(file.modified);
        if age_ms < days * 86_400_000 {
            return false;
        }
    }
    if let Some(term) = search {
        let haystack = file.path.to_lowercase();
        if !haystack.contains(term) {
            return false;
        }
    }
    true
}

fn in_folder(path: &str, folder: &str) -> bool {
    let path = path.to_lowercase();
    let folder = folder.trim_end_matches(['\\', '/']).to_lowercase();
    if path == folder {
        return true;
    }
    path.starts_with(&folder)
        && path
            .as_bytes()
            .get(folder.len())
            .map(|byte| *byte == b'\\' || *byte == b'/')
            .unwrap_or(false)
}

#[tauri::command]
pub async fn trash_items(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<TrashResult, String> {
    let data = state
        .snapshot()
        .ok_or_else(|| "Nenhuma varredura disponível.".to_string())?;
    let root = data.root.clone();
    let root_canonical = root.canonicalize().unwrap_or(root);

    tauri::async_runtime::spawn_blocking(move || {
        let mut result = TrashResult {
            removed: 0,
            bytes: 0,
            failed: Vec::new(),
        };

        for path in paths {
            let buffer = PathBuf::from(&path);
            let canonical = buffer.canonicalize().unwrap_or_else(|_| buffer.clone());

            if canonical == root_canonical {
                result
                    .failed
                    .push(format!("{path}: é a raiz da varredura, ignorada"));
                continue;
            }
            if !canonical.starts_with(&root_canonical) {
                result.failed.push(format!(
                    "{path}: está fora da pasta analisada, ignorado"
                ));
                continue;
            }

            let size = path_size(&canonical);
            match trash::delete(&canonical) {
                Ok(()) => {
                    result.removed += 1;
                    result.bytes += size;
                }
                Err(error) => result.failed.push(format!("{path}: {error}")),
            }
        }

        result
    })
    .await
    .map_err(|error| format!("Falha ao mover para a lixeira: {error}"))
}

fn path_size(path: &Path) -> u64 {
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(_) => return 0,
    };
    if metadata.is_file() {
        return metadata.len();
    }
    if !metadata.is_dir() {
        return 0;
    }
    let mut total = 0u64;
    for entry in walkdir::WalkDir::new(path).follow_links(false).into_iter().flatten() {
        if entry.file_type().is_file() {
            if let Ok(metadata) = entry.metadata() {
                total += metadata.len();
            }
        }
    }
    total
}
