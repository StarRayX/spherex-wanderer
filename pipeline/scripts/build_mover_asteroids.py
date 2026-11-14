"""SPHEREx spectrophotometry of known main-belt asteroids -> web/public/movers/<slug>/ (contract: docs/MOVERS_CONTRACT.md).

For each asteroid: JPL Horizons geocentric hourly ephemeris over the survey -> SPHEREx images (IRSA TAP spherex.obscore)
whose footprint holds the asteroid at the image's mid-time -> exact positions as seen from the SPHEREx spacecraft
(Horizons observer @-163182) -> 3 arcmin cutout -> centroid near the prediction -> fixed-aperture photometry with a sky
annulus -> wavelength at the pixel -> spectrum.json / .csv / .vot and up to 12 north-up blink frames.

Run from the repo root (downloads are cached in pipeline/cache/, 4 MB per cutout):

    uv run --with astropy --with numpy --with scipy --with requests --with pillow --with reproject \\
        python -I pipeline/scripts/build_mover_asteroids.py [--only 213-lilaea ...] [--max-images 150] [--survey]

--survey only counts covering images and prints the V magnitude along the path (no downloads).
"""
import argparse
import csv
import io
import json
import logging
import math
import re
import sys
import time
import warnings
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import requests
from astropy.io import fits
from astropy.stats import mad_std
from astropy.table import Table
from astropy.time import Time
from astropy.wcs import WCS

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
from blink.fetch import fetch_cutout  # noqa: E402
from blink.measure import centroid  # noqa: E402
from blink.photometry import MJY_PER_PIX, SAT  # noqa: E402
from blink.stack import BAD_FLAGS, target_wcs  # noqa: E402

warnings.filterwarnings("ignore")
logging.getLogger("astropy").setLevel(logging.ERROR)
OUT = ROOT / "web" / "public" / "movers"
CACHE = ROOT / "pipeline" / "cache" / "movers"
HORIZONS = "https://ssd.jpl.nasa.gov/api/horizons.api"
TAP = "https://irsa.ipac.caltech.edu/TAP/sync"
SPHEREX_ID = "-163182"          # Horizons id of the SPHEREx spacecraft (observer)
START, STOP = "2025-05-01", "2026-11-14"
CUT_ARCMIN = 3.0                 # cutout size: 29 px of 6.15 arcsec
R_AP, SKY_IN, SKY_OUT = 3.0, 5.0, 8.0   # pixels
PIX_ARCSEC = 6.15
MAX_OFFSET_PX = 2.5              # centroid search radius (15 arcsec)
MAX_OFFSET_ARCSEC = 6.0          # a S/N >= 5 source further than this from the prediction is not taken to be the asteroid
EDGE_MARGIN_ARCSEC = 30          # the predicted position must be this far inside the detector footprint
SNR_MIN_ROWS = 20                # an asteroid needs this many rows at S/N >= 5 to be published
N_FRAMES, FRAME_PX = 12, 8       # blink frames and their upsampling

# number, slug, display name. Types are stated only where the literature is unambiguous.
ASTEROIDS = [
    (213, "213-lilaea", "213 Lilaea", None),
    (3721, "3721-widorn", "3721 Widorn", None),
    (24, "24-themis", "24 Themis", "C"),
    (52, "52-europa", "52 Europa", "C"),
    (253, "253-mathilde", "253 Mathilde", "C"),
    (243, "243-ida", "243 Ida", "S"),
    (951, "951-gaspra", "951 Gaspra", "S"),
    (21, "21-lutetia", "21 Lutetia", "M"),
    (22, "22-kalliope", "22 Kalliope", "M"),
    (31, "31-euphrosyne", "31 Euphrosyne", "C"),
    (45, "45-eugenia", "45 Eugenia", "C"),
    (87, "87-sylvia", "87 Sylvia", "P"),
    (433, "433-eros", "433 Eros", "S"),
    (1036, "1036-ganymed", "1036 Ganymed", "S"),
]


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


# ---------------------------------------------------------------- Horizons
def horizons(num, center, start=None, stop=None, step="1h", tlist=None):
    """Astrometric RA/Dec (deg, ICRF) and V for asteroid `num`. Returns (name_line, jd[], ra[], dec[], vmag[])."""
    p = dict(format="json", COMMAND=f"'{num};'", OBJ_DATA="YES", MAKE_EPHEM="YES", EPHEM_TYPE="OBSERVER",
             CENTER=f"'{center}'", QUANTITIES="'1,9'", ANG_FORMAT="DEG", CSV_FORMAT="YES", CAL_FORMAT="JD")
    if tlist is not None:
        p["TLIST"] = "'" + " ".join(f"{t:.7f}" for t in tlist) + "'"
    else:
        p.update(START_TIME=f"'{start}'", STOP_TIME=f"'{stop}'", STEP_SIZE=f"'{step}'")
    for i in range(6):
        try:
            r = requests.get(HORIZONS, params=p, timeout=300).json().get("result", "")
        except (ValueError, requests.RequestException):
            r = ""
        if "$$SOE" in r:
            break
        time.sleep(3 * (i + 1))
    else:
        raise RuntimeError(f"Horizons failed for {num}: {r[-500:]}")
    name = re.search(r"Target body name:\s*(.*?)\s*\{", r)
    body = r.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines()
    rows = [[x.strip() for x in line.split(",")] for line in body]
    a = np.array([[float(x[0]), float(x[3]), float(x[4]), float(x[5]) if x[5] not in ("", "n.a.") else np.nan]
                  for x in rows])
    return (name.group(1) if name else str(num)), a[:, 0], a[:, 1], a[:, 2], a[:, 3]


def geocentric(num):
    f = CACHE / f"{num}_geo.npz"
    if f.exists():
        z = np.load(f, allow_pickle=True)
        return str(z["name"]), z["jd"], z["ra"], z["dec"], z["v"]
    name, jd, ra, dec, v = horizons(num, "500", START, STOP)
    np.savez(f, name=name, jd=jd, ra=ra, dec=dec, v=v)
    return name, jd, ra, dec, v


def interp_radec(jd_grid, ra, dec, jd):
    ra_u = np.unwrap(np.radians(ra))
    return np.degrees(np.interp(jd, jd_grid, ra_u)) % 360, np.interp(jd, jd_grid, dec)


# ---------------------------------------------------------------- IRSA TAP
def tap_rows(where, tries=4):
    q = ("SELECT obs_id, t_min, t_max, energy_bandpassname, em_min, em_max, access_url, s_region "
         f"FROM spherex.obscore WHERE {where}")
    for i in range(tries):
        try:
            r = requests.post(TAP, data=dict(REQUEST="doQuery", LANG="ADQL", FORMAT="csv", QUERY=q), timeout=300)
            if r.status_code == 200 and "<VOTABLE" not in r.text[:300]:
                return list(csv.DictReader(io.StringIO(r.text)))
        except requests.RequestException:
            pass
        time.sleep(2 ** i)
    raise RuntimeError("TAP query failed: " + where[:120])


def _tangent(ra0, dec0, ra, dec):
    """Gnomonic projection (arcsec) of points about (ra0, dec0)."""
    a, d, a0, d0 = map(np.radians, (np.asarray(ra, float), np.asarray(dec, float), ra0, dec0))
    c = np.sin(d0) * np.sin(d) + np.cos(d0) * np.cos(d) * np.cos(a - a0)
    x = np.cos(d) * np.sin(a - a0) / c
    y = (np.cos(d0) * np.sin(d) - np.sin(d0) * np.cos(d) * np.cos(a - a0)) / c
    return np.degrees(x) * 3600, np.degrees(y) * 3600


def footprint_margin(s_region, ra, dec):
    """Distance (arcsec) from (ra, dec) to the nearest edge of the footprint polygon, negative if outside."""
    v = [float(t) for t in re.findall(r"-?\d+\.?\d*(?:[eE][-+]?\d+)?", s_region.split("ICRS")[-1])]
    px, py = _tangent(ra, dec, np.array(v[0::2]), np.array(v[1::2]))
    n = len(px)
    inside, dmin = True, 1e12
    sign = None
    for i in range(n):
        x1, y1, x2, y2 = px[i], py[i], px[(i + 1) % n], py[(i + 1) % n]
        cross = x1 * y2 - x2 * y1          # side of the origin relative to the edge
        if sign is None:
            sign = cross > 0
        elif (cross > 0) != sign:
            inside = False
        dx, dy = x2 - x1, y2 - y1
        t = np.clip(-(x1 * dx + y1 * dy) / (dx * dx + dy * dy), 0, 1)
        dmin = min(dmin, math.hypot(x1 + t * dx, y1 + t * dy))
    return dmin if inside else -dmin


def candidates(num):
    """SPHEREx images holding the asteroid (per the geocentric ephemeris) at their mid-time, with margin >= 30 arcsec."""
    f = CACHE / f"{num}_cand.json"
    if f.exists():
        return json.loads(f.read_text())
    _, jd, ra, dec, v = geocentric(num)
    mjd = jd - 2400000.5
    ra_u = np.degrees(np.unwrap(np.radians(ra)))
    wins = []
    step = 6.0
    for a in np.arange(mjd[0], mjd[-1], step):
        m = (mjd >= a) & (mjd < a + step)
        if m.sum() < 2:
            continue
        c_ra, c_dec = (ra_u[m].mean() % 360), dec[m].mean()
        x, y = _tangent(c_ra, c_dec, ra[m], dec[m])
        rad = float(np.hypot(x, y).max()) / 3600 + 0.1
        wins.append(f"INTERSECTS(s_region,CIRCLE('ICRS',{c_ra:.5f},{c_dec:.5f},{rad:.4f}))=1 "
                    f"AND t_min >= {a:.4f} AND t_min < {a + step:.4f}")
    with ThreadPoolExecutor(12) as ex:
        res = list(ex.map(tap_rows, wins))
    seen, out = set(), []
    for rows in res:
        for x in rows:
            k = (x["obs_id"], x["energy_bandpassname"])
            if k in seen:
                continue
            seen.add(k)
            t0, t1 = float(x["t_min"]), float(x["t_max"])
            tm = 0.5 * (t0 + t1)
            r_, d_ = interp_radec(jd, ra, dec, tm + 2400000.5)
            mg = footprint_margin(x["s_region"], float(r_), float(d_))
            if mg >= EDGE_MARGIN_ARCSEC:
                out.append(dict(obs_id=x["obs_id"], band=x["energy_bandpassname"], t_min=t0, t_max=t1, tmid=tm,
                                url=x["access_url"], margin=round(mg, 1)))
    out.sort(key=lambda r: r["tmid"])
    f.write_text(json.dumps(out))
    return out


def select(cands, n):
    """At most n images, evenly spread over (band, time) so every detector and epoch is represented."""
    if len(cands) <= n:
        return cands
    s = sorted(cands, key=lambda r: (r["band"], r["tmid"]))
    idx = np.unique(np.round(np.linspace(0, len(s) - 1, n)).astype(int))
    return sorted((s[i] for i in idx), key=lambda r: r["tmid"])


def spherex_positions(num, rows):
    """Astrometric RA/Dec (deg) and V of the asteroid as seen from the SPHEREx spacecraft at each image's mid-time."""
    key = f"{num}_obs_" + str(abs(hash(tuple(round(r["tmid"], 5) for r in rows))))[:12]
    f = CACHE / f"{key}.npz"
    if f.exists():
        z = np.load(f)
        return z["ra"], z["dec"], z["v"]
    jds = [r["tmid"] + 2400000.5 for r in rows]
    ra, dec, v = [], [], []
    cuts = list(range(0, len(jds), 60))
    if len(jds) - cuts[-1] < 3 and len(cuts) > 1:   # Horizons rejects a 2-item TLIST
        cuts.pop()
    for i, j in zip(cuts, cuts[1:] + [len(jds)]):
        _, jd, a, d, m = horizons(num, "@" + SPHEREX_ID, tlist=jds[i:j])
        ra += list(a); dec += list(d); v += list(m)
    np.savez(f, ra=ra, dec=dec, v=v)
    return np.array(ra), np.array(dec), np.array(v)


# ---------------------------------------------------------------- photometry
def load(path):
    with fits.open(path) as h:
        hd = h["IMAGE"].header
        w = WCS(hd)
        ww = WCS(hd, fobj=h, key="W")
        return dict(img=h["IMAGE"].data.astype(float), var=h["VARIANCE"].data.astype(float),
                    flags=h["FLAGS"].data.astype(np.int64), w=w, ww=ww, det=int(hd["DETECTOR"]),
                    mjd=float(hd["MJD-AVG"]))


# A moving object shows up in one exposure only, so the SPHEREx pipeline marks its pixels OUTLIER (bit 19). blink.stack.BAD_FLAGS
# masks that bit, which would remove the asteroid itself; here it is kept (the S/N and offset cuts guard against cosmic rays).
MOVER_BAD = BAD_FLAGS & ~(1 << 19)


def aperture(src, ra, dec, r_ap_pix=R_AP, sky_inner=SKY_IN, sky_outer=SKY_OUT):
    """Same as blink.photometry.aperture_flux (mJy, sky = annulus median, no aperture correction) but with MOVER_BAD."""
    img, var, flags, w = src
    x, y = w.world_to_pixel_values(ra, dec)
    yy, xx = np.indices(img.shape)
    d = np.hypot(xx - x, yy - y)
    sat = (flags & SAT != 0) | ~np.isfinite(img)
    bad = sat | (flags & MOVER_BAD != 0) | ~np.isfinite(var)
    ap, ring = d <= r_ap_pix, (d >= sky_inner) & (d <= sky_outer) & ~bad
    good = ap & ~bad
    sky, sd = (np.median(img[ring]), mad_std(img[ring])) if ring.sum() >= 10 else (np.nan, np.nan)
    sky_err = good.sum() * 1.2533 * sd / np.sqrt(max(ring.sum(), 1))
    return dict(flux_mjy=float((img[good] - sky).sum() * MJY_PER_PIX),
                err_mjy=float(np.sqrt(var[good].sum() + sky_err ** 2) * MJY_PER_PIX),
                scatter_mjy=float(np.sqrt(good.sum() * sd ** 2 + sky_err ** 2) * MJY_PER_PIX),
                saturated=bool((ap & sat).any()), n_masked=int((ap & bad).sum()), x=float(x), y=float(y))


def wave_bw(c, x, y):
    wl, bw = c["ww"].all_pix2world(x, y, 0)
    return float(wl), float(bw)


def crowded(img_m, x, y):
    """True if another source, at least 20% as bright as the target (or 5 sigma), peaks 2 to 6 px from the target."""
    from scipy.ndimage import maximum_filter, uniform_filter
    fill = np.where(np.isfinite(img_m), img_m, np.nanmedian(img_m))
    sm = uniform_filter(fill - np.nanmedian(fill), 3)
    noise = mad_std(sm)
    yy, xx = np.indices(sm.shape)
    d = np.hypot(xx - x, yy - y)
    own = sm[d <= 1.5].max() if (d <= 1.5).any() else 0.0
    thr = max(5 * noise, 0.2 * own)
    peak = (sm == maximum_filter(sm, 5)) & (sm > thr) & (d > 2.0) & (d <= 6.0)
    return bool(peak.any())


def measure(path, ra_p, dec_p, mjd):
    """One row dict, or (None, reason)."""
    c = load(path)
    img, flags, w = c["img"], c["flags"], c["w"]
    ny, nx = img.shape
    x0, y0 = w.world_to_pixel_values(ra_p, dec_p)
    if not (SKY_OUT <= x0 <= nx - 1 - SKY_OUT and SKY_OUT <= y0 <= ny - 1 - SKY_OUT):
        return None, "edge"
    src = (c["img"], c["var"], c["flags"], w)
    ap = {}
    a0 = aperture(src, ra_p, dec_p, **ap)
    if a0["saturated"]:
        return None, "saturated"
    img_m = img.copy()
    img_m[(flags & (MOVER_BAD | SAT) != 0) | ~np.isfinite(img)] = np.nan
    if crowded(img_m, x0, y0):
        return None, "crowded"
    if a0["n_masked"]:   # a masked pixel inside the aperture would silently lower the sum
        return None, "masked"
    if not (np.isfinite(a0["flux_mjy"]) and max(a0["err_mjy"], a0["scatter_mjy"]) > 0):
        return None, "no sky"
    cx, cy = centroid(img_m, x0, y0)
    use, snr0 = a0, a0["flux_mjy"] / max(a0["err_mjy"], a0["scatter_mjy"])
    ra_m = dec_m = off = None
    if np.isfinite(cx) and math.hypot(cx - x0, cy - y0) <= MAX_OFFSET_PX:
        ra_c, dec_c = (float(t) for t in w.pixel_to_world_values(cx, cy))
        a1 = aperture(src, ra_c, dec_c, **ap)
        if not a1["saturated"] and not a1["n_masked"] and np.isfinite(a1["flux_mjy"]):
            s1 = a1["flux_mjy"] / max(a1["err_mjy"], a1["scatter_mjy"])
            if s1 >= 5:
                off = float(np.hypot((ra_c - ra_p) * math.cos(math.radians(dec_p)), dec_c - dec_p) * 3600)
                if off > MAX_OFFSET_ARCSEC:   # a real source, but not where the asteroid is: a star or a mismatch
                    return None, "offset"
                use, snr0, ra_m, dec_m = a1, s1, ra_c, dec_c
    xa, ya = use["x"], use["y"]
    yy, xx = np.indices(img.shape)
    inap = np.hypot(xx - xa, yy - ya) <= R_AP
    fl = int(np.bitwise_or.reduce(flags[inap])) if inap.any() else 0
    wl, bw = wave_bw(c, xa, ya)
    return dict(mjd=c["mjd"], detector=c["det"], ra_pred=ra_p, dec_pred=dec_p, ra_meas=ra_m, dec_meas=dec_m,
                offset_arcsec=off, wavelength_um=wl, bandwidth_um=bw, flux_ujy=use["flux_mjy"] * 1e3,
                flux_err_ujy=max(use["err_mjy"], use["scatter_mjy"]) * 1e3, snr=snr0, flags=fl), None


# ---------------------------------------------------------------- output
def r6(x, n=6):
    return None if x is None or not np.isfinite(x) else round(float(x), n)


def render_frames(slug, rows, paths_by_obs, out):
    det = [r for r in rows if r["snr"] >= 5]
    if len(det) < 2:
        det = rows
    det = sorted(det, key=lambda r: r["mjd"])
    idx = np.unique(np.round(np.linspace(0, len(det) - 1, min(N_FRAMES, len(det)))).astype(int))
    chosen = [det[i] for i in idx]
    from PIL import Image
    from reproject import reproject_interp
    n = int(round(CUT_ARCMIN * 60 / PIX_ARCSEC))
    stack = []
    for r in chosen:
        c = load(paths_by_obs[r["obs_id"]])
        tw = target_wcs(r["ra_pred"], r["dec_pred"], n)
        im = c["img"].copy()
        im[(c["flags"] & (MOVER_BAD | SAT) != 0)] = np.nan
        f, _ = reproject_interp((im, c["w"]), tw, shape_out=(n, n))
        yy, xx = np.indices((n, n))
        ring = (np.hypot(xx - (n - 1) / 2, yy - (n - 1) / 2) > 6)
        stack.append(f - np.nanmedian(f[ring]))
    allp = np.concatenate([s.ravel() for s in stack])
    allp = allp[np.isfinite(allp)]
    black, white = np.percentile(allp, [1, 99.5])
    span = (white - black) or 1.0
    (out / "frames").mkdir(parents=True, exist_ok=True)
    fj = []
    for i, (r, f) in enumerate(zip(chosen, stack), 1):
        x = np.clip((np.nan_to_num(f, nan=black) - black) / span, 0, 1)
        y = np.arcsinh(10 * x) / np.arcsinh(10)
        im = Image.fromarray((y * 255).astype(np.uint8), "L").resize((n * FRAME_PX, n * FRAME_PX), Image.BICUBIC)
        im = im.transpose(Image.FLIP_TOP_BOTTOM)   # FITS row 0 is the south edge; PNG row 0 is the top (north up)
        im.save(out / "frames" / f"{i:02d}.png", optimize=True)
        fj.append(dict(file=f"frames/{i:02d}.png", iso=r["iso"], wavelength_um=r6(r["wavelength_um"], 4),
                       ra=r6(r["ra_pred"]), dec=r6(r["dec_pred"]), size_deg=round(n * PIX_ARCSEC / 3600, 5)))
    (out / "frames.json").write_text(json.dumps(fj, indent=1))


COLS = [("mjd", "d"), ("iso", None), ("obs_id", None), ("detector", None), ("ra_pred", "deg"), ("dec_pred", "deg"),
        ("ra_meas", "deg"), ("dec_meas", "deg"), ("offset_arcsec", "arcsec"), ("wavelength_um", "um"),
        ("bandwidth_um", "um"), ("flux_ujy", "uJy"), ("flux_err_ujy", "uJy"), ("snr", None), ("flags", None)]


def write_outputs(slug, name, designation, ntype, rows, stats, paths_by_obs):
    out = OUT / slug
    out.mkdir(parents=True, exist_ok=True)
    rows = sorted(rows, key=lambda r: r["wavelength_um"])
    det = [r for r in rows if r["snr"] >= 5]
    wl = [r["wavelength_um"] for r in rows]
    isos = sorted(r["iso"][:10] for r in rows)
    meds = float(np.median([r["offset_arcsec"] for r in det if r["offset_arcsec"] is not None] or [np.nan]))
    typ = f" ({ntype}-type)" if ntype else ""
    meta = dict(
        slug=slug, name=name, designation=designation, kind="asteroid", n_rows=len(rows),
        wl_min_um=r6(min(wl), 4), wl_max_um=r6(max(wl), 4), date_first=isos[0], date_last=isos[-1],
        note=(f"{name}{typ} is a main-belt asteroid; this is its brightness in {len(rows)} SPHEREx frames, "
              f"each frame at a different wavelength, not a reflectance spectrum."),
        aperture_arcsec=round(R_AP * PIX_ARCSEC, 2),
        annulus_arcsec=[round(SKY_IN * PIX_ARCSEC, 2), round(SKY_OUT * PIX_ARCSEC, 2)],
        ephemeris="JPL Horizons",
        method=("The position of the asteroid at each SPHEREx exposure comes from JPL Horizons as seen from the "
                "SPHEREx spacecraft, and every exposure whose detector held that position was cut out. "
                "The flux is the sum of the calibrated image inside a 3-pixel-radius circle at the centroid, minus "
                "the median of a sky ring, times the pixel size, and the wavelength is read at that pixel."),
        caveats=[
            "These are fluxes, not reflectance: the Sun's spectrum is not divided out and no thermal model is fitted. "
            "Thermal emission from the asteroid itself dominates beyond about 3.5 um for asteroids this close to the Sun.",
            "Each frame sees the asteroid at a different time and at a different wavelength, so rotation (brightness "
            "changes with spin) and wavelength are mixed between neighbouring points.",
            "Centroids are good to about 1 arcsec from 6.15 arcsec pixels; this is not MPC-grade astrometry. "
            "Positions are as seen from the SPHEREx spacecraft; Horizons times are matched to the exposure mid-time.",
            f"Pixels the SPHEREx pipeline flagged OUTLIER are kept because a moving object is flagged that way; frames with a saturated pixel in the aperture ({stats['saturated']}), with a masked or non-finite pixel in the aperture ({stats['masked']}), with another source within 6 pixels "
            f"({stats['crowded']}), too near the detector edge ({stats['edge']}), centred on a source more than 6 arcsec from the prediction ({stats['offset']}) or without usable sky "
            f"({stats['nosky']}) were removed, out of {stats['tried']} frames examined; points with S/N below 5 are "
            "kept and have no measured centroid.",
            "No aperture correction and no colour correction; the aperture holds about 98% of a point source.",
        ],
        bands=[])
    rows_out = []
    for r in rows:
        rows_out.append(dict(mjd=r6(r["mjd"], 6), iso=r["iso"], obs_id=r["obs_id"], detector=r["detector"],
                             ra_pred=r6(r["ra_pred"]), dec_pred=r6(r["dec_pred"]), ra_meas=r6(r["ra_meas"]),
                             dec_meas=r6(r["dec_meas"]), offset_arcsec=r6(r["offset_arcsec"], 2),
                             wavelength_um=r6(r["wavelength_um"], 4), bandwidth_um=r6(r["bandwidth_um"], 4),
                             flux_ujy=r6(r["flux_ujy"], 3), flux_err_ujy=r6(r["flux_err_ujy"], 3),
                             snr=r6(r["snr"], 2), flags=int(r["flags"])))
    (out / "spectrum.json").write_text(json.dumps(dict(meta=meta, rows=rows_out), separators=(",", ":")))
    with open(out / "spectrum.csv", "w", newline="") as f:
        wr = csv.writer(f)
        wr.writerow([c for c, _ in COLS])
        for r in rows_out:
            wr.writerow(["" if r[c] is None else r[c] for c, _ in COLS])
    from astropy.io.votable import from_table
    from astropy.io.votable.tree import Info
    import astropy.units as u
    t = Table()
    for c, unit in COLS:
        vals = [r[c] for r in rows_out]
        if c in ("iso", "obs_id"):
            t[c] = [str(v) for v in vals]
        elif c in ("detector", "flags"):
            t[c] = np.array(vals, dtype=np.int64)
        else:
            t[c] = np.array([np.nan if v is None else v for v in vals], dtype=float)
        if unit:
            t[c].unit = u.Unit(unit if unit != "d" else "d")
    vo = from_table(t)
    tab = vo.resources[0].tables[0]
    tab.infos.append(Info(name="object", value=name))
    for k in ("note", "method", "ephemeris", "aperture_arcsec"):
        tab.infos.append(Info(name=k, value=str(meta[k])))
    for i, cv in enumerate(meta["caveats"]):
        tab.infos.append(Info(name=f"caveat{i + 1}", value=cv))
    vo.to_xml(str(out / "spectrum.vot"))
    render_frames(slug, rows_out, paths_by_obs, out)
    return meta, meds


def process(num, slug, name_hint, ntype, max_images, workers=4):
    cand = candidates(num)
    log(slug, "covering images", len(cand))
    sel = select(cand, max_images)
    ra, dec, v = spherex_positions(num, sel)
    name_h, *_ = geocentric(num)
    log(slug, "selected", len(sel), "V median along selected", round(float(np.nanmedian(v)), 2))
    jobs = [(r["url"], float(a), float(d), CUT_ARCMIN) for r, a, d in zip(sel, ra, dec)]

    def dl(j):
        try:
            return fetch_cutout(*j)
        except Exception as e:  # keep going; counted
            return e
    with ThreadPoolExecutor(workers) as ex:
        paths = list(ex.map(dl, jobs))
    for _ in range(3):   # the archive sometimes answers 503 under load: retry the failures, one at a time
        bad = [i for i, p in enumerate(paths) if isinstance(p, Exception)]
        if not bad:
            break
        time.sleep(10)
        for i in bad:
            paths[i] = dl(jobs[i])
    rows, paths_by_obs = [], {}
    stats = dict(tried=len(sel), masked=0, offset=0, saturated=0, crowded=0, edge=0, nosky=0, failed=0)
    for r, a, d, p in zip(sel, ra, dec, paths):
        if isinstance(p, Exception):
            stats["failed"] += 1
            continue
        m, why = measure(p, float(a), float(d), r["tmid"])
        if m is None:
            stats[{"saturated": "saturated", "crowded": "crowded", "edge": "edge", "no sky": "nosky", "offset": "offset", "masked": "masked"}[why]] += 1
            continue
        m.update(obs_id=f"{r['obs_id']}_D{m['detector']}", iso=Time(m["mjd"], format="mjd").isot[:19] + "Z")
        paths_by_obs[m["obs_id"]] = p
        rows.append(m)
    nd = sum(r["snr"] >= 5 for r in rows)
    log(slug, f"rows {len(rows)}, S/N>=5: {nd}, stats {stats}")
    if nd < SNR_MIN_ROWS:
        return None, f"only {nd} rows at S/N>=5 ({len(rows)} usable of {len(sel)} tried, {len(cand)} covering)"
    ident = re.search(r"\((.*)\)", name_h)
    meta, meds = write_outputs(slug, " ".join(name_h.split()[:2]) if name_h else name_hint,
                               ident.group(1) if ident else str(num), ntype, rows, stats, paths_by_obs)
    return meta, meds


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*")
    ap.add_argument("--max-images", type=int, default=150)
    ap.add_argument("--survey", action="store_true")
    ap.add_argument("--workers", type=int, default=4)
    a = ap.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    for num, slug, name, ntype in ASTEROIDS:
        if a.only and slug not in a.only:
            continue
        try:
            if a.survey:
                _, jd, ra, dec, v = geocentric(num)
                c = candidates(num)
                bands = {}
                for r in c:
                    bands[r["band"]] = bands.get(r["band"], 0) + 1
                log(f"{slug}: V {np.nanmin(v):.1f}-{np.nanmax(v):.1f} median {np.nanmedian(v):.1f}; "
                    f"{len(c)} covering images {dict(sorted(bands.items()))}")
                continue
            meta, extra = process(num, slug, name, ntype, a.max_images, a.workers)
            if meta is None:
                log("DROPPED", slug, extra)
                import shutil
                shutil.rmtree(OUT / slug, ignore_errors=True)
            else:
                log("OK", slug, meta["n_rows"], "rows", meta["wl_min_um"], "-", meta["wl_max_um"], "um",
                    "median offset", round(extra, 2))
        except Exception as e:
            log("ERROR", slug, repr(e))


if __name__ == "__main__":
    main()
