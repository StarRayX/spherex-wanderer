import requests, numpy as np, json
from astropy.table import Table
t=Table.read('obs.ecsv')
sel=t[[0,40,80,120,160,161,200,258]]
tl=" ".join(f"{m+2400000.5:.6f}" for m in sel['t_min'])
for cmd in ["'3I'","'C/2025 N1'","'DES=C/2025 N1;'"]:
  p=dict(format="json",COMMAND=cmd,OBJ_DATA="NO",MAKE_EPHEM="YES",EPHEM_TYPE="OBSERVER",CENTER="'500'",
       TLIST=f"'{tl}'" ,QUANTITIES="'1,9,20,23'",CSV_FORMAT="YES",ANG_FORMAT="DEG", TIME_TYPE="UT")
  r=requests.get("https://ssd.jpl.nasa.gov/api/horizons.api",params=p,timeout=120); j=r.json()
  res=j.get("result","")
  if "$$SOE" in res: print("OK",cmd); break
  print(cmd, res[:600])
body=res.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines()
print(res.split("$$SOE")[0][-700:])
for line,row in zip(body,sel):
  f=[x.strip() for x in line.split(",")]
  ra,dec=float(f[3]),float(f[4])
  d=np.hypot((ra-row['comet_ra'])*np.cos(np.radians(dec)),dec-row['comet_dec'])*3600
  print(f[0], ra,dec, "Vmag/delta/elong:",f[5:], f"diff vs IRSA comet_ra/dec {d:.1f} arcsec")
