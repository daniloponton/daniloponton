# Validação e Proveniência dos Cálculos

Este documento registra o que está validado no motor de cálculo, com que fonte,
e o que ainda exige conferência. A suíte de referência fica em
`test/reference.test.ts` e roda no CI a cada commit (erro relativo ≤ tolerância).

## Matriz de validação

| Domínio | O que é validado | Fonte / método | Tolerância | Status |
|---------|------------------|----------------|------------|--------|
| Curto-circuito | I"k trifásica (impedâncias equivalentes, fator c, KT) | IEC 60909-0 + cálculo manual documentado | 1,5 % | ✅ |
| Fator de potência | Qc = P·(tanφ1 − tanφ2) | Trigonometria (universal) | 0,5–1 % | ✅ |
| Aterramento | Resistividade de Wenner (ρ = 2πaR) | NBR 7117 / IEEE 81 | 0,2 % | ✅ |
| Aterramento | Resistência de haste (Dwight) | IEEE 80 / Dwight | 1 % | ✅ |
| Aterramento | Tensão de toque/passo tolerável (Cs) | IEEE 80 §8 | 1 % | ✅ |
| Aterramento (malha) | Tensões de malha Em e de passo Es (Km, Ks, Ki, n) | IEEE 80 §16 | 1,5 % | ✅ |
| SPDA | Raio da esfera rolante r = 10·I^0,65 | IEC 62305 (modelo eletrogeométrico) | 1 % | ✅ |
| Proteção | Curva inversa SI (t = TMS·k/((I/Is)^α−1)) | IEC 60255-151 | 0,5 % | ✅ |
| Queda de tensão | Método fasorial ΔU = k·I·L·(R·cosφ+X·senφ) | IEC 60364-5-52 Anexo | 2 % | ✅ |
| Fotovoltaico | Correção térmica de Voc e nº de módulos/string | NBR 16690 / IEC 62548 | 0,5 % | ✅ |

## Limitações conhecidas (a conferir antes de uso em projeto real)

1. **Tabelas de capacidade de condução (ampacidade)** — `src/core/norms/iec60364.ts`.
   São dados tabelados (não fórmulas). Refletem os valores publicados mais comuns
   da IEC 60364-5-52 (Cu, 2 e 3 condutores carregados, PVC/XLPE, métodos B1/B2/C,
   30 °C). **Devem ser cruzados contra a edição vigente da NBR 5410 / IEC 60364-5-52**
   antes do uso profissional. Hoje há apenas cobre; alumínio ainda não é suportado.

2. **Fatores de correção** (temperatura e agrupamento) — também tabelados; mesma
   ressalva da conferência contra a norma vigente.

3. **Aterramento** — há dois níveis: a **triagem** (`analyzeGrounding`,
   GPR ≤ tensão de toque) e o **cálculo detalhado de malha retangular**
   (`analyzeGroundGrid`), com tensões de malha (Em) e de passo (Es) e os fatores
   Km, Ks, Ki, n da IEEE 80. Malhas em L/irregulares (fatores nc, nd) e o cálculo
   da corrente de malha (fator de divisão/decremento) ainda não são tratados.

4. **Proteção** — curvas TCC apenas para relés paramétricos IEC 60255. Curvas de
   disjuntores/fusíveis por banda de fabricante exigem importação de catálogo.

5. **Reatâncias dos condutores** — valores típicos; para casos críticos, usar os
   dados do fabricante/arranjo real.

## Como adicionar um novo caso de referência

1. Encontre um exemplo com fonte confiável (anexo de norma, manual de fabricante,
   exemplo IEEE 399, ou cálculo manual reproduzível).
2. Adicione um `it(...)` em `test/reference.test.ts` com o cálculo manual no
   comentário, a citação da fonte e `expectClose(actual, esperado, tolerância)`.
3. O CI passa a falhar se o motor divergir além da tolerância.
