# Live API

One endpoint, `GET /api/blink`, chosen by query parameter. `vercel.json` rewrites it to `api/live.py`
(the file is not called `blink.py` so it cannot shadow the pipeline package `blink`). All replies are JSON
except `file`. Errors are `{"error": "..."}`. Params are checked in this order: showcase, identify, status, build.

## Endpoints

| Request | 200 reply |
|---|---|
| `?showcase=<slug>` | `{meta, slug, urls}` from the prebuilt `web/public/showcase/<slug>/meta.json`. No IRSA call. `urls` are static paths `/showcase/<slug>/visit_NN.png`, then `/showcase/<slug>/diff_II_JJ.png` for each difference image made. |
| `?ra=&dec=[&size=][&spectrum=1]` | `{meta, slug, label, gaia, urls}`. Runs the pipeline unless cached. |
| `?name=[&size=][&spectrum=1]` | Same. `name` is a target name or coordinates, resolved server side; `label` is the resolved name. |
| `?status=<slug>` | `{state, done, total, message}` |
| `?identify=<ra>,<dec>,<mjd>[&fov=][&vmag=]` | `{bodies, reason}`. `bodies` = `[{name, designation, ra, dec, mag, distance_arcsec}]`, nearest first. |
| `?file=<slug>/visit_NN.png` or `<slug>/diff_II_JJ.png` | `image/png` from the cache (only `.png` files inside it). |

Showcase slugs: `barnards-star`, `epsilon-indi-b`, `r-draconis`, `rw-aurigae`, `wise-0855`.

## Parameters

| Name | Range | Default |
|---|---|---|
| `ra` | 0..360 deg | required (unless `name`) |
| `dec` | -90..90 deg | required (unless `name`) |
| `size` | 0.5..10 arcmin | 6 |
| `name` | 1..100 chars | |
| `mjd` | 59000..70000 | required for identify |
| `fov` | 0.5..30 arcmin | 2 |
| `vmag` | 10..30 | 22 (identify: faster JPL search; SPHEREx cannot see fainter) |
| `spectrum` | 0 or 1 | 0 |

Numbers must be finite. Non-finite numbers in any JSON reply are sent as `null`. `ra`, `dec` and `mjd` in `identify` are comma separated in one value.

## Errors

| Code | When |
|---|---|
| 400 | A parameter is missing, not a number, out of range, or the slug is malformed. |
| 404 | Unknown showcase slug, unknown `status` job, unresolvable `name`, missing `file`. |
| 502 | The pipeline failed (IRSA down, no frames), or Gaia was unreachable (`error` only, nothing built). Pipeline failures have `error` and `slug`; the status file says `error`. |
| 500 | Unexpected server error. Body `{"error": "internal error"}`, no details (the traceback goes to the server log). |

`identify` never fails because of JPL: when JPL is down or empty you get 200 with `bodies: []` and a `reason`
(`null` on success). Only bad input gives 400.

## Cache key and job slug

Slug = `{ra:.4f}_{dec:+.4f}_{size:g}`, for example `269.4500_+4.7300_6`. There is no release tag: a build uses every
`obs_collection` in `spherex.obscore` (2026-11-14: `spherex_dr1`, `spherex_dr1_deep`, `spherex_qr3`, `spherex_qr3_deep`).
These are separate exposures, not co-adds (no exposure and detector repeats across them at the positions checked), and
`find_frames` keeps one row per (obs_id, detector) in case a later release re-lists one.
With `spectrum=1` the slug ends in `_spec` (a separate build: a plain build has no spectrum).
That slug is the cache key (directory `$BLINK_CACHE`, default the OS temp dir `/blink_cache/<slug>/`),
the job id for `status`, and the prefix of every `file` URL. A request whose `meta.json` exists returns at once.
Raw IRSA cutouts are kept in `$BLINK_CACHE/raw/` (the repo tree is read-only on Vercel). On Vercel the temp dir is per instance and not durable, so a cold instance rebuilds.
The position is looked up in Gaia (5 arcsec for `ra`/`dec`, 30 arcsec for `name`). If nothing is there, Gaia sources
moving faster than 200 mas/yr within 5 arcmin are carried back (straight line) to J2000, the WISE epoch 2010.338 and
2016.0; the closest one landing within that radius is used and `gaia` then also has `matched_epoch` and `match_arcsec`
(for example Barnard's Star typed at its J2000 position matches at 2000.0, 0.1 arcsec). No source means a fixed sky
position, no motion (`gaia: null`, and `meta.notes` says so). WISE 0855 is not in Gaia, so it is always `null` here.

## Progress flow

1. Client calls `?ra=&dec=&size=`. The call blocks until the build ends (up to the function limit).
2. The slug is deterministic, so the client can compute it and poll `?status=<slug>` meanwhile
   (404 until the build starts). `state` is `running`, `done` or `error`. A `running` job with no update for 330 s
   (the function was killed at `maxDuration`) is reported as `error`. While running, `done`/`total` count
   frames and `message` says what is happening. On `error`, `message` is the reason.
   A second request for a slug that is already building waits for that build instead of starting another.
3. When the first call returns, use `urls` (each is `/api/blink?file=<slug>/<file>`) and `meta`. The first
   `len(meta.visits)` urls are the visit PNGs in order, then the difference PNGs in `meta.differences` order
   (only entries whose `file` is not null).
   `meta.visits[]` has `file`, `date`, `mjd`, `band`, `wavelength_um`, `predicted_xy`, and so on.

## Difference images (`meta.differences`, always built)

One entry per consecutive visit pair: `{file, visits: [i, j], dates, wave_a_um, wave_b_um, noise, n_above_5sigma,
skipped, note}`. `file` is `diff_II_JJ.png` (visit j minus visit i on the same grid, same size as the visit PNGs).
If the two visits' mean wavelengths at the star differ by more than wavelength/80 (half a channel), there is no image:
`file`, `noise` and `n_above_5sigma` are null and `skipped` says why (a difference of two colours is not a change).
`noise` is the sky scatter of the difference (MJy/sr, MAD). `n_above_5sigma` counts pixels whose |difference| is
over 5 x the per-pixel noise, where that noise adds 10% of the brighter visit (static stars leave residuals up to
about 17% of their peak), so it includes such residuals and is not a count of real changes. `note` says this.
PNGs: grey + alpha, one symmetric stretch per target in `meta.difference_stretch` (`{kind: "asinh_symmetric",
limit, softening}`, null when no image was made): mid grey = no change, white = brighter in the later visit,
black = brighter in the earlier, transparent = masked (e.g. a saturated core: unknown, not "no change").
Costs no downloads. Live builds pick frames by wavelength at the star (`meta.frame_selection` `"wavelength"`,
target the median over visits). If the visit means still differ by over half a channel, a `meta.notes` entry says so.
If matching itself fails (it runs before any download) the build is redone by time (`"time"`) and a note says so.

## Spectrum (`meta.spectrum`, opt in)

`meta.spectrum` is null unless asked for, and `meta.spectrum_reason` says why (null when there is a spectrum).
With `spectrum=1` (live) the build also measures one visit's frames from every band (each frame sees a different
wavelength): `{wavelength_um[], flux_mjy[], err_mjy[], n_used, dropped_saturated, dropped_masked, frames_tried,
visit_date, validation, caveats[], cutouts_mb}`. It uses the visit with the most bands, every cached frame of it, and
up to 14 new 2 arcmin cutouts spread in wavelength (about 57 MB). Cost: `MAX_MB` (100) is split, 60 MB for the
spectrum (`SPECTRUM_MB`) and 40 MB for the images (so fewer visits: 3 visits of 3 frames at 6 arcmin). The estimate is printed and refused above
`SPECTRUM_MB` before any download (502); with the defaults it is at most 57 MB, so it fits. `validation` is one statement for every spectrum (`SPECTRUM_VALIDATION` in
`pipeline/blink/build.py`). A saturated star gives null with a reason; the frames with a saturated or masked pixel in
the aperture are dropped and counted. Showcase: only `epsilon-indi-b` has a spectrum.

Budget at the 6 arcmin default: about 4.4 MB per cutout (estimated between the measured 2' and 10' sizes), so
22 cutouts fit in 100 MB: 7 visits of 3 frames, about 93 MB. Wavelength matching needs one detector table: free from
`pipeline/data/wave_D*.npz`; if those files are not deployed, 4 MB (`TABLE_MB`) is held back from the image budget.

Not tested on Vercel itself (no deploy was done); `includeFiles` and `maxDuration` in `vercel.json` are unverified.
