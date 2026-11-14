# Water study: a board, its script, and what BigDFT answered

A study built with the three gestures of "Build your own" in the mock-up, compiled by the
builder to `study.py`, and run with BigDFT 1.9.1 in the image the PyBigDFT pack pins
(`bigdft/runtime@sha256:6f16f65f5b33…`), on 4 threads.

| Block | What | Runs |
|---|---|---|
| A | Ground state, grid spacing 0.50, 0.45, 0.40 bohr | `A_h050`, `A_h045`, `A_h040` |
| B | Triplet state, same grids | `B_h050`, `B_h045`, `B_h040` |
| C | Triplet energy, E(B) − E(A), in eV | formula |
| D | SQNM relaxation of the ground state | `D` |
| E | PBE0 single point at the relaxed geometry of D, restarted from the wavefunctions of D | `E` |
| F | The same from scratch, to compare | `F` |

`blocks.json` is the board. Each attempt holds the script the builder wrote, the structure,
every input (`runs/NAME.yaml`), every log (`runs/log-NAME.yaml`), the relaxed geometry,
the output of `python study.py analyse`, and `haps.txt`: what was sent for each run and
what came back. The wavefunction files themselves are not kept (3 MB per attempt).

| | Criterion | Triplet energy at h = 0.50, 0.45, 0.40 bohr |
|---|---|---|
| `attempt-1` | default, 10⁻⁴ | 8.874, 8.930, 7.078 eV: the triplet runs stopped on different electronic states |
| `attempt-2` | 10⁻⁵ | 6.989, 7.077, 7.078 eV |

In both attempts E reaches the energy of F to better than 10⁻⁹ Ha in fewer iterations
(8 for 11, then 11 for 13). Its input archive holds six files, 1.1 MB packed: `E.yaml` and
the wavefunctions of D.

`attempt-1/refused/` keeps what BigDFT wrote when the first version of the PBE0 block named
no pseudopotential.

## How it was run

The script follows the pack: prepare and dry-run in the container, compute on the HAPS,
analyse in the container. `drive.py` stands in for the HAPS. For each name `prepare`
prints, it uses the pack's own modules to select the files of the run, pack them, check the
archive and unpack it in a fresh directory; runs `bigdft -n NAME` there in the pinned
image; and copies back what the run created or changed. The service itself (ebservice, the
buffers) is not exercised.

```bash
python examples/water-study/drive.py examples/water-study/attempt-2 \
    --pack /path/to/Pack_pybigdft_HAPS/haps      # remove runs/ and haps.txt to start over
```

These runs used the pack with `docs/patches/haps-wavefunctions.patch` applied. With the pack
as published the wavefunctions are not selected: E starts from scratch, and BigDFT says so
in its log ("Missing wavefunction files, switch to normal input guess").

With the real service, the same study is `python study.py prepare`, then
`haps_bigdft(names=[...], directory="runs")` on the names it prints, repeated until nothing
is waiting, then `python study.py analyse`.

`python tools/build_example.py` reads this folder into `prototype/js/example.js`.
