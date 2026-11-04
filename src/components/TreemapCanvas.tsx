import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { TreeDir } from "../types";
import { formatBytes, formatNumber, percent } from "../lib/format";

/**
 * Paleta de ramos: cada pasta de primeiro nível recebe uma cor viva, e os
 * níveis internos herdam a cor escurecendo. É o que dá leitura imediata de
 * "quem está ocupando o quê" sem precisar de legenda em cada bloco.
 */
const BRANCH_COLORS = [
  "#ff5d6c",
  "#ff9f43",
  "#facc15",
  "#4ade80",
  "#22d3ee",
  "#5b8cff",
  "#a855f7",
  "#f472b6",
  "#2dd4bf",
  "#f97316",
  "#a3e635",
  "#38bdf8",
];

const PALETTE_FOR = new Map<string, string>();

export function colorForBranch(key: string, index: number): string {
  const cached = PALETTE_FOR.get(key);
  if (cached) return cached;
  const color = BRANCH_COLORS[index % BRANCH_COLORS.length];
  PALETTE_FOR.set(key, color);
  return color;
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  const full =
    value.length === 3
      ? value
          .split("")
          .map((part) => part + part)
          .join("")
      : value;
  const int = Number.parseInt(full, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

/** Mistura uma cor com outra (0 = cor original, 1 = alvo). */
function mix(hex: string, target: string, amount: number): string {
  const [r1, g1, b1] = hexToRgb(hex);
  const [r2, g2, b2] = hexToRgb(target);
  const r = Math.round(r1 + (r2 - r1) * amount);
  const g = Math.round(g1 + (g2 - g1) * amount);
  const b = Math.round(b1 + (b2 - b1) * amount);
  return `rgb(${r}, ${g}, ${b})`;
}

function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function worstRatio(areas: number[], side: number): number {
  let sum = 0;
  let max = -Infinity;
  let min = Infinity;
  for (const area of areas) {
    sum += area;
    if (area > max) max = area;
    if (area < min) min = area;
  }
  if (sum <= 0 || min <= 0) return Infinity;
  const side2 = side * side;
  const sum2 = sum * sum;
  return Math.max((side2 * max) / sum2, sum2 / (side2 * min));
}

/** Treemap "squarified": blocos próximos de quadrados, sem tiras finas. */
export function squarify(values: number[], rect: Rect): Rect[] {
  const output: Rect[] = new Array(values.length);
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total <= 0 || rect.w <= 0 || rect.h <= 0) {
    return values.map(() => ({ x: rect.x, y: rect.y, w: rect.w, h: rect.h }));
  }

  const scale = (rect.w * rect.h) / total;
  const items = values.map((value, index) => ({ area: value * scale, index }));
  const free: Rect = { ...rect };
  let cursor = 0;

  while (cursor < items.length) {
    const side = Math.min(free.w, free.h);
    const row: { area: number; index: number }[] = [];
    let best = Infinity;

    while (cursor < items.length) {
      const candidate = [...row, items[cursor]];
      const score = worstRatio(
        candidate.map((item) => item.area),
        side,
      );
      if (row.length === 0 || score <= best) {
        best = score;
        row.push(items[cursor]);
        cursor += 1;
      } else {
        break;
      }
    }

    const rowArea = row.reduce((sum, item) => sum + item.area, 0);
    if (free.w >= free.h) {
      const stripWidth = rowArea / free.h;
      let offset = free.y;
      for (const item of row) {
        const height = item.area / stripWidth;
        output[item.index] = { x: free.x, y: offset, w: stripWidth, h: height };
        offset += height;
      }
      free.x += stripWidth;
      free.w -= stripWidth;
    } else {
      const stripHeight = rowArea / free.w;
      let offset = free.x;
      for (const item of row) {
        const width = item.area / stripHeight;
        output[item.index] = { x: offset, y: free.y, w: width, h: stripHeight };
        offset += width;
      }
      free.y += stripHeight;
      free.h -= stripHeight;
    }
  }

  return output;
}

interface Tile {
  key: string;
  node: TreeDir;
  depth: number;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  parent: TreeDir | null;
  hasChildren: boolean;
}

const MAX_DEPTH = 5;
const GAP = 1.5;
const PAD = 5;
const HEADER = 19;

function buildTiles(focus: TreeDir, width: number, height: number): Tile[] {
  const tiles: Tile[] = [];
  const roots = focus.children.filter((child) => child.bytes > 0).sort((a, b) => b.bytes - a.bytes);
  if (roots.length === 0) return tiles;

  const rects = squarify(
    roots.map((child) => child.bytes),
    { x: GAP, y: GAP, w: width - GAP * 2, h: height - GAP * 2 },
  );

  const walk = (
    node: TreeDir,
    rect: Rect,
    depth: number,
    color: string,
    parent: TreeDir | null,
  ) => {
    if (rect.w < 2 || rect.h < 2) return;
    const children = node.children.filter((child) => child.bytes > 0);
    const canNest =
      node.kind === "dir" &&
      children.length > 0 &&
      depth < MAX_DEPTH &&
      rect.w > 96 &&
      rect.h > 64 &&
      tiles.length < 900;

    const tile: Tile = {
      key: `${node.path}|${node.kind}|${depth}|${node.bytes}|${tiles.length}`,
      node,
      depth,
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      color,
      parent,
      hasChildren: canNest,
    };
    tiles.push(tile);

    if (!canNest) return;

    const inner: Rect = {
      x: rect.x + PAD,
      y: rect.y + HEADER,
      w: rect.w - PAD * 2,
      h: rect.h - HEADER - PAD,
    };
    if (inner.w < 8 || inner.h < 8) return;

    const sorted = [...children].sort((a, b) => b.bytes - a.bytes);
    const childRects = squarify(
      sorted.map((child) => child.bytes),
      inner,
    );
    sorted.forEach((child, index) => {
      walk(child, childRects[index], depth + 1, color, node);
    });
  };

  roots.forEach((node, index) => {
    walk(node, rects[index], 0, colorForBranch(node.path + node.name, index), focus);
  });

  return tiles;
}

interface TreemapCanvasProps {
  focus: TreeDir;
  width: number;
  height: number;
  onZoom: (node: TreeDir) => void;
  onOpen: (node: TreeDir) => void;
  externalHover?: string | null;
  onHover?: (node: TreeDir | null) => void;
}

export function TreemapCanvas({
  focus,
  width,
  height,
  onZoom,
  onOpen,
  externalHover,
  onHover,
}: TreemapCanvasProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });

  const tiles = useMemo(() => buildTiles(focus, width, height), [focus, width, height]);

  useEffect(() => {
    setHovered(null);
  }, [focus.path]);

  const activeKey =
    hovered ??
    tiles.find(
      (tile) => `${tile.node.kind}|${tile.node.path}` === externalHover,
    )?.key ??
    null;
  const active = tiles.find((tile) => tile.key === activeKey) ?? null;
  const highlight = (node: TreeDir | null) => onHover?.(node);

  const tooltipWidth = 250;

  const placeTooltip = (clientX: number, clientY: number) => {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    const x = Math.min(
      Math.max(clientX - box.left + 16, 8),
      Math.max(width - tooltipWidth - 8, 8),
    );
    const y = Math.min(
      Math.max(clientY - box.top + 18, 8),
      Math.max(height - 118, 8),
    );
    pointerRef.current = { x, y };
    if (tipRef.current) {
      tipRef.current.style.transform = `translate(${x}px, ${y}px)`;
    }
  };

  useLayoutEffect(() => {
    if (active && tipRef.current) {
      const { x, y } = pointerRef.current;
      tipRef.current.style.transform = `translate(${x}px, ${y}px)`;
    }
  }, [active]);

  if (tiles.length === 0) {
    return (
      <div className="map-empty">
        <p className="muted">Nada para desenhar nesta pasta.</p>
      </div>
    );
  }

  return (
    <div
      className="map-canvas-inner"
      ref={wrapRef}
      onMouseMove={(event) => placeTooltip(event.clientX, event.clientY)}
      onMouseLeave={() => {
        setHovered(null);
        highlight(null);
      }}
    >
      <svg width={width} height={height} className="map-svg" role="img" aria-label="Mapa de espaço">
        <defs>
          <linearGradient id="tile-sheen" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.16)" />
            <stop offset="55%" stopColor="rgba(255, 255, 255, 0.02)" />
            <stop offset="100%" stopColor="rgba(0, 0, 0, 0.2)" />
          </linearGradient>
        </defs>

        {tiles.map((tile) => {
          const isActive = activeKey === tile.key;
          const depthShade = Math.min(tile.depth, 4) * 0.09;
          const base = mix(tile.color, "#080a0e", depthShade);
          const fill = tile.hasChildren
            ? mix(tile.color, "#0b1016", 0.74)
            : mix(tile.color, "#0b1016", 0.16);

          const showLabel = tile.w > 46 && tile.h > 20;
          const showSize = tile.h > 44 && tile.w > 72;
          const ink =
            luminance(mix(base, "#000000", tile.hasChildren ? 0.18 : 0)) > 0.58
              ? "#0a1017"
              : "#ffffff";
          const labelRoom = Math.max(Math.floor((tile.w - (tile.hasChildren ? 12 : 16)) / 5.9), 0);
          const rawLabel =
            tile.node.kind === "files" ? "arquivos soltos" : tile.node.name;
          const label =
            rawLabel.length > labelRoom && labelRoom > 1
              ? `${rawLabel.slice(0, Math.max(labelRoom - 1, 1))}…`
              : rawLabel;

          return (
            <g
              key={tile.key}
              className={`map-tile ${isActive ? "is-active" : ""} ${
                tile.hasChildren ? "is-folder" : ""
              }`}
              onMouseEnter={(event) => {
                placeTooltip(event.clientX, event.clientY);
                setHovered(tile.key);
                highlight(tile.node);
              }}
              onClick={(event) => {
                event.stopPropagation();
                if (tile.node.kind === "dir" && tile.node.children.length > 0) {
                  onZoom(tile.node);
                } else if (tile.node.kind !== "rest") {
                  onOpen(tile.node);
                }
              }}
            >
              <rect
                x={tile.x}
                y={tile.y}
                width={Math.max(tile.w - GAP, 1)}
                height={Math.max(tile.h - GAP, 1)}
                rx={tile.depth === 0 ? 7 : 4}
                fill={fill}
                stroke={isActive ? "#ffffff" : "rgba(8, 10, 14, 0.55)"}
                strokeWidth={isActive ? 1.6 : 1}
              />
              {tile.hasChildren && (
                <rect
                  x={tile.x}
                  y={tile.y}
                  width={Math.max(tile.w - GAP, 1)}
                  height={Math.min(HEADER - 2, Math.max(tile.h - GAP, 1))}
                  rx={tile.depth === 0 ? 7 : 4}
                  fill={mix(base, "#000000", 0.18)}
                  fillOpacity={0.95}
                />
              )}
              {!tile.hasChildren && (
                <rect
                  x={tile.x}
                  y={tile.y}
                  width={Math.max(tile.w - GAP, 1)}
                  height={Math.max(tile.h - GAP, 1)}
                  rx={4}
                  fill="url(#tile-sheen)"
                  pointerEvents="none"
                />
              )}
              {showLabel && (
                <text
                  x={tile.x + (tile.hasChildren ? 8 : 9)}
                  y={tile.y + (tile.hasChildren ? 13.5 : 19)}
                  className="map-tile-label"
                  fill={ink}
                  opacity={tile.hasChildren ? 0.96 : 0.93}
                >
                  {label}
                </text>
              )}
              {!tile.hasChildren && showSize && (
                <text
                  x={tile.x + 9}
                  y={tile.y + 35}
                  className="map-tile-size"
                  fill={ink}
                  opacity={0.78}
                >
                  {formatBytes(tile.node.bytes)}
                </text>
              )}
              {tile.hasChildren && showSize && (
                <text
                  x={tile.x + tile.w - PAD - 2}
                  y={tile.y + 13.5}
                  className="map-tile-size map-tile-size--right"
                  fill={ink}
                  opacity={0.62}
                >
                  {formatBytes(tile.node.bytes)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {active && (
        <div
          ref={tipRef}
          className="map-tooltip"
          style={{ width: tooltipWidth }}
        >
          <div className="map-tooltip-head">
            <span className="map-tooltip-dot" style={{ background: active.color }} />
            <strong>
              {active.node.kind === "files" ? "Arquivos soltos" : active.node.name}
            </strong>
          </div>
          <div className="map-tooltip-row">
            <span>{formatBytes(active.node.bytes)}</span>
            <span>{percent(active.node.bytes, focus.bytes)}% da pasta</span>
          </div>
          <div className="map-tooltip-row muted">
            <span>{formatNumber(active.node.files)} arquivos</span>
            <span>{formatNumber(active.node.dirs)} subpastas</span>
          </div>
          <p className="map-tooltip-path" title={active.node.path}>
            {active.node.path}
          </p>
          <p className="map-tooltip-hint">
            {active.node.kind === "rest"
              ? "Pastas pequenas agrupadas"
              : active.node.kind === "dir" && active.node.children.length > 0
                ? "Clique para mergulhar"
                : "Clique para ver os arquivos"}
          </p>
        </div>
      )}
    </div>
  );
}
