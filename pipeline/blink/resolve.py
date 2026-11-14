"""Name or coordinates to (ra, dec, label), and Gaia DR3 astrometry for a position."""
import csv
import io
import math
import re

import requests

SESAME = "https://cds.unistra.fr/cgi-bin/nph-sesame/-oI/SNV?"
GAIA = "https://gea.esac.esa.int/tap-server/tap/sync"


# Offline fallback for the five challenge targets (Sesame was down); values copied from scripts/build_showcase.py.
_ALIASES = {
    ("barnard's star", "barnards star", "barnard star", "gj 699", "gliese 699"): (269.44850252543836, 4.739420051112412, "Barnard's Star"),
    ("epsilon indi b", "eps indi b", "eps ind b", "epsilon indi ba", "eps indi ba"): (331.07645259656397, -56.79381206688221, "Epsilon Indi B"),
    ("wise 0855", "wise 0855-0714", "wise j0855-0714", "wise j085510.83-071442.5"): (133.79512916666667, -7.245147222222222, "WISE 0855-0714"),
    ("rw aurigae", "rw aur"): (76.95608119552952, 30.401204589097233, "RW Aurigae"),
    ("r draconis", "r dra"): (248.1673783672889, 66.75500674547219, "R Draconis"),
}
ALIAS = {k: v for ks, v in _ALIASES.items() for k in ks}


def _coords(s):
    """'RA,Dec' in decimal degrees or sexagesimal (RA in hours), else None."""
    parts = [p.strip() for p in s.split(",")]
    if len(parts) != 2:
        return None
    try:
        return float(parts[0]), float(parts[1])
    except ValueError:
        pass
    if all(re.fullmatch(r"[+-]?\d+([: ]\d+){1,2}(\.\d*)?", p) for p in parts):
        from astropy.coordinates import Angle
        return (Angle(parts[0].replace(":", " "), unit="hourangle").deg,
                Angle(parts[1].replace(":", " "), unit="deg").deg)
    return None


def resolve(name_or_coords):
    """(ra_deg, dec_deg, label). Raises ValueError if the name is unknown or the coordinates are bad."""
    s = name_or_coords.strip()
    c = _coords(s)
    if c:
        return c[0], c[1], f"{c[0]:.5f}, {c[1]:+.5f}"
    key = " ".join(s.lower().replace("’", "'").split())
    if key in ALIAS:
        return ALIAS[key]
    try:
        r = requests.get(SESAME + requests.utils.quote(s), timeout=30)
        r.raise_for_status()
    except requests.RequestException as e:
        raise ValueError(f"Name lookup is down ({type(e).__name__}). Enter coordinates as 'RA, Dec' instead.") from e
    for line in r.text.splitlines():
        if line.startswith("%J"):
            ra, dec = (float(x) for x in line.split()[1:3])
            return ra, dec, s
    raise ValueError(f"name not found: {s}")


# A typed position may be at a catalogue epoch, not Gaia's 2016.0: Barnard's J2000 position is 166 arcsec from Gaia's,
# the challenge's WISE 0855 coordinates are at the WISE epoch. Searched only when nothing is at the typed position.
EPOCHS = (2000.0, 2010.338, 2016.0)  # J2000 catalogues, the WISE epoch, Gaia itself
WIDE_ARCSEC, MIN_PM = 300, 200  # 5 arcmin covers 18 arcsec/yr back to J2000; slower stars stay inside 5 arcsec anyway


def _gaia_rows(ra, dec, radius_arcsec, where="", top=1):
    q = (f"SELECT TOP {top} ra, dec, pmra, pmdec, parallax FROM gaiadr3.gaia_source "
         f"WHERE 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',{ra},{dec},{radius_arcsec / 3600})) "
         f"AND parallax IS NOT NULL AND pmra IS NOT NULL {where}ORDER BY phot_g_mean_mag")
    r = requests.post(GAIA, data=dict(REQUEST="doQuery", LANG="ADQL", FORMAT="csv", QUERY=q), timeout=60)
    r.raise_for_status()
    rows = [{k: float(x[k]) for k in ("ra", "dec", "pmra", "pmdec", "parallax")} for x in csv.DictReader(io.StringIO(r.text))]
    return [d for d in rows if all(map(math.isfinite, d.values())) and d["parallax"] > 0]


def gaia_astrometry(ra, dec, radius_arcsec=5):
    """Gaia DR3 astrometry {ra, dec, pmra, pmdec, parallax, epoch_from} or None.

    Heuristic: Gaia is at epoch 2016 but a SIMBAD position can be at another epoch, so a fast mover
    sits off-centre. We take the brightest source (min G) within radius; callers pass ~30" for names
    and the default 5" for raw coordinates. Sources without parallax/pm (2-parameter) are skipped.
    If there is none, Gaia sources moving over MIN_PM mas/yr within WIDE_ARCSEC are carried back to each of
    EPOCHS (straight line, no parallax: catalogue positions are barycentric); the one landing closest to the
    typed position, within radius, wins and the dict also has matched_epoch and match_arcsec.
    """
    rows = _gaia_rows(ra, dec, radius_arcsec)
    if rows:  # the brightest source, as before (a 5-parameter one; else None, as before)
        return {**rows[0], "epoch_from": 2016.0}
    best = None
    for d in _gaia_rows(ra, dec, WIDE_ARCSEC, f"AND pm > {MIN_PM} ", top=50):
        for ep in EPOCHS:
            de = d["dec"] + d["pmdec"] * (ep - 2016.0) / 3.6e6
            ra_e = d["ra"] + d["pmra"] * (ep - 2016.0) / 3.6e6 / math.cos(math.radians(de))
            sep = 3600 * math.hypot(((ra_e - ra + 180) % 360 - 180) * math.cos(math.radians(dec)), de - dec)
            if sep <= radius_arcsec and (best is None or sep < best[0]):
                best = (sep, ep, d)
    if best is None:
        return None
    return {**best[2], "epoch_from": 2016.0, "matched_epoch": best[1], "match_arcsec": round(best[0], 2)}


if __name__ == "__main__":
    ra, dec, label = resolve("Barnard's Star")
    print(label, ra, dec, gaia_astrometry(ra, dec, 30))
