"""A figure as data, drawn into a file a journal accepts: PDF, EPS, TIFF, PNG.

The page lays a figure out itself (``page/js/plot.js``): where the axes are,
which ticks, where each label sits. What it sends here is the result, a list of
things to draw at given places on a page of a given size:

    {"width": 89, "height": 64, "background": "#ffffff", "font": "Arial", "items": [
        {"t": "line",  "paths": [[x0, y0, x1, y1, …]], "stroke": "#000000", "width": 0.5, "dash": null, "clip": [x, y, w, h]},
        {"t": "poly",  "pts": [...], "fill": "#0072b2", "opacity": 0.2},
        {"t": "marks", "pts": [...], "size": 3, "circle": true, "fill": "#ffffff", "stroke": "#0072b2", "width": 0.5},
        {"t": "text",  "x": 44, "y": 60, "runs": [{"s": "E"}, {"s": "F", "v": -1}, {"s": " (eV)"}], "size": 8, "anchor": "middle"}]}

Sizes are in millimetres for the page, in points for everything on it, y
downwards from the top-left corner: the units of the page's own SVG. So the
file holds what was on screen, at the size asked, and this module decides
nothing about the figure. It draws with matplotlib, used as a pen: text is
kept as text, with its font embedded (TrueType, type 42), which is what
journals ask of a vector figure.

A font the server does not hold is replaced by one of the same metrics when
there is one (Arial → Liberation Sans), and the answer says so.
"""
from __future__ import annotations

import io
import math
import re
import threading
from dataclasses import dataclass, field
from typing import Any

import matplotlib

matplotlib.use("Agg")

from matplotlib import font_manager, rc_context  # noqa: E402
from matplotlib.backends.backend_agg import FigureCanvasAgg  # noqa: E402
from matplotlib.figure import Figure  # noqa: E402
from matplotlib.lines import Line2D  # noqa: E402
from matplotlib.patches import Polygon, Rectangle  # noqa: E402
from matplotlib.path import Path  # noqa: E402

MM = 72 / 25.4              # points in a millimetre
FORMATS: dict[str, dict[str, str]] = {
    "pdf": {"label": "PDF: vector, fonts embedded", "mime": "application/pdf", "extension": "pdf"},
    "eps": {"label": "EPS: vector, for older workflows (no transparency)", "mime": "application/postscript", "extension": "eps"},
    "tiff": {"label": "TIFF: pixels, LZW compressed", "mime": "image/tiff", "extension": "tiff"},
    "png": {"label": "PNG: pixels", "mime": "image/png", "extension": "png"},
    "svg": {"label": "SVG: vector, text kept as text", "mime": "image/svg+xml", "extension": "svg"},
}
# what a figure asks for → the fonts that can stand for it, the best first. The second ones have the metrics of the first.
FAMILIES: dict[str, list[str]] = {
    "Arial": ["Arial", "Liberation Sans", "Arimo", "Helvetica", "Nimbus Sans", "TeX Gyre Heros", "DejaVu Sans"],
    "Helvetica": ["Helvetica", "Nimbus Sans", "TeX Gyre Heros", "Arial", "Liberation Sans", "Arimo", "DejaVu Sans"],
    "Times New Roman": ["Times New Roman", "Liberation Serif", "Tinos", "Nimbus Roman", "TeX Gyre Termes", "DejaVu Serif"],
    "DejaVu Sans": ["DejaVu Sans"],
}
SAME_METRICS = {("Arial", "Liberation Sans"), ("Arial", "Arimo"), ("Helvetica", "Nimbus Sans"), ("Helvetica", "TeX Gyre Heros"),
                ("Times New Roman", "Liberation Serif"), ("Times New Roman", "Tinos"), ("Times New Roman", "Nimbus Roman")}
COLOR = re.compile(r"^#[0-9a-fA-F]{6}$")
MAX_ITEMS, MAX_NUMBERS, MAX_SIDE = 50_000, 6_000_000, 1000.0
_lock = threading.Lock()            # matplotlib's settings are global: one figure is drawn at a time


class FigureError(ValueError):
    """Why a figure could not be drawn."""


@dataclass
class Made:
    data: bytes
    width: float            # mm
    height: float
    font: str               # the font the file holds
    notes: list[str] = field(default_factory=list)


def _installed(family: str) -> bool:
    try:
        font_manager.findfont(font_manager.FontProperties(family=family), fallback_to_default=False)
        return True
    except ValueError:
        return False


def resolve_font(asked: str) -> tuple[str, str]:
    """(the font used, what to say about it) for the font a figure asks for."""
    for candidate in FAMILIES.get(asked, FAMILIES["Arial"]):
        if _installed(candidate):
            if candidate == asked:
                return candidate, ""
            same = (asked, candidate) in SAME_METRICS
            return candidate, f"{asked} is not installed on the server: the file holds {candidate}" + (", which has the same metrics." if same else ": widths of text differ slightly.")
    return "DejaVu Sans", f"{asked} is not installed on the server: the file holds DejaVu Sans."


def fonts() -> list[dict[str, str]]:
    """The fonts a figure can ask for, and what each becomes on this server."""
    return [{"name": name, "used": resolve_font(name)[0], "note": resolve_font(name)[1]} for name in FAMILIES]


# ── reading the list ─────────────────────────────────────────────────────────
def _number(value: Any, what: str, low: float = -1e7, high: float = 1e7) -> float:
    if isinstance(value, bool) or not isinstance(value, int | float) or not math.isfinite(value) or not low <= value <= high:
        raise FigureError(f"{what} is not a usable number")
    return float(value)


def _colour(value: Any, what: str, none: bool = False) -> str | None:
    if none and (value is None or value == "none"):
        return None
    if not isinstance(value, str) or not COLOR.match(value):
        raise FigureError(f"{what} is not a colour written #rrggbb")
    return value


def _points(values: Any, what: str, count: list[int]) -> list[tuple[float, float]]:
    if not isinstance(values, list) or len(values) % 2:
        raise FigureError(f"{what} is not a list of x, y pairs")
    count[0] += len(values)
    if count[0] > MAX_NUMBERS:
        raise FigureError("the figure holds too many points to be drawn here")
    out = []
    for i in range(0, len(values), 2):
        a, b = values[i], values[i + 1]
        if isinstance(a, bool) or isinstance(b, bool) or not isinstance(a, int | float) or not isinstance(b, int | float) or not (math.isfinite(a) and math.isfinite(b)):
            raise FigureError(f"{what} holds something that is not a number")
        out.append((float(a), float(b)))
    return out


def _blend(colour: str, background: str, opacity: float) -> str:
    """The colour seen through `opacity` on the background: for a format without transparency."""
    c, b = (int(colour[i:i + 2], 16) for i in (1, 3, 5)), (int(background[i:i + 2], 16) for i in (1, 3, 5))
    return "#" + "".join(f"{round(x * opacity + y * (1 - opacity)):02x}" for x, y in zip(c, b, strict=True))


_ESCAPE = str.maketrans({"\\": r"\backslash ", "{": r"\{", "}": r"\}", "$": r"\$", "#": r"\#", "%": r"\%", "&": r"\&", "_": r"\_", "^": r"\^{}", "~": r"\sim ", " ": r"\ ",
                         "−": "-", "–": "-"})


def _mathtext(runs: list[dict[str, Any]]) -> str:
    """Text with superscripts and subscripts as matplotlib writes it: plain text, and the raised parts in upright mathematics."""
    out = []
    for run in runs:
        text, level = str(run.get("s", ""))[:500], run.get("v", 0)
        if not text:
            continue
        if level in (1, -1):
            out.append("$" + ("^" if level == 1 else "_") + r"{\mathrm{" + text.translate(_ESCAPE) + "}}$")
        else:
            out.append(text.replace("\\", "\\\\").replace("$", r"\$"))
    return "".join(out).replace("$$", "")           # a subscript next to a superscript: one piece of mathematics, stacked


def render(figure: Any, fmt: str = "pdf", dpi: int = 600) -> Made:
    """Draw the figure into a file of the format asked. Pixel formats take `dpi`."""
    if fmt not in FORMATS:
        raise FigureError("the format is one of " + ", ".join(FORMATS))
    if not isinstance(figure, dict) or not isinstance(figure.get("items"), list):
        raise FigureError("this is not a figure: it has no list of things to draw")
    width, height = _number(figure.get("width"), "the width", 5, MAX_SIDE), _number(figure.get("height"), "the height", 5, MAX_SIDE)
    if len(figure["items"]) > MAX_ITEMS:
        raise FigureError(f"a figure holds {MAX_ITEMS} things to draw at most")
    if fmt in ("png", "tiff") and max(width, height) / 25.4 * dpi > 20000:
        raise FigureError("at this size and resolution the image would be more than 20 000 pixels wide: lower the resolution")
    background = _colour(figure.get("background", "#ffffff"), "the background") or "#ffffff"
    family, said = resolve_font(str(figure.get("font", "Arial")))
    notes = [said] if said else []
    flat = fmt == "eps"
    if flat and any(isinstance(i, dict) and i.get("opacity", 1) != 1 for i in figure["items"]):
        notes.append("EPS has no transparency: the transparent parts were drawn in the colour they show on the background.")

    settings = {"font.family": [family], "pdf.fonttype": 42, "ps.fonttype": 42, "svg.fonttype": "none", "text.usetex": False, "mathtext.fontset": "custom",
                "mathtext.rm": family, "mathtext.it": f"{family}:italic", "mathtext.bf": f"{family}:bold", "mathtext.cal": family, "mathtext.sf": family, "mathtext.tt": family,
                "mathtext.default": "rm", "mathtext.fallback": "cm",
                "path.simplify": False, "lines.scale_dashes": False, "savefig.transparent": False, "axes.unicode_minus": True}
    with _lock, rc_context(settings):
        fig = Figure(figsize=(width / 25.4, height / 25.4), facecolor=background)
        FigureCanvasAgg(fig)
        ax = fig.add_axes((0, 0, 1, 1))
        ax.set_xlim(0, width * MM)
        ax.set_ylim(height * MM, 0)            # y downwards, as on the page
        ax.set_axis_off()
        count = [0]
        for order, item in enumerate(figure["items"]):
            if not isinstance(item, dict):
                raise FigureError("a thing to draw is not described")
            _draw(ax, item, order, count, background if flat else None)
        buffer = io.BytesIO()
        extra: dict[str, Any] = {"dpi": dpi} if fmt in ("png", "tiff") else {}
        if fmt == "tiff":
            extra["pil_kwargs"] = {"compression": "tiff_lzw"}
        if fmt in ("pdf", "eps"):
            extra["metadata"] = {"Creator": "Asymille"}
            if fmt == "pdf":
                extra["metadata"]["CreationDate"] = None          # the same figure gives the same file
        try:
            fig.savefig(buffer, format=fmt, facecolor=background, **extra)
        except Exception as exc:          # a text matplotlib cannot set: said, with the text
            raise FigureError(f"the figure could not be written: {exc}") from None
    return Made(buffer.getvalue(), width, height, family, notes)


def _draw(ax: Any, item: dict[str, Any], order: int, count: list[int], flatten_on: str | None) -> None:
    kind = item.get("t")
    opacity = _number(item.get("opacity", 1), "an opacity", 0, 1)

    def tone(key: str, none: bool = False) -> tuple[str | None, float]:
        colour = _colour(item.get(key, "#000000" if not none else None), f"the {key} of a {kind}", none)
        if colour is not None and flatten_on is not None and opacity < 1:
            return _blend(colour, flatten_on, opacity), 1.0
        return colour, opacity

    clip = None
    if item.get("clip") is not None:
        c = item["clip"]
        if not isinstance(c, list) or len(c) != 4:
            raise FigureError("a clip is x, y, width, height")
        clip = Rectangle((_number(c[0], "a clip"), _number(c[1], "a clip")), _number(c[2], "a clip"), _number(c[3], "a clip"), transform=ax.transData)
    made: list[Any] = []
    if kind == "line":
        stroke, alpha = tone("stroke")
        width = _number(item.get("width", 0.5), "a line width", 0, 50)
        dash = item.get("dash")
        style: Any = "-"
        if dash:
            if not isinstance(dash, list) or len(dash) % 2 or len(dash) > 8:
                raise FigureError("a dash is a list of lengths, drawn and skipped")
            style = (0, tuple(_number(d, "a dash", 0.01, 1000) for d in dash))
        for path in item.get("paths") or []:
            pts = _points(path, "a line", count)
            if len(pts) > 1:
                made.append(Line2D([p[0] for p in pts], [p[1] for p in pts], color=stroke, linewidth=width, linestyle=style, alpha=alpha, dash_capstyle="butt",
                                   solid_capstyle="round" if item.get("cap") == "round" else "butt", solid_joinstyle="round" if item.get("join") == "round" else "miter"))
    elif kind == "poly":
        fill, alpha = tone("fill", none=True)
        stroke = _colour(item.get("stroke"), "the stroke of a shape", none=True)
        pts = _points(item.get("pts"), "a shape", count)
        if len(pts) > 2:
            made.append(Polygon(pts, closed=True, facecolor=fill or "none", edgecolor=stroke or "none", linewidth=_number(item.get("width", 0), "a line width", 0, 50) if stroke else 0,
                                alpha=alpha, joinstyle="miter"))
    elif kind == "marks":
        fill, alpha = tone("fill", none=True)
        stroke = _colour(item.get("stroke"), "the stroke of a symbol", none=True)
        if stroke is not None and flatten_on is not None and opacity < 1:
            stroke = _blend(stroke, flatten_on, opacity)
        pts = _points(item.get("pts"), "symbols", count)
        size = _number(item.get("size", 3), "the size of a symbol", 0.05, 200)
        edge = _number(item.get("width", 0.5), "a line width", 0, 50)
        if item.get("circle"):
            marker: Any = "o"
        elif item.get("verts"):
            marker = Path([(_number(v[0], "a symbol", -1, 1), -_number(v[1], "a symbol", -1, 1)) for v in item["verts"]] + [(0.0, 0.0)],
                          [Path.MOVETO] + [Path.LINETO] * (len(item["verts"]) - 1) + [Path.CLOSEPOLY])
        elif item.get("strokes"):
            verts, codes = [], []
            for s in item["strokes"]:
                verts += [(_number(s[0], "a symbol", -1, 1), -_number(s[1], "a symbol", -1, 1)), (_number(s[2], "a symbol", -1, 1), -_number(s[3], "a symbol", -1, 1))]
                codes += [Path.MOVETO, Path.LINETO]
            marker, fill = Path(verts, codes), None
        else:
            raise FigureError("a symbol has no shape")
        if pts:
            # matplotlib scales a custom symbol so that its farthest coordinate is half the size: the page draws its shapes within ±0.5 for that
            made.append(Line2D([p[0] for p in pts], [p[1] for p in pts], linestyle="none", marker=marker, markersize=size, markerfacecolor=fill or "none",
                               markeredgecolor=stroke or "none", markeredgewidth=edge if stroke else 0, alpha=alpha))
    elif kind == "text":
        colour, alpha = tone("color")
        runs = item.get("runs")
        if not isinstance(runs, list) or len(runs) > 200:
            raise FigureError("a text is a list of runs")
        text = _mathtext([r for r in runs if isinstance(r, dict)])
        if text:
            anchor = {"start": "left", "middle": "center", "end": "right"}.get(str(item.get("anchor", "start")), "left")
            made.append(ax.text(_number(item.get("x"), "the place of a text"), _number(item.get("y"), "the place of a text"), text, fontsize=_number(item.get("size", 8), "a type size", 1, 400),
                                color=colour, alpha=alpha, ha=anchor, va="baseline", rotation=-_number(item.get("rotate", 0), "a rotation", -360, 360), rotation_mode="anchor",
                                fontweight="bold" if item.get("weight") == "bold" else "normal", fontstyle="italic" if item.get("style") == "italic" else "normal"))
            made[-1].set_zorder(order)
            return
    else:
        raise FigureError(f"{kind!r} is not something this can draw")
    for artist in made:
        artist.set_zorder(order)
        ax.add_artist(artist)
        if clip is not None:
            artist.set_clip_path(clip)
