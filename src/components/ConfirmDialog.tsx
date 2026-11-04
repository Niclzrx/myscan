import { useEffect } from "react";
import type { Insight } from "../types";
import { formatBytes, formatNumber, shortPath } from "../lib/format";
import { Icon } from "./icons";

interface ConfirmDialogProps {
  insight: Insight;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmDialog({ insight, busy, onCancel, onConfirm }: ConfirmDialogProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  const kind = insight.targetKind === "folders" ? "pastas" : "arquivos";

  return (
    <div className="modal-overlay" role="presentation" onMouseDown={onCancel}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="modal-icon">
          <Icon name="trash" size={22} />
        </div>
        <h2 id="confirm-title">Mover para a Lixeira?</h2>
        <p className="muted">
          {formatNumber(insight.targets.length)} {kind} ·{" "}
          <strong>{formatBytes(insight.targetBytes)}</strong> serão enviados para a
          Lixeira do Windows.
        </p>

        <ul className="target-list">
          {insight.targets.slice(0, 6).map((target) => (
            <li key={target} title={target}>
              {shortPath(target, 62)}
            </li>
          ))}
          {insight.targets.length > 6 && (
            <li className="muted">
              + {formatNumber(insight.targets.length - 6)} outros itens
            </li>
          )}
        </ul>

        <div className="modal-note">
          <Icon name="info" size={15} />
          <span>
            Você pode restaurar os itens na Lixeira. Pastas de cache serão recriadas
            automaticamente quando você precisar delas.
          </span>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
            <Icon name="trash" size={15} />
            {busy ? "Movendo…" : "Mover para a Lixeira"}
          </button>
        </div>
      </div>
    </div>
  );
}
