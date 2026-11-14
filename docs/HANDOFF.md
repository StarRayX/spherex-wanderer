# SPHEREx Blink handoff (written Sat Nov 14, about 23:45 Manila, before a manual compact)

Read this first. Then `docs/REVIEW_TOOL_VALUE_2026-11-14.md` (the decision that is open), `docs/PLAN.md` (deadline, rules), `docs/evidence_notes.md` (facts) and `docs/FRONTEND_NOTES.md` (data contract).

## Where we are
- **Deadline:** Sun Nov 15, 23:59 Manila (official Space Apps submission guide). Freeze times are in PLAN.md.
- **Repo:** https://github.com/StarRayX/spherex-blink (private).
  - Branches: `main` and `frontend`. Clarence pushes `frontend` to `main` by fast-forward (`git push origin frontend frontend:main`) after checking that `main` has no new commits from Samantha.
  - Commits carry NO Claude co-author line (PLAN.md).
- **Team:** Clarence (StarRayX) and Samantha (snrbracamonte). Samantha built the Python pipeline and live API; Claude built the web frontend with agents.
- **How Clarence wants Claude to work:** always split tasks across parallel subagents, with Claude as orchestrator only (plan, integrate, verify, commit). Saved in Claude memory.
- **Not deployed yet.** The live API (`api/live.py`, `/api/blink`) has never run on Vercel. `vercel.json` builds web/ and serves api/.

## What the site is now (web/, Vite + React 19 + TS)
- **Look:** deep-space dark (#020305 page, #0160E7 primary, #4DD0F8 accent), LAMBAT layout, LAMBAT fonts only (Space Grotesk headings/numbers, Public Sans text). See BRAND.md, "Current look".
  - Still-page cards are solid #131B29 with no outline or top line. Frosted glass only on the sidebar and on sky-map floating panels.
  - No gradients, no eyebrow labels, no outlined pills, no number circles (replaced with a 01-05 timeline).
- **Pages:**
  - Home.
  - **Sky:**
    - Aladin Lite 3.8.2, stereographic "inside the sphere" view capped at 100°.
    - Eased fly-to with a zoom-out arc; 12 showcase targets, plus 300 fastest Gaia stars as dots (`web/public/data/fast_movers.json`).
    - 1999-vs-now circles and a one-piece arrow; no selection rings; phone bottom sheet; step loader.
    - Sky tiles: SPHEREx all-sky HiPS from CDS when CDS is up; it is DOWN today, so it falls back to 2MASS (IRSA) and DSS2 (CSIRO, with seam cuts), or Mellinger when CDS is up.
  - Target dashboard: Overview, Visits, Colour, Notes. AnySpot: two-column, opens on a real answer. Method.
- **Showcase data:** web/public/showcase/<slug>/.
  - The challenge's 5: barnards-star, epsilon-indi-b, wise-0855, rw-aurigae, r-draconis.
  - 7 added: proxima-centauri, kapteyns-star, groombridge-1830, 61-cygni-a, lacaille-9352, wolf-359, luhman-16.
- **Honest results to keep:**
  - Barnard's Star 10.55 ± 0.71″/yr vs Gaia 10.36.
  - Epsilon Indi B 3.74 ± 0.24 vs 3.98.
  - Kapteyn's Star 6.91 ± 0.95 vs 6.49.
  - Groombridge 1830 and Lacaille 9352 are just outside the error bar.
  - Proxima and Luhman 16: no drift claim.
  - WISE 0855: about 2σ, not separately detected.
  - R Draconis: saturated.

## The open decision (Clarence must choose)
A harsh Fable critic (REVIEW_TOOL_VALUE_2026-11-14.md) says the shipped product duplicates IRSA's own tools (Data Explorer, Cutout, Spectrophotometry, Source Discovery, MOST) and is a display, not a tool.

**The one real gap:** measured position and spectrum of MOVING objects (asteroids, comets). IRSA's Spectrophotometry Tool fixes the position, and MOST only lists images.

Its value proposition: **"MOST tells you which SPHEREx images caught an asteroid or comet; we give you its measured spectrum as a table, which IRSA's fixed-position tool cannot."**

Ranked ideas:
1. **Known-mover spectrophotometry, about 9 h.** A designation in; CSV/VOTable out, one row per frame (MJD, predicted and measured RA/Dec, wavelength, flux, error, flags, aperture). Launch set: 3I/ATLAS plus 10 to 20 unsaturated asteroids.
2. **"Vet this dot" triage, about 6 h.** RA, Dec and frame in; a verdict with evidence out (JPL match, flags, bright-star residual, edge, cosmic ray, unexplained).
3. **Batch and downloads, about 4 h.**

**Stop:** more stars, glass polish and discovery language. Demote Barnard's Star to a "validation" card. Keep the RA/Dec flipbook (the challenge must-have).

**Evidence already in hand** (research/, copied from the session scratchpad):
- **research/atlas/ (3I/ATLAS):**
  - IRSA has a 259-frame set: https://irsa.ipac.caltech.edu/data/SPHEREx/docs/comet3iatlas/index.html (obscore_3I_Atlas.vot; comet_ra/comet_dec per frame; no CORS, so precompute or proxy).
  - In December 2025 frames the comet is obvious (S/N 72 to 154) and moves about 4.4′ between runs 1.5 h apart.
  - The rough 97-point Dec spectrum shows H2O 2.7 µm, C-H 3.3, CO2 4.25 (strong) and CO 4.6, matching arXiv:2601.06759.
  - Do NOT claim water ice from December data (mostly gone by then). Flux is uncalibrated, and the comet is extended (aperture-dependent).
  - Scripts: hz.py (Horizons), oc.py, cut.py, decspec.py. Plot: atlas_dec_spectrum_rough.png. Blink: atlas_blink_grid.png.
  - Estimated 6 to 9 h to productise.
- **research/movers/ (asteroid triage):**
  - Field RA 150.05, Dec +13.17, D1, Nov 15-20 2025.
  - 145 changes: 2 known asteroids (213 Lilaea, 3721 Widorn, within 7″ of JPL), 59 star residuals, 21 cosmic rays, about 24 edge/mask artefacts, 30 unconfirmable, 0 unexplained.
  - Depth is about V 18 to 19. About 2.5 min per field, so precompute.
  - Scripts: detect2.py, jplseq.py. Images: lilaea_jump.png, widorn_jump.png.
- Python venv for the scripts: uv, with astropy, pyvo, numpy, requests, reproject, scipy and matplotlib.

## In flight at the compact
- An agent was adding (to Sky.tsx/Sky.css): SPHEREx visit photos pinned onto the sky map, blinked in sync with the panel; a 1999-to-now glide slider; and hover tooltips on map markers. Check `git status` / `git log` for whether it landed. If Sky.tsx is modified but uncommitted, verify in the browser and commit.

## Known caveats
- CDS (SIMBAD, Sesame, alasky HiPS) was down all day. IRSA and Gaia TAP work. A SIMBAD mirror at Harvard worked.
- The browser pane runs throttled, so fly-in smoothness was never measured at full frame rate. Check in a real browser.
- AnySpot live mode needs the deployed API.
- Aladin Lite licence is GPL-3/LGPL-3 depending on version; fine while the repo is private.
