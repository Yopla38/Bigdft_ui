# The ionisation energy of water, built step by step

A study written with workshop 2 ("Load an example", then the Script tab) and executed as written with BigDFT 1.9.1 and PyBigDFT 0.9, through the registry of steps in `for_pybigdft_pack/study`.

| File | What |
|---|---|
| `study.py` | The script, exactly as the workshop writes it |
| `runs/*.yaml` | The inputs the registry wrote, one per run |
| `runs/log-*.yaml` | BigDFT's logs |
| `runs/final_*.yaml` | The relaxed geometries |
| `runs/manifest.json` | Which run is which step, its input, the geometry it starts from |
| `analysis.txt` | What `study.analyse()` printed |

## What it does

1. Sets the target before computing: 12.62 ± 0.3 eV, the measured first ionisation energy.
2. Computes the ground state and the cation.
3. Varies the grid spacing over 0.50, 0.45, 0.40 and 0.35 bohr and watches the energy difference. The criterion (within 10 meV of the finest grid) proposes 0.45.
4. Retains 0.40 instead, with the reason: the energy difference is converged at 0.45, the geometry is not. Relaxed at 0.45 the H–O–H angle is 99.7°, for 105.0° at 0.40 and 104.5° at 0.35.
5. Relaxes the molecule, computes the cation at that geometry, then relaxes the cation.

## What came out

| | |
|---|---|
| Runs | 11, in two waves. Two members of the series are the same calculations as the first two steps and are not run twice |
| Ionisation energy, vertical | 12.564 eV, within the target |
| Ionisation energy, adiabatic | 12.459 eV |

## Run it again

```bash
cp ../../for_pybigdft_pack/study/*.py .
python3 run_here.py study.py        # where bigdft runs; with the pack, haps_bigdft sends each wave
```

`node tools/check_workshop.js`, from the root of the repository, checks that the workshop still writes this script and shows these numbers.
