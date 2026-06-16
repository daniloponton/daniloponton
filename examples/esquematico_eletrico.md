# Esquemático Elétrico — Sistema Unwinding com Controle de Torque

**Projeto:** CINBORG / Sistema de Desenrolamento de Linha
**Revisão:** 1.0
**Data:** 2026-06-16
**Norma de referência:** NBR 5410, NBR IEC 60204-1

---

## 1. Arquitetura geral

```
   REDE 380V/3F/60Hz
        │
        ▼
   [Q0]──[KM0]──┬──────────► [QF1] ──► [DRIVE SERVO] ──► [SERVO + FREIO]
                │
                └──────────► [QF2] ──► [FONTE 24VDC] ──► Barra 24VDC
                                                              │
                                                              ├──► [PLC]
                                                              ├──► [HMI]
                                                              ├──► [Sinaleiros]
                                                              └──► [Bobinas KM]

   INVERSOR DO TAMBOR ────────────────► [AI PLC] (0-10V velocidade)
                                                 (já existe na máquina)
```

---

## 2. Lista de componentes

### 2.1 Quadro de força e proteção

| TAG | Descrição | Modelo sugerido | Quantidade |
|---|---|---|---|
| Q0 | Seccionador geral 3P 25A | WEG SD3-25 | 1 |
| KM0 | Contator geral 3P 9A | WEG CWB9 + bobina 24Vcc | 1 |
| QF1 | Disjuntor motor servo 3P (curva D) 6A | WEG MPW18-3-D006 | 1 |
| QF2 | Disjuntor circuito comando 1P 6A | WEG MDW-C6-1 | 1 |
| QF3 | Disjuntor freio EM 1P 2A | WEG MDW-C2-1 | 1 |
| F1 | Filtro de linha EMC trifásico | Schaffner FN3258-7 | 1 |
| RR | Resistor de frenagem 80Ω / 200W | Resistor cerâmico ventilado | 1 |
| PE | Barra de aterramento 4×40mm cobre | — | 1 |

### 2.2 Drive servo e motor

| TAG | Descrição | Modelo sugerido | Observações |
|---|---|---|---|
| U1 | Drive servo 4Q + chopper regen | WEG SCA06 0,5kW / Yaskawa SGD7S-2R8A | Modo torque, AI ±10V |
| M1 | Servomotor 200W com freio EM | WEG SWA / Yaskawa SGM7J-02AFD | Freio 24Vcc, encoder absoluto |
| Y1 | Freio eletromagnético | Integrado ao servo | 24Vcc, falha segura (energiza para liberar) |

### 2.3 Comando e CLP

| TAG | Descrição | Modelo sugerido | Observações |
|---|---|---|---|
| G1 | Fonte 24Vcc 5A | Phoenix Contact QUINT4-PS / WEG PSB1 | Saída regulada, proteção SCO |
| A1 | PLC com FPU e AI/AO analógicos | Schneider M241 / WEG TPW-04 / S7-1200 | Mínimo 2 AI, 2 AO, 8 DI, 6 DO |
| A1.1 | Cartão expansão AI 0-10V | TM3AI4 ou equivalente | Se necessário |
| HMI | Painel HMI 7" Ethernet | WEG PWS / Pro-face GP4000 | Opcional para parâmetros |
| K1 | Relé interface freio EM | Finder 40.52 24Vcc + soquete | Contato NA para Y1 |
| K2 | Relé interface habilita drive | Finder 40.52 24Vcc + soquete | Contato NA para U1.SON |

### 2.4 Botoeiras, sinaleiros e segurança

| TAG | Descrição | Modelo sugerido |
|---|---|---|
| S0 | Botão E-stop cogumelo trava 1NF+1NA | Schneider XB5-AS8442 |
| S1 | Botão partida verde 1NA | Schneider XB5-AA31 |
| S2 | Botão parada vermelha 1NF | Schneider XB5-AA42 |
| S3 | Botão reset amarelo 1NA | Schneider XB5-AA51 |
| H1 | Sinaleiro verde "ciclo ativo" 24Vcc | Schneider XB5-AVB3 |
| H2 | Sinaleiro vermelho "falha" 24Vcc | Schneider XB5-AVB4 |
| H3 | Sinaleiro amarelo "pronto" 24Vcc | Schneider XB5-AVB5 |
| KSR | Relé de segurança categoria 3 | Pilz PNOZ s4 / Schneider XPSAC |

---

## 3. Lista de fios (wire list)

### 3.1 Circuito de força

| Fio | Origem | Destino | Bitola | Cor | Observação |
|---|---|---|---|---|---|
| L1 | Q0:1 | KM0:1L1 | 2,5 mm² | Preto | |
| L2 | Q0:3 | KM0:3L2 | 2,5 mm² | Preto | |
| L3 | Q0:5 | KM0:5L3 | 2,5 mm² | Preto | |
| 1L1 | KM0:2T1 | QF1:1 | 2,5 mm² | Preto | |
| 1L2 | KM0:4T2 | QF1:3 | 2,5 mm² | Preto | |
| 1L3 | KM0:6T3 | QF1:5 | 2,5 mm² | Preto | |
| 2L1 | QF1:2 | F1:L1 | 2,5 mm² | Preto | |
| 2L2 | QF1:4 | F1:L2 | 2,5 mm² | Preto | |
| 2L3 | QF1:6 | F1:L3 | 2,5 mm² | Preto | |
| 3L1 | F1:L1' | U1:R | 2,5 mm² | Preto | Cabo blindado a partir daqui |
| 3L2 | F1:L2' | U1:S | 2,5 mm² | Preto | |
| 3L3 | F1:L3' | U1:T | 2,5 mm² | Preto | |
| U | U1:U | M1:U | 1,5 mm² | Preto | Cabo do servo blindado, 4×1,5 + PE |
| V | U1:V | M1:V | 1,5 mm² | Preto | |
| W | U1:W | M1:W | 1,5 mm² | Preto | |
| PE | F1:PE | Barra PE | 4 mm² | Verde/amarelo | Aterramento estrela |
| BR+ | U1:B+ | RR:+ | 2,5 mm² | Vermelho | Resistor frenagem |
| BR− | U1:B− | RR:− | 2,5 mm² | Preto | |

### 3.2 Alimentação 24Vcc

| Fio | Origem | Destino | Bitola | Cor |
|---|---|---|---|---|
| 1N | QF2:1 | G1:L | 1,5 mm² | Azul |
| 1L | QF2:2 | G1:N | 1,5 mm² | Marrom |
| +24V | G1:+24V | Barra +24V | 1,5 mm² | Vermelho |
| 0V | G1:0V | Barra 0V | 1,5 mm² | Azul claro |

### 3.3 Sinais ao drive (controle)

| Fio | Origem | Destino | Bitola | Função |
|---|---|---|---|---|
| AO+ | A1:AO1+ | U1:T-REF+ | 0,5 mm² par trançado blindado | Referência torque 0-10V |
| AO− | A1:AO1− | U1:T-REF− | 0,5 mm² | |
| AI_S+ | U1:V-OUT+ | A1:AI1+ | 0,5 mm² par trançado blindado | Velocidade real do servo |
| AI_S− | U1:V-OUT− | A1:AI1− | 0,5 mm² | |
| AI_D+ | INVERSOR:AO+ | A1:AI2+ | 0,5 mm² par trançado blindado | Velocidade do tambor 0-10V |
| AI_D− | INVERSOR:AO− | A1:AI2− | 0,5 mm² | |
| SON | K2:14 | U1:SON | 0,75 mm² | Servo ON (NA) |
| RDY | U1:RDY | A1:DI3 | 0,75 mm² | Drive pronto |
| FLT | U1:ALM | A1:DI4 | 0,75 mm² | Falha do drive |
| BR | K1:14 | M1:Y1+ | 0,75 mm² | Libera freio 24Vcc |

### 3.4 Botoeiras e sinaleiros (24Vcc)

| Fio | Origem | Destino | Função |
|---|---|---|---|
| 100 | +24V | S0:11 | E-stop |
| 101 | S0:12 | KSR:S11 | Estop normalmente fechado para relé seg. |
| 102 | KSR:13 | K2:A1 | Habilita drive via relé segurança |
| 103 | +24V | S1:13 | Partida |
| 104 | S1:14 | A1:DI1 | Sinal partida |
| 105 | +24V | S2:11 | Parada |
| 106 | S2:12 | A1:DI2 | Sinal parada (NF) |
| 107 | +24V | S3:13 | Reset |
| 108 | S3:14 | A1:DI5 | Sinal reset |
| 200 | A1:DO1 | H1 | Lâmpada ciclo |
| 201 | A1:DO2 | H2 | Lâmpada falha |
| 202 | A1:DO3 | H3 | Lâmpada pronto |
| 203 | A1:DO4 | K1:A1 | Libera freio |
| 204 | A1:DO5 | K2:A1 | Habilita drive |

---

## 4. Lista de bornes (terminais)

### Régua X1 — Comando

| Borne | Função | Origem interna | Destino externo |
|---|---|---|---|
| X1:1 | +24V | G1:+24V | Painel operador |
| X1:2 | 0V | G1:0V | Painel operador |
| X1:3 | E-stop entrada | S0 (campo) | A1:DI0 |
| X1:4 | E-stop retorno | KSR:14 | S0 (campo) |
| X1:5 | Partida | A1:DI1 | S1 (campo) |
| X1:6 | Parada | A1:DI2 | S2 (campo) |
| X1:7 | Reset | A1:DI5 | S3 (campo) |
| X1:8 | Sinaleiro ciclo | A1:DO1 | H1 |
| X1:9 | Sinaleiro falha | A1:DO2 | H2 |
| X1:10 | Sinaleiro pronto | A1:DO3 | H3 |

### Régua X2 — Analógicos (blindados)

| Borne | Função | Sinal |
|---|---|---|
| X2:1 / X2:2 | AI tambor (do inversor) | 0-10V |
| X2:3 / X2:4 | AO torque (ao drive) | 0-10V |
| X2:5 / X2:6 | AI velocidade servo | 0-10V |
| X2:PE | Malha blindagem | PE |

### Régua X3 — Servo motor

| Borne | Função | Cabo |
|---|---|---|
| X3:U / X3:V / X3:W | Motor 3F | 4×1,5mm² blindado |
| X3:PE | PE motor | — |
| X3:Y1+ / X3:Y1− | Freio EM | 2×0,75mm² |
| X3:E1..E9 | Encoder | Cabo de encoder do servo (já vem cravado) |

---

## 7. Importação no QElectroTech

1. Crie um novo projeto: **Arquivo → Novo**
2. Configure as propriedades (autor, título, formatos de cartucho)
3. Crie 5 fólios:
   - **01_FORCA** — Q0, KM0, QF1, QF3, F1, RR
   - **02_COMANDO** — QF2, G1, KSR, K1, K2, S0, S1, S2, S3
   - **03_PLC** — A1, A1.1, HMI, H1, H2, H3
   - **04_SERVO** — U1, M1, Y1
   - **05_BORNES** — X1, X2, X3
