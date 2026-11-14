import os

import pytest

from blink import resolve as rs


def test_coords_decimal_and_sexagesimal():
    assert rs.resolve("269.4485, 4.7394")[:2] == (269.4485, 4.7394)
    ra, dec, _ = rs.resolve("17:57:48.5, +04:41:36")
    assert ra == pytest.approx(269.4521, abs=1e-3) and dec == pytest.approx(4.6933, abs=1e-3)


def test_name_parse_and_not_found(monkeypatch):
    class R:
        def __init__(s, t): s.text = t
        def raise_for_status(s): pass
    monkeypatch.setattr(rs.requests, "get", lambda *a, **k: R("#=S=Simbad\n%J 269.45 +4.73 = 17:57 +04:43\n"))
    assert rs.resolve("x") == (269.45, 4.73, "x")
    monkeypatch.setattr(rs.requests, "get", lambda *a, **k: R("#!Simbad: nothing\n"))
    with pytest.raises(ValueError):
        rs.resolve("zzz")


@pytest.mark.skipif(not os.environ.get("LIVE"), reason="set LIVE=1 for network")
def test_live_barnard():
    ra, dec, _ = rs.resolve("Barnard's Star")
    assert ra == pytest.approx(269.45, abs=0.01)
    a = rs.gaia_astrometry(ra, dec, 30)
    assert a and a["pmdec"] > 10000
