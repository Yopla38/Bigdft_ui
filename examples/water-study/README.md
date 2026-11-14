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
| E | PBE0 single point at the relaxed geometry of D | `E` |

`blocks.json` is the board. Each attempt holds the script the builder wrote, the structure,
every input (`runs/NAME.yaml`), every log (`runs/log-NAME.yaml`), the relaxed geometry and
the output of `python study.py analyse`.

| | Criterion | Triplet energy at h = 0.50, 0.45, 0.40 bohr |
|---|---|---|
| `attempt-1` | default, 10⁻⁴ | 8.874, 8.930, 7.078 eV: the triplet runs stopped on different electronic states |
| `attempt-2` | 10⁻⁵ | 6.989, 7.077, 7.078 eV |

`attempt-1/refused/` keeps what BigDFT wrote when the first version of block E asked for
PBE0 without naming a pseudopotential.

## How it was run

The script follows the pack: prepare and dry-run in the container, compute with the one
command a HAPS runs, analyse in the container. `drive.sh` stands in for the HAPS: it runs
`bigdft -n NAME` on each name `prepare` prints, wave after wave. The HAPS service itself
was not used.

```bash
docker run --rm -v "$PWD/attempt-2:/work" -w /work \
  bigdft/runtime@sha256:6f16f65f5b33ffe83e53d3c228c21a1e8eb97d0b426f4fad0c805d0bc0540336 \
  bash /work/drive.sh          # copy drive.sh beside study.py first; remove runs/ to start over
```

With the pack, the same study is `python study.py prepare`, then
`haps_bigdft(names=[...], directory="runs")` on the names it prints, repeated until nothing
is waiting, then `python study.py analyse`.

`python tools/build_example.py` reads this folder into `prototype/js/example.js`.
