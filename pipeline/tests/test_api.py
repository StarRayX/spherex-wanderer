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
REAL_BUILD = api.build.build_target  # before any fixture swaps it


@pytest.fixture
def fake(tmp_path, monkeypatch):
    calls = []

    def build_target(slug, ra, dec, astrometry, out_dir, band=None, max_mb=100, frames_per_visit=3,
                     size_arcmin=2.0, progress=None, cache_dir=None, **kw):
        calls.append((slug, max_mb, size_arcmin, *kw.values()))
        assert Path(cache_dir) == api.CACHE / "raw"  # raw cutouts go to the writable cache, not the repo
        progress(1, 2, "half")
        assert json.loads((api.CACHE / slug / "status.json").read_text())["done"] == 1
        Path(out_dir).mkdir(parents=True, exist_ok=True)
        meta = {"slug": slug, "visits": [{"file": "visit_00.png"}, {"file": "visit_01.png"}, {"file": "visit_02.png"}],
                "differences": [{"file": "diff_00_01.png"}, {"file": None, "skipped": "colour"}]}
        (Path(out_dir) / "meta.json").write_text(json.dumps(meta))
        return meta

    monkeypatch.setattr(api, "CACHE", tmp_path)
    monkeypatch.setattr(api.build, "build_target", build_target)
    monkeypatch.setattr(api.rs, "gaia_astrometry", lambda ra, dec, r=5: None)
    monkeypatch.setattr(api.rs, "resolve", lambda n: (269.45, 4.73, n))
    return calls


@pytest.mark.parametrize("q", [dict(ra="abc", dec="1"), dict(ra="400", dec="1"), dict(ra="1", dec="-91"),
                               dict(ra="nan", dec="1"), dict(ra="1", dec="1", size="11"),
                               dict(ra="1", dec="1", size="0.1"), dict(name="x" * 101), dict(name=" "),
                               dict(ra="1", dec="1", spectrum="yes")])
def test_rejects_bad(fake, q):
    assert api.handle(q)[0] == 400 and not fake


def test_cache_and_status(fake):
    code, r = api.handle(dict(ra="269.45", dec="4.73", size="2"))
    assert code == 200 and fake == [(r["slug"], 100 - api.TABLE_MB, 2.0, True)]  # wavelength-matched
    assert r["urls"] == [f"/api/blink?file={r['slug']}/{f}" for f in ("visit_00.png", "visit_01.png", "visit_02.png", "diff_00_01.png")]
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
    code, r = api.handle(dict(showcase="barnards-star"))  # difference PNGs follow the visits, and exist
    assert r["urls"][len(r["meta"]["visits"]):] == ["/showcase/barnards-star/diff_00_01.png", "/showcase/barnards-star/diff_01_02.png"]
    assert all((api.SHOWCASE.parent / u.lstrip("/")).is_file() for u in r["urls"])
    assert api.handle(dict(showcase="../x"))[0] == 404 and api.handle(dict(showcase="nope"))[0] == 404
    assert not fake  # showcase never builds
    code, r = api.handle({"ra": ["269.45"], "dec": ["4.73"]})  # list-valued like parse_qs
    assert code == 200 and r["slug"] == "269.4500_+4.7300_6" and len(fake) == 1
    assert api.handle(dict(ra="269.45", dec="4.73"))[1]["urls"] == r["urls"] and len(fake) == 1


def test_file_cannot_escape_cache(fake):
    (api.CACHE / "s").mkdir()
    (api.CACHE / "s" / "visit_00.png").write_bytes(b"png")
    (api.CACHE.parent / "secret.png").write_bytes(b"x")
    (api.CACHE / "s" / "meta.json").write_text("{}")
    assert api._png("s/visit_00.png") == b"png"
    for bad in ["../secret.png", "s/../../secret.png", str(api.CACHE.parent / "secret.png"), "s/meta.json", "s\x00.png", "s", ""]:
        assert api._png(bad) is None, bad


def test_stale_running_job_reads_as_error(fake):
    import os
    api._write_status("old", "running", 1, 3, "visit 2/3")
    assert api.handle(dict(status="old"))[1]["state"] == "running"
    p = api._status_path("old")
    os.utime(p, (p.stat().st_atime, p.stat().st_mtime - api.STALE_S - 1))  # function was killed at maxDuration
    code, s = api.handle(dict(status="old"))
    assert code == 200 and s["state"] == "error" and "timed out" in s["message"]


def test_same_slug_builds_once(fake, monkeypatch):
    import threading
    from time import sleep
    monkeypatch.setattr(api.time, "sleep", lambda s: sleep(0.01))  # waiters poll fast
    real, out = api.build.build_target, []

    def slow(*a, **k):
        sleep(0.2)
        return real(*a, **k)
    monkeypatch.setattr(api.build, "build_target", slow)
    ts = [threading.Thread(target=lambda: out.append(api.handle(dict(ra="269.45", dec="4.73")))) for _ in range(3)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert len(fake) == 1 and [c for c, _ in out] == [200] * 3


def test_waiter_ignores_half_written_meta(fake, monkeypatch):
    """Deterministic interleaving: meta.json exists but is empty while the build is still running."""
    import threading
    half, finish = threading.Event(), threading.Event()
    real, out = api.build.build_target, []

    def build(slug, ra, dec, astro, out_dir, **k):
        Path(out_dir).mkdir(parents=True, exist_ok=True)
        (Path(out_dir) / "meta.json").write_text("")  # torn write
        k["progress"](1, 2, "half")
        half.set()
        assert finish.wait(5)
        return real(slug, ra, dec, astro, out_dir, **k)
    monkeypatch.setattr(api.build, "build_target", build)
    monkeypatch.setattr(api.time, "sleep", lambda s: None)
    q = dict(ra="269.45", dec="4.73")
    a = threading.Thread(target=lambda: out.append(api.handle(q)))
    a.start()
    assert half.wait(5)
    b = threading.Thread(target=lambda: out.append(api.handle(q)))
    b.start()
    b.join(0.3)
    assert b.is_alive()  # waiting, not reading the empty meta.json and not building
    finish.set()
    a.join(5), b.join(5)
    assert len(fake) == 1 and [c for c, _ in out] == [200, 200]


def test_failed_build_can_be_retried_and_gaia_down_is_502(fake, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("irsa")
    good = api.build.build_target
    monkeypatch.setattr(api.build, "build_target", boom)
    assert api.handle(dict(ra="1", dec="1"))[0] == 502
    monkeypatch.setattr(api.build, "build_target", good)
    assert api.handle(dict(ra="1", dec="1"))[0] == 200  # an error status does not block a retry
    monkeypatch.setattr(api.rs, "gaia_astrometry", lambda *a: boom())
    code, r = api.handle(dict(ra="2", dec="2"))
    assert code == 502 and "Gaia" in r["error"] and len(fake) == 1  # no build started


def test_file_serves_difference_png(fake):
    (api.CACHE / "s").mkdir()
    (api.CACHE / "s" / "diff_00_01.png").write_bytes(b"d")
    assert api._png("s/diff_00_01.png") == b"d" and api._png("s/../s/diff_00_01.png") == b"d"
    assert api._png("../s/diff_00_01.png") is None


def test_spectrum_param(fake):
    code, r = api.handle(dict(ra="269.45", dec="4.73", spectrum="1"))
    assert code == 200 and r["slug"] == "269.4500_+4.7300_6_spec"  # its own cache key: a plain build has no spectrum
    assert fake == [(r["slug"], api.MAX_MB - api.SPECTRUM_MB - api.TABLE_MB, 6.0, True, True, api.SPECTRUM_MB)]
    assert api.handle(dict(ra="269.45", dec="4.73", spectrum="0"))[1]["slug"] == "269.4500_+4.7300_6"


def test_spectrum_budget_refusal(fake, monkeypatch):
    """spectrum=1 with the real build: refused before any download when a spectrum's cutouts exceed SPECTRUM_MB."""
    b = api.build
    if REAL_BUILD is None:
        pytest.skip("blink.build stubbed")
    fr = [dict(mjd=60000 + i, band=f"SPHEREx-D{1 + i % 6}", url=f"http://x/{i}", em_min=0, em_max=1) for i in range(12)]
    monkeypatch.setattr(b, "build_target", REAL_BUILD)
    monkeypatch.setattr(b, "find_frames", lambda ra, dec: fr)
    monkeypatch.setattr(b.fetch, "fetch_many", lambda *a, **k: pytest.fail("downloaded despite refusal"))
    monkeypatch.setattr(api, "SPECTRUM_MB", 20)  # 12 new spectrum cutouts, about 49 MB
    code, r = api.handle(dict(ra="10", dec="10", spectrum="1"))
    assert code == 502 and "refusing" in r["error"]


def test_live_matches_wavelength_and_falls_back_honestly(fake, monkeypatch):
    """Live builds ask for wavelength matching; if matching fails inside build.plan (before any download) the build is
    redone with frames picked by time and meta.notes says so. Gaia's extra match keys never reach build_target."""
    seen, real = [], api.build.build_target
    monkeypatch.setattr(api.rs, "gaia_astrometry", lambda ra, dec, r=5: dict(
        ra=1.0, dec=1.0, pmra=0.0, pmdec=900.0, parallax=50.0, epoch_from=2016.0, matched_epoch=2000.0, match_arcsec=0.4))

    def build(slug, ra, dec, astro, out_dir, match_wavelength=False, **k):
        seen.append((match_wavelength, sorted(astro)))
        if match_wavelength:
            def plan():
                raise IndexError("no s_region")
            plan()
        return real(slug, ra, dec, astro, out_dir, **k)
    monkeypatch.setattr(api.build, "build_target", build)
    code, r = api.handle(dict(ra="1", dec="1"))
    assert code == 200 and [s[0] for s in seen] == [True, False] and r["gaia"]["matched_epoch"] == 2000.0
    assert seen[0][1] == sorted(api.ASTRO)
    assert "Wavelength matching failed (IndexError)" in r["meta"]["notes"][-1]
    assert "Wavelength matching failed" in json.loads((api.CACHE / r["slug"] / "meta.json").read_text())["notes"][-1]

    def other(*a, **k):
        raise RuntimeError("irsa")  # any other failure is not retried
    monkeypatch.setattr(api.build, "build_target", other)
    assert api.handle(dict(ra="2", dec="2"))[0] == 502


def test_unexpected_error_is_json_500_without_details(fake, monkeypatch, capsys):
    def boom(n):
        raise RuntimeError("secret /tmp/path")
    monkeypatch.setattr(api.rs, "resolve", boom)  # e.g. a Sesame parse error
    code, r = api.handle(dict(name="x"))
    assert code == 500 and r == dict(error="internal error")
    assert "secret" not in json.dumps(r) and "RuntimeError" in capsys.readouterr().err  # logged, not returned


def test_missing_showcase_meta_is_json_500(fake, monkeypatch, tmp_path):
    monkeypatch.setattr(api, "SHOWCASE", tmp_path)  # no meta.json inside
    assert api.handle(dict(showcase="wise-0855")) == (500, dict(error="internal error"))
