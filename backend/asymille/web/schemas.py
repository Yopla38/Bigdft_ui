"""What the API accepts and answers. A field that is not named here is refused.

A project is a document the page writes (``page/js/model.js``: ``serialize`` and
``restore``). Its skeleton is described here, so that a save that is not a
project is refused with the name of what is wrong; a field added to
``serialize`` must be added here. The parts only the page reads (how a figure
is styled, the last result of a fit, what was on screen) are kept as they are.
"""
from __future__ import annotations

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
    more: Annotated[list[Ident], Field(max_length=64)] = []                        # the other y columns fitted with the same model
    mode: Literal["single", "batch", "global"] = "single"
    shared: Annotated[list[Annotated[str, StringConstraints(max_length=40)]], Field(max_length=400)] = []
    limits: Annotated[list[float | None], Field(min_length=2, max_length=2)] | None = None
    model: dict[str, JsonValue] = {}
    options: dict[str, JsonValue] = {}
    result: dict[str, JsonValue] | None = None                                     # what the last fit gave
    results: dict[Ident, dict[str, JsonValue]] = {}                                # for several columns: what each gave
    stale: bool = False                                                            # the data or the model changed since


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
    log: Annotated[list[LogLine], Field(max_length=500)] = []
    view: dict[str, JsonValue] = {}

    @field_validator("sheets", "graphs", "fits")
    @classmethod
    def _distinct(cls, items: list[Any]) -> list[Any]:
        if len({i.id for i in items}) != len(items):
            raise ValueError("two of them have the same id")
        return items


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
    model: dict[str, JsonValue]
    limits: Limits2 = None
    options: FitOptions = FitOptions()


class Dataset(Strict):
    x: Numbers
    y: Numbers
    sigma: Numbers | None = None


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
    x: Annotated[list[float], Field(min_length=1, max_length=20_000)]


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
