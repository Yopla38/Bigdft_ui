# Tutorial code against the installed PyBigDFT

Checked against **PyBigDFT 0.9, BigDFT 1.9.1**: 30 pages under `docs/`, 20 calls that cannot work with this version, in 9 pages.

A static reading by pattern: what is listed is certain, what is not listed is not thereby correct.

| Problem | Occurrences |
|---|---|
| module not importable | 7 |
| name absent | 5 |
| input action absent | 4 |
| module absent | 4 |

## lessons/GeometryOptimization.md

| Line | Code | Problem |
|---|---|---|
| 374 | `from BigDFT.Interop.ASEInterop import ase_to_bigdft` | `BigDFT.Interop.ASEInterop` cannot be imported here (ModuleNotFoundError: No module named 'ase') |

## school/InitialRunsLinearScaling.md

| Line | Code | Problem |
|---|---|---|
| 53 | `inp.set_psp_nlcc()  # Soft pseudopotentials` | `set_psp_nlcc` is not an input action of this version |

## school/QuickStart.md

| Line | Code | Problem |
|---|---|---|
| 279 | `inp.set_psp_nlcc()  # Soft pseudopotentials` | `set_psp_nlcc` is not an input action of this version |
| 387 | `from BigDFT.Database.Molecules import get_molecule` | `BigDFT.Database.Molecules` has no `get_molecule` in this version |

## school/implicit-solvation.md

| Line | Code | Problem |
|---|---|---|
| 116 | `from BigDFT.Database.Molecules import get_molecule` | `BigDFT.Database.Molecules` has no `get_molecule` in this version |
| 141 | `inp.set_psp_nlcc()` | `set_psp_nlcc` is not an input action of this version |
| 375 | `from BigDFT.Interop.ASEInterop import ase_to_bigdft` | `BigDFT.Interop.ASEInterop` cannot be imported here (ModuleNotFoundError: No module named 'ase') |
| 571 | `inp.set_psp_nlcc()` | `set_psp_nlcc` is not an input action of this version |

## tutorials/CH4.md

| Line | Code | Problem |
|---|---|---|
| 100 | `from BigDFT.Database.Molecules import get_molecule` | `BigDFT.Database.Molecules` has no `get_molecule` in this version |

## tutorials/CH4_aiida.md

| Line | Code | Problem |
|---|---|---|
| 181 | `from BigDFT import AiidaCalculator as calc` | `BigDFT.AiidaCalculator` cannot be imported here (ModuleNotFoundError: No module named 'aiida') |

## tutorials/Interoperability-Simulation.md

| Line | Code | Problem |
|---|---|---|
| 98 | `from BigDFT.Interop.ASEInterop import ase_potential_energy` | `BigDFT.Interop.ASEInterop` cannot be imported here (ModuleNotFoundError: No module named 'ase') |
| 113 | `from BigDFT.Interop.ASEInterop import bigdft_to_ase` | `BigDFT.Interop.ASEInterop` cannot be imported here (ModuleNotFoundError: No module named 'ase') |
| 184 | `from BigDFT.Interop.ASEInterop import ase_to_bigdft` | `BigDFT.Interop.ASEInterop` cannot be imported here (ModuleNotFoundError: No module named 'ase') |
| 236 | `from BigDFT.Interop.ASEInterop import BigASECalculator` | `BigDFT.Interop.ASEInterop` cannot be imported here (ModuleNotFoundError: No module named 'ase') |

## tutorials/PDoS.md

| Line | Code | Problem |
|---|---|---|
| 133 | `from BigDFT.PDoS import cubic_projection_info` | `BigDFT.PDoS` does not exist in this version |
| 149 | `from BigDFT.PDoS import cubic_projection_weights` | `BigDFT.PDoS` does not exist in this version |
| 279 | `from BigDFT.PDoS import linear_projection_info, linear_projection_weights` | `BigDFT.PDoS` does not exist in this version |
| 389 | `from BigDFT.PDoS import compute_fragment_weights` | `BigDFT.PDoS` does not exist in this version |
| 530 | `from BigDFT.Database.Molecules import get_molecule` | `BigDFT.Database.Molecules` has no `get_molecule` in this version |

## tutorials/Tight-Binding.md

| Line | Code | Problem |
|---|---|---|
| 72 | `from BigDFT import Systems, Fragments, Logfiles, TB` | `BigDFT` has no `TB` in this version |
