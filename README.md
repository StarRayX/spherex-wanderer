# SPHEREx Blink

SPHEREx Blink turns NASA SPHEREx images into a table of measured positions and spectra for moving objects, and into a quick "is this dot real?" check, with an RA/Dec flipbook to see it by eye.

Built for NASA Space Apps 2026 (Manila), challenge [Planet X and SPHEREx](https://www.spaceappschallenge.org/2026/challenges/planet-x-and-spherex/).

This tool does not claim any discovery. It has not found Planet X. Its search depth is about V 18 to 19.

## Who it is for

| Group | What they need | What SPHEREx Blink gives them |
|---|---|---|
| Solar-system researchers (asteroid taxonomy, 3 um hydration, comets) | Go from IRSA's MOST image list to a 0.75 to 5 um spectrum, which takes about a day of scripting per object today | A designation in; a CSV or VOTable out, one row per frame: MJD, predicted and measured RA/Dec, wavelength, flux, error, flags, aperture |
| People vetting a candidate (Backyard Worlds volunteers, Source Discovery users) | "Is this dot real?" | A verdict per position and time: known asteroid, cosmic ray, bright-star residual, edge artefact, or unexplained, with the evidence |
| SPHEREx calibration and QA | Reproducible notes on detector oddities | One documented finding: saturated cores shift 3 to 4 arcsec east in some Aug 2025 exposures |
| Educators and curious people | See an object move across the sky | The RA/Dec flipbook and the sky map |

Proper-motion researchers are not a target group. Gaia and CatWISE measure motion better than 6 arcsec pixels can.

## What it does

1. **Known-mover spectrophotometry.** Enter an asteroid or comet designation. JPL gives its predicted position in every SPHEREx frame that caught it, the pipeline measures it frame by frame, and you download the spectrum. IRSA's MOST lists which images caught a mover but measures nothing. IRSA's Spectrophotometry Tool measures a fixed position, so it cannot follow a mover. Shipped: 3I/ATLAS (116 frames) and 10 asteroids (98 to 185 frames each, median offset from the SPHEREx-observer JPL prediction 0.3 to 2.2 arcsec).
2. **Vet this dot.** Give an RA, Dec and frame. The report checks for a JPL match and its offset, the FLAGS bits, the nearest bright Gaia star, distance to the detector edge, and whether the dot shows in the adjacent frame. Shipped for two ecliptic fields: 145 changes (2 known asteroids, 59 bright-star leftovers, 21 cosmic rays, 17 edge or mask, 41 cannot confirm, 5 unexplained) and 1092 changes.
3. **RA/Dec flipbook (the challenge's must-have).** Enter coordinates or a name and play SPHEREx images of the spot as a short animation, one frame per visit, with Gaia positions, difference images between epochs, wavelength matching and a spectrum on the fly.
4. **Sky map.** An Aladin Lite sky with 12 showcase targets, 300 of the fastest Gaia stars, and each visit's SPHEREx image pinned and blinked in place.
5. **Batch and download.** There is no live batch endpoint. A field takes about 2.5 min to triage, so batch results are precomputed and offered as downloads (CSV, VOTable, JSON), not served live.

Barnard's Star and the other stars are kept as validation cards: they show the pipeline reproduces known Gaia motions.

## Honest results

From `docs/HANDOFF.md` and `docs/evidence_notes.md`. Arcsec per year, SPHEREx pipeline versus Gaia DR3.

| Target | Result | Reading |
|---|---|---|
| Barnard's Star | 10.55 +/- 0.71 vs Gaia 10.36 | Agrees within the error bar |
| Epsilon Indi B | 3.74 +/- 0.24 vs 3.98 (RA) | Agrees within the error bar |
| Kapteyn's Star | 6.91 +/- 0.95 vs 6.49 | Agrees within the error bar |
| Groombridge 1830, Lacaille 9352 | Just outside the error bar | Not claimed as agreement |
| Proxima Centauri, Luhman 16 | No drift claim | Images only |
| WISE 0855 | Not separately detected: about 2 sigma per visit (earlier S/N 8 figures retracted) | No detection claim. A faint background star sits 1.3 px away |
| RW Aurigae | 72.2 mJy (2025-09-02) to 182.6 mJy (2026-09-08), 2.5x brighter at 0.75 um | One frame per visit. A and B are blended |
| R Draconis | Saturated in every band checked | SPHEREx cannot give an aperture brightness |
| 3I/ATLAS (Dec 2025 frames) | S/N 72 to 154 per frame. The 87 December frames of the shipped 116-point spectrum show H2O 2.7 um, C-H 3.3 um, CO2 4.25 um (strong) and CO 4.6 um, qualitatively matching arXiv:2601.06759 | Flux is uncalibrated and aperture dependent. No water-ice claim from December data |
| Asteroid triage, field RA 150.05 Dec +13.17, Nov 15-20 2025 | 145 changes: 2 known asteroids (213 Lilaea, 3721 Widorn, within 7 arcsec of JPL), 59 star residuals, 21 cosmic rays, 17 edge or mask artefacts, 41 unconfirmable (including 11 one-pixel blobs), 5 unexplained (seen in 2 of 3 exposures of one visit, no known asteroid nearby, not shown to be real) | Depth is about V 18 to 19, so no count of unexplained dots says anything about Planet X |

Shipped spectra: 3I/ATLAS has 116 points (87 from December 2025, 29 from August 2025, 0.75 to 4.95 um) in a fixed 4 pixel (24.6 arcsec) radius aperture, plus 10 asteroid spectra. In the 145-change field, the pipeline's TRANSIENT bit already flags 7 of our 21 cosmic rays.

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

The live API is one endpoint, `GET /api/blink`, served by `api/live.py` on Vercel. See `docs/API.md`. It has not been deployed yet. Showcase data is prebuilt in `web/public/showcase/<slug>/`.

## Data sources

- [NASA/IPAC IRSA SPHEREx archive](https://irsa.ipac.caltech.edu/Missions/spherex.html): TAP table `spherex.obscore` at [irsa.ipac.caltech.edu/TAP](https://irsa.ipac.caltech.edu/TAP), and image cutouts through the IBE `?center=RA,Dec&size=` URLs.
- [IRSA 3I/ATLAS SPHEREx page](https://irsa.ipac.caltech.edu/data/SPHEREx/docs/comet3iatlas/index.html): 259 frames with predicted comet positions.
- [Gaia DR3](https://gea.esac.esa.int/archive/) (ESA): positions, proper motions, parallaxes.
- [JPL Small-Body Identification API](https://ssd-api.jpl.nasa.gov/doc/sb_ident.html) and [Horizons](https://ssd.jpl.nasa.gov/horizons/): known movers in a frame, predicted positions.
- 2MASS (IRSA) and DSS2 (CSIRO) HiPS sky tiles in Aladin Lite, with Mellinger visible sky when CDS is up.
- [SPHEREx tutorial notebooks](https://caltech-ipac.github.io/irsa-tutorials/spherex/) as a code reference.

## Limits and caveats

- Depth is about V 18 to 19. This is not a Planet X search and makes no discovery claim.
- SPHEREx pixels are 6.15 arcsec. Motion fits on one year of data are rough, and error bars understate scatter between frames.
- Mover output is flux, not reflectance: no solar division and no thermal model. 3I/ATLAS is extended, so flux depends on the aperture, which is always reported. Rotation and wavelength are mixed between frames.
- Positions are not MPC-grade astrometry.
- Bright sources saturate and their sums are lower limits.
- A field takes about 2.5 min to triage, so serverless results are precomputed.
- IRSA sometimes answers "503 Server busy"; CDS services were down on Nov 14.
- IRSA already offers Data Explorer, Cutout, Spectrophotometry, Source Discovery and MOST. This project covers only the mover gap between them. Gagne et al. (arXiv:2604.22012) already cover fast-moving ultracool dwarfs.
- The live API has not run on Vercel yet.

## Docs

- [Handoff](docs/HANDOFF.md), [data contract for movers and triage](docs/MOVERS_CONTRACT.md), [submission text](docs/SUBMISSION.md)
- [Tech plan](docs/TECH_PLAN.md), [API](docs/API.md), [rules](docs/RULES.md), [evidence notes](docs/evidence_notes.md), [plan](docs/PLAN.md)
- [Frontend notes](docs/FRONTEND_NOTES.md): data contract and honest-wording rules for `web/`
- [Brand](docs/BRAND.md)

## Team

- Clarence Pagaduan (StarRayX): web frontend, sky map, product direction, docs.
- Samantha Nicole Bracamonte (snrbracamonte): Python pipeline and live API.

Team NYSCP, Manila local event. More in [docs/](docs/): `HANDOFF.md`, `PLAN.md`, `RULES.md`, `API.md`, `TECH_PLAN.md`, `evidence_notes.md`, `SUBMISSION.md`.

## Licence

Our code licence: TODO(decision). The sky map uses [Aladin Lite](https://aladin.cds.unistra.fr/AladinLite/) 3.8.2, which is GPL-3 or LGPL-3 depending on the version, so check compatibility before making the repo public. NASA, ESA and JPL data are used under their public data policies.
