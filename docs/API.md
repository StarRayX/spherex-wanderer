# Live API

One endpoint, `GET /api/blink`, chosen by query parameter. `vercel.json` rewrites it to `api/live.py`
(the file is not called `blink.py` so it cannot shadow the pipeline package `blink`). All replies are JSON
except `file`. Errors are `{"error": "..."}`. Params are checked in this order: showcase, identify, status, build.

## Endpoints

| Request | 200 reply |
|---|---|
| `?showcase=<slug>` | `{meta, slug, urls}` from the prebuilt `web/public/showcase/<slug>/meta.json`. No IRSA call. `urls` are static paths `/showcase/<slug>/visit_NN.png`. |
| `?ra=&dec=[&size=]` | `{meta, slug, label, gaia, urls}`. Runs the pipeline unless cached. |
| `?name=[&size=]` | Same. `name` is a target name or coordinates, resolved server side; `label` is the resolved name. |
| `?status=<slug>` | `{state, done, total, message}` |
| `?identify=<ra>,<dec>,<mjd>[&fov=]` | `{bodies, reason}`. `bodies` = `[{name, designation, ra, dec, mag, distance_arcsec}]`, nearest first. |
| `?file=<slug>/visit_NN.png` | `image/png` from the cache. |

Showcase slugs: `barnards-star`, `epsilon-indi-b`, `r-draconis`, `rw-aurigae`, `wise-0855`.

## Parameters

| Name | Range | Default |
|---|---|---|
| `ra` | 0..360 deg | required (unless `name`) |
| `dec` | -90..90 deg | required (unless `name`) |
| `size` | 0.5..10 arcmin | 2 |
| `name` | 1..100 chars | |
| `mjd` | 59000..70000 | required for identify |
| `fov` | 0.5..30 arcmin | 2 |

Numbers must be finite. `ra`, `dec` and `mjd` in `identify` are comma separated in one value.

## Errors

| Code | When |
|---|---|
| 400 | A parameter is missing, not a number, out of range, or the slug is malformed. |
| 404 | Unknown showcase slug, unknown `status` job, unresolvable `name`, missing `file`. |
| 502 | The pipeline failed (IRSA down, no frames), or Gaia was unreachable (`error` only, nothing built). Pipeline failures have `error` and `slug`; the status file says `error`. |

`identify` never fails because of JPL: when JPL is down or empty you get 200 with `bodies: []` and a `reason`
(`null` on success). Only bad input gives 400.

## Cache key and job slug

Slug = `{ra:.4f}_{dec:+.4f}_{size:g}_{release}`, for example `269.4500_+4.7300_2_qr2`. Release is `qr2`.
That slug is the cache key (directory `$BLINK_CACHE`, default the OS temp dir `/blink_cache/<slug>/`),
the job id for `status`, and the prefix of every `file` URL. A request whose `meta.json` exists returns at once.
Raw IRSA cutouts are kept in `$BLINK_CACHE/raw/` (the repo tree is read-only on Vercel). On Vercel the temp dir is per instance and not durable, so a cold instance rebuilds.
The position is looked up in Gaia (5 arcsec for `ra`/`dec`, 30 arcsec for `name`); no source means a fixed sky position, no motion (`gaia: null`, and `meta.notes` says so).

## Progress flow

1. Client calls `?ra=&dec=&size=`. The call blocks until the build ends (up to the function limit).
2. The slug is deterministic, so the client can compute it and poll `?status=<slug>` meanwhile
   (404 until the build starts). `state` is `running`, `done` or `error`. A `running` job with no update for 330 s
   (the function was killed at `maxDuration`) is reported as `error`. While running, `done`/`total` count
   frames and `message` says what is happening. On `error`, `message` is the reason.
   A second request for a slug that is already building waits for that build instead of starting another.
3. When the first call returns, use `urls` (each is `/api/blink?file=<slug>/visit_NN.png`) and `meta`.
   `meta.visits[]` has `file`, `date`, `mjd`, `band`, `wavelength_um`, `predicted_xy`, and so on.

Not tested on Vercel itself (no deploy was done); `includeFiles` and `maxDuration` in `vercel.json` are unverified.
