"""Step 6: iterative centroid and straight-line motion fit."""
import numpy as np
from scipy.stats import linregress


def centroid(img, x0, y0, r=3.5, n_iter=30):
    """Intensity-weighted centroid in a circle of radius r, re-centred each pass until it stops moving.

    Sky = median of an annulus (2r..3r) around the current centre. NaNs ignored.
    """
    yy, xx = np.indices(img.shape)
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
