import { invoke } from "@tauri-apps/api/core";
import type {
  FilePage,
  FileQuery,
  QuickLocation,
  ScanSummary,
  TrashResult,
  TreeDir,
} from "../types";

export const api = {
  quickLocations: () => invoke<QuickLocation[]>("quick_locations"),
  scan: (path: string) => invoke<ScanSummary>("scan_folder", { path }),
  cancel: () => invoke<void>("cancel_scan"),
  queryFiles: (query: FileQuery) => invoke<FilePage>("query_files", { query }),
  trash: (paths: string[]) => invoke<TrashResult>("trash_items", { paths }),
  tree: () => invoke<TreeDir>("folder_tree"),
};

export const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
