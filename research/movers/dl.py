import sys, json, time
sys.path.insert(0, r"C:\Users\StarX\Desktop\SCHOOL\career-building\projects\nasaspaceapps\pipeline")
from blink.fetch import fetch_many
from pathlib import Path
v=[f for f in json.load(open("field.json")) if f["band"]=="SPHEREx-D1"]
t=time.time()
paths=fetch_many([(f["url"],150.05,13.17,30) for f in v], cache_dir="cache", workers=4)
print("download s", round(time.time()-t,1), "MB", round(sum(Path(p).stat().st_size for p in paths)/1e6,1))
for f,p in zip(v,paths): f["path"]=str(p)
json.dump(v, open("d1.json","w"))
