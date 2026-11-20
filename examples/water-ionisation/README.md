# The ionisation energy of water, built step by step

A study of sixteen steps written with workshop 2 ("Load an example", then the Script tab) and executed as written with BigDFT 1.9.1 and PyBigDFT 0.9, through the registry of steps in `for_pybigdft_pack/study`.

| File | What |
|---|---|
| `study.py` | The script, exactly as the workshop writes it |
| `runs/*.yaml` | The inputs the registry wrote, one per run |
| `runs/log-*.yaml` | BigDFT's logs |
| `runs/final_*.yaml` | The relaxed geometries |
| `runs/manifest.json` | Which run is which step, its input, the geometry it starts from, the run whose wavefunctions it reads |
| `analysis.txt` | What the run printed: the waves, then what `study.analyse()` gives for each step |

## What it does

1. Sets the target before computing: 12.62 ± 0.3 eV, the measured first ionisation energy.
2. Computes the ground state and the cation.
3. Varies the grid spacing over 0.50, 0.45, 0.40 and 0.35 bohr and watches the energy difference. The criterion (within 10 meV of the finest grid) proposes 0.45.
4. Retains 0.40 instead, with the reason: the energy difference is converged at 0.45, the geometry is not. Relaxed at 0.45 the H–O–H angle is 99.7°, for 105.0° at 0.40 and 104.5° at 0.35.
5. Relaxes the molecule, computes the cation at that geometry, then relaxes the cation.
6. Lays three functionals side by side on the energy difference, each judged against the target.
7. Recomputes the neutral and the cation with PBE0 at the PBE geometry, each started from the PBE wavefunctions of the step it continues.
8. Computes four empty states at the relaxed geometry and reads the levels.

## What came out

| | |
|---|---|
| Runs | 18, in three waves. Two members of the grid series and two of the functional series are calculations other steps already ask for, and are not run twice |
| Ionisation energy, vertical, PBE | 12.564 eV, within the target |
| Ionisation energy, adiabatic, PBE | 12.459 eV |
| Functionals, at the built geometry | LDA 13.074 eV, outside the target; PBE 12.616 eV and PBE0 12.470 eV, within |
| Ionisation energy, vertical, PBE0 at the PBE geometry | 12.417 eV, within the target |
| Highest occupied level, PBE | −7.207 eV: five eV above minus the ionisation energy, as expected of PBE |
| Gap, PBE | 6.664 eV |

The second wave waits for the relaxation; the third holds the PBE0 cation, which waits for the wavefunctions of the PBE cation.

## Run it again

```bash
cp ../../for_pybigdft_pack/study/*.py .
python3 run_here.py study.py        # where bigdft runs; with the pack, haps_bigdft sends each wave
```

`node tools/check_workshop.js`, from the root of the repository, checks that the workshop still writes this script, sends these runs in these waves and shows these numbers.
