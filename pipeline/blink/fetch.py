"""Cutout download: retries on 503, 4 at once, raw cutouts cached on disk."""
import hashlib
import io
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
from astropy.io import fits
from astropy.table import Table

CACHE = Path(__file__).resolve().parents[1] / "cache"


def _get(url, tries=3, **kw):
    """GET with exponential backoff (1 s, 2 s, 4 s) on 503; `tries` retries after the first attempt."""
    for i in range(tries + 1):
        r = requests.get(url, timeout=300, **kw)
        if r.status_code != 503 or i == tries:
            r.raise_for_status()
            return r
        r.close()
        time.sleep(2 ** i)


def _fits_url(url):
    """obscore access_url is a datalink VOTable; the '#this' row holds the FITS image URL."""
    if "datalink" not in url:
        return url
    t = Table.read(io.BytesIO(_get(url).content), format="votable", use_names_over_ids=True)
    return str(t["access_url"][list(t["semantics"]).index("#this")])


def fetch_cutout(url, ra, dec, size_arcmin, cache_dir=CACHE):
    """Return the path of a cached cutout FITS, downloading it on a miss."""
    cache_dir = Path(cache_dir)
    cache_dir.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha1(repr((url, round(ra, 6), round(dec, 6), size_arcmin)).encode()).hexdigest()[:20]
    out = cache_dir / f"{key}.fits"
    if out.exists():
        return out
    cut = f"{_fits_url(url)}?center={ra},{dec}&size={size_arcmin}arcmin"
    tmp = out.with_suffix(".part")
    with _get(cut, stream=True) as r, open(tmp, "wb") as f:
        for chunk in r.iter_content(1 << 20):
            f.write(chunk)
    try:
        fits.open(tmp).close()
    except Exception:
        tmp.unlink()
        raise
    tmp.replace(out)
    return out


def fetch_many(jobs, cache_dir=CACHE, workers=4):
    """jobs: list of (url, ra, dec, size_arcmin). Returns paths in order, at most 4 requests at once."""
    with ThreadPoolExecutor(workers) as ex:
        return list(ex.map(lambda j: fetch_cutout(*j, cache_dir=cache_dir), jobs))
