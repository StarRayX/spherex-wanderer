# Space Apps 2026 submission text

Challenge: Planet X and SPHEREx. Team NYSCP, Manila local event. Deadline Sun Nov 15, 23:59 Manila. Items marked TODO are not produced or confirmed yet. Fill them or delete the sentence before submitting.

## 1. Title and summary

**Title:** SPHEREx Blink

**Summary:** SPHEREx Blink turns NASA SPHEREx images into measured spectra of moving objects and a quick check of whether a faint dot is real, with an RA/Dec flipbook to see it by eye.

## 2. Project description (for the form)

SPHEREx Blink is a web tool built on NASA's SPHEREx all-sky survey. You type an RA and Dec or a name, and it plays SPHEREx images of that spot like a short video, one frame per visit, with Gaia positions marked and difference images between epochs. That covers the challenge's must-have.

Two features go further, because IRSA's existing tools leave a gap. IRSA's MOST lists which SPHEREx images caught an asteroid or comet but measures nothing. IRSA's Spectrophotometry Tool measures a fixed position, so it cannot follow a mover. We give you the measured spectrum of a moving object as a table. Enter a designation. The pipeline asks JPL where the object was in each frame, measures it there, and returns a CSV or VOTable with one row per frame: MJD, predicted and measured RA/Dec, wavelength, flux, error, flags and aperture. We start with comet 3I/ATLAS, where a rough 97-point spectrum from December 2025 frames shows H2O at 2.7 um, C-H at 3.3 um, CO2 at 4.25 um and CO at 4.6 um, qualitatively matching a published result. TODO(number): shipped asteroid spectra count.

The second feature, "vet this dot", takes a position and frame and returns a verdict with evidence: JPL match, FLAGS bits, nearest bright Gaia star, edge distance, and the adjacent frame. In one 145-change field it sorted 2 known asteroids, 59 star residuals, 21 cosmic rays, 17 edge artefacts, 41 unconfirmable cases and 5 it could not explain, which it flags for a human rather than calling them new. SPHEREx's own TRANSIENT flag marked only 7 of the 21 cosmic rays it found.

Who benefits: solar-system researchers who now spend about a day of scripting per object, and volunteers vetting candidates. Barnard's Star (10.55 +/- 0.71 arcsec/yr against Gaia's 10.36) is kept as a validation card, not a headline.

Limits: depth is about V 18 to 19, so this is not a Planet X search and we claim no discovery. Spectra are flux, not reflectance, and 3I/ATLAS flux depends on the aperture we report.

## 3. Use of NASA data and resources

NASA:
- NASA/IPAC IRSA SPHEREx archive, the required data. TAP table `spherex.obscore` ([TAP](https://irsa.ipac.caltech.edu/TAP)) for frame lookup, and image cutouts by URL with flags, variance and per-pixel wavelength. [IRSA SPHEREx page](https://irsa.ipac.caltech.edu/Missions/spherex.html).
- [IRSA 3I/ATLAS SPHEREx page](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/comet3iatlas/index.html): 259 frames and predicted comet positions.
- [JPL Small-Body Identification API](https://ssd-api.jpl.nasa.gov/doc/sb_ident.html) and [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/): known asteroids in a frame, predicted positions.
- [IRSA SPHEREx tutorial notebooks](https://caltech-ipac.github.io/irsa-tutorials/spherex/) as a code reference.
- 2MASS sky tiles served by IRSA, shown in the sky map.

Other space agency data:
- ESA Gaia DR3 ([archive](https://gea.esac.esa.int/archive/)): positions, proper motions and parallaxes for every target, and the 300 fastest stars on the sky map.

Other: DSS2 tiles (CSIRO HiPS) and CDS sky services through Aladin Lite. No NASA logos, flags or mission identifiers are modified.

## 4. Tools, languages, hardware

- Python 3.12, managed with uv: Astropy, NumPy, SciPy, Requests, Pillow, reproject, pytest. Research scripts also used pyvo and Matplotlib.
- Web: TypeScript, React 19, Vite, Aladin Lite 3.8.2, Space Grotesk and Public Sans fonts.
- Hosting: Vercel (static site plus a Python function `api/live.py`). TODO(deploy status): confirm before submission.
- Git and GitHub for the repo.
- Hardware: team laptops only. Pipeline runs and cutout downloads ran locally.

## 5. AI-use disclosure (SI)

Space Apps allows AI to speed up work but not to come up with the solution idea. It asks for acknowledgement of AI-written code and data in the descriptive text, and a visible watermark on any AI-generated image or video. Here is what we did.

- **Web frontend:** written with Claude (Anthropic) coding agents, directed by Clarence Pagaduan. This includes the sky map, target dashboard, Any Spot page and styling. Git history shows these as commits by StarRayX with no AI marker, so this statement is the record.
- **Analysis code:** much of the research code (the 3I/ATLAS spectrum and asteroid triage under `research/`, and the nearby-star showcase scripts) was also written with Claude agents directed by Clarence.
- **Python pipeline and live API:** written by Samantha Nicole Bracamonte, about 30 commits: query, wavelength picker, fetch, stack, measure, photometry, JPL lookup, name resolver, API, difference images, spectrum validation. TODO(Samantha): confirm whether she used any AI assistance, and say so here.
- **Review:** several critiques of the idea and the product were produced by AI models acting as judges and scientists. Their scores are a model's opinion, not real judges'. The Nov 14 review is why we moved from a viewer to measuring movers.
- **Docs and text:** drafted with Claude and edited by the team.
- **Images:** no AI-generated images or video are shown as real data. All sky images, cutouts and spectra come from NASA, ESA and survey data. TODO(Clarence): confirm no AI-generated brand artwork, or watermark it.
- **Audio:** TODO(Clarence): the voiceover is recorded by a team member. If any synthetic voice is used, say so here.
- The team chose the challenge and the direction. Claude agents helped test and criticise it.

## 6. Demo

### 7-slide outline (title and intro count toward the 7)

1. **Title.** SPHEREx Blink. Team NYSCP: Clarence Pagaduan, Samantha Nicole Bracamonte. Challenge: Planet X and SPHEREx.
   - One line: measured spectra of moving objects from SPHEREx.
   - Manila local event, Space Apps 2026.
2. **The gap.**
   - IRSA's MOST lists images that caught an asteroid or comet but measures nothing.
   - The Spectrophotometry Tool fixes the position, so it cannot follow a mover.
   - Today that is about a day of scripting per object.
3. **Known-mover spectra.**
   - Designation in, CSV or VOTable out, one row per frame.
   - 3I/ATLAS first: H2O 2.7 um, C-H 3.3 um, CO2 4.25 um, CO 4.6 um in a rough 97-point spectrum. TODO(number): final point count.
   - Flux, not reflectance. Aperture stated.
4. **Vet this dot.**
   - Verdict with evidence: JPL match, flags, bright-star residual, edge, adjacent frame.
   - One field: 145 changes, 2 known asteroids, 59 star residuals, 21 cosmic rays, 41 unconfirmable, 5 unexplained (flagged for a human, not claimed).
5. **RA/Dec flipbook and sky map.**
   - The challenge's must-have: SPHEREx frames of any spot as a short video.
   - Gaia overlays, difference images, wavelength matching, 12 showcase targets.
6. **How NASA data makes it possible, and how we check it.**
   - IRSA SPHEREx TAP and cutouts, JPL sb_ident and Horizons, ESA Gaia DR3.
   - Validation card: Barnard's Star 10.55 +/- 0.71 vs Gaia 10.36 arcsec/yr.
   - Honest limits: R Draconis saturated, WISE 0855 not separately detected.
7. **Who benefits and what is next.**
   - Solar-system researchers, candidate vetters, educators.
   - Depth V 18 to 19, no discovery claim. More movers and batch downloads next.
   - Links: site and repo. TODO(URL).

### 30-second demo script

| Time | Shot | Voiceover |
|---|---|---|
| 0 to 4 s | Title card, then sky map flying to a spot | "SPHEREx scans the whole sky. Here is how to follow something that moves." |
| 4 to 9 s | RA/Dec box, flipbook of Barnard's Star frames playing | "Type coordinates and the frames play like a video, with Gaia marks." |
| 9 to 17 s | Type 3I/ATLAS. Frames blink with the comet centred, then the spectrum plot with bands labelled | "Type a comet. We measure it in every frame it appears and plot its spectrum." |
| 17 to 21 s | Click Download CSV, table opens | "One row per frame, as a CSV or VOTable. IRSA's tools do not do this." |
| 21 to 26 s | Vet this dot: click a dot, verdict card with evidence | "Not sure a dot is real? One click gives a verdict and the evidence." |
| 26 to 30 s | Closing card: team names, challenge, NASA, JPL and ESA Gaia as text credits, URL | "SPHEREx Blink. Built on NASA and ESA data. No discovery claims, just tools." |

Notes: the video must be 30 seconds or less, public, no login, with English subtitles if not English. Show team name, member names and the challenge. No one under 18 on screen. Voiceover and recording are done by a team member.
