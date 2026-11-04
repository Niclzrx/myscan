import { useEffect, useState } from "react";
import type { ScanProgress } from "../types";
import { formatBytes, formatNumber, shortPath } from "../lib/format";
import { Icon } from "./icons";

interface ScanningViewProps {
  progress: ScanProgress | null;
  path: string;
  onCancel: () => void;
}

const PHASES: Record<string, string> = {
  walking: "Mapeando arquivos",
  reading: "Lendo metadados",
  hashing: "Comparando arquivos idênticos",
};

export function ScanningView({ progress, path, onCancel }: ScanningViewProps) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const phase = progress?.phase ?? "walking";
  const files = progress?.files ?? 0;
  const bytes = progress?.bytes ?? 0;

  return (
    <div className="scan-screen">
      <div className="radar" aria-hidden="true">
        <span className="radar-ring ring-1" />
        <span className="radar-ring ring-2" />
        <span className="radar-ring ring-3" />
        <span className="radar-sweep" />
        <span className="radar-core">
          <Icon name="scan" size={26} />
        </span>
      </div>

      <p className="eyebrow">Varredura em andamento</p>
      <h1 className="scan-title">{PHASES[phase] ?? "Analisando"}</h1>
      <p className="scan-path" title={progress?.current || path}>
        {shortPath(progress?.current || path, 72)}
      </p>

      <div className="scan-meter" aria-hidden="true">
        <span className="scan-meter-bar" />
      </div>

      <div className="scan-stats">
        <div>
          <strong>{formatNumber(files)}</strong>
          <span>arquivos</span>
        </div>
        <div>
          <strong>{formatBytes(bytes)}</strong>
          <span>lidos</span>
        </div>
        <div>
          <strong>{elapsed}s</strong>
          <span>decorridos</span>
        </div>
      </div>

      <button type="button" className="btn btn-ghost" onClick={onCancel}>
        Cancelar varredura
      </button>

      <p className="scan-hint">
        Tudo acontece no seu computador. Você pode continuar usando o Windows normalmente.
      </p>
    </div>
  );
}
