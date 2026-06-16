"""Geração do arquivo de projeto .qet (XML do QElectroTech).

A estratégia é montar um *esqueleto* navegável e já conectado:

* cada componente vira um símbolo retangular genérico, embutido na coleção do
  projeto, com um terminal por pino citado na wire list;
* barramentos/nós (``+24V``, ``Barra PE`` ...) viram blocos com um terminal por
  fio que neles chega;
* os componentes são distribuídos em grade dentro do seu fólio;
* cada fio cuja origem e destino caem no mesmo fólio é desenhado como um
  condutor ligando os dois terminais.

Fios entre fólios diferentes não viram condutor automático (vira referência
cruzada que o projetista resolve no QET) — eles são listados no relatório final.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from xml.dom import minidom

from .model import Schematic

# QElectroTech: orientações de terminal (instância usa número, definição usa letra)
_ORIENT_NUM = {"n": 0, "e": 1, "s": 2, "w": 3}
_STYLE = "line-style:normal;line-weight:normal;filling:none;color:black"
_QET_VERSION = "0.8"


@dataclass
class _Node:
    """Um símbolo a ser desenhado em um fólio (componente ou barramento)."""

    key: tuple
    label: str
    sublabel: str
    is_net: bool
    pins: list[str] = field(default_factory=list)
    defname: str = ""          # nome do arquivo .elmt embutido
    term_local: dict = field(default_factory=dict)  # pin -> (x, y, orient_letter)

    def pin_index(self, pin: str) -> int:
        if pin not in self.pins:
            self.pins.append(pin)
        return self.pins.index(pin)


def _safe(text: str) -> str:
    return re.sub(r"[^A-Za-z0-9_]+", "_", text).strip("_") or "x"


def _real_folio(schem: Schematic, endpoint) -> str | None:
    if endpoint.is_net:
        return None
    comp = schem.components.get(endpoint.comp)
    return comp.folio if comp else None


def _build_nodes(schem: Schematic):
    """Agrupa componentes/nós e condutores por fólio.

    Retorna ``(folio_nodes, folio_conductors)`` onde:
    * ``folio_nodes[folio]`` -> dict ``key -> _Node``
    * ``folio_conductors[folio]`` -> lista ``(wire, key1, pin1, key2, pin2)``
    """
    folio_nodes: dict[str, dict[tuple, _Node]] = {}
    folio_conductors: dict[str, list] = {}

    def get_node(folio: str, key: tuple, label: str, sub: str, is_net: bool) -> _Node:
        nodes = folio_nodes.setdefault(folio, {})
        if key not in nodes:
            nodes[key] = _Node(key=key, label=label, sublabel=sub, is_net=is_net)
        return nodes[key]

    # garante que todo componente atribuído apareça no seu fólio
    for comp in schem.components.values():
        if comp.folio:
            get_node(comp.folio, ("C", comp.tag), comp.tag, comp.description, False)

    for wire in schem.wires:
        f_src = _real_folio(schem, wire.src)
        f_dst = _real_folio(schem, wire.dst)
        reals = [f for f in (f_src, f_dst) if f]
        if not reals or len(set(reals)) > 1:
            # ambos são nós, ou o fio cruza fólios: não desenha condutor
            continue
        folio = reals[0]

        def resolve(ep):
            if ep.is_net:
                node = get_node(folio, ("N", ep.comp), ep.comp, "", True)
                pin = wire.label or ep.comp        # um terminal por fio no barramento
            else:
                node = get_node(folio, ("C", ep.comp), ep.comp,
                                schem.components[ep.comp].description, False)
                pin = ep.pin or wire.label
            node.pin_index(pin)
            return node.key, pin

        k1, p1 = resolve(wire.src)
        k2, p2 = resolve(wire.dst)
        folio_conductors.setdefault(folio, []).append((wire, k1, p1, k2, p2))

    # réguas de bornes (seção 4) -> blocos multi-terminal no fólio de bornes
    if schem.strips:
        bornes_folio = next(
            (f.key for f in schem.folios if "BORNE" in f.key.upper()), "05_BORNES"
        )
        for strip in schem.strips:
            node = get_node(bornes_folio, ("T", strip.name),
                            strip.name, strip.title, False)
            for term in strip.terminals:
                # usa só o identificador do borne (parte após ":")
                node.pin_index(term.name.split(":")[-1])

    return folio_nodes, folio_conductors


def _layout_definition(node: _Node) -> None:
    """Calcula a geometria do símbolo e a posição local de cada terminal."""
    pins = node.pins
    n = len(pins)
    half = (n + 1) // 2
    left, right = pins[:half], pins[half:]
    rows = max(len(left), len(right), 1)

    label_len = max(len(node.label), len(node.sublabel or ""))
    width = max(60, ((label_len * 7 + 20) // 10) * 10)
    height = max(40, rows * 20 + 20)

    for i, pin in enumerate(left):
        node.term_local[pin] = (-10, 20 + i * 20, "w")
    for i, pin in enumerate(right):
        node.term_local[pin] = (width + 10, 20 + i * 20, "e")

    node._width = width      # type: ignore[attr-defined]
    node._height = height     # type: ignore[attr-defined]


def _definition_xml(node: _Node) -> ET.Element:
    """Gera o ``<definition>`` (conteúdo .elmt) embutido para o símbolo."""
    w, h = node._width, node._height  # type: ignore[attr-defined]
    definition = ET.Element(
        "definition",
        {
            "type": "element",
            "width": str(w + 20),
            "height": str(h),
            "hotspot_x": "10",
            "hotspot_y": "0",
            "version": _QET_VERSION,
            "orientation": "dnny",
            "link_type": "thumbnail",
        },
    )
    names = ET.SubElement(definition, "names")
    ET.SubElement(names, "name", {"lang": "pt"}).text = node.label
    ET.SubElement(definition, "informations").text = "Gerado por md2qet"
    desc = ET.SubElement(definition, "description")

    # corpo
    ET.SubElement(desc, "rect", {
        "x": "0", "y": "0", "width": str(w), "height": str(h), "style": _STYLE,
    })
    # rótulo principal (TAG) e descrição curta
    ET.SubElement(desc, "text", {
        "x": "4", "y": "12", "text": node.label, "size": "9", "rotation": "0",
    })
    if node.sublabel:
        sub = node.sublabel if len(node.sublabel) <= 24 else node.sublabel[:23] + "…"
        ET.SubElement(desc, "text", {
            "x": "4", "y": str(h - 4), "text": sub, "size": "5", "rotation": "0",
        })

    # leads + textos de pino + terminais
    for pin, (tx, ty, orient) in node.term_local.items():
        if orient == "w":
            ET.SubElement(desc, "line", {
                "x1": "0", "y1": str(ty), "x2": "-10", "y2": str(ty),
                "end1": "none", "end2": "none", "style": _STYLE,
            })
            ET.SubElement(desc, "text", {
                "x": "3", "y": str(ty + 3), "text": pin, "size": "5", "rotation": "0",
            })
        else:  # east
            ET.SubElement(desc, "line", {
                "x1": str(w), "y1": str(ty), "x2": str(w + 10), "y2": str(ty),
                "end1": "none", "end2": "none", "style": _STYLE,
            })
            ET.SubElement(desc, "text", {
                "x": str(w - len(pin) * 4 - 3), "y": str(ty + 3),
                "text": pin, "size": "5", "rotation": "0",
            })
        ET.SubElement(desc, "terminal", {
            "x": str(tx), "y": str(ty), "orientation": orient,
        })
    return definition


def build_project(schem: Schematic) -> ET.Element:
    """Constrói a árvore XML completa do projeto .qet."""
    folio_nodes, folio_conductors = _build_nodes(schem)

    project = ET.Element("project", {"version": _QET_VERSION, "title": schem.title})
    ET.SubElement(project, "properties")
    collection = ET.SubElement(project, "collection")
    category = ET.SubElement(collection, "category", {"name": "import"})
    cat_names = ET.SubElement(category, "names")
    ET.SubElement(cat_names, "name", {"lang": "pt"}).text = "Importados"

    # cria definições e dá nome único a cada símbolo
    counter = 0
    for nodes in folio_nodes.values():
        for node in nodes.values():
            counter += 1
            node.defname = f"el_{counter}_{_safe(node.label)}.elmt"
            _layout_definition(node)
            elem = ET.SubElement(category, "element", {"name": node.defname})
            elem.append(_definition_xml(node))

    # ordena os fólios: primeiro os declarados na seção 7, depois o resto
    declared = [f.key for f in schem.folios]
    order_keys = declared + [k for k in folio_nodes if k not in declared]

    folio_titles = {f.key: f.title for f in schem.folios}
    order = 0
    for fkey in order_keys:
        nodes = folio_nodes.get(fkey)
        if not nodes:
            continue
        order += 1
        diagram = ET.SubElement(project, "diagram", {
            "order": str(order),
            "title": f"{fkey} — {folio_titles.get(fkey, '')}".strip(" —"),
            "author": schem.author,
            "date": schem.date,
            "folio": "%id/%total",
            "cols": "17", "rows": "8", "colsize": "60", "rowsize": "80",
            "displaycols": "true", "displayrows": "true",
            "version": _QET_VERSION,
        })
        ET.SubElement(diagram, "defaultconductor", {"type": "simple"})
        elements_el = ET.SubElement(diagram, "elements")
        conductors_el = ET.SubElement(diagram, "conductors")

        # posiciona em grade e atribui ids de terminal
        term_id: dict[tuple, int] = {}    # (key, pin) -> id
        next_id = 0
        per_row = 4
        for idx, node in enumerate(nodes.values()):
            col, row = idx % per_row, idx // per_row
            x, y = 80 + col * 240, 80 + row * 260
            el = ET.SubElement(elements_el, "element", {
                "x": str(x), "y": str(y),
                "type": f"embed://import/{node.defname}",
                "orientation": "0",
            })
            terms = ET.SubElement(el, "terminals")
            for pin in node.pins:
                tx, ty, orient = node.term_local[pin]
                ET.SubElement(terms, "terminal", {
                    "x": str(tx), "y": str(ty),
                    "id": str(next_id),
                    "orientation": str(_ORIENT_NUM[orient]),
                })
                term_id[(node.key, pin)] = next_id
                next_id += 1

        # condutores
        for wire, k1, p1, k2, p2 in folio_conductors.get(fkey, []):
            id1 = term_id.get((k1, p1))
            id2 = term_id.get((k2, p2))
            if id1 is None or id2 is None or id1 == id2:
                continue
            ET.SubElement(conductors_el, "conductor", {
                "terminal1": str(id1), "terminal2": str(id2),
                "type": "simple", "num": wire.label,
            })

    return project


def to_xml_string(project: ET.Element) -> str:
    rough = ET.tostring(project, encoding="unicode")
    pretty = minidom.parseString(rough).toprettyxml(indent="  ")
    # remove linhas em branco que o minidom insere e fixa o cabeçalho
    lines = [ln for ln in pretty.splitlines() if ln.strip()]
    if lines and lines[0].startswith("<?xml"):
        lines[0] = '<?xml version="1.0" encoding="utf-8"?>'
    return "\n".join(lines) + "\n"


def write_qet(schem: Schematic, path: str) -> dict:
    """Escreve o arquivo .qet e devolve um pequeno relatório com estatísticas."""
    project = build_project(schem)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(to_xml_string(project))

    cross = []
    for wire in schem.wires:
        f1, f2 = _real_folio(schem, wire.src), _real_folio(schem, wire.dst)
        if f1 and f2 and f1 != f2:
            cross.append((wire.label, f1, f2))

    return {
        "components": len(schem.components),
        "wires": len(schem.wires),
        "folios": sum(1 for d in project if d.tag == "diagram"),
        "cross_folio": cross,
    }
