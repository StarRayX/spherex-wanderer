"""Find SPHEREx frames covering a point, group them into visits, move stars to frame dates."""
import csv
import io

import astropy.units as u
import numpy as np
import requests
from astropy.coordinates import SkyCoord, get_body_barycentric
from astropy.time import Time

TAP = "https://irsa.ipac.caltech.edu/TAP/sync"

# Barnard's Star, Gaia DR3 4472832130942575872, ref epoch 2016.0.
# Fetched from the Gaia archive TAP (gaiadr3.gaia_source) on 2026-11-14.
BARNARD = dict(ra=269.44850252543836, dec=4.739420051112412, pmra=-801.5509783684709,
               pmdec=10362.394206546573, parallax=546.975939730948, epoch_from=2016.0)


def find_frames(ra, dec):
    """Frames whose footprint contains (ra, dec), sorted by time.

    'url' is the IRSA datalink URL (obscore access_url); fetch.fetch_cutout resolves it
    to the FITS URL. 'band' is e.g. SPHEREx-D3; wavelength range in metres.
    Every obs_collection is used (2026-11-14: spherex_dr1, spherex_dr1_deep, spherex_qr3, spherex_qr3_deep). They are
    separate exposures, not co-adds: no (obs_id, detector) pair repeated across them at Barnard, Kapteyn or R Dra
    (deep field). A later release re-listing an exposure would, so only the first row per (obs_id, band) is kept.
    """
    q = (f"SELECT obs_id, t_min, energy_bandpassname, em_min, em_max, access_url, s_region "
         f"FROM spherex.obscore WHERE CONTAINS(POINT('ICRS',{ra},{dec}),s_region)=1 "
         f"ORDER BY t_min")
    r = requests.post(TAP, data=dict(REQUEST="doQuery", LANG="ADQL", FORMAT="csv", QUERY=q), timeout=300)
    r.raise_for_status()
    rows = {}
    for x in csv.DictReader(io.StringIO(r.text)):
        rows.setdefault((x["obs_id"], x["energy_bandpassname"]), dict(
            obs_id=x["obs_id"], mjd=float(x["t_min"]), band=x["energy_bandpassname"], em_min=float(x["em_min"]),
            em_max=float(x["em_max"]), url=x["access_url"], s_region=x["s_region"]))
    return list(rows.values())


def group_visits(frames, gap_days=60):
    """Split frames into visits: a new visit starts after a gap above gap_days."""
    visits = []
    for f in sorted(frames, key=lambda f: f["mjd"]):
        if visits and f["mjd"] - visits[-1][-1]["mjd"] <= gap_days:
            visits[-1].append(f)
        else:
            visits.append([f])
    return visits


def parallax_offset(mjd, ra, dec, parallax):
    """Apparent parallax shift (d_ra*cos dec, d_dec) in arcsec at each mjd, for Earth's barycentric position
    (SPHEREx orbits Earth, so the offset is below 1e-4 arcsec off). parallax in mas."""
    e = get_body_barycentric("earth", Time(np.atleast_1d(mjd), format="mjd"))
    X, Y, Z = (np.asarray(c.to_value("au")) for c in (e.x, e.y, e.z))
    a, d = np.radians(ra), np.radians(dec)
    p = parallax / 1000
    return p * (X * np.sin(a) - Y * np.cos(a)), p * (X * np.cos(a) * np.sin(d) + Y * np.sin(a) * np.sin(d) - Z * np.cos(d))


def propagate(ra, dec, pmra, pmdec, parallax, epoch_from, mjd):
    """RA/Dec (deg) at each mjd, proper motion plus parallax. pm in mas/yr (pmra includes cos dec, Gaia style),
    parallax in mas, epoch_from a Julian year (Gaia DR3 = 2016.0). Radial velocity ignored (0)."""
    c = SkyCoord(ra=ra * u.deg, dec=dec * u.deg, pm_ra_cosdec=pmra * u.mas / u.yr, pm_dec=pmdec * u.mas / u.yr,
                 distance=(1000 / parallax) * u.pc, radial_velocity=0 * u.km / u.s,
                 obstime=Time(epoch_from, format="jyear"))
    n = c.apply_space_motion(new_obstime=Time(np.atleast_1d(mjd), format="mjd"))
    dra, ddec = parallax_offset(mjd, n.ra.deg, n.dec.deg, parallax)
    return n.ra.deg + dra / 3600 / np.cos(n.dec.rad), n.dec.deg + ddec / 3600


if __name__ == "__main__":
    fr = find_frames(BARNARD["ra"], BARNARD["dec"])
    print(len(fr), "frames,", len(group_visits(fr)), "visits")
