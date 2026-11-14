"""UNVALIDATED: do not show on the site as a measured spectrum. Against catalog photometry of one star it agrees to
5% (median) but 2 of 11 points miss the 10% bar set in advance (+10.0%, -11.4%); IRSA's own tool was not compared.

Spectrum on the fly: each frame sees a different wavelength at the star, so per-frame aperture flux vs wavelength
is a low-resolution spectrum. See STRETCH_NOTES.md for the validation (PS1 y, 2MASS, AllWISE of one field star).

Same rules as photometry.light_curve: a frame with any saturated (OVERFLOW/BLOOM/NaN) or masked pixel in the aperture, an
aperture hanging off the cutout, or no usable sky, is dropped and counted, never guessed. No aperture correction (r=3 px holds ~98-99% of r=5 px
in D1-D3; the PSF grows toward D6, so long-wavelength points read low by a few percent more).
"""
import numpy as np

from blink.photometry import aperture_flux


def _full(x, y, r):
    """Pixels an aperture of radius r at (x, y) would hold away from any edge (fewer means it hangs off the cutout)."""
    yy, xx = np.mgrid[-10:11, -10:11]
    return int((np.hypot(xx - x % 1, yy - y % 1) <= r).sum())


def spectrum(frames_paths, ra, dec, **ap):
    """(wavelength_um, flux_mjy, err_mjy) sorted by wavelength from cutout paths covering (ra, dec), any detectors.

    err_mjy is the larger of the VARIANCE error and the empirical sky-scatter error per frame. Also returns
    path per point and dropped_saturated / dropped_masked counts. ap: passed to photometry.aperture_flux.
    """
    keep, sat, msk = [], 0, 0
    for p in frames_paths:
        r = aperture_flux(p, ra, dec, **ap)
        if r["saturated"]:
            sat += 1
        elif r["n_masked"] or r["n_aperture"] < _full(r["x"], r["y"], ap.get("r_ap_pix", 3.0)) or not np.isfinite(r["flux_mjy"]):
            msk += 1
        else:
            keep.append((r["wavelength_um"], r["flux_mjy"], max(r["err_mjy"], r["scatter_mjy"]), str(p)))
    keep.sort()
    wl, f, e = (np.array([k[i] for k in keep], float) for i in range(3))
    return dict(wavelength_um=wl, flux_mjy=f, err_mjy=e, path=[k[3] for k in keep],
                n_used=len(keep), dropped_saturated=sat, dropped_masked=msk)
