# PyBigDFT API graph

Read from **PyBigDFT 0.9, BigDFT 1.9.1, Python 3.7.7**.

| Class | Individuals |
|---|---|
| Attribute | 37 |
| CodeSnippet | 41 |
| Function | 530 |
| Library | 1 |
| Module | 39 |
| Parameter | 317 |
| Pitfall | 24 |
| PythonClass | 62 |
| Workflow | 7 |

1058 individuals, 7778 statements.
41 of 41 snippets passed and are in the graph; 58 functions, classes and attributes are shown in at least one of them.
110 of 530 functions and methods have no docstring: the graph gives their signature only.
3 modules cannot be imported in this environment: `BigDFT.AiidaCalculator`, `BigDFT.Interop.ASEInterop`, `BigDFT.check_examples`.

## Left out, or to review

- 74 input variables are not printed in a default log (they apply to an option that was not chosen) and come from the definitions: `dft.local_potential`, `dft.magnetic_torque`, `dft.spin_dynamics`, `geopt.biomode`, `geopt.bmass`, `geopt.climbing`, `geopt.cutoffratio`, `geopt.damp`, …
- input action `add_cdft_constraint` was not called: it is not a setting of a calculation
- input action `connect_run_data` was not called: it is not a setting of a calculation
- input action `load` was not called: it is not a setting of a calculation
- input action `remove` was not called: it is not a setting of a calculation
- input action `set_external_potential` was not called: it is not a setting of a calculation
- input action `set_psp_directory` was not called: it is not a setting of a calculation
- input action `set_psp_file` was not called: it is not a setting of a calculation
