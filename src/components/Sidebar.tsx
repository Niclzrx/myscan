import type { ScanSummary } from "../types";
import { formatBytes, formatNumber, relativeTime, shortPath } from "../lib/format";
import { Icon } from "./icons";

export type Tab = "overview" | "insights" | "map" | "files";

interface SidebarProps {
  summary: ScanSummary;
  tab: Tab;
  onTab: (tab: Tab) => void;
  onPickFolder: () => void;
}

const NAV = [
  { key: "overview" as const, label: "Visão geral", icon: "grid" as const },
  { key: "insights" as const, label: "Insights", icon: "sparkles" as const },
  { key: "map" as const, label: "Mapa", icon: "map" as const },
  { key: "files" as const, label: "Arquivos", icon: "files" as const },
];

export function Sidebar({ summary, tab, onTab, onPickFolder }: SidebarProps) {
  const counts: Record<Tab, string | null> = {
    overview: null,
    insights: summary.insights.length ? String(summary.insights.length) : null,
    map: null,
    files: formatNumber(summary.files),
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="logo-mark small">
          <Icon name="scan" size={18} />
        </span>
        <span className="logo-word">
          my<span>scan</span>
        </span>
      </div>

      <nav className="nav" aria-label="Seções">
        {NAV.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`nav-item ${tab === item.key ? "is-active" : ""}`}
            onClick={() => onTab(item.key)}
          >
            <Icon name={item.icon} size={18} />
            <span>{item.label}</span>
            {counts[item.key] && <span className="nav-count">{counts[item.key]}</span>}
          </button>
        ))}
      </nav>

      <div className="sidebar-spacer" />

      <div className="scan-card">
        <span className="scan-card-label">Pasta analisada</span>
        <strong title={summary.root}>{summary.rootName}</strong>
        <span className="scan-card-path" title={summary.root}>
          {shortPath(summary.root, 30)}
        </span>
        <div className="scan-card-meta">
          <span>{formatNumber(summary.files)} arquivos</span>
          <span>{formatBytes(summary.bytes)}</span>
        </div>
        <div className="scan-card-meta">
          <span>{relativeTime(summary.scannedAt)}</span>
          {summary.errors > 0 && <span className="warn-text">{summary.errors} sem acesso</span>}
        </div>
        <button type="button" className="btn btn-ghost btn-sm btn-block" onClick={onPickFolder}>
          <Icon name="folder" size={15} />
          Trocar pasta
        </button>
      </div>

      <div className="sidebar-privacy">
        <Icon name="shield" size={13} />
        <span>100% local · nada é enviado</span>
      </div>
    </aside>
  );
}
