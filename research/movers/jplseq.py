import sys, json, time
sys.path.insert(0, r"C:\Users\StarX\Desktop\SCHOOL\career-building\projects\nasaspaceapps\pipeline")
from blink.jpl import identify
from concurrent.futures import ThreadPoolExecutor
D=json.load(open("dets.json")); fr=D["frames"]
seqs={}
for f in fr: seqs.setdefault(f["seq"], []).append(f["mjd"])
t=time.time()
def q(item):
    s,m=item; mid=sum(m)/len(m)
    b,r=identify(150.05,13.17,mid,fov_arcmin=32,vmag_lim=21)
    return s,dict(mjd=mid,bodies=b,reason=r)
with ThreadPoolExecutor(6) as ex: res=dict(ex.map(q, seqs.items()))
print("JPL s", round(time.time()-t,1))
for s,r in res.items(): print(s, r["reason"], [(b["name"], b["mag"]) for b in r["bodies"]])
json.dump(res, open("jpl.json","w"))
