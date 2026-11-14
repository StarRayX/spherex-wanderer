"""Known solar-system bodies inside a small field at an observation time (JPL SB Identification API)."""
import math
import re

import requests

URL = "https://ssd-api.jpl.nasa.gov/sb_ident.api"
# Observer: geocentre (xobs position 0,0,0). The API's mpc-code route rejects '500 geocentric' and has no SPHEREx
# code; SPHEREx is ~700 km up, so its parallax versus the geocentre only matters for very near bodies (NEOs).


def _hms(deg):
    h = deg / 15
    return f"{int(h):02d}-{int(h % 1 * 60):02d}-{h % 1 * 3600 % 60:05.2f}"


def _dms(deg):
    a = abs(deg)
    return f"{'M' if deg < 0 else ''}{int(a):02d}-{int(a % 1 * 60):02d}-{a % 1 * 3600 % 60:05.2f}"


def _sex(s):
    """'10:16:58.22' or '+10 28\'34.3"' to a signed float of its first unit."""
    p = [float(x) for x in re.findall(r"\d+\.?\d*", s)]
    v = p[0] + p[1] / 60 + p[2] / 3600
    return -v if s.strip().startswith("-") else v


def identify(ra, dec, mjd, fov_arcmin=2.0, vmag_lim=None, timeout=60):
    """(bodies, reason): bodies = [{name, designation, ra, dec, mag, distance_arcsec}] nearest first, degrees.

    reason is None on success, else why bodies is empty (API error, no match). Never raises for HTTP errors.
    """
    hw = fov_arcmin / 120
    q = dict(xobs="0,0,0", **{"obs-time": f"{mjd + 2400000.5:.5f}", "fov-ra-center": _hms(ra % 360),
             "fov-dec-center": _dms(dec), "fov-ra-hwidth": f"{hw / max(math.cos(math.radians(dec)), 0.05):.6f}",
             "fov-dec-hwidth": f"{hw:.6f}", "two-pass": "true", "suppress-first-pass": "true",
             "mag-required": "true", "req-elem": "false"})
    if vmag_lim:
        q["vmag-lim"] = vmag_lim
    try:
        r = requests.get(URL, params=q, timeout=timeout)
        if r.status_code != 200:
            return [], f"JPL returned HTTP {r.status_code}"
        j = r.json()
    except (requests.RequestException, ValueError) as e:
        return [], f"JPL request failed: {type(e).__name__}"
    cols, rows = j.get("fields_second"), j.get("data_second_pass") or []
    if not cols or not rows:
        return [], "no known bodies in the field" if j.get("n_second_pass", 0) == 0 else "unexpected JPL response"
    i = {c.split(" (")[0]: k for k, c in enumerate(cols)}
    out = []
    for row in rows:
        m = re.fullmatch(r"(.*?)\s*\((.*)\)", row[i["Object name"]])
        out.append(dict(name=row[i["Object name"]], designation=m.group(2) if m else row[i["Object name"]],
                        ra=_sex(row[i["Astrometric RA"]]) * 15, dec=_sex(row[i["Astrometric Dec"]]),
                        mag=float(row[i["Visual magnitude"]]), distance_arcsec=float(row[i["Dist. from center Norm"]])))
    return sorted(out, key=lambda b: b["distance_arcsec"]), None


if __name__ == "__main__":  # live smoke check: one small field near the ecliptic, 2025-08-21
    print(identify(340.0, -10.0, 60908.0, fov_arcmin=60, vmag_lim=18.5))
