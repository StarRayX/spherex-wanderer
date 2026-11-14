import numpy as np
from astropy.io import fits

from blink import fetch
from blink.query import BARNARD, group_visits, propagate


def test_group_visits():
    f = [{"mjd": m} for m in (60900, 60901, 60905, 60925.5, 60926, 61100)]
    assert [len(v) for v in group_visits(f)] == [3, 2, 1]  # 20 days apart exactly joins, 20.5 splits
    f = [{"mjd": 60900}, {"mjd": 60920}, {"mjd": 60940.1}]
    assert [len(v) for v in group_visits(f)] == [2, 1]


def test_propagate_barnard():
    ra, dec = propagate(**BARNARD, mjd=[60676.0, 60676.0 + 365.25])  # 2025-01-01 and a year later
    assert abs((dec[1] - dec[0]) * 3600 - 10.36) < 0.2  # mostly Dec, ~10.4 arcsec/yr
    assert abs((ra[1] - ra[0]) * 3600) < 1.5


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
