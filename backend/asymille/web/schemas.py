"""What the API accepts and answers. A field that is not named here is refused.

A project is a document the page writes (``page/js/model.js``: ``serialize`` and
``restore``). Its skeleton is described here, so that a save that is not a
project is refused with the name of what is wrong; a field added to
``serialize`` must be added here. The parts only the page reads (how a figure
is styled, the last result of a fit, what was on screen) are kept as they are.
"""
from __future__ import annotations

import json
from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue, StringConstraints, field_validator


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


Ident = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9]{0,11}$")]
Title = Annotated[str, StringConstraints(min_length=1, max_length=80)]
Text = Annotated[str, StringConstraints(max_length=2000)]
Cell = float | Annotated[str, StringConstraints(max_length=200)] | None
Numbers = Annotated[list[float | None], Field(max_length=500_000)]
Role = Literal["x", "y", "yerr", "xerr", "label", "none"]


class Column(Strict):
    id: Ident
    name: Annotated[str, StringConstraints(min_length=1, max_length=24)]            # the short name formulas use: A, B, Energy
    title: Annotated[str, StringConstraints(max_length=120)] = ""                   # the long name, as an axis would write it
    unit: Annotated[str, StringConstraints(max_length=40)] = ""
    role: Role = "y"
    formula: Text = ""
    comment: Text = ""
    values: Annotated[list[Cell], Field(max_length=500_000)] = []
    made: dict[str, JsonValue] | None = None                                       # the operation that computed it, with its values: what a series repeats on each file


class Sheet(Strict):
    id: Ident
    name: Title
    columns: Annotated[list[Column], Field(max_length=200)] = []
    source: Text = ""                                                              # where its data came from: a file, an operation

    @field_validator("columns")
    @classmethod
    def _distinct(cls, columns: list[Column]) -> list[Column]:
        if len({c.id for c in columns}) != len(columns):
            raise ValueError("two columns have the same id")
        return columns


class Graph(Strict):
    id: Ident
    name: Title
    figure: dict[str, JsonValue]                                                   # how it is drawn: page/js/plot.js


class Fit(Strict):
    id: Ident
    name: Title
    sheet: Ident | None = None
    x: Ident | None = None
    y: Ident | None = None
    yerr: Ident | None = None
    xerr: Ident | None = None                                                      # the errors of x, counted with those of y
    response: Ident | None = None                                                  # the measured response of the instrument, for a model that holds one
    more: Annotated[list[Ident], Field(max_length=64)] = []                        # the other y columns fitted with the same model
    mode: Literal["single", "batch", "global"] = "single"
    shared: Annotated[list[Annotated[str, StringConstraints(max_length=40)]], Field(max_length=400)] = []
    limits: Annotated[list[float | None], Field(min_length=2, max_length=2)] | None = None
    model: dict[str, JsonValue] = {}
    options: dict[str, JsonValue] = {}
    result: dict[str, JsonValue] | None = None                                     # what the last fit gave
    results: dict[Ident, dict[str, JsonValue]] = {}                                # for several columns: what each gave
    stale: bool = False                                                            # the data or the model changed since


class Variable(Strict):
    name: Annotated[str, StringConstraints(max_length=60)] = ""
    unit: Annotated[str, StringConstraints(max_length=40)] = ""


class Member(Strict):
    """One file of a series: its sheet, the value of what was varied, and what its fit gave."""

    sheet: Ident
    value: float | None = None
    state: Literal["todo", "running", "done", "failed"] = "todo"
    message: Text = ""
    result: dict[str, JsonValue] | None = None


class FileSeries(Strict):
    """The same fit on many files."""

    id: Ident
    name: Title
    fit: Ident
    variable: Variable = Variable()
    members: Annotated[list[Member], Field(max_length=500)] = []
    chain: bool = True                                                             # each file starts from what its neighbour gave
    results: Ident | None = None                                                   # the sheet its table of results is written in
    graph: Ident | None = None                                                     # the graph that shows one file at a time
    current: Ident | None = None
    ran: Annotated[str, StringConstraints(max_length=40)] = ""                     # a mark of the model it was last run with


class LogLine(Strict):
    at: Annotated[str, StringConstraints(max_length=40)]
    text: Text


class ProjectDocument(Strict):
    version: Literal[1]
    name: Title
    seq: int = Field(0, ge=0, le=9_999_999)
    sheets: Annotated[list[Sheet], Field(max_length=100)] = []
    graphs: Annotated[list[Graph], Field(max_length=100)] = []
    fits: Annotated[list[Fit], Field(max_length=200)] = []
    series: Annotated[list[FileSeries], Field(max_length=50)] = []
    log: Annotated[list[LogLine], Field(max_length=500)] = []
    view: dict[str, JsonValue] = {}

    @field_validator("sheets", "graphs", "fits", "series")
    @classmethod
    def _distinct(cls, items: list[Any]) -> list[Any]:
        if len({i.id for i in items}) != len(items):
            raise ValueError("two of them have the same id")
        return items


class FormatIn(Strict):
    """A format of a figure kept under a name. What it holds is the page's: the server keeps it and gives it back, to its owner only."""

    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=60)]
    format: dict[Annotated[str, StringConstraints(max_length=40)], JsonValue]

    @field_validator("format")
    @classmethod
    def _small(cls, value: dict[str, Any]) -> dict[str, Any]:
        if len(json.dumps(value)) > 8000:
            raise ValueError("a format holds a size, a font and a few widths: this is too large to be one")
        return value


class FormatOut(Out):
    id: int
    name: str
    format: dict[str, Any]
    updated_at: datetime


class ProjectCreate(Strict):
    document: ProjectDocument


class ProjectUpdate(Strict):
    document: ProjectDocument
    revision: int = Field(ge=1)                                                    # the revision this change was made from


class ProjectSummary(Out):
    id: int
    name: str
    sheet_count: int
    graph_count: int
    fit_count: int
    revision: int
    created_at: datetime
    updated_at: datetime


class ProjectOut(ProjectSummary):
    document: dict[str, Any]


# ── computing ────────────────────────────────────────────────────────────────
class FitOptions(Strict):
    method: Literal["leastsq", "least_squares", "nelder", "powell", "differential_evolution"] = "leastsq"
    weights: Literal["none", "instrumental", "statistical", "relative"] = "none"
    absolute_sigma: bool = False
    loss: Literal["linear", "soft_l1", "huber", "cauchy"] = "linear"
    max_nfev: int | None = Field(None, ge=10, le=200_000)
    level: float = Field(0.95, ge=0.5, lt=1)
    points: int = Field(800, ge=50, le=20_000)
    log_x: bool = False
    intervals: bool = False


Limits2 = Annotated[list[float | None], Field(min_length=2, max_length=2)] | None


class FitIn(Strict):
    x: Numbers
    y: Numbers
    sigma: Numbers | None = None
    sigma_x: Numbers | None = None
    response: Numbers | None = None
    model: dict[str, JsonValue]
    limits: Limits2 = None
    options: FitOptions = FitOptions()


class Dataset(Strict):
    x: Numbers
    y: Numbers
    sigma: Numbers | None = None
    sigma_x: Numbers | None = None
    response: Numbers | None = None


class GlobalFitIn(Strict):
    datasets: Annotated[list[Dataset], Field(min_length=1, max_length=64)]
    model: dict[str, JsonValue]
    shared: Annotated[list[Annotated[str, StringConstraints(max_length=40)]], Field(max_length=400)] = []
    limits: Limits2 = None
    options: FitOptions = FitOptions()


class GuessIn(Strict):
    x: Numbers
    y: Numbers
    model: dict[str, JsonValue]
    limits: Limits2 = None


class EvaluateIn(Strict):
    model: dict[str, JsonValue]
    x: Annotated[list[float], Field(min_length=1, max_length=200_000)]
    response: Annotated[list[float], Field(max_length=200_000)] | None = None      # for a model that holds a measured response: on the same x, which is then the x of the data


class Compared(Strict):
    name: Annotated[str, StringConstraints(min_length=1, max_length=80)]
    ndata: int = Field(ge=2, le=200_000)
    nvarys: int = Field(ge=1, le=1000)
    chisqr: float = Field(gt=0)


class CompareIn(Strict):
    fits: Annotated[list[Compared], Field(min_length=2, max_length=12)]


class ModelText(Strict):
    text: Annotated[str, StringConstraints(max_length=20_000)]


class ModelIn(Strict):
    model: dict[str, JsonValue]


class AnalyseIn(Strict):
    operation: Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9_]{0,39}$")]
    args: dict[Annotated[str, StringConstraints(max_length=40)], bool | int | float | str] = {}
    x: Numbers
    y: Numbers
    x2: Numbers | None = None
    y2: Numbers | None = None


class FigureIn(Strict):
    figure: dict[str, JsonValue]                                                   # a figure as page/js/plot.js resolves it: asymille/figures.py reads it
    format: Literal["pdf", "svg", "eps", "png", "tiff"] = "pdf"
    dpi: int = Field(600, ge=72, le=1200)
    name: Annotated[str, StringConstraints(max_length=80)] = "figure"
