"""Step 5: reproject cutouts to a common grid, subtract background, mask flags, average."""
import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from reproject import reproject_interp

PIX = 6.15 / 3600  # deg per pixel


def target_wcs(ra, dec, size_px):
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crval = [ra, dec]
    w.wcs.cdelt = [-PIX, PIX]
    w.wcs.crpix = [(size_px + 1) / 2] * 2  # FITS 1-based: centre of the grid
    return w


def stack_visit(paths, ra, dec, size_px):
    """Mean of background-subtracted, flag-masked cutouts on a shared grid. Returns (image, wcs)."""
    out = target_wcs(ra, dec, size_px)
    yy, xx = np.indices((size_px, size_px))
    r = np.hypot(xx - (size_px - 1) / 2, yy - (size_px - 1) / 2)
    ring = (r > size_px * 0.35) & (r < size_px * 0.5)
    frames = []
    for p in paths:
        with fits.open(p) as h:
            img = h["IMAGE"].data.astype(float)
            # ponytail: any nonzero FLAGS bit masks the pixel (SPHEREx has benign bits too)
            img[h["FLAGS"].data != 0] = np.nan
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
