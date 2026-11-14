import requests, numpy as np, time, os, warnings; warnings.filterwarnings('ignore')
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from astropy.io import fits; from astropy.wcs import WCS; from astropy.table import Table
import logging; logging.getLogger('astropy').setLevel(logging.ERROR)
t=Table.read('obs.ecsv'); t.sort('t_min'); urls=open('urls.txt').read().split()
a=t[t['t_min']<61000]
pick=[]
for d in ['D1','D3','D4','D5','D6']:
  s=a[a['spherex_detector']==d]; pick+= [s[len(s)//3], s[2*len(s)//3]]
fig,ax=plt.subplots(2,5,figsize=(16,7))
for k,row in enumerate(pick):
  o,d=str(row['obs_id']),str(row['spherex_detector'])
  u=[x for x in urls if f"{o[-6:]}{d}_" in x and o[:10] in x][0]; p=f"dl/c_{o}_{d}.fits"
  for i in range(8):
    if os.path.exists(p): break
    r=requests.get(u+f"?center={row['comet_ra']},{row['comet_dec']}&size=6arcmin",timeout=300)
    if r.status_code==200 and len(r.content)>10000: open(p,'wb').write(r.content); break
    time.sleep(2**i)
  h=fits.open(p); img=h['IMAGE'].data.astype(float); w=WCS(h['IMAGE'].header)
  x,y=w.world_to_pixel_values(row['comet_ra'],row['comet_dec'])
  lam=np.ravel(WCS(h['IMAGE'].header,key='W',fobj=h).pixel_to_world_values(x,y))[0]
  yy,xx=np.mgrid[:img.shape[0],:img.shape[1]]; rr=np.hypot(xx-x,yy-y)
  m=rr<=3; ann=(rr>8)&(rr<15); b=np.nanmedian(img[ann]); sd=1.4826*np.nanmedian(np.abs(img[ann]-b))
  print(o,d,f"lam {lam:.2f}um S/N(r=3px) {np.nansum(img[m]-b)/(sd*np.sqrt(m.sum())):.1f}")
  axx=ax.flat[k]; axx.imshow(img,origin='lower',cmap='gray',vmin=b-2*sd,vmax=b+8*sd); axx.add_patch(plt.Circle((x,y),4,fill=False,color='lime'))
  axx.set_title(f"{o} {d} {lam:.2f}um",fontsize=8)
plt.tight_layout(); plt.savefig('atlas_aug_bands.png',dpi=90)
