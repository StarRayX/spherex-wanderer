"""Live API (served at /api/blink via the vercel.json rewrite; this file is not named blink.py so it cannot
shadow the pipeline package `blink`). See docs/API.md.
handle() is a plain function; `handler` is the Vercel Python entry point."""
import json
import math
import os
import re
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pipeline"))
from blink import build, jpl, resolve as rs  # noqa: E402

RELEASE = "qr2"
CACHE = Path(os.environ.get("BLINK_CACHE", Path(tempfile.gettempdir()) / "blink_cache"))
MAX_MB = 100
_LOCK = threading.RLock()  # guards claims and status.json I/O (a read must not see a half-written file)
STALE_S = 330  # maxDuration is 300 s: a "running" job silent for longer was killed with its function
SHOWCASE = ROOT / "web" / "public" / "showcase"
SLUGS = ("barnards-star", "epsilon-indi-b", "r-draconis", "rw-aurigae", "wise-0855")


class BadRequest(ValueError):
    pass


class GaiaDown(Exception):
    pass


def _gaia(ra, dec, radius):
    """Gaia astrometry or None (no source). Gaia being down must not look like "no source": that would
    build a static position for a fast mover."""
    try:
        return rs.gaia_astrometry(ra, dec, radius)
    except Exception as e:
        raise GaiaDown(f"Gaia lookup failed ({type(e).__name__}); try again")


def _num(q, key, lo, hi):
    try:
        v = float(q[key])
    except (KeyError, ValueError):
        raise BadRequest(f"{key} must be a number")
    if not math.isfinite(v) or not lo <= v <= hi:
        raise BadRequest(f"{key} must be in {lo}..{hi}")
    return v


def _status_path(slug):
    return CACHE / slug / "status.json"


def _write_status(slug, state, done=0, total=0, message=""):
    p = _status_path(slug)
    p.parent.mkdir(parents=True, exist_ok=True)
    with _LOCK:
        p.write_text(json.dumps(dict(state=state, done=done, total=total, message=message)))


def _read_status(slug):
    """Status dict or None. A running job nobody has touched for STALE_S seconds is reported as an error."""
    p = _status_path(slug)
    try:
        with _LOCK:
            s, age = json.loads(p.read_text()), time.time() - p.stat().st_mtime
    except (OSError, ValueError):
        return None
    if s.get("state") == "running" and age > STALE_S:
        return dict(state="error", done=s.get("done", 0), total=s.get("total", 0), message="build timed out or was killed")
    return s


def _png(rel):
    """Bytes of a cached PNG, or None. Never leaves CACHE."""
    try:
        f = (CACHE / rel).resolve()
        if CACHE.resolve() in f.parents and f.suffix == ".png" and f.is_file():
            return f.read_bytes()
    except (OSError, ValueError):  # bad characters, NUL bytes
        pass
    return None


def handle(query):
    """query: dict of str -> str. Returns (http_status, json_dict)."""
    q = {k: v[0] if isinstance(v, list) else v for k, v in query.items()}
    try:
        if "showcase" in q:  # precomputed: never touches IRSA
            if q["showcase"] not in SLUGS:
                return 404, dict(error="unknown showcase target")
            meta = json.loads((SHOWCASE / q["showcase"] / "meta.json").read_text())
            return 200, dict(meta=meta, slug=q["showcase"], urls=[f"/showcase/{q['showcase']}/{v['file']}" for v in meta["visits"]])
        if "identify" in q:
            p = q["identify"].split(",")
            if len(p) != 3:
                raise BadRequest("identify must be ra,dec,mjd")
            ra, dec, mjd = (_num({k: x}, k, lo, hi) for x, (k, lo, hi) in zip(p, [("ra", 0, 360), ("dec", -90, 90), ("mjd", 59000, 70000)]))
            fov = _num(q, "fov", 0.5, 30) if "fov" in q else 2.0
            try:
                bodies, reason = jpl.identify(ra, dec, mjd, fov_arcmin=fov)
            except Exception as e:  # JPL trouble must never 500 the page
                bodies, reason = [], f"JPL lookup failed: {type(e).__name__}"
            return 200, dict(bodies=bodies, reason=reason)
        if "status" in q:
            slug = q["status"]
            if not re.fullmatch(r"[\w.+-]{1,80}", slug):
                raise BadRequest("bad slug")
            s = _read_status(slug)
            return (200, s) if s else (404, dict(error="unknown job"))
        size = _num(q, "size", 0.5, 10) if "size" in q else 2.0
        astro = None
        if "name" in q:
            name = q["name"].strip()
            if not 1 <= len(name) <= 100:
                raise BadRequest("name must be 1..100 characters")
            try:
                ra, dec, label = rs.resolve(name)
            except ValueError as e:
                return 404, dict(error=str(e))
            _num(dict(ra=ra, dec=dec), "ra", 0, 360), _num(dict(ra=ra, dec=dec), "dec", -90, 90)
            astro = _gaia(ra, dec, 30)
        else:
            ra, dec = _num(q, "ra", 0, 360), _num(q, "dec", -90, 90)
            label = f"{ra:.5f}, {dec:+.5f}"
            astro = _gaia(ra, dec, 5)
        slug = f"{ra:.4f}_{dec:+.4f}_{size:g}_{RELEASE}"
        out = CACHE / slug
        while True:  # claim the slug, or wait while someone else is building it
            with _LOCK:
                s = _read_status(slug)
                running = bool(s and s["state"] == "running")  # meta.json may be half-written until the build finishes
                mine = not running and not (out / "meta.json").exists()
                if mine:
                    _write_status(slug, "running", 0, 0, "starting")
            if mine or not running:
                break
            time.sleep(2)
        if mine:
            try:
                build.build_target(slug, ra, dec, astro, out, max_mb=MAX_MB, size_arcmin=size, cache_dir=CACHE / "raw",
                                   progress=lambda d, t, m="": _write_status(slug, "running", d, t, m))
            except Exception as e:
                _write_status(slug, "error", message=str(e))
                return 502, dict(error=str(e), slug=slug)
            _write_status(slug, "done", message="done")
        meta = json.loads((out / "meta.json").read_text())
        urls = [f"/api/blink?file={slug}/{v['file']}" for v in meta["visits"]]
        return 200, dict(meta=meta, slug=slug, label=label, gaia=astro, urls=urls)
    except BadRequest as e:
        return 400, dict(error=str(e))
    except GaiaDown as e:
        return 502, dict(error=str(e))


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        q = parse_qs(urlparse(self.path).query)
        if "file" in q:  # serve a cached PNG
            body = _png(q["file"][0])
            code, ctype = (200, "image/png") if body else (404, "application/json")
            body = body or b"{}"
        else:
            code, d = handle(q)
            body, ctype = json.dumps(d).encode(), "application/json"
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.end_headers()
        self.wfile.write(body)
