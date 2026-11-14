import json, numpy as np, collections
D=json.load(open("dets.json")); fr=D["frames"]; dets=D["dets"]; J=json.load(open("jpl.json"))
nseq=collections.Counter(f["seq"] for f in fr)
def sep(a,b,c,d): return np.hypot((a-c)*np.cos(np.radians(b)), b-d)*3600
# label clean vs raw artefacts
for x in dets:
    x["cls"] = "edge/mask" if (x["edge"] or x["near_nan"]) else ("saturated" if x["sat"] else ("1px" if x["npix"]<2 else "clean"))
print("raw", len(dets), collections.Counter(x["cls"] for x in dets))
clean=[x for x in dets if x["cls"]=="clean"]
# group clean dets across frames in the same sequence (within 15 arcsec)
groups=[]
for x in sorted(clean, key=lambda x:-x["snr"]):
    for g in groups:
        if g["seq"]==x["seq"] and sep(g["ra"],g["dec"],x["ra"],x["dec"])<15 and x["frame"] not in g["frames"]:
            g["frames"].add(x["frame"]); g["members"].append(x); break
    else:
        groups.append(dict(seq=x["seq"], ra=x["ra"], dec=x["dec"], frames={x["frame"]}, members=[x]))
for g in groups:
    g["n"]=len(g["frames"]); g["of"]=nseq[g["seq"]]; g["snr"]=max(m["snr"] for m in g["members"])
    best=None
    for b in J[g["seq"]]["bodies"]:
        s=sep(g["ra"],g["dec"],b["ra"],b["dec"])
        if best is None or s<best[0]: best=(s,b["name"],b["mag"])
    g["jpl"]=best if best and best[0]<25 else None
    g["ref_peak"]=max(m["ref_peak"] for m in g["members"]); g["flux"]=max(m["flux"] for m in g["members"])
persist=[g for g in groups if g["n"]>=2]
single=[g for g in groups if g["n"]==1 and g["of"]>=2]
lone=[g for g in groups if g["of"]==1]
print("clean groups", len(groups), "persistent(>=2 exp in seq)", len(persist), "single-exposure", len(single), "from 1-exposure seq", len(lone))
print("JPL matched: persistent", sum(1 for g in persist if g["jpl"]), "single", sum(1 for g in single if g["jpl"]), "lone", sum(1 for g in lone if g["jpl"]))
for g in sorted(persist, key=lambda g:-g["snr"]):
    print(g["seq"], f'{g["n"]}/{g["of"]}', round(g["ra"],4), round(g["dec"],4), "snr", round(g["snr"],1), "flux", round(g["flux"],3), "refpk", round(g["ref_peak"],3), g["jpl"])
print("--- lone / single with jpl")
for g in single+lone:
    if g["jpl"]: print(g["seq"], g["n"], round(g["snr"],1), g["jpl"])
# which JPL bodies brighter than 19 were recovered?
print("--- recovery of known bodies V<=19.5")
for s,r in J.items():
    for b in r["bodies"]:
        if b["mag"]<=19.5:
            hit=[g for g in groups if g["seq"]==s and g["jpl"] and g["jpl"][1]==b["name"]]
            print(s, b["name"], b["mag"], "recovered" if hit else "MISSED", [ (h["n"],h["of"],round(h["snr"],1)) for h in hit])
json.dump([dict(g, frames=sorted(g["frames"])) for g in groups], open("groups.json","w"), default=float)
