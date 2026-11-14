import sys
from astropy.table import Table
t=Table.read(sys.argv[1],format="votable",use_names_over_ids=True)
print(len(t)); print(t.colnames)
print(t[:3])
import numpy as np
for c in ['t_min','obs_collection','energy_bandpassname']:
    if c in t.colnames:
        v=t[c]
        if v.dtype.kind in 'fi': print(c,v.min(),v.max())
        else:
            u,n=np.unique(np.array(v).astype(str),return_counts=True); print(c,dict(zip(u,n)))
from astropy.time import Time
m=np.array(t['t_min'],float)
print(Time(m.min(),format='mjd').iso, Time(m.max(),format='mjd').iso)
aug=m<61000; print('aug',aug.sum(),Time(m[aug].min(),format='mjd').iso,Time(m[aug].max(),format='mjd').iso,'dec',(~aug).sum(),Time(m[~aug].min(),format='mjd').iso,Time(m[~aug].max(),format='mjd').iso)
t.write('obs.ecsv',overwrite=True)
