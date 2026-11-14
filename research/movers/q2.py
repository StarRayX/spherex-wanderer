import sys, time, json
sys.path.insert(0, r"C:\Users\StarX\Desktop\SCHOOL\career-building\projects\nasaspaceapps\pipeline")
from blink.query import find_frames, group_visits
from blink.jpl import identify
from collections import Counter
ra,dec=float(sys.argv[1]),float(sys.argv[2])
fr=find_frames(ra,dec)
json.dump(fr, open(f"frames_{ra}_{dec}.json","w"))
for v in group_visits(fr, gap_days=20):
    print(round(v[0]["mjd"],2), round(v[-1]["mjd"]-v[0]["mjd"],2), len(v), dict(Counter(f["band"] for f in v)), dict(Counter(int(f["mjd"]) for f in v)))
    b,r=identify(ra,dec,v[0]["mjd"],fov_arcmin=20,vmag_lim=20)
    print("   JPL 20':",len(b), sorted(x["mag"] for x in b))
