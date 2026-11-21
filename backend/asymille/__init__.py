"""Asymille: curve fitting, data analysis and figures for publication.

The engine is this package without ``asymille.web``: plain functions over numpy
arrays and JSON-like dictionaries, with no web framework and no database.

    expressions   arithmetic written by a person, checked and evaluated without eval
    functions     the registry of fit functions (peaks, baselines, decays, sigmoids, …)
    models        a model as data (components and their parameters), and its text notation
    fitting       fit, statistics, uncertainties, bands; several datasets, shared parameters
    analysis      the registry of operations (smooth, differentiate, baseline, peaks, FFT, …)
    journals      the column widths and type sizes journals ask for
    figures       a figure as data, drawn by matplotlib into PDF, EPS, SVG, PNG or TIFF

``asymille.web`` puts that behind an API, for a host that brings the accounts.
"""
__version__ = "2.0.0"
