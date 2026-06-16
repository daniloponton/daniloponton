"""md2qet — gera projetos .qet do QElectroTech a partir de um Markdown.

Uso programático:

    from md2qet import parse_file, write_qet
    schem = parse_file("esquematico.md")
    write_qet(schem, "saida.qet")
"""

from .model import Schematic
from .parser import parse_file, parse_markdown
from .writer import build_project, write_qet

__all__ = [
    "Schematic",
    "parse_file",
    "parse_markdown",
    "build_project",
    "write_qet",
]

__version__ = "0.1.0"
