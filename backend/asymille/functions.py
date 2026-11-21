"""The registry of fit functions: what a component of a model can be.

Each entry says what a person needs to choose it (a label, a family, its
equation, what each parameter means) and what the engine needs to use it (the
function itself, starting values read from the data, and the quantities derived
from its parameters: width at half maximum, height, …).

The page draws its list of functions from this registry (``GET …/functions``):
nothing about a function is written twice. The line shapes are lmfit's
(``lmfit.lineshapes``), so a Gaussian here has the parameters of lmfit's
GaussianModel: ``amplitude`` is the area under the peak, not its height.

To add a function: write it below with ``F(...)``. ``tests/test_functions.py``
then checks that it evaluates, that its guess gives finite values and that its
derived quantities agree with the curve.
"""
from __future__ import annotations

import math
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from lmfit import lineshapes as shapes
from scipy import special

Array = Any
KB = 8.617333262e-5          # Boltzmann constant, eV/K
S2PI = math.sqrt(2 * math.pi)
FWHM_G = 2 * math.sqrt(2 * math.log(2))           # FWHM of a Gaussian, in units of sigma


@dataclass(frozen=True)
class Param:
    name: str
    label: str                          # what it is, for a person
    default: float = 1.0
    min: float | None = None            # a bound the function needs (a width is positive), not a guess
    max: float | None = None
    symbol: str = ""                    # how the equation writes it; empty: its name


@dataclass(frozen=True)
class Derived:
    name: str
    label: str
    of: Callable[[dict[str, float]], float]


@dataclass(frozen=True)
class Function:
    name: str
    label: str
    family: str
    tex: str                                                    # y = …, with the symbols of `params`
    params: tuple[Param, ...]
    call: Callable[..., Array]                                  # call(x, **parameters)
    kind: str = "curve"                                         # peak | baseline | curve
    note: str = ""
    derived: tuple[Derived, ...] = ()
    from_peak: Callable[[float, float, float], dict[str, float]] | None = None      # (center, height, fwhm) → starting values
    guess: Callable[[Array, Array], dict[str, float]] | None = None                 # (x, y) → starting values
    names: tuple[str, ...] = field(init=False)

    def __post_init__(self) -> None:
        object.__setattr__(self, "names", tuple(p.name for p in self.params))

    def described(self) -> dict[str, Any]:
        """What the page shows of it."""
        return {"name": self.name, "label": self.label, "family": self.family, "kind": self.kind, "tex": self.tex, "note": self.note,
                "params": [{"name": p.name, "label": p.label, "default": p.default, "min": p.min, "max": p.max, "symbol": p.symbol or p.name}
                           for p in self.params],
                "derived": [{"name": d.name, "label": d.label} for d in self.derived]}


REGISTRY: dict[str, Function] = {}
FAMILIES = ["Peaks", "Baseline and polynomials", "Exponential and power", "Sigmoids and steps", "Oscillations", "Physics and chemistry"]


def F(name: str, label: str, family: str, tex: str, params: list[Param], call: Callable[..., Array], **more: Any) -> None:
    assert name not in REGISTRY and family in FAMILIES, name
    REGISTRY[name] = Function(name, label, family, tex, tuple(params), call, **more)


def get(name: str) -> Function:
    try:
        return REGISTRY[name]
    except KeyError:
        raise ValueError(f"no fit function is called {name!r}") from None


def described() -> list[dict[str, Any]]:
    return [f.described() for f in sorted(REGISTRY.values(), key=lambda f: FAMILIES.index(f.family))]


# ── reading starting values from the data ────────────────────────────────────
def _sorted(x: Array, y: Array) -> tuple[Array, Array]:
    order = np.argsort(x, kind="stable")
    return np.asarray(x, float)[order], np.asarray(y, float)[order]


def _ends(y: Array) -> tuple[float, float]:
    """The level at the start and at the end of a curve: the mean of its first and last tenth."""
    n = max(1, len(y) // 10)
    return float(np.mean(y[:n])), float(np.mean(y[-n:]))


def _span(x: Array) -> float:
    return float(np.ptp(x)) or 1.0


def _guess_line(x: Array, y: Array) -> dict[str, float]:
    slope, intercept = np.polyfit(x, y, 1) if len(x) > 1 else (0.0, float(np.mean(y)))
    return {"slope": float(slope), "intercept": float(intercept)}


def _guess_poly(degree: int) -> Callable[[Array, Array], dict[str, float]]:
    def guess(x: Array, y: Array) -> dict[str, float]:
        if len(x) <= degree:
            return {}
        return {f"c{i}": float(c) for i, c in enumerate(np.polyfit(x, y, degree)[::-1])}
    return guess


def _guess_decay(x: Array, y: Array) -> dict[str, float]:
    x, y = _sorted(x, y)
    start, end = _ends(y)
    # the time at which the curve has covered 1 − 1/e of its way
    target = end + (start - end) / math.e
    crossed = np.nonzero((y - target) * (start - end) <= 0)[0]
    tau = float(x[crossed[0]] - x[0]) if len(crossed) and crossed[0] > 0 else _span(x) / 3
    return {"y0": end, "A": start - end, "tau": max(tau, _span(x) / 1000), "x0": float(x[0])}


def _guess_sigmoid(x: Array, y: Array) -> dict[str, float]:
    x, y = _sorted(x, y)
    start, end = _ends(y)
    half = np.nonzero((y - (start + end) / 2) * (end - start) >= 0)[0]
    return {"low": start, "high": end, "x0": float(x[half[0]]) if len(half) else float(np.mean(x)), "width": _span(x) / 10}


def _guess_sine(x: Array, y: Array) -> dict[str, float]:
    x, y = _sorted(x, y)
    centred = y - np.mean(y)
    spectrum = np.abs(np.fft.rfft(centred))
    freqs = np.fft.rfftfreq(len(x), d=_span(x) / max(len(x) - 1, 1))
    k = int(np.argmax(spectrum[1:]) + 1) if len(spectrum) > 1 else 0
    return {"A": float(np.ptp(y) / 2) or 1.0, "f": float(freqs[k]) if k else 1 / _span(x), "phi": 0.0, "y0": float(np.mean(y)), "tau": _span(x)}


def _guess_saturation(x: Array, y: Array) -> dict[str, float]:
    x, y = _sorted(x, y)
    top = float(np.max(y)) * 1.1 or 1.0
    half = np.nonzero(y >= top / 2)[0]
    k = float(x[half[0]]) if len(half) and x[half[0]] > 0 else float(np.mean(x)) or 1.0
    return {"top": top, "k": k}


# ── peaks ────────────────────────────────────────────────────────────────────
CENTER = Param("center", "position of the maximum", 0.0, symbol="x_c")
AREA = Param("amplitude", "area under the peak", 1.0, symbol="A")
SIGMA = Param("sigma", "width", 1.0, min=0.0, symbol=r"\sigma")


def _voigt_height(p: dict[str, float]) -> float:
    return p["amplitude"] / (max(p["sigma"], 1e-300) * S2PI) * float(special.erfcx(p["gamma"] / (max(p["sigma"], 1e-300) * math.sqrt(2))))


def _voigt_fwhm(p: dict[str, float]) -> float:
    # Olivero and Longbothum (1977), within 0.02 %
    lorentz, gauss = 2 * p["gamma"], FWHM_G * p["sigma"]
    return 0.5346 * lorentz + math.sqrt(0.2166 * lorentz ** 2 + gauss ** 2)


def _pvoigt_height(p: dict[str, float]) -> float:
    sigma_g = p["sigma"] / math.sqrt(2 * math.log(2))
    return (1 - p["fraction"]) * p["amplitude"] / (sigma_g * S2PI) + p["fraction"] * p["amplitude"] / (math.pi * p["sigma"])


F("gaussian", "Gaussian", "Peaks", r"y = \frac{A}{\sigma\sqrt{2\pi}}\, \mathrm{e}^{-(x-x_c)^2 / 2\sigma^2}", [AREA, CENTER, SIGMA], shapes.gaussian, kind="peak",
  derived=(Derived("fwhm", "full width at half maximum", lambda p: FWHM_G * p["sigma"]),
           Derived("height", "height of the maximum", lambda p: p["amplitude"] / (p["sigma"] * S2PI))),
  from_peak=lambda c, h, w: {"center": c, "sigma": w / FWHM_G, "amplitude": h * w / FWHM_G * S2PI})

F("lorentzian", "Lorentzian", "Peaks", r"y = \frac{A}{\pi}\, \frac{\sigma}{(x-x_c)^2 + \sigma^2}",
  [AREA, CENTER, Param("sigma", "half width at half maximum", 1.0, min=0.0, symbol=r"\sigma")], shapes.lorentzian, kind="peak",
  derived=(Derived("fwhm", "full width at half maximum", lambda p: 2 * p["sigma"]),
           Derived("height", "height of the maximum", lambda p: p["amplitude"] / (math.pi * p["sigma"]))),
  from_peak=lambda c, h, w: {"center": c, "sigma": w / 2, "amplitude": h * math.pi * w / 2})

F("voigt", "Voigt", "Peaks", r"y = A\, \frac{\operatorname{Re}\, w(z)}{\sigma\sqrt{2\pi}},\quad z = \frac{x - x_c + i\gamma}{\sigma\sqrt{2}}",
  [AREA, CENTER, Param("sigma", "width of the Gaussian part", 1.0, min=0.0, symbol=r"\sigma"),
   Param("gamma", "half width of the Lorentzian part", 1.0, min=0.0, symbol=r"\gamma")], shapes.voigt, kind="peak",
  note="A Gaussian convolved with a Lorentzian; w is the Faddeeva function. When the two widths cannot be told apart, fix one of them.",
  derived=(Derived("fwhm", "full width at half maximum (Olivero–Longbothum)", _voigt_fwhm), Derived("height", "height of the maximum", _voigt_height)),
  from_peak=lambda c, h, w: {"center": c, "sigma": w / 3.6013, "gamma": w / 3.6013, "amplitude": h * w / 3.6013 * S2PI / 0.5231})

F("pseudo_voigt", "Pseudo-Voigt", "Peaks", r"y = (1-\eta)\, G(x; A, x_c, \sigma_g) + \eta\, L(x; A, x_c, \sigma),\quad \sigma_g = \sigma / \sqrt{2\ln 2}",
  [AREA, CENTER, Param("sigma", "half width at half maximum", 1.0, min=0.0, symbol=r"\sigma"),
   Param("fraction", "Lorentzian share, 0 (Gaussian) to 1 (Lorentzian)", 0.5, min=0.0, max=1.0, symbol=r"\eta")], shapes.pvoigt, kind="peak",
  note="A sum of a Gaussian and a Lorentzian of the same width: the usual stand-in for a Voigt profile.",
  derived=(Derived("fwhm", "full width at half maximum", lambda p: 2 * p["sigma"]), Derived("height", "height of the maximum", _pvoigt_height)),
  from_peak=lambda c, h, w: {"center": c, "sigma": w / 2, "fraction": 0.5, "amplitude": h * w / 2 / (0.5 / (S2PI / math.sqrt(2 * math.log(2))) + 0.5 / math.pi)})

F("pearson7", "Pearson VII", "Peaks", r"y = \frac{A}{\sigma\, B(m - \tfrac12, \tfrac12)} \left[1 + \frac{(x-x_c)^2}{\sigma^2}\right]^{-m}",
  [AREA, CENTER, SIGMA, Param("expon", "shape: 1 is a Lorentzian, large is a Gaussian", 1.5, min=0.5, symbol="m")], shapes.pearson7, kind="peak",
  derived=(Derived("fwhm", "full width at half maximum", lambda p: 2 * p["sigma"] * math.sqrt(2 ** (1 / p["expon"]) - 1)),
           Derived("height", "height of the maximum", lambda p: p["amplitude"] / (p["sigma"] * float(special.beta(p["expon"] - 0.5, 0.5))))),
  from_peak=lambda c, h, w: {"center": c, "sigma": w / 2 / math.sqrt(2 ** (1 / 1.5) - 1), "expon": 1.5,
                             "amplitude": h * w / 2 / math.sqrt(2 ** (1 / 1.5) - 1) * float(special.beta(1.0, 0.5))})

F("moffat", "Moffat", "Peaks", r"y = H \left[1 + \frac{(x-x_c)^2}{\sigma^2}\right]^{-\beta}",
  [Param("amplitude", "height of the maximum", 1.0, symbol="H"), CENTER, SIGMA, Param("beta", "how fast the wings fall", 1.0, min=0.0, symbol=r"\beta")],
  shapes.moffat, kind="peak",
  derived=(Derived("fwhm", "full width at half maximum", lambda p: 2 * p["sigma"] * math.sqrt(2 ** (1 / p["beta"]) - 1)),),
  from_peak=lambda c, h, w: {"center": c, "sigma": w / 2, "beta": 1.0, "amplitude": h})

F("split_lorentzian", "Split Lorentzian", "Peaks",
  r"y = \frac{2A}{\pi(\sigma + \sigma_r)} \begin{cases} \sigma^2 / [(x-x_c)^2 + \sigma^2] & x < x_c \\ \sigma_r^2 / [(x-x_c)^2 + \sigma_r^2] & x \ge x_c \end{cases}",
  [AREA, CENTER, Param("sigma", "half width on the left", 1.0, min=0.0, symbol=r"\sigma"),
   Param("sigma_r", "half width on the right", 1.0, min=0.0, symbol=r"\sigma_r")], shapes.split_lorentzian, kind="peak",
  note="An asymmetric peak: a Lorentzian with one width on each side.",
  derived=(Derived("fwhm", "full width at half maximum", lambda p: p["sigma"] + p["sigma_r"]),
           Derived("height", "height of the maximum", lambda p: 2 * p["amplitude"] / (math.pi * (p["sigma"] + p["sigma_r"])))),
  from_peak=lambda c, h, w: {"center": c, "sigma": w / 2, "sigma_r": w / 2, "amplitude": h * math.pi * w / 2})

F("skewed_gaussian", "Skewed Gaussian", "Peaks", r"y = G(x; A, x_c, \sigma) \left[1 + \operatorname{erf}\!\left(\frac{\gamma (x - x_c)}{\sigma\sqrt{2}}\right)\right]",
  [AREA, CENTER, SIGMA, Param("gamma", "skew: 0 is symmetric, positive leans to the right", 0.0, symbol=r"\gamma")], shapes.skewed_gaussian, kind="peak",
  from_peak=lambda c, h, w: {"center": c, "sigma": w / FWHM_G, "gamma": 0.0, "amplitude": h * w / FWHM_G * S2PI})

F("exp_gaussian", "Exponentially modified Gaussian", "Peaks",
  r"y = \frac{A\gamma}{2}\, \exp\!\left[\gamma\left(x_c - x + \tfrac{\gamma\sigma^2}{2}\right)\right] \operatorname{erfc}\!\left(\frac{x_c + \gamma\sigma^2 - x}{\sigma\sqrt{2}}\right)",
  [AREA, Param("center", "position of the Gaussian", 0.0, symbol="x_c"), SIGMA, Param("gamma", "rate of the exponential tail", 1.0, min=0.0, symbol=r"\gamma")],
  shapes.expgaussian, kind="peak", note="A Gaussian convolved with a one-sided exponential decay: chromatography, time-resolved signals.",
  from_peak=lambda c, h, w: {"center": c, "sigma": w / FWHM_G, "gamma": FWHM_G / w, "amplitude": h * w / FWHM_G * S2PI * 1.6})

F("lognormal", "Log-normal", "Peaks", r"y = \frac{A}{x\, \sigma\sqrt{2\pi}}\, \mathrm{e}^{-(\ln x - \mu)^2 / 2\sigma^2}",
  [AREA, Param("center", "mean of ln x", 0.0, symbol=r"\mu"), SIGMA], shapes.lognormal, kind="peak", note="Defined for x > 0.",
  derived=(Derived("mode", "position of the maximum", lambda p: math.exp(p["center"] - p["sigma"] ** 2)),
           Derived("median", "median", lambda p: math.exp(p["center"]))),
  from_peak=lambda c, h, w: ({"center": math.log(c) + 0.09, "sigma": 0.3, "amplitude": h * c * 0.3 * S2PI} if c > 0 else {}))

F("fano", "Fano (Breit–Wigner)", "Peaks", r"y = A\, \frac{(q\,\sigma/2 + x - x_c)^2}{(\sigma/2)^2 + (x - x_c)^2}",
  [Param("amplitude", "level far from the resonance", 1.0, symbol="A"), Param("center", "position of the resonance", 0.0, symbol="x_c"),
   Param("sigma", "width of the resonance", 1.0, min=0.0, symbol=r"\sigma"), Param("q", "asymmetry (Fano parameter)", 1.0, symbol="q")], shapes.breit_wigner, kind="peak",
  from_peak=lambda c, h, w: {"center": c, "sigma": w, "q": 3.0, "amplitude": h / 10})

F("doniach", "Doniach–Šunjić", "Peaks",
  r"y = \frac{A}{\sigma^{1-\gamma}}\, \frac{\cos[\pi\gamma/2 + (1-\gamma)\arctan((x-x_c)/\sigma)]}{[1 + ((x-x_c)/\sigma)^2]^{(1-\gamma)/2}}",
  [Param("amplitude", "intensity", 1.0, symbol="A"), CENTER, SIGMA, Param("gamma", "asymmetry, 0 (Lorentzian) to 1", 0.1, min=0.0, max=1.0, symbol=r"\gamma")],
  shapes.doniach, kind="peak", note="The asymmetric line of a metal in photoemission.",
  from_peak=lambda c, h, w: {"center": c, "sigma": w / 2, "gamma": 0.1, "amplitude": h * (w / 2) ** 0.9})


# ── baselines and polynomials ────────────────────────────────────────────────
def _polynomial(degree: int) -> Callable[..., Array]:
    def call(x: Array, **c: float) -> Array:
        total = np.zeros_like(np.asarray(x, float)) + c[f"c{degree}"]
        for i in range(degree - 1, -1, -1):
            total = total * x + c[f"c{i}"]
        return total
    return call


F("constant", "Constant", "Baseline and polynomials", "y = c", [Param("c", "level", 0.0)], lambda x, c=0.0: np.zeros_like(np.asarray(x, float)) + c, kind="baseline",
  guess=lambda x, y: {"c": float(np.min(y))})
F("linear", "Line", "Baseline and polynomials", r"y = a\,x + b", [Param("slope", "slope", 1.0, symbol="a"), Param("intercept", "value at x = 0", 0.0, symbol="b")],
  lambda x, slope=1.0, intercept=0.0: slope * np.asarray(x, float) + intercept, kind="baseline", guess=_guess_line)
for _degree, _label in ((2, "Quadratic"), (3, "Cubic"), (4, "Polynomial of degree 4"), (5, "Polynomial of degree 5")):
    F({2: "quadratic", 3: "cubic"}.get(_degree, f"poly{_degree}"), _label, "Baseline and polynomials",
      "y = " + " + ".join(["c_0", "c_1 x"] + [f"c_{i} x^{i}" for i in range(2, _degree + 1)]),
      [Param(f"c{i}", "constant term" if i == 0 else f"coefficient of x^{i}" if i > 1 else "coefficient of x", 0.0, symbol=f"c_{i}") for i in range(_degree + 1)],
      _polynomial(_degree), kind="baseline", guess=_guess_poly(_degree))


# ── exponentials and powers ──────────────────────────────────────────────────
Y0 = Param("y0", "offset: the value far away", 0.0, symbol="y_0")
TAU = Param("tau", "time constant", 1.0, min=0.0, symbol=r"\tau")


def _exp(x: Array, scale: float) -> Array:
    with np.errstate(all="ignore"):
        return np.exp(-np.asarray(x, float) / scale)


def _guess_decay_n(n: int) -> Callable[[Array, Array], dict[str, float]]:
    def guess(x: Array, y: Array) -> dict[str, float]:
        one = _guess_decay(x, y)
        found = {"y0": one["y0"]}
        for i in range(n):          # the same amplitude for each, time constants spread around the one read from the curve
            found[f"A{i + 1}"] = one["A"] / n
            found[f"tau{i + 1}"] = one["tau"] * (4.0 ** (i - (n - 1) / 2))
        return found
    return guess


F("exp_decay", "Exponential decay", "Exponential and power", r"y = y_0 + A\, \mathrm{e}^{-x/\tau}", [Y0, Param("A", "amplitude at x = 0", 1.0), TAU],
  lambda x, y0=0.0, A=1.0, tau=1.0: y0 + A * _exp(x, tau), guess=lambda x, y: {k: v for k, v in _guess_decay(x, y).items() if k != "x0"},
  derived=(Derived("half_life", "half-life", lambda p: p["tau"] * math.log(2)), Derived("rate", "rate 1/τ", lambda p: 1 / p["tau"])))
F("exp_decay2", "Two exponential decays", "Exponential and power", r"y = y_0 + A_1 \mathrm{e}^{-x/\tau_1} + A_2 \mathrm{e}^{-x/\tau_2}",
  [Y0, Param("A1", "first amplitude", 1.0, symbol="A_1"), Param("tau1", "first time constant", 1.0, min=0.0, symbol=r"\tau_1"),
   Param("A2", "second amplitude", 1.0, symbol="A_2"), Param("tau2", "second time constant", 10.0, min=0.0, symbol=r"\tau_2")],
  lambda x, y0=0.0, A1=1.0, tau1=1.0, A2=1.0, tau2=10.0: y0 + A1 * _exp(x, tau1) + A2 * _exp(x, tau2), guess=_guess_decay_n(2),
  derived=(Derived("tau_mean", "amplitude-weighted mean time constant", lambda p: (p["A1"] * p["tau1"] + p["A2"] * p["tau2"]) / (p["A1"] + p["A2"])),))
F("exp_decay3", "Three exponential decays", "Exponential and power", r"y = y_0 + \sum_{i=1}^{3} A_i\, \mathrm{e}^{-x/\tau_i}",
  [Y0] + [p for i in (1, 2, 3) for p in (Param(f"A{i}", f"amplitude {i}", 1.0, symbol=f"A_{i}"), Param(f"tau{i}", f"time constant {i}", 10.0 ** (i - 1), min=0.0, symbol=rf"\tau_{i}"))],
  lambda x, y0=0.0, **p: y0 + sum(p[f"A{i}"] * _exp(x, p[f"tau{i}"]) for i in (1, 2, 3)), guess=_guess_decay_n(3))
F("exp_rise", "Exponential rise to a plateau", "Exponential and power", r"y = y_0 + A\left(1 - \mathrm{e}^{-x/\tau}\right)",
  [Param("y0", "value at x = 0", 0.0, symbol="y_0"), Param("A", "height of the rise", 1.0), TAU],
  lambda x, y0=0.0, A=1.0, tau=1.0: y0 + A * (1 - _exp(x, tau)),
  guess=lambda x, y: (lambda d: {"y0": d["y0"] + d["A"], "A": -d["A"], "tau": d["tau"]})(_guess_decay(x, y)))
F("exp_growth", "Exponential growth", "Exponential and power", r"y = y_0 + A\, \mathrm{e}^{x/\tau}", [Param("y0", "offset", 0.0, symbol="y_0"), Param("A", "amplitude at x = 0", 1.0), TAU],
  lambda x, y0=0.0, A=1.0, tau=1.0: y0 + A * _exp(-np.asarray(x, float), tau),
  derived=(Derived("doubling", "doubling time", lambda p: p["tau"] * math.log(2)),))
F("stretched_exp", "Stretched exponential", "Exponential and power", r"y = y_0 + A\, \mathrm{e}^{-(x/\tau)^{\beta}}",
  [Y0, Param("A", "amplitude at x = 0", 1.0), TAU, Param("beta", "stretching exponent, 0 to 1", 0.7, min=0.0, max=2.0, symbol=r"\beta")],
  lambda x, y0=0.0, A=1.0, tau=1.0, beta=0.7: y0 + A * np.exp(-np.power(np.clip(np.asarray(x, float) / tau, 0, None), beta)),
  note="Kohlrausch–Williams–Watts relaxation. Defined for x ≥ 0.", guess=lambda x, y: {**{k: v for k, v in _guess_decay(x, y).items() if k != "x0"}, "beta": 0.7},
  derived=(Derived("tau_mean", "mean relaxation time (τ/β)·Γ(1/β)", lambda p: p["tau"] / p["beta"] * float(special.gamma(1 / p["beta"]))),))
F("power_law", "Power law", "Exponential and power", r"y = A\, x^{k}", [Param("A", "value at x = 1", 1.0), Param("k", "exponent", 1.0)],
  lambda x, A=1.0, k=1.0: A * np.power(np.asarray(x, float), k), note="Defined for x > 0 unless the exponent is an integer.")


# ── sigmoids and steps ───────────────────────────────────────────────────────
LOW, HIGH = Param("low", "plateau on the left", 0.0, symbol="y_1"), Param("high", "plateau on the right", 1.0, symbol="y_2")
MID = Param("x0", "position of the half-way point", 0.0, symbol="x_0")


def _logistic(x: Array, low: float = 0.0, high: float = 1.0, x0: float = 0.0, width: float = 1.0) -> Array:
    return low + (high - low) * special.expit((np.asarray(x, float) - x0) / width)


def _hill(x: Array, top: float = 1.0, k: float = 1.0, n: float = 1.0) -> Array:
    with np.errstate(all="ignore"):
        xn = np.power(np.clip(np.asarray(x, float), 0, None), n)
        return top * xn / (k ** n + xn)


F("logistic", "Logistic (Boltzmann sigmoid)", "Sigmoids and steps", r"y = y_1 + \frac{y_2 - y_1}{1 + \mathrm{e}^{-(x - x_0)/w}}",
  [LOW, HIGH, MID, Param("width", "width of the transition", 1.0, symbol="w")], _logistic, guess=_guess_sigmoid,
  derived=(Derived("slope", "slope at the half-way point", lambda p: (p["high"] - p["low"]) / (4 * p["width"])),))
F("erf_step", "Error-function step", "Sigmoids and steps", r"y = y_1 + \frac{y_2 - y_1}{2}\left[1 + \operatorname{erf}\!\left(\frac{x - x_0}{w\sqrt{2}}\right)\right]",
  [LOW, HIGH, MID, Param("width", "standard deviation of the edge", 1.0, min=0.0, symbol="w")],
  lambda x, low=0.0, high=1.0, x0=0.0, width=1.0: low + (high - low) / 2 * (1 + special.erf((np.asarray(x, float) - x0) / (width * math.sqrt(2)))),
  guess=_guess_sigmoid, note="A sharp edge seen through a Gaussian resolution: knife-edge beam profiles, absorption edges.",
  derived=(Derived("width_10_90", "10 % to 90 % width", lambda p: 2.5631 * p["width"]),))
F("hill", "Hill", "Sigmoids and steps", r"y = y_{max}\, \frac{x^{n}}{K^{n} + x^{n}}",
  [Param("top", "plateau", 1.0, symbol="y_{max}"), Param("k", "x at half the plateau", 1.0, min=0.0, symbol="K"), Param("n", "cooperativity (Hill coefficient)", 1.0, min=0.0)],
  _hill, guess=lambda x, y: {**_guess_saturation(x, y), "n": 1.0}, note="Defined for x ≥ 0. With n = 1: Michaelis–Menten, Langmuir.")
F("dose_response", "Dose–response (four parameters)", "Sigmoids and steps", r"y = y_1 + \frac{y_2 - y_1}{1 + 10^{(\log_{10} EC_{50} - x)\, p}}",
  [LOW, HIGH, Param("logec50", "log₁₀ of the half-effect dose", 0.0, symbol=r"\log_{10} EC_{50}"), Param("p", "Hill slope", 1.0)],
  lambda x, low=0.0, high=1.0, logec50=0.0, p=1.0: low + (high - low) * special.expit((np.asarray(x, float) - logec50) * p * math.log(10)),
  guess=lambda x, y: (lambda s: {"low": s["low"], "high": s["high"], "logec50": s["x0"], "p": 1.0})(_guess_sigmoid(x, y)), note="x is the logarithm of the dose.",
  derived=(Derived("ec50", "half-effect dose", lambda p: 10 ** p["logec50"]),))


# ── oscillations ─────────────────────────────────────────────────────────────
F("sine", "Sine", "Oscillations", r"y = y_0 + A \sin(2\pi f x + \varphi)",
  [Y0, Param("A", "amplitude", 1.0), Param("f", "frequency", 1.0, symbol="f"), Param("phi", "phase, in radians", 0.0, symbol=r"\varphi")],
  lambda x, y0=0.0, A=1.0, f=1.0, phi=0.0: y0 + A * np.sin(2 * math.pi * f * np.asarray(x, float) + phi),
  guess=lambda x, y: {k: v for k, v in _guess_sine(x, y).items() if k != "tau"}, derived=(Derived("period", "period", lambda p: 1 / p["f"]),))
F("damped_sine", "Damped sine", "Oscillations", r"y = y_0 + A\, \mathrm{e}^{-x/\tau} \sin(2\pi f x + \varphi)",
  [Y0, Param("A", "amplitude at x = 0", 1.0), TAU, Param("f", "frequency", 1.0), Param("phi", "phase, in radians", 0.0, symbol=r"\varphi")],
  lambda x, y0=0.0, A=1.0, tau=1.0, f=1.0, phi=0.0: y0 + A * _exp(x, tau) * np.sin(2 * math.pi * f * np.asarray(x, float) + phi), guess=_guess_sine,
  derived=(Derived("period", "period", lambda p: 1 / p["f"]), Derived("q_factor", "quality factor π f τ", lambda p: math.pi * p["f"] * p["tau"])))


# ── physics and chemistry ────────────────────────────────────────────────────
def _arrhenius(x: Array, A: float = 1.0, Ea: float = 0.1) -> Array:
    with np.errstate(all="ignore"):
        return A * np.exp(-Ea / (KB * np.asarray(x, float)))


def _fermi(x: Array, amplitude: float = 1.0, center: float = 0.0, kt: float = 1.0) -> Array:
    return amplitude * special.expit(-(np.asarray(x, float) - center) / kt)


F("arrhenius", "Arrhenius", "Physics and chemistry", r"y = A\, \mathrm{e}^{-E_a / k_B T}",
  [Param("A", "prefactor", 1.0), Param("Ea", "activation energy, in eV", 0.1, symbol="E_a")], _arrhenius,
  note="x is the temperature in kelvin; k_B = 8.617333262·10⁻⁵ eV/K.", derived=(Derived("Ea_kJ_mol", "activation energy, in kJ/mol", lambda p: p["Ea"] * 96.48533212),))
F("langmuir", "Langmuir isotherm", "Physics and chemistry", r"y = q_{max}\, \frac{K x}{1 + K x}",
  [Param("qmax", "coverage at saturation", 1.0, symbol="q_{max}"), Param("K", "affinity", 1.0, min=0.0)],
  lambda x, qmax=1.0, K=1.0: qmax * K * np.asarray(x, float) / (1 + K * np.asarray(x, float)),
  guess=lambda x, y: (lambda s: {"qmax": s["top"], "K": 1 / s["k"]})(_guess_saturation(x, y)))
F("michaelis_menten", "Michaelis–Menten", "Physics and chemistry", r"y = \frac{V_{max}\, x}{K_m + x}",
  [Param("vmax", "rate at saturation", 1.0, symbol="V_{max}"), Param("km", "concentration at half the maximum rate", 1.0, min=0.0, symbol="K_m")],
  lambda x, vmax=1.0, km=1.0: vmax * np.asarray(x, float) / (km + np.asarray(x, float)),
  guess=lambda x, y: (lambda s: {"vmax": s["top"], "km": s["k"]})(_guess_saturation(x, y)))
F("fermi_dirac", "Fermi–Dirac edge", "Physics and chemistry", r"y = \frac{A}{\mathrm{e}^{(x - \mu)/k_B T} + 1}",
  [Param("amplitude", "level below the edge", 1.0, symbol="A"), Param("center", "position of the edge", 0.0, symbol=r"\mu"),
   Param("kt", "thermal width, in the unit of x", 0.025, min=0.0, symbol="k_B T")], _fermi,
  guess=lambda x, y: (lambda s: {"amplitude": max(s["low"], s["high"]), "center": s["x0"], "kt": s["width"] / 4})(_guess_sigmoid(x, y)))


def peak_height(function: Function, values: dict[str, float]) -> float:
    """The height of a peak function at its centre, computed from the curve itself."""
    return float(function.call(np.array([values.get("center", 0.0)]), **values)[0])
