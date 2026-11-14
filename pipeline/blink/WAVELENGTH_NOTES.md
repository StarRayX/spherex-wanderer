# Wavelength at the target pixel (research, 2026-11-14)

## How wavelength maps to pixels
- Each detector (D1..D6) has a fixed lookup table, the WCS-WAVE extension (`CTYPE1W = WAVE-TAB`,
  calibration file `spectral_wcs_<D>_v2.2.fits`): wavelength and bandwidth on a coarse grid of
  detector pixels (D4: 13 x 20 points, D2: 11 x 11, D6: 9 x 9), bilinear in between.
- The table is identical in every frame of a detector: checked byte-equal on 25 cached cutouts
  (D2, D4, D6) from Aug 2025 to Sep 2026. Wavelength runs along detector rows (y); across a row it
  changes by about 1%. D4 has a finer-sampled strip in its last 240 rows (2.55 to 2.40 um), which is
  why a visit whose frames all land there spans only 2.41 to 2.52 um.
- So wavelength at a sky position = table(detector pixel of that position). Only the pixel is per-frame.

## What is free
- obscore `s_region` gives the 4 detector corners, in order: pixel (-0.5,-0.5), (2039.5,-0.5),
  (2039.5,2039.5), (-0.5,2039.5) (0-based). Matched the cutouts' SIP WCS to 0.00 px on all 25 frames.
- A homography through those corners on the tangent plane gives the target pixel to within 7 px
  (SIP distortion, mostly a ~5 px shift in y) and the wavelength to within 0.005 um, versus the true
  W WCS of the cached cutouts. Test tolerance: 0.01 um, under a third of the narrowest bandwidth
  (D1 about 0.023 um; D4 0.06 to 0.10 um).
- `em_min/em_max` in obscore are per-image band edges (e.g. D4 2.40 to 3.85 um): useless per pixel.

## What costs a download
- The table itself, once per detector: one cutout of any size is about 4 MB (the EPSF table is
  3.8 MB whatever the size; a 0.5 arcmin cutout was 3.95 MB, 14 s). `select.TABLE_COST_MB = 4`.
  After that it is a 6 kB `cache/wave_D<n>.npz`. All six are now in the local cache, but
  `pipeline/cache/` is gitignored, so a fresh checkout pays up to 24 MB once.
- There is no IBE option to fetch one extension or drop EPSF: the cutout docs
  (irsa.ipac.caltech.edu/ibe/cutouts.html) list only center, size and gzip, and say all extensions
  are cut the same way. I did not read the datalink or tutorial pages, and did not try an HTTP Range
  request on the 72 MB full image to read only its header.

## Not confirmed
- That the tables stay the same across future releases (v2.2 everywhere so far; qr2 and qr3 alike in
  the frames we have). If SSDC reissues them, delete the .npz files.
- Accuracy for D1, D3, D5 is checked only as plausible centre values (0.90, 1.98, 4.10 um); no cached
  cutout of those bands was at the target, so the 0.005 um figure is from D2, D4, D6.
- Practical: in one visit a band's 17 to 25 frames step through wavelength about one bandwidth apart, so the
  closest 4 frames span about 4 channels (D4 at Barnard: 2.86 to 3.10 um). Use n of 1 to 2 for a
  strict match, or filter on the returned wavelengths.
