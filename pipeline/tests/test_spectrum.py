import numpy as np
import pytest
from test_photometry import DEC, RA, fake_wave, write  # noqa: F401 (fixture)

from blink import fetch
from blink.spectrum import spectrum
from blink.stack import PIX


def test_sorted_and_saturated_dropped(tmp_path, fake_wave):
    fs = [write(tmp_path / "a.fits", 2.40, flux_mjy=80.0), write(tmp_path / "b.fits", 1.20, flux_mjy=120.0),
          write(tmp_path / "c.fits", 1.80, core="overflow")]
    s = spectrum(fs, RA, DEC)
    assert list(s["wavelength_um"]) == [1.20, 2.40] and (s["n_used"], s["dropped_saturated"], s["dropped_masked"]) == (2, 1, 0)
    assert s["flux_mjy"] == pytest.approx([120, 80], rel=0.03) and (s["err_mjy"] > 0).all()  # r=3 px holds ~97% at sigma 0.9


def test_aperture_off_cutout_is_dropped(tmp_path, fake_wave):
    p = write(tmp_path / "a.fits", 2.0)
    s = spectrum([p], RA, DEC + 9 * PIX)  # 9 px north: the r=3 aperture hangs over the 21 px frame's edge
    assert s["n_used"] == 0 and s["dropped_masked"] == 1


# Validation star at 2MASS RA 269.420352 Dec 4.731636 (K 10.42), 2.7' from Barnard's Star: catalog flux interpolated log-log
# from PS1 y, 2MASS JHKs, AllWISE W1 W2 (see STRETCH_NOTES.md). 2 of 11 miss 10% against catalogs (+10.0%, -11.4%),
# so this pins what was seen (worst 12%, median 6%) as a regression check; the pass is against IRSA below.
VAL = {"5d990b57fb397429c7d0": 40.57, "9a6b5c85cad0466b21f1": 44.16, "3f9fb287b23d87a77fb9": 55.69,
       "08ae3454a7062c1aba84": 58.43, "cbe0afab3a1a7d296dd6": 59.59, "e769b92f9aea2f1d5a35": 59.87,
       "9d33c088ff4d89ac31b9": 45.18, "0e4dca40a75a9446e679": 37.57, "89e31e317c54fd9e6484": 37.57,
       "3dc0aa93d40472228f37": 28.41, "59315efffcbeb5659e50": 10.10}


@pytest.mark.filterwarnings("ignore")
def test_matches_catalog_photometry_cached():
    ps = [fetch.CACHE / f"{h}.fits" for h in VAL]
    if not all(p.exists() for p in ps):
        pytest.skip("validation cutouts not cached")
    s = spectrum(ps, 269.420352, 4.731636)
    assert s["n_used"] == len(VAL)
    dev = np.array([f / VAL[fetch.Path(p).stem] - 1 for f, p in zip(s["flux_mjy"], s["path"])])
    assert np.abs(dev).max() < 0.12 and np.median(np.abs(dev)) < 0.06


# Same star, same exposures, from IRSA's SPHEREx Spectrophotometry Tool (Tractor PSF fit, job of 2026-11-14), mJy.
# Bar set in advance: 10% per point and no trend. Seen: worst 3.3%, median +0.2%; pinned at 5% / 1%.
IRSA = {"5d990b57fb397429c7d0": 44.41, "9a6b5c85cad0466b21f1": 47.40, "3f9fb287b23d87a77fb9": 51.66,
        "08ae3454a7062c1aba84": 58.51, "cbe0afab3a1a7d296dd6": 60.52, "e769b92f9aea2f1d5a35": 62.12,
        "9d33c088ff4d89ac31b9": 45.65, "0e4dca40a75a9446e679": 33.00, "89e31e317c54fd9e6484": 34.57,
        "3dc0aa93d40472228f37": 28.09, "59315efffcbeb5659e50": 9.86}


@pytest.mark.filterwarnings("ignore")
def test_matches_irsa_spectrophotometry_tool_cached():
    ps = [fetch.CACHE / f"{h}.fits" for h in IRSA]
    if not all(p.exists() for p in ps):
        pytest.skip("validation cutouts not cached")
    s = spectrum(ps, 269.420352, 4.731636)
    dev = np.array([f / IRSA[fetch.Path(p).stem] - 1 for f, p in zip(s["flux_mjy"], s["path"])])
    assert s["n_used"] == len(IRSA) and np.abs(dev).max() < 0.05 and abs(np.median(dev)) < 0.01
