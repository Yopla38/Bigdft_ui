# Guided paths

Each guided path of the Library is a Jupyter notebook, read by the importer in
`prototype/js/notebook.js`:

- a step starts at each Markdown heading (levels 1 to 3);
- PyBigDFT calls the workshop knows (`set_xc`, `set_hgrid`, `set_rmult`,
  `optimize_geometry`, `set_implicit_solvent`…) become moves the learner
  applies to the blueprint, marked with the "Guide" provenance;
- other calls stay in the step as code;
- installation cells (`!pip`, `%magic`, Colab setup) are recognised and skipped:
  the workshop runs in the pack's container.

Nothing in a notebook is executed, outputs are ignored, and Markdown is escaped
before it is formatted.

The notebooks in `notebooks/` are the BigDFT-school tutorials as collected in
`BigDFT-group/llm-hackathon-2025` (MIT licence, © 2025 BigDFT Hackathon 2025
Contributors), stripped of their outputs with
`python tools/build_guides.py --strip`. `manifest.yaml` adds level, duration and
a one-line summary; `python tools/build_guides.py` bundles them for the
prototype.
