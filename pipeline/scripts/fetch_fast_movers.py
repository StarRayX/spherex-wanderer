"""Fetch the sky's fastest-moving stars from Gaia DR3 for the sky map's fast-mover layer.

Writes web/public/data/fast_movers.json: the top N stars by total proper motion (with parallax > 0), positions
at Gaia's epoch 2016.0. The top NAMED stars get a common name from SIMBAD (matched by their Gaia DR3 identifier);
if every SIMBAD mirror is down, a hand-checked map of well-known stars is used and the rest keep "Gaia DR3 <id>".

    python -I pipeline/scripts/fetch_fast_movers.py
"""
import csv
import io
import json
import math
import pathlib
import re
import sys

import requests

GAIA = "https://gea.esac.esa.int/tap-server/tap/sync"
SIMBAD = ("https://simbad.cds.unistra.fr/simbad/sim-tap/sync", "https://simbad.harvard.edu/simbad/sim-tap/sync")
TOP, NAMED = 300, 40
OUT = pathlib.Path(__file__).resolve().parents[2] / "web" / "public" / "data" / "fast_movers.json"

# Only about 90 stars move faster than 2000 mas/yr, so the floor is 1000 and the list is cut at TOP by speed.
QUERY = (f"SELECT TOP {TOP} source_id, ra, dec, pmra, pmdec, parallax, phot_g_mean_mag, pm "
         "FROM gaiadr3.gaia_source WHERE pm > 1000 AND parallax > 0 ORDER BY pm DESC")

# Common names, keyed by Gaia DR3 source id. Each id was checked (Nov 2026) against SIMBAD's identifier list for that
# Gaia source and against the star's known position and proper motion. They are used over SIMBAD's main identifier
# (which is often a catalogue number like "HD 103095") and are the only names when SIMBAD does not answer.
# Groombridge 1830 (GJ 451) and Lalande 21185 (GJ 411) are not SIMBAD "NAME" identifiers; they were matched by hand.
HAND = {
    4472832130942575872: "Barnard's Star",      # GJ 699, 10.39"/yr
    4810594479418041856: "Kapteyn's Star",      # GJ 191, 8.64"/yr
    4034171629042489088: "Groombridge 1830",    # GJ 451 = HD 103095, 7.06"/yr, RA 178.27 Dec +37.69
    6553614253923452800: "Lacaille 9352",       # GJ 887, 6.90"/yr
    1872046609345556480: "61 Cygni A",          # GJ 820 A, 5.28"/yr
    1872046574983497216: "61 Cygni B",          # GJ 820 B, 5.18"/yr
    35227046884571776: "Teegarden's Star",      # SO J025300.5+165258, 5.12"/yr
    762815470562110464: "Lalande 21185",        # GJ 411 = HD 95735, 4.81"/yr, RA 165.83 Dec +35.95
    3864972938605115520: "Wolf 359",            # GJ 406, 4.72"/yr
    6412595290592307840: "Epsilon Indi A",      # GJ 845 A, 4.71"/yr
    6412596012146801152: "Epsilon Indi B",      # GJ 845 B/C brown-dwarf pair, 4.68"/yr
    3195919254111314816: "40 Eridani C",        # omi02 Eri C, 4.08"/yr
    3195919254111315712: "40 Eridani B",        # omi02 Eri B, 4.02"/yr
    5853498713190525696: "Proxima Centauri",    # alf Cen C, 3.86"/yr
    411413822074322432: "Mu Cassiopeiae",       # GJ 53, 3.81"/yr
    6583272171336048640: "Lacaille 8760",       # GJ 825, 3.46"/yr
    4847957293278177024: "82 Eridani",          # e Eri, GJ 139, 3.12"/yr
}


def gaia_rows():
    r = requests.post(GAIA, data=dict(REQUEST="doQuery", LANG="ADQL", FORMAT="csv", QUERY=QUERY), timeout=180)
    r.raise_for_status()
    rows = []
    for x in csv.DictReader(io.StringIO(r.text)):
        try:
            d = dict(id=int(x["source_id"]), ra=float(x["ra"]), dec=float(x["dec"]), pmra=float(x["pmra"]),
                     pmdec=float(x["pmdec"]), plx=float(x["parallax"]),
                     g=float(x["phot_g_mean_mag"]) if x["phot_g_mean_mag"] else None)
        except ValueError:
            continue
        if all(math.isfinite(d[k]) for k in ("ra", "dec", "pmra", "pmdec", "plx")) and d["plx"] > 0:
            rows.append(d)
    return rows


def _pretty(ident):
    """SIMBAD identifier to a readable name: 'NAME Barnard's star' -> "Barnard's Star", '* 61 Cyg A' -> '61 Cyg A'."""
    s = re.sub(r"\s+", " ", ident).strip()
    if s.startswith("NAME "):
        s = s[5:]
        return " ".join(w[:1].upper() + w[1:] for w in s.split(" "))
    return re.sub(r"^(\*\*?|V\*) ", "", s)


def simbad_names(ids):
    """{source_id: name} from SIMBAD, or None if no mirror answers. Prefers a 'NAME' identifier, else main_id."""
    q = ("SELECT i1.id AS gaia, b.main_id, i2.id AS alias FROM ident AS i1 JOIN basic AS b ON b.oid = i1.oidref "
         "JOIN ident AS i2 ON i2.oidref = i1.oidref WHERE i1.id IN ("
         + ",".join(f"'Gaia DR3 {i}'" for i in ids) + ")")
    for url in SIMBAD:
        try:
            r = requests.post(url, data=dict(REQUEST="doQuery", LANG="ADQL", FORMAT="csv", QUERY=q), timeout=60)
            if r.status_code != 200 or not r.text.startswith("gaia"):
                continue
        except requests.RequestException:
            continue
        main, named = {}, {}
        for x in csv.DictReader(io.StringIO(r.text)):
            sid = int(x["gaia"].split()[-1])
            main[sid] = x["main_id"]
            if x["alias"].startswith("NAME ") and sid not in named:
                named[sid] = x["alias"]
        print(f"SIMBAD answered at {url}: {len(main)} of {len(ids)} matched", file=sys.stderr)
        return {sid: _pretty(named.get(sid, m)) for sid, m in main.items()}
    return None


def main():
    rows = gaia_rows()
    top = [d["id"] for d in rows[:NAMED]]
    names = simbad_names(top)
    source = "SIMBAD" if names is not None else "nowhere (SIMBAD was down)"
    if names is None:
        print("SIMBAD did not answer; using the hand-checked name map", file=sys.stderr)
        names = {}
    stars = []
    for d in rows:
        name = HAND.get(d["id"]) or names.get(d["id"]) or f"Gaia DR3 {d['id']}"
        stars.append([name, d["id"], round(d["ra"], 7), round(d["dec"], 7), round(d["pmra"], 2), round(d["pmdec"], 2),
                      round(d["plx"], 3), None if d["g"] is None else round(d["g"], 2)])
    out = {
        "note": ("The fastest-moving stars in Gaia DR3 by total proper motion, parallax > 0. Positions are at Gaia "
                 "epoch 2016.0 (ICRS, degrees); pmra includes cos(dec); proper motion in mas/yr, parallax in mas. "
                 f"Names: common names hand-checked by Gaia DR3 id; the rest of the top {NAMED} from {source}; others are Gaia DR3 source ids."),
        "source": "Gaia DR3 gaiadr3.gaia_source via the ESA Gaia archive TAP service",
        "epoch": 2016.0,
        "fields": ["name", "source_id", "ra", "dec", "pmra", "pmdec", "parallax", "gmag"],
        "rows": stars,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")
    print(f"wrote {len(stars)} stars to {OUT}", file=sys.stderr)
    for s in stars[:12]:
        print(f"{s[0]:<28} {math.hypot(s[4], s[5]) / 1000:6.3f} arcsec/yr  plx {s[6]:8.3f}  id {s[1]}")


if __name__ == "__main__":
    main()
