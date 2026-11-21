"""Arithmetic written by a person: a custom fit function, a constraint between parameters.

    Expression("a*exp(-x/tau) + c").names        ('a', 'x', 'tau', 'c')
    Expression("a*exp(-x/tau) + c")(a=2, x=xs, tau=3, c=0)

The text is read by Python's own parser and then walked: numbers, names, the
operators + - * / ^, parentheses and calls of the functions listed below are
accepted, and nothing else. No ``eval``, no attribute, no subscript, no string:
what a page sends cannot run code here. Every number is a float, so a tower of
powers overflows to ``inf`` instead of filling the memory.

The same grammar is read by ``page/js/expr.js`` for the formulas of a column.
"""
from __future__ import annotations

import ast
import math
from collections.abc import Callable, Mapping
from typing import Any

import numpy as np
from scipy import special

Value = Any            # a float or an array of them
Compiled = Callable[[Mapping[str, Value]], Value]

MAX_LENGTH = 2000
MAX_DEPTH = 60


class ExpressionError(ValueError):
    """What is wrong with an expression, said for the person who wrote it."""


def _heaviside(x: Value) -> Value:
    return np.heaviside(x, 0.5)


# name → (function, number of arguments, how it is written in TeX)
FUNCTIONS: dict[str, tuple[Callable[..., Value], int, str]] = {
    "sin": (np.sin, 1, r"\sin"), "cos": (np.cos, 1, r"\cos"), "tan": (np.tan, 1, r"\tan"),
    "asin": (np.arcsin, 1, r"\arcsin"), "acos": (np.arccos, 1, r"\arccos"), "atan": (np.arctan, 1, r"\arctan"),
    "sinh": (np.sinh, 1, r"\sinh"), "cosh": (np.cosh, 1, r"\cosh"), "tanh": (np.tanh, 1, r"\tanh"),
    "exp": (np.exp, 1, r"\exp"), "ln": (np.log, 1, r"\ln"), "log": (np.log, 1, r"\ln"),
    "log10": (np.log10, 1, r"\log_{10}"), "log2": (np.log2, 1, r"\log_{2}"),
    "sqrt": (np.sqrt, 1, r"\sqrt"), "abs": (np.abs, 1, r"\operatorname{abs}"), "sign": (np.sign, 1, r"\operatorname{sgn}"),
    "floor": (np.floor, 1, r"\operatorname{floor}"), "ceil": (np.ceil, 1, r"\operatorname{ceil}"),
    "erf": (special.erf, 1, r"\operatorname{erf}"), "erfc": (special.erfc, 1, r"\operatorname{erfc}"),
    "gamma": (special.gamma, 1, r"\Gamma"), "heaviside": (_heaviside, 1, r"\Theta"),
    "min": (np.minimum, 2, r"\min"), "max": (np.maximum, 2, r"\max"), "atan2": (np.arctan2, 2, r"\operatorname{atan2}"),
    "pow": (np.power, 2, r"\operatorname{pow}"),
}
CONSTANTS: dict[str, float] = {"pi": math.pi, "e": math.e}
GREEK = {"alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "kappa", "lambda", "mu", "nu", "xi", "pi", "rho", "sigma",
         "tau", "phi", "chi", "psi", "omega", "Gamma", "Delta", "Theta", "Lambda", "Sigma", "Phi", "Omega"}

_BINARY: dict[type, tuple[Callable[[Value, Value], Value], int]] = {
    ast.Add: (np.add, 1), ast.Sub: (np.subtract, 1), ast.Mult: (np.multiply, 2), ast.Div: (np.true_divide, 2), ast.Pow: (np.power, 4),
}


def name_tex(name: str) -> str:
    """A name as a symbol: ``tau`` → τ, ``x0`` → x₀, ``g1_center`` → center of g1."""
    head, _, tail = name.partition("_")
    digits = ""
    while head and head[-1].isdigit() and len(head) > 1:
        head, digits = head[:-1], head[-1] + digits
    symbol = "\\" + head if head in GREEK else (head if len(head) == 1 else r"\mathrm{" + head + "}")
    sub = ",".join(p for p in (digits, tail.replace("_", r"\_")) if p)
    return symbol + ("_{" + (sub if sub.isdigit() else r"\mathrm{" + sub + "}") + "}" if sub else "")


class Expression:
    """An expression that was checked: its free names, a way to compute it, a way to write it."""

    def __init__(self, text: str, *, allowed: set[str] | None = None) -> None:
        self.text = text.strip()
        if not self.text:
            raise ExpressionError("the expression is empty")
        if len(self.text) > MAX_LENGTH:
            raise ExpressionError(f"the expression is longer than {MAX_LENGTH} characters")
        try:
            tree = ast.parse(self.text.replace("^", "**"), mode="eval")
        except SyntaxError as exc:
            where = f" near character {exc.offset}" if exc.offset else ""
            raise ExpressionError(f"this is not arithmetic{where}: write products with * (2*x, not 2x)") from None
        found: list[str] = []
        self._run = self._compile(tree.body, found, 0)
        self._tree = tree.body
        self.names: tuple[str, ...] = tuple(found)
        if allowed is not None:
            unknown = [n for n in self.names if n not in allowed]
            if unknown:
                raise ExpressionError("unknown name" + ("s" if len(unknown) > 1 else "") + ": " + ", ".join(unknown))

    # ------------------------------------------------------------------ checking, and building what computes
    def _compile(self, node: ast.AST, found: list[str], depth: int) -> Compiled:
        if depth > MAX_DEPTH:
            raise ExpressionError("the expression is nested too deeply")
        if isinstance(node, ast.Constant):
            if type(node.value) not in (int, float):
                raise ExpressionError("only numbers are allowed, not " + type(node.value).__name__)
            number = float(node.value)  # type: ignore[arg-type]
            return lambda env: number
        if isinstance(node, ast.Name):
            name = node.id
            if name in CONSTANTS:
                constant = CONSTANTS[name]
                return lambda env: constant
            if name in FUNCTIONS:
                raise ExpressionError(f"{name} is a function: write {name}(…)")
            if name.startswith("_") or len(name) > 40:
                raise ExpressionError(f"{name!r} is not a name a parameter can have")
            if name not in found:
                found.append(name)
            return lambda env: env[name]
        if isinstance(node, ast.BinOp) and type(node.op) in _BINARY:
            operation = _BINARY[type(node.op)][0]
            left, right = self._compile(node.left, found, depth + 1), self._compile(node.right, found, depth + 1)
            return lambda env: operation(left(env), right(env))
        if isinstance(node, ast.UnaryOp) and isinstance(node.op, ast.USub | ast.UAdd):
            operand = self._compile(node.operand, found, depth + 1)
            return (lambda env: -operand(env)) if isinstance(node.op, ast.USub) else operand
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name) or node.func.id not in FUNCTIONS:
                called = node.func.id if isinstance(node.func, ast.Name) else "this"
                raise ExpressionError(f"{called} is not a known function. Known: " + ", ".join(sorted(FUNCTIONS)))
            function, count, _ = FUNCTIONS[node.func.id]
            if node.keywords or len(node.args) != count:
                raise ExpressionError(f"{node.func.id} takes {count} argument" + ("s" if count > 1 else ""))
            args = [self._compile(a, found, depth + 1) for a in node.args]
            return lambda env: function(*(a(env) for a in args))
        raise ExpressionError("only numbers, names, + - * / ^, parentheses and functions are allowed")

    def __call__(self, values: Mapping[str, Value] | None = None, **named: Value) -> Value:
        env = {**(values or {}), **named}
        missing = [n for n in self.names if n not in env]
        if missing:
            raise ExpressionError("no value for " + ", ".join(missing))
        with np.errstate(all="ignore"):
            return self._run(env)

    # ------------------------------------------------------------------ writing it
    def tex(self, rename: Callable[[str], str] = name_tex) -> str:
        return self._tex(self._tree, rename, 0)

    def _tex(self, node: ast.AST, rename: Callable[[str], str], outer: int) -> str:
        if isinstance(node, ast.Constant):
            return _number_tex(float(node.value))  # type: ignore[arg-type]
        if isinstance(node, ast.Name):
            return r"\pi" if node.id == "pi" else (r"\mathrm{e}" if node.id == "e" else rename(node.id))
        if isinstance(node, ast.UnaryOp):
            inner = self._tex(node.operand, rename, 3)
            text = ("-" if isinstance(node.op, ast.USub) else "") + inner
            return "\\left(" + text + "\\right)" if outer > 1 else text
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
            args = [self._tex(a, rename, 0) for a in node.args]
            written = FUNCTIONS[node.func.id][2]
            if node.func.id == "sqrt":
                return r"\sqrt{" + args[0] + "}"
            if node.func.id == "abs":
                return r"\left|" + args[0] + r"\right|"
            if node.func.id == "exp" and len(args[0]) <= 24:
                return r"\mathrm{e}^{" + args[0] + "}"
            return written + r"\!\left(" + ", ".join(args) + r"\right)"
        if isinstance(node, ast.BinOp):
            level = _BINARY[type(node.op)][1]
            if isinstance(node.op, ast.Div):
                return r"\frac{" + self._tex(node.left, rename, 0) + "}{" + self._tex(node.right, rename, 0) + "}"
            if isinstance(node.op, ast.Pow):
                text = self._tex(node.left, rename, 5) + "^{" + self._tex(node.right, rename, 0) + "}"
            else:
                sign = {ast.Add: " + ", ast.Sub: " - ", ast.Mult: r"\,"}[type(node.op)]
                right_level = level + 1 if isinstance(node.op, ast.Sub) else level
                left, right = self._tex(node.left, rename, level), self._tex(node.right, rename, right_level)
                if isinstance(node.op, ast.Mult) and (right[:1].isdigit() or right.startswith("-")):
                    sign = r" \times "
                text = left + sign + right
            return "\\left(" + text + "\\right)" if level < outer else text
        return "?"


def _number_tex(value: float) -> str:
    if value == int(value) and abs(value) < 1e6:
        return str(int(value))
    text = f"{value:.6g}"
    if "e" in text:
        mantissa, exponent = text.split("e")
        return (mantissa + r"\times " if mantissa != "1" else "") + "10^{" + str(int(exponent)) + "}"
    return text
