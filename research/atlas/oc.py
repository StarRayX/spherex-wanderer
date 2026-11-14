import requests, csv, io, numpy as np
from astropy.table import Table
from astropy.time import Time
TAP="https://irsa.ipac.caltech.edu/TAP/sync"
def hz(start,stop,step):
  p=dict(format="json",COMMAND="'3I'",OBJ_DATA="NO",MAKE_EPHEM="YES",EPHEM_TYPE="OBSERVER",CENTER="'500'",
    START_TIME=f"'{start}'",STOP_TIME=f"'{stop}'",STEP_SIZE=f"'{step}'",QUANTITIES="'1'",CSV_FORMAT="YES",ANG_FORMAT="DEG")
  res=requests.get("https://ssd.jpl.nasa.gov/api/horizons.api",params=p,timeout=120).json()["result"]
  rows=[l.split(",") for l in res.split("$$SOE")[1].split("$$EOE")[0].strip().splitlines()]
  return Time([r[0].strip() for r in rows],format='iso',scale='utc').mjd if False else np.array([Time.strptime(r[0].strip(),"%Y-%b-%d %H:%M").mjd for r in rows]), np.array([float(r[3]) for r in rows]), np.array([float(r[4]) for r in rows])
def inpoly(ra,dec,s):
  v=np.array(s.split()[2:],float).reshape(-1,2)  # 'POLYGON ICRS ...'
  # gnomonic around point
  from astropy.coordinates import SkyCoord; import astropy.units as u
  c=SkyCoord(ra,dec,unit='deg'); p=SkyCoord(v[:,0],v[:,1],unit='deg')
  off=c.skyoffset_frame(); q=p.transform_to(off); x=q.lon.deg; y=q.lat.deg
  inside=False; n=len(x)
  for i in range(n):
    j=(i-1)%n
    if (y[i]>0)!=(y[j]>0) and 0 < x[i]+(0-y[i])*(x[j]-x[i])/(y[j]-y[i]): inside=not inside
  return inside
out=[]
for (a,b) in [("2025-07-25","2025-08-25"),("2025-12-01","2025-12-25")]:
  m,ra,de=hz(a,b,"1h")
  q=(f"SELECT obs_id, energy_bandpassname, t_min, em_min, s_region, obs_collection FROM spherex.obscore WHERE t_min BETWEEN {m[0]} AND {m[-1]} "
     f"AND s_ra BETWEEN {ra.min()-5} AND {ra.max()+5} AND s_dec BETWEEN {de.min()-5} AND {de.max()+5}")
  r=requests.post(TAP,data=dict(REQUEST="doQuery",LANG="ADQL",FORMAT="csv",QUERY=q),timeout=600); r.raise_for_status()
  rows=list(csv.DictReader(io.StringIO(r.text))); print(a,b,"candidate frames",len(rows))
  for x in rows:
    t=float(x['t_min']); cra=np.interp(t,m,ra); cde=np.interp(t,m,de)
    if inpoly(cra,cde,x['s_region']): out.append((x['obs_id'],x['energy_bandpassname'],t,float(x['em_min']),x['obs_collection'],cra,cde))
print("frames containing comet:",len(out))
import collections
print(collections.Counter(o[1] for o in out)); print(collections.Counter(o[4] for o in out))
ms=np.array([o[2] for o in out]); print(Time(ms.min(),format='mjd').iso,Time(ms.max(),format='mjd').iso)
print("Aug",(ms<61000).sum(),"Dec",(ms>61000).sum())
uniq={(o[0],o[1]) for o in out}; print("unique obs_id/band",len(uniq))
t=Table.read('obs.ecsv'); ref={(str(a),"SPHEREx-"+str(b)) for a,b in zip(t['obs_id'],t['spherex_detector'])}
print("in IRSA 3I table",len(ref),"overlap",len(uniq&ref),"only obscore",len(uniq-ref),"only table",len(ref-uniq))
print(sorted(uniq-ref)[:10]); print(sorted(ref-uniq)[:10])
Table(rows=out,names=['obs_id','band','mjd','em_min','coll','cra','cdec']).write('obscore_hits.ecsv',overwrite=True)
