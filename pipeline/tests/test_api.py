import importlib.util
import json
import sys
import types
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "pipeline"))
import blink  # noqa: E402  the pipeline package

try:
    import blink.build  # noqa: E402,F401
except ImportError:  # only stub when the real module cannot import
    sys.modules["blink.build"] = blink.build = types.SimpleNamespace(build_target=None)
spec = importlib.util.spec_from_file_location("api_live", ROOT / "api" / "live.py")
api = importlib.util.module_from_spec(spec)
spec.loader.exec_module(api)


@pytest.fixture
def fake(tmp_path, monkeypatch):
    calls = []

    def build_target(slug, ra, dec, astrometry, out_dir, band=None, max_mb=100, frames_per_visit=3,
                     size_arcmin=2.0, progress=None):
        calls.append((slug, max_mb, size_arcmin))
        progress(1, 2, "half")
        assert json.loads((api.CACHE / slug / "status.json").read_text())["done"] == 1
        Path(out_dir).mkdir(parents=True, exist_ok=True)
        meta = {"slug": slug, "visits": [{"file": "visit_00.png"}]}
        (Path(out_dir) / "meta.json").write_text(json.dumps(meta))
        return meta

    monkeypatch.setattr(api, "CACHE", tmp_path)
    monkeypatch.setattr(api.build, "build_target", build_target)
    monkeypatch.setattr(api.rs, "gaia_astrometry", lambda ra, dec, r=5: None)
    monkeypatch.setattr(api.rs, "resolve", lambda n: (269.45, 4.73, n))
    return calls


@pytest.mark.parametrize("q", [dict(ra="abc", dec="1"), dict(ra="400", dec="1"), dict(ra="1", dec="-91"),
                               dict(ra="nan", dec="1"), dict(ra="1", dec="1", size="11"),
                               dict(ra="1", dec="1", size="0.1"), dict(name="x" * 101), dict(name=" ")])
def test_rejects_bad(fake, q):
    assert api.handle(q)[0] == 400 and not fake


def test_cache_and_status(fake):
    code, r = api.handle(dict(ra="269.45", dec="4.73", size="2"))
    assert code == 200 and r["urls"] and fake == [(r["slug"], 100, 2.0)]
    assert api.handle(dict(ra="269.45", dec="4.73", size="2"))[0] == 200
    assert len(fake) == 1  # served from disk
    code, s = api.handle(dict(status=r["slug"]))
    assert code == 200 and s["state"] == "done"
    assert api.handle(dict(status="nope"))[0] == 404


def test_name(fake):
    assert api.handle(dict(name="Barnard's Star"))[1]["label"] == "Barnard's Star"


@pytest.mark.parametrize("q", ["1,2", "a,1,60000", "400,1,60000", "1,91,60000", "1,1,58000", "1,1,nan", "1,1,60000&fov=0.1"])
def test_identify_rejects(fake, q):
    qq = dict(identify=q.split("&")[0])
    if "&fov=" in q:
        qq["fov"] = q.split("=")[-1]
    assert api.handle(qq)[0] == 400


def test_identify_ok_and_degrades(fake, monkeypatch):
    monkeypatch.setattr(api.jpl, "identify", lambda ra, dec, mjd, fov_arcmin=2.0: ([{"name": "x"}], None))
    assert api.handle(dict(identify="10,-5,60800", fov="3")) == (200, dict(bodies=[{"name": "x"}], reason=None))

    def down(*a, **k):
        raise RuntimeError("boom")
    monkeypatch.setattr(api.jpl, "identify", down)
    code, r = api.handle(dict(identify="10,-5,60800"))
    assert code == 200 and r["bodies"] == [] and "RuntimeError" in r["reason"]


def test_showcase_and_end_to_end(fake):
    code, r = api.handle(dict(showcase="wise-0855"))
    assert code == 200 and r["meta"]["slug"] == "wise-0855" and r["urls"][0] == "/showcase/wise-0855/visit_00.png"
    assert api.handle(dict(showcase="../x"))[0] == 404 and api.handle(dict(showcase="nope"))[0] == 404
    assert not fake  # showcase never builds
    code, r = api.handle({"ra": ["269.45"], "dec": ["4.73"]})  # list-valued like parse_qs
    assert code == 200 and r["slug"] == "269.4500_+4.7300_2_qr2" and len(fake) == 1
    assert api.handle(dict(ra="269.45", dec="4.73"))[1]["urls"] == r["urls"] and len(fake) == 1
