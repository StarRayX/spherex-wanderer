# Frontend handoff notes

For whoever builds `web/`. The backend is done and on `main`. No app exists yet: `web/` holds only the showcase data.

## Where things are
- Showcase data: `web/public/showcase/<slug>/` (PNGs plus `meta.json`), five targets.
- API: `docs/API.md` (endpoints, parameters, response shapes, error codes).
- Look: `docs/BRAND.md`. Plain-words vocabulary and gallery wording: `docs/IDEA.md`.
- What each target does and does not show: the `claim` and `notes` fields in each `meta.json`, and `docs/evidence_notes.md`.

## Check before you show numbers
- **Empty and saturated fields.** Check `detected` before showing any number. A blank-sky build still reports negative flux values, and `detected: false` is the only flag. A saturated star has a lost core: the marker is the measurement, and the dark middle in the PNG is missing data, not a bug.
- **Honest wording.** WISE 0855 is a candidate only. R Draconis has no brightness (`photometry: null`, saturated in every band checked). RW Aurigae is preliminary: one frame per visit, not independently validated. Use the `claim` and `notes` text from `meta.json` as written.
- **Motion numbers.** Show the error bar next to every rate. Never write "agrees to 1%". Say "within the error bar".

## Not verified yet
- **Deploy.** The API has never run on Vercel. The `/api/blink` rewrite, `maxDuration` and `includeFiles` in `vercel.json` are untested, and the OS temp-folder cache is not durable there.
- **Names.** `?name=` only works for the five built-in targets while CDS Sesame is down. Anything else returns 404 "Name lookup is down" after about 30 s. Offer a coordinates field.
- **Duplicate builds across instances.** The guard only works within one process, so two cold instances could both build the same spot.

## Coming
New optional keys `differences` and `spectrum` in `meta.json` and the API (additive: existing keys keep their shape). Check `docs/API.md` after the next pull.
