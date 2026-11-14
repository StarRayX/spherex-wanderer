# Data contract: moving-object spectra and dot triage

The pivot from viewer to tool (decided Sat Nov 14 by Clarence). Everything is precomputed by Python scripts and served as static files, because one object or field takes minutes and will not fit a serverless call.

## Known-mover spectrophotometry: `web/public/movers/`

- `index.json`: a list, one entry per object. Assembled by the orchestrator from each object's `meta`.
  `[{ "slug", "name", "designation", "kind": "comet" | "asteroid", "n_rows", "wl_min_um", "wl_max_um", "date_first", "date_last", "note" }]`
- `<slug>/spectrum.json`:
  ```
  {
    "meta": { slug, name, designation, kind, n_rows, wl_min_um, wl_max_um, date_first, date_last, note,
              aperture_arcsec (RADIUS), annulus_arcsec: [inner radius, outer radius], ephemeris: "JPL Horizons" | "IRSA comet3iatlas table",
              method: "<two plain sentences>", caveats: ["..."], bands: [{ "um": 4.26, "label": "CO2" }] },
    "rows": [ { "mjd", "iso", "obs_id", "detector", "ra_pred", "dec_pred", "ra_meas", "dec_meas",
                "offset_arcsec", "wavelength_um", "bandwidth_um", "flux_ujy", "flux_err_ujy", "snr", "flags" } ]
  }
  ```
  - `ra_meas`/`dec_meas` are a centroid near the predicted position (null if S/N < 5).
  - `flux_ujy` is an aperture sum of the calibrated MJy/sr image, minus the annulus median, times the pixel solid angle, in microjanskys. Not reflectance, no aperture correction.
  - `flags` is the OR of the SPHEREx FLAGS bits inside the aperture (integer).
  - Rows are sorted by `wavelength_um`.
- `<slug>/spectrum.csv` and `<slug>/spectrum.vot`: the same rows (VOTable via astropy, with units and the meta as PARAMs or INFO).
- `<slug>/frames.json` and `<slug>/frames/NN.png`: up to 12 small cutouts (about 3 arcmin, same stretch rules as the showcase) centred on the predicted position, for a blink.
  `[{ "file": "frames/01.png", "iso", "wavelength_um", "ra", "dec", "size_deg" }]`

## "Vet this dot" triage: `web/public/triage/`

- `index.json`: `[{ "slug", "name", "ra", "dec", "detector", "date_first", "date_last", "counts": { known_asteroid, star_residual, cosmic_ray, edge_mask, unconfirmable, unexplained } }]`
- `<slug>/triage.json`:
  ```
  {
    "meta": { slug, name, ra, dec, detector, date_first, date_last, depth_note, method, caveats: [..], counts: {...},
              transient_bit_overlap: { cosmic_rays: N, flagged_transient_by_pipeline: M } },
    "rows": [ { "id", "ra", "dec", "mjd", "iso", "obs_id", "verdict", "reason",
                "evidence": { "jpl_name", "jpl_offset_arcsec", "flags_bits", "flag_names": [..],
                              "nearest_gaia_g", "nearest_gaia_sep_arcsec", "edge_px", "in_adjacent_frame" },
                "thumb": "thumbs/<id>.png" } ]
  }
  ```
  - `verdict` is one of: `known_asteroid`, `star_residual`, `cosmic_ray`, `edge_mask`, `unconfirmable`, `unexplained`.
  - `reason` is one plain sentence a non-astronomer can read.
- `<slug>/triage.csv`: the same rows, flattened.

## Rules for every number
- Only numbers produced by a script in `pipeline/scripts/` that can be rerun. No hand-typed results.
- No discovery language. Depth is about V 18 to 19.
- 3I/ATLAS: no water-ice claim from December data; the comet is extended, so flux depends on aperture (say which).
