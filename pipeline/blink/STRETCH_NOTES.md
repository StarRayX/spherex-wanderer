# Stretch features (2026-11-14) - code: diff.py, spectrum.py; tests: test_diff.py, test_spectrum.py

## Difference image, `diff.difference(stack_a, stack_b, wave_a_um, wave_b_um, tol_um=None, frac=0.1)`
- B minus A on one `target_wcs` grid, each background matched by its own median, NaN kept. Returns image, sky sigma
  (MAD), a per-pixel noise map and snr. Raises if the visits' wavelengths differ by more than tol (default wave/80).
- Sky noise alone is wrong at stars: SPHEREx's PSF is undersampled, so the same static star reprojected from two
  pointings leaves residuals up to ~17% of its peak. Two cached 10' D4 frames (2.432 um, 34 days apart): 91 false
  5-sigma blobs with sky noise only, 12 with noise = hypot(sky, 0.1 x brighter visit). So a change under ~10% of a
  star's peak cannot be flagged, and the snr of a big change saturates near 1/frac = 10.
- Barnard D6 (4.889 vs 4.901 um, 355 days): negative lobe south, positive north, as expected. The lobes are 4.7 px
  apart for a 1.6 px motion (saturated, NaN core), so the pair shows direction, not distance. Measure motion with measure.py.
- Synthetic: a 4 px mover gives a +/- pair; a static star at 4x its brightness cancels; colour mismatch refused.

## Spectrum, `spectrum.spectrum(frames_paths, ra, dec, **ap)` - UNVALIDATED
- photometry.aperture_flux per frame (r=3 px, sky 5-8 px, no aperture correction), sorted by wavelength. Drops and counts
  saturated frames, frames with any masked aperture pixel, and apertures off the cutout edge. err = max(VARIANCE, sky scatter).
- Test star: RA 269.420352 Dec 4.731636, 2.7' from Barnard, 2MASS K 10.42, no brighter neighbour within 52".
  Reference: PS1 y, 2MASS J H Ks, AllWISE W1 W2 in mJy, interpolated log-log (Rayleigh-Jeans past 4.6 um).
  The RW Aur field star was rejected: RW Aur (7 px away) sits in its sky annulus, fluxes moved 2x with the annulus.
- Bar stated before downloading: every unsaturated point within 10%. 14 frames (4 cached 10' Barnard cutouts, 10 new),
  11 used, 3 dropped (one NONFUNC pixel in the aperture: 3.33, 4.10, 4.61 um, so no clean W1/W2-matched point):

| um | 0.962 | 1.027 | 1.229 | 1.487 | 1.623 | 1.658 | 2.162 | 2.424 | 2.424 | 2.883 | 4.894 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| SPHEREx mJy | 44.6 | 47.0 | 52.1 | 59.4 | 62.5 | 61.6 | 44.9 | 34.1 | 33.3 | 28.1 | 9.8 |
| catalog mJy | 40.6 | 44.2 | 55.7 | 58.4 | 59.6 | 59.9 | 45.2 | 37.6 | 37.6 | 28.4 | 10.1 |
| diff % | +10.0 | +6.5 | -6.5 | +1.6 | +4.9 | +2.9 | -0.7 | -9.3 | -11.4 | -1.0 | -3.1 |

- Median |diff| 4.9%; 2 of 11 miss the bar (+10.0%, -11.4%). Likely causes (unproven): PS1 y near its own saturation for
  this star; 2.42 um sits between Ks and W1 where the CO bands make log-log interpolation poor. NOT PASSED as stated.
- Not compared with IRSA's own SPHEREx spectrophotometry tool, which is the bar IDEA.md sets.
- Limits: saturated stars give nothing (R Dra, RW Aur beyond 0.75 um); one 2MASS-era SED, the star assumed constant;
  no aperture correction (r=3 holds ~98-99% in D1-D3, less at D6 where the PSF is wider); a bright neighbour in the sky
  annulus biases it badly and is not detected; duplicate cutouts of one frame (different sizes) are not de-duplicated.
- Downloads for this: 39.7 MB (10 cutouts of 2'), plus catalog rows from IRSA TAP and MAST.

## Recommendation
- Difference image: ship, labelled "a picture of only what changed, a visual aid", only for wavelength-matched visits.
- Spectrum: do not ship on the site; it is ~5% typical, ~11% worst against catalogs and untested against IRSA's tool.
