"""Pick frames per visit that saw the same wavelength at the target, before downloading them.

How (see WAVELENGTH_NOTES.md): a frame's wavelength at a pixel is a fixed per-detector lookup table
(WCS-WAVE, identical in every frame of a detector) evaluated at the detector pixel. The pixel comes
from the obscore s_region, whose 4 corners are the detector corners (-0.5,-0.5), (2039.5,-0.5),
(2039.5,2039.5), (-0.5,2039.5) in that order; a homography through them on the tangent plane
gives the pixel to a few px. So prediction costs nothing per frame; each detector's table costs one
cutout (TABLE_COST_MB) the first time, then lives in the cache as a 6 kB .npz.
"""
import numpy as np
from astropy.io import fits
from scipy.interpolate import RegularGridInterpolator

from blink import fetch

SHIPPED = fetch.Path(__file__).resolve().parents[1] / "data"
TABLE_COST_MB = 4.0  # one smallest cutout (EPSF table dominates, size does not matter)


def _tangent(ra, dec, ra0, dec0):
    """Gnomonic projection of (ra, dec) about (ra0, dec0), degrees in, radians out."""
    a, d, a0, d0 = map(np.radians, (ra, dec, ra0, dec0))
    c = np.sin(d0) * np.sin(d) + np.cos(d0) * np.cos(d) * np.cos(a - a0)
    return np.cos(d) * np.sin(a - a0) / c, (np.cos(d0) * np.sin(d) - np.sin(d0) * np.cos(d) * np.cos(a - a0)) / c


def pixel_from_region(s_region, ra, dec):
    """0-based detector pixel (x, y) of (ra, dec) from an obscore 'POLYGON ICRS ...' footprint."""
    p = np.array(s_region.split()[2:], float).reshape(-1, 2)[:4]
    u, v = _tangent(p[:, 0], p[:, 1], *p.mean(0))
    xy = np.array([(-0.5, -0.5), (2039.5, -0.5), (2039.5, 2039.5), (-0.5, 2039.5)])
    A = [[ui, vi, 1, 0, 0, 0, -ui * x, -vi * x] for ui, vi, (x, _) in zip(u, v, xy)] + \
        [[0, 0, 0, ui, vi, 1, -ui * y, -vi * y] for ui, vi, (_, y) in zip(u, v, xy)]
    h = np.append(np.linalg.solve(A, np.r_[xy[:, 0], xy[:, 1]]), 1).reshape(3, 3)
    q = h @ np.r_[_tangent(ra, dec, *p.mean(0)), 1]
    return q[0] / q[2], q[1] / q[2]


def table_from_cutout(path):
    """(detector, X, Y, VALUES) from a cutout's WCS-WAVE extension."""
    with fits.open(path) as f:
        t = f["WCS-WAVE"].data
        return int(f["IMAGE"].header["DETECTOR"]), t["X"][0], t["Y"][0], t["VALUES"][0]


def wave_table(det, frames=(), ra=None, dec=None, cache_dir=fetch.CACHE):
    """Interpolator (y, x) 0-based -> (wavelength, bandwidth) um for detector det. Looks in the cache;
    on a miss downloads one cutout of a frame on that detector (TABLE_COST_MB)."""
    npz = fetch.Path(cache_dir) / f"wave_D{det}.npz"
    if not npz.exists() and (SHIPPED / npz.name).exists():  # tables committed in pipeline/data, free on a fresh checkout
        npz = SHIPPED / npz.name
    if not npz.exists():
        hit = next((t for p in fetch.Path(cache_dir).glob("*.fits") if (t := table_from_cutout(p))[0] == det), None)
        if hit is None:
            f = next(f for f in frames if f["band"].endswith(str(det)))
            hit = table_from_cutout(fetch.fetch_cutout(f["url"], ra, dec, 0.5, cache_dir))
        np.savez(npz, x=hit[1], y=hit[2], v=hit[3])
    z = np.load(npz)
    # table control points are 1-based raw pixels; VALUES is (y, x, [wave, bandwidth])
    return RegularGridInterpolator((z["y"] - 1.0, z["x"] - 1.0), z["v"], bounds_error=False, fill_value=None)


def predict_wavelength(frames, ra, dec, cache_dir=fetch.CACHE):
    """Wavelength (um) at (ra, dec) for each frame; frames need 's_region' and 'band'."""
    tabs = {}
    out = []
    for f in frames:
        det = int(f["band"][-1])
        if det not in tabs:
            tabs[det] = wave_table(det, frames, ra, dec, cache_dir)
        x, y = pixel_from_region(f["s_region"], ra, dec)
        out.append(float(tabs[det]([y, x])[0][0]))
    return np.array(out)


def pick_frames(frames, ra, dec, n_per_visit, target_um=None, wave=None):
    """Up to n frames per visit whose wavelength at (ra, dec) is closest to target_um.

    frames: list of visits (lists of frame dicts, from query.group_visits) of ONE band.
    wave: optional precomputed wavelengths, same nesting; else predicted from s_region.
    target_um default: the median over visits of each visit's median wavelength, so every visit can
    reach it. Returns (picked visits, their wavelengths, target_um). Each frame dict gains 'wave_um'.
    """
    if wave is None:
        wave = [predict_wavelength(v, ra, dec) for v in frames]
    wave = [np.asarray(w, float) for w in wave]
    if target_um is None:
        target_um = float(np.median([np.median(w) for w in wave if len(w)]))
    picked, pw = [], []
    for v, w in zip(frames, wave):
        i = np.argsort(np.abs(w - target_um), kind="stable")[:n_per_visit]
        picked.append([{**v[k], "wave_um": float(w[k])} for k in i])
        pw.append(w[i])
    return picked, pw, target_um
