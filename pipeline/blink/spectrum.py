"""Validated against IRSA's SPHEREx Spectrophotometry Tool (Tractor PSF-fit forced photometry) for TWO unsaturated, uncrowded
stars near K 10.5 in the Barnard field, 0.76-4.91 um, all six bands: K 10.42 isolated (11/11 points within 3.3%, median
+0.2%) and K 10.57 with an equal-brightness star 5.8 px away in the sky annulus (12/12 within 7.7%, median -0.6%).
NOT validated (failed the 10% bar, see STRETCH_NOTES.md): fainter stars in crowded fields (K 11.2-11.9 read +5 to +12% high,
single points to +24%: faint neighbours IRSA fits separately sit in our aperture), a 5x brighter annulus neighbour (one point
+21%), and near-saturated frames (K 8.6: a D2 frame with TRANSIENT/SUR_ERROR core pixels differs by 40%, the catalogs side
with us there). Saturated frames are dropped, rightly: on Barnard's Star the kept sum is ~57% low and IRSA's fit fails too.
Absolute flux is IRSA's calibration, consistent with 2MASS/AllWISE/Gaia within the ~5% interpolation floor.

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
