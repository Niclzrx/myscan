import type { FileFilter, ScanSummary } from "../types";
import {
  TAG_LABELS,
  formatBytes,
  formatDate,
  formatNumber,
  parentPath,
  percent,
  shortPath,
} from "../lib/format";
import { BarList, Donut } from "./Charts";
import { Icon } from "./icons";

interface OverviewProps {
  summary: ScanSummary;
  onFilter: (filter: FileFilter, label: string) => void;
}

export function Overview({ summary, onFilter }: OverviewProps) {
  const categoryColors = Object.fromEntries(
    summary.categories.map((item) => [item.key, item.color]),
  );
  const reclaimableShare = percent(summary.reclaimableBytes, summary.bytes);
  const topTags = summary.tags
    .filter((tag) => tag.bytes > 0 || tag.key === "empty")
    .slice(0, 8);

  return (
    <div className="overview">
      <div className="stats">
        <article className="stat-card">
          <span className="stat-icon">
            <Icon name="files" size={18} />
          </span>
          <span className="stat-label">Arquivos</span>
          <strong className="stat-value">{formatNumber(summary.files)}</strong>
          <span className="stat-sub">{formatNumber(summary.dirs)} pastas analisadas</span>
        </article>

        <article className="stat-card">
          <span className="stat-icon blue">
            <Icon name="database" size={18} />
          </span>
          <span className="stat-label">Espaço ocupado</span>
          <strong className="stat-value">{formatBytes(summary.bytes)}</strong>
          <span className="stat-sub">
            varredura em {(summary.durationMs / 1000).toFixed(1)}s
          </span>
        </article>

        <article className="stat-card accent">
          <span className="stat-icon accent">
            <Icon name="sparkles" size={18} />
          </span>
          <span className="stat-label">Recuperável</span>
          <strong className="stat-value">{formatBytes(summary.reclaimableBytes)}</strong>
          <span className="stat-sub">
            {formatNumber(summary.reclaimableCount)} arquivos · {reclaimableShare}% do total
          </span>
        </article>

        <article className="stat-card danger">
          <span className="stat-icon danger">
            <Icon name="copy" size={18} />
          </span>
          <span className="stat-label">Duplicados</span>
          <strong className="stat-value">{formatBytes(summary.duplicateBytes)}</strong>
          <span className="stat-sub">{formatNumber(summary.duplicateGroups)} grupos idênticos</span>
        </article>
      </div>

      <div className="dash-grid">
        <section className="panel span-7">
          <div className="panel-head">
            <div>
              <h2>Tipos de arquivo</h2>
              <p className="muted small">Onde o espaço está concentrado</p>
            </div>
            <span className="panel-badge">{summary.categories.length} tipos</span>
          </div>
          <Donut items={summary.categories} total={summary.bytes} />
        </section>

        <section className="panel span-5">
          <div className="panel-head">
            <div>
              <h2>Idade dos arquivos</h2>
              <p className="muted small">Última modificação</p>
            </div>
          </div>
          <BarList items={summary.ages} total={summary.bytes} limit={6} />
        </section>

        <section className="panel span-5">
          <div className="panel-head">
            <div>
              <h2>Pastas que mais ocupam</h2>
              <p className="muted small">Clique para filtrar</p>
            </div>
          </div>
          <BarList
            items={summary.folders}
            total={summary.bytes}
            limit={7}
            onSelect={(item) =>
              onFilter({ folder: item.key }, `Pasta: ${item.label}`)
            }
          />
        </section>

        <section className="panel span-7">
          <div className="panel-head">
            <div>
              <h2>Maiores arquivos</h2>
              <p className="muted small">Clique para localizar na lista</p>
            </div>
          </div>
          <div className="largest-list">
            {summary.largest.slice(0, 7).map((file) => (
              <button
                key={file.id}
                type="button"
                className="largest-row"
                onClick={() => onFilter({ query: file.name }, `Arquivo: ${file.name}`)}
                title={file.path}
              >
                <span
                  className="file-dot"
                  style={{ background: categoryColors[file.category] ?? "#5eead4" }}
                />
                <span className="largest-info">
                  <span className="largest-name">{file.name}</span>
                  <span className="largest-path">
                    {shortPath(parentPath(file.path), 52)}
                  </span>
                </span>
                <span className="largest-size">{formatBytes(file.size)}</span>
                <span className="largest-date">{formatDate(file.modified)}</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      {topTags.length > 0 && (
        <section className="panel tags-panel">
          <div className="panel-head">
            <div>
              <h2>Sinais de limpeza</h2>
              <p className="muted small">
                Tudo o que o myscan marcou como candidato a revisão
              </p>
            </div>
          </div>
          <div className="tag-chips">
            {topTags.map((tag) => (
              <button
                key={tag.key}
                type="button"
                className="tag-chip"
                onClick={() =>
                  onFilter(
                    { tag: tag.key },
                    TAG_LABELS[tag.key] ?? tag.key,
                  )
                }
                style={{ borderColor: `${tag.color}55` }}
              >
                <span className="tag-dot" style={{ background: tag.color }} />
                <span className="tag-name">
                  {TAG_LABELS[tag.key] ?? tag.key}
                </span>
                <span className="tag-meta">
                  {tag.bytes > 0 ? formatBytes(tag.bytes) : `${formatNumber(tag.count)} itens`}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
