# Evidence notes: Planet X and SPHEREx (Space Apps 2026)

Status key. OPENED: the page or data was read directly. SNIPPET: seen only in a search result or a subagent summary. DROP: could not be confirmed, do not use. TESTED: we ran code against live data on 2026-11-07.

## The challenge (OPENED, challenge Details tab, read 2026-11-07)

- Required: user enters RA and Dec; the tool shows a series of SPHEREx images of that patch "like a little video" so moving objects are easy to spot.
- Required test targets: Barnard's Star, Epsilon Indi B, WISE 0855 (RA 08h55m10.831s, Dec -7d14m42.53s), RW Aurigae, R Draconis.
- Optional considerations: easy to update with new releases; per-detector co-adds for signal-to-noise; "extra kudos" for spectra on the fly; add or subtract images taken at different times; user-chosen field of view; Gaia or WISE overlays; coordinates in the URL for embedding; show contamination flags; Astropy and Aladin suggested.
- Resources tab (OPENED 2026-11-14): IRSA SPHEREx page, SPHEREx tutorial notebooks (https://caltech-ipac.github.io/irsa-tutorials/spherex/), WiseView, Gaia DR3 ("use the latest data release"), plus CSA NEOSSat/CADC items we do not use. No new data products.

## The data (TESTED unless marked)

| Fact | Status | Source |
|---|---|---|
| IRSA TAP table `spherex.obscore` lists SPHEREx images: qr2 1,097,080; qr2_deep 270,250; qr3 192,961; qr3_deep 47,182 rows (one row per detector image) | TESTED | https://irsa.ipac.caltech.edu/TAP |
| Image dates span MJD 60789.75 to 61318.0 (about 2025-05-01 to 2026-10-13) | TESTED | same |
| A detector image is 6.15 arcsec per pixel, about 3.5 deg across, 113.6 s exposure. Exposures in a sequence are about 2 min 9 s apart | TESTED | obscore rows, obs 2025W17_4B_0043 |
| Full detector image file is about 72 MB | TESTED | datalink content_length 71,634,240 bytes |
| Cutouts work by URL: `<image url>?center=RA,Dec&size=10arcmin`. A 10 arcmin cutout is 97x97 px, returns 5.2 MB, took 9.6 s | TESTED | IRSA IBE |
| Each cutout carries HDUs IMAGE (MJy/sr), FLAGS, VARIANCE, ZODI, EPSF (101x101x121 cube, the bulk of the bytes), WCS-WAVE | TESTED | same |
| Every pixel has its own wavelength, given by an alternate "W" WCS in the header. Consecutive frames of the same star land at different wavelengths. The per-pixel table is a fixed lookup per detector, identical in every frame (byte-equal on 25 cutouts) | TESTED | Barnard frames: 0.74 to 1.18 um across D1/D2; `pipeline/blink/WAVELENGTH_NOTES.md` |
| IRSA returned "503 Server busy, retry later" on 2 of about 30 cutout requests | TESTED | live run 2026-11-07 |
| Barnard's Star is covered by 363 frames in 5 raw visit clusters; the 60-day gap rule merges them into the 3 visits we use (Aug 2025, Apr 2026, Aug 2026). The 2026-11-07 count was 359 | TESTED (363 and 5 clusters not re-checked in the notes) | TAP query |
| R Draconis (near the north ecliptic pole) is covered almost every month: Jun, Jul, Nov, Dec 2025, May, Jun, Jul 2026 | TESTED | TAP query |
| WISE 0855 is covered by 256 frames across May 2025, Oct to Dec 2025, Apr to May 2026 | TESTED | TAP query |
| IRSA already has a SPHEREx Data Explorer (image list auto-play, 3-color, catalog overlays, quick-look spectrum), a cutout tool, MOST (known solar system objects), Spectrophotometry and Source Discovery tools | SNIPPET (subagent read the pages; we did not) | https://irsa.ipac.caltech.edu/Missions/spherex.html |
| WiseView does the RA/Dec-to-blink workflow for WISE data, not SPHEREx. The challenge Resources tab recommends it as "a model or inspiration" and says the public has made hundreds of discoveries with it | OPENED (Resources tab, 2026-11-14) | https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/?tab=resources |
| No public SPHEREx blink or epoch-differencing tool was found | SNIPPET (absence of evidence) | subagent search |
| JPL Small-Body Identification API returns known asteroids in a SPHEREx frame (6 with V<18.5 in frame 2025W17_4B_0043_1 D1) | TESTED | https://ssd-api.jpl.nasa.gov/sb_ident.api |

## Signal tests

### Barnard's Star: does SPHEREx show it moving? YES (first test, 2026-11-07; superseded below)
- Method then: 2 arcmin cutouts, 4 frames per visit in D1/D2, 5x5 centroid. Aug 2025 to Aug 2026 shift 10.9 arcsec = 1.8 pixels. 12-frame fit: 10.8 +/- 1.5 arcsec/yr in Dec vs Gaia DR3 10.36 (CONFIRMED by verifier, via Wikipedia citing Gaia DR3).
- That was a crude centroid with no saturation handling. The current numbers are in "Measured in the pipeline" below; use those. Say "within the error bar", never "within 6%" or "agrees to 1%".
- First attempt used the J2000 catalog position and measured the wrong star: the tool must propagate proper motion to the observation date.

### R Draconis: is variability visible? NO, SPHEREx cannot give a brightness (2026-11-14)
- The 2026-11-07 raw box sums (about 14,000 to 15,600 in Jul 2025, 7,900 to 10,000 in Dec 2025) were saturated pixels, not brightness. Retracted.
- Saturated in every band checked; see below.

### WISE 0855: detectable? CANDIDATE ONLY (rebuilt 2026-11-14)
- The 2026-11-07 D5 and D6 searches used the wrong position: the challenge coordinates are the WISE epoch 2010.338 position, not J2000 (`pipeline/blink/WISE0855_NOTES.md`). The old S/N values (7.8, 1.9, 6.0, 11.0, and an S/N 88 neighbour) came from a position tens of arcsec off and are retracted.
- Current result below. W2 = 13.89 Vega (verifier, Luhman 2014).

### Epsilon Indi B: DETECTED in every visit
- First test (2026-11-07): D2 stacks, peak S/N 70 to 295 in all 8 visits. Current 4-visit wavelength-matched result below.
- Ba and Bb (0.6" apart) are one blended source at 6.15"/px. Epsilon Indi A is about 400" (65 px) away: say "separated from A", never "resolved". A 2 arcmin cutout cannot show A and B together; a common-motion view needs about 8 arcmin.

### RW Aurigae: BRIGHTER BY 2.5x at 0.75 um (single frames, 2026-11-14)
- Replaces "not tested". Details below. Classical T Tauri star with irregular dimming events (verifier, snippets). RW Aur A and B are about 1.5" apart: unresolved by SPHEREx.

### Solar system movers inside one visit
- A "visit" spans days: Barnard frames on Aug 21 and Aug 24, 2025 belong to the same visit. A main-belt asteroid moves far more than a cutout width in 3 days, so it appears in one frame and is gone in the next.
- JPL's Small-Body Identification API returns known asteroids for a given frame and time (TESTED). This gives a real, labelled "something appeared" moment.

## Measured in the pipeline (2026-11-14)

Source for every number: `web/public/showcase/<slug>/meta.json` and the notes in `pipeline/blink/`. All TESTED.

- **Wavelength.** Per-pixel wavelength is a fixed lookup per detector, so frames can be chosen by wavelength before downloading (accuracy 0.005 um, checked on D2, D4, D6 only). The six tables ship in `pipeline/data`. A visit's frames step through about one bandwidth each, so a strict match uses 1 to 2 frames.
- **Barnard's Star.** 3 visits (60-day gap rule), D6 near 4.9 um, wavelength matched. Dec 10.55 +/- 0.71 arcsec/yr vs Gaia 10.36; RA -0.68 +/- 1.23 vs Gaia -0.80. The older D4 build gave Dec 9.59 +/- 1.00 and RA -2.72 +/- 1.76. Cause of the old RA offset: in some Aug 2025 exposures the saturated core shifts the measured position 3 to 4 arcsec east, at every wavelength. WCS, PSF model and wavelength were ruled out; the detector cause is not identified. Photometry sums there are lower limits (saturated).
- **Epsilon Indi B.** Detected in all 4 visits (D2, matched near 1.27 um; Apr 2026 has nothing closer than 1.30 um). RA 3.74 +/- 0.24 and Dec -2.53 +/- 0.47 arcsec/yr vs Gaia 3.98 and -2.47. Epsilon Indi A is about 400 arcsec away, outside a 2 arcmin field.
- **WISE 0855.** Detected by our rule (S/N at least 5 within 1.5 px) in 2 of 3 visits: S/N 8.1 (2025-11-19, one frame) and 7.9 (2026-04-28); the third (2025-05-05) is S/N 3.4. Expected S/N is only 2 to 3 per visit from W2 13.9, and a faint background star (AllWISE J085501.95-071428.1, W2 15.05) sits 1.3 px away inside the aperture, so this is a candidate. No motion fit: it needs 3 detected visits.
- **RW Aurigae.** Saturated in D1 near 0.9 um (7 of 9 frames); clean only near 0.75 um: 72.2 mJy (2025-09-02) to 182.6 mJy (2026-09-08), 2.5x brighter, while a field star stays at 3.3 mJy. One frame per visit; March 2026 has no frame near 0.75 um; RW Aur itself is not independently validated (the same method matched 2MASS and WISE to about 4% on an unsaturated field star in D3). Caveats: no aperture correction (add 1 to 1.5%); the A+B pair is blended.
- **R Draconis.** Saturated in every band checked (D1 14 of 14 frames, D3, D4, D6 the one frame each). About 70 Jy at 2 um, hundreds of times the limit, so SPHEREx cannot give an aperture brightness for it; the showcase sums are lower limits, not brightness.
- **Flag bits.** On star pixels: 0 TRANSIENT, 1 OVERFLOW, 2 SUR_ERROR, 21 SOURCE, 26 BLOOM. Bit 21 is set on nearly every pixel, so it is not a warning by itself.
- **Frame-to-frame scatter** inside a visit is far above the VARIANCE error, so error bars understate the real uncertainty.

## Proven: say it loudly | Unproven: state as what the project tests

| Proven | Unproven |
|---|---|
| SPHEREx data for any RA/Dec can be pulled by URL from IRSA today, no login | That WISE 0855 is real in our frames: 2 of 3 visits pass S/N 5, expected S/N is 2 to 3, a background star is blended |
| Barnard's Star moves between Aug 2025 and Aug 2026 SPHEREx visits; 3-visit D6 fit Dec 10.55 +/- 0.71 "/yr vs Gaia 10.36 | The detector cause of the 3 to 4 arcsec eastward shift in some Aug 2025 exposures |
| Epsilon Indi B is detected in all 4 matched-wavelength visits; RA 3.74 +/- 0.24 vs Gaia 3.98 | R Dra's brightness: it is saturated in every band, SPHEREx cannot give it with an aperture |
| RW Aur is 2.5x brighter at 0.75 um in Sep 2026 than Sep 2025 (field star steady) | That the RW Aur numbers are validated on RW Aur itself, or what happened in Mar 2026 |
| Each frame of the same star lands at a different wavelength, so a naive flipbook mixes color changes with real changes | That a public user can spot a mover without help in the flipbook |
| Near the ecliptic poles SPHEREx revisits monthly (R Dra), elsewhere about every 6 months | That an on-the-fly spectrum built from cutouts is accurate enough to show molecular bands |
| IRSA throttles under load (503s) | How IRSA behaves when thousands of hackathon teams query it on Nov 14-15 |
