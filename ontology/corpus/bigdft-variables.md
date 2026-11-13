# Variables d'entrée de BigDFT

Source : bigdft-suite, révision 213bc56f51b9e990fe5b9f035402f36d01b19816 2026-09-25. Fichier généré par tools/build_aom_corpus.py.

## dft.hgrids
Le paramètre `hgrids` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau essentiel.
Rôle : Grid spacing in the three directions (bohr).
Valeur par défaut : `[0.45, 0.45, 0.45]`.
Valeurs admises : de 0.0 à 4.0.
Grid spacing in three directions (Bohr units) of the coarse mesh as [0.5, 0.45, 0.4]. A scalar can also be given as 0.45. The grid spacing of the Cartesian grid, in Bohr. As described in the wavelet formalism section, the nodes of this grid serve as the centers for the scaling function/wavelet basis. Values are in most cases between 0.3 and 0.6 bohr.

## dft.ngrids
Le paramètre `ngrids` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau avancé.
Rôle : Number of grid spacing division in each direction.
Valeur par défaut : `[0, 0, 0]`.
Valeurs admises : de 0 à 1000.
Valeurs nommées : `auto` = `[0, 0, 0]`.
Number of grid spacing division in each direction. Values are relevant only for periodic directions. This is convenient to keep the constant the number of wavelets when changing the super-cell dimensions. These values override hgrid ones.

## dft.rmult
Le paramètre `rmult` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau essentiel.
Rôle : c(f)rmult*radii_cf(:,1(2))=coarse(fine) atom-based radius.
Valeur par défaut : `[5.0, 8.0]`.
Valeurs admises : de 0.0 à 20.0.
Coarse and fine multiplier as [4.0, 8.0]. These numbers determine the extension of the coarse and fine region respectively.

## dft.ixc
Le paramètre `ixc` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Théorie, au niveau essentiel.
Rôle : Exchange-correlation parameter (LDA=1,PBE=11).
Valeur par défaut : `1`.
Valeurs nommées : `LDA (ABINIT)` = `1`; `PBE (ABINIT)` = `11`; `LDA` = `-20`; `PBE` = `-101130`; `PBE0` = `-406`; `B97-D` = `-170`; `B3LYP` = `-402`; `HARTREE` = `0`; `HF` = `100`; `NONE` = `1000`.
Determine the exchange-correlation functional. Integer specifying which exchange correlation functional will be used. The Abinit conventions are used and detailed information can be found on the Abinit Web page. Here is only a short summary of some widely used functionals - Pade LDA from Abinit XC library; - PBE from Abinit XC library; - Pade LDA from libXC; - PBE from libXC; - PBEsol from libXC; - PBE0 Hybrid functional (local part from libXC). A positive integer refers to a functional from ABINIT library and a negative one from libXC library. In this case, you concatenate the codes for the exchange part and for the correlation part (see the table of codes).

## dft.qcharge
Le paramètre `qcharge` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Théorie, au niveau essentiel.
Rôle : Charge of the system. Can be integer or real..
Valeur par défaut : `0`.
Valeurs admises : de -500.0 à 500.0.
Total charge of the system. A positive qcharge means that electrons are taken away and a negative one means that extra electrons are added.

## dft.elecfield
Le paramètre `elecfield` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau essentiel.
Rôle : Electric field (Ex,Ey,Ez).
Valeur par défaut : `[0.0, 0.0, 0.0]`.
Uniform electric field Ex, Ey, Ez in units of Ha/Bohr. The electric field can not have components in periodic directions, e.g. Ex = Ez = 0 in case surface BC is used.

## dft.nspin
Le paramètre `nspin` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Théorie, au niveau essentiel.
Rôle : Spin polarization treatment.
Valeur par défaut : `1`.
Valeurs possibles : `1` (No spin); `2` (Collinear); `4` (Non-collinear).
Spin polarization treatment; 1 no spin (as LDA), 2 spin-polarisation (LSD or collinear) and 4 non-collinear i.e. two components per electron.

## dft.mpol
Le paramètre `mpol` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Théorie, au niveau essentiel.
Rôle : Total magnetic moment.
Valeur par défaut : `0`.
Total magnetic moment which has to be the same parity as the total number of electrons (nelec_up-nelec_down=mpol). You should also define the keyword 'IGSpin' or add a spin per atom to specify the polarisation for the input guess.

## dft.gnrm_cv
Le paramètre `gnrm_cv` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau essentiel.
Rôle : Convergence criterion gradient.
Valeur par défaut : `0.0001`.
Valeurs admises : de 1e-20 à 1.0.
Valeurs nommées : `fast` = `0.001`; `accurate` = `1e-05`.
Convergence criterion for the wavefunction optimization (norm of the gradient). Reasonable values are in most cases between 1.d-4 and 1.d-5.

## dft.itermax
Le paramètre `itermax` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau avancé.
Rôle : Max. iterations of wfn. opt. steps.
Valeur par défaut : `50`.
Valeurs admises : de 0 à 10000.
Maximum number of gradient evaluations for a single cycle in a wavefunction optimization and maximum number of cycles. At the end of each cycle a subspace diagonalization is done which helps in cases where one has near degeneracy between the HOMO and LUMO orbitals. 50 are usually sufficient.

## dft.itermin
Le paramètre `itermin` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Minimal iterations of wfn. optimized steps.
Valeur par défaut : `0`.
Valeurs admises : de 0 à 10000.

## dft.nrepmax
Le paramètre `nrepmax` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau avancé.
Rôle : Max. number of re-diag. runs.
Valeur par défaut : `1`.
Valeurs admises : de 0 à 1000.
Valeurs nommées : `accurate` = `10`.
Maximum number of gradient evaluations for a single cycle in a wavefunction optimization and maximum number of cycles. At the end of each cycle a subspace diagonalization is done which helps in cases where one has near degeneracy between the HOMO and LUMO orbitals. 50 are usually sufficient.

## dft.ncong
Le paramètre `ncong` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau avancé.
Rôle : No. of CG it. for preconditioning eq..
Valeur par défaut : `6`.
Valeurs admises : de 0 à 20.
ncong gives the number of iterations in the solution of the preconditioning equation. For free boundary conditions 5 is a good value whereas for other boundary condition a value from 0 to 2 is in general sufficient. Large values of ncong lead to a smaller number of iterations in the wavefunction optimization and better forces, but each iteration is more costly. So an optimal compromise value has to be found.

## dft.idsx
Le paramètre `idsx` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau avancé.
Rôle : Wfn. diis history.
Valeur par défaut : `6`.
Valeurs admises : de 0 à 15.
Valeurs nommées : `low_memory` = `2`.
idsx gives the history length of the DIIS convergence acceleration in the wavefunction optimization. 6 is usually a good value for fast convergence. In case of convergence problems it can be advantageous to switch off DIIS by setting idsx = 0. The memory requirements grow considerably with large values of idsx. If memory is the limiting factor one has to choose idsx smaller than the value which gives the fastest convergence. The bigdft-tool tool can be used to predict the memory requirements for different choices of idsx.

## dft.dispersion
Le paramètre `dispersion` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Théorie, au niveau essentiel.
Rôle : Dispersion correction potential (values 1,2,3,4,5), 0=none.
Valeur par défaut : `0`.
Valeurs admises : de 0 à 5.
A non-zero values activates an empirical add-on treatment of dispersion effects. The values 1, 2 and 3 specify different switching on functions using the convention.

## dft.inputpsiid
Le paramètre `inputpsiid` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau essentiel.
Rôle : Input guess wavefunctions.
Valeur par défaut : `0`.
Valeurs possibles : `-1000` (Empty); `-2` (Random); `-1` (CP2K); `0` (LCAO); `1` (Wvl. in memory); `2` (Wvl. on disk); `3` (Plane-waves on disk); `10` (LCAO + gauss.); `11` (Gauss. in memory); `12` (Gauss. on disk); `100` (Linear AO); `101` (Linear restart); `102` (Linear on disk).
Valeurs nommées : `LCAO` = `0`; `RANDOM` = `-2`; `linear` = `100`; `linear_restart` = `102`.
Specifies how the input guess wavefunction is generated - -2 Random numbers are used as input guess. his is of course a poor input guess which will need many iterations of the wavefunction optimization and might even lead to divergences. - -1 The input wavefunction is imported from the CP2K code which uses Gaussian functions. The basis set should be contained in a file named gaubasis.dat whereas the coefficients should appear in the gaucoeff.dat file. Both files are the output files of CP2K code. See the H2O-CP2K test for an example. - 0 A subspace diagonalization in a minimal atomic basis set is used. This input guess should be used in general if one starts a new calculation. - 1 The previously calculated wavefunctions (for instance from the previous geometry optimization step) are used as input guess. Setting InputPsiId to this value does only make sense from within a main program where call_cluster() subroutine was called previously. The old wavefunction is passed to the new call via the data structure restart. - 2 The input wavefunction is read from the wavefunction. files which contain all the scaling function and wavelet coefficients. In case some parameters such as hgrids or crmult have changed, compared to the previous run, the wavefunctions will be also transformed to the new parameter set. Use also this value to restart from ETSF file format wavefunction-etsf.nc. - 10 The same as 0 but activates the ’Gaussian help’ after convergence the wavefunctions are projected onto the localised basis set used for the input guess, and Mulliken Charge Population Analysis (MCPA) is performed on this basis. The user has the possibility to perform MCPA with separate basis set (functionality to be added). - 11 Restart with Gaussian approximation contained in the ’restart’ data structure. - 12 The input wavefunction is read from the wavefunctions.gau file, which contains an approximation in a minimal Gaussian basis set of the previously calculated wavefunctions. - 100 Use Linear Atomic Orbitals - 101 Restart for Linear - 102 Linear on disk

## dft.local_potential
Le paramètre `local_potential` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Path to the local potential.
Valeur par défaut : `""`.
N'a de sens que selon `inputpsiid` (valeurs : [-1000, -2, -1, 2, 3]).

## dft.projection
Le paramètre `projection` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Théorie, au niveau expert.
Rôle : Projector construction method.
Valeur par défaut : `"gaussian"`.
Valeurs possibles : `gaussian` (tensor product of 1D separable gaussians); `radial` (real space collocation of radial functions); `radial+mp` (as radial, but using multipole preserving techniques).
Specifies how the projectors are expressed in Daubechies from atomic description

## dft.output_denspot
Le paramètre `output_denspot` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Mesures, au niveau essentiel.
Rôle : Output of the density or the potential.
Valeur par défaut : `0`.
Valeurs possibles : `0` (None); `1` (Density in plain text); `2` (Density and potentials in plain text); `11` (Density in ETSF file format); `12` (Density and potentials in ETSF file format); `21` (Density in cube file format); `22` (Density and potentials in cube file format).
controls the output of density and pontentials on disk at the end of the calculation - output_denspot = 0, No output density is written. - output_denspot = 1, Output electronic density is written in the .pot format of V_Sim into the file electronic_density.pot (deprecated, use 11 instead). - output_denspot = 2, In addition to the electronic density, the potential (local_potential.pot) and its components (external_potential.pot and Hartree_potential.pot) are also output in plain text .pot files (deprecated, use 12 instead). - output_denspot = 11, Same as output_denspot = 1, but files are written in ETSF file format (portable binary format based on NetCDF). - output_denspot = 12, Same as output_denspot = 2, but files are written in ETSF file format (portable binary format based on NetCDF). - output_denspot = 21, Same as output_denspot = 1, but files are written in .cube file format (plain text). - output_denspot = 22, Same as output_denspot = 2, but files are written in .cube file format (plain text).

## dft.rbuf
Le paramètre `rbuf` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau avancé.
Rôle : Length of the tail (AU).
Valeur par défaut : `0.0`.
Valeurs admises : de 0.0 à 10.0.
Valeurs nommées : `with tails` = `5.0`.

## dft.ncongt
Le paramètre `ncongt` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : No. of tail CG iterations.
Valeur par défaut : `30`.
Valeurs admises : de 0 à 50.
Far reaching tails of the wavefunctions decaying into the vacuum are added in a perturbative treatment if the variable rbuf is set to a strictly positive value. This allows to do a calculation with some moderate value of crmult and then to extrapolate to the limit of large crmult. This procedure is not variational and gives too low energies. The true energy is in between the two energies and in general much closer to the extrapolated energy. This procedure can also be used to judge whether the chosen value of crmult is large enough for a certain required precision. rbuf gives the amount by which the radii for the coarse resolution region are increased in atomic units. ncongt gives the number of iterations used in the perturbation calculation. Reasonable values for ncongt are around 30.

## dft.norbv
Le paramètre `norbv` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau avancé.
Rôle : Davidson subspace dimension (No. virtual orbitals).
Valeur par défaut : `0`.
Valeurs admises : de -9999 à 9999.
Determine the dimension of the subspace i.e. the number of virtual orbitals to calculate via a Davidson diagonalisation. Usually unoccupied orbitals are not calculated since they are not needed for the total energy and other physical properties of the electronic ground state. Putting norbv to a non-zero value will result in the calculation of norbv virtual orbitals in a postprocessing routine after the occupied orbitals have been calculated, which uses Davidson iterative treatment. nvirt (< norbv) determines to the number of converged orbitals during the convergence process which is taking care of during the Davidson iterations. nplot of these orbitals will be written in the virtual.*.pot files and nplot (if that many exist) of the highest occupied orbitals will be written in the orbital.*.pot file. The Kohn Sham eigenvalues are written in the ordinary output file.

## dft.nvirt
Le paramètre `nvirt` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau avancé.
Rôle : No. of converged virtual orbs (< norbv).
Valeur par défaut : `0`.
Valeurs admises : de 0 à 9999.
Determine the dimension of the subspace i.e. the number of virtual orbitals to be converged via a Davidson diagonalisation. (should be < norbv) Usually unoccupied orbitals are not calculated since they are not needed for the total energy and other physical properties of the electronic ground state. Putting norbv to a non-zero value will result in the calculation of norbv virtual orbitals in a postprocessing routine after the occupied orbitals have been calculated, which uses Davidson iterative treatment. nvirt (< norbv) determines to the number of converged orbitals during the convergence process which is taking care of during the Davidson iterations. nplot of these orbitals will be written in the virtual.*.pot files and nplot (if that many exist) of the highest occupied orbitals will be written in the orbital.*.pot file. The Kohn Sham eigenvalues are written in the ordinary output file.

## dft.nplot
Le paramètre `nplot` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Mesures, au niveau essentiel.
Rôle : No. of plotted orbs.
Valeur par défaut : `0`.
Valeurs admises : de 0 à 9999.
Number of orbitals to be plotted Determine the dimension of the subspace i.e. the number of virtual orbitals to calculate via a Davidson diagonalisation. Usually unoccupied orbitals are not calculated since they are not needed for the total energy and other physical properties of the electronic ground state. Putting norbv to a non-zero value will result in the calculation of norbv virtual orbitals in a postprocessing routine after the occupied orbitals have been calculated, which uses Davidson iterative treatment . nplot of these orbitals will be written in the virtual.*.pot files and nplot (if that many exist) of the highest occupied orbitals will be written in the orbital.*.pot file The Kohn Sham eigenvalues are written in the ordinary output file. nvirt corresponds to the actual number of orbitals the convergence process is taking care of during the Davidson iterations.

## dft.gnrm_cv_virt
Le paramètre `gnrm_cv_virt` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Convergence criterion gradient for virtual orbitals.
Valeur par défaut : `0.0001`.
Valeurs admises : de 1e-20 à 1.0.
Valeurs nommées : `fast` = `0.001`; `accurate` = `1e-05`.
Norm of the gradient for virtual orbitals convergence. Calculates the results on the first nvirt orbitals

## dft.itermax_virt
Le paramètre `itermax_virt` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Max. iterations of wfn. opt. steps for virtual orbitals.
Valeur par défaut : `50`.
Valeurs admises : de 0 à 10000.
Maximum number of gradient evaluations for a cycle of a wavefunction optimization for the virtual orbitals.

## dft.disablesym
Le paramètre `disablesym` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau avancé.
Rôle : Disable the symmetry detection.
Valeur par défaut : `false`.
Disable the symmetry detection (by default No except for isolated systems). By default symmetries are used to update the density in periodic boundary condition calculations, and surface boundary conditions also.

## dft.external_potential
Le paramètre `external_potential` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau avancé.
Rôle : Multipole moments of an external potential.
Valeur par défaut : `0.0`.
Give the multipole moments up to quadrupoles

## dft.calculate_strten
Le paramètre `calculate_strten` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Mesures, au niveau avancé.
Rôle : Boolean to activate the calculation of the stress tensor. Might be set to No for performance reasons.
Valeur par défaut : `true`.
In some cases, for example when doing MD for fixed volume systems, it might be useful to disable the calculation of the stress tensor, to save computational time.

## dft.magnetic_torque
Le paramètre `magnetic_torque` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Théorie, au niveau expert.
Rôle : Boolean to activate the calculation of the direction of the atomic magnetization which lowers the total energy.
Valeur par défaut : `false`.
N'a de sens que selon `nspin` (valeurs : [4]).

## dft.spin_dynamics
Le paramètre `spin_dynamics` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Théorie, au niveau expert.
Rôle : Boolean to activate the calculation of the direction of the atomic magnetization which lowers the total energy.
Valeur par défaut : `false`.
N'a de sens que selon `magnetic_torque` (valeurs : [True]).

## dft.plot_mppot_axes
Le paramètre `plot_mppot_axes` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Mesures, au niveau expert.
Rôle : Plot the potential generated by the multipoles along axes through this point. Negative values mean no plot..
Valeur par défaut : `[-1, -1, -1]`.
If present, the potential generated by the multipoles will be written in the .cube format and also be plotted along axes through the specified point. If no plot is desired, the values should be negative.

## dft.plot_pot_axes
Le paramètre `plot_pot_axes` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Mesures, au niveau expert.
Rôle : Plot the potential along axes through this point. Negative values mean no plot..
Valeur par défaut : `[-1, -1, -1]`.
If present and the chosen plotting format is .cube, the potential will be written in the .cube format and also be plotted along axes through the specified point. If no plot is desired, the values should be negative.

## dft.occupancy_control
Le paramètre `occupancy_control` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Théorie, au niveau expert.
Rôle : Dictionary of the atomic matrices to be applied for a given iteration number.
Valeur par défaut : `"None"`.
The atomic species or the atoms written as Atom No are specified, followed by a dictionary of the shells for which the density matrix can be controlled. The Value of the matrix can be specified either as a trace or as explicit matrix elements.

## dft.itermax_occ_ctrl
Le paramètre `itermax_occ_ctrl` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Number of iterations of occupancy control scheme. Should be between itermin and itermax.
Valeur par défaut : `0`.

## dft.nrepmax_occ_ctrl
Le paramètre `nrepmax_occ_ctrl` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Number of re-diagonalizations of occupancy control scheme..
Valeur par défaut : `1`.

## dft.alpha_hf
Le paramètre `alpha_hf` appartient à la section `dft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Théorie, au niveau avancé.
Rôle : Part of the exact exchange contribution for hybrid functionals.
Valeur par défaut : `-1.0`.
Valeurs admises : de 0.0 à 1.0.
By default .25 for PBE0, and .2 for B3LYP

## output.verbosity
Le paramètre `verbosity` appartient à la section `output` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Mesures, au niveau avancé.
Rôle : Verbosity of the output.
Valeur par défaut : `2`.
Valeurs possibles : `0` (Very low); `1` (Low); `2` (Medium); `3` (High).

## output.atomic_density_matrix
Le paramètre `atomic_density_matrix` appartient à la section `output` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Mesures, au niveau expert.
Rôle : Dictionary of the atoms for which the atomic density matrix has to be plotted.
Valeur par défaut : `"None"`.
The atomic species or the atoms written as Atom No are specified, followed by a list of the shells for which the density matrix can be plotted

## output.sdos
Le paramètre `sdos` appartient à la section `output` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Mesures, au niveau avancé.
Rôle : Spatially-resolved density of states.
Valeur par défaut : `false`.
Plots the density of states by calculating the value of psi*Hpsi per each KS orbital, resolved among x,y or z.

## output.orbitals
Le paramètre `orbitals` appartient à la section `output` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Mesures, au niveau essentiel.
Rôle : Write KS orbitals in the full simulation domain (might take lot of disk space!).
Valeur par défaut : `"None"`.
Valeurs possibles : `None` (No output); `text` (Output in wavelet basis); `binary` (Binary file output); `text_with_densities` (In addition output wavefunction densities in interpolating scaling functions (cube file)); `text_with_cube` (In addition output wavefunctions in interpolating scaling functions (cube file)); `etsf` (ETSF file format).

## output.apply_coeffs
Le paramètre `apply_coeffs` appartient à la section `output` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Mesures, au niveau expert.
Rôle : apply the coefficients to the SFs when writing orbitals in LS-BigDFT.
Valeur par défaut : `true`.
Whether or not to apply the coefficients to the support functions when writing orbitals in a linear scaling calculation. If yes, will output wavefunctions as normal, if no, will instead output support functions in the global localisation region.

## output.outputpsiid
Le paramètre `outputpsiid` appartient à la section `output` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Mesures, au niveau expert.
Rôle : basename of the output wavefunctions files written in the data directory.
Valeur par défaut : `"wavefunction"`.
Define the basename of all the files associated to the output of the wavefunctions. Can be reused in the inputpsiid input parameter.

## output.coupling_matrix
Le paramètre `coupling_matrix` appartient à la section `output` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Mesures, au niveau avancé.
Rôle : kind of the coupling matrix which have to be dumped.
Valeur par défaut : `"complete"`.
Valeurs possibles : `complete` (dump the total coupling matrix); `rpa` (only dump the RPA term); `fxc` (only dump the fxc term); `four_point` (dump the four point coulomb integrals of the KS orbitals).
Useful to separate the various contributions of the coupling matrix. May be written exclusively, separately or in complete form.

## kpt.method
Le paramètre `method` appartient à la section `kpt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau essentiel.
Rôle : K-point sampling method.
Valeur par défaut : `"manual"`.
Valeurs possibles : `auto` (Based on kptrlen); `mpgrid` (Monkhorst-Pack); `manual` (Based on raw coordinates).

## kpt.kptrlen
Le paramètre `kptrlen` appartient à la section `kpt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau avancé.
Rôle : Equivalent length of K-space resolution (Bohr).
Valeur par défaut : `0.0`.
Valeurs admises : de 0 à 10000.0.
N'a de sens que selon `method` (valeurs : ['auto']).

## kpt.ngkpt
Le paramètre `ngkpt` appartient à la section `kpt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau essentiel.
Rôle : No. of Monkhorst-Pack grid points.
Valeur par défaut : `[1, 1, 1]`.
Valeurs admises : de 1 à 10000.
N'a de sens que selon `method` (valeurs : ['mpgrid']).

## kpt.shiftk
Le paramètre `shiftk` appartient à la section `kpt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau avancé.
Rôle : Grid shifts.
Valeur par défaut : `[[0.0, 0.0, 0.0]]`.
N'a de sens que selon `method` (valeurs : ['mpgrid']).

## kpt.kpt
Le paramètre `kpt` appartient à la section `kpt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau expert.
Rôle : Kpt coordinates.
Valeur par défaut : `[[0.0, 0.0, 0.0]]`.
N'a de sens que selon `method` (valeurs : ['manual']).

## kpt.wkpt
Le paramètre `wkpt` appartient à la section `kpt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau expert.
Rôle : Kpt weights.
Valeur par défaut : `[1.0]`.
Valeurs admises : de 0.0 à 10000.0.
N'a de sens que selon `method` (valeurs : ['manual']).

## kpt.bands
Le paramètre `bands` appartient à la section `kpt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau avancé.
Rôle : For doing band structure calculation.
Valeur par défaut : `false`.

## kpt.iseg
Le paramètre `iseg` appartient à la section `kpt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau expert.
Rôle : Points for each segment of the Brillouin zone path.
Valeur par défaut : `[1]`.
N'a de sens que selon `bands` (valeurs : [True]).

## kpt.kptv
Le paramètre `kptv` appartient à la section `kpt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau expert.
Rôle : K points defining each segment of the Brillouin zone path.
Valeur par défaut : `[[0.0, 0.0, 0.0], [0.5, 0.5, 0.5]]`.
N'a de sens que selon `bands` (valeurs : [True]).

## kpt.ngranularity
Le paramètre `ngranularity` appartient à la section `kpt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau expert.
Rôle : No. of points done for each group.
Valeur par défaut : `1`.
Valeurs admises : de 1 à 1000.
N'a de sens que selon `bands` (valeurs : [True]).

## geopt.method
Le paramètre `method` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau essentiel.
Rôle : Geometry optimisation method.
Valeur par défaut : `"none"`.
Valeurs possibles : `none` (No geometry optimization); `SDCG` (A combination of Steepest Descent and Conjugate Gradient); `VSSD` (Variable Stepsize Steepest Descent method); `LBFGS` (Limited-memory BFGS); `BFGS` (Broyden-Fletcher-Goldfarb-Shanno); `PBFGS` (Same as BFGS with an initial Hessian obtained from a force field); `AB6MD` (Molecular dynamics from ABINIT); `DIIS` (Direct inversion of iterative subspace); `FIRE` (Fast Inertial Relaxation Engine as described by Bitzek et al.); `SOCK` (Socket communication); `NEB` (Nudged Elastic Band); `SBFGS` (SQNM minimizer, keyword deprecated, will be replaced by SQNM in future release); `SQNM` (Stabilized quasi-Newton minimzer); `MD` (Molecular dynamics, NVT (Nose-Hoover Chains) or NVE ensemble); `LOOP` (Do nothing except looping, forces should be changed externally).

## geopt.ncount_cluster_x
Le paramètre `ncount_cluster_x` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau essentiel.
Rôle : Maximum number of force evaluations.
Valeur par défaut : `50`.
Valeurs admises : de 0 à 2000.
Valeurs nommées : `none` = `1`.
Maximum number of force evaluations to be used for the geometry optimization.

## geopt.sockinet
Le paramètre `sockinet` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Socket either unix (0) or tcp (1).
Valeur par défaut : `1`.
Valeurs admises : de 0 à 1.
N'a de sens que selon `method` (valeurs : ['SOCK']).

## geopt.sockport
Le paramètre `sockport` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Socket port number.
Valeur par défaut : `2121`.
Valeurs admises : de 0 à 100000.
N'a de sens que selon `method` (valeurs : ['SOCK']).

## geopt.sockhost
Le paramètre `sockhost` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Socket host name.
Valeur par défaut : `"127.0.0.1"`.
N'a de sens que selon `method` (valeurs : ['SOCK']).

## geopt.frac_fluct
Le paramètre `frac_fluct` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau avancé.
Rôle : Fraction of force fluctuations. Stop if fmax < forces_fluct*frac_fluct.
Valeur par défaut : `1.0`.
Valeurs admises : de 0.0 à 10.0.
Convergence criteria for the geometry optimization. The geometry optimization stops either if the norm of the individual forces acting on any atom in the system is smaller than forcemax or if the forces get noisy. Noise is present because of the underlying integration grid. The parameter frac_fluct specifies how small the forces should become compared to the noise level to stop the geometry optimization. Values in between 1 and 10 is are reasonable for this parameter. A value of 2 means that the geometry optimization will stop when the largest atomic force is comparable to the 2 times the average noise in the forces themselves. For values of frac_fluct smaller than 1 one can under certain circumstances obtain better relaxed geometries but one risks that the geometry optimization will not converge since the forces are too noisy. In such a case one should closely monitor the progress of the geometry optimization by looking at the posout. files which are written at each step of the geometry optimization and at the data/geopt.mon file.

## geopt.forcemax
Le paramètre `forcemax` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau essentiel.
Rôle : Max forces criterion when stop.
Valeur par défaut : `0.0`.
Valeurs admises : de 0.0 à 10.0.
Valeurs nommées : `NEB` = `0.005`.
Convergence criteria for the geometry optimization. The geometry optimization stops either if the norm of the individual forces acting on any atom in the system is smaller than forcemax or if the forces get noisy. Noise is present because of the underlying integration grid. The parameter frac_fluct specifies how small the forces should become compared to the noise level to stop the geometry optimization. Values in between 1 and 10 is are reasonable for this parameter. A value of 2 means that the geometry optimization will stop when the largest atomic force is comparable to the 2 times the average noise in the forces themselves. For values of frac_fluct smaller than 1 one can under certain circumstances obtain better relaxed geometries but one risks that the geometry optimization will not converge since the forces are too noisy. In such a case one should closely monitor the progress of the geometry optimization by looking at the posout. files which are written at each step of the geometry optimization and at the data/geopt.mon file.

## geopt.randdis
Le paramètre `randdis` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Random displacement amplitude.
Valeur par défaut : `0.0`.
Valeurs admises : de 0.0 à 10.0.
This parameter allows to add random displacements with amplitude randdis to the atomic positions in the input file posinp. This can for instance be useful to break degeneracies (which would lead to convergence problems in the wavefunction optimization) in highly symmetric structures.

## geopt.betax
Le paramètre `betax` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau avancé.
Rôle : Stepsize for the geometry optimization.
Valeur par défaut : `4.0`.
Valeurs admises : de 0.0 à 100.0.
Valeurs nommées : `DIIS` = `2.0`; `NEB` = `0.5`; `SQNM` = `1.0`.
N'a de sens que selon `method` (valeurs : ['SDCG', 'VSSD', 'LBFGS', 'BFGS', 'PBFGS', 'DIIS', 'FIRE', 'NEB', 'SBFGS', 'SQNM', 'none']).
This is the stepsize for the geometry optimization. This stepsize is system dependent and it has therefore to be determined for each system. If the VSSD method is used one can start with a small stepsize of around 1 and VSSD will suggest then a better value for {betax} in the last line of the data/geopt.mon file. Whether the stepsize is correct can also be seen from the data/geopt.mon output of the SDCG method. In this case the average stepsize in terms of betax should be around 4 (after a brief initial period where it is around 8). In contrast to the SDCG method, the BFGS method is not very sensitive to the correct stepsize but nevertheless one should try to find reasonable values also in this case. SQNM: For many systems 1 is a good stepsize. Some systems can be minimized more efficiently with a larger stepsize.

## geopt.history
Le paramètre `history` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau avancé.
Rôle : History for DIIS method.
Valeur par défaut : `4`.
Valeurs admises : de 0 à 100.
N'a de sens que selon `method` (valeurs : ['DIIS']).

## geopt.dtinit
Le paramètre `dtinit` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Initial time step for the FIRE method.
Valeur par défaut : `0.75`.
Valeurs admises : de 0 à 10000.0.
N'a de sens que selon `method` (valeurs : ['FIRE']).

## geopt.dtmax
Le paramètre `dtmax` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Maximal time step for the FIRE method.
Valeur par défaut : `1.5`.
Valeurs admises : de 0 à 10000.0.
N'a de sens que selon `method` (valeurs : ['FIRE']).

## geopt.nhistx
Le paramètre `nhistx` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Maximum history length.
Valeur par défaut : `10`.
Valeurs admises : de 0 à 1000.
N'a de sens que selon `method` (valeurs : ['SBFGS', 'SQNM']).

## geopt.biomode
Le paramètre `biomode` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau avancé.
Rôle : Enable mode for biomolecules..
Valeur par défaut : `false`.
N'a de sens que selon `method` (valeurs : ['SBFGS', 'SQNM']).

## geopt.beta_stretchx
Le paramètre `beta_stretchx` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Stepsize for steepest descent in stretching mode direction (only if in biomode).
Valeur par défaut : `0.5`.
Valeurs admises : de 0.0 à 100.0.

## geopt.maxrise
Le paramètre `maxrise` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Maximum allowed rise in energy in one geopt step.
Valeur par défaut : `1e-06`.
Valeurs admises : de 0.0 à 10000000000.0.
N'a de sens que selon `method` (valeurs : ['SBFGS', 'SQNM']).

## geopt.cutoffratio
Le paramètre `cutoffratio` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : If ratio of eigenvalues of displacement overlapmatrix is smaller than cutoffratio, the corresponding directions are not used.
Valeur par défaut : `0.0001`.
Valeurs admises : de 0.0 à 1.0.
N'a de sens que selon `method` (valeurs : ['SBFGS', 'SQNM']).

## geopt.steepthresh
Le paramètre `steepthresh` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : If fmax < steepthresh, geopt method uses steepest descent.
Valeur par défaut : `0.1`.
Valeurs admises : de 0.0 à 10000000000.0.
N'a de sens que selon `method` (valeurs : ['SBFGS', 'SQNM']).

## geopt.trustr
Le paramètre `trustr` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Maximum displacement of single atom.
Valeur par défaut : `0.5`.
Valeurs admises : de 0.0 à 10000000000.0.
N'a de sens que selon `method` (valeurs : ['SBFGS', 'SQNM']).

## geopt.ionmov
Le paramètre `ionmov` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Movement ion method.
Valeur par défaut : `6`.
Valeurs possibles : `6` (Simple velocity-Verlet molecular dynamic); `7` (Quenched molecular dynamic); `8` (Nose-Hoover thermostat); `9` (Langevin dynamic); `12` (Isokinetic ensemble molecular dynamics); `13` (Iosthermal/isenthalpic ensemble).
N'a de sens que selon `method` (valeurs : ['AB6MD']).

## geopt.dtion
Le paramètre `dtion` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Time step - Atomic Units (20.670689 AU=0.5 fs).
Valeur par défaut : `20.670689`.
Valeurs admises : de 0 à 1000.0.
N'a de sens que selon `method` (valeurs : ['AB6MD']).

## geopt.mditemp
Le paramètre `mditemp` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Temperature of molecular dynamics.
Valeur par défaut : `300.0`.
Valeurs admises : de 0 à 1000000000.0.
N'a de sens que selon `ionmov` (valeurs : [6, 8, 9, 12, 13]).

## geopt.mdftemp
Le paramètre `mdftemp` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Final temperature of molecular dynamics.
Valeur par défaut : `300.0`.
Valeurs admises : de 0 à 1000000000.0.
N'a de sens que selon `ionmov` (valeurs : [8, 9, 12, 13]).

## geopt.noseinert
Le paramètre `noseinert` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Thermostat inertia coefficient for Nose_Hoover dynamics.
Valeur par défaut : `100000.0`.
Valeurs admises : de 0 à 1000000000.0.
N'a de sens que selon `ionmov` (valeurs : [8]).

## geopt.friction
Le paramètre `friction` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Friction coefficient for Langevin dynamics.
Valeur par défaut : `0.001`.
Valeurs admises : de 0 à 100000.0.
N'a de sens que selon `ionmov` (valeurs : [9]).

## geopt.mdwall
Le paramètre `mdwall` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Distance in bohr where atoms can bounce for Langevin dynamics.
Valeur par défaut : `10000.0`.
Valeurs admises : de 0 à 100000.0.
N'a de sens que selon `ionmov` (valeurs : [9]).

## geopt.qmass
Le paramètre `qmass` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Mass of each thermostat (isothermal/isenthalpic ensemble).
Valeur par défaut : `[0.0]`.
Valeurs admises : de 0 à 1000000000.0.
N'a de sens que selon `ionmov` (valeurs : [13]).

## geopt.bmass
Le paramètre `bmass` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Barostat masses (isothermal/isenthalpic ensemble).
Valeur par défaut : `10.0`.
Valeurs admises : de 0 à 1000000000.0.
N'a de sens que selon `ionmov` (valeurs : [13]).

## geopt.vmass
Le paramètre `vmass` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Barostat masses (isothermal/isenthalpic ensemble).
Valeur par défaut : `1.0`.
Valeurs admises : de 0 à 1000000000.0.
N'a de sens que selon `ionmov` (valeurs : [13]).

## geopt.climbing
Le paramètre `climbing` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau avancé.
Rôle : Make the highest energy image to climb along the path.
Valeur par défaut : `false`.
N'a de sens que selon `method` (valeurs : ['NEB']).

## geopt.extrema_opt
Le paramètre `extrema_opt` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Minimize the energy of extremum images during NEB optimization.
Valeur par défaut : `false`.
N'a de sens que selon `method` (valeurs : ['NEB']).

## geopt.neb_method
Le paramètre `neb_method` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau avancé.
Rôle : Image minimization method.
Valeur par défaut : `"quick-min"`.
Valeurs possibles : `steepest_descent` (steepest descent); `fletcher-reeves` (Fletcher Reeves); `polak-ribiere` (Polak Ribiere); `quick-min` (Conjugate gradient); `damped-verlet` (Verlet with damp); `sim-annealing` (Simulation of annealing).
N'a de sens que selon `method` (valeurs : ['NEB']).

## geopt.temp
Le paramètre `temp` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Temperature for simulated annealing.
Valeur par défaut : `0.0`.
Valeurs admises : de 0.0 à 1000.0.
N'a de sens que selon `neb_method` (valeurs : ['sim-annealing']).

## geopt.damp
Le paramètre `damp` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Damping factor.
Valeur par défaut : `1.0`.
Valeurs admises : de 0.0 à 1000.0.
N'a de sens que selon `neb_method` (valeurs : ['damped-verlet']).

## geopt.springs_k
Le paramètre `springs_k` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Maximum and minimum value when changing spring constant during optimization.
Valeur par défaut : `[0.05, 0.1]`.
Valeurs admises : de 0.0 à 1000.0.
N'a de sens que selon `method` (valeurs : ['NEB']).

## geopt.fix_tol
Le paramètre `fix_tol` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Tolerance to apply on atom moves between extrema.
Valeur par défaut : `0.0001`.
Valeurs admises : de 0 à 100.
N'a de sens que selon `method` (valeurs : ['NEB']).

## geopt.nimg
Le paramètre `nimg` appartient à la section `geopt` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau avancé.
Rôle : Number of images.
Valeur par défaut : `15`.
Valeurs admises : de 3 à 100.
N'a de sens que selon `method` (valeurs : ['NEB']).

## md.mdsteps
Le paramètre `mdsteps` appartient à la section `md` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau essentiel.
Rôle : Number of MD steps.
Valeur par défaut : `0`.
Valeurs admises : de 0 à inf.
A value greater than 0 will activate molecular dynamics

## md.print_frequency
Le paramètre `print_frequency` appartient à la section `md` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau avancé.
Rôle : Printing frequency for energy.dat and Trajectory.xyz files.
Valeur par défaut : `1`.
Valeurs admises : de 1 à 999999.

## md.temperature
Le paramètre `temperature` appartient à la section `md` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau essentiel.
Rôle : Initial temperature in Kelvin.
Valeur par défaut : `300.0`.
Valeurs admises : de 0 à 9999999.0.

## md.timestep
Le paramètre `timestep` appartient à la section `md` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau essentiel.
Rôle : Time step for integration (in a.u.).
Valeur par défaut : `20.0`.
Valeurs admises : de 0 à 99999.0.

## md.no_translation
Le paramètre `no_translation` appartient à la section `md` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Logical input to set translational correction.
Valeur par défaut : `false`.

## md.thermostat
Le paramètre `thermostat` appartient à la section `md` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau essentiel.
Rôle : Activates a thermostat for MD.
Valeur par défaut : `"none"`.
Valeurs possibles : `none` (no thermostat); `nose_hoover_chain` (Nose-Hoover Chain thermostat).

## md.nose_chain_length
Le paramètre `nose_chain_length` appartient à la section `md` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau avancé.
Rôle : Length of the Nose-Hoover Chains (integer input).
Valeur par défaut : `3`.
Valeurs admises : de 2 à 10.
N'a de sens que selon `thermostat` (valeurs : ['nose_hoover_chain']).

## md.nose_mts_size
Le paramètre `nose_mts_size` appartient à la section `md` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Multiple time steps used to integrate Nose-Hoover Chains equations of motion (integer input).
Valeur par défaut : `1`.
Valeurs admises : de 1 à 10.
N'a de sens que selon `thermostat` (valeurs : ['nose_hoover_chain']).

## md.nose_yoshida_factor
Le paramètre `nose_yoshida_factor` appartient à la section `md` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Yoshida-Suzuki order to integrate the Nose-Hoover Chains equations of motion (integer input).
Valeur par défaut : `7`.
Valeurs possibles : `3`; `5`; `7`.
N'a de sens que selon `thermostat` (valeurs : ['nose_hoover_chain']).

## md.nose_frequency
Le paramètre `nose_frequency` appartient à la section `md` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau avancé.
Rôle : Frequency in (cm^-1) corresponding to the inertia of the thermostat degrees of freedom.
Valeur par défaut : `3000.0`.
Valeurs admises : de 1.0 à inf.
N'a de sens que selon `thermostat` (valeurs : ['nose_hoover_chain']).

## md.wavefunction_extrapolation
Le paramètre `wavefunction_extrapolation` appartient à la section `md` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau avancé.
Rôle : Activates the wavefunction extrapolation for MD.
Valeur par défaut : `0`.
Valeurs possibles : `0`; `1`; `2`; `4`.
A value greater than 0 activates wfn extrapolation

## md.always_from_scratch
Le paramètre `always_from_scratch` appartient à la section `md` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : When true, always restart wavefunctions from scratch to eliminate dissipation effects.
Valeur par défaut : `false`.

## md.restart_nose
Le paramètre `restart_nose` appartient à la section `md` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Restart Nose Hoover Chain information from md.restart.
Valeur par défaut : `false`.

## md.restart_pos
Le paramètre `restart_pos` appartient à la section `md` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Restart nuclear position information from md.restart.
Valeur par défaut : `false`.

## md.restart_vel
Le paramètre `restart_vel` appartient à la section `md` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Restart nuclear velocities information from md.restart.
Valeur par défaut : `false`.

## mix.iscf
Le paramètre `iscf` appartient à la section `mix` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau avancé.
Rôle : Mixing scheme (default=0 i.e. direct minimization).
Valeur par défaut : `0`.
Valeurs possibles : `-2` (Non self-consistent direct minization); `-1` (Reserved, do not use it.); `0` (Direct minimization); `1` (Get the largest eigenvalue of the SCF cycle); `2` (Simple mixing of the potential); `3` (Anderson mixing of the potential); `4` (Anderson mixing of the potential based on the two previous iterations); `5` (CG based on the minim. of the energy with respect to the potential); `7` (Pulay mixing of the potential based on npulayit previous iterations); `12` (Simple mixing of the density); `13` (Anderson mixing of the density); `14` (Anderson mixing of the density based on the two previous iterations); `15` (CG based on the minim. of the energy with respect to the density); `17` (Pulay mixing of the density).
An integer giving the mixing scheme and the mixing target. It follows the ABINIT convention. For values lower than 10, the potential is mixed, while for values greater than 10, the density is mixed. A recommended option is Pulay mixing (7 or 17 for potential or charge mixing, respectively)

## mix.itrpmax
Le paramètre `itrpmax` appartient à la section `mix` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau avancé.
Rôle : Maximum number of diagonalisation iterations.
Valeur par défaut : `1`.
Valeurs admises : de 0 à 10000.
Maximum number of repeats for the mixing scheme. Each iteration implies an optimization of the wavefunctions at constant potential according to the settings in input.dft.

## mix.rpnrm_cv
Le paramètre `rpnrm_cv` appartient à la section `mix` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau avancé.
Rôle : Stop criterion on the residue of potential or density.
Valeur par défaut : `0.0001`.
Valeurs admises : de 0.0 à 10.0.
The stop criterion on the residue of the potential or the density. Typical values are in the order of 1e-10 to 1e-12.

## mix.norbsempty
Le paramètre `norbsempty` appartient à la section `mix` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau avancé.
Rôle : No. of additional bands.
Valeur par défaut : `0`.
Valeurs admises : de 0 à 10000.
The maximum number of additional (initially unoccupied) bands considered. If a larger value is given, The maximum of orbitals available via the input guess procedure will be used automatically

## mix.tel
Le paramètre `tel` appartient à la section `mix` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau essentiel.
Rôle : Electronic temperature.
Valeur par défaut : `0.0`.
Valeurs admises : de 0.0 à 1000000.0.
The electronic temperature in energy units (Ha).

## mix.occopt
Le paramètre `occopt` appartient à la section `mix` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau avancé.
Rôle : Smearing method.
Valeur par défaut : `1`.
Valeurs possibles : `1` (Error function smearing); `2` (Normal Fermi distribution); `3` (Marzari cold smearing a=-.5634 (bumb minimization)); `4` (Marzari cold smearing with a=-.8165 (monotonic tail)); `5` (Methfessel and Paxton (same as cold with a=0)).
The smearing function to determine the occupation. The conventions differ from those used by ABINIT. 1 = Gaussian, 2 = Fermi, 3 = Marzari (bumb minimization), 4 = Marzari (monotonic tail), 5 = Methfessel and Paxton.

## mix.alphamix
Le paramètre `alphamix` appartient à la section `mix` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau avancé.
Rôle : Multiplying factors for the mixing.
Valeur par défaut : `0.0`.
Valeurs admises : de 0 à 1.0.
The closer this value gets to one, the more cautious will be the mixing of the charge or potential. In the case of straight mixing, it corresponds to alpha according to rho_{new} <-- alpha rho_{old} + (1-alpha) - rho_{new} alphamix must be larger than one half. A typical choice for metals is 0.95.

## mix.alphadiis
Le paramètre `alphadiis` appartient à la section `mix` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Multiplying factors for the electronic DIIS.
Valeur par défaut : `2.0`.
Valeurs admises : de 0.0 à 10.0.
The DIIS multiplier used for preconditioning the wavefunctions at constant potential.

## mix.diis_sd_switch_tolerance
Le paramètre `diis_sd_switch_tolerance` appartient à la section `mix` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Tolerance to switch between the Steppest Descent and the DIIS.
Valeur par défaut : `0`.
Valeurs admises : de 0.0 à inf.
With this parameter we can tailor the behaviour of the SCF optimization cycle between DIIS and Steepest Descent. When the energy increases (up to such tolerance), the code switches between the different algorithms.

## sic.sic_approach
Le paramètre `sic_approach` appartient à la section `sic` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Théorie, au niveau avancé.
Rôle : SIC (self-interaction correction) method.
Valeur par défaut : `"none"`.
Valeurs possibles : `none` (No self-interaction correction); `PZ` (Perdew-Zunger SIC scheme); `NK` (Non-Koopmans correction (Experimental)).

## sic.sic_alpha
Le paramètre `sic_alpha` appartient à la section `sic` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Théorie, au niveau avancé.
Rôle : SIC downscaling parameter.
Valeur par défaut : `0.0`.
Valeurs admises : de 0 à 1.0.

## sic.sic_fref
Le paramètre `sic_fref` appartient à la section `sic` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Théorie, au niveau expert.
Rôle : Reference occupation fref (for Non-Koopman case only).
Valeur par défaut : `0.0`.
Valeurs admises : de 0.0 à 1.0.
N'a de sens que selon `sic_approach` (valeurs : ['NK']).

## tddft.tddft_approach
Le paramètre `tddft_approach` appartient à la section `tddft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau essentiel.
Rôle : Time-Dependent DFT method.
Valeur par défaut : `"none"`.
Valeurs possibles : `none` (no tddft post-processing); `TDA` (Casida's LR-TDDFT using Tamm-Dancoff Approximation); `full` (Full Casida's LR-TDDFT).

## tddft.decompose_perturbation
Le paramètre `decompose_perturbation` appartient à la section `tddft` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Action, au niveau expert.
Rôle : Indicate the directory of the perturbation to be decomposed in the basis of empty states.
Valeur par défaut : `"none"`.

## mode.method
Le paramètre `method` appartient à la section `mode` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Théorie, au niveau avancé.
Rôle : Run method of BigDFT call.
Valeur par défaut : `"dft"`.
Valeurs possibles : `dft` (Density Functional Theory (BigDFT)); `lj` (Lennard-Jones force field); `tdpot` (two-dimension test potential); `lensic` (Lenosky Force Field for Si clusters); `lensib` (Lenosky Force Field for Si bulk); `amber` (AMBER Force Fields Package (requires AMBERtools)); `morse_bulk` (Morse bulk); `morse_slab` (Morse slab); `tersoff` (Tersoff potential for C and Si); `alborz` (Alireza Ghasemis ALBORZ package); `bmhtf` (Born Mayer Huggins Tosi Fumi Potential); `cp2k` (CP2K); `dftbp` (DFTB+); `sw` (Stillinger-Weber for Si); `bazant` (Bazant force for Si); `multi` (Mixed approach where parts of the system are treated with different methods); `plugin` (Use the signaling procedure profided by FUTILE); `sirius` (Run SCF loop using SIRIUS code (FLAPW)).

## mode.plugin_id
Le paramètre `plugin_id` appartient à la section `mode` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Théorie, au niveau expert.
Rôle : Integer handle identifying the calculator associated to the mode plugin.
Valeur par défaut : `1`.
N'a de sens que selon `method` (valeurs : plugin).

## mode.add_coulomb_force
Le paramètre `add_coulomb_force` appartient à la section `mode` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Théorie, au niveau expert.
Rôle : Boolean to add coulomb force on top of any of above selected force.
Valeur par défaut : `false`.

## mode.nab_options
Le paramètre `nab_options` appartient à la section `mode` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Théorie, au niveau expert.
Rôle : String to be passed to nab_init compiler in the case of ambertools compilation.
Valeur par défaut : `"ntpr=1"`.
N'a de sens que selon `method` (valeurs : amber).

## mode.mm_paramset
Le paramètre `mm_paramset` appartient à la section `mode` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Théorie, au niveau avancé.
Rôle : Name of the hard-coded parameter set. Must be compatible to the chosen force field..
Valeur par défaut : `"default"`.
N'a de sens que selon `method` (valeurs : ['lj', 'tdpot', 'lensic', 'lensib', 'amber', 'morse_bulk', 'morse_slab', 'tersoff', 'bmhtf', 'cp2k', 'dftbp']).

## mode.mm_paramfile
Le paramètre `mm_paramfile` appartient à la section `mode` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Théorie, au niveau expert.
Rôle : Name of parameter or input file for the selected method or code.
Valeur par défaut : `"none"`.
N'a de sens que selon `method` (valeurs : ['lj', 'tdpot', 'lensic', 'lensib', 'amber', 'morse_bulk', 'morse_slab', 'tersoff', 'bmhtf', 'cp2k', 'dftbp']).

## mode.sections
Le paramètre `sections` appartient à la section `mode` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Théorie, au niveau expert.
Rôle : List of labelling subparts to divide the system into.
Valeur par défaut : `[]`.
N'a de sens que selon `method` (valeurs : ['multi']).

## mode.section_buffer
Le paramètre `section_buffer` appartient à la section `mode` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Théorie, au niveau expert.
Rôle : Level of neighbours added to posinp sections.
Valeur par défaut : `1`.
Valeurs admises : de 0 à 10.
N'a de sens que selon `method` (valeurs : ['multi']).

## mode.section_passivation
Le paramètre `section_passivation` appartient à la section `mode` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Théorie, au niveau expert.
Rôle : Level of neighbours added to posinp sections.
Valeur par défaut : `true`.
N'a de sens que selon `method` (valeurs : ['multi']).

## mode.sw_eqfactor
Le paramètre `sw_eqfactor` appartient à la section `mode` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Théorie, au niveau expert.
Rôle : Factor on sigma value, rule the equilibrium bond length for the Stillinger-Weber potential.
Valeur par défaut : `1.0`.
Valeurs nommées : `PBE_Si` = `1.006445672`; `LDA_Si` = `0.994475138`.
N'a de sens que selon `method` (valeurs : ['sw']).

## mode.sirius_config
Le paramètre `sirius_config` appartient à la section `mode` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Théorie, au niveau expert.
Rôle : Dictionary to pass as sirius configuration (file path or full json dict wrapped in a string).
Valeur par défaut : `"{\\\"parameters\\\": {\\\"electronic_structure_method\\\": \\\"full_potential_lapwlo\\\"}}"`.
N'a de sens que selon `method` (valeurs : ['sirius']).

## perf.debug
Le paramètre `debug` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Debug option.
Valeur par défaut : `false`.
The debug mode is enable mainly for memory profiling.

## perf.fftcache
Le paramètre `fftcache` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Cache size for the FFT.
Valeur par défaut : `8192`.
Specify the cache size for FFT in kBytes.

## perf.accel
Le paramètre `accel` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau essentiel.
Rôle : Acceleration (hardware).
Valeur par défaut : `false`.
Valeurs possibles : `False` (No material acceleration); `CUDAGPU` (CUDA); `OCLGPU` (OpenCL on GPU); `OCLCPU` (OpenCL on CPU); `OCLACC` (???).
Specify the use of CUDA (resp. OCL) versions of various subroutines. For CUDA, a GPU.config file is needed.

## perf.ocl_platform
Le paramètre `ocl_platform` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Chosen OCL platform.
Valeur par défaut : `null`.

## perf.ocl_devices
Le paramètre `ocl_devices` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Chosen OCL devices.
Valeur par défaut : `null`.

## perf.blas
Le paramètre `blas` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : CUBLAS acceleration.
Valeur par défaut : `false`.
Use or not the CUBlas acceleration.

## perf.projrad
Le paramètre `projrad` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Radius of the projector as a function of the maxrad.
Valeur par défaut : `15.0`.
Valeurs admises : de 0.0 à 100.0.

## perf.exctxpar
Le paramètre `exctxpar` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Exact exchange parallelisation scheme.
Valeur par défaut : `"OP2P"`.
Valeurs possibles : `BC` (Blocking Collective); `OP2P` (Overlap Point-to-Point).

## perf.ig_diag
Le paramètre `ig_diag` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Input guess (T=Direct, F=Iterative) diag. of Ham..
Valeur par défaut : `true`.

## perf.ig_norbp
Le paramètre `ig_norbp` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Input guess Orbitals per process for iterative diag..
Valeur par défaut : `5`.
Valeurs admises : de 1 à 1000.

## perf.ig_blocks
Le paramètre `ig_blocks` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Input guess Block sizes for orthonormalisation.
Valeur par défaut : `[300, 800]`.
Valeurs admises : de 1 à 100000.

## perf.ig_tol
Le paramètre `ig_tol` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Input guess Tolerance criterion.
Valeur par défaut : `0.0001`.
Valeurs admises : de 0.0 à 1.0.

## perf.methortho
Le paramètre `methortho` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Orthogonalisation.
Valeur par défaut : `0`.
Valeurs possibles : `0` (Cholesky); `1` (Gram-Schmidt/Cholesky); `2` (Loewdin).

## perf.rho_commun
Le paramètre `rho_commun` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Density communication scheme (DBL, RSC, MIX).
Valeur par défaut : `"DEF"`.

## perf.unblock_comms
Le paramètre `unblock_comms` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Overlap Communications of fields (OFF,DEN,POT).
Valeur par défaut : `false`.
Valeurs possibles : `False` (Synchronous run); `DEN` (???); `POT` (???).

## perf.linear
Le paramètre `linear` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Linear Input Guess approach.
Valeur par défaut : `false`.
Valeurs possibles : `False` (???); `LIG` (???); `FUL` (???); `TMO` (???).

## perf.tolsym
Le paramètre `tolsym` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Tolerance for symmetry detection.
Valeur par défaut : `1e-08`.
Valeurs admises : de 0.0 à 1.0.

## perf.signaling
Le paramètre `signaling` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Expose calculation results on Network.
Valeur par défaut : `false`.

## perf.signaltimeout
Le paramètre `signaltimeout` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Time out on startup for signal connection (in seconds).
Valeur par défaut : `0`.
Valeurs admises : de -1 à 3600.

## perf.domain
Le paramètre `domain` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Domain to add to the hostname to find the IP.
Valeur par défaut : `null`.

## perf.inguess_geopt
Le paramètre `inguess_geopt` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Input guess to be used during the optimization.
Valeur par défaut : `0`.
Valeurs possibles : `0` (Wavelet input guess); `1` (Real space input guess).

## perf.store_index
Le paramètre `store_index` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Store indices or recalculate them for linear scaling.
Valeur par défaut : `true`.

## perf.store_overlap_matrices
Le paramètre `store_overlap_matrices` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Store all matrices relating to overlap powers, or recalculate them for linear scaling.
Valeur par défaut : `true`.

## perf.psp_onfly
Le paramètre `psp_onfly` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Calculate pseudopotential projectors on the fly.
Valeur par défaut : `true`.

## perf.multipole_preserving
Le paramètre `multipole_preserving` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : (EXPERIMENTAL) Preserve the multipole moments of the ionic density.
Valeur par défaut : `false`.

## perf.mp_isf
Le paramètre `mp_isf` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : (EXPERIMENTAL) Interpolating scaling function or lifted dual order for the multipole preserving.
Valeur par défaut : `16`.

## perf.mixing_after_inputguess
Le paramètre `mixing_after_inputguess` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Mixing step after linear input guess.
Valeur par défaut : `1`.
Valeurs possibles : `0` (keep the initial input guess density); `1` (perform a mixing step with the default mixing parameter); `2` (keep the new density, completely neglecting the input guess density).

## perf.iterative_orthogonalization
Le paramètre `iterative_orthogonalization` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Iterative_orthogonalization for input guess orbitals.
Valeur par défaut : `false`.

## perf.check_sumrho
Le paramètre `check_sumrho` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Enables linear sumrho check.
Valeur par défaut : `1`.
Valeurs possibles : `0` (No check); `1` (Light check); `2` (Full check).

## perf.check_overlap
Le paramètre `check_overlap` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Enables linear overlap check.
Valeur par défaut : `1`.
Valeurs possibles : `0` (No check); `1` (Light check); `2` (Full check).

## perf.experimental_mode
Le paramètre `experimental_mode` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Activate the experimental mode in linear scaling.
Valeur par défaut : `false`.

## perf.explicit_locregcenters
Le paramètre `explicit_locregcenters` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Linear scaling explicitly specify localization centers.
Valeur par défaut : `false`.

## perf.calculate_KS_residue
Le paramètre `calculate_KS_residue` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Linear scaling calculate Kohn-Sham residue.
Valeur par défaut : `true`.

## perf.intermediate_forces
Le paramètre `intermediate_forces` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Linear scaling calculate intermediate forces.
Valeur par défaut : `false`.

## perf.kappa_conv
Le paramètre `kappa_conv` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Exit kappa for extended input guess (experimental mode).
Valeur par défaut : `0.1`.

## perf.calculate_gap
Le paramètre `calculate_gap` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Mesures, au niveau avancé.
Rôle : Linear scaling calculate the HOMO LUMO gap.
Valeur par défaut : `false`.

## perf.loewdin_charge_analysis
Le paramètre `loewdin_charge_analysis` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Mesures, au niveau avancé.
Rôle : Linear scaling perform a Loewdin charge analysis at the end of the calculation.
Valeur par défaut : `false`.

## perf.coeff_weight_analysis
Le paramètre `coeff_weight_analysis` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Mesures, au niveau expert.
Rôle : Linear scaling perform a Loewdin charge analysis of the coefficients for fragment calculations.
Valeur par défaut : `false`.

## perf.check_matrix_compression
Le paramètre `check_matrix_compression` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Linear scaling perform a check of the matrix compression routines.
Valeur par défaut : `true`.

## perf.correction_co_contra
Le paramètre `correction_co_contra` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Linear scaling correction covariant / contravariant gradient.
Valeur par défaut : `true`.

## perf.FOE_restart
Le paramètre `FOE_restart` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Restart method to be used for the FOE method.
Valeur par défaut : `0`.
Valeurs nommées : `EXCLUSVE` = `{"0": "AO", "1": "REFORMAT"}`; `ao` = `0`; `reformat` = `1`.

## perf.imethod_overlap
Le paramètre `imethod_overlap` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Method to calculate the overlap matrices (1=old, 2=new).
Valeur par défaut : `1`.
Valeurs possibles : `1` (old); `2` (new).

## perf.enable_matrix_taskgroups
Le paramètre `enable_matrix_taskgroups` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Enable the matrix taskgroups.
Valeur par défaut : `true`.

## perf.hamapp_radius_incr
Le paramètre `hamapp_radius_incr` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Radius enlargement for the Hamiltonian application (in grid points).
Valeur par défaut : `8`.
Valeurs admises : de 0 à 8.

## perf.adjust_kernel_iterations
Le paramètre `adjust_kernel_iterations` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Enable the adaptive ajustment of the number of kernel iterations.
Valeur par défaut : `true`.

## perf.adjust_kernel_threshold
Le paramètre `adjust_kernel_threshold` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Enable the adaptive ajustment of the kernel convergence threshold according to the support function convergence.
Valeur par défaut : `true`.

## perf.wf_extent_analysis
Le paramètre `wf_extent_analysis` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Mesures, au niveau expert.
Rôle : Perform an analysis of the extent of the support functions (and possibly KS orbitals).
Valeur par défaut : `false`.

## perf.foe_gap
Le paramètre `foe_gap` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Mesures, au niveau avancé.
Rôle : Use the FOE method to calculate the HOMO-LUMO gap at the end of a calculation.
Valeur par défaut : `false`.

## perf.calculate_forces
Le paramètre `calculate_forces` appartient à la section `perf` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Mesures, au niveau avancé.
Rôle : Whether or not to calculate the forces at the end of a run (cubic and linear).
Valeur par défaut : `true`.

## lin_general.hybrid
Le paramètre `hybrid` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau avancé.
Rôle : Activate the hybrid mode; if activated, only the low accuracy values will be relevant.
Valeur par défaut : `false`.

## lin_general.nit
Le paramètre `nit` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau avancé.
Rôle : Number of iteration with low/high accuracy.
Valeur par défaut : `[100, 100]`.
Valeurs admises : de 0 à 1000.
Valeurs nommées : `true` = `[100, 1]`.
Maximal number of outer loop iterations (high / low accuracy). In each iteration both the support function and the kernel are optimized. When the hybrid mode is used, only the first entry is taken into account.

## lin_general.rpnrm_cv
Le paramètre `rpnrm_cv` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Convergence criterion for low/high accuracy.
Valeur par défaut : `[1e-12, 1e-12]`.
Valeurs admises : de 1e-15 à 1e-05.
Convergence criterion for the outer loop iterations (high / low accuracy). The optimization stops if the mean change of the charge density / potential falls below this threshold. When the hybrid mode is used, only the first entry is taken into account.

## lin_general.conf_damping
Le paramètre `conf_damping` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : How the confinement should be decreased, only relevant for hybrid mode; negative -> automatic.
Valeur par défaut : `-0.5`.
Valeurs admises : de -1.0 à 1.0.
Prescription how the prefactor for the confining potential should be decreased * negative value => automatic adjustment (recommended) * positive value => at each iteration the prefactor is multiplied with the specified value This variable is only relevant for the hybrid mode.

## lin_general.taylor_order
Le paramètre `taylor_order` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Order of the Taylor approximation; 0 -> exact.
Valeur par défaut : `0`.
Valeurs admises : de -100 à 10000.
Indicates how the matrix powers are calculated: * n<0 => Laura's method of order n * n=0 => exact calculation * n>0 => Taylor series of order n

## lin_general.max_inversion_error
Le paramètre `max_inversion_error` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Linear scaling maximal error of the Taylor approximations to calculate the inverse of the overlap matrix.
Valeur par défaut : `1.0`.
Valeurs admises : de 1e-20 à 1.0.
Maximal error of the Taylor approximations which are used to calculate the inverse of the overlap matrix. If this error is larger than the specified value, the order of the Taylor approximation is increased. The default value is set very large, such such in this case no automatic adjustment is performed.

## lin_general.output_wf
Le paramètre `output_wf` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Mesures, au niveau avancé.
Rôle : Output basis functions; 0 no output, 1 formatted output, 2 Fortran bin, 3 ETSF.
Valeur par défaut : `0`.
Valeurs possibles : `0` (None); `1` (Wavelet, Plain text); `2` (Wavelet, Fortran binary); `3` (Wavelet, ETSF file format); `10` (None); `11` (Wavelet and Interpolating Scaling Function (density), Plain text); `12` (Wavelet and Interpolating Scaling Function (density), Fortran binary); `13` (Wavelet and Interpolating Scaling Function (density), ETSF file format); `20` (None); `21` (Wavelet and Interpolating Scaling Function (wavefunction), Plain text); `22` (Wavelet and Interpolating Scaling Function (wavefunction), Fortran binary); `23` (Wavelet and Interpolating Scaling Function (wavefunction), ETSF file format).
Valeurs nommées : `text` = `1`; `binary` = `2`; `ETSF` = `3`.
Indicates how the support functions should be written to disk at the end of the run: * 0 => None * 1 => Wavelet, Plain text * 2 => Wavelet, Fortran binary * 3 => Wavelet, ETSF file format * 10 => None * 11 => Wavelet and Interpolating Scaling Function (density), Plain text * 12 => Wavelet and Interpolating Scaling Function (density), Fortran binary * 13 => Wavelet and Interpolating Scaling Function (density), ETSF file format * 20 => None * 21 => Wavelet and Interpolating Scaling Function (wavefunction), Plain text * 22 => Wavelet and Interpolating Scaling Function (wavefunction), Fortran binary * 23 => Wavelet and Interpolating Scaling Function (wavefunction), ETSF file format

## lin_general.output_mat
Le paramètre `output_mat` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Mesures, au niveau avancé.
Rôle : Output sparse matrices; 0 no output, 1 formatted sparse, 11 formatted dense, 21 formatted both..
Valeur par défaut : `0`.
Valeurs possibles : `0` (None); `1` (Plain text sparse); `11` (Plain text dense); `21` (Plain text sparse and dense); `2` (Fortran binary sparse); `12` (Fortran binary dense); `22` (Fortran binary sparse and dense); `31` (Matrix market format text.); `4` (MPI native binary sparse).
Indicates how the support function matrices should be written to disk at the end of the run: * 0 => None * 1 => Plain text in sparse format * 11 => Plain text in dense format * 21 => Plain text in both formats * 2 => Fortran binary in sparse format * 12 => Fortran binary in dense format * 22 => Fortran binary in both formats * 4 => MPI native binary in sparse format

## lin_general.output_matder
Le paramètre `output_matder` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Output sparse matrices derivatives; 0 no output, 1 formatted sparse,.
Valeur par défaut : `0`.
Valeurs possibles : `0` (None); `1` (Plain text sparse).
Indicates how the support function matrices should be written to disk at the end of the run: * 0 => None * 1 => Plain text in sparse format

## lin_general.output_coeff
Le paramètre `output_coeff` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Mesures, au niveau expert.
Rôle : Output KS coefficients; 0 no output, 1 formatted output.
Valeur par défaut : `0`.
Valeurs possibles : `0` (None); `1` (Plain text).
Indicates how the support function coefficients should be written to disk at the end of the run: * 0 => None * 1 => Plain text

## lin_general.output_multipole_matrices
Le paramètre `output_multipole_matrices` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : If outputting support function matrices, also output the multipole matrices in the same format as the other matrices.
Valeur par défaut : `true`.

## lin_general.output_matmul
Le paramètre `output_matmul` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : If outputting support function matrices, also include the matmul file.
Valeur par défaut : `false`.

## lin_general.output_fragments
Le paramètre `output_fragments` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Mesures, au niveau expert.
Rôle : Output support functions, kernel and coeffs; 0 fragments and full system, 1 fragments only, 2 full system only.
Valeur par défaut : `0`.
Valeurs possibles : `0` (Fragments and full system); `1` (Fragments only); `2` (Full system only).
Indicates how the support functions should be written to disk at the end of the run: * 0 => Fragments and full system * 1 => Fragments only * 2 => Full system only

## lin_general.kernel_restart_mode
Le paramètre `kernel_restart_mode` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Method for restarting kernel; 0 kernel, 1 coefficients, 2 random, 3 diagonal, 4 full kernel, 5 full coeffs.
Valeur par défaut : `0`.
Valeurs possibles : `0` (Density kernel); `1` (Coefficients); `2` (Random); `3` (Diagonal kernel); `4` (Atomic orbitals); `5` (Full kernel); `6` (Full coefficients); `7` (Diagonal kernel with smearing).
Valeurs nommées : `kernel` = `0`; `coeff` = `1`; `random` = `2`; `diag` = `3`; `ao` = `4`; `full_kernel` = `5`; `full_coeff` = `6`; `smearing` = `7`.
Indicates how the kernel should be generated for a restart calculation: * 0 => Density kernel * 1 => Coefficients * 2 => Random * 3 => Diagonal kernel, i.e. support functions scaled by number of electrons (per fragment) * 4 => Atomic orbitals, i.e. first perform diagonalization and retain coefficients/kernel * 5 => Density kernel of full system (for the case where both fragment and full kernel is available) * 6 => Coefficients of full system (for the case where both fragment and full kernel is available) * 7 => Diagonal kernel with smearing

## lin_general.kernel_restart_noise
Le paramètre `kernel_restart_noise` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Add random noise to kernel or coefficients when restarting.
Valeur par défaut : `0.0`.
Valeurs admises : de 0.0 à 1.0.
Indicates how much noise should be added to kernel or coefficients for a restart calculation

## lin_general.frag_num_neighbours
Le paramètre `frag_num_neighbours` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Number of neighbours to output for each fragment.
Valeur par défaut : `0`.
Valeurs admises : de 0 à 4.
Indicates how many neighbouring atoms should be written to frag_env.xyz - only allow for a small number of neighbours

## lin_general.frag_neighbour_cutoff
Le paramètre `frag_neighbour_cutoff` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Number of neighbours to output for each fragment.
Valeur par défaut : `12.0`.
Valeurs admises : de 0 à 100.
Distance (in bohr) beyond which neighbouring atoms are not included in frag_env.xyz

## lin_general.cdft_add_w_guess
Le paramètre `cdft_add_w_guess` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Add cdft_add_w_guess * W to kernel for CDFT initial guess.
Valeur par défaut : `0.0`.
Valeurs admises : de -1000.0 à 1000.0.
possible value: 1 real number

## lin_general.calc_dipole
Le paramètre `calc_dipole` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Mesures, au niveau essentiel.
Rôle : Calculate dipole.
Valeur par défaut : `false`.
Indicates whether the dipole moment should be calculated after the run or not

## lin_general.calc_quadrupole
Le paramètre `calc_quadrupole` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Mesures, au niveau expert.
Rôle : Calculate quadrupole.
Valeur par défaut : `false`.
Indicates whether the quadrupole moment should be calculated after the run or not

## lin_general.subspace_diag
Le paramètre `subspace_diag` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau avancé.
Rôle : Diagonalization at the end.
Valeur par défaut : `false`.
Indicates whether a diagonalization shall be performed at the end of the run

## lin_general.extra_states
Le paramètre `extra_states` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau avancé.
Rôle : Number of extra states to include in support function and kernel optimization (dmin only), must be equal to norbsempty.
Valeur par défaut : `0`.
Valeurs admises : de 0 à 10000.

## lin_general.calculate_onsite_overlap
Le paramètre `calculate_onsite_overlap` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Calculate the onsite overlap matrix (has only an effect if the matrices are all written to disk).
Valeur par défaut : `false`.

## lin_general.charge_multipoles
Le paramètre `charge_multipoles` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Mesures, au niveau essentiel.
Rôle : Calculate the atom-centered multipole coefficients; 0 no, 1 old approach Loewdin, 2 new approach Projector.
Valeur par défaut : `0`.
Valeurs possibles : `0` (no calculation); `1` (Loewdin approach, however without explicit orthogonalization); `11` (Mulliken approach).
Calculate the multipole expansion coefficients of the atomic charge which can then be used to establish a QM/MM coupling. Currently only implemented and tested for nspin=1 Possible values are: * 0 => no calculation * 1 => Loewdin approach, however without explicit orthogonalization #* 2 => new approach using simple projector and orthogonalized support functions #* 3 => new approach using full projector and orthogonalized support functions * 11 => Mulliken approach #* 12 => same as 2, but with non-orthogonalized support functions #* 13 => same as 3, but with non-orthogonalized support functions

## lin_general.check_multipoles
Le paramètre `check_multipoles` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Check the multipoles computed by computing the total dipole..
Valeur par défaut : `true`.

## lin_general.support_function_multipoles
Le paramètre `support_function_multipoles` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Mesures, au niveau avancé.
Rôle : Calculate the multipole moments of the support functions.
Valeur par défaut : `false`.

## lin_general.plot_locreg_grids
Le paramètre `plot_locreg_grids` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Plot the scaling function and wavelets grid of each localization region.
Valeur par défaut : `false`.

## lin_general.calculate_FOE_eigenvalues
Le paramètre `calculate_FOE_eigenvalues` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Mesures, au niveau expert.
Rôle : First and last eigenvalue to be calculated using the FOE procedure.
Valeur par défaut : `[0, -1]`.

## lin_general.precision_FOE_eigenvalues
Le paramètre `precision_FOE_eigenvalues` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Decay length of the error function used to extract the eigenvalues (i.e. something like the resolution).
Valeur par défaut : `0.005`.
Valeurs admises : de 0.0 à 0.1.

## lin_general.multipole_centers
Le paramètre `multipole_centers` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Determines whether the multipole centers shall be determined automatically (i.e. taking the atoms) or whether they are provided manually.
Valeur par défaut : `0.0`.

## lin_general.consider_entropy
Le paramètre `consider_entropy` appartient à la section `lin_general` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Indicate whether the entropy contribution to the total energy shall be considered.
Valeur par défaut : `false`.

## lin_basis.nit
Le paramètre `nit` appartient à la section `lin_basis` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau avancé.
Rôle : Maximal number of iterations in the optimization of the support functions.
Valeur par défaut : `[4, 5]`.
Valeurs admises : de 0 à 100.
Maximal number of iterations in the optimization of the support functions. The first number is used for the low accuracy part, the second one for the high accuracy part. If the hybrid mode is used, only the first value is taken into account.

## lin_basis.nit_ig
Le paramètre `nit_ig` appartient à la section `lin_basis` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : maximal number of iterations to optimize the support functions in the extended input guess (experimental mode only).
Valeur par défaut : `50`.
Valeurs admises : de 0 à 100.

## lin_basis.extended_ig
Le paramètre `extended_ig` appartient à la section `lin_basis` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : whether or not to do an extended input guess (will be activated by default in experimental mode).
Valeur par défaut : `false`.

## lin_basis.orthogonalize_sfs
Le paramètre `orthogonalize_sfs` appartient à la section `lin_basis` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : whether or not to explicitly orthogonalize SFs (will be activated by default except in experimental mode, and may eventually be automatically turned off).
Valeur par défaut : `true`.

## lin_basis.idsx
Le paramètre `idsx` appartient à la section `lin_basis` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : DIIS history for optimization of the support functions (low/high accuracy); 0 -> SD.
Valeur par défaut : `[6, 6]`.
Valeurs admises : de 0 à 20.
Indicates the method with which the support functions are optimized * n=0 => steepest descent * n>0 => DIIS with history length n

## lin_basis.gnrm_cv
Le paramètre `gnrm_cv` appartient à la section `lin_basis` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Convergence criterion for the optimization of the support functions (low/high accuracy).
Valeur par défaut : `[0.01, 0.0001]`.
Valeurs admises : de 1e-06 à 1.0.
Convergence criterion for optimization of the support functions (high / low accuracy). The optimization stops if the mean gradient norm falls below this threshold. When the hybrid mode is used, only the first entry is taken into account.

## lin_basis.gnrm_ig
Le paramètre `gnrm_ig` appartient à la section `lin_basis` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Convergence criterion for the optimization of the support functions in the extended input guess (experimental mode only).
Valeur par défaut : `0.001`.
Valeurs admises : de 1e-05 à 10.0.

## lin_basis.deltae_cv
Le paramètre `deltae_cv` appartient à la section `lin_basis` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Total relative energy difference to stop the optimization ('experimental_mode' only).
Valeur par défaut : `0.0001`.
Valeurs admises : de 1e-06 à 0.1.
The optimization of the support functions stops if the total relative gain in the target function during the given cycle of support function optimization falls below this threshold

## lin_basis.gnrm_dyn
Le paramètre `gnrm_dyn` appartient à la section `lin_basis` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Dynamic convergence criterion ('experimental_mode' only).
Valeur par défaut : `0.0001`.
Valeurs admises : de 1e-07 à 0.1.
From this value the effective dynamic convergence criterion is calculated by a division by kappa. Then the optimization of the support functions stops if the mean gradient norm falls below this effective dynamic convergence criterion and is at the same time smaller than the value of min_gnrm_for_dynamic. The specified value should be approximately 10 times smaller than the value of gnrm_cv. This value is only used for the experimental mode.

## lin_basis.min_gnrm_for_dynamic
Le paramètre `min_gnrm_for_dynamic` appartient à la section `lin_basis` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Minimal gnrm to active the dynamic gnrm criterion.
Valeur par défaut : `0.001`.
Valeurs admises : de 1e-07 à 1.0.
The dynamic convergence criterion (specified by gnrm_dyn) is only active if the mean gradient norm of the support functions is below this threshold

## lin_basis.alpha_diis
Le paramètre `alpha_diis` appartient à la section `lin_basis` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Multiplicator for DIIS.
Valeur par défaut : `1.0`.
Valeurs admises : de 0.1 à 10.
possible value: 2 positive real numbers The support functions gradient is multiplied by this number before being used for the DIIS optimization. The first entry for the low accuracy part, the second one for the high accuracy part. When the hybrid mode is used, only the first entry is taken into account.

## lin_basis.alpha_sd
Le paramètre `alpha_sd` appartient à la section `lin_basis` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Initial step size for SD.
Valeur par défaut : `1.0`.
Valeurs admises : de 0.0001 à 10.0.
The initial step size which is used to optimize the support functions with steepest descent. If the specified value is not appropriate, it will be adjusted automatically. The first entry is used for the low accuracy part, the second one for the high accuracy part. When the hybrid mode is used, only the first entry is taken into account.

## lin_basis.nstep_prec
Le paramètre `nstep_prec` appartient à la section `lin_basis` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Number of iterations in the preconditioner.
Valeur par défaut : `5`.
Valeurs admises : de 1 à 30.
Indicates how many iterations in the preconditioning of the gradient shall be performed

## lin_basis.fix_basis
Le paramètre `fix_basis` appartient à la section `lin_basis` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Fix the support functions if the density change is below this threshold.
Valeur par défaut : `1e-10`.
Valeurs admises : de 0.0 à 1e-06.

## lin_basis.correction_orthoconstraint
Le paramètre `correction_orthoconstraint` appartient à la section `lin_basis` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Correction for the slight non-orthonormality in the orthoconstraint.
Valeur par défaut : `1`.
Valeurs admises : de 0 à 1.
Indicates whether the slight non-orthogonality of the support functions should be taken into account during the application of the orthogonality constraint - 0 => take into account - 1 => don't take into account

## lin_basis.orthogonalize_ao
Le paramètre `orthogonalize_ao` appartient à la section `lin_basis` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Orthogonalize the atomic orbitals used as input guess.
Valeur par défaut : `true`.

## lin_basis.reset_DIIS_history
Le paramètre `reset_DIIS_history` appartient à la section `lin_basis` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Reset the DIIS history when starting the loop which optimizes the support functions.
Valeur par défaut : `false`.

## lin_kernel.nstep
Le paramètre `nstep` appartient à la section `lin_kernel` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Number of steps taken when updating the coefficients via direct minimization for each iteration of the density kernel loop.
Valeur par défaut : `[1, 1]`.
Valeurs admises : de 0 à 1000.
Indicates the number of steps taken when updating the coefficients via direct minimization for each iteration of the density kernel loop. The first entry is used for the low accuracy part, the second one for the high accuracy part. When the hybrid mode is used, only the first entry is taken into account.

## lin_kernel.nit
Le paramètre `nit` appartient à la section `lin_kernel` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau avancé.
Rôle : Number of iterations in the (self-consistent) optimization of the density kernel.
Valeur par défaut : `[5, 5]`.
Valeurs admises : de 0 à 1000.
Indicates the number of iterations in the (self-consistent) optimization of the density kernel. The first entry is used for the low accuracy part, the second one for the high accuracy part. When the hybrid mode is used, only the first entry is taken into account.

## lin_kernel.idsx_coeff
Le paramètre `idsx_coeff` appartient à la section `lin_kernel` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : DIIS history for direct mininimization - warning, there is currently a problem for idsx_coeff/=0.
Valeur par défaut : `[0, 0]`.

## lin_kernel.idsx
Le paramètre `idsx` appartient à la section `lin_kernel` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Mixing method; 0 -> linear mixing, >=1 -> Pulay mixing.
Valeur par défaut : `[0, 0]`.
Valeurs admises : de 0 à 20.
Indicates how the density / potential mixing shall be performed: n=0 => linear mixing n=1 => Pulay mixing with history length n The first entry is used for the low accuracy part, the second one for the high accuracy part. When the hybrid mode is used, only the first entry is taken into account.

## lin_kernel.alphamix
Le paramètre `alphamix` appartient à la section `lin_kernel` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Mixing parameter (low/high accuracy).
Valeur par défaut : `[0.5, 0.5]`.
Valeurs admises : de 0.0 à 1.0.
Indicates the mixing parameter used for the mixing of the charge density / potential. The larger the value, the more of the previous value will be kept. The first entry is used for the low accuracy part, the second one for the high accuracy part. When the hybrid mode is used, only the first entry is taken into account.

## lin_kernel.gnrm_cv_coeff
Le paramètre `gnrm_cv_coeff` appartient à la section `lin_kernel` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Convergence criterion on the gradient for direct minimization.
Valeur par défaut : `[1e-05, 1e-05]`.
Convergence criterion on the gradient for direct minimization. The first entry is used for the low accuracy part, the second one for the high accuracy part. When the hybrid mode is used, only the first entry is taken into account.

## lin_kernel.rpnrm_cv
Le paramètre `rpnrm_cv` appartient à la section `lin_kernel` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Convergence criterion (change in density/potential) for the kernel optimization.
Valeur par défaut : `[1e-10, 1e-10]`.
Valeurs admises : de 1e-14 à 1e-05.
The optimization of the density kernel is stopped as soon as the mean change of the charge density / potential between two iterations falls below this threshold. The first entry is used for the low accuracy part, the second one for the high accuracy part. When the hybrid mode is used, only the first entry is taken into account.

## lin_kernel.linear_method
Le paramètre `linear_method` appartient à la section `lin_kernel` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau avancé.
Rôle : Method to optimize the density kernel.
Valeur par défaut : `"DIAG"`.
Valeurs possibles : `DIRMIN` (direct minimization); `DIAG` (diagonalization); `NTPOLY` (ntpoly library); `FOE` (Fermi Operator Expansion).
Indicates the method with which the density kernel is optimized: * DIRMIN => direct minimization * DIAG => diagonalization with density mixing * NTPOLY => diagonalization using NTPoly. * FOE => Fermi Operator Expansion

## lin_kernel.mixing_method
Le paramètre `mixing_method` appartient à la section `lin_kernel` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Quantity to be mixed.
Valeur par défaut : `"DEN"`.
Valeurs possibles : `DEN` (density mixing); `POT` (potential mixing).
Indicates which quantity should be used for the mixing procedure: DEN => density mixing POT => potential mixing

## lin_kernel.alpha_sd_coeff
Le paramètre `alpha_sd_coeff` appartient à la section `lin_kernel` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Initial step size for SD for direct minimization.
Valeur par défaut : `0.2`.

## lin_kernel.alpha_fit_coeff
Le paramètre `alpha_fit_coeff` appartient à la section `lin_kernel` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Update the SD step size by fitting a quadratic polynomial.
Valeur par défaut : `false`.
Update the SD step size by fitting a quadratic polynomial to the energy along the direction of the gradient during direct mininimization.

## lin_kernel.coeff_scaling_factor
Le paramètre `coeff_scaling_factor` appartient à la section `lin_kernel` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Factor to scale the gradient in direct minimization.
Valeur par défaut : `1.0`.
Valeurs admises : de 0.0 à 10.0.
Specifies a scaling factor for the coefficient gradient, recommended to be around 0.1 - 0.5 for CDFT, fragment calculations or systems where convergence is unstable.

## lin_kernel.delta_pnrm
Le paramètre `delta_pnrm` appartient à la section `lin_kernel` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Stop the kernel optimization if the density/potential difference has decreased by this factor (deactivated if -1.0).
Valeur par défaut : `-1.0`.
Valeurs admises : de -1.0 à 1.0.
stop the kernel optimization if the density/potential difference has decreased by this factor compared to the first iteration. The feature is deactivated for a value of -1.0

## lin_kernel.diag_start
Le paramètre `diag_start` appartient à la section `lin_kernel` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : whether or not to diagonalize the SF Hamiltonian at the beginning of a restart calculation (useful for (pseudo-)fragment calculations).
Valeur par défaut : `false`.

## lin_basis_params.nbasis
Le paramètre `nbasis` appartient à la section `lin_basis_params` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau avancé.
Rôle : Number of support functions per atom.
Valeur par défaut : `4`.
Indicates the number of support fuctions centered on this atom type. Possible values are: * 1 (s orbital type) * 4 (s,p orbital types) * 9 (s,p,d orbital types) * 16 (s,p,d,f orbital types)

## lin_basis_params.ao_confinement
Le paramètre `ao_confinement` appartient à la section `lin_basis_params` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Prefactor for the input guess confining potential.
Valeur par défaut : `0.0083`.
Valeurs admises : de -1.0 à 10.0.
Indicates the prefactor of the confining potential of this atom type which is used to generate the input guess.

## lin_basis_params.confinement
Le paramètre `confinement` appartient à la section `lin_basis_params` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau avancé.
Rôle : Prefactor for the confining potential (low/high accuracy).
Valeur par défaut : `[0.0083, 0.0]`.
Valeurs admises : de -1.0 à 10.0.
Indicates the prefactor of the confining potential of this atom type. The first entry is used for the low accuracy part, the second one for the high accuracy part. When the hybrid mode is used, only the first entry is taken into account.

## lin_basis_params.rloc
Le paramètre `rloc` appartient à la section `lin_basis_params` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau avancé.
Rôle : Localization radius for the support functions.
Valeur par défaut : `[7.0, 7.0]`.
Valeurs admises : de 2.0 à 1000.0.
Indicates the cutoff radius for the support functions. The first entry is used for the low accuracy part, the second one for the high accuracy part; the second value must not be smaller than the first one. When the hybrid mode is used, only the first entry is taken into account.

## lin_basis_params.rloc_kernel
Le paramètre `rloc_kernel` appartient à la section `lin_basis_params` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau avancé.
Rôle : Localization radius for the density kernel.
Valeur par défaut : `9.0`.
Valeurs admises : de 2.0 à 1000.0.
Indicates the cutoff radius for the density kernel. Must be at least as large as the support function cutoff plus 8 times the grid spacing; will be adjusted automatically if it is chosen too small.

## lin_basis_params.rloc_kernel_foe
Le paramètre `rloc_kernel_foe` appartient à la section `lin_basis_params` du fichier d'entrée (bigdft/src/input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Cutoff radius for the FOE matrix vector multiplications.
Valeur par défaut : `14.0`.
Valeurs admises : de 2.0 à 1000.
Indicates the cutoff radius used for the matrix vector multiplications. Must be at least as large as the kernel cutoff.

## Profil linear_accurate

Le profil `linear_accurate` s'appelle avec `import: linear_accurate`. Appropriate input parameters for a high accuracy linear scaling calculation. This profile should be chosen if highly accurate energy differences are required.
Il fixe : `{"dft": {"hgrids": 0.3, "ixc": "PBE", "inputpsiid": "linear"}, "chess": {"foe": {"ef_interpol_chargediff": 1.0}}, "perf": {"experimental_mode": true, "correction_co_contra": true}, "lin_general": {"hybrid": true, "taylor_order": 1015, "max_inversion_error": 5e-08}, "lin_basis": {"nit": 8, "idsx": 8, "gnrm_cv": 0.001, "gnrm_dyn": 0.0001, "deltae_cv": 5e-05, "min_gnrm_for_dynamic": 0.002, "alpha_diis": 0.5, "alpha_sd": 0.5, "nstep_prec": 6, "fix_basis": 1e-12, "correction_orthoconstraint": 0}, "lin_kernel": {"nit": 4, "idsx": 6, "alphamix": 0.1, "rpnrm_cv": [1e-12, 1e-12], "linear_method": "FOE"}, "lin_basis_params": {"ao_confinement": -1.0, "confinement": [-1.0, 0.0], "rloc_kernel": 10.0, "rloc_kernel_foe": 12.0, "H": {"nbasis": 1, "rloc": 5.0}, "C": {"nbasis": 4, "rloc": 5.5}, "N": {"nbasis": 4, "rloc": 5.5}, "O": {"nbasis": 4, "rloc": 5.5}, "P": {"nbasis": 4, "rloc": 6.0}, "S": {"nbasis": 4, "rloc": 6.0}, "Cl": {"nbasis": 4, "rloc": 6.0}, "Na": {"nbasis": 1, "rloc": 7.5}, "K": {"nbasis": 1, "rloc": 8.0}, "Sn": {"nbasis": 4, "rloc": 6.5}}}`.

## Profil linear_moderate

Le profil `linear_moderate` s'appelle avec `import: linear_moderate`. Appropriate input parameters for a moderate accuracy linear scaling calculation. This profile should be chosen if accurate forces are required, but there is no need for extremely accurate energies.
Il fixe : `{"dft": {"hgrids": 0.3, "ixc": "PBE", "inputpsiid": "linear"}, "chess": {"foe": {"ef_interpol_chargediff": 1.0}}, "perf": {"experimental_mode": true, "correction_co_contra": true}, "lin_general": {"hybrid": true, "taylor_order": 10}, "lin_basis": {"nit": [10, 10], "gnrm_cv": [0.002, 0.002], "gnrm_dyn": 0.0002, "deltae_cv": 5e-05, "min_gnrm_for_dynamic": 0.004, "alpha_diis": 0.5, "alpha_sd": 0.5, "nstep_prec": 6, "fix_basis": 1e-11, "correction_orthoconstraint": 0}, "lin_kernel": {"nit": [3, 3], "idsx": [6, 6], "alphamix": [0.2, 0.2], "rpnrm_cv": [1e-11, 1e-11], "linear_method": "FOE"}, "lin_basis_params": {"ao_confinement": -1.0, "confinement": [-1.0, 0.0], "rloc_kernel": 10.0, "rloc_kernel_foe": 12.0, "H": {"nbasis": 1, "rloc": 5.0}, "C": {"nbasis": 4, "rloc": 5.5}, "N": {"nbasis": 4, "rloc": 5.5}, "O": {"nbasis": 4, "rloc": 5.5}, "P": {"nbasis": 4, "rloc": 6.0}, "S": {"nbasis": 4, "rloc": 6.0}, "Cl": {"nbasis": 4, "rloc": 6.0}, "Na": {"nbasis": 1, "rloc": 7.5}, "K": {"nbasis": 1, "rloc": 8.0}, "Sn": {"nbasis": 4, "rloc": 6.5}}}`.

## Profil linear_fast

Le profil `linear_fast` s'appelle avec `import: linear_fast`. Appropriate input parameters for a low accuracy linear scaling calculation. This profile should be chosen if speed is more important than accuracy.
Il fixe : `{"dft": {"hgrids": 0.3, "ixc": "PBE", "inputpsiid": "linear"}, "perf": {"ef_interpol_chargediff": 1.0, "experimental_mode": true, "correction_co_contra": true}, "lin_general": {"hybrid": true, "taylor_order": 10}, "lin_basis": {"nit": [10, 10], "gnrm_cv": [0.004, 0.004], "gnrm_dyn": 0.0004, "deltae_cv": 5e-05, "min_gnrm_for_dynamic": 0.008, "alpha_diis": 0.5, "alpha_sd": 0.5, "nstep_prec": 6, "fix_basis": 1e-10, "correction_orthoconstraint": 0}, "lin_kernel": {"nit": [10, 10], "idsx": [6, 6], "alphamix": [0.2, 0.2], "rpnrm_cv": [1e-10, 1e-10], "linear_method": "FOE"}, "lin_basis_params": {"ao_confinement": -1.0, "confinement": [-1.0, 0.0], "rloc_kernel": 10.0, "rloc_kernel_foe": 12.0, "H": {"nbasis": 1, "rloc": 5.0}, "C": {"nbasis": 4, "rloc": 5.5}, "N": {"nbasis": 4, "rloc": 5.5}, "O": {"nbasis": 4, "rloc": 5.5}, "P": {"nbasis": 4, "rloc": 6.0}, "S": {"nbasis": 4, "rloc": 6.0}, "Cl": {"nbasis": 4, "rloc": 6.0}, "Na": {"nbasis": 1, "rloc": 7.5}, "K": {"nbasis": 1, "rloc": 8.0}, "Sn": {"nbasis": 4, "rloc": 6.5}}}`.

## Profil linear_laura

Le profil `linear_laura` s'appelle avec `import: linear_laura`. temporary profile, to be merged. Lauras favourite linear parameters
Il fixe : `{"dft": {"inputpsiid": "linear"}, "perf": {"check_sumrho": 0, "check_overlap": 0, "experimental_mode": true, "calculate_KS_residue": false, "check_matrix_compression": false, "correction_co_contra": true, "store_index": true, "mixing_after_inputguess": 1, "kappa_conv": 0.1, "FOE_restart": 1, "hamapp_radius_incr": 6, "loewdin_charge_analysis": false}, "lin_general": {"hybrid": true, "nit": 40, "taylor_order": 1010, "max_inversion_error": 1e-06, "rpnrm_cv": 1e-10, "output_wf": 1, "output_mat": 11, "calculate_onsite_overlap": true, "charge_multipoles": 11, "extra_states": 0}, "lin_basis": {"nit": 3, "idsx": 3, "deltae_cv": 0.0001, "min_gnrm_for_dynamic": 0.004, "alpha_diis": 0.5, "alpha_sd": 0.5, "nstep_prec": 6, "fix_basis": 1e-13, "correction_orthoconstraint": 0, "gnrm_ig": 0.1}, "lin_kernel": {"nit": 5, "idsx": 4, "alphamix": 0.1, "linear_method": "FOE", "rpnrm_cv": 1e-10}}`.

## Profil mixing

Le profil `mixing` s'appelle avec `import: mixing`. To be used for metallic systems. Parameters for the mixing scheme associated to the diagonalization method.
Il fixe : `{"dft": {"gnrm_cv": 1e-06, "nrepmax": 1, "itermax": 3, "ncong": 5, "idsx": 0}, "mix": {"iscf": 17, "itrpmax": 200, "rpnrm_cv": 1e-12, "norbsempty": 120, "tel": 0.01, "alphamix": 0.8, "alphadiis": "1.d0"}}`.

## Profil linear

Le profil `linear` s'appelle avec `import: linear`. Linear parameters sufficient for PDoS, charge analysis, MD. Basic parameters to perform a linear calculation.
Il fixe : `{"dft": {"disablesym": true, "inputpsiid": "linear"}, "chess": {"foe": {"ef_interpol_chargediff": 1.0, "eval_range_foe": [-1.0, 1.0], "fscale": 0.05}}, "perf": {"check_sumrho": 0, "check_overlap": 0, "experimental_mode": true, "calculate_KS_residue": false, "check_matrix_compression": false, "correction_co_contra": true, "store_index": false, "mixing_after_inputguess": 0, "kappa_conv": 0.1, "FOE_restart": 1, "hamapp_radius_incr": 6}, "lin_general": {"hybrid": true, "nit": 50, "taylor_order": 1020, "max_inversion_error": 5e-08, "rpnrm_cv": 1e-11, "output_mat": 1, "output_coeff": 0, "output_multipole_matrices": false, "charge_multipoles": 11, "check_multipoles": false, "calc_dipole": true}, "lin_basis": {"nit": 8, "idsx": 4, "gnrm_cv": 0.002, "deltae_cv": 0.0001, "min_gnrm_for_dynamic": 0.004, "alpha_diis": 0.5, "alpha_sd": 0.5, "nstep_prec": 6, "fix_basis": 1e-12, "correction_orthoconstraint": 0, "gnrm_ig": 0.1, "reset_DIIS_history": true}, "lin_kernel": {"nstep": 10, "nit": 6, "idsx_coeff": 0, "idsx": 6, "rpnrm_cv": 1e-08, "alphamix": 0.1, "linear_method": "FOE", "delta_pnrm": 0.1}, "lin_basis_params": {"ao_confinement": -1.0, "confinement": [-1.0, 0.0], "rloc_kernel": 10.0, "rloc_kernel_foe": 12.0, "H": {"nbasis": 1, "rloc": 5.0}, "Li": {"nbasis": 1, "rloc": 5.5}, "C": {"nbasis": 4, "rloc": 5.5}, "N": {"nbasis": 4, "rloc": 5.5}, "O": {"nbasis": 4, "rloc": 5.5}, "F": {"nbasis": 4, "rloc": 5.5}, "Si": {"nbasis": 4, "rloc": 8.0}, "P": {"nbasis": 4, "rloc": 6.0}, "S": {"nbasis": 4, "rloc": 6.0}, "Cl": {"nbasis": 4, "rloc": 6.0}, "Na": {"nbasis": 1, "rloc": 7.5}, "K": {"nbasis": 1, "rloc": 8.0}, "Sn": {"nbasis": 4, "rloc": 6.5}, "Fe": {"nbasis": 13, "rloc": 8.0}, "Cu": {"nbasis": 9, "rloc": 7.0}, "W": {"nbasis": 9, "rloc": 7.5}, "Zn": {"nbasis": 6, "rloc": 8.0}, "Ca": {"nbasis": 5, "rloc": 7.5}, "Ni": {"nbasis": 10, "rloc": 8.0}}, "ig_occupation": {"Fe": {"3s": 2.0, "3p": 6.0, "3d": {"up": 4.0, "down": 2.0}, "4s": 2.0, "4p": 0.0}, "Cu": {"3d": 10.0, "4s": 1.0, "4p": 0.0}, "W": {"6s": 2.0, "5d": 4.0, "6p": 0.0}, "Zn": {"4s": 2.0, "3d": 10.0}, "Ni": {"3s": 2.0, "3p": 6.0, "3d": 8.0, "4s": 2.0}}}`.

## Profil linear_virtual

Le profil `linear_virtual` s'appelle avec `import: linear_virtual`. Input parameters to be added to the linear profile for virtual states inclusion.
Il fixe : `{"dft": {"inputpsiid": "linear_restart"}, "lin_basis": {"fix_basis": 0.0, "gnrm_cv": 0.01, "idsx": 2, "nit": 4}, "lin_general": {"hybrid": false, "kernel_restart_mode": "coeff", "nit": [0, 200], "rpnrm_cv": 1e-08}, "lin_kernel": {"alphamix": 0.0, "delta_pnrm": -1, "gnrm_cv_coeff": 0.0001, "linear_method": "DIRMIN", "nit": 1, "nstep": 500, "rpnrm_cv": 1e-08}, "perf": {"adjust_kernel_iterations": false, "adjust_kernel_threshold": false}}`.

## Profil linear_fragments

Le profil `linear_fragments` s'appelle avec `import: linear_fragments`. Input parameters to be added to the linear profile for fragment calculation (templates ready).
Il fixe : `{"dft": {"inputpsiid": "linear_restart"}, "lin_basis": {"idsx": 0, "nit": 1}, "lin_general": {"charge_multipoles": 0, "hybrid": false, "nit": [0, 1], "subspace_diag": true}, "lin_kernel": {"alphamix": 0.1, "delta_pnrm": -1, "nit": 100, "rpnrm_cv": 1e-11}, "perf": {"adjust_kernel_iterations": false, "adjust_kernel_threshold": false}}`.

## Profil linear_convergence

Le profil `linear_convergence` s'appelle avec `import: linear_convergence`. Parameters to supplement linear to help with convergence.. Include this profile with linear if you have convergence problems.
Il fixe : `{"lin_kernel": {"rpnrm_cv": "1e-10"}, "lin_general": {"nit": 100}, "lin_basis": {"nit": 2}, "perf": {"adjust_kernel_iterations": false, "adjust_kernel_threshold": false}}`.

## Profil linear_purify

Le profil `linear_purify` s'appelle avec `import: linear_purify`. Input parameters to turn on purification instead of chess. Extra parameters for linear if you want to use NTPoly purification
Il fixe : `{"lin_kernel": {"linear_method": "NTPOLY"}, "chess": {"ntpoly": {"threshold_density": "1e-6", "threshold_overlap": "1e-6", "convergence_density": 0.0001, "convergence_overlap": 0.0}}}`.

## Profil md

Le profil `md` s'appelle avec `import: md`. Molecular dynamics input parameters for H2O molecules.
Il fixe : `{"geopt": {"method": "AB6MD", "ionmov": 8, "dtion": 20.0, "noseinert": 30.0}}`.

## psolver.kernel.screening
Le paramètre `screening` appartient à la section `psolver.kernel` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau avancé.
Rôle : Mu screening parameter.
Valeur par défaut : `0`.
Valeurs admises : de 0.0 à inf.
Activates the exponential (Yukawa-like) screening in the coulomb kernel

## psolver.kernel.isf_order
Le paramètre `isf_order` appartient à la section `psolver.kernel` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau avancé.
Rôle : Order of the Interpolating Scaling Function family.
Valeur par défaut : `16`.
Valeurs possibles : `2`; `4`; `6`; `8`; `14`; `16`; `20`; `24`; `30`; `40`; `50`; `60`; `100`.
Fixes the order of the ISF family that is used for the discretization of the kernel

## psolver.kernel.stress_tensor
Le paramètre `stress_tensor` appartient à la section `psolver.kernel` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau expert.
Rôle : Triggers the calculation of the stress tensor.
Valeur par défaut : `true`.
It calculates the derivative of the hartree energy with respect to the deformation. It makes sense only for a vacuum-like calculation

## psolver.environment.cavity
Le paramètre `cavity` appartient à la section `psolver.environment` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau essentiel.
Rôle : Type of the cavity.
Valeur par défaut : `"none"`.
Valeurs possibles : `none` (No cavity, traditional vacuum treatment); `soft-sphere` (PCM-like cavity, fixed by some distance from the external atoms); `sccs` (Self-Consistent determination of the cavity from the charge density).
When not none, a cavity around the density is fixed

## psolver.environment.epsilon
Le paramètre `epsilon` appartient à la section `psolver.environment` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau avancé.
Rôle : Dielectric constant of the exterior region.
Valeur par défaut : `"water"`.
Valeurs admises : de 1.0 à inf.
Valeurs nommées : `water` = `78.36`; `vacuum` = `1.0`.
N'a de sens que selon `cavity` (valeurs : ['none']).

## psolver.environment.edensmaxmin
Le paramètre `edensmaxmin` appartient à la section `psolver.environment` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau expert.
Rôle : Extremum values of the charge density, for the definition of the transition region.
Valeur par défaut : `[0.0001, 0.005]`.
N'a de sens que selon `cavity` (valeurs : ['sccs']).

## psolver.environment.radii_set
Le paramètre `radii_set` appartient à la section `psolver.environment` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau avancé.
Rôle : Set of vdW radii used by default in the setter function.
Valeur par défaut : `"UFF"`.
Valeurs possibles : `UFF` (Unified Force Field); `Bondi` (Bondi collection); `Pauling` (Pauling collection).
N'a de sens que selon `cavity` (valeurs : ['soft-sphere']).

## psolver.environment.atomic_radii
Le paramètre `atomic_radii` appartient à la section `psolver.environment` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau expert.
Rôle : Mapping of the radii that have to be used for each atomic species.
Valeur par défaut : `0`.
N'a de sens que selon `cavity` (valeurs : ['soft-sphere']).

## psolver.environment.delta
Le paramètre `delta` appartient à la section `psolver.environment` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau avancé.
Rôle : Amplitude of the transition region in the soft-sphere cavity (AU).
Valeur par défaut : `0.5`.
N'a de sens que selon `cavity` (valeurs : ['soft-sphere']).

## psolver.environment.cavitation
Le paramètre `cavitation` appartient à la section `psolver.environment` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau avancé.
Rôle : Triggers the evaluation of the extra cavitation terms.
Valeur par défaut : `true`.
N'a de sens que selon `cavity` (valeurs : ['none']).

## psolver.environment.fact_rigid
Le paramètre `fact_rigid` appartient à la section `psolver.environment` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau avancé.
Rôle : Multiplying factor for the whole soft-sphere cavity.
Valeur par défaut : `1.12`.
N'a de sens que selon `cavity` (valeurs : ['soft-sphere']).

## psolver.environment.gammaS
Le paramètre `gammaS` appartient à la section `psolver.environment` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau expert.
Rôle : Cavitation term, surface tension of the solvent [dyn/cm].
Valeur par défaut : `"water"`.
Valeurs nommées : `water` = `72.0`; `vacuum` = `0.0`.
N'a de sens que selon `cavitation` (valeurs : [True]).

## psolver.environment.alphaS
Le paramètre `alphaS` appartient à la section `psolver.environment` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau expert.
Rôle : Proportionality of repulsion free energy in term of the surface integral [dyn/cm].
Valeur par défaut : `"water"`.
Valeurs nommées : `water` = `-22.0`; `vacuum` = `0.0`.
N'a de sens que selon `cavitation` (valeurs : [True]).

## psolver.environment.betaV
Le paramètre `betaV` appartient à la section `psolver.environment` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau expert.
Rôle : Proportionality of dispersion free energy in term of volume integral [GPa].
Valeur par défaut : `"water"`.
Valeurs nommées : `water` = `-0.35`; `vacuum` = `0.0`.
N'a de sens que selon `cavitation` (valeurs : [True]).

## psolver.environment.gps_algorithm
Le paramètre `gps_algorithm` appartient à la section `psolver.environment` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau avancé.
Rôle : Algorithm for the Generalised Poisson Equation.
Valeur par défaut : `"PCG"`.
Valeurs possibles : `SC` (Self-Consistent method); `PCG` (Preconditioned Conjugate Gradient).
N'a de sens que selon `cavity` (valeurs : ['none']).

## psolver.environment.pi_eta
Le paramètre `pi_eta` appartient à la section `psolver.environment` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau expert.
Rôle : Mixing parameter of the SC algorithm.
Valeur par défaut : `0.6`.
Valeurs admises : de 0.0 à 1.0.
N'a de sens que selon `gps_algorithm` (valeurs : ['SC']).

## psolver.environment.input_guess
Le paramètre `input_guess` appartient à la section `psolver.environment` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau expert.
Rôle : Triggers the input guess procedure of gps_algorithm.
Valeur par défaut : `true`.
N'a de sens que selon `cavity` (valeurs : ['none']).

## psolver.environment.fd_order
Le paramètre `fd_order` appartient à la section `psolver.environment` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau expert.
Rôle : Order of the Finite-difference derivatives for the GPS solver.
Valeur par défaut : `16`.
Valeurs possibles : `2`; `4`; `6`; `8`; `16`.

## psolver.environment.itermax
Le paramètre `itermax` appartient à la section `psolver.environment` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau expert.
Rôle : Maximum number of iterations of the GPS outer loop.
Valeur par défaut : `200`.

## psolver.environment.minres
Le paramètre `minres` appartient à la section `psolver.environment` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau expert.
Rôle : Convergence threshold of the loop.
Valeur par défaut : `1e-08`.

## psolver.environment.pb_method
Le paramètre `pb_method` appartient à la section `psolver.environment` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau avancé.
Rôle : Defines the method for the Poisson Boltzmann Equation.
Valeur par défaut : `"none"`.
Valeurs possibles : `none` (No PBe, only GPe equation); `linear` (Linearized PBe); `standard` (PBe Equation, Gouy-Chapmann method); `modified` (Bikermann-type modified expression).

## psolver.environment.pb_minres
Le paramètre `pb_minres` appartient à la section `psolver.environment` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau expert.
Rôle : Convergence criterion of the PBe loop.
Valeur par défaut : `1e-10`.
Valeurs admises : de 0.0 à inf.
N'a de sens que selon `pb_method` (valeurs : ['none']).

## psolver.environment.pb_input_guess
Le paramètre `pb_input_guess` appartient à la section `psolver.environment` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau expert.
Rôle : Triggers the input guess procedure of PBe loop.
Valeur par défaut : `true`.
N'a de sens que selon `pb_method` (valeurs : ['none']).

## psolver.environment.pb_eta
Le paramètre `pb_eta` appartient à la section `psolver.environment` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau expert.
Rôle : Mixing parameter of the PBe loop.
Valeur par défaut : `1.0`.
Valeurs admises : de 0.0 à 1.0.
N'a de sens que selon `pb_method` (valeurs : ['none']).

## psolver.environment.pb_itermax
Le paramètre `pb_itermax` appartient à la section `psolver.environment` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau expert.
Rôle : Maximum number of iterations of the PBe loop.
Valeur par défaut : `50`.
N'a de sens que selon `pb_method` (valeurs : ['none']).

## psolver.environment.pb_t
Le paramètre `pb_t` appartient à la section `psolver.environment` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau expert.
Rôle : Temperature in Kelvin of the electrolytic solution.
Valeur par défaut : `300.0`.
Valeurs admises : de 0.0 à inf.
N'a de sens que selon `pb_method` (valeurs : ['none']).

## psolver.environment.pb_ions
Le paramètre `pb_ions` appartient à la section `psolver.environment` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Milieu, au niveau expert.
Rôle : List of the ions of the PBe environment.
Valeur par défaut : `"nacl"`.
Valeurs nommées : `nacl` = `[{"z": 1, "c": 100.0, "rad": 3.0}, {"z": -1, "c": 100.0, "rad": 3.0}]`.
N'a de sens que selon `pb_method` (valeurs : ['none']).

## psolver.setup.accel
Le paramètre `accel` appartient à la section `psolver.setup` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau essentiel.
Rôle : Material Acceleration.
Valeur par défaut : `"none"`.
Valeurs possibles : `none` (CPU Solver); `CUDA` (CUFFT-based solver); `DBFFT` (MKL-SYCL-based GPU solver); `DBFFTCPU` (MKL-SYCL-based CPU solver); `ONEMATH` (oneMATH-SYCL GPU solver); `ONEMATHCPU` (oneMATH-SYCL CPU solver).
Valeurs nommées : `ONEMKL` = `"DBFFT"`; `ONEMKLCPU` = `"DBFFTCPU"`.

## psolver.setup.keep_gpu_memory
Le paramètre `keep_gpu_memory` appartient à la section `psolver.setup` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Do not deallocate GPU memory at each call of the (G)PS routine.
Valeur par défaut : `true`.
N'a de sens que selon `accel` (valeurs : ['none']).

## psolver.setup.use_gpu_direct
Le paramètre `use_gpu_direct` appartient à la section `psolver.setup` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Force (or not) the usage of GPUdirect communication, if available.
Valeur par défaut : `true`.
N'a de sens que selon `accel` (valeurs : ['none']).

## psolver.setup.taskgroup_size
Le paramètre `taskgroup_size` appartient à la section `psolver.setup` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Size of the taskgroups of the Poisson Solver.
Valeur par défaut : `0`.

## psolver.setup.global_data
Le paramètre `global_data` appartient à la section `psolver.setup` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Charge density and Electrostatic potential are given by global arrays.
Valeur par défaut : `false`.

## psolver.setup.verbose
Le paramètre `verbose` appartient à la section `psolver.setup` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Verbosity switch.
Valeur par défaut : `true`.

## psolver.setup.output
Le paramètre `output` appartient à la section `psolver.setup` du fichier d'entrée (psolver/src/PS_input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : Quantities to be plotted after the main solver routine.
Valeur par défaut : `"none"`.
Might be a list containing kewywords like cavity, potential or density

## Profil water

Le profil `water` s'appelle avec `import: water`. Solvation in water.
Il fixe : `{"environment": {"cavity": "sccs", "epsilon": "water", "cavitation": true}}`.

## chess.foe.ef_interpol_det
Le paramètre `ef_interpol_det` appartient à la section `chess.foe` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : FOE max determinant of cubic interpolation matrix.
Valeur par défaut : `1e-12`.
Valeurs admises : de 0.0 à 1.0.

## chess.foe.ef_interpol_chargediff
Le paramètre `ef_interpol_chargediff` appartient à la section `chess.foe` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : FOE max charge difference for interpolation.
Valeur par défaut : `1.0`.
Valeurs admises : de 0.0 à 1000.0.

## chess.foe.evbounds_nsatur
Le paramètre `evbounds_nsatur` appartient à la section `chess.foe` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Number of FOE cycles before the eigenvalue bounds are shrinked (linear).
Valeur par défaut : `3`.

## chess.foe.evboundsshrink_nsatur
Le paramètre `evboundsshrink_nsatur` appartient à la section `chess.foe` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Maximal number of unsuccessful eigenvalue bounds shrinkings.
Valeur par défaut : `4`.

## chess.foe.fscale
Le paramètre `fscale` appartient à la section `chess.foe` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau avancé.
Rôle : Initial guess for the error function decay length.
Valeur par défaut : `0.05`.
Valeurs admises : de 0.0001 à 0.1.
Indicates the decay length of the error function which is used by the Fermi Operator Expasion to construct the density kernel. This value will be adjusted automatically if not chosen appropriately.

## chess.foe.fscale_lowerbound
Le paramètre `fscale_lowerbound` appartient à la section `chess.foe` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Lower bound for the error function decay length.
Valeur par défaut : `0.005`.
Valeurs admises : de 0.0001 à 0.01.

## chess.foe.fscale_upperbound
Le paramètre `fscale_upperbound` appartient à la section `chess.foe` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Upper bound for the error function decay length.
Valeur par défaut : `0.05`.
Valeurs admises : de 0.01 à 1.0.

## chess.foe.eval_range_foe
Le paramètre `eval_range_foe` appartient à la section `chess.foe` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Lower and upper bound of the eigenvalue spectrum, will be adjusted automatically if chosen unproperly.
Valeur par défaut : `[-0.5, 0.5]`.
Valeurs admises : de -10.0 à 10.0.
Indicates the lower and upper bound of the eigenvalue spectrum which is used for the Fermi Operator Expansion. This spectrum will be adjusted automatically if not chosen appropriately.

## chess.foe.accuracy_foe
Le paramètre `accuracy_foe` appartient à la section `chess.foe` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Required accuracy for the Chebyshev fit for FOE.
Valeur par défaut : `1e-05`.
Valeurs admises : de 1e-10 à 0.001.

## chess.foe.accuracy_ice
Le paramètre `accuracy_ice` appartient à la section `chess.foe` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Required accuracy for the Chebyshev fit for ICE (calculation of matrix powers).
Valeur par défaut : `1e-08`.
Valeurs admises : de 1e-10 à 0.001.

## chess.foe.accuracy_penalty
Le paramètre `accuracy_penalty` appartient à la section `chess.foe` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Required accuracy for the Chebyshev fit for the penalty function.
Valeur par défaut : `1e-05`.
Valeurs admises : de 1e-10 à 0.001.

## chess.foe.accuracy_entropy
Le paramètre `accuracy_entropy` appartient à la section `chess.foe` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : Required accuracy for the Chebyshev fit for the function to calculate the entropy term.
Valeur par défaut : `0.0001`.
Valeurs admises : de 1e-09 à 0.01.

## chess.foe.betax_foe
Le paramètre `betax_foe` appartient à la section `chess.foe` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : the exponent in the exponential penalty function which is used to determine the eigenvalue bounds for FOE.
Valeur par défaut : `-1000.0`.
Valeurs admises : de -10000.0 à -10.0.

## chess.foe.betax_ice
Le paramètre `betax_ice` appartient à la section `chess.foe` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : the exponent in the exponential penalty function which is used to determine the eigenvalue bounds for ICE.
Valeur par défaut : `-1000.0`.
Valeurs admises : de -10000.0 à -10.0.

## chess.foe.occupation_function
Le paramètre `occupation_function` appartient à la section `chess.foe` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : the function to assign the occupation numbers.
Valeur par défaut : `102`.
Valeurs possibles : `102` (error_function); `106` (fermi_function).
Valeurs nommées : `error_function` = `102`; `fermi_function` = `106`.

## chess.foe.adjust_fscale
Le paramètre `adjust_fscale` appartient à la section `chess.foe` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : dynamically adjust the value of fscale or not.
Valeur par défaut : `true`.

## chess.foe.matmul_optimize_load_balancing
Le paramètre `matmul_optimize_load_balancing` appartient à la section `chess.foe` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : optimize the load balancing of the sparse matrix matrix multiplications (at the cost of memory unbalancing).
Valeur par défaut : `false`.

## chess.foe.fscale_ediff_low
Le paramètre `fscale_ediff_low` appartient à la section `chess.foe` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : lower bound for the optimal relative energy difference between the kernel and the control kernel.
Valeur par défaut : `5e-05`.
Valeurs admises : de 1e-07 à 0.001.

## chess.foe.fscale_ediff_up
Le paramètre `fscale_ediff_up` appartient à la section `chess.foe` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : upper bound for the optimal relative energy difference between the kernel and the control kernel.
Valeur par défaut : `0.0001`.
Valeurs admises : de 5e-06 à 0.05.

## chess.lapack.blocksize_pdsyev
Le paramètre `blocksize_pdsyev` appartient à la section `chess.lapack` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : SCALAPACK linear scaling blocksize for diagonalization.
Valeur par défaut : `-8`.

## chess.lapack.blocksize_pdgemm
Le paramètre `blocksize_pdgemm` appartient à la section `chess.lapack` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : SCALAPACK linear scaling blocksize for matrix matrix multiplication.
Valeur par défaut : `-8`.

## chess.lapack.maxproc_pdsyev
Le paramètre `maxproc_pdsyev` appartient à la section `chess.lapack` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : SCALAPACK linear scaling max num procs.
Valeur par défaut : `4`.

## chess.lapack.maxproc_pdgemm
Le paramètre `maxproc_pdgemm` appartient à la section `chess.lapack` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Machine, au niveau expert.
Rôle : SCALAPACK linear scaling max num procs.
Valeur par défaut : `4`.

## chess.ntpoly.serial_io
Le paramètre `serial_io` appartient à la section `chess.ntpoly` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : turn on serial IO if MPI is having problem on a machine..
Valeur par défaut : `false`.

## chess.ntpoly.threshold_density
Le paramètre `threshold_density` appartient à la section `chess.ntpoly` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau avancé.
Rôle : threshold for flushing small matrix values of the density matrix..
Valeur par défaut : `0.0`.
Valeurs admises : de 0.0 à 1.0.

## chess.ntpoly.convergence_density
Le paramètre `convergence_density` appartient à la section `chess.ntpoly` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : threshold for convergence of ntpoly purification calculation..
Valeur par défaut : `1e-10`.
Valeurs admises : de 0.0 à 1.0.

## chess.ntpoly.threshold_overlap
Le paramètre `threshold_overlap` appartient à la section `chess.ntpoly` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : threshold for flushing small matrix values of the overlap matrix..
Valeur par défaut : `0.0`.
Valeurs admises : de 0.0 à 1.0.

## chess.ntpoly.convergence_overlap
Le paramètre `convergence_overlap` appartient à la section `chess.ntpoly` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : threshold for convergence of ntpoly overlap inverse calculation..
Valeur par défaut : `1e-10`.
Valeurs admises : de 0.0 à 1.0.

## chess.ntpoly.temperature
Le paramètre `temperature` appartient à la section `chess.ntpoly` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : temperature in Kelvin for smearing..
Valeur par défaut : `300`.
Valeurs admises : de 1e-10 à 1000000.
N'a de sens que selon `solver` (valeurs : [0, 3]).

## chess.ntpoly.step_size
Le paramètre `step_size` appartient à la section `chess.ntpoly` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : step size for differential equation solvers (WOM).
Valeur par défaut : `0.01`.
Valeurs admises : de 1e-06 à 1.
N'a de sens que selon `solver` (valeurs : [3]).

## chess.ntpoly.solver
Le paramètre `solver` appartient à la section `chess.ntpoly` du fichier d'entrée (chess/src/chess_input_variables_definition.yaml). Il est exposé dans la brique Précision, au niveau expert.
Rôle : the density matrix solver to use..
Valeur par défaut : `1`.
Valeurs possibles : `1` (fourth order trace resetting); `2` (second order trace resetting); `3` (wave operator minimization); `0` (dense diagonalization).
