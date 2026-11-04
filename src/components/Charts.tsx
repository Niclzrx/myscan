import { useState } from "react";
import type { Bucket } from "../types";
import { formatBytes, formatNumber, percent } from "../lib/format";

interface DonutProps {
  items: Bucket[];
  total: number;
  label?: string;
}

export function Donut({ items, total, label = "no total" }: DonutProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const radius = 88;
  const circumference = 2 * Math.PI * radius;
  const visible = items.filter((item) => item.bytes > 0);

  let running = 0;
  const segments = visible.map((item) => {
    const share = total > 0 ? item.bytes / total : 0;
    const length = share * circumference;
    const segment = {
      item,
      length,
      offset: running,
      share,
    };
    running += length;
    return segment;
  });

  const active = segments.find((segment) => segment.item.key === hovered);

  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 240 240" className="donut" role="img" aria-label="DistribuiÃ§Ã£o por tipo">
        <circle cx="120" cy="120" r={radius} className="donut-track" strokeWidth="26" />
        {segments.map(({ item, length, offset }) => {
          const dash = Math.max(length - 2.5, 0.5);
          return (
            <circle
              key={item.key}
              cx="120"
              cy="120"
              r={radius}
              fill="none"
              stroke={item.color}
              strokeWidth={hovered === item.key ? 32 : 26}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 120 120)"
              className="donut-segment"
              onMouseEnter={() => setHovered(item.key)}
              onMouseLeave={() => setHovered(null)}
            >
              <title>
                {item.label}: {formatBytes(item.bytes)} ({percent(item.bytes, total)}%)
              </title>
            </circle>
          );
        })}
        <text x="120" y="112" className="donut-value" textAnchor="middle">
          {active ? `${percent(active.item.bytes, total)}%` : formatBytes(total)}
        </text>
        <text x="120" y="134" className="donut-label" textAnchor="middle">
          {active ? active.item.label : label}
        </text>
        {active && (
          <text x="120" y="154" className="donut-sub" textAnchor="middle">
            {formatBytes(active.item.bytes)}
          </text>
        )}
      </svg>
      <div className="legend">
        {visible.map((item) => (
          <button
            key={item.key}
            className={`legend-item ${hovered === item.key ? "is-active" : ""}`}
            onMouseEnter={() => setHovered(item.key)}
            onMouseLeave={() => setHovered(null)}
            type="button"
          >
            <span className="legend-dot" style={{ background: item.color }} />
            <span className="legend-name">{item.label}</span>
            <span className="legend-value">{formatBytes(item.bytes)}</span>
            <span className="legend-share">{percent(item.bytes, total)}%</span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface BarListProps {
  items: Bucket[];
  total: number;
  onSelect?: (item: Bucket) => void;
  showCount?: boolean;
  limit?: number;
  valueMode?: "bytes" | "count";
}

export function BarList({
  items,
  total,
  onSelect,
  showCount = true,
  limit = 10,
  valueMode = "bytes",
}: BarListProps) {
  const max = Math.max(...items.map((item) => (valueMode === "bytes" ? item.bytes : item.count)), 1);
  const value = (item: Bucket) => (valueMode === "bytes" ? item.bytes : item.count);
  const label = (item: Bucket) =>
    valueMode === "bytes" ? formatBytes(item.bytes) : formatNumber(item.count);

  if (items.length === 0) {
    return <p className="muted small">Nada para mostrar.</p>;
  }

  return (
    <div className="bar-list">
      {items.slice(0, limit).map((item) => {
        const share = (value(item) / max) * 100;
        const content = (
          <>
            <span className="bar-top">
              <span className="bar-name" title={item.key}>
                {item.label}
              </span>
              <span className="bar-value">
                {label(item)}
                {showCount && valueMode === "bytes" && (
                  <span className="bar-count"> Â· {formatNumber(item.count)}</span>
                )}
              </span>
            </span>
            <span className="bar-track">
              <span
                className="bar-fill"
                style={{
                  width: `${Math.max(share, 1.5)}%`,
                  background: item.color || "#5eead4",
                }}
              />
            </span>
          </>
        );
        return onSelect ? (
          <button
            key={item.key}
            type="button"
            className="bar-row is-clickable"
            onClick={() => onSelect(item)}
            title={`Filtrar por ${item.label}`}
          >
            {content}
          </button>
        ) : (
          <div key={item.key} className="bar-row">
            {content}
          </div>
        );
      })}
      {items.length > limit && (
        <p className="muted tiny">+ {items.length - limit} outros</p>
      )}
      <span className="sr-only">Total: {formatBytes(total)}</span>
    </div>
  );
}

