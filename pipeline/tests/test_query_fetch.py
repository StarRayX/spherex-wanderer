import numpy as np
from astropy.io import fits

from blink import fetch
from blink.query import BARNARD, group_visits, propagate


def test_group_visits():
    f = [{"mjd": m} for m in (60900, 60901, 60905, 60965.5, 60966, 61200)]
    assert [len(v) for v in group_visits(f)] == [3, 2, 1]
    f = [{"mjd": 60900}, {"mjd": 60960}, {"mjd": 61020.1}]
    assert [len(v) for v in group_visits(f)] == [2, 1]  # 60 days joins, 60.1 splits


def test_propagate_barnard():
    from blink.query import parallax_offset
    t0 = 60676.0
    ra, dec = propagate(**BARNARD, mjd=[t0, t0 + 365.25])  # 2025-01-01 and a year later
    assert abs((dec[1] - dec[0]) * 3600 - 10.36) < 0.2  # mostly Dec, ~10.4 arcsec/yr
    pr, pd = parallax_offset([60731.0, 60731.0 + 182.6], BARNARD["ra"], BARNARD["dec"], BARNARD["parallax"])
    assert 0.4 < abs(pr[1] - pr[0]) < 1.1 and abs(pr).max() < 0.56  # parallax 0.547": about +-0.5 in RA, opposite signs half a year apart
    assert pr[0] * pr[1] < 0
    ra2 = propagate(**BARNARD, mjd=[60731.0])[0]
    no_plx = propagate(**{**BARNARD, "parallax": 1e-6}, mjd=[60731.0])  # parallax ~0 (distance huge): proper motion only
    assert abs((ra2[0] - no_plx[0][0]) * 3600 * np.cos(np.radians(BARNARD["dec"])) - pr[0]) < 0.01
    assert (ra[1] - ra[0]) * 3600 < 0  # pmra is negative: -0.8"/yr, plus a little parallax


class Resp:
    def __init__(self, code, body=b""):
        self.status_code, self.body = code, body

    def raise_for_status(self):
        assert self.status_code < 400

    def iter_content(self, n):
        yield self.body

    def close(self):
        pass

    __enter__ = lambda self: self
    __exit__ = lambda self, *a: None


def test_retry_503(tmp_path, monkeypatch):
    fits.PrimaryHDU(np.zeros((2, 2))).writeto(tmp_path / "x.fits")
    body = (tmp_path / "x.fits").read_bytes()
    calls = []
    monkeypatch.setattr(fetch.requests, "get", lambda url, **kw: calls.append(url) or Resp(503 if len(calls) == 1 else 200, body))
    monkeypatch.setattr(fetch.time, "sleep", lambda s: None)
    p = fetch.fetch_cutout("http://x/a.fits", 1.0, 2.0, 2, tmp_path / "c")
    assert len(calls) == 2 and calls[0] == "http://x/a.fits?center=1.0,2.0&size=2arcmin"
    assert fits.open(p)[0].data.shape == (2, 2)
    fetch.fetch_cutout("http://x/a.fits", 1.0, 2.0, 2, tmp_path / "c")  # cache hit
    assert len(calls) == 2


def test_find_frames_keeps_one_row_per_exposure_and_detector(monkeypatch):
    """Releases are separate exposures today; if one re-lists an exposure it must not count twice."""
    from blink import query
    head = "obs_id,t_min,energy_bandpassname,em_min,em_max,access_url,s_region\n"
    row = lambda i, b, u: f"{i},60900.5,SPHEREx-{b},1e-6,1.1e-6,{u},POLYGON\n"  # noqa: E731
    body = head + row("E1", "D1", "dr1") + row("E1", "D4", "dr1") + row("E1", "D1", "dr2") + row("E2", "D1", "dr1")

    class R:
        text = body
        def raise_for_status(s): pass
    monkeypatch.setattr(query.requests, "post", lambda *a, **k: R())
    fr = query.find_frames(1.0, 2.0)
    assert [(f["obs_id"], f["band"], f["url"]) for f in fr] == [("E1", "SPHEREx-D1", "dr1"), ("E1", "SPHEREx-D4", "dr1"), ("E2", "SPHEREx-D1", "dr1")]
