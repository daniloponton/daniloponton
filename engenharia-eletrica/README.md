# Engenharia Elétrica — Ferramenta de Apoio ao Projetista

Ferramenta profissional de dimensionamento elétrico que roda **100% no navegador**
(offline, sem servidor). O núcleo de cálculo é **determinístico e auditável**: cada
resultado carrega o memorial de cálculo completo (fórmulas, fatores, referências
normativas) e um hash SHA-256 das entradas + versão do motor + norma.

> **Aviso legal:** esta ferramenta **não assina projetos**. Gera memoriais de
> cálculo para validação pelo engenheiro responsável.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Núcleo de cálculo | TypeScript puro, sem dependência de UI (`src/core`) |
| UI | React + Vite, PWA instalável (offline via service worker) |
| Validação de entrada | Zod (equivalente ao Pydantic) |
| Testes | Vitest + fast-check (property-based) |
| Deploy | Site estático (GitHub Pages / Netlify) |

## Arquitetura

```
src/core/                 núcleo determinístico (independe da UI)
  engine/                 tipos, rastreabilidade (trace + hash), unidades
  norms/                  perfis normativos versionados (DADO, não código)
  modules/cableSizing/    schema (zod) + motor de cálculo
  modules/shortCircuit/   curto-circuito IEC 60909
  modules/protection/     curvas TCC IEC 60255 + seletividade
  project/                entidade Circuit/Project, orquestração e persistência
src/ui/                   React (formulários, memoriais, gráfico TCC, projeto)
test/                     casos de referência, validação e propriedades
```

### Projeto e persistência

A entidade **`Circuit`** (fonte → proteção → cabo → carga) guarda as entradas
dos três módulos; **`evaluateCircuit`** os encadeia no núcleo, propagando I"k e
tempo de atuação. Um projeto agrupa **vários circuitos** (alimentadores), com
seletor para alternar o circuito ativo, adicionar e remover. Projetos são
persistidos via `ProjectStore` — **IndexedDB** no navegador (offline) e **em
memória** nos testes, selecionados automaticamente. Projetos também podem ser
**exportados/importados em arquivo JSON** (backup, transporte entre máquinas e
compartilhamento), com validação na importação.

A regra de ouro: **a UI depende apenas de `src/core` (via `@core`)**, nunca de
arquivos internos. O motor pode ser executado em CI, validado por terceiros e,
no futuro, reaproveitado num backend, sem retrabalho.

## Módulos planejados

- [x] **CableSizing** — dimensionamento de cabos BT (ampacidade + queda de tensão + curto-circuito)
- [x] **Short-Circuit IEC 60909** — I"k trifásica, fator κ, pico ip, S"k
- [x] **Protection & Coordination** — curvas TCC IEC 60255, verificação de seletividade, gráfico log-log
- [x] **Arc Flash** — corrente de arco, energia incidente, fronteira de arco e EPI (IEEE Std 1584-2018 / NFPA 70E)
- [x] **VoltageDrop & PowerFactor** — queda em alimentador, banco de capacitores, banco dessintonizado, partida de motores, harmônicas (IEEE 519)
- [x] **Grounding & SPDA** — resistência/GPR/tensões toleráveis e malha detalhada Em/Es (IEEE 80), parâmetros de SPDA (IEC 62305 / NBR 5419)
- [x] **PV & Geração Distribuída** — dimensionamento de string, faixa de MPPT, queda CC (NBR 16690 / IEC 62548)
- [x] **LoadSchedule** — quadro de cargas, fatores de demanda, equilíbrio de fases R/S/T, corrente de neutro e de demanda (NBR 5410 §4.2.1 / §6.3)
- [x] **Documentation & Compliance** — memorial imprimível (PDF via navegador) com matriz de conformidade

## Normas (escopo inicial)

- **ABNT NBR 5410:2004 / IEC 60364-5-52** — capacidade de condução (Tab. 36 PVC e
  Tab. 37 EPR/XLPE, cobre e alumínio, conferidas), fatores de correção (Tab. 40 e
  42), queda de tensão.
- **IEC 60364-5-54 / IEC 60909** — fator `k` para verificação térmica de curto.

As tabelas normativas são tratadas como dado versionado em `src/core/norms`.

## PWA (instalável e offline)

O app é uma PWA: inclui `manifest.webmanifest`, ícone e um service worker
(`public/sw.js`) que torna o uso **offline** e permite **instalar** o app
(navegador → "Instalar"). Estratégia de cache: *network-first* para a navegação
(pega novos assets quando online) e *cache-first* para os assets com hash
imutável. O service worker é registrado apenas em build de produção.

## Deploy (GitHub Pages)

O workflow `.github/workflows/deploy-pages.yml` builda o app e publica o `dist/`
no GitHub Pages a cada push em `main` (e na branch de desenvolvimento). O Vite
usa `base: "./"`, então os caminhos são relativos e funcionam tanto na raiz do
site quanto em subpasta.

**Passo manual obrigatório (uma única vez):** habilite o Pages em
**Settings → Pages → Build and deployment → Source: GitHub Actions**. O token do
Actions não consegue criar o site do Pages sozinho na primeira ativação. Depois
disso, cada push em `main` (ou na branch de desenvolvimento) publica
automaticamente. O endereço publicado aparece no resumo da execução do workflow
(job *deploy*).

## Comandos

```bash
npm install
npm run dev        # servidor de desenvolvimento
npm test           # testes (regressão + propriedades)
npm run typecheck  # checagem de tipos
npm run build      # build estático em dist/
```

## Editor visual (unifilar)

A aba **Editor (Unifilar)** mostra o circuito como diagrama unifilar interativo:
clique em um elemento (concessionária, transformador, barramento, proteção,
condutor, carga) para editar seus parâmetros ali mesmo, com o diagrama colorido
por conformidade. O botão **Avaliar circuito completo** roda a orquestração do
núcleo (curto → proteção → cabo) e atualiza os resultados no diagrama.

## Integração entre módulos

Os três módulos se encadeiam (fluxo **1 → 2 → 3**), fechando o ciclo de cálculo:

1. **Curto-Circuito** calcula a I"k no ponto.
2. **Proteção** usa a I"k como limite da faixa de coordenação e devolve o tempo
   de atuação na falta.
3. **Dimensionamento de Cabos** consome a I"k e o tempo de atuação para a
   verificação térmica de curto-circuito (antes digitados à mão).

Na UI, as caixas "Usar valores calculados" puxam automaticamente esses valores.

## Memorial de cálculo

A aba **Memorial** gera um documento **consolidado do projeto**: avalia todos os
circuitos e emite uma seção por alimentador (com seu unifilar e os cálculos de
curto, proteção e cabo), seguida das **análises do projeto** (arco elétrico, FP,
partida de motor, aterramento, SPDA e fotovoltaico). Inclui dados do responsável
técnico, uma **matriz de conformidade** (item × norma × status) como resumo
executivo, semáforo de conformidade geral, memória de cálculo passo a passo e
hash de auditoria por seção.
A geração de PDF é feita pelo próprio navegador (Imprimir → Salvar como PDF),
via `@media print` — sem dependências e mantendo o funcionamento offline.

O memorial inclui um **diagrama unifilar** em SVG (fonte → transformador →
barramento → proteção → condutor → carga), montado a partir do circuito e
anotado com os valores calculados (I"k, ajuste da proteção, seção do cabo, ΔU).

## Validação

A pasta [`docs/VALIDACAO.md`](docs/VALIDACAO.md) traz a matriz de validação
(o que é validado, fonte normativa e tolerância) e as limitações conhecidas.
A suíte `test/reference.test.ts` reúne casos de referência com fonte citada e
cálculo manual documentado (erro relativo ≤ tolerância), executados no CI
(GitHub Actions) a cada push junto com typecheck e build.

## Status

Versão `0.1.0` — três módulos com rastreabilidade e integração. As tabelas
normativas devem ser cruzadas contra a edição vigente da norma antes de uso em
projeto real (ver casos em `test/`). Curvas TCC implementadas para relés
IEC 60255 (paramétricas); curvas de disjuntores/fusíveis por banda de fabricante
ficam para a fase de importação de catálogo.
