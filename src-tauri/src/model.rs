use serde::{Deserialize, Serialize};

/// Item agregado usado nos gráficos (categorias, extensões, idades, pastas e tags).
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Bucket {
    pub key: String,
    pub label: String,
    pub bytes: u64,
    pub count: usize,
    pub color: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub id: u32,
    pub path: String,
    pub name: String,
    pub ext: String,
    pub size: u64,
    /// Timestamp em milissegundos (epoch).
    pub modified: u64,
    pub created: u64,
    pub category: String,
    pub depth: u32,
    pub hidden: bool,
    pub tags: Vec<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct DuplicateGroup {
    pub hash: String,
    pub size: u64,
    pub count: usize,
    pub wasted: u64,
    pub paths: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct FileFilter {
    pub tag: Option<String>,
    pub category: Option<String>,
    pub ext: Option<String>,
    pub folder: Option<String>,
    pub min_size: Option<u64>,
    pub older_than_days: Option<u64>,
    pub query: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Insight {
    pub id: String,
    /// danger | warn | info | good
    pub tone: String,
    pub title: String,
    pub detail: String,
    pub bytes: u64,
    pub count: usize,
    /// trash | filter
    pub action: String,
    pub filter: Option<FileFilter>,
    pub targets: Vec<String>,
    /// files | folders
    pub target_kind: String,
    pub target_bytes: u64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScanSummary {
    pub root: String,
    pub root_name: String,
    pub scanned_at: u64,
    pub duration_ms: u64,
    pub files: usize,
    pub dirs: usize,
    pub bytes: u64,
    pub errors: usize,
    pub categories: Vec<Bucket>,
    pub extensions: Vec<Bucket>,
    pub ages: Vec<Bucket>,
    pub folders: Vec<Bucket>,
    pub largest: Vec<FileEntry>,
    pub duplicates: Vec<DuplicateGroup>,
    pub duplicate_groups: usize,
    pub duplicate_bytes: u64,
    pub tags: Vec<Bucket>,
    pub reclaimable_bytes: u64,
    pub reclaimable_count: usize,
    pub insights: Vec<Insight>,
}

/// Nó da árvore de pastas usada pelo mapa de espaço.
#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TreeDir {
    pub name: String,
    pub path: String,
    /// dir | files | rest
    pub kind: String,
    pub bytes: u64,
    pub files: usize,
    pub dirs: usize,
    pub children: Vec<TreeDir>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ScanProgress {
    pub phase: String,
    pub files: usize,
    pub bytes: u64,
    pub current: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct QuickLocation {
    pub label: String,
    pub path: String,
    pub kind: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FilePage {
    pub total: usize,
    pub offset: usize,
    pub limit: usize,
    pub items: Vec<FileEntry>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TrashResult {
    pub removed: usize,
    pub bytes: u64,
    pub failed: Vec<String>,
}
