# Agrega una grilla cada 0,1 m (y polígonos opcionales de un JSON) sobre la silueta.
import sys, json
from PIL import Image, ImageDraw
x0, y1, s = -1.0, 1.5, 0.004
im = Image.open(sys.argv[1]).convert("RGB")
d = ImageDraw.Draw(im)
W, H = im.size
px = lambda x, y: ((x - x0) / s, (y1 - y) / s)
for i in range(-10, 15):
    X = px(i / 10, 0)[0]; d.line([(X, 0), (X, H)], fill=(255, 180, 180) if i else (255, 0, 0)); d.text((X + 2, 2), f"{i/10:.1f}", fill=(200, 0, 0))
for j in range(0, 16):
    Y = px(0, j / 10)[1]; d.line([(0, Y), (W, Y)], fill=(180, 180, 255)); d.text((2, Y - 12), f"{j/10:.1f}", fill=(0, 0, 200))
if len(sys.argv) > 3:
    polys = json.load(open(sys.argv[3]))
    for name, pts in polys:
        q = [px(*p) for p in pts]
        d.polygon(q, outline=(0, 120, 0))
        cx = sum(p[0] for p in q) / len(q); cy = sum(p[1] for p in q) / len(q)
        d.text((cx - 10, cy - 5), name, fill=(0, 90, 0))
im.save(sys.argv[2])
