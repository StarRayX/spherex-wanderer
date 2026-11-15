# Wanderer

NASA's archive can tell you which SPHEREx images caught a comet, but it cannot tell you how bright the comet was in them. We think that gap is the most useful thing a Space Apps team can close with SPHEREx data, so Wanderer closes it.

IRSA publishes 259 SPHEREx frames of the interstellar comet 3I/ATLAS, each with the comet's predicted position. It publishes no spectrum extracted from them. Wanderer measures the comet in those frames and returns 116 measured points from 0.75 to 4.95 µm as a table you can download. The archive is a race official who photographs every lap but only times the runners who stand still.

Live site: https://spherex-wanderer.vercel.app

Built for NASA Space Apps 2026 (Manila), challenge [Planet X and SPHEREx](https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/). Wanderer does not claim any discovery and has not found Planet X; its search depth is about V 18 to 19.

## Two terms, defined once

- **Mover:** anything whose position on the sky changes between SPHEREx visits. Here that means a comet or an asteroid, never a star.
- **Spectrum:** in this project, the measured flux of one object at each SPHEREx wavelength, one row per frame. It is flux, not reflectance (see Limits).

## IRSA's tools stop one step short of a mover's spectrum

IRSA already offers five SPHEREx tools: Data Explorer, Cutout, Spectrophotometry, Source Discovery and MOST (the Moving Object Search Tool). Two of them nearly answer the question. MOST lists which images caught a mover but measures nothing. The Spectrophotometry Tool measures, but only at a fixed position, so it cannot follow something that moves. In other words:

1. MOST knows where the mover is, but does not measure it.
2. The Spectrophotometry Tool measures, but does not know where the mover is.
3. Hence nobody measures the mover.

Today a researcher closes that gap with about a day of scripting per object. Wanderer makes it a download.

## What Wanderer does

1. **Spectra of known movers.** The pipeline takes an asteroid or comet designation, asks JPL Horizons where the object was in every SPHEREx frame that caught it, measures it frame by frame and returns the spectrum as a table. The site ships precomputed spectra for 11 objects and has no designation box: 3I/ATLAS (116 frames) and 10 asteroids (98 to 185 frames each, median offset from the SPHEREx-observer JPL prediction 0.3 to 2.2 arcsec).
2. **Vet a field.** For a patch of sky, the pipeline finds every change between visits and gives each one a verdict with its evidence: a JPL match and its offset, the FLAGS bits, the nearest bright Gaia star, the distance to the detector edge, and whether the change shows in the adjacent frame. The site ships two precomputed ecliptic fields, not typed-in positions: one with 145 changes and one with 1092.
3. **RA/Dec flipbook (the challenge's must-have).** Enter coordinates or a name and the SPHEREx images of that spot play as a short animation, one frame per visit, with Gaia positions, difference images between visits, wavelength matching and a spectrum on the fly.
4. **Sky map.** An Aladin Lite sky with 12 showcase targets, 300 of the fastest Gaia stars, and each visit's SPHEREx image pinned and blinked in place.
5. **Downloads, not a live batch.** A field takes about 2.5 min to triage, which is too slow for a serverless call. So batch results are precomputed and offered as CSV, VOTable and JSON.

## Who it is for, and who it is not for

| Group | What they need | What Wanderer gives them |
|---|---|---|
| Solar-system researchers (asteroid taxonomy, 3 µm hydration, comets) | A 0.75 to 5 µm spectrum from MOST's image list, about a day of scripting per object today | One row per frame: MJD, predicted and measured RA/Dec, wavelength, flux, error, flags, aperture |
| People vetting a candidate (Backyard Worlds volunteers, Source Discovery users) | "Is this dot real?" | A verdict per change (known asteroid, cosmic ray, bright-star leftover, edge artefact, cannot confirm, or unexplained) with the evidence |
| SPHEREx calibration and QA | Reproducible notes on detector oddities | Two documented findings: saturated cores shift 3 to 4 arcsec east in some Aug 2025 exposures, and the TRANSIENT bit flags 7 of our 21 cosmic rays |
| Educators and curious people | Something that visibly moves | The RA/Dec flipbook and the sky map |

Proper-motion researchers are not on this list. Gaia and CatWISE measure stellar motion far better than 6 arcsec pixels can, which is why the stars below are checks on our code, not results.

## The stars check the code; the movers are the result

We measured nearby fast stars because Gaia already knows their answers. A pipeline that cannot recover Barnard's Star should not be trusted with a comet. The values below are arcsec per year, our SPHEREx pipeline against Gaia DR3 (from `docs/HANDOFF.md` and `docs/evidence_notes.md`).

| Target | Result | Reading |
|---|---|---|
| Barnard's Star | 10.55 ± 0.71 vs Gaia 10.36 | Agrees within the error bar |
| Epsilon Indi B | 3.74 ± 0.24 vs 3.98 (RA) | Agrees to about 1 sigma (difference 0.24, error 0.235) |
| Kapteyn's Star | 6.91 ± 0.95 vs 6.49 | Agrees within the error bar |
| Groombridge 1830, Lacaille 9352 | Just outside the error bar, about 1.0 to 1.2 sigma | Not claimed as agreement |
| Proxima Centauri, Luhman 16 | No drift claim | Images only |
| WISE 0855 | Not separately detected: about 2 sigma per visit (earlier S/N 8 figures retracted) | No detection claim. A faint background star sits 1.3 px away |
| RW Aurigae | 72.2 mJy (2025-09-02) to 182.6 mJy (2026-09-08), 2.5 times brighter at 0.75 µm | One frame per visit. A and B are blended |
| R Draconis | Saturated in every band checked | SPHEREx cannot give an aperture brightness |

Three stars agree, two miss by about one error bar, and we say so. That is the point of a check.

The movers carry the result:

| Object | Result | Reading |
|---|---|---|
| 3I/ATLAS | 116 points, 0.75 to 4.95 µm, in a fixed 4 pixel (24.6 arcsec) radius aperture. The 87 December 2025 frames (S/N about 45 to 430 each) show H2O at 2.7 µm, CO2 at 4.26 µm (the strongest) and CO at 4.67 µm, in line with the molecules reported in arXiv:2601.06759 | Flux is uncalibrated and depends on the aperture. No water-ice claim from December data. Five August frames have centroids 20 to 27 arcsec from the predicted position, four of them beyond the aperture, so the 29 August points are less secure |
| 10 asteroids | 98 to 185 frames each; median offset from JPL 0.3 to 2.2 arcsec | Flux, not reflectance |
| Field RA 150.05, Dec +13.17, Nov 14 to 19, 2025 | 145 changes: 2 known asteroids (213 Lilaea, 3721 Widorn, within 7 arcsec of JPL), 59 star residuals, 21 cosmic rays, 17 edge or mask artefacts, 41 unconfirmable (11 of them one-pixel blobs), 5 unexplained | The 5 show in 2 of 3 exposures of one visit with no known asteroid nearby. They are not shown to be real |

Does "5 unexplained" hint at Planet X? No. At a depth of about V 18 to 19, no count of unexplained dots says anything about it.

## Run it

Web app (Vite, React 19, TypeScript):

```
cd web
npm ci
npm run dev
```

Pipeline (Python 3.12 or newer, managed with uv):

```
cd pipeline
uv sync --extra dev
uv run pytest
```

The live API is one endpoint, `GET /api/blink`, served by `api/live.py` on Vercel (see `docs/API.md`). It is deployed, but it works only while IRSA's TAP service answers. Showcase data is prebuilt in `web/public/showcase/<slug>/`.

## Data sources

- [NASA/IPAC IRSA SPHEREx archive](https://irsa.ipac.caltech.edu/Missions/spherex.html): TAP table `spherex.obscore` at [irsa.ipac.caltech.edu/TAP](https://irsa.ipac.caltech.edu/TAP), and image cutouts through the IBE `?center=RA,Dec&size=` URLs.
- [IRSA 3I/ATLAS SPHEREx page](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/comet3iatlas/index.html): 259 frames with predicted comet positions.
- [Gaia DR3](https://gea.esac.esa.int/archive/) (ESA): positions, proper motions, parallaxes.
- [JPL Small-Body Identification API](https://ssd-api.jpl.nasa.gov/doc/sb_ident.html) and [Horizons](https://ssd.jpl.nasa.gov/horizons/): known movers in a frame, predicted positions.
- 2MASS (IRSA) and DSS2 (CSIRO) HiPS sky tiles in Aladin Lite, with Mellinger visible sky when CDS is up.
- [SPHEREx tutorial notebooks](https://caltech-ipac.github.io/irsa-tutorials/spherex/) as a code reference.

## Limits we know about

The method has real weaknesses. None of them closes the gap above, but each one bounds what the numbers mean.

- **Depth.** About V 18 to 19. This is not a Planet X search and makes no discovery claim.
- **Pixels.** SPHEREx pixels are 6.15 arcsec. Motion fits on one year of data are rough, and the error bars understate the scatter between frames.
- **Flux, not reflectance.** There is no solar division and no thermal model. 3I/ATLAS is extended, so its flux depends on the aperture, which is always reported. Rotation and wavelength are mixed between frames.
- **Positions.** Not MPC-grade astrometry.
- **Saturation.** Bright sources saturate, and their sums are lower limits.
- **Speed.** A field takes about 2.5 min to triage, so results are precomputed.
- **Uptime.** IRSA sometimes answers "503 Server busy", and CDS services were down on Nov 14.
- **Scope.** This project covers only the mover gap between IRSA's tools. Gagné et al. (arXiv:2604.22012) already cover fast-moving ultracool dwarfs.

## Docs

- [Handoff](docs/HANDOFF.md), [data contract for movers and triage](docs/MOVERS_CONTRACT.md), [submission text](docs/SUBMISSION.md)
- [Tech plan](docs/TECH_PLAN.md), [API](docs/API.md), [rules](docs/RULES.md), [evidence notes](docs/evidence_notes.md), [plan](docs/PLAN.md)
- [Frontend notes](docs/FRONTEND_NOTES.md): data contract and honest-wording rules for `web/`
- [Brand](docs/BRAND.md)

## Team

- Clarence Pagaduan (StarRayX): web frontend, sky map, product direction, docs.
- Samantha Nicole Bracamonte (snrbracamonte): Python pipeline, live API and docs, UI polish, QA.

Team NYSCP, Manila local event.

## Licence

Our code is licensed under the [GNU General Public License v3.0 or later](LICENSE) (GPL-3.0-or-later). The sky map bundles [Aladin Lite](https://aladin.cds.unistra.fr/AladinLite/) 3.8.2, whose package declares GPL-3 and ships LGPL-3 licence files; GPL-3.0 is compatible with both, so the deployed site can be distributed as one work. NASA, ESA and JPL data are used under their public data policies.

## Back to the race official

The archive still photographs every lap. Wanderer now times the runners who move: 116 points for one interstellar comet and 10 asteroid spectra, each row traceable to a frame you can open.
