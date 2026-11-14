import json

import numpy as np

from blink.render import render_target


def _visit(i, star):
    img = np.random.default_rng(i).normal(0, 1, (20, 20))
    img[8:13, 8:13] += 3 * (i + 1)
    return dict(date=f"2025-0{i+1}-01", mjd=60000.0 + i, band=i + 1, wavelength_um=1.0 + i,
                image=img, star_xy=[10, 10] if star else None, predicted_xy=[10.5, 9.5],
                flags_summary="ok")


def test_render(tmp_path):
    visits = [_visit(0, True), _visit(1, True), _visit(2, False)]
    render_target("t", visits, tmp_path, motion={"measured_arcsec_per_yr": 1.0,
                  "error_arcsec_per_yr": 0.1, "gaia_arcsec_per_yr": 1.1})
    assert len(list(tmp_path.glob("*.png"))) == 3
    m = json.loads((tmp_path / "meta.json").read_text())
    assert {"slug", "visits", "stretch", "pixel_scale_arcsec", "upsample", "motion"} <= m.keys()
    assert m["stretch"]["black"] < m["stretch"]["white"] and m["upsample"] == 4
    assert set(m["visits"][0]) == {"file", "date", "mjd", "band", "wavelength_um",
                                   "star_xy", "predicted_xy", "flags_summary"}
    assert m["visits"][2]["star_xy"] is None and m["visits"][0]["star_xy"] == [10, 10]
    assert m["motion"]["gaia_arcsec_per_yr"] == 1.1
    from PIL import Image
    assert Image.open(tmp_path / "visit_00.png").size == (80, 80)
    # shared stretch: brighter star -> brighter pixel
    px = [np.asarray(Image.open(tmp_path / f"visit_0{i}.png"), float).mean() for i in range(3)]
    assert px[0] < px[1] < px[2]
