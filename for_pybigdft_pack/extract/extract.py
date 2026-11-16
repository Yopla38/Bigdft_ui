#!/usr/bin/env python3
"""Read PyBigDFT as it is installed, and test the snippets against it.

This file runs INSIDE the environment whose PyBigDFT the agent will use (the
pack's image). It needs nothing but that environment: the standard library,
PyBigDFT and PyYAML. It is written for the oldest Python such an image carries
(3.7), so no syntax newer than that.

Nothing here is specific to one version. It asks the installed code what it
is, so pointing it at another image is all a new version needs:

    extract.py api        OUT    modules, classes, functions, signatures, docstrings
    extract.py actions    OUT    what each input action writes in the input file
    extract.py fixtures   DIR    a few small real calculations the snippets read
    extract.py parameters OUT DIR   every input variable, default and comment, from a log
    extract.py snippets   OUT SNIPPETS DIR   run each snippet, record what it calls
    extract.py all        OUT SNIPPETS      everything, in order

OUT is a directory; each step writes one JSON file in it.
"""
from __future__ import print_function

import ast
import copy
import importlib
import inspect
import json
import os
import pkgutil
import re
import shutil
import subprocess
import sys
import tempfile
import time
import traceback

DOC_LIMIT = 6000          # characters of a docstring kept
OUTPUT_LIMIT = 1800       # characters of a snippet's output kept
SNIPPET_TIMEOUT = 900     # seconds

WATER = {"units": "angstroem", "positions": [
    {"O": [0.0, 0.0, 0.0]}, {"H": [0.757, 0.5859, 0.0]}, {"H": [-0.757, 0.5859, 0.0]}]}

#: Values for the arguments of an input action that have no default.
SAMPLE_ARGUMENTS = {"posinp": WATER}
#: Actions that are not settings of a calculation: nothing to learn from calling them.
NOT_SETTINGS = ("dict_set", "remove", "connect_run_data", "set_external_potential",
                "set_psp_file", "set_psp_directory", "load", "add_cdft_constraint")


def package():
    import BigDFT
    return BigDFT, os.path.dirname(os.path.abspath(BigDFT.__file__))


def write(out, name, data):
    if not os.path.isdir(out):
        os.makedirs(out)
    path = os.path.join(out, name)
    with open(path, "w") as f:
        json.dump(data, f, indent=1, sort_keys=True, default=repr)
    print("wrote", path)
    return path


# --------------------------------------------------------------------------- versions

def versions(fixtures=None):
    info = {"python": "%d.%d.%d" % sys.version_info[:3], "pybigdft": None, "bigdft": None}
    try:
        import pkg_resources
        for dist in pkg_resources.working_set:
            if dist.project_name.lower() == "pybigdft":
                info["pybigdft"] = dist.version
    except Exception:
        pass
    log = os.path.join(fixtures, "log-h2o.yaml") if fixtures else None
    if log and os.path.isfile(log):
        with open(log) as f:
            found = re.search(r"^\s*Version Number\s*:\s*(\S+)", f.read(200000), re.M)
        if found:
            info["bigdft"] = found.group(1)
    return info


# --------------------------------------------------------------------------- the API

def _doc(obj):
    text = inspect.getdoc(obj) or ""
    return text[:DOC_LIMIT]


def _summary(doc):
    """The first sentence or paragraph of a docstring, on one line."""
    first = doc.strip().split("\n\n", 1)[0]
    return " ".join(first.split())[:400]


def _signature(obj):
    try:
        sig = inspect.signature(obj)
    except (TypeError, ValueError):
        return None, []
    params = []
    for p in sig.parameters.values():
        if p.name in ("self", "cls"):
            continue
        params.append({"name": p.name, "kind": str(p.kind).split(".")[-1].lower(),
                       "default": None if p.default is inspect.Parameter.empty else repr(p.default),
                       "required": p.default is inspect.Parameter.empty
                       and p.kind in (p.POSITIONAL_ONLY, p.POSITIONAL_OR_KEYWORD, p.KEYWORD_ONLY)})
    text = str(sig)
    text = re.sub(r"^\((self|cls)(, )?", "(", text)
    return text, params


def _where(obj, root):
    try:
        code = obj.__code__
        return os.path.relpath(code.co_filename, os.path.dirname(root)), code.co_firstlineno
    except AttributeError:
        return None, None


def _function(obj, root, **extra):
    signature, params = _signature(obj)
    doc = _doc(obj)
    path, line = _where(obj, root)
    entry = {"signature": signature, "parameters": params, "doc": doc, "summary": _summary(doc),
             "file": path, "line": line}
    entry.update(extra)
    return entry


def api(out):
    BigDFT, root = package()
    modules, classes, functions, constants, unavailable = [], [], [], [], []

    def on_error(name):
        pass

    names = ["BigDFT"] + sorted(m.name for m in pkgutil.walk_packages(BigDFT.__path__, "BigDFT.", onerror=on_error))
    for name in names:
        try:
            mod = importlib.import_module(name)
        except BaseException as exc:  # a module may need a package the image does not carry
            unavailable.append({"module": name, "error": "%s: %s" % (type(exc).__name__, exc)})
            continue
        doc = _doc(mod)
        modules.append({"name": name, "doc": doc, "summary": _summary(doc),
                        "file": os.path.relpath(getattr(mod, "__file__", "") or "", os.path.dirname(root)),
                        "is_package": hasattr(mod, "__path__")})
        for key, obj in sorted(vars(mod).items()):
            if key.startswith("_"):
                continue
            if inspect.isfunction(obj) and obj.__module__ == name:
                functions.append(_function(obj, root, module=name, name=key, qualname=key, kind="function"))
            elif inspect.isclass(obj) and obj.__module__ == name:
                init = vars(obj).get("__init__")
                signature, params = _signature(init) if init else (None, [])
                cdoc = _doc(obj)
                idoc = _doc(init) if init else ""
                ipath, iline = _where(init, root) if init else (None, None)
                inherited = {}
                for base in obj.__mro__[1:]:
                    if not base.__module__.startswith("BigDFT"):
                        continue
                    for attr, member in vars(base).items():
                        if not attr.startswith("_") and inspect.isfunction(member) and attr not in vars(obj):
                            inherited.setdefault(attr, base.__module__ + "." + base.__name__)
                classes.append({"module": name, "name": key, "doc": cdoc, "summary": _summary(cdoc or idoc),
                                "init_doc": idoc if idoc != cdoc else "", "signature": signature, "parameters": params,
                                "file": ipath, "line": iline, "inherited": inherited,
                                "bases": [b.__module__ + "." + b.__name__ for b in obj.__bases__ if b is not object]})
                for attr, member in sorted(vars(obj).items()):
                    if attr.startswith("_"):
                        continue
                    raw = member
                    kind = "method"
                    if isinstance(member, staticmethod):
                        raw, kind = member.__func__, "staticmethod"
                    elif isinstance(member, classmethod):
                        raw, kind = member.__func__, "classmethod"
                    elif isinstance(member, property):
                        pdoc = _doc(member)
                        functions.append({"module": name, "name": attr, "qualname": key + "." + attr, "cls": key,
                                          "kind": "property", "signature": None, "parameters": [], "doc": pdoc,
                                          "summary": _summary(pdoc), "file": None, "line": None})
                        continue
                    if inspect.isfunction(raw):
                        functions.append(_function(raw, root, module=name, name=attr, qualname=key + "." + attr,
                                                   cls=key, kind=kind))
            elif isinstance(obj, (int, float)) and not isinstance(obj, bool) or (isinstance(obj, str) and len(obj) < 80):
                constants.append({"module": name, "name": key, "value": repr(obj)})

    # Attributes a Logfile gets at run time: they are not in the class, so no
    # introspection of the class finds them. The table they come from is.
    attributes = []
    try:
        from BigDFT import Logfiles
        for key, spec in sorted(getattr(Logfiles, "BUILTIN", {}).items()):
            attributes.append({"cls": "Logfile", "module": "BigDFT.Logfiles", "name": key,
                               "paths": [" > ".join(str(k) for k in p) for p in spec.get("path", [])],
                               "label": spec.get("print") if isinstance(spec.get("print"), str) else None,
                               "input": bool(spec.get("global"))})
    except Exception:
        traceback.print_exc()

    data = {"modules": modules, "classes": classes, "functions": functions, "constants": constants,
            "unavailable": unavailable, "attributes": attributes}
    print("api: %d modules, %d classes, %d functions and methods, %d not importable"
          % (len(modules), len(classes), len(functions), len(unavailable)))
    return write(out, "api.json", data)


# --------------------------------------------------------------------------- input actions

def _flatten(node, prefix=""):
    flat = {}
    for key, value in node.items():
        path = prefix + "." + str(key) if prefix else str(key)
        if isinstance(value, dict) and value:
            flat.update(_flatten(value, path))
        else:
            flat[path] = value
    return flat


def actions(out):
    """Call every input action on an empty input file and record what it wrote."""
    from BigDFT import InputActions
    from BigDFT.Inputfiles import Inputfile

    found = []
    for name, func in sorted(vars(InputActions).items()):
        if name.startswith("_") or not inspect.isfunction(func) or func.__module__ != InputActions.__name__:
            continue
        signature, params = _signature(func)
        params = [p for p in params if p["name"] != "inp"]
        entry = {"name": name, "doc": _doc(func), "summary": _summary(_doc(func)),
                 "signature": re.sub(r"^\(inp(, )?", "(", signature or "()"),
                 "parameters": params, "is_method": hasattr(Inputfile(), name), "writes": None, "error": None}
        if name in NOT_SETTINGS:
            entry["error"] = "not called: it is not a setting of a calculation"
        else:
            kwargs, missing = {}, []
            for p in params:
                if p["required"]:
                    if p["name"] in SAMPLE_ARGUMENTS:
                        kwargs[p["name"]] = copy.deepcopy(SAMPLE_ARGUMENTS[p["name"]])
                    else:
                        missing.append(p["name"])
            if missing:
                entry["error"] = "not called: no sample value for " + ", ".join(missing)
            else:
                try:
                    inp = Inputfile()
                    func(inp, **kwargs)
                    flat = _flatten(dict(inp))
                    entry["writes"] = {k: (v if isinstance(v, (int, float, str, bool, list)) or v is None else repr(v))
                                       for k, v in flat.items() if not k.startswith("posinp")}
                    entry["writes_posinp"] = any(k.startswith("posinp") for k in flat)
                    shown = ", ".join("%s=%s" % (p["name"], p["default"]) for p in params if p["default"] is not None)
                    entry["call"] = "inp.%s(%s)" % (name, shown)
                except Exception as exc:
                    entry["error"] = "%s: %s" % (type(exc).__name__, exc)
        found.append(entry)
    print("actions: %d, %d called" % (len(found), sum(1 for a in found if a["writes"] is not None)))
    return write(out, "actions.json", found)


# --------------------------------------------------------------------------- fixtures

FIXTURES = r'''
"""Small real calculations the snippets read. Runs where `bigdft` can run."""
import os, shutil, sys
from BigDFT.Inputfiles import Inputfile
from BigDFT.Calculators import SystemCalculator

WATER = {"units": "angstroem", "positions": [
    {"O": [0.0, 0.0, 0.0]}, {"H": [0.757, 0.5859, 0.0]}, {"H": [-0.757, 0.5859, 0.0]}]}
OH = {"units": "angstroem", "positions": [{"O": [0.0, 0.0, 0.0]}, {"H": [0.0, 0.0, 0.97]}]}

def base():
    inp = Inputfile()
    inp.set_hgrid(0.45)
    inp.set_rmult(coarse=5.0, fine=8.0)
    inp.set_xc("PBE")
    return inp

code = SystemCalculator(omp=os.environ.get("OMP_NUM_THREADS", "2"), verbose=False)

inp = base()                                     # a plain single point, orbitals kept
inp.write_orbitals_on_disk()
code.run(name="h2o", input=inp, posinp=WATER)

inp = base()                                     # a geometry optimisation: one document per step
inp.optimize_geometry(method="SQNM", nsteps=30, forcemax=1.0e-3)
code.run(name="h2o_relax", input=inp, posinp=WATER)

inp = base()                                     # a spin-polarised system: the OH radical
inp.spin_polarize(mpol=1)
code.run(name="oh", input=inp, posinp=OH)

def hybrid():
    inp = base()
    inp.set_xc("PBE0")
    for element in ("H", "O"):
        inp["psppar." + element] = {"Pseudopotential XC": 11}
    inp.read_orbitals_from_disk()
    return inp

os.makedirs("data-pbe0_restart")                 # a restart from the orbitals of h2o: a log with warnings
for name in os.listdir("data-h2o"):
    if name.startswith("wavefunction"):
        shutil.copy2(os.path.join("data-h2o", name), "data-pbe0_restart")
code.run(name="pbe0_restart", input=hybrid(), posinp=WATER)
code.run(name="pbe0_cold", input=hybrid(), posinp=WATER)   # the same without the files: BigDFT only warns

inp = base()                                     # an input BigDFT refuses: a hybrid without pseudopotential
inp.set_xc("PBE0")
SystemCalculator(omp="1", dry_run=True, verbose=False).run(name="refused", input=inp, posinp=WATER)

with open("h2o.xyz", "w") as f:                  # a structure file
    f.write("3 angstroem\nfree\nO 0.0 0.0 0.0\nH 0.757 0.5859 0.0\nH -0.757 0.5859 0.0\n")
'''


def fixtures(directory):
    directory = os.path.abspath(directory)
    if not os.path.isdir(directory):
        os.makedirs(directory)
    script = os.path.join(directory, "make_fixtures.py")
    with open(script, "w") as f:
        f.write(FIXTURES.lstrip())
    done = subprocess.run([sys.executable, script], cwd=directory, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                          universal_newlines=True)
    wanted = ["log-h2o.yaml", "log-h2o_relax.yaml", "log-oh.yaml", "log-pbe0_restart.yaml", "log-pbe0_cold.yaml", "h2o.xyz"]
    missing = [w for w in wanted if not os.path.isfile(os.path.join(directory, w))]
    print("fixtures: exit %d, %d files%s" % (done.returncode, len(os.listdir(directory)),
                                            ", MISSING " + ", ".join(missing) if missing else ""))
    if done.returncode or missing:
        print(done.stdout[-3000:])
        return 1
    return 0


# --------------------------------------------------------------------------- input variables

def parameters(out, fixtures_dir):
    """Every input variable of the installed BigDFT, as its own log states them.

    A log repeats the whole input, defaults included, with the comment of each
    variable. That block is the list for this version: no source tree needed.
    """
    with open(os.path.join(fixtures_dir, "log-h2o.yaml")) as f:
        lines = f.read().split("\n")
    start = next(i for i, l in enumerate(lines) if re.match(r"\s*#-+ Input parameters", l))
    block = []
    for line in lines[start + 1:]:
        if re.match(r"\s*#-+", line):
            break
        block.append(line)
    found, stack = [], []
    for line in block:
        m = re.match(r"^( +)([^\s#:][^:#]*?)\s*:(?:\s+(.*?))?\s*(?:#\s*(.*))?$", line)
        if not m:
            continue
        indent, key, value, comment = len(m.group(1)), m.group(2).strip(), m.group(3), m.group(4)
        while stack and stack[-1][0] >= indent:
            stack.pop()
        path = ".".join([k for _, k in stack] + [key])
        if value in (None, ""):
            stack.append((indent, key))
            continue
        top = path.split(".")[0]
        if top == "posinp" or top.startswith("psppar"):
            continue
        found.append({"path": path, "section": ".".join(path.split(".")[:-1]), "name": key,
                      "default": value.strip(), "comment": (comment or "").strip()})
    print("parameters: %d input variables in %d sections" % (len(found), len(set(p["section"] for p in found))))
    return write(out, "parameters.json", found)


# --------------------------------------------------------------------------- snippets

def header(path):
    """Intent, description and `key: value` fields from a snippet's docstring."""
    with open(path) as f:
        source = f.read()
    doc = ast.get_docstring(ast.parse(source)) or ""
    paragraphs = [p.strip() for p in doc.split("\n\n") if p.strip()]
    fields, prose = {}, []
    for para in paragraphs:
        if all(re.match(r"^[a-z_]+:\s", line) for line in para.split("\n")):
            for line in para.split("\n"):
                key, value = line.split(":", 1)
                fields[key.strip()] = value.strip()
        else:
            prose.append(" ".join(para.split()))
    return {"intent": prose[0] if prose else os.path.basename(path), "description": " ".join(prose[1:]),
            "fields": fields, "source": source}


def run_traced(snippet):
    """Child process: execute one snippet and report which PyBigDFT functions it calls."""
    _, root = package()
    snippet = os.path.abspath(snippet)
    calls = {}

    def profiler(frame, event, arg):
        if event != "call":
            return
        code = frame.f_code
        if not code.co_filename.startswith(root):
            return
        caller, depth = frame.f_back, 1
        while caller is not None and depth <= 3:
            if caller.f_code.co_filename == snippet:
                key = (os.path.relpath(code.co_filename, os.path.dirname(root)), code.co_firstlineno, code.co_name)
                if key not in calls or calls[key] > depth:
                    calls[key] = depth
                return
            if not caller.f_code.co_filename.startswith(root):
                return
            caller, depth = caller.f_back, depth + 1

    with open(snippet) as f:
        code = compile(f.read(), snippet, "exec")
    scope = {"__name__": "__main__", "__file__": snippet}
    status = "passed"
    sys.setprofile(profiler)
    try:
        exec(code, scope)
    except SystemExit as exc:
        if exc.code not in (0, None):
            status = "failed"
            print("SystemExit: %r" % (exc.code,))
    except BaseException:
        status = "failed"
        sys.setprofile(None)
        traceback.print_exc(file=sys.stdout)
    finally:
        sys.setprofile(None)
    sys.stdout.flush()
    report = {"status": status, "calls": [{"file": k[0], "line": k[1], "name": k[2], "depth": d}
                                          for k, d in sorted(calls.items())]}
    with open(os.environ["SNIPPET_REPORT"], "w") as f:
        json.dump(report, f)


def snippets(out, directory, fixtures_dir):
    results = []
    names = sorted(n for n in os.listdir(directory) if n.endswith(".py"))
    for name in names:
        path = os.path.join(directory, name)
        head = header(path)
        work = tempfile.mkdtemp(prefix="snippet_")
        for item in os.listdir(fixtures_dir):
            src = os.path.join(fixtures_dir, item)
            if os.path.isdir(src):
                shutil.copytree(src, os.path.join(work, item))
            else:
                shutil.copy2(src, work)
        before = set(os.listdir(work))
        local = os.path.join(work, name)
        shutil.copy2(path, local)
        report = os.path.join(work, ".report.json")
        env = dict(os.environ, SNIPPET_REPORT=report, MPLBACKEND="Agg")
        start = time.time()
        try:
            done = subprocess.run([sys.executable, os.path.abspath(__file__), "_run", local], cwd=work, env=env,
                                  stdout=subprocess.PIPE, stderr=subprocess.STDOUT, universal_newlines=True,
                                  timeout=SNIPPET_TIMEOUT)
            output, code = done.stdout, done.returncode
        except subprocess.TimeoutExpired as exc:
            output, code = (exc.stdout or "") + "\nTIMEOUT", -1
        traced = {"status": "failed", "calls": []}
        if os.path.isfile(report):
            with open(report) as f:
                traced = json.load(f)
        if code != 0:
            traced["status"] = "failed"
        output = "\n".join(l for l in output.split("\n") if "libtinfo" not in l).strip()
        created = sorted(set(os.listdir(work)) - before - {name, ".report.json"})
        results.append({"file": name, "intent": head["intent"], "description": head["description"],
                        "fields": head["fields"], "status": traced["status"], "seconds": round(time.time() - start, 1),
                        "output": output[-OUTPUT_LIMIT:], "calls": traced["calls"], "created": created})
        print("%-7s %5.1fs  %s" % (traced["status"], time.time() - start, name))
        if traced["status"] != "passed":
            print("    " + "\n    ".join(output.split("\n")[-12:]))
        shutil.rmtree(work, ignore_errors=True)
    passed = sum(1 for r in results if r["status"] == "passed")
    print("snippets: %d passed, %d failed" % (passed, len(results) - passed))
    write(out, "snippets.json", results)
    return 0 if passed == len(results) else 1


def main(argv):
    if len(argv) < 2:
        print(__doc__)
        return 2
    step = argv[1]
    if step == "_run":
        run_traced(argv[2])
        return 0
    if step == "api":
        api(argv[2])
    elif step == "actions":
        actions(argv[2])
    elif step == "fixtures":
        return fixtures(argv[2])
    elif step == "parameters":
        parameters(argv[2], argv[3])
    elif step == "snippets":
        return snippets(argv[2], argv[3], argv[4])
    elif step == "all":
        out, directory = argv[2], argv[3]
        fix = os.path.join(out, "fixtures")
        if fixtures(fix):
            return 1
        api(out)
        actions(out)
        parameters(out, fix)
        code = snippets(out, directory, fix)
        write(out, "versions.json", versions(fix))
        return code
    else:
        print(__doc__)
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
