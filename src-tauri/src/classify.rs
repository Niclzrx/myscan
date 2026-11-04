/// Classificação de arquivos: categoria, cor, rótulo e tags de "limpeza".

pub fn category_for(ext: &str) -> &'static str {
    match ext {
        "jpg" | "jpeg" | "png" | "gif" | "webp" | "bmp" | "svg" | "heic" | "heif" | "tif"
        | "tiff" | "raw" | "cr2" | "cr3" | "nef" | "arw" | "psd" | "ai" | "avif" | "ico"
        | "jfif" => "images",
        "mp4" | "mkv" | "avi" | "mov" | "wmv" | "flv" | "webm" | "m4v" | "mpg" | "mpeg"
        | "3gp" | "mts" => "video",
        "mp3" | "wav" | "flac" | "aac" | "ogg" | "m4a" | "wma" | "opus" | "aiff" | "mid"
        | "midi" => "audio",
        "pdf" | "doc" | "docx" | "txt" | "rtf" | "odt" | "md" | "epub" | "mobi" | "xls"
        | "xlsx" | "ods" | "ppt" | "pptx" | "odp" | "csv" | "tsv" | "pages" | "numbers"
        | "key" | "tex" => "documents",
        "js" | "mjs" | "cjs" | "ts" | "tsx" | "jsx" | "py" | "java" | "c" | "cpp" | "cc"
        | "h" | "hpp" | "cs" | "go" | "rs" | "rb" | "php" | "html" | "htm" | "css" | "scss"
        | "sass" | "less" | "json" | "xml" | "yml" | "yaml" | "sql" | "sh" | "bash" | "ps1"
        | "bat" | "cmd" | "ini" | "toml" | "vue" | "svelte" | "lua" | "kt" | "swift" | "dart"
        | "r" | "pl" | "scala" | "clj" | "ex" | "exs" | "ipynb" | "dockerfile" | "makefile"
        | "gradle" => "code",
        "zip" | "rar" | "7z" | "tar" | "gz" | "bz2" | "xz" | "zst" | "iso" | "cab" | "tgz" => {
            "archive"
        }
        "exe" | "msi" | "msix" | "appx" | "dmg" | "pkg" | "deb" | "rpm" | "appimage" | "dll"
        | "sys" | "com" | "apk" | "jar" => "executables",
        "ttf" | "otf" | "woff" | "woff2" | "eot" => "font",
        _ => "other",
    }
}

pub fn category_label(key: &str) -> &'static str {
    match key {
        "images" => "Imagens",
        "video" => "Vídeos",
        "audio" => "Áudio",
        "documents" => "Documentos",
        "code" => "Código",
        "archive" => "Compactados",
        "executables" => "Executáveis",
        "font" => "Fontes",
        _ => "Outros",
    }
}

pub fn category_color(key: &str) -> &'static str {
    match key {
        "images" => "#60a5fa",
        "video" => "#a78bfa",
        "audio" => "#f472b6",
        "documents" => "#fbbf24",
        "code" => "#5eead4",
        "archive" => "#fb923c",
        "executables" => "#f87171",
        "font" => "#94a3b8",
        _ => "#64748b",
    }
}

pub const PALETTE: [&str; 10] = [
    "#5eead4", "#60a5fa", "#a78bfa", "#f472b6", "#fbbf24", "#fb923c", "#f87171", "#34d399",
    "#38bdf8", "#c084fc",
];

pub fn tag_label(tag: &str) -> &'static str {
    match tag {
        "cache" => "Cache",
        "build" => "Artefatos de build",
        "temp" => "Temporários",
        "duplicate" => "Duplicados",
        "installer" => "Instaladores",
        "old" => "Parados há 2+ anos",
        "large" => "Grandes (+100 MB)",
        "empty" => "Vazios",
        _ => "Outros",
    }
}

pub fn tag_color(tag: &str) -> &'static str {
    match tag {
        "cache" => "#fbbf24",
        "build" => "#fb923c",
        "temp" => "#f87171",
        "duplicate" => "#fb7185",
        "installer" => "#a78bfa",
        "old" => "#94a3b8",
        "large" => "#38bdf8",
        "empty" => "#64748b",
        _ => "#64748b",
    }
}

/// Pastas cujo conteúdo é cache/dependências e pode ser recriado.
pub fn is_cache_segment(seg: &str) -> bool {
    matches!(
        seg,
        "node_modules"
            | "bower_components"
            | "__pycache__"
            | ".pytest_cache"
            | ".mypy_cache"
            | ".ruff_cache"
            | ".cache"
            | "caches"
            | "cache"
            | "cache2"
            | "code cache"
            | "gpucache"
            | "cachestorage"
            | "temp"
            | "tmp"
            | ".tmp"
            | ".next"
            | ".nuxt"
            | ".svelte-kit"
            | ".turbo"
            | ".parcel-cache"
            | ".gradle"
            | ".m2"
            | ".npm"
            | ".yarn"
            | ".pnpm-store"
            | ".tox"
            | ".venv"
            | "target"
            | "inetcache"
            | "crashpad"
            | "shadercache"
            | "dxcache"
            | "service worker"
    )
}

/// Pastas de saída de build que normalmente podem ser regeneradas.
pub fn is_build_segment(seg: &str) -> bool {
    matches!(
        seg,
        "dist" | "build" | "out" | ".output" | "coverage" | "obj" | "release" | "debug"
    )
}

pub fn is_temp_name(name: &str, ext: &str) -> bool {
    matches!(
        ext,
        "tmp" | "temp" | "bak" | "old" | "crdownload" | "part" | "partial" | "ds_store"
    ) || name.ends_with('~')
        || name.eq_ignore_ascii_case("thumbs.db")
        || name.eq_ignore_ascii_case(".ds_store")
}

pub fn is_installer(name: &str, ext: &str) -> bool {
    if matches!(ext, "msi" | "msix" | "appx" | "pkg" | "dmg" | "deb" | "rpm" | "appimage") {
        return true;
    }
    if matches!(ext, "exe" | "zip" | "7z" | "rar") {
        let lower = name.to_lowercase();
        return ["setup", "install", "instalador", "installer", "update", "redist", "win64", "win32", "x64", "x86"]
            .iter()
            .any(|k| lower.contains(k));
    }
    false
}
