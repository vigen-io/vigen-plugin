"""Cut a product out of a plain light background (a stock "isolated on white" photo) for the posters.

    python3 -I cutout.py <photo> <out.png> [--tol 34] [--max 1200]

Flood-fills the background in from every edge pixel that is close to the edge's own colour, so white *inside* the
object (rice in a pot, a plate's rim, a bookmark) stays. remove-background (a person matte) punched holes in
products in testing: use it only for a product on a busy background, and look at the result on a bright colour.
"""
import sys
from collections import deque

from PIL import Image, ImageFilter

args = sys.argv[1:]
src, out = args[0], args[1]
tol = int(args[args.index("--tol") + 1]) if "--tol" in args else 34
mx = int(args[args.index("--max") + 1]) if "--max" in args else 1200

im = Image.open(src).convert("RGB")
im.thumbnail((mx * 2, mx * 2))
w, h = im.size
px = im.load()
edge = [px[x, 0] for x in range(w)] + [px[x, h - 1] for x in range(w)] + [px[0, y] for y in range(h)] + [px[w - 1, y] for y in range(h)]
bg = tuple(sorted(c[i] for c in edge)[len(edge) // 2] for i in range(3))  # the edge's median colour
near = lambda c: abs(c[0] - bg[0]) + abs(c[1] - bg[1]) + abs(c[2] - bg[2]) <= tol * 3 // 2

mask = Image.new("L", (w, h), 255)
m = mask.load()
seen = bytearray(w * h)
q = deque()
for x in range(w):
    q.append((x, 0)); q.append((x, h - 1))
for y in range(h):
    q.append((0, y)); q.append((w - 1, y))
while q:
    x, y = q.popleft()
    i = y * w + x
    if seen[i]:
        continue
    seen[i] = 1
    if not near(px[x, y]):
        continue
    m[x, y] = 0
    if x > 0: q.append((x - 1, y))
    if x < w - 1: q.append((x + 1, y))
    if y > 0: q.append((x, y - 1))
    if y < h - 1: q.append((x, y + 1))

# a 1 px eroded, softened edge (no white fringe)
mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
rgba = im.convert("RGBA")
rgba.putalpha(mask)
rgba = rgba.crop(mask.getbbox())
rgba.thumbnail((mx, mx))
rgba.save(out)
print(out, rgba.size, "background", "#%02X%02X%02X" % bg)
