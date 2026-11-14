# IDEA v2 (after critique, 2026-11-07)

Verdict: **Build**, with a narrower scope and a visual demo. Motion is measurable on Barnard's Star; whether a newcomer can see it in the flipbook is untested and is the first thing to check on Nov 14.

## Working name
SPHEREx Blink

## The hook (for judges, plain words)
SPHEREx photographs a star through a different slice of infrared light every time. Flip those frames naively and the star flickers for no real reason. We line them up so the only thing that changes is the sky.

## The one claim
A SPHEREx flipbook is only honest if it knows which wavelength each frame saw. We build the blink tool that does, and check it against Gaia on the challenge's own test targets.

## Demo moment (30-second video)
Split screen. Left: a naive SPHEREx flipbook of Barnard's Star, flickering. Right: our version, steady, with the star sliding along a glowing trail across Aug 2025, Mar 2026 and Aug 2026, a dotted line projecting where it will be in 2030, and a caption: "SPHEREx: 10.8 +/- 1.5 arcsec per year. Gaia: 10.4."

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
   - Epsilon Indi B: detected every visit, common motion with Epsilon Indi A (wide field).
   - WISE 0855: the hardest target; shown at 4.4 to 5 um, non-detection reported openly if it stays one.
   - R Draconis: brightness over time at one fixed wavelength (monthly visits near the ecliptic pole).
   - RW Aurigae: brightness over time; A and B unresolved.

**Second (if core is done by hour 30):**
5. **Same-wavelength view for variable stars.** For a chosen wavelength, plot flux vs date using only frames whose target pixel saw that wavelength, with VARIANCE error bars and flagged frames dropped. This is where wavelength matching matters most (for motion it matters little).
6. **"What is that dot?"** Click a dot that appears in only one frame; ask JPL's Small-Body Identification API whether a known asteroid was there at that time.
7. **Candidate card.** One click copies RA/Dec, measured motion and links to SIMBAD, Legacy Survey and WiseView; saved in the browser; CSV export.

**Stretch (only if validated):**
8. **Spectrum on the fly**, minimum honest version: aperture photometry per frame at the target pixel's wavelength, local sky annulus, flags masked, VARIANCE errors, converted to Jy. Ship it only if it matches IRSA's own spectrophotometry tool for one test star.
9. **Difference image** between visits, labelled as a qualitative aid.

## Architecture
- Python backend (FastAPI, Astropy, pyvo, reproject): TAP query on `spherex.obscore`, cutout fetch with retry and backoff, reprojection to a common grid, stacking, centroiding. Cache by (RA, Dec, size, release).
- Frontend: React with a canvas flipbook; Aladin Lite optional for context only.
- New releases: releases appear as `obs_collection` values (qr2, qr3 today). Adding the next one should be a filter change; verify when it ships.

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

## Rule reminder
No project code before Nov 14. The scripts used for these tests stay in the scratchpad as research.
