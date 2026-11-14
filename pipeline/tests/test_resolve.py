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


def _no_net(*a, **k):
    raise AssertionError("network touched")


def test_alias_offline_and_case_insensitive(monkeypatch):
    monkeypatch.setattr(rs.requests, "get", _no_net)
    ra, dec, label = rs.resolve("  BARNARD'S   star ")
    assert (ra, dec, label) == (269.44850252543836, 4.739420051112412, "Barnard's Star")
    assert rs.resolve("r dra")[:2] == (248.1673783672889, 66.75500674547219)
    assert rs.resolve("WISE 0855")[2] == "WISE 0855-0714"


def test_sesame_down_is_clear(monkeypatch):
    def boom(*a, **k): raise rs.requests.ConnectionError("x")
    monkeypatch.setattr(rs.requests, "get", boom)
    with pytest.raises(ValueError, match="Name lookup is down.*coordinates"):
        rs.resolve("Vega")


def test_gaia_finds_a_fast_mover_from_its_catalogue_epoch(monkeypatch):
    """Barnard's J2000 position is 166 arcsec from Gaia's 2016 one: nothing within 5 arcsec, so the wide high-pm search
    carries each candidate back and the Gaia row (not the decoy) matches at 2000.0. Ordinary stars keep the old path."""
    head = "ra,dec,pmra,pmdec,parallax\n"
    barnard = "269.44850252543836,4.739420051112412,-801.5509783684709,10362.394206546573,546.975939730948\n"
    decoy = "269.46,4.70,300,-200,10\n"
    sent = []

    class R:
        def __init__(s, t): s.text = t
        def raise_for_status(s): pass

    def post(url, data, timeout):
        sent.append(data["QUERY"])
        return R(head if len(sent) == 1 else head + decoy + barnard)
    monkeypatch.setattr(rs.requests, "post", post)
    ra, dec, _ = rs.resolve("17:57:48.5, +04:41:36")
    a = rs.gaia_astrometry(ra, dec)
    assert a["pmdec"] > 10000 and a["matched_epoch"] == 2000.0 and a["match_arcsec"] < 1.5 and a["epoch_from"] == 2016.0
    assert "pm > 200" in sent[1] and str(rs.WIDE_ARCSEC / 3600) in sent[1]
    sent.clear()
    monkeypatch.setattr(rs.requests, "post", lambda url, data, timeout: sent.append(1) or R(head + decoy))
    assert "matched_epoch" not in rs.gaia_astrometry(269.46, 4.70) and len(sent) == 1  # found at once: no wide search
    monkeypatch.setattr(rs.requests, "post", lambda url, data, timeout: R(head + decoy if "pm >" in data["QUERY"] else head))
    assert rs.gaia_astrometry(133.79513, -7.24515) is None  # the decoy lands nowhere near: no source, not a wrong one
