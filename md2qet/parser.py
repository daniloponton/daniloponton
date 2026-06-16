"""Parser do Markdown do esquemático para o modelo intermediário.

O documento esperado segue a estrutura do exemplo em ``examples/``:

* cabeçalho com ``**Projeto:**``, ``**Revisão:**``, ``**Data:**``, ``**Norma...**``
* seção ``## 2. Lista de componentes`` (tabelas com TAG / Descrição / Modelo)
* seção ``## 3. Lista de fios`` (tabelas com Fio / Origem / Destino)
* seção ``## 4. Lista de bornes`` (réguas X1, X2, ...)
* seção ``## 7. Importação no QElectroTech`` (define os fólios e seus componentes)

O parser é tolerante: ignora colunas extras, aceita variações de acentuação nos
cabeçalhos e descarta linhas vazias.
"""

from __future__ import annotations

import re
import unicodedata

from .model import (
    Component,
    Endpoint,
    Folio,
    Schematic,
    Terminal,
    TerminalStrip,
    Wire,
)


def _strip_accents(text: str) -> str:
    norm = unicodedata.normalize("NFKD", text)
    return "".join(c for c in norm if not unicodedata.combining(c)).lower().strip()


def _split_row(line: str) -> list[str]:
    """Quebra uma linha de tabela Markdown em células (sem as bordas ``|``)."""
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [c.strip() for c in line.split("|")]


def _is_separator(cells: list[str]) -> bool:
    return all(re.fullmatch(r":?-{2,}:?", c) is not None for c in cells if c)


def _iter_tables(lines: list[str]):
    """Itera tabelas Markdown contidas em ``lines``.

    Cada tabela é devolvida como ``(headers, rows)`` onde ``rows`` é uma lista de
    dicionários ``{cabeçalho: valor}``.
    """
    i = 0
    n = len(lines)
    while i < n:
        line = lines[i]
        if line.strip().startswith("|") and i + 1 < n and "|" in lines[i + 1]:
            headers = _split_row(line)
            sep = _split_row(lines[i + 1])
            if _is_separator(sep):
                rows = []
                j = i + 2
                while j < n and lines[j].strip().startswith("|"):
                    cells = _split_row(lines[j])
                    # normaliza o tamanho da linha ao número de colunas
                    cells += [""] * (len(headers) - len(cells))
                    rows.append(dict(zip(headers, cells)))
                    j += 1
                yield headers, rows
                i = j
                continue
        i += 1


def _section_ranges(lines: list[str]) -> dict[str, tuple[int, int]]:
    """Mapeia o número da seção (``## 2.`` -> "2") para o intervalo de linhas."""
    heads = []
    for idx, line in enumerate(lines):
        m = re.match(r"^##\s+(\d+)\.", line)
        if m:
            heads.append((m.group(1), idx))
    ranges = {}
    for k, (num, start) in enumerate(heads):
        end = heads[k + 1][1] if k + 1 < len(heads) else len(lines)
        ranges[num] = (start, end)
    return ranges


def _find_col(headers: list[str], *candidates: str) -> str | None:
    """Devolve o cabeçalho cujo nome (sem acento/caixa) bate com algum candidato."""
    norm = {_strip_accents(h): h for h in headers}
    for cand in candidates:
        if cand in norm:
            return norm[cand]
    # casamento por prefixo (ex.: "observacao" casa com "obs")
    for cand in candidates:
        for key, original in norm.items():
            if key.startswith(cand):
                return original
    return None


def _parse_header(lines: list[str], schem: Schematic) -> None:
    patterns = {
        "title": r"\*\*Projeto:\*\*\s*(.+)",
        "revision": r"\*\*Revis[aã]o:\*\*\s*(.+)",
        "date": r"\*\*Data:\*\*\s*(.+)",
        "norm": r"\*\*Norma[^:]*:\*\*\s*(.+)",
    }
    for line in lines[:30]:
        for attr, pat in patterns.items():
            m = re.search(pat, line)
            if m:
                setattr(schem, attr, m.group(1).strip())


def _parse_components(lines: list[str], schem: Schematic) -> None:
    for headers, rows in _iter_tables(lines):
        tag_col = _find_col(headers, "tag")
        desc_col = _find_col(headers, "descricao", "descric")
        model_col = _find_col(headers, "modelo")
        if not tag_col:
            continue
        for row in rows:
            tag = row.get(tag_col, "").strip()
            if not tag or tag == "—":
                continue
            schem.components[tag] = Component(
                tag=tag,
                description=row.get(desc_col, "").strip() if desc_col else "",
                model=row.get(model_col, "").strip() if model_col else "",
            )


def parse_endpoint(text: str, known: set[str]) -> Endpoint | None:
    """Interpreta um token de origem/destino em um :class:`Endpoint`.

    Retorna ``None`` para células vazias.
    """
    raw = text.strip()
    if not raw:
        return None
    # quando há várias pontas separadas por "/", usamos a primeira
    first = raw.split("/")[0].strip()
    # remove anotações entre parênteses, ex.: "S0 (campo)" -> "S0"
    first = re.sub(r"\s*\(.*?\)\s*", "", first).strip()
    if ":" in first:
        comp, pin = first.split(":", 1)
        comp, pin = comp.strip(), pin.strip()
    else:
        comp, pin = first, ""
    is_net = comp not in known
    return Endpoint(raw=raw, comp=comp, pin=pin, is_net=is_net)


def _parse_wires(lines: list[str], schem: Schematic) -> None:
    known = set(schem.components)
    for headers, rows in _iter_tables(lines):
        fio_col = _find_col(headers, "fio")
        org_col = _find_col(headers, "origem")
        dst_col = _find_col(headers, "destino")
        if not (fio_col and org_col and dst_col):
            continue
        gauge_col = _find_col(headers, "bitola")
        color_col = _find_col(headers, "cor")
        note_col = _find_col(headers, "observacao", "obs", "funcao")
        for row in rows:
            src = parse_endpoint(row.get(org_col, ""), known)
            dst = parse_endpoint(row.get(dst_col, ""), known)
            if not (src and dst):
                continue
            schem.wires.append(
                Wire(
                    label=row.get(fio_col, "").strip(),
                    src=src,
                    dst=dst,
                    gauge=row.get(gauge_col, "").strip() if gauge_col else "",
                    color=row.get(color_col, "").strip() if color_col else "",
                    note=row.get(note_col, "").strip() if note_col else "",
                )
            )


def _parse_strips(lines: list[str], schem: Schematic) -> None:
    # cada régua começa em "### Régua Xn — título"
    current: TerminalStrip | None = None
    block: list[str] = []

    def flush():
        nonlocal current, block
        if current is None:
            return
        for headers, rows in _iter_tables(block):
            name_col = _find_col(headers, "borne")
            if not name_col:
                continue
            func_col = _find_col(headers, "funcao")
            src_col = _find_col(headers, "origem interna", "origem")
            dst_col = _find_col(headers, "destino externo", "destino", "sinal", "cabo")
            for row in rows:
                name = row.get(name_col, "").strip()
                if not name:
                    continue
                current.terminals.append(
                    Terminal(
                        name=name,
                        function=row.get(func_col, "").strip() if func_col else "",
                        src=row.get(src_col, "").strip() if src_col else "",
                        dst=row.get(dst_col, "").strip() if dst_col else "",
                    )
                )
        schem.strips.append(current)
        current, block = None, []

    for line in lines:
        m = re.match(r"^###\s+R[ée]gua\s+(\S+)\s*[—-]?\s*(.*)$", line)
        if m:
            flush()
            current = TerminalStrip(name=m.group(1).strip(), title=m.group(2).strip())
        elif current is not None:
            block.append(line)
    flush()


# alguns apelidos usados na seção 7 ("drive" -> U1, etc.)
_ALIASES = {
    "drive": "U1",
    "motor": "M1",
    "freio": "Y1",
    "plc": "A1",
    "clp": "A1",
}


def _parse_folios(lines: list[str], schem: Schematic) -> None:
    for line in lines:
        m = re.match(r"^\s*-\s+\*\*(.+?)\*\*\s*[—-]\s*(.+)$", line)
        if not m:
            continue
        key = m.group(1).strip()
        rest = m.group(2)
        folio = Folio(key=key, title=key.replace("_", " ").title())
        for token in rest.split(","):
            token = re.sub(r"\s*\(.*?\)\s*", "", token).strip()
            if not token:
                continue
            if token in schem.components:
                folio.components.append(token)
            elif _ALIASES.get(_strip_accents(token)) in schem.components:
                folio.components.append(_ALIASES[_strip_accents(token)])
        schem.folios.append(folio)


def _assign_folios(schem: Schematic) -> None:
    """Marca cada componente com seu fólio e cria fólios padrão se faltarem."""
    for folio in schem.folios:
        for tag in folio.components:
            if tag in schem.components:
                schem.components[tag].folio = folio.key

    # componentes sem fólio vão para "99_DIVERSOS"
    orphans = [c.tag for c in schem.components.values() if not c.folio]
    if orphans:
        diversos = Folio(key="99_DIVERSOS", title="Diversos", components=orphans)
        for tag in orphans:
            schem.components[tag].folio = diversos.key
        schem.folios.append(diversos)

    # se não havia seção 7, cria um único fólio com tudo
    if not schem.folios:
        all_tags = list(schem.components)
        folio = Folio(key="01_GERAL", title="Geral", components=all_tags)
        for tag in all_tags:
            schem.components[tag].folio = folio.key
        schem.folios.append(folio)


def parse_markdown(text: str) -> Schematic:
    """Converte o conteúdo Markdown em um :class:`Schematic`."""
    lines = text.splitlines()
    schem = Schematic()
    _parse_header(lines, schem)

    ranges = _section_ranges(lines)

    def section(num: str) -> list[str]:
        if num not in ranges:
            return []
        start, end = ranges[num]
        return lines[start:end]

    _parse_components(section("2"), schem)
    _parse_wires(section("3"), schem)
    _parse_strips(section("4"), schem)
    _parse_folios(section("7"), schem)
    _assign_folios(schem)
    return schem


def parse_file(path: str) -> Schematic:
    with open(path, "r", encoding="utf-8") as fh:
        return parse_markdown(fh.read())
