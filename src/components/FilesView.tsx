import { useEffect, useMemo, useState } from "react";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { FileEntry, FileFilter, FilePage } from "../types";
import { api } from "../lib/api";
import {
  CATEGORY_LABELS,
  TAG_COLORS,
  TAG_LABELS,
  filterEntries,
  formatBytes,
  formatDate,
  formatDateTime,
  formatNumber,
  parentPath,
  shortPath,
} from "../lib/format";
import { Icon } from "./icons";

type SortKey = "size" | "modified" | "name";
type Direction = "asc" | "desc";

interface FilesViewProps {
  filter: FileFilter;
  reloadKey: number;
  onFilterChange: (filter: FileFilter) => void;
  onClearFilter: () => void;
  onNotify: (message: string) => void;
}

const PAGE_SIZE = 100;

export function FilesView({
  filter,
  reloadKey,
  onFilterChange,
  onClearFilter,
  onNotify,
}: FilesViewProps) {
  const [search, setSearch] = useState(filter.query ?? "");
  const [debounced, setDebounced] = useState(search);
  const [sort, setSort] = useState<{ key: SortKey; dir: Direction }>({
    key: "size",
    dir: "desc",
  });
  const [page, setPage] = useState(0);
  const [data, setData] = useState<FilePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<FileEntry | null>(null);

  const chips = useMemo(() => filterEntries(filter), [filter]);

  useEffect(() => {
    setSearch(filter.query ?? "");
  }, [filter.query]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(search), 260);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPage(0);
  }, [filter, debounced, sort]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .queryFiles({
        ...filter,
        query: debounced,
        sort: sort.key,
        direction: sort.dir,
        offset: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      })
      .then((response) => {
        if (cancelled) return;
        setData(response);
        setError(null);
      })
      .catch((reason) => {
        if (!cancelled) setError(String(reason));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter, debounced, sort, page, reloadKey]);

  const toggleSort = (key: SortKey) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === "desc" ? "asc" : "desc" }
        : { key, dir: key === "name" ? "asc" : "desc" },
    );
  };

  const removeChip = (key: keyof FileFilter) => {
    const next: FileFilter = { ...filter };
    delete next[key];
    onFilterChange(next);
    setPage(0);
  };

  const total = data?.total ?? 0;
  const offset = data?.offset ?? 0;
  const items = data?.items ?? [];
  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  const sortIndicator = (key: SortKey) =>
    sort.key === key ? (sort.dir === "desc" ? " ↓" : " ↑") : "";

  const reveal = async (file: FileEntry) => {
    try {
      await revealItemInDir(file.path);
    } catch {
      onNotify("Não foi possível abrir a pasta no Explorer.");
    }
  };

  const copyPath = async (file: FileEntry) => {
    try {
      await navigator.clipboard.writeText(file.path);
      onNotify("Caminho copiado.");
    } catch {
      onNotify("Não foi possível copiar o caminho.");
    }
  };

  return (
    <div className="files-view">
      <div className="section-intro files-intro">
        <div>
          <p className="eyebrow">Explorador</p>
          <h1>Arquivos</h1>
          <p className="muted">
            Filtre, ordene e entenda cada arquivo. Tudo lido localmente do disco.
          </p>
        </div>
        <div className="files-search">
          <Icon name="search" size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome ou caminho…"
            spellCheck={false}
          />
          {search && (
            <button type="button" className="icon-btn" onClick={() => setSearch("")}>
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
      </div>

      {chips.length > 0 && (
        <div className="filter-bar">
          <span className="filter-bar-label">Filtros</span>
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className="filter-chip"
              onClick={() => removeChip(chip.key)}
              title="Remover filtro"
            >
              {chip.label}
              <Icon name="close" size={12} />
            </button>
          ))}
          <button type="button" className="link-btn" onClick={onClearFilter}>
            limpar tudo
          </button>
        </div>
      )}

      <div className={`files-layout ${selected ? "with-detail" : ""}`}>
        <section className="panel table-panel">
          <div className="table-head">
            <span className="table-count">
              {loading ? "Carregando…" : `${formatNumber(total)} arquivos`}
            </span>
            <div className="table-head-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSort({ key: "size", dir: "desc" })}
              >
                <Icon name="refresh" size={14} />
                Reordenar
              </button>
            </div>
          </div>

          {error ? (
            <div className="alert alert-danger" role="alert">
              <Icon name="alert" size={16} />
              <span>{error}</span>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="file-table">
                <thead>
                  <tr>
                    <th>
                      <button type="button" onClick={() => toggleSort("name")}>
                        Nome{sortIndicator("name")}
                      </button>
                    </th>
                    <th>Tipo</th>
                    <th className="align-right">
                      <button type="button" onClick={() => toggleSort("size")}>
                        Tamanho{sortIndicator("size")}
                      </button>
                    </th>
                    <th>
                      <button type="button" onClick={() => toggleSort("modified")}>
                        Modificado{sortIndicator("modified")}
                      </button>
                    </th>
                    <th>Marcadores</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((file) => (
                    <tr
                      key={file.id}
                      className={selected?.id === file.id ? "is-selected" : ""}
                      onClick={() => setSelected(file)}
                    >
                      <td>
                        <div className="name-cell">
                          <span className="file-name" title={file.path}>
                            {file.name}
                          </span>
                          <span className="file-folder">
                            {shortPath(parentPath(file.path), 48)}
                          </span>
                        </div>
                      </td>
                      <td>
                        <span className={`cat-pill cat-${file.category}`}>
                          {CATEGORY_LABELS[file.category] ?? file.category}
                        </span>
                      </td>
                      <td className="align-right mono">{formatBytes(file.size)}</td>
                      <td className="mono muted">{formatDate(file.modified)}</td>
                      <td>
                        <div className="row-tags">
                          {file.tags.slice(0, 3).map((tag) => (
                            <span
                              key={tag}
                              className="mini-tag"
                              style={{
                                color: TAG_COLORS[tag] ?? "#94a3b8",
                                borderColor: `${TAG_COLORS[tag] ?? "#94a3b8"}44`,
                              }}
                            >
                              {TAG_LABELS[tag] ?? tag}
                            </span>
                          ))}
                          {file.tags.length === 0 && <span className="muted tiny">—</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {!loading && items.length === 0 && (
                <div className="table-empty">
                  <Icon name="search" size={26} />
                  <h3>Nenhum arquivo encontrado</h3>
                  <p className="muted small">
                    Tente remover um filtro ou buscar por outro termo.
                  </p>
                  {(chips.length > 0 || search) && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => {
                        onClearFilter();
                        setSearch("");
                      }}
                    >
                      Limpar busca e filtros
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="pagination">
            <span className="muted small">
              {total === 0
                ? "0 arquivos"
                : `${formatNumber(offset + 1)}–${formatNumber(
                    Math.min(offset + items.length, total),
                  )} de ${formatNumber(total)}`}
            </span>
            <div className="pagination-actions">
              <button
                type="button"
                className="icon-btn"
                disabled={page === 0}
                onClick={() => setPage((value) => Math.max(value - 1, 0))}
              >
                <Icon name="chevron-left" size={16} />
              </button>
              <span className="pagination-page">
                {page + 1} / {totalPages}
              </span>
              <button
                type="button"
                className="icon-btn"
                disabled={page + 1 >= totalPages}
                onClick={() => setPage((value) => Math.min(value + 1, totalPages - 1))}
              >
                <Icon name="chevron-right" size={16} />
              </button>
            </div>
          </div>
        </section>

        {selected && (
          <aside className="panel detail-panel">
            <div className="detail-head">
              <span className="detail-icon">
                <Icon name="files" size={18} />
              </span>
              <button type="button" className="icon-btn" onClick={() => setSelected(null)}>
                <Icon name="close" size={16} />
              </button>
            </div>

            <h3 className="detail-name">{selected.name}</h3>
            <p className="detail-path" title={selected.path}>
              {selected.path}
            </p>

            <div className="detail-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => reveal(selected)}
              >
                <Icon name="external" size={14} />
                Mostrar no Explorer
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => copyPath(selected)}
              >
                <Icon name="copy" size={14} />
                Copiar caminho
              </button>
            </div>

            <dl className="detail-grid">
              <div>
                <dt>Tamanho</dt>
                <dd>{formatBytes(selected.size)}</dd>
              </div>
              <div>
                <dt>Tipo</dt>
                <dd>{CATEGORY_LABELS[selected.category] ?? selected.category}</dd>
              </div>
              <div>
                <dt>Modificado</dt>
                <dd>{formatDateTime(selected.modified)}</dd>
              </div>
              <div>
                <dt>Criado</dt>
                <dd>{formatDateTime(selected.created)}</dd>
              </div>
              <div>
                <dt>Extensão</dt>
                <dd>{selected.ext ? `.${selected.ext}` : "sem extensão"}</dd>
              </div>
              <div>
                <dt>Profundidade</dt>
                <dd>{selected.depth} níveis</dd>
              </div>
            </dl>

            <div className="detail-tags">
              <span className="detail-tags-label">Marcadores</span>
              {selected.tags.length === 0 ? (
                <span className="muted small">Nenhum marcador de limpeza.</span>
              ) : (
                selected.tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className="tag-chip small"
                    onClick={() => {
                      onFilterChange({ tag });
                      setSelected(null);
                    }}
                  >
                    <span
                      className="tag-dot"
                      style={{ background: TAG_COLORS[tag] ?? "#94a3b8" }}
                    />
                    <span className="tag-name">{TAG_LABELS[tag] ?? tag}</span>
                  </button>
                ))
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
