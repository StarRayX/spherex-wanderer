# Frontend handoff notes

For whoever builds `web/`. The backend is done and on `main`. The app now exists in `web/` (Vite, React 19, TypeScript); this file is the data contract it follows.

## Where things are
- Showcase data: `web/public/showcase/<slug>/` (PNGs plus `meta.json`), 12 targets: the five challenge targets plus seven nearby fast movers (`proxima-centauri`, `kapteyns-star`, `groombridge-1830`, `61-cygni-a`, `lacaille-9352`, `wolf-359`, `luhman-16`).
- API: `docs/API.md` (endpoints, parameters, response shapes, error codes).
- Look: `docs/BRAND.md`. Plain-words vocabulary and gallery wording: `docs/IDEA.md`.
- What each target does and does not show: the `claim` and `notes` fields in each `meta.json`, and `docs/evidence_notes.md`.

## Check before you show numbers
- **Empty and saturated fields.** Check `detected` before showing any number. A blank-sky build still reports negative flux values, and `detected: false` is the only flag. A saturated star has a lost core: the marker is the measurement, and the dark middle in the PNG is missing data, not a bug.
- **Honest wording.** WISE 0855 is not separately detected: about 2 sigma per visit, consistent with the expected flux plus a blended background star (`detected` is false for all three visits). R Draconis has no brightness (`photometry: null`, saturated in every band checked). RW Aurigae is preliminary: one frame per visit, not independently validated. Use the `claim` and `notes` text from `meta.json` as written.
- **Motion numbers.** Show the error bar next to every rate. Never write "agrees to 1%". Say "within the error bar".

## Not verified yet
- **Deploy.** The API has never run on Vercel. The `/api/blink` rewrite, `maxDuration` and `includeFiles` in `vercel.json` are untested, and the OS temp-folder cache is not durable there.
- **Names.** `?name=` only works for the five built-in targets while CDS Sesame is down. Anything else returns 404 "Name lookup is down" after about 30 s. Offer a coordinates field.
- **Duplicate builds across instances.** The guard only works within one process, so two cold instances could both build the same spot.

## Difference images and spectrum (new, optional keys)
- `meta.differences[]`: a picture of only what changed between two visits matched to the same wavelength. Pairs that are not matched have `file: null` and a `skipped` reason: show the reason, not an empty image. It is a visual aid: `n_above_5sigma` counts pixels and includes residuals from static or saturated stars, so do not present it as a count of real changes. Take distances from the motion fit.
- `meta.spectrum`: only Epsilon Indi B has one. The others are `null` with `spectrum_reason`. Show its `validation` and `caveats` text next to the plot. It matched IRSA's Spectrophotometry Tool within 10 percent only for uncrowded stars of K 10.4 to 10.6, and failed on a K 8.64 star, a faint K 11.93 star and a crowded K 11.18 star; faint or crowded stars can read 5 to 25 percent high. Epsilon Indi B is a faint blended pair outside that range: label it preliminary. `docs/REVIEW_2026-11-14.md` says the spectrum matches IRSA's tool to "about 2 to 3 percent"; that claim is narrower than it reads, so do not repeat it.
- **Do not treat all of `urls` as the flipbook.** In the API response `urls` lists the visit PNGs first, then the difference PNGs. Use `meta.visits[i].file` for the flipbook and `meta.differences[i].file` for differences.

## Per-visit and motion keys (new, optional)
Checked 2026-11-14: `web/src` does not read any of these yet (no match for the key names), so each is still to do.
- `visits[].colour_matched` and `colour_note`: false when a visit is not at the same wavelength as the others (Epsilon Indi B Apr 2026, WISE 0855 May and Nov 2025, R Draconis Jun 2025, Wolf 359 May 2026). In a time flipbook, drop those visits or label them with `colour_note`; never present their brightness change as real.
- `visits[].saturated_pixels` and `saturated_core_xy`: pixel list and centre of a flat-filled core (R Draconis in every visit; a few pixels in 61 Cygni A). Draw a marker on the core labelled "too bright". An empty list and `null` mean not saturated.
- `motion.caption_note`: print it next to the rate, for example "10.5 +/- 0.7 arcsec per year, northward drift (Dec component), not the total proper motion". Barnard's Star is the Dec component; Epsilon Indi B's is the eastward RA component.
