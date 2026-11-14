import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import build_showcase as b  # noqa: E402
from blink.stack import target_wcs  # noqa: E402


def test_pixel_sky_roundtrip():
    w = target_wcs(269.4, 4.7, 21)
    assert b.sky_to_pix(w, 269.4, 4.7) == pytest.approx((10, 10), abs=1e-6)
    x, y = b.sky_to_pix(w, 269.4, 4.7 + 6.15 / 3600)  # one pixel north
    assert (x, y) == pytest.approx((10, 11), abs=1e-3)
    assert b.pix_to_sky(w, x, y) == pytest.approx((269.4, 4.7 + 6.15 / 3600), abs=1e-9)


def test_select_frames_cap_and_band():
    v1 = [dict(mjd=i, band=b.BAND if i % 2 else "SPHEREx-D1") for i in range(20)]
    v2 = [dict(mjd=100 + i, band="SPHEREx-D1") for i in range(5)]  # no BAND frames: skipped
    out = b.select_frames([v1, v2])
    assert len(out) == 1 and len(out[0]) == 3
    assert {f["band"] for f in out[0]} == {b.BAND}
    assert out[0][0]["mjd"] == 1 and out[0][-1]["mjd"] == 19  # spread over the span


def test_budget_refusal():
    assert b.check_budget(10) == 40
    with pytest.raises(SystemExit):
        b.check_budget(30)
