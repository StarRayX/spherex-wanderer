"""Step 7: write visit PNGs + meta.json for the frontend (web/public/showcase/<slug>/).

meta.json: {slug, pixel_scale_arcsec: 6.15, upsample: 4,
  stretch: {kind: "asinh", black, white, softening},   # same for every visit
  visits: [{file, date, mjd, band, wavelength_um (mean of frames), wavelength_min_um, wavelength_max_um,
            star_xy: [x,y]|null,        # null = not detected, draw no marker
            predicted_xy: [x,y],        # Gaia-propagated; pixel coords of the un-upsampled image
            flags_summary}],
  motion: {measured_arcsec_per_yr, error_arcsec_per_yr, gaia_arcsec_per_yr, ...optional extras} | null,
  optional (blink.build): target, notes [str], photometry [per visit], detected, cutouts_mb (size of the cutouts used),
  differences [per consecutive visit pair], difference_stretch, spectrum | null, spectrum_reason}
Pixel coords are in original pixels (multiply by `upsample` for PNG pixels).
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

PIXEL_SCALE = 6.15
UPSAMPLE = 4
SOFTENING = 10.0


def render_target(slug, visits, out_dir, motion=None, extra=None):
    """extra: optional new top-level meta keys (e.g. photometry, notes); never overrides the keys above."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    allpix = np.concatenate([np.asarray(v["image"], float).ravel() for v in visits])
    allpix = allpix[np.isfinite(allpix)]
    black, white = (float(x) for x in np.percentile(allpix, [1, 99.5]))
    span = (white - black) or 1.0
    rows = []
    for i, v in enumerate(visits):
        x = np.clip((np.nan_to_num(np.asarray(v["image"], float), nan=black) - black) / span, 0, 1)
        y = np.arcsinh(SOFTENING * x) / np.arcsinh(SOFTENING)
        img = Image.fromarray((y * 255).astype(np.uint8), "L")
        img = img.resize((img.width * UPSAMPLE, img.height * UPSAMPLE), Image.BICUBIC)
        name = f"visit_{i:02d}.png"
        img.save(out / name)
        rows.append({"file": name, **{k: v.get(k) for k in (
            "date", "mjd", "band", "wavelength_um", "wavelength_min_um", "wavelength_max_um", "star_xy", "predicted_xy", "flags_summary")}})
    meta = {"slug": slug, "pixel_scale_arcsec": PIXEL_SCALE, "upsample": UPSAMPLE,
            "stretch": {"kind": "asinh", "black": black, "white": white, "softening": SOFTENING},
            "visits": rows, "motion": motion}
    meta.update({k: v for k, v in (extra or {}).items() if k not in meta})
    (out / "meta.json").write_text(json.dumps(meta, indent=2))
    return meta


def render_differences(images, names, out_dir):
    """Difference PNGs (later minus earlier visit), one symmetric asinh stretch shared by all, centred on zero:
    mid grey = no change, white = brighter later, black = brighter earlier, transparent = NaN (masked, e.g. a
    saturated core: unknown, not "no change"). Grey + alpha PNG, same size as the visit PNGs. Returns the stretch."""
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    allpix = np.abs(np.concatenate([np.asarray(d, float).ravel() for d in images]))
    allpix = allpix[np.isfinite(allpix)]
    limit = float(np.percentile(allpix, 99.5)) if allpix.size else 0.0
    limit = limit or 1.0
    for d, name in zip(images, names):
        d = np.asarray(d, float)
        x = np.clip(np.nan_to_num(d) / limit, -1, 1)
        y = 0.5 + 0.5 * np.arcsinh(SOFTENING * x) / np.arcsinh(SOFTENING)
        la = np.stack([np.round(y * 255), np.where(np.isfinite(d), 255, 0)], -1).astype(np.uint8)
        img = Image.fromarray(la, "LA")
        img.resize((img.width * UPSAMPLE, img.height * UPSAMPLE), Image.BICUBIC).save(out / name)
    return {"kind": "asinh_symmetric", "limit": limit, "softening": SOFTENING}
