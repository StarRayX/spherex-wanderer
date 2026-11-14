import numpy as np
import pytest
from astropy.io import fits

from blink import photometry as P
from blink.measure import _psf
from blink.stack import target_wcs

RA, DEC, N = 10.0, 5.0, 21


def frame(flux_mjy=100.0, sky=5.0, core=None, seed=0):
    """(img MJy/sr, var, flags, wcs): pixel-integrated Gaussian star of known total flux at the centre, flat sky, noise."""
    yy, xx = np.indices((N, N))
    img = _psf([10.2, 9.7, flux_mjy / P.MJY_PER_PIX, 0.9, sky], xx, yy) + np.random.default_rng(seed).normal(0, 0.05, (N, N))
    flags = np.zeros((N, N), np.int64)
    if core:
        img[10, 10] = np.nan if core == "nan" else img[10, 10]
        flags[10, 10] |= P.SATURATED
    return img, np.full((N, N), 0.05 ** 2), flags, target_wcs(RA, DEC, N)


def test_constant():
    assert P.MJY_PER_PIX == pytest.approx(0.889, abs=1e-3)  # 1 MJy/sr over a 6.15 arcsec pixel, in mJy


def test_known_flux_recovered_sky_subtracted():
    r = P.aperture_flux(frame(100.0, sky=50.0), RA, DEC, 4.0, 6.0, 9.0)  # sky alone would add about 44 mJy
    assert r["flux_mjy"] == pytest.approx(100.0, rel=0.02) and not r["saturated"]
    assert 0 < r["err_mjy"] < 1 and r["scatter_mjy"] == pytest.approx(r["err_mjy"], rel=0.5)


@pytest.mark.parametrize("core", ["overflow", "nan"])
def test_saturated_core_detected(core):
    r = P.aperture_flux(frame(core=core), RA, DEC)
    assert r["saturated"] and r["n_saturated"] == 1 and r["flux_mjy"] < 90  # lost core: the sum is NOT the flux


def write(path, wave, det=3, mjd=61000.0, **kw):
    img, var, flags, w = frame(**kw)
    h = w.to_header()
    h.update(DETECTOR=det, **{"MJD-AVG": mjd, "TESTWAVE": wave})
    fits.HDUList([fits.PrimaryHDU(), fits.ImageHDU(img, h, name="IMAGE"), fits.ImageHDU(flags.astype(np.int32), name="FLAGS"),
                  fits.ImageHDU(var, name="VARIANCE")]).writeto(path)
    return path


@pytest.fixture
def fake_wave(monkeypatch):  # synthetic files have no WAVE-TAB; read the wavelength from a test card instead
    monkeypatch.setattr(P, "wavelength_at", lambda p, ra, dec: fits.getheader(p, "IMAGE")["TESTWAVE"])


def test_light_curve_tolerance_and_saturation(tmp_path, fake_wave):
    fs = [write(tmp_path / "a.fits", 2.35, mjd=61001), write(tmp_path / "b.fits", 2.36, mjd=61000),
          write(tmp_path / "c.fits", 2.45), write(tmp_path / "d.fits", 2.35, core="overflow")]
    r = P.light_curve(fs, RA, DEC, wave_um=2.35, tol_um=0.02)
    assert [x["wavelength_um"] for x in r["rows"]] == [2.36, 2.35]  # sorted by mjd, 2.45 never mixed in
    assert (r["dropped_wavelength"], r["dropped_saturated"], r["dropped_masked"]) == (1, 1, 0)


def test_light_curve_refuses_two_detectors(tmp_path, fake_wave):
    with pytest.raises(ValueError, match="detectors"):
        P.light_curve([write(tmp_path / "a.fits", 2.35), write(tmp_path / "b.fits", 2.35, det=2)], RA, DEC)
