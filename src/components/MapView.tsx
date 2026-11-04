import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FileFilter, ScanSummary, TreeDir } from "../types";
import { api, isTauri } from "../lib/api";
import { formatBytes, formatNumber, percent } from "../lib/format";
import { Icon } from "./icons";
import { TreemapCanvas, colorForBranch } from "./TreemapCanvas";

interface MapViewProps {
  summary: ScanSummary;
  onFilter: (filter: FileFilter, label: string) => void;
}

function findNode(root: TreeDir, path: string): TreeDir | null {
  if (root.path === path && root.kind === "dir") return root;
  for (const child of root.children) {
    if (child.kind !== "dir") continue;
    const found = findNode(child, path);
    if (found) return found;
  }
  return null;
}

function chainTo(root: TreeDir, path: string): TreeDir[] {
  if (root.path === path) return [root];
  for (const child of root.children) {
    if (child.kind !== "dir") continue;
    const sub = chainTo(child, path);
    if (sub.length > 0) return [root, ...sub];
  }
  return [];
}

function biggest(nodes: TreeDir[]): TreeDir | null {
  let best: TreeDir | null = null;
  for (const node of nodes) {
    if (!best || node.bytes > best.bytes) best = node;
  }
  return best;
}

export function MapView({ summary, onFilter }: MapViewProps) {
  const [tree, setTree] = useState<TreeDir | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [focusPath, setFocusPath] = useState<string | null>(null);
  const [hoverPath, setHoverPath] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const canvasRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isTauri()) {
      setError("O mapa detalhado está disponível no aplicativo desktop.");
      return;
    }
    let alive = true;
    setError(null);
    api
      .tree()
      .then((value) => {
        if (alive) {
          setTree(value);
          setFocusPath(null);
        }
      })
      .catch((reason) => {
        if (alive) setError(String(reason));
      });
    return () => {
      alive = false;
    };
  }, [summary.scannedAt]);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ w: Math.floor(width), h: Math.floor(height) });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [tree]);

  const focus = useMemo(() => {
    if (!tree) return null;
    if (!focusPath) return tree;
    return findNode(tree, focusPath) ?? tree;
  }, [tree, focusPath]);

  const trail = useMemo(() => {
    if (!tree || !focus) return [];
    return chainTo(tree, focus.path);
  }, [tree, focus]);

  const openFiles = useCallback(
    (node: TreeDir) => {
      const label = node.kind === "files" ? "Arquivos soltos" : node.name;
      onFilter({ folder: node.path }, `Pasta: ${label}`);
    },
    [onFilter],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setFocusPath((current) => {
        if (!current || !tree) return null;
        const chain = chainTo(tree, current);
        return chain.length > 1 ? chain[chain.length - 2].path : null;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tree]);

  if (!tree || !focus) {
    return (
      <div className="map-view">
        <div className="section-intro">
          <p className="eyebrow">Mapa de espaço</p>
          <h1>Onde os bytes realmente estão</h1>
          <p className="muted">
            {error ?? "Montando o mapa desta varredura…"}
          </p>
        </div>
      </div>
    );
  }

  const children = [...focus.children]
    .filter((child) => child.bytes > 0)
    .sort((a, b) => b.bytes - a.bytes);
  const legend = children.slice(0, 12);
  const hoverKey = hoverPath;
  const largest = biggest(children);
  const loose = children.find((child) => child.kind === "files");

  return (
    <div className="map-tab">
      <header className="map-toolbar">
        <div className="map-heading">
          <p className="eyebrow">Mapa de espaço</p>
          <nav className="map-crumbs" aria-label="Caminho no mapa">
            <button
              type="button"
              className={trail.length === 1 ? "is-current" : ""}
              onClick={() => setFocusPath(null)}
              title={tree.path}
            >
              {tree.name}
            </button>
            {trail.slice(1).map((node, index) => (
              <span key={`${node.path}-${index}`} className="map-crumb">
                <Icon name="chevron-right" size={12} />
                <button
                  type="button"
                  className={index === trail.length - 2 ? "is-current" : ""}
                  onClick={() => setFocusPath(node.path)}
                  title={node.path}
                >
                  {node.kind === "files" ? "arquivos soltos" : node.name}
                </button>
              </span>
            ))}
          </nav>
        </div>

        <div className="map-figures">
          <span className="map-figure">
            <strong>{formatBytes(focus.bytes)}</strong>
            <span>{formatNumber(focus.files)} arquivos</span>
          </span>
          <span className="map-figure">
            <strong>{formatNumber(focus.dirs)}</strong>
            <span>subpastas</span>
          </span>
          {largest && (
            <span className="map-figure">
              <strong>{formatBytes(largest.bytes)}</strong>
              <span title={largest.path}>
                maior: {largest.kind === "files" ? "arquivos soltos" : largest.name}
              </span>
            </span>
          )}
        </div>

        <div className="map-actions">
          {trail.length > 1 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setFocusPath(trail[trail.length - 2].path)}
              title="Voltar um nível (Esc)"
            >
              <Icon name="arrowLeft" size={14} />
              Voltar
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => openFiles(focus)}
          >
            Ver arquivos
            <Icon name="arrowRight" size={14} />
          </button>
        </div>
      </header>

      <div className="map-canvas" ref={canvasRef}>
        {size.w > 0 && size.h > 0 ? (
          <TreemapCanvas
            focus={focus}
            width={size.w}
            height={size.h}
            onZoom={(node) => setFocusPath(node.path)}
            onOpen={openFiles}
            externalHover={hoverKey}
            onHover={(node) =>
              setHoverPath(node ? `${node.kind}|${node.path}` : null)
            }
          />
        ) : null}
        <div className="map-hint">
          Clique para mergulhar na pasta · Esc volta um nível
        </div>
      </div>

      <footer className="map-legend" aria-label="Legenda do mapa">
        <span className="map-legend-title">Neste nível</span>
        {legend.map((node, index) => (
          <button
            key={`${node.path}-${node.kind}-${index}`}
            type="button"
            className={`map-legend-item ${hoverPath === `${node.kind}|${node.path}` ? "is-active" : ""}`}
            onMouseEnter={() => setHoverPath(`${node.kind}|${node.path}`)}
            onMouseLeave={() => setHoverPath(null)}
            onClick={() => {
              if (node.kind === "dir") setFocusPath(node.path);
              else if (node.kind === "files") openFiles(node);
            }}
            title={node.path}
          >
            <span
              className="map-legend-dot"
              style={{ background: colorForBranch(node.path + node.name, index) }}
            />
            <span className="map-legend-name">
              {node.kind === "files" ? "arquivos soltos" : node.name}
            </span>
            <span className="map-legend-value">{formatBytes(node.bytes)}</span>
            <span className="map-legend-share">{percent(node.bytes, focus.bytes)}%</span>
          </button>
        ))}
        {children.length > legend.length && (
          <span className="map-legend-more">+{children.length - legend.length} menores</span>
        )}
        {loose && (
          <button
            type="button"
            className="btn btn-ghost btn-sm map-legend-action"
            onClick={() => openFiles(loose)}
          >
            Ver arquivos soltos
            <Icon name="arrowRight" size={13} />
          </button>
        )}
      </footer>
    </div>
  );
}
