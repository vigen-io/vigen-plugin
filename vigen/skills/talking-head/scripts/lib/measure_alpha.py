"""Measure a person cutout (RGBA PNG): head top, face anchor, body bbox as fractions of the frame.

Used to place the card slot behind the head and the punch-in origin on the face.
"""
import json
import sys

from PIL import Image

im = Image.open(sys.argv[1]).convert("RGBA")
w, h = im.size
a = im.getchannel("A").load()
TH = 128

rows = []  # (y, x0, x1) of opaque span per row
for y in range(h):
    xs = [x for x in range(0, w, 2) if a[x, y] >= TH]
    if len(xs) >= 3:
        rows.append((y, xs[0], xs[-1]))

if not rows:
    print(json.dumps({"error": "empty matte"}))
    sys.exit(0)

top = rows[0][0]
bottom = rows[-1][0]
x0 = min(r[1] for r in rows)
x1 = max(r[2] for r in rows)

# Head: rows from the top until the span widens past ~1.6x the narrowest head row (shoulders start).
head_rows = [r for r in rows if r[0] < top + 0.35 * h]
head_w = None
neck_y = None
widths = []
for (y, l, r) in head_rows:
    widths.append((y, r - l))
peak = 0
for (y, wd) in widths[: max(1, int(0.12 * h))]:
    peak = max(peak, wd)
for (y, wd) in widths:
    if y > top + 0.05 * h and wd > peak * 1.6:
        neck_y = y
        break
if neck_y is None:
    neck_y = top + int(0.2 * h)
head_w = peak
head_center_x = sum((r[1] + r[2]) / 2 for r in head_rows[: max(1, int(0.1 * h))]) / max(1, len(head_rows[: max(1, int(0.1 * h))]))

print(json.dumps({
    "width": w,
    "height": h,
    "headTop": round(top / h, 4),
    "neckY": round(neck_y / h, 4),
    "faceY": round((top + (neck_y - top) * 0.55) / h, 4),
    "headCenterX": round(head_center_x / w, 4),
    "headWidth": round(head_w / w, 4),
    "bodyBottom": round(bottom / h, 4),
    "bodyLeft": round(x0 / w, 4),
    "bodyRight": round(x1 / w, 4),
}))
