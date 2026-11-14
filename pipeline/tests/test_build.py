import importlib
import json
import sys
from pathlib import Path

import numpy as np
import pytest
from astropy.io import fits

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
if not hasattr(sys.modules.get("blink.build"), "__file__"):  # test_api.py may have left a stub module in place
    sys.modules.pop("blink.build", None)
    sys.modules.pop("build_showcase", None)
build = importlib.import_module("blink.build")
import build_showcase as bs  # noqa: E402
from blink.stack import target_wcs  # noqa: E402

RA, DEC = 120.0, -10.0


def test_registry():
    assert set(bs.TARGETS) == {"barnards-star", "epsilon-indi-b", "wise-0855", "rw-aurigae", "r-draconis"}
    for t in bs.TARGETS.values():
        assert {"ra", "dec", "pmra", "pmdec", "parallax", "epoch_from"} <= t["astrometry"].keys()
        assert t["source"] and t["claim"] and t["band"].startswith("SPHEREx-D")
        n = bs.MAX_MB // build.cutout_mb(t.get("size_arcmin", 2.0))
        assert n * build.cutout_mb(t.get("size_arcmin", 2.0)) <= bs.MAX_MB  # planner cap fits the budget
    w = bs.TARGETS["wise-0855"]
    assert "Not in Gaia" in w["source"] and w["astrometry"]["parallax"] == 439.0
    # the challenge coordinates are the WISE epoch (2010.338) position: moving the J2000 entry there must land on them
    from astropy.time import Time
    from blink.query import propagate
    ra, dec = propagate(**w["astrometry"], mjd=Time(2010.338, format="jyear").mjd)
    assert abs(ra[0] - (8 + 55 / 60 + 10.831 / 3600) * 15) * 3600 * 0.9885 < 1.0
    assert abs(dec[0] - (-(7 + 14 / 60 + 42.53 / 3600))) * 3600 < 1.0


def test_plan_band_cap_split():
    fr = [dict(mjd=60000 + i, band="SPHEREx-D2" if i % 3 else "SPHEREx-D1") for i in range(20)]  # one 19-day visit
    fr += [dict(mjd=60300 + 2 * i, band="SPHEREx-D2") for i in range(60)]  # 118 days: cut into 30-day bins
    band, v = build.plan(fr, None, 3, 100)
    assert band == "SPHEREx-D2" and len(v) == 5 and all(len(x) == 3 for x in v)
    assert v[0][0]["mjd"] == 60001 and v[0][-1]["mjd"] == 60019  # spread over the visit
    band, v = build.plan(fr, "SPHEREx-D1", 2, 7)  # D1 only in the first visit; cap 7 frames
    assert band == "SPHEREx-D1" and len(v) == 1
    assert len(build.plan(fr, None, 2, 6)[1]) == 3  # 6 frames / 2 per visit: 3 of 5 visits kept


def test_plan_target_wavelength(monkeypatch):
    import blink.pick as sel
    fr = [dict(mjd=60000 + 200 * v + i, band="SPHEREx-D6", wl=4.4 + 0.05 * i) for v in range(2) for i in range(12)]
    monkeypatch.setattr(sel, "predict_wavelength", lambda v, ra, dec: np.array([f["wl"] for f in v]))
    _, v = build.plan(fr, "SPHEREx-D6", 2, 100, 0, 0, match_wavelength=True, target_um=4.9)
    assert all(sorted(round(f["wave_um"], 2) for f in x) == [4.85, 4.9] for x in v)


def test_budget_refusal(monkeypatch, tmp_path):
    assert build.check_budget(10, 4.0, 60) == 40
    with pytest.raises(build.BudgetError):
        build.check_budget(16, 4.0, 60)
    fr = [dict(mjd=60000 + i, band="SPHEREx-D1", url=f"http://x/{i}", em_min=0, em_max=1) for i in range(30)]
    monkeypatch.setattr(build, "find_frames", lambda ra, dec: fr)
    monkeypatch.setattr(build.fetch, "fetch_many", lambda jobs, cache_dir=None: pytest.fail("downloaded despite refusal"))
    monkeypatch.setattr(build.fetch, "CACHE", tmp_path)
    with pytest.raises(build.BudgetError):
        build.build_target("t", RA, DEC, None, tmp_path / "out", max_mb=10, frames_per_visit=30)


def _fake_cutouts(tmp_path, n, star):
    """Noise-only (or with a star at the centre) cutouts with IMAGE, FLAGS, VARIANCE on a 19x19 grid."""
    rng = np.random.default_rng(0)
    hdr = target_wcs(RA, DEC, 19).to_header()
    yy, xx = np.indices((19, 19))
    paths = []
    for i in range(n):
        img = 1.0 + rng.normal(0, 0.1, (19, 19))
        if star:
            img += 20 * np.exp(-((xx - 9) ** 2 + (yy - 9) ** 2) / 2)
        p = tmp_path / f"c{i}.fits"
        fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU(img.astype("f4"), hdr, name="IMAGE"),
                      fits.ImageHDU(np.zeros((19, 19), "i4"), name="FLAGS"),
                      fits.ImageHDU(np.full((19, 19), 0.01, "f4"), name="VARIANCE")]).writeto(p)
        paths.append(p)
    return paths


@pytest.mark.parametrize("star", [False, True])
def test_detection_path(monkeypatch, tmp_path, star):
    fr = [dict(mjd=60000 + 200 * v + i, band="SPHEREx-D1", url=f"http://x/{v}{i}", em_min=0.9e-6, em_max=1.1e-6)
          for v in range(3) for i in range(2)]
    paths = _fake_cutouts(tmp_path, 2, star)
    monkeypatch.setattr(build, "find_frames", lambda ra, dec: fr)
    dirs = []
    monkeypatch.setattr(build.fetch, "fetch_many", lambda jobs, cache_dir=None: dirs.append(cache_dir) or paths[:len(jobs)])
    monkeypatch.setattr(build, "wavelength_at", lambda p, ra, dec: 1.0)
    monkeypatch.setattr(build.fetch, "CACHE", tmp_path)
    calls = []
    meta = build.build_target("t", RA, DEC, None, tmp_path / "out", frames_per_visit=2, cache_dir=tmp_path / "raw",
                              progress=lambda d, t, m: calls.append((d, t)))
    on_disk = json.loads((tmp_path / "out" / "meta.json").read_text())
    assert len(on_disk["visits"]) == 3 and calls[-1][0] == calls[-1][1]
    if star:
        assert all(v["star_xy"] == pytest.approx([10, 10], abs=0.3) for v in on_disk["visits"])
        assert on_disk["photometry"][0]["aperture_mjy"] > 10 * on_disk["photometry"][0]["error_mjy"]
    else:  # empty field: no marker anywhere, said in flags and notes
        assert all(v["star_xy"] is None and v["flags_summary"].startswith("not detected") for v in on_disk["visits"])
        assert on_disk["detected"] == [False] * 3 and any("Not detected in 3 of 3" in n for n in on_disk["notes"])
    assert on_disk["motion"] is None and meta["slug"] == "t"
    assert set(dirs) == {tmp_path / "raw"}  # cutouts go where the caller says (API: writable cache)
    assert any("No Gaia source" in n for n in on_disk["notes"])  # honest: fixed position, no motion claim


def test_photometry_registry():
    rw, rd = bs.TARGETS["rw-aurigae"], bs.TARGETS["r-draconis"]
    assert rw["band"] == "SPHEREx-D1" and rw["target_um"] == 0.75 and rw["photometry"] == "light_curve"
    assert rd["photometry"] is None


def test_light_curve_and_saturated_meta(monkeypatch, tmp_path):
    from blink import photometry
    paths = _fake_cutouts(tmp_path, 2, True)
    with fits.open(paths[1], mode="update") as h:  # second frame: saturated core
        h["FLAGS"].data[9, 9] = 2
    monkeypatch.setattr(photometry, "wavelength_at", lambda p, ra, dec: 0.75)
    for p, m in zip(paths, (60000.0, 60200.0)):
        with fits.open(p, mode="update") as h:
            h["IMAGE"].header["DETECTOR"], h["IMAGE"].header["MJD-AVG"] = 1, m
    lc = photometry.light_curve(paths, RA, DEC, wave_um=0.75)
    assert len(lc["rows"]) == 1 and lc["dropped_saturated"] == 1 and lc["rows"][0]["flux_mjy"] > 0

    fr = [dict(mjd=60000 + 200 * v, band="SPHEREx-D1", url=f"http://x/{v}", em_min=0.7e-6, em_max=1.1e-6) for v in range(2)]
    monkeypatch.setattr(build, "find_frames", lambda ra, dec: fr)
    monkeypatch.setattr(build.fetch, "fetch_many", lambda jobs, cache_dir=None: paths[:len(jobs)])
    monkeypatch.setattr(build, "wavelength_at", lambda p, ra, dec: 0.75)
    monkeypatch.setattr(build.fetch, "CACHE", tmp_path)
    meta = build.build_target("t", RA, DEC, None, tmp_path / "out", frames_per_visit=1, photometry=None)
    assert meta["photometry"] is None and not any("Not a light curve" in n and "lower" in n for n in meta["notes"])
    meta = build.build_target("t", RA, DEC, None, tmp_path / "out2", frames_per_visit=1, photometry="light_curve", target_um=0.75)
    assert meta["photometry"]["wave_um"] == 0.75 and "rows" in meta["photometry"]
