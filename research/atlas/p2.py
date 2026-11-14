from astropy.table import Table; import numpy as np
t=Table.read('obs.ecsv')
print(np.unique(t['spherex_detector'],return_counts=True))
print('em um',t['em_min'].min()*1e6, t['em_max'].max()*1e6)
print('exptime',np.unique(t['t_exptime']))
print('size MB', np.median(t['access_estsize'])/1024, t['access_estsize'].sum()/1024**2)
print(t['access_url'][0]); print(t['access_format'][0])
for d in sorted(set(t['spherex_detector'])):
  s=t[t['spherex_detector']==d]; print(d,len(s),(s['t_min']<61000).sum(), round(s['em_min'].min()*1e6,2), round(s['em_max'].max()*1e6,2))
a=t[t['t_min']<61000]; b=t[t['t_min']>61000]
for x in (a,b): print(x['comet_ra'].min(),x['comet_ra'].max(),x['comet_dec'].min(),x['comet_dec'].max())
print(t['obs_id','spherex_detector','t_min','comet_ra','comet_dec','em_min'][[0,1,80,160,161,258]])
