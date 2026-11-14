import json, numpy as np, matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt
from astropy.time import Time
import sys; sys.path.insert(0, r"C:\Users\StarX\Desktop\SCHOOL\career-building\projects\nasaspaceapps\pipeline")
from blink.stack import target_wcs
C=json.load(open("cands.json")); seqs=list(C["seqs"]); stk=np.load("stk.npy"); D=json.load(open("dets.json")); fr=D["frames"]
mjd={s:np.mean([fr[i]["mjd"] for i in C["seqs"][s]]) for s in seqs}
out=target_wcs(150.05,13.17,stk.shape[1])
def date(s): return Time(mjd[s],format="mjd").strftime("%Y-%m-%d %H:%M")
def jump(name, s_on, s_offs, fn, half=20):
    c=[c for c in C["cands"] if c["jpl"] and c["jpl"][1]==name][0]; x,y=c["x"],c["y"]
    sl=np.s_[max(0,y-half):y+half+1, max(0,x-half):x+half+1]
    panels=[(s_offs[0],"before"),(s_on,"during"),(s_offs[1],"after")]
    on=stk[seqs.index(s_on)][sl]; vmin,vmax=np.nanpercentile(on,[5,99.7])
    fig,ax=plt.subplots(1,4,figsize=(13,3.6))
    for a,(s,lab) in zip(ax,panels):
        a.imshow(stk[seqs.index(s)][sl],origin="lower",cmap="gray",vmin=vmin,vmax=vmax); a.set_title(f"{lab}: {date(s)}\n{s}",fontsize=8)
    ref=np.nanmedian([stk[seqs.index(s)] for s in seqs if abs(mjd[s]-mjd[s_on])>0.5],axis=0)[sl]
    ax[3].imshow(on-ref,origin="lower",cmap="gray",vmin=-vmax/3,vmax=vmax); ax[3].set_title("during minus median of other days",fontsize=8)
    for a in ax:
        a.add_patch(plt.Circle((x-max(0,x-half), y-max(0,y-half)),4,fill=False,color="red")); a.set_xticks([]); a.set_yticks([])
    fig.suptitle(f"{name}, V {c['jpl'][2]} (JPL sb_ident), SPHEREx D1, {2*half+1}x{2*half+1} px = {(2*half+1)*6.15/60:.1f} arcmin, red circle = JPL position {c['jpl'][0]:.1f}\" from detection",fontsize=9)
    plt.tight_layout(); plt.savefig(fn,dpi=110); plt.close()
    print(fn)
jump("213 Lilaea (A880 DA)","2025W47_1A_0295",["2025W47_1A_0007","2025W47_1A_0629"],"lilaea_jump.png")
jump("3721 Widorn (1982 TU)","2025W47_1A_0295",["2025W47_1A_0007","2025W47_1A_0629"],"widorn_jump.png")
# full field diff of 0304 with unexplained marks
s="2025W46_2A_0304"; ref=np.nanmedian([stk[seqs.index(t)] for t in seqs if abs(mjd[t]-mjd[s])>0.5],axis=0)
d=stk[seqs.index(s)]-ref
fig,ax=plt.subplots(figsize=(7,7)); ax.imshow(d,origin="lower",cmap="gray",vmin=-0.1,vmax=0.3)
for c in C["cands"]:
    if c["seq"]==s and c["cls"]=="unexplained": ax.add_patch(plt.Circle((c["x"],c["y"]),6,fill=False,color="orange"))
ax.set_title(f"{s} minus other days, unexplained candidates (orange)",fontsize=9); plt.savefig("unexplained_0304.png",dpi=100); plt.close()
for c in C["cands"]:
    if c["cls"]=="unexplained": print(c["x"],c["y"])
