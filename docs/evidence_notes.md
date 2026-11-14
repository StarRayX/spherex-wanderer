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
| Each cutout carries HDUs IMAGE (MJy/sr), FLAGS, VARIANCE, ZODI, PSF (101x101x121 cube, the bulk of the bytes), WCS-WAVE | TESTED | same |
| Every pixel has its own wavelength, given by an alternate "W" WCS in the header. Consecutive frames of the same star land at different wavelengths | TESTED | Barnard frames: 0.74 to 1.18 um across D1/D2 |
| IRSA returned "503 Server busy, retry later" on 2 of about 30 cutout requests | TESTED | live run 2026-11-07 |
| Barnard's Star is covered by 359 frames: three main visits Aug 2025 (105), Mar 2026 (111), Aug 2026 (115) | TESTED | TAP query |
| R Draconis (near the north ecliptic pole) is covered almost every month: Jun, Jul, Nov, Dec 2025, May, Jun, Jul 2026 | TESTED | TAP query |
| WISE 0855 is covered by 256 frames across May 2025, Oct to Dec 2025, Apr to May 2026 | TESTED | TAP query |
| IRSA already has a SPHEREx Data Explorer (image list auto-play, 3-color, catalog overlays, quick-look spectrum), a cutout tool, MOST (known solar system objects), Spectrophotometry and Source Discovery tools | SNIPPET (subagent read the pages; we did not) | https://irsa.ipac.caltech.edu/Missions/spherex.html |
| WiseView does the RA/Dec-to-blink workflow for WISE data, not SPHEREx. The challenge Resources tab recommends it as "a model or inspiration" and says the public has made hundreds of discoveries with it | OPENED (Resources tab, 2026-11-14) | https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/?tab=resources |
| No public SPHEREx blink or epoch-differencing tool was found | SNIPPET (absence of evidence) | subagent search |
| JPL Small-Body Identification API returns known asteroids in a SPHEREx frame (6 with V<18.5 in frame 2025W17_4B_0043_1 D1) | TESTED | https://ssd-api.jpl.nasa.gov/sb_ident.api |

## Signal tests

### Barnard's Star: does SPHEREx show it moving? YES
- Method: 2 arcmin cutouts at the star's 2026 position, 4 frames per visit in D1/D2 (0.74 to 1.18 um), 5x5 pixel intensity-weighted centroid, WCS to sky.
- Mean Dec: Aug 2025 = 4.76748 deg, Mar 2026 = 4.76865 deg, Aug 2026 = 4.77052 deg.
- Aug 2025 to Aug 2026 shift: 0.00304 deg = 10.9 arcsec = 1.8 pixels. Same season, so parallax mostly cancels.
- Straight-line fit through all 12 frames (3 visits): **10.8 +/- 1.5 arcsec/yr in Dec**. Gaia DR3: 10.36 arcsec/yr (CONFIRMED by verifier, via Wikipedia citing Gaia DR3; SIMBAD unreachable). Agreement is within 1 sigma. Say "10.8 +/- 1.5 vs Gaia 10.4", never "within 6%".
- The middle visit (Mar 2026) sits about 1.8 arcsec off a straight line, the same size as the per-frame scatter.
- Per-frame scatter about 2 arcsec (a third of a pixel). Crude centroid, no PSF fit, no saturation handling; FLAGS bits are set on the star's pixels. The expert critic warns a box centroid started at the predicted position is biased toward it. Before the demo: iterate the centroid, use a sky annulus, drop flagged frames.
- First attempt used the J2000 catalog position and measured the wrong star: the tool must propagate proper motion to the observation date.

### R Draconis: is variability visible? SUGGESTIVE, NOT PROVEN
- Raw 5x5 box flux near 1.1 to 1.2 um: Jul 2025 about 14,000 to 15,600; Dec 2025 about 7,900 to 10,000 (same units). Roughly a factor 1.7.
- Caveat: frames sit at different wavelengths, the star is bright (possible saturation; flag bits set), and the photometry is crude. Comparing frames at different wavelengths mixes color with variability.

### WISE 0855: detectable? NOT CONFIRMED
- Six D5 frames (3.86 to 4.03 um): no clear detection. Expected: this Y dwarf is very faint below 4.4 um.
- D6 stacks per visit (4.41 to 5.00 um, 3 to 8 frames each, reprojected to a common 6.15" grid): peak S/N near the target of 7.8, 1.9, 6.0 and 11.0, but the peak sits 2 to 3 px from the expected position and wanders between visits. One visit gave S/N 88 at a 3 px offset, almost certainly a neighbouring source. Not a detection we can claim.
- Position: challenge coordinates propagated to 2026 with -8.12"/yr RA and +0.67"/yr Dec (both CONFIRMED by verifier), assuming the coordinates are J2000-epoch. That epoch is UNVERIFIED and could shift the true position by tens of arcsec. W2 = 13.89 Vega (verifier, Luhman 2014).
- Honest demo framing: "the hardest target; here is what SPHEREx sees at 4.4 to 5 um". Show a non-detection openly if it stays one.

### Epsilon Indi B: DETECTED in every visit
- D2 stacks (1.09 to 1.64 um) at the position propagated to 2026 from J2000 22h04m10.52s -56d46m57.7s with about +3.98, -2.47 "/yr: peak S/N 70 to 295 in all 8 visits, peak at 0 px offset early on and -1 px in x by Sep/Oct 2026.
- A 1 px shift eastward is consistent in direction with its eastward proper motion (about 4.7 "/yr total, 0.8 px/yr). SUGGESTIVE only, not fitted.
- Ba and Bb (0.6" apart) are one blended source at 6.15"/px. Epsilon Indi A is about 400" (65 px) away: say "separated from A", never "resolved". A 2 arcmin cutout cannot show A and B together; a common-motion view needs about 8 arcmin.

### RW Aurigae
- Not tested. Verifier (snippets): classical T Tauri star with irregular dimming events, including about 2 mag from Feb 2025. RW Aur A and B are about 1.5" apart: unresolved by SPHEREx.

### Solar system movers inside one visit
- A "visit" spans days: Barnard frames on Aug 21 and Aug 24, 2025 belong to the same visit. A main-belt asteroid moves far more than a cutout width in 3 days, so it appears in one frame and is gone in the next.
- JPL's Small-Body Identification API returns known asteroids for a given frame and time (TESTED). This gives a real, labelled "something appeared" moment.

## Proven: say it loudly | Unproven: state as what the project tests

| Proven | Unproven |
|---|---|
| SPHEREx data for any RA/Dec can be pulled by URL from IRSA today, no login | That WISE 0855 is visible after co-adding D6 frames |
| Barnard's Star moves 1.8 px between Aug 2025 and Aug 2026 SPHEREx visits; 3-visit fit 10.8 +/- 1.5 "/yr vs Gaia 10.4 |
| Epsilon Indi B is detected at S/N 70 to 295 in all 8 visit stacks | That R Dra's brightness change survives wavelength matching and proper photometry |
| Each frame of the same star lands at a different wavelength, so a naive flipbook mixes color changes with real changes | That a public user can spot a mover without help in the flipbook |
| Near the ecliptic poles SPHEREx revisits monthly (R Dra), elsewhere about every 6 months | That an on-the-fly spectrum built from cutouts is accurate enough to show molecular bands |
| IRSA throttles under load (503s) | How IRSA behaves when thousands of hackathon teams query it on Nov 14-15 |
