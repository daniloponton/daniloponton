"""Testes do md2qet.

Rode com:  python -m pytest        (ou)   python -m unittest
"""

import os
import sys
import unittest
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from md2qet import symbols  # noqa: E402
from md2qet.parser import parse_endpoint, parse_markdown  # noqa: E402
from md2qet.writer import build_project, to_xml_string  # noqa: E402

SAMPLE = """\
# Esquemático de teste

**Projeto:** Projeto Teste
**Revisão:** 1.0
**Data:** 2026-06-16

## 2. Lista de componentes

### 2.1 Força

| TAG | Descrição | Modelo sugerido |
|---|---|---|
| Q0 | Seccionador 25A | WEG SD3 |
| KM0 | Contator 9A | WEG CWB9 |

## 3. Lista de fios

### 3.1 Força

| Fio | Origem | Destino | Bitola | Cor |
|---|---|---|---|---|
| L1 | Q0:2 | KM0:1 | 2,5 mm² | Preto |
| 24 | +24V | KM0:A1 | 1,5 mm² | Vermelho |

## 4. Lista de bornes

### Régua X1 — Comando

| Borne | Função | Origem interna | Destino externo |
|---|---|---|---|
| X1:1 | +24V | G1 | campo |
| X1:2 | 0V | G1 | campo |

## 7. Importação no QElectroTech

3. Crie os fólios:
   - **01_FORCA** — Q0, KM0
   - **05_BORNES** — X1
"""


class TestParser(unittest.TestCase):
    def setUp(self):
        self.schem = parse_markdown(SAMPLE)

    def test_header(self):
        self.assertEqual(self.schem.title, "Projeto Teste")
        self.assertEqual(self.schem.revision, "1.0")
        self.assertEqual(self.schem.date, "2026-06-16")

    def test_components(self):
        self.assertIn("Q0", self.schem.components)
        self.assertIn("KM0", self.schem.components)
        self.assertEqual(self.schem.components["Q0"].model, "WEG SD3")

    def test_folio_assignment(self):
        self.assertEqual(self.schem.components["Q0"].folio, "01_FORCA")

    def test_wires(self):
        labels = {w.label for w in self.schem.wires}
        self.assertEqual(labels, {"L1", "24"})

    def test_strips(self):
        self.assertEqual(len(self.schem.strips), 1)
        self.assertEqual(len(self.schem.strips[0].terminals), 2)

    def test_endpoint_net_vs_component(self):
        known = {"Q0", "KM0"}
        comp = parse_endpoint("Q0:2", known)
        self.assertFalse(comp.is_net)
        self.assertEqual((comp.comp, comp.pin), ("Q0", "2"))
        net = parse_endpoint("+24V", known)
        self.assertTrue(net.is_net)
        # remove anotações entre parênteses
        field = parse_endpoint("S0 (campo)", {"S0"})
        self.assertEqual(field.comp, "S0")


class TestWriter(unittest.TestCase):
    def setUp(self):
        self.schem = parse_markdown(SAMPLE)
        self.xml = to_xml_string(build_project(self.schem))
        self.root = ET.fromstring(self.xml)

    def test_well_formed_and_root(self):
        self.assertEqual(self.root.tag, "project")
        self.assertEqual(self.root.attrib["title"], "Projeto Teste")

    def test_has_embedded_collection(self):
        self.assertTrue(self.root.findall(".//collection/category/element"))

    def test_diagrams_have_elements_and_conductors(self):
        diagrams = self.root.findall("diagram")
        self.assertGreaterEqual(len(diagrams), 2)
        forca = next(d for d in diagrams if d.attrib["title"].startswith("01_FORCA"))
        self.assertTrue(forca.findall("elements/element"))
        # L1 liga Q0 a KM0 no mesmo fólio -> deve virar condutor
        self.assertTrue(forca.findall("conductors/conductor"))

    def test_terminal_ids_unique_per_diagram(self):
        for d in self.root.findall("diagram"):
            ids = [t.attrib["id"] for t in d.findall("elements/element/terminals/terminal")]
            self.assertEqual(len(ids), len(set(ids)))

    def test_conductors_reference_existing_terminals(self):
        for d in self.root.findall("diagram"):
            ids = {t.attrib["id"] for t in d.findall("elements/element/terminals/terminal")}
            for c in d.findall("conductors/conductor"):
                self.assertIn(c.attrib["terminal1"], ids)
                self.assertIn(c.attrib["terminal2"], ids)


class TestSymbols(unittest.TestCase):
    def test_classify(self):
        self.assertEqual(symbols.classify("M1", "Servomotor 200W"), "motor")
        self.assertEqual(symbols.classify("H1", "Sinaleiro verde"), "sinaleiro")
        self.assertEqual(symbols.classify("QF1", "Disjuntor motor"), "disjuntor")
        self.assertEqual(symbols.classify("KM0", "Contator geral"), "contator")
        self.assertEqual(symbols.classify("PE", "Barra de aterramento"), "aterramento")
        self.assertEqual(symbols.classify("U1", "Drive servo"), "drive")

    def test_body_primitives_motor_has_circle(self):
        prims = symbols.body_primitives("motor", 60, 60)
        self.assertTrue(any(p.tag == "ellipse" for p in prims))


CROSS = """\
**Projeto:** Cruzado

## 2. Lista de componentes

| TAG | Descrição |
|---|---|
| A1 | PLC |
| U1 | Drive |

## 3. Lista de fios

| Fio | Origem | Destino |
|---|---|---|
| AO+ | A1:AO1 | U1:TREF |

## 7. Importação no QElectroTech

   - **03_PLC** — A1
   - **04_SERVO** — U1
"""


class TestCrossFolio(unittest.TestCase):
    def setUp(self):
        self.root = ET.fromstring(to_xml_string(build_project(parse_markdown(CROSS))))

    def test_reference_on_both_folios(self):
        # cada fólio do fio cruzado deve ter 1 componente + 1 referência = 2 elementos
        for title in ("03_PLC", "04_SERVO"):
            d = next(x for x in self.root.findall("diagram")
                     if x.attrib["title"].startswith(title))
            self.assertEqual(len(d.findall("elements/element")), 2)
            self.assertEqual(len(d.findall("conductors/conductor")), 1)


if __name__ == "__main__":
    unittest.main()
