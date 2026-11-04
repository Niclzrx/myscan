# myscan

**Entenda cada byte. Organize em um clique.**

O myscan é um aplicativo desktop que analisa os arquivos do seu computador e
transforma pastas bagunçadas em **informação visual**: mapas de espaço, gráficos
por tipo e idade, grupos de duplicados e sugestões de limpeza.

Tudo roda **100% local**. Nenhum nome de arquivo, caminho ou conteúdo sai do seu
computador.

---

## O que já funciona (MVP)

- **Varredura paralela** de qualquer pasta ou disco, com progresso em tempo real
  e cancelamento.
- **Interface organizada** em quatro áreas:
  - **Visão geral** — cards de espaço, donut por tipo, idade dos arquivos,
    maiores arquivos, pastas que mais ocupam e marcadores de limpeza.
  - **Insights** — cartões com o que merece atenção (cache, duplicados,
    temporários, instaladores, arquivos parados, vazios, arquivos gigantes e
    pastas que concentram espaço).
  - **Mapa** — treemap "squarified" em tela cheia: cada bloco é uma pasta (ou os
    arquivos soltos dela), a área é proporcional ao espaço e a cor identifica o
    ramo. Dá para mergulhar clicando nos blocos, voltar com Esc/breadcrumb,
    ver nome + tamanho em cada bloco e abrir os arquivos de uma pasta.
  - **Arquivos** — exploração paginada com busca, filtros, ordenação e painel de
    detalhes de cada arquivo.
- **Sugestões acionáveis**: cada insight permite ver os arquivos envolvidos e,
  quando seguro, mover os itens para a **Lixeira do Windows** com confirmação.
- **Duplicados reais** detectados por tamanho + BLAKE3 (hash criptográfico),
  não apenas por nome.
- **Arrastar e soltar** uma pasta na janela para começar.
- **Atalhos** para pasta pessoal, Downloads, Documentos, Área de trabalho,
  Imagens, Vídeos, Música, temporários e discos locais.

## Como o myscan decide o que é "inútil"

As sugestões usam regras locais e transparentes:

| Marcador | Regra |
| --- | --- |
| **Cache** | Arquivos dentro de pastas como `node_modules`, `__pycache__`, `.cache`, `.next`, `target`, `Temp`, `GPUCache` etc. |
| **Artefatos de build** | Pastas de saída como `dist`, `build`, `out`, `coverage`, `obj`. |
| **Temporários** | Extensões `.tmp`, `.temp`, `.bak`, `.old`, `.part`, `.crdownload`, `Thumbs.db`, `.DS_Store`, nomes terminados em `~`. |
| **Duplicados** | Mesmo tamanho **e** mesmo hash BLAKE3; mantém uma cópia e marca as extras. |
| **Instaladores** | `.msi`, `.msix`, `.dmg`, `.pkg`, `.deb`, `.rpm` e `.exe`/compactados com nomes de instalação. |
| **Parados há 2+ anos** | Última modificação há mais de 730 dias. |
| **Grandes** | Arquivos com 100 MB ou mais. |
| **Vazios** | Arquivos com 0 byte. |

> O myscan **não apaga nada sozinho**. Toda remoção passa por uma confirmação e
> vai para a Lixeira do Windows, de onde pode ser restaurada.

## Privacidade

- Sem contas, sem telemetria, sem servidores.
- Sem requisições de rede em tempo de execução.
- O backend é Rust nativo, rodando junto do app — não há serviço web.
- Arquivos grandes no OneDrive não são "baixados" durante a detecção de
  duplicados (proteção contra hidratação de arquivos na nuvem).

## Stack

- **Tauri 2** — janela nativa e executável leve.
- **Rust** — varredura, metadados, hashing BLAKE3, agregações e insights.
- **React 18 + TypeScript + Vite** — interface.
- **SVG/CSS puro** — gráficos (donut, treemap, barras), sem bibliotecas pesadas.
- **SQLite?** Não. O MVP mantém o resultado em memória para ser rápido e simples.

## Rodando em desenvolvimento

Pré-requisitos no Windows:

1. [Node.js 20+](https://nodejs.org/)
2. [Rust (MSVC)](https://rustup.rs/)
3. [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/)
   com a carga de trabalho **Desenvolvimento para desktop com C++**
4. WebView2 (já vem no Windows 10/11 atualizado)

```bash
npm install
npm run app:dev
```

Apenas a interface (sem acesso ao disco):

```bash
npm run dev
```

## Gerando o .exe

```bash
npm run app:build
```

Saídas:

- Executável direto: `src-tauri/target/release/myscan.exe`
- Instalador: `src-tauri/target/release/bundle/nsis/myscan_0.1.0_x64-setup.exe`

## Estrutura

```
myscan/
├─ src/                     # interface React
│  ├─ components/           # telas, gráficos, tabela, modal, toast
│  ├─ lib/                  # API Tauri, formatação pt-BR
│  ├─ types.ts              # contrato compartilhado com o Rust
│  ├─ App.tsx               # estado global e navegação
│  └─ styles.css            # design system
└─ src-tauri/
   ├─ src/classify.rs       # categorias, tags e regras
   ├─ src/scanner.rs        # varredura paralela, hash, agregações
   ├─ src/tree.rs           # árvore de pastas para o mapa de espaço
   ├─ src/insights.rs       # geração das sugestões
   ├─ src/commands.rs       # comandos Tauri e estado
   └─ src/model.rs          # tipos serializados
```

## Testes

```bash
cargo test --manifest-path src-tauri/Cargo.toml
```

Os testes cobrem a varredura de uma árvore real (classificação de cache,
temporários, duplicados por hash e cancelamento).

## Roadmap

- [ ] Indexação incremental (não reescanear tudo a cada abertura).
- [ ] Visualização de conteúdo: miniaturas e prévia de documentos.
- [ ] Agrupamento inteligente de fotos/vídeos semelhantes.
- [ ] Regras personalizadas ("pastas que eu nunca uso").
- [ ] Comparação entre varreduras (o que cresceu desde a última).
- [ ] Exportar relatório em PDF/CSV.
- [ ] Versão portátil (`.exe` sem instalador).

## Limitações conhecidas

- A varredura lê **metadados**; o conteúdo só é lido para detectar duplicados
  (arquivos até 512 MB e fora de pastas de cache).
- Pastas de sistema (`$Recycle.Bin`, `System Volume Information`) são ignoradas.
- Arquivos sem permissão de leitura são contados como "sem acesso".
- O resultado fica em memória: ao fechar o app, é necessário escanear de novo.
