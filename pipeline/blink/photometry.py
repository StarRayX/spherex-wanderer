"""Forced aperture photometry on single SPHEREx frames, and light curves at ONE wavelength. See PHOTOMETRY_NOTES.md.

A frame's sum is only a brightness if no pixel in the aperture is saturated (OVERFLOW or BLOOM, or a NaN core) or
otherwise masked: a lost core pixel is half the flux of an undersampled star, so such frames are flagged and
light_curve drops them. Frames at different wavelengths are never mixed: light_curve keeps only frames within tol_um
of one wavelength and refuses frames from more than one detector.
"""
import numpy as np
from astropy.io import fits
from astropy.stats import mad_std
from astropy.time import Time
from astropy.wcs import WCS

from blink.stack import BAD_FLAGS, SATURATED, wavelength_at

PIX_SR = (6.15 / 206264.806) ** 2   # 6.15 arcsec pixel = 8.890e-10 sr
MJY_PER_PIX = 1e9 * PIX_SR          # 1 MJy/sr over one pixel = 0.8890 mJy
BLOOM = 1 << 26
SAT = SATURATED | BLOOM             # OVERFLOW (bit 1) or BLOOM (bit 26): the star's own charge overflowed


def _load(src):
    """(image MJy/sr, variance, flags, wcs, path or None) from a cutout path or an (img, var, flags, wcs) tuple."""
    if isinstance(src, tuple):
        return (*(np.asarray(a, float) for a in src[:2]), np.asarray(src[2], np.int64), src[3], None)
    with fits.open(src) as h:
        return (h["IMAGE"].data.astype(float), h["VARIANCE"].data.astype(float), h["FLAGS"].data.astype(np.int64),
                WCS(h["IMAGE"].header), src)


def aperture_flux(src, ra, dec, r_ap_pix=3.0, sky_inner=5.0, sky_outer=8.0):
    """Forced aperture sum at (ra, dec) minus the median of a local sky annulus, in mJy. No aperture correction.

    Pixels with a BAD_FLAGS bit, OVERFLOW/BLOOM, or a non-finite value are left out of both aperture and annulus.
    err_mjy: from VARIANCE plus the sky-median error. scatter_mjy: empirical, the annulus pixel scatter (MAD) scaled
    to the aperture, same sky term. saturated: any OVERFLOW/BLOOM/NaN pixel in the aperture; masked: pixels dropped.
    """
    img, var, flags, w, path = _load(src)
    x, y = w.world_to_pixel_values(ra, dec)
    yy, xx = np.indices(img.shape)
    d = np.hypot(xx - x, yy - y)
    sat = (flags & SAT != 0) | ~np.isfinite(img)
    bad = sat | (flags & BAD_FLAGS != 0) | ~np.isfinite(var)
    ap, ring = d <= r_ap_pix, (d >= sky_inner) & (d <= sky_outer) & ~bad
    good = ap & ~bad
    # under 10 usable sky pixels (cutout edge, or a saturated star masking everything): flux is NaN, never a guess
    sky, sky_sd = (np.median(img[ring]), mad_std(img[ring])) if ring.sum() >= 10 else (np.nan, np.nan)
    sky_err = good.sum() * 1.2533 * sky_sd / np.sqrt(ring.sum())  # error of a median, times pixels summed
    return dict(flux_mjy=float((img[good] - sky).sum() * MJY_PER_PIX),
                err_mjy=float(np.sqrt(var[good].sum() + sky_err ** 2) * MJY_PER_PIX),
                scatter_mjy=float(np.sqrt(good.sum() * sky_sd ** 2 + sky_err ** 2) * MJY_PER_PIX),
                saturated=bool((ap & sat).any()), n_saturated=int((ap & sat).sum()), n_masked=int((ap & bad).sum()),
                n_aperture=int(ap.sum()), sky_mjysr=float(sky), x=float(x), y=float(y),
                wavelength_um=wavelength_at(path, ra, dec) if path else None)


def light_curve(frames, ra, dec, wave_um=None, tol_um=None, **ap):
    """Per-frame fluxes at one wavelength. frames: cutout paths (one detector). wave_um: the common wavelength
    (default: median of the frames' wavelengths at the star); tol_um default wave_um/80, half a channel at R=40
    (D1-D4; D5/D6 have R about 120, pass a tighter tol). Frames outside the tolerance, saturated, with masked
    aperture pixels or no usable sky are dropped and counted. Rows: date, mjd, wavelength_um, flux_mjy, err_mjy, scatter_mjy, path."""
    dets = set()
    rows = []
    for p in frames:
        with fits.open(p) as h:
            dets.add(h["IMAGE"].header["DETECTOR"])
            mjd = float(h["IMAGE"].header["MJD-AVG"])
        rows.append(dict(path=str(p), mjd=mjd, date=Time(mjd, format="mjd").iso[:10], **aperture_flux(p, ra, dec, **ap)))
    if len(dets) > 1:
        raise ValueError(f"frames from detectors {sorted(dets)}: one light curve is one wavelength, split them")
    wl = np.array([r["wavelength_um"] for r in rows])
    wave_um = float(np.median(wl)) if wave_um is None else wave_um
    tol_um = wave_um / 80 if tol_um is None else tol_um
    off = np.abs(wl - wave_um) > tol_um
    sat = np.array([r["saturated"] for r in rows]) & ~off
    msk = np.array([r["n_masked"] > 0 or not np.isfinite(r["flux_mjy"]) for r in rows]) & ~off & ~sat
    keep = [{k: r[k] for k in ("date", "mjd", "wavelength_um", "flux_mjy", "err_mjy", "scatter_mjy", "path")}
            for r, o, s, m in zip(rows, off, sat, msk) if not (o or s or m)]
    return dict(wave_um=wave_um, tol_um=tol_um, rows=sorted(keep, key=lambda r: r["mjd"]),
                dropped_wavelength=int(off.sum()), dropped_saturated=int(sat.sum()), dropped_masked=int(msk.sum()))
