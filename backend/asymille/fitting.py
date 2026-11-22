"""Fitting a model to data, and saying how good the fit is.

    fit(x, y, spec)                      one dataset
    fit_global(datasets, spec, shared)   several datasets, the parameters named in `shared` common to all
    evaluate(spec, x)                    the model at its starting values, to look at before fitting
    guess(x, y, spec)                    starting values read from the data
    compare(fits)                        which of several models of the same points the data support

Two things a dataset may bring besides x, y and the errors of y. Errors of x (``sigma_x``): each point is then
counted by its distance to the curve in units of its two error bars (orthogonal distance regression), not by its
vertical distance. A measured response of the instrument (``response``, on the same x): a model that holds the
``response`` component is convolved with it before it is compared with the data.

Minimising is lmfit's (and scipy's behind it). What is added here is what a
person publishing a fit needs around it: the statistics (χ², reduced χ², R²,
AIC, BIC), the uncertainty of every parameter and of every quantity derived
from them (width, height…), the correlations, the confidence band of the
curve, and warnings when a number should not be trusted.

A result is a plain dictionary (JSON): the page shows it and keeps it in the
project. Arrays that are not finite are written as ``null``.
"""
from __future__ import annotations

import math
import time
from dataclasses import dataclass
from typing import Any

import lmfit
import numpy as np
from scipy import signal, stats

from .models import Model, ModelError, normalised

Array = Any

METHODS = {
    "leastsq": "Levenberg–Marquardt",
    "least_squares": "Trust region reflective",
    "nelder": "Nelder–Mead simplex, then Levenberg–Marquardt",
    "powell": "Powell, then Levenberg–Marquardt",
    "differential_evolution": "Differential evolution (a global search), then Levenberg–Marquardt",
}
WEIGHTS = {
    "none": "every point counts the same",
    "instrumental": "1/σ², σ read from the error column",
    "statistical": "1/y: counting (Poisson) noise",
    "relative": "1/y²: a constant relative error",
}
LOSSES = ("linear", "soft_l1", "huber", "cauchy")
MAX_POINTS = 200_000
MAX_DATASETS = 64
TOLERANCE = 1e-13            # relative change of χ² and of the parameters at which a descent stops
NO_RESPONSE = "the model holds a measured instrument response: choose the column that holds it, under Data"


class FitError(ValueError):
    """Why a fit could not be made, said for the person who asked for it."""


@dataclass
class Data:
    x: Array
    y: Array
    w: Array                    # what each residual is multiplied by: 1/σ
    given: int                  # how many points were given, before the range and the cleaning
    sx: Array | None = None     # the error of each x, when the fit counts them
    grid: Array | None = None   # with a measured response: every x of the measurement, evenly spaced,
    kernel: Array | None = None  # the response on it, of unit sum,
    index: Array | None = None  # and where the fitted points are in it


def _response(xs: Array, response: Any) -> tuple[Array, Array, Array]:
    """The rows that make the grid of a measured response, the grid, and the response on it with a sum of 1."""
    try:
        r = np.asarray(response, float)
    except (TypeError, ValueError):
        raise FitError("the response must be numbers") from None
    if r.shape != xs.shape:
        raise FitError("the response column must be as long as the data")
    rows = np.isfinite(xs)
    grid = xs[rows]
    if len(grid) < 3:
        raise FitError("a measured response needs at least three values of x")
    steps = np.diff(grid)
    mean = float(np.mean(steps))
    if not (mean > 0 and np.all(steps > 0) and float(np.max(np.abs(steps - mean))) <= 0.02 * mean):
        raise FitError(f"with a measured response, x must increase by even steps: here they go from {float(np.min(steps)):.6g} to {float(np.max(steps)):.6g}")
    kernel = np.where(np.isfinite(r[rows]), r[rows], 0.0)
    total = float(np.sum(kernel))
    if not total > 0:
        raise FitError("the response column holds nothing: its sum is not positive")
    return rows, grid, kernel / total


def prepare(x: Any, y: Any, sigma: Any = None, weights: str = "none", limits: Any = None, sigma_x: Any = None, response: Any = None) -> Data:
    """The points that are fitted: finite, inside the range, with a usable weight."""
    if weights not in WEIGHTS:
        raise FitError(f"weights are one of {', '.join(WEIGHTS)}")
    try:
        xs, ys = np.asarray(x, float), np.asarray(y, float)
    except (TypeError, ValueError):
        raise FitError("x and y must be numbers") from None
    if xs.ndim != 1 or xs.shape != ys.shape:
        raise FitError("x and y must be two columns of the same length")
    if len(xs) > MAX_POINTS:
        raise FitError(f"a fit takes {MAX_POINTS} points at most: this dataset has {len(xs)}")
    keep = np.isfinite(xs) & np.isfinite(ys)
    if limits is not None:
        low, high = (limits[0], limits[1]) if len(limits) == 2 else (None, None)
        if low is not None and high is not None and low > high:
            low, high = high, low
        if low is not None:
            keep &= xs >= low
        if high is not None:
            keep &= xs <= high
    w = np.ones_like(xs)
    if weights == "instrumental":
        if sigma is None:
            raise FitError("instrumental weights need an error column")
        s = np.asarray(sigma, float)
        if s.shape != xs.shape:
            raise FitError("the error column must be as long as the data")
        usable = np.isfinite(s) & (s > 0)
        if not np.any(keep & usable):
            raise FitError("the error column holds no positive value")
        keep &= usable
        w[keep] = 1 / s[keep]
    elif weights in ("statistical", "relative"):
        size = np.abs(ys)
        positive = size[keep & (size > 0)]
        if not len(positive):
            raise FitError(f"{weights} weights need values of y that are not zero")
        size = np.where(size > 0, size, positive.min())
        w = 1 / np.sqrt(size) if weights == "statistical" else 1 / size
    data = Data(xs[keep], ys[keep], w[keep], len(xs))
    if sigma_x is not None:
        if weights != "instrumental":
            raise FitError("errors on x are counted together with errors on y: choose the weights 1/σ² and an error column for y")
        if response is not None:
            raise FitError("errors on x cannot be counted with a measured response: x is then the grid of the instrument")
        sx = np.asarray(sigma_x, float)
        if sx.shape != xs.shape:
            raise FitError("the error column of x must be as long as the data")
        usable = np.isfinite(sx) & (sx >= 0)
        if not np.any(keep & usable):
            raise FitError("the error column of x holds no usable value")
        keep &= usable
        data = Data(xs[keep], ys[keep], w[keep], len(xs), sx=sx[keep])
    if response is not None:
        rows, data.grid, data.kernel = _response(xs, response)
        data.index = (np.cumsum(rows) - 1)[keep]
    return data


def _at(model: Model, params: Any, d: Data, suffix: str = "") -> Array:
    """The model at the points of a dataset, through the response of the instrument when there is one."""
    if d.kernel is None:
        return model.evaluate(params, d.x, suffix)
    return model.evaluate(params, d.grid, suffix, d.kernel)[d.index]


ODR_STEPS = 12              # how many times, at most, the foot of each point on the curve is refined


def _residual(model: Model, params: Any, d: Data, suffix: str = "") -> Array:
    """Model minus data in units of the error bars: what a fit makes small.

    With errors on x, each point is moved along x by δ to the place of the curve nearest to it in units of its two
    error bars, and counts by that distance: sqrt[((y − f(x + δ))/σy)² + (δ/σx)²]. δ is found by Gauss–Newton steps
    from δ = 0, whose first is the “effective variance” σy² + f′² σx² (exact for a straight line). A step that
    does not bring a point nearer is shortened, then refused: on a curved model a full step can overshoot.
    """
    if d.sx is None:
        return (_at(model, params, d, suffix) - d.y) * d.w
    sy, sx = 1 / d.w, d.sx
    h = (float(np.ptp(d.x)) or max(abs(float(d.x[0])), 1.0)) * 1e-6

    def distance(delta: Array) -> tuple[Array, Array]:
        there = model.evaluate(params, d.x + delta, suffix)
        return there, ((there - d.y) / sy) ** 2 + np.divide(delta, sx, out=np.zeros_like(delta), where=sx > 0) ** 2

    with np.errstate(all="ignore"):
        delta = np.zeros_like(d.x)
        here, cost = distance(delta)
        for _ in range(ODR_STEPS):
            slope = (model.evaluate(params, d.x + delta + h, suffix) - model.evaluate(params, d.x + delta - h, suffix)) / (2 * h)
            slope = np.where(np.isfinite(slope), slope, 0.0)
            step = sx ** 2 * slope * (d.y - here + slope * delta) / (sy ** 2 + slope ** 2 * sx ** 2) - delta
            if np.all(np.abs(step) <= 1e-10 * (sx + h)):
                break
            for part in (1.0, 0.25):
                trial = delta + part * step
                there, new = distance(trial)
                nearer = new < cost                               # false where the model is not defined
                delta, here, cost = np.where(nearer, trial, delta), np.where(nearer, there, here), np.where(nearer, new, cost)
                if np.all(nearer | (step == 0)):
                    break
        return np.sign(here - d.y) * np.sqrt(cost)


def _list(values: Array) -> list[float | None]:
    return [float(v) if math.isfinite(v) else None for v in np.asarray(values, float).tolist()]


def _num(value: Any) -> float | None:
    return float(value) if value is not None and math.isfinite(float(value)) else None


def _model(spec: Any) -> Model:
    try:
        return Model(spec)
    except ModelError as exc:
        raise FitError(str(exc)) from None


# ── before fitting: look at the model, read starting values from the data ────
def _shown(model: Model, parts: dict[str, Array]) -> dict[str, list[float | None]]:
    """The components that are curves to draw: the response of the instrument is not one."""
    return {cid: _list(part) for cid, part in parts.items() if model.response is None or cid != model.response.id}


def evaluate(spec: Any, x: Any, response: Any = None) -> dict[str, Any]:
    """The model and each of its components at the values of its description.

    A model that holds a measured response needs it (``response``, on ``x``), and ``x`` is then the x of the data.
    """
    model = _model(spec)
    xs = np.asarray(x, float)
    params = model.parameters()
    kernel = None
    if model.response is not None:
        if response is None:
            raise FitError(NO_RESPONSE)
        rows, xs, kernel = _response(xs, response)
    return {"x": _list(xs), "y": _list(model.evaluate(params, xs, "", kernel)), "components": _shown(model, model.parts(params, xs, "", kernel))}


def find_peaks(x: Array, y: Array, count: int) -> list[tuple[float, float, float]]:
    """The `count` most prominent peaks of a curve as (centre, height above the background, width at half maximum), from left to right."""
    order = np.argsort(x, kind="stable")
    xs, ys = np.asarray(x, float)[order], np.asarray(y, float)[order]
    if len(xs) < 5 or count < 1:
        return []
    window = max(5, (len(xs) // 100) | 1)
    smooth = signal.savgol_filter(ys, window, 2) if len(xs) > window else ys
    found, properties = signal.find_peaks(smooth, prominence=0)
    if not len(found):
        found, properties = np.array([int(np.argmax(smooth))]), {"prominences": np.array([float(np.ptp(smooth))])}
    best = found[np.argsort(properties["prominences"])[::-1][:count]]
    widths = signal.peak_widths(smooth, best, rel_height=0.5)
    step = np.gradient(xs)
    peaks = []
    for i, index in enumerate(best):
        height = float(signal.peak_prominences(smooth, [index])[0][0]) or float(np.ptp(ys)) or 1.0
        width = float(widths[0][i] * abs(step[index])) or float(np.ptp(xs)) / 20 or 1.0
        peaks.append((float(xs[index]), height, width))
    return sorted(peaks)


def guess(x: Any, y: Any, spec: Any, limits: Any = None) -> dict[str, Any]:
    """The description of the model with starting values read from the data.

    Baselines are read first and removed; the peaks of the model then take the most
    prominent peaks of what is left, from left to right; the other curves read the
    data their own way. A fixed or tied parameter keeps its value.
    """
    model = _model(spec)
    data = prepare(x, y, None, "none", limits)
    if len(data.x) < 3:
        raise FitError("too few points to read starting values from")
    described = normalised(spec)
    rest = data.y.copy()
    found: dict[str, dict[str, float]] = {}
    peaks = [c for c in model.components if c.function is not None and c.function.kind == "peak"]
    others = [c for c in model.components if c.function is not None and c.function.kind != "peak"]
    for c in sorted(others, key=lambda c: c.function is not None and c.function.kind != "baseline"):
        assert c.function is not None
        if c.function.guess is None:
            continue
        seen_x = data.x
        if c.function.kind == "baseline" and peaks:              # under peaks, a baseline is read from the lowest tenth of the points
            low = rest <= np.quantile(rest, 0.25)
            values = c.function.guess(data.x[low], rest[low]) if np.count_nonzero(low) > len(c.names) else c.function.guess(data.x, rest)
        elif model.convolved(c):                                  # through a response, a curve is read after the maximum and counted from it
            top = int(np.argmax(rest))
            top = top if len(rest) - top > 3 else 0
            seen_x = np.where(data.x >= data.x[top], data.x - data.x[top], np.nan)
            values = c.function.guess(seen_x[top:], rest[top:])
        else:
            values = c.function.guess(data.x, rest)
        found[c.id] = values
        merged = {**{n: s.value for n, s in c.settings.items()}, **values}
        rest = rest - np.nan_to_num(c.call(seen_x, merged))
    if peaks:
        seen = find_peaks(data.x, rest, len(peaks))
        for c, (center, height, width) in zip(peaks, seen + seen[-1:] * (len(peaks) - len(seen)) if seen else [], strict=False):
            assert c.function is not None and c.function.from_peak is not None
            found[c.id] = c.function.from_peak(center, height, width)
    for component in described["components"]:
        for name, value in found.get(component["id"], {}).items():
            setting = component["params"].get(name)
            if setting is None or not setting["vary"] or setting["expr"] or not math.isfinite(value):
                continue
            if setting["min"] is not None:
                value = max(value, setting["min"] + (1e-9 if setting["min"] == 0 else 0))
            if setting["max"] is not None:
                value = min(value, setting["max"])
            setting["value"] = float(f"{value:.6g}")
    return described


# ── fitting ──────────────────────────────────────────────────────────────────
@dataclass
class Options:
    method: str = "leastsq"
    weights: str = "none"
    absolute_sigma: bool = False        # with instrumental weights: trust σ as they are, do not rescale the uncertainties by χ²
    loss: str = "linear"                # least_squares only: a loss that gives less weight to outliers
    max_nfev: int | None = None
    timeout: float = 30.0               # seconds; the fit is stopped after that
    level: float = 0.95                 # of the confidence band
    points: int = 800                   # of the curve drawn
    log_x: bool = False                 # the curve is drawn on points spread evenly in log(x)
    intervals: bool = False             # confidence intervals by profiling χ² (slower)

    def checked(self) -> Options:
        if self.method not in METHODS:
            raise FitError(f"the method is one of {', '.join(METHODS)}")
        if self.loss not in LOSSES:
            raise FitError(f"the loss is one of {', '.join(LOSSES)}")
        if not 0.5 <= self.level < 1:
            raise FitError("the confidence level is between 0.5 and 1")
        self.points = int(min(max(self.points, 50), 20000))
        return self


def fit(x: Any, y: Any, spec: Any, *, sigma: Any = None, sigma_x: Any = None, response: Any = None, limits: Any = None, **options: Any) -> dict[str, Any]:
    """Fit one dataset. See ``Options`` for what can be chosen."""
    opt = Options(**options).checked()
    out = _solve([prepare(x, y, sigma, opt.weights, limits, sigma_x, response)], _model(spec), [], opt)
    return {**out["datasets"][0], **{k: v for k, v in out.items() if k != "datasets"}}


def fit_global(datasets: list[dict[str, Any]], spec: Any, shared: list[str], *, limits: Any = None, **options: Any) -> dict[str, Any]:
    """Fit several datasets at once with one model. The parameters named in ``shared`` have one value for all of them."""
    opt = Options(**options).checked()
    if not 1 <= len(datasets) <= MAX_DATASETS:
        raise FitError(f"between 1 and {MAX_DATASETS} datasets")
    model = _model(spec)
    unknown = [n for n in shared if n not in model.names]
    if unknown:
        raise FitError(f"{unknown[0]} is not a parameter of the model")
    return _solve([prepare(d.get("x"), d.get("y"), d.get("sigma"), opt.weights, limits, d.get("sigma_x"), d.get("response")) for d in datasets], model, list(shared), opt)


def _solve(sets: list[Data], model: Model, shared: list[str], opt: Options) -> dict[str, Any]:
    suffixes = [""] if len(sets) == 1 else [f"__{k}" for k in range(len(sets))]
    params = model.parameters(suffixes[0])
    for suffix in suffixes[1:]:
        model.parameters(suffix, into=params, tied_to={name: name + suffixes[0] for name in shared})
    varying = [n for n, p in params.items() if p.vary]
    total = sum(len(d.x) for d in sets)
    if model.response is not None and any(d.kernel is None for d in sets):
        raise FitError(NO_RESPONSE)
    if not varying:
        raise FitError("every parameter is fixed or tied: there is nothing to fit")
    for k, d in enumerate(sets):
        if len(d.x) < 2:
            raise FitError(("dataset " + str(k + 1) + ": " if len(sets) > 1 else "") + "fewer than two usable points" + (" in the fit range" if d.given > len(d.x) else ""))
    if total <= len(varying):
        raise FitError(f"{len(varying)} parameters vary and only {total} points are fitted: fix some parameters or widen the range")
    if opt.method == "differential_evolution":
        open_ended = [n for n in varying if not (math.isfinite(params[n].min) and math.isfinite(params[n].max))]
        if open_ended:
            raise FitError("a global search needs a lower and an upper bound on every varying parameter: " + ", ".join(open_ended[:6]) + " have none")

    def residual(p: lmfit.Parameters) -> Array:
        parts = [_residual(model, p, d, s) for d, s in zip(sets, suffixes, strict=True)]
        r = np.concatenate(parts)
        return np.where(np.isfinite(r), r, 1e150)                 # a point where the model is not defined counts as very far

    start = residual(params)
    if np.count_nonzero(start >= 1e149) == len(start):
        raise FitError("the model is not defined anywhere on the data at its starting values: check them, and the range of x")

    began = time.monotonic()
    stopped = {"by": ""}

    def watch(p: Any, iteration: int, resid: Any, *args: Any, **kws: Any) -> bool | None:
        if iteration > 3 and time.monotonic() - began > opt.timeout:
            stopped["by"] = f"stopped after {opt.timeout:g} s"
            return True
        return None

    scalar = opt.method not in ("leastsq", "least_squares")
    budget = min(opt.max_nfev or (5000 if scalar else 400) * (len(varying) + 1), 200_000)
    scale = not (opt.absolute_sigma and opt.weights == "instrumental")
    spent = 0

    def run(method: str, start_from: lmfit.Parameters, **kws: Any) -> tuple[Any, Any]:
        nonlocal spent
        minimizer = lmfit.Minimizer(residual, start_from, iter_cb=watch, max_nfev=max(budget - spent, 10), scale_covar=scale, nan_policy="propagate")
        found = minimizer.minimize(method=method, **kws)
        spent += int(found.nfev)
        return minimizer, found

    def better(old: tuple[Any, Any], new: tuple[Any, Any]) -> tuple[Any, Any]:
        """A further step is kept when it did not climb, and did not lose the uncertainties."""
        return new if new[1].chisqr <= old[1].chisqr * (1 + 1e-9) and (new[1].errorbars or not old[1].errorbars) and new[1].success else old

    # The last step of every fit is a descent with a Jacobian taken by central differences, to tolerances tighter than
    # scipy's defaults: on NIST's harder problems that brings the parameters from 1e-5 to 1e-7 of the certified values.
    fine = {"jac": "3-point", "ftol": TOLERANCE, "xtol": TOLERANCE, "gtol": None}        # gtol is absolute: it would stop at once on small numbers
    try:
        if opt.method == "least_squares" and opt.loss != "linear":
            # outliers are judged against the scatter of a plain fit: the median of its residuals, as a standard deviation
            kept = run("leastsq", params)
            if not stopped["by"]:
                r = np.asarray(kept[1].residual, float)
                kept = run("least_squares", kept[1].params, loss=opt.loss, f_scale=float(np.median(np.abs(r - np.median(r))) * 1.4826) or 1.0, **fine)
        else:
            first: dict[str, Any] = {}
            if opt.method == "least_squares":
                first = {"ftol": TOLERANCE, "xtol": TOLERANCE, "gtol": None}
            elif opt.method == "differential_evolution":
                # the same search every time it is asked for: a result that can be found again
                first = {"seed": 0, "tol": 1e-7, "popsize": 20}
            kept = run(opt.method, params, **first)
            if scalar and not stopped["by"]:
                # a simplex or a global search finds the valley; Levenberg–Marquardt finishes the descent
                kept = better(kept, run("leastsq", kept[1].params))
            if not stopped["by"] and kept[1].success:
                kept = better(kept, run("least_squares", kept[1].params, **fine))
    except lmfit.minimizer.AbortFitException:
        raise FitError((stopped["by"] or "the fit was stopped") + " before it gave a result") from None
    except (ValueError, FloatingPointError, np.linalg.LinAlgError) as exc:
        raise FitError(f"the fit failed: {exc}") from None
    minimizer, result = kept
    result.nfev = spent

    out = _common(result, model, sets, opt, stopped["by"])
    intervals = _intervals(minimizer, result, opt) if opt.intervals else None
    out["datasets"] = [_describe(result, model, d, s, opt, intervals) for d, s in zip(sets, suffixes, strict=True)]
    out["shared"] = shared
    if len(sets) > 1:
        out["report"] = lmfit.fit_report(result, show_correl=False)
    else:
        out["datasets"][0]["report"] = lmfit.fit_report(result, min_correl=0.5)
    return out


def _common(result: Any, model: Model, sets: list[Data], opt: Options, stopped: str) -> dict[str, Any]:
    """What is said of the whole fit: how it ended and how good it is."""
    r = np.asarray(result.residual, float)
    weighted_mean = sum(float(np.sum(d.w ** 2 * d.y)) for d in sets) / sum(float(np.sum(d.w ** 2)) for d in sets)
    total = sum(float(np.sum((d.w * (d.y - weighted_mean)) ** 2)) for d in sets)
    chisqr = float(np.sum(r ** 2))
    n, p = int(result.ndata), int(result.nvarys)
    rsquared = 1 - chisqr / total if total > 0 else math.nan
    hit_limit = not result.success or bool(getattr(result, "aborted", False))
    message = stopped or str(result.message).strip().rstrip(".")
    warnings: list[str] = []
    if stopped or hit_limit:
        warnings.append("The fit did not converge (" + message + "): the values below are where it stopped, not a minimum.")
    if not result.errorbars:
        warnings.append("The uncertainties could not be estimated: the model does not depend on some parameter near this solution, or a parameter sits on a bound.")
    for name in result.var_names:
        prm = result.params[name]
        span = (prm.max - prm.min) if math.isfinite(prm.max - prm.min) else max(abs(prm.value), 1.0)
        if (math.isfinite(prm.min) and abs(prm.value - prm.min) <= 1e-9 * span) or (math.isfinite(prm.max) and abs(prm.value - prm.max) <= 1e-9 * span):
            warnings.append(f"{name} ended on its bound ({prm.value:.6g}): its uncertainty means little, and the bound may be shaping the fit.")
        elif prm.stderr is not None and prm.value != 0 and prm.stderr > abs(prm.value):
            warnings.append(f"{name} is not determined by the data: its uncertainty ({prm.stderr:.3g}) is larger than its value ({prm.value:.3g}).")
    out: dict[str, Any] = {
        "success": not (stopped or hit_limit), "message": message, "method": opt.method, "method_label": METHODS[opt.method], "weights": opt.weights,
        "absolute_sigma": bool(opt.absolute_sigma and opt.weights == "instrumental"), "loss": opt.loss if opt.method == "least_squares" else "linear",
        "nfev": int(result.nfev), "ndata": n, "nvarys": p, "nfree": int(result.nfree),
        "chisqr": _num(chisqr), "redchi": _num(result.redchi), "rsquared": _num(rsquared),
        "adj_rsquared": _num(1 - (1 - rsquared) * (n - 1) / (n - p)) if n > p else None,
        "aic": _num(result.aic), "bic": _num(result.bic), "errorbars": bool(result.errorbars), "warnings": warnings, "p_value": None,
        "x_errors": any(d.sx is not None for d in sets), "response": model.response is not None,
    }
    if opt.weights == "instrumental" and result.nfree > 0:
        # with true error bars χ² follows a χ² law: the probability of a χ² at least this large if the model is right
        out["p_value"] = _num(stats.chi2.sf(chisqr, result.nfree))
        if result.redchi > 3:
            warnings.append(f"Reduced χ² is {result.redchi:.3g}: the model does not describe the data within their error bars, or the error bars are too small.")
        elif result.redchi < 0.2:
            warnings.append(f"Reduced χ² is {result.redchi:.3g}: the error bars are probably too large.")
    if result.errorbars and result.covar is not None:
        sd = np.sqrt(np.diag(result.covar))
        with np.errstate(all="ignore"):
            corr = result.covar / np.outer(sd, sd)
        pairs = [{"a": result.var_names[i], "b": result.var_names[j], "value": float(corr[i, j])}
                 for i in range(len(sd)) for j in range(i + 1, len(sd)) if math.isfinite(corr[i, j])]
        out["correlations"] = sorted(pairs, key=lambda c: -abs(c["value"]))
        for c in out["correlations"]:
            if abs(c["value"]) > 0.995:
                warnings.append(f"{c['a']} and {c['b']} are almost perfectly correlated ({c['value']:+.4f}): the data cannot tell them apart. Fix one, or tie them.")
    else:
        out["correlations"] = []
    return out


def _propagate(result: Any, quantity: Any) -> Array | None:
    """The standard error of a quantity computed from the parameters, by the covariance matrix: sqrt(J C Jᵀ).

    J is taken by finite differences on the varying parameters, the tied ones following them.
    """
    if not result.errorbars or result.covar is None:
        return None
    params = result.params.copy()
    base = np.atleast_1d(np.asarray(quantity(params), float))
    jac = np.zeros((len(base), len(result.var_names)))
    for i, name in enumerate(result.var_names):
        prm = params[name]
        value, err = float(prm.value), prm.stderr
        h = err * 1e-2 if err and math.isfinite(err) and err > 0 else max(abs(value), 1e-8) * 1e-6
        sides = []
        for sign in (1, -1):
            prm.set(value=value + sign * h)
            params.update_constraints()
            if prm.value != value:
                sides.append((float(prm.value), np.atleast_1d(np.asarray(quantity(params), float))))
        prm.set(value=value)
        params.update_constraints()
        if len(sides) == 2:
            jac[:, i] = (sides[0][1] - sides[1][1]) / (sides[0][0] - sides[1][0])
        elif sides:
            jac[:, i] = (sides[0][1] - base) / (sides[0][0] - value)
    with np.errstate(all="ignore"):
        variance = np.einsum("ij,jk,ik->i", jac, result.covar, jac)
    return np.sqrt(np.where(variance >= 0, variance, np.nan))


def _intervals(minimizer: Any, result: Any, opt: Options) -> dict[str, list[float | None]] | None:
    """For each varying parameter, the interval in which χ² stays within what `level` allows: asymmetric when the valley is."""
    if not result.errorbars or len(result.var_names) > 12 or len(result.var_names) < 2:
        return None
    try:
        sigma = float(stats.norm.ppf(0.5 + opt.level / 2))
        found = lmfit.conf_interval(minimizer, result, sigmas=[sigma], maxiter=100)
    except Exception:           # lmfit gives up in several ways when χ² has no clean valley
        return None
    out: dict[str, list[float | None]] = {}
    for name, row in found.items():
        low = [v for s, v in row if s > 0 and v < result.params[name].value]
        high = [v for s, v in row if s > 0 and v > result.params[name].value]
        out[name] = [_num(low[0]) if low else None, _num(high[-1]) if high else None]
    return out


def _describe(result: Any, model: Model, data: Data, suffix: str, opt: Options, intervals: dict[str, list[float | None]] | None) -> dict[str, Any]:
    """What is said of one dataset: its parameters, the curve to draw, its residuals."""
    params = result.params

    def strip(name: str) -> str:
        return name[: -len(suffix)] if suffix else name

    rows = []
    for c in model.components:
        for n in c.names:
            prm = params[f"{c.id}_{n}{suffix}"]
            setting = c.settings[n]
            tied = strip(prm.expr) if prm.expr and not setting.expr and suffix else (setting.expr if prm.expr else "")
            rows.append({"name": f"{c.id}_{n}", "component": c.id, "param": n, "value": _num(prm.value),
                         "stderr": _num(prm.stderr) if prm.vary or prm.expr else None, "vary": bool(prm.vary),
                         "expr": setting.expr, "shared": bool(prm.expr and not setting.expr), "tied": tied, "init": setting.value,
                         "min": _num(prm.min), "max": _num(prm.max), "interval": (intervals or {}).get(f"{c.id}_{n}{suffix}")})
    derived_err = _propagate(result, lambda p: [d[3] for d in model.derived(p, suffix)])
    derived = [{"name": name, "component": cid, "label": label, "value": _num(value), "stderr": _num(derived_err[i]) if derived_err is not None else None}
               for i, (name, cid, label, value) in enumerate(model.derived(params, suffix))]

    low, high = float(np.min(data.x)), float(np.max(data.x))
    if data.kernel is None:
        grid = np.geomspace(low, high, opt.points) if opt.log_x and low > 0 else np.linspace(low, high, opt.points)
        parts = model.parts(params, grid, suffix)

        def drawn(p: Any) -> Array:
            return model.evaluate(p, grid, suffix)
    else:                                   # through a measured response the curve exists where the instrument measured, and nowhere between
        assert data.grid is not None
        inside = (data.grid >= low) & (data.grid <= high)
        grid = data.grid[inside]
        parts = {cid: part[inside] for cid, part in model.parts(params, data.grid, suffix, data.kernel).items()}

        def drawn(p: Any) -> Array:
            return model.evaluate(p, data.grid, suffix, data.kernel)[inside]
    best = drawn(params)
    curve: dict[str, Any] = {"x": _list(grid), "y": _list(best), "components": _shown(model, parts), "band": None, "prediction": None}
    spread = _propagate(result, drawn)
    nfree = max(int(result.nfree), 1)
    if spread is not None:
        t = float(stats.t.ppf(0.5 + opt.level / 2, nfree))
        curve["band"] = {"level": opt.level, "lower": _list(best - t * spread), "upper": _list(best + t * spread)}
        if opt.weights == "none":           # where a new measurement would fall: the band of the curve, widened by the scatter of the points
            wide = np.sqrt(spread ** 2 + float(result.redchi))
            curve["prediction"] = {"level": opt.level, "lower": _list(best - t * wide), "upper": _list(best + t * wide)}
    fitted = _at(model, params, data, suffix)
    residual = data.y - fitted
    counted = -_residual(model, params, data, suffix)           # as the fit counted them: along both axes when x has errors
    return {"params": rows, "derived": derived, "curve": curve, "npoints": int(len(data.x)), "given": data.given,
            "range": [low, high], "rmse": _num(math.sqrt(float(np.mean(residual ** 2)))),
            "residuals": {"x": _list(data.x), "y": _list(residual), "standardised": _list(counted / math.sqrt(float(result.redchi) or 1.0))},
            "fitted": {"x": _list(data.x), "y": _list(fitted)}, "equations": model.tex()}


# ── which model ──────────────────────────────────────────────────────────────
def compare(fits: list[dict[str, Any]]) -> dict[str, Any]:
    """Which of several models, fitted to the same points with the same weights, the data support.

    Each fit is ``{"name", "ndata", "nvarys", "chisqr"}``. Answered: for each, AIC, AICc (the correction for few
    points) and BIC, computed as lmfit does (n ln(χ²/n) + 2k, + k ln n), and its Akaike weight: the share of support
    it has among those compared. For each pair with different numbers of parameters, the F test of the fuller model
    against the simpler one, which means something only when the simpler is a special case of the fuller.
    """
    if not 2 <= len(fits) <= 12:
        raise FitError("between 2 and 12 fits are compared")
    rows: list[dict[str, Any]] = []
    for f in fits:
        try:
            name, n, k, chisqr = str(f["name"]), int(f["ndata"]), int(f["nvarys"]), float(f["chisqr"])
        except (KeyError, TypeError, ValueError):
            raise FitError("a fit to compare is a name, a number of points, a number of fitted parameters and a χ²") from None
        if n != int(fits[0]["ndata"]):
            raise FitError(f"“{name}” was fitted to {n} points and “{fits[0]['name']}” to {int(fits[0]['ndata'])}: only fits of the same points can be compared")
        if not (math.isfinite(chisqr) and chisqr > 0):
            raise FitError(f"the χ² of “{name}” is not a positive number: there is nothing to compare")
        if not 1 <= k < n:
            raise FitError(f"“{name}” has {k} fitted parameters for {n} points: it cannot be compared")
        aic = n * math.log(chisqr / n) + 2 * k
        rows.append({"name": name, "ndata": n, "nvarys": k, "chisqr": chisqr, "aic": aic, "bic": n * math.log(chisqr / n) + k * math.log(n),
                     "aicc": aic + 2 * k * (k + 1) / (n - k - 1) if n - k - 1 > 0 else None})
    by = "aicc" if all(r["aicc"] is not None for r in rows) else "aic"
    lowest = min(r[by] for r in rows)
    for r in rows:
        r["delta"] = r[by] - lowest
    total = sum(math.exp(-r["delta"] / 2) for r in rows)
    for r in rows:
        r["weight"] = math.exp(-r["delta"] / 2) / total
    ranked = sorted(rows, key=lambda r: r["delta"])
    best, second = ranked[0], ranked[1]
    criterion = "ΔAICc" if by == "aicc" else "ΔAIC"
    if second["delta"] < 2:
        said = f"The data do not tell “{best['name']}” from “{second['name']}” ({criterion} = {second['delta']:.2f}, below 2): keep the simpler one unless there is another reason."
    elif second["delta"] < 20:
        said = (f"“{best['name']}” is the one the data support: “{second['name']}” is {math.exp(second['delta'] / 2):.3g} times less likely "
                f"({criterion} = {second['delta']:.2f}{', a small difference' if second['delta'] < 6 else ''}).")
    else:               # beyond 20 the ratio of likelihoods is a number nobody reads, and beyond 1400 not a number at all
        said = f"“{best['name']}” is the one the data support: beside it “{second['name']}” has no support left ({criterion} = {second['delta']:.1f}; above 10 a model is usually set aside)."
    tests = []
    for i, a in enumerate(rows):
        for b in rows[i + 1:]:
            if a["nvarys"] == b["nvarys"]:
                continue
            simple, full = (a, b) if a["nvarys"] < b["nvarys"] else (b, a)
            added, free = full["nvarys"] - simple["nvarys"], full["ndata"] - full["nvarys"]
            if full["chisqr"] >= simple["chisqr"]:
                tests.append({"simpler": simple["name"], "fuller": full["name"], "f": None, "p": None, "df": [added, free],
                              "said": f"“{full['name']}” has {added} more parameter{'s' if added > 1 else ''} than “{simple['name']}” and does not fit better: there is nothing to test."})
                continue
            f_value = ((simple["chisqr"] - full["chisqr"]) / added) / (full["chisqr"] / free)
            p = float(stats.f.sf(f_value, added, free))
            verdict = "more than chance would (p < 0.05)" if p < 0.05 else "no more than chance could (p ≥ 0.05)"
            chance = "= " + format(p, ".3g") if p >= 1e-300 else "< 1e-300"
            tests.append({"simpler": simple["name"], "fuller": full["name"], "f": f_value, "p": p, "df": [added, free],
                          "said": f"F({added}, {free}) = {f_value:.4g}, p {chance}: the {added} more parameter{'s' if added > 1 else ''} of “{full['name']}” improve the fit {verdict}. "
                                  f"This test holds only if “{simple['name']}” is a special case of “{full['name']}”."})
    return {"by": by, "fits": rows, "best": best["name"], "said": said, "tests": tests}
