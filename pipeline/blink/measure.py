"""Step 6: iterative centroid and straight-line motion fit."""
import numpy as np
from scipy.optimize import least_squares
from scipy.special import erf
from scipy.stats import linregress


def _psf(p, xx, yy):
    """Pixel-integrated circular Gaussian: p = (x, y, flux, sigma, sky)."""
    x, y, a, s, b = p
    e = lambda c, c0: erf((c + .5 - c0) / (s * 2**.5)) - erf((c - .5 - c0) / (s * 2**.5))
    return b + a * e(xx, x) * e(yy, y) / 4


def fit_star(img, x0, y0, r=4.5, passes=3):
    """Gaussian fit to the finite pixels within r of the guess (re-windowed each pass).

    Works when the core is NaN (saturated, masked): only the wings are used, so no bias from the lost core.
    """
    yy, xx = np.indices(img.shape)
    x, y = float(x0), float(y0)
    for _ in range(passes):
        m = (np.hypot(xx - x, yy - y) <= r) & np.isfinite(img)
        if m.sum() < 8:
            return np.nan, np.nan
        z = img[m]
        res = least_squares(lambda p: _psf(p, xx[m], yy[m]) - z, [x, y, z.sum() * 3, 1.0, 0.0],
                            x_scale='jac', xtol=1e-12, ftol=1e-12, bounds=([x - 2, y - 2, 0, 0.5, -np.inf], [x + 2, y + 2, np.inf, 2.5, np.inf]))
        x, y = res.x[:2]
    return float(x), float(y)


def centroid(img, x0, y0, r=3.5, n_iter=30):
    """Intensity-weighted centroid in a circle of radius r, re-centred each pass until it stops moving.

    Sky = median of an annulus (2r..3r) around the current centre. NaNs ignored.
    If the core is masked (NaN within r of the guess, e.g. a saturated star) a centroid would be biased,
    so fall back to fit_star on the wings.
    """
    yy, xx = np.indices(img.shape)
    if np.isnan(img[np.hypot(xx - x0, yy - y0) <= 1.5]).any():
        return fit_star(img, x0, y0)
    x, y = float(x0), float(y0)
    for _ in range(n_iter):
        d = np.hypot(xx - x, yy - y)
        sky = np.nanmedian(img[(d > 2 * r) & (d < 3 * r)])
        w = np.where((d <= r) & np.isfinite(img), img - sky, 0.0).clip(0)
        if w.sum() <= 0:
            return np.nan, np.nan
        nx, ny = (w * xx).sum() / w.sum(), (w * yy).sum() / w.sum()
        done = np.hypot(nx - x, ny - y) < 1e-3
        x, y = nx, ny
        if done:
            break
    return x, y


def fit_motion(mjds, offsets_arcsec):
    """Straight line through offsets vs time. Returns (rate arcsec/yr, 1-sigma error)."""
    # ponytail: error from scatter about the line only; ignores per-frame error bars and parallax
    f = linregress(np.asarray(mjds) / 365.25, offsets_arcsec)
    return f.slope, f.stderr
