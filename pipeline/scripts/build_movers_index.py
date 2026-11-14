"""Assemble web/public/movers/index.json from each object's spectrum.json meta (comets first)."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2] / "web" / "public" / "movers"
KEYS = ["slug", "name", "designation", "kind", "n_rows", "wl_min_um", "wl_max_um", "date_first", "date_last", "note"]

items = []
for f in sorted(ROOT.glob("*/spectrum.json")):
    meta = json.loads(f.read_text(encoding="utf8"))["meta"]
    items.append({k: meta.get(k) for k in KEYS})
items.sort(key=lambda m: (m["kind"] != "comet", m["name"]))
(ROOT / "index.json").write_text(json.dumps(items, indent=1), encoding="utf8")
print(len(items), "objects:", ", ".join(m["slug"] for m in items))
