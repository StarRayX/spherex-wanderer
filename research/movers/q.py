import sys, time, json
sys.path.insert(0, r"C:\Users\StarX\Desktop\SCHOOL\career-building\projects\nasaspaceapps\pipeline")
from blink.query import find_frames, group_visits
from collections import Counter
t=time.time()
fr=find_frames(150.1,2.2)
print(len(fr),"frames",round(time.time()-t,1),"s")
for v in group_visits(fr, gap_days=20):
    days=Counter(int(f["mjd"]) for f in v)
    print(round(v[0]["mjd"],2), round(v[-1]["mjd"]-v[0]["mjd"],2), len(v), dict(Counter(f["band"] for f in v)), dict(days))
json.dump(fr, open("frames.json","w"))
