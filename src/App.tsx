import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import type {
  FileFilter,
  Insight,
  QuickLocation,
  ScanProgress,
  ScanSummary,
} from "./types";
import { api, isTauri } from "./lib/api";
import { formatBytes, formatNumber } from "./lib/format";
import { Landing } from "./components/Landing";
import { ScanningView } from "./components/ScanningView";
import { Sidebar, type Tab } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { Overview } from "./components/Overview";
import { InsightsView } from "./components/InsightsView";
import { MapView } from "./components/MapView";
import { FilesView } from "./components/FilesView";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { Toast, type ToastTone, type ToastMessage } from "./components/Toast";
import { Icon } from "./components/icons";

function cleanError(reason: unknown): string {
  if (typeof reason === "string") return reason;
  if (reason instanceof Error) return reason.message;
  return String(reason);
}

export default function App() {
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [locations, setLocations] = useState<QuickLocation[]>([]);
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [scanPath, setScanPath] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [filter, setFilter] = useState<FileFilter>({});
  const [confirm, setConfirm] = useState<Insight | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const scanningRef = useRef(false);
  const scanRef = useRef<(path: string, keepView?: boolean) => void>(() => {});

  const notify = useCallback((tone: ToastTone, message: string) => {
    setToast({ id: Date.now(), tone, message });
  }, []);

  const startScan = useCallback(async (path: string, keepView = false) => {
    if (!path || scanningRef.current) return;
    scanningRef.current = true;
    setScanning(true);
    setError(null);
    setScanPath(path);
    setProgress({ phase: "walking", files: 0, bytes: 0, current: path });
    try {
      const data = await api.scan(path);
      setSummary(data);
      if (!keepView) {
        setFilter({});
        setTab("overview");
      }
    } catch (reason) {
      const message = cleanError(reason);
      if (!/cancelada/i.test(message)) setError(message);
    } finally {
      scanningRef.current = false;
      setScanning(false);
      setProgress(null);
    }
  }, []);

  scanRef.current = startScan;

  useEffect(() => {
    if (!isTauri()) return;
    api
      .quickLocations()
      .then(setLocations)
      .catch((reason) => setError(cleanError(reason)));
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let dispose: (() => void) | undefined;
    listen<ScanProgress>("scan-progress", (event) => setProgress(event.payload))
      .then((unlisten) => {
        dispose = unlisten;
      })
      .catch(() => {});
    return () => dispose?.();
  }, []);

  useEffect(() => {
    if (!isTauri()) return;
    let dispose: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === "drop") {
          const dropped = event.payload.paths[0];
          if (dropped) scanRef.current(dropped);
        }
      })
      .then((unlisten) => {
        dispose = unlisten;
      })
      .catch(() => {});
    return () => dispose?.();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const pickFolder = useCallback(async () => {
    if (!isTauri()) {
      setError("A seleção de pastas está disponível apenas no aplicativo desktop.");
      return;
    }
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Escolha uma pasta para o myscan analisar",
      });
      if (typeof selected === "string" && selected) {
        void startScan(selected);
      }
    } catch (reason) {
      setError(cleanError(reason));
    }
  }, [startScan]);

  const applyFilter = useCallback((next: FileFilter, _label: string) => {
    setFilter(next);
    setTab("files");
  }, []);

  const handleClean = useCallback(
    async () => {
      if (!confirm || !summary) return;
      setBusy(true);
      try {
        const result = await api.trash(confirm.targets);
        setConfirm(null);
        if (result.failed.length > 0) {
          notify(
            "warn",
            `${formatNumber(result.removed)} itens movidos; ${formatNumber(
              result.failed.length,
            )} não puderam ser removidos.`,
          );
        } else {
          notify(
            "success",
            `${formatNumber(result.removed)} itens (${formatBytes(
              result.bytes,
            )}) movidos para a Lixeira.`,
          );
        }
        if (result.removed > 0) {
          await startScan(summary.root, true);
        }
      } catch (reason) {
        notify("danger", cleanError(reason));
      } finally {
        setBusy(false);
      }
    },
    [confirm, summary, notify, startScan],
  );

  const cancelScan = useCallback(() => {
    api.cancel().catch(() => {});
  }, []);

  return (
    <>
      {scanning ? (
        <ScanningView progress={progress} path={scanPath} onCancel={cancelScan} />
      ) : !summary ? (
        <Landing
          locations={locations}
          error={error}
          onPickFolder={pickFolder}
          onScan={(path) => void startScan(path)}
        />
      ) : (
        <div className="app-shell">
          <Sidebar
            summary={summary}
            tab={tab}
            onTab={setTab}
            onPickFolder={pickFolder}
          />
          <div className="main">
            <Topbar
              summary={summary}
              onPickFolder={pickFolder}
              onRescan={() => void startScan(summary.root, true)}
            />

            {error && (
              <div className="app-alert" role="alert">
                <Icon name="alert" size={16} />
                <span>{error}</span>
                <button
                  type="button"
                  className="icon-btn"
                  onClick={() => setError(null)}
                  aria-label="Fechar aviso"
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            )}

            <main className="content">
              {tab === "overview" && (
                <Overview summary={summary} onFilter={applyFilter} />
              )}
              {tab === "insights" && (
                <InsightsView
                  insights={summary.insights}
                  reclaimableBytes={summary.reclaimableBytes}
                  onView={applyFilter}
                  onClean={setConfirm}
                />
              )}
              {tab === "map" && <MapView summary={summary} onFilter={applyFilter} />}
              {tab === "files" && (
                <FilesView
                  filter={filter}
                  reloadKey={summary.scannedAt}
                  onFilterChange={setFilter}
                  onClearFilter={() => setFilter({})}
                  onNotify={(message) => notify("info", message)}
                />
              )}
            </main>
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          insight={confirm}
          busy={busy}
          onCancel={() => {
            if (!busy) setConfirm(null);
          }}
          onConfirm={handleClean}
        />
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </>
  );
}
