import requests, numpy as np, matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from astropy.io import fits; from astropy.wcs import WCS; from astropy.table import Table
t=Table.read('obs.ecsv'); urls=open('urls.txt').read().split()
def url(obs,det): return [u for u in urls if f"{obs[-6:]}{det}_" in u and obs[:10] in u][0]
cen=(247.69,-16.914)
fr=[("2025W32_2D_0189_1","D2"),("2025W32_2D_0213_4","D2"),("2025W32_2D_0189_2","D2"),("2025W32_2D_0201_1","D2")]
fig,ax=plt.subplots(2,2,figsize=(10,10))
for k,(o,d) in enumerate(fr):
  p=f"dl/{o}_{d}.fits"
  import time,os
  for i in range(8):
    if os.path.exists(p) and os.path.getsize(p)>10000: break
    r=requests.get(url(o,d)+f"?center={cen[0]},{cen[1]}&size=10arcmin",timeout=300)
    if r.status_code==200 and len(r.content)>10000: open(p,'wb').write(r.content); break
    time.sleep(2**i)
  h=fits.open(p); img=h['IMAGE'].data.astype(float); w=WCS(h['IMAGE'].header)
  flags=h['FLAGS'].data if 'FLAGS' in h else None
  row=t[(t['obs_id']==o)&(t['spherex_detector']==d)][0]
  x,y=w.world_to_pixel_values(row['comet_ra'],row['comet_dec'])
  other=[r for r in fr if r[1]==d and r[0]!=o][0]; ro=t[(t['obs_id']==other[0])&(t['spherex_detector']==d)][0]
  x2,y2=w.world_to_pixel_values(ro['comet_ra'],ro['comet_dec'])
  bk=np.nanmedian(img); sd=np.nanstd(img[np.abs(img-bk)<5*np.nanstd(img)])
  a=ax.flat[k]; a.imshow(img,origin='lower',cmap='gray',vmin=bk-2*sd,vmax=bk+8*sd)
  a.add_patch(plt.Circle((x,y),4,fill=False,color='lime')); a.add_patch(plt.Circle((x2,y2),4,fill=False,color='red',ls='--'))
  # wavelength at comet from spectral WCS if present
  wl=''
  try:
    ws=WCS(h['IMAGE'].header,key='W',fobj=h); lam=ws.pixel_to_world_values(x,y); wl=f" lam~{np.ravel(lam)[0]:.2f}um"
  except Exception as e: wl=''
  a.set_title(f"{o} {d} MJD {row['t_min']:.3f}{wl}\ngreen=predicted now, red dashed=other epoch",fontsize=8)
  # quick peak check: flux in 2px aperture minus background, at both spots, in sigma
  yy,xx=np.mgrid[:img.shape[0],:img.shape[1]]
  def snr(px,py):
    m=np.hypot(xx-px,yy-py)<=2; ann=(np.hypot(xx-px,yy-py)>6)&(np.hypot(xx-px,yy-py)<12)
    b=np.nanmedian(img[ann]); s=np.nanstd(img[ann]); return (np.nansum(img[m]-b))/(s*np.sqrt(m.sum()))
  print(o,d,"shape",img.shape,"S/N at predicted",round(snr(x,y),1),"S/N at other-epoch spot",round(snr(x2,y2),1),wl, "sep px",round(np.hypot(x-x2,y-y2),1))
  print([e.name for e in h])
plt.tight_layout(); plt.savefig('atlas_blink_aug.png',dpi=110)
