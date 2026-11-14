# WISE 0855-0714: coordinate epoch (research notes, 2026-11-14)

## Verdict

The challenge coordinates (08h55m10.831s, -7d14m42.53s) are the **WISE All-Sky
single-epoch position from 2010 May 1 (MJD 55320.38, J2010.338)**. They are not J2000.
Our current build (epoch_from=2000.0) puts the marker about 84 arcsec (13.7 px) too far
west. Confidence: high. Two independent checks agree to 0.6 arcsec (0.1 px).

## Evidence

1. **WISE All-Sky Source Catalog** (IRSA TAP, `allsky_4band_p3as_psd`, queried 2026-11-14):
   designation J085510.83-071442.5, ra 133.7951322, dec -7.2451463
   (08:55:10.832, -07:14:42.53), w2mpro 13.63, W2 observed MJD 55319.89 to 55320.89.
   This matches the challenge coordinates to 0.01 arcsec, and the name matches the
   Luhman 2014 designation. https://irsa.ipac.caltech.edu/TAP/sync
2. **AllWISE** (`allwise_p3as_psd`): J085510.74-071442.5, 133.7947597, -7.2451456, mean
   MJD 55412 (2010.59, which averages the cryogenic and post-cryo passes). It is 5 arcsec
   west of the All-Sky position, as the motion predicts. So the source exists at the
   2010 position.
3. **SIMBAD** (Harvard mirror TAP; the CDS Strasbourg server returned 404). Main id is WISEA
   J085510.74-071442.5. J2000 barycentric position: 133.81890825, -7.247048
   (08:55:16.54). Proper motion: -8123.7, +673.2 mas/yr. Parallax: 439.0 +/- 2.4 mas.
   Source: Kirkpatrick et al. 2021, ApJS 253, 7. That J2000 position is 85 arcsec east of
   the challenge coordinates, which is about 10.3 yr x 8.12 arcsec/yr. If we propagate it
   to 2010.338 and add parallax, it lands 0.56 arcsec from the challenge position.
   Other values in SIMBAD: Kirkpatrick 2019 gives -8118.9, +679.3 mas/yr and 438.9 mas;
   Tinney 2014 gives 448 mas; Luhman 2014 (ApJ 781, 4) gives an early PM of -4.8, +0.5.
   Luhman & Esplin 2016 give 449 +/- 8 mas and -8188, +680 mas/yr. I saw those only in
   a search snippet (https://sites.google.com/view/ydwarfcompendium/y-dwarfs/wise-0855-0714)
   and did not open the paper.
4. **Challenge page:** it did not render in the built-in browser (body text was empty
   after a 14 s wait), and WebFetch failed on a TLS error. **NOT CONFIRMED** whether the page
   states an epoch. The coordinates match the WISE All-Sky entry to every digit given,
   which strongly suggests that is where the page took them from.

## Predicted positions (pipeline/.venv astropy; Earth barycentric vector for parallax)

Hypotheses: A is the current build (J2000, no parallax). B is the challenge coordinates
at J2010.338, de-parallaxed, propagated with the K21 PM, then re-parallaxed. C is the
SIMBAD/K21 J2000 position with PM and parallax.

| Visit | A (ra, dec) | B (ra, dec) | B - A | C - B |
|---|---|---|---|---|
| 2025-05-05 | 133.737508 -7.240431 | 133.760997 -7.242340 | +83.9E -6.9N = 84.2" (13.7 px) | 0.6" (0.1 px) |
| 2025-11-19 | 133.736276 -7.240330 | 133.759996 -7.242315 | +84.7E -7.1N = 85.0" (13.8 px) | 0.6" (0.1 px) |
| 2026-04-28 | 133.735284 -7.240249 | 133.758773 -7.242164 | +83.9E -6.9N = 84.2" (13.7 px) | 0.6" (0.1 px) |

Parallax moves the position by about 0.45 arcsec (0.07 px) in either direction, which
is negligible at 6.15 arcsec/px. The earlier one-off check (2010.5, no parallax) is
within 1.4 arcsec (0.2 px) of B, so its forced S/N values (3.1, 7.6, 6.1) were measured
at the right spot.

## Recommended registry values (build_showcase.py)

Preferred: barycentric and self-consistent with parallax.
`ra=133.81890825, dec=-7.247048, pmra=-8123.7, pmdec=673.2, parallax=439.0, epoch_from=2000.0`
Source string: "SIMBAD / Kirkpatrick et al. 2021 (ApJS 253, 7); equals the challenge
coordinates (WISE All-Sky, epoch 2010.338) to 0.6 arcsec."

Equivalent alternative that keeps the challenge numbers:
`ra=133.7951322, dec=-7.2451463, pmra=-8123.7, pmdec=673.2, parallax=439.0, epoch_from=2010.338`
This alternative is a single-epoch apparent position. Treating it as barycentric adds
up to 0.45 arcsec of error, which is harmless here.

## Is a detection expected?

W2 = 13.89 Vega (Luhman 2014) corresponds to about 0.47 mJy at 4.6 um (W2 zero point
171.8 Jy). Our per-frame aperture errors are 0.21 to 0.37 mJy and the per-visit errors
are 0.16 to 0.24 mJy. So the expected S/N is about 1.5 to 2 per frame and about 2 to 3
per visit stack. A marginal detection or a non-detection is the expected outcome. A
clean 5-sigma per visit would be lucky.

**Contamination caveat:** AllWISE J085501.95-071428.1 (W2 15.05, about 0.16 mJy, a
stationary background star) sits about 8 arcsec (1.3 px) from the 2025-26 position. It
is inside the 3 px aperture and adds roughly a third of the expected flux. The S/N 7.6
candidate is brighter than W2 alone predicts, so blending is a real possibility.

Suggested card text if it stays below threshold: "WISE 0855 (the coldest known brown
dwarf, W2 = 13.9) sits at the limit of SPHEREx's 4.4-5 um channels. The faint excess at
its predicted position (S/N 3 to 8 per visit) is a candidate only; a background star
1.3 px away is blended with it. It moves about 8 arcsec (1.3 px) a year, too little to
separate cleanly at 6.15 arcsec per pixel."
