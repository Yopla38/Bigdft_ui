"""A study: steps built on a structure, prepared here and computed elsewhere.

    from Studies import Study
    study  = Study(structure, name="water")
    ground = study.calculation("ground", set_xc="PBE", set_hgrid=0.45)
    cation = study.calculation("cation", after=ground, charge=1, spin_polarize=1)
    ip     = study.difference("ionisation energy", cation, ground)

    study.prepare()    # writes runs/NAME.yaml for every run that is ready, dry-runs it
    #   -> the names it returns go to the HAPS:  haps_bigdft(names=[...], directory="runs")
    study.analyse()    # reads the logs that came back

The steps are the functions of :mod:`StudyActions`; each is a method of the
study. ``prepare`` and ``analyse`` can be repeated: a finished run is never
prepared again, a missing one is simply absent from the results.

Written for the Python of the pack's container (3.7).
"""
from __future__ import print_function

import glob
import hashlib
import json
import os
import re
import shutil
from collections import OrderedDict
from functools import partial

HA = {"eV": 27.211386245988, "kJ/mol": 2625.4996394799, "Ha": 1.0}
# A run name: what the HAPS accepts, and no longer than BigDFT keeps. Its dry run truncates
# the name of the log at 30 characters, and PyBigDFT then finds no log at all.
LONGEST = 30
NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,%d}$" % (LONGEST - 1))
ERRORS = "List of error found while parsing input variables"
CALC = ("calculation", "relax")
SERIES = ("converge", "vary")
GAP = "HOMO LUMO gap (AU, eV)"


class Step(object):
    """What a step function returns: pass it to another step to link them."""

    def __init__(self, kind, name, order, links, actions, keys, params):
        self.kind, self.name, self.order = kind, name, order
        self.links = links                      # after, wavefunctions, of, relative_to, among, a, b, against
        self.actions = actions or {}
        self.keys = keys or {}
        self.params = params or {}

    def __repr__(self):
        return "<%s %r>" % (self.kind, self.name)


def run_name(text):
    name = re.sub(r"[^A-Za-z0-9_-]+", "_", str(text)).strip("_")
    if not NAME.match(name):
        raise ValueError("%r cannot be a run name: letters, digits, '_' and '-', %d characters at most "
                         "(BigDFT truncates a longer one)" % (text, LONGEST))
    return name


def member_name(base, action, value, argument=None):
    """The name of one run of a series: the calculation varied, shortened if needed, and the value."""
    suffix = "-%s%s" % ((argument or re.sub(r"^set_", "", action))[:6], tag(value))
    return run_name(base[:LONGEST - len(suffix)].rstrip("_-") + suffix)


def tag(value):
    """A value as part of a run name: 0.45 -> 0p45."""
    return re.sub(r"[^A-Za-z0-9]+", "p", ("%g" % value) if isinstance(value, float) else str(value)).strip("p")


def apply_action(inp, name, argument):
    action = getattr(inp, name, None)
    if action is None:
        raise ValueError("%r is not an input action of this PyBigDFT" % name)
    if argument is True:
        action()
    elif isinstance(argument, dict):
        action(**argument)
    else:
        action(argument)


class Study(object):
    def __init__(self, structure, name="study", run_dir="runs"):
        import StudyActions

        self.name, self.run_dir, self._building, self._undecided = name, run_dir, None, False
        self.system = self._read(structure)       # the structure the study is built on; `structure` is a step of the registry
        self.steps = OrderedDict()
        for action in dir(StudyActions):          # the registry, as methods: study.relax(...) is StudyActions.relax(study, ...)
            func = getattr(StudyActions, action)
            if not action.startswith("_") and callable(func):
                setattr(self, action, partial(func, self))

    # ------------------------------------------------------------------ building
    @staticmethod
    def _read(structure):
        if isinstance(structure, dict):
            return structure
        import yaml
        if str(structure).endswith((".yaml", ".yml")):
            with open(structure) as f:
                return yaml.safe_load(f)
        from BigDFT.IO import read_xyz
        with open(structure) as f:
            posinp = read_xyz(f, fragmentation="single").get_posinp()
        return {"units": posinp["units"], "positions": [{k: v for k, v in at.items() if k != "frag"} for at in posinp["positions"]]}

    def add(self, kind, name, actions=None, keys=None, params=None, **links):
        if name in self.steps:
            raise ValueError("a step is already called %r" % name)
        run_name(name)
        for role, other in list(links.items()):
            if other is None:
                del links[role]
            elif not isinstance(other, Step) or self.steps.get(other.name) is not other:
                raise ValueError("%s=%r of step %r is not a step of this study" % (role, other, name))
        step = Step(kind, name, len(self.steps), links, actions, keys, params)
        self._check(step)
        self.steps[name] = step
        return step

    def _check(self, step):
        """A link is checked when it is made, like an input key."""
        link, kind = step.links, step.kind
        calc = CALC
        if kind in calc and "after" in link and link["after"].kind not in calc:
            raise ValueError("%r continues %r, which is not a calculation" % (step.name, link["after"].name))
        if "on" in link and link["on"].kind != "structure":
            raise ValueError("%r is computed on %r, which is not a structure" % (step.name, link["on"].name))
        if "wavefunctions" in link and link["wavefunctions"].kind not in calc:
            raise ValueError("%r starts from the wavefunctions of %r, which is not a calculation" % (step.name, link["wavefunctions"].name))
        if kind == "relax" and "after" not in link and not step.actions:
            raise ValueError("%r relaxes nothing: give after=, or its settings" % step.name)
        if kind in SERIES:
            if link["of"].kind != "calculation":
                raise ValueError("%r varies %r, which is not a single calculation" % (step.name, link["of"].name))
            if "relative_to" in link and link["relative_to"].kind != "calculation":
                raise ValueError("relative_to of %r is not a single calculation" % step.name)
        if kind == "choose" and link["among"].kind not in SERIES:
            raise ValueError("%r decides on %r, which is not a series" % (step.name, link["among"].name))
        if kind == "levels" and link["of"].kind not in calc:
            raise ValueError("%r reads the levels of %r, which is not a calculation" % (step.name, link["of"].name))
        if kind == "difference":
            for role in ("a", "b"):
                if link[role].kind not in calc:
                    raise ValueError("%r compares %r, which has no energy" % (step.name, link[role].name))
        if kind == "combination":
            terms = [link[role] for role in sorted(link) if role.startswith("term")]
            if not terms:
                raise ValueError("%r combines nothing" % step.name)
            for term in terms:
                if term.kind not in calc:
                    raise ValueError("%r combines %r, which has no energy" % (step.name, term.name))
        if "against" in link and link["against"].kind != "target":
            raise ValueError("against of %r is not a target" % step.name)

    # ------------------------------------------------------------------ what is to be run
    def _chain(self, step):
        chain = []
        while step is not None:
            chain.append(step)
            step = step.links.get("after")
        return chain[::-1]

    def _on(self, step):
        """The structure step a calculation is computed on: its own, or the nearest one up the steps it
        continues. None: the structure of the study."""
        for ancestor in reversed(self._chain(step)):
            if "on" in ancestor.links:
                return ancestor.links["on"]
        return None

    def structure_of(self, step):
        """The structure a calculation is computed on, as it was given."""
        on = self._on(step)
        return self.system if on is None else on.params["structure"]

    def _decisions(self, before):
        """Settings retained by the decisions taken before a step, as (action, argument, value)."""
        out = []
        for step in self.steps.values():
            if step.kind == "choose" and step.order < before.order:
                series = step.links["among"].params
                out.append((series["action"], series.get("argument"), self.retained(step)))
        return out

    def _argument(self, step, action, argument, value):
        """What an action is called with when one of its arguments is set: the others keep what the calculation gave."""
        if not argument:
            return value
        given = {}
        for ancestor in self._chain(step):
            if isinstance(ancestor.actions.get(action), dict):
                given = dict(ancestor.actions[action])
        given[argument] = value
        return given

    def _reads_from(self, step):
        """True when another step starts from the wavefunctions of this one: it must write them."""
        return any(other.links.get("wavefunctions") is step for other in self.steps.values())

    def _input(self, step, override=None):
        """The input of a calculation step: what it inherits, what it adds, what was decided before it."""
        from BigDFT.Inputfiles import Inputfile
        inp = Inputfile()
        for ancestor in self._chain(step):
            for name, argument in ancestor.actions.items():
                apply_action(inp, name, argument)
            for section, values in ancestor.keys.items():
                inp.setdefault(section, {}).update(values)
        if step.kind == "relax":
            inp.optimize_geometry(method=step.params["method"], nsteps=step.params["nsteps"], forcemax=step.params["forcemax"])
        self._undecided = False
        for name, argument, value in self._decisions(step) + ([override] if override else []):
            if value is None:
                self._undecided = True            # a decision this step depends on cannot be taken yet
            else:
                apply_action(inp, name, self._argument(step, name, argument, value))
        if "wavefunctions" in step.links:         # this step only: what continues it starts from scratch again
            apply_action(inp, "read_orbitals_from_disk", True)
        if self._reads_from(step):
            apply_action(inp, "write_orbitals_on_disk", True)
        xc = str(inp.get("dft", {}).get("ixc", ""))
        if xc in ("PBE0", "B3LYP", "HF", "-406", "-402", "100"):       # no pseudopotential is registered for a hybrid
            for element in sorted({k for at in self.structure_of(step)["positions"] for k in at}):
                inp.setdefault("psppar." + element, {"Pseudopotential XC": 11})
        return inp

    def _geometry_from(self, step):
        """The relaxation whose final geometry a step starts from, if any. A step computed on another
        structure (``on``) starts from that structure as given: what was relaxed before it is another system."""
        if "on" in step.links:
            return None
        chain = self._chain(step)[:-1]
        for ancestor in reversed(chain):
            if ancestor.kind == "relax":
                return ancestor
            if "on" in ancestor.links:
                return None
        return None

    def runs(self):
        """Every BigDFT run of the study. Two runs with the same input and geometry are computed once."""
        out, seen = [], {}
        self._building = out        # a decision reads the series before it: those runs are already in the list
        def add(step, name, override=None, member=None):
            inp = self._input(step, override)
            undecided = self._undecided
            source = self._geometry_from(step)
            source_run = self._run_of(source, out) if source is not None else None
            orbitals = step.links.get("wavefunctions")
            orbitals_run = self._run_of(orbitals, out) if orbitals is not None else None
            asked = json.loads(json.dumps(dict(inp), default=str))
            writes = asked.get("output", {}).pop("orbitals", None)       # writing its wavefunctions changes nothing of a run
            if asked.get("output") == {}:
                del asked["output"]
            on = self._on(step)
            print_ = hashlib.sha256(json.dumps([asked, source_run, orbitals_run, on and on.name], sort_keys=True).encode()).hexdigest()[:16]
            if undecided:
                print_ = "undecided-" + name     # its input is not known yet: it is nobody's twin
            run = {"name": seen.get(print_, name), "own_name": name, "step": step.name, "member": member, "input": inp,
                   "structure": on and on.name, "geometry_from": source_run, "wavefunctions_from": orbitals_run, "fingerprint": print_, "alias": print_ in seen, "undecided": undecided}
            if run["alias"] and writes:           # its twin is the one computed: that one writes them
                next(r for r in out if r["name"] == run["name"] and not r["alias"])["input"] = inp
            seen.setdefault(print_, name)
            out.append(run)
        for step in self.steps.values():
            if step.kind in CALC:
                add(step, run_name(step.name))
            elif step.kind in SERIES:
                action, argument = step.params["action"], step.params.get("argument")
                for value in step.params["values"]:
                    for role in ("of", "relative_to"):
                        if role in step.links:
                            base = step.links[role]
                            add(base, member_name(base.name, action, value, argument), (action, argument, value), (step.name, role, value))
        self._building = None
        return out

    @staticmethod
    def _run_of(step, runs):
        return next(r["name"] for r in runs if r["step"] == step.name and r["member"] is None)

    # ------------------------------------------------------------------ files
    def _path(self, name):
        return os.path.join(self.run_dir, name)

    def _log(self, run):
        """The last document of a finished log: a relaxation logs every step."""
        from BigDFT.Logfiles import Logfile
        path = self._path("log-%s.yaml" % run)
        if not os.path.isfile(path):
            return None
        try:
            log = Logfile(path)
            last = log if len(log) == 0 else log[len(log) - 1]
            return last if getattr(last, "energy", None) is not None else None
        except Exception:
            return None

    def _relaxed(self, run):
        import yaml
        path = self._path("final_%s.yaml" % run)
        if not os.path.isfile(path) or self._log(run) is None:
            return None
        with open(path) as f:
            final = yaml.safe_load(f)
        return {"units": final.get("units", "angstroem"),
                "positions": [{k: v for k, v in at.items() if k != "force"} for at in final["positions"]]}

    # ------------------------------------------------------------------ the two verbs
    def prepare(self, verbose=True, only=None):
        """Write and dry-run every run that can be; say which names to send, which wait, which are refused.

        ``only`` names the runs to look at: the others are left as they are, neither dry-run nor listed.
        A dry run is a round trip to the dry-run HAPS; a caller that sends one step does not pay for all."""
        from BigDFT.Calculators import SystemCalculator
        code = SystemCalculator(omp="1", dry_run=True, verbose=False)
        ready, waiting, refused, done = [], [], OrderedDict(), []
        for run in self.runs():
            name = run["name"]
            if run["alias"] or name in ready or name in waiting or name in refused:
                continue
            if only is not None and name not in only:
                continue
            if self._log(name) is not None:
                done.append(name)
                continue                                   # computed: a dry run would overwrite its log
            if run["undecided"]:
                waiting.append(name)                       # a decision it depends on needs results first
                continue
            posinp = self.structure_of(self.steps[run["step"]])
            if run["geometry_from"]:
                posinp = self._relaxed(run["geometry_from"])
                if posinp is None:
                    waiting.append(name)
                    continue
            origin = run["wavefunctions_from"]
            if origin:
                if self._log(origin) is None:
                    waiting.append(name)
                    continue
                problem = self._cannot_read(run, origin)
                if problem:
                    refused[name] = problem
                    continue
            doc = code.run(name=name, input=run["input"], posinp=posinp, run_dir=self.run_dir).log
            problem = doc.get("Additional Info") or doc.get(ERRORS)
            if problem:
                refused[name] = problem
            else:
                if origin:                             # BigDFT reads them in the run's own data directory
                    target = self._path("data-" + name)
                    if not os.path.isdir(target):
                        os.makedirs(target)
                    for path in glob.glob(self._path(os.path.join("data-" + origin, "wavefunction*"))):
                        shutil.copy2(path, target)
                ready.append(name)
        self.write_manifest()
        if verbose:
            print("computed:", done)
            print("ready for the HAPS:", ready)
            print("waiting for an earlier run or a decision:", waiting)
            print("refused by the dry run:", dict(refused))
        return {"ready": ready, "waiting": waiting, "refused": refused, "computed": done}

    def _cannot_read(self, run, origin):
        """Why a run cannot start from the wavefunctions of another, or None. A dry run does not check it:
        BigDFT only warns when the files are missing, and starts from scratch."""
        if not glob.glob(self._path(os.path.join("data-" + origin, "wavefunction*"))):
            return ("%r was computed without writing its wavefunctions: remove log-%s.yaml to compute it again" % (origin, origin))
        read = next(r for r in self.runs() if r["name"] == origin and not r["alias"])
        if read["structure"] != run["structure"]:
            return "the wavefunctions of %r are for another structure" % origin
        source = read["input"].get("dft", {})
        mine = run["input"].get("dft", {})
        for key, what in (("qcharge", "charge"), ("nspin", "spin treatment"), ("mpol", "number of unpaired electrons")):
            if mine.get(key) != source.get(key):
                return "the wavefunctions of %r are for another %s" % (origin, what)
        return None

    def _step_log(self, step):
        run = next(r for r in self.runs() if r["step"] == step.name and r["member"] is None)
        return None if run["undecided"] else self._log(run["name"])

    def energy(self, step):
        log = self._step_log(step)
        return None if log is None else log.energy

    def levels_of(self, step):
        """Highest occupied level, gap and levels of a calculation, in eV, as BigDFT printed them."""
        log = self._step_log(step)
        if log is None:
            return None
        gap = None
        for item in log.log.get("Complete list of energy eigenvalues") or []:
            if GAP in item:
                gap = item[GAP][len(item[GAP]) // 2:]              # the second half is in eV, one value per spin
        return {"homo_eV": log.fermi_level * HA["eV"], "gap_eV": None if gap is None else gap[0] if len(gap) == 1 else gap,
                "levels_eV": [[e * HA["eV"] for e in spin if e == e] for spin in log.evals[0].tolist()]}

    def series(self, step):
        """The table of a series, and for a convergence the value it proposes."""
        building = getattr(self, "_building", None)
        runs, natoms = (building if building is not None else self.runs()), len(self.structure_of(step.links["of"])["positions"])
        rows = []
        for value in step.params["values"]:
            e = {}
            for run in runs:
                if run["member"] and run["member"][0] == step.name and run["member"][2] == value:
                    log = self._log(run["name"])
                    e[run["member"][1]] = None if log is None else log.energy
            if e.get("of") is None or ("relative_to" in step.links and e.get("relative_to") is None):
                rows.append({"value": value, "quantity": None})
            elif "relative_to" in step.links:
                rows.append({"value": value, "quantity": (e["of"] - e["relative_to"]) * HA["eV"]})
            else:
                rows.append({"value": value, "quantity": e["of"] * HA["eV"] / (natoms if step.params.get("per_atom") else 1)})
        proposed = None
        if step.kind == "vary":
            if "against" in step.links:
                t = step.links["against"].params
                for r in rows:
                    if r["quantity"] is not None:
                        r["agrees"] = abs(r["quantity"] - t["value"]) <= t["within"]
        elif rows and all(r["quantity"] is not None for r in rows):
            reference = rows[-1]["quantity"]
            for r in rows:
                r["from_reference"] = abs(r["quantity"] - reference)
            # the reference agrees with itself: it proves nothing. Only a cheaper value that agrees with it does.
            proposed = next((r["value"] for r in rows[:-1] if r["from_reference"] <= step.params["within"]), None)
        return {"rows": rows, "proposed": proposed}

    def retained(self, step):
        if step.params["retained"] is not None:
            return step.params["retained"]
        return self.series(step.links["among"])["proposed"]

    def analyse(self, verbose=True):
        """What each step gave, from the logs that are back."""
        out = OrderedDict()
        for step in self.steps.values():
            if step.kind in CALC:
                out[step.name] = {"energy_Ha": self.energy(step)}
            elif step.kind in SERIES:
                out[step.name] = self.series(step)
            elif step.kind == "levels":
                out[step.name] = self.levels_of(step.links["of"])
            elif step.kind == "choose":
                out[step.name] = {"retained": self.retained(step), "proposed": self.series(step.links["among"])["proposed"],
                                  "because": step.params["because"]}
            elif step.kind == "difference":
                a, b = self.energy(step.links["a"]), self.energy(step.links["b"])
                value = None if a is None or b is None else (a - b) * HA[step.params["unit"]]
                result = {"value": value, "unit": step.params["unit"]}
                if "against" in step.links and value is not None:
                    t = step.links["against"].params
                    result.update(target=t["value"], within=t["within"], agrees=abs(value - t["value"]) <= t["within"])
                out[step.name] = result
            elif step.kind == "combination":
                terms = [(c, step.links["term%d" % (i + 1)]) for i, c in enumerate(step.params["coefficients"])]
                energies = [self.energy(term) for _, term in terms]
                value = None if any(e is None for e in energies) else sum(c * e for (c, _), e in zip(terms, energies)) * HA[step.params["unit"]]
                result = {"value": value, "unit": step.params["unit"], "terms": [[c, term.name] for c, term in terms]}
                if "against" in step.links and value is not None:
                    t = step.links["against"].params
                    result.update(target=t["value"], within=t["within"], agrees=abs(value - t["value"]) <= t["within"])
                out[step.name] = result
            elif step.kind == "structure":
                out[step.name] = {"atoms": len(step.params["structure"]["positions"]), "source": step.params["source"]}
            elif step.kind == "target":
                out[step.name] = dict(step.params)
        if verbose:
            import yaml
            print(yaml.safe_dump(json.loads(json.dumps(out)), sort_keys=False, default_flow_style=False))
        return out

    def write_manifest(self):
        """What the study is and which run is which: for whoever reads the logs afterwards."""
        runs = [{"name": r["name"], "own_name": r["own_name"], "step": r["step"], "member": r["member"], "alias": r["alias"], "undecided": r["undecided"],
                 "structure": r["structure"], "geometry_from": r["geometry_from"], "wavefunctions_from": r["wavefunctions_from"], "input": json.loads(json.dumps(dict(r["input"]), default=str))} for r in self.runs()]
        steps = [{"name": s.name, "kind": s.kind, "links": {k: v.name for k, v in s.links.items()}, "actions": s.actions,
                  "keys": s.keys, "params": s.params} for s in self.steps.values()]
        if not os.path.isdir(self.run_dir):
            os.makedirs(self.run_dir)
        with open(self._path("manifest.json"), "w") as f:
            json.dump({"study": self.name, "structure": self.system, "steps": steps, "runs": runs}, f, indent=1, default=str)
