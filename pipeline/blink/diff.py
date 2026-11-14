"""A picture of only what changed: visit B minus visit A on one grid. A qualitative aid, not photometry.

Refuses two stacks whose mean wavelengths at the target differ by more than tol_um: every star changes brightness
with wavelength, so a difference of two colours would show "changes" that are only colour.
"""
import numpy as np
from astropy.stats import mad_std


def difference(stack_a, stack_b, wave_a_um=None, wave_b_um=None, tol_um=None, frac=0.1):
    """B - A for two visit stacks (2-D arrays from stack.stack_visit on the same target_wcs grid).

    Each image's background is matched by subtracting its own median before differencing. NaN in either input stays
    NaN. sigma: robust (MAD) sky scatter of the difference. noise per pixel adds frac * the brighter visit: the PSF is
    undersampled, so a static star reprojected from two pointings leaves residuals up to ~17% of its peak (seen on
    cached Barnard D4 frames: 91 false 5-sigma blobs with sky noise alone, 12 with frac=0.1). snr = image / noise:
    > 5 brighter in B, < -5 brighter in A; a moving star gives one of each. A change under ~frac of a star's peak
    cannot be flagged. Wavelengths (um, the visits' mean at the target)
    are checked when given: |a - b| > tol_um (default max/80, half a channel at R=40) raises ValueError.
    """
    a, b = np.asarray(stack_a, float), np.asarray(stack_b, float)
    if a.shape != b.shape:
        raise ValueError(f"grids differ: {a.shape} vs {b.shape}; stack both visits on one target_wcs")
    if wave_a_um is not None and wave_b_um is not None:
        tol_um = max(wave_a_um, wave_b_um) / 80 if tol_um is None else tol_um
        if abs(wave_a_um - wave_b_um) > tol_um:
            raise ValueError(f"visits at {wave_a_um:.3f} and {wave_b_um:.3f} um differ by more than {tol_um:.3f} um: "
                             "a difference of two colours is not a change (build with match_wavelength)")
    a, b = a - np.nanmedian(a), b - np.nanmedian(b)
    d = b - a
    sigma = float(mad_std(d, ignore_nan=True))
    noise = np.hypot(sigma, frac * np.fmax(np.abs(a), np.abs(b)))
    return dict(image=d, sigma=sigma, noise=noise, snr=d / noise, n_masked=int(np.isnan(d).sum()),
                wave_checked=wave_a_um is not None and wave_b_um is not None)
