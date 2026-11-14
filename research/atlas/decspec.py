import requests, numpy as np, time, os, warnings; warnings.filterwarnings('ignore')
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from astropy.io import fits; from astropy.wcs import WCS; from astropy.table import Table
from concurrent.futures import ThreadPoolExecutor
import logging; logging.getLogger('astropy').setLevel(logging.ERROR)
t=Table.read('obs.ecsv'); t.sort('t_min'); urls=open('urls.txt').read().split()
d=t[t['t_min']>61000]
def get(row):
  o,det=str(row['obs_id']),str(row['spherex_detector'])
  u=[x for x in urls if f"{o[-6:]}{det}_" in x and o[:10] in x][0]; p=f"dl/c_{o}_{det}.fits"
  for i in range(9):
    if os.path.exists(p): return p
    try:
      r=requests.get(u+f"?center={row['comet_ra']},{row['comet_dec']}&size=6arcmin",timeout=300)
      if r.status_code==200 and len(r.content)>10000: open(p,'wb').write(r.content); return p
    except Exception: pass
    time.sleep(2**i)
  return None
t0=time.time()
with ThreadPoolExecutor(4) as ex: paths=list(ex.map(get,d))
print("downloaded",sum(p is not None for p in paths),"of",len(d),"in",round(time.time()-t0),"s")
res=[]
for row,p in zip(d,paths):
  if not p: continue
  h=fits.open(p); img=h['IMAGE'].data.astype(float); fl=h['FLAGS'].data; w=WCS(h['IMAGE'].header)
  x,y=w.world_to_pixel_values(row['comet_ra'],row['comet_dec'])
  lam=np.ravel(WCS(h['IMAGE'].header,key='W',fobj=h).pixel_to_world_values(x,y))[0]
  yy,xx=np.mgrid[:img.shape[0],:img.shape[1]]; rr=np.hypot(xx-x,yy-y)
  m=rr<=4; ann=(rr>12)&(rr<20)
  if m.sum()<45 or np.isnan(img[m]).any(): continue
  b=np.nanmedian(img[ann]); sd=1.4826*np.nanmedian(np.abs(img[ann]-b))
  f=np.nansum(img[m]-b); res.append((lam,f,sd*np.sqrt(m.sum()),row['t_min'],str(row['spherex_detector'])))
res=np.array([r[:4] for r in res]); o=np.argsort(res[:,0]); res=res[o]
np.savetxt('dec_spectrum_raw.txt',res,header='lam_um sum_MJy/sr_r4px err mjd',fmt='%.5f')
print("points",len(res))
plt.figure(figsize=(8,4)); plt.errorbar(res[:,0],res[:,1],res[:,2],fmt='o',ms=3)
for l,n in [(1.5,'H2O ice'),(2.0,'H2O ice'),(3.0,'H2O ice'),(4.26,'CO2'),(4.67,'CO')]: plt.axvline(l,ls=':',c='gray'); plt.text(l,plt.ylim()[1]*0.95,n,fontsize=7,rotation=90)
plt.xlabel('wavelength (um)'); plt.ylabel('r=4px aperture sum (MJy/sr, uncalibrated units)'); plt.title('3I/ATLAS Dec 8-14 2025, SPHEREx QR2, naive aperture (rough)')
plt.tight_layout(); plt.savefig('atlas_dec_spectrum_rough.png',dpi=100)
