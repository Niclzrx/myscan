import type { ScanSummary } from "../types";
import { relativeTime, shortPath } from "../lib/format";
import { Icon } from "./icons";

interface TopbarProps {
  summary: ScanSummary;
  onPickFolder: () => void;
  onRescan: () => void;
}

export function Topbar({ summary, onPickFolder, onRescan }: TopbarProps) {
  return (
    <header className="topbar">
      <div className="root-pill" title={summary.root}>
        <span className="root-icon">
          <Icon name="drive" size={16} />
        </span>
        <span className="root-text">
          <strong>{summary.rootName}</strong>
          <span>{shortPath(summary.root, 58)}</span>
        </span>
      </div>

      <div className="topbar-actions">
        <span className="scan-meta">
          <Icon name="clock" size={14} />
          {relativeTime(summary.scannedAt)}
        </span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRescan}>
          <Icon name="refresh" size={15} />
          Reanalisar
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onPickFolder}>
          <Icon name="folder" size={15} />
          Nova pasta
        </button>
      </div>
    </header>
  );
}
