import sys, json
sys.path.insert(0, r"C:\Users\StarX\Desktop\SCHOOL\career-building\projects\nasaspaceapps\pipeline")
from blink.query import find_frames
from blink.jpl import identify
ra,dec=150.05,13.17
fr=find_frames(ra,dec)
v=[f for f in fr if 60990<f["mjd"]<61010]
json.dump(v, open("field.json","w"))
for f in v:
    if f["band"] in ("SPHEREx-D1","SPHEREx-D2"): print(f["obs_id"], f["band"], round(f["mjd"],4), round(f["em_min"]*1e6,3), round(f["em_max"]*1e6,3))
