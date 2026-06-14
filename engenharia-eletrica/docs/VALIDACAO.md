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
| Aterramento (corrente) | Corrente de malha IG (fator de decremento Df, divisão Sf) | IEEE 80 §15-16 | 1 % | ✅ |
| SPDA | Raio da esfera rolante r = 10·I^0,65 | IEC 62305 (modelo eletrogeométrico) | 1 % | ✅ |
| Proteção | Curva inversa SI (t = TMS·k/((I/Is)^α−1)) | IEC 60255-151 | 0,5 % | ✅ |
| Arco elétrico | Energia incidente, Ia, fronteira de arco | IEEE 1584-2002 | 5 % | ✅ |
| Queda de tensão | Método fasorial ΔU = k·I·L·(R·cosφ+X·senφ) | IEC 60364-5-52 Anexo | 2 % | ✅ |
| Fotovoltaico | Correção térmica de Voc e nº de módulos/string | NBR 16690 / IEC 62548 | 0,5 % | ✅ |
| Ampacidade (tabela) | Capacidade de condução PVC/cobre (B1, B2, C) | NBR 5410:2004 Tab. 36 | exato | ✅ |
| Correção (tabela) | Fatores de temperatura e agrupamento | NBR 5410:2004 Tab. 40 e 42 | exato | ✅ |

## Limitações conhecidas (a conferir antes de uso em projeto real)

1. **Tabelas de capacidade de condução (ampacidade)** — `src/core/norms/iec60364.ts`.
   A ampacidade **PVC/cobre** (métodos B1, B2, C, 2 e 3 condutores carregados) foi
   **conferida e travada contra a ABNT NBR 5410:2004 Tabela 36** (correção de um
   erro anterior em B2 nas seções 150/185/240 mm²). **Pendentes:** ampacidade
   **EPR/XLPE** (Tabela 37, ainda com valores publicados comuns), **alumínio**, e
   os métodos **A1/A2/D** (D exige correção de solo).

2. **Fatores de correção** (temperatura — Tab. 40; agrupamento — Tab. 42,
   disposição 1) — conferidos contra a NBR 5410:2004.

3. **Aterramento** — há dois níveis: a **triagem** (`analyzeGrounding`,
   GPR ≤ tensão de toque) e o **cálculo detalhado de malha retangular**
   (`analyzeGroundGrid`), com tensões de malha (Em) e de passo (Es) e os fatores
   Km, Ks, Ki, n da IEEE 80, e a corrente de malha de projeto (`gridCurrentIEEE80`,
   fator de decremento Df e fator de divisão Sf). Pendências: malhas em
   L/irregulares (fatores nc, nd) e o cálculo do próprio Sf a partir da topologia
   do sistema (hoje Sf é entrada, com 1,0 como padrão conservador).

4. **Proteção** — curvas TCC apenas para relés paramétricos IEC 60255. Curvas de
   disjuntores/fusíveis por banda de fabricante exigem importação de catálogo.

6. **Arco elétrico** — implementado pelo modelo empírico **IEEE 1584-2002**
   (faixa 0,208–15 kV). A edição vigente **IEEE 1584-2018** (novos coeficientes
   por configuração de eletrodos) fica como evolução futura. Não é feita a
   iteração de 85% da corrente de arco para BT (corrente reduzida → tempo maior).

5. **Reatâncias dos condutores** — valores típicos; para casos críticos, usar os
   dados do fabricante/arranjo real.

## Como adicionar um novo caso de referência

1. Encontre um exemplo com fonte confiável (anexo de norma, manual de fabricante,
   exemplo IEEE 399, ou cálculo manual reproduzível).
2. Adicione um `it(...)` em `test/reference.test.ts` com o cálculo manual no
   comentário, a citação da fonte e `expectClose(actual, esperado, tolerância)`.
3. O CI passa a falhar se o motor divergir além da tolerância.
