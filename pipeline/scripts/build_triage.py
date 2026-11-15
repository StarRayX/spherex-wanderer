"""'Vet this dot' triage: every change in one SPHEREx field between visits, with a verdict and a plain-English reason.

For one field and one detector, over a date window, this finds all 5-sigma changes between visits (a visit = the 1 to 4
exposures taken together in one pass) and sorts each into: known_asteroid, star_residual, cosmic_ray, edge_mask,
unconfirmable, unexplained. It writes web/public/triage/index.json and, per field, triage.json, triage.csv, thumbs/<id>.png.

    pipeline/.venv/Scripts/python.exe -I pipeline/scripts/build_triage.py            # all FIELDS below
    pipeline/.venv/Scripts/python.exe -I pipeline/scripts/build_triage.py --only ecliptic-150

Network: IRSA TAP (frames, cutouts), JPL sb_ident (known asteroids per visit), Gaia TAP (stars). Everything downloaded
is cached in pipeline/cache/ (cutouts) and pipeline/cache/triage/ (JPL and Gaia answers); a second run is offline.
Depth: the 5-sigma difference limit is roughly V 18 to 19 for a point source, so this can say nothing about fainter things.
"""
import argparse
import csv
import io
import json
import math
import pathlib
import sys
import time
import warnings
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import requests
from astropy.io import fits
from astropy.stats import mad_std
from astropy.time import Time
from astropy.wcs import WCS
from PIL import Image
from reproject import reproject_interp
from scipy import ndimage as ndi
from scipy.spatial import cKDTree

ROOT = pathlib.Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
from blink.fetch import fetch_many  # noqa: E402
from blink.jpl import identify  # noqa: E402
from blink.query import find_frames  # noqa: E402
from blink.stack import BAD_FLAGS, target_wcs  # noqa: E402

warnings.filterwarnings("ignore")
OUT = ROOT / "web" / "public" / "triage"
CACHE = ROOT / "pipeline" / "cache" / "triage"
GAIA = "https://gea.esac.esa.int/tap-server/tap/sync"

# slug, name, ra, dec, detector, mjd window. Nov 15 to 20 2025 = MJD 60994 to 60999 (windows are padded, then filtered).
FIELDS = [
    dict(slug="ecliptic-150", name="Near the ecliptic, RA 150, Dec +13", ra=150.05, dec=13.17, det="D1",
         mjd0=60990, mjd1=61010),
    # Ecliptic longitude 255, latitude 0: 7 D1 visits in 8 days; most JPL bodies (9, V < 21) of the 8 ecliptic points scanned.
    dict(slug="ecliptic-254", name="On the ecliptic, RA 254, Dec -22.6", ra=253.73, dec=-22.6, det="D1",
         mjd0=61100, mjd1=61109),
]

SIZE_ARCMIN, N = 30, 293          # cutout side; 293 px at 6.15 arcsec = 30 arcmin
SNR, MATCH_ARCSEC, GAIA_ARCSEC = 5, 20, 12
# SPHEREx FLAGS bit names (Explanatory Supplement v2.1 Table 16, as listed in blink/stack.py).
FLAG_NAMES = {0: "TRANSIENT", 1: "OVERFLOW", 2: "SUR_ERROR", 6: "NONFUNC", 7: "DICHROIC", 9: "MISSING_DATA", 10: "HOT",
              11: "COLD", 12: "FULLSAMPLE", 14: "PHANMISS", 15: "NONLINEAR", 17: "PERSIST", 19: "OUTLIER",
              20: "CROSSTALK", 21: "SOURCE", 22: "GHOST0", 23: "GHOST1", 24: "GHOST2", 25: "STREAK", 26: "BLOOM",
              27: "SNOWBALL", 28: "HALO", 29: "SATELLITE_HALO"}
VERDICTS = ["known_asteroid", "star_residual", "cosmic_ray", "edge_mask", "unconfirmable", "unexplained"]


def sep_arcsec(ra1, dec1, ra2, dec2):
    return float(np.hypot((ra1 - ra2) * math.cos(math.radians(dec1)), dec1 - dec2) * 3600)


def seq_of(obs_id):
    return obs_id.rsplit("_", 1)[0]


def load_frames(f):
    """Frames of the field's detector inside the window; cutouts downloaded (cached) and reprojected to one grid."""
    fr = [x for x in find_frames(f["ra"], f["dec"]) if x["band"] == "SPHEREx-" + f["det"] and f["mjd0"] < x["mjd"] < f["mjd1"]]
    fr.sort(key=lambda x: x["mjd"])
    paths = fetch_many([(x["url"], f["ra"], f["dec"], SIZE_ARCMIN) for x in fr], workers=4)
    out = target_wcs(f["ra"], f["dec"], N)
    imgs, raw = [], []
    for x, p in zip(fr, paths):
        with fits.open(p) as h:
            w = WCS(h["IMAGE"].header)
            img = h["IMAGE"].data.astype(float) - h["ZODI"].data
            fl = h["FLAGS"].data.astype(np.int64)
            img[(fl & BAD_FLAGS) != 0] = np.nan
            a, _ = reproject_interp((img, w), out, shape_out=(N, N))
        imgs.append(a - np.nanmedian(a))
        raw.append(dict(wcs=w, flags=fl))
        x["seq"] = seq_of(x["obs_id"])
    return fr, np.array(imgs), raw, out


def jpl_per_visit(f, fr, seqs):
    """Known bodies (JPL sb_ident, V < 21) in the field at each visit's mean time. Cached per visit."""
    CACHE.mkdir(parents=True, exist_ok=True)

    def one(s):
        mjd = float(np.mean([fr[i]["mjd"] for i in seqs[s]]))
        fn = CACHE / f"jpl_{f['slug']}_{s}.json"
        if fn.exists():
            return s, json.loads(fn.read_text())
        for _ in range(3):
            b, r = identify(f["ra"], f["dec"], mjd, fov_arcmin=32, vmag_lim=21, timeout=120)
            if not r or r.startswith("no known"):
                break
            time.sleep(3)
        else:
            raise RuntimeError(f"JPL failed for {s}: {r}")
        res = dict(mjd=mjd, bodies=b)
        fn.write_text(json.dumps(res))
        return s, res
    with ThreadPoolExecutor(4) as ex:
        return dict(ex.map(one, seqs))


def gaia_stars(f):
    """Gaia DR3 stars (G < 21) in a cone covering the field: (ra, dec, G). Cached. Positions at epoch 2016, not moved."""
    fn = CACHE / f"gaia_{f['slug']}.csv"
    if not fn.exists():
        q = (f"SELECT ra, dec, phot_g_mean_mag FROM gaiadr3.gaia_source WHERE phot_g_mean_mag < 21 AND "
             f"1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',{f['ra']},{f['dec']},0.36))")
        r = requests.post(GAIA, data=dict(REQUEST="doQuery", LANG="ADQL", FORMAT="csv", QUERY=q), timeout=300)
        r.raise_for_status()
        CACHE.mkdir(parents=True, exist_ok=True)
        fn.write_text(r.text)
    rows = list(csv.DictReader(io.StringIO(fn.read_text())))
    return np.array([[float(r["ra"]), float(r["dec"]), float(r["phot_g_mean_mag"])] for r in rows if r["phot_g_mean_mag"]])


def bits_of(v):
    return [b for b in range(32) if (v >> b) & 1]


def raw_window_flags(raw, ra, dec, half=2):
    """OR of the FLAGS pixels in a (2*half+1)^2 window around (ra, dec) in one raw exposure; None if off the frame."""
    X, Y = (int(round(float(c))) for c in raw["wcs"].world_to_pixel_values(ra, dec))
    fl = raw["flags"]
    if not (0 <= X < fl.shape[1] and 0 <= Y < fl.shape[0]):
        return None
    return int(np.bitwise_or.reduce(fl[max(0, Y - half):Y + half + 1, max(0, X - half):X + half + 1].ravel()))


def detect(f, fr, imgs, raw, out, J, gaia):
    sig = [mad_std(im, ignore_nan=True) for im in imgs]
    med = np.median(sig)
    good = [i for i in range(len(fr)) if sig[i] < 3 * med]
    dropped = [fr[i]["obs_id"] for i in range(len(fr)) if i not in good]
    seqs = {}
    for i in good:
        seqs.setdefault(fr[i]["seq"], []).append(i)
    stk = {s: (np.nanmedian(imgs[ix], axis=0) if len(ix) >= 3 else np.nanmean(imgs[ix], axis=0)) for s, ix in seqs.items()}
    mjd = {s: float(np.mean([fr[i]["mjd"] for i in ix])) for s, ix in seqs.items()}
    tree = cKDTree(np.c_[gaia[:, 0] * np.cos(np.radians(f["dec"])), gaia[:, 1]]) if len(gaia) else None
    cands = []
    for s, ix in seqs.items():
        others = [t for t in seqs if abs(mjd[t] - mjd[s]) > 0.5]
        ref = np.nanmedian([stk[t] for t in others], axis=0)
        d = stk[s] - ref
        sg = mad_std(d, ignore_nan=True)
        noise = np.sqrt(sg ** 2 + (0.1 * np.fmax(np.abs(ref), np.abs(stk[s]))) ** 2)
        snr = np.nan_to_num(d / noise)
        lab, n = ndi.label(snr > SNR)
        for k in range(1, n + 1):
            m = lab == k
            yy, xx = np.nonzero(m)
            p = np.argmax(snr[m])
            y, x = int(yy[p]), int(xx[p])
            ra, dec = (float(v) for v in out.pixel_to_world_values(x, y))
            win = (slice(max(0, y - 1), y + 2), slice(max(0, x - 1), x + 2))
            per = []  # each exposure's peak excess in a 3x3 window
            for i in ix:
                w = (imgs[i] - ref)[win]
                per.append(float(np.nanmax(w)) if np.isfinite(w).any() else -np.inf)
            nexp = sum(1 for v in per if v > 3 * sg)
            peak_i = ix[int(np.argmax(per))]
            core_nan = int(np.isnan(stk[s][win]).sum() + np.isnan(ref[win]).sum())
            edge_px = int(min(x, y, N - 1 - x, N - 1 - y))
            best = min(((sep_arcsec(ra, dec, b["ra"], b["dec"]), b["name"], b["mag"]) for b in J[s]["bodies"]), default=None)
            jm = best if best and best[0] < MATCH_ARCSEC else None
            refpk = float(np.nanmax(ref[max(0, y - 2):y + 3, max(0, x - 2):x + 3]))
            if jm:
                v = "known_asteroid"
            elif x < 4 or y < 4 or x > N - 5 or y > N - 5:
                v = "edge_mask"
            elif core_nan > 2:
                v = "edge_mask"
            elif len(ix) >= 2 and nexp < 2:
                v = "cosmic_ray"
            elif len(ix) == 1:
                v = "unconfirmable"
            elif refpk > 0.5:
                v = "star_residual"
            elif m.sum() < 2:
                v = "unconfirmable"
            else:
                v = "unexplained"
            sub = "edge" if edge_px < 4 else ("mask" if core_nan > 2 else ("1px" if m.sum() < 2 else ""))
            g = None
            if tree is not None:
                dd, jj = tree.query([ra * math.cos(math.radians(f["dec"])), dec])
                if dd * 3600 < 30:
                    g = (round(float(gaia[jj, 2]), 2), round(float(dd * 3600), 1))
            fl = raw_window_flags(raw[peak_i], ra, dec)
            cands.append(dict(seq=s, x=x, y=y, ra=ra, dec=dec, mjd=mjd[s], peak_obs=fr[peak_i]["obs_id"], nexp=nexp,
                              nexp_seq=len(ix), snr=float(snr[y, x]), npix=int(m.sum()), refpk=refpk, edge_px=edge_px,
                              verdict=v, sub=sub, jpl=jm, gaia=g, flags=fl, peak_i=peak_i))
    return cands, seqs, stk, mjd, dropped


def reason(c):
    v = c["verdict"]
    if v == "known_asteroid":
        off, name, mag = c["jpl"]
        return f"A known asteroid, {name}, was predicted {off:.0f} arcsec from here at this time (JPL, V {mag:.1f})."
    if v == "star_residual":
        if c["gaia"] and c["gaia"][1] <= GAIA_ARCSEC:
            return (f"A bright star (Gaia G {c['gaia'][0]:.1f}, {c['gaia'][1]:.0f} arcsec away) is imaged a little differently "
                    "each visit and leaves this leftover in the difference; nothing moved.")
        return ("The same spot is already bright in the other days' images, so this is the same source imaged a little "
                "differently, not something new.")
    if v == "cosmic_ray":
        return (f"The brightening is in only {c['nexp']} of the {c['nexp_seq']} exposures of this visit, which is what a "
                "cosmic-ray hit looks like; a real object would be in all of them.")
    if v == "edge_mask":
        if c["edge_px"] < 4:
            return (f"It sits {c['edge_px']} pixels from the edge of the image cutout, where data are cut off, so a change "
                    "here cannot be trusted.")
        return "Pixels right next to it are masked as unusable by SPHEREx's own flags, so the apparent change comes from the mask, not the sky."
    if v == "unconfirmable":
        if c["nexp_seq"] == 1:
            return "This visit has only one exposure, so there is nothing to confirm it against, and no known asteroid or bright star explains it."
        return "Only one pixel is brighter, narrower than a real star's image, and no known asteroid or bright star explains it."
    return "Nothing known explains it: no listed asteroid, bright star, cosmic-ray pattern or edge effect."


def unexplained_caveat(rows):
    u = [r for r in rows if r["verdict"] == "unexplained"]
    if not u:
        return []
    vis = sorted({r["iso"] for r in u})
    edge = int(np.median([r['evidence']['edge_px'] for r in u]))
    return [f"{len(u)} changes remain unexplained ({', '.join(vis)} UTC, a median {edge} pixels from the cutout edge): "
            f"no known asteroid within {MATCH_ARCSEC} arcsec, nothing bright there on other days, and each is in at least "
            "2 exposures of its visit. Not shown to be real or instrumental; see the thumbnails."]


def thumb(stk, ref, c, path, half=12):
    """Two panels side by side, 2x enlarged: the other days' median ('before') and this visit, same grey stretch."""
    def crop(a):
        pad = np.pad(a, half, constant_values=np.nan)
        return pad[c["y"]:c["y"] + 2 * half + 1, c["x"]:c["x"] + 2 * half + 1]
    a, b = crop(ref), crop(stk)
    both = np.concatenate([a.ravel(), b.ravel()])
    both = both[np.isfinite(both)]
    lo, hi = (np.percentile(both, 3), np.percentile(both, 99.5)) if both.size else (0, 1)
    if hi <= lo:
        hi = lo + 1
    def img(z):
        return np.kron((np.clip((np.nan_to_num(z, nan=lo) - lo) / (hi - lo), 0, 1) * 255).astype(np.uint8), np.ones((2, 2), np.uint8))
    g = np.full((2 * (2 * half + 1), 2 * (2 * half + 1) * 2 + 2), 255, np.uint8)
    w = img(a).shape[1]
    g[:, :w], g[:, w + 2:] = img(a), img(b)
    Image.fromarray(g, "L").save(path, optimize=True)


def build_field(f):
    t0 = time.time()
    print(f"[{f['slug']}] frames and cutouts", flush=True)
    fr, imgs, raw, out = load_frames(f)
    seqs_all = {}
    for i, x in enumerate(fr):
        seqs_all.setdefault(x["seq"], []).append(i)
    print(f"[{f['slug']}] {len(fr)} exposures in {len(seqs_all)} visits; JPL and Gaia", flush=True)
    J = jpl_per_visit(f, fr, seqs_all)
    gaia = gaia_stars(f)
    cands, seqs, stk, mjd, dropped = detect(f, fr, imgs, raw, out, J, gaia)
    cands.sort(key=lambda c: (c["mjd"], c["y"], c["x"]))
    d = OUT / f["slug"]
    (d / "thumbs").mkdir(parents=True, exist_ok=True)
    for old in (d / "thumbs").glob("*.png"):
        old.unlink()
    refs = {s: np.nanmedian([stk[t] for t in seqs if abs(mjd[t] - mjd[s]) > 0.5], axis=0) for s in seqs}
    rows = []
    for n, c in enumerate(cands, 1):
        cid = f"t{n:03d}"
        thumb(stk[c["seq"]], refs[c["seq"]], c, d / "thumbs" / f"{cid}.png")
        fl = c["flags"]
        rows.append(dict(
            id=cid, ra=round(c["ra"], 6), dec=round(c["dec"], 6), mjd=round(c["mjd"], 5),
            iso=Time(c["mjd"], format="mjd").strftime("%Y-%m-%d %H:%M"), obs_id=c["peak_obs"], verdict=c["verdict"],
            reason=reason(c),
            evidence=dict(jpl_name=c["jpl"][1] if c["jpl"] else None,
                          jpl_offset_arcsec=round(c["jpl"][0], 1) if c["jpl"] else None,
                          flags_bits=fl, flag_names=[FLAG_NAMES.get(b, f"BIT{b}") for b in bits_of(fl)] if fl is not None else [],
                          nearest_gaia_g=c["gaia"][0] if c["gaia"] else None,
                          nearest_gaia_sep_arcsec=c["gaia"][1] if c["gaia"] else None,
                          edge_px=c["edge_px"], in_adjacent_frame=(c["nexp"] >= 2) if c["nexp_seq"] >= 2 else None),
            thumb=f"thumbs/{cid}.png"))
    counts = {v: sum(r["verdict"] == v for r in rows) for v in VERDICTS}

    # TRANSIENT bit overlap: of the rows called cosmic_ray, how many have FLAGS bit 0 in the 5x5 raw pixels around the
    # position, in the exposure where the brightening is strongest. Baseline: same window at random places on the frames.
    cr = [r for r in rows if r["verdict"] == "cosmic_ray"]
    with_bit = sum(1 for r in cr if r["evidence"]["flags_bits"] is not None and r["evidence"]["flags_bits"] & 1)
    rng = np.random.default_rng(0)
    base = []
    for rw in raw:
        fl = rw["flags"]
        for _ in range(300):
            y, x = rng.integers(3, fl.shape[0] - 3), rng.integers(3, fl.shape[1] - 3)
            base.append(bool(np.bitwise_or.reduce(fl[y - 2:y + 3, x - 2:x + 3].ravel()) & 1))
    all_with = sum(1 for r in rows if r["evidence"]["flags_bits"] is not None and r["evidence"]["flags_bits"] & 1)
    dates = [r["iso"][:10] for r in rows]
    first, last = Time(min(x["mjd"] for x in fr), format="mjd").strftime("%Y-%m-%d"), Time(max(x["mjd"] for x in fr), format="mjd").strftime("%Y-%m-%d")
    meta = dict(
        slug=f["slug"], name=f["name"], ra=f["ra"], dec=f["dec"], detector=f["det"], date_first=first, date_last=last,
        depth_note=("Depth is about V 18 to 19 (5 sigma), so the 'unexplained' count (even 0) says nothing about fainter "
                    'objects, Planet X included. A vetting aid for bright changes, not a search.'),
        method=(f"SPHEREx {f['det']} exposures are regridded onto one 30 arcmin field, bad pixels masked, and each visit "
                "is compared with the median of the visits on other days; every blob brighter than 5 sigma is a change. "
                "Each change is then checked against JPL's asteroid positions for that time, Gaia stars, the exposures "
                "of the same visit, the image edge and the SPHEREx pixel flags."),
        caveats=[
            f"{len(fr)} exposures in {len(seqs_all)} visits over {first} to {last}; wavelengths differ between visits, so "
            "very red or blue objects can change brightness without moving.",
            f"A JPL asteroid counts as a match within {MATCH_ARCSEC} arcsec (about 3 pixels) of the predicted position.",
            "Gaia positions are at epoch 2016 (not moved for proper motion) and only serve as nearby-star "
            "evidence.",
            "'Unconfirmable': the visit had one exposure or the change is one pixel wide. Not explained, just not"
            ' testable here.',
            "Positions are from the regridded image and good to about one pixel (6 arcsec).",
        ] + unexplained_caveat(rows),
        counts=counts,
        transient_bit_overlap=dict(
            cosmic_rays=len(cr), flagged_transient_by_pipeline=with_bit,
            rule=("FLAGS bit 0 (TRANSIENT) set in the 5x5 raw pixels around the position, in the exposure where the "
                  "brightening is strongest"),
            all_rows_with_bit=all_with, all_rows=len(rows),
            baseline_random_windows_with_bit=round(float(np.mean(base)), 3)),
        dropped_exposures=dropped,
        thumb_note="Each thumbnail is 25x25 pixels (about 2.5 arcmin) enlarged 2x: left, the median of the other days; right, this visit. Same grey scale.")
    (d / "triage.json").write_text(json.dumps(dict(meta=meta, rows=rows), indent=1))
    cols = ["id", "ra", "dec", "mjd", "iso", "obs_id", "verdict", "reason", "jpl_name", "jpl_offset_arcsec", "flags_bits",
            "flag_names", "nearest_gaia_g", "nearest_gaia_sep_arcsec", "edge_px", "in_adjacent_frame", "thumb"]
    with open(d / "triage.csv", "w", newline="", encoding="utf-8") as fh:
        w = csv.writer(fh)
        w.writerow(cols)
        for r in rows:
            e = r["evidence"]
            flat = {**{k: r[k] for k in ("id", "ra", "dec", "mjd", "iso", "obs_id", "verdict", "reason", "thumb")},
                    **{k: e[k] for k in e if k != "flag_names"}, "flag_names": ";".join(e["flag_names"])}
            w.writerow(["" if flat[k] is None else flat[k] for k in cols])
    entry = dict(slug=f["slug"], name=f["name"], ra=f["ra"], dec=f["dec"], detector=f["det"], date_first=first,
                 date_last=last, counts=counts)
    print(f"[{f['slug']}] {len(rows)} changes {counts}; cosmic_ray {len(cr)} with TRANSIENT {with_bit}; "
          f"baseline {np.mean(base):.3f}; {time.time() - t0:.0f} s", flush=True)
    return entry


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="slug of one field")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    idx_fn = OUT / "index.json"
    index = {e["slug"]: e for e in json.loads(idx_fn.read_text())} if idx_fn.exists() else {}
    for f in FIELDS:
        if a.only and f["slug"] != a.only:
            continue
        index[f["slug"]] = build_field(f)
    order = [f["slug"] for f in FIELDS]
    idx_fn.write_text(json.dumps([index[s] for s in order if s in index], indent=1))


if __name__ == "__main__":
    main()
