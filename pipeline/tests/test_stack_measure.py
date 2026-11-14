import numpy as np
from astropy.io import fits
from astropy.wcs import WCS

from blink.measure import centroid, fit_motion
from blink.stack import stack_visit, target_wcs

RA, DEC, N = 10.0, 5.0, 41


def star(x, y, n=41, amp=100.0, sig=1.2, bg=5.0):
    yy, xx = np.indices((n, n))
    return bg + amp * np.exp(-((xx - x) ** 2 + (yy - y) ** 2) / (2 * sig**2))


def test_centroid_subpixel_from_bad_start():
    x, y = centroid(star(20.3, 19.7), 21.8, 18.2)
    assert abs(x - 20.3) < 0.1 and abs(y - 19.7) < 0.1


def test_motion_fit_recovers_rate():
    rng = np.random.default_rng(1)
    mjds = np.linspace(60800, 61165, 12)
    true_px = 1.8
    ys = []
    for t in mjds:
        dy = true_px * (t - mjds[0]) / 365.25
        img = star(20.0, 20.0 + dy) + rng.normal(0, 0.3, (41, 41))
        ys.append(centroid(img, 20, 20)[1])
    rate, err = fit_motion(mjds, (np.array(ys) - ys[0]) * 6.15)
    assert abs(rate - true_px * 6.15) < max(3 * err, 1.0)


def test_motion_error_uses_point_errors():
    t = [60900, 61100, 61280]
    y = [0.0, 1.0, 1.9]  # three points almost on a line: tiny scatter error
    assert fit_motion(t, y)[1] < 0.01
    rate, err = fit_motion(t, y, [1.7, 0.3, 0.2])  # but the visits themselves are uncertain
    d = np.array(t) / 365.25 - np.mean(t) / 365.25
    assert np.isclose(err, np.sqrt((d ** 2 * [1.7 ** 2, 0.3 ** 2, 0.2 ** 2]).sum()) / (d ** 2).sum()) and err > 1
    assert fit_motion(t, y, [np.nan, 0.3, 0.2])[1] < 0.01  # an unknown error falls back to scatter


def write(path, data, flags):
    w = target_wcs(RA, DEC, N)
    hdr = w.to_header()
    fits.HDUList([fits.PrimaryHDU(),
                  fits.ImageHDU(data, hdr, name="IMAGE"),
                  fits.ImageHDU(flags.astype(np.int32), name="FLAGS")]).writeto(path)


def test_flagged_pixel_excluded(tmp_path):
    flags = np.zeros((N, N))
    bad = star(20, 20)
    bad[20, 20] = 1e6
    flags[20, 20] = 64  # bit 6, NONFUNC
    write(tmp_path / "a.fits", bad, flags)
    write(tmp_path / "b.fits", star(20, 20), np.zeros((N, N)))
    img, w = stack_visit([tmp_path / "a.fits", tmp_path / "b.fits"], RA, DEC, N)
    assert np.nanmax(img) < 1000
    x, y = centroid(img, 21, 19)  # grid is centred on the star, so it should sit at the middle
    assert abs(x - 20) < 0.2 and abs(y - 20) < 0.2


def test_centroid_saturated_core_masked():
    rng = np.random.default_rng(2)
    for sig in (0.7, 1.2):
        img = star(20.3, 19.7, amp=3000, sig=sig) + rng.normal(0, 1, (41, 41))
        yy, xx = np.indices(img.shape)
        img[np.hypot(xx - 20.3, yy - 19.7) < 1.6] = np.nan  # lost core, like OVERFLOW pixels
        x, y = centroid(img, 21.8, 18.2)  # guess 1.5 px off
        assert abs(x - 20.3) < 0.2 and abs(y - 19.7) < 0.2
