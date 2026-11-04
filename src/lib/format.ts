import type { FileFilter } from "../types";

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })} ${units[unit]}`;
}

export function formatNumber(value: number): string {
  return value.toLocaleString("pt-BR");
}

export function formatDate(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatDateTime(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(ms: number): string {
  if (!ms) return "data desconhecida";
  const diff = Date.now() - ms;
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return "hoje";
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;
  const months = Math.floor(days / 30);
  if (months < 12) return `há ${months} ${months === 1 ? "mês" : "meses"}`;
  const years = Math.floor(days / 365);
  return `há ${years} ${years === 1 ? "ano" : "anos"}`;
}

export function percent(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export function shortPath(path: string, max = 64): string {
  if (path.length <= max) return path;
  return "…" + path.slice(path.length - max + 1);
}

export function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function parentPath(path: string): string {
  const index = Math.max(path.lastIndexOf("\\"), path.lastIndexOf("/"));
  return index > 0 ? path.slice(0, index) : path;
}

export const CATEGORY_LABELS: Record<string, string> = {
  images: "Imagens",
  video: "Vídeos",
  audio: "Áudio",
  documents: "Documentos",
  code: "Código",
  archive: "Compactados",
  executables: "Executáveis",
  font: "Fontes",
  other: "Outros",
};

export const TAG_LABELS: Record<string, string> = {
  cache: "Cache",
  build: "Artefatos de build",
  temp: "Temporário",
  duplicate: "Duplicado",
  installer: "Instalador",
  old: "Parado há 2+ anos",
  large: "Grande (+100 MB)",
  empty: "Vazio",
};

export const TAG_COLORS: Record<string, string> = {
  cache: "#fbbf24",
  build: "#fb923c",
  temp: "#f87171",
  duplicate: "#fb7185",
  installer: "#a78bfa",
  old: "#94a3b8",
  large: "#38bdf8",
  empty: "#64748b",
};

export function filterEntries(filter: FileFilter): {
  label: string;
  key: keyof FileFilter;
}[] {
  const entries: { label: string; key: keyof FileFilter }[] = [];
  if (filter.tag) {
    entries.push({ key: "tag", label: TAG_LABELS[filter.tag] ?? filter.tag });
  }
  if (filter.category) {
    entries.push({
      key: "category",
      label: CATEGORY_LABELS[filter.category] ?? filter.category,
    });
  }
  if (filter.ext) entries.push({ key: "ext", label: `.${filter.ext}` });
  if (filter.folder) {
    entries.push({ key: "folder", label: baseName(filter.folder) || filter.folder });
  }
  if (filter.minSize) {
    entries.push({ key: "minSize", label: `≥ ${formatBytes(filter.minSize)}` });
  }
  if (filter.olderThanDays) {
    entries.push({ key: "olderThanDays", label: `parados há ${filter.olderThanDays}+ dias` });
  }
  return entries;
}
