export interface Bucket {
  key: string;
  label: string;
  bytes: number;
  count: number;
  color: string;
}

export interface FileEntry {
  id: number;
  path: string;
  name: string;
  ext: string;
  size: number;
  modified: number;
  created: number;
  category: string;
  depth: number;
  hidden: boolean;
  tags: string[];
}

export interface DuplicateGroup {
  hash: string;
  size: number;
  count: number;
  wasted: number;
  paths: string[];
}

export interface FileFilter {
  tag?: string | null;
  category?: string | null;
  ext?: string | null;
  folder?: string | null;
  minSize?: number | null;
  olderThanDays?: number | null;
  query?: string | null;
}

export interface Insight {
  id: string;
  tone: "danger" | "warn" | "info" | "good";
  title: string;
  detail: string;
  bytes: number;
  count: number;
  action: "trash" | "filter";
  filter: FileFilter | null;
  targets: string[];
  targetKind: "files" | "folders";
  targetBytes: number;
}

export interface ScanSummary {
  root: string;
  rootName: string;
  scannedAt: number;
  durationMs: number;
  files: number;
  dirs: number;
  bytes: number;
  errors: number;
  categories: Bucket[];
  extensions: Bucket[];
  ages: Bucket[];
  folders: Bucket[];
  largest: FileEntry[];
  duplicates: DuplicateGroup[];
  duplicateGroups: number;
  duplicateBytes: number;
  tags: Bucket[];
  reclaimableBytes: number;
  reclaimableCount: number;
  insights: Insight[];
}

export interface ScanProgress {
  phase: "walking" | "reading" | "hashing" | string;
  files: number;
  bytes: number;
  current: string;
}

export interface QuickLocation {
  label: string;
  path: string;
  kind: "folder" | "drive" | "temp" | string;
}

/** Nó da árvore de pastas usado pelo mapa de espaço. */
export interface TreeDir {
  name: string;
  path: string;
  kind: "dir" | "files" | "rest";
  bytes: number;
  files: number;
  dirs: number;
  children: TreeDir[];
}

export interface FilePage {
  total: number;
  offset: number;
  limit: number;
  items: FileEntry[];
}

export interface FileQuery extends FileFilter {
  sort?: string;
  direction?: "asc" | "desc";
  offset?: number;
  limit?: number;
}

export interface TrashResult {
  removed: number;
  bytes: number;
  failed: string[];
}
