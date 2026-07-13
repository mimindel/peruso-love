#!/usr/bin/env python3
"""Converts freshly uploaded JPG/PNG images in assets/ to resized WebP
and updates their references in assets/items.json.
Runs in GitHub Actions after each push that touches assets/."""
import json, os, subprocess, sys, glob

KEEP = {"assets/apple-touch-icon.png"}   # never touch these
ITEMS = "assets/items.json"

def main():
    candidates = [f for f in glob.glob("assets/*")
                  if f.lower().endswith((".jpg", ".jpeg", ".png"))
                  and f not in KEEP]
    if not candidates:
        print("nothing to optimize")
        return

    data = json.load(open(ITEMS)) if os.path.exists(ITEMS) else {"items": []}
    changed = False

    for src in candidates:
        dst = os.path.splitext(src)[0] + ".webp"
        print(f"optimizing {src} -> {dst}")
        subprocess.run(
            ["convert", src, "-auto-orient", "-resize", "x1100>",
             "-quality", "82", "-strip", dst],
            check=True,
        )
        for it in data.get("items", []):
            if it.get("img") == src:
                it["img"] = dst
                it.pop("w", None)
                it.pop("h", None)
        os.remove(src)
        changed = True

    if changed:
        with open(ITEMS, "w") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print("done")

if __name__ == "__main__":
    sys.exit(main())
