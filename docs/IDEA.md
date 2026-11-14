# IDEA v2 (after critique, 2026-11-07)

Verdict: **Build**, with a narrower scope and a visual demo. Motion is measured on Barnard's Star (see `evidence_notes.md`); whether a newcomer can see it in the flipbook is untested and is the first thing to check on Nov 14.

## Working name
Wanderer

## The hook (for judges, plain words)
SPHEREx photographs a star through a different slice of infrared light every time. Flip those frames naively and the star flickers for no real reason. We line them up so the only thing that changes is the sky.

## The one claim
A SPHEREx flipbook is only honest if it knows which wavelength each frame saw. We build the blink tool that does, and check it against Gaia on the challenge's own test targets.

## Demo moment (30-second video)
Split screen. Left: a naive SPHEREx flipbook of Barnard's Star, flickering. Right: our version, steady, with the star sliding along a glowing trail across Aug 2025, Mar 2026 and Aug 2026, a dotted line projecting where it will be in 2030, and a caption: "SPHEREx: 10.5 +/- 0.7 arcsec per year northward. Gaia: 10.4." (3 visits, 4.9 um, wavelength matched; from `meta.json`)

## Who it is for (honest)
- Teachers and students: see a real star move with your own eyes, from a NASA telescope launched in 2025.
- The public and volunteers: a fast, linkable SPHEREx look at any coordinates, with known asteroids labelled.
- Astronomers: a quick look that handles proper motion and wavelength, before opening the full IRSA tools.
- Not claimed: discovering new brown dwarfs. Anything moving fast enough to see at 6"/px is already in Gaia or CatWISE (expert critic). Say so.

## Features, in build order
**Core (must ship):**
1. **Flipbook by visit.** RA/Dec or object name in; coordinates in the URL. One stacked image per visit per band (D1 to D6), played slowly (about 1 per second), upsampled so 6" pixels do not look like blocks, with a fixed crosshair. Field of view selector.
2. **Gaia motion check and trail.** Propagate the Gaia position to each visit's date, mark it, measure the star's center, draw the trail, report measured vs predicted motion with an error bar.
3. **Showcase cache.** All five test targets precomputed and served from our own storage, so IRSA throttling (503s seen in testing) cannot break the demo. Build this first.
4. **Test-target gallery.** One card per target with what SPHEREx shows and what it does not:
   - Barnard's Star: motion, measured.
   - Epsilon Indi B: detected in all 4 visits near 1.27 um (the Apr 2026 visit is at 1.33 um, a different colour); eastward drift 3.74 +/- 0.24 (RA) vs Gaia 3.98 arcsec/yr. Epsilon Indi A is about 400 arcsec away, outside the 2 arcmin field, so no common-motion view.
   - WISE 0855: the hardest target, at 4.4 to 5 um. Not separately detected: about 2 sigma per visit (0.39, 0.67 and 0.31 mJy, expected 0.47), consistent with the expected flux plus a blended background star 1.3 pixels away. Two visits are at a different wavelength. No motion fit.
   - R Draconis: too bright. It saturates SPHEREx in every band checked (about 70 Jy at 2 um), so we show the monthly images, mark the filled core "too bright" and say plainly that no brightness can be measured.
   - RW Aurigae: saturated near 0.9 um; clean only near 0.75 um, where it is 2.5x brighter in Sep 2026 (182.6 mJy) than Sep 2025 (72.2 mJy) while a field star stays at 3.3 mJy. One frame per visit, March 2026 missing, not independently validated. A and B unresolved.

**Second (if core is done by hour 30):**
5. **Same-wavelength view for variable stars.** For a chosen wavelength, plot flux vs date using only frames whose target pixel saw that wavelength, with VARIANCE error bars and flagged frames dropped. Built as `photometry.py` and used for RW Aurigae only; saturated stars (R Draconis) get no light curve.
6. **"What is that dot?"** Click a dot that appears in only one frame; ask JPL's Small-Body Identification API whether a known asteroid was there at that time.
7. **Candidate card.** One click copies RA/Dec, measured motion and links to SIMBAD, Legacy Survey and WiseView; saved in the browser; CSV export.

**Stretch (only if validated):**
8. **Spectrum on the fly**, minimum honest version: aperture photometry per frame at the target pixel's wavelength, local sky annulus, flags masked, VARIANCE errors, converted to Jy. It matched IRSA's Spectrophotometry Tool within 10 percent only for uncrowded stars of K 10.4 to 10.6; it failed on a K 8.64 star (one near-saturated frame), a faint K 11.93 star (reads 11.7 percent high) and a K 11.18 star with a 5x neighbour (4.8 percent high, one point +21 percent), so faint or crowded stars can read 5 to 25 percent high. Absolute calibration agrees with catalogs within the 5 percent those can test, and dropping saturated frames is right. Epsilon Indi B is a faint blended pair outside that range: label its spectrum preliminary.
9. **Difference image** between visits, labelled as a qualitative aid.

## Architecture
- Python backend (FastAPI, Astropy, pyvo, reproject): TAP query on `spherex.obscore`, cutout fetch with retry and backoff, reprojection to a common grid, stacking, centroiding. Cache by (RA, Dec, size).
- Frontend: React with a canvas flipbook; Aladin Lite optional for context only.
- New releases: releases appear as `obs_collection` values (`spherex_dr1`, `spherex_dr1_deep`, `spherex_qr3`, `spherex_qr3_deep` on 2026-11-14). A build uses all of them; the exposures do not repeat across them at the positions checked. Adding the next one needs no change; verify when it ships.

## Award fit
Best Use of Data is described as "the project that best makes space data accessible or leverages it to a unique application". Our pitch is the first half: SPHEREx data for any coordinates, with no login, in a form a teacher can read. Say it that way in the project text.

## Words to use in all public text
| Avoid | Use |
|---|---|
| co-added per detector array | stacked images for each infrared band |
| centroid | the star's center |
| proper motion | the star's drift across the sky |
| difference image | a picture of only what changed |
| wavelength-matched | compared in the same slice of infrared light |
| contamination flags | warnings where the data is unreliable |
| "every frame is a different color" (to experts) | "the wavelength at the star's pixel changes from frame to frame" |

## Cut, and why
- Claiming new discoveries: not realistic at 6"/px and a 1.5-year baseline.
- ML mover classifier: no labelled SPHEREx training set; 48 hours.
- Accounts or a voting backend: a browser-local candidate list is enough.
- Asteroid search by name: IRSA's MOST already does it. We only label dots.
- Promising "icy comet vs rock" spectra: unproven; the spectrum is a stretch goal.

## History
Before Nov 14 the scripts used for these tests stayed in the scratchpad as research, to respect the hackathon rule of no project code before the start. The project code now lives in `pipeline/`, `api/` and `web/`.
