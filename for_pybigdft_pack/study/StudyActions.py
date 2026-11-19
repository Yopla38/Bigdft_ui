"""Steps of a study: the registry.

A study is a sequence of steps built on one structure. This module holds the
steps a study can be made of, the way ``BigDFT.InputActions`` holds the actions
an input file can be made of, and with the same convention: plain functions
whose first argument is the study, defaults for everything, and each of them
also available as a method of a :class:`Studies.Study` (``study.relax(...)`` is
``StudyActions.relax(study, ...)``). An interface reads this module to know
which boxes exist and how to draw them.

A step returns a handle. **Passing that handle to another step is the link
between them**: ``after=`` continues a calculation, ``of=`` varies it, ``among=``
decides on a series, ``a=`` and ``b=`` compare.

A calculation step is described by *input actions*: keyword arguments named
after the functions of ``BigDFT.InputActions``. ``set_xc="PBE"`` calls
``inp.set_xc("PBE")``; a dictionary gives keyword arguments
(``set_rmult={"coarse": 5.0, "fine": 8.0}``); ``True`` calls the action without
argument. A step that continues another one inherits all its actions and adds
its own.

We now list the available steps, in order of category.

Calculations
------------

.. autosummary::

   calculation
   relax

Pre-filled calculations
-----------------------

.. autosummary::

   ionised
   triplet
   hybrid

Series and decisions
--------------------

.. autosummary::

   converge
   choose

Results
-------

.. autosummary::

   difference
   target
"""


def calculation(study, name, after=None, keys=None, **actions):
    """One BigDFT calculation: an energy, at a fixed geometry.

    The first calculation of a study carries its settings. Any other one
    continues a step (``after``): it inherits every setting of that step and
    adds or changes some. After a relaxation it starts from the relaxed geometry.

    Args:
       name (str): name of the step; it becomes the name of the run.
       after (Step): the step this one continues. None for the first one.
       keys (dict): input keys written directly, ``{"dft": {"itermax": 200}}``,
          for what no input action covers.
       **actions: input actions, by name, with their argument.
    """
    return study.add("calculation", name, after=after, actions=actions, keys=keys)


def relax(study, name, after=None, method="SQNM", nsteps=300, forcemax=2.0e-4, keys=None, **actions):
    """Relax the geometry: move the atoms until the forces vanish.

    Continues a calculation with the same settings and optimises its geometry.
    The steps that continue a relaxation start from the geometry it ended on.

    Args:
       name (str): name of the step.
       after (Step): the calculation whose settings and geometry are taken.
       method (str): optimiser. SQNM suits molecules.
       nsteps (int): maximum number of steps.
       forcemax (float): stop when the largest force is below this, in Ha/bohr.
       keys (dict): input keys written directly.
       **actions: further input actions.
    """
    return study.add("relax", name, after=after, actions=actions, keys=keys,
                     params={"method": method, "nsteps": nsteps, "forcemax": forcemax})


def ionised(study, name, after, charge=1, unpaired=1):
    """The same system with an electron removed: the partner of an ionisation energy.

    A calculation that continues ``after`` with another total charge. Removing
    one electron from a closed shell leaves one unpaired electron, so the
    calculation is spin-polarised.

    Args:
       name (str): name of the step.
       after (Step): the neutral calculation, or its relaxation.
       charge (int): total charge. +1 removes one electron.
       unpaired (int): number of unpaired electrons; it must have the parity of the electron count.
    """
    return calculation(study, name, after=after, charge=charge, spin_polarize=unpaired)


def triplet(study, name, after):
    """The lowest triplet state: two unpaired electrons, and the settings a triplet needs.

    A calculation that continues ``after`` with two unpaired electrons. It
    arrives with what triplets were found to need: more iterations and
    restarts than the defaults allow, and a tighter criterion, without which
    runs on neighbouring grids can stop on different electronic states while
    each reports convergence.

    Args:
       name (str): name of the step.
       after (Step): the singlet calculation, or its relaxation.
    """
    return calculation(study, name, after=after, spin_polarize=2, set_scf_convergence={"gnrm": 1.0e-5},
                       keys={"dft": {"itermax": 200, "nrepmax": 5}})


def hybrid(study, name, after, xc="PBE0"):
    """The same calculation with a hybrid functional, at the same geometry.

    Hybrids cost much more than PBE: the usual practice is to relax with PBE
    and compute the energy with the hybrid there. The pseudopotentials are the
    PBE ones, named for each element, since none is registered for a hybrid.

    Args:
       name (str): name of the step.
       after (Step): the calculation or the relaxation to recompute.
       xc (str): "PBE0", "B3LYP" or "HF".
    """
    return calculation(study, name, after=after, set_xc=xc)


def converge(study, name, of, action="set_hgrid", values=(0.50, 0.45, 0.40, 0.35), within=1.0e-3,
             relative_to=None, per_atom=True):
    """Vary one setting of a calculation and see when the result stops changing.

    Runs the calculation ``of`` once per value. The values go from the cheapest
    to the most accurate: the last one is the reference. The step proposes the
    first value whose result is within ``within`` of the reference, and nothing
    if only the reference itself is: the series must then be extended. With
    ``relative_to``, what is watched is the difference between the two
    calculations, both varied: converge the quantity the study is about, which
    usually settles long before a total energy does.

    Args:
       name (str): name of the step.
       of (Step): the calculation to vary.
       action (str): the input action whose argument is varied.
       values (tuple): its values, from the cheapest to the most accurate.
       within (float): tolerance, in eV (per atom for a total energy).
       relative_to (Step): a second calculation; the criterion is then on E(of) - E(relative_to).
       per_atom (bool): divide a total energy by the number of atoms. Ignored with relative_to.
    """
    return study.add("converge", name, of=of, relative_to=relative_to,
                     params={"action": action, "values": list(values), "within": within, "per_atom": per_atom})


def choose(study, name, among, retained=None, because=""):
    """Decide on the value of a setting, for every step that follows.

    The series ``among`` proposes a value; this step retains one. Left alone it
    retains the proposal. A person may retain another value and say why: the
    reason is kept with the study. Every step defined after this one uses the
    retained value.

    Args:
       name (str): name of the step.
       among (Step): the convergence series the decision is taken on.
       retained: the value kept. None keeps what the series proposes.
       because (str): the reason, when it is not the proposal.
    """
    return study.add("choose", name, among=among, params={"retained": retained, "because": because})


def difference(study, name, a, b, unit="eV", against=None):
    """The energy of one step minus the energy of another.

    Args:
       name (str): name of the result.
       a (Step): first calculation or relaxation.
       b (Step): the one subtracted.
       unit (str): "eV", "kJ/mol" or "Ha".
       against (Step): a target to judge the result with.
    """
    return study.add("difference", name, a=a, b=b, against=against, params={"unit": unit})


def target(study, name, value, within, unit="eV", source=""):
    """A reference value and the window that counts as agreement, set before computing.

    Args:
       name (str): what the value is.
       value (float): the reference, from experiment or from another calculation.
       within (float): half-width of the window.
       unit (str): "eV", "kJ/mol" or "Ha".
       source (str): where the value comes from.
    """
    return study.add("target", name, params={"value": value, "within": within, "unit": unit, "source": source})
