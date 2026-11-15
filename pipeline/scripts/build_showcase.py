"""Build the five showcase targets into web/public/showcase/<slug>/, one at a time.

Run from pipeline/:  python scripts/build_showcase.py barnards-star   (or: all)
Per-target download budget: MAX_MB for the images, and MAX_MB again for a spectrum's new cutouts (hard refusal before any download). Astrometry below is copied from the source named.
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from blink.build import build_target  # noqa: E402
from blink.query import BARNARD  # noqa: E402

OUT = Path(__file__).resolve().parents[2] / "web" / "public" / "showcase"
MAX_MB = 60
GAIA = "Gaia DR3 archive TAP (gea.esac.esa.int, gaiadr3.gaia_source), fetched 2026-11-14"

TARGETS = {
    "barnards-star": dict(
        name="Barnard's Star", astrometry=BARNARD, source=f"Gaia DR3 4472832130942575872; {GAIA}",
        # D6 near 4.9 um: the one place this star is not hard-saturated (finite core, 1-2 OVERFLOW pixels; in D2 and
        # D4 the core is NaN). Chosen for that reason before comparing with Gaia; see the notes for why it matters.
        band="SPHEREx-D6", frames_per_visit=3, match_wavelength=True, target_um=4.9, size_arcmin=5.0,
        spectrum_reason="Saturated: all 32 cached frames (D2, D4 and D6) have a saturated pixel in the aperture "
                        "(checked 2026-11-14), so every point would be dropped.",
        claim="The star's drift across the sky, measured from SPHEREx and compared with Gaia.",
        notes=["Why 4.9 um (detector D6): in D2 and D4 the core is saturated. Five Aug 2025 exposures put the star "
               "3.3 to 3.8 arcsec east of Gaia while other frames of that visit sit about 1 arcsec west. Field stars"
               " match Gaia to 0.2 arcsec and a PSF fit gives the same shift; the cause, in the detector, is not "
               "identified. An earlier D4 build with two such frames gave 9.6 +/- 1.0 (Dec) and -2.7 +/- 1.8 (RA) "
               "arcsec/yr.",
               "Motion errors include the scatter between frames in each visit, not just the scatter about the fit."]),
    "epsilon-indi-b": dict(
        name="Epsilon Indi B",
        astrometry=dict(ra=331.07645259656397, dec=-56.79381206688221, pmra=3981.97666296105,
                        pmdec=-2466.8318147663504, parallax=270.6580324694526, epoch_from=2016.0),
        source=f"Gaia DR3 6412596012146801152 (G 18.03, RUWE 4.30: the Ba+Bb binary); {GAIA}",
        # T dwarfs peak near 1.27 um (J, between the water/methane bands): brightest and same colour in every visit.
        band="SPHEREx-D2", frames_per_visit=3, match_wavelength=True, target_um=1.27, spectrum=True, size_arcmin=5.0,
        spectrum_caveats=["Ba and Bb are one blended source: the spectrum is Ba+Bb.",
                          "A T dwarf pair, far redder than the one star the method was validated on (deep water and "
                          "methane absorption): not validated for a spectrum like this.",
                          "Faint below 1 um: the 0.75 um point is about 1 sigma.",
                          "A faint, blended pair (about K 11), outside the validated brightness range (K 10.4 to 10.6): "
                          "the flux scale may read 5 to 25% high."],
        keep=("spectrum",),
        claim="Detected in every visit; its drift is reported with the error bar, no further claim.",
        notes=["Ba and Bb (0.6 arcsec apart) are one blended source at 6.15 arcsec per pixel.",
               "Epsilon Indi A is about 400 arcsec away, outside this 5 arcmin field: no common-motion view here.",
               "Frames matched to 1.27 um; the Apr 2026 visit has none closer than 1.30 to 1.37 um."]),
    "wise-0855": dict(
        name="WISE 0855-0714",
        astrometry=dict(ra=133.81890825, dec=-7.247048, pmra=-8123.7, pmdec=673.2, parallax=439.0,
                        epoch_from=2000.0),
        source=("Not in Gaia (a Y dwarf, far too faint in G). J2000 position, proper motion and parallax from SIMBAD "
                "(Kirkpatrick et al. 2021, ApJS 253, 7). The challenge coordinates 08h55m10.831s -7d14m42.53s are the "
                "WISE All-Sky position at epoch 2010.338, not J2000: see pipeline/blink/WISE0855_NOTES.md."),
        band="SPHEREx-D6", frames_per_visit=4, size_arcmin=4.0,
        spectrum_reason="Too faint: expected S/N about 2 to 3 per visit (not separately detected in any), and blended with a "
                        "background star; per-frame points would be noise.",
        claim="Not separately detected: about 2 sigma per visit in forced photometry (0.39 +/- 0.20, 0.67 +/- 0.28 and "
              "0.31 +/- 0.14 mJy; S/N 2.0, 5.1 and 4.9 in the visit stacks), consistent with the expected 0.47 mJy plus "
              "a blended background star.",
        # the stack rule passes once (Nov 2025, S/N 5.1) only with the background star's flux in the aperture
        not_detected="the S/N includes a blended background star (W2 15.05, about 0.16 mJy, a quarter of the expected "
                     "blend), so it is not a detection of WISE 0855",
        notes=["Expected brightness is only marginal: W2 13.9 (about 0.47 mJy) gives an expected S/N of about 2 to 3 per visit.",
               "A faint background star (AllWISE J085501.95-071428.1, W2 15.05, about 0.16 mJy) sits inside the "
               "aperture, about 1.3 pixels from the 2025-26 position, so any signal is blended.",
               "Noise re-checked 2026-11-14: an earlier build's S/N (8.1 and 7.9) ignored that reprojection "
               'correlates neighbouring pixels. Measured at about 1000 blank positions per stack, the noise is 1.65 '
               'to 1.74x higher, matching the scatter between frames, so S/N is 2.0, 5.1 and 4.9. Single-frame '
               'errors match blank-sky scatter (median ratio 1.1), so the photometry errors stand.',
               "Not detected on its own in any visit: the one stack over S/N 5 (Nov 2025, 5.1) includes the "
               "background star and would be about 4 without it. No star marker is drawn."]),
    "rw-aurigae": dict(
        name="RW Aurigae",
        astrometry=dict(ra=76.95608119552952, dec=30.401204589097233, pmra=2.6406431770317083,
                        pmdec=-27.397582540455325, parallax=6.406249329219477, epoch_from=2016.0),
        source=(f"Gaia DR3 156430822114424576 (G 12.18), the brighter of the pair; the other is Gaia DR3 "
                f"156430817820015232 (G 13.04, RUWE 16.4), 1.5 arcsec away. Which is A is not verified; {GAIA}"),
        # D1 at 0.75 um, its blue end: the only place RW Aur is not saturated (7/9 frames at 0.89-0.94 um are).
        band="SPHEREx-D1", frames_per_visit=1, match_wavelength=True, target_um=0.75, photometry="light_curve",
        spectrum_reason="Saturated beyond about 0.75 um (7 of the 12 cached D1 frames, checked 2026-11-14): a spectrum "
                        "would be its blue end only, and A+B blended.",
        claim="Brightness at 0.75 um, one wavelength: 72 mJy in Sep 2025, 183 mJy in Sep 2026.",
        notes=["RW Aur A and B (1.5 arcsec apart) are one blended source: the photometry is A+B.",
               "One frame per visit at 0.75 um, so no within-visit scatter. March 2026 has no frame near 0.75 um, so"
               " it has no point (its image is at another wavelength).",
               "The calibration was checked against 2MASS/WISE on a field star (about 4%, D3), not on RW Aur, whose "
               "2MASS epoch predates its dimming. A field star in the same frames holds at about 3.3 mJy, so the "
               "2.5x brightening is the star, not the calibration.",
               "Earlier sums of 65 to 90 mJy at 0.90 to 0.94 um were a masking artifact (the saturated peak was left out) "
               "and are not brightness."]),
    "r-draconis": dict(
        name="R Draconis",
        astrometry=dict(ra=248.1673783672889, dec=66.75500674547219, pmra=-20.642811719160797,
                        pmdec=6.148818852711324, parallax=1.2509180143740992, epoch_from=2016.0),
        source=f"Gaia DR3 1648328016354496384 (G 6.37, RUWE 1.30); {GAIA}",
        band="SPHEREx-D1", frames_per_visit=2, match_wavelength=True, photometry=None,
        spectrum_reason="Saturated: all 14 cached frames have a saturated pixel in the aperture (whole core masked).",
        claim="Images about monthly at matched wavelengths; saturated, so no brightness measurement.",
        notes=["Near the north ecliptic pole SPHEREx sees this star almost continuously; 'visits' here are 30-day bins.",
               "SPHEREx saturates on this star in every band checked (the whole core is masked): no brightness is "
               "reported, images only.",
               "Difference images: the saturated core is blank, and the ring around it mixes leftovers from the "
               "saturated star with real change (R Dra varies). Not a measurement."]),
}


def build(slug, out_root=OUT, **kw):
    t = TARGETS[slug]
    a = t["astrometry"]
    opts = {k: t[k] for k in ("band", "frames_per_visit", "size_arcmin", "match_wavelength", "target_um", "photometry",
                                  "spectrum") if k in t}
    old = Path(out_root) / slug / "meta.json"
    keep = opts.get("spectrum") and "spectrum" in t.get("keep", ()) and old.exists()
    if keep:  # the spectrum comes from 2' cutouts and does not depend on the image field: carry it over, do not redo it
        opts["spectrum"], kept = False, json.loads(old.read_text())
    meta = build_target(slug, a["ra"], a["dec"], a, Path(out_root) / slug, max_mb=MAX_MB, **{"spectrum_mb": MAX_MB, **opts, **kw})
    if keep:
        meta["spectrum"], meta["spectrum_reason"] = kept["spectrum"], kept.get("spectrum_reason")
    meta["target"] = dict(name=t["name"], claim=t["claim"], astrometry=a, astrometry_source=t["source"])
    if "not_detected" in t:  # the stack rule passed only on something the target notes explain (e.g. a blend)
        for i, v in enumerate(meta["visits"]):
            if v["star_xy"] is not None:
                snr = meta["photometry"][i]["snr_stack"] if meta["photometry"] else float("nan")
                v["star_xy"] = None
                v["flags_summary"] = f"not separately detected: S/N {snr:.1f}, but {t['not_detected']}; flags {v['flags_summary']}"
        meta["detected"] = [False] * len(meta["visits"])
        meta["notes"] = [n for n in meta["notes"] if not n.startswith(("Not detected in", "No motion fit"))]
    meta["notes"] = t.get("notes", []) + meta.get("notes", [])
    if meta["spectrum"] and not keep:  # a kept spectrum already has its caveats
        meta["spectrum"]["caveats"] += t.get("spectrum_caveats", [])
    elif "spectrum_reason" in t:
        meta["spectrum_reason"] = t["spectrum_reason"]
    (Path(out_root) / slug / "meta.json").write_text(json.dumps(meta, indent=2))
    return meta


if __name__ == "__main__":
    import warnings
    from astropy import log
    log.setLevel("WARNING")  # the SIP-suffix INFO repeats for every frame
    warnings.simplefilter("ignore", RuntimeWarning)  # all-NaN slices from masked cores
    arg = sys.argv[1] if len(sys.argv) > 1 else ""
    if arg != "all" and arg not in TARGETS:
        raise SystemExit(f"usage: build_showcase.py <{'|'.join(TARGETS)}|all>")
    for s in (TARGETS if arg == "all" else [arg]):
        build(s)
