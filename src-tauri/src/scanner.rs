use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

use rayon::prelude::*;
use walkdir::WalkDir;

use crate::classify;
use crate::insights;
use crate::model::*;
use crate::util::now_ms;

pub const OLD_AGE_MS: u64 = 730 * 24 * 60 * 60 * 1000;
pub const LARGE_BYTES: u64 = 100 * 1024 * 1024;
const MAX_HASH_FILES: usize = 3000;
const MAX_HASH_SIZE: u64 = 512 * 1024 * 1024;

type ProgressFn<'a> = &'a (dyn Fn(&str, usize, u64, &str) + Sync);

pub struct ScanData {
    pub root: PathBuf,
    pub files: Vec<FileEntry>,
    pub summary: ScanSummary,
    pub tree: TreeDir,
}

struct RawPath {
    path: PathBuf,
}

pub fn scan(root: &Path, cancel: &AtomicBool, progress: ProgressFn) -> Result<ScanData, String> {
    let started = Instant::now();
    let root = std::path::absolute(root).unwrap_or_else(|_| root.to_path_buf());
    if !root.is_dir() {
        return Err("A pasta selecionada não existe ou não é acessível.".into());
    }

    progress("walking", 0, 0, &root.to_string_lossy());

    let mut raw: Vec<RawPath> = Vec::new();
    let mut dirs = 0usize;
    let mut errors = 0usize;

    let walker = WalkDir::new(&root)
        .max_depth(96)
        .follow_links(false)
        .into_iter()
        .filter_entry(|entry| {
            if entry.depth() == 0 {
                return true;
            }
            let name = entry.file_name().to_string_lossy().to_lowercase();
            if entry.file_type().is_dir()
                && matches!(
                    name.as_str(),
                    "$recycle.bin" | "system volume information" | "recycle.bin"
                )
            {
                return false;
            }
            true
        });

    for item in walker {
        if cancel.load(Ordering::Relaxed) {
            return Err("scan_cancelled".into());
        }
        let entry = match item {
            Ok(entry) => entry,
            Err(_) => {
                errors += 1;
                continue;
            }
        };
        if entry.depth() == 0 {
            continue;
        }
        let file_type = entry.file_type();
        if file_type.is_dir() {
            dirs += 1;
            continue;
        }
        if !file_type.is_file() {
            continue;
        }
        raw.push(RawPath {
            path: entry.path().to_path_buf(),
        });

        if raw.len() % 512 == 0 {
            progress(
                "walking",
                raw.len(),
                0,
                &entry.path().to_string_lossy(),
            );
        }
    }

    // Metadados em paralelo, em lotes, para manter o progresso e o cancelamento responsivos.
    let now = now_ms();
    let mut files: Vec<FileEntry> = Vec::with_capacity(raw.len());
    let mut total_bytes = 0u64;

    for (chunk_index, chunk) in raw.chunks(2048).enumerate() {
        if cancel.load(Ordering::Relaxed) {
            return Err("scan_cancelled".into());
        }
        let base = (chunk_index * 2048) as u32;
        let batch: Vec<FileEntry> = chunk
            .par_iter()
            .enumerate()
            .filter_map(|(i, item)| build_entry(base + i as u32, &item.path, &root, now))
            .collect();
        for file in &batch {
            total_bytes += file.size;
        }
        files.extend(batch);
        let last = chunk.last().map(|r| r.path.to_string_lossy().to_string()).unwrap_or_default();
        progress("reading", files.len(), total_bytes, &last);
    }

    if cancel.load(Ordering::Relaxed) {
        return Err("scan_cancelled".into());
    }

    let (duplicates, duplicate_groups, duplicate_bytes) =
        find_duplicates(&mut files, cancel, progress);

    // Raízes de cache / build (pastas que podem ser apagadas inteiras).
    let cache_roots = collect_roots(&files, &root, "cache");
    let build_roots = collect_roots(&files, &root, "build");

    let summary = build_summary(
        &root,
        &files,
        dirs,
        errors,
        started.elapsed().as_millis() as u64,
        total_bytes,
        duplicates,
        duplicate_groups,
        duplicate_bytes,
        &cache_roots,
        &build_roots,
    );

    Ok(ScanData {
        tree: crate::tree::build(&root, &files),
        root,
        files,
        summary,
    })
}

fn build_entry(id: u32, path: &Path, root: &Path, now: u64) -> Option<FileEntry> {
    let metadata = fs::metadata(path).ok()?;
    if !metadata.is_file() {
        return None;
    }
    let size = metadata.len();
    let name = path.file_name()?.to_string_lossy().to_string();
    let ext = path
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();
    let relative = path.strip_prefix(root).unwrap_or(path);
    let components: Vec<String> = relative
        .components()
        .map(|c| c.as_os_str().to_string_lossy().to_lowercase())
        .collect();
    let depth = components.len() as u32;

    let mut tags: Vec<String> = Vec::new();
    let mut in_cache = false;
    let mut in_build = false;
    // O último componente é o nome do arquivo; os anteriores são pastas.
    for segment in components.iter().take(components.len().saturating_sub(1)) {
        if classify::is_cache_segment(segment) {
            in_cache = true;
            break;
        }
        if classify::is_build_segment(segment) {
            in_build = true;
        }
    }
    if in_cache {
        tags.push("cache".into());
    } else if in_build {
        tags.push("build".into());
    }

    if classify::is_temp_name(&name, &ext) {
        tags.push("temp".into());
    }
    if classify::is_installer(&name, &ext) {
        tags.push("installer".into());
    }
    if size == 0 {
        tags.push("empty".into());
    } else if size >= LARGE_BYTES {
        tags.push("large".into());
    }

    let modified = system_ms(metadata.modified().ok());
    let created = system_ms(metadata.created().ok());
    if modified > 0 && now > modified && now - modified >= OLD_AGE_MS {
        tags.push("old".into());
    }

    let hidden = is_hidden(&name, &metadata);

    Some(FileEntry {
        id,
        path: path.to_string_lossy().to_string(),
        name,
        ext: ext.clone(),
        size,
        modified,
        created,
        category: classify::category_for(&ext).to_string(),
        depth,
        hidden,
        tags,
    })
}

fn system_ms(time: Option<SystemTime>) -> u64 {
    time.and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn is_hidden(name: &str, metadata: &fs::Metadata) -> bool {
    if name.starts_with('.') {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        if metadata.file_attributes() & 0x2 != 0 {
            return true;
        }
    }
    false
}

fn find_duplicates(
    files: &mut [FileEntry],
    cancel: &AtomicBool,
    progress: ProgressFn,
) -> (Vec<DuplicateGroup>, usize, u64) {
    let mut by_size: HashMap<u64, Vec<usize>> = HashMap::new();
    for (index, file) in files.iter().enumerate() {
        if file.size == 0 || file.size > MAX_HASH_SIZE {
            continue;
        }
        if file
            .tags
            .iter()
            .any(|tag| tag == "cache" || tag == "build")
        {
            continue;
        }
        by_size.entry(file.size).or_default().push(index);
    }

    let mut candidates: Vec<usize> = by_size
        .values()
        .filter(|group| group.len() > 1)
        .flatten()
        .copied()
        .collect();

    if candidates.len() > MAX_HASH_FILES {
        candidates.sort_by_key(|&index| std::cmp::Reverse(files[index].size));
        candidates.truncate(MAX_HASH_FILES);
    }

    if candidates.is_empty() {
        return (Vec::new(), 0, 0);
    }

    let mut hashes: Vec<(usize, String)> = Vec::with_capacity(candidates.len());
    for chunk in candidates.chunks(256) {
        if cancel.load(Ordering::Relaxed) {
            return (Vec::new(), 0, 0);
        }
        let batch: Vec<(usize, String)> = chunk
            .par_iter()
            .filter_map(|&index| {
                let file = &files[index];
                // Evita "baixar" arquivos grandes que só existem na nuvem (OneDrive).
                if file.size > 16 * 1024 * 1024
                    && file.path.to_lowercase().contains("onedrive")
                {
                    return None;
                }
                hash_file(Path::new(&file.path)).map(|hash| (index, hash))
            })
            .collect();
        hashes.extend(batch);
        progress("hashing", hashes.len(), 0, "Comparando arquivos idênticos");
    }

    let mut groups: HashMap<(u64, String), Vec<usize>> = HashMap::new();
    for (index, hash) in hashes {
        groups
            .entry((files[index].size, hash))
            .or_default()
            .push(index);
    }

    let mut duplicates: Vec<DuplicateGroup> = Vec::new();
    let mut duplicate_bytes = 0u64;

    for ((size, hash), indexes) in groups {
        if indexes.len() < 2 {
            continue;
        }
        duplicate_bytes += size * (indexes.len() - 1) as u64;
        for &index in indexes.iter().skip(1) {
            files[index].tags.push("duplicate".into());
        }
        duplicates.push(DuplicateGroup {
            hash: hash[..hash.len().min(12)].to_string(),
            size,
            count: indexes.len(),
            wasted: size * (indexes.len() - 1) as u64,
            paths: indexes
                .iter()
                .take(6)
                .map(|&index| files[index].path.clone())
                .collect(),
        });
    }

    duplicates.sort_by(|a, b| b.wasted.cmp(&a.wasted));
    let group_count = duplicates.len();
    duplicates.truncate(25);
    (duplicates, group_count, duplicate_bytes)
}

fn hash_file(path: &Path) -> Option<String> {
    let mut file = fs::File::open(path).ok()?;
    let mut hasher = blake3::Hasher::new();
    let mut buffer = vec![0u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).ok()?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Some(hasher.finalize().to_hex().to_string())
}

fn cache_root_of(path: &Path, root: &Path, tag: &str) -> Option<PathBuf> {
    let relative = path.strip_prefix(root).ok()?;
    let mut current = root.to_path_buf();
    for component in relative.components() {
        let segment = component.as_os_str().to_string_lossy().to_lowercase();
        current.push(component.as_os_str());
        let hit = if tag == "cache" {
            classify::is_cache_segment(&segment)
        } else {
            classify::is_build_segment(&segment)
        };
        if hit {
            return Some(current);
        }
    }
    None
}

fn collect_roots(files: &[FileEntry], root: &Path, tag: &str) -> Vec<(String, u64, usize)> {
    let mut map: HashMap<PathBuf, (u64, usize)> = HashMap::new();
    for file in files {
        if !file.tags.iter().any(|t| t == tag) {
            continue;
        }
        if let Some(cache_root) = cache_root_of(Path::new(&file.path), root, tag) {
            let entry = map.entry(cache_root).or_insert((0, 0));
            entry.0 += file.size;
            entry.1 += 1;
        }
    }
    let mut roots: Vec<(String, u64, usize)> = map
        .into_iter()
        .map(|(path, (bytes, count))| (path.to_string_lossy().to_string(), bytes, count))
        .collect();
    roots.sort_by(|a, b| b.1.cmp(&a.1));
    roots.truncate(300);
    roots
}

#[allow(clippy::too_many_arguments)]
fn build_summary(
    root: &Path,
    files: &[FileEntry],
    dirs: usize,
    errors: usize,
    duration_ms: u64,
    total_bytes: u64,
    duplicates: Vec<DuplicateGroup>,
    duplicate_groups: usize,
    duplicate_bytes: u64,
    cache_roots: &[(String, u64, usize)],
    build_roots: &[(String, u64, usize)],
) -> ScanSummary {
    let mut categories: HashMap<&'static str, (u64, usize)> = HashMap::new();
    let mut extensions: HashMap<String, (u64, usize)> = HashMap::new();
    let mut ages: HashMap<&'static str, (u64, usize)> = HashMap::new();
    let mut folders: HashMap<String, (u64, usize)> = HashMap::new();
    let mut tags: HashMap<String, (u64, usize)> = HashMap::new();
    let mut reclaimable_bytes = 0u64;
    let mut reclaimable_count = 0usize;
    let now = now_ms();

    for file in files {
        let category = classify::category_for(&file.ext);
        let cat = categories.entry(category).or_insert((0, 0));
        cat.0 += file.size;
        cat.1 += 1;

        let ext_key = if file.ext.is_empty() {
            "none".to_string()
        } else {
            file.ext.clone()
        };
        let ext = extensions.entry(ext_key).or_insert((0, 0));
        ext.0 += file.size;
        ext.1 += 1;

        if file.modified > 0 {
            let age_days = (now.saturating_sub(file.modified)) / 86_400_000;
            let bucket = match age_days {
                0..=30 => "0-30",
                31..=180 => "30-180",
                181..=365 => "180-365",
                366..=730 => "365-730",
                731..=1825 => "730-1825",
                _ => "1825+",
            };
            let age = ages.entry(bucket).or_insert((0, 0));
            age.0 += file.size;
            age.1 += 1;
        }

        let relative = Path::new(&file.path)
            .strip_prefix(root)
            .map(|p| p.to_path_buf())
            .unwrap_or_else(|_| PathBuf::from(&file.name));
        let (folder_key, _folder_label) = match relative.components().count() {
            0 | 1 => (root.to_string_lossy().to_string(), "(raiz)".to_string()),
            _ => {
                let first = relative
                    .components()
                    .next()
                    .map(|c| c.as_os_str().to_string_lossy().to_string())
                    .unwrap_or_default();
                let path = root.join(&first).to_string_lossy().to_string();
                (path, first)
            }
        };
        let folder = folders.entry(folder_key).or_insert((0, 0));
        folder.0 += file.size;
        folder.1 += 1;

        let mut reclaimable = false;
        for tag in &file.tags {
            let entry = tags.entry(tag.clone()).or_insert((0, 0));
            entry.0 += file.size;
            entry.1 += 1;
            if matches!(
                tag.as_str(),
                "cache" | "build" | "temp" | "duplicate" | "installer"
            ) {
                reclaimable = true;
            }
        }
        if reclaimable {
            reclaimable_bytes += file.size;
            reclaimable_count += 1;
        }
    }

    let mut category_buckets: Vec<Bucket> = categories
        .into_iter()
        .map(|(key, (bytes, count))| Bucket {
            key: key.to_string(),
            label: classify::category_label(key).to_string(),
            bytes,
            count,
            color: classify::category_color(key).to_string(),
        })
        .collect();
    category_buckets.sort_by(|a, b| b.bytes.cmp(&a.bytes));

    let mut extension_buckets: Vec<Bucket> = extensions
        .into_iter()
        .map(|(key, (bytes, count))| Bucket {
            label: if key == "none" {
                "sem extensão".to_string()
            } else {
                key.to_uppercase()
            },
            key,
            bytes,
            count,
            color: classify::PALETTE[0].to_string(),
        })
        .collect();
    extension_buckets.sort_by(|a, b| b.bytes.cmp(&a.bytes));
    extension_buckets.truncate(18);

    let age_order = ["0-30", "30-180", "180-365", "365-730", "730-1825", "1825+"];
    let age_labels = [
        "Até 30 dias",
        "1–6 meses",
        "6–12 meses",
        "1–2 anos",
        "2–5 anos",
        "5+ anos",
    ];
    let age_colors = [
        "#34d399", "#5eead4", "#60a5fa", "#fbbf24", "#fb923c", "#fb7185",
    ];
    let age_buckets: Vec<Bucket> = age_order
        .iter()
        .enumerate()
        .filter_map(|(index, key)| ages.get(key).map(|&(bytes, count)| Bucket {
            key: key.to_string(),
            label: age_labels[index].to_string(),
            bytes,
            count,
            color: age_colors[index].to_string(),
        }))
        .collect();

    let mut folder_buckets: Vec<Bucket> = folders
        .into_iter()
        .map(|(key, (bytes, count))| {
            let label = Path::new(&key)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| key.clone());
            Bucket {
                key,
                label,
                bytes,
                count,
                color: String::new(),
            }
        })
        .collect();
    folder_buckets.sort_by(|a, b| b.bytes.cmp(&a.bytes));
    folder_buckets.truncate(14);
    for (index, bucket) in folder_buckets.iter_mut().enumerate() {
        bucket.color = classify::PALETTE[index % classify::PALETTE.len()].to_string();
    }

    let mut tag_buckets: Vec<Bucket> = tags
        .into_iter()
        .filter(|(tag, _)| tag != "hidden")
        .map(|(tag, (bytes, count))| Bucket {
            label: classify::tag_label(&tag).to_string(),
            color: classify::tag_color(&tag).to_string(),
            key: tag,
            bytes,
            count,
        })
        .collect();
    tag_buckets.sort_by(|a, b| b.bytes.cmp(&a.bytes));

    let mut largest: Vec<FileEntry> = files.to_vec();
    largest.sort_by(|a, b| b.size.cmp(&a.size));
    largest.truncate(12);

    let insight_list = insights::build(
        files,
        cache_roots,
        build_roots,
        &duplicates,
        duplicate_groups,
        duplicate_bytes,
        files
            .iter()
            .filter(|file| file.tags.iter().any(|tag| tag == "duplicate"))
            .count(),
        &folder_buckets,
        total_bytes,
    );

    let root_name = root
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .filter(|n| !n.is_empty())
        .unwrap_or_else(|| root.to_string_lossy().to_string());

    ScanSummary {
        root: root.to_string_lossy().to_string(),
        root_name,
        scanned_at: now_ms(),
        duration_ms,
        files: files.len(),
        dirs,
        bytes: total_bytes,
        errors,
        categories: category_buckets,
        extensions: extension_buckets,
        ages: age_buckets,
        folders: folder_buckets,
        largest,
        duplicates,
        duplicate_groups,
        duplicate_bytes,
        tags: tag_buckets,
        reclaimable_bytes,
        reclaimable_count,
        insights: insight_list,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn scans_classifies_and_finds_duplicates() {
        let root = std::env::temp_dir().join(format!("myscan-test-{}", now_ms()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("Docs")).unwrap();
        fs::create_dir_all(root.join("node_modules").join("pkg")).unwrap();
        fs::write(root.join("a.txt"), b"hello world").unwrap();
        fs::write(root.join("Docs").join("b.txt"), b"hello world").unwrap();
        fs::write(
            root.join("node_modules").join("pkg").join("index.js"),
            vec![7u8; 4096],
        )
        .unwrap();
        fs::write(root.join("rascunho.tmp"), b"temp").unwrap();

        let cancel = AtomicBool::new(false);
        let data = scan(&root, &cancel, &|_: &str, _: usize, _: u64, _: &str| {}).unwrap();

        assert_eq!(data.summary.files, 4);
        assert_eq!(data.summary.dirs, 3);
        assert_eq!(data.summary.bytes, 4122);
        assert_eq!(data.summary.duplicate_groups, 1);
        assert_eq!(data.summary.duplicate_bytes, 11);

        let cache_file = data
            .files
            .iter()
            .find(|file| file.name == "index.js")
            .unwrap();
        assert!(cache_file.tags.iter().any(|tag| tag == "cache"));
        let temp_file = data
            .files
            .iter()
            .find(|file| file.name == "rascunho.tmp")
            .unwrap();
        assert!(temp_file.tags.iter().any(|tag| tag == "temp"));

        assert!(data.summary.insights.iter().any(|item| item.id == "cache"));
        assert!(data.summary.insights.iter().any(|item| item.id == "temp"));
        assert!(data
            .summary
            .insights
            .iter()
            .any(|item| item.id == "duplicates"));
        assert!(data.summary.reclaimable_bytes >= 4096);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn cancellation_stops_scan() {
        let root = std::env::temp_dir().join(format!("myscan-cancel-{}", now_ms()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(&root).unwrap();
        fs::write(root.join("file.txt"), b"x").unwrap();

        let cancel = AtomicBool::new(true);
        let result = scan(&root, &cancel, &|_: &str, _: usize, _: u64, _: &str| {});
        assert!(result.is_err());
        let _ = fs::remove_dir_all(&root);
    }
}

