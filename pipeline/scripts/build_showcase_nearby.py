"""Seven more nearby fast-moving stars for the showcase, built with the same rules as scripts/build_showcase.py.

Run from pipeline/:  python scripts/build_showcase_nearby.py proxima-centauri   (or: all)
Adds entries to build_showcase.TARGETS and calls its build(): same budget (MAX_MB), same motion fit, saturation
flags and detection rule. Astrometry is copied from the Gaia DR3 archive TAP (gaiadr3.gaia_source), fetched
2026-11-14; source_id, G and RUWE are given in each entry's source line.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_showcase as bs  # noqa: E402

GAIA = bs.GAIA
# D6 near 4.9 um: the band Barnard's Star (K 4.5) needed, because D1 to D4 saturate the core of a star this bright.
BRIGHT = dict(band="SPHEREx-D6", frames_per_visit=3, match_wavelength=True, target_um=4.9)
NOT_SPECTRUM = "Not built: a star this bright saturates SPHEREx below about 4.4 um, so most points would be dropped."

NEW = {}  # filled below


def _add(slug, name, astrometry, source, claim, notes=(), **opts):
    NEW[slug] = dict(name=name, astrometry=dict(**astrometry, epoch_from=2016.0), source=f"{source}; {GAIA}",
                     claim=claim, notes=list(notes), spectrum_reason=opts.pop("spectrum_reason", NOT_SPECTRUM),
                     **{**BRIGHT, **opts})


MOTION_CLAIM = "The star's drift across the sky, measured from SPHEREx and compared with Gaia."

_add("proxima-centauri", "Proxima Centauri",
     dict(ra=217.39232147200883, dec=-62.67607511676666, pmra=-3781.741008265163, pmdec=769.4650146478623,
          parallax=768.0665391873573),
     "Gaia DR3 5853498713190525696 (G 8.98, RUWE 0.97)", ("Detected in every visit; the drift fit is under 3 sigma, so it is shown with its error bar and no "
      "motion claim."),
     ["Close to the Galactic plane: a crowded field, so neighbours can sit near the star."])
_add("kapteyns-star", "Kapteyn's Star",
     dict(ra=77.9599373502188, dec=-45.0438126993602, pmra=6491.223339061598, pmdec=-5708.614150045243,
          parallax=254.19859326384577),
     "Gaia DR3 4810594479418041856 (G 8.06, RUWE 1.17)", MOTION_CLAIM)
_add("groombridge-1830", "Groombridge 1830",
     dict(ra=178.26735320817272, dec=37.69282694689086, pmra=4002.654640989075, pmdec=-5817.8001940492695,
          parallax=109.02963997046682),
     "Gaia DR3 4034171629042489088 (G 6.20, RUWE 0.88)", MOTION_CLAIM)
_add("61-cygni-a", "61 Cygni A",
     dict(ra=316.7484792940004, dec=38.76386244649797, pmra=4164.2086922846665, pmdec=3249.613883848584,
          parallax=285.99494829578117),
     ("Gaia DR3 1872046609345556480 (G 4.77, RUWE 1.20), the brighter of the pair; 61 Cyg B is Gaia DR3 "
      "1872046574983497216 (G 5.45), about 31 arcsec to the south-east"), MOTION_CLAIM,
     ["61 Cygni B is about 31 arcsec (5 px) from A, inside this 2 arcmin field; the measurement is of A only.",
      "The brightest of these targets (G 4.8): expect saturation even at 4.9 um."])
_add("lacaille-9352", "Lacaille 9352",
     dict(ra=346.5039166796005, dec=-35.8471642082214, pmra=6765.995136250774, pmdec=1330.2852747179845,
          parallax=304.1353692001036),
     "Gaia DR3 6553614253923452800 (G 6.52, RUWE 0.93)", MOTION_CLAIM)
_add("wolf-359", "Wolf 359",
     dict(ra=164.10319030755974, dec=7.002726940984864, pmra=-3866.3382751436793, pmdec=-2699.214987679166,
          parallax=415.17941567802137),
     "Gaia DR3 3864972938605115520 (G 11.04, RUWE 0.84)", MOTION_CLAIM)
_add("luhman-16", "Luhman 16",
     dict(ra=162.3084022291181, dec=-53.3180447534979, pmra=-2768.511, pmdec=358.472, parallax=500.993),
     ("Position: Gaia DR3 5353626573555863424 (G 16.92), a 2-parameter solution with no proper motion or parallax: "
      "Gaia lists only one blended source for the A+B pair. Proper motion and parallax: Bedin et al. 2024, "
      "Astron. Nachr. 345, e230158, as quoted on en.wikipedia.org/wiki/Luhman_16 (CDS was down, so not checked in SIMBAD)"),
     ("Detected in every visit. No drift fit: the visits span about a year, and the expected 3.0 arcsec drift "
      "is under the half pixel (3.1 arcsec) the fit needs."),
     ["Luhman 16 A and B (about 1.5 arcsec apart in this era) are one blended source at 6.15 arcsec per pixel.",
      "Gaia DR3 gives only a position for the pair; the motion and parallax used here are from Bedin et al."
      " 2024.",
      "Frames matched to 1.27 um as for Epsilon Indi B (another L/T brown dwarf pair)."],
     band="SPHEREx-D2", target_um=1.27,
     spectrum_reason="Not requested for this target (opt-in); a spectrum would be of A and B blended.")

bs.TARGETS.update(NEW)

if __name__ == "__main__":
    import time
    import warnings
    from astropy import log
    log.setLevel("WARNING")
    warnings.simplefilter("ignore", RuntimeWarning)
    arg = sys.argv[1] if len(sys.argv) > 1 else ""
    if arg != "all" and arg not in NEW:
        raise SystemExit(f"usage: build_showcase_nearby.py <{'|'.join(NEW)}|all>")
    for s in (NEW if arg == "all" else [arg]):
        t0 = time.time()
        try:
            bs.build(s)
        except Exception as e:  # report and go on: a failed target must not stop the others
            print(f"FAILED {s}: {type(e).__name__}: {e}")
        print(f"BUILD_TIME {s} {time.time() - t0:.0f} s", flush=True)
