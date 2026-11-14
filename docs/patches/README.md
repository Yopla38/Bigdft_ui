# Patches proposed for other repositories

Changes this work suggests in repositories it may read but not write. Each one was applied
to a scratch copy and tested there; nothing was pushed.

## `haps-wavefunctions.patch`, for `Pack_pybigdft_HAPS`

Lets a run restart from the wavefunctions of an earlier one through the HAPS.

BigDFT writes wavefunctions as files, one per orbital, in `data-NAME/`, and reads them from
there when the input says `inputpsiid: 2`. The HAPS already sends them back (they are among
the files a run created). It refused to receive them: the input archive had to be flat.

The patch widens the rule both sides apply (`pybigdft_haps/inputs.py`) by exactly one case:
inside `data-NAME/`, for the run `NAME` only, files named as BigDFT names wavefunctions
(`wavefunction-k001-NR.bin.b000001`, text variant without `.bin`, `U`/`D` for the spin,
`R`/`I` for the real and imaginary parts, and `wavefunction-rhoij`). `select()` picks them
up when the directory exists. Everything else stays refused: another run's directory, a
deeper path, any other file name. Still data, never code; what becomes reachable is
BigDFT's reader of its own wavefunction files.

Checked:

- the 24 offline tests of the pack still pass, with 3 new ones (27 in all);
- end to end with BigDFT 1.9.1 in the pinned image: select, pack, check, unpack in a fresh
  directory, `bigdft -n E1`. A PBE0 run of water restarted from PBE wavefunctions converges
  in 8 iterations instead of 11, to the same energy, and its wavefunctions are not sent
  back since the run did not change them.

Not changed, and worth a look: the comment on the input buffer in `haps/pybigdft.xml` still
says "flat" (left alone in case the file takes part in the application's signature), and
`output_reserve_mb` (1024) bounds what a run can send back, wavefunctions included.

```bash
cd Pack_pybigdft_HAPS && git apply /path/to/haps-wavefunctions.patch
cd haps && python -m pytest tests/test_offline.py
```
