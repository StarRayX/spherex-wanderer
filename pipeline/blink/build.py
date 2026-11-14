"""One target end to end: query, pick frames, fetch, stack, measure, render. Used by scripts/build_showcase.py and api/.

Rules kept from the Barnard build: cutouts are fetched at the star's propagated position (proper motion, no parallax:
it is under 0.6 arcsec and keeps cache keys stable), and a run refuses to start when its estimated new download
exceeds max_mb.
"""
from collections import Counter

import numpy as np
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS
from astropy.wcs.utils import proj_plane_pixel_area

from blink import fetch
from blink.measure import centroid, fit_motion
from blink.query import find_frames, group_visits, parallax_offset, propagate
from blink.render import PIXEL_SCALE, render_target
from blink.stack import BAD_FLAGS, SATURATED, stack_visit, target_wcs, wavelength_at

SNR_MIN, MAX_OFFSET_PX = 5.0, 1.5  # detection: forced S/N at the predicted spot and the centre within 1.5 px of it
AP_R = 3.0  # photometry aperture radius, px


class BudgetError(RuntimeError):
    pass


def robust_std(x):
    """1.4826 x MAD: one cosmic ray or satellite pixel in a ring must not inflate the noise (it did, Eps Indi B)."""
    x = np.asarray(x, float)
    x = x[np.isfinite(x)]
    return float(1.4826 * np.median(np.abs(x - np.median(x))))


def _r2(c):
    """JSON-safe 2-decimal float (NaN -> None)."""
    return round(float(c), 2) if np.isfinite(c) else None


def cutout_mb(size_arcmin):
    """Estimated MB per cutout: the EPSF table (~3.8 MB) dominates; 2' measured 3.95 MB, 10' 5.2 MB."""
    return 4.0 + 0.012 * size_arcmin ** 2


def check_budget(n_new, mb_each, limit):
    est = n_new * mb_each
    print(f"planned {n_new} new cutouts, about {est:.0f} MB (limit {limit} MB)")
    if est > limit:
        raise BudgetError(f"refusing: estimate {est:.0f} MB exceeds {limit} MB")
    return est


def split_long(visits, max_span=60, bin_days=30):
    """Fields near the ecliptic poles are seen almost continuously: cut any 'visit' longer than max_span days
    into bin_days bins, so a visit stays a short stretch of time."""
    out = []
    for v in visits:
        if v[-1]["mjd"] - v[0]["mjd"] <= max_span:
            out.append(v)
            continue
        bins = {}
        for f in v:
            bins.setdefault(int((f["mjd"] - v[0]["mjd"]) // bin_days), []).append(f)
        out += [bins[k] for k in sorted(bins)]
    return out


def plan(frames, band, frames_per_visit, max_frames, ra=None, dec=None, match_wavelength=False, target_um=None):
    """Choose (band, visits): one band, at most max_frames frames, visits spread evenly over time if there are
    too many, and per visit frames_per_visit frames spread in time (or closest in wavelength to target_um,
    default the median over visits, via blink.select)."""
    band = band or Counter(f["band"] for f in frames).most_common(1)[0][0]
    visits = []
    for v in split_long(group_visits(frames)):
        fr = [f for f in v if f["band"] == band]
        if fr:
            visits.append(fr)
        else:
            print(f"visit starting mjd {v[0]['mjd']:.1f}: no {band} frames, skipped")
    n_vis = max(1, max_frames // frames_per_visit)
    if len(visits) > n_vis:
        visits = [visits[i] for i in np.linspace(0, len(visits) - 1, n_vis).round().astype(int)]
    if match_wavelength:
        from blink.select import pick_frames
        picked, _, target = pick_frames(visits, ra, dec, frames_per_visit, target_um)
        print(f"wavelength-matched to {target:.3f} um")
        return band, [sorted(v, key=lambda f: f["mjd"]) for v in picked]
    out = []
    for fr in visits:
        idx = sorted(set(np.linspace(0, len(fr) - 1, min(frames_per_visit, len(fr))).round().astype(int)))
        out.append([fr[i] for i in idx])
    return band, out


def _ring(shape, x, y):
    n = min(shape)
    yy, xx = np.indices(shape)
    d = np.hypot(xx - x, yy - y)
    return d, (d > 0.33 * n) & (d < 0.44 * n)


def frame_position(path, ra, dec, bad=BAD_FLAGS):
    """Star (ra, dec) from one frame on its own pixel grid and WCS: no reprojection, own background ring."""
    with fits.open(path) as h:
        img = h["IMAGE"].data.astype(float)
        img[h["FLAGS"].data & bad != 0] = np.nan
        w = WCS(h["IMAGE"].header)
    x0, y0 = w.world_to_pixel_values(ra, dec)
    _, ring = _ring(img.shape, x0, y0)
    x, y = centroid(img - np.nanmedian(img[ring]), float(x0), float(y0))
    return (np.nan, np.nan) if not np.isfinite(x) else tuple(float(c) for c in w.pixel_to_world_values(x, y))


def flag_bits(path, ra, dec):
    """Set of FLAGS bits on the 3x3 pixels around the star."""
    with fits.open(path) as h:
        x, y = (int(round(float(c))) for c in WCS(h["IMAGE"].header).world_to_pixel_values(ra, dec))
        v = np.bitwise_or.reduce(h["FLAGS"].data[max(y - 1, 0):y + 2, max(x - 1, 0):x + 2].astype(np.int64).ravel())
    return {b for b in range(32) if v >> b & 1}


def aperture(path, ra, dec, r=AP_R):
    """Forced aperture sum at (ra, dec) on the native frame, local sky annulus, flagged/saturated pixels left out.
    Returns (mJy, VARIANCE-based 1-sigma mJy, masked pixels in the aperture, aperture pixels). No aperture correction."""
    with fits.open(path) as h:
        img, var = h["IMAGE"].data.astype(float), h["VARIANCE"].data.astype(float)
        bad = (h["FLAGS"].data & (BAD_FLAGS | SATURATED) != 0) | ~np.isfinite(img) | ~np.isfinite(var)
        w = WCS(h["IMAGE"].header)
    x0, y0 = w.world_to_pixel_values(ra, dec)
    d, ring = _ring(img.shape, x0, y0)
    ring &= ~bad
    ap = d <= r
    good = ap & ~bad
    sky = np.median(img[ring])
    sky_err = robust_std(img[ring]) / np.sqrt(ring.sum())
    k = proj_plane_pixel_area(w) * (np.pi / 180) ** 2 * 1e9  # MJy/sr x pixel -> mJy
    s = (img[good] - sky).sum()
    e = np.sqrt(var[good].sum() + (good.sum() * sky_err) ** 2)
    return float(s * k), float(e * k), int((ap & bad).sum()), int(ap.sum())


def snr_at(img, x, y, r=2.0):
    """Forced S/N in a radius-r aperture at (x, y) of a background-subtracted stack; noise from the stack's own ring.
    If over half the aperture is masked (a saturated core, e.g. R Dra), widen to r=4.5 so the wings count."""
    yy, xx = np.indices(img.shape)
    _, ring = _ring(img.shape, (img.shape[1] - 1) / 2, (img.shape[0] - 1) / 2)
    d = np.hypot(xx - x, yy - y)
    if np.isfinite(img[d <= r]).mean() < 0.5:
        r = 4.5
    ap = (d <= r) & np.isfinite(img)
    return float(np.nansum(img[ap]) / (robust_std(img[ring]) * np.sqrt(ap.sum())))


def build_target(slug, ra, dec, astrometry, out_dir, band=None, max_mb=100, frames_per_visit=3, size_arcmin=2.0,
                 progress=None, *, match_wavelength=False, target_um=None):
    """Build out_dir/visit_NN.png + meta.json for one sky position; returns the meta dict.

    astrometry: {ra, dec, pmra, pmdec (mas/yr, pmra with cos dec), parallax (mas), epoch_from (Julian yr)} or None
    for a static position at (ra, dec). match_wavelength: pick frames per visit by wavelength at the star (blink.select),
    closest to target_um (default: median over visits).
    """
    say = progress or (lambda d, t, m="": None)
    a = dict(astrometry) if astrometry else None
    if a and not (a.get("parallax") or 0) > 0:
        a["parallax"] = 1e-3  # unknown: treat as 1 Mpc away, effectively no parallax (propagate needs a distance)

    def pos(mjd):
        mjd = np.atleast_1d(mjd)
        if not a:
            return np.full(mjd.shape, float(ra)), np.full(mjd.shape, float(dec))
        return propagate(**a, mjd=mjd)

    def pos_cutout(mjd):
        r_, d_ = pos(mjd)
        if not a:
            return r_, d_
        pr, pd = parallax_offset(mjd, r_, d_, a["parallax"])
        return r_ - pr / 3600 / np.cos(np.radians(d_)), d_ - pd / 3600

    say(0, 1, "finding SPHEREx frames")
    ra0, dec0 = (float(c[0]) for c in pos(60800.0 + (61318 - 60800) / 2))
    frames = find_frames(ra0, dec0)
    if not frames:
        raise ValueError(f"no SPHEREx frames cover {ra0:.5f}, {dec0:+.5f}")
    mb_each = cutout_mb(size_arcmin)
    band, visits = plan(frames, band, frames_per_visit, int(max_mb // mb_each), ra0, dec0, match_wavelength, target_um)
    if not visits:
        raise ValueError(f"no {band} frames")
    jobs = []
    for v in visits:
        cra, cdec = pos_cutout([f["mjd"] for f in v])
        jobs.append([(f["url"], float(r_), float(d_), size_arcmin) for f, r_, d_ in zip(v, cra, cdec)])
    n_new = sum(not fetch.cache_path(*j).exists() for js in jobs for j in js)
    print(f"{slug}: {band}, {len(visits)} visits, {sum(map(len, visits))} frames ({n_new} not cached)")
    check_budget(n_new, mb_each, max_mb)
    before = set(fetch.CACHE.glob("*.fits"))

    size_px = int(round(size_arcmin * 60 / PIXEL_SCALE)) | 1
    mm = [float(np.mean([f["mjd"] for f in v])) for v in visits]
    gra, gdec = (float(c[0]) for c in pos(mm[len(mm) // 2]))
    w = target_wcs(gra, gdec, size_px)
    total = len(visits) + 1
    vis, phot, pos_rows, used = [], [], [], []
    for i, (v, js, m) in enumerate(zip(visits, jobs, mm)):
        say(i, total, f"visit {i + 1}/{len(visits)}: fetching {len(v)} frames")
        paths = fetch.fetch_many(js)
        used += paths
        fra, fdec = pos([f["mjd"] for f in v])  # star at each frame's own date
        pra, pdec = (float(c[0]) for c in pos(m))
        img, _ = stack_visit(paths, gra, gdec, size_px)
        px, py = (float(c) for c in w.world_to_pixel_values(pra, pdec))
        wls = [wavelength_at(p, float(r_), float(d_)) for p, r_, d_ in zip(paths, fra, fdec)]
        for f, wl in zip(v, wls):
            if not f["em_min"] * 1e6 - 0.01 <= wl <= f["em_max"] * 1e6 + 0.01:
                print(f"WARNING: wavelength {wl:.3f} um outside the frame's band {f['em_min'] * 1e6:.2f}-{f['em_max'] * 1e6:.2f}")
        snr = snr_at(img, px, py)
        cx, cy = centroid(img, px, py)
        detected = bool(snr >= SNR_MIN and np.isfinite(cx) and np.hypot(cx - px, cy - py) <= MAX_OFFSET_PX)
        sra = sdec = np.nan
        sem, frame_off = (np.nan, np.nan), []
        if detected:  # per-frame fit on each frame's own WCS, carried to the visit's mean date along the track, averaged
            fp = np.array([frame_position(p, float(r_), float(d_)) for p, r_, d_ in zip(paths, fra, fdec)])
            fp = fp + np.stack([pra - fra, pdec - fdec], axis=1)
            if np.isfinite(fp).all(axis=1).any():
                sra, sdec = np.nanmean(fp, axis=0)
                # frame offsets from the visit mean (arcsec) and the standard error of that mean, per axis
                off = (fp - [sra, sdec]) * [np.cos(np.radians(sdec)) * 3600, 3600]
                frame_off = [[_r2(c) for c in o] for o in off]
                n = np.isfinite(off[:, 0]).sum()
                if n > 1:
                    sem = tuple(float(s) for s in np.nanstd(off, axis=0, ddof=1) / np.sqrt(n))
        ok = bool(np.isfinite(sra))
        bits = [flag_bits(p, float(r_), float(d_)) for p, r_, d_ in zip(paths, fra, fdec)]
        allbits = sorted(set().union(*bits))
        fl = f"{sum(map(bool, bits))}/{len(bits)} frames, bits {allbits}" if allbits else "none"
        if not ok:
            fl = f"not detected: S/N {snr:.1f} at the predicted position (need {SNR_MIN:g} within {MAX_OFFSET_PX} px); flags {fl}"
        sx, sy = (float(c) for c in w.world_to_pixel_values(sra, sdec)) if ok else (None, None)
        date = Time(m, format="mjd").iso[:10]
        vis.append(dict(image=img, date=date, mjd=m, band=band, wavelength_um=float(np.mean(wls)),
                        wavelength_min_um=min(wls), wavelength_max_um=max(wls), flags_summary=fl,
                        predicted_xy=[px, py], star_xy=[sx, sy] if ok else None, frame_offsets_arcsec=frame_off))
        ph = [aperture(p, float(r_), float(d_)) for p, r_, d_ in zip(paths, fra, fdec)]
        ok = [q for q in ph if not q[2]] or ph  # frames with nothing masked in the aperture; else all (lower limits)
        s = np.array([q[0] for q in ok])
        phot.append(dict(date=date, mjd=m, band=band, wavelength_min_um=min(wls), wavelength_max_um=max(wls),
                         aperture_mjy=float(s.mean()), error_mjy=float(np.sqrt(sum(q[1] ** 2 for q in ok)) / len(ok)),
                         scatter_mjy=float(s.std(ddof=1)) if len(ok) > 1 else None, frames_used=len(ok),
                         masked_pixels=sum(q[2] for q in ph), lower_limit=bool(ok[0][2]), aperture_pixels=sum(q[3] for q in ph),
                         snr_stack=snr,
                         frames=[dict(mjd=f["mjd"], wavelength_um=wl, aperture_mjy=q[0], error_mjy=q[1], masked_pixels=q[2])
                                 for f, wl, q in zip(v, wls, ph)]))
        pos_rows.append((m, sra, sdec, *sem))
        print(f"  {date} n={len(v)} wl {min(wls):.2f}-{max(wls):.2f} S/N {snr:.1f} star_xy {sx and round(sx, 2)},{sy and round(sy, 2)} "
              f"pred {px:.2f},{py:.2f} ap {s.mean():.3g} mJy masked {phot[-1]['masked_pixels']}")

    motion, notes = None, []
    good = np.array([r for r in pos_rows if np.isfinite(r[1])])
    if a and len(good):
        span = (good[:, 0].max() - good[:, 0].min()) / 365.25
        drift = np.hypot(a["pmra"], a["pmdec"]) / 1000 * span
        if len(good) >= 3 and drift >= 0.5 * PIXEL_SCALE:
            motion = _motion(good, gra, gdec, a, pos)
            motion["frame_offsets_arcsec"] = [v["frame_offsets_arcsec"] for v in vis if v["star_xy"] is not None]
            motion["visit_sem_arcsec"] = [[_r2(c) for c in r[3:]] for r in good]
            if abs(motion["measured_arcsec_per_yr"]) < 3 * motion["error_arcsec_per_yr"]:
                notes.append("Measured drift is below 3 sigma: no motion claim.")
        else:
            notes.append(f"No motion fit: {len(good)} detected visits, expected drift {drift:.1f} arcsec over the "
                         f"detected span (need 3 visits and half a pixel, {0.5 * PIXEL_SCALE:.1f} arcsec).")
    miss = [v["date"] for v in vis if v["star_xy"] is None]
    if miss:
        notes.append(f"Not detected in {len(miss)} of {len(vis)} visits ({', '.join(miss)}): no star marker is drawn there.")
    notes.append("Each frame saw a different wavelength at the star's pixel (ranges per visit); a brightness change "
                 "between visits mixes real change with colour. Not a light curve.")
    sat = [p["date"] for p in phot if p["lower_limit"]]
    if any(p["masked_pixels"] for p in phot):
        notes.append("Per visit, only frames with no masked pixel in the aperture are averaged (frames_used); "
                     f"{len(sat)} visits had none, so their sums are lower limits.")
    if any(p["scatter_mjy"] and p["scatter_mjy"] > 5 * p["error_mjy"] for p in phot):
        notes.append("Frame-to-frame scatter within a visit (scatter_mjy) is far above the VARIANCE error: "
                     "the error bars understate the real uncertainty.")
    worst = max(p["masked_pixels"] / p["aperture_pixels"] for p in phot)
    if worst > 0.2:
        notes.append(f"Up to {worst:.0%} of aperture pixels are masked (saturated core): these sums do NOT measure "
                     "brightness and must not be compared between visits.")
    notes.append(f"Photometry: forced {AP_R:g} px ({AP_R * PIXEL_SCALE:.1f} arcsec) radius aperture sum on each frame, "
                 "local sky annulus, VARIANCE errors, no aperture correction, mean per visit.")
    new = set(fetch.CACHE.glob("*.fits")) - before
    mb = sum(p.stat().st_size for p in new) / 1e6
    print(f"new MB downloaded: {mb:.1f}")
    say(len(visits), total, "rendering")
    meta = render_target(slug, vis, out_dir, motion, extra=dict(
        detected=[v["star_xy"] is not None for v in vis], photometry=phot, notes=notes,
        cutouts_mb=round(sum(p.stat().st_size for p in used) / 1e6, 1), size_arcmin=size_arcmin, frames_per_visit=frames_per_visit,
        frame_selection="wavelength" if match_wavelength else "time"))
    say(total, total, "done")
    return meta


def _motion(good, gra, gdec, a, pos):
    """Straight-line drift per axis vs Gaia, raw and with the parallax shift removed. Main axis = larger Gaia pm."""
    m_, ra_, dec_, e_ra, e_dec = good.T
    d = {"ra": (ra_ - gra) * np.cos(np.radians(gdec)) * 3600, "dec": (dec_ - gdec) * 3600}
    err = {"ra": e_ra, "dec": e_dec}  # per-visit standard error from the frame-to-frame scatter (nan if one frame)
    pr, pd = parallax_offset(m_, gra, gdec, a["parallax"])
    corr = {"ra": d["ra"] - pr, "dec": d["dec"] - pd}
    gaia = {"ra": a["pmra"] / 1000, "dec": a["pmdec"] / 1000}
    fits_ = {k: (fit_motion(m_, d[k], err[k]), fit_motion(m_, corr[k], err[k])) for k in d}
    gr, gd = pos(m_)
    res = [[float(d["ra"][k] - (gr[k] - gra) * np.cos(np.radians(gdec)) * 3600), float(d["dec"][k] - (gd[k] - gdec) * 3600)]
           for k in range(len(m_))]
    for k, ((r1, e1), (r2, e2)) in fits_.items():
        print(f"  motion {k}: raw {r1:.2f} +/- {e1:.2f}, parallax-corrected {r2:.2f} +/- {e2:.2f}, Gaia {gaia[k]:.2f} arcsec/yr")
    print("  residual vs Gaia (RA, Dec) arcsec: " + "; ".join(f"{x:+.2f},{y:+.2f}" for x, y in res))
    ax = "dec" if abs(a["pmdec"]) >= abs(a["pmra"]) else "ra"
    (r1, e1), (r2, e2) = fits_[ax]
    return dict(measured_arcsec_per_yr=float(r1), error_arcsec_per_yr=float(e1), gaia_arcsec_per_yr=gaia[ax], axis=ax,
                parallax_corrected=dict(measured_arcsec_per_yr=float(r2), error_arcsec_per_yr=float(e2)),
                per_axis={k: dict(measured_arcsec_per_yr=float(f[0][0]), error_arcsec_per_yr=float(f[0][1]),
                                  gaia_arcsec_per_yr=gaia[k]) for k, f in fits_.items()},
                residuals_vs_gaia_arcsec=res, visits_used=len(m_))
