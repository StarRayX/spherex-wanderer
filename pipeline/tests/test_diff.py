import numpy as np
import pytest

from blink import fetch
from blink.diff import difference
from blink.stack import stack_visit, wavelength_at


def star(x, y, amp=50.0, n=31, sig=1.0, bg=0.0):
    yy, xx = np.indices((n, n))
    return bg + amp * np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (2 * sig ** 2))


def visit(mover_y, bg, seed):
    return star(8, 8, 200) + star(20, mover_y) + bg + np.random.default_rng(seed).normal(0, 0.2, (31, 31))


def test_mover_gives_pair_static_star_cancels():
    a, b = visit(15.0, 3.0, 1), visit(19.0, 7.0, 2)  # different backgrounds, mover shifts 4 px, static star at (8, 8)
    a[0, 0] = np.nan
    r = difference(a, b, 2.30, 2.31)
    s = r["snr"]
    assert r["sigma"] == pytest.approx(0.2 * np.sqrt(2), rel=0.25) and r["n_masked"] == 1 and r["wave_checked"]
    assert s[19, 20] > 5 and s[15, 20] < -5  # brighter in B where it went, in A where it was
    assert np.nanmax(np.abs(s[4:13, 4:13])) < 5  # amp-200 static star leaves nothing
    y, x = np.nonzero(np.abs(np.nan_to_num(s)) > 5)
    assert (np.abs(x - 20) <= 3).all() and ((y >= 12) & (y <= 22)).all()  # nothing flagged away from the mover


def test_refuses_different_colours_and_grids():
    a = visit(15.0, 0, 1)
    with pytest.raises(ValueError, match="colours"):
        difference(a, a, 2.30, 2.40)
    with pytest.raises(ValueError, match="grids"):
        difference(a, a[:-1])
    assert not difference(a, a)["wave_checked"]  # no wavelengths given: allowed, but said


@pytest.mark.filterwarnings("ignore")
@pytest.mark.filterwarnings("ignore")
def test_real_static_stars_mostly_cancel():
    """Two cached 10' D4 frames, both 2.432 um at Barnard, 34 days apart: field stars must not light up."""
    pa, pb = (fetch.CACHE / f"{h}.fits" for h in ("0e4dca40a75a9446e679", "89e31e317c54fd9e6484"))
    if not (pa.exists() and pb.exists()):
        pytest.skip("Barnard 10' cutouts not cached")
    ra, dec = 269.4462, 4.768
    (a, w), (b, _) = stack_visit([pa], ra, dec, 91), stack_visit([pb], ra, dec, 91)
    s = np.nan_to_num(difference(a, b, wavelength_at(pa, ra, dec), wavelength_at(pb, ra, dec))["snr"])
    yy, xx = np.indices(s.shape)
    far = np.hypot(xx - 45, yy - 45) > 10  # away from Barnard's Star
    x, y = (int(round(float(c))) for c in w.world_to_pixel_values(269.420352, 4.731636))
    assert np.abs(s[y - 2:y + 3, x - 2:x + 3]).max() < 5  # the K=10.4 validation star, peak ~350x sky noise
    assert (np.abs(s[far]) > 5).sum() < 40  # of ~8000 px (22 seen; 286 without the frac term)


@pytest.mark.filterwarnings("ignore")
def test_barnard_cached_visits_show_northward_pair():
    """Two cached D6 frames of Barnard's Star, 4.889 and 4.901 um, 355 days apart: it moves ~10 arcsec (1.6 px) north."""
    pa, pb = (fetch.CACHE / f"{h}.fits" for h in ("a8f35e79117160b4d220", "83fd2ae6d7180c001a5b"))
    if not (pa.exists() and pb.exists()):
        pytest.skip("Barnard cutouts not cached")
    ra, dec = 269.4462, 4.768
    (a, _), (b, _) = stack_visit([pa], ra, dec, 19), stack_visit([pb], ra, dec, 19)
    s = np.nan_to_num(difference(a, b, wavelength_at(pa, ra, dec), wavelength_at(pb, ra, dec))["snr"])
    (ya, xa), (yb, xb) = np.argwhere(s < -5).mean(0), np.argwhere(s > 5).mean(0)  # where it was, where it went
    assert abs(xb - xa) < 0.5 and 1 <= yb - ya <= 5  # +y is north on target_wcs
