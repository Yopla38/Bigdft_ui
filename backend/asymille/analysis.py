"""The registry of operations: what can be done to a curve besides fitting it.

Each operation says what a person needs to choose it and to fill its form (a
label, a family, one sentence, its arguments with their bounds) and holds the
function that does it. The page draws its menu and its forms from this registry
(``GET …/operations``): an operation written here needs nothing written there.

    run("smooth_savgol", x, y, {"window": 11, "order": 3})

An operation answers with plain data:

    columns   new columns. With ``"sheet": "same"`` they line up with the rows that were given
              (a row whose x or y was not a number stays empty); with ``"sheet": "new"`` they
              are a table of their own (a spectrum, a list of peaks, an interpolated curve).
    facts     numbers to read: an area, a mean, a slope with its uncertainty.
    note      one sentence saying what was done, with the values used: the page keeps it with
              the columns, and it is what goes in the methods of a paper.

The numerics are scipy's. To add an operation: write its function and register
it with ``O(...)``; ``tests/test_analysis.py`` runs every registered operation.
"""
from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass
from typing import Any

import numpy as np
from scipy import integrate, interpolate, ndimage, signal, sparse, stats
from scipy.sparse.linalg import spsolve

Array = Any
MAX_POINTS = 500_000


class AnalysisError(ValueError):
    """Why an operation could not be done, said for the person who asked for it."""


@dataclass(frozen=True)
class Arg:
    name: str
    label: str
    kind: str                       # int | float | choice | bool
    default: Any
    min: float | None = None
    max: float | None = None
    choices: tuple[tuple[str, str], ...] = ()       # (value, label)
    help: str = ""


@dataclass(frozen=True)
class Operation:
    name: str
    label: str
    family: str
    summary: str
    args: tuple[Arg, ...]
    call: Callable[..., dict[str, Any]]
    second: bool = False            # it takes a second curve (x2, y2)

    def described(self) -> dict[str, Any]:
        return {"name": self.name, "label": self.label, "family": self.family, "summary": self.summary, "second": self.second,
                "args": [{"name": a.name, "label": a.label, "kind": a.kind, "default": a.default, "min": a.min, "max": a.max,
                          "choices": [list(c) for c in a.choices], "help": a.help} for a in self.args]}


REGISTRY: dict[str, Operation] = {}
FAMILIES = ["Smoothing", "Calculus", "Baseline", "Peaks", "Transform", "Spectrum", "Statistics", "Two curves"]


def O(name: str, label: str, family: str, summary: str, args: list[Arg], *, second: bool = False) -> Callable[[Callable[..., dict[str, Any]]], Callable[..., dict[str, Any]]]:  # noqa: E743
    def register(call: Callable[..., dict[str, Any]]) -> Callable[..., dict[str, Any]]:
        assert name not in REGISTRY and family in FAMILIES, name
        REGISTRY[name] = Operation(name, label, family, summary, tuple(args), call, second)
        return call
    return register


def described() -> list[dict[str, Any]]:
    return [o.described() for o in sorted(REGISTRY.values(), key=lambda o: FAMILIES.index(o.family))]


# ── what every operation shares ──────────────────────────────────────────────
@dataclass
class Curve:
    x: Array                        # the usable points, in increasing x
    y: Array
    rows: Array                     # for each of them, the row it came from
    size: int                       # how many rows were given

    def back(self, values: Array) -> list[float | None]:
        """A column as long as what was given, each value on the row of its point."""
        out: list[float | None] = [None] * self.size
        for row, v in zip(self.rows.tolist(), np.asarray(values, float).tolist(), strict=True):
            out[row] = v if math.isfinite(v) else None
        return out

    @property
    def step(self) -> float:
        return float(np.median(np.diff(self.x))) if len(self.x) > 1 else 1.0

    @property
    def even(self) -> bool:
        d = np.diff(self.x)
        return bool(len(d) and np.all(d > 0) and np.ptp(d) <= 1e-6 * abs(self.step) + 1e-300)


def curve(x: Any, y: Any, least: int = 2) -> Curve:
    try:
        xs, ys = np.asarray(x, float), np.asarray(y, float)
    except (TypeError, ValueError):
        raise AnalysisError("the columns must hold numbers") from None
    if xs.ndim != 1 or xs.shape != ys.shape:
        raise AnalysisError("x and y must be two columns of the same length")
    if len(xs) > MAX_POINTS:
        raise AnalysisError(f"an operation takes {MAX_POINTS} points at most")
    rows = np.nonzero(np.isfinite(xs) & np.isfinite(ys))[0]
    rows = rows[np.argsort(xs[rows], kind="stable")]
    if len(rows) < least:
        raise AnalysisError(f"this needs at least {least} points that are numbers: {len(rows)} were given")
    return Curve(xs[rows], ys[rows], rows, len(xs))


def _column(name: str, values: Any, role: str = "y") -> dict[str, Any]:
    listed = values if isinstance(values, list) else [float(v) if math.isfinite(v) else None for v in np.asarray(values, float).tolist()]
    return {"name": name, "role": role, "values": listed}


def _fact(label: str, value: float, error: float | None = None) -> dict[str, Any]:
    return {"label": label, "value": float(value) if math.isfinite(value) else None, "error": float(error) if error is not None and math.isfinite(error) else None}


def _odd(window: int, n: int, least: int = 3) -> int:
    window = int(window) | 1
    if window > n:
        raise AnalysisError(f"a window of {window} points is wider than the curve ({n} points)")
    return max(window, least)


def _g(value: float) -> str:
    return f"{value:.6g}"


def run(name: str, x: Any, y: Any, args: dict[str, Any] | None = None, x2: Any = None, y2: Any = None) -> dict[str, Any]:
    """Do one operation. Arguments left out take their default; a value outside its bounds is refused."""
    operation = REGISTRY.get(name)
    if operation is None:
        raise AnalysisError(f"no operation is called {name!r}")
    given = dict(args or {})
    unknown = [k for k in given if k not in {a.name for a in operation.args}]
    if unknown:
        raise AnalysisError(f"{operation.label} has no argument called {unknown[0]}")
    values: dict[str, Any] = {}
    for a in operation.args:
        v = given.get(a.name, a.default)
        if a.kind == "bool":
            if not isinstance(v, bool):
                raise AnalysisError(f"{a.label}: yes or no")
        elif a.kind == "choice":
            if v not in [c[0] for c in a.choices]:
                raise AnalysisError(f"{a.label}: one of " + ", ".join(c[0] for c in a.choices))
        else:
            if isinstance(v, bool) or not isinstance(v, int | float) or not math.isfinite(v):
                raise AnalysisError(f"{a.label}: a number")
            if a.kind == "int":
                if v != int(v):
                    raise AnalysisError(f"{a.label}: a whole number")
                v = int(v)
            if (a.min is not None and v < a.min) or (a.max is not None and v > a.max):
                raise AnalysisError(f"{a.label}: between {_g(a.min) if a.min is not None else '−∞'} and {_g(a.max) if a.max is not None else '+∞'}")
        values[a.name] = v
    if operation.second:
        if x2 is None or y2 is None:
            raise AnalysisError(f"{operation.label} needs a second curve")
        values["other"] = curve(x2, y2)
    with np.errstate(all="ignore"):
        out = operation.call(curve(x, y), **values)
    return {"operation": name, "sheet": "same", "columns": [], "facts": [], "note": "", **out}


WINDOW = Arg("window", "Window, in points", "int", 11, 3, 10001, help="How many neighbouring points each value is computed from. Odd; an even number is raised by one.")


# ── smoothing ────────────────────────────────────────────────────────────────
@O("smooth_savgol", "Savitzky–Golay", "Smoothing", "Fits a polynomial to each window of points: smooths while keeping the height and width of peaks.",
   [WINDOW, Arg("order", "Order of the polynomial", "int", 3, 0, 9)])
def smooth_savgol(c: Curve, window: int, order: int) -> dict[str, Any]:
    window = _odd(window, len(c.x))
    if order >= window:
        raise AnalysisError("the order of the polynomial must be below the window")
    return {"columns": [_column("Smoothed", c.back(signal.savgol_filter(c.y, window, order)))],
            "note": f"Savitzky–Golay smoothing, window of {window} points, polynomial of order {order}."}


@O("smooth_moving", "Moving average", "Smoothing", "Replaces each value by the mean of its window: the simplest smoothing; it lowers and widens peaks.", [WINDOW])
def smooth_moving(c: Curve, window: int) -> dict[str, Any]:
    window = _odd(window, len(c.x))
    return {"columns": [_column("Smoothed", c.back(ndimage.uniform_filter1d(c.y, window, mode="nearest")))], "note": f"Moving average over {window} points."}


@O("smooth_median", "Median filter", "Smoothing", "Replaces each value by the median of its window: removes spikes and leaves edges sharp.", [WINDOW])
def smooth_median(c: Curve, window: int) -> dict[str, Any]:
    window = _odd(window, len(c.x))
    return {"columns": [_column("Smoothed", c.back(ndimage.median_filter(c.y, window, mode="nearest")))], "note": f"Median filter over {window} points."}


@O("smooth_gaussian", "Gaussian filter", "Smoothing", "Convolves the curve with a Gaussian of the width given.",
   [Arg("sigma", "Standard deviation, in points", "float", 2.0, 0.1, 5000)])
def smooth_gaussian(c: Curve, sigma: float) -> dict[str, Any]:
    return {"columns": [_column("Smoothed", c.back(ndimage.gaussian_filter1d(c.y, sigma, mode="nearest")))], "note": f"Gaussian filter, σ = {_g(sigma)} points."}


@O("fft_filter", "Fourier filter", "Smoothing", "Removes the frequencies above (low-pass) or below (high-pass) a cut-off. Needs evenly spaced x.",
   [Arg("kind", "Keep", "choice", "low", choices=(("low", "low frequencies (smooth)"), ("high", "high frequencies (remove the drift)"))),
    Arg("cutoff", "Cut-off, as a share of the highest frequency", "float", 0.1, 0.0001, 0.9999, help="The highest frequency a sampling can hold is half its rate (Nyquist).")])
def fft_filter(c: Curve, kind: str, cutoff: float) -> dict[str, Any]:
    if not c.even:
        raise AnalysisError("a Fourier filter needs evenly spaced x: interpolate the curve first")
    sos = signal.butter(4, cutoff, btype=kind + "pass", output="sos")
    if len(c.x) <= 3 * (2 * sos.shape[0] + 1):
        raise AnalysisError("too few points for this filter")
    nyquist = 0.5 / c.step
    return {"columns": [_column("Filtered", c.back(signal.sosfiltfilt(sos, c.y)))],
            "note": f"{'Low' if kind == 'low' else 'High'}-pass Butterworth filter of order 4 applied forward and backward (zero phase), cut-off {_g(cutoff * nyquist)} (in 1/unit of x)."}


# ── calculus ─────────────────────────────────────────────────────────────────
@O("differentiate", "Derivative", "Calculus", "dy/dx by central differences, which allow uneven spacing. Smoothing first tames the noise a derivative amplifies.",
   [Arg("order", "Order", "choice", "1", choices=(("1", "first derivative"), ("2", "second derivative"))),
    Arg("window", "Smooth first: Savitzky–Golay window, in points", "int", 0, 0, 10001, help="0: no smoothing. Otherwise a polynomial of order 3 on that many points.")])
def differentiate(c: Curve, order: str, window: int) -> dict[str, Any]:
    if np.any(np.diff(c.x) == 0):
        raise AnalysisError("two points have the same x: a derivative is not defined there")
    y, said = c.y, ""
    if window:
        window = _odd(window, len(c.x), 5)
        y, said = signal.savgol_filter(y, window, 3), f" after Savitzky–Golay smoothing (window {window}, order 3)"
    for _ in range(int(order)):
        y = np.gradient(y, c.x)
    return {"columns": [_column("d2y/dx2" if order == "2" else "dy/dx", c.back(y))], "note": f"{'Second' if order == '2' else 'First'} derivative by central differences{said}."}


@O("integrate", "Integral", "Calculus", "The running integral of y dx by the trapezoid rule, and the total area.",
   [Arg("baseline", "Measure the area above", "choice", "zero", choices=(("zero", "y = 0"), ("ends", "the line joining the two ends"), ("min", "the lowest value")))])
def integrate_(c: Curve, baseline: str) -> dict[str, Any]:
    base = np.zeros_like(c.y)
    if baseline == "ends":
        base = c.y[0] + (c.y[-1] - c.y[0]) * (c.x - c.x[0]) / ((c.x[-1] - c.x[0]) or 1.0)
    elif baseline == "min":
        base = base + float(np.min(c.y))
    y = c.y - base
    running = integrate.cumulative_trapezoid(y, c.x, initial=0.0)
    area = float(running[-1])
    centroid = float(integrate.trapezoid(y * c.x, c.x) / area) if area else math.nan
    return {"columns": [_column("Integral", c.back(running))],
            "facts": [_fact("Area", area), _fact("Centroid (mean x weighted by y)", centroid), _fact("From x", float(c.x[0])), _fact("To x", float(c.x[-1]))],
            "note": "Trapezoid integration above " + {"zero": "y = 0", "ends": "the line joining the first and last points", "min": "the lowest value"}[baseline] + "."}


# ── baseline ─────────────────────────────────────────────────────────────────
def _two(c: Curve, baseline: Array, said: str) -> dict[str, Any]:
    return {"columns": [_column("Baseline", c.back(baseline)), _column("Baseline removed", c.back(c.y - baseline))], "note": said}


@O("baseline_als", "Asymmetric least squares", "Baseline", "A smooth curve that hugs the bottom of the data (Eilers and Boelens, 2005): for peaks on a slowly varying background.",
   [Arg("smoothness", "Smoothness, log₁₀ λ", "float", 5.0, 0.0, 12.0, help="Higher is stiffer. 5 to 7 suits most spectra."),
    Arg("asymmetry", "Asymmetry p", "float", 0.01, 0.0001, 0.5, help="How little the points above the baseline count. 0.001 to 0.05 for peaks pointing up."),
    Arg("flip", "The peaks point down", "bool", False)])
def baseline_als(c: Curve, smoothness: float, asymmetry: float, flip: bool) -> dict[str, Any]:
    y = -c.y if flip else c.y
    n = len(y)
    if n < 5:
        raise AnalysisError("too few points for a baseline")
    d = sparse.diags([1.0, -2.0, 1.0], [0, 1, 2], shape=(n - 2, n), format="csc")
    penalty = (10.0 ** smoothness) * (d.T @ d)
    w, z = np.ones(n), y
    for _ in range(30):
        z = spsolve(sparse.diags(w, format="csc") + penalty, w * y)
        new = np.where(y > z, asymmetry, 1 - asymmetry)
        if np.array_equal(new, w):
            break
        w = new
    return _two(c, -z if flip else z, f"Baseline by asymmetric least squares (Eilers and Boelens 2005), λ = 10^{_g(smoothness)}, p = {_g(asymmetry)}.")


@O("baseline_polynomial", "Polynomial under the peaks", "Baseline",
   "A polynomial fitted again and again to the points that are not peaks, until it passes under them (improved modified polynomial fit, Zhao et al., 2007).",
   [Arg("degree", "Degree", "int", 3, 0, 10), Arg("flip", "The peaks point down", "bool", False)])
def baseline_polynomial(c: Curve, degree: int, flip: bool) -> dict[str, Any]:
    if len(c.x) <= degree + 1:
        raise AnalysisError("too few points for a polynomial of this degree")
    y = -c.y if flip else c.y
    t_all = (c.x - c.x.mean()) / (np.ptp(c.x) or 1.0)       # centred and scaled: the fit stays well conditioned
    t, work = t_all, y.copy()
    previous = 0.0
    coeffs = np.polyfit(t, work, degree)
    for turn in range(500):
        base = np.polyval(coeffs, t)
        scatter = float(np.std(work - base))
        if turn == 0:                                       # the points well above the first fit are peaks: they are left out
            keep = work <= base + scatter
            if np.count_nonzero(keep) > degree + 1:
                t, work, base = t[keep], work[keep], base[keep]
        work = np.minimum(work, base + scatter)
        coeffs = np.polyfit(t, work, degree)
        if scatter == 0 or abs(scatter - previous) / scatter < 1e-3:
            break
        previous = scatter
    base = np.polyval(coeffs, t_all)
    return _two(c, -base if flip else base, f"Baseline: polynomial of degree {degree} fitted iteratively under the data (improved modified polynomial fit, Zhao et al. 2007).")


@O("baseline_line", "Line between the two ends", "Baseline", "The straight line joining the mean of the first points to the mean of the last ones.",
   [Arg("points", "Points averaged at each end", "int", 5, 1, 10000)])
def baseline_line(c: Curve, points: int) -> dict[str, Any]:
    k = min(points, len(c.x) // 2) or 1
    x0, y0, x1, y1 = c.x[:k].mean(), c.y[:k].mean(), c.x[-k:].mean(), c.y[-k:].mean()
    return _two(c, y0 + (y1 - y0) * (c.x - x0) / ((x1 - x0) or 1.0), f"Baseline: the line joining the means of the first and last {k} points.")


# ── peaks ────────────────────────────────────────────────────────────────────
@O("find_peaks", "Find peaks", "Peaks", "Lists the local maxima that stand out: their position, height, prominence, width at half prominence and area.",
   [Arg("prominence", "Smallest prominence, as a share of the range of y", "float", 0.05, 0.0, 1.0, help="How far a peak rises above the higher of the two valleys beside it."),
    Arg("distance", "Smallest distance between two peaks, in points", "int", 1, 1, 100000),
    Arg("window", "Smooth first: Savitzky–Golay window, in points", "int", 0, 0, 10001, help="0: no smoothing."),
    Arg("flip", "Look for minima", "bool", False)])
def find_peaks(c: Curve, prominence: float, distance: int, window: int, flip: bool) -> dict[str, Any]:
    y = -c.y if flip else c.y
    if window:
        y = signal.savgol_filter(y, _odd(window, len(c.x), 5), 3)
    found, prop = signal.find_peaks(y, prominence=prominence * (np.ptp(y) or 1.0), distance=distance)
    widths, _, left, right = signal.peak_widths(y, found, rel_height=0.5)
    position = np.arange(len(c.x), dtype=float)
    xl, xr = np.interp(left, position, c.x), np.interp(right, position, c.x)
    # a peak ends at the valley it shares with its neighbour: scipy's own bases of a tall peak reach over the smaller ones
    valleys = [int(found[i] + np.argmin(y[found[i]:found[i + 1] + 1])) for i in range(len(found) - 1)]
    areas = []
    for i, _index in enumerate(found):
        a = max(int(prop["left_bases"][i]), valleys[i - 1] if i else 0)
        b = min(int(prop["right_bases"][i]), valleys[i] if i < len(valleys) else len(y) - 1)
        floor = np.interp(c.x[a:b + 1], [c.x[a], c.x[b]], [y[a], y[b]])
        areas.append(float(integrate.trapezoid(y[a:b + 1] - floor, c.x[a:b + 1])))
    sign = -1 if flip else 1
    return {"sheet": "new", "title": "Peaks",
            "columns": [_column("Position", c.x[found], "x"), _column("Height", sign * c.y[found]), _column("Prominence", prop["prominences"]),
                        _column("FWHM", xr - xl), _column("Left", xl), _column("Right", xr), _column("Area", np.array(areas))],
            "facts": [_fact("Peaks found", len(found))],
            "note": f"{len(found)} {'minima' if flip else 'peaks'} with a prominence of at least {_g(100 * prominence)} % of the range of y"
                    + (f", {distance} points apart or more" if distance > 1 else "") + ". Width at half prominence; area above the line joining the two valleys."}


# ── transform ────────────────────────────────────────────────────────────────
@O("normalise", "Normalise", "Transform", "Rescales y so that curves can be compared.",
   [Arg("mode", "So that", "choice", "max", choices=(("max", "the maximum is 1"), ("range", "it runs from 0 to 1"), ("area", "the area is 1"), ("zscore", "the mean is 0 and the standard deviation 1"),
                                                      ("first", "the first value is 1")))])
def normalise(c: Curve, mode: str) -> dict[str, Any]:
    if mode == "max":
        scale, shift, said = float(np.max(np.abs(c.y))), 0.0, "divided by its largest absolute value"
    elif mode == "range":
        scale, shift, said = float(np.ptp(c.y)), float(np.min(c.y)), "rescaled to run from 0 to 1"
    elif mode == "area":
        scale, shift, said = float(integrate.trapezoid(c.y, c.x)), 0.0, "divided by its area"
    elif mode == "zscore":
        scale, shift, said = float(np.std(c.y, ddof=1)) if len(c.y) > 1 else 0.0, float(np.mean(c.y)), "centred on its mean and divided by its standard deviation"
    else:
        scale, shift, said = float(c.y[0]), 0.0, "divided by its first value"
    if not scale or not math.isfinite(scale):
        raise AnalysisError("this curve cannot be normalised that way: the value to divide by is zero")
    return {"columns": [_column("Normalised", c.back((c.y - shift) / scale))], "facts": [_fact("Divided by", scale), _fact("After subtracting", shift)], "note": f"y {said} ({_g(scale)})."}


@O("interpolate", "Interpolate", "Transform", "The curve on evenly spaced x: to resample it, or before a Fourier transform.",
   [Arg("method", "Between the points", "choice", "linear", choices=(("linear", "straight lines"), ("pchip", "monotone cubic (PCHIP): no overshoot"), ("cubic", "cubic spline"), ("akima", "Akima spline"))),
    Arg("points", "Number of points", "int", 500, 2, 200000)])
def interpolate_(c: Curve, method: str, points: int) -> dict[str, Any]:
    x, first = np.unique(c.x, return_index=True)
    y = c.y[first]
    if len(x) < (2 if method == "linear" else 4):
        raise AnalysisError("too few distinct x for this interpolation")
    grid = np.linspace(x[0], x[-1], points)
    made = {"linear": lambda: np.interp(grid, x, y), "pchip": lambda: interpolate.PchipInterpolator(x, y)(grid),
            "cubic": lambda: interpolate.CubicSpline(x, y)(grid), "akima": lambda: interpolate.Akima1DInterpolator(x, y)(grid)}[method]()
    names = {"linear": "Linear", "pchip": "Monotone cubic (PCHIP)", "cubic": "Cubic spline", "akima": "Akima spline"}
    return {"sheet": "new", "title": "Interpolated", "columns": [_column("x", grid, "x"), _column("Interpolated", made)],
            "note": f"{names[method]} interpolation on {points} evenly spaced points from {_g(float(x[0]))} to {_g(float(x[-1]))}."}


# ── spectrum ─────────────────────────────────────────────────────────────────
@O("fft", "Fourier transform", "Spectrum", "The amplitude, phase and power of each frequency in the curve. Needs evenly spaced x.",
   [Arg("window", "Window", "choice", "hann", choices=(("none", "none (rectangular)"), ("hann", "Hann"), ("hamming", "Hamming"), ("blackman", "Blackman")),
        help="A window lowers the leakage of a frequency into its neighbours, at the cost of resolution."),
    Arg("detrend", "Remove the mean first", "bool", True)])
def fft(c: Curve, window: str, detrend: bool) -> dict[str, Any]:
    if not c.even:
        raise AnalysisError("a Fourier transform needs evenly spaced x: interpolate the curve first")
    n = len(c.x)
    y = c.y - np.mean(c.y) if detrend else c.y
    w = np.ones(n) if window == "none" else signal.get_window(window, n, fftbins=False)
    spectrum = np.fft.rfft(y * w)
    freq = np.fft.rfftfreq(n, d=c.step)
    amplitude = np.abs(spectrum) / np.sum(w) * 2            # a sine of amplitude A reads A
    amplitude[0] /= 2
    if n % 2 == 0:
        amplitude[-1] /= 2
    top = int(np.argmax(amplitude[1:]) + 1) if len(amplitude) > 1 else 0
    return {"sheet": "new", "title": "Spectrum",
            "columns": [_column("Frequency", freq, "x"), _column("Amplitude", amplitude), _column("Phase (rad)", np.angle(spectrum)), _column("Power", amplitude ** 2 / 2)],
            "facts": [_fact("Strongest frequency", float(freq[top])), _fact("Its amplitude", float(amplitude[top])), _fact("Frequency step", float(freq[1]) if len(freq) > 1 else math.nan),
                      _fact("Highest frequency (Nyquist)", float(freq[-1]))],
            "note": f"Discrete Fourier transform of {n} points spaced by {_g(c.step)}, {'no' if window == 'none' else window.capitalize()} window"
                    + (", mean removed" if detrend else "") + ". Amplitudes are scaled so that a sine of amplitude A reads A."}


# ── statistics ───────────────────────────────────────────────────────────────
@O("describe", "Descriptive statistics", "Statistics", "Count, mean, standard deviation, standard error, quartiles, extremes of y.", [])
def describe(c: Curve) -> dict[str, Any]:
    y, n = c.y, len(c.y)
    sd = float(np.std(y, ddof=1)) if n > 1 else math.nan
    q1, median, q3 = (float(v) for v in np.percentile(y, [25, 50, 75]))
    return {"facts": [_fact("N", n), _fact("Mean", float(np.mean(y)), sd / math.sqrt(n) if n > 1 else None), _fact("Standard deviation", sd), _fact("Standard error of the mean", sd / math.sqrt(n)),
                      _fact("Minimum", float(np.min(y))), _fact("First quartile", q1), _fact("Median", median), _fact("Third quartile", q3), _fact("Maximum", float(np.max(y))),
                      _fact("Sum", float(np.sum(y))), _fact("Skewness", float(stats.skew(y)) if n > 2 else math.nan), _fact("Excess kurtosis", float(stats.kurtosis(y)) if n > 3 else math.nan)],
            "note": f"Statistics of {n} values (standard deviation with n − 1)."}


@O("polyfit", "Linear and polynomial regression", "Statistics", "The least-squares line or polynomial, the uncertainty of each coefficient, R², and for a line the probability that the slope is zero.",
   [Arg("degree", "Degree", "int", 1, 1, 9)])
def polyfit(c: Curve, degree: int) -> dict[str, Any]:
    n = len(c.x)
    if n <= degree + 1:
        raise AnalysisError(f"a polynomial of degree {degree} needs more than {degree + 1} points")
    design = np.vander(c.x, degree + 1, increasing=True)
    coeffs, _, rank, _ = np.linalg.lstsq(design, c.y, rcond=None)
    if rank <= degree:
        raise AnalysisError("the x are not distinct enough for a polynomial of this degree")
    fitted = design @ coeffs
    rss, dof = float(np.sum((c.y - fitted) ** 2)), n - degree - 1
    errors = np.sqrt(np.diag(np.linalg.inv(design.T @ design)) * rss / dof)
    total = float(np.sum((c.y - np.mean(c.y)) ** 2))
    r2 = 1 - rss / total if total else math.nan
    names = ["Intercept", "Slope"] if degree == 1 else [f"c{i} (coefficient of x^{i})" for i in range(degree + 1)]
    facts = [_fact(name, float(v), float(e)) for name, v, e in zip(names, coeffs, errors, strict=True)]
    facts += [_fact("R²", r2), _fact("Adjusted R²", 1 - (1 - r2) * (n - 1) / dof), _fact("Residual standard deviation", math.sqrt(rss / dof)), _fact("Degrees of freedom", dof)]
    if degree == 1:
        facts += [_fact("Pearson r", float(np.corrcoef(c.x, c.y)[0, 1])),
                  _fact("p-value of the slope (two-sided t test)", float(2 * stats.t.sf(abs(coeffs[1] / errors[1]), dof)) if errors[1] else 0.0)]
    return {"columns": [_column("Regression", c.back(fitted)), _column("Residual", c.back(c.y - fitted))], "facts": facts,
            "note": ("Linear regression" if degree == 1 else f"Polynomial regression of degree {degree}") + f" by ordinary least squares on {n} points; uncertainties are standard errors."}


@O("histogram", "Histogram", "Statistics", "How many values of y fall in each bin.",
   [Arg("bins", "Number of bins", "int", 0, 0, 10000, help="0: chosen from the data (Freedman–Diaconis rule)."), Arg("density", "As a probability density", "bool", False)])
def histogram(c: Curve, bins: int, density: bool) -> dict[str, Any]:
    edges = np.histogram_bin_edges(c.y, bins=bins or "fd")
    if len(edges) > 10001:
        edges = np.histogram_bin_edges(c.y, bins=10000)
    counts, edges = np.histogram(c.y, bins=edges, density=density)  # type: ignore[call-overload]
    return {"sheet": "new", "title": "Histogram",
            "columns": [_column("Bin centre", (edges[:-1] + edges[1:]) / 2, "x"), _column("Density" if density else "Count", counts.astype(float)), _column("Bin start", edges[:-1]), _column("Bin end", edges[1:])],
            "facts": [_fact("Bins", len(counts)), _fact("Bin width", float(edges[1] - edges[0]))],
            "note": f"Histogram of {len(c.y)} values in {len(counts)} bins of width {_g(float(edges[1] - edges[0]))}" + ("" if bins else " (Freedman–Diaconis rule)") + "."}


# ── two curves ───────────────────────────────────────────────────────────────
@O("combine", "Combine with another curve", "Two curves", "Subtracts, adds, divides by or multiplies by a second curve, read at the x of the first by linear interpolation.",
   [Arg("operation", "This curve", "choice", "subtract", choices=(("subtract", "minus the other"), ("divide", "divided by the other"), ("add", "plus the other"), ("multiply", "times the other"))),
    Arg("scale", "The other curve is first multiplied by", "float", 1.0)], second=True)
def combine(c: Curve, operation: str, scale: float, other: Curve) -> dict[str, Any]:
    x2, first = np.unique(other.x, return_index=True)
    y2 = np.interp(c.x, x2, other.y[first] * scale, left=np.nan, right=np.nan)       # outside the other curve: no value, not a guess
    out = {"subtract": c.y - y2, "add": c.y + y2, "multiply": c.y * y2, "divide": c.y / np.where(y2 == 0, np.nan, y2)}[operation]
    outside = int(np.count_nonzero(~np.isfinite(y2)))
    name = {"subtract": "Difference", "add": "Sum", "multiply": "Product", "divide": "Ratio"}[operation]
    return {"columns": [_column(name, c.back(out))], "facts": [_fact("Points outside the other curve (left empty)", outside)],
            "note": f"{name} with a second curve" + (f" multiplied by {_g(scale)}" if scale != 1 else "") + ", read at the same x by linear interpolation."}
