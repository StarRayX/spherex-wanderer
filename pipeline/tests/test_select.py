import shutil

import numpy as np
import pytest
from astropy.io import fits
from astropy.wcs import WCS

from blink import fetch
from blink.select import pick_frames, pixel_from_region, predict_wavelength

CORNERS = [(-0.5, -0.5), (2039.5, -0.5), (2039.5, 2039.5), (-0.5, 2039.5)]


def region(w, off=(0, 0)):
    """obscore-style s_region from a WCS: detector corners in IRSA's order (checked: 0.00 px on 25 frames)."""
    s = w.all_pix2world([(x - off[0], y - off[1]) for x, y in CORNERS], 0)
    return "POLYGON ICRS " + " ".join(f"{a} {d}" for a, d in s)


def test_pixel_from_region_pure_tan():
    w = WCS(naxis=2)
    w.wcs.ctype, w.wcs.crval, w.wcs.crpix = ["RA---TAN", "DEC--TAN"], [269.4, 4.7], [1020, 1020]
    w.wcs.pc, w.wcs.cdelt = [[0.9998, 0.02], [-0.02, 0.9998]], [-6.15 / 3600, 6.15 / 3600]
    for x, y in [(10, 30), (1000, 1500), (2030, 5)]:
        a, d = w.wcs_pix2world([[x, y]], 0)[0]
        assert np.allclose(pixel_from_region(region(w), a, d), (x, y), atol=0.01)


@pytest.mark.filterwarnings("ignore")
def test_predicted_wavelength_matches_cached_cutouts(tmp_path):
    """Truth: the cutout's own 'W' WCS at its centre pixel. Tolerance 0.01 um (seen: 0.005 max, 7 px)."""
    files = sorted(fetch.CACHE.glob("*.fits")) if fetch.CACHE.exists() else []
    if not files:
        pytest.skip("no cached cutouts")
    for p in files:  # keep the real cache untouched: tables are rebuilt from copies in tmp_path
        shutil.copy(p, tmp_path)
    n = 0
    for p in files:
        with fits.open(p) as f:
            h = f["IMAGE"].header
            if "WCS-WAVE" not in f or h["NAXIS1"] < 3:
                continue
            w, c = WCS(h), (h["NAXIS1"] - 1) / 2
            off = WCS(h, key="A").wcs_pix2world([[0, 0]], 0)[0]  # cutout pixel 0 in detector pixels
            ra, dec = w.all_pix2world([[c, c]], 0)[0]
            truth = WCS(h, fobj=f, key="W").wcs_pix2world([[c, c]], 0)[0][0]
            fr = dict(band=f"SPHEREx-D{h['DETECTOR']}", s_region=region(w, off))
        assert abs(predict_wavelength([fr], ra, dec, tmp_path)[0] - truth) < 0.01, p.name
        n += 1
    assert n


def test_pick_frames_closest_and_n():
    visits = [[{"id": i} for i in range(5)], [{"id": i} for i in range(3)], [{"id": 0}]]
    wave = [[2.4, 3.0, 3.6, 2.9, 3.2], [2.5, 3.05, 2.8], [3.5]]
    picked, pw, t = pick_frames(visits, 0, 0, 2, target_um=3.0, wave=wave)
    assert [[f["id"] for f in v] for v in picked] == [[1, 3], [1, 2], [0]]
    assert np.allclose(pw[0], [3.0, 2.9]) and picked[1][0]["wave_um"] == 3.05 and t == 3.0
    _, _, t = pick_frames(visits, 0, 0, 1, wave=wave)  # default: median of the visit medians (3.0, 2.8, 3.5)
    assert t == 3.0
