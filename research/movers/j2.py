import sys, json, time
sys.path.insert(0, r"C:\Users\StarX\Desktop\SCHOOL\career-building\projects\nasaspaceapps\pipeline")
from blink.jpl import identify
for mjd in (60997.5, 61167.5):
    t=time.time(); b,r=identify(150.1,12.2,mjd,fov_arcmin=120,vmag_lim=17.5)
    print(mjd, round(time.time()-t,1), r, len(b))
    for x in b: print("  ",x["name"], round(x["ra"],4), round(x["dec"],4), x["mag"])
