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
        band="SPHEREx-D4", frames_per_visit=3,
        claim="The star's drift across the sky, measured from SPHEREx and compared with Gaia."),
    "epsilon-indi-b": dict(
        name="Epsilon Indi B",
        astrometry=dict(ra=331.07645259656397, dec=-56.79381206688221, pmra=3981.97666296105,
                        pmdec=-2466.8318147663504, parallax=270.6580324694526, epoch_from=2016.0),
        source=f"Gaia DR3 6412596012146801152 (G 18.03, RUWE 4.30: the Ba+Bb binary); {GAIA}",
        band="SPHEREx-D2", frames_per_visit=3,
        claim="Detected in every visit; its drift is reported with the error bar, no further claim.",
        notes=["Ba and Bb (0.6 arcsec apart) are one blended source at 6.15 arcsec per pixel.",
               "Epsilon Indi A is about 400 arcsec away, outside this 2 arcmin field: no common-motion view here."]),
    "wise-0855": dict(
        name="WISE 0855-0714",
        astrometry=dict(ra=133.79512916666667, dec=-7.245147222222222, pmra=-8120.0, pmdec=670.0, parallax=None,
                        epoch_from=2000.0),
        source=("Not in Gaia (a Y dwarf, far too faint in G). Position: challenge coordinates 08h55m10.831s "
                "-7d14m42.53s; motion -8.12, +0.67 arcsec/yr (Luhman 2014, docs/evidence_notes.md). The J2000 epoch "
                "of the coordinates is an UNVERIFIED assumption; parallax not applied."),
        band="SPHEREx-D6", frames_per_visit=4, size_arcmin=4.0,
        claim="The hardest target: what SPHEREx sees at 4.4 to 5 um at the predicted position.",
        notes=["Position epoch UNVERIFIED: if the coordinates are at the WISE epoch (about 2010) and not J2000, the true "
               "position is about 85 arcsec east of the marker. The 4 arcmin field covers both cases.",
               "One-off check (2026-11-14, same stacks): forced S/N at the epoch-2010.5 position is 3.1, 7.6 and 6.1 in "
               "the three visits, with the local peak on that spot. A candidate only: the epoch is unverified and a "
               "background source there would look the same. No marker is drawn for it."]),
    "rw-aurigae": dict(
        name="RW Aurigae",
        astrometry=dict(ra=76.95608119552952, dec=30.401204589097233, pmra=2.6406431770317083,
                        pmdec=-27.397582540455325, parallax=6.406249329219477, epoch_from=2016.0),
        source=(f"Gaia DR3 156430822114424576 (G 12.18), the brighter of the pair; the other is Gaia DR3 "
                f"156430817820015232 (G 13.04, RUWE 16.4), 1.5 arcsec away. Which is A is not verified; {GAIA}"),
        band="SPHEREx-D1", frames_per_visit=3, match_wavelength=True,
        claim="Brightness per visit, at matched wavelengths within the band.",
        notes=["RW Aur A and B (1.5 arcsec apart) are one blended source: the photometry is A+B."]),
    "r-draconis": dict(
        name="R Draconis",
        astrometry=dict(ra=248.1673783672889, dec=66.75500674547219, pmra=-20.642811719160797,
                        pmdec=6.148818852711324, parallax=1.2509180143740992, epoch_from=2016.0),
        source=f"Gaia DR3 1648328016354496384 (G 6.37, RUWE 1.30); {GAIA}",
        band="SPHEREx-D1", frames_per_visit=2, match_wavelength=True,
        claim="Images about monthly at matched wavelengths; saturated, so no brightness measurement.",
        notes=["Near the north ecliptic pole SPHEREx sees this star almost continuously; 'visits' here are 30-day bins.",
               "R Dra saturates SPHEREx even at 0.94 um: the core is masked in every frame, so the aperture sums are "
               "lower limits and NOT a brightness measurement."]),
}


def build(slug, out_root=OUT, **kw):
    t = TARGETS[slug]
    a = t["astrometry"]
    opts = {k: t[k] for k in ("band", "frames_per_visit", "size_arcmin", "match_wavelength") if k in t}
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
