# Review: is SPHEREx Blink a tool or a display? (Sat Nov 14, late)

This review comes from a Fable critic that took the part of a SPHEREx/IPAC staff scientist and Space Apps judge. It was asked to be harsh. The owner's question was: "What do we gain from this? How can people at NASA use it? Right now it shows information NASA gives us but doesn't work as a tool to help them." The scores and judgements are a model's opinion, not real judges'. Facts marked [L] were checked live by the critic. Facts marked [K] are its own knowledge and unchecked.

## Verdict
A SPHEREx scientist would not use the shipped product today. It answers questions that already have better answers.
- **The drift measurement has no scientific value.** Barnard's Star at 10.55 ± 0.71″/yr against Gaia's 10.36 is a sanity check on the code. It is roughly four orders of magnitude worse than the catalogue it is checked against [K].
- **The brown-dwarf niche is taken.** Gagné et al., arXiv:2604.22012, is a SPHEREx extractor for "fast-moving point sources". It has published 6,003 ultracool-dwarf spectra at mocadb.ca [L, abstract only].
- **IRSA already covers the rest** (irsa.ipac.caltech.edu/Missions/spherex.html [L]; the critic did not operate the tools):
  - Data Explorer: image series, overlays, quick-look spectrum.
  - Cutout Tool: the service the pipeline calls.
  - Spectrophotometry Tool: forced-photometry spectra. Our 3.3% match shows we reproduce it.
  - Source Discovery Tool: finds sources without a positional prior.
  - MOST: lists the SPHEREx images covering a moving object's track, as a VOTable [L].
- **We never opened IRSA's tools ourselves** (evidence_notes.md marks them SNIPPET). Do that before claiming any difference.

## The one real gap
MOST stops at "which images" and measures nothing. The Spectrophotometry Tool fixes the position, so it cannot follow a mover. IRSA's 3I/ATLAS page gives images and predicted positions but no extracted spectra, and it tells users not to use the Spectrophotometry Tool on the comet.

So **measured position and flux versus wavelength for solar-system movers** is not served. Today's two feasibility tests sit in exactly that gap:
- the 3I/ATLAS spectrum (scratchpad/atlas);
- the asteroid triage (scratchpad/movers).

## Who could benefit
| Group | Task | What the tool must do |
|---|---|---|
| Solar-system researchers (asteroid taxonomy, 3 µm hydration, comets) | Go from MOST's image list to a 0.75 to 5 µm spectrum. Today that is about a day of scripting per object. | Take a designation and return a table, one row per frame: measured position, flux, error, wavelength, flags. |
| People vetting a candidate (Backyard Worlds volunteers, Source Discovery users) | "Is this dot real?" | One verdict per position and time: known asteroid, cosmic ray, bright-star residual, edge, or unexplained. The 145-change triage is this. |
| SPHEREx calibration/QA | Little; they have internal pipelines. | Send one finding as a reproducible notebook: saturated cores shift 3 to 4″ east in Aug 2025 exposures (from Samantha's pipeline notes). |
| Educators | Showing a star move. | Already done. It scores as a display. |
| Proper-motion researchers | None. Gaia and CatWISE win at 6″ pixels. | Stop pitching to them. |

## Ideas ranked by real value (about 20 agent-hours in total)
1. **Known-mover spectrophotometry, about 9 h.**
   - In and out: a designation in; CSV and VOTable out. One row per frame: MJD, predicted and measured RA/Dec, offset, wavelength, flux, error, flags, aperture.
   - Reuses jpl.py, fetch.py, measure.py, photometry.py, spectrum.py and the 3I test scripts.
   - Launch set: 3I/ATLAS plus 10 to 20 unsaturated asteroids.
   - Honesty:
     - 3I is extended, so flux depends on aperture; state the aperture.
     - The match with arXiv:2601.06759 is qualitative unless their numbers are overplotted.
     - This is flux, not reflectance (no solar division, no thermal model).
     - Rotation and wavelength are mixed between frames.
     - No MPC-format astrometry: about 1″ from 6″ pixels does not help orbits.
2. **"Vet this dot" report, about 6 h.**
   - In and out: RA, Dec and frame in; a JSON or CSV verdict with evidence out: JPL match and offset, FLAGS bits, nearest bright Gaia star, edge distance, presence in the adjacent frame.
   - Reuses diff.py, identify and flag bits.
   - Honesty:
     - Publish the confusion table (145 changes, 30 unconfirmable).
     - Report how many of our cosmic rays the pipeline's TRANSIENT bit already catches.
     - Depth is V 18 to 19, so "0 unexplained" says nothing about Planet X.
3. **Batch endpoint and downloads, about 4 h.** A list in, one table out, and a Download button on every panel. 2.5 min per field will time out on serverless, so precompute and say so.

**Skip:** a Gaia proper-motion validator. It validates nothing Gaia needs.

## Pitch
- **One sentence:** "MOST tells you which SPHEREx images caught an asteroid or comet; we give you its measured spectrum as a table, which IRSA's fixed-position tool cannot."
- **Lead with** the 3I/ATLAS spectrum, bands labelled, next to the published result, with a Download CSV button.
- **Then** the triage table.
- **Name the user groups** on the page.
- **Demote** Barnard's Star to a "validation" card.
- **Keep** the RA/Dec flipbook, since it is the challenge's must-have.

## Stop doing
- The 300 Gaia dots, fly-to easing and 1999-versus-now arrows as headline work.
- Glass polish.
- More showcase stars.
- WISE 0855 wordsmithing.
- Headlining drift numbers.
- Any discovery language.
