#!/usr/bin/env python3
"""Copy poster images from the repo's Master Images folder into public/posters/
renamed to review slugs, using image_rename_map.json. Run once after cloning:
    python3 scripts/prepare_images.py
"""
import json, os, re, shutil, sys

SRC = "Movies with Avi - Master Images"
MAP = os.path.join(os.path.dirname(__file__), "image_rename_map.json")
DEST = "public/posters"

if not os.path.isdir(SRC):
    sys.exit(f"Can't find '{SRC}' — run from the repo root.")
rename = json.load(open(MAP))
os.makedirs(DEST, exist_ok=True)
def norm(n): return re.sub(r'(-scaled|-rotated)$', '', os.path.splitext(n)[0].lower())
index = {}
for f in os.listdir(SRC):
    index.setdefault(norm(f), f)
done = missing = 0
for orig, slugname in rename.items():
    src = index.get(norm(orig)) or next((f for k, f in index.items() if k.startswith(norm(orig))), None)
    if src:
        shutil.copy(os.path.join(SRC, src), os.path.join(DEST, slugname)); done += 1
    else:
        print("MISSING:", orig); missing += 1
print(f"{done} posters ready in {DEST}/" + (f" ({missing} missing)" if missing else ""))
