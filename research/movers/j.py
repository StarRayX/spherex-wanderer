import sys, json, time
sys.path.insert(0, r"C:\Users\StarX\Desktop\SCHOOL\career-building\projects\nasaspaceapps\pipeline")
from blink.jpl import identify
fr=json.load(open("frames.json"))
v=[f for f in fr if 60996<=f["mjd"]<61006 and f["band"] in ("SPHEREx-D1","SPHEREx-D2")]
for f in v: print(f["obs_id"], f["band"], round(f["mjd"],4))
t=time.time()
b,r=identify(150.1,2.2,v[0]["mjd"],fov_arcmin=20,vmag_lim=20)
print(time.time()-t, r, len(b)); [print(x) for x in b]
