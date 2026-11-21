"""The sizes and type journals ask of a figure: a starting point for a figure made for them.

A preset sets the width of the figure to a column of the journal and its type
to what the journal's guide for authors asks: it changes the size and the
style of a figure, never its data. Widths are in millimetres, type and strokes
in points.

These numbers are written by hand from the guides for authors, as known when
this file was written; journals revise them. ``checked`` says when: verify the
width against the current guide of the journal before submitting.
"""
from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

CHECKED = "written from memory of the guides in 2026, not re-read from the publishers' sites"


@dataclass(frozen=True)
class Preset:
    id: str
    publisher: str
    label: str              # which column
    width: float            # mm
    height: float           # mm: a pleasant default, not a rule
    max_height: float       # mm: the page of the journal
    font: str
    label_size: float       # pt: axis titles
    tick_size: float        # pt: numbers on the axes, legend
    stroke: float           # pt: axes and ticks
    line: float             # pt: curves
    note: str = ""


def _family(prefix: str, publisher: str, widths: list[tuple[str, str, float]], max_height: float, font: str, label: float, tick: float, stroke: float, line: float,
            note: str = "") -> list[Preset]:
    return [Preset(f"{prefix}-{key}", publisher, column, width, round(width / 1.4 if width < 130 else width / 2.0, 1), max_height, font, label, tick, stroke, line, note)
            for key, column, width in widths]


PRESETS: list[Preset] = [
    *_family("nature", "Nature and Nature journals", [("1", "single column", 89), ("1h", "one and a half columns", 120), ("2", "double column", 183)], 247, "Arial", 7, 6, 0.5, 1.0,
             "Helvetica or Arial, 5 to 7 pt; panel labels 8 pt bold lower-case."),
    *_family("science", "Science", [("1", "one column", 55), ("2", "two columns", 120), ("3", "three columns", 183)], 230, "Arial", 7, 6, 0.5, 1.0, "Helvetica; no type under 5 pt."),
    *_family("acs", "ACS (JACS, Nano Letters, ACS Nano…)", [("1", "single column (3.33 in)", 84.6), ("2", "double column (7 in)", 177.8)], 233, "Arial", 8, 7, 0.5, 1.0,
             "Helvetica, Arial or Times; no type under 4.5 pt; lines of 0.5 pt at least."),
    *_family("aps", "APS (Physical Review, PRL)", [("1", "single column (3⅜ in)", 86), ("1h", "one and a half columns", 140), ("2", "double column", 178)], 240, "Arial", 8, 7, 0.5, 1.0,
             "Capital letters and numbers at least 2 mm high once printed."),
    *_family("aip", "AIP (APL, JAP, JCP)", [("1", "single column", 85), ("2", "double column", 170)], 240, "Arial", 8, 7, 0.5, 1.0),
    *_family("elsevier", "Elsevier", [("1", "single column", 90), ("1h", "one and a half columns", 140), ("2", "double column", 190)], 240, "Arial", 8, 7, 0.5, 1.0,
             "Arial, Courier, Times or Symbol; type of about 7 pt once printed."),
    *_family("rsc", "RSC", [("1", "single column", 83), ("2", "double column", 171)], 233, "Arial", 8, 7, 0.5, 1.0),
    *_family("springer", "Springer", [("1", "single column", 84), ("1h", "one and a half columns", 129), ("2", "double column", 174)], 234, "Arial", 8, 7, 0.5, 1.0, "Helvetica or Arial, 8 to 12 pt."),
    *_family("pnas", "PNAS", [("1", "one column", 87), ("1h", "one and a half columns", 114), ("2", "two columns", 178)], 225, "Arial", 7, 6, 0.5, 1.0, "Arial, Helvetica or Times, 6 to 8 pt."),
    *_family("ieee", "IEEE", [("1", "one column (3.5 in)", 88.9), ("2", "two columns (7.16 in)", 181.9)], 216, "Times New Roman", 8, 8, 0.5, 1.0, "Times New Roman, Helvetica or Arial, 8 to 10 pt."),
    Preset("slide", "Screen", "a slide (16:9)", 254, 143, 143, "Arial", 16, 14, 1.0, 2.0, "For a talk: large type, thick lines."),
    Preset("thesis", "Report", "a page of a thesis", 150, 100, 230, "Arial", 10, 9, 0.6, 1.2),
]


def described() -> dict[str, Any]:
    return {"checked": CHECKED, "presets": [asdict(p) for p in PRESETS]}
