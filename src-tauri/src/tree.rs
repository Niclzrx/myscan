//! Árvore de pastas agregada a partir dos arquivos da varredura.
//!
//! O mapa visual precisa de hierarquia (pasta dentro de pasta) sem enviar
//! centenas de milhares de arquivos para a interface. Esta árvore guarda
//! apenas diretórios, com bytes/cópias acumulados, e é podada para caber
//! confortavelmente em um payload.

use std::collections::HashMap;
use std::path::{Component, Path};

use crate::model::{FileEntry, TreeDir};

/// Profundidade máxima renderizada pelo mapa.
const MAX_DEPTH: usize = 6;
/// Filhos máximos por pasta (o restante vira um bloco "outros").
const MAX_CHILDREN: usize = 40;
/// Participação mínima (do total) para um filho ganhar seu próprio bloco.
const MIN_SHARE: f64 = 0.00035;

#[derive(Default)]
struct Node {
    name: String,
    path: String,
    /// Bytes acumulados de todos os arquivos dentro desta pasta.
    bytes: u64,
    files: usize,
    /// Arquivos que estão diretamente nesta pasta (sem subpasta).
    direct_bytes: u64,
    direct_files: usize,
    children: Vec<usize>,
}

pub fn build(root: &Path, files: &[FileEntry]) -> TreeDir {
    let root_path = root.to_string_lossy().to_string();
    let root_name = root
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| root_path.clone());

    let mut arena: Vec<Node> = vec![Node {
        name: root_name,
        path: root_path.clone(),
        ..Node::default()
    }];
    let mut index: HashMap<String, usize> = HashMap::new();
    index.insert(root_path.to_lowercase(), 0);

    let mut chain: Vec<usize> = Vec::new();
    let mut current = root.to_path_buf();

    for file in files {
        let file_path = Path::new(&file.path);
        let relative = file_path.strip_prefix(root).unwrap_or(file_path);
        let components: Vec<Component> = relative.components().collect();
        if components.len() <= 1 {
            // Arquivo solto na raiz da varredura.
            let node = &mut arena[0];
            node.bytes += file.size;
            node.files += 1;
            node.direct_bytes += file.size;
            node.direct_files += 1;
            continue;
        }

        chain.clear();
        chain.push(0);
        current.clear();
        current.push(root);
        let mut parent = 0usize;

        for component in components.iter().take(components.len() - 1) {
            let part = component.as_os_str().to_string_lossy();
            current.push(&*part);
            let key = current.to_string_lossy().to_lowercase();
            let idx = match index.get(&key) {
                Some(existing) => *existing,
                None => {
                    let idx = arena.len();
                    arena.push(Node {
                        name: part.to_string(),
                        path: current.to_string_lossy().to_string(),
                        ..Node::default()
                    });
                    arena[parent].children.push(idx);
                    index.insert(key, idx);
                    idx
                }
            };
            parent = idx;
            chain.push(idx);
        }

        for &idx in &chain {
            arena[idx].bytes += file.size;
            arena[idx].files += 1;
        }
        arena[parent].direct_bytes += file.size;
        arena[parent].direct_files += 1;
    }

    let minimum = ((arena[0].bytes as f64) * MIN_SHARE).max(1.0) as u64;
    finish(&arena, 0, 0, minimum)
}

fn finish(arena: &[Node], idx: usize, depth: usize, minimum: u64) -> TreeDir {
    let node = &arena[idx];

    let mut entries: Vec<TreeDir> = Vec::new();

    if depth < MAX_DEPTH {
        let mut children: Vec<usize> = node.children.clone();
        children.sort_by(|a, b| arena[*b].bytes.cmp(&arena[*a].bytes));

        let mut shown = 0usize;
        let mut hidden_files = 0usize;
        let mut hidden_bytes = 0u64;
        let mut hidden_dirs = 0usize;

        for child in children {
            if arena[child].bytes == 0 {
                continue;
            }
            if shown < MAX_CHILDREN && arena[child].bytes >= minimum {
                shown += 1;
                entries.push(finish(arena, child, depth + 1, minimum));
            } else {
                hidden_dirs += 1;
                hidden_bytes += arena[child].bytes;
                hidden_files += arena[child].files;
            }
        }

        // Arquivos soltos diretamente nesta pasta.
        if node.direct_bytes > 0 {
            entries.push(TreeDir {
                name: "(arquivos soltos)".to_string(),
                path: node.path.clone(),
                kind: "files".to_string(),
                bytes: node.direct_bytes,
                files: node.direct_files,
                dirs: 0,
                children: Vec::new(),
            });
        }

        if hidden_dirs > 0 && hidden_bytes > 0 {
            entries.push(TreeDir {
                name: format!("+{hidden_dirs} pastas menores"),
                path: node.path.clone(),
                kind: "rest".to_string(),
                bytes: hidden_bytes,
                files: hidden_files,
                dirs: hidden_dirs,
                children: Vec::new(),
            });
        }
    }

    entries.sort_by(|a, b| b.bytes.cmp(&a.bytes));

    TreeDir {
        name: node.name.clone(),
        path: node.path.clone(),
        kind: "dir".to_string(),
        bytes: node.bytes,
        files: node.files,
        dirs: node.children.len(),
        children: entries,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn entry(path: &str, size: u64) -> FileEntry {
        FileEntry {
            id: 0,
            path: path.to_string(),
            name: path.rsplit('\\').next().unwrap_or(path).to_string(),
            ext: String::new(),
            size,
            modified: 0,
            created: 0,
            category: "outros".into(),
            depth: 1,
            hidden: false,
            tags: Vec::new(),
        }
    }

    #[test]
    fn agrega_bytes_e_hierarquia() {
        let root = Path::new("C:\\demo");
        let files = vec![
            entry("C:\\demo\\a.txt", 10),
            entry("C:\\demo\\fotos\\b.jpg", 30),
            entry("C:\\demo\\fotos\\2024\\c.jpg", 60),
            entry("C:\\demo\\docs\\d.pdf", 100),
        ];

        let tree = build(root, &files);
        assert_eq!(tree.bytes, 200);
        assert_eq!(tree.files, 4);

        let fotos = tree.children.iter().find(|c| c.name == "fotos").unwrap();
        assert_eq!(fotos.bytes, 90);
        assert_eq!(fotos.files, 2);
        let nested = fotos.children.iter().find(|c| c.name == "2024").unwrap();
        assert_eq!(nested.bytes, 60);

        let loose = tree
            .children
            .iter()
            .find(|c| c.kind == "files")
            .unwrap();
        assert_eq!(loose.bytes, 10);
    }
}
