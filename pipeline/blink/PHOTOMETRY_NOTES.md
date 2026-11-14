# Variable-star photometry (research, 2026-11-14) - code: photometry.py

## Saturation per band (OVERFLOW bit 1 or BLOOM bit 26 or NaN in the r=3 px aperture)
| Band | R Dra saturated | RW Aur saturated |
|---|---|---|
| D1 0.75-1.12 um | 14/14 (0.92-0.96 um; whole core NaN) | 7/9 at 0.89-0.94 um; 0/2 at 0.745-0.752 um |
| D2 1.1-1.65 | not fetched | 1/1 |
| D3 1.6-2.4 | 1/1 | 5/6 (OVERFLOW alone: 4/6) |
| D4 2.4-3.85 | 1/1 (no usable sky: whole cutout masked) | 1/1 (20 BLOOM px) |
| D5 3.8-4.4 | not fetched | 1/1 |
| D6 4.4-5.0 | 1/1 | 1/1 |
- OVERFLOW sets in at a peak of about 80-90 MJy/sr in D1 (unflagged peaks reach 72), so whether a near-threshold star
  is flagged depends on where it falls in the pixel. Longer bands are worse: both stars are redder than that.
- R Dra (2MASS K 2.4, itself saturated in 2MASS) is about 70 Jy at 2 um, hundreds of times the limit. No SPHEREx band
  gives an aperture flux for it; the meta.json sums are not brightness, not even useful lower limits.
- RW Aur works only at the blue end of D1 (0.75 um), where it is faintest.

## RW Aur light curve, D1 at 0.750 +/- 0.009 um (r=3 px, sky 5-8 px, no aperture correction)
| Date | um | mJy |
|---|---|---|
| 2025-09-02 | 0.745 | 72.2 +/- 0.3 (sky scatter 0.2) |
| 2026-09-08 | 0.752 | 182.6 +/- 0.5 (sky scatter 0.2) |
- A factor 2.5 (1.0 mag) brightening. A field star 43 arcsec away (2MASS J 13.75) reads 3.34 and 3.25 mJy in the same two
  frames, so the change is the star, not the calibration. Mar 2026 has no frame near 0.75 um in the cache (60 MB cap).
- The r=3 px aperture holds 98.5-99% of the r=5 px flux (curve of growth on 5 clean frames); add 1-1.5% if comparing.

## Validation (D3, same field star, not RW Aur)
- 2MASS Ks 13.311 +/- 0.032 and AllWISE W1 12.795, log-interpolated to 2.35 um: 2.99 mJy.
- SPHEREx D3, 6 frames at 2.32-2.40 um, r=2 px plus 3% aperture correction: 2.65-2.99 mJy, mean 2.86. About 4% low (0.13 mJy),
  within the 2MASS error (3%) plus the SPHEREx mean error (0.05 mJy). VALIDATED at the ~5% level for an unsaturated star.
- RW Aur itself cannot be validated: 2MASS (1997, K 7.02 = 1.04 Jy) predates its 2025 dimming. D3 clean frame:
  608 mJy at 2.40 um, only meaningful as a SPHEREx-epoch number.

## Unreliable / not done
- OVERFLOW pixels in RW Aur still hold finite values, and including them gives 157-162 mJy in Sep 2025 at 0.90-0.92
  um, next to a clean 159 at 0.94; tempting but unproven, so light_curve drops them. The old D1 sums (65-90 mJy) masked the peak.
- BLOOM without OVERFLOW (D3, 2025-09-11) is treated as saturated; its pixels may be fine. Not tested.
- One frame per visit at 0.75 um: no within-visit scatter yet. Gaia XP or a z-band reference would validate D1.
- tol_um default (wave/80) suits D1-D4; D5/D6 channels are about 3x narrower.
