use crate::model::{Bucket, DuplicateGroup, FileEntry, FileFilter, Insight};
use crate::util::human_bytes;

const MAX_TARGETS: usize = 2000;

type Sum = (u64, usize);

#[allow(clippy::too_many_arguments)]
pub fn build(
    files: &[FileEntry],
    cache_roots: &[(String, u64, usize)],
    build_roots: &[(String, u64, usize)],
    duplicates: &[DuplicateGroup],
    duplicate_groups: usize,
    duplicate_bytes: u64,
    duplicate_count: usize,
    folders: &[Bucket],
    total_bytes: u64,
) -> Vec<Insight> {
    let mut cache: Sum = (0, 0);
    let mut build: Sum = (0, 0);
    let mut temp: Sum = (0, 0);
    let mut installer: Sum = (0, 0);
    let mut old: Sum = (0, 0);
    let mut empty: Sum = (0, 0);
    let mut large: Sum = (0, 0);

    for file in files {
        for tag in &file.tags {
            let slot = match tag.as_str() {
                "cache" => Some(&mut cache),
                "build" => Some(&mut build),
                "temp" => Some(&mut temp),
                "installer" => Some(&mut installer),
                "old" => Some(&mut old),
                "empty" => Some(&mut empty),
                "large" => Some(&mut large),
                _ => None,
            };
            if let Some(sum) = slot {
                sum.0 += file.size;
                sum.1 += 1;
            }
        }
    }

    let mut list: Vec<Insight> = Vec::new();

    if duplicate_groups > 0 && duplicate_bytes > 0 {
        let (targets, target_bytes) = tag_targets(files, "duplicate", &[]);
        list.push(Insight {
            id: "duplicates".into(),
            tone: "danger".into(),
            title: "Arquivos duplicados".into(),
            detail: format!(
                "{} grupos de arquivos idênticos ocupam {} em cópias extras. Manter uma cópia de cada um libera esse espaço.",
                duplicate_groups,
                human_bytes(duplicate_bytes)
            ),
            bytes: duplicate_bytes,
            count: duplicate_count,
            action: "trash".into(),
            filter: Some(FileFilter {
                tag: Some("duplicate".into()),
                ..Default::default()
            }),
            targets,
            target_kind: "files".into(),
            target_bytes,
        });
    }

    if cache.1 > 0 && cache.0 > 0 {
        let mut targets: Vec<String> = cache_roots.iter().map(|root| root.0.clone()).collect();
        let mut target_bytes: u64 = cache_roots.iter().map(|root| root.1).sum();
        if targets.is_empty() {
            let (fallback, bytes) = tag_targets(files, "cache", &[]);
            targets = fallback;
            target_bytes = bytes;
        }
        list.push(Insight {
            id: "cache".into(),
            tone: "warn".into(),
            title: "Cache que pode ser recriado".into(),
            detail: format!(
                "{} em {} arquivos dentro de pastas como node_modules, __pycache__ e .cache. Elas voltam a ser criadas quando você precisar.",
                human_bytes(cache.0),
                cache.1
            ),
            bytes: cache.0,
            count: cache.1,
            action: "trash".into(),
            filter: Some(FileFilter {
                tag: Some("cache".into()),
                ..Default::default()
            }),
            targets,
            target_kind: "folders".into(),
            target_bytes,
        });
    }

    if build.1 > 0 && build.0 > 0 {
        let mut targets: Vec<String> = build_roots.iter().map(|root| root.0.clone()).collect();
        let mut target_bytes: u64 = build_roots.iter().map(|root| root.1).sum();
        if targets.is_empty() {
            let (fallback, bytes) = tag_targets(files, "build", &[]);
            targets = fallback;
            target_bytes = bytes;
        }
        list.push(Insight {
            id: "build".into(),
            tone: "warn".into(),
            title: "Artefatos de build".into(),
            detail: format!(
                "Pastas de saída como dist, build e out somam {}. Você pode gerá-las novamente com um build.",
                human_bytes(build.0)
            ),
            bytes: build.0,
            count: build.1,
            action: "trash".into(),
            filter: Some(FileFilter {
                tag: Some("build".into()),
                ..Default::default()
            }),
            targets,
            target_kind: "folders".into(),
            target_bytes,
        });
    }

    if temp.1 > 0 && temp.0 > 0 {
        let (targets, target_bytes) = tag_targets(files, "temp", &[]);
        list.push(Insight {
            id: "temp".into(),
            tone: "warn".into(),
            title: "Arquivos temporários".into(),
            detail: format!(
                "{} em {} arquivos .tmp, .bak, .old e downloads incompletos.",
                human_bytes(temp.0),
                temp.1
            ),
            bytes: temp.0,
            count: temp.1,
            action: "trash".into(),
            filter: Some(FileFilter {
                tag: Some("temp".into()),
                ..Default::default()
            }),
            targets,
            target_kind: "files".into(),
            target_bytes,
        });
    }

    if installer.1 > 0 && installer.0 > 0 {
        let (targets, target_bytes) = tag_targets(files, "installer", &[]);
        list.push(Insight {
            id: "installers".into(),
            tone: "info".into(),
            title: "Instaladores guardados".into(),
            detail: format!(
                "{} instaladores somam {}. Normalmente podem ser baixados de novo se necessário.",
                installer.1,
                human_bytes(installer.0)
            ),
            bytes: installer.0,
            count: installer.1,
            action: "trash".into(),
            filter: Some(FileFilter {
                tag: Some("installer".into()),
                ..Default::default()
            }),
            targets,
            target_kind: "files".into(),
            target_bytes,
        });
    }

    if old.1 > 0 && old.0 > 0 {
        let (targets, target_bytes) = tag_targets(
            files,
            "old",
            &["cache", "build", "duplicate", "installer", "temp"],
        );
        if !targets.is_empty() {
            let count = targets.len();
            list.push(Insight {
                id: "old".into(),
                tone: "info".into(),
                title: "Parados há mais de 2 anos".into(),
                detail: format!(
                    "{} arquivos sem alteração há mais de 2 anos ocupam {}. Vale revisar antes de decidir.",
                    count,
                    human_bytes(target_bytes)
                ),
                bytes: target_bytes,
                count,
                action: "trash".into(),
                filter: Some(FileFilter {
                    tag: Some("old".into()),
                    older_than_days: Some(730),
                    ..Default::default()
                }),
                targets,
                target_kind: "files".into(),
                target_bytes,
            });
        }
    }

    if empty.1 > 0 {
        let (targets, target_bytes) = tag_targets(files, "empty", &[]);
        list.push(Insight {
            id: "empty".into(),
            tone: "info".into(),
            title: "Arquivos vazios".into(),
            detail: format!(
                "{} arquivos com 0 bytes não guardam nenhum conteúdo.",
                empty.1
            ),
            bytes: 0,
            count: empty.1,
            action: "trash".into(),
            filter: Some(FileFilter {
                tag: Some("empty".into()),
                ..Default::default()
            }),
            targets,
            target_kind: "files".into(),
            target_bytes,
        });
    }

    if large.1 > 0 && large.0 > 0 {
        list.push(Insight {
            id: "large".into(),
            tone: "info".into(),
            title: "Arquivos com mais de 100 MB".into(),
            detail: format!(
                "{} arquivos grandes somam {}. Podem ser mídias, backups ou algo que você esqueceu.",
                large.1,
                human_bytes(large.0)
            ),
            bytes: large.0,
            count: large.1,
            action: "filter".into(),
            filter: Some(FileFilter {
                tag: Some("large".into()),
                ..Default::default()
            }),
            targets: Vec::new(),
            target_kind: "files".into(),
            target_bytes: 0,
        });
    }

    if let Some(top) = folders.first() {
        if total_bytes > 0 && top.bytes * 100 / total_bytes >= 25 && top.label != "(raiz)" {
            let share = top.bytes * 100 / total_bytes;
            list.push(Insight {
                id: "hotspot".into(),
                tone: "info".into(),
                title: format!("A pasta “{}” concentra o espaço", top.label),
                detail: format!(
                    "{}% do total analisado está em {} ({}).",
                    share,
                    human_bytes(top.bytes),
                    top.label
                ),
                bytes: top.bytes,
                count: top.count,
                action: "filter".into(),
                filter: Some(FileFilter {
                    folder: Some(top.key.clone()),
                    ..Default::default()
                }),
                targets: Vec::new(),
                target_kind: "files".into(),
                target_bytes: 0,
            });
        }
    }

    if duplicates.is_empty() && cache.0 == 0 && temp.0 == 0 {
        list.push(Insight {
            id: "clean".into(),
            tone: "good".into(),
            title: "Nada urgente por aqui".into(),
            detail: "Não encontramos duplicados nem grandes volumes de cache. Sua pasta está organizada."
                .into(),
            bytes: 0,
            count: 0,
            action: "filter".into(),
            filter: None,
            targets: Vec::new(),
            target_kind: "files".into(),
            target_bytes: 0,
        });
    }

    list.sort_by(|a, b| {
        let rank = |tone: &str| match tone {
            "danger" => 0,
            "warn" => 1,
            "info" => 2,
            _ => 3,
        };
        rank(&a.tone)
            .cmp(&rank(&b.tone))
            .then_with(|| b.bytes.cmp(&a.bytes))
    });

    list
}

fn tag_targets(files: &[FileEntry], tag: &str, exclude: &[&str]) -> (Vec<String>, u64) {
    let mut targets = Vec::new();
    let mut bytes = 0u64;
    for file in files {
        if !file.tags.iter().any(|t| t == tag) {
            continue;
        }
        if exclude
            .iter()
            .any(|excluded| file.tags.iter().any(|t| t == excluded))
        {
            continue;
        }
        if targets.len() >= MAX_TARGETS {
            break;
        }
        targets.push(file.path.clone());
        bytes += file.size;
    }
    (targets, bytes)
}
