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
| UI | React + Vite (PWA, offline) |
| Validação de entrada | Zod (equivalente ao Pydantic) |
| Testes | Vitest + fast-check (property-based) |
| Deploy | Site estático (GitHub Pages / Netlify) |

## Arquitetura

```
src/core/                 núcleo determinístico (independe da UI)
  engine/                 tipos, rastreabilidade (trace + hash), unidades
  norms/                  perfis normativos versionados (DADO, não código)
  modules/cableSizing/    schema (zod) + motor de cálculo
src/ui/                   React (forma + memorial de cálculo)
test/                     casos de referência, validação e propriedades
```

A regra de ouro: **a UI depende apenas de `src/core` (via `@core`)**, nunca de
arquivos internos. O motor pode ser executado em CI, validado por terceiros e,
no futuro, reaproveitado num backend, sem retrabalho.

## Módulos planejados

- [x] **CableSizing** — dimensionamento de cabos BT (ampacidade + queda de tensão + curto-circuito)
- [ ] Protection & Coordination (curvas TCC, seletividade, IEC 60909)
- [ ] VoltageDrop & PowerFactor (harmônicas, partida de motores)
- [ ] Grounding & SPDA (IEEE 80, IEC 62305 / NBR 5419)
- [ ] Motors & Drives
- [ ] PV & Geração Distribuída (NBR 16690)
- [ ] Documentation & Compliance (memorial em PDF, matriz de conformidade)

## Normas (escopo inicial)

- **IEC 60364-5-52:2009 / ABNT NBR 5410:2004** — capacidade de condução, fatores
  de correção, queda de tensão.
- **IEC 60364-5-54 / IEC 60909** — fator `k` para verificação térmica de curto.

As tabelas normativas são tratadas como dado versionado em `src/core/norms`.

## Comandos

```bash
npm install
npm run dev        # servidor de desenvolvimento
npm test           # testes (regressão + propriedades)
npm run typecheck  # checagem de tipos
npm run build      # build estático em dist/
```

## Status

Versão `0.1.0` — primeiro corte vertical: `CableSizing` completo com
rastreabilidade. As tabelas normativas devem ser cruzadas contra a edição
vigente da norma antes de uso em projeto real (ver casos em `test/`).
