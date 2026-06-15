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
| Arco elétrico | Corrente de arco I″arc (Eq. 1/25, interpolação Voc) | IEEE 1584-2018 Anexo D | 1 % | ✅ |
| Arco elétrico | Energia incidente, fronteira de arco, CF, VarCf | IEEE 1584-2018 §4 | 5 % | ✅ |
| Harmônicas | Limites de TDD/individual (Isc/IL) e THD de tensão | IEEE 519-2014 Tab. 1 e 2 | exato | ✅ |
| Filtro dessintonizado | Ordem de sintonia, sobretensão do capacitor, reator | IEC 61642 / IEEE 1531 | 1 % | ✅ |
| Queda de tensão | Método fasorial ΔU = k·I·L·(R·cosφ+X·senφ) | IEC 60364-5-52 Anexo | 2 % | ✅ |
| Fotovoltaico | Correção térmica de Voc e nº de módulos/string | NBR 16690 / IEC 62548 | 0,5 % | ✅ |
| Ampacidade (tabela) | Capacidade de condução PVC/cobre (B1, B2, C) | NBR 5410:2004 Tab. 36 | exato | ✅ |
| Ampacidade (tabela) | Capacidade de condução EPR/XLPE/cobre (B1, B2, C) | NBR 5410:2004 Tab. 37 | exato | ✅ |
| Ampacidade (tabela) | Capacidade de condução alumínio (PVC e EPR/XLPE) | NBR 5410:2004 Tab. 36 e 37 | exato | ✅ |
| Correção (tabela) | Fatores de temperatura e agrupamento | NBR 5410:2004 Tab. 40 e 42 | exato | ✅ |
| Seção mínima (tabela) | Seção mínima por tipo de circuito | NBR 5410:2004 Tab. 47 | exato | ✅ |
| Quadro de cargas | Demanda Σ(P·q·Fd), corrente I=S/(√3·V), equilíbrio de fases | NBR 5410:2004 §4.2.1 / §6.3 | 1 % | ✅ |

## Limitações conhecidas (a conferir antes de uso em projeto real)

1. **Tabelas de capacidade de condução (ampacidade)** — `src/core/norms/iec60364.ts`.
   A ampacidade de **cobre e alumínio**, para **PVC** (Tabela 36) e **EPR/XLPE**
   (Tabela 37), métodos **A1, A2, B1, B2, C e D**, 2 e 3 condutores carregados,
   e **E, F** (ar livre, Tab. 38/39; F-3 = trifólio),
   foi **conferida e travada contra a ABNT NBR 5410:2004**. O método **D**
   (enterrado) usa as correções de solo: temperatura do solo (Tab. 40, base
   20 °C), resistividade térmica (Tab. 41, base 2,5 K·m/W) e agrupamento de
   cabos diretamente enterrados justapostos (Tab. 44, distância nula —
   conservador; distâncias maiores e duto enterrado ficam como refinamento).
   Para os métodos E/F (bandejas/ar livre) usa-se o agrupamento de feixe
   (Tab. 42, disposição 1) — conservador; bandejas (Tab. 42 disp. 4/5 e Tab. 43)
   ficam como refinamento. O método **G** (espaçados) não está implementado.

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

6. **Arco elétrico** — implementado pelo modelo **IEEE Std 1584-2018**
   (faixa 0,208–15 kV) com os coeficientes das Tabelas 1-5 e 7, as cinco
   configurações de eletrodos (VCB, VCBB, HCB, VOA, HOA), a interpolação entre
   os níveis de tensão (600/2700/14300 V, Eq. 16-24), a variação da corrente de
   arco (VarCf, Eq. 2) e o fator de correção de invólucro (CF, Eq. 11-15). As
   correntes de arco I″arc reproduzem os exemplos do Anexo D (MT 4,16 kV → 12,98 kA;
   BT 480 V → 28,8 kA). Aproximações conhecidas: (a) o fator de invólucro usa o
   tamanho equivalente ×0,03937 limitado a 49 pol; para invólucros MT muito
   grandes (>660,4 mm) a Eq. 11/12 reduz levemente o equivalente, com efeito de
   ~1 % na CF; (b) o tempo de arco é **entrada** — no exemplo BT do Anexo D a
   energia usa um tempo derivado da curva TCC de um fusível, que este cálculo
   isolado recebe pronto. A energia final adota o maior valor entre a corrente
   média e a corrente reduzida (§4.9/§4.10).

5. **Resistência do alumínio (queda de tensão)** — a NBR 5410 não tabula a
   resistência nessas tabelas; a do alumínio é **estimada** a partir da do cobre
   pela razão ρAl/ρCu ≈ 1,65 (coerente com a IEC 60228), com **advertência** no
   resultado. A ampacidade do alumínio é exata (norma); a queda de tensão do
   alumínio é aproximada até dispor de uma tabela oficial de resistência.
   Reatâncias dos condutores: valores típicos.

7. **Quadro de cargas (demanda/equilíbrio)** — `src/core/modules/loadSchedule`.
   Usa o **balanço de potências por fase** (prática consagrada de quadro de
   cargas): potência ativa/reativa acumulada por fase, corrente de linha
   I = S_fase/V_LN, e corrente de demanda do alimentador S/(√3·V_LL). Os
   **fatores de demanda** (NBR 5410 §4.2.1) são **entradas explícitas** (1,0 por
   padrão) — as tabelas de demanda por tipo de carga (residências, motores) não
   são embutidas para não fixar valores normativos sem a fonte. Cargas
   fase-fase têm a potência dividida igualmente entre as duas fases (convenção).
   A corrente de neutro usa a aproximação IN = √(ΣI² − ΣI_iI_j), válida para
   cargas a 120° com mesmo fator de potência; correntes harmônicas (3ª no
   neutro) não são consideradas. O alvo de desequilíbrio (15 % padrão) é **boa
   prática**, configurável — não um limite normativo.

## Como adicionar um novo caso de referência

1. Encontre um exemplo com fonte confiável (anexo de norma, manual de fabricante,
   exemplo IEEE 399, ou cálculo manual reproduzível).
2. Adicione um `it(...)` em `test/reference.test.ts` com o cálculo manual no
   comentário, a citação da fonte e `expectClose(actual, esperado, tolerância)`.
3. O CI passa a falhar se o motor divergir além da tolerância.
