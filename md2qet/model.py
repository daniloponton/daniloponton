"""Modelo de dados intermediário do md2qet.

Aqui ficam as estruturas que representam um esquemático elétrico de forma
independente de formato: componentes, fios (wire list), fólios e a régua de
bornes. O parser (``parser.py``) preenche essas estruturas a partir do Markdown
e o writer (``writer.py``) as converte para o XML do QElectroTech (.qet).
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class Endpoint:
    """Uma ponta de um fio (origem ou destino).

    Um endpoint costuma vir escrito como ``TAG:pino`` (ex.: ``KM0:1L1``). Quando
    o lado esquerdo não corresponde a um componente conhecido (ex.: ``+24V``,
    ``Barra PE``), tratamos como um *nó/barramento* (``is_net=True``).
    """

    raw: str          # texto original, ex.: "KM0:1L1"
    comp: str         # tag do componente OU nome do barramento/nó
    pin: str          # nome do pino, ex.: "1L1" (pode ficar vazio)
    is_net: bool = False


@dataclass
class Component:
    """Um componente da lista de materiais (seção 2 do Markdown)."""

    tag: str
    description: str = ""
    model: str = ""
    folio: str = ""                       # fólio onde será desenhado
    pins: list[str] = field(default_factory=list)  # pinos usados (ordenados)


@dataclass
class Wire:
    """Um fio da wire list (seção 3 do Markdown)."""

    label: str
    src: Endpoint
    dst: Endpoint
    gauge: str = ""
    color: str = ""
    note: str = ""


@dataclass
class Terminal:
    """Um borne de uma régua (seção 4 do Markdown)."""

    name: str         # ex.: "X1:1"
    function: str = ""
    src: str = ""
    dst: str = ""


@dataclass
class TerminalStrip:
    """Uma régua de bornes (X1, X2, X3...)."""

    name: str
    title: str = ""
    terminals: list[Terminal] = field(default_factory=list)


@dataclass
class Folio:
    """Um fólio (página) do projeto."""

    key: str                              # ex.: "01_FORCA"
    title: str = ""
    components: list[str] = field(default_factory=list)  # tags atribuídas


@dataclass
class Schematic:
    """O projeto completo, pronto para ser exportado."""

    title: str = "Esquemático"
    author: str = ""
    revision: str = ""
    date: str = ""
    norm: str = ""

    components: dict[str, Component] = field(default_factory=dict)
    wires: list[Wire] = field(default_factory=list)
    folios: list[Folio] = field(default_factory=list)
    strips: list[TerminalStrip] = field(default_factory=list)

    def folio_of(self, tag: str) -> str:
        """Retorna a chave do fólio onde o componente ``tag`` está atribuído."""
        comp = self.components.get(tag)
        return comp.folio if comp else ""
