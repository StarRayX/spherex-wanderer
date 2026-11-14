"""Build the five showcase targets into web/public/showcase/<slug>/, one at a time.

Run from pipeline/:  python scripts/build_showcase.py barnards-star   (or: all)
Per-target download budget: MAX_MB (hard refusal before any download). Astrometry below is copied from the source named.
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
        band="SPHEREx-D6", frames_per_visit=3, match_wavelength=True, target_um=4.9,
        claim="The star's drift across the sky, measured from SPHEREx and compared with Gaia.",
        notes=["Why D6 at 4.9 um (checked 2026-11-14 on cached frames): in D2 and D4 the core is saturated, and five Aug "
               "2025 exposures put the fitted star 3.3 to 3.8 arcsec east of Gaia while other frames of the same visit "
               "sit about 1 arcsec west, at any wavelength (1.1 to 3.8 um; the same 2.44 um and detector spot gives both). "
               "15 to 17 Gaia field stars in the same exposures agree with Gaia to 0.2 arcsec, so the WCS is fine; "
               "fitting the official ePSF instead of a Gaussian gives the same shift; the excess sits within 3 px of the "
               "core. Cause in the detector not identified. The earlier D4 build (9.6 +/- 1.0 Dec, -2.7 +/- 1.8 RA "
               "arcsec/yr) included two such frames.",
               "Motion errors include the frame-to-frame scatter within each visit, not only the scatter about the line."]),
    "epsilon-indi-b": dict(
        name="Epsilon Indi B",
        astrometry=dict(ra=331.07645259656397, dec=-56.79381206688221, pmra=3981.97666296105,
                        pmdec=-2466.8318147663504, parallax=270.6580324694526, epoch_from=2016.0),
        source=f"Gaia DR3 6412596012146801152 (G 18.03, RUWE 4.30: the Ba+Bb binary); {GAIA}",
        # T dwarfs peak near 1.27 um (J, between the water/methane bands): brightest and same colour in every visit.
        band="SPHEREx-D2", frames_per_visit=3, match_wavelength=True, target_um=1.27,
        claim="Detected in every visit; its drift is reported with the error bar, no further claim.",
        notes=["Ba and Bb (0.6 arcsec apart) are one blended source at 6.15 arcsec per pixel.",
               "Epsilon Indi A is about 400 arcsec away, outside this 2 arcmin field: no common-motion view here.",
               "Frames matched to 1.27 um; the Apr 2026 visit has none closer than 1.30 to 1.37 um."]),
    "wise-0855": dict(
        name="WISE 0855-0714",
        astrometry=dict(ra=133.81890825, dec=-7.247048, pmra=-8123.7, pmdec=673.2, parallax=439.0,
                        epoch_from=2000.0),
        source=("Not in Gaia (a Y dwarf, far too faint in G). J2000 position, proper motion and parallax from SIMBAD "
                "(Kirkpatrick et al. 2021, ApJS 253, 7). The challenge coordinates 08h55m10.831s -7d14m42.53s are the "
                "WISE All-Sky position at epoch 2010.338, not J2000: see pipeline/blink/WISE0855_NOTES.md."),
        band="SPHEREx-D6", frames_per_visit=4, size_arcmin=4.0,
        claim="The hardest target: what SPHEREx sees at 4.4 to 5 um at the predicted position.",
        notes=["Expected brightness is only marginal: W2 13.9 (about 0.47 mJy) gives an expected S/N of about 2 to 3 per visit.",
               "A faint background star (AllWISE J085501.95-071428.1, W2 15.05) sits about 1.3 pixels from the 2025-26 "
               "position, inside the measuring aperture, so any signal here may be blended. Candidate only unless the "
               "build's detection rule passes."]),
    "rw-aurigae": dict(
        name="RW Aurigae",
        astrometry=dict(ra=76.95608119552952, dec=30.401204589097233, pmra=2.6406431770317083,
                        pmdec=-27.397582540455325, parallax=6.406249329219477, epoch_from=2016.0),
        source=(f"Gaia DR3 156430822114424576 (G 12.18), the brighter of the pair; the other is Gaia DR3 "
                f"156430817820015232 (G 13.04, RUWE 16.4), 1.5 arcsec away. Which is A is not verified; {GAIA}"),
        # D1 at 0.75 um, its blue end: the only place RW Aur is not saturated (7/9 frames at 0.89-0.94 um are).
        band="SPHEREx-D1", frames_per_visit=1, match_wavelength=True, target_um=0.75, photometry="light_curve",
        claim="Brightness at 0.75 um, one wavelength: 72 mJy in Sep 2025, 183 mJy in Sep 2026.",
        notes=["RW Aur A and B (1.5 arcsec apart) are one blended source: the photometry is A+B.",
               "One frame per visit at 0.75 um, so no within-visit scatter; March 2026 has no frame near 0.75 um, so "
               "there is no point for it (that visit's image is at a different wavelength and is not measured).",
               "RW Aur itself is not independently validated: the SPHEREx calibration was checked against 2MASS/WISE on a "
               "field star (about 4%, D3), not on RW Aur, whose 2MASS epoch predates its dimming. A field star in the same "
               "frames stays at about 3.3 mJy, so the 2.5x brightening is the star, not the calibration.",
               "Earlier sums of 65 to 90 mJy at 0.90 to 0.94 um were a masking artifact (the saturated peak was left out) "
               "and are not brightness."]),
    "r-draconis": dict(
        name="R Draconis",
        astrometry=dict(ra=248.1673783672889, dec=66.75500674547219, pmra=-20.642811719160797,
                        pmdec=6.148818852711324, parallax=1.2509180143740992, epoch_from=2016.0),
        source=f"Gaia DR3 1648328016354496384 (G 6.37, RUWE 1.30); {GAIA}",
        band="SPHEREx-D1", frames_per_visit=2, match_wavelength=True, photometry=None,
        claim="Images about monthly at matched wavelengths; saturated, so no brightness measurement.",
        notes=["Near the north ecliptic pole SPHEREx sees this star almost continuously; 'visits' here are 30-day bins.",
               "SPHEREx saturates on this star in every band checked (the whole core is masked), so no brightness is "
               "reported. The images are shown as a flipbook only."]),
}


def build(slug, out_root=OUT, **kw):
    t = TARGETS[slug]
    a = t["astrometry"]
    opts = {k: t[k] for k in ("band", "frames_per_visit", "size_arcmin", "match_wavelength", "target_um", "photometry") if k in t}
    meta = build_target(slug, a["ra"], a["dec"], a, Path(out_root) / slug, max_mb=MAX_MB, **{**opts, **kw})
    meta["target"] = dict(name=t["name"], claim=t["claim"], astrometry=a, astrometry_source=t["source"])
    meta["notes"] = t.get("notes", []) + meta.get("notes", [])
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
