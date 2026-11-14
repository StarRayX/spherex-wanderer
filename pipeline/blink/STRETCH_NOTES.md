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

## Spectrum, `spectrum.spectrum(frames_paths, ra, dec, **ap)` - validated against IRSA's tool for 2 of 5 stars (see "Widening")
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

### Widening: 4 more stars, a saturated star, catalogs (2026-11-14, same day, after the above)
- Bars stated before any result: (A) every unsaturated point within 10% of IRSA, no unexplained trend; (B) a finding, not
  a match: does our saturated flag agree with IRSA's flags, how wrong is a kept sum; (C) SPHEREx vs catalogs, overall median
  within 5% (the interpolation floor), every band median within 10%.
- Data: 12 new 14' cutouts centred 269.432 +4.792 (two per band, 2025-08 to 2026-03, 51.0 MB) plus the four cached 10'
  ones. IRSA jobs run as guest from the Data Explorer page (a direct POST to the async API now gets nginx 403; the job
  XML and `results/phot-tool-result.vot` still GET fine). Matched by EXPIDN = lvf_id as before.
- Stars (2MASS; neighbours from 2MASS K within 4-9 px, crowding from Gaia DR3 RP within 5 px):
  S1 K 8.64 isolated (bright end); S2 K 11.93 isolated in 2MASS but crowded (Gaia: 3 faint stars inside r=3, 15 at 3-5 px);
  S3 K 10.57 with a K 10.69 star (0.9x) 5.8 px away in the annulus; S4 K 11.18 with a K 9.42 star (5x) 6.1 px away, also crowded.

| star | used | median | scatter | worst | trend %/um (Spearman p) | A bar |
|---|---|---|---|---|---|---|
| V0 K 10.42 isolated (above) | 11 | +0.2% | 1.5 | +3.3% | -0.4 +/- 0.4 (0.36) | pass |
| S1 K 8.64 isolated | 7 | +0.4% | 15.0 | +39.8% at 1.134 | -2.8 +/- 3.5 (0.15) | FAIL (1 point) |
| S2 K 11.93 crowded | 11 | +11.7% | 5.5 | +24.4% at 4.274 | +2.6 +/- 0.8 (0.03) | FAIL |
| S3 K 10.57, 0.9x neighbour | 12 | -0.6% | 2.8 | -7.7% at 4.662 | -1.0 +/- 0.5 (0.05) | pass |
| S4 K 11.18, 5x neighbour | 14 | +4.8% | 5.4 | +20.7% at 4.648 | +0.9 +/- 1.1 (0.68) | FAIL (1 point) |

- S1: the other 6 points within 2.4%. The miss is a D2 frame (1.134 um) with peak 77 MJy/sr, just under OVERFLOW, whose
  two core pixels carry TRANSIENT + SUR_ERROR (bits 0, 2; we keep those bits on purpose). Ours 176.3, IRSA 126.1, catalog
  (2MASS/Gaia y interpolated) 170.4 mJy: IRSA is the one off, presumably rejecting those pixels. Still a fail as stated.
- S2/S4: ours HIGH, with r4/r3 = 1.05-1.25 (1.00-1.03 for V0/S3) and IRSA's background 0.01-0.05 MJy/sr above our annulus
  median: faint neighbours in and around the aperture that IRSA's fit takes out. Explained (crowding), not fixed.
  The S4 neighbour itself (5x, in the annulus) does not pull us low: the median shrugs it off; the excess is crowding.
- S3 trend p=0.05 rests on one D6 point (4.662 um, -7.7%) where the wider PSF puts more of the neighbour in the annulus.
- So the neighbour case passes for an equal neighbour, fails (by one point) for a 5x one in a crowded spot; brightness
  passes at K 10.4-10.6, fails at K 8.6 (near-saturation frame) and K 11.2-11.9 (crowding). Item "any other star": 1 of 4.

#### Saturated stars (B)
- Barnard's Star, IRSA job limited to MJD 60900-60950 at its mid-window position (269.446192 +4.767310, moves 0.1 px in
  that window): 20 distinct frames in the cache (2', 10', 14'), D1-D6. S1 adds 4 frames with one OVERFLOW pixel each.
- Flags: ours saturated (OVERFLOW/BLOOM/NaN in r=3) on all 20 Barnard + those 4 S1 frames; IRSA's flags carry OVERFLOW
  (bit 1, their flags are the pixel bits OR'd plus bits >= 28) on exactly the same 24, and on none of S1's 8 others. 32/32 agree.
- IRSA does NOT recover Barnard: 12 of 20 fluxes are ~0 or negative with absurd errors (fit_ql 0.00-0.09), the other 8
  range 2.8-16.4 Jy (2MASS says ~9-13 Jy at 1.1-2.3 um). So no PSF-fit rescue to compare against.
- How wrong a kept frame would be: Barnard, sum keeping saturated pixels (NaN as 0) vs 2MASS interpolated at 1.1-2.3 um:
  -47 to -59%, median -57% (4 frames); with them masked, as our code does, the sum is 0. S1 (one OVERFLOW pixel): masked
  sum -35 to -57% vs IRSA, but the kept sum matches IRSA within 5% (+4.7, +1.8, -0.5, -0.6%).
- Verdict: dropping is right for real saturation (Barnard, R Dra, RW Aur); for a single OVERFLOW pixel the finite value
  looks usable (4 frames, one star): a possible later rescue, not done.

#### Absolute calibration (C)
- 2MASS J H Ks (Vega ZPs 1594/1024/666.7 Jy) and AllWISE W1 W2 (309.5/171.8 Jy) plus Gaia DR3 synthetic PS1 y, log-log
  interpolation, Rayleigh-Jeans past W2; only points within a band's window (y 0.05, J 0.10, H 0.12, Ks 0.13, W 0.30 um).
  17 points over V0, S1-S4. No CALSPEC or other standard lies in the cached fields that I know of; none used.

| band | n | IRSA median | ours median |
|---|---|---|---|
| y | 1 | +1.9% | +2.4% |
| J | 2 | -5.3% | +0.1% |
| H | 4 | -1.3% | +2.0% |
| Ks | 2 | -0.6% | -1.5% |
| W1 | 3 | -3.2% | +4.1% |
| W2 | 5 | -2.9% | -3.1% |
| all | 17 | -2.9% (scatter 4.1) | +2.4% (scatter 8.3; S2 to +23%) |

- C bar: PASS for both. SPHEREx's calibration agrees with the catalogs within the floor; it cannot say better than ~5%:
  catalog errors are 2-3% each, and away from band centres the interpolation is worse (Ks-W1 for cool stars misses the CO
  bands: V0 -9/-11% at 2.42 um, S1 -14/-20% at 2.32/2.51 um for us AND IRSA alike).

#### Verdict on the four asks
- (1) absolute calibration beyond ~5%: not testable with catalogs; consistent within 5% (pass at that level only).
- (2) saturated stars: dropping confirmed right; flags agree 32/32; kept sums ~57% low on Barnard; IRSA fails there too.
- (3) bright annulus neighbour: pass for 0.9x at 5.8 px; fail (one D6 point +21%) for 5x at 6.1 px in a crowded spot.
- (4) other stars: 1 of 4 pass. Validated now: unsaturated, uncrowded stars at K 10.4-10.6 (two stars, one with an equal
  annulus neighbour), 0.76-4.91 um, all six bands. Not validated: K < 9 (near-saturation frames), K > 11 in crowded fields,
  bright neighbours, other fields (all five stars are within 7' of Barnard), anything saturated.
- Pinned in tests/test_spectrum.py::test_wider_irsa_comparison_cached (skips without the cutouts).

## Recommendation
- Difference image: ship, labelled "a picture of only what changed, a visual aid", only for wavelength-matched visits.
- Spectrum: ship, labelled "aperture photometry per frame, matches IRSA's Spectrophotometry Tool to ~3% on two
  uncrowded K~10.5 test stars; fainter or crowded stars can read 5-25% high", for unsaturated stars only, with dropped
  frames counted on screen and a link to IRSA's tool for research use.
