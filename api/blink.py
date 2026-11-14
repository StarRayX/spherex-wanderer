"""Live API. GET /api/blink?ra=&dec=&size=  or  ?name=&size=   -> meta + PNG urls (runs the pipeline, cached)
                GET /api/blink?status=<slug>                    -> {"done","total","message","state"}
Stdlib only: handle() is a plain function; `handler` is the Vercel Python entry point."""
import json
import math
import os
import re
import sys
import tempfile
from http.server import BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "pipeline"))
from blink import build, resolve as rs  # noqa: E402

RELEASE = "qr2"
CACHE = Path(os.environ.get("BLINK_CACHE", Path(tempfile.gettempdir()) / "blink_cache"))
MAX_MB = 100


class BadRequest(ValueError):
    pass


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
    p.write_text(json.dumps(dict(state=state, done=done, total=total, message=message)))


def handle(query):
    """query: dict of str -> str. Returns (http_status, json_dict)."""
    q = {k: v[0] if isinstance(v, list) else v for k, v in query.items()}
    try:
        if "status" in q:
            slug = q["status"]
            if not re.fullmatch(r"[\w.+-]{1,80}", slug):
                raise BadRequest("bad slug")
            p = _status_path(slug)
            return (200, json.loads(p.read_text())) if p.exists() else (404, dict(error="unknown job"))
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
            astro = rs.gaia_astrometry(ra, dec, 30)
        else:
            ra, dec = _num(q, "ra", 0, 360), _num(q, "dec", -90, 90)
            label = f"{ra:.5f}, {dec:+.5f}"
            astro = rs.gaia_astrometry(ra, dec, 5)
        slug = f"{ra:.4f}_{dec:+.4f}_{size:g}_{RELEASE}"
        out = CACHE / slug
        if not (out / "meta.json").exists():
            _write_status(slug, "running", 0, 0, "starting")
            try:
                build.build_target(slug, ra, dec, astro, out, max_mb=MAX_MB, size_arcmin=size,
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


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        q = parse_qs(urlparse(self.path).query)
        if "file" in q:  # serve a cached PNG
            rel = Path(q["file"][0])
            f = (CACHE / rel).resolve()
            if CACHE.resolve() not in f.parents or f.suffix != ".png" or not f.exists():
                code, body, ctype = 404, b"{}", "application/json"
            else:
                code, body, ctype = 200, f.read_bytes(), "image/png"
        else:
            code, d = handle(q)
            body, ctype = json.dumps(d).encode(), "application/json"
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.end_headers()
        self.wfile.write(body)
