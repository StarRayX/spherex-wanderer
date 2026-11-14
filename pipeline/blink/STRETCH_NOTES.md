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

## Spectrum, `spectrum.spectrum(frames_paths, ra, dec, **ap)` - validated against IRSA's tool, one star
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

- Median |diff| 4.9%; 2 of 11 miss the bar (+10.0%, -11.4%). Against catalogs alone: not passed. IRSA's tool (below)
  agrees with us at both of those points (+0.5%, -1.5%), so the misses are in the catalog interpolation, not the extraction.

### Against IRSA's SPHEREx Spectrophotometry Tool (the bar IDEA.md sets), 2026-11-14
- Route: SPHEREx Data Explorer > Spectrophotometry Tool (irsa.ipac.caltech.edu/applications/spherex/tool-spectrophotometry),
  single object, point source, all bands, no login (guest). It runs an IVOA UWS job,
  `https://irsa.ipac.caltech.edu/api/spherex/spectrophotometry/async/<job>` (parameter POINT=ra,dec), ~11 min for 371
  exposures (QR3 + DR1); result `.../results/phot-tool-result.vot`, one row per source with per-exposure arrays.
  astropy needs the VOTable's `arraysize="4x*"` / `"54x*"` rewritten to `"*"` before it parses.
- Method: Tractor forced photometry, flux amplitude + local background (15 px box) fitted with the cutout's own EPSF
  (33x33 at 5x oversampling = 6.6 native px, normalised to 1). Ours: r=3 px aperture, sky median 5-8 px, no correction.
- Same exposures matched by EXPIDN = lvf_id (all 14 found, one row each). Bar unchanged: every unsaturated point within 10%
  and no unexplained systematic trend.

| um | 0.962 | 1.027 | 1.229 | 1.487 | 1.623 | 1.658 | 2.162 | 2.424 | 2.424 | 2.883 | 4.894 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| ours mJy | 44.63 | 47.01 | 52.09 | 59.38 | 62.53 | 61.63 | 44.87 | 33.30 | 34.06 | 28.13 | 9.78 |
| IRSA mJy | 44.41 | 47.40 | 51.66 | 58.51 | 60.52 | 62.12 | 45.65 | 33.00 | 34.57 | 28.09 | 9.86 |
| diff % | +0.5 | -0.8 | +0.8 | +1.5 | +3.3 | -0.8 | -1.7 | +0.9 | -1.5 | +0.2 | -0.8 |

- 11 of 11 within the bar (worst +3.3%, 1.1 sigma). Median +0.2%, mean +0.15%, scatter 1.5%. Slope vs wavelength
  -0.39 +/- 0.42 %/um, Spearman p = 0.36: no trend; no band offset (D1 -0.2, D2 +1.9, D3 -1.3, D4 -0.1, D6 -0.8%).
- Aperture correction: r=3 px holds 98.7-100% of the EPSF stamp (from the cutouts' EPSF extension). Applying it moves the
  median to +0.8% with the same scatter, so it is not applied: the offset is +0.2% empirically. Both methods miss the
  wings beyond the 6.6 px stamp in the same way (our r=5/r=3 is ~1.03), so absolute flux is IRSA's calibration, not checked here.
- What IRSA's numbers support: their flux_err is ~3% per point (a floor; Tractor's own statistical error is ~0.5%), so a
  ~3% per-point bar is the tightest this comparison can test. Ours meets it except 1.623 um (3.3%).
- The 3 frames we drop (one NONFUNC pixel in the aperture, 3.33, 4.10, 4.61 um) IRSA keeps with CONTAINS_BAD_PIXEL set;
  our forced sums there would be +0.2, -1.8, -2.0%, but we still drop them rather than guess.
- IRSA's fit_ql is 2-5 for this star in D1-D4 (1 is good) and ~1 in D5-D6: Tractor's PSF residuals are large on a
  bright star, yet the fluxes agree, which is the point of an independent method.
- Verdict: PASSED for one star. Validated: unsaturated, isolated point source, K 10.42, 11 exposures at 0.96-4.89 um
  in D1, D2, D3, D4, D6 (D5 point dropped by our mask, but agrees at -1.8%). This validates the extraction against IRSA's,
  on the same pixels and calibration; it does not test the calibration itself (the catalogs do that, at ~5%).
- Limits: saturated stars give nothing (R Dra, RW Aur beyond 0.75 um); one star only; a bright neighbour in the sky
  annulus biases it badly and is not detected (IRSA fits neighbours jointly, we do not); duplicate cutouts of one frame
  (different sizes) are not de-duplicated.
- Downloads: 39.7 MB (10 cutouts of 2') plus catalog rows from IRSA TAP and MAST for the catalog check; 0 MB of new
  cutouts for the IRSA check (80 KB VOTable).

## Recommendation
- Difference image: ship, labelled "a picture of only what changed, a visual aid", only for wavelength-matched visits.
- Spectrum: ship, labelled "aperture photometry per frame, matches IRSA's Spectrophotometry Tool to ~2% on one test star",
  for unsaturated stars only, with dropped frames counted on screen and a link to IRSA's tool for research use.
