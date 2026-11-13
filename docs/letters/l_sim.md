# Draft: L_Sim team (BigDFT, PyBigDFT, V_Sim)

Send only if you do not already have these answers in-house. Channel: the maintainers through <https://gitlab.com/l_sim>, or your direct contacts.

---

**Subject: Web interface for BigDFT, four technical questions**

Hello,

We are building a web workshop for BigDFT: a calculation is assembled around a 3D scene, executed by PyBigDFT in a container or on a remote machine, and its results come back into the page. The interface is generated from `input_variables_definition.yaml` (BigDFT, PSolver, CheSS), read directly from `bigdft-suite`.

Your view on four points would save us mistakes:

1. **Stability of the input schema.** May we treat these YAML files as the public interface of the variables? Are there deprecated variables, or profiles (`linear_laura`, marked "temporary") that should not be exposed?
2. **Reference container image.** Which image do you recommend for running BigDFT and PyBigDFT in production (CPU and GPU), and which digest should we pin?
3. **Live monitoring.** To show convergence during a run we read the YAML logfile as it is written. Is the `perf.signaling` option a better route?
4. **V_Sim.** We would rather reuse what exists than rewrite it. Is headless, server-side rendering for publication figures feasible? Can the format readers (wavelet grids, densities) be used as a library?

We take the references to cite from `bigdft_bibliography.yaml`, and would be glad to show you the mock-up.

Best regards,

[Name, role, organisation, email]
