"""Interface de linha de comando do md2qet.

Exemplos:
    python -m md2qet examples/esquematico_eletrico.md
    python -m md2qet entrada.md -o projeto.qet
"""

from __future__ import annotations

import argparse
import sys

from .parser import parse_file
from .writer import write_qet


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(
        prog="md2qet",
        description="Gera um projeto .qet do QElectroTech a partir de um Markdown "
                    "com listas de componentes, fios e bornes.",
    )
    ap.add_argument("input", help="arquivo Markdown de entrada (.md)")
    ap.add_argument(
        "-o", "--output",
        help="arquivo .qet de saída (padrão: mesmo nome do .md com extensão .qet)",
    )
    ap.add_argument(
        "-q", "--quiet", action="store_true", help="não imprime o relatório",
    )
    args = ap.parse_args(argv)

    output = args.output
    if not output:
        output = args.input.rsplit(".", 1)[0] + ".qet"

    try:
        schem = parse_file(args.input)
    except FileNotFoundError:
        print(f"erro: arquivo não encontrado: {args.input}", file=sys.stderr)
        return 1

    report = write_qet(schem, output)

    if not args.quiet:
        print(f"✓ Projeto gerado: {output}")
        print(f"  Componentes : {report['components']}")
        print(f"  Fios        : {report['wires']}")
        print(f"  Fólios      : {report['folios']}")
        if report["cross_folio"]:
            print(f"  Referências cruzadas (fio entre fólios, símbolo de "
                  f"referência em cada lado): {len(report['cross_folio'])}")
            for label, f1, f2 in report["cross_folio"]:
                print(f"    - {label}: {f1} → {f2}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
