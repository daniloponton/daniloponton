# md2qet — Markdown ➜ QElectroTech (.qet)

Ferramenta em Python que lê um arquivo **Markdown** descrevendo um esquemático
elétrico (lista de componentes, lista de fios e lista de bornes) e gera
automaticamente um **projeto `.qet`** que abre no
[QElectroTech](https://qelectrotech.org/).

O objetivo é eliminar o trabalho braçal de criar fólios, jogar cada componente
na página certa e ligar os fios um a um: você mantém a documentação em texto
(fácil de versionar e revisar) e o programa cospe o esqueleto do desenho já
conectado, pronto para você ajustar o layout no QET.

---

## Instalação

Não precisa instalar nada além do Python 3.10+ (usa só a biblioteca padrão).

```bash
git clone https://github.com/daniloponton/daniloponton.git
cd daniloponton
```

## Uso

```bash
# gera examples/esquematico_eletrico.qet
python -m md2qet examples/esquematico_eletrico.md

# escolhendo o nome de saída
python -m md2qet meu_esquema.md -o projeto.qet
```

Saída típica:

```
✓ Projeto gerado: examples/esquematico_eletrico.qet
  Componentes : 25
  Fios        : 46
  Fólios      : 6
  Referências cruzadas (fio entre fólios, não conectado automaticamente): 18
    - 3L1: 01_FORCA ↔ 04_SERVO
    ...
```

Depois é só abrir o `.qet` no QElectroTech (**Arquivo → Abrir**).

### Uso como biblioteca

```python
from md2qet import parse_file, write_qet

schem = parse_file("meu_esquema.md")
report = write_qet(schem, "projeto.qet")
print(report["folios"], "fólios gerados")
```

---

## Como o Markdown deve ser escrito

O parser reconhece seções pelos títulos `## N. ...`. Veja
[`examples/esquematico_eletrico.md`](../examples/esquematico_eletrico.md) como
modelo completo. Em resumo:

**Cabeçalho** (qualquer lugar no topo):

```markdown
**Projeto:** Nome do projeto      ← vira o título do projeto .qet
**Revisão:** 1.0
**Data:** 2026-06-16
```

**Seção 2 — Lista de componentes** (uma ou mais tabelas; a 1ª coluna é a TAG):

```markdown
| TAG | Descrição | Modelo sugerido |
|---|---|---|
| Q0  | Seccionador 25A | WEG SD3 |
```

**Seção 3 — Lista de fios** (precisa das colunas `Fio`, `Origem`, `Destino`):

```markdown
| Fio | Origem | Destino | Bitola | Cor |
|---|---|---|---|---|
| L1  | Q0:1   | KM0:1L1 | 2,5 mm² | Preto |
```

Cada ponta é lida como `TAG:pino`. Se o lado esquerdo não for um componente
conhecido (ex.: `+24V`, `Barra PE`), ele é tratado como **barramento/nó**.

**Seção 4 — Lista de bornes** (réguas; cada uma vira um bloco multi-terminal):

```markdown
### Régua X1 — Comando

| Borne | Função | Origem interna | Destino externo |
|---|---|---|---|
| X1:1 | +24V | G1:+24V | Painel operador |
```

**Seção 7 — Importação no QElectroTech** (define os fólios e o que vai em cada):

```markdown
   - **01_FORCA** — Q0, KM0, QF1, F1, RR
   - **02_COMANDO** — QF2, G1, KSR, K1, K2, S0, S1, S2, S3
```

Cada item `- **NOME** — TAG, TAG, ...` vira um fólio com aqueles componentes.
Componentes que sobrarem (sem fólio) caem em um fólio `99_DIVERSOS`. Se a seção 7
não existir, é criado um único fólio com tudo.

---

## O que é gerado

* **1 projeto `.qet`** com a coleção de símbolos embutida (abre sem depender de
  bibliotecas externas).
* **1 fólio por grupo** da seção 7, com os componentes distribuídos em grade.
* **Símbolos estilo IEC por classe de componente** — o componente é classificado
  pela TAG/descrição e recebe um glifo reconhecível (motor com `M`, sinaleiro
  com `X`, aterramento, contato de contator/relé, disjuntor, botão, cogumelo
  E‑stop, conversor/drive, resistor...). Cada símbolo tem um terminal nomeado
  para cada pino citado na lista de fios. Classes desconhecidas caem numa caixa
  rotulada. Ver [`symbols.py`](symbols.py).
* **Condutores** ligando automaticamente os fios cuja origem **e** destino estão
  no mesmo fólio.
* **Referências cruzadas**: fios entre fólios diferentes ganham um símbolo de
  seta de referência em **cada** fólio, ligado ao terminal do componente e
  rotulado com o fólio de destino.
* **Réguas de bornes** (X1, X2, ...) como blocos multi-terminal.

## Limitações conscientes (v0.1)

* Os símbolos são **desenhados pelo md2qet** seguindo a simbologia IEC — não são
  cópias dos arquivos da biblioteca oficial do QET. Se quiser o símbolo
  normativo exato, troque o elemento dentro do QET: os terminais e ligações são
  preservados.
* As referências cruzadas usam um símbolo de seta simples (não o elemento nativo
  de *report de fólio* do QET, que exige vínculo por UUID). O destino fica claro
  no rótulo; basta substituir pelo report nativo se desejar a navegação clicável.
* O layout é uma grade simples; reposicione no QET como preferir.

## Testes

```bash
python -m unittest discover -s tests -v
```
