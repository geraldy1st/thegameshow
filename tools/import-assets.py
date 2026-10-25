"""Copies the whitelisted lot 2 portraits (AI visuals, free to use per ASSET-REUSE.md) into
public/game as light WebP + JPEG fallback, and writes src/data/assets-manifest.json.
Run once: python3 tools/import-assets.py (needs Pillow). Sources are read-only."""
import json, os
from PIL import Image

SRC = '/tmp/perf-ios/public/game'
OUT = 'public/game'
WIDTH = 360
PORTRAITS = ['haru', 'kei', 'lila', 'nana', 'noa', 'yuu', 'daichi', 'jun', 'omar', 'ren', 'mio', 'sora', 'aoi']
EXTRA = {'kyoko': 'quiz/quiz-teacher-face.webp'}

def convert(src, name):
    im = Image.open(src).convert('RGB')
    h = round(im.height * WIDTH / im.width)
    im = im.resize((WIDTH, h), Image.LANCZOS)
    os.makedirs(f'{OUT}/portraits', exist_ok=True)
    im.save(f'{OUT}/portraits/{name}.webp', 'WEBP', quality=72, method=6)
    im.save(f'{OUT}/portraits/{name}.jpg', 'JPEG', quality=72, optimize=True, progressive=True)
    return {'webp': f'game/portraits/{name}.webp', 'jpg': f'game/portraits/{name}.jpg', 'width': WIDTH, 'height': h}

manifest = {n: convert(f'{SRC}/portraits/{n}.jpg', n) for n in PORTRAITS}
for n, p in EXTRA.items():
    manifest[n] = convert(f'{SRC}/{p}', n)
with open('src/data/assets-manifest.json', 'w') as f:
    json.dump(manifest, f, indent=2)
    f.write('\n')
