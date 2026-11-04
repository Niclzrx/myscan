import type { FileFilter, Insight } from "../types";
import { formatBytes, formatNumber } from "../lib/format";
import { Icon } from "./icons";

interface InsightsViewProps {
  insights: Insight[];
  reclaimableBytes: number;
  onView: (filter: FileFilter, label: string) => void;
  onClean: (insight: Insight) => void;
}

const TONE_LABEL: Record<Insight["tone"], string> = {
  danger: "Prioridade",
  warn: "Atenção",
  info: "Sugestão",
  good: "Tudo certo",
};

const TONE_ICON: Record<Insight["tone"], "alert" | "info" | "check" | "sparkles"> = {
  danger: "alert",
  warn: "alert",
  info: "info",
  good: "check",
};

export function InsightsView({ insights, reclaimableBytes, onView, onClean }: InsightsViewProps) {
  return (
    <div className="insights">
      <div className="section-intro">
        <p className="eyebrow">Análise local</p>
        <h1>O que merece a sua atenção</h1>
        <p className="muted">
          Regras locais cruzam tipo, tamanho, idade e conteúdo para encontrar cache,
          duplicados e arquivos que você provavelmente não precisa mais.
          {reclaimableBytes > 0 && (
            <>
              {" "}
              Há <strong className="accent-text">{formatBytes(reclaimableBytes)}</strong> em
              candidatos a limpeza.
            </>
          )}
        </p>
      </div>

      <div className="insight-grid">
        {insights.map((insight) => (
          <article key={insight.id} className={`insight-card tone-${insight.tone}`}>
            <div className="insight-top">
              <span className="insight-icon">
                <Icon name={TONE_ICON[insight.tone]} size={18} />
              </span>
              <span className="tone-badge">{TONE_LABEL[insight.tone]}</span>
            </div>

            <h3>{insight.title}</h3>
            <p className="insight-detail">{insight.detail}</p>

            <div className="insight-metrics">
              <div>
                <strong>{insight.bytes > 0 ? formatBytes(insight.bytes) : "—"}</strong>
                <span>envolvidos</span>
              </div>
              <div>
                <strong>{formatNumber(insight.count)}</strong>
                <span>{insight.count === 1 ? "item" : "itens"}</span>
              </div>
            </div>

            <div className="insight-actions">
              {insight.filter && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => onView(insight.filter!, insight.title)}
                >
                  Ver arquivos
                  <Icon name="arrowRight" size={14} />
                </button>
              )}
              {insight.action === "trash" && insight.targets.length > 0 && (
                <button
                  type="button"
                  className="btn btn-danger-ghost btn-sm"
                  onClick={() => onClean(insight)}
                >
                  <Icon name="trash" size={14} />
                  Limpar
                </button>
              )}
            </div>
          </article>
        ))}
      </div>

      <div className="insight-note">
        <Icon name="shield" size={16} />
        <p>
          As sugestões são geradas por regras que rodam no seu computador. Nada é
          apagado sem a sua confirmação — os itens vão para a Lixeira do Windows e
          podem ser restaurados.
        </p>
      </div>
    </div>
  );
}
