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


def gaia_astrometry(ra, dec, radius_arcsec=5):
    """Gaia DR3 astrometry {ra, dec, pmra, pmdec, parallax, epoch_from} or None.

    Heuristic: Gaia is at epoch 2016 but a SIMBAD position can be at another epoch, so a fast mover
    sits off-centre. We take the brightest source (min G) within radius; callers pass ~30" for names
    and the default 5" for raw coordinates. Sources without parallax/pm (2-parameter) are skipped.
    """
    q = (f"SELECT TOP 1 ra, dec, pmra, pmdec, parallax FROM gaiadr3.gaia_source "
         f"WHERE 1=CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',{ra},{dec},{radius_arcsec / 3600})) "
         f"AND parallax IS NOT NULL AND pmra IS NOT NULL ORDER BY phot_g_mean_mag")
    r = requests.post(GAIA, data=dict(REQUEST="doQuery", LANG="ADQL", FORMAT="csv", QUERY=q), timeout=60)
    r.raise_for_status()
    rows = list(csv.DictReader(io.StringIO(r.text)))
    if not rows:
        return None
    d = {k: float(rows[0][k]) for k in ("ra", "dec", "pmra", "pmdec", "parallax")}
    if not all(map(math.isfinite, d.values())) or d["parallax"] <= 0:
        return None
    return {**d, "epoch_from": 2016.0}


if __name__ == "__main__":
    ra, dec, label = resolve("Barnard's Star")
    print(label, ra, dec, gaia_astrometry(ra, dec, 30))
