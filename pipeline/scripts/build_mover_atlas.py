"""3I/ATLAS spectrophotometry from SPHEREx -> web/public/movers/3i-atlas/.

Run from pipeline/:
    uv run --with astropy --with numpy --with requests --with scipy --with pillow --with reproject --with matplotlib \
        python scripts/build_mover_atlas.py [--seed-dir DIR_OF_OLD_6ARCMIN_CUTOUTS] [--plot PATH.png]

Input: IRSA's table of the 259 frames that contain the comet (obscore_3I_Atlas.vot, comet_ra/comet_dec per frame).
Per frame: a 6 arcmin IBE cutout (cached in pipeline/cache/), a fixed circular aperture at the predicted position,
sky = median of an annulus, flux = sum(MJy/sr) * pixel solid angle (6.15 arcsec pixel -> 889 uJy per MJy/sr).
Wavelength and bandwidth come from the cutout's alternate "W" WCS at the measured pixel.
"""
import argparse
import csv
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from astropy.io import fits
from astropy.io.votable import from_table
from astropy.stats import mad_std
from astropy.table import Table
from astropy.time import Time
from astropy.wcs import WCS
from PIL import Image
from reproject import reproject_interp

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from blink.fetch import cache_path, fetch_cutout  # noqa: E402
from blink.photometry import MJY_PER_PIX  # noqa: E402
from blink.stack import BAD_FLAGS, PIX, target_wcs  # noqa: E402

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "public" / "movers" / "3i-atlas"
CACHE = ROOT / "pipeline" / "cache"
VOT_URL = "https://irsa.ipac.caltech.edu/data/SPHEREx/docs/comet3iatlas/obscore_3I_Atlas.vot"
VOT = CACHE / "atlas3i" / "obscore_3I_Atlas.vot"
SH_URL = "https://irsa.ipac.caltech.edu/data/SPHEREx/docs/comet3iatlas/3IATLASImages-wget.sh"
SH = CACHE / "atlas3i" / "3IATLASImages-wget.sh"
CUT_ARCMIN = 6
R_AP, SKY_IN, SKY_OUT = 4.0, 12.0, 20.0     # pixels of 6.15 arcsec
UJY = MJY_PER_PIX * 1e3                      # uJy per (MJy/sr) summed over pixels
SNR_MIN = 5.0
BAD_AP = BAD_FLAGS & ~(1 << 19)
SOFT = 10.0
CAVEATS = [
    "The comet is an extended coma, so the flux depends on the aperture: these are 4 pixel (24.6 arcsec) radius sums with no aperture correction, and a different aperture gives a different spectrum.",
    "This is flux, not reflectance: the solar spectrum and the changing comet-Sun and comet-SPHEREx distances are not divided out.",
    "No water-ice claim is made from the December data.",
    "Each frame sees one wavelength at a different time, so rotation and activity changes between frames are mixed into the spectrum along with wavelength.",
    "The August 2025 rows come from a different date, when the comet was much fainter and farther away, so they sit 10 to 50 times lower and should be read as a separate epoch, not part of the December spectrum.",
    "The sky annulus (12 to 20 pixels) can contain outer coma, so the fluxes may read low.",
]
# (um, label, half-window um) tested against the data; labelled only if they show up, see band_test.
CANDIDATES = [(2.7, "H2O", 0.10), (3.3, "C-H", 0.12), (4.26, "CO2", 0.10), (4.67, "CO", 0.10)]


def table():
    if not VOT.exists():
        import requests
        VOT.parent.mkdir(parents=True, exist_ok=True)
        r = requests.get(VOT_URL, timeout=120)
        r.raise_for_status()
        VOT.write_bytes(r.content)
    t = Table.read(VOT, format="votable", use_names_over_ids=True)
    t.sort("t_min")
    return t


def fits_urls():
    """The 259 full-frame FITS URLs, from IRSA's own download script (the table's datalink URLs have no '#this' row)."""
    if not SH.exists():
        import requests
        r = requests.get(SH_URL, timeout=120)
        r.raise_for_status()
        SH.write_bytes(r.content)
    import re
    return re.findall(r"'(https://[^']+\.fits)'", SH.read_text())


def frame_url(urls, obs_id, det):
    """Match obscore obs_id '2025W50_1A_0002_1' + detector 'D1' to '..._2025W50_1A_0002_1D1_spx_...fits'."""
    hit = [u for u in urls if f"{obs_id[-6:]}{det}_" in u and obs_id[:10] in u]
    assert len(hit) == 1, (obs_id, det, hit)
    return hit[0]


def fetch_all(jobs, workers=3, rounds=4):
    """Cutout paths in order; None where IRSA kept answering 503 (counted as dropped, never guessed)."""
    from concurrent.futures import ThreadPoolExecutor
    import time

    def one(j):
        for i in range(rounds):
            try:
                return fetch_cutout(*j)
            except Exception as ex:  # 503s, resets: wait and retry, then give up on this frame
                last = ex
                time.sleep(5 * (i + 1))
        print("gave up:", j[0].split("/")[-1], last)
        return None
    with ThreadPoolExecutor(workers) as ex:
        return list(ex.map(one, jobs))


def measure(path, ra, dec):
    """dict of the measurement, or {'drop': reason}."""
    with fits.open(path) as h:
        img = h["IMAGE"].data.astype(float)
        flg = h["FLAGS"].data.astype(np.int64)
        w = WCS(h["IMAGE"].header)
        ww = WCS(h["IMAGE"].header, fobj=h, key="W")
        mjd = float(h["IMAGE"].header["MJD-AVG"])
    x, y = (float(v) for v in w.world_to_pixel_values(ra, dec))
    yy, xx = np.indices(img.shape)
    d = np.hypot(xx - x, yy - y)
    ap, ring = d <= R_AP, (d >= SKY_IN) & (d <= SKY_OUT)
    bad = ~np.isfinite(img) | (flg & BAD_FLAGS != 0)
    # OUTLIER (bit 19) is set on the comet itself in 96 of 98 December frames (a moving extended source is an outlier to
    # the pipeline), so it does not disqualify aperture pixels; it still masks sky pixels (stars, cosmic rays).
    bad_ap = ~np.isfinite(img) | (flg & BAD_AP != 0)
    if (ap & bad_ap).any():
        return {"drop": "bad or masked pixel in aperture"}
    ring &= ~bad
    bad = bad_ap
    if ap.sum() < 45 or ring.sum() < 100:
        return {"drop": "aperture or sky annulus off the cutout"}
    sky = np.median(img[ring])
    sd = mad_std(img[ring])
    n = int(ap.sum())
    flux = float((img[ap] - sky).sum())
    err = float(np.sqrt(n * sd ** 2 + (n * 1.2533 * sd / np.sqrt(ring.sum())) ** 2))
    snr = flux / err if err > 0 else 0.0
    # centroid: flux-weighted, positive sky-subtracted pixels within the aperture, 3 passes, only if detected
    xm = ym = None
    if snr >= SNR_MIN:
        cx, cy = x, y
        for _ in range(3):
            m = (np.hypot(xx - cx, yy - cy) <= R_AP) & ~bad
            wt = np.where(m, np.clip(np.nan_to_num(img - sky), 0, None), 0.0)
            if wt.sum() <= 0:
                break
            cx, cy = float((wt * xx).sum() / wt.sum()), float((wt * yy).sum() / wt.sum())
        xm, ym = cx, cy
    px, py = (xm, ym) if xm is not None else (x, y)
    wl, bw = (float(v) for v in ww.all_pix2world(px, py, 0))
    rm = dm = None
    off = None
    if xm is not None:
        rm, dm = (float(v) for v in w.pixel_to_world_values(xm, ym))
        off = float(np.hypot((rm - ra) * np.cos(np.radians(dec)), dm - dec) * 3600)
    return dict(mjd=mjd, flux=flux * UJY, err=err * UJY, snr=snr, wl=wl, bw=bw, flags=int(np.bitwise_or.reduce(flg[ap])),
                ra_meas=rm, dec_meas=dm, offset=off, sky=float(sky))


def band_test(wl, f, e, um, hw):
    """Compare the median flux within +-hw of `um` with the flanks (hw..hw*3.5 away). None if too few points."""
    c = np.abs(wl - um) <= hw
    fl = (np.abs(wl - um) > hw) & (np.abs(wl - um) <= hw * 3.5)
    if c.sum() < 2 or fl.sum() < 4:
        return None
    mc, mf = np.median(f[c]), np.median(f[fl])
    sc = 1.2533 * np.sqrt(np.median(e[c]) ** 2 + (1.4826 * np.median(np.abs(f[fl] - mf))) ** 2) / np.sqrt(c.sum())
    return dict(um=um, centre=float(mc), flank=float(mf), ratio=float(mc / mf) if mf > 0 else None, sigma=float((mc - mf) / sc))


def band_labels(rows):
    rows = [r for r in rows if r["mjd"] > 61000]   # December only: one epoch, dense coverage
    wl, f, e = (np.array([r[k] for r in rows], float) for k in ("wavelength_um", "flux_ujy", "flux_err_ujy"))
    found, tests = [], []
    for um, lab, hw in CANDIDATES:
        t = band_test(wl, f, e, um, hw)
        tests.append((lab, t))
        if t and t["ratio"] and abs(t["sigma"]) >= 5 and (t["ratio"] >= 1.3 or t["ratio"] <= 0.7):
            found.append({"um": um, "label": lab, "kind": "emission" if t["ratio"] > 1 else "dip", "contrast": round(t["ratio"], 2)})
    return found, tests


def build(seed_dir=None, plot=None, aug_download=False):
    t = table()
    urls = fits_urls()
    jobs = [(frame_url(urls, str(r["obs_id"]), str(r["spherex_detector"])), float(r["comet_ra"]), float(r["comet_dec"]), CUT_ARCMIN) for r in t]
    if seed_dir:  # reuse older 6 arcmin cutouts (research scratch names c_<obs_id>_<det>.fits) instead of downloading
        n = 0
        for r, j in zip(t, jobs):
            old = Path(seed_dir) / f"c_{r['obs_id']}_{r['spherex_detector']}.fits"
            new = cache_path(j[0], j[1], j[2], j[3])
            if old.exists() and not new.exists():
                new.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy(old, new)
                n += 1
        print("seeded", n, "cutouts from", seed_dir)
    print("fetching", len(jobs), "cutouts (cached ones are free)")
    # August frames are mostly faint (the comet was at 3.3 au); IRSA's cutout service was slow for them, so by default
    # only August frames already in the cache are measured. --aug-download fetches the rest (about 100 more cutouts).
    todo = [j if (aug_download or r["t_min"] > 61000 or cache_path(*j).exists()) else None for r, j in zip(t, jobs)]
    n_skip = sum(x is None for x in todo)
    got = iter(fetch_all([j for j in todo if j is not None]))
    paths = [None if j is None else next(got) for j in todo]

    rows, drops, kept = [], {}, []
    for r, p in zip(t, paths):
        ra, dec = float(r["comet_ra"]), float(r["comet_dec"])
        if p is None:
            drops["August frame not downloaded (use --aug-download)" if r["t_min"] < 61000 and n_skip else "download failed (IRSA 503)"] = drops.get("August frame not downloaded (use --aug-download)" if r["t_min"] < 61000 and n_skip else "download failed (IRSA 503)", 0) + 1
            continue
        m = measure(p, ra, dec)
        if "drop" in m:
            drops[m["drop"]] = drops.get(m["drop"], 0) + 1
            continue
        if m["snr"] < SNR_MIN:
            drops["S/N below 5"] = drops.get("S/N below 5", 0) + 1
            continue
        rows.append(dict(
            mjd=round(m["mjd"], 6), iso=Time(m["mjd"], format="mjd").isot[:19], obs_id=f"{r['obs_id']}_{r['spherex_detector']}", epoch="2025-12" if m["mjd"] > 61000 else "2025-08",
            detector=str(r["spherex_detector"]), ra_pred=round(ra, 6), dec_pred=round(dec, 6),
            ra_meas=None if m["ra_meas"] is None else round(m["ra_meas"], 6), dec_meas=None if m["dec_meas"] is None else round(m["dec_meas"], 6),
            offset_arcsec=None if m["offset"] is None else round(m["offset"], 2),
            wavelength_um=round(m["wl"], 5), bandwidth_um=round(m["bw"], 5), flux_ujy=round(m["flux"], 2),
            flux_err_ujy=round(m["err"], 2), snr=round(m["snr"], 1), flags=m["flags"]))
        kept.append(p)
    order = sorted(range(len(rows)), key=lambda i: rows[i]["wavelength_um"])
    rows = [rows[i] for i in order]
    kept = [kept[i] for i in order]
    n_dec = sum(r["mjd"] > 61000 for r in rows)
    n_aug = len(rows) - n_dec
    print("rows", len(rows), "(Aug", n_aug, "Dec", n_dec, ") dropped", drops)
    snrs = np.array([r["snr"] for r in rows])
    bands, tests = band_labels(rows)
    for lab, tt in tests:
        print("band test", lab, tt)

    wl = np.array([r["wavelength_um"] for r in rows])
    meta = dict(
        slug="3i-atlas", name="3I/ATLAS", designation="3I/ATLAS (C/2025 N1)", kind="comet", n_rows=len(rows),
        wl_min_um=float(wl.min()), wl_max_um=float(wl.max()),
        date_first=min(r["iso"] for r in rows)[:10], date_last=max(r["iso"] for r in rows)[:10],
        note="SPHEREx caught the interstellar comet 3I/ATLAS in " + ("two" if n_aug else "one") + " observing campaign" + ("s" if n_aug else "")
             + f", and these {len(rows)} frames give its brightness from {wl.min():.2f} to {wl.max():.2f} microns.",
        aperture_arcsec=round(R_AP * 6.15, 1), annulus_arcsec=[round(SKY_IN * 6.15, 1), round(SKY_OUT * 6.15, 1)],
        ephemeris="IRSA comet3iatlas table",
        method=(f"Per frame: a {CUT_ARCMIN} arcmin cutout at IRSA's predicted comet position, a fixed {R_AP:g} pixel ({R_AP * 6.15:.1f} arcsec) radius aperture, "
                f"sky from the median of a {SKY_IN:g} to {SKY_OUT:g} pixel annulus, times the pixel solid angle to get microjanskys; error from the annulus scatter; "
                "wavelength from each frame's per-pixel wavelength map at the measured centroid. "
                "Qualitatively this can be compared with Lisse et al. (arXiv:2601.06759), the SPHEREx team's 3I/ATLAS spectrum, "
                "whose bands (water, C-H, CO2, CO) are the ones listed under bands; no numbers from that paper are used here."),
        caveats=CAVEATS, bands=bands, snr_min=float(snrs.min()), snr_max=float(snrs.max()),
        frames_dropped=drops, n_frames_aug=n_aug, n_frames_dec=n_dec,
    )
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "spectrum.json").write_text(json.dumps(dict(meta=meta, rows=rows), indent=1))
    cols = list(rows[0])
    with open(OUT / "spectrum.csv", "w", newline="") as fh:
        wr = csv.DictWriter(fh, cols)
        wr.writeheader()
        wr.writerows(rows)

    # VOTable with units
    vt = Table({c: [r[c] for r in rows] for c in cols if c not in ("ra_meas", "dec_meas", "offset_arcsec")})
    for c in ("ra_meas", "dec_meas", "offset_arcsec"):
        vt[c] = np.array([np.nan if r[c] is None else r[c] for r in rows], float)
    units = dict(mjd="d", ra_pred="deg", dec_pred="deg", ra_meas="deg", dec_meas="deg", offset_arcsec="arcsec",
                 wavelength_um="um", bandwidth_um="um", flux_ujy="uJy", flux_err_ujy="uJy")
    for c, u in units.items():
        vt[c].unit = u
    vo = from_table(vt)
    res = vo.resources[0]
    for k in ("aperture_arcsec", "method", "ephemeris"):
        from astropy.io.votable.tree import Info
        res.infos.append(Info(name=k, value=str(meta[k])))
    for i, c in enumerate(CAVEATS):
        from astropy.io.votable.tree import Info
        res.infos.append(Info(name=f"caveat{i + 1}", value=c))
    vo.to_xml(str(OUT / "spectrum.vot"))

    # frames: up to 12 December frames spread over wavelength, north up, shared asinh stretch
    cand = [i for i, r in enumerate(rows) if r["mjd"] > 61000 and r["snr"] >= 20]
    pick = [cand[int(round(k))] for k in np.linspace(0, len(cand) - 1, 12)] if len(cand) > 12 else cand
    pick = sorted(set(pick))
    size = int(round(3 * 60 / 6.15)) | 1  # 3 arcmin, odd
    frames = []
    ims = []
    for i in pick:
        r = rows[i]
        with fits.open(kept[i]) as h:
            img = h["IMAGE"].data.astype(float)
            img[h["FLAGS"].data & BAD_AP != 0] = np.nan   # not bit 19: the comet itself carries it
            w = WCS(h["IMAGE"].header)
        out_w = target_wcs(r["ra_pred"], r["dec_pred"], size)
        g, _ = reproject_interp((img, w), out_w, shape_out=(size, size))
        yy, xx = np.indices(g.shape)
        c = (size - 1) / 2
        rr = np.hypot(xx - c, yy - c)
        ring = (rr >= 0.7 * c) & np.isfinite(g)
        ims.append(g - np.nanmedian(g[ring]))
    allpix = np.concatenate([a[np.isfinite(a)] for a in ims])
    black, white = (float(v) for v in np.percentile(allpix, [1, 99.8]))
    span = (white - black) or 1.0
    (OUT / "frames").mkdir(exist_ok=True)
    for old in (OUT / "frames").glob("*.png"):
        old.unlink()
    for k, (i, g) in enumerate(zip(pick, ims), 1):
        x = np.clip((np.nan_to_num(g, nan=black) - black) / span, 0, 1)
        y = np.arcsinh(SOFT * x) / np.arcsinh(SOFT)
        im = Image.fromarray((y[::-1] * 255).astype(np.uint8), "L")   # north up
        im = im.resize((im.width * 8, im.height * 8), Image.BICUBIC)
        name = f"frames/{k:02d}.png"
        im.save(OUT / name, optimize=True)
        r = rows[i]
        frames.append(dict(file=name, iso=r["iso"], wavelength_um=r["wavelength_um"], ra=r["ra_pred"], dec=r["dec_pred"],
                           size_deg=round(size * PIX, 5), orientation="north up, east left"))
    (OUT / "frames.json").write_text(json.dumps(frames, indent=1))
    print("frames", len(frames), "png px", im.size, "stretch", black, white)

    if plot:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        f = np.array([r["flux_ujy"] for r in rows]); e = np.array([r["flux_err_ujy"] for r in rows])
        dec = np.array([r["mjd"] > 61000 for r in rows])
        fig, ax = plt.subplots(figsize=(10, 5))
        ax.errorbar(wl[dec], f[dec], e[dec], fmt="o", ms=3, label="Dec 2025")
        if (~dec).any():
            ax.errorbar(wl[~dec], f[~dec], e[~dec], fmt="s", ms=3, label="Aug 2025")
        for um, lab, _ in CANDIDATES:
            ax.axvline(um, ls=":", c="gray"); ax.text(um, ax.get_ylim()[1] * 0.95, lab, rotation=90, fontsize=8)
        ax.set_yscale("log"); ax.set_xlabel("um"); ax.set_ylabel("uJy, r=4 px aperture"); ax.legend()
        fig.tight_layout(); fig.savefig(plot, dpi=100)
    return rows, meta


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed-dir")
    ap.add_argument("--plot")
    ap.add_argument("--aug-download", action="store_true")
    a = ap.parse_args()
    build(a.seed_dir, a.plot, a.aug_download)
