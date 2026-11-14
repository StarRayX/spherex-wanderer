from blink import jpl

FIELDS = ["Object name", "Astrometric RA (hh:mm:ss)", "Astrometric Dec (dd mm'ss\")", "Dist. from center RA (\")",
          "Dist. from center Dec (\")", "Dist. from center Norm (\")", "Visual magnitude (V)"]
OK = {"n_second_pass": 2, "fields_second": FIELDS, "data_second_pass": [
    ["15319 (1993 NU1)", "10:19:52.66", "-10 06'12.0\"", "4.E3", "-528.", "4422.", "18.5"],
    ["10193 Nishimoto (1996 PR1)", "10:16:58.22", "+10 28'34.3\"", "2.E3", "814.", "1951.", "17.4"]]}


class R:
    def __init__(s, code=200, j=None): s.status_code, s.j = code, j
    def json(s): return s.j


def test_parse_sorted(monkeypatch):
    seen = {}
    monkeypatch.setattr(jpl.requests, "get", lambda u, params, timeout: seen.update(params) or R(j=OK))
    b, why = jpl.identify(154.0, 10.4, 60908.0)
    assert why is None and [x["designation"] for x in b] == ["1996 PR1", "1993 NU1"]
    assert abs(b[0]["ra"] - 154.2426) < 1e-3 and b[1]["dec"] < -10.1 and b[0]["mag"] == 17.4
    assert seen["obs-time"] == "2460908.50000" and seen["xobs"] == "0,0,0"


def test_empty_and_503(monkeypatch):
    monkeypatch.setattr(jpl.requests, "get", lambda *a, **k: R(j={"n_second_pass": 0}))
    assert jpl.identify(1, 2, 60000) == ([], "no known bodies in the field")
    monkeypatch.setattr(jpl.requests, "get", lambda *a, **k: R(503))
    assert jpl.identify(1, 2, 60000) == ([], "JPL returned HTTP 503")
    def boom(*a, **k): raise jpl.requests.ConnectionError()
    monkeypatch.setattr(jpl.requests, "get", boom)
    assert jpl.identify(1, 2, 60000)[0] == []
