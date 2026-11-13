# BigDFT input variables

Source: bigdft-suite, revision 213bc56f51b9e990fe5b9f035402f36d01b19816 2026-09-25.

## dft.hgrids

`hgrids` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the essential tier.
Purpose: Grid spacing in the three directions (bohr).
Default: `[0.45, 0.45, 0.45]`.

Grid spacing in three directions (Bohr units) of the coarse mesh as [0.5, 0.45, 0.4]. A scalar can also be given as 0.45. The grid spacing of the Cartesian grid, in Bohr. As described in the wavelet formalism section, the nodes of this grid serve as the centers for the scaling function/wavelet basis. Values are in most cases between 0.3 and 0.6 bohr.

## dft.ngrids

`ngrids` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the advanced tier.
Purpose: Number of grid spacing division in each direction.
Default: `[0, 0, 0]`.

Number of grid spacing division in each direction. Values are relevant only for periodic directions. This is convenient to keep the constant the number of wavelets when changing the super-cell dimensions. These values override hgrid ones.

## dft.rmult

`rmult` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the essential tier.
Purpose: c(f)rmult*radii_cf(:,1(2))=coarse(fine) atom-based radius.
Default: `[5.0, 8.0]`.

Coarse and fine multiplier as [4.0, 8.0]. These numbers determine the extension of the coarse and fine region respectively.

## dft.ixc

`ixc` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Theory block, at the essential tier.
Purpose: Exchange-correlation parameter (LDA=1,PBE=11).
Default: `1`.

Determine the exchange-correlation functional. Integer specifying which exchange correlation functional will be used. The Abinit conventions are used and detailed information can be found on the Abinit Web page. Here is only a short summary of some widely used functionals - Pade LDA from Abinit XC library; - PBE from Abinit XC library; - Pade LDA from libXC; - PBE from libXC; - PBEsol from libXC; - PBE0 Hybrid functional (local part from libXC). A positive integer refers to a functional from ABINIT library and a negative one from libXC library. In this case, you concatenate the codes for the exchange part and for the correlation part (see the table of codes).

## dft.qcharge

`qcharge` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Theory block, at the essential tier.
Purpose: Charge of the system. Can be integer or real..
Default: `0`.

Total charge of the system. A positive qcharge means that electrons are taken away and a negative one means that extra electrons are added.

## dft.elecfield

`elecfield` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Environment block, at the essential tier.
Purpose: Electric field (Ex,Ey,Ez).
Default: `[0.0, 0.0, 0.0]`.

Uniform electric field Ex, Ey, Ez in units of Ha/Bohr. The electric field can not have components in periodic directions, e.g. Ex = Ez = 0 in case surface BC is used.

## dft.nspin

`nspin` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Theory block, at the essential tier.
Purpose: Spin polarization treatment.
Default: `1`.

Spin polarization treatment; 1 no spin (as LDA), 2 spin-polarisation (LSD or collinear) and 4 non-collinear i.e. two components per electron.

## dft.mpol

`mpol` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Theory block, at the essential tier.
Purpose: Total magnetic moment.
Default: `0`.

Total magnetic moment which has to be the same parity as the total number of electrons (nelec_up-nelec_down=mpol). You should also define the keyword 'IGSpin' or add a spin per atom to specify the polarisation for the input guess.

## dft.gnrm_cv

`gnrm_cv` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the essential tier.
Purpose: Convergence criterion gradient.
Default: `0.0001`.

Convergence criterion for the wavefunction optimization (norm of the gradient). Reasonable values are in most cases between 1.d-4 and 1.d-5.

## dft.itermax

`itermax` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the advanced tier.
Purpose: Max. iterations of wfn. opt. steps.
Default: `50`.

Maximum number of gradient evaluations for a single cycle in a wavefunction optimization and maximum number of cycles. At the end of each cycle a subspace diagonalization is done which helps in cases where one has near degeneracy between the HOMO and LUMO orbitals. 50 are usually sufficient.

## dft.itermin

`itermin` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Minimal iterations of wfn. optimized steps.
Default: `0`.

## dft.nrepmax

`nrepmax` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the advanced tier.
Purpose: Max. number of re-diag. runs.
Default: `1`.

Maximum number of gradient evaluations for a single cycle in a wavefunction optimization and maximum number of cycles. At the end of each cycle a subspace diagonalization is done which helps in cases where one has near degeneracy between the HOMO and LUMO orbitals. 50 are usually sufficient.

## dft.ncong

`ncong` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the advanced tier.
Purpose: No. of CG it. for preconditioning eq..
Default: `6`.

ncong gives the number of iterations in the solution of the preconditioning equation. For free boundary conditions 5 is a good value whereas for other boundary condition a value from 0 to 2 is in general sufficient. Large values of ncong lead to a smaller number of iterations in the wavefunction optimization and better forces, but each iteration is more costly. So an optimal compromise value has to be found.

## dft.idsx

`idsx` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the advanced tier.
Purpose: Wfn. diis history.
Default: `6`.

idsx gives the history length of the DIIS convergence acceleration in the wavefunction optimization. 6 is usually a good value for fast convergence. In case of convergence problems it can be advantageous to switch off DIIS by setting idsx = 0. The memory requirements grow considerably with large values of idsx. If memory is the limiting factor one has to choose idsx smaller than the value which gives the fastest convergence. The bigdft-tool tool can be used to predict the memory requirements for different choices of idsx.

## dft.dispersion

`dispersion` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Theory block, at the essential tier.
Purpose: Dispersion correction potential (values 1,2,3,4,5), 0=none.
Default: `0`.

A non-zero values activates an empirical add-on treatment of dispersion effects. The values 1, 2 and 3 specify different switching on functions using the convention.

## dft.inputpsiid

`inputpsiid` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the essential tier.
Purpose: Input guess wavefunctions.
Default: `0`.

Specifies how the input guess wavefunction is generated - -2 Random numbers are used as input guess. his is of course a poor input guess which will need many iterations of the wavefunction optimization and might even lead to divergences. - -1 The input wavefunction is imported from the CP2K code which uses Gaussian functions. The basis set should be contained in a file named gaubasis.dat whereas the coefficients should appear in the gaucoeff.dat file. Both files are the output files of CP2K code. See the H2O-CP2K test for an example. - 0 A subspace diagonalization in a minimal atomic basis set is used. This input guess should be used in general if one starts a new calculation. - 1 The previously calculated wavefunctions (for instance from the previous geometry optimization step) are used as input guess. Setting InputPsiId to this value does only make sense from within a main program where call_cluster() subroutine was called previously. The old wavefunction is passed to the new call via the data structure restart. - 2 The input wavefunction is read from the wavefunction. files which contain all the scaling function and wavelet coefficients. In case some parameters such as hgrids or crmult have changed, compared to the previous run, the wavefunctions will be also transformed to the new parameter set. Use also this value to restart from ETSF file format wavefunction-etsf.nc. - 10 The same as 0 but activates the ’Gaussian help’ after convergence the wavefunctions are projected onto the localised basis set used for the input guess, and Mulliken Charge Population Analysis (MCPA) is performed on this basis. The user has the possibility to perform MCPA with separate basis set (functionality to be added). - 11 Restart with Gaussian approximation contained in the ’restart’ data structure. - 12 The input wavefunction is read from the wavefunctions.gau file, which contains an approximation in a minimal Gaussian basis set of the previously calculated wavefunctions. - 100 Use Linear Atomic Orbitals - 101 Restart for Linear - 102 Linear on disk

## dft.local_potential

`local_potential` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Path to the local potential.
Default: `""`.

## dft.projection

`projection` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Theory block, at the expert tier.
Purpose: Projector construction method.
Default: `"gaussian"`.

Specifies how the projectors are expressed in Daubechies from atomic description

## dft.output_denspot

`output_denspot` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Observables block, at the essential tier.
Purpose: Output of the density or the potential.
Default: `0`.

controls the output of density and pontentials on disk at the end of the calculation - output_denspot = 0, No output density is written. - output_denspot = 1, Output electronic density is written in the .pot format of V_Sim into the file electronic_density.pot (deprecated, use 11 instead). - output_denspot = 2, In addition to the electronic density, the potential (local_potential.pot) and its components (external_potential.pot and Hartree_potential.pot) are also output in plain text .pot files (deprecated, use 12 instead). - output_denspot = 11, Same as output_denspot = 1, but files are written in ETSF file format (portable binary format based on NetCDF). - output_denspot = 12, Same as output_denspot = 2, but files are written in ETSF file format (portable binary format based on NetCDF). - output_denspot = 21, Same as output_denspot = 1, but files are written in .cube file format (plain text). - output_denspot = 22, Same as output_denspot = 2, but files are written in .cube file format (plain text).

## dft.rbuf

`rbuf` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the advanced tier.
Purpose: Length of the tail (AU).
Default: `0.0`.

## dft.ncongt

`ncongt` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: No. of tail CG iterations.
Default: `30`.

Far reaching tails of the wavefunctions decaying into the vacuum are added in a perturbative treatment if the variable rbuf is set to a strictly positive value. This allows to do a calculation with some moderate value of crmult and then to extrapolate to the limit of large crmult. This procedure is not variational and gives too low energies. The true energy is in between the two energies and in general much closer to the extrapolated energy. This procedure can also be used to judge whether the chosen value of crmult is large enough for a certain required precision. rbuf gives the amount by which the radii for the coarse resolution region are increased in atomic units. ncongt gives the number of iterations used in the perturbation calculation. Reasonable values for ncongt are around 30.

## dft.norbv

`norbv` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the advanced tier.
Purpose: Davidson subspace dimension (No. virtual orbitals).
Default: `0`.

Determine the dimension of the subspace i.e. the number of virtual orbitals to calculate via a Davidson diagonalisation. Usually unoccupied orbitals are not calculated since they are not needed for the total energy and other physical properties of the electronic ground state. Putting norbv to a non-zero value will result in the calculation of norbv virtual orbitals in a postprocessing routine after the occupied orbitals have been calculated, which uses Davidson iterative treatment. nvirt (< norbv) determines to the number of converged orbitals during the convergence process which is taking care of during the Davidson iterations. nplot of these orbitals will be written in the virtual.*.pot files and nplot (if that many exist) of the highest occupied orbitals will be written in the orbital.*.pot file. The Kohn Sham eigenvalues are written in the ordinary output file.

## dft.nvirt

`nvirt` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the advanced tier.
Purpose: No. of converged virtual orbs (< norbv).
Default: `0`.

Determine the dimension of the subspace i.e. the number of virtual orbitals to be converged via a Davidson diagonalisation. (should be < norbv) Usually unoccupied orbitals are not calculated since they are not needed for the total energy and other physical properties of the electronic ground state. Putting norbv to a non-zero value will result in the calculation of norbv virtual orbitals in a postprocessing routine after the occupied orbitals have been calculated, which uses Davidson iterative treatment. nvirt (< norbv) determines to the number of converged orbitals during the convergence process which is taking care of during the Davidson iterations. nplot of these orbitals will be written in the virtual.*.pot files and nplot (if that many exist) of the highest occupied orbitals will be written in the orbital.*.pot file. The Kohn Sham eigenvalues are written in the ordinary output file.

## dft.nplot

`nplot` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Observables block, at the essential tier.
Purpose: No. of plotted orbs.
Default: `0`.

Number of orbitals to be plotted Determine the dimension of the subspace i.e. the number of virtual orbitals to calculate via a Davidson diagonalisation. Usually unoccupied orbitals are not calculated since they are not needed for the total energy and other physical properties of the electronic ground state. Putting norbv to a non-zero value will result in the calculation of norbv virtual orbitals in a postprocessing routine after the occupied orbitals have been calculated, which uses Davidson iterative treatment . nplot of these orbitals will be written in the virtual.*.pot files and nplot (if that many exist) of the highest occupied orbitals will be written in the orbital.*.pot file The Kohn Sham eigenvalues are written in the ordinary output file. nvirt corresponds to the actual number of orbitals the convergence process is taking care of during the Davidson iterations.

## dft.gnrm_cv_virt

`gnrm_cv_virt` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Convergence criterion gradient for virtual orbitals.
Default: `0.0001`.

Norm of the gradient for virtual orbitals convergence. Calculates the results on the first nvirt orbitals

## dft.itermax_virt

`itermax_virt` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Max. iterations of wfn. opt. steps for virtual orbitals.
Default: `50`.

Maximum number of gradient evaluations for a cycle of a wavefunction optimization for the virtual orbitals.

## dft.disablesym

`disablesym` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Environment block, at the advanced tier.
Purpose: Disable the symmetry detection.
Default: `false`.

Disable the symmetry detection (by default No except for isolated systems). By default symmetries are used to update the density in periodic boundary condition calculations, and surface boundary conditions also.

## dft.external_potential

`external_potential` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Environment block, at the advanced tier.
Purpose: Multipole moments of an external potential.
Default: `0.0`.

Give the multipole moments up to quadrupoles

## dft.calculate_strten

`calculate_strten` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Observables block, at the advanced tier.
Purpose: Boolean to activate the calculation of the stress tensor. Might be set to No for performance reasons.
Default: `true`.

In some cases, for example when doing MD for fixed volume systems, it might be useful to disable the calculation of the stress tensor, to save computational time.

## dft.magnetic_torque

`magnetic_torque` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Theory block, at the expert tier.
Purpose: Boolean to activate the calculation of the direction of the atomic magnetization which lowers the total energy.
Default: `false`.

## dft.spin_dynamics

`spin_dynamics` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Theory block, at the expert tier.
Purpose: Boolean to activate the calculation of the direction of the atomic magnetization which lowers the total energy.
Default: `false`.

## dft.plot_mppot_axes

`plot_mppot_axes` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Observables block, at the expert tier.
Purpose: Plot the potential generated by the multipoles along axes through this point. Negative values mean no plot..
Default: `[-1, -1, -1]`.

If present, the potential generated by the multipoles will be written in the .cube format and also be plotted along axes through the specified point. If no plot is desired, the values should be negative.

## dft.plot_pot_axes

`plot_pot_axes` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Observables block, at the expert tier.
Purpose: Plot the potential along axes through this point. Negative values mean no plot..
Default: `[-1, -1, -1]`.

If present and the chosen plotting format is .cube, the potential will be written in the .cube format and also be plotted along axes through the specified point. If no plot is desired, the values should be negative.

## dft.occupancy_control

`occupancy_control` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Theory block, at the expert tier.
Purpose: Dictionary of the atomic matrices to be applied for a given iteration number.
Default: `"None"`.

The atomic species or the atoms written as Atom No are specified, followed by a dictionary of the shells for which the density matrix can be controlled. The Value of the matrix can be specified either as a trace or as explicit matrix elements.

## dft.itermax_occ_ctrl

`itermax_occ_ctrl` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Number of iterations of occupancy control scheme. Should be between itermin and itermax.
Default: `0`.

## dft.nrepmax_occ_ctrl

`nrepmax_occ_ctrl` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Number of re-diagonalizations of occupancy control scheme..
Default: `1`.

## dft.alpha_hf

`alpha_hf` is an input variable of section `dft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Theory block, at the advanced tier.
Purpose: Part of the exact exchange contribution for hybrid functionals.
Default: `-1.0`.

By default .25 for PBE0, and .2 for B3LYP

## output.verbosity

`verbosity` is an input variable of section `output` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Observables block, at the advanced tier.
Purpose: Verbosity of the output.
Default: `2`.

## output.atomic_density_matrix

`atomic_density_matrix` is an input variable of section `output` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Observables block, at the expert tier.
Purpose: Dictionary of the atoms for which the atomic density matrix has to be plotted.
Default: `"None"`.

The atomic species or the atoms written as Atom No are specified, followed by a list of the shells for which the density matrix can be plotted

## output.sdos

`sdos` is an input variable of section `output` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Observables block, at the advanced tier.
Purpose: Spatially-resolved density of states.
Default: `false`.

Plots the density of states by calculating the value of psi*Hpsi per each KS orbital, resolved among x,y or z.

## output.orbitals

`orbitals` is an input variable of section `output` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Observables block, at the essential tier.
Purpose: Write KS orbitals in the full simulation domain (might take lot of disk space!).
Default: `"None"`.

## output.apply_coeffs

`apply_coeffs` is an input variable of section `output` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Observables block, at the expert tier.
Purpose: apply the coefficients to the SFs when writing orbitals in LS-BigDFT.
Default: `true`.

Whether or not to apply the coefficients to the support functions when writing orbitals in a linear scaling calculation. If yes, will output wavefunctions as normal, if no, will instead output support functions in the global localisation region.

## output.outputpsiid

`outputpsiid` is an input variable of section `output` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Observables block, at the expert tier.
Purpose: basename of the output wavefunctions files written in the data directory.
Default: `"wavefunction"`.

Define the basename of all the files associated to the output of the wavefunctions. Can be reused in the inputpsiid input parameter.

## output.coupling_matrix

`coupling_matrix` is an input variable of section `output` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Observables block, at the advanced tier.
Purpose: kind of the coupling matrix which have to be dumped.
Default: `"complete"`.

Useful to separate the various contributions of the coupling matrix. May be written exclusively, separately or in complete form.

## kpt.method

`method` is an input variable of section `kpt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Environment block, at the essential tier.
Purpose: K-point sampling method.
Default: `"manual"`.

## kpt.kptrlen

`kptrlen` is an input variable of section `kpt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Environment block, at the advanced tier.
Purpose: Equivalent length of K-space resolution (Bohr).
Default: `0.0`.

## kpt.ngkpt

`ngkpt` is an input variable of section `kpt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Environment block, at the essential tier.
Purpose: No. of Monkhorst-Pack grid points.
Default: `[1, 1, 1]`.

## kpt.shiftk

`shiftk` is an input variable of section `kpt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Environment block, at the advanced tier.
Purpose: Grid shifts.
Default: `[[0.0, 0.0, 0.0]]`.

## kpt.kpt

`kpt` is an input variable of section `kpt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Environment block, at the expert tier.
Purpose: Kpt coordinates.
Default: `[[0.0, 0.0, 0.0]]`.

## kpt.wkpt

`wkpt` is an input variable of section `kpt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Environment block, at the expert tier.
Purpose: Kpt weights.
Default: `[1.0]`.

## kpt.bands

`bands` is an input variable of section `kpt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Environment block, at the advanced tier.
Purpose: For doing band structure calculation.
Default: `false`.

## kpt.iseg

`iseg` is an input variable of section `kpt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Environment block, at the expert tier.
Purpose: Points for each segment of the Brillouin zone path.
Default: `[1]`.

## kpt.kptv

`kptv` is an input variable of section `kpt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Environment block, at the expert tier.
Purpose: K points defining each segment of the Brillouin zone path.
Default: `[[0.0, 0.0, 0.0], [0.5, 0.5, 0.5]]`.

## kpt.ngranularity

`ngranularity` is an input variable of section `kpt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Environment block, at the expert tier.
Purpose: No. of points done for each group.
Default: `1`.

## geopt.method

`method` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the essential tier.
Purpose: Geometry optimisation method.
Default: `"none"`.

## geopt.ncount_cluster_x

`ncount_cluster_x` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the essential tier.
Purpose: Maximum number of force evaluations.
Default: `50`.

Maximum number of force evaluations to be used for the geometry optimization.

## geopt.sockinet

`sockinet` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Socket either unix (0) or tcp (1).
Default: `1`.

## geopt.sockport

`sockport` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Socket port number.
Default: `2121`.

## geopt.sockhost

`sockhost` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Socket host name.
Default: `"127.0.0.1"`.

## geopt.frac_fluct

`frac_fluct` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the advanced tier.
Purpose: Fraction of force fluctuations. Stop if fmax < forces_fluct*frac_fluct.
Default: `1.0`.

Convergence criteria for the geometry optimization. The geometry optimization stops either if the norm of the individual forces acting on any atom in the system is smaller than forcemax or if the forces get noisy. Noise is present because of the underlying integration grid. The parameter frac_fluct specifies how small the forces should become compared to the noise level to stop the geometry optimization. Values in between 1 and 10 is are reasonable for this parameter. A value of 2 means that the geometry optimization will stop when the largest atomic force is comparable to the 2 times the average noise in the forces themselves. For values of frac_fluct smaller than 1 one can under certain circumstances obtain better relaxed geometries but one risks that the geometry optimization will not converge since the forces are too noisy. In such a case one should closely monitor the progress of the geometry optimization by looking at the posout. files which are written at each step of the geometry optimization and at the data/geopt.mon file.

## geopt.forcemax

`forcemax` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the essential tier.
Purpose: Max forces criterion when stop.
Default: `0.0`.

Convergence criteria for the geometry optimization. The geometry optimization stops either if the norm of the individual forces acting on any atom in the system is smaller than forcemax or if the forces get noisy. Noise is present because of the underlying integration grid. The parameter frac_fluct specifies how small the forces should become compared to the noise level to stop the geometry optimization. Values in between 1 and 10 is are reasonable for this parameter. A value of 2 means that the geometry optimization will stop when the largest atomic force is comparable to the 2 times the average noise in the forces themselves. For values of frac_fluct smaller than 1 one can under certain circumstances obtain better relaxed geometries but one risks that the geometry optimization will not converge since the forces are too noisy. In such a case one should closely monitor the progress of the geometry optimization by looking at the posout. files which are written at each step of the geometry optimization and at the data/geopt.mon file.

## geopt.randdis

`randdis` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Random displacement amplitude.
Default: `0.0`.

This parameter allows to add random displacements with amplitude randdis to the atomic positions in the input file posinp. This can for instance be useful to break degeneracies (which would lead to convergence problems in the wavefunction optimization) in highly symmetric structures.

## geopt.betax

`betax` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the advanced tier.
Purpose: Stepsize for the geometry optimization.
Default: `4.0`.

This is the stepsize for the geometry optimization. This stepsize is system dependent and it has therefore to be determined for each system. If the VSSD method is used one can start with a small stepsize of around 1 and VSSD will suggest then a better value for {betax} in the last line of the data/geopt.mon file. Whether the stepsize is correct can also be seen from the data/geopt.mon output of the SDCG method. In this case the average stepsize in terms of betax should be around 4 (after a brief initial period where it is around 8). In contrast to the SDCG method, the BFGS method is not very sensitive to the correct stepsize but nevertheless one should try to find reasonable values also in this case. SQNM: For many systems 1 is a good stepsize. Some systems can be minimized more efficiently with a larger stepsize.

## geopt.history

`history` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the advanced tier.
Purpose: History for DIIS method.
Default: `4`.

## geopt.dtinit

`dtinit` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Initial time step for the FIRE method.
Default: `0.75`.

## geopt.dtmax

`dtmax` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Maximal time step for the FIRE method.
Default: `1.5`.

## geopt.nhistx

`nhistx` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Maximum history length.
Default: `10`.

## geopt.biomode

`biomode` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the advanced tier.
Purpose: Enable mode for biomolecules..
Default: `false`.

## geopt.beta_stretchx

`beta_stretchx` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Stepsize for steepest descent in stretching mode direction (only if in biomode).
Default: `0.5`.

## geopt.maxrise

`maxrise` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Maximum allowed rise in energy in one geopt step.
Default: `1e-06`.

## geopt.cutoffratio

`cutoffratio` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: If ratio of eigenvalues of displacement overlapmatrix is smaller than cutoffratio, the corresponding directions are not used.
Default: `0.0001`.

## geopt.steepthresh

`steepthresh` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: If fmax < steepthresh, geopt method uses steepest descent.
Default: `0.1`.

## geopt.trustr

`trustr` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Maximum displacement of single atom.
Default: `0.5`.

## geopt.ionmov

`ionmov` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Movement ion method.
Default: `6`.

## geopt.dtion

`dtion` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Time step - Atomic Units (20.670689 AU=0.5 fs).
Default: `20.670689`.

## geopt.mditemp

`mditemp` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Temperature of molecular dynamics.
Default: `300.0`.

## geopt.mdftemp

`mdftemp` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Final temperature of molecular dynamics.
Default: `300.0`.

## geopt.noseinert

`noseinert` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Thermostat inertia coefficient for Nose_Hoover dynamics.
Default: `100000.0`.

## geopt.friction

`friction` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Friction coefficient for Langevin dynamics.
Default: `0.001`.

## geopt.mdwall

`mdwall` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Distance in bohr where atoms can bounce for Langevin dynamics.
Default: `10000.0`.

## geopt.qmass

`qmass` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Mass of each thermostat (isothermal/isenthalpic ensemble).
Default: `[0.0]`.

## geopt.bmass

`bmass` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Barostat masses (isothermal/isenthalpic ensemble).
Default: `10.0`.

## geopt.vmass

`vmass` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Barostat masses (isothermal/isenthalpic ensemble).
Default: `1.0`.

## geopt.climbing

`climbing` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the advanced tier.
Purpose: Make the highest energy image to climb along the path.
Default: `false`.

## geopt.extrema_opt

`extrema_opt` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Minimize the energy of extremum images during NEB optimization.
Default: `false`.

## geopt.neb_method

`neb_method` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the advanced tier.
Purpose: Image minimization method.
Default: `"quick-min"`.

## geopt.temp

`temp` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Temperature for simulated annealing.
Default: `0.0`.

## geopt.damp

`damp` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Damping factor.
Default: `1.0`.

## geopt.springs_k

`springs_k` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Maximum and minimum value when changing spring constant during optimization.
Default: `[0.05, 0.1]`.

## geopt.fix_tol

`fix_tol` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Tolerance to apply on atom moves between extrema.
Default: `0.0001`.

## geopt.nimg

`nimg` is an input variable of section `geopt` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the advanced tier.
Purpose: Number of images.
Default: `15`.

## md.mdsteps

`mdsteps` is an input variable of section `md` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the essential tier.
Purpose: Number of MD steps.
Default: `0`.

A value greater than 0 will activate molecular dynamics

## md.print_frequency

`print_frequency` is an input variable of section `md` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the advanced tier.
Purpose: Printing frequency for energy.dat and Trajectory.xyz files.
Default: `1`.

## md.temperature

`temperature` is an input variable of section `md` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the essential tier.
Purpose: Initial temperature in Kelvin.
Default: `300.0`.

## md.timestep

`timestep` is an input variable of section `md` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the essential tier.
Purpose: Time step for integration (in a.u.).
Default: `20.0`.

## md.no_translation

`no_translation` is an input variable of section `md` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Logical input to set translational correction.
Default: `false`.

## md.thermostat

`thermostat` is an input variable of section `md` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the essential tier.
Purpose: Activates a thermostat for MD.
Default: `"none"`.

## md.nose_chain_length

`nose_chain_length` is an input variable of section `md` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the advanced tier.
Purpose: Length of the Nose-Hoover Chains (integer input).
Default: `3`.

## md.nose_mts_size

`nose_mts_size` is an input variable of section `md` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Multiple time steps used to integrate Nose-Hoover Chains equations of motion (integer input).
Default: `1`.

## md.nose_yoshida_factor

`nose_yoshida_factor` is an input variable of section `md` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Yoshida-Suzuki order to integrate the Nose-Hoover Chains equations of motion (integer input).
Default: `7`.

## md.nose_frequency

`nose_frequency` is an input variable of section `md` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the advanced tier.
Purpose: Frequency in (cm^-1) corresponding to the inertia of the thermostat degrees of freedom.
Default: `3000.0`.

## md.wavefunction_extrapolation

`wavefunction_extrapolation` is an input variable of section `md` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the advanced tier.
Purpose: Activates the wavefunction extrapolation for MD.
Default: `0`.

A value greater than 0 activates wfn extrapolation

## md.always_from_scratch

`always_from_scratch` is an input variable of section `md` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: When true, always restart wavefunctions from scratch to eliminate dissipation effects.
Default: `false`.

## md.restart_nose

`restart_nose` is an input variable of section `md` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Restart Nose Hoover Chain information from md.restart.
Default: `false`.

## md.restart_pos

`restart_pos` is an input variable of section `md` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Restart nuclear position information from md.restart.
Default: `false`.

## md.restart_vel

`restart_vel` is an input variable of section `md` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Restart nuclear velocities information from md.restart.
Default: `false`.

## mix.iscf

`iscf` is an input variable of section `mix` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the advanced tier.
Purpose: Mixing scheme (default=0 i.e. direct minimization).
Default: `0`.

An integer giving the mixing scheme and the mixing target. It follows the ABINIT convention. For values lower than 10, the potential is mixed, while for values greater than 10, the density is mixed. A recommended option is Pulay mixing (7 or 17 for potential or charge mixing, respectively)

## mix.itrpmax

`itrpmax` is an input variable of section `mix` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the advanced tier.
Purpose: Maximum number of diagonalisation iterations.
Default: `1`.

Maximum number of repeats for the mixing scheme. Each iteration implies an optimization of the wavefunctions at constant potential according to the settings in input.dft.

## mix.rpnrm_cv

`rpnrm_cv` is an input variable of section `mix` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the advanced tier.
Purpose: Stop criterion on the residue of potential or density.
Default: `0.0001`.

The stop criterion on the residue of the potential or the density. Typical values are in the order of 1e-10 to 1e-12.

## mix.norbsempty

`norbsempty` is an input variable of section `mix` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the advanced tier.
Purpose: No. of additional bands.
Default: `0`.

The maximum number of additional (initially unoccupied) bands considered. If a larger value is given, The maximum of orbitals available via the input guess procedure will be used automatically

## mix.tel

`tel` is an input variable of section `mix` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Environment block, at the essential tier.
Purpose: Electronic temperature.
Default: `0.0`.

The electronic temperature in energy units (Ha).

## mix.occopt

`occopt` is an input variable of section `mix` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Environment block, at the advanced tier.
Purpose: Smearing method.
Default: `1`.

The smearing function to determine the occupation. The conventions differ from those used by ABINIT. 1 = Gaussian, 2 = Fermi, 3 = Marzari (bumb minimization), 4 = Marzari (monotonic tail), 5 = Methfessel and Paxton.

## mix.alphamix

`alphamix` is an input variable of section `mix` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the advanced tier.
Purpose: Multiplying factors for the mixing.
Default: `0.0`.

The closer this value gets to one, the more cautious will be the mixing of the charge or potential. In the case of straight mixing, it corresponds to alpha according to rho_{new} <-- alpha rho_{old} + (1-alpha) - rho_{new} alphamix must be larger than one half. A typical choice for metals is 0.95.

## mix.alphadiis

`alphadiis` is an input variable of section `mix` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Multiplying factors for the electronic DIIS.
Default: `2.0`.

The DIIS multiplier used for preconditioning the wavefunctions at constant potential.

## mix.diis_sd_switch_tolerance

`diis_sd_switch_tolerance` is an input variable of section `mix` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Tolerance to switch between the Steppest Descent and the DIIS.
Default: `0`.

With this parameter we can tailor the behaviour of the SCF optimization cycle between DIIS and Steepest Descent. When the energy increases (up to such tolerance), the code switches between the different algorithms.

## sic.sic_approach

`sic_approach` is an input variable of section `sic` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Theory block, at the advanced tier.
Purpose: SIC (self-interaction correction) method.
Default: `"none"`.

## sic.sic_alpha

`sic_alpha` is an input variable of section `sic` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Theory block, at the advanced tier.
Purpose: SIC downscaling parameter.
Default: `0.0`.

## sic.sic_fref

`sic_fref` is an input variable of section `sic` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Theory block, at the expert tier.
Purpose: Reference occupation fref (for Non-Koopman case only).
Default: `0.0`.

## tddft.tddft_approach

`tddft_approach` is an input variable of section `tddft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the essential tier.
Purpose: Time-Dependent DFT method.
Default: `"none"`.

## tddft.decompose_perturbation

`decompose_perturbation` is an input variable of section `tddft` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Task block, at the expert tier.
Purpose: Indicate the directory of the perturbation to be decomposed in the basis of empty states.
Default: `"none"`.

## mode.method

`method` is an input variable of section `mode` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Theory block, at the advanced tier.
Purpose: Run method of BigDFT call.
Default: `"dft"`.

## mode.plugin_id

`plugin_id` is an input variable of section `mode` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Theory block, at the expert tier.
Purpose: Integer handle identifying the calculator associated to the mode plugin.
Default: `1`.

## mode.add_coulomb_force

`add_coulomb_force` is an input variable of section `mode` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Theory block, at the expert tier.
Purpose: Boolean to add coulomb force on top of any of above selected force.
Default: `false`.

## mode.nab_options

`nab_options` is an input variable of section `mode` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Theory block, at the expert tier.
Purpose: String to be passed to nab_init compiler in the case of ambertools compilation.
Default: `"ntpr=1"`.

## mode.mm_paramset

`mm_paramset` is an input variable of section `mode` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Theory block, at the advanced tier.
Purpose: Name of the hard-coded parameter set. Must be compatible to the chosen force field..
Default: `"default"`.

## mode.mm_paramfile

`mm_paramfile` is an input variable of section `mode` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Theory block, at the expert tier.
Purpose: Name of parameter or input file for the selected method or code.
Default: `"none"`.

## mode.sections

`sections` is an input variable of section `mode` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Theory block, at the expert tier.
Purpose: List of labelling subparts to divide the system into.
Default: `[]`.

## mode.section_buffer

`section_buffer` is an input variable of section `mode` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Theory block, at the expert tier.
Purpose: Level of neighbours added to posinp sections.
Default: `1`.

## mode.section_passivation

`section_passivation` is an input variable of section `mode` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Theory block, at the expert tier.
Purpose: Level of neighbours added to posinp sections.
Default: `true`.

## mode.sw_eqfactor

`sw_eqfactor` is an input variable of section `mode` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Theory block, at the expert tier.
Purpose: Factor on sigma value, rule the equilibrium bond length for the Stillinger-Weber potential.
Default: `1.0`.

## mode.sirius_config

`sirius_config` is an input variable of section `mode` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Theory block, at the expert tier.
Purpose: Dictionary to pass as sirius configuration (file path or full json dict wrapped in a string).
Default: `"{\\\"parameters\\\": {\\\"electronic_structure_method\\\": \\\"full_potential_lapwlo\\\"}}"`.

## perf.debug

`debug` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Debug option.
Default: `false`.

The debug mode is enable mainly for memory profiling.

## perf.fftcache

`fftcache` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Cache size for the FFT.
Default: `8192`.

Specify the cache size for FFT in kBytes.

## perf.accel

`accel` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the essential tier.
Purpose: Acceleration (hardware).
Default: `false`.

Specify the use of CUDA (resp. OCL) versions of various subroutines. For CUDA, a GPU.config file is needed.

## perf.ocl_platform

`ocl_platform` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Chosen OCL platform.
Default: `null`.

## perf.ocl_devices

`ocl_devices` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Chosen OCL devices.
Default: `null`.

## perf.blas

`blas` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: CUBLAS acceleration.
Default: `false`.

Use or not the CUBlas acceleration.

## perf.projrad

`projrad` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Radius of the projector as a function of the maxrad.
Default: `15.0`.

## perf.exctxpar

`exctxpar` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Exact exchange parallelisation scheme.
Default: `"OP2P"`.

## perf.ig_diag

`ig_diag` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Input guess (T=Direct, F=Iterative) diag. of Ham..
Default: `true`.

## perf.ig_norbp

`ig_norbp` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Input guess Orbitals per process for iterative diag..
Default: `5`.

## perf.ig_blocks

`ig_blocks` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Input guess Block sizes for orthonormalisation.
Default: `[300, 800]`.

## perf.ig_tol

`ig_tol` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Input guess Tolerance criterion.
Default: `0.0001`.

## perf.methortho

`methortho` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Orthogonalisation.
Default: `0`.

## perf.rho_commun

`rho_commun` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Density communication scheme (DBL, RSC, MIX).
Default: `"DEF"`.

## perf.unblock_comms

`unblock_comms` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Overlap Communications of fields (OFF,DEN,POT).
Default: `false`.

## perf.linear

`linear` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Linear Input Guess approach.
Default: `false`.

## perf.tolsym

`tolsym` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Tolerance for symmetry detection.
Default: `1e-08`.

## perf.signaling

`signaling` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Expose calculation results on Network.
Default: `false`.

## perf.signaltimeout

`signaltimeout` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Time out on startup for signal connection (in seconds).
Default: `0`.

## perf.domain

`domain` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Domain to add to the hostname to find the IP.
Default: `null`.

## perf.inguess_geopt

`inguess_geopt` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Input guess to be used during the optimization.
Default: `0`.

## perf.store_index

`store_index` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Store indices or recalculate them for linear scaling.
Default: `true`.

## perf.store_overlap_matrices

`store_overlap_matrices` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Store all matrices relating to overlap powers, or recalculate them for linear scaling.
Default: `true`.

## perf.psp_onfly

`psp_onfly` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Calculate pseudopotential projectors on the fly.
Default: `true`.

## perf.multipole_preserving

`multipole_preserving` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: (EXPERIMENTAL) Preserve the multipole moments of the ionic density.
Default: `false`.

## perf.mp_isf

`mp_isf` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: (EXPERIMENTAL) Interpolating scaling function or lifted dual order for the multipole preserving.
Default: `16`.

## perf.mixing_after_inputguess

`mixing_after_inputguess` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Mixing step after linear input guess.
Default: `1`.

## perf.iterative_orthogonalization

`iterative_orthogonalization` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Iterative_orthogonalization for input guess orbitals.
Default: `false`.

## perf.check_sumrho

`check_sumrho` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Enables linear sumrho check.
Default: `1`.

## perf.check_overlap

`check_overlap` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Enables linear overlap check.
Default: `1`.

## perf.experimental_mode

`experimental_mode` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Activate the experimental mode in linear scaling.
Default: `false`.

## perf.explicit_locregcenters

`explicit_locregcenters` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Linear scaling explicitly specify localization centers.
Default: `false`.

## perf.calculate_KS_residue

`calculate_KS_residue` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Linear scaling calculate Kohn-Sham residue.
Default: `true`.

## perf.intermediate_forces

`intermediate_forces` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Linear scaling calculate intermediate forces.
Default: `false`.

## perf.kappa_conv

`kappa_conv` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Exit kappa for extended input guess (experimental mode).
Default: `0.1`.

## perf.calculate_gap

`calculate_gap` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Observables block, at the advanced tier.
Purpose: Linear scaling calculate the HOMO LUMO gap.
Default: `false`.

## perf.loewdin_charge_analysis

`loewdin_charge_analysis` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Observables block, at the advanced tier.
Purpose: Linear scaling perform a Loewdin charge analysis at the end of the calculation.
Default: `false`.

## perf.coeff_weight_analysis

`coeff_weight_analysis` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Observables block, at the expert tier.
Purpose: Linear scaling perform a Loewdin charge analysis of the coefficients for fragment calculations.
Default: `false`.

## perf.check_matrix_compression

`check_matrix_compression` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Linear scaling perform a check of the matrix compression routines.
Default: `true`.

## perf.correction_co_contra

`correction_co_contra` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Linear scaling correction covariant / contravariant gradient.
Default: `true`.

## perf.FOE_restart

`FOE_restart` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Restart method to be used for the FOE method.
Default: `0`.

## perf.imethod_overlap

`imethod_overlap` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Method to calculate the overlap matrices (1=old, 2=new).
Default: `1`.

## perf.enable_matrix_taskgroups

`enable_matrix_taskgroups` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Enable the matrix taskgroups.
Default: `true`.

## perf.hamapp_radius_incr

`hamapp_radius_incr` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Radius enlargement for the Hamiltonian application (in grid points).
Default: `8`.

## perf.adjust_kernel_iterations

`adjust_kernel_iterations` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Enable the adaptive ajustment of the number of kernel iterations.
Default: `true`.

## perf.adjust_kernel_threshold

`adjust_kernel_threshold` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Enable the adaptive ajustment of the kernel convergence threshold according to the support function convergence.
Default: `true`.

## perf.wf_extent_analysis

`wf_extent_analysis` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Observables block, at the expert tier.
Purpose: Perform an analysis of the extent of the support functions (and possibly KS orbitals).
Default: `false`.

## perf.foe_gap

`foe_gap` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Observables block, at the advanced tier.
Purpose: Use the FOE method to calculate the HOMO-LUMO gap at the end of a calculation.
Default: `false`.

## perf.calculate_forces

`calculate_forces` is an input variable of section `perf` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Observables block, at the advanced tier.
Purpose: Whether or not to calculate the forces at the end of a run (cubic and linear).
Default: `true`.

## lin_general.hybrid

`hybrid` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the advanced tier.
Purpose: Activate the hybrid mode; if activated, only the low accuracy values will be relevant.
Default: `false`.

## lin_general.nit

`nit` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the advanced tier.
Purpose: Number of iteration with low/high accuracy.
Default: `[100, 100]`.

Maximal number of outer loop iterations (high / low accuracy). In each iteration both the support function and the kernel are optimized. When the hybrid mode is used, only the first entry is taken into account.

## lin_general.rpnrm_cv

`rpnrm_cv` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Convergence criterion for low/high accuracy.
Default: `[1e-12, 1e-12]`.

Convergence criterion for the outer loop iterations (high / low accuracy). The optimization stops if the mean change of the charge density / potential falls below this threshold. When the hybrid mode is used, only the first entry is taken into account.

## lin_general.conf_damping

`conf_damping` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: How the confinement should be decreased, only relevant for hybrid mode; negative -> automatic.
Default: `-0.5`.

Prescription how the prefactor for the confining potential should be decreased * negative value => automatic adjustment (recommended) * positive value => at each iteration the prefactor is multiplied with the specified value This variable is only relevant for the hybrid mode.

## lin_general.taylor_order

`taylor_order` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Order of the Taylor approximation; 0 -> exact.
Default: `0`.

Indicates how the matrix powers are calculated: * n<0 => Laura's method of order n * n=0 => exact calculation * n>0 => Taylor series of order n

## lin_general.max_inversion_error

`max_inversion_error` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Linear scaling maximal error of the Taylor approximations to calculate the inverse of the overlap matrix.
Default: `1.0`.

Maximal error of the Taylor approximations which are used to calculate the inverse of the overlap matrix. If this error is larger than the specified value, the order of the Taylor approximation is increased. The default value is set very large, such such in this case no automatic adjustment is performed.

## lin_general.output_wf

`output_wf` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Observables block, at the advanced tier.
Purpose: Output basis functions; 0 no output, 1 formatted output, 2 Fortran bin, 3 ETSF.
Default: `0`.

Indicates how the support functions should be written to disk at the end of the run: * 0 => None * 1 => Wavelet, Plain text * 2 => Wavelet, Fortran binary * 3 => Wavelet, ETSF file format * 10 => None * 11 => Wavelet and Interpolating Scaling Function (density), Plain text * 12 => Wavelet and Interpolating Scaling Function (density), Fortran binary * 13 => Wavelet and Interpolating Scaling Function (density), ETSF file format * 20 => None * 21 => Wavelet and Interpolating Scaling Function (wavefunction), Plain text * 22 => Wavelet and Interpolating Scaling Function (wavefunction), Fortran binary * 23 => Wavelet and Interpolating Scaling Function (wavefunction), ETSF file format

## lin_general.output_mat

`output_mat` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Observables block, at the advanced tier.
Purpose: Output sparse matrices; 0 no output, 1 formatted sparse, 11 formatted dense, 21 formatted both..
Default: `0`.

Indicates how the support function matrices should be written to disk at the end of the run: * 0 => None * 1 => Plain text in sparse format * 11 => Plain text in dense format * 21 => Plain text in both formats * 2 => Fortran binary in sparse format * 12 => Fortran binary in dense format * 22 => Fortran binary in both formats * 4 => MPI native binary in sparse format

## lin_general.output_matder

`output_matder` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Output sparse matrices derivatives; 0 no output, 1 formatted sparse,.
Default: `0`.

Indicates how the support function matrices should be written to disk at the end of the run: * 0 => None * 1 => Plain text in sparse format

## lin_general.output_coeff

`output_coeff` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Observables block, at the expert tier.
Purpose: Output KS coefficients; 0 no output, 1 formatted output.
Default: `0`.

Indicates how the support function coefficients should be written to disk at the end of the run: * 0 => None * 1 => Plain text

## lin_general.output_multipole_matrices

`output_multipole_matrices` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: If outputting support function matrices, also output the multipole matrices in the same format as the other matrices.
Default: `true`.

## lin_general.output_matmul

`output_matmul` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: If outputting support function matrices, also include the matmul file.
Default: `false`.

## lin_general.output_fragments

`output_fragments` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Observables block, at the expert tier.
Purpose: Output support functions, kernel and coeffs; 0 fragments and full system, 1 fragments only, 2 full system only.
Default: `0`.

Indicates how the support functions should be written to disk at the end of the run: * 0 => Fragments and full system * 1 => Fragments only * 2 => Full system only

## lin_general.kernel_restart_mode

`kernel_restart_mode` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Method for restarting kernel; 0 kernel, 1 coefficients, 2 random, 3 diagonal, 4 full kernel, 5 full coeffs.
Default: `0`.

Indicates how the kernel should be generated for a restart calculation: * 0 => Density kernel * 1 => Coefficients * 2 => Random * 3 => Diagonal kernel, i.e. support functions scaled by number of electrons (per fragment) * 4 => Atomic orbitals, i.e. first perform diagonalization and retain coefficients/kernel * 5 => Density kernel of full system (for the case where both fragment and full kernel is available) * 6 => Coefficients of full system (for the case where both fragment and full kernel is available) * 7 => Diagonal kernel with smearing

## lin_general.kernel_restart_noise

`kernel_restart_noise` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Add random noise to kernel or coefficients when restarting.
Default: `0.0`.

Indicates how much noise should be added to kernel or coefficients for a restart calculation

## lin_general.frag_num_neighbours

`frag_num_neighbours` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Number of neighbours to output for each fragment.
Default: `0`.

Indicates how many neighbouring atoms should be written to frag_env.xyz - only allow for a small number of neighbours

## lin_general.frag_neighbour_cutoff

`frag_neighbour_cutoff` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Number of neighbours to output for each fragment.
Default: `12.0`.

Distance (in bohr) beyond which neighbouring atoms are not included in frag_env.xyz

## lin_general.cdft_add_w_guess

`cdft_add_w_guess` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Add cdft_add_w_guess * W to kernel for CDFT initial guess.
Default: `0.0`.

possible value: 1 real number

## lin_general.calc_dipole

`calc_dipole` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Observables block, at the essential tier.
Purpose: Calculate dipole.
Default: `false`.

Indicates whether the dipole moment should be calculated after the run or not

## lin_general.calc_quadrupole

`calc_quadrupole` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Observables block, at the expert tier.
Purpose: Calculate quadrupole.
Default: `false`.

Indicates whether the quadrupole moment should be calculated after the run or not

## lin_general.subspace_diag

`subspace_diag` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the advanced tier.
Purpose: Diagonalization at the end.
Default: `false`.

Indicates whether a diagonalization shall be performed at the end of the run

## lin_general.extra_states

`extra_states` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the advanced tier.
Purpose: Number of extra states to include in support function and kernel optimization (dmin only), must be equal to norbsempty.
Default: `0`.

## lin_general.calculate_onsite_overlap

`calculate_onsite_overlap` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Calculate the onsite overlap matrix (has only an effect if the matrices are all written to disk).
Default: `false`.

## lin_general.charge_multipoles

`charge_multipoles` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Observables block, at the essential tier.
Purpose: Calculate the atom-centered multipole coefficients; 0 no, 1 old approach Loewdin, 2 new approach Projector.
Default: `0`.

Calculate the multipole expansion coefficients of the atomic charge which can then be used to establish a QM/MM coupling. Currently only implemented and tested for nspin=1 Possible values are: * 0 => no calculation * 1 => Loewdin approach, however without explicit orthogonalization #* 2 => new approach using simple projector and orthogonalized support functions #* 3 => new approach using full projector and orthogonalized support functions * 11 => Mulliken approach #* 12 => same as 2, but with non-orthogonalized support functions #* 13 => same as 3, but with non-orthogonalized support functions

## lin_general.check_multipoles

`check_multipoles` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Check the multipoles computed by computing the total dipole..
Default: `true`.

## lin_general.support_function_multipoles

`support_function_multipoles` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Observables block, at the advanced tier.
Purpose: Calculate the multipole moments of the support functions.
Default: `false`.

## lin_general.plot_locreg_grids

`plot_locreg_grids` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Plot the scaling function and wavelets grid of each localization region.
Default: `false`.

## lin_general.calculate_FOE_eigenvalues

`calculate_FOE_eigenvalues` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Observables block, at the expert tier.
Purpose: First and last eigenvalue to be calculated using the FOE procedure.
Default: `[0, -1]`.

## lin_general.precision_FOE_eigenvalues

`precision_FOE_eigenvalues` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Decay length of the error function used to extract the eigenvalues (i.e. something like the resolution).
Default: `0.005`.

## lin_general.multipole_centers

`multipole_centers` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Determines whether the multipole centers shall be determined automatically (i.e. taking the atoms) or whether they are provided manually.
Default: `0.0`.

## lin_general.consider_entropy

`consider_entropy` is an input variable of section `lin_general` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Indicate whether the entropy contribution to the total energy shall be considered.
Default: `false`.

## lin_basis.nit

`nit` is an input variable of section `lin_basis` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the advanced tier.
Purpose: Maximal number of iterations in the optimization of the support functions.
Default: `[4, 5]`.

Maximal number of iterations in the optimization of the support functions. The first number is used for the low accuracy part, the second one for the high accuracy part. If the hybrid mode is used, only the first value is taken into account.

## lin_basis.nit_ig

`nit_ig` is an input variable of section `lin_basis` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: maximal number of iterations to optimize the support functions in the extended input guess (experimental mode only).
Default: `50`.

## lin_basis.extended_ig

`extended_ig` is an input variable of section `lin_basis` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: whether or not to do an extended input guess (will be activated by default in experimental mode).
Default: `false`.

## lin_basis.orthogonalize_sfs

`orthogonalize_sfs` is an input variable of section `lin_basis` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: whether or not to explicitly orthogonalize SFs (will be activated by default except in experimental mode, and may eventually be automatically turned off).
Default: `true`.

## lin_basis.idsx

`idsx` is an input variable of section `lin_basis` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: DIIS history for optimization of the support functions (low/high accuracy); 0 -> SD.
Default: `[6, 6]`.

Indicates the method with which the support functions are optimized * n=0 => steepest descent * n>0 => DIIS with history length n

## lin_basis.gnrm_cv

`gnrm_cv` is an input variable of section `lin_basis` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Convergence criterion for the optimization of the support functions (low/high accuracy).
Default: `[0.01, 0.0001]`.

Convergence criterion for optimization of the support functions (high / low accuracy). The optimization stops if the mean gradient norm falls below this threshold. When the hybrid mode is used, only the first entry is taken into account.

## lin_basis.gnrm_ig

`gnrm_ig` is an input variable of section `lin_basis` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Convergence criterion for the optimization of the support functions in the extended input guess (experimental mode only).
Default: `0.001`.

## lin_basis.deltae_cv

`deltae_cv` is an input variable of section `lin_basis` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Total relative energy difference to stop the optimization ('experimental_mode' only).
Default: `0.0001`.

The optimization of the support functions stops if the total relative gain in the target function during the given cycle of support function optimization falls below this threshold

## lin_basis.gnrm_dyn

`gnrm_dyn` is an input variable of section `lin_basis` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Dynamic convergence criterion ('experimental_mode' only).
Default: `0.0001`.

From this value the effective dynamic convergence criterion is calculated by a division by kappa. Then the optimization of the support functions stops if the mean gradient norm falls below this effective dynamic convergence criterion and is at the same time smaller than the value of min_gnrm_for_dynamic. The specified value should be approximately 10 times smaller than the value of gnrm_cv. This value is only used for the experimental mode.

## lin_basis.min_gnrm_for_dynamic

`min_gnrm_for_dynamic` is an input variable of section `lin_basis` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Minimal gnrm to active the dynamic gnrm criterion.
Default: `0.001`.

The dynamic convergence criterion (specified by gnrm_dyn) is only active if the mean gradient norm of the support functions is below this threshold

## lin_basis.alpha_diis

`alpha_diis` is an input variable of section `lin_basis` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Multiplicator for DIIS.
Default: `1.0`.

possible value: 2 positive real numbers The support functions gradient is multiplied by this number before being used for the DIIS optimization. The first entry for the low accuracy part, the second one for the high accuracy part. When the hybrid mode is used, only the first entry is taken into account.

## lin_basis.alpha_sd

`alpha_sd` is an input variable of section `lin_basis` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Initial step size for SD.
Default: `1.0`.

The initial step size which is used to optimize the support functions with steepest descent. If the specified value is not appropriate, it will be adjusted automatically. The first entry is used for the low accuracy part, the second one for the high accuracy part. When the hybrid mode is used, only the first entry is taken into account.

## lin_basis.nstep_prec

`nstep_prec` is an input variable of section `lin_basis` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Number of iterations in the preconditioner.
Default: `5`.

Indicates how many iterations in the preconditioning of the gradient shall be performed

## lin_basis.fix_basis

`fix_basis` is an input variable of section `lin_basis` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Fix the support functions if the density change is below this threshold.
Default: `1e-10`.

## lin_basis.correction_orthoconstraint

`correction_orthoconstraint` is an input variable of section `lin_basis` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Correction for the slight non-orthonormality in the orthoconstraint.
Default: `1`.

Indicates whether the slight non-orthogonality of the support functions should be taken into account during the application of the orthogonality constraint - 0 => take into account - 1 => don't take into account

## lin_basis.orthogonalize_ao

`orthogonalize_ao` is an input variable of section `lin_basis` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Orthogonalize the atomic orbitals used as input guess.
Default: `true`.

## lin_basis.reset_DIIS_history

`reset_DIIS_history` is an input variable of section `lin_basis` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Reset the DIIS history when starting the loop which optimizes the support functions.
Default: `false`.

## lin_kernel.nstep

`nstep` is an input variable of section `lin_kernel` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Number of steps taken when updating the coefficients via direct minimization for each iteration of the density kernel loop.
Default: `[1, 1]`.

Indicates the number of steps taken when updating the coefficients via direct minimization for each iteration of the density kernel loop. The first entry is used for the low accuracy part, the second one for the high accuracy part. When the hybrid mode is used, only the first entry is taken into account.

## lin_kernel.nit

`nit` is an input variable of section `lin_kernel` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the advanced tier.
Purpose: Number of iterations in the (self-consistent) optimization of the density kernel.
Default: `[5, 5]`.

Indicates the number of iterations in the (self-consistent) optimization of the density kernel. The first entry is used for the low accuracy part, the second one for the high accuracy part. When the hybrid mode is used, only the first entry is taken into account.

## lin_kernel.idsx_coeff

`idsx_coeff` is an input variable of section `lin_kernel` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: DIIS history for direct mininimization - warning, there is currently a problem for idsx_coeff/=0.
Default: `[0, 0]`.

## lin_kernel.idsx

`idsx` is an input variable of section `lin_kernel` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Mixing method; 0 -> linear mixing, >=1 -> Pulay mixing.
Default: `[0, 0]`.

Indicates how the density / potential mixing shall be performed: n=0 => linear mixing n=1 => Pulay mixing with history length n The first entry is used for the low accuracy part, the second one for the high accuracy part. When the hybrid mode is used, only the first entry is taken into account.

## lin_kernel.alphamix

`alphamix` is an input variable of section `lin_kernel` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Mixing parameter (low/high accuracy).
Default: `[0.5, 0.5]`.

Indicates the mixing parameter used for the mixing of the charge density / potential. The larger the value, the more of the previous value will be kept. The first entry is used for the low accuracy part, the second one for the high accuracy part. When the hybrid mode is used, only the first entry is taken into account.

## lin_kernel.gnrm_cv_coeff

`gnrm_cv_coeff` is an input variable of section `lin_kernel` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Convergence criterion on the gradient for direct minimization.
Default: `[1e-05, 1e-05]`.

Convergence criterion on the gradient for direct minimization. The first entry is used for the low accuracy part, the second one for the high accuracy part. When the hybrid mode is used, only the first entry is taken into account.

## lin_kernel.rpnrm_cv

`rpnrm_cv` is an input variable of section `lin_kernel` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Convergence criterion (change in density/potential) for the kernel optimization.
Default: `[1e-10, 1e-10]`.

The optimization of the density kernel is stopped as soon as the mean change of the charge density / potential between two iterations falls below this threshold. The first entry is used for the low accuracy part, the second one for the high accuracy part. When the hybrid mode is used, only the first entry is taken into account.

## lin_kernel.linear_method

`linear_method` is an input variable of section `lin_kernel` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the advanced tier.
Purpose: Method to optimize the density kernel.
Default: `"DIAG"`.

Indicates the method with which the density kernel is optimized: * DIRMIN => direct minimization * DIAG => diagonalization with density mixing * NTPOLY => diagonalization using NTPoly. * FOE => Fermi Operator Expansion

## lin_kernel.mixing_method

`mixing_method` is an input variable of section `lin_kernel` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Quantity to be mixed.
Default: `"DEN"`.

Indicates which quantity should be used for the mixing procedure: DEN => density mixing POT => potential mixing

## lin_kernel.alpha_sd_coeff

`alpha_sd_coeff` is an input variable of section `lin_kernel` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Initial step size for SD for direct minimization.
Default: `0.2`.

## lin_kernel.alpha_fit_coeff

`alpha_fit_coeff` is an input variable of section `lin_kernel` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Update the SD step size by fitting a quadratic polynomial.
Default: `false`.

Update the SD step size by fitting a quadratic polynomial to the energy along the direction of the gradient during direct mininimization.

## lin_kernel.coeff_scaling_factor

`coeff_scaling_factor` is an input variable of section `lin_kernel` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Factor to scale the gradient in direct minimization.
Default: `1.0`.

Specifies a scaling factor for the coefficient gradient, recommended to be around 0.1 - 0.5 for CDFT, fragment calculations or systems where convergence is unstable.

## lin_kernel.delta_pnrm

`delta_pnrm` is an input variable of section `lin_kernel` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Stop the kernel optimization if the density/potential difference has decreased by this factor (deactivated if -1.0).
Default: `-1.0`.

stop the kernel optimization if the density/potential difference has decreased by this factor compared to the first iteration. The feature is deactivated for a value of -1.0

## lin_kernel.diag_start

`diag_start` is an input variable of section `lin_kernel` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: whether or not to diagonalize the SF Hamiltonian at the beginning of a restart calculation (useful for (pseudo-)fragment calculations).
Default: `false`.

## lin_basis_params.nbasis

`nbasis` is an input variable of section `lin_basis_params` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the advanced tier.
Purpose: Number of support functions per atom.
Default: `4`.

Indicates the number of support fuctions centered on this atom type. Possible values are: * 1 (s orbital type) * 4 (s,p orbital types) * 9 (s,p,d orbital types) * 16 (s,p,d,f orbital types)

## lin_basis_params.ao_confinement

`ao_confinement` is an input variable of section `lin_basis_params` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Prefactor for the input guess confining potential.
Default: `0.0083`.

Indicates the prefactor of the confining potential of this atom type which is used to generate the input guess.

## lin_basis_params.confinement

`confinement` is an input variable of section `lin_basis_params` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the advanced tier.
Purpose: Prefactor for the confining potential (low/high accuracy).
Default: `[0.0083, 0.0]`.

Indicates the prefactor of the confining potential of this atom type. The first entry is used for the low accuracy part, the second one for the high accuracy part. When the hybrid mode is used, only the first entry is taken into account.

## lin_basis_params.rloc

`rloc` is an input variable of section `lin_basis_params` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the advanced tier.
Purpose: Localization radius for the support functions.
Default: `[7.0, 7.0]`.

Indicates the cutoff radius for the support functions. The first entry is used for the low accuracy part, the second one for the high accuracy part; the second value must not be smaller than the first one. When the hybrid mode is used, only the first entry is taken into account.

## lin_basis_params.rloc_kernel

`rloc_kernel` is an input variable of section `lin_basis_params` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the advanced tier.
Purpose: Localization radius for the density kernel.
Default: `9.0`.

Indicates the cutoff radius for the density kernel. Must be at least as large as the support function cutoff plus 8 times the grid spacing; will be adjusted automatically if it is chosen too small.

## lin_basis_params.rloc_kernel_foe

`rloc_kernel_foe` is an input variable of section `lin_basis_params` (bigdft/src/input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Cutoff radius for the FOE matrix vector multiplications.
Default: `14.0`.

Indicates the cutoff radius used for the matrix vector multiplications. Must be at least as large as the kernel cutoff.

## Profile linear_accurate

`linear_accurate` is a profile called with `import: linear_accurate`. Appropriate input parameters for a high accuracy linear scaling calculation. This profile should be chosen if highly accurate energy differences are required.

## Profile linear_moderate

`linear_moderate` is a profile called with `import: linear_moderate`. Appropriate input parameters for a moderate accuracy linear scaling calculation. This profile should be chosen if accurate forces are required, but there is no need for extremely accurate energies.

## Profile linear_fast

`linear_fast` is a profile called with `import: linear_fast`. Appropriate input parameters for a low accuracy linear scaling calculation. This profile should be chosen if speed is more important than accuracy.

## Profile linear_laura

`linear_laura` is a profile called with `import: linear_laura`. temporary profile, to be merged. Lauras favourite linear parameters

## Profile mixing

`mixing` is a profile called with `import: mixing`. To be used for metallic systems. Parameters for the mixing scheme associated to the diagonalization method.

## Profile linear

`linear` is a profile called with `import: linear`. Linear parameters sufficient for PDoS, charge analysis, MD. Basic parameters to perform a linear calculation.

## Profile linear_virtual

`linear_virtual` is a profile called with `import: linear_virtual`. Input parameters to be added to the linear profile for virtual states inclusion.

## Profile linear_fragments

`linear_fragments` is a profile called with `import: linear_fragments`. Input parameters to be added to the linear profile for fragment calculation (templates ready).

## Profile linear_convergence

`linear_convergence` is a profile called with `import: linear_convergence`. Parameters to supplement linear to help with convergence.. Include this profile with linear if you have convergence problems.

## Profile linear_purify

`linear_purify` is a profile called with `import: linear_purify`. Input parameters to turn on purification instead of chess. Extra parameters for linear if you want to use NTPoly purification

## Profile md

`md` is a profile called with `import: md`. Molecular dynamics input parameters for H2O molecules.

## psolver.kernel.screening

`screening` is an input variable of section `psolver.kernel` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Environment block, at the advanced tier.
Purpose: Mu screening parameter.
Default: `0`.

Activates the exponential (Yukawa-like) screening in the coulomb kernel

## psolver.kernel.isf_order

`isf_order` is an input variable of section `psolver.kernel` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Environment block, at the advanced tier.
Purpose: Order of the Interpolating Scaling Function family.
Default: `16`.

Fixes the order of the ISF family that is used for the discretization of the kernel

## psolver.kernel.stress_tensor

`stress_tensor` is an input variable of section `psolver.kernel` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Environment block, at the expert tier.
Purpose: Triggers the calculation of the stress tensor.
Default: `true`.

It calculates the derivative of the hartree energy with respect to the deformation. It makes sense only for a vacuum-like calculation

## psolver.environment.cavity

`cavity` is an input variable of section `psolver.environment` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Environment block, at the essential tier.
Purpose: Type of the cavity.
Default: `"none"`.

When not none, a cavity around the density is fixed

## psolver.environment.epsilon

`epsilon` is an input variable of section `psolver.environment` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Environment block, at the advanced tier.
Purpose: Dielectric constant of the exterior region.
Default: `"water"`.

## psolver.environment.edensmaxmin

`edensmaxmin` is an input variable of section `psolver.environment` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Environment block, at the expert tier.
Purpose: Extremum values of the charge density, for the definition of the transition region.
Default: `[0.0001, 0.005]`.

## psolver.environment.radii_set

`radii_set` is an input variable of section `psolver.environment` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Environment block, at the advanced tier.
Purpose: Set of vdW radii used by default in the setter function.
Default: `"UFF"`.

## psolver.environment.atomic_radii

`atomic_radii` is an input variable of section `psolver.environment` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Environment block, at the expert tier.
Purpose: Mapping of the radii that have to be used for each atomic species.
Default: `0`.

## psolver.environment.delta

`delta` is an input variable of section `psolver.environment` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Environment block, at the advanced tier.
Purpose: Amplitude of the transition region in the soft-sphere cavity (AU).
Default: `0.5`.

## psolver.environment.cavitation

`cavitation` is an input variable of section `psolver.environment` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Environment block, at the advanced tier.
Purpose: Triggers the evaluation of the extra cavitation terms.
Default: `true`.

## psolver.environment.fact_rigid

`fact_rigid` is an input variable of section `psolver.environment` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Environment block, at the advanced tier.
Purpose: Multiplying factor for the whole soft-sphere cavity.
Default: `1.12`.

## psolver.environment.gammaS

`gammaS` is an input variable of section `psolver.environment` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Environment block, at the expert tier.
Purpose: Cavitation term, surface tension of the solvent [dyn/cm].
Default: `"water"`.

## psolver.environment.alphaS

`alphaS` is an input variable of section `psolver.environment` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Environment block, at the expert tier.
Purpose: Proportionality of repulsion free energy in term of the surface integral [dyn/cm].
Default: `"water"`.

## psolver.environment.betaV

`betaV` is an input variable of section `psolver.environment` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Environment block, at the expert tier.
Purpose: Proportionality of dispersion free energy in term of volume integral [GPa].
Default: `"water"`.

## psolver.environment.gps_algorithm

`gps_algorithm` is an input variable of section `psolver.environment` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Environment block, at the advanced tier.
Purpose: Algorithm for the Generalised Poisson Equation.
Default: `"PCG"`.

## psolver.environment.pi_eta

`pi_eta` is an input variable of section `psolver.environment` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Environment block, at the expert tier.
Purpose: Mixing parameter of the SC algorithm.
Default: `0.6`.

## psolver.environment.input_guess

`input_guess` is an input variable of section `psolver.environment` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Environment block, at the expert tier.
Purpose: Triggers the input guess procedure of gps_algorithm.
Default: `true`.

## psolver.environment.fd_order

`fd_order` is an input variable of section `psolver.environment` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Environment block, at the expert tier.
Purpose: Order of the Finite-difference derivatives for the GPS solver.
Default: `16`.

## psolver.environment.itermax

`itermax` is an input variable of section `psolver.environment` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Environment block, at the expert tier.
Purpose: Maximum number of iterations of the GPS outer loop.
Default: `200`.

## psolver.environment.minres

`minres` is an input variable of section `psolver.environment` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Environment block, at the expert tier.
Purpose: Convergence threshold of the loop.
Default: `1e-08`.

## psolver.environment.pb_method

`pb_method` is an input variable of section `psolver.environment` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Environment block, at the advanced tier.
Purpose: Defines the method for the Poisson Boltzmann Equation.
Default: `"none"`.

## psolver.environment.pb_minres

`pb_minres` is an input variable of section `psolver.environment` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Environment block, at the expert tier.
Purpose: Convergence criterion of the PBe loop.
Default: `1e-10`.

## psolver.environment.pb_input_guess

`pb_input_guess` is an input variable of section `psolver.environment` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Environment block, at the expert tier.
Purpose: Triggers the input guess procedure of PBe loop.
Default: `true`.

## psolver.environment.pb_eta

`pb_eta` is an input variable of section `psolver.environment` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Environment block, at the expert tier.
Purpose: Mixing parameter of the PBe loop.
Default: `1.0`.

## psolver.environment.pb_itermax

`pb_itermax` is an input variable of section `psolver.environment` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Environment block, at the expert tier.
Purpose: Maximum number of iterations of the PBe loop.
Default: `50`.

## psolver.environment.pb_t

`pb_t` is an input variable of section `psolver.environment` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Environment block, at the expert tier.
Purpose: Temperature in Kelvin of the electrolytic solution.
Default: `300.0`.

## psolver.environment.pb_ions

`pb_ions` is an input variable of section `psolver.environment` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Environment block, at the expert tier.
Purpose: List of the ions of the PBe environment.
Default: `"nacl"`.

## psolver.setup.accel

`accel` is an input variable of section `psolver.setup` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Machine block, at the essential tier.
Purpose: Material Acceleration.
Default: `"none"`.

## psolver.setup.keep_gpu_memory

`keep_gpu_memory` is an input variable of section `psolver.setup` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Do not deallocate GPU memory at each call of the (G)PS routine.
Default: `true`.

## psolver.setup.use_gpu_direct

`use_gpu_direct` is an input variable of section `psolver.setup` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Force (or not) the usage of GPUdirect communication, if available.
Default: `true`.

## psolver.setup.taskgroup_size

`taskgroup_size` is an input variable of section `psolver.setup` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Size of the taskgroups of the Poisson Solver.
Default: `0`.

## psolver.setup.global_data

`global_data` is an input variable of section `psolver.setup` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Charge density and Electrostatic potential are given by global arrays.
Default: `false`.

## psolver.setup.verbose

`verbose` is an input variable of section `psolver.setup` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Verbosity switch.
Default: `true`.

## psolver.setup.output

`output` is an input variable of section `psolver.setup` (psolver/src/PS_input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: Quantities to be plotted after the main solver routine.
Default: `"none"`.

Might be a list containing kewywords like cavity, potential or density

## Profile water

`water` is a profile called with `import: water`. Solvation in water.

## chess.foe.ef_interpol_det

`ef_interpol_det` is an input variable of section `chess.foe` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: FOE max determinant of cubic interpolation matrix.
Default: `1e-12`.

## chess.foe.ef_interpol_chargediff

`ef_interpol_chargediff` is an input variable of section `chess.foe` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: FOE max charge difference for interpolation.
Default: `1.0`.

## chess.foe.evbounds_nsatur

`evbounds_nsatur` is an input variable of section `chess.foe` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Number of FOE cycles before the eigenvalue bounds are shrinked (linear).
Default: `3`.

## chess.foe.evboundsshrink_nsatur

`evboundsshrink_nsatur` is an input variable of section `chess.foe` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Maximal number of unsuccessful eigenvalue bounds shrinkings.
Default: `4`.

## chess.foe.fscale

`fscale` is an input variable of section `chess.foe` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the advanced tier.
Purpose: Initial guess for the error function decay length.
Default: `0.05`.

Indicates the decay length of the error function which is used by the Fermi Operator Expasion to construct the density kernel. This value will be adjusted automatically if not chosen appropriately.

## chess.foe.fscale_lowerbound

`fscale_lowerbound` is an input variable of section `chess.foe` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Lower bound for the error function decay length.
Default: `0.005`.

## chess.foe.fscale_upperbound

`fscale_upperbound` is an input variable of section `chess.foe` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Upper bound for the error function decay length.
Default: `0.05`.

## chess.foe.eval_range_foe

`eval_range_foe` is an input variable of section `chess.foe` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Lower and upper bound of the eigenvalue spectrum, will be adjusted automatically if chosen unproperly.
Default: `[-0.5, 0.5]`.

Indicates the lower and upper bound of the eigenvalue spectrum which is used for the Fermi Operator Expansion. This spectrum will be adjusted automatically if not chosen appropriately.

## chess.foe.accuracy_foe

`accuracy_foe` is an input variable of section `chess.foe` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Required accuracy for the Chebyshev fit for FOE.
Default: `1e-05`.

## chess.foe.accuracy_ice

`accuracy_ice` is an input variable of section `chess.foe` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Required accuracy for the Chebyshev fit for ICE (calculation of matrix powers).
Default: `1e-08`.

## chess.foe.accuracy_penalty

`accuracy_penalty` is an input variable of section `chess.foe` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Required accuracy for the Chebyshev fit for the penalty function.
Default: `1e-05`.

## chess.foe.accuracy_entropy

`accuracy_entropy` is an input variable of section `chess.foe` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: Required accuracy for the Chebyshev fit for the function to calculate the entropy term.
Default: `0.0001`.

## chess.foe.betax_foe

`betax_foe` is an input variable of section `chess.foe` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: the exponent in the exponential penalty function which is used to determine the eigenvalue bounds for FOE.
Default: `-1000.0`.

## chess.foe.betax_ice

`betax_ice` is an input variable of section `chess.foe` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: the exponent in the exponential penalty function which is used to determine the eigenvalue bounds for ICE.
Default: `-1000.0`.

## chess.foe.occupation_function

`occupation_function` is an input variable of section `chess.foe` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: the function to assign the occupation numbers.
Default: `102`.

## chess.foe.adjust_fscale

`adjust_fscale` is an input variable of section `chess.foe` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: dynamically adjust the value of fscale or not.
Default: `true`.

## chess.foe.matmul_optimize_load_balancing

`matmul_optimize_load_balancing` is an input variable of section `chess.foe` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: optimize the load balancing of the sparse matrix matrix multiplications (at the cost of memory unbalancing).
Default: `false`.

## chess.foe.fscale_ediff_low

`fscale_ediff_low` is an input variable of section `chess.foe` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: lower bound for the optimal relative energy difference between the kernel and the control kernel.
Default: `5e-05`.

## chess.foe.fscale_ediff_up

`fscale_ediff_up` is an input variable of section `chess.foe` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: upper bound for the optimal relative energy difference between the kernel and the control kernel.
Default: `0.0001`.

## chess.lapack.blocksize_pdsyev

`blocksize_pdsyev` is an input variable of section `chess.lapack` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: SCALAPACK linear scaling blocksize for diagonalization.
Default: `-8`.

## chess.lapack.blocksize_pdgemm

`blocksize_pdgemm` is an input variable of section `chess.lapack` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: SCALAPACK linear scaling blocksize for matrix matrix multiplication.
Default: `-8`.

## chess.lapack.maxproc_pdsyev

`maxproc_pdsyev` is an input variable of section `chess.lapack` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: SCALAPACK linear scaling max num procs.
Default: `4`.

## chess.lapack.maxproc_pdgemm

`maxproc_pdgemm` is an input variable of section `chess.lapack` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Machine block, at the expert tier.
Purpose: SCALAPACK linear scaling max num procs.
Default: `4`.

## chess.ntpoly.serial_io

`serial_io` is an input variable of section `chess.ntpoly` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: turn on serial IO if MPI is having problem on a machine..
Default: `false`.

## chess.ntpoly.threshold_density

`threshold_density` is an input variable of section `chess.ntpoly` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the advanced tier.
Purpose: threshold for flushing small matrix values of the density matrix..
Default: `0.0`.

## chess.ntpoly.convergence_density

`convergence_density` is an input variable of section `chess.ntpoly` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: threshold for convergence of ntpoly purification calculation..
Default: `1e-10`.

## chess.ntpoly.threshold_overlap

`threshold_overlap` is an input variable of section `chess.ntpoly` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: threshold for flushing small matrix values of the overlap matrix..
Default: `0.0`.

## chess.ntpoly.convergence_overlap

`convergence_overlap` is an input variable of section `chess.ntpoly` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: threshold for convergence of ntpoly overlap inverse calculation..
Default: `1e-10`.

## chess.ntpoly.temperature

`temperature` is an input variable of section `chess.ntpoly` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: temperature in Kelvin for smearing..
Default: `300`.

## chess.ntpoly.step_size

`step_size` is an input variable of section `chess.ntpoly` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: step size for differential equation solvers (WOM).
Default: `0.01`.

## chess.ntpoly.solver

`solver` is an input variable of section `chess.ntpoly` (chess/src/chess_input_variables_definition.yaml). The workshop exposes it in the Accuracy block, at the expert tier.
Purpose: the density matrix solver to use..
Default: `1`.
