import sys, json, numpy as np, warnings
warnings.filterwarnings("ignore")
sys.path.insert(0, r"C:\Users\StarX\Desktop\SCHOOL\career-building\projects\nasaspaceapps\pipeline")
from astropy import log; log.setLevel("ERROR")
from blink.stack import target_wcs
from astropy.io import fits
J=json.load(open("jpl.json")); D=json.load(open("dets.json")); fr=D["frames"]; imgs=np.load("imgs.npy")
out=target_wcs(150.05,13.17,293)
for s,r in J.items():
    for b in r["bodies"]:
        if b["mag"]>19.6: continue
        x,y=out.world_to_pixel_values(b["ra"],b["dec"]); x,y=int(round(float(x))),int(round(float(y)))
        if not (4<=x<289 and 4<=y<289): print(s,b["name"],"outside cutout",x,y); continue
        print(s, b["name"], b["mag"], round(b["ra"],4), round(b["dec"],4), "px",x,y)
        for i,f in enumerate(fr):
            if f["seq"]!=s: continue
            w=imgs[i][max(0,y-3):y+4, max(0,x-3):x+4]
            others=[imgs[j][max(0,y-3):y+4, max(0,x-3):x+4] for j,g in enumerate(fr) if abs(g["mjd"]-f["mjd"])>0.5]
            o=np.nanmax(np.nanmedian(others,axis=0)) if others else np.nan
            with fits.open(f["path"]) as h:
                from astropy.wcs import WCS
                X,Y=WCS(h["IMAGE"].header).world_to_pixel_values(b["ra"],b["dec"]); X,Y=int(round(float(X))),int(round(float(Y)))
                fl=h["FLAGS"].data[Y-2:Y+3,X-2:X+3]; raw=h["IMAGE"].data[Y-2:Y+3,X-2:X+3]
                bits=sorted({k for k in range(32) if (np.bitwise_or.reduce(fl.ravel())>>k)&1})
            print("   ",f["obs_id"], "max", round(float(np.nanmax(w)),3) if np.isfinite(w).any() else "allnan", "nan", int(np.isnan(w).sum()), "refmax", round(float(o),3), "rawmax", (round(float(np.nanmax(raw)),3) if raw.size and np.isfinite(raw).any() else None), "nanraw", int(np.isnan(raw).sum()), "flagbits", bits)
