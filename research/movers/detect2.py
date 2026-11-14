import json, time, numpy as np, collections, warnings
warnings.filterwarnings("ignore")
from astropy.stats import mad_std
from scipy import ndimage as ndi
import sys; sys.path.insert(0, r"C:\Users\StarX\Desktop\SCHOOL\career-building\projects\nasaspaceapps\pipeline")
from blink.stack import target_wcs
t0=time.time()
D=json.load(open("dets.json")); fr=D["frames"]; imgs=np.load("imgs.npy"); J=json.load(open("jpl.json"))
N=imgs.shape[1]; out=target_wcs(150.05,13.17,N)
sig=[mad_std(im, ignore_nan=True) for im in imgs]
print("per-exposure robust sigma", [round(s,3) for s in sig])
med=np.median(sig); good=[i for i in range(len(fr)) if sig[i]<3*med]
print("bad exposures dropped:", [fr[i]["obs_id"] for i in range(len(fr)) if i not in good])
seqs=collections.OrderedDict()
for i in good: seqs.setdefault(fr[i]["seq"], []).append(i)
stk={s:(np.nanmedian(imgs[ix],axis=0) if len(ix)>=3 else np.nanmean(imgs[ix],axis=0)) for s,ix in seqs.items()}
mjd={s:np.mean([fr[i]["mjd"] for i in ix]) for s,ix in seqs.items()}
def sep(a,b,c,d): return float(np.hypot((a-c)*np.cos(np.radians(b)), b-d)*3600)
cands=[]
for s,ix in seqs.items():
    others=[t for t in seqs if abs(mjd[t]-mjd[s])>0.5]
    ref=np.nanmedian([stk[t] for t in others],axis=0)
    d=stk[s]-ref; sg=mad_std(d,ignore_nan=True)
    noise=np.sqrt(sg**2+(0.1*np.fmax(np.abs(ref),np.abs(stk[s])))**2)
    snr=np.nan_to_num(d/noise)
    lab,n=ndi.label(snr>5)
    for k in range(1,n+1):
        m=lab==k; yy,xx=np.nonzero(m); p=np.argmax(snr[m]); y,x=int(yy[p]),int(xx[p])
        ra,dec=map(float,out.pixel_to_world_values(x,y))
        # per-exposure persistence: exposures with >3 sigma at the peak (3x3 max)
        nexp=0
        for i in ix:
            di=imgs[i]-ref; w=di[max(0,y-1):y+2,max(0,x-1):x+2]
            if np.isfinite(w).any() and np.nanmax(w)>3*sg: nexp+=1
        core_nan=int(np.isnan(stk[s][max(0,y-1):y+2,max(0,x-1):x+2]).sum()+np.isnan(ref[max(0,y-1):y+2,max(0,x-1):x+2]).sum())
        edge=x<4 or y<4 or x>N-5 or y>N-5
        best=min(((sep(ra,dec,b["ra"],b["dec"]),b["name"],b["mag"]) for b in J[s]["bodies"]), default=None)
        jm=best if best and best[0]<20 else None
        refpk=float(np.nanmax(ref[max(0,y-2):y+3,max(0,x-2):x+3]))
        if jm: cls="known asteroid"
        elif edge: cls="artefact: edge"
        elif core_nan>2: cls="artefact: mask hole"
        elif len(ix)>=2 and nexp<2: cls="artefact: single-exposure (cosmic ray)"
        elif len(ix)==1: cls="unconfirmed: 1-exposure sequence"
        elif refpk>0.5: cls="artefact: bright-star residual"
        elif m.sum()<2: cls="artefact: 1-pixel"
        else: cls="unexplained"
        cands.append(dict(seq=s,nexp_seq=len(ix),nexp=nexp,x=x,y=y,ra=ra,dec=dec,snr=float(snr[y,x]),npix=int(m.sum()),flux=float(d[y,x]),refpk=refpk,core_nan=core_nan,jpl=jm,cls=cls))
print("compute s", round(time.time()-t0,1), "candidates", len(cands))
print(collections.Counter(c["cls"] for c in cands))
for c in cands:
    if c["cls"] in ("known asteroid","unexplained","unconfirmed: 1-exposure sequence"):
        print(c["cls"], c["seq"], f'{c["nexp"]}/{c["nexp_seq"]}', round(c["ra"],4), round(c["dec"],4), "snr",round(c["snr"],1),"npix",c["npix"],"flux",round(c["flux"],3),"refpk",round(c["refpk"],3),c["jpl"])
# recovery of known bodies inside the field
print("--- known bodies inside field, by V")
for s in seqs:
    for b in J[s]["bodies"]:
        x,y=map(float,out.world_to_pixel_values(b["ra"],b["dec"]))
        if 4<=x<N-4 and 4<=y<N-4:
            hit=any(c["jpl"] and c["jpl"][1]==b["name"] and c["seq"]==s for c in cands)
            print(s, b["name"], b["mag"], "RECOVERED" if hit else "missed")
json.dump(dict(cands=cands, seqs={s:ix for s,ix in seqs.items()}), open("cands.json","w"))
np.save("stk.npy", np.array([stk[s] for s in seqs]))
