"""Classificação de componentes e desenho dos símbolos (estilo IEC).

Em vez de uma caixa única para tudo, cada componente é classificado a partir da
sua TAG e descrição e recebe um *glifo* reconhecível desenhado dentro do corpo
do símbolo: motor (círculo com M), sinaleiro (círculo com X), aterramento,
contato de contator/relé, disjuntor, etc.

Os glifos são desenhados pelo próprio md2qet (primitivas do formato .elmt do
QElectroTech). Não são cópias dos arquivos da biblioteca do QET — mas seguem a
mesma simbologia IEC e mantêm os terminais nomeados, então é fácil trocar pelo
símbolo normativo dentro do QET preservando as ligações.
"""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET

_STYLE = "line-style:normal;line-weight:normal;filling:none;color:black"
_STYLE_DASH = "line-style:dashed;line-weight:thin;filling:none;color:black"


def classify(tag: str, description: str) -> str:
    """Devolve a classe do componente a partir da TAG e da descrição."""
    t = tag.strip().upper()
    d = (description or "").lower()

    def has(*words):
        return any(w in d for w in words)

    # motor só pela TAG (M1, M2...) — evita confundir com "disjuntor motor"
    if re.fullmatch(r"M\d.*", t):
        return "motor"
    if has("servomotor"):
        return "motor"
    # palavras de dispositivo têm prioridade sobre o genérico "motor"
    if has("disjuntor"):
        return "disjuntor"
    if has("seccionador"):
        return "seccionador"
    if has("contator"):
        return "contator"
    if t.startswith("KM"):
        return "contator"
    if has("relé", "rele") or t == "KSR":
        return "rele"
    if re.fullmatch(r"H\d.*", t) or has("sinaleiro", "lâmpada", "lampada"):
        return "sinaleiro"
    if has("e-stop", "cogumelo"):
        return "estop"
    if t.startswith("S") or has("botão", "botao"):
        return "botao"
    if t.startswith("K"):
        return "rele"
    if has("motor"):
        return "motor"
    if has("resistor"):
        return "resistor"
    if has("filtro"):
        return "filtro"
    if has("fonte"):
        return "fonte"
    if t.startswith("U") or has("drive", "inversor"):
        return "drive"
    if has("plc", "clp"):
        return "plc"
    if has("freio"):
        return "freio"
    if t == "PE" or has("aterramento", "barra de aterramento", "terra"):
        return "aterramento"
    return "generic"


# classes cujo glifo já é o corpo (não desenhamos o retângulo externo)
_NO_BOX = {"motor", "sinaleiro", "aterramento"}


def draws_box(cls: str) -> bool:
    return cls not in _NO_BOX


def min_height(cls: str) -> int:
    return 60 if cls in {"motor", "sinaleiro"} else 40


def _el(tag, **attrs):
    return ET.Element(tag, {k: str(v) for k, v in attrs.items()})


def _line(x1, y1, x2, y2, style=_STYLE):
    return _el("line", x1=x1, y1=y1, x2=x2, y2=y2,
               end1="none", end2="none", style=style)


def body_primitives(cls: str, w: int, h: int) -> list[ET.Element]:
    """Primitivas do glifo central, no espaço local 0..w / 0..h."""
    cx, cy = w / 2, h / 2
    r = max(8, min(w, h) / 2 - 8)
    out: list[ET.Element] = []

    if cls == "motor":
        out.append(_el("ellipse", x=cx - r, y=cy - r, width=2 * r, height=2 * r,
                       antialias="true", style=_STYLE))
        out.append(_el("text", x=cx - 5, y=cy + 5, text="M", size=11, rotation=0))
    elif cls == "sinaleiro":
        out.append(_el("ellipse", x=cx - r, y=cy - r, width=2 * r, height=2 * r,
                       antialias="true", style=_STYLE))
        k = r * 0.7
        out.append(_line(cx - k, cy - k, cx + k, cy + k))
        out.append(_line(cx - k, cy + k, cx + k, cy - k))
    elif cls == "aterramento":
        out.append(_line(cx, cy - r, cx, cy))           # haste
        out.append(_line(cx - 9, cy, cx + 9, cy))
        out.append(_line(cx - 6, cy + 4, cx + 6, cy + 4))
        out.append(_line(cx - 3, cy + 8, cx + 3, cy + 8))
    elif cls in {"contator", "rele"}:
        # bobina: retângulo pequeno no centro
        out.append(_el("rect", x=cx - 12, y=cy - 8, width=24, height=16, style=_STYLE))
        if cls == "rele":
            out.append(_line(cx - 12, cy + 8, cx + 12, cy - 8))  # traço diagonal
    elif cls in {"disjuntor", "seccionador"}:
        # contato com traço inclinado
        out.append(_line(cx - 10, cy + 10, cx + 8, cy - 10))
        out.append(_line(cx - 10, cy + 10, cx - 10, cy + 14))
        out.append(_line(cx + 8, cy - 10, cx + 8, cy - 14))
        if cls == "disjuntor":
            out.append(_el("text", x=cx + 6, y=cy + 6, text="x", size=9, rotation=0))
    elif cls in {"botao", "estop"}:
        out.append(_line(cx - 10, cy, cx + 10, cy))          # haste de acionamento
        out.append(_line(cx, cy, cx, cy - 10))
        if cls == "estop":
            out.append(_el("ellipse", x=cx - 7, y=cy - 17, width=14, height=10,
                           antialias="true", style=_STYLE))   # cogumelo
    elif cls == "resistor":
        out.append(_el("rect", x=cx - 16, y=cy - 7, width=32, height=14, style=_STYLE))
    elif cls == "drive":
        out.append(_line(cx - 12, cy + 12, cx + 12, cy - 12))  # "/" de conversor
        out.append(_el("text", x=cx - 14, y=cy + 14, text="~", size=9, rotation=0))
        out.append(_el("text", x=cx + 4, y=cy - 4, text="=", size=9, rotation=0))
    elif cls == "fonte":
        out.append(_el("text", x=cx - 14, y=cy + 4, text="~/=", size=9, rotation=0))
    elif cls == "referencia":
        # seta de referência cruzada
        out.append(_line(2, cy, w - 4, cy))
        out.append(_line(w - 10, cy - 5, w - 4, cy))
        out.append(_line(w - 10, cy + 5, w - 4, cy))
    return out
