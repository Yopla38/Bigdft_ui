"""A model as data: components taken from the registry of functions, and their parameters.

    {"components": [
        {"id": "p1", "fn": "gaussian",   "params": {"center": {"value": 5.0}, "sigma": {"value": 1, "min": 0}}},
        {"id": "bg", "fn": "linear",     "params": {"slope": {"value": 0, "vary": false}}},
        {"id": "u",  "fn": "expression", "expr": "a*exp(-x/tau)", "params": {"a": {"value": 1}, "tau": {"value": 2}}}]}

The model is the sum of its components. A parameter is called ``<id>_<name>``
(``p1_center``); it has a starting value, may be fixed (``vary: false``),
bounded (``min``, ``max``) or tied to others by an expression
(``"expr": "p1_center + 3.2"``). A parameter the description leaves out takes
the default of the registry.

The same model can be written on one line (``write``) and read back (``parse``):

    p1:gaussian(center~5, sigma~1, sigma>0) + bg:linear(slope=0) + u:{a*exp(-x/tau)}(a~1, tau~2)

``~`` is a starting value, ``=`` a fixed one, ``>`` and ``<`` bounds; after a
``|`` come the ties: ``p2:gaussian(sigma~1 | center = p1_center + 3.2)``.
"""
from __future__ import annotations

import math
import re
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

import lmfit
import numpy as np
from scipy import signal

from . import functions
from .expressions import FUNCTIONS, Expression, ExpressionError

Array = Any
ID = re.compile(r"^[a-z][a-z0-9]{0,7}$")
NAME = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,23}$")
MAX_COMPONENTS = 40
_SYMBOLS = {name: entry[0] for name, entry in FUNCTIONS.items()}       # what a tie between parameters may call


class ModelError(ValueError):
    """What is wrong with the description of a model, said for the person who wrote it."""


@dataclass(frozen=True)
class Setting:
    value: float
    vary: bool = True
    min: float | None = None
    max: float | None = None
    expr: str = ""


@dataclass(frozen=True)
class Component:
    id: str
    fn: str
    names: tuple[str, ...]
    settings: dict[str, Setting]
    function: functions.Function | None = None
    expression: Expression | None = None

    def call(self, x: Array, values: dict[str, float]) -> Array:
        if self.function is not None:
            with np.errstate(all="ignore"):
                return np.asarray(self.function.call(x, **values), float)
        assert self.expression is not None
        out = self.expression({**values, "x": x})
        return np.zeros_like(x, dtype=float) + out


def _number(value: Any, what: str, *, optional: bool = False) -> float | None:
    if value is None and optional:
        return None
    if isinstance(value, bool) or not isinstance(value, int | float) or not math.isfinite(value):
        raise ModelError(f"{what} is not a number")
    return float(value)


def _setting(raw: Any, default: functions.Param | None, what: str) -> Setting:
    if raw is None:
        raw = {}
    if isinstance(raw, int | float) and not isinstance(raw, bool):
        raw = {"value": raw}
    if not isinstance(raw, dict) or set(raw) - {"value", "vary", "min", "max", "expr"}:
        raise ModelError(f"{what}: a parameter is a number, or value, vary, min, max, expr")
    value = _number(raw.get("value", default.default if default else 1.0), f"the value of {what}")
    low = _number(raw.get("min", default.min if default else None), f"the lower bound of {what}", optional=True)
    high = _number(raw.get("max", default.max if default else None), f"the upper bound of {what}", optional=True)
    if low is not None and high is not None and low >= high:
        raise ModelError(f"{what}: its lower bound is not below its upper bound")
    expr = raw.get("expr") or ""
    if not isinstance(expr, str) or not isinstance(raw.get("vary", True), bool):
        raise ModelError(f"{what}: vary is true or false, expr is text")
    assert value is not None
    return Setting(value, bool(raw.get("vary", True)), low, high, expr.strip())


class Model:
    """A model that was checked: it can make its parameters and compute itself."""

    def __init__(self, spec: Any) -> None:
        if not isinstance(spec, dict) or not isinstance(spec.get("components"), list) or not spec["components"]:
            raise ModelError("a model needs at least one component")
        if len(spec["components"]) > MAX_COMPONENTS:
            raise ModelError(f"a model holds {MAX_COMPONENTS} components at most")
        self.components: list[Component] = []
        seen: set[str] = set()
        for raw in spec["components"]:
            if not isinstance(raw, dict) or not isinstance(raw.get("id"), str) or not ID.match(raw["id"]):
                raise ModelError("a component needs an id: a lower-case letter, then up to seven letters or digits (p1, bg)")
            cid = raw["id"]
            if cid in seen:
                raise ModelError(f"two components are called {cid}")
            seen.add(cid)
            given = raw.get("params") or {}
            if not isinstance(given, dict):
                raise ModelError(f"{cid}: params is a table of parameters")
            if raw.get("fn") == "expression":
                try:
                    expression = Expression(str(raw.get("expr") or ""))
                except ExpressionError as exc:
                    raise ModelError(f"{cid}: {exc}") from None
                names = tuple(n for n in expression.names if n != "x")
                bad = [n for n in names if not NAME.match(n)]
                if bad:
                    raise ModelError(f"{cid}: {bad[0]!r} cannot be the name of a parameter")
                if len(names) > 24:
                    raise ModelError(f"{cid}: an expression holds 24 parameters at most")
                defaults: dict[str, functions.Param | None] = dict.fromkeys(names)
                self._known(cid, given, names)
                self.components.append(Component(cid, "expression", names, {n: _setting(given.get(n), defaults[n], f"{cid}_{n}") for n in names},
                                                 expression=expression))
            else:
                try:
                    function = functions.get(str(raw.get("fn")))
                except ValueError as exc:
                    raise ModelError(f"{cid}: {exc}") from None
                by_name = {p.name: p for p in function.params}
                self._known(cid, given, function.names)
                self.components.append(Component(cid, function.name, function.names,
                                                 {n: _setting(given.get(n), by_name[n], f"{cid}_{n}") for n in function.names}, function=function))
        self.names: list[str] = [f"{c.id}_{n}" for c in self.components for n in c.names]
        responses = [c for c in self.components if c.function is not None and c.function.kind == "response"]
        if len(responses) > 1:
            raise ModelError("a model holds one instrument response at most")
        self.response: Component | None = responses[0] if responses else None       # with it, the other components are convolved with a measured response
        if self.response is not None and not any(self.convolved(c) for c in self.components):
            raise ModelError("an instrument response needs something to act on: add a decay, a peak… beside it")
        allowed = set(self.names)
        for full, setting in self.settings():
            if setting.expr:
                try:
                    tie = Expression(setting.expr, allowed=allowed)
                except ExpressionError as exc:
                    raise ModelError(f"the tie of {full}: {exc}") from None
                if full in tie.names:
                    raise ModelError(f"{full} is tied to itself")

    @staticmethod
    def _known(cid: str, given: dict[str, Any], names: tuple[str, ...]) -> None:
        unknown = [n for n in given if n not in names]
        if unknown:
            raise ModelError(f"{cid} has no parameter called {unknown[0]}" + (": it has " + ", ".join(names) if names else ""))

    def settings(self) -> Iterator[tuple[str, Setting]]:
        for c in self.components:
            for n in c.names:
                yield f"{c.id}_{n}", c.settings[n]

    # ------------------------------------------------------------------ parameters
    def parameters(self, suffix: str = "", into: lmfit.Parameters | None = None, tied_to: dict[str, str] | None = None) -> lmfit.Parameters:
        """The parameters of the model as lmfit keeps them. ``suffix`` tells the copies of one model apart (one per dataset)."""
        params = into if into is not None else lmfit.Parameters(usersyms=_SYMBOLS)
        for full, s in self.settings():
            params.add(full + suffix, value=s.value, vary=s.vary and not s.expr, min=-np.inf if s.min is None else s.min, max=np.inf if s.max is None else s.max)
        for full, s in self.settings():
            if tied_to and full in tied_to:
                params[full + suffix].set(expr=tied_to[full])
            elif s.expr:
                params[full + suffix].set(expr=self._renamed(s.expr, suffix))
        return params

    def _renamed(self, expr: str, suffix: str) -> str:
        text = expr.replace("^", "**")
        if not suffix:
            return text
        known = set(self.names)
        return re.sub(r"[A-Za-z_][A-Za-z0-9_]*", lambda m: m.group(0) + suffix if m.group(0) in known else m.group(0), text)

    def values(self, params: lmfit.Parameters, component: Component, suffix: str = "") -> dict[str, float]:
        return {n: float(params[f"{component.id}_{n}{suffix}"].value) for n in component.names}

    # ------------------------------------------------------------------ computing
    def convolved(self, c: Component) -> bool:
        """Whether the instrument's response acts on this component: on all but the baselines, which are added as they are."""
        return self.response is not None and c is not self.response and not (c.function is not None and c.function.kind == "baseline")

    def parts(self, params: lmfit.Parameters, x: Array, suffix: str = "", kernel: Array | None = None) -> dict[str, Array]:
        """Each component at ``x``.

        With ``kernel`` (the response of the instrument on the same x, evenly spaced and of unit sum) the components are
        what the instrument shows of them: f counted from the response, Σ R(x_k − shift) f(x_j − x_k) over k ≤ j.
        """
        if kernel is None or self.response is None:
            return {c.id: c.call(x, self.values(params, c, suffix)) for c in self.components}
        shift = float(params[f"{self.response.id}_shift{suffix}"].value)
        seen = np.interp(x - shift, x, kernel, left=0.0, right=0.0)
        since = x - x[0]
        out: dict[str, Array] = {}
        for c in self.components:
            values = self.values(params, c, suffix)
            if self.convolved(c):
                out[c.id] = signal.fftconvolve(seen, c.call(since, values))[: len(x)]
            else:
                out[c.id] = c.call(x, values)
        return out

    def evaluate(self, params: lmfit.Parameters, x: Array, suffix: str = "", kernel: Array | None = None) -> Array:
        total = np.zeros_like(x, dtype=float)
        for part in self.parts(params, x, suffix, kernel).values():
            total = total + part
        return total

    def derived(self, params: lmfit.Parameters, suffix: str = "") -> list[tuple[str, str, str, float]]:
        """(name, component, label, value) of each quantity the registry derives from the parameters."""
        out = []
        for c in self.components:
            if c.function is None:
                continue
            values = self.values(params, c, suffix)
            for d in c.function.derived:
                try:
                    value = float(d.of(values))
                except (ValueError, ZeroDivisionError, OverflowError):
                    value = math.nan
                out.append((f"{c.id}_{d.name}", c.id, d.label, value))
        return out

    def tex(self) -> list[dict[str, str]]:
        """Each component as an equation: the registry's, or the expression typeset."""
        out = []
        for c in self.components:
            if c.function is not None:
                out.append({"id": c.id, "tex": c.function.tex.replace("y =", f"y_{{\\mathrm{{{c.id}}}}} =", 1)})
            else:
                assert c.expression is not None
                out.append({"id": c.id, "tex": f"y_{{\\mathrm{{{c.id}}}}} = " + c.expression.tex()})
        return out


# ── the model on one line ────────────────────────────────────────────────────
def _fmt(value: float) -> str:
    return f"{value:.10g}"


def write(spec: Any) -> str:
    """The model as one line of text. ``parse(write(spec))`` describes the same model."""
    model = Model(spec)
    parts = []
    for c in model.components:
        settings, ties = [], []
        default = {p.name: p for p in c.function.params} if c.function else {}
        for n in c.names:
            s, d = c.settings[n], default.get(n)
            if s.expr:
                ties.append(f"{n} = {s.expr}")
                continue
            settings.append(f"{n}{'~' if s.vary else '='}{_fmt(s.value)}")
            if s.min is not None and (d is None or s.min != d.min):
                settings.append(f"{n}>{_fmt(s.min)}")
            if s.max is not None and (d is None or s.max != d.max):
                settings.append(f"{n}<{_fmt(s.max)}")
        assert c.function is not None or c.expression is not None
        head = c.fn if c.function else "{" + (c.expression.text if c.expression else "") + "}"
        parts.append(f"{c.id}:{head}(" + ", ".join(settings) + (" | " + ", ".join(ties) if ties else "") + ")")
    return " + ".join(parts)


def _split(text: str, separator: str) -> list[str]:
    """Split at ``separator`` where no parenthesis or brace is open."""
    parts, depth, start = [], 0, 0
    for i, ch in enumerate(text):
        if ch in "({":
            depth += 1
        elif ch in ")}":
            depth -= 1
            if depth < 0:
                raise ModelError("a parenthesis is closed that was never opened")
        elif ch == separator and depth == 0:
            parts.append(text[start:i])
            start = i + 1
    if depth:
        raise ModelError("a parenthesis is not closed")
    return parts + [text[start:]]


_HEAD = re.compile(r"^\s*([a-z][a-z0-9]{0,7})\s*:\s*(?:([a-z][a-z0-9_]*)|\{(.*)\})\s*(?:\((.*)\))?\s*$", re.S)
_SET = re.compile(r"^([A-Za-z][A-Za-z0-9_]*)\s*([~=<>])\s*([-+0-9.eE]+|inf|-inf)$")


def parse(text: str) -> dict[str, Any]:
    """Read a model written on one line."""
    if not text or not text.strip():
        raise ModelError("the model is empty")
    components = []
    for piece in _split(text, "+"):
        head = _HEAD.match(piece)
        if not head:
            raise ModelError(f"“{piece.strip()[:60]}” is not written as name:function(parameters)")
        cid, fn, expr, inside = head.groups()
        component: dict[str, Any] = {"id": cid, "fn": fn or "expression", "params": {}}
        if expr is not None:
            component["expr"] = expr.strip()
        params: dict[str, dict[str, Any]] = component["params"]
        settings, _, ties = (inside or "").partition("|")
        for item in filter(None, (s.strip() for s in _split(settings, ","))):
            m = _SET.match(item)
            if not m:
                raise ModelError(f"{cid}: “{item}” is not a setting. Write center~5 (start), center=5 (fixed), sigma>0, sigma<3")
            name, sign, number = m.groups()
            try:
                value = float(number)
            except ValueError:
                raise ModelError(f"{cid}: {number} is not a number") from None
            entry = params.setdefault(name, {})
            if sign in "~=":
                entry["value"], entry["vary"] = value, sign == "~"
            elif math.isfinite(value):
                entry["min" if sign == ">" else "max"] = value
        for item in filter(None, (s.strip() for s in _split(ties, ","))):
            name, equals, expression = item.partition("=")
            if not equals or not NAME.match(name.strip()):
                raise ModelError(f"{cid}: “{item}” is not a tie. Write center = p1_center + 3")
            params.setdefault(name.strip(), {})["expr"] = expression.strip()
        components.append(component)
    spec = {"components": components}
    Model(spec)
    return spec


def normalised(spec: Any) -> dict[str, Any]:
    """The description with every parameter written out: what the page shows and edits."""
    model = Model(spec)
    params = model.parameters()          # a tied parameter shows the value its tie gives it
    return {"components": [{"id": c.id, "fn": c.fn, **({"expr": c.expression.text} if c.expression else {}),
                            "params": {n: {"value": float(params[f"{c.id}_{n}"].value) if s.expr else s.value, "vary": s.vary and not s.expr, "min": s.min, "max": s.max,
                                           "expr": s.expr} for n, s in c.settings.items()}}
                           for c in model.components]}
