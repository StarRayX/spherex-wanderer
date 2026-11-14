import sys, json, time, warnings, logging
sys.path.insert(0, r"C:\Users\StarX\Desktop\SCHOOL\career-building\projects\nasaspaceapps\pipeline")
warnings.filterwarnings("ignore")
from astropy import log; log.setLevel("ERROR")
import numpy as np
from astropy.io import fits
from astropy.wcs import WCS
from astropy.stats import mad_std
from reproject import reproject_interp
from scipy import ndimage as ndi
from blink.stack import target_wcs, BAD_FLAGS, SATURATED, wavelength_at
RA, DEC, N = 150.05, 13.17, 293
t0 = time.time()
v = json.load(open("d1.json"))
out = target_wcs(RA, DEC, N)
imgs, vars_, sat = [], [], []
for f in v:
    with fits.open(f["path"]) as h:
        w = WCS(h["IMAGE"].header)
        img = h["IMAGE"].data.astype(float) - h["ZODI"].data
        fl = h["FLAGS"].data
        img[(fl & BAD_FLAGS) != 0] = np.nan
        var = h["VARIANCE"].data.astype(float)
        s = ((fl & SATURATED) != 0).astype(float)
        a, _ = reproject_interp((img, w), out, shape_out=(N, N))
        b, _ = reproject_interp((var, w), out, shape_out=(N, N))
        c, _ = reproject_interp((s, w), out, shape_out=(N, N), order="nearest-neighbor")
    a -= np.nanmedian(a)
    imgs.append(a); vars_.append(b); sat.append(c > 0)
    f["wave"] = wavelength_at(f["path"], RA, DEC)
    f["seq"] = f["obs_id"].rsplit("_", 1)[0]
t_rep = time.time() - t0
imgs = np.array(imgs)
dets = []
for i, f in enumerate(v):
    others = [j for j, g in enumerate(v) if abs(g["mjd"] - f["mjd"]) > 0.5]
    others = sorted(others, key=lambda j: abs(v[j]["wave"] - f["wave"]))[:3]
    ref = np.nanmedian(imgs[others], axis=0)
    d = imgs[i] - ref
    sig = mad_std(d, ignore_nan=True)
    noise = np.sqrt(sig**2 + (0.1 * np.fmax(np.abs(ref), np.abs(imgs[i])))**2)
    snr = d / noise
    snr[~np.isfinite(snr)] = 0
    lab, n = ndi.label(snr > 5)
    for k in range(1, n + 1):
        m = lab == k
        yy, xx = np.nonzero(m)
        p = np.argmax(snr[m]); y, x = yy[p], xx[p]
        ra, dec = out.pixel_to_world_values(x, y)
        y0, y1, x0, x1 = max(0, y-3), min(N, y+4), max(0, x-3), min(N, x+4)
        win_nan = np.isnan(imgs[i][y0:y1, x0:x1]).any() or np.isnan(ref[y0:y1, x0:x1]).any()
        dets.append(dict(frame=i, obs_id=f["obs_id"], seq=f["seq"], mjd=f["mjd"], x=int(x), y=int(y), ra=float(ra), dec=float(dec),
                         snr=float(snr[y, x]), npix=int(m.sum()), flux=float(d[y, x]), ref_peak=float(np.nanmax(ref[y0:y1, x0:x1])),
                         sig=float(sig), near_nan=bool(win_nan), sat=bool(sat[i][y0:y1, x0:x1].any()),
                         edge=bool(x < 5 or y < 5 or x > N-6 or y > N-6)))
t_det = time.time() - t0 - t_rep
print("reproject s", round(t_rep,1), "detect s", round(t_det,1), "detections", len(dets))
np.save("imgs.npy", imgs)
json.dump(dict(frames=v, dets=dets), open("dets.json", "w"))
