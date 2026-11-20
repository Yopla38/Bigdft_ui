# Patches proposed for other repositories

Changes this work suggests in repositories it may read but not write. Each one was applied
to a scratch copy and tested there; nothing was pushed.

## `haps-wavefunctions.patch`, for the HAPS of the PyBigDFT pack

Lets a run restart from the wavefunctions of an earlier one through the HAPS. Written against
the HAPS as it stands in the Exa-AToW demo (`haps/` of 2026-11-18: two applications, the dry
run on `memguess`); it replaces the patch written for the earlier `Pack_pybigdft_HAPS`, which
no longer applies. It does not apply to `Pack_pybigdft_HAPS_new` as it is today, whose `haps/`
is older than the demo's.

BigDFT writes wavefunctions as files, one per orbital, in `data-NAME/`, and reads them from
there when the input says `inputpsiid: 2`. The HAPS already sends them back (they are among
the files a run created). It refused to receive them: the input archive had to be flat.

The patch widens the rule both sides apply (`pybigdft_haps/inputs.py`) by exactly one case:
inside `data-NAME/`, for the run `NAME` only, files named as BigDFT names wavefunctions
(`wavefunction-k001-NR.bin.b000001`, text variant without `.bin`, `U`/`D` for the spin,
`R`/`I` for the real and imaginary parts, and `wavefunction-rhoij`). `select()` picks them
up when the directory exists. Everything else stays refused: another run's directory, a
deeper path, any other file name, a `data-NAME` that is a link. Still data, never code; what
becomes reachable is BigDFT's reader of its own wavefunction files.

Two things are new in this version:

- **A dry run leaves them behind.** `select(..., wavefunctions=False)` for the dry-run
  application: `memguess` parses the input and reads no wavefunction, and they can be large.
- **The bridge says what it takes.** `haps_info` gains one line, `accepts  NAME.yaml,
  posinp.*, <x>.xyz, psppar.*, data-NAME/wavefunction-*`. A client reads it instead of
  believing a configuration file: workshop 2 refuses a step that starts from wavefunctions
  when the line is absent, because BigDFT would only warn and start from scratch.

It must be applied where the bridge runs **and** where the runtime runs: the bridge selects
with that rule, the runtime checks with it. With the bridge alone, the runtime refuses the
archive and the job fails with the reason.

Checked:

- the 63 offline tests of the HAPS still pass, with 5 new ones (68 in all);
- end to end with BigDFT 1.9.1, on a local stack started from a patched copy (ebservice,
  ebuffer, both runtimes, the bridge), through workshop 2's backend: a PBE0 calculation of
  water restarted from PBE wavefunctions converges in 8 iterations (11 from scratch, in the
  recorded runs), with no "Missing wavefunction files" warning; with the unpatched bridge the
  same step is refused by the backend before anything is sent.

Not changed, and worth a look: the comment on the input buffer in `pybigdft.xml` still says
"flat" (left alone in case the file takes part in the application's signature), and the
output buffer (`output_reserve_mb`, capped by the server) bounds what a run can send back,
wavefunctions included.

```bash
cd /path/to/the/directory/that/holds/haps && git apply /path/to/haps-wavefunctions.patch
cd haps && uv run --group dev python -m pytest -q tests
```

`git apply` works outside a repository too. Restart the runtime and the bridges afterwards.
