import type { QuickLocation } from "../types";
import { shortPath } from "../lib/format";
import { Icon } from "./icons";

interface LandingProps {
  locations: QuickLocation[];
  error: string | null;
  onPickFolder: () => void;
  onScan: (path: string) => void;
}

const kindIcon = (kind: string) => {
  if (kind === "drive") return "drive" as const;
  if (kind === "temp") return "clock" as const;
  return "folder" as const;
};

export function Landing({ locations, error, onPickFolder, onScan }: LandingProps) {
  return (
    <div className="landing">
      <div className="landing-glow" aria-hidden="true" />

      <header className="landing-brand">
        <span className="logo-mark">
          <Icon name="scan" size={22} />
        </span>
        <span className="logo-word">
          my<span>scan</span>
        </span>
        <span className="privacy-pill">
          <Icon name="shield" size={13} /> 100% local
        </span>
      </header>

      <section className="hero">
        <p className="eyebrow">Inteligência local de arquivos</p>
        <h1>
          Entenda cada byte.
          <br />
          <span>Organize em um clique.</span>
        </h1>
        <p className="hero-text">
          O myscan lê os arquivos do seu computador e transforma pastas bagunçadas
          em mapas visuais, gráficos e sugestões de limpeza — sem enviar nada para
          a internet.
        </p>

        <div className="hero-actions">
          <button type="button" className="btn btn-primary btn-lg" onClick={onPickFolder}>
            <Icon name="scan" size={18} />
            Escolher uma pasta
          </button>
          {locations[0] && (
            <button
              type="button"
              className="btn btn-ghost btn-lg"
              onClick={() => onScan(locations[0].path)}
            >
              Escanear minha pasta pessoal
              <Icon name="arrowRight" size={17} />
            </button>
          )}
        </div>

        {error && (
          <div className="alert alert-danger" role="alert">
            <Icon name="alert" size={17} />
            <span>{error}</span>
          </div>
        )}

        <div className="quick-section">
          <div className="section-heading">
            <h2>Ou comece por aqui</h2>
            <span className="muted small">você também pode arrastar uma pasta para a janela</span>
          </div>
          <div className="quick-grid">
            {locations.map((location) => (
              <button
                key={location.path}
                type="button"
                className="quick-card"
                onClick={() => onScan(location.path)}
                title={location.path}
              >
                <span className={`quick-icon kind-${location.kind}`}>
                  <Icon name={kindIcon(location.kind)} size={19} />
                </span>
                <span className="quick-info">
                  <span className="quick-label">{location.label}</span>
                  <span className="quick-path">{shortPath(location.path, 38)}</span>
                </span>
                <Icon name="chevron-right" size={16} className="quick-arrow" />
              </button>
            ))}
          </div>
        </div>

        <div className="how">
          <div className="how-step">
            <span className="how-number">01</span>
            <h3>Escaneie</h3>
            <p>Metadados e tamanhos são lidos direto do disco, em paralelo.</p>
          </div>
          <div className="how-step">
            <span className="how-number">02</span>
            <h3>Visualize</h3>
            <p>Tipos, idades, duplicados e pastas viram informação visual.</p>
          </div>
          <div className="how-step">
            <span className="how-number">03</span>
            <h3>Decida</h3>
            <p>O myscan sugere o que é cache, duplicado ou dispensável.</p>
          </div>
        </div>
      </section>

      <footer className="landing-footer">
        <span>
          <Icon name="shield" size={13} /> Nenhum dado sai do seu computador
        </span>
        <span className="muted">v0.1.0</span>
      </footer>
    </div>
  );
}
