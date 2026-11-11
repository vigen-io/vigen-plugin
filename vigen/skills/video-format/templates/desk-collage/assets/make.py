"""Draw the template's two fixed graphics at 1080x1920 (run: python3 -I make.py, from this folder).

mat.jpg     the green cutting mat (the set): fine grid every 54 px, a brighter line every 270 px, ruler numbers
            along the top and the left edge, a soft grain. Measured on the references: #5E825A, lines from y 40.
laptop.png  the hand-drawn paper laptop that sits on the mat's top half: crumpled cream paper (#E0D1B6) cut out
            around a thick black doodle, a transparent screen hole at SCREEN (the laptop card puts the screen's
            content under it). Placed at (0, LAPTOP_Y).
"""
import json
import math
import random

from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1080, 1920
S = 2  # supersampling
random.seed(7)


def grain(img, amount, size=1):
    w, h = img.size
    n = Image.effect_noise((w // size, h // size), amount).resize((w, h)).convert("L")
    return n


def mat():
    base = Image.new("RGB", (W, H), (94, 130, 90))
    n = grain(base, 28)
    base = Image.composite(Image.new("RGB", (W, H), (106, 144, 101)), base, n.point(lambda v: max(0, v - 128)))
    base = Image.composite(Image.new("RGB", (W, H), (82, 116, 79)), base, n.point(lambda v: max(0, 128 - v)))
    d = ImageDraw.Draw(base, "RGBA")
    y0 = 40
    for k in range(0, 21):  # vertical
        x = 54 * k - 2
        major = k % 5 == 0
        d.line([(x, y0), (x, H)], fill=(235, 245, 230, 70 if major else 34), width=2 if major else 1)
    for k in range(0, 36):  # horizontal
        y = y0 + 54 * k
        major = k % 5 == 0
        d.line([(0, y), (W, y)], fill=(235, 245, 230, 70 if major else 34), width=2 if major else 1)
    d.line([(0, 34), (W, 34)], fill=(235, 245, 230, 80), width=1)
    font = ImageFont.truetype("../fonts/Archivo.ttf", 15)
    for k in range(1, 20):
        d.text((54 * k - 2, 16), str(k), fill=(225, 235, 220, 150), font=font, anchor="mm")
    for k in range(1, 35):
        d.text((14, y0 + 54 * k), str(k), fill=(225, 235, 220, 150), font=font, anchor="mm")
    base.save("mat.jpg", quality=88)


# ── the laptop ──
LAPTOP_Y = 150
PAPER = (224, 209, 182)
INK = (28, 26, 25)
SCREEN = {"x": 165, "y": 207, "w": 750, "h": 396, "r": 18}  # frame px


def rrect(x0, y0, x1, y1, r, n=36):
    """Points round a rounded rectangle, clockwise from the top-left corner's end."""
    pts = []
    for cx, cy, a0 in ((x1 - r, y0 + r, -90), (x1 - r, y1 - r, 0), (x0 + r, y1 - r, 90), (x0 + r, y0 + r, 180)):
        for i in range(n + 1):
            a = math.radians(a0 + 90 * i / n)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


def trap(xt0, xt1, yt, xb0, xb1, yb, r):
    """A rounded trapezoid (the laptop base): narrow top edge, wide bottom edge."""
    def lerp(p, q, t):
        return (p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t)
    corners = [(xt0, yt), (xt1, yt), (xb1, yb), (xb0, yb)]
    pts = []
    for i in range(4):
        p, c, q = corners[i - 1], corners[i], corners[(i + 1) % 4]
        lp = math.dist(p, c)
        lq = math.dist(c, q)
        a, b = lerp(c, p, min(0.45, r / lp)), lerp(c, q, min(0.45, r / lq))
        for k in range(13):  # quadratic bezier a -> c -> b
            t = k / 12
            pts.append(((1 - t) ** 2 * a[0] + 2 * (1 - t) * t * c[0] + t * t * b[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * c[1] + t * t * b[1]))
    return pts


def wobble(pts, amp=1.6, seed=0):
    rnd = random.Random(seed)
    ph = [rnd.uniform(0, 6.28) for _ in range(3)]
    out = []
    L = 0
    for i, (x, y) in enumerate(pts):
        if i:
            L += math.dist(pts[i - 1], (x, y))
        o = amp * (math.sin(L / 37 + ph[0]) + 0.6 * math.sin(L / 13 + ph[1]) + 0.3 * math.sin(L / 5 + ph[2]))
        out.append((x + o * 0.7, y + o * 0.7))
    return out


def sc(pts, dy=0):
    return [(x * S, (y - dy) * S) for x, y in pts]


def laptop():
    w, h = W, 830
    dy = LAPTOP_Y
    big = Image.new("RGBA", (w * S, h * S), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    # the paper cut out round the drawing (a sticker margin)
    lid_paper = rrect(110, 155, 970, 650, 58)
    base_paper = trap(118, 962, 620, -8, 1088, 962, 60)
    for poly in (lid_paper, base_paper):
        d.polygon(sc(wobble(poly, 2.2, len(poly)), dy), fill=PAPER + (255,))
    # crumpled paper: grain + a few creases
    tex = grain(big, 40, 2).filter(ImageFilter.GaussianBlur(1.2))
    mask = big.getchannel("A")
    shade = Image.new("RGBA", big.size, (120, 100, 70, 0))
    shade.putalpha(Image.eval(tex, lambda v: max(0, 128 - v) // 3))
    light = Image.new("RGBA", big.size, (255, 250, 238, 0))
    light.putalpha(Image.eval(tex, lambda v: max(0, v - 128) // 3))
    big = Image.alpha_composite(big, shade)
    big = Image.alpha_composite(big, light)
    d = ImageDraw.Draw(big)
    rnd = random.Random(3)
    for _ in range(9):
        x0, y0 = rnd.uniform(0, w), rnd.uniform(0, h)
        a = rnd.uniform(0, math.pi)
        L = rnd.uniform(160, 420)
        p, q = (x0, y0), (x0 + L * math.cos(a), y0 + L * math.sin(a))
        d.line([(p[0] * S, p[1] * S), (q[0] * S, q[1] * S)], fill=(255, 252, 242, 38), width=3 * S)
        d.line([(p[0] * S + 3, p[1] * S + 3), (q[0] * S + 3, q[1] * S + 3)], fill=(110, 90, 60, 26), width=S)
    big.putalpha(mask)
    d = ImageDraw.Draw(big)
    # lid: black body, screen hole, webcam
    lid = rrect(132, 172, 948, 632, 40)
    d.polygon(sc(wobble(lid, 1.4, 11), dy), fill=INK + (255,))
    scr = SCREEN
    hole = rrect(scr["x"], scr["y"], scr["x"] + scr["w"], scr["y"] + scr["h"], scr["r"])
    d.polygon(sc(hole, dy), fill=(0, 0, 0, 0))
    d.ellipse([(540 - 9) * S, (189 - 9 - dy) * S, (540 + 9) * S, (189 + 9 - dy) * S], fill=PAPER + (255,))
    # base outline
    base = trap(140, 940, 636, 14, 1066, 944, 44)
    d.line(sc(wobble(base + base[:1], 1.6, 21), dy), fill=INK + (255,), width=13 * S, joint="curve")
    # keys: 4 rows, the last with a space bar
    rows = [(664, 702, 12), (706, 744, 12), (748, 786, 12), (790, 830, None)]
    for ri, (y0, y1, n) in enumerate(rows):
        inset = 150 - ri * 18
        x0, x1 = inset, 1080 - inset
        if n:
            gap = 12
            kw = (x1 - x0 - gap * (n - 1)) / n
            xs = [(x0 + i * (kw + gap), x0 + i * (kw + gap) + kw) for i in range(n)]
            if ri == 1:
                xs[-1] = (xs[-2][0], xs[-1][1]); xs.pop(-2)
            if ri == 2:
                xs[0] = (xs[0][0], xs[1][1]); xs.pop(1)
                xs[-1] = (xs[-2][0], xs[-1][1]); xs.pop(-2)
        else:
            gap, kw = 12, 62
            xs = []
            x = x0
            for k in range(4):
                xs.append((x, x + kw)); x += kw + gap
            xs.append((x, x + 236)); x += 236 + gap
            while x + kw <= x1 + 1:
                xs.append((x, x + kw)); x += kw + gap
        for k, (a, b) in enumerate(xs):
            key = rrect(a, y0, b, y1, 9, 8)
            d.line(sc(wobble(key + key[:1], 0.8, ri * 50 + k), dy), fill=INK + (255,), width=8 * S, joint="curve")
    pad = rrect(375, 846, 685, 914, 10, 8)
    d.line(sc(wobble(pad + pad[:1], 1.0, 99), dy), fill=INK + (255,), width=9 * S, joint="curve")
    big.resize((w, h), Image.LANCZOS).save("laptop.png", optimize=True)
    with open("laptop.json", "w") as f:
        json.dump({"y": LAPTOP_Y, "w": w, "h": h, "screen": SCREEN}, f, indent=2)


if __name__ == "__main__":
    mat()
    laptop()
