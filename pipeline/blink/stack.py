"""Step 5: reproject cutouts to a common grid, subtract background, mask flags, average."""
import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from reproject import reproject_interp

PIX = 6.15 / 3600  # deg per pixel
# FLAGS bits, VERIFIED against Table 16 of the SPHEREx Explanatory Supplement v2.1 and the MSKN header cards of a Level 2 file:
# 0 TRANSIENT, 1 OVERFLOW (about half full well), 2 SUR_ERROR, 6 NONFUNC, 7 DICHROIC, 9 MISSING_DATA, 10 HOT, 11 COLD,
# 12 FULLSAMPLE (info), 14 PHANMISS, 15 NONLINEAR, 17 PERSIST, 19 OUTLIER, 20 CROSSTALK, 21 SOURCE (info), 22-24 GHOST*,
# 25 STREAK, 26 BLOOM, 27 SNOWBALL, 28 HALO, 29 SATELLITE_HALO.
# Masked: the "not usable" ones. Bits 0, 2, 21, 26 are left alone because around a bright star they sit on nearly every pixel.
BAD_FLAGS = sum(1 << b for b in (6, 7, 9, 10, 11, 14, 15, 17, 19, 25, 29))
SATURATED = 1 << 1  # OVERFLOW: add to `bad` for measuring; the pixel value is truncated and the core is often NaN


def target_wcs(ra, dec, size_px):
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crval = [ra, dec]
    w.wcs.cdelt = [-PIX, PIX]
    w.wcs.crpix = [(size_px + 1) / 2] * 2  # FITS 1-based: centre of the grid
    return w


def stack_visit(paths, ra, dec, size_px, bad=BAD_FLAGS):
    """Mean of background-subtracted, flag-masked cutouts on a shared grid. Returns (image, wcs)."""
    out = target_wcs(ra, dec, size_px)
    yy, xx = np.indices((size_px, size_px))
    r = np.hypot(xx - (size_px - 1) / 2, yy - (size_px - 1) / 2)
    ring = (r > size_px * 0.3) & (r < size_px * 0.4)  # 6.3..8.4 px: inside the 20 px cutouts, so every frame has it
    frames = []
    for p in paths:
        with fits.open(p) as h:
            img = h["IMAGE"].data.astype(float)
            img[h["FLAGS"].data & bad != 0] = np.nan
            f, _ = reproject_interp((img, WCS(h["IMAGE"].header)), out, shape_out=(size_px, size_px))
        frames.append(f - np.nanmedian(f[ring]))
    return np.nanmean(frames, axis=0), out


def wavelength_at(path, ra, dec):
    """Wavelength (um) that the alternate 'W' WCS gives at this sky position."""
    with fits.open(path) as h:
        hdr = h["IMAGE"].header
        x, y = WCS(hdr).world_to_pixel_values(ra, dec)
        w = WCS(hdr, fobj=h, key="W")
        # ponytail: assumes first output axis is wavelength already in microns
        return float(w.all_pix2world(x, y, 0)[0])
