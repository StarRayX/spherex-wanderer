# Tech plan: SPHEREx Blink

NASA Space Apps 2026, challenge "Planet X and SPHEREx". Team NYSCP, Manila local event.
Hackathon: Nov 14-15, 2026. Written at kickoff on Nov 14.

Related docs in this folder:
- `IDEA.md`: what we are building and why, after critique.
- `RULES.md`: deliverables, judging and the challenge's required features.
- `evidence_notes.md`: every fact we rely on, with its source and status, including what the pipeline measured on Nov 14.
- `../pipeline/blink/*_NOTES.md`: research notes on wavelength, WISE 0855 coordinates and photometry.
- `API.md`: the live `/api/blink` endpoint.

The challenge Resources tab (read Nov 14) names no new data products. It links the IRSA SPHEREx page, the [SPHEREx tutorial notebooks](https://caltech-ipac.github.io/irsa-tutorials/spherex/) (use them as a reference for the TAP and cutout code), [WiseView](http://byw.tools/wiseview) ("a model or inspiration"), and Gaia DR3 (the latest release). It also lists Canadian Space Agency NEOSSat and CADC resources, which we do not use.

## 1. What we ship

A public web app. You type a star's name or sky coordinates and see SPHEREx images of that spot, one per visit, played like a short animation. The app marks where the Gaia catalogue says the star should be on each date, draws its path, and reports how far it moved.

The demo moment is a split screen of Barnard's Star. On the left, a plain flipbook of raw SPHEREx frames flickers. On the right, our version holds steady while the star slides along a glowing trail. The caption reads "SPHEREx: X arcsec per year. Gaia: 10.4." X is measured during the hackathon.

We are judged on looks as much as on the data work. Section 5 treats presentation as a first-class workstream, not a polish step.

## 2. Data

| Source | What we use | How |
|---|---|---|
| NASA/IPAC IRSA SPHEREx archive | Calibrated images (Level 2), releases QR2 and QR3 | TAP query on `spherex.obscore` at `https://irsa.ipac.caltech.edu/TAP`; cutouts via `<image url>?center=RA,Dec&size=...` |
| Gaia DR3 | Position, proper motion, parallax of each target | Gaia archive TAP or astroquery |
| JPL Small-Body Identification API | Known asteroids in a frame at a given time | `https://ssd-api.jpl.nasa.gov/sb_ident.api` |
| Name resolver (`resolve.py`) | Name to coordinates ("Barnard's Star" to RA/Dec) | Built-in aliases for the five targets, Gaia archive for Gaia stars, SIMBAD or Sesame when reachable (Sesame at CDS was unreachable on 2026-11-14) |

Facts about the data (tested Nov 7, see `evidence_notes.md`):
- Each image covers about 3.5 degrees at 6.15 arcsec per pixel.
- A 10 arcmin cutout is about 5 MB and takes about 10 s. Most of the bytes are the EPSF cube (3.8 MB whatever the cutout size), which IRSA cannot drop.
- Every pixel has its own wavelength, stored in an alternate WCS with key "W". The table is a fixed lookup per detector, so `pick.py` chooses frames by wavelength before downloading (accuracy 0.005 um). The six tables ship in `pipeline/data`.
- A spot is visited about every 6 months. Near the ecliptic poles (R Draconis) visits come roughly monthly.
- One visit can span several days. Barnard's Star has 363 frames in 5 raw clusters; a 60-day gap rule gives the 3 visits we use.
- IRSA returned "503 Server busy" on about 1 in 15 requests.
- Bright stars saturate. R Draconis saturates every band checked, so no aperture brightness is possible. RW Aurigae is clean only near 0.75 um.

## 3. Architecture

```
            build time (local, Python)                    run time
 ┌───────────────────────────────────┐        ┌──────────────────────────────┐
 │ pipeline/                          │        │ web/ (Next.js on Vercel)      │
 │  resolve-> name, Gaia, aliases     │        │  /            landing + demo  │
 │  query  -> TAP, list frames        │  JSON  │  /t/[slug]    target viewer   │
 │  pick   -> frames by wavelength    │ ─────► │  /view?ra=&dec=  any spot     │
 │  fetch  -> cutouts, retry+backoff  │  PNG   │                               │
 │  stack, measure, photometry, jpl   │        │ api/live.py (Python function) │
 │  render, build -> PNG + JSON       │        │  /api/blink?ra&dec&size       │
 └───────────────────────────────────┘        │  same pipeline, live, cached  │
                                              └──────────────────────────────┘
```

Two paths into the same pipeline code:
1. **Showcase (precomputed).** The five test targets are built ahead of time and served as static files. The demo and the landing page never depend on IRSA being up. Build this first.
2. **Live.** Any coordinates. A Python serverless function runs the same pipeline and caches results by (RA, Dec, size, release). The UI shows real progress while frames arrive.

### Repo layout
```
pipeline/            Python package (uv)
  blink/             resolve, query, pick, fetch, stack, measure, photometry, jpl, render, build
                     + WAVELENGTH_NOTES.md, WISE0855_NOTES.md, PHOTOMETRY_NOTES.md
  data/              wave_D1..D6.npz, the per-detector wavelength tables (6 kB each)
  tests/             pytest for each module
  scripts/build_showcase.py
web/                 Next.js app (TypeScript)
  public/showcase/<slug>/  visit PNGs + meta.json (generated)
api/live.py          Python function wrapping pipeline/blink; vercel.json rewrites /api/blink to it
docs/                plans, rules, evidence
branding/            NYSCP team logo (team brand, not the product brand)
```

### Pipeline steps
1. **Resolve** (`resolve.py`). Name to RA/Dec through built-in aliases, Gaia or SIMBAD. Fetch Gaia DR3 astrometry if the target is in Gaia. WISE 0855 is not in Gaia: its challenge coordinates are the WISE epoch 2010.338 position, so we use the SIMBAD J2000 values.
2. **Query.** TAP on `spherex.obscore`: images whose footprint contains the point. Group by visit, meaning clusters of observation times separated by more than 60 days.
3. **Propagate.** Move the Gaia position to each frame's date with proper motion and parallax. Without this we cutout the wrong star; it happened on Nov 7.
4. **Pick and fetch.** `pick.py` ranks frames by how close their wavelength at the target is to the wanted one, using the shipped tables and the obscore corners, before any download. `fetch.py`: cutouts with 3 retries and exponential backoff on 503, max 4 requests at once. Cache raw cutouts on disk.
5. **Stack.** Reproject each frame to a common grid (6.15"/px, centered on the target), subtract the local background, mask flagged pixels, average per visit in one band (D1 to D6), chosen per target (D6 near 4.9 um for Barnard, D2 near 1.27 um for Epsilon Indi B). Record the wavelength each frame saw at the target pixel.
6. **Measure.** Iterative fit with a sky annulus. Flags (OVERFLOW, BLOOM) on the star mean the core is saturated and the position can be biased: in some Aug 2025 Barnard exposures it shifted 3 to 4 arcsec east, cause not identified, so the build uses D6. Fit position against time, report motion with an error bar that includes frame-to-frame scatter, and compare with Gaia. No fit unless 3 visits are detected and the drift exceeds half a pixel.
7. **Photometry and JPL** (`photometry.py`, `jpl.py`). Aperture flux in mJy with saturation flags; lower limit when pixels are masked. JPL lookup labels known asteroids.
8. **Render and build** (`render.py`, `build.py`). asinh stretch with the same limits across visits, so brightness differences are real. 4x upsample for display. Write PNGs and `meta.json`: dates, wavelengths, positions, predicted positions, motion fit, flags summary.

### Frontend
- Next.js App Router, TypeScript, Tailwind CSS, Framer Motion for UI transitions.
- **Flipbook on WebGL2** (one canvas): crossfade between visits, bicubic upsampling in the shader, a trail and crosshair drawn on top, a time scrubber. Plain canvas 2D as a fallback.
- Aladin Lite (CDS) for an optional wide-context panel with Gaia and WISE overlays.
- State in the URL (`?ra=&dec=&fov=&band=`), so any view can be shared or embedded.
- Deploy on Vercel. Showcase files ship with the build.

## 4. Features and priority

| # | Feature | Priority | Notes |
|---|---|---|---|
| 1 | Showcase cache for the 5 test targets | Must, first | Demo cannot depend on IRSA |
| 2 | Flipbook by visit with trail and Gaia marker | Must | The demo moment |
| 3 | Motion fit vs Gaia with error bar | Must | Barnard's Star, Epsilon Indi B |
| 4 | Target gallery: 5 honest cards | Must | WISE 0855 a candidate, R Draconis no brightness |
| 5 | Any-coordinates live mode with progress | Must | Required by the challenge |
| 6 | Same-wavelength brightness chart | Second | RW Aurigae only (R Draconis is saturated) |
| 7 | "What is that dot?" via JPL lookup | Second | Asteroids that appear in one frame |
| 8 | Candidate card, CSV export | Second | Saved in the browser only |
| 9 | Spectrum on the fly | Stretch | Ship only if it matches IRSA's own tool on one star |
| 10 | Difference image | Stretch | Labelled as a visual aid |

## 5. Presentation workstream

The outside has to look as good as the inside. Owned by one person from hour 0, not left for the end.

1. **Hour 0 to 2: direction.** 2 or 3 style tiles (palette, type, one hero screen each). The team picks one. Dislikes become hard bans in `BRAND.md`.
2. **Brand system.** Colour tokens, self-hosted fonts, a product mark, components (buttons, cards, scrubber, data labels), light and dark. Built alongside the pipeline, so nothing ships on framework defaults.
3. **Landing page.** Opens on the split-screen demo, live, not a video. One sentence of plain explanation. Below it, the five target cards, then "try any spot in the sky".
4. **Every state designed.** Loading (a real progress count of frames fetched, not a spinner), empty, IRSA busy, no data at this spot, target not detected.
5. **Plain words.** Use the vocabulary table in `IDEA.md`: "the star's drift across the sky", not "proper motion"; "stacked images", not "co-added".
6. **Phone width works.** A judge may open the link on a phone.
7. **Critique rounds.** A first-time user and a UI critic review it cold. Fix, then review again.

## 6. Timeline

Freeze times are set backwards from the Manila submission deadline. **The deadline time still needs confirming.** Fractions of the total hackathon time:

| By | Milestone |
|---|---|
| 5% | Repo, environments, style tiles shown, direction picked |
| 40% | Walking skeleton deployed: Barnard's Star showcase end to end, plain UI |
| 65% | Feature freeze: features 1 to 5 done and tested |
| 85% | Brand, landing, all states, phone layout done |
| 90% | Submission package locked: README, 30 s video or max 7 slides, project page text, AI-use disclosure |
| deadline minus 2 h | Buffer only. No new commits after the deadline |

## 7. Team split

See `PLAN.md`. Samantha leads development and picks her own work. Clarence supports where she wants help. The visual direction is set in `BRAND.md` (Observatory instrument).

## 8. Risks

| Risk | Plan |
|---|---|
| IRSA overloaded during the hackathon | Showcase precomputed first; live mode retries and shows honest progress |
| WISE 0855 not visible | Candidate only (2 of 3 visits at S/N about 8, 2 to 3 expected, blended star); say so |
| Saturated stars (R Draconis, Barnard's core) | Report lower limits or no brightness; choose bands that avoid saturation |
| Cutouts are slow (about 10 s each) | Parallel fetch (max 4), disk cache, small default field of view |
| Python astropy stack too large for a serverless function | Vercel functions allow up to 5 GB; if it still fails, run live mode on a small container and keep the showcase static |
| Overclaiming | Every number on screen traces to `evidence_notes.md` or `meta.json` |
| Rules | AI use disclosed in the submission; no NASA logo in generated media |
