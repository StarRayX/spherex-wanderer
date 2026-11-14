"""Build web/public/showcase/barnards-star/ end to end. Run from pipeline/: python scripts/build_showcase.py"""
import sys
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.time import Time
from astropy.wcs import WCS

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from blink import fetch  # noqa: E402
from blink.measure import centroid, fit_motion  # noqa: E402
from blink.query import BARNARD, find_frames, group_visits, parallax_offset, propagate  # noqa: E402
from blink.render import render_target  # noqa: E402
from blink.stack import BAD_FLAGS, stack_visit, target_wcs, wavelength_at  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "web" / "public" / "showcase" / "barnards-star"
BAND, PER_VISIT, SIZE_ARCMIN, SIZE_PX, MB_EACH, MB_LIMIT = "SPHEREx-D4", 3, 2, 21, 4.0, 100
BAND_UM = (2.42, 3.82)
B = {k: v for k, v in BARNARD.items() if k not in ("ra", "dec")}


def pos(mjd):
    """Gaia star position (deg arrays) at mjd."""
    return propagate(BARNARD["ra"], BARNARD["dec"], **B, mjd=mjd)


def pos_cutout(mjd):
    """Gaia position without parallax: where the cutouts are centred (keeps the download cache keys, 0.5 arcsec is nothing on 2 arcmin)."""
    ra, dec = pos(mjd)
    pr, pd = parallax_offset(mjd, ra, dec, BARNARD["parallax"])
    return ra - pr / 3600 / np.cos(np.radians(dec)), dec - pd / 3600


def sky_to_pix(w, ra, dec):
    x, y = w.world_to_pixel_values(ra, dec)
    return float(x), float(y)


def pix_to_sky(w, x, y):
    ra, dec = w.pixel_to_world_values(x, y)
    return float(ra), float(dec)


def select_frames(visits, band=BAND, cap=PER_VISIT):
    """Per visit: only `band` frames, at most `cap`, spread over the visit's time span. Empty visits are dropped (and said)."""
    out = []
    for v in visits:
        fr = [f for f in v if f["band"] == band]
        if not fr:
            print(f"visit starting mjd {v[0]['mjd']:.1f}: no {band} frames, skipped")
            continue
        idx = sorted(set(np.linspace(0, len(fr) - 1, min(cap, len(fr))).round().astype(int)))
        out.append([fr[i] for i in idx])
    return out


def check_budget(n, mb_each=MB_EACH, limit=MB_LIMIT):
    est = n * mb_each
    print(f"planned {n} cutouts, about {est:.0f} MB")
    if est > limit:
        raise SystemExit(f"refusing: estimate {est:.0f} MB exceeds {limit} MB")
    return est


def frame_position(path, ra, dec, bad=BAD_FLAGS):
    """Star (ra, dec) from one frame on its own pixel grid and WCS: no reprojection, own background ring."""
    with fits.open(path) as h:
        img = h["IMAGE"].data.astype(float)
        img[h["FLAGS"].data & bad != 0] = np.nan
        w = WCS(h["IMAGE"].header)
    x0, y0 = w.world_to_pixel_values(ra, dec)
    yy, xx = np.indices(img.shape)
    d = np.hypot(xx - x0, yy - y0)
    img = img - np.nanmedian(img[(d > 6.3) & (d < 8.4)])
    x, y = centroid(img, float(x0), float(y0))
    return (np.nan, np.nan) if not np.isfinite(x) else tuple(float(c) for c in w.pixel_to_world_values(x, y))


def flag_bits(path, ra, dec):
    """Set of FLAGS bits on the 3x3 pixels around the star."""
    with fits.open(path) as h:
        x, y = (int(round(float(c))) for c in WCS(h["IMAGE"].header).world_to_pixel_values(ra, dec))
        v = np.bitwise_or.reduce(h["FLAGS"].data[max(y - 1, 0):y + 2, max(x - 1, 0):x + 2].astype(np.int64).ravel())
    return {b for b in range(32) if v >> b & 1}


def main():
    ra0, dec0 = pos(60800.0 + (61318 - 60800) / 2)
    fr = find_frames(float(ra0[0]), float(dec0[0]))
    visits = select_frames(group_visits(fr))
    check_budget(sum(map(len, visits)))
    size0 = sum(p.stat().st_size for p in fetch.CACHE.glob("*.fits")) if fetch.CACHE.exists() else 0
    nreq = [1]  # the TAP query
    orig = fetch._get
    fetch._get = lambda *a, **k: (nreq.__setitem__(0, nreq[0] + 1), orig(*a, **k))[1]

    mm = [float(np.mean([f["mjd"] for f in v])) for v in visits]
    gra, gdec = (float(a[0]) for a in pos(mm[len(mm) // 2]))
    w = target_wcs(gra, gdec, SIZE_PX)
    rows, vis, frame_pos, stk = [], [], [], []
    for v, m in zip(visits, mm):
        fra, fdec = pos([f["mjd"] for f in v])  # star at each frame's own date
        cra, cdec = pos_cutout([f["mjd"] for f in v])  # cutouts centred on it
        paths = fetch.fetch_many([(f["url"], float(a), float(d), SIZE_ARCMIN) for f, a, d in zip(v, cra, cdec)])
        pra, pdec = (float(a[0]) for a in pos(m))
        img, _ = stack_visit(paths, gra, gdec, SIZE_PX)
        px, py = sky_to_pix(w, pra, pdec)
        wls = [wavelength_at(p, float(a), float(d)) for p, a, d in zip(paths, fra, fdec)]
        wl = float(np.mean(wls))
        # per-frame method: fit each frame on its own WCS, carry it to the visit's mean date along the Gaia track, average
        fp = np.array([frame_position(p, float(a), float(d)) for p, a, d in zip(paths, fra, fdec)])
        fp = fp + np.stack([pra - fra, pdec - fdec], axis=1)
        frame_pos.append(np.nanmean(fp, axis=0) if np.isfinite(fp).any() else (np.nan, np.nan))
        bits = [flag_bits(p, float(a), float(d)) for p, a, d in zip(paths, fra, fdec)]
        sx, sy = centroid(img, px, py)  # stacked-image centroid: compared against, not shipped
        stk.append(pix_to_sky(w, sx, sy) if np.isfinite(sx) else (np.nan, np.nan))
        sra, sdec = frame_pos[-1]  # shipped: mean of per-frame positions (smaller residuals vs Gaia)
        ok = bool(np.isfinite(sra))
        sx, sy = sky_to_pix(w, sra, sdec) if ok else (np.nan, np.nan)
        allbits = sorted(set().union(*bits))
        fl = f"{sum(map(bool, bits))}/{len(bits)} frames, bits {allbits}" if allbits else "none"
        date = Time(m, format="mjd").iso[:10]
        vis.append(dict(image=img, date=date, mjd=m, band=BAND, wavelength_um=wl, wavelength_min_um=min(wls), wavelength_max_um=max(wls), flags_summary=fl,
                        predicted_xy=[px, py], star_xy=[sx, sy] if ok else None))
        rows.append((date, len(v), (min(wls), wl, max(wls)), (px, py), (sx, sy) if ok else None, fl, sra, sdec))
        if not (BAND_UM[0] <= min(wls) and max(wls) <= BAND_UM[1]):
            print(f"WARNING: wavelength {wl:.3f} um outside {BAND} range {BAND_UM}")

    def report(name, ra_, dec_):
        """Print Dec/RA fits (raw and parallax-corrected) and per-visit residuals vs the full Gaia prediction."""
        d_dec = (dec_ - gdec) * 3600
        d_ra = (ra_ - gra) * np.cos(np.radians(gdec)) * 3600
        pr, pd = parallax_offset(m_, gra, gdec, BARNARD["parallax"])
        out = [fit_motion(m_, d_dec), fit_motion(m_, d_ra), fit_motion(m_, d_dec - pd), fit_motion(m_, d_ra - pr)]
        print(f"[{name}] {len(m_)} visits, arcsec/yr (Gaia Dec {BARNARD['pmdec'] / 1000:.2f}, RA {BARNARD['pmra'] / 1000:.2f})")
        for lab, (r_, e_) in zip(("Dec raw", "RA raw", "Dec parallax-corr", "RA parallax-corr"), out):
            print(f"   {lab}: {r_:.2f} +/- {e_:.2f}")
        gr, gd = pos(m_)
        print("   residual vs Gaia (RA, Dec) arcsec: " + "; ".join(
            f"{(d_ra[k] - (gr[k] - gra) * np.cos(np.radians(gdec)) * 3600):+.2f},{(d_dec[k] - (gd[k] - gdec) * 3600):+.2f}" for k in range(len(m_))))
        return d_ra, d_dec, out

    good = [(m, r[6], r[7], t) for m, r, t in zip(mm, rows, stk) if r[4]]
    m_, ra_, dec_, stk_ = (np.array(c) for c in zip(*good))
    d_ra, d_dec, out = report("per-frame centroids (shipped)", ra_, dec_)
    if np.isfinite(stk_).all():
        report("stacked-image centroid", stk_[:, 0], stk_[:, 1])
    (rate, err), (rrate, rerr) = out[0], out[1]
    for i in range(len(m_)):
        for j in range(i + 1, len(m_)):
            dt = (m_[j] - m_[i]) / 365.25
            if 0.8 < dt < 1.2:  # same season: parallax mostly cancels
                print(f"same-season pair visits {i}-{j} ({dt:.2f} yr): Dec {(d_dec[j] - d_dec[i]) / dt:.2f} arcsec/yr, "
                      f"RA {(d_ra[j] - d_ra[i]) / dt:.2f} arcsec/yr (no error: two points)")
    motion = dict(measured_arcsec_per_yr=rate, error_arcsec_per_yr=err, gaia_arcsec_per_yr=BARNARD["pmdec"] / 1000)
    render_target("barnards-star", vis, OUT, motion)

    print("\nvisit | date | n | wl um | predicted_xy | star_xy | flags")
    for i, (date, n, wl, p, s, fl, _, _) in enumerate(rows):
        print(i, date, n, f"{wl[0]:.2f}-{wl[2]:.2f} (mean {wl[1]:.2f})", tuple(round(c, 2) for c in p), s and tuple(round(c, 2) for c in s), fl, sep=" | ")
    new = sum(p.stat().st_size for p in fetch.CACHE.glob("*.fits")) - size0
    print(f"\nnew MB downloaded: {new / 1e6:.1f}, live requests: {nreq[0]}")


if __name__ == "__main__":
    main()
