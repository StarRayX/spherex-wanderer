"""Validated against IRSA's SPHEREx Spectrophotometry Tool (Tractor PSF-fit forced photometry) for ONE unsaturated star
(K 10.42, 0.96-4.89 um, all six bands): 11 of 11 same-exposure points within 3.3%, median +0.2%, scatter 1.5%, no trend
with wavelength. Not validated for saturated or blended stars, or any other star. See STRETCH_NOTES.md.

Spectrum on the fly: each frame sees a different wavelength at the star, so per-frame aperture flux vs wavelength
is a low-resolution spectrum.

Same rules as photometry.light_curve: a frame with any saturated (OVERFLOW/BLOOM/NaN) or masked pixel in the aperture, an
aperture hanging off the cutout, or no usable sky, is dropped and counted, never guessed. No aperture correction: r=3 px
holds 98.7-100% of the cutouts' own EPSF, and against IRSA the residual offset is +0.2%, so none is needed at this level.
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
