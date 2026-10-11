"""Build same-origin image signatures; photographs are never part of this index.

Install numpy/opencv-python-headless in the build environment, then run
this file. Reference downloads are cached under ignored work/photo-references.
The deployed application needs no Python or network image-recognition service.
"""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import base64
import hashlib
import json
import re
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
import cv2
import numpy as np

WIDTH, HEIGHT = 224, 320
THUMB_W, THUMB_H = 20, 16
ORB_COUNT = 160

def artwork(image):
    image = cv2.resize(image, (WIDTH, HEIGHT), interpolation=cv2.INTER_AREA)
    return image[48:182, 12:212]

def features(image):
    art = artwork(image)
    rgb = cv2.cvtColor(art, cv2.COLOR_BGR2RGB)
    thumb = cv2.resize(rgb, (THUMB_W, THUMB_H), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(art, cv2.COLOR_BGR2GRAY)
    orb = cv2.ORB_create(nfeatures=ORB_COUNT, edgeThreshold=8, patchSize=21, fastThreshold=7)
    points, descriptors = orb.detectAndCompute(gray, None)
    if descriptors is None:
        descriptors = np.empty((0, 32), dtype=np.uint8)
    return thumb, points, descriptors

def build():
    source = (ROOT / 'app/ijinden-cards.ts').read_text(encoding='utf-8')
    cards = json.loads(re.search(r'export const ijindenCards: IjindenCard\[\] = (\[.*\]);', source, re.S)[1])
    cache = ROOT / 'work/photo-references'
    cache.mkdir(parents=True, exist_ok=True)
    def fetch(card):
        target = cache / (card['id'] + '.png')
        if not target.exists():
            for attempt in range(3):
                try:
                    with urllib.request.urlopen(card['imageUrl'], timeout=30) as response:
                        raw = response.read()
                    if cv2.imdecode(np.frombuffer(raw, dtype=np.uint8), cv2.IMREAD_COLOR) is None:
                        raise ValueError('Reference is not an image')
                    target.write_bytes(raw)
                    break
                except Exception:
                    if attempt == 2:
                        raise
                    time.sleep(1 + attempt)
        im = cv2.imdecode(np.frombuffer(target.read_bytes(), dtype=np.uint8), cv2.IMREAD_COLOR)
        if im is None:
            raise ValueError('Invalid cached reference: ' + card['id'])
        thumb, points, descriptors = features(im)
        return {
            'id': card['id'],
            'thumb': base64.b64encode(thumb.tobytes()).decode(),
            'orb': base64.b64encode(descriptors.tobytes()).decode(),
            'points': [[round(p.pt[0], 1), round(p.pt[1], 1)] for p in points],
        }
    entries = []
    with ThreadPoolExecutor(max_workers=6) as pool:
        for index, entry in enumerate(pool.map(fetch, cards)):
            entries.append(entry)
            if (index + 1) % 100 == 0:
                print(f'{index + 1}/{len(cards)} references', flush=True)
    payload = {'version': 1, 'width': WIDTH, 'height': HEIGHT,
               'art': [12, 48, 200, 134], 'thumb': [THUMB_W, THUMB_H],
               'orbCount': ORB_COUNT, 'catalogSha256': hashlib.sha256(source.encode()).hexdigest(),
               'entries': entries}
    out = ROOT / 'public/photo-card-index.json'
    out.write_text(json.dumps(payload, separators=(',', ':')), encoding='utf-8')
    print(f'Wrote {len(entries)} references, {out.stat().st_size:,} bytes', flush=True)

if __name__ == '__main__':
    build()
